# Bifrost

Connect your Android phone to your Linux desktop wirelessly.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Linux](https://img.shields.io/badge/Platform-Linux-orange.svg)](#)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%20v2-blueviolet.svg)](https://tauri.app)

An open-source Linux alternative to proprietary device continuity solutions like O+ Connect.

---

## Features

| Feature | Wireless (Wi-Fi) | USB |
| :--- | :---: | :---: |
| **Screen Mirroring** — Cast your phone screen to your PC | ✓ | ✓ |
| **File Transfer** — Drag-and-drop files between devices | ✓ | ✓ |
| **Notification Sync** — See phone notifications on your desktop | ✓ | – |
| **Clipboard Sharing** — Bidirectional copy and paste | ✓ | – |
| **SMS/Call Sync** — View call logs and messages | ✓ | – |
| **Remote PC Control** — Use your phone as a trackpad or keyboard | ✓ | – |
| **QR Code Pairing** — Instant wireless setup | ✓ | – |

### Key Advantages
* **Wireless-First:** All features operate seamlessly over Wi-Fi (same local network) without requiring cables. USB connection remains available as an optional fallback.
* **Brand Agnostic:** Works with any Android device running Android 7.0 or higher, removing brand-locked ecosystems.

---

## Tech Stack

* **Desktop Application:** [Tauri v2](https://tauri.app) (Rust backend with a React and TypeScript frontend)
* **Styling:** Tailwind CSS v4
* **Screen Mirroring:** scrcpy protocol implementation
* **Companion Application:** Kotlin and Jetpack Compose *(In Development)*
* **Communication Protocols:** WebSockets for wireless data transfer, ADB for physical fallback

---

## Installation & Building from Source

### Prerequisites

Ensure you have the necessary system dependencies installed for your distribution:

#### Arch Linux / CachyOS
```bash
sudo pacman -S --needed nodejs npm rust webkit2gtk-4.1 openssl pkgconf base-devel gtk3 libsoup3

```

#### Ubuntu / Debian

```bash
sudo apt install -y nodejs npm rustc cargo libwebkit2gtk-4.1-dev libssl-dev pkg-config build-essential libgtk-3-dev libsoup-3.0-dev

```

#### Fedora

```bash
sudo dnf install -y nodejs npm rust cargo webkit2gtk4.1-devel openssl-devel pkgconf gcc gtk3-devel libsoup3-devel

```

### Build Steps

1. Clone the repository and navigate into the project directory:
```bash
git clone [https://github.com/yourusername/Bifrost.git](https://github.com/yourusername/Bifrost.git)
cd Bifrost

```


2. Install the frontend dependencies:
```bash
npm install

```


3. Run the application in development mode:
```bash
npm run tauri dev

```


4. Build the production package:
```bash
npm run tauri build

```



---

## Android Companion App

Features such as notification sync, clipboard sharing, SMS/call sync, and remote PC control require the companion application to be installed on your Android device.

> **Note:** The Android companion application is currently under development and will be available soon. Screen mirroring and file transfer features can still be utilized via an ADB USB connection without the companion app.

---

## Roadmap

* [x] **Phase 1:** Project foundation and UI shell implementation
* [ ] **Phase 2:** Wireless discovery and secure pairing mechanics
* [ ] **Phase 3:** Android companion application release
* [ ] **Phase 4:** Core screen mirroring integration
* [ ] **Phase 5:** File transfer and background sync engine
* [ ] **Phase 6:** Remote PC control implementation
* [ ] **Phase 7:** UI polish, optimization, and distribution packaging

---

## Contributing

Contributions are welcome. Please feel free to open an issue or submit a pull request to help improve the project.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for more information.
