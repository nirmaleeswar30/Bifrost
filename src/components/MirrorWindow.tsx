import { useEffect, useRef, useState } from 'react';
import JMuxer from 'jmuxer';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';

export default function MirrorWindow() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const jmuxerRef = useRef<any>(null);

  const [isConnecting, setIsConnecting] = useState(true);

  useEffect(() => {
    if (!videoRef.current) return;

    jmuxerRef.current = new JMuxer({
      node: videoRef.current,
      mode: 'video',
      flushingTime: 10,
      fps: 60,
      debug: false,
    });

    const ws = new WebSocket('ws://127.0.0.1:14211');
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('Connected to H.264 stream');
    };

    ws.onmessage = (event) => {
      if (isConnecting) {
        setIsConnecting(false);
      }
      if (jmuxerRef.current && event.data) {
        jmuxerRef.current.feed({
          video: new Uint8Array(event.data)
        });
      }
    };

    let unlisten: () => void;
    getCurrentWindow().onCloseRequested(async (event) => {
      // Prevent default close (destroy)
      event.preventDefault();
      try {
        await invoke('stop_mirroring').catch(console.error);
        await emit('mirroring-stopped');
        await getCurrentWindow().hide();
      } catch (err) {
        console.error('Failed to handle close:', err);
      }
    }).then(f => unlisten = f);

    return () => {
      if (unlisten) unlisten();
      ws.close();
      if (jmuxerRef.current) {
        jmuxerRef.current.destroy();
      }
    };
  }, []);

  const closeWindow = async () => {
    try {
      await invoke('stop_mirroring').catch(console.error);
      await emit('mirroring-stopped');
      const win = getCurrentWindow();
      await win.hide();
    } catch (err) {
      console.error("Failed to hide window:", err);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black group select-none" data-tauri-drag-region>
      {isConnecting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 pointer-events-none">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="font-semibold text-xs text-white/90">Connecting to device stream...</p>
        </div>
      )}
      <video
        ref={videoRef}
        id="player"
        autoPlay
        muted
        playsInline
        className="w-full h-full object-contain bg-black pointer-events-none"
      />
      
      {/* Control Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex justify-end items-start pointer-events-none" data-tauri-drag-region>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={closeWindow}
          className="bg-black/60 hover:bg-black/85 hover:text-white text-white rounded-full transition-colors pointer-events-auto cursor-pointer border border-white/5"
          title="Close Mirror"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
