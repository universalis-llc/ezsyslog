use std::{borrow::Cow, net::SocketAddr, time::SystemTime};

use crate::database;
use anyhow::{anyhow, Result};
use redis::aio::MultiplexedConnection;
use redis_graph::{AsyncGraphCommands};
use syslog_loose::{parse_message, Message};
use tokio::net::UdpSocket;

const PORT: u16 = 9594;
const HOST: &'static str = "::";

async fn parse_buffer(len: usize, buffer: &[u8]) -> Result<Message<&str>> {
    let msg_buffer = std::str::from_utf8(&buffer[0..len]);
    let msg_buffer = match msg_buffer {
        Err(e) => {
            return Err(anyhow!("Error parsing msg {}", e));
        }
        Ok(str) => str,
    };
    let msg = parse_message(msg_buffer);
    Ok(msg)
}

async fn store_msg(
    con: &mut MultiplexedConnection,
    msg: Message<&str>,
    addr: &SocketAddr,
) -> Result<()> {
    let timestamp = msg
        .timestamp
        .and_then(|t| Some(t.timestamp().to_string()))
        .unwrap_or_else(|| "null".to_string());
    let server_timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .expect("Unable to get system time")
        .as_millis();

    let mut query = format!(
        "
        MERGE (addr:Address {{ip: '{ip}'}})
        CREATE (msg:Message {{id: {msg_id}, msg: '{msg}', server_timestamp: {server_timestamp}, timestamp: {timestamp}}})-[:from]->(addr)
        ",
        msg = escape(msg.msg),
        msg_id = msg.msgid.and_then(|id| Some(format!("'{id}'", id=escape(id)))).unwrap_or_else(|| "null".to_string()),
        ip = addr.ip().to_string()
    );
    if let Some(hostname) = msg.hostname {
        query.push_str(&format!(
            "
            MERGE (host:Hostname {{name: '{hostname}'}})
            MERGE (msg)-[:host]->(host)
        ",
            hostname = escape(hostname)
        ));
    }
    if let Some(facility) = msg.facility {
        query.push_str(&format!(
            "
            MERGE (fac:Facility {{name: '{}'}})
            MERGE (msg)-[:facility]->(fac)
        ",
        facility.as_str()
        ));
    }
    if let Some(severity) = msg.severity {
        query.push_str(&format!(
            "
            MERGE (sev:Severity {{name: '{}'}})
            MERGE (msg)-[:severity]->(sev)
        ",
        severity.as_str()
        ));
    }
    if let Some(appname) = msg.appname {
        query.push_str(&format!(
            "
            MERGE (app:AppName {{name: '{appname}'}})
            MERGE (msg)-[:appname]->(app)
        ",
            appname = escape(appname)
        ));
    }

    // CREATE (data:Data id:'{id}')
    msg.structured_data.into_iter().for_each(|element| {
        let params = element
            .params
            .into_iter()
            .map(|(k, v)| format!("['{k}','{v}']", k = escape(k), v = escape(v)))
            .collect::<Vec<String>>()
            .join(",");
        query.push_str(&format!(
            "
            MERGE (data:Data {{id:'{id}', params:[{params}]}})-[:data]->(msg)
        ",
            id = escape(element.id)
        ));
    });

    dbg!(&query);
    con.graph_query(database::GRAPH_NAME, query).await?;
    Ok(())
}

pub async fn listen() -> Result<()> {
    println!("Syslog started!");
    let mut con = database::connect().await?;

    let sock = UdpSocket::bind(format!("{}:{}", HOST, PORT)).await?;
    let mut buf = [0; 1024];
    loop {
        let (len, addr) = sock.recv_from(&mut buf).await?;
        let msg = match parse_buffer(len, &buf).await {
            Err(e) => {
                println!("{}", e);
                continue;
            }
            Ok(msg) => msg,
        };

        dbg!(&msg);
        store_msg(&mut con, msg, &addr).await?;
    }
}

// https://fullstackmilk.dev/efficiently_escaping_strings_using_cow_in_rust/
pub fn escape(input: &str) -> Cow<str> {
    // Iterate through the characters, checking if each one needs escaping
    for (i, ch) in input.chars().enumerate() {
        if ch == '\'' {
            // At least one char needs escaping, so we need to return a brand
            // new `String` rather than the original

            let mut escaped_string = String::with_capacity(input.len());
            // Calling `String::with_capacity()` instead of `String::new()` is
            // a slight optimisation to reduce the number of allocations we
            // need to do.
            //
            // We know that the escaped string is always at least as long as
            // the unescaped version so we can preallocate at least that much
            // space.

            // We already checked the characters up to index `i` don't need
            // escaping so we can just copy them straight in
            escaped_string.push_str(&input[..i]);

            // Escape the remaining characters if they need it and add them to
            // our escaped string
            for ch in input[i..].chars() {
                match ch == '\'' {
                    true => escaped_string.push_str("\\\'"),
                    false => escaped_string.push(ch),
                };
            }

            return Cow::Owned(escaped_string);
        }
    }

    // We've iterated through all of `input` and didn't find any special
    // characters, so it's safe to just return the original string
    Cow::Borrowed(input)
}
