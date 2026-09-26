//! WebSocket hub: fans LiveEvents out to every connected browser.

use crate::{snapshotter::LiveEvent, AppState};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;

pub async fn handler(ws: WebSocketUpgrade, State(st): State<Arc<AppState>>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle(socket, st))
}

async fn handle(socket: WebSocket, st: Arc<AppState>) {
    let (mut sink, mut stream) = socket.split();
    let mut rx = st.events.subscribe();

    // outbound: broadcast -> socket
    let mut send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(ev) => {
                    let text = serde_json::to_string(&ev).unwrap_or_default();
                    if sink.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!(skipped = n, "ws client lagged");
                    continue;
                }
                Err(_) => break,
            }
        }
    });

    // inbound: we don't take commands yet; drain pings/closes
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(_msg)) = stream.next().await {}
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }
}

#[allow(dead_code)]
fn _assert_event_send(_: &LiveEvent) {}
