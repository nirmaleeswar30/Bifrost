import { useState } from 'react';
import {
  Smartphone,
  Wifi,
  Battery,
  QrCode,
  Radar,
  Link2,
  Unlink,
  RotateCw,
  MoreVertical,
  Globe,
} from 'lucide-react';
import { useDeviceStore, type Device } from '../stores/deviceStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

export default function DevicePanel() {
  const {
    devices,
    connectionState,
    connectedDevice,
    setDevices,
    setConnectedDevice,
    setConnectionState,
  } = useDeviceStore();

  const [isScanning, setIsScanning] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [savedDevices, setSavedDevices] = useState<Device[]>([]);
  const [activeTab, setActiveTab] = useState<'scan' | 'qr'>('scan');

  const fetchSaved = () => {
    invoke<Device[]>('get_saved_devices')
      .then(devices => setSavedDevices(devices))
      .catch(console.error);
  };

  useEffect(() => {
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
    } catch (e: any) {
      console.error("Failed to connect device:", e);
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
    <div className="flex-1 overflow-y-auto p-6 animate-fade-in bg-bg-primary select-none">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Devices</h1>
          <p className="text-xs text-text-secondary mt-1">
            Discover and manage your connected Android devices
          </p>
        </div>

        {/* Scan & QR Section */}
        <div className="flex flex-col md:flex-row gap-6 bg-bg-surface/30 border border-border/50 rounded-xl p-5 shadow-xs">
          {/* Left Side: Vertical Tabs List */}
          <div className="flex flex-col gap-1 w-full md:w-52 shrink-0 border-b md:border-b-0 md:border-r border-border/50 pb-4 md:pb-0 md:pr-5">
            <button
              onClick={() => setActiveTab('scan')}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors duration-150 cursor-pointer",
                activeTab === 'scan'
                  ? 'bg-bg-secondary/80 text-text-primary border border-border/60'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-hover/50'
              )}
            >
              <Radar className={cn("w-4 h-4", activeTab === 'scan' && isScanning && "animate-spin")} style={activeTab === 'scan' && isScanning ? { animationDuration: '3s' } : undefined} />
              <div className="flex flex-col">
                <span className="font-semibold text-xs text-text-primary">Find Devices</span>
                <span className="text-[10px] text-text-muted mt-0.5">Local network scan</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('qr')}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors duration-150 cursor-pointer",
                activeTab === 'qr'
                  ? 'bg-bg-secondary/80 text-text-primary border border-border/60'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-hover/50'
              )}
            >
              <QrCode className="w-4 h-4" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs text-text-primary">QR Pairing</span>
                <span className="text-[10px] text-text-muted mt-0.5">Pair instantly via code</span>
              </div>
            </button>
          </div>

          {/* Right Side: Tab Content */}
          <div className="flex-1 flex items-center justify-center min-h-[160px]">
            {activeTab === 'scan' ? (
              <div className="flex flex-col items-center justify-center text-center py-2 px-4 w-full max-w-md animate-fade-in">
                <div className="w-36 h-36 flex items-center justify-center relative mb-4 shrink-0">
                  {/* Radar rings */}
                  {isScanning && (
                    <>
                      <div className="absolute inset-8 rounded-full border border-primary/30 animate-radar" />
                      <div className="absolute inset-8 rounded-full border border-primary/20 animate-radar [animation-delay:0.5s]" />
                      <div className="absolute inset-8 rounded-full border border-primary/10 animate-radar [animation-delay:1s]" />
                    </>
                  )}
                  <div className={cn(
                    "relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 border",
                    isScanning
                      ? 'bg-primary/5 border-primary/20 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                      : 'bg-bg-primary border-border'
                  )}>
                    <Radar className={cn(
                      "w-8 h-8 transition-colors duration-300 text-text-muted",
                      isScanning ? 'text-primary animate-spin' : ''
                    )} style={isScanning ? { animationDuration: '3s' } : undefined} />
                  </div>
                </div>

                <h3 className="text-sm font-semibold text-text-primary mb-1">
                  {isScanning ? 'Scanning Network…' : 'Find Devices'}
                </h3>
                <p className="text-xs text-text-muted mb-4 max-w-[280px] leading-relaxed">
                  {isScanning
                    ? 'Looking for Android devices on your network'
                    : 'Scan your local network for available Android devices'}
                </p>

                <Button
                  onClick={handleScan}
                  disabled={isScanning}
                  variant={isScanning ? "outline" : "default"}
                  size="sm"
                  className="px-5 font-semibold cursor-pointer"
                >
                  {isScanning ? 'Scanning…' : 'Scan for Devices'}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-2 px-4 w-full max-w-md animate-fade-in">
                <div className="w-32 h-32 rounded-lg bg-bg-primary border border-border flex items-center justify-center mb-4 overflow-hidden shrink-0">
                  {qrCode ? (
                    <img src={qrCode} alt="Pairing QR Code" className="w-full h-full object-cover" />
                  ) : (
                    <QrCode className="w-12 h-12 text-text-muted/40" strokeWidth={1} />
                  )}
                </div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">QR Code Pairing</h3>
                <p className="text-xs text-text-muted mb-4 max-w-[280px] leading-relaxed">
                  Scan this code from your Android device to pair instantly
                </p>
                <Button 
                  onClick={handleGenerateQR}
                  variant="outline"
                  size="sm"
                  className="px-5 font-semibold border-border hover:bg-bg-hover text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  {qrCode ? 'Regenerate QR Code' : 'Generate QR Code'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Discovered Devices */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text-primary">Discovered Devices</h2>
              {devices.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-bg-secondary text-text-secondary border border-border/30">
                  {devices.length}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleScan}
              disabled={isScanning}
              className="h-8 w-8 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md cursor-pointer"
            >
              <RotateCw className={cn("w-4 h-4", isScanning && "animate-spin")} />
            </Button>
          </div>

          {devices.length === 0 ? (
            /* Empty State */
            <Card className="bg-bg-surface/50 border border-border/50 shadow-none">
              <CardContent className="flex flex-col items-center justify-center py-10 px-5 text-center">
                <div className="w-10 h-10 rounded-lg bg-bg-secondary/40 border border-border/40 flex items-center justify-center mb-3 text-text-muted">
                  <Smartphone className="w-5 h-5 text-text-muted/40" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-medium text-text-primary mb-1">
                  No active devices discovered
                </h3>
                <p className="text-xs text-text-muted max-w-sm">
                  Start a local network scan or scan a pairing QR code to connect your Android phone.
                </p>
              </CardContent>
            </Card>
          ) : (
            /* Device List */
            <div className="space-y-3">
              {devices.map((device) => {
                const isConnected = connectedDevice?.id === device.id;
                return (
                  <div
                    key={device.id}
                    className={cn(
                      "bg-bg-surface/40 border border-border/50 rounded-lg py-4 px-5 flex items-center justify-between transition-colors duration-150 animate-slide-in",
                      isConnected && "border-primary/30 bg-primary/2"
                    )}
                  >
                    {/* Left & Center zones */}
                    <div className="flex items-center gap-4">
                      {/* Left Zone: Device Icon Container */}
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center border",
                        isConnected
                          ? 'bg-primary/5 border-primary/20 text-primary'
                          : 'bg-bg-secondary/40 border-border/40 text-text-muted'
                      )}>
                        <Smartphone className="w-5 h-5" strokeWidth={1.5} />
                      </div>

                      {/* Center Zone: Info Stack */}
                      <div className="flex flex-col gap-0.5">
                        {/* Top Row: Device Name + Connection Badge */}
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-text-primary">{device.name}</span>
                          <span className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider",
                            device.connectionType === 'wifi'
                              ? 'bg-primary/5 text-primary border-primary/20'
                              : 'bg-accent-violet/5 text-accent-violet border-accent-violet/20'
                          )}>
                            {device.connectionType}
                          </span>
                        </div>

                        {/* Second Row: Model/Android version */}
                        <div className="text-xs text-text-muted">
                          {device.model}
                        </div>

                        {/* Third Row: Metadata horizontal layout */}
                        <div className="flex items-center gap-4 mt-1.5">
                          {/* Battery percentage with battery icon */}
                          {device.batteryLevel !== undefined && (
                            <div className="flex items-center gap-1.5 text-text-muted">
                              <Battery className={cn(
                                "w-3.5 h-3.5",
                                device.batteryLevel > 60 ? 'text-success' :
                                device.batteryLevel > 20 ? 'text-warning' : 'text-danger'
                              )} />
                              <span className="text-[11px]">{device.batteryLevel}% Battery</span>
                            </div>
                          )}

                          {/* Connection quality with Wi-Fi icon */}
                          <div className="flex items-center gap-1.5 text-text-muted">
                            <Wifi className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Good Connection</span>
                          </div>

                          {/* Additional connection information if available */}
                          {device.ipAddress && (
                            <div className="flex items-center gap-1.5 text-text-muted">
                              <Globe className="w-3.5 h-3.5" />
                              <span className="text-[11px] font-mono">{device.ipAddress}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Zone: Actions */}
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant={isConnected ? "destructive" : "default"}
                        onClick={() =>
                          isConnected ? handleDisconnect() : handleConnect(device)
                        }
                        className={cn(
                          "h-8 px-3 text-xs font-semibold cursor-pointer flex items-center gap-1.5",
                          !isConnected && "bg-primary hover:bg-primary/90 text-white border-none shadow-none"
                        )}
                      >
                        {isConnected ? (
                          <>
                            <Unlink className="w-3.5 h-3.5" />
                            Disconnect
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3.5 h-3.5" />
                            Connect
                          </>
                        )}
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem className="cursor-pointer" onClick={() => console.log("Device info", device)}>
                            Device Info
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => console.log("Settings", device)}>
                            Settings
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Saved Devices */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text-primary">Saved Devices</h2>
              {savedDevices.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-bg-secondary text-text-secondary border border-border/30">
                  {savedDevices.length}
                </span>
              )}
            </div>
          </div>

          {savedDevices.length === 0 ? (
            <Card className="bg-bg-surface/50 border border-border/50 shadow-none">
              <CardContent className="py-8 px-4 text-center">
                <p className="text-xs text-text-muted">
                  No saved devices yet. Connect a device to save it for quick access.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {savedDevices.map((device) => (
                <div
                  key={device.id}
                  className="bg-bg-surface/40 border border-border/50 rounded-lg py-4 px-5 flex items-center justify-between transition-colors duration-150 animate-slide-in"
                >
                  {/* Left & Center zones */}
                  <div className="flex items-center gap-4">
                    {/* Left: Device Icon */}
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-bg-secondary/40 border border-border/40 text-text-muted">
                      <Smartphone className="w-5 h-5" strokeWidth={1.5} />
                    </div>

                    {/* Center: Name & Model */}
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm text-text-primary">{device.name}</span>
                      <span className="text-xs text-text-muted">{device.model}</span>
                    </div>
                  </div>

                  {/* Right Zone: Metadata instead of actions */}
                  <div className="flex items-center gap-6">
                    {/* Last connected metadata */}
                    <div className="flex flex-col items-end gap-0.5 text-right">
                      <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Last connected</span>
                      <span className="text-xs text-text-secondary">Today, 10:24 AM</span>
                    </div>

                    {/* Overflow Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md cursor-pointer"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem className="cursor-pointer" onClick={() => console.log("Device info", device)}>
                          Device Info
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer text-destructive focus:text-destructive-foreground focus:bg-destructive"
                          onClick={async () => {
                            try {
                              await invoke('forget_device', { id: device.id });
                              fetchSaved();
                            } catch (e) {
                              console.error("Failed to forget device:", e);
                            }
                          }}
                        >
                          Forget Device
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
