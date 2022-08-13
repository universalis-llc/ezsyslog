use std::env;
use redis::aio::{MultiplexedConnection};

pub async fn connect() -> redis::RedisResult<MultiplexedConnection> {
  let addr = {
    if let Ok(socket) = env::var("EZSYSLOG_DB_SOCKET") {
      format!("redis+unix://{}", socket)
    } else {
      let host: String = env::var("EZSYSLOG_DB_HOST").unwrap_or("127.0.0.1".to_string());
      let port: String = env::var("EZSYSLOG_DB_PORT").unwrap_or("6379".to_string());
      format!("redis://{host}:{port}")
    }
  };
  let client = redis::Client::open(addr)?;
    let con = client.get_multiplexed_async_connection().await?;
    Ok(con)
}

pub const GRAPH_NAME: &'static str = "syslog";