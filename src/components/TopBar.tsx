import {
  Wifi,
  Usb,
  Battery,
  BatteryCharging,
  Search,
  Signal,
} from 'lucide-react';
import { useDeviceStore } from '../stores/deviceStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const connectionStateLabels: Record<string, { label: string; color: string; dotColor: string }> = {
  disconnected: { label: 'Disconnected', color: 'text-text-muted', dotColor: 'bg-text-muted/60' },
  discovering: { label: 'Discovering…', color: 'text-warning', dotColor: 'bg-warning' },
  pairing: { label: 'Pairing…', color: 'text-accent-light', dotColor: 'bg-accent' },
  connecting: { label: 'Connecting…', color: 'text-accent-light', dotColor: 'bg-accent' },
  connected: { label: 'Connected', color: 'text-success', dotColor: 'bg-success' },
  reconnecting: { label: 'Reconnecting…', color: 'text-warning', dotColor: 'bg-warning' },
};

export default function TopBar() {
  const { connectedDevice, connectionState, activeView } = useDeviceStore();
  const stateInfo = connectionStateLabels[connectionState];

  return (
    <header className="flex items-center justify-between h-14 px-5 bg-bg-secondary border-b border-border select-none shrink-0">
      {/* Left: Device info */}
      <div className="flex items-center gap-4">
        {activeView !== 'overview' && (
          <>
            {/* Connection state badge */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-bg-surface border border-border">
              <span className={cn(
                "w-2 h-2 rounded-full",
                stateInfo.dotColor,
                connectionState !== 'disconnected' && connectionState !== 'connected' ? 'animate-pulse' : ''
              )} />
              <span className={cn("text-xs font-semibold", stateInfo.color)}>
                {stateInfo.label}
              </span>
            </div>

            {/* Device info */}
            {connectedDevice && (
              <div className="flex items-center gap-3 animate-fade-in">
                <div className="w-px h-5 bg-border" />

                {/* Connection type icon */}
                <div className="flex items-center gap-1.5 text-text-secondary">
                  {connectedDevice.connectionType === 'wifi' ? (
                    <Wifi className="w-3.5 h-3.5" />
                  ) : (
                    <Usb className="w-3.5 h-3.5" />
                  )}
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    {connectedDevice.connectionType}
                  </span>
                </div>

                <div className="w-px h-5 bg-border" />

                {/* Device name & model */}
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-text-primary leading-tight">
                    {connectedDevice.name}
                  </span>
                  <span className="text-[10px] text-text-muted leading-tight mt-0.5">
                    {connectedDevice.model}
                  </span>
                </div>

                {/* Battery */}
                {connectedDevice.batteryLevel !== undefined && (
                  <>
                    <div className="w-px h-5 bg-border" />
                    <div className="flex items-center gap-1.5">
                      {connectedDevice.batteryLevel > 20 ? (
                        <Battery className={cn(
                          "w-3.5 h-3.5",
                          connectedDevice.batteryLevel > 60 ? 'text-success' :
                          connectedDevice.batteryLevel > 20 ? 'text-warning' : 'text-danger'
                        )} />
                      ) : (
                        <BatteryCharging className="w-3.5 h-3.5 text-danger" />
                      )}
                      <span className="text-[11px] font-medium text-text-secondary">
                        {connectedDevice.batteryLevel}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Search button using shadcn */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 bg-bg-surface text-text-muted hover:text-text-secondary border-border cursor-pointer"
        >
          <Search className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-xs">Search</span>
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono bg-bg-secondary rounded border border-border text-text-muted/80">
            ⌘K
          </kbd>
        </Button>

        {/* Signal quality */}
        {connectionState === 'connected' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-success-muted border border-success/30">
            <Signal className="w-3.5 h-3.5 text-success" />
            <span className="text-[10px] font-bold text-success uppercase tracking-wider">Good</span>
          </div>
        )}
      </div>
    </header>
  );
}
