import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Smartphone,
  FolderOpen,
  ClipboardCopy,
  Battery,
  Wifi,
  ChevronRight,
  Cpu,
  CheckCircle,
  AlertCircle,
  RotateCw,
  Monitor,
  Laptop
} from 'lucide-react';
import { useDeviceStore } from '../stores/deviceStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface DeviceData {
  id: string;
  name: string;
  model: string;
  battery: number | null;
  charging: boolean;
  storage: { used: number; total: number } | null;
  wallpaper: string | null;
}

interface DashboardOverviewData {
  android: DeviceData | null;
  linux: DeviceData;
}

export default function Overview() {
  const {
    connectionState,
    connectedDevice,
    devices,
    setActiveView,
    setConnectedDevice,
    setConnectionState,
    setDevices
  } = useDeviceStore();

  const isConnected = connectionState === 'connected';

  const handleDisconnect = () => {
    setConnectedDevice(null);
    setConnectionState('disconnected');
    setDevices(devices.map((d) => ({ ...d, isConnected: false })));
  };

  const handleForgetDevice = async (deviceId: string) => {
    try {
      await invoke('forget_device', { id: deviceId });
      handleDisconnect();
      loadDashboardData();
    } catch (e) {
      console.error("Failed to forget device:", e);
    }
  };
  const [overview, setOverview] = useState<DashboardOverviewData | null>(null);
  const [activities, setActivities] = useState<any[]>([]);

  // Query Linux and Android metrics from backend
  const loadDashboardData = async () => {
    try {
      const data = await invoke<DashboardOverviewData>('get_dashboard_overview');
      setOverview(data);
    } catch (e) {
      console.error("Failed to load dashboard overview:", e);
    }
  };

  useEffect(() => {
    loadDashboardData();

    // Initial default activity logs
    setActivities([
      {
        id: 'init-1',
        title: 'System ready',
        desc: 'Bifrost services active and listening',
        time: 'Just now',
        type: 'system',
        icon: Cpu,
        iconClass: 'text-primary bg-primary/10 border-primary/20',
      }
    ]);

    // Refresh when connection status changes
    const unlistenConnected = listen('device-connected', () => {
      loadDashboardData();
      setActivities((prev) => [
        {
          id: `conn-${Date.now()}`,
          title: 'Device connected',
          desc: 'Established secure link with Android device',
          time: 'Just now',
          type: 'connection',
          icon: Smartphone,
          iconClass: 'text-success bg-success/10 border-success/20',
        },
        ...prev,
      ].slice(0, 6));
    });

    const unlistenDisconnected = listen('device-disconnected', () => {
      loadDashboardData();
      setActivities((prev) => [
        {
          id: `disc-${Date.now()}`,
          title: 'Device disconnected',
          desc: 'Android device disconnected',
          time: 'Just now',
          type: 'connection',
          icon: AlertCircle,
          iconClass: 'text-danger bg-danger/10 border-danger/20',
        },
        ...prev,
      ].slice(0, 6));
    });

    // Listen to real-time clipboard updates
    const unlistenClipboard = listen('clipboard_update', (event: any) => {
      const content = event.payload.content || '';
      const preview = content.length > 25 ? content.slice(0, 25) + '...' : content;
      setActivities((prev) => [
        {
          id: `clip-${Date.now()}`,
          title: 'Clipboard synced',
          desc: `Synced: "${preview}"`,
          time: 'Just now',
          type: 'clipboard',
          icon: ClipboardCopy,
          iconClass: 'text-accent-violet bg-accent-violet/10 border-accent-violet/20',
        },
        ...prev,
      ].slice(0, 6));
    });

    // Listen to active wallpaper changes from companion app
    const unlistenWallpaper = listen('android_wallpaper_update', (event: any) => {
      const b64 = event.payload || '';
      setOverview(prev => {
        if (!prev || !prev.android) return prev;
        return {
          ...prev,
          android: {
            ...prev.android,
            wallpaper: b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`
          }
        };
      });
      setActivities((prev) => [
        {
          id: `wp-${Date.now()}`,
          title: 'Wallpaper synced',
          desc: 'Received active mobile wallpaper cache',
          time: 'Just now',
          type: 'system',
          icon: Smartphone,
          iconClass: 'text-primary bg-primary/10 border-primary/20',
        },
        ...prev,
      ].slice(0, 6));
    });

    return () => {
      unlistenConnected.then(fn => fn());
      unlistenDisconnected.then(fn => fn());
      unlistenClipboard.then(fn => fn());
      unlistenWallpaper.then(fn => fn());
    };
  }, []);

  // Format dynamic labels
  const getStatusText = () => {
    if (connectionState === 'connected') return 'All devices connected';
    if (connectionState === 'discovering') return 'Scanning network...';
    if (connectionState === 'connecting') return 'Connecting...';
    return 'Disconnected';
  };

  const getStatusIconColor = () => {
    if (connectionState === 'connected') return 'text-success bg-success/10 border-success/20';
    if (connectionState === 'discovering' || connectionState === 'connecting') {
      return 'text-warning bg-warning/10 border-warning/20 animate-pulse';
    }
    return 'text-text-muted bg-bg-secondary border-border/50';
  };

  const formatGB = (bytes?: number) => {
    if (!bytes) return '0.0 GB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const calculatePercent = (used?: number, total?: number) => {
    if (!used || !total) return 0;
    return Math.round((used / total) * 100);
  };

  const android = isConnected ? overview?.android : null;
  const linux = overview?.linux;

  // Custom vector phone background styles
  const phoneWallpaperStyle = android?.wallpaper
    ? { backgroundImage: `url(${android.wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'linear-gradient(to bottom right, #4f46e5, #7c3aed, #ec4899)' };

  return (
    <div className="flex-1 overflow-y-auto bg-bg-primary select-none p-6 animate-fade-in">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* COMBINED DEVICE PREVIEW & STATUS METRICS */}
        <Card className="bg-bg-surface/30 border-border/50 shadow-none overflow-hidden p-6 flex flex-col md:flex-row items-center gap-8">
          
          {/* Left: Custom Slim Vector Phone Illustration */}
          <div className="shrink-0 flex items-center justify-center select-none pointer-events-none">
            <div className="relative w-36 h-72 rounded-[28px] border-4 border-neutral-700 bg-neutral-950 p-1 shadow-inner overflow-hidden flex items-center justify-center">
              <div className="absolute top-3.5 w-2.5 h-2.5 bg-neutral-900 rounded-full z-10 border border-neutral-800" />
              
              {/* Screen Wallpaper */}
              <div
                className="w-full h-full rounded-[22px] overflow-hidden flex flex-col justify-between p-3.5 relative"
                style={phoneWallpaperStyle}
              >
                {/* Shadow overlay if wallpaper exists */}
                {android?.wallpaper && <div className="absolute inset-0 bg-black/15 pointer-events-none z-0" />}

                {/* Tiny Status indicators */}
                <div className="flex justify-between items-center text-[8px] font-bold text-white/80 tracking-wider z-10">
                  <span>9:41</span>
                  <div className="flex gap-0.8">
                    <Wifi className="w-3 h-3" />
                    <Battery className="w-3 h-3" />
                  </div>
                </div>
                
                {/* Home Indicator */}
                <div className="space-y-2 z-10">
                  <div className="text-[8px] font-bold text-center text-white/85 tracking-wider uppercase">
                    Bifrost
                  </div>
                  <div className="w-14 h-0.8 bg-white/40 rounded-full mx-auto" />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Device details and Metrics Grid */}
          <div className="flex-1 w-full space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-text-primary leading-tight">
                    {android ? android.name : 'No Android Device Connected'}
                  </h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    {android ? `${android.model} • Android OS` : 'Pair or connect a device to see status'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={loadDashboardData}
                    variant="ghost"
                    size="icon"
                    className="h-8.5 w-8.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md cursor-pointer"
                  >
                    <RotateCw className="w-4 h-4" />
                  </Button>
                  {android && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8.5 text-xs font-semibold border-border bg-bg-surface hover:bg-bg-hover text-text-secondary hover:text-text-primary cursor-pointer shadow-none"
                        >
                          Manage Device
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 bg-bg-surface border-border">
                        <DropdownMenuItem
                          className="cursor-pointer text-text-primary hover:bg-bg-hover"
                          onClick={() => {
                            const newName = prompt("Rename device:", android.name);
                            if (newName && newName.trim()) {
                              invoke('rename_device', { id: android.id, newName: newName.trim() })
                                .then(() => loadDashboardData())
                                .catch(console.error);
                            }
                          }}
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer text-text-primary hover:bg-bg-hover"
                          onClick={handleDisconnect}
                        >
                          Disconnect
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer text-destructive focus:text-destructive-foreground focus:bg-destructive hover:bg-destructive"
                          onClick={() => handleForgetDevice(android.id)}
                        >
                          Forget Device
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </div>

            <hr className="border-border/40" />

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-4">
              
              {/* Metric 1: Connection Status */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8.5 h-8.5 rounded-lg flex items-center justify-center border",
                  getStatusIconColor()
                )}>
                  {isConnected ? (
                    <CheckCircle className="w-4.5 h-4.5" strokeWidth={2} />
                  ) : (
                    <AlertCircle className="w-4.5 h-4.5" strokeWidth={2} />
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Status</span>
                  <span className="text-xs font-bold text-text-primary leading-snug">{getStatusText()}</span>
                </div>
              </div>

              {/* Metric 2: Connection Type */}
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-lg flex items-center justify-center border border-border/50 bg-bg-secondary text-text-secondary">
                  {connectedDevice?.connectionType === 'usb' ? (
                    <Cpu className="w-4.5 h-4.5" strokeWidth={1.8} />
                  ) : (
                    <Wifi className="w-4.5 h-4.5" strokeWidth={1.8} />
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Connection</span>
                  <span className="text-xs font-bold text-text-primary leading-snug">
                    {isConnected ? (connectedDevice?.connectionType === 'usb' ? 'USB Link' : 'Wi-Fi Link') : 'None'}
                  </span>
                </div>
              </div>

              {/* Metric 3: Battery Level */}
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-lg flex items-center justify-center border border-success/20 bg-success-muted text-success">
                  <Battery className="w-4.5 h-4.5" strokeWidth={1.8} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Battery</span>
                  <span className="text-xs font-bold text-text-primary leading-snug">
                    {android && android.battery !== null ? `${android.battery}% ${android.charging ? '(Charging)' : ''}` : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Metric 4: Storage */}
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-lg flex items-center justify-center border border-border/50 bg-bg-secondary text-text-secondary">
                  <FolderOpen className="w-4.5 h-4.5" strokeWidth={1.8} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Storage</span>
                  <span className="text-xs font-bold text-text-primary leading-snug">
                    {android && android.storage ? `${formatGB(android.storage.used)} / ${formatGB(android.storage.total)}` : 'N/A'}
                  </span>
                </div>
              </div>

            </div>

          </div>
        </Card>

        {/* QUICK ACTIONS SECTION */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            
            {/* Send Files */}
            <Card
              onClick={() => setActiveView('files')}
              className="bg-bg-surface/30 border-border/50 hover:border-border hover:bg-bg-hover/20 cursor-pointer transition-all duration-150 shadow-none"
            >
              <CardContent className="p-4 flex flex-col items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-primary/20 bg-primary/10 text-primary">
                  <FolderOpen className="w-4 h-4" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-text-primary leading-tight">Send Files</h3>
                  <p className="text-[10px] text-text-muted mt-0.5">Drag & drop files</p>
                </div>
              </CardContent>
            </Card>

            {/* Share Clipboard */}
            <Card
              onClick={() => setActiveView('clipboard')}
              className="bg-bg-surface/30 border-border/50 hover:border-border hover:bg-bg-hover/20 cursor-pointer transition-all duration-150 shadow-none"
            >
              <CardContent className="p-4 flex flex-col items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-accent-violet/20 bg-accent-violet/10 text-accent-violet">
                  <ClipboardCopy className="w-4 h-4" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-text-primary leading-tight">Share Clipboard</h3>
                  <p className="text-[10px] text-text-muted mt-0.5">Sync clipboard</p>
                </div>
              </CardContent>
            </Card>

            {/* Remote Input */}
            <Card
              onClick={() => setActiveView('mirror')}
              className="bg-bg-surface/30 border-border/50 hover:border-border hover:bg-bg-hover/20 cursor-pointer transition-all duration-150 shadow-none"
            >
              <CardContent className="p-4 flex flex-col items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-primary/20 bg-primary/10 text-primary">
                  <Smartphone className="w-4 h-4" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-text-primary leading-tight">Remote Input</h3>
                  <p className="text-[10px] text-text-muted mt-0.5">Control device</p>
                </div>
              </CardContent>
            </Card>

            {/* Screenshot */}
            <Card
              onClick={() => setActiveView('mirror')}
              className="bg-bg-surface/30 border-border/50 hover:border-border hover:bg-bg-hover/20 cursor-pointer transition-all duration-150 shadow-none"
            >
              <CardContent className="p-4 flex flex-col items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-primary/20 bg-primary/10 text-primary">
                  <Monitor className="w-4 h-4" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-text-primary leading-tight">Screenshot</h3>
                  <p className="text-[10px] text-text-muted mt-0.5">Capture screen</p>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>

        {/* RECENT ACTIVITIES SECTION */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Recent Activities</h2>
          <Card className="bg-bg-surface/30 border-border/50 shadow-none">
            <CardContent className="p-0 divide-y divide-border/40">
              {activities.length === 0 ? (
                <div className="p-4.5 text-center text-xs text-text-muted">
                  No activity history in this session
                </div>
              ) : (
                activities.map((act) => {
                  const Icon = act.icon;
                  return (
                    <div key={act.id} className="flex items-center justify-between p-4.5 transition-colors hover:bg-bg-hover/10 animate-fade-in">
                      <div className="flex items-center gap-3.5">
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border", act.iconClass)}>
                          <Icon className="w-4.5 h-4.5" strokeWidth={1.8} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-text-primary">{act.title}</span>
                          <span className="text-[11px] text-text-muted">{act.desc}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-text-muted">{act.time}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-success" />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* DEVICE BATTERY & STORAGE PANEL (2-COLUMN GRID) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Column 1: Device Battery */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Device Battery</h2>
            <Card className="bg-bg-surface/30 border-border/50 shadow-none">
              <CardContent className="p-5 space-y-4">
                
                {/* Android Battery */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-text-muted" strokeWidth={1.8} />
                      <span className="text-xs font-bold text-text-primary">{android ? android.name : 'Android Phone'}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-text-secondary">
                      {android && android.battery !== null
                        ? `${android.battery}% • ${android.charging ? 'Charging' : 'Discharging'}`
                        : 'Offline'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-bg-secondary rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        android ? 'bg-success' : 'bg-text-muted/20'
                      )}
                      style={{ width: `${android && android.battery !== null ? android.battery : 0}%` }}
                    />
                  </div>
                </div>

                {/* Linux Host Battery */}
                {linux && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Laptop className="w-4 h-4 text-text-muted" strokeWidth={1.8} />
                        <span className="text-xs font-bold text-text-primary">{linux.name} (Linux Host)</span>
                      </div>
                      <span className="text-[11px] font-semibold text-text-secondary">
                        {linux.battery !== null
                          ? `${linux.battery}% • ${linux.charging ? 'Charging' : 'Discharging'}`
                          : '100% • AC Power'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${linux.battery !== null ? linux.battery : 100}%` }}
                      />
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          </div>

          {/* Column 2: Storage Utilization */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Storage</h2>
            <Card className="bg-bg-surface/30 border-border/50 shadow-none">
              <CardContent className="p-5 space-y-4">
                
                {/* Android Storage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-primary">{android ? android.name : 'Android Phone'}</span>
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-text-secondary">
                      {android && android.storage ? (
                        <>
                          <span>{formatGB(android.storage.used)} / {formatGB(android.storage.total)}</span>
                          <ChevronRight className="w-3 h-3 text-text-muted" strokeWidth={1.8} />
                        </>
                      ) : (
                        <span className="text-text-muted">Offline</span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-bg-secondary rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        android ? 'bg-primary' : 'bg-text-muted/20'
                      )}
                      style={{
                        width: `${android && android.storage
                          ? calculatePercent(android.storage.used, android.storage.total)
                          : 0}%`
                      }}
                    />
                  </div>
                </div>

                {/* Linux Host Storage */}
                {linux && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text-primary">{linux.name} (Linux Host)</span>
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-text-secondary">
                        {linux.storage ? (
                          <>
                            <span>{formatGB(linux.storage.used)} / {formatGB(linux.storage.total)}</span>
                            <ChevronRight className="w-3 h-3 text-text-muted" strokeWidth={1.8} />
                          </>
                        ) : (
                          <span className="text-text-muted">N/A</span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{
                          width: `${linux.storage
                            ? calculatePercent(linux.storage.used, linux.storage.total)
                            : 0}%`
                        }}
                      />
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          </div>

        </div>

      </div>
    </div>
  );
}
