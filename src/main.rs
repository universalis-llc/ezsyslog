use anyhow::Result;
use tokio::sync::watch;

mod syslog;
mod http;
mod database;

#[tokio::main]
async fn main() -> Result<()> {
    let (tx, rx) = watch::channel(());
    let handles = [tokio::spawn(syslog::listen(rx.clone())), tokio::spawn(http::listen(rx))];

    ctrlc::set_handler(move || {
        println!("Shutting down");
        tx.send(()).expect("Could not propigate SIGINT");
    }).expect("Error setting Ctrl-C handler");

    // FIXME: I don't think this catches the first error, just waits for the first in iter() to finish or error, 2nd could have already errored
    for handle in handles {
        handle.await??;
    }

    Ok(())
}
