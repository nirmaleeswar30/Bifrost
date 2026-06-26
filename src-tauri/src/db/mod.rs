use rusqlite::{params, Connection};
use std::path::PathBuf;
use thiserror::Error;

pub mod models;

#[derive(Error, Debug)]
pub enum DbError {
    #[error("Database error: {0}")]
    SqliteError(#[from] rusqlite::Error),
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(app_dir: PathBuf) -> Result<Self, DbError> {
        let db_path = app_dir.join("bifrost.db");
        let conn = Connection::open(db_path)?;
        
        let db = Self { conn };
        db.init()?;
        
        Ok(db)
    }

    fn init(&self) -> Result<(), DbError> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                model TEXT NOT NULL,
                last_ip TEXT,
                auto_connect INTEGER DEFAULT 1,
                last_connected DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
        
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;
        Ok(())
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), DbError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, DbError> {
        let mut stmt = self.conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn save_device(&self, device: &crate::db::models::DeviceProfile) -> Result<(), DbError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO devices (id, name, model, last_ip, auto_connect) 
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                device.id,
                device.name,
                device.model,
                device.last_ip,
                device.auto_connect as i32
            ],
        )?;
        Ok(())
    }

    pub fn get_devices(&self) -> Result<Vec<crate::db::models::DeviceProfile>, DbError> {
        let mut stmt = self.conn.prepare("SELECT id, name, model, last_ip, auto_connect FROM devices ORDER BY last_connected DESC")?;
        let device_iter = stmt.query_map([], |row| {
            Ok(crate::db::models::DeviceProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                model: row.get(2)?,
                last_ip: row.get(3)?,
                auto_connect: row.get::<_, i32>(4)? != 0,
            })
        })?;

        let mut devices = Vec::new();
        for device in device_iter {
            devices.push(device?);
        }
        Ok(devices)
    }

    pub fn delete_device(&self, id: &str) -> Result<(), DbError> {
        self.conn.execute("DELETE FROM devices WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn rename_device(&self, id: &str, name: &str) -> Result<(), DbError> {
        self.conn.execute("UPDATE devices SET name = ?1 WHERE id = ?2", params![name, id])?;
        Ok(())
    }
}
