import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import WiFiDeviceService from '../services/wifiDeviceService';
import EspWebsocketService from '../services/espWebsocketService';

const DeviceConnectionContext = createContext(null);

const DEFAULT_TELEMETRY = {
  roll: 0,
  pitch: 0,
  yaw: 0,
  heartRate: 0,
  spo2: 0,
  fingerOn: false,
  audioLevel: 0,
  latitude: 0,
  longitude: 0,
  altitude: 0,
  speed: 0,
  satellites: 0,
  hdop: 0,
  gpsValid: false,
  wifiConnected: false,
  i2sRunning: false,
  gpsTime: '--:--:--',
  gpsDate: '--/--/----',
  receivedAt: 0,
};

export const DeviceConnectionProvider = ({ children }) => {
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [telemetry, setTelemetry] = useState(DEFAULT_TELEMETRY);
  const [espAudioWaveform, setEspAudioWaveform] = useState(Array(48).fill(0));
  const [espAudioConnected, setEspAudioConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connect = useCallback(async (deviceIP) => {
    setIsConnecting(true);
    setError(null);
    try {
      const device = await WiFiDeviceService.connectToDevice(
        deviceIP,
        (telem) => {
          if (telem) setTelemetry({ ...telem, receivedAt: Date.now() });
        },
        (reason) => {
          setConnectedDevice(null);
          setTelemetry({ ...DEFAULT_TELEMETRY, receivedAt: Date.now() });
          setError(reason || 'Watch disconnected');
        }
      );
      // start WebSocket audio connection for live waveform
      try {
        EspWebsocketService.connect(deviceIP, (bins) => {
          setEspAudioWaveform(bins);
        }, (status) => {
          setEspAudioConnected(!!status.connected);
        });
      } catch (e) {
        console.warn('[Device] Failed to start ESP WebSocket audio:', e.message || e);
      }
      setConnectedDevice(device);
      setIsConnecting(false);
    } catch (err) {
      console.error('[Device] Connection error:', err);
      setError(err.message || 'Connection failed');
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    WiFiDeviceService.disconnect();
    try { EspWebsocketService.disconnect(); } catch (e) {}
    setConnectedDevice(null);
    setTelemetry(DEFAULT_TELEMETRY);
    setError(null);
  }, []);

  const triggerEspCapture = useCallback(async (userUid, frontImageUri = null, backImageUri = null) => {
    try {
      const res = await EspWebsocketService.captureAndUpload(userUid, frontImageUri, backImageUri);
      return res;
    } catch (e) {
      console.error('[Device] ESP capture/upload failed:', e);
      throw e;
    }
  }, []);

  const value = {
    connectedDevice,
    telemetry,
    espAudioWaveform,
    espAudioConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    triggerEspCapture,
  };

  return (
    <DeviceConnectionContext.Provider value={value}>
      {children}
    </DeviceConnectionContext.Provider>
  );
};

export const useDeviceConnection = () => {
  const context = useContext(DeviceConnectionContext);
  if (!context) {
    throw new Error('useDeviceConnection must be used within DeviceConnectionProvider');
  }
  return context;
};
