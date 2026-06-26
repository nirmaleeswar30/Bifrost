import { useState, useEffect } from 'react';
import {
  Monitor,
  Camera,
  Maximize2,
  ChevronDown,
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

export default function MirrorView() {
  const { connectionState, connectedDevice } = useDeviceStore();
  const isConnected = connectionState === 'connected';
  const [isMirroring, setIsMirroring] = useState(false);
  const [resolution, setResolution] = useState('1080p');
  const [showResDropdown, setShowResDropdown] = useState(false);

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
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="w-32 h-32 rounded-3xl bg-bg-surface/60 border border-border flex items-center justify-center mb-6">
          <Monitor className="w-14 h-14 text-text-muted/30" strokeWidth={1} />
        </div>
        <h2 className="text-xl font-semibold text-text-primary mb-2">Screen Mirroring</h2>
        <p className="text-sm text-text-muted text-center max-w-sm mb-6">
          Connect an Android device to start mirroring its screen on your desktop
        </p>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-bg-surface/40 border border-border text-text-muted">
          <Smartphone className="w-4 h-4" />
          <span className="text-sm">No device connected</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in relative">
      {/* Mirror Display Area */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto min-h-0">
        <div className="relative shrink-0">
          {/* Phone frame */}
          <div className="relative w-[300px] h-[620px] rounded-[2.5rem] bg-bg-primary border-2 border-border overflow-hidden shadow-2xl shadow-black/40">
            {/* Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-bg-primary rounded-b-2xl z-10" />

            {/* Screen content area */}
            <div className="w-full h-full rounded-[2.3rem] overflow-hidden bg-bg-surface/30 flex items-center justify-center">
              {isMirroring ? (
                <div className="w-full h-full bg-gradient-to-br from-bg-surface via-bg-primary to-bg-secondary flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
                      <Activity className="w-7 h-7 text-accent-light animate-pulse" />
                    </div>
                    <p className="text-sm text-text-secondary font-medium">Live Mirror Active</p>
                    <p className="text-xs text-text-muted mt-1">{resolution} • 60 FPS</p>
                  </div>
                </div>
              ) : (
                <div className="text-center p-6">
                  <Monitor className="w-12 h-12 text-text-muted/20 mx-auto mb-3" strokeWidth={1} />
                  <p className="text-sm text-text-muted">Ready to mirror</p>
                </div>
              )}
            </div>

            {/* Bottom bar (gesture area) */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-28 h-1 bg-text-muted/30 rounded-full" />
          </div>

          {/* Glow effect when mirroring */}
          {isMirroring && (
            <div className="absolute inset-0 rounded-[2.5rem] shadow-[0_0_60px_rgba(99,102,241,0.15)] pointer-events-none" />
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="glass border-t border-border px-6 py-3 shrink-0">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          {/* Left: Main controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
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
              }}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-300 cursor-pointer ${
                isMirroring
                  ? 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25'
                  : 'bg-gradient-to-r from-accent to-accent-violet text-white shadow-lg shadow-accent-glow/30 hover:shadow-accent-glow/50 hover:scale-[1.02] active:scale-[0.98]'
              }`}
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
            </button>

            <button className="p-2 rounded-lg bg-bg-surface/60 border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-200 cursor-pointer" title="Screenshot">
              <Camera className="w-4 h-4" />
            </button>

            <button className="p-2 rounded-lg bg-bg-surface/60 border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-200 cursor-pointer" title="Rotate">
              <RotateCcw className="w-4 h-4" />
            </button>

            <button className="p-2 rounded-lg bg-bg-surface/60 border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-200 cursor-pointer" title="Fullscreen">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Center: Resolution & FPS */}
          <div className="flex items-center gap-4">
            {/* Resolution dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowResDropdown(!showResDropdown)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface/60 border border-border text-xs font-medium text-text-secondary hover:text-text-primary transition-colors duration-200 cursor-pointer"
              >
                {resolution}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showResDropdown && (
                <div className="absolute bottom-full left-0 mb-2 py-1 rounded-lg bg-bg-surface border border-border shadow-xl shadow-black/30 animate-fade-in z-20">
                  {resolutions.map((res) => (
                    <button
                      key={res}
                      onClick={() => {
                        setResolution(res);
                        setShowResDropdown(false);
                      }}
                      className={`block w-full px-4 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                        res === resolution
                          ? 'text-accent-light bg-accent/10'
                          : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* FPS indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface/60 border border-border">
              <div className={`w-1.5 h-1.5 rounded-full ${isMirroring ? 'bg-success' : 'bg-text-muted'}`} />
              <span className="text-xs font-mono text-text-secondary">
                {isMirroring ? '60' : '--'} FPS
              </span>
            </div>
          </div>

          {/* Right: Latency */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-surface/60 border border-border">
            <Signal className={`w-3.5 h-3.5 ${isMirroring ? 'text-success' : 'text-text-muted'}`} />
            <span className="text-xs font-mono text-text-secondary">
              {isMirroring ? '12ms' : '--'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
