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
use tauri::{AppHandle, Manager, State, Emitter};
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

#[tauri::command]
fn forget_device(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.delete_device(&id).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".into())
    }
}

#[tauri::command]
fn rename_device(state: State<'_, AppState>, id: String, new_name: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    if let Some(db) = db.as_ref() {
        db.rename_device(&id, &new_name).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".into())
    }
}

#[derive(serde::Serialize)]
struct DeviceStorage {
    used: u64,
    total: u64,
}

#[derive(serde::Serialize)]
struct DashboardDevice {
    id: String,
    name: String,
    model: String,
    battery: Option<i32>,
    charging: bool,
    storage: Option<DeviceStorage>,
    wallpaper: Option<String>,
}

#[derive(serde::Serialize)]
struct DashboardOverview {
    android: Option<DashboardDevice>,
    linux: DashboardDevice,
}

fn get_linux_battery() -> Option<(i32, bool)> {
    let capacity_path = std::path::Path::new("/sys/class/power_supply/BAT0/capacity");
    let status_path = std::path::Path::new("/sys/class/power_supply/BAT0/status");
    if capacity_path.exists() {
        let capacity = std::fs::read_to_string(capacity_path).ok()?
            .trim().parse::<i32>().ok()?;
        let status = std::fs::read_to_string(status_path).ok()?;
        let charging = status.trim().to_lowercase() == "charging";
        Some((capacity, charging))
    } else {
        let capacity_path = std::path::Path::new("/sys/class/power_supply/BAT1/capacity");
        let status_path = std::path::Path::new("/sys/class/power_supply/BAT1/status");
        if capacity_path.exists() {
            let capacity = std::fs::read_to_string(capacity_path).ok()?
                .trim().parse::<i32>().ok()?;
            let status = std::fs::read_to_string(status_path).ok()?;
            let charging = status.trim().to_lowercase() == "charging";
            Some((capacity, charging))
        } else {
            None
        }
    }
}

fn get_linux_storage() -> Option<(u64, u64)> {
    let output = std::process::Command::new("df")
        .args(&["-B1", "/"])
        .output()
        .ok()?;
    let stdout = String::from_utf8(output.stdout).ok()?;
    let lines: Vec<&str> = stdout.lines().collect();
    if lines.len() >= 2 {
        let parts: Vec<&str> = lines[1].split_whitespace().collect();
        if parts.len() >= 4 {
            let total = parts[1].parse::<u64>().ok()?;
            let used = parts[2].parse::<u64>().ok()?;
            return Some((used, total));
        }
    }
    None
}

fn get_linux_os_name() -> Option<String> {
    let content = std::fs::read_to_string("/etc/os-release").ok()?;
    for line in content.lines() {
        if line.starts_with("PRETTY_NAME=") {
            let name = line.split('=').nth(1)?.trim_matches('"');
            return Some(name.to_string());
        }
    }
    None
}

fn get_linux_hostname() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "Linux PC".to_string())
}

fn get_gnome_wallpaper_path() -> Option<std::path::PathBuf> {
    for key in &["picture-uri-dark", "picture-uri"] {
        if let Ok(output) = std::process::Command::new("gsettings")
            .args(&["get", "org.gnome.desktop.background", key])
            .output()
        {
            let uri = String::from_utf8(output.stdout).unwrap_or_default();
            let uri = uri.trim().trim_matches('\'');
            if uri.is_empty() || uri == "''" || uri == "picture-uri" {
                continue;
            }
            let path_str = uri.strip_prefix("file://").unwrap_or(uri);
            let path = std::path::PathBuf::from(path_str);
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

fn resize_and_encode_image(path: &std::path::Path) -> Option<String> {
    if let Ok(bytes) = std::fs::read(path) {
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let mime = if path.extension().map_or(false, |ext| ext.eq_ignore_ascii_case("png")) {
            "image/png"
        } else {
            "image/jpeg"
        };
        return Some(format!("data:{};base64,{}", mime, b64));
    }
    None
}

async fn run_adb_shell(device_id: &str, args: &[&str]) -> Option<String> {
    let output = tokio::process::Command::new("adb")
        .args(&["-s", device_id, "shell"])
        .args(args)
        .stdin(std::process::Stdio::null())
        .output()
        .await
        .ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        None
    }
}

async fn get_android_battery(device_id: &str) -> Option<(i32, bool)> {
    let stdout = run_adb_shell(device_id, &["dumpsys", "battery"]).await?;
    let mut level = None;
    let mut charging = false;
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("level:") {
            if let Some(val_str) = line.split(':').nth(1) {
                level = val_str.trim().parse::<i32>().ok();
            }
        } else if line.starts_with("USB powered:") || line.starts_with("AC powered:") || line.starts_with("Wireless powered:") {
            if let Some(val_str) = line.split(':').nth(1) {
                if val_str.trim() == "true" {
                    charging = true;
                }
            }
        }
    }
    level.map(|l| (l, charging))
}

async fn get_android_storage(device_id: &str) -> Option<(u64, u64)> {
    let stdout = run_adb_shell(device_id, &["df", "/sdcard"]).await?;
    let lines: Vec<&str> = stdout.lines().collect();
    if lines.len() >= 2 {
        let parts: Vec<&str> = lines[1].split_whitespace().collect();
        if parts.len() >= 4 {
            let total_kb = parts[1].parse::<u64>().ok()?;
            let used_kb = parts[2].parse::<u64>().ok()?;
            return Some((used_kb * 1024, total_kb * 1024));
        }
    }
    None
}

#[tauri::command]
async fn get_dashboard_overview(app_handle: AppHandle, _state: State<'_, AppState>) -> Result<DashboardOverview, String> {
    let linux_hostname = get_linux_hostname();
    let linux_os = get_linux_os_name().unwrap_or_else(|| "Linux Desktop".to_string());
    let (linux_bat, linux_charging) = get_linux_battery().map(|(l, c)| (Some(l), c)).unwrap_or((None, false));
    let linux_storage = get_linux_storage().map(|(u, t)| DeviceStorage { used: u, total: t });
    let linux_wallpaper = get_gnome_wallpaper_path().and_then(|p| resize_and_encode_image(&p));

    let linux_device = DashboardDevice {
        id: "linux-local".to_string(),
        name: linux_hostname,
        model: linux_os,
        battery: linux_bat,
        charging: linux_charging,
        storage: linux_storage,
        wallpaper: linux_wallpaper,
    };

    let adb_devices = commands::list_devices().await.unwrap_or_default();
    let android_device = if let Some(adb_dev) = adb_devices.first() {
        let battery = get_android_battery(&adb_dev.id).await;
        let storage = get_android_storage(&adb_dev.id).await.map(|(u, t)| DeviceStorage { used: u, total: t });
        
        let android_wallpaper = if let Some(app_dir) = app_handle.path().app_data_dir().ok() {
            let wp_path = app_dir.join("android_wallpaper.jpg");
            if wp_path.exists() {
                if let Ok(bytes) = std::fs::read(&wp_path) {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    Some(format!("data:image/jpeg;base64,{}", b64))
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        Some(DashboardDevice {
            id: adb_dev.id.clone(),
            name: adb_dev.name.clone(),
            model: adb_dev.model.clone(),
            battery: battery.map(|(l, _)| l),
            charging: battery.map(|(_, c)| c).unwrap_or(false),
            storage,
            wallpaper: android_wallpaper,
        })
    } else {
        None
    };

    Ok(DashboardOverview {
        android: android_device,
        linux: linux_device,
    })
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
        eprintln!("adb reverse failed: {}", err_msg);
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
        eprintln!("Failed to start android service: {}", err_msg);
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
            forget_device,
            rename_device,
            get_dashboard_overview,
            list_devices,
            get_connection_state,
            connect_device,
            disconnect_device,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}




