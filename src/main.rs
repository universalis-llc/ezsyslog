use anyhow::Result;
use tokio::sync::{broadcast, watch};

mod syslog;
// mod netconsole;
mod database;
mod http;
mod utils;

#[derive(Debug, Clone)]
pub enum Signal {
    NewMessage(usize),
    Stop
}

#[tokio::main]
async fn main() -> Result<()> {
    let (tx, _rx) = broadcast::channel(16);
    let (shutdown, sigint) = watch::channel(());
    let handles = [
        tokio::spawn(syslog::listen(sigint.clone(), tx.clone())),
        tokio::spawn(http::listen(sigint, tx)),
    ];

    ctrlc::set_handler(move || {
        println!("Shutting down");
        shutdown.send(()).expect("Could not propigate SIGINT");
    })
    .expect("Error setting Ctrl-C handler");

    // FIXME: I don't think this catches the first error, just waits for the first in iter() to finish or error, 2nd could have already errored
    for handle in handles {
        handle.await?.expect("Thread error");
    }

    Ok(())
}
