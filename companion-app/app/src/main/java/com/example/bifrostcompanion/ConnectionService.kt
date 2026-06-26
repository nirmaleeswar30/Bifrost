package com.example.bifrostcompanion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import okhttp3.*
import org.json.JSONObject
import kotlinx.coroutines.*
import java.util.concurrent.TimeUnit

class ConnectionService : Service() {
    private var webSocket: WebSocket? = null
    private var clipboardManager: ClipboardManager? = null
    private var clipboardListener: ClipboardManager.OnPrimaryClipChangedListener? = null
    private var lastClipboardText: String? = null
    
    companion object {
        const val ACTION_START = "com.example.bifrostcompanion.START_CONNECTION"
        const val ACTION_STOP = "com.example.bifrostcompanion.STOP_CONNECTION"
        const val EXTRA_IP = "ip"
        const val EXTRA_PORT = "port"
        const val EXTRA_TOKEN = "token"
        
        val isConnected = kotlinx.coroutines.flow.MutableStateFlow(false)
        var currentWebSocket: WebSocket? = null
        val videoFrameFlow = kotlinx.coroutines.flow.MutableStateFlow<android.graphics.Bitmap?>(null)
        val connectionErrorFlow = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)

        fun sendMessage(message: String) {
            currentWebSocket?.send(message)
        }
    }

    private fun mapPath(reqPath: String): String {
        var mappedPath = reqPath
        val extStorage = android.os.Environment.getExternalStorageDirectory().absolutePath
        if (reqPath == "/sdcard" || reqPath == "/") {
            mappedPath = extStorage
        } else if (reqPath.startsWith("/sdcard/")) {
            mappedPath = reqPath.replaceFirst("/sdcard", extStorage)
        }
        return mappedPath
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        
        clipboardManager = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboardListener = ClipboardManager.OnPrimaryClipChangedListener {
            val clip = clipboardManager?.primaryClip
            if (clip != null && clip.itemCount > 0) {
                val text = clip.getItemAt(0).text?.toString()
                if (text != null && text != lastClipboardText) {
                    lastClipboardText = text
                    if (isConnected.value && currentWebSocket != null) {
                        val message = JSONObject().apply {
                            put("type", "clipboard_update")
                            put("content", text)
                        }.toString()
                        currentWebSocket?.send(message)
                    }
                }
            }
        }
        clipboardManager?.addPrimaryClipChangedListener(clipboardListener!!)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val ip = intent.getStringExtra(EXTRA_IP) ?: return START_NOT_STICKY
                val port = intent.getIntExtra(EXTRA_PORT, 0)
                val token = intent.getStringExtra(EXTRA_TOKEN) ?: return START_NOT_STICKY

                startForegroundService(ip, port, token)
            }
            ACTION_STOP -> {
                stopConnection()
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun startForegroundService(ip: String, port: Int, token: String) {
        val notification = createNotification("Connecting to Bifrost Desktop...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } else {
            startForeground(1, notification)
        }
        connectWebSocket(ip, port, token)
    }
    
    private fun connectWebSocket(ip: String, port: Int, token: String) {
        val url = "ws://$ip:$port"
        android.util.Log.i("BifrostWS", "Connecting to: $url")
        val request = Request.Builder().url(url).build()
        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()
            
        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                isConnected.value = true
                currentWebSocket = webSocket
                connectionErrorFlow.value = null // Clear any previous errors
                
                // Send auth token with device info
                val authMessage = JSONObject().apply {
                    put("type", "auth")
                    put("token", token)
                    put("device_id", android.provider.Settings.Secure.getString(contentResolver, android.provider.Settings.Secure.ANDROID_ID))
                    put("name", android.os.Build.MODEL)
                    put("model", android.os.Build.MODEL)
                }.toString()
                webSocket.send(authMessage)
                
                // Save connection settings
                val prefs = getSharedPreferences("bifrost_prefs", Context.MODE_PRIVATE)
                prefs.edit()
                    .putString("last_ip", ip)
                    .putInt("last_port", port)
                    .putString("last_token", token)
                    .apply()
                
                updateNotification("Connected to Bifrost Desktop")
                sendWallpaper(webSocket)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    when (json.optString("type")) {
                        "set_clipboard" -> {
                            val content = json.optString("content")
                            lastClipboardText = content // Prevent echo back
                            Handler(Looper.getMainLooper()).post {
                                val clip = ClipData.newPlainText("Bifrost Clipboard", content)
                                clipboardManager?.setPrimaryClip(clip)
                            }
                        }
                        "list_dir" -> {
                            val reqPath = json.optString("path")
                            val mappedPath = mapPath(reqPath)
                            
                            val dir = java.io.File(mappedPath)
                            val filesArray = org.json.JSONArray()
                            
                            if (dir.exists() && dir.isDirectory) {
                                dir.listFiles()?.forEach { child ->
                                    val childObj = JSONObject().apply {
                                        put("name", child.name)
                                        put("is_dir", child.isDirectory)
                                        if (child.isFile) {
                                            put("size", child.length())
                                        }
                                        put("modified", child.lastModified())
                                    }
                                    filesArray.put(childObj)
                                }
                            }
                            
                            val response = JSONObject().apply {
                                put("type", "dir_list")
                                put("path", reqPath)
                                put("files", filesArray)
                            }.toString()
                            webSocket.send(response)
                        }
                        "read_file" -> {
                            val reqPath = json.optString("path")
                            val intent = json.optString("intent", "preview")
                            val mappedPath = mapPath(reqPath)
                            val file = java.io.File(mappedPath)
                            if (file.exists() && file.isFile) {
                                val transferId = java.util.UUID.randomUUID().toString()
                                val totalSize = file.length()
                                
                                // Send start message
                                val startMsg = JSONObject().apply {
                                    put("type", "file_transfer_start")
                                    put("transfer_id", transferId)
                                    put("path", reqPath)
                                    put("size", totalSize)
                                    put("intent", intent)
                                }.toString()
                                webSocket.send(startMsg)
                                
                                // Send chunks in a coroutine to avoid blocking the WebSocket listener thread
                                kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                                    try {
                                        java.io.FileInputStream(file).use { fis ->
                                            val buffer = ByteArray(512 * 1024) // 512KB chunks
                                            var bytesRead: Int
                                            var offset: Long = 0
                                            
                                            while (fis.read(buffer).also { bytesRead = it } != -1) {
                                                // If we read less than the buffer size, only encode the actual bytes read
                                                val chunkBytes = if (bytesRead == buffer.size) buffer else buffer.copyOfRange(0, bytesRead)
                                                val base64 = android.util.Base64.encodeToString(chunkBytes, android.util.Base64.NO_WRAP)
                                                
                                                val chunkMsg = JSONObject().apply {
                                                    put("type", "file_transfer_chunk")
                                                    put("transfer_id", transferId)
                                                    put("data", base64)
                                                }.toString()
                                                
                                                // Implement backpressure: wait if queue is larger than 8MB
                                                while (webSocket.queueSize() > 8 * 1024 * 1024) {
                                                    kotlinx.coroutines.delay(10)
                                                }
                                                
                                                webSocket.send(chunkMsg)
                                                
                                                offset += bytesRead
                                                
                                                // Very small delay just to yield thread
                                                kotlinx.coroutines.delay(1)
                                            }
                                        }
                                        
                                        // Send end message
                                        val endMsg = JSONObject().apply {
                                            put("type", "file_transfer_end")
                                            put("transfer_id", transferId)
                                        }.toString()
                                        webSocket.send(endMsg)
                                        
                                    } catch (e: Exception) {
                                        e.printStackTrace()
                                    }
                                }
                            }
                        }
                        "write_file_start" -> {
                            try {
                                val reqPath = json.optString("path")
                                val mappedPath = mapPath(reqPath)
                                val file = java.io.File(mappedPath)
                                if (file.exists()) file.delete()
                                // Ensure parent directory exists
                                file.parentFile?.mkdirs()
                                file.createNewFile()
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }
                        "write_file_chunk" -> {
                            val reqPath = json.optString("path")
                            val mappedPath = mapPath(reqPath)
                            val base64 = json.optString("data")
                            try {
                                val file = java.io.File(mappedPath)
                                val bytes = android.util.Base64.decode(base64, android.util.Base64.NO_WRAP)
                                java.io.FileOutputStream(file, true).use {
                                    it.write(bytes)
                                }
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }
                        "write_file_end" -> {
                            val reqPath = json.optString("path")
                            val response = JSONObject().apply {
                                put("type", "write_success")
                                put("path", reqPath)
                            }.toString()
                            webSocket.send(response)
                        }
                        "delete_files" -> {
                            val pathsArray = json.optJSONArray("paths")
                            if (pathsArray != null) {
                                for (i in 0 until pathsArray.length()) {
                                    val reqPath = pathsArray.optString(i)
                                    val mappedPath = mapPath(reqPath)
                                    val file = java.io.File(mappedPath)
                                    if (file.exists()) {
                                        file.deleteRecursively()
                                    }
                                }
                                val response = JSONObject().apply {
                                    put("type", "dir_list_refresh_needed")
                                }.toString()
                                webSocket.send(response)
                            }
                        }
                        "request_thumbnail" -> {
                            val reqPath = json.optString("path")
                            val reqId = json.optString("req_id")
                            val mappedPath = mapPath(reqPath)
                            val file = java.io.File(mappedPath)
                            if (file.exists() && file.isFile) {
                                kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                                    try {
                                        val options = android.graphics.BitmapFactory.Options().apply {
                                            inJustDecodeBounds = true
                                        }
                                        android.graphics.BitmapFactory.decodeFile(mappedPath, options)
                                        
                                        options.inSampleSize = 1
                                        val maxDim = Math.max(options.outWidth, options.outHeight)
                                        if (maxDim > 400) {
                                            options.inSampleSize = Math.round(maxDim / 400f)
                                        }
                                        options.inJustDecodeBounds = false
                                        
                                        val bitmap = android.graphics.BitmapFactory.decodeFile(mappedPath, options)
                                        if (bitmap != null) {
                                            val stream = java.io.ByteArrayOutputStream()
                                            bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 50, stream)
                                            val bytes = stream.toByteArray()
                                            val base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                                            bitmap.recycle()
                                            
                                            val response = JSONObject().apply {
                                                put("type", "thumbnail_data")
                                                put("req_id", reqId)
                                                put("path", reqPath)
                                                put("data", base64)
                                            }.toString()
                                            webSocket.send(response)
                                        }
                                    } catch (e: Exception) {
                                        e.printStackTrace()
                                    }
                                }
                            }
                        }
                        "video_frame" -> {
                            val base64 = json.optString("data")
                            try {
                                val bytes = android.util.Base64.decode(base64, android.util.Base64.NO_WRAP)
                                val bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                                videoFrameFlow.value = bitmap
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                isConnected.value = false
                currentWebSocket = null
                val msg = if (reason.isEmpty()) "Connection closed" else "Disconnected: $reason"
                // Only show error if it wasn't a normal closure
                if (code != 1000) {
                    connectionErrorFlow.value = msg
                } else {
                    connectionErrorFlow.value = null
                }
                updateNotification(msg)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                isConnected.value = false
                currentWebSocket = null
                val errorMsg = "Connection failed: ${t.message ?: "Unknown error"}"
                // Don't show failure if we intentionally disconnected
                if (t !is java.io.EOFException && t !is java.net.SocketException) {
                    connectionErrorFlow.value = errorMsg
                }
                updateNotification(errorMsg)
            }
        })
    }
    
    private fun stopConnection() {
        webSocket?.close(1000, "User requested stop")
        webSocket = null
        currentWebSocket = null
        isConnected.value = false
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "bifrost_service_channel",
                "Bifrost Connection Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(contentText: String): Notification {
        return NotificationCompat.Builder(this, "bifrost_service_channel")
            .setContentTitle("Bifrost Companion")
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .build()
    }
    
    private fun updateNotification(contentText: String) {
        val notification = createNotification(contentText)
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(1, notification)
    }

    private fun sendWallpaper(webSocket: WebSocket) {
        try {
            val wallpaperManager = android.app.WallpaperManager.getInstance(this)
            var bytes: ByteArray? = null
            
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                try {
                    val pfd = wallpaperManager.getWallpaperFile(android.app.WallpaperManager.FLAG_SYSTEM)
                    if (pfd != null) {
                        val fileDescriptor = pfd.fileDescriptor
                        val inputStream = java.io.FileInputStream(fileDescriptor)
                        bytes = inputStream.readBytes()
                        pfd.close()
                    }
                } catch (e: Exception) {
                    android.util.Log.e("BifrostWS", "Failed to read wallpaper file: " + e.message)
                }
            }
            
            if (bytes == null) {
                val drawable = wallpaperManager.drawable
                if (drawable != null) {
                    val bitmap = (drawable as? android.graphics.drawable.BitmapDrawable)?.bitmap
                    if (bitmap != null) {
                        val stream = java.io.ByteArrayOutputStream()
                        bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 95, stream)
                        bytes = stream.toByteArray()
                    }
                }
            }
            
            if (bytes != null) {
                val b64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                val message = JSONObject().apply {
                    put("type", "wallpaper_update")
                    put("data", b64)
                }.toString()
                webSocket.send(message)
            }
        } catch (e: Exception) {
            android.util.Log.e("BifrostWS", "Failed to send wallpaper: " + e.message)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        stopConnection()
        clipboardListener?.let { clipboardManager?.removePrimaryClipChangedListener(it) }
    }
}
