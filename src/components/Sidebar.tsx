import {
  Smartphone,
  Monitor,
  FolderOpen,
  Bell,
  ClipboardCopy,
  Settings,
  Zap,
  LayoutDashboard,
} from 'lucide-react';
import { useDeviceStore, type ActiveView } from '../stores/deviceStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Sidebar() {
  const { activeView, setActiveView, connectionState } = useDeviceStore();

  const isConnected = connectionState === 'connected';

  const renderNavItem = (id: ActiveView, Icon: typeof Smartphone, label: string) => {
    const isActive = activeView === id;
    return (
      <Button
        key={id}
        variant={isActive ? "secondary" : "ghost"}
        onClick={() => setActiveView(id)}
        className={cn(
          "w-full h-8.5 justify-start gap-2.5 px-2.5 rounded-lg cursor-pointer transition-all duration-150 text-[11px] font-semibold tracking-wide",
          isActive
            ? "bg-bg-hover text-text-primary shadow-2xs"
            : "text-text-secondary hover:bg-bg-hover/60 hover:text-text-primary"
        )}
      >
        <Icon
          className={cn(
            "w-4 h-4 transition-colors",
            isActive ? "text-text-primary" : "text-text-muted"
          )}
          strokeWidth={1.8}
        />
        <span>{label}</span>
      </Button>
    );
  };

  return (
    <aside className="flex flex-col w-56 h-screen bg-bg-secondary border-r border-border py-4 relative z-10 select-none shrink-0">
      {/* Logo Header */}
      <div className="flex items-center gap-2 px-4.5 mb-6">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-bg-surface border border-border text-text-primary shadow-2xs">
          <Zap className="w-4 h-4 text-primary" strokeWidth={2.2} />
        </div>
        <span className="text-xs font-bold text-text-primary tracking-tight">Bifrost</span>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 flex flex-col gap-4.5 px-3">
        {/* Section: General */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider px-2.5 mb-1.5">
            General
          </span>
          {renderNavItem('overview', LayoutDashboard, 'Overview')}
        </div>

        {/* Section: Connections */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider px-2.5 mb-1.5">
            Connections
          </span>
          {renderNavItem('devices', Smartphone, 'Devices')}
          {renderNavItem('mirror', Monitor, 'Screen Mirror')}
        </div>

        {/* Section: Tools */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider px-2.5 mb-1.5">
            Tools
          </span>
          {renderNavItem('files', FolderOpen, 'File Explorer')}
          {renderNavItem('notifications', Bell, 'Notifications')}
          {renderNavItem('clipboard', ClipboardCopy, 'Clipboard Sync')}
        </div>

        {/* Section: System */}
        <div className="flex flex-col gap-0.5 mt-auto">
          <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider px-2.5 mb-1.5">
            System
          </span>
          {renderNavItem('settings', Settings, 'Settings')}
        </div>
      </div>

      {/* Footer Connection status */}
      <div className="px-3 pt-3 border-t border-border mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 px-2.5 py-0.5">
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors duration-300",
              isConnected
                ? 'bg-success'
                : connectionState === 'disconnected'
                  ? 'bg-text-muted/50'
                  : 'bg-warning animate-pulse'
            )}
          />
          <span className="text-[10px] text-text-secondary font-semibold">
            {isConnected ? 'Online' : connectionState === 'discovering' ? 'Scanning...' : 'Offline'}
          </span>
        </div>
        <span className="text-[9px] text-text-muted/80 font-medium px-2.5">
          v0.1.0
        </span>
      </div>
    </aside>
  );
}
