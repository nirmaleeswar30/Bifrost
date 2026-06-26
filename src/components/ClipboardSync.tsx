import { useState, useEffect } from 'react';
import {
  ClipboardCopy,
  Copy,
  Check,
  Smartphone,
  Monitor,
  Clock,
  FileText,
  Link2,
  Image,
  Trash2,
} from 'lucide-react';
import { useDeviceStore } from '../stores/deviceStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ClipboardEntry {
  id: string;
  content: string;
  type: 'text' | 'link' | 'image';
  source: 'phone' | 'pc';
  timestamp: string;
  isCurrent?: boolean;
}

const typeIcons = {
  text: FileText,
  link: Link2,
  image: Image,
};

const typeColors = {
  text: 'text-text-secondary',
  link: 'text-primary',
  image: 'text-emerald-500',
};

export default function ClipboardSync() {
  const { connectionState } = useDeviceStore();
  const isConnected = connectionState === 'connected';
  const [autoSync, setAutoSync] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);

  useEffect(() => {
    if (!isConnected) return;

    // Fetch initial desktop clipboard
    invoke<string>('get_desktop_clipboard').then((content) => {
      if (content) {
        setEntries([
          {
            id: Date.now().toString(),
            content,
            type: (content.startsWith('http') ? 'link' : 'text') as 'link' | 'text',
            source: 'pc' as 'pc',
            timestamp: 'Just now',
            isCurrent: true,
          },
        ]);
      }
    }).catch(console.error);

    const unlisten = listen('clipboard_update', (event: any) => {
      const content = event.payload.content;
      if (!content) return;
      
      setEntries((prev) => {
        // Remove current flag from others
        const updated = prev.map(e => ({ ...e, isCurrent: false }));
        // Add new entry at top
        return [
          {
            id: Date.now().toString(),
            content,
            type: (content.startsWith('http') ? 'link' : 'text') as 'link' | 'text',
            source: 'phone' as 'phone',
            timestamp: 'Just now',
            isCurrent: true,
          },
          ...updated,
        ].slice(0, 50); // Keep last 50
      });
      
      if (autoSync) {
        invoke('set_desktop_clipboard', { content }).catch(console.error);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [isConnected, autoSync]);

  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in bg-bg-primary select-none">
        <div className="w-16 h-16 rounded-lg bg-bg-surface border border-border flex items-center justify-center mb-4">
          <ClipboardCopy className="w-8 h-8 text-text-muted/40" strokeWidth={1.5} />
        </div>
        <h2 className="text-sm font-semibold text-text-primary mb-1">Clipboard Sync</h2>
        <p className="text-xs text-text-muted text-center max-w-sm mb-5">
          Connect an Android device to sync clipboard content between devices
        </p>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-surface border border-border text-text-muted text-xs">
          <Smartphone className="w-3.5 h-3.5" />
          <span>No device connected</span>
        </div>
      </div>
    );
  }

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard?.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const currentEntry = entries.find((e) => e.isCurrent);

  return (
    <div className="flex-1 overflow-y-auto p-6 animate-fade-in bg-bg-primary select-none">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Clipboard</h1>
            <p className="text-xs text-text-secondary mt-1">
              Synced clipboard history across connected devices
            </p>
          </div>

          {/* Auto-sync toggle using Switch */}
          <div className="flex items-center gap-2.5 bg-bg-surface border border-border px-3 py-1.5 rounded-lg shadow-2xs">
            <span className={cn(
              "text-xs font-semibold select-none transition-colors duration-150", 
              autoSync ? "text-text-primary" : "text-text-muted"
            )}>
              Auto-sync
            </span>
            <Switch
              checked={autoSync}
              onCheckedChange={setAutoSync}
            />
          </div>
        </div>

        {/* Current Clipboard */}
        {currentEntry && (
          <Card className="bg-bg-surface border-border shadow-xs overflow-hidden">
            <CardHeader className="px-5 py-3 border-b border-border bg-bg-secondary/15 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
                <ClipboardCopy className="w-4 h-4" />
                Current Clipboard
              </div>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-bg-secondary text-[10px] text-text-muted border border-border font-medium">
                {currentEntry.source === 'phone' ? (
                  <Smartphone className="w-3 h-3" />
                ) : (
                  <Monitor className="w-3 h-3" />
                )}
                {currentEntry.source === 'phone' ? 'Phone' : 'PC'}
              </span>
            </CardHeader>
            <CardContent className="px-5 py-4">
              <p className="text-xs text-text-primary bg-bg-primary border border-border rounded-lg px-4 py-3 font-mono break-all leading-relaxed select-text">
                {currentEntry.content}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Clipboard History */}
        <div>
          <h2 className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            History
          </h2>

          {entries.length === 0 ? (
            <Card className="bg-bg-surface border-border shadow-xs">
              <CardContent className="flex flex-col items-center justify-center py-12 px-5 text-center">
                <div className="w-12 h-12 rounded-lg bg-bg-secondary/30 border border-border flex items-center justify-center mb-4 text-text-muted">
                  <ClipboardCopy className="w-6 h-6 text-text-muted/50" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">
                  Clipboard is empty
                </h3>
                <p className="text-xs text-text-muted">
                  Copy something on either device to see it synced here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => {
                const TypeIcon = typeIcons[entry.type];
                const typeColor = typeColors[entry.type];

                return (
                  <Card
                    key={entry.id}
                    className={cn(
                      "bg-bg-surface border-border shadow-xs p-4 hover:bg-bg-hover/40 transition-colors duration-150 group",
                      entry.isCurrent && "border-primary/45 bg-primary/2"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Timeline dot */}
                      <div className="flex flex-col items-center pt-1.5 shrink-0">
                        <div className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0",
                          entry.isCurrent ? 'bg-primary' : 'bg-text-muted/40'
                        )} />
                        <div className="w-px h-full bg-border mt-1.5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <TypeIcon className={cn("w-3.5 h-3.5", typeColor)} />
                          <span className="text-[10px] text-text-muted">{entry.timestamp}</span>
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-secondary text-[9px] text-text-muted border border-border font-medium">
                            {entry.source === 'phone' ? (
                              <Smartphone className="w-2.5 h-2.5" />
                            ) : (
                              <Monitor className="w-2.5 h-2.5" />
                            )}
                            {entry.source === 'phone' ? 'Phone' : 'PC'}
                          </span>
                        </div>

                        <p className="text-xs text-text-primary truncate select-text font-medium">
                          {entry.content}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleCopy(entry.id, entry.content)}
                          className="text-text-muted hover:text-primary cursor-pointer"
                          title="Copy"
                        >
                          {copiedId === entry.id ? (
                            <Check className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleDelete(entry.id)}
                          className="text-text-muted hover:text-destructive cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
