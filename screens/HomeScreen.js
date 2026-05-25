import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '../styles/theme';
import { useDeviceConnection } from '../context/DeviceConnectionContext';
import { useRealtimeThreat } from '../context/RealtimeThreatContext';
import { useNavigation } from '@react-navigation/native';

const LAST_DEVICE_IP_STORAGE_KEY = '@safetyapp_last_watch_ip';

export default function HomeScreen() {
  const { connectedDevice, telemetry, isConnecting, error, connect, disconnect, espAudioWaveform, espAudioConnected, triggerEspCapture } = useDeviceConnection();
  const { isMonitoring, startMonitoring, stopMonitoring } = useRealtimeThreat();
  const navigation = useNavigation();
  const [deviceIP, setDeviceIP] = useState('');
  const [showIPInput, setShowIPInput] = useState(false);
  const [waveformSamples, setWaveformSamples] = useState(() => Array(48).fill(0));
  const [testMonitoringLoading, setTestMonitoringLoading] = useState(false);
  const [testCaptureLoading, setTestCaptureLoading] = useState(false);
  const lastTelemetryAtRef = useRef(0);

  useEffect(() => {
    if (!connectedDevice) {
      setWaveformSamples(Array(48).fill(0));
      lastTelemetryAtRef.current = 0;
      return;
    }

    // Prefer live ESP WebSocket waveform when available
    if (espAudioConnected && Array.isArray(espAudioWaveform) && espAudioWaveform.length === 48) {
      const normalizedWaveform = espAudioWaveform.map((s) => Math.max(0, Math.min(100, Number(s) || 0)));
      setWaveformSamples(normalizedWaveform);
      return;
    }

    // Fallback to telemetry waveform from HTTP polling
    const receivedAt = telemetry.receivedAt || Date.now();
    if (receivedAt <= (lastTelemetryAtRef.current || 0)) {
      return;
    }
    lastTelemetryAtRef.current = receivedAt;

    const liveWaveform = Array.isArray(telemetry.audioWaveform) && telemetry.audioWaveform.length > 0
      ? telemetry.audioWaveform.slice(-48)
      : null;

    if (liveWaveform) {
      const normalizedWaveform = Array.from({ length: 48 }, (_, index) => {
        const sample = liveWaveform[index] ?? 0;
        return Math.max(0, Math.min(100, Number(sample) || 0));
      });
      setWaveformSamples(normalizedWaveform);
      return;
    }

    const nextSample = Math.max(0, Math.min(100, Number(telemetry.audioLevel) || 0));
    setWaveformSamples((current) => {
      const nextHistory = [...current.slice(-47), nextSample];
      return nextHistory;
    });
  }, [connectedDevice, espAudioConnected, espAudioWaveform, telemetry.audioLevel, telemetry.audioWaveform, telemetry.receivedAt]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        // Optional cleanup on screen blur
      };
    }, [])
  );

  useEffect(() => {
    let mounted = true;

    const loadSavedIP = async () => {
      try {
        const storedIP = await AsyncStorage.getItem(LAST_DEVICE_IP_STORAGE_KEY);
        if (!mounted) return;

        if (storedIP) {
          setDeviceIP(storedIP);
        }
      } catch (storageError) {
        console.warn('[Home] Failed to load saved IP:', storageError);
      }
    };

    loadSavedIP();

    return () => {
      mounted = false;
    };
  }, [connect, connectedDevice]);

  const handleConnect = useCallback(async () => {
    if (!deviceIP.trim()) {
      Alert.alert('Error', 'Please enter device IP address');
      return;
    }
    try {
      await AsyncStorage.setItem(LAST_DEVICE_IP_STORAGE_KEY, deviceIP.trim());
    } catch (storageError) {
      console.warn('[Home] Failed to store device IP:', storageError);
    }
    connect(deviceIP.trim());
    setShowIPInput(false);
  }, [deviceIP, connect]);

  const handleDisconnect = useCallback(() => {
    Alert.alert('Disconnect', 'Disconnect from watch?', [
      { text: 'Cancel', onPress: () => {}, style: 'cancel' },
      {
        text: 'Disconnect',
        onPress: () => disconnect(),
        style: 'destructive',
      },
    ]);
  }, [disconnect]);

  // TEST BUTTON: Toggle threat monitoring
  const handleToggleMonitoring = useCallback(async () => {
    setTestMonitoringLoading(true);
    try {
      if (isMonitoring) {
        stopMonitoring();
        Alert.alert('Monitoring Stopped', 'Threat detection is now OFF.');
        console.log('✅ [Test] Monitoring STOPPED');
      } else {
        startMonitoring();
        Alert.alert('Monitoring Started', '⏱️ Calibrating for 2 minutes...\n\nAfter calibration, real triggers will capture audio.');
        console.log('✅ [Test] Monitoring STARTED');
      }
    } catch (err) {
      Alert.alert('Error', `Failed to toggle monitoring: ${err.message}`);
      console.error('[Test] Toggle monitoring error:', err);
    } finally {
      setTestMonitoringLoading(false);
    }
  }, [isMonitoring, startMonitoring, stopMonitoring]);

  // TEST BUTTON: Manually trigger audio capture
  const handleTestTriggerCapture = useCallback(async () => {
    if (!connectedDevice) {
      Alert.alert('Not Connected', 'Please connect to the ESP32 first.');
      return;
    }
    if (!espAudioConnected) {
      Alert.alert('WebSocket Not Connected', 'Audio stream not connected yet. Try again in a few seconds.');
      return;
    }

    setTestCaptureLoading(true);
    try {
      // Get current user ID from async storage or use test ID
      let userUid = 'test-user-' + Date.now();
      try {
        const stored = await AsyncStorage.getItem('@user_uid');
        if (stored) userUid = stored;
      } catch (e) {
        console.warn('[Test] Could not load user UID, using test ID');
      }

      Alert.alert(
        'Test Capture',
        'This will capture and upload the last 8 seconds of audio from the rolling buffer. Confirm?',
        [
          { text: 'Cancel', onPress: () => setTestCaptureLoading(false), style: 'cancel' },
          {
            text: 'Capture Now',
            onPress: async () => {
              try {
                console.log('🚨 [Test] Triggering MANUAL audio capture...');
                await triggerEspCapture(userUid);
                Alert.alert('✅ Capture Triggered', 'Audio was extracted from buffer and uploaded to Supabase.');
                console.log('✅ [Test] Capture completed');
              } catch (err) {
                Alert.alert('❌ Capture Failed', err.message);
                console.error('[Test] Capture error:', err);
              } finally {
                setTestCaptureLoading(false);
              }
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('Error', `Failed to prepare capture: ${err.message}`);
      console.error('[Test] Prepare error:', err);
      setTestCaptureLoading(false);
    }
  }, [connectedDevice, espAudioConnected, triggerEspCapture]);

  return (
    <LinearGradient colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Title - Connect Device */}
          <View style={styles.titleSection}>
            <Text style={styles.titleText}>Connect Device</Text>
          </View>

          {/* Connection Status Card */}
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusLabel}>
                <MaterialIcons
                  name={connectedDevice ? 'devices' : 'portable-wifi-off'}
                  size={24}
                  color={connectedDevice ? '#4CAF50' : '#999'}
                />
                <Text style={styles.statusLabelText}>Watch Connected:</Text>
              </View>
              <Text style={[styles.statusValue, { color: connectedDevice ? '#4CAF50' : '#ff6b6b' }]}>
                {connectedDevice ? 'Connected' : 'Not Connected'}
              </Text>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <MaterialIcons name="error" size={16} color="#ff6b6b" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </View>

          {/* Connection Controls */}
          <View style={styles.controlsSection}>
            {!connectedDevice ? (
              <>
                {!showIPInput ? (
                  <TouchableOpacity
                    style={[styles.button, styles.connectButton]}
                    onPress={() => setShowIPInput(true)}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <MaterialIcons name="bluetooth-searching" size={20} color="#fff" />
                        <Text style={styles.buttonText}>Connect to Watch</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.inputSection}>
                    <Text style={styles.inputLabel}>ESP32 IP Address:</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="192.168.100.15"
                      placeholderTextColor="#999"
                      value={deviceIP}
                      onChangeText={setDeviceIP}
                      editable={!isConnecting}
                    />
                    <View style={styles.inputButtonsRow}>
                      <TouchableOpacity
                        style={[styles.button, styles.cancelButton, { flex: 1 }]}
                        onPress={() => setShowIPInput(false)}
                      >
                        <Text style={styles.buttonText}>Cancel</Text>
                      </TouchableOpacity>
                      <View style={{ width: 10 }} />
                      <TouchableOpacity
                        style={[styles.button, styles.connectButton, { flex: 1 }]}
                        onPress={handleConnect}
                        disabled={isConnecting}
                      >
                        {isConnecting ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.buttonText}>Connect</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            ) : (
              <TouchableOpacity
                style={[styles.button, styles.disconnectButton]}
                onPress={handleDisconnect}
              >
                <MaterialIcons name="link-off" size={20} color="#fff" />
                <Text style={styles.buttonText}>Disconnect</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Connection Guide */}
          <View style={styles.guideCard}>
            <Text style={styles.cardTitle}>How To Connect The Watch</Text>
            <Text style={styles.guideText}>1. Turn on your phone hotspot and keep it open.</Text>
            <Text style={styles.guideText}>2. Power the watch and wait until the ESP32 joins the hotspot.</Text>
            <Text style={styles.guideText}>3. Open this screen, and the app will auto-connect to the last saved IP.</Text>
            <Text style={styles.guideText}>4. If needed, tap Connect to Watch and enter the IP once.</Text>
          </View>

          <TouchableOpacity
            style={styles.triggerButton}
            onPress={() => navigation.navigate('RealtimeMonitoring')}
          >
            <MaterialIcons name="graphic-eq" size={20} color="#fff" />
            <Text style={styles.buttonText}>Open Trigger Monitor</Text>
          </TouchableOpacity>

          {/* TEST SECTION - Only visible when connected */}
          {connectedDevice && (
            <View style={[styles.telemetryCard, { backgroundColor: 'rgba(255, 150, 100, 0.15)', borderColor: 'rgba(255, 150, 100, 0.4)' }]}>
              <Text style={[styles.cardTitle, { color: '#ff9966' }]}>🧪 Test Controls (DEV ONLY)</Text>
              
              <TouchableOpacity
                style={[
                  styles.testButton,
                  { backgroundColor: isMonitoring ? '#ff6b6b' : '#4CAF50' },
                  testMonitoringLoading && { opacity: 0.6 }
                ]}
                onPress={handleToggleMonitoring}
                disabled={testMonitoringLoading}
              >
                {testMonitoringLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name={isMonitoring ? 'stop' : 'play-arrow'} size={18} color="#fff" />
                    <Text style={styles.buttonText}>{isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.testButton,
                  { backgroundColor: '#ff6b6b' },
                  (testCaptureLoading || !espAudioConnected) && { opacity: 0.6 }
                ]}
                onPress={handleTestTriggerCapture}
                disabled={testCaptureLoading || !espAudioConnected}
              >
                {testCaptureLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="mic" size={18} color="#fff" />
                    <Text style={styles.buttonText}>{espAudioConnected ? 'Test Capture' : 'WS Not Ready'}</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.testHint}>
                <Text style={{ fontWeight: '600' }}>Status:</Text> Monitoring: {isMonitoring ? '🟢 ON' : '🔴 OFF'} | Audio Stream: {espAudioConnected ? '🟢 LIVE' : '🔴 OFFLINE'}
              </Text>
            </View>
          )}

          {/* Live Audio Waveform */}
          <View style={styles.telemetryCard}>
            <View style={styles.waveHeaderRow}>
              <Text style={styles.cardTitle}>Audio Waveform</Text>
              <Text style={styles.waveValue}>{Math.round(Number(telemetry.audioLevel) || 0)}%</Text>
            </View>
            <Text style={styles.waveHint}>
              Rolling live trace from ESP32 mic activity. The app receives hardware waveform peaks plus trigger-window status.
            </Text>
            {telemetry.audioCaptureActive && (
              <Text style={styles.captureStatus}>Capture window active: session {telemetry.audioCaptureSession}</Text>
            )}
            <View style={styles.waveformWrap}>
              {waveformSamples.map((sample, index) => {
                const normalized = Math.max(0, Math.min(100, Number(sample) || 0));
                const barHeight = normalized > 0 ? Math.max(10, (normalized / 100) * 58) : 6;
                const isPeak = index === waveformSamples.length - 1;

                return (
                  <View
                    key={index}
                    style={[
                      styles.waveBar,
                      {
                        height: barHeight,
                        opacity: normalized > 0 ? (isPeak ? 1 : 0.7) : 0.25,
                        backgroundColor: normalized > 70 ? '#ff6b6b' : '#ff1493',
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>

          {/* Telemetry Display */}
          {connectedDevice && (
            <View style={styles.telemetrySection}>
              {/* IMU Data */}
              <View style={styles.telemetryCard}>
                <Text style={styles.cardTitle}>Motion (IMU)</Text>
                <View style={styles.dataRow}>
                  <View style={styles.dataItem}>
                    <Text style={styles.dataLabel}>Roll</Text>
                    <Text style={styles.dataValue}>{telemetry.roll.toFixed(1)}°</Text>
                  </View>
                  <View style={styles.dataItem}>
                    <Text style={styles.dataLabel}>Pitch</Text>
                    <Text style={styles.dataValue}>{telemetry.pitch.toFixed(1)}°</Text>
                  </View>
                  <View style={styles.dataItem}>
                    <Text style={styles.dataLabel}>Yaw</Text>
                    <Text style={styles.dataValue}>{telemetry.yaw.toFixed(1)}°</Text>
                  </View>
                </View>
              </View>

              {/* PPG/Health Data */}
              <View style={styles.telemetryCard}>
                <Text style={styles.cardTitle}>Health (PPG)</Text>
                <View style={styles.dataRow}>
                  <View style={styles.dataItem}>
                    <Text style={styles.dataLabel}>Heart Rate</Text>
                    <Text style={[styles.dataValue, { color: telemetry.fingerOn ? '#ff6b6b' : '#999' }]}>
                      {telemetry.fingerOn ? `${telemetry.heartRate} bpm` : '--'}
                    </Text>
                  </View>
                  <View style={styles.dataItem}>
                    <Text style={styles.dataLabel}>SpO2</Text>
                    <Text style={[styles.dataValue, { color: telemetry.fingerOn ? '#4CAF50' : '#999' }]}>
                      {telemetry.fingerOn ? `${telemetry.spo2}%` : '--'}
                    </Text>
                  </View>
                </View>
                <View style={styles.fingerStatus}>
                  <View style={[styles.fingerIndicator, { backgroundColor: telemetry.fingerOn ? '#4CAF50' : '#999' }]} />
                  <Text style={styles.fingerText}>
                    {telemetry.fingerOn ? 'Finger Detected' : 'No Finger'}
                  </Text>
                </View>
              </View>

              {/* GPS Data */}
              {telemetry.gpsValid && (
                <View style={styles.telemetryCard}>
                  <Text style={styles.cardTitle}>Location (GPS)</Text>
                  <View style={styles.dataRow}>
                    <View style={[styles.dataItem, { flex: 1 }]}>
                      <Text style={styles.dataLabel}>Latitude</Text>
                      <Text style={styles.dataValue}>{telemetry.latitude.toFixed(4)}°</Text>
                    </View>
                    <View style={[styles.dataItem, { flex: 1 }]}>
                      <Text style={styles.dataLabel}>Longitude</Text>
                      <Text style={styles.dataValue}>{telemetry.longitude.toFixed(4)}°</Text>
                    </View>
                  </View>
                  <View style={styles.dataRow}>
                    <View style={styles.dataItem}>
                      <Text style={styles.dataLabel}>Altitude</Text>
                      <Text style={styles.dataValue}>{telemetry.altitude.toFixed(0)}m</Text>
                    </View>
                    <View style={styles.dataItem}>
                      <Text style={styles.dataLabel}>Speed</Text>
                      <Text style={styles.dataValue}>{telemetry.speed.toFixed(1)} km/h</Text>
                    </View>
                    <View style={styles.dataItem}>
                      <Text style={styles.dataLabel}>Sats</Text>
                      <Text style={styles.dataValue}>{telemetry.satellites}</Text>
                    </View>
                  </View>
                  <Text style={styles.gpsTime}>
                    {telemetry.gpsTime} {telemetry.gpsDate}
                  </Text>
                </View>
              )}

              {/* Status Indicators */}
              <View style={styles.telemetryCard}>
                <Text style={styles.cardTitle}>System Status</Text>
                <View style={styles.statusIndicatorsRow}>
                  <View style={styles.statusIndicator}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: telemetry.wifiConnected ? '#4CAF50' : '#ff6b6b' },
                      ]}
                    />
                    <Text style={styles.statusIndicatorText}>WiFi</Text>
                  </View>
                  <View style={styles.statusIndicator}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: telemetry.i2sRunning ? '#4CAF50' : '#ff6b6b' },
                      ]}
                    />
                    <Text style={styles.statusIndicatorText}>Audio</Text>
                  </View>
                  <View style={styles.statusIndicator}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: telemetry.gpsValid ? '#4CAF50' : '#ff6b6b' },
                      ]}
                    />
                    <Text style={styles.statusIndicatorText}>GPS</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Add Friends Button - Always visible */}
          <TouchableOpacity style={styles.addFriendsButton}>
            <MaterialIcons name="person-add" size={20} color="#fff" />
            <Text style={styles.addFriendsText}>Add Trusted Contacts</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  titleText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffc8dc',
  },
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.2)',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  statusLabelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 100, 100, 0.3)',
  },
  errorText: {
    fontSize: 14,
    color: '#ff6b6b',
    flex: 1,
  },
  controlsSection: {
    marginBottom: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  connectButton: {
    backgroundColor: '#4CAF50',
  },
  disconnectButton: {
    backgroundColor: '#ff6b6b',
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  inputSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.2)',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.2)',
  },
  inputButtonsRow: {
    flexDirection: 'row',
  },
  telemetrySection: {
    gap: 12,
    marginBottom: 20,
  },
  guideCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.2)',
    marginBottom: 16,
  },
  triggerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#ff1493',
    marginBottom: 16,
  },
  guideText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
    marginBottom: 6,
  },
  telemetryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.2)',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffc8dc',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  waveHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waveValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4CAF50',
  },
  waveHint: {
    fontSize: 13,
    color: '#999',
    marginBottom: 12,
  },
  captureStatus: {
    fontSize: 12,
    color: '#4CAF50',
    marginBottom: 10,
    fontWeight: '600',
  },
  waveformWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 64,
    paddingHorizontal: 2,
    gap: 3,
  },
  waveBar: {
    flex: 1,
    minWidth: 4,
    borderRadius: 999,
    backgroundColor: '#ff1493',
    opacity: 0.9,
  },
  dataRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  dataItem: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 10,
  },
  dataLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  dataValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffc8dc',
  },
  fingerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 200, 220, 0.2)',
  },
  fingerIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  fingerText: {
    fontSize: 14,
    color: '#fff',
  },
  gpsTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  statusIndicatorsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusIndicatorText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  addFriendsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 200, 220, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.3)',
  },
  addFriendsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffc8dc',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  testHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
});
