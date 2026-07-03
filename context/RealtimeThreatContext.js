/**
 * 🚨 Real-Time Threat Context
 * 
 * Global state management for event-driven threat detection
 * Provides: monitoring status, threat history, statistics
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useDeviceConnection } from './DeviceConnectionContext';
import { DangerAlertContext } from './DangerAlertContext';
import threatTriggerService from '../services/threatTriggerService';
import eventDrivenAudioCaptureService from '../services/eventDrivenAudioCaptureService';
import { supabase } from '../supabase';
import { isDangerRisk } from '../services/dangerDetectionService';
import { addGeoFenceAlertHistoryItem } from '../services/geoFenceService';

export const RealtimeThreatContext = createContext();

const serializeLog = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return JSON.stringify({ serializationError: error?.message || String(error) }, null, 2);
  }
};

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
  const lastIdleLogRef = useRef(0);
  const lastProcessedTelemetryAtRef = useRef(0);

  // Get parent contexts
  const deviceContext = useDeviceConnection();
  const dangerContext = useContext(DangerAlertContext);
  const dangerAlertVisible = Boolean(dangerContext?.isVisible);
  const showDangerAlert = dangerContext?.showDangerAlert;

  const processTelemetry = useCallback(async (telemetry) => {
    try {
      if (!telemetry) return;

      const telemetryReceivedAt = Number(telemetry.receivedAt) || 0;
      if (telemetryReceivedAt && lastProcessedTelemetryAtRef.current === telemetryReceivedAt) {
        return;
      }
      if (telemetryReceivedAt) {
        lastProcessedTelemetryAtRef.current = telemetryReceivedAt;
      }

      const currentScreenOrFeature = 'RealtimeMonitoringScreen / RealtimeThreatContext.processTelemetry';
      const now = Date.now();
      const shouldEmitVerboseIdleLog = now - lastIdleLogRef.current >= 10000;
      const currentTimestamp = new Date().toISOString();
      const sensorSnapshot = {
        timestamp: currentTimestamp,
        heartRate: telemetry.heartRate || 0,
        roll: telemetry.roll || 0,
        pitch: telemetry.pitch || 0,
        yaw: telemetry.yaw || 0,
        audioLevel: telemetry.audioLevel || 0,
        fingerOn: telemetry.fingerOn,
        spo2: telemetry.spo2,
      };
      const currentAudioStatus = typeof eventDrivenAudioCaptureService.getStatus === 'function'
        ? eventDrivenAudioCaptureService.getStatus()
        : { isRecording: false };
      const currentTriggerState = typeof threatTriggerService.getDebugState === 'function'
        ? threatTriggerService.getDebugState()
        : {};

      setLiveMetrics({
        heartRate: telemetry.heartRate || 0,
        motionMagnitude: Math.sqrt(
          (telemetry.roll || 0) ** 2 +
          (telemetry.pitch || 0) ** 2 +
          (((telemetry.yaw || 0) * 0.35) ** 2)
        ),
        audioLevel: telemetry.audioLevel || 0,
      });

      const triggers = threatTriggerService.analyzeTelemetry(telemetry);
      setRecentTriggers(triggers);

      const calibStatus = threatTriggerService.getCalibrationStatus();
      if (!calibStatus.isCalibrated) {
        setCalibrationStatus(`Calibrating: ${calibStatus.remainingSeconds}s remaining`);
        // do not return here — allow motion and loud-sound triggers during calibration
      } else {
        if (calibrationStatus !== 'complete') {
          setCalibrationStatus('complete');
          console.log('✅ [RealtimeThreat] Calibration complete!');
        }
      }

      const decisionContext = {
        timestamp: currentTimestamp,
        currentScreenOrFeature,
        triggerSource: 'threatTriggerService.analyzeTelemetry',
        currentSensorSnapshot: sensorSnapshot,
        captureArmed: Boolean(isMonitoring) && !processingCaptureRef.current && !currentTriggerState?.inhibited,
      };
      const confidence = threatTriggerService.shouldCaptureAudio(triggers, decisionContext);
      const triggerDecisionDebug = typeof threatTriggerService.getLastDecisionDebug === 'function'
        ? threatTriggerService.getLastDecisionDebug()
        : null;

      const shouldLogVerboseDecision = Boolean(confidence) || triggers.length > 0 || shouldEmitVerboseIdleLog;

      if (shouldLogVerboseDecision) {
        console.log('[RealtimeThreat][STEP 1] Realtime check started');
        console.log(serializeLog({
          timestamp: currentTimestamp,
          currentScreenOrFeature,
          triggerSource: 'telemetry_monitoring_loop',
          captureArmed: Boolean(isMonitoring) && !processingCaptureRef.current && !currentTriggerState?.inhibited,
          audioCaptureActive: Boolean(currentAudioStatus?.isRecording),
          currentSensorSnapshot: sensorSnapshot,
          triggerState: currentTriggerState,
        }));

        console.log('[RealtimeThreat][STEP 4] Frontend decision logic after trigger evaluation');
        console.log(serializeLog({
          timestamp: new Date().toISOString(),
          responseTreatedAsThreat: Boolean(confidence),
          exactConditionThatCausedDecision: triggerDecisionDebug?.reason || (confidence ? `Capture allowed with confidence ${confidence}` : 'No capture condition matched'),
          captureSkippedOrTriggered: confidence ? 'triggered' : 'skipped',
          confidence,
          triggerTypes: triggers.map((trigger) => trigger.type),
          triggerDescriptions: triggers.map((trigger) => trigger.description),
          triggerCounts: triggerDecisionDebug?.triggerCounts || currentTriggerState?.triggerCounts,
          cooldownRemainingMs: triggerDecisionDebug?.cooldownRemainingMs ?? currentTriggerState?.cooldownRemainingMs,
          cooldownMs: currentTriggerState?.triggerCooldownMs,
          inhibited: triggerDecisionDebug?.inhibited ?? currentTriggerState?.inhibited,
        }));
      }

      const logFinalSummary = (summary) => {
        console.log('[RealtimeThreat][FINAL SUMMARY]');
        console.log(serializeLog({
          timestamp: new Date().toISOString(),
          ...summary,
        }));
      };

      // STRICT GATE: No capture without a trigger OR if already processing
      if (!confidence) {
        if (shouldEmitVerboseIdleLog) {
          console.log('ℹ️ [RealtimeThreat] No threat detected - SKIPPING capture');
          lastIdleLogRef.current = now;
          logFinalSummary({
            wasThreatDetected: false,
            wasCaptureTriggered: false,
            wasUploadSkipped: true,
            exactConditionThatDecidedIt: triggerDecisionDebug?.reason || 'threatTriggerService.shouldCaptureAudio returned null',
            triggerSource: 'threatTriggerService.analyzeTelemetry',
            triggerTypes: triggers.map((trigger) => trigger.type),
            cooldownRemainingMs: triggerDecisionDebug?.cooldownRemainingMs ?? currentTriggerState?.cooldownRemainingMs,
            triggerCounts: triggerDecisionDebug?.triggerCounts || currentTriggerState?.triggerCounts,
          });
        }
        return;
      }
      
      if (processingCaptureRef.current) {
        if (shouldEmitVerboseIdleLog) {
          console.log('⏳ [RealtimeThreat] Already processing a capture - SKIPPING');
          lastIdleLogRef.current = now;
          logFinalSummary({
            wasThreatDetected: false,
            wasCaptureTriggered: false,
            wasUploadSkipped: true,
            exactConditionThatDecidedIt: 'processingCaptureRef.current was already true',
            triggerSource: 'telemetry_monitoring_loop',
            triggerTypes: triggers.map((trigger) => trigger.type),
            cooldownRemainingMs: triggerDecisionDebug?.cooldownRemainingMs ?? currentTriggerState?.cooldownRemainingMs,
            triggerCounts: triggerDecisionDebug?.triggerCounts || currentTriggerState?.triggerCounts,
          });
        }
        return;
      }

      processingCaptureRef.current = true;
      console.log(`🚨 [RealtimeThreat] ⚠️ TRIGGER DETECTED! ${confidence} confidence - capturing audio NOW`);

      const captureDebugContext = {
        currentScreenOrFeature,
        triggerSource: 'threatTriggerService.shouldCaptureAudio',
        triggerReason: triggerDecisionDebug?.reason || `Capture allowed with confidence ${confidence}`,
        requestReason: triggerDecisionDebug?.reason || `Threat-triggered capture (${confidence})`,
        captureArmed: true,
        audioCaptureActive: Boolean(currentAudioStatus?.isRecording),
        currentSensorSnapshot: sensorSnapshot,
        triggerDecision: triggerDecisionDebug,
      };

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

            const res = await deviceContext.triggerEspCapture(userUid, null, null, {
              captureAllowed: Boolean(confidence),
              triggerSource: 'threatTriggerService.shouldCaptureAudio',
              triggerReason: triggerDecisionDebug?.reason || `Capture allowed with confidence ${confidence}`,
              currentScreenOrFeature,
              currentSensorSnapshot: sensorSnapshot,
              triggerDecision: triggerDecisionDebug,
            });
            if (res) {
              handleThreatDetected(res, confidence);
            }
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
              ,
              captureDebugContext
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
            ,
            captureDebugContext
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
  }, [calibrationStatus, dangerAlertVisible, showDangerAlert, userUid]);

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
    lastIdleLogRef.current = 0;
    lastProcessedTelemetryAtRef.current = 0;
    threatTriggerService.resetCalibration();
  }, [isMonitoring]);

  const stopMonitoring = useCallback(() => {
    console.log('🔴 [RealtimeThreat] Stopping real-time monitoring');
    setIsMonitoring(false);
    setCalibrationStatus('idle');
    setRecentTriggers([]);
    lastIdleLogRef.current = 0;
    lastProcessedTelemetryAtRef.current = 0;
  }, []);

  // ════════════════════════════════════════
  // THREAT HANDLER
  // ════════════════════════════════════════

  const handleThreatDetected = useCallback(
    (threatResult, confidence) => {
      const normalizedRiskLevel = threatResult?.risk_level || threatResult?.threatLevel || null;
      const normalizedEmotion = threatResult?.emotion ?? null;
      const normalizedConfidence = threatResult?.confidence ?? null;

      if (!threatResult || normalizedConfidence == null || !normalizedRiskLevel) {
        console.warn('⚠️ [RealtimeThreat] Ignoring incomplete threat result:', threatResult);
        return;
      }

      if (!isDangerRisk(normalizedRiskLevel)) {
        console.log('ℹ️ [RealtimeThreat] Non-danger result received, not treating as threat:', {
          risk_level: normalizedRiskLevel,
          emotion: normalizedEmotion,
          confidence: normalizedConfidence,
          panic: threatResult?.panic ?? null,
        });
        return;
      }

      console.log('🚨 [RealtimeThreat] Threat detected:', {
        ...threatResult,
        risk_level: normalizedRiskLevel,
        emotion: normalizedEmotion,
        confidence: normalizedConfidence,
      });

      // Add to history
      const threatRecord = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        confidence: confidence,
        audio_url: threatResult.audio_url,
        emotion: normalizedEmotion,
        emotion_confidence: normalizedConfidence,
        risk_level: normalizedRiskLevel,
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

      // Ensure danger popup is shown when a dangerous threat is detected.
      if (isDangerRisk(threatRecord.risk_level)) {
        // Inhibit further triggers until popup is handled (60s)
        try {
          if (typeof threatTriggerService.inhibit === 'function') {
            threatTriggerService.inhibit(60000); // 60s
            console.log('[RealtimeThreat] Trigger inhibition enabled for 60s after detection');
          }
        } catch (e) {
          console.warn('[RealtimeThreat] Failed to inhibit triggers after detection:', e);
        }

        if (!dangerAlertVisible && typeof showDangerAlert === 'function') {
          try {
            showDangerAlert();
          } catch (err) {
            console.warn('[RealtimeThreat] Failed to show danger alert:', err);
          }
        } else {
          console.log('[RealtimeThreat] Danger popup already visible, skipping duplicate alert.');
        }
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

  const clearThreatHistory = useCallback(() => setThreats([]), []);

  const resetStats = useCallback(() => {
    setStats({
      totalCaptures: 0,
      highRiskCount: 0,
      mediumRiskCount: 0,
      avgProcessingTime: 0,
    });
  }, []);

  const value = useMemo(() => ({
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
    clearThreatHistory,
    resetStats,

    // Direct threat trigger (for testing)
    triggerThreatManually: handleThreatDetected,
  }), [
    isMonitoring,
    lastThreatDetected,
    threats,
    recentTriggers,
    stats,
    liveMetrics,
    calibrationStatus,
    startMonitoring,
    stopMonitoring,
    clearThreatHistory,
    resetStats,
    handleThreatDetected,
  ]);

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
  }, [deviceContext?.telemetry?.receivedAt, isMonitoring]);

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
