import { create } from 'zustand';

export interface Device {
  id: string;
  name: string;
  model: string;
  connectionType: 'wifi' | 'usb';
  ipAddress?: string;
  isConnected: boolean;
  batteryLevel?: number;
}

export type ConnectionState =
  | 'disconnected'
  | 'discovering'
  | 'pairing'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export type ActiveView =
  | 'overview'
  | 'devices'
  | 'mirror'
  | 'files'
  | 'notifications'
  | 'clipboard'
  | 'settings';

export type AccentColor = 'indigo' | 'violet' | 'blue' | 'emerald' | 'rose';

interface DeviceStore {
  devices: Device[];
  connectedDevice: Device | null;
  connectionState: ConnectionState;
  activeView: ActiveView;
  theme: 'light' | 'dark';
  accentColor: AccentColor;
  setActiveView: (view: ActiveView) => void;
  setDevices: (devices: Device[]) => void;
  setConnectedDevice: (device: Device | null) => void;
  setConnectionState: (state: ConnectionState) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setAccentColor: (color: AccentColor) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  connectedDevice: null,
  connectionState: 'disconnected',
  activeView: 'overview',
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'dark',
  accentColor: (localStorage.getItem('accentColor') as AccentColor) || 'indigo',
  setActiveView: (view) => set({ activeView: view }),
  setDevices: (devices) => set({ devices }),
  setConnectedDevice: (device) => set({ connectedDevice: device }),
  setConnectionState: (state) => set({ connectionState: state }),
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
  },
  setAccentColor: (accentColor) => {
    localStorage.setItem('accentColor', accentColor);
    set({ accentColor });
  },
}));
