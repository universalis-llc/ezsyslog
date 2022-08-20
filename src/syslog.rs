use std::{env, net::SocketAddr, time::SystemTime};
use tokio::sync::{broadcast::Sender, watch::Receiver};

use crate::{database, utils::escape};
use anyhow::{anyhow, Result};
use redis::aio::MultiplexedConnection;
use redis_graph::AsyncGraphCommands;
use syslog_loose::{parse_message, Message};
use tokio::net::UdpSocket;

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
) -> Result<usize> {
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

    query.push_str("\nRETURN id(msg) as id");

    #[cfg(debug_assertions)]
    dbg!(&query);
    
    let result = con.graph_query(database::GRAPH_NAME, query).await?;
    let id: usize = result.data[0]
        .get_scalar("id")
        .expect("Inserted message node returned no node id");
    Ok(id)
}

pub async fn listen(
    mut shutdown_signal: Receiver<()>,
    sender: Sender<crate::Signal>,
) -> Result<()> {
    println!("Syslog listener started!");
    let mut con = database::connect().await?;

    let host: String = env::var("EZSYSLOG_SYSLOG_HOST").unwrap_or("::".to_string());
    let port: String = env::var("EZSYSLOG_SYSLOG_PORT").unwrap_or("514".to_string());
    let udp = UdpSocket::bind(format!("{}:{}", host, port)).await?;

    // let tcp = TcpSocket::new_v4()?;
    // let tcp6 = TcpSocket::new_v6()?;
    // tcp.set_reuseaddr(true)?;
    // tcp.bind(format!("{}:{}", HOST, PORT).parse().unwrap())?;
    // tcp6.set_reuseaddr(true)?;
    // tcp6.bind(format!("{}:{}", HOST, PORT).parse().unwrap())?;
    // let tcp_listener = tcp.listen(1024)?;
    // let tcp6_listener = tcp6.listen(1024)?;

    let mut buf = [0; 1024];
    loop {
        tokio::select! {
            _ = shutdown_signal.changed() => {
                break;
            },
            res = udp.recv_from(&mut buf) => {
                let (len, addr) = res?;
                let msg = match parse_buffer(len, &buf).await {
                    Err(e) => {
                        println!("Unable to parse syslog message: {}", e);
                        continue;
                    }
                    Ok(msg) => msg,
                };

                #[cfg(debug_assertions)]
                dbg!(&msg);

                let message_node_id = store_msg(&mut con, msg, &addr).await?;

                println!("Sending new node id to broadcast");
                sender.send(crate::Signal::NewMessage(message_node_id))?;
            }
        };
    }

    println!("Syslog listener stopped.");

    Ok(())
}
