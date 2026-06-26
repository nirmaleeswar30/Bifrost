import { useState } from 'react';
import {
  Bell,
  BellOff,
  MessageSquare,
  Search,
  Filter,
  Reply,
  Smartphone,
  Mail,
  Phone,
  MessageCircle,
  Calendar,
} from 'lucide-react';
import { useDeviceStore } from '../stores/deviceStore';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  app: string;
  appIcon: typeof MessageSquare;
  title: string;
  body: string;
  timestamp: string;
  isMessaging: boolean;
  color: string;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    app: 'Messages',
    appIcon: MessageCircle,
    title: 'Sarah Chen',
    body: 'Hey! Are you coming to the meeting later today? I have some updates to share.',
    timestamp: '2 min ago',
    isMessaging: true,
    color: 'text-blue-500',
  },
  {
    id: '2',
    app: 'Gmail',
    appIcon: Mail,
    title: 'Project Update — Sprint Review',
    body: 'The sprint review is scheduled for tomorrow at 3 PM. Please prepare your demos.',
    timestamp: '15 min ago',
    isMessaging: false,
    color: 'text-red-500',
  },
  {
    id: '3',
    app: 'WhatsApp',
    appIcon: MessageSquare,
    title: 'Dev Team',
    body: 'Alex: The new build is ready for testing 🚀',
    timestamp: '32 min ago',
    isMessaging: true,
    color: 'text-green-500',
  },
  {
    id: '4',
    app: 'Phone',
    appIcon: Phone,
    title: 'Missed Call',
    body: 'Missed call from +1 (555) 123-4567',
    timestamp: '1 hr ago',
    isMessaging: false,
    color: 'text-emerald-500',
  },
  {
    id: '5',
    app: 'Calendar',
    appIcon: Calendar,
    title: 'Team Standup',
    body: 'Daily standup in 30 minutes — Conference Room B',
    timestamp: '1 hr ago',
    isMessaging: false,
    color: 'text-primary',
  },
];

export default function NotificationPanel() {
  const { connectionState } = useDeviceStore();
  const isConnected = connectionState === 'connected';
  const [autoSync, setAutoSync] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState(mockNotifications);

  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in bg-bg-primary select-none">
        <div className="w-16 h-16 rounded-lg bg-bg-surface border border-border flex items-center justify-center mb-4">
          <Bell className="w-8 h-8 text-text-muted/40" strokeWidth={1.5} />
        </div>
        <h2 className="text-sm font-semibold text-text-primary mb-1">Notifications</h2>
        <p className="text-xs text-text-muted text-center max-w-sm mb-5">
          Connect an Android device to sync and manage your phone notifications
        </p>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-surface border border-border text-text-muted text-xs">
          <Smartphone className="w-3.5 h-3.5" />
          <span>No device connected</span>
        </div>
      </div>
    );
  }

  const filteredNotifications = notifications.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.app.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Group by app
  const grouped = filteredNotifications.reduce<Record<string, Notification[]>>((acc, n) => {
    if (!acc[n.app]) acc[n.app] = [];
    acc[n.app].push(n);
    return acc;
  }, {});

  return (
    <div className="flex-1 overflow-y-auto p-6 animate-fade-in bg-bg-primary select-none">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Notifications</h1>
            <p className="text-xs text-text-secondary mt-1">
              {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''} from your phone
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

        {/* Search & Filter */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notifications…"
              className="w-full pl-9 h-8.5 bg-bg-surface border-border text-xs focus:ring-1 focus:ring-accent/40"
            />
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            className="h-8.5 bg-bg-surface border-border text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer shrink-0"
          >
            <Filter className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Notification Groups */}
        {Object.keys(grouped).length === 0 ? (
          <Card className="bg-bg-surface border-border shadow-xs">
            <CardContent className="flex flex-col items-center justify-center py-12 px-5 text-center">
              <div className="w-12 h-12 rounded-lg bg-bg-secondary/30 border border-border flex items-center justify-center mb-4 text-text-muted">
                <BellOff className="w-6 h-6 text-text-muted/50" strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                No notifications
              </h3>
              <p className="text-xs text-text-muted">
                {searchQuery ? 'No notifications match your search query' : 'All caught up! No notifications from your phone.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(grouped).map(([app, notifs]) => {
            const AppIcon = notifs[0].appIcon;
            const appColor = notifs[0].color;

            return (
              <div key={app} className="space-y-2 animate-slide-in">
                {/* App header */}
                <div className="flex items-center gap-2 px-1">
                  <AppIcon className={cn("w-3.5 h-3.5", appColor)} />
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                    {app}
                  </span>
                  <span className="text-[10px] text-text-muted">({notifs.length})</span>
                </div>

                {/* Notification cards */}
                <div className="space-y-2">
                  {notifs.map((notif) => (
                    <Card
                      key={notif.id}
                      className="bg-bg-surface border-border shadow-xs p-4 hover:bg-bg-hover/30 transition-colors duration-150 group"
                    >
                      <div className="flex items-start gap-3">
                        {/* App icon placeholder */}
                        <div className="w-8 h-8 rounded-lg bg-bg-secondary/40 border border-border flex items-center justify-center flex-shrink-0">
                          <notif.appIcon className={cn("w-4 h-4", notif.color)} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-xs font-bold text-text-primary truncate">
                              {notif.title}
                            </h4>
                            <span className="text-[10px] text-text-muted flex-shrink-0">
                              {notif.timestamp}
                            </span>
                          </div>
                          <p className="text-xs text-text-secondary mt-1 line-clamp-2 leading-relaxed">
                            {notif.body}
                          </p>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            {notif.isMessaging && (
                              <Button
                                size="xs"
                                variant="secondary"
                                className="h-6 gap-1 font-semibold text-[10px] cursor-pointer"
                              >
                                <Reply className="w-3 h-3" />
                                Reply
                              </Button>
                            )}
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => handleDismiss(notif.id)}
                              className="h-6 gap-1 font-semibold text-[10px] text-text-muted hover:text-destructive hover:bg-destructive/5 hover:border-destructive/20 cursor-pointer"
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
