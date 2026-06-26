import { useState, useEffect } from 'react';
import {
  Monitor,
  Camera,
  Maximize2,
  Activity,
  Play,
  Pause,
  RotateCcw,
  Smartphone,
  Signal,
} from 'lucide-react';
import { useDeviceStore } from '../stores/deviceStore';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export default function MirrorView() {
  const { connectionState, connectedDevice } = useDeviceStore();
  const isConnected = connectionState === 'connected';
  const [isMirroring, setIsMirroring] = useState(false);
  const [resolution, setResolution] = useState('1080p');

  const resolutions = ['720p', '1080p', '1440p', '4K'];

  useEffect(() => {
    let unlisten: () => void;
    listen('mirroring-stopped', () => {
      setIsMirroring(false);
      invoke('stop_mirroring').catch(console.error);
    }).then(f => unlisten = f);
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in bg-bg-primary select-none">
        <div className="w-16 h-16 rounded-lg bg-bg-surface border border-border flex items-center justify-center mb-4">
          <Monitor className="w-8 h-8 text-text-muted/40" strokeWidth={1.5} />
        </div>
        <h2 className="text-sm font-semibold text-text-primary mb-1">Screen Mirroring</h2>
        <p className="text-xs text-text-muted text-center max-w-sm mb-5">
          Connect an Android device to start mirroring its screen on your desktop
        </p>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-surface border border-border text-text-muted text-xs">
          <Smartphone className="w-3.5 h-3.5" />
          <span>No device connected</span>
        </div>
      </div>
    );
  }

  const handleToggleMirror = async () => {
    if (!isMirroring && connectedDevice) {
      try {
        let win = await WebviewWindow.getByLabel('mirror');
        if (!win) {
          win = new WebviewWindow('mirror', { url: '/#/mirror-window', title: 'Bifrost Mirror', width: 400, height: 800, decorations: false, alwaysOnTop: true });
        }
        await win.show();
        await win.setFocus();
        setIsMirroring(true);
        
        // Give the window 1.5s to mount and connect its WebSocket
        setTimeout(async () => {
          try {
            await invoke('start_mirroring', { deviceId: connectedDevice.id });
          } catch (e) {
            console.error("Failed to start mirroring:", e);
          }
        }, 1500);
      } catch (e) {
        console.error("Failed to start mirroring:", e);
      }
    } else {
      await invoke('stop_mirroring').catch(console.error);
      setIsMirroring(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in relative bg-bg-primary select-none">
      {/* Mirror Display Area */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto min-h-0">
        <div className="relative shrink-0">
          {/* Phone frame */}
          <div className="relative w-[280px] h-[580px] rounded-[1.5rem] bg-bg-surface border border-border overflow-hidden shadow-xs">
            {/* Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-bg-primary border-b border-l border-r border-border rounded-b-xl z-10" />

            {/* Screen content area */}
            <div className="w-full h-full rounded-[1.3rem] overflow-hidden bg-bg-primary/20 flex items-center justify-center">
              {isMirroring ? (
                <div className="w-full h-full bg-bg-surface flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-10 h-10 mx-auto mb-4.5 rounded-lg bg-primary/5 border border-primary/20 flex items-center justify-center">
                      <Activity className="w-5 h-5 text-primary animate-pulse" />
                    </div>
                    <p className="text-xs font-bold text-text-primary">Live Mirror Active</p>
                    <p className="text-[10px] text-text-muted mt-1">{resolution} • 60 FPS</p>
                  </div>
                </div>
              ) : (
                <div className="text-center p-6">
                  <Monitor className="w-8 h-8 text-text-muted/30 mx-auto mb-3" strokeWidth={1.5} />
                  <p className="text-xs text-text-muted font-medium">Ready to mirror</p>
                </div>
              )}
            </div>

            {/* Bottom bar (gesture area) */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-1 bg-text-muted/15 rounded-full" />
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-bg-surface border-t border-border px-6 py-3.5 shrink-0">
        <div className="flex items-center justify-between max-w-3xl mx-auto gap-4">
          {/* Left: Main controls */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={isMirroring ? "destructive" : "default"}
              onClick={handleToggleMirror}
              className="font-semibold cursor-pointer"
            >
              {isMirroring ? (
                <>
                  <Pause className="w-4 h-4" />
                  Stop Mirror
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Mirror
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="icon-sm"
              className="bg-bg-surface border-border text-text-secondary hover:text-text-primary cursor-pointer"
              title="Screenshot"
            >
              <Camera className="w-4 h-4" />
            </Button>

            <Button
              variant="outline"
              size="icon-sm"
              className="bg-bg-surface border-border text-text-secondary hover:text-text-primary cursor-pointer"
              title="Rotate"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>

            <Button
              variant="outline"
              size="icon-sm"
              className="bg-bg-surface border-border text-text-secondary hover:text-text-primary cursor-pointer"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Center: Resolution & FPS */}
          <div className="flex items-center gap-3">
            {/* Resolution dropdown using shadcn Select */}
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger className="h-7 text-xs bg-bg-surface border-border text-text-secondary focus:ring-1 focus:ring-accent/40 w-[96px] cursor-pointer">
                <SelectValue placeholder="Resolution" />
              </SelectTrigger>
              <SelectContent className="bg-bg-surface border-border text-text-primary">
                {resolutions.map((res) => (
                  <SelectItem
                    key={res}
                    value={res}
                    className="hover:bg-bg-hover focus:bg-bg-hover focus:text-text-primary hover:text-text-primary cursor-pointer text-xs"
                  >
                    {res}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* FPS indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-primary border border-border h-7">
              <div className={cn("w-1.5 h-1.5 rounded-full", isMirroring ? 'bg-success' : 'bg-text-muted/60')} />
              <span className="text-[10px] font-mono text-text-secondary leading-none">
                {isMirroring ? '60' : '--'} FPS
              </span>
            </div>
          </div>

          {/* Right: Latency */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-primary border border-border h-7">
            <Signal className={cn("w-3.5 h-3.5", isMirroring ? 'text-success' : 'text-text-muted')} />
            <span className="text-[10px] font-mono text-text-secondary leading-none">
              {isMirroring ? '12ms' : '--'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
