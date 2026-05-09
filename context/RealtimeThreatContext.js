/**
 * 🚨 Real-Time Threat Context
 * 
 * Global state management for event-driven threat detection
 * Provides: monitoring status, threat history, statistics
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useDeviceConnection } from './DeviceConnectionContext';
import { DangerAlertContext } from './DangerAlertContext';
import threatTriggerService from '../services/threatTriggerService';
import eventDrivenAudioCaptureService from '../services/eventDrivenAudioCaptureService';
import { supabase } from '../supabase';
import { isDangerRisk } from '../services/dangerDetectionService';
import { addGeoFenceAlertHistoryItem } from '../services/geoFenceService';

export const RealtimeThreatContext = createContext();

export const RealtimeThreatProvider = ({ children, userUid }) => {
  // ════════════════════════════════════════
  // STATE
  // ════════════════════════════════════════
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastThreatDetected, setLastThreatDetected] = useState(null);
  const [threats, setThreats] = useState([]); // History
  const [recentTriggers, setRecentTriggers] = useState([]);
  const [stats, setStats] = useState({
    totalCaptures: 0,
    highRiskCount: 0,
    mediumRiskCount: 0,
    avgProcessingTime: 0,
  });

  const [calibrationStatus, setCalibrationStatus] = useState('pending');
  const [liveMetrics, setLiveMetrics] = useState({
    heartRate: 0,
    motionMagnitude: 0,
    audioLevel: 0,
  });

  const processingCaptureRef = useRef(false);

  // Get parent contexts
  const deviceContext = useDeviceConnection();
  const dangerContext = useContext(DangerAlertContext);

  const processTelemetry = useCallback(async (telemetry) => {
    try {
      if (!telemetry) return;

      setLiveMetrics({
        heartRate: telemetry.heartRate || 0,
        motionMagnitude: Math.sqrt(
          (telemetry.roll || 0) ** 2 +
          (telemetry.pitch || 0) ** 2 +
          (telemetry.yaw || 0) ** 2
        ),
        audioLevel: telemetry.audioLevel || 0,
      });

      const triggers = threatTriggerService.analyzeTelemetry(telemetry);
      setRecentTriggers(triggers);

      const calibStatus = threatTriggerService.getCalibrationStatus();
      if (!calibStatus.isCalibrated) {
        setCalibrationStatus(`Calibrating: ${calibStatus.remainingSeconds}s remaining`);
        return;
      }

      if (calibrationStatus !== 'complete') {
        setCalibrationStatus('complete');
        console.log('✅ [RealtimeThreat] Calibration complete!');
      }

      const confidence = threatTriggerService.shouldCaptureAudio(triggers);

      // If the danger popup is visible, DO NOT initiate a new capture.
      // Instead, record any triggers into the alert history so they are
      // included in the SOS message context. This prevents overlapping
      // captures while the user is dealing with the popup.
      if (dangerContext?.isVisible) {
        if (triggers && triggers.length > 0) {
          try {
            const alertMessage = triggers.map((t) => t.description).join(' ; ');
            const details = {
              reason: triggers.map((t) => t.type).join(', '),
              triggerCount: triggers.length,
              motion: liveMetrics.motionMagnitude,
              heartRate: liveMetrics.heartRate,
              audioLevel: liveMetrics.audioLevel,
            };
            await addGeoFenceAlertHistoryItem({
              message: `During active alert: ${alertMessage}`,
              timestamp: new Date().toISOString(),
              details,
              eventType: 'threat_during_popup',
            });
            console.log('ℹ️ [RealtimeThreat] Popup visible — logged trigger to alert history, skipping capture');
          } catch (err) {
            console.warn('⚠️ [RealtimeThreat] Failed to log trigger during popup:', err);
          }
        }

        // Do not proceed with capture while popup is visible
        return;
      }

      // STRICT GATE: No capture without a trigger OR if already processing
      if (!confidence) {
        console.log('ℹ️ [RealtimeThreat] No threat detected - SKIPPING capture');
        return;
      }
      
      if (processingCaptureRef.current) {
        console.log('⏳ [RealtimeThreat] Already processing a capture - SKIPPING');
        return;
      }

      processingCaptureRef.current = true;
      console.log(`🚨 [RealtimeThreat] ⚠️ TRIGGER DETECTED! ${confidence} confidence - capturing audio NOW`);

      // Inhibit other triggers while we capture + upload + analyze
      try {
        if (typeof threatTriggerService.inhibit === 'function') {
          // Inhibit until we explicitly release (safe default applied inside service)
          threatTriggerService.inhibit();
        }

        // Do not show popup here — wait until capture, upload and analysis finish
        // Prefer ESP32 hardware capture if available (WebSocket rolling buffer)
        if (deviceContext && deviceContext.espAudioConnected) {
          try {
            // Wait briefly to capture audio that may arrive immediately after the trigger
            const POST_CAPTURE_MS = 1500; // milliseconds to wait for post-event audio
            console.log(`ℹ️ [RealtimeThreat] Waiting ${POST_CAPTURE_MS}ms to include post-trigger audio before extraction`);
            await new Promise((r) => setTimeout(r, POST_CAPTURE_MS));

            const res = await deviceContext.triggerEspCapture(userUid);
            handleThreatDetected(res, confidence);
          } catch (espErr) {
            console.warn('[RealtimeThreat] ESP capture failed, falling back to phone mic:', espErr);
            await eventDrivenAudioCaptureService.captureAndAnalyze(
              userUid,
              telemetry,
              (result) => {
                handleThreatDetected(result, confidence);
              },
              (error) => {
                console.error('❌ [RealtimeThreat] Threat analysis failed (fallback):', error);
              }
            );
          }
        } else {
          await eventDrivenAudioCaptureService.captureAndAnalyze(
            userUid,
            telemetry,
            (result) => {
              handleThreatDetected(result, confidence);
            },
            (error) => {
              console.error('❌ [RealtimeThreat] Threat analysis failed:', error);
            }
          );
        }
      } finally {
        // Release inhibition after processing completes
        try {
          if (typeof threatTriggerService.releaseInhibition === 'function') {
            threatTriggerService.releaseInhibition();
          }
        } catch (e) {
          console.warn('⚠️ [RealtimeThreat] Failed to release trigger inhibition:', e);
        }
      }

      threatTriggerService.resetTriggerCounters();
    } catch (error) {
      console.error('❌ [RealtimeThreat] Monitoring loop error:', error);
    } finally {
      processingCaptureRef.current = false;
    }
  }, [calibrationStatus, dangerContext, userUid]);

  // ════════════════════════════════════════
  // MONITORING LOOP (Main Logic)
  // ════════════════════════════════════════

  const startMonitoring = useCallback(() => {
    if (isMonitoring) {
      console.warn('⚠️ [RealtimeThreat] Already monitoring');
      return;
    }

    console.log('🟢 [RealtimeThreat] Starting real-time threat monitoring...');
    setIsMonitoring(true);
    setCalibrationStatus('calibrating');
    setRecentTriggers([]);
    threatTriggerService.resetCalibration();
  }, [isMonitoring]);

  const stopMonitoring = useCallback(() => {
    console.log('🔴 [RealtimeThreat] Stopping real-time monitoring');
    setIsMonitoring(false);
    setCalibrationStatus('idle');
    setRecentTriggers([]);
  }, []);

  // ════════════════════════════════════════
  // THREAT HANDLER
  // ════════════════════════════════════════

  const handleThreatDetected = useCallback(
    (threatResult, confidence) => {
      console.log('🚨 [RealtimeThreat] Threat detected:', threatResult);

      // Add to history
      const threatRecord = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        confidence: confidence,
        audio_url: threatResult.audio_url,
        emotion: threatResult.emotion,
        emotion_confidence: threatResult.confidence,
        risk_level: threatResult.risk_level,
        heart_rate: threatResult.heart_rate,
        motion: threatResult.motion,
      };

      setLastThreatDetected(threatRecord);
      setThreats((prev) => [threatRecord, ...prev].slice(0, 50)); // Keep last 50

      // Update stats
      setStats((prev) => ({
        ...prev,
        totalCaptures: prev.totalCaptures + 1,
        highRiskCount: prev.highRiskCount + (confidence === 'HIGH' ? 1 : 0),
        mediumRiskCount: prev.mediumRiskCount + (confidence === 'MEDIUM' ? 1 : 0),
      }));

      // DISABLED: Skip Supabase storage per user request
      // Uncomment to re-enable Firebase threat logging
      // (async () => {
      //   try {
      //     const saved = await saveToSupabase(threatRecord);
      //     if (saved && dangerContext?.showDangerAlert && isDangerRisk(threatRecord.risk_level)) {
      //       dangerContext.showDangerAlert();
      //     }
      //   } catch (err) {
      //     console.error('❌ [RealtimeThreat] Failed to persist threat before showing alert:', err);
      //   }
      // })();

      // Still show danger alert even if not saving to DB
      if (dangerContext?.showDangerAlert && isDangerRisk(threatRecord.risk_level)) {
        dangerContext.showDangerAlert();
      }
    },
    [dangerContext]
  );

  // ════════════════════════════════════════
  // STORAGE
  // ════════════════════════════════════════

  const saveToSupabase = async (threatRecord) => {
    try {
      const { error } = await supabase
        .from('threat_detections')
        .insert([
          {
            user_id: userUid,
            timestamp: threatRecord.timestamp,
            confidence: threatRecord.confidence,
            emotion: threatRecord.emotion,
            emotion_confidence: threatRecord.emotion_confidence,
            risk_level: threatRecord.risk_level,
            heart_rate: threatRecord.heart_rate,
            motion: threatRecord.motion,
            audio_url: threatRecord.audio_url,
            created_at: new Date().toISOString(),
          },
        ]);
      if (error) throw error;
      console.log('✅ [RealtimeThreat] Threat saved to Supabase');
      return true;
    } catch (error) {
      console.error('❌ [RealtimeThreat] Save failed:', error);
      return false;
    }
  };

  // ════════════════════════════════════════
  // CONTEXT VALUE
  // ════════════════════════════════════════

  const value = {
    // State
    isMonitoring,
    lastThreatDetected,
    threats,
    recentTriggers,
    stats,
    liveMetrics,
    calibrationStatus,

    // Controls
    startMonitoring,
    stopMonitoring,

    // Utilities
    clearThreatHistory: () => setThreats([]),
    resetStats: () =>
      setStats({
        totalCaptures: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        avgProcessingTime: 0,
      }),

    // Direct threat trigger (for testing)
    triggerThreatManually: handleThreatDetected,
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isMonitoring) {
        stopMonitoring();
      }
    };
  }, [isMonitoring, stopMonitoring]);

  useEffect(() => {
    if (!isMonitoring) return;
    if (!deviceContext?.telemetry) return;
    processTelemetry(deviceContext.telemetry);
  }, [deviceContext?.telemetry, isMonitoring, processTelemetry]);

  useEffect(() => {
    const connected = Boolean(deviceContext?.connectedDevice);

    // DISABLED auto-start: monitoring is OFF by default
    // User must manually call startMonitoring() to enable threat detection
    // This prevents continuous recording when not needed
    if (!connected && isMonitoring) {
      console.log('🔴 [RealtimeThreat] Watch disconnected, auto-stopping monitoring');
      stopMonitoring();
    }
  }, [deviceContext?.connectedDevice, isMonitoring, startMonitoring, stopMonitoring]);

  return (
    <RealtimeThreatContext.Provider value={value}>
      {children}
    </RealtimeThreatContext.Provider>
  );
};

/**
 * 🎣 Hook to use RealtimeThreatContext
 */
export const useRealtimeThreat = () => {
  const context = useContext(RealtimeThreatContext);
  if (!context) {
    throw new Error(
      'useRealtimeThreat must be used within RealtimeThreatProvider'
    );
  }
  return context;
};
