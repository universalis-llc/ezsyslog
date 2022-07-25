use redis::aio::{MultiplexedConnection};
const HOST: &'static str = "127.0.0.1";
const PORT: u16 = 6379;

pub async fn connect() -> redis::RedisResult<MultiplexedConnection> {
  let client = redis::Client::open(format!("redis://{HOST}:{PORT}/"))?;
    let con = client.get_multiplexed_async_connection().await?;
    Ok(con)
}

pub const GRAPH_NAME: &'static str = "syslog";