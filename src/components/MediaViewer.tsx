import { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';

interface MediaViewerProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
}

function getMediaType(name: string): 'image' | 'video' | 'unknown' {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return 'video';
  return 'unknown';
}

export default function MediaViewer({ filePath, fileName, onClose }: MediaViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mediaType = getMediaType(fileName);
  const assetUrl = convertFileSrc(filePath);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.25, 5));
      if (e.key === '-') setZoom(z => Math.max(z - 0.25, 0.25));
      if (e.key === 'r') setRotation(r => r + 90);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close when clicking the backdrop
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  // Handle scroll to zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom(z => Math.min(z + 0.1, 5));
    } else {
      setZoom(z => Math.max(z - 0.1, 0.25));
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center select-none"
      onClick={handleBackdropClick}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.94)' }}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-3 z-10 bg-black/60 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-white/90 text-xs font-semibold truncate max-w-[400px]">
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {mediaType === 'image' && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
                className="text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
                title="Zoom Out (−)"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-white/50 text-[10px] font-mono min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setZoom(z => Math.min(z + 0.25, 5))}
                className="text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setRotation(r => r + 90)}
                className="text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
                title="Rotate (R)"
              >
                <RotateCw className="w-4 h-4" />
              </Button>
              <div className="w-px h-5 bg-white/20 mx-1" />
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Media content */}
      <div className="flex items-center justify-center w-full h-full overflow-hidden" onWheel={handleWheel}>
        {mediaType === 'image' && (
          <img
            src={assetUrl}
            alt={fileName}
            draggable={false}
            className="max-w-[90vw] max-h-[85vh] object-contain select-none transition-transform duration-150 ease-out"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
          />
        )}
        {mediaType === 'video' && (
          <video
            src={assetUrl}
            controls
            autoPlay
            className="max-w-[90vw] max-h-[85vh] min-w-[300px] min-h-[200px] rounded-lg border border-white/10"
            style={{ outline: 'none' }}
          />
        )}
        {mediaType === 'unknown' && (
          <div className="text-white/60 text-center">
            <p className="text-sm font-semibold mb-1">Cannot preview this file type</p>
            <p className="text-xs text-white/40">{fileName}</p>
          </div>
        )}
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-2.5 bg-black/60 border-t border-white/10">
        <span className="text-white/40 text-[10px]">
          {mediaType === 'image' ? 'Scroll to zoom · R to rotate · Esc to close' : 'Esc to close'}
        </span>
      </div>
    </div>
  );
}
