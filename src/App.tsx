import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Overview from './components/Overview';
import DevicePanel from './components/DevicePanel';
import MirrorView from './components/MirrorView';
import FileManager from './components/FileManager';
import NotificationPanel from './components/NotificationPanel';
import ClipboardSync from './components/ClipboardSync';
import Settings from './components/Settings';
import MirrorWindow from './components/MirrorWindow';
import { useDeviceStore } from './stores/deviceStore';
import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { HashRouter, Routes, Route } from 'react-router-dom';

const viewComponents = {
  overview: Overview,
  devices: DevicePanel,
  mirror: MirrorView,
  files: FileManager,
  notifications: NotificationPanel,
  clipboard: ClipboardSync,
  settings: Settings,
} as const;

function Dashboard() {
  const activeView = useDeviceStore((s) => s.activeView);
  const ActivePanel = viewComponents[activeView];
  const setConnectedDevice = useDeviceStore((s) => s.setConnectedDevice);
  const setConnectionState = useDeviceStore((s) => s.setConnectionState);

  useEffect(() => {
    invoke('start_services').catch(console.error);

    const unlistenConnected = listen('device-connected', (event: any) => {
      console.log("[Bifrost React] Received device-connected event:", event);
      setConnectionState('connected');
      
      const store = useDeviceStore.getState();
      const currentId = store.connectedDevice?.id;
      
      setConnectedDevice({
        id: currentId || event.payload?.device_id || 'unknown',
        name: store.connectedDevice?.name || event.payload?.name || 'Android Device',
        model: store.connectedDevice?.model || event.payload?.model || 'Paired Device',
        connectionType: store.connectedDevice?.connectionType || 'usb',
        isConnected: true,
      });
    });

    const unlistenDisconnected = listen('device-disconnected', () => {
      setConnectionState('disconnected');
      setConnectedDevice(null);
    });

    return () => {
      unlistenConnected.then(fn => fn());
      unlistenDisconnected.then(fn => fn());
    };
  }, [setConnectedDevice, setConnectionState]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary font-sans">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <TopBar />

        {/* Active View */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <ActivePanel />
        </main>
      </div>
    </div>
  );
}

function App() {
  const theme = useDeviceStore((s) => s.theme);
  const accentColor = useDeviceStore((s) => s.accentColor);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute('data-accent', accentColor);
  }, [accentColor]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/mirror-window" element={<MirrorWindow />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
