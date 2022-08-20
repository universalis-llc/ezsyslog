use std::{env, net::SocketAddr, time::SystemTime};
use tokio::sync::watch::Receiver;

use crate::{database, utils::escape};
use anyhow::{Result};
use redis::aio::MultiplexedConnection;
use redis_graph::AsyncGraphCommands;
use tokio::net::UdpSocket;
use nom::{bytes::complete::{take_until1, tag, take_until}, IResult};

async fn store_msg(
    con: &mut MultiplexedConnection,
    msg: &str,
    addr: &SocketAddr,
) -> Result<()> {
    let server_timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .expect("Unable to get system time")
        .as_millis();

    let mut query = format!(
        "
        MERGE (addr:Address {{ip: '{ip}'}})
        CREATE (msg:Message {{msg: '{msg}', server_timestamp: {server_timestamp}}})-[:from]->(addr)
        ",
        msg = escape(msg),
        ip = addr.ip().to_string()
    );

    #[cfg(debug_assertions)]
    dbg!(&query);
    con.graph_query(database::GRAPH_NAME, query).await?;
    Ok(())
}

struct Message<'a> {
    level: &'a str,
    sequnum: &'a str,
    timestamp: &'a str,
    bytes: Option<&'a str>,
    total: Option<&'a str>,
    message: &'a str
}

// https://www.kernel.org/doc/html/latest/networking/netconsole.html
// <level>,<sequnum>,<timestamp>,<contflag>;<message text>
// <contflag> = -,ncfrag=<byte-offset>/<total-bytes>
// 6,416,1758426,-,ncfrag=0/31;the first chunk,
// 6,416,1758426,-,ncfrag=16/31; the 2nd chunk.
fn parse_buffer(input: &str) -> IResult<&str, Message> {
    let (i, level) = take_until1(",")(input)?;
    let (i, sequnum) = take_until1(",")(&i[1..])?;
    let (i, timestamp) = take_until1(",")(&i[1..])?;
    let (i, contflag) = take_until(";")(&i[1..])?;
    let (bytes, total) = if contflag.len() > 0 {
        let (i, _) = tag("-,ncfrags=")(&contflag[1..])?;
        let (i, bytes) = take_until1("/")(i)?;
        let (i, total) = take_until1(";")(i)?;
        (Some(bytes), Some(total))
    } else {
        (None, None)
    };

    let message = &i[1..];

    let parsed = Message {
        level,
        sequnum,
        timestamp,
        bytes,
        total,
        message,
    };

    Ok(("", parsed))
}

pub async fn listen(mut signal: Receiver<()>) -> Result<()> {
    println!("Netconsole listener started!");
    let con = database::connect().await?;

    let host: String = env::var("EZSYSLOG_NETCONSOLE_HOST").unwrap_or("::".to_string());
    let port: String = env::var("EZSYSLOG_NETCONSOLE_PORT").unwrap_or("6666".to_string());
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
            _ = signal.changed() => {
                break;
            },
            res = udp.recv_from(&mut buf) => {
                let (len, addr) = res?;

                // let msg = match parse_buffer(len, &buf).await {
                //     Err(e) => {
                //         println!("Unable to parse netconsole message: {}", e);
                //         continue;
                //     }
                //     Ok(msg) => msg,
                // };

                // #[cfg(debug_assertions)]
                // dbg!(&msg);

                // store_msg(&mut con, msg, &addr).await?;
            }
        };
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn buffer_parser() {
        let buf = "6,416,1758426,-,ncfrag=0/31;the first chunk,";
        assert_eq!(super::parse_buffer(buf).is_ok(), true);
        // assert_eq!(result, 4);
    }
}