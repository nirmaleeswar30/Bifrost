use futures_util::{StreamExt, SinkExt};
use log::{info, error, warn};
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use thiserror::Error;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::broadcast;

#[derive(Error, Debug)]
pub enum SyncError {
    #[error("WebSocket error: {0}")]
    WebSocketError(String),
}

pub struct WsServer {
    port: u16,
    sender: broadcast::Sender<String>,
}

impl WsServer {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(100);
        Self { port: 14210, sender }
    }

    pub fn get_sender(&self) -> broadcast::Sender<String> {
        self.sender.clone()
    }

    pub fn get_port(&self) -> u16 {
        self.port
    }

    pub async fn start(&self, app_handle: AppHandle, valid_token: String) -> Result<(), SyncError> {
        let addr = format!("0.0.0.0:{}", self.port);
        let listener = TcpListener::bind(&addr).await
            .map_err(|e| SyncError::WebSocketError(e.to_string()))?;
        
        info!("WebSocket server listening on {}", addr);

        let app_handle = Arc::new(app_handle);

        let sender = self.sender.clone();
        tokio::spawn(async move {
            while let Ok((stream, _)) = listener.accept().await {
                let app = app_handle.clone();
                let token = valid_token.clone();
                let rx = sender.subscribe();
                tokio::spawn(handle_connection(stream, app, token, rx));
            }
        });

        Ok(())
    }
}

async fn handle_connection(stream: TcpStream, app_handle: Arc<AppHandle>, valid_token: String, mut rx: broadcast::Receiver<String>) {
    let peer_addr = stream.peer_addr().map(|a| a.ip().to_string()).unwrap_or_default();
    
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("Error during the websocket handshake occurred: {}", e);
            return;
        }
    };

    println!("[Bifrost WS] New WebSocket connection established!");
    info!("New WebSocket connection established");
    let (mut write, mut read) = ws_stream.split();

    let mut transfers: std::collections::HashMap<String, (std::path::PathBuf, String)> = std::collections::HashMap::new();

    loop {
        tokio::select! {
            Some(msg) = read.next() => {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(msg_type) = json.get("type").and_then(|t| t.as_str()) {
                                println!("[Bifrost WS] Received message type: {}", msg_type);
                                if msg_type == "auth" {
                                    let token = json.get("token").and_then(|t| t.as_str()).unwrap_or("");
                                    println!("[Bifrost WS] Auth attempt - token matches: {}", token == valid_token);
                                    if token == valid_token {
                                        println!("[Bifrost WS] Device authenticated! Emitting device-connected event...");
                                        info!("Device authenticated successfully!");
                                        
                                        // Extract device info
                                        let device_id = json.get("device_id").and_then(|t| t.as_str()).unwrap_or("unknown_id").to_string();
                                        let name = json.get("name").and_then(|t| t.as_str()).unwrap_or("Android Device").to_string();
                                        let model = json.get("model").and_then(|t| t.as_str()).unwrap_or("Unknown Model").to_string();
                                        
                                        // Save to DB
                                        let state = app_handle.state::<crate::AppState>();
                                        if let Some(db) = state.db.lock().unwrap().as_ref() {
                                            let profile = crate::db::models::DeviceProfile {
                                                id: device_id.clone(),
                                                name,
                                                model,
                                                last_ip: Some(peer_addr.clone()),
                                                auto_connect: true,
                                            };
                                            if let Err(e) = db.save_device(&profile) {
                                                error!("Failed to save device to DB: {}", e);
                                            }
                                        }

                                        let emit_result = app_handle.emit("device-connected", serde_json::json!({
                                            "status": "connected",
                                            "device_id": device_id
                                        }));
                                        println!("[Bifrost WS] Emit result: {:?}", emit_result);
                                        
                                        let _ = write.send(Message::Text(serde_json::json!({
                                            "type": "auth_success"
                                        }).to_string().into())).await;
                                    } else {
                                        println!("[Bifrost WS] Invalid token! Expected len={}, got len={}", valid_token.len(), token.len());
                                        warn!("Invalid pairing token received");
                                        let _ = write.send(Message::Text(serde_json::json!({
                                            "type": "auth_error",
                                            "message": "Invalid token"
                                        }).to_string().into())).await;
                                    }
                                } else if msg_type == "clipboard_update" {
                                    let content = json.get("content").and_then(|t| t.as_str()).unwrap_or("");
                                    let _ = app_handle.emit("clipboard_update", serde_json::json!({ "content": content }));
                                } else if msg_type == "dir_list" {
                                    let _ = app_handle.emit("dir_list", json.clone());
                                } else if msg_type == "file_transfer_start" {
                                    let transfer_id = json.get("transfer_id").and_then(|t| t.as_str()).unwrap_or("").to_string();
                                    let original_path = json.get("path").and_then(|t| t.as_str()).unwrap_or("file");
                                    let size = json.get("size").and_then(|t| t.as_i64()).unwrap_or(0);
                                    
                                    let filename = std::path::Path::new(original_path).file_name().unwrap_or_default().to_string_lossy().to_string();
                                    let intent = json.get("intent").and_then(|t| t.as_str()).unwrap_or("preview");
                                    
                                    let target_path = if intent == "save" {
                                        let downloads_dir = std::env::var("HOME").map(|h| std::path::PathBuf::from(h).join("Downloads").join("Bifrost")).unwrap_or_else(|_| std::env::temp_dir().join("Bifrost"));
                                        let _ = std::fs::create_dir_all(&downloads_dir);
                                        downloads_dir.join(&filename)
                                    } else if intent == "drag" {
                                        let drag_dir = std::env::temp_dir().join("bifrost_drag").join(&transfer_id);
                                        let _ = std::fs::create_dir_all(&drag_dir);
                                        drag_dir.join(&filename)
                                    } else {
                                        let preview_dir = std::env::temp_dir().join("bifrost_preview").join(&transfer_id);
                                        let _ = std::fs::create_dir_all(&preview_dir);
                                        preview_dir.join(&filename)
                                    };
                                    
                                    if let Ok(_) = std::fs::write(&target_path, b"") {
                                        transfers.insert(transfer_id.clone(), (target_path, intent.to_string()));
                                        let _ = app_handle.emit("file_transfer_start", serde_json::json!({
                                            "transfer_id": transfer_id,
                                            "path": original_path,
                                            "size": size
                                        }));
                                    }
                                } else if msg_type == "file_transfer_chunk" {
                                    let transfer_id = json.get("transfer_id").and_then(|t| t.as_str()).unwrap_or("");
                                    let base64_data = json.get("data").and_then(|t| t.as_str()).unwrap_or("");
                                    
                                    if let Some((path, _)) = transfers.get(transfer_id) {
                                        use base64::Engine;
                                        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(base64_data) {
                                            use std::io::Write;
                                            if let Ok(mut file) = std::fs::OpenOptions::new().append(true).open(path) {
                                                let _ = file.write_all(&bytes);
                                                let _ = app_handle.emit("file_transfer_progress", serde_json::json!({
                                                    "transfer_id": transfer_id,
                                                    "bytes_received": bytes.len()
                                                }));
                                            }
                                        }
                                    }
                                } else if msg_type == "file_transfer_end" {
                                    let transfer_id = json.get("transfer_id").and_then(|t| t.as_str()).unwrap_or("");
                                    if let Some((path, intent)) = transfers.remove(transfer_id) {
                                        let _ = app_handle.emit("file_transfer_complete", serde_json::json!({
                                            "transfer_id": transfer_id
                                        }));
                                        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                                        if intent == "preview" {
                                            let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
                                            if ["mp4", "mkv", "avi", "mov", "webm"].contains(&ext.as_ref()) {
                                                let _ = std::process::Command::new("mpv").arg(&path).spawn()
                                                    .or_else(|_| std::process::Command::new("vlc").arg(&path).spawn())
                                                    .or_else(|_| std::process::Command::new("xdg-open").arg(&path).spawn());
                                            } else {
                                                let _ = app_handle.emit("file_preview_ready", serde_json::json!({
                                                    "path": path.to_string_lossy(),
                                                    "name": file_name
                                                }));
                                            }
                                        } else if intent == "drag" {
                                            let _ = app_handle.emit("file_drag_ready", serde_json::json!({
                                                "path": path.to_string_lossy(),
                                                "name": file_name
                                            }));
                                        }
                                    }
                                } else if msg_type == "thumbnail_data" || msg_type == "dir_list_refresh_needed" || msg_type == "write_success" || msg_type == "debug_alert" {
                                    let _ = app_handle.emit(msg_type, json.clone());
                                } else if msg_type == "wallpaper_update" {
                                    let base64_data = json.get("data").and_then(|t| t.as_str()).unwrap_or("");
                                    let _ = app_handle.emit("android_wallpaper_update", base64_data);
                                    if let Some(app_dir) = app_handle.path().app_data_dir().ok() {
                                        let wp_path = app_dir.join("android_wallpaper.jpg");
                                        use base64::Engine;
                                        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(base64_data) {
                                            let _ = std::fs::write(wp_path, bytes);
                                        }
                                    }
                                } else if msg_type == "mouse_move" {
                                    if let (Some(dx), Some(dy)) = (json.get("dx").and_then(|v| v.as_i64()), json.get("dy").and_then(|v| v.as_i64())) {
                                        use tauri::Manager;
                                        if let Some(ic) = app_handle.state::<crate::AppState>().input_controller.lock().unwrap().as_ref() {
                                            ic.move_mouse(dx as i32, dy as i32);
                                        }
                                    }
                                } else if msg_type == "mouse_click" {
                                    if let Some(btn) = json.get("button").and_then(|v| v.as_str()) {
                                        use tauri::Manager;
                                        if let Some(ic) = app_handle.state::<crate::AppState>().input_controller.lock().unwrap().as_ref() {
                                            ic.click_mouse(btn);
                                        }
                                    }
                                } else if msg_type == "key_press" {
                                    if let Some(key) = json.get("key").and_then(|v| v.as_str()) {
                                        use tauri::Manager;
                                        if let Some(ic) = app_handle.state::<crate::AppState>().input_controller.lock().unwrap().as_ref() {
                                            ic.key_press(key);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        info!("WebSocket connection closed");
                        let _ = app_handle.emit("device-disconnected", ());
                        break;
                    }
                    Err(e) => {
                        error!("WebSocket error: {}", e);
                        break;
                    }
                    _ => {}
                }
            }
            Ok(msg) = rx.recv() => {
                if write.send(Message::Text(msg.into())).await.is_err() {
                    break;
                }
            }
            else => break,
        }
    }
}
