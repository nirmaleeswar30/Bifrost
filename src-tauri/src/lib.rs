//! Bifrost — Connect your Android phone to your Linux desktop.
//!
//! This is the main library crate for the Bifrost Tauri application.

mod adb;
mod db;
pub mod mirror;
mod network;
mod sync;
mod transfer;

use std::sync::Mutex;
use tokio::sync::Mutex as AsyncMutex;
use tauri::{AppHandle, Manager, State};
pub use adb::{Device, device::ConnectionType};
use network::ConnectionState;
use network::mdns::MdnsDiscovery;
use network::pairing::PairingManager;
use sync::websocket::WsServer;
use db::Database;
use db::models::DeviceProfile;
use mirror::stream::VideoStreamServer;
use mirror::scrcpy::ScrcpyManager;

struct AppState {
    pairing_manager: Mutex<Option<PairingManager>>,
    mdns: Mutex<Option<MdnsDiscovery>>,
    db: Mutex<Option<Database>>,
    video_server: Mutex<Option<VideoStreamServer>>,
    scrcpy_manager: AsyncMutex<ScrcpyManager>,
    ws_sender: Mutex<Option<tokio::sync::broadcast::Sender<String>>>,
    clipboard_manager: Mutex<Option<sync::ClipboardManager>>,
    input_controller: Mutex<Option<mirror::control::InputController>>,
    ws_port: Mutex<u16>,
    auth_token: Mutex<String>,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn start_services(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    // Check if services are already started (e.g. from React Strict Mode double-invocation)
    if state.ws_sender.lock().unwrap().is_some() {
        return Ok(());
    }

    // Initialize DB and load/create desktop_token
    let mut persistent_token = uuid::Uuid::new_v4().to_string();
    if let Some(app_dir) = app.path().app_data_dir().ok() {
        std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
        if let Ok(database) = Database::new(app_dir) {
            // Retrieve or set desktop token
            if let Ok(Some(token)) = database.get_setting("desktop_token") {
                persistent_token = token;
            } else {
                let _ = database.set_setting("desktop_token", &persistent_token);
            }
            *state.db.lock().unwrap() = Some(database);
        }
    }

    let ws = WsServer::new();
    let port = ws.get_port();
    
    let pairing_mgr = PairingManager::new(port, persistent_token.clone());
    let token = pairing_mgr.token.clone();
    
    // Start mDNS
    let mdns = MdnsDiscovery::new().map_err(|e| e.to_string())?;
    mdns.start_broadcasting(port).map_err(|e| e.to_string())?;
    
    *state.pairing_manager.lock().unwrap() = Some(pairing_mgr);
    *state.mdns.lock().unwrap() = Some(mdns);
    *state.ws_sender.lock().unwrap() = Some(ws.get_sender());
    *state.ws_port.lock().unwrap() = port;
    *state.auth_token.lock().unwrap() = persistent_token.clone();
    
    if let Ok(cb) = sync::ClipboardManager::new() {
        *state.clipboard_manager.lock().unwrap() = Some(cb);
    }
    
    if let Ok(ic) = mirror::control::InputController::new() {
        *state.input_controller.lock().unwrap() = Some(ic);
    }
    
    // Start Screencast broadcaster
    mirror::start_screencast(ws.get_sender()).await;

    // Start WebSocket
    ws.start(app, token).await.map_err(|e| e.to_string())?;

    // Start Video Stream WebSocket Server
    let video_server = VideoStreamServer::new();
    video_server.start(14211).await.map_err(|e| e.to_string())?;
    *state.video_server.lock().unwrap() = Some(video_server);

    Ok(())
}

#[tauri::command]
async fn start_mirroring(device_id: String, app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut scrcpy = state.scrcpy_manager.lock().await;
    let sender = {
        let vs = state.video_server.lock().unwrap();
        if let Some(vs) = vs.as_ref() {
            vs.get_sender()
        } else {
            return Err("Video server not initialized".into());
        }
    };

    scrcpy.start_mirroring(&device_id, sender, app_handle).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn stop_mirroring(state: State<'_, AppState>) -> Result<(), String> {
    let mut scrcpy = state.scrcpy_manager.lock().await;
    scrcpy.stop_mirroring();
    Ok(())
}

#[tauri::command]
fn get_qr_code(state: State<'_, AppState>) -> Result<String, String> {
    let mgr = state.pairing_manager.lock().unwrap();
    if let Some(mgr) = mgr.as_ref() {
        mgr.generate_qr_code().map_err(|e| e.to_string())
    } else {
        Err("Pairing manager not initialized".into())
    }
}

#[tauri::command]
fn get_saved_devices(state: State<'_, AppState>) -> Result<Vec<DeviceProfile>, String> {
    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.get_devices().map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn list_devices() -> Result<Vec<Device>, String> {
        let child = tokio::process::Command::new("adb")
            .arg("devices")
            .arg("-l")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn adb: {}", e))?;

        let output = match tokio::time::timeout(std::time::Duration::from_secs(5), child.wait_with_output()).await {
            Ok(Ok(out)) => out,
            Ok(Err(e)) => return Err(format!("Failed to read adb output: {}", e)),
            Err(_) => return Err("ADB command timed out after 5 seconds".to_string()),
        };
            
        let output_str = String::from_utf8_lossy(&output.stdout);
        let mut devices = Vec::new();
        
        for line in output_str.lines().skip(1) {
            if line.trim().is_empty() { continue; }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 && parts[1] == "device" {
                let id = parts[0].to_string();
                let mut name = id.clone();
                let mut model = "Android Device".to_string();
                let mut connection_type = crate::adb::device::ConnectionType::Usb;
                
                if id.contains(':') && id.contains('.') {
                    connection_type = crate::adb::device::ConnectionType::Wifi;
                }
                
                for part in parts.iter().skip(2) {
                    if part.starts_with("model:") {
                        model = part.replace("model:", "").replace("_", " ");
                        name = model.clone();
                    }
                }
                
                devices.push(Device {
                    id,
                    name,
                    model,
                    connection_type,
                    ip_address: None,
                    is_connected: false,
                });
            }
        }
        
        Ok(devices)
    }
}

pub use commands::list_devices;

#[tauri::command]
fn get_connection_state() -> ConnectionState {
    ConnectionState::Disconnected
}

#[tauri::command]
async fn connect_device(device_id: String, app_handle: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let port = *state.ws_port.lock().unwrap();
    let token = state.auth_token.lock().unwrap().clone();

    // Step 1: Set up adb reverse so the phone can reach our WS server via localhost
    let reverse_result = tokio::process::Command::new("adb")
        .args(["-s", &device_id, "reverse", &format!("tcp:{}", port), &format!("tcp:{}", port)])
        .stdin(std::process::Stdio::null())
        .output()
        .await
        .map_err(|e| format!("Failed to run adb reverse: {}", e))?;

    if !reverse_result.status.success() {
        let err_msg = String::from_utf8_lossy(&reverse_result.stderr);
        error!("adb reverse failed: {}", err_msg);
        return Err(format!("ADB Device not found or offline. Please click 'Scan for Devices' and connect to the correct physical device. Error: {}", err_msg));
    }

    // Step 2: Trigger Android service via intent
    let start_result = tokio::process::Command::new("adb")
        .args([
            "-s", &device_id,
            "shell", "am", "start-foreground-service",
            "-n", "com.example.bifrostcompanion/.ConnectionService",
            "-a", "com.example.bifrostcompanion.START_CONNECTION",
            "--es", "ip", "127.0.0.1",
            "--ei", "port", &port.to_string(),
            "--es", "token", &token,
        ])
        .stdin(std::process::Stdio::null())
        .output()
        .await
        .map_err(|e| format!("Failed to run adb shell: {}", e))?;

    if !start_result.status.success() {
        let err_msg = String::from_utf8_lossy(&start_result.stderr);
        error!("Failed to start android service: {}", err_msg);
        return Err(format!("Failed to start companion app on phone. Error: {}", err_msg));
    }

    app_handle.emit("device-connected", serde_json::json!({
        "device_id": device_id
    })).unwrap();

    Ok(())
}

#[tauri::command]
fn disconnect_device() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn get_desktop_clipboard(state: State<'_, AppState>) -> Result<String, String> {
    let mgr = state.clipboard_manager.lock().unwrap();
    if let Some(mgr) = mgr.as_ref() {
        mgr.get_text()
    } else {
        Err("Clipboard not initialized".into())
    }
}

#[tauri::command]
fn set_desktop_clipboard(content: String, state: State<'_, AppState>) -> Result<(), String> {
    let mgr = state.clipboard_manager.lock().unwrap();
    if let Some(mgr) = mgr.as_ref() {
        mgr.set_text(&content)
    } else {
        Err("Clipboard not initialized".into())
    }
}

#[tauri::command]
fn request_android_files(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let sender = state.ws_sender.lock().unwrap();
    if let Some(sender) = sender.as_ref() {
        let msg = serde_json::json!({
            "type": "list_dir",
            "path": path
        });
        sender.send(msg.to_string()).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("WebSocket not connected".into())
    }
}

#[tauri::command]
fn download_and_open_file(path: String, intent: Option<String>, state: State<'_, AppState>) -> Result<(), String> {
    let sender = state.ws_sender.lock().unwrap();
    if let Some(sender) = sender.as_ref() {
        let msg = serde_json::json!({
            "type": "read_file",
            "path": path,
            "intent": intent.unwrap_or_else(|| "preview".to_string())
        });
        sender.send(msg.to_string()).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("WebSocket not connected".into())
    }
}

#[tauri::command]
fn request_thumbnail(path: String, req_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let sender = state.ws_sender.lock().unwrap();
    if let Some(sender) = sender.as_ref() {
        let msg = serde_json::json!({
            "type": "request_thumbnail",
            "path": path,
            "req_id": req_id
        });
        sender.send(msg.to_string()).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("WebSocket not connected".into())
    }
}

#[tauri::command]
fn delete_android_files(paths: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let sender = state.ws_sender.lock().unwrap();
    if let Some(sender) = sender.as_ref() {
        let msg = serde_json::json!({
            "type": "delete_files",
            "paths": paths
        });
        sender.send(msg.to_string()).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("WebSocket not connected".into())
    }
}

#[tauri::command]
fn request_download_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let sender = state.ws_sender.lock().unwrap();
    if let Some(sender) = sender.as_ref() {
        let msg = serde_json::json!({
            "type": "read_file",
            "path": path
        });
        sender.send(msg.to_string()).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("WebSocket not connected".into())
    }
}

#[tauri::command]
fn upload_file_to_android(local_path: String, remote_path: String, state: State<'_, AppState>) -> Result<(), String> {
    println!("[Bifrost Upload] Command triggered. Local: {}, Remote: {}", local_path, remote_path);
    let sender = state.ws_sender.lock().unwrap().clone();
    
    if let Some(sender) = sender {
        tauri::async_runtime::spawn(async move {
            println!("[Bifrost Upload] Spawned async task for {}", remote_path);
            let start_msg = serde_json::json!({
                "type": "write_file_start",
                "path": remote_path
            });
            let _ = sender.send(start_msg.to_string());
            
            match std::fs::File::open(&local_path) {
                Ok(mut file) => {
                    println!("[Bifrost Upload] Successfully opened local file");
                    use std::io::Read;
                    let mut buffer = [0u8; 512 * 1024]; // 512KB chunks
                    let mut total_sent = 0;
                    loop {
                        match file.read(&mut buffer) {
                            Ok(0) => break,
                            Ok(n) => {
                                use base64::Engine;
                                let base64 = base64::engine::general_purpose::STANDARD.encode(&buffer[..n]);
                                let chunk_msg = serde_json::json!({
                                    "type": "write_file_chunk",
                                    "path": remote_path,
                                    "data": base64
                                });
                                if let Err(e) = sender.send(chunk_msg.to_string()) {
                                    println!("[Bifrost Upload] Failed to send chunk: {}", e);
                                    break;
                                }
                                total_sent += n;
                                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                            }
                            Err(e) => {
                                println!("[Bifrost Upload] Failed to read local file: {}", e);
                                break;
                            }
                        }
                    }
                    println!("[Bifrost Upload] Finished reading file. Total sent: {} bytes", total_sent);
                },
                Err(e) => {
                    println!("[Bifrost Upload] FAILED to open local file: {}", e);
                }
            }
            
            let end_msg = serde_json::json!({
                "type": "write_file_end",
                "path": remote_path
            });
            let _ = sender.send(end_msg.to_string());
            println!("[Bifrost Upload] Sent write_file_end for {}", remote_path);
        });
        Ok(())
    } else {
        println!("[Bifrost Upload] WebSocket not connected!");
        Err("WebSocket not connected".into())
    }
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .manage(AppState {
            pairing_manager: Mutex::new(None),
            mdns: Mutex::new(None),
            db: Mutex::new(None),
            video_server: Mutex::new(None),
            scrcpy_manager: AsyncMutex::new(ScrcpyManager::new()),
            ws_sender: Mutex::new(None),
            clipboard_manager: Mutex::new(None),
            input_controller: Mutex::new(None),
            ws_port: Mutex::new(14210),
            auth_token: Mutex::new(String::new()),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .invoke_handler(tauri::generate_handler![
            start_services,
            start_mirroring,
            stop_mirroring,
            get_desktop_clipboard,
            set_desktop_clipboard,
            request_android_files,
            download_and_open_file,
            request_download_file,
            upload_file_to_android,
            delete_android_files,
            request_thumbnail,
            get_qr_code,
            get_saved_devices,
            list_devices,
            get_connection_state,
            connect_device,
            disconnect_device,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}




