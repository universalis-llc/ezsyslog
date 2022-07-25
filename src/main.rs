use anyhow::Result;

mod syslog;
mod http;
mod database;

#[tokio::main]
async fn main() -> Result<()> {
    let handles = [tokio::spawn(syslog::listen()), tokio::spawn(http::listen())];

    // FIXME: I don't think this catches the first error, just waits for the first in iter() to finish or error, 2nd could have already errored
    for handle in handles {
        handle.await??;
    }

    Ok(())
}
