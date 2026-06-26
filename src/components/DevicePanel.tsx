import { useState } from 'react';
import {
  Smartphone,
  Wifi,
  Usb,
  Battery,
  QrCode,
  Radar,
  Plus,
  Link2,
  Unlink,
  Zap,
} from 'lucide-react';
import { useDeviceStore, type Device } from '../stores/deviceStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';



export default function DevicePanel() {
  const {
    devices,
    connectionState,
    setDevices,
    setConnectedDevice,
    setConnectionState,
  } = useDeviceStore();

  const [isScanning, setIsScanning] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [savedDevices, setSavedDevices] = useState<Device[]>([]);

  useEffect(() => {
    const fetchSaved = () => {
      invoke<Device[]>('get_saved_devices')
        .then(devices => setSavedDevices(devices))
        .catch(console.error);
    };

    fetchSaved();
    
    // Listen for device-connected just to refresh saved devices
    const unlistenConnected = listen('device-connected', () => {
      fetchSaved();
    });

    return () => {
      unlistenConnected.then(fn => fn());
    };
  }, []);

  const handleGenerateQR = async () => {
    try {
      const qr = await invoke<string>('get_qr_code');
      setQrCode(qr);
    } catch (e) {
      console.error(e);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    if (connectionState === 'disconnected') {
      setConnectionState('discovering');
    }

    try {
      const startTime = Date.now();
      const discovered = await invoke<Device[]>('list_devices');
      setDevices(discovered);
      
      // Ensure the scanning animation plays for at least 1.5 seconds so the user sees it
      const elapsed = Date.now() - startTime;
      if (elapsed < 1500) {
        await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
      }
    } catch (e) {
      console.error("Failed to scan devices", e);
    } finally {
      setIsScanning(false);
      if (connectionState === 'discovering') {
        setConnectionState('disconnected');
      }
    }
  };

  const handleConnect = async (device: Device) => {
    setConnectionState('connecting');
    setConnectedDevice(device);
    try {
      await invoke('connect_device', { deviceId: device.id });
      // The actual 'connected' state will be set by the device-connected event listener
      // when the phone's WebSocket connects. We just wait.
    } catch (e: any) {
      console.error("Failed to connect device via USB:", e);
      setConnectionState('disconnected');
      setConnectedDevice(null);
    }
  };

  const handleDisconnect = () => {
    setConnectedDevice(null);
    setConnectionState('disconnected');
    setDevices(devices.map((d) => ({ ...d, isConnected: false })));
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Devices</h1>
          <p className="text-sm text-text-secondary mt-1">
            Discover and manage your Android devices
          </p>
        </div>

        {/* Scan & QR Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Scan Card */}
          <div className="glass gradient-border rounded-2xl p-6 flex flex-col items-center text-center">
            <div className="relative mb-5">
              {/* Radar rings */}
              {isScanning && (
                <>
                  <div className="absolute inset-0 rounded-full border-2 border-accent/30 animate-radar" />
                  <div className="absolute inset-0 rounded-full border-2 border-accent/20 animate-radar [animation-delay:0.5s]" />
                  <div className="absolute inset-0 rounded-full border-2 border-accent/10 animate-radar [animation-delay:1s]" />
                </>
              )}
              <div className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 ${
                isScanning
                  ? 'bg-accent/20 shadow-[0_0_30px_rgba(99,102,241,0.3)]'
                  : 'bg-bg-surface border border-border'
              }`}>
                <Radar className={`w-8 h-8 transition-colors duration-300 ${
                  isScanning ? 'text-accent-light animate-spin' : 'text-text-muted'
                }`} style={isScanning ? { animationDuration: '3s' } : undefined} />
              </div>
            </div>

            <h3 className="text-base font-semibold text-text-primary mb-1">
              {isScanning ? 'Scanning Network…' : 'Find Devices'}
            </h3>
            <p className="text-xs text-text-muted mb-5 max-w-[240px]">
              {isScanning
                ? 'Looking for Android devices on your network'
                : 'Scan your local network for available Android devices'}
            </p>

            <button
              onClick={handleScan}
              disabled={isScanning}
              className={`
                px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 cursor-pointer
                ${isScanning
                  ? 'bg-accent/20 text-accent-light cursor-not-allowed border border-accent/30'
                  : 'bg-gradient-to-r from-accent to-accent-violet text-white shadow-lg shadow-accent-glow/30 hover:shadow-accent-glow/50 hover:scale-[1.03] active:scale-[0.98]'
                }
              `}
            >
              {isScanning ? 'Scanning…' : 'Scan for Devices'}
            </button>
          </div>

          {/* QR Code Card */}
          <div className="glass gradient-border rounded-2xl p-6 flex flex-col items-center text-center">
            <div className="w-36 h-36 rounded-xl bg-bg-primary/80 border border-border flex items-center justify-center mb-5 overflow-hidden">
              {qrCode ? (
                <img src={qrCode} alt="Pairing QR Code" className="w-full h-full object-cover" />
              ) : (
                <QrCode className="w-16 h-16 text-text-muted/40" strokeWidth={1} />
              )}
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">QR Code Pairing</h3>
            <p className="text-xs text-text-muted mb-5 max-w-[240px]">
              Scan this code from your Android device to pair instantly
            </p>
            <button 
              onClick={handleGenerateQR}
              className="px-6 py-2.5 rounded-xl text-sm font-medium bg-bg-surface border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-hover transition-all duration-200 cursor-pointer"
            >
              {qrCode ? 'Regenerate QR Code' : 'Generate QR Code'}
            </button>
          </div>
        </div>

        {/* Discovered Devices */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" />
              Discovered Devices
              {devices.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-[11px] font-medium rounded-full bg-accent/15 text-accent-light">
                  {devices.length}
                </span>
              )}
            </h2>
          </div>

          {devices.length === 0 ? (
            /* Empty State */
            <div className="glass rounded-2xl p-12 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-2xl bg-bg-surface/60 border border-border flex items-center justify-center mb-5">
                <Smartphone className="w-10 h-10 text-text-muted/30" strokeWidth={1.2} />
              </div>
              <h3 className="text-base font-semibold text-text-secondary mb-2">
                No devices found
              </h3>
              <p className="text-sm text-text-muted max-w-xs">
                Click "Scan for Devices" to discover Android devices on your network, or use QR code pairing.
              </p>
            </div>
          ) : (
            /* Device Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className={`glass gradient-border rounded-xl p-5 transition-all duration-300 hover:bg-bg-hover/40 animate-slide-in ${
                    device.isConnected ? 'ring-1 ring-success/30 shadow-[0_0_20px_rgba(34,197,94,0.08)]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {/* Device icon */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                        device.isConnected
                          ? 'bg-success/15 text-success'
                          : 'bg-bg-surface text-text-muted border border-border'
                      }`}>
                        <Smartphone className="w-5 h-5" />
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-text-primary">{device.name}</h4>
                        <p className="text-xs text-text-muted mt-0.5">{device.model}</p>
                      </div>
                    </div>

                    {/* Connection type badge */}
                    <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ${
                      device.connectionType === 'wifi'
                        ? 'bg-accent/10 text-accent-light'
                        : 'bg-accent-violet/10 text-accent-violet'
                    }`}>
                      {device.connectionType === 'wifi' ? (
                        <Wifi className="w-3 h-3" />
                      ) : (
                        <Usb className="w-3 h-3" />
                      )}
                      {device.connectionType.toUpperCase()}
                    </span>
                  </div>

                  {/* Details row */}
                  <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
                    {/* Battery */}
                    {device.batteryLevel !== undefined && (
                      <div className="flex items-center gap-1.5 text-text-secondary">
                        <Battery className={`w-3.5 h-3.5 ${
                          device.batteryLevel > 60 ? 'text-success' :
                          device.batteryLevel > 20 ? 'text-warning' : 'text-danger'
                        }`} />
                        <span className="text-xs">{device.batteryLevel}%</span>
                      </div>
                    )}

                    {/* IP Address */}
                    {device.ipAddress && (
                      <span className="text-xs text-text-muted font-mono">
                        {device.ipAddress}
                      </span>
                    )}

                    {/* Connect/Disconnect button */}
                    <button
                      onClick={() =>
                        device.isConnected ? handleDisconnect() : handleConnect(device)
                      }
                      className={`ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                        device.isConnected
                          ? 'bg-danger-muted text-danger hover:bg-danger/20'
                          : 'bg-gradient-to-r from-accent to-accent-violet text-white shadow-sm shadow-accent-glow/20 hover:shadow-accent-glow/40 hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                    >
                      {device.isConnected ? (
                        <>
                          <Unlink className="w-3 h-3" />
                          Disconnect
                        </>
                      ) : (
                        <>
                          <Link2 className="w-3 h-3" />
                          Connect
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Saved Devices */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-text-muted" />
            Saved Devices
          </h2>
          {savedDevices.length === 0 ? (
            <div className="glass rounded-2xl p-8 flex flex-col items-center text-center">
              <p className="text-sm text-text-muted">
                No saved devices yet. Connect a device to save it for quick access.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedDevices.map((device) => (
                <div key={device.id} className="glass gradient-border rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-text-primary">{device.name}</h4>
                  <p className="text-xs text-text-muted mt-0.5">{device.model}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
