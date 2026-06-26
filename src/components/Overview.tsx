import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Smartphone,
  Monitor,
  FolderOpen,
  ClipboardCopy,
  Battery,
  Wifi,
  ChevronRight,
  RotateCw,
  Cpu,
  CheckCircle,
  AlertCircle,
  Laptop
} from 'lucide-react';
import { useDeviceStore } from '../stores/deviceStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
    setActiveView
  } = useDeviceStore();

  const isConnected = connectionState === 'connected';
  const [overview, setOverview] = useState<DashboardOverviewData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);

  // Query Linux and Android metrics from backend
  const loadDashboardData = async () => {
    setIsRefreshing(true);
    try {
      const data = await invoke<DashboardOverviewData>('get_dashboard_overview');
      setOverview(data);
    } catch (e) {
      console.error("Failed to load dashboard overview:", e);
    } finally {
      setIsRefreshing(false);
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

  const android = overview?.android;
  const linux = overview?.linux;

  // Custom vector phone background styles
  const phoneWallpaperStyle = android?.wallpaper
    ? { backgroundImage: `url(${android.wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'linear-gradient(to bottom right, #4f46e5, #7c3aed, #ec4899)' };

  // Custom vector laptop screen background styles
  const linuxWallpaperStyle = linux?.wallpaper
    ? { backgroundImage: `url(${linux.wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'linear-gradient(to bottom right, #1e1b4b, #311042, #1e293b)' };

  return (
    <div className="flex-1 overflow-y-auto bg-bg-primary select-none p-6 animate-fade-in">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* METRICS SUMMARY CARD */}
        <Card className="bg-bg-surface/30 border-border/50 shadow-none overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/50">
              
              {/* Col 1: Connection Status */}
              <div className="flex items-center gap-3.5 p-4.5">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center border",
                  getStatusIconColor()
                )}>
                  {isConnected ? (
                    <CheckCircle className="w-4.5 h-4.5" strokeWidth={2} />
                  ) : (
                    <AlertCircle className="w-4.5 h-4.5" strokeWidth={2} />
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Connection Status</span>
                  <span className="text-xs font-bold text-text-primary leading-snug">{getStatusText()}</span>
                </div>
              </div>

              {/* Col 2: Active Connection Count */}
              <div className="flex items-center gap-3.5 p-4.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-border/50 bg-bg-secondary text-text-secondary">
                  <Smartphone className="w-4.5 h-4.5" strokeWidth={1.8} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Active Link</span>
                  <span className="text-xs font-bold text-text-primary leading-snug">
                    {isConnected ? '1 Connected' : '0 Connected'}
                  </span>
                </div>
              </div>

              {/* Col 3: Battery Level (Primary Device) */}
              <div className="flex items-center gap-3.5 p-4.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-success/20 bg-success-muted text-success">
                  <Battery className="w-4.5 h-4.5" strokeWidth={1.8} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                    {android ? `Battery (${android.name})` : 'Android Battery'}
                  </span>
                  <span className="text-xs font-bold text-text-primary leading-snug">
                    {android && android.battery !== null ? `${android.battery}%` : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Col 4: Connection Type */}
              <div className="flex items-center gap-3.5 p-4.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-border/50 bg-bg-secondary text-text-secondary">
                  {connectedDevice?.connectionType === 'usb' ? (
                    <Cpu className="w-4.5 h-4.5" strokeWidth={1.8} />
                  ) : (
                    <Wifi className="w-4.5 h-4.5" strokeWidth={1.8} />
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Connection</span>
                  <span className="text-xs font-bold text-text-primary leading-snug">
                    {isConnected ? (connectedDevice?.connectionType === 'usb' ? 'USB Link' : 'Wi-Fi Link') : 'None'}
                  </span>
                </div>
              </div>

            </div>
          </CardContent>
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

        {/* DEVICE PREVIEW SECTION (GRID) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Device Preview</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md cursor-pointer"
              onClick={loadDashboardData}
              disabled={isRefreshing}
            >
              <RotateCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            
            {/* Card 1: Connected Android Device */}
            <Card className="bg-bg-surface/30 border-border/50 shadow-none p-5 flex items-center justify-between">
              <div className="flex items-center gap-5">
                
                {/* Custom Vector Phone Illustration with Current Wallpaper */}
                <div className="relative w-18 h-32 rounded-[18px] border-3 border-neutral-700 bg-neutral-950 p-1 shadow-inner shrink-0 overflow-hidden flex items-center justify-center">
                  <div className="absolute top-1.5 w-7 h-0.7 bg-neutral-800 rounded-full z-10" />
                  <div className="absolute top-3 w-1.5 h-1.5 bg-neutral-900 rounded-full z-10 border border-neutral-800" />
                  
                  {/* Screen Wallpaper */}
                  <div
                    className="w-full h-full rounded-[13px] overflow-hidden flex flex-col justify-between p-2.5 relative select-none"
                    style={phoneWallpaperStyle}
                  >
                    {/* Shadow overlay if wallpaper exists */}
                    {android?.wallpaper && <div className="absolute inset-0 bg-black/15 pointer-events-none z-0" />}

                    {/* Tiny Status indicators */}
                    <div className="flex justify-between items-center text-[5px] font-bold text-white/70 tracking-wider z-10">
                      <span>9:41</span>
                      <div className="flex gap-0.5">
                        <Wifi className="w-1.5 h-1.5" />
                        <Battery className="w-1.5 h-1.5" />
                      </div>
                    </div>
                    
                    {/* Centered logo icon */}
                    <div className="w-full flex-1 flex items-center justify-center z-10">
                      <div className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-2xs shadow-inner">
                        <Smartphone className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
                      </div>
                    </div>
                    
                    {/* Small name */}
                    <div className="text-[5px] font-bold text-center text-white/70 tracking-wider uppercase z-10">
                      Bifrost
                    </div>
                  </div>
                </div>

                {/* Info Stack */}
                <div className="flex flex-col gap-1.5">
                  <div>
                    <h3 className="text-sm font-bold text-text-primary leading-tight">
                      {android ? android.name : 'Android Phone'}
                    </h3>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {android ? android.model : 'Disconnected'}
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    {/* Connection Status Badge */}
                    <div className="flex items-center gap-1.5">
                      <span className={cn("w-1.5 h-1.5 rounded-full", android ? "bg-success" : "bg-text-muted/40")} />
                      <span className="text-[10px] text-text-secondary font-semibold">
                        {android ? 'Connected' : 'Offline'}
                      </span>
                    </div>

                    {/* Battery Level */}
                    <div className="flex items-center gap-1.5 text-text-muted">
                      <Battery className={cn("w-3 h-3", android ? "text-success" : "text-text-muted")} />
                      <span className="text-[10px] font-medium">
                        {android && android.battery !== null ? `${android.battery}%` : 'N/A'} Battery
                      </span>
                    </div>

                    {/* Wifi Connection */}
                    <div className="flex items-center gap-1.5 text-text-muted">
                      <Wifi className="w-3 h-3" />
                      <span className="text-[10px] font-medium">
                        {android ? (connectedDevice?.connectionType === 'usb' ? 'USB Connection' : 'Wi-Fi Connection') : 'No connection'}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              <div>
                <Button
                  onClick={() => setActiveView('devices')}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold border-border bg-bg-surface hover:bg-bg-hover text-text-secondary hover:text-text-primary cursor-pointer shadow-none"
                >
                  {android ? 'Manage' : 'Connect'}
                </Button>
              </div>
            </Card>

            {/* Card 2: Local Linux Host */}
            {linux && (
              <Card className="bg-bg-surface/30 border-border/50 shadow-none p-5 flex items-center justify-between">
                <div className="flex items-center gap-5">
                  
                  {/* Custom Vector Laptop Illustration with Desktop Wallpaper */}
                  <div className="flex flex-col items-center shrink-0 py-2 select-none pointer-events-none">
                    {/* Screen */}
                    <div className="w-24 h-16 rounded-lg border-2 border-neutral-700 bg-neutral-950 p-1 flex items-center justify-center relative shadow-inner">
                      <div
                        className="w-full h-full rounded overflow-hidden flex items-center justify-center relative"
                        style={linuxWallpaperStyle}
                      >
                        {linux.wallpaper && <div className="absolute inset-0 bg-black/15 z-0" />}
                        <Laptop className="w-4 h-4 text-white z-10" strokeWidth={1.5} />
                      </div>
                    </div>
                    {/* Keyboard deck base */}
                    <div className="w-28 h-1.5 bg-neutral-600 rounded-b-md relative flex items-center justify-center">
                      <div className="absolute top-0 w-8 h-0.5 bg-neutral-800 rounded-b" />
                    </div>
                    {/* Feet */}
                    <div className="w-20 h-0.7 bg-neutral-800 rounded-b-lg opacity-80" />
                  </div>

                  {/* Info Stack */}
                  <div className="flex flex-col gap-1.5">
                    <div>
                      <h3 className="text-sm font-bold text-text-primary leading-tight">{linux.name}</h3>
                      <p className="text-[11px] text-text-muted mt-0.5">{linux.model}</p>
                    </div>
                    
                    <div className="space-y-1">
                      {/* Connection Badge (Local PC is always connected) */}
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        <span className="text-[10px] text-text-secondary font-semibold">Online</span>
                      </div>

                      {/* Battery Level */}
                      <div className="flex items-center gap-1.5 text-text-muted">
                        <Battery className="w-3 h-3 text-primary" />
                        <span className="text-[10px] font-medium">
                          {linux.battery !== null ? `${linux.battery}%` : 'AC Power'}
                        </span>
                      </div>

                      {/* Connection Protocol type */}
                      <div className="flex items-center gap-1.5 text-text-muted">
                        <Wifi className="w-3 h-3" />
                        <span className="text-[10px] font-medium">Local Host</span>
                      </div>
                    </div>
                  </div>

                </div>

                <div>
                  <Button
                    onClick={() => setActiveView('settings')}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold border-border bg-bg-surface hover:bg-bg-hover text-text-secondary hover:text-text-primary cursor-pointer shadow-none"
                  >
                    Settings
                  </Button>
                </div>
              </Card>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
