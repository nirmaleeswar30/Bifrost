use crate::adb::client::AdbClient;
use std::net::TcpStream;
use std::io::Read;
use tokio::sync::broadcast;
use bytes::{Bytes, BytesMut};
use log::{info, error};
use thiserror::Error;
use std::time::Duration;
use byteorder::{BigEndian, ReadBytesExt};

#[derive(Error, Debug)]
pub enum MirrorError {
    #[error("ADB Error: {0}")]
    Adb(String),
    #[error("IO Error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Protocol Error: {0}")]
    Protocol(String),
}

pub struct ScrcpyManager {
    // Keep handles to drop or kill processes later
    child_process: Option<std::process::Child>,
}

impl ScrcpyManager {
    pub fn new() -> Self {
        Self { child_process: None }
    }

    pub async fn start_mirroring(
        &mut self,
        device_id: &str,
        sender: broadcast::Sender<Bytes>,
        app_handle: tauri::AppHandle,
    ) -> Result<(), MirrorError> {
        use tauri::Manager;
        let adb = AdbClient::new(device_id.to_string());

        // 1. Push scrcpy-server.jar
        // Use AppHandle to dynamically resolve the resource directory path
        let server_path = app_handle
            .path()
            .resolve("resources/scrcpy-server.jar", tauri::path::BaseDirectory::Resource)
            .map_err(|e| MirrorError::Io(std::io::Error::new(std::io::ErrorKind::NotFound, e.to_string())))?;
        
        let server_path_str = server_path.to_str().ok_or_else(|| {
            MirrorError::Io(std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid path string"))
        })?;

        info!("Pushing scrcpy-server from {:?} to device...", server_path_str);
        adb.push_file(server_path_str, "/data/local/tmp/scrcpy-server.jar")
            .map_err(|e| MirrorError::Adb(e.to_string()))?;

        // 2. Forward TCP port
        info!("Forwarding port 27183...");
        let _ = adb.remove_forward(27183); // Ignore errors if it didn't exist
        adb.forward_port(27183, "scrcpy")
            .map_err(|e| MirrorError::Adb(e.to_string()))?;

        // 3. Start scrcpy server
        info!("Starting scrcpy server on device...");
        let cmd = "CLASSPATH=/data/local/tmp/scrcpy-server.jar app_process / com.genymobile.scrcpy.Server 2.4 tunnel_forward=true audio=false control=false max_size=1080 max_fps=60";
        let child = adb.spawn_shell(cmd)
            .map_err(|e| MirrorError::Adb(e.to_string()))?;
        self.child_process = Some(child);

        // Wait for server to bind
        tokio::time::sleep(Duration::from_millis(1500)).await;

        // 4. Connect to forwarded port
        info!("Connecting to localhost:27183...");
        let mut stream = TcpStream::connect("127.0.0.1:27183")?;

        // 5. Read Scrcpy v2.4 Handshake
        let mut dummy = [0u8; 1];
        stream.read_exact(&mut dummy)?;
        if dummy[0] != 0x00 {
            return Err(MirrorError::Protocol("Invalid dummy byte".into()));
        }

        let mut device_name_buf = [0u8; 64];
        stream.read_exact(&mut device_name_buf)?;
        let device_name = String::from_utf8_lossy(&device_name_buf).trim_matches(char::from(0)).to_string();
        info!("Connected to device: {}", device_name);

        // Read codec (4 bytes)
        let mut codec_buf = [0u8; 4];
        stream.read_exact(&mut codec_buf)?;
        let codec = String::from_utf8_lossy(&codec_buf);
        info!("Video Codec: {}", codec);

        // Read width/height (4 bytes each)
        let width = stream.read_u32::<BigEndian>()?;
        let height = stream.read_u32::<BigEndian>()?;
        info!("Resolution: {}x{}", width, height);

        // 6. Read video packets and broadcast
        tokio::task::spawn_blocking(move || {
            let mut frame_count = 0;
            loop {
                // Header: 8 bytes PTS + 4 bytes Packet Size
                let mut header = [0u8; 12];
                if stream.read_exact(&mut header).is_err() {
                    error!("Stream ended or header read failed");
                    break;
                }

                let mut header_cursor = std::io::Cursor::new(&header[8..12]);
                let packet_size = header_cursor.read_u32::<BigEndian>().unwrap() as usize;

                let mut packet = vec![0u8; packet_size];
                if stream.read_exact(&mut packet).is_err() {
                    error!("Failed to read packet data");
                    break;
                }

                // Broadcast packet to WebSocket clients (React frontend)
                let bytes = Bytes::from(packet);
                if sender.send(bytes).is_err() {
                    // No clients connected, ignore
                } else {
                    frame_count += 1;
                    if frame_count % 60 == 0 {
                        println!("Broadcasted {} frames", frame_count);
                    }
                }
            }
        });

        Ok(())
    }

    pub fn stop_mirroring(&mut self) {
        if let Some(mut child) = self.child_process.take() {
            let _ = child.kill();
        }
    }
}
