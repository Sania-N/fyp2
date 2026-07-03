// services/dangerDetectionService.js
import { API_BASE_URL } from '../api';
import { addGeoFenceAlertHistoryItem } from './geoFenceService';

const PANIC_EMOTIONS = new Set(['fear', 'angry']);

function serializeLog(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return JSON.stringify({ serializationError: error?.message || String(error) }, null, 2);
  }
}

/**
 * 📱 Calculate motion magnitude from IMU data
 * @param {object} telemetry - ESP32 telemetry with roll, pitch, yaw
 * @returns {number} Motion value (0-10 scale)
 */
function calculateMotionFromIMU(telemetry) {
  if (!telemetry) return 0;
  
  const { roll = 0, pitch = 0, yaw = 0 } = telemetry;
  const dampedYaw = yaw * 0.35;
  
  // Calculate magnitude of angle vector
  const motionMagnitude = Math.sqrt(
    roll * roll + pitch * pitch + dampedYaw * dampedYaw
  );
  
  // Normalize to 0-10 scale
  // Typical motion: 0-50 degrees, map to 0-10
  const normalizedMotion = Math.min(10, motionMagnitude / 5);
  
  return Number(normalizedMotion.toFixed(2));
}

function normalizeEmotionLabel(emotionLabel) {
  return String(emotionLabel || '').trim().toLowerCase();
}

function getEffectiveEmotionConfidence(emotionConfidence, emotionLabel) {
  const normalizedEmotionLabel = normalizeEmotionLabel(emotionLabel);
  const numericConfidence = Number(emotionConfidence);

  if (!Number.isFinite(numericConfidence) || numericConfidence <= 0) {
    return 0;
  }

  if (!normalizedEmotionLabel || !PANIC_EMOTIONS.has(normalizedEmotionLabel)) {
    return 0;
  }

  return numericConfidence;
}

/**
 * 🎤 Call multimodal threat detection with REAL hardware data
 * @param {number} emotionConfidence - From audio analysis (0-1)
 * @param {object} esp32Telemetry - Real sensor data from watch (OPTIONAL)
 * @param {object} debugContext - Logging/debug metadata
 * @param {string|null} emotionLabel - Classified emotion label for the confidence score
 * @returns {Promise<{risk_level, motion_used, heart_rate_used}>}
 */
export async function analyzeUserDangerLevel(emotionConfidence, esp32Telemetry = null, debugContext = {}, emotionLabel = null) {
  try {
    const normalizedEmotionLabel = normalizeEmotionLabel(emotionLabel ?? debugContext?.emotion ?? null);
    const effectiveEmotionConfidence = getEffectiveEmotionConfidence(emotionConfidence, normalizedEmotionLabel);

    // Extract real sensor values from ESP32 (if available)
    let motion, heartRate, audioLevel;
    let usingHardwareData = false;

    if (esp32Telemetry) {
      motion = calculateMotionFromIMU(esp32Telemetry);
      heartRate = esp32Telemetry?.heartRate || 0;
      audioLevel = esp32Telemetry?.audioLevel || 0;
      usingHardwareData = true;
      console.log('✅ Using REAL ESP32 hardware data for threat analysis');
    } else {
      // Fallback to random if no hardware data
      motion = Math.random() * 10;
      heartRate = 70 + Math.random() * 50;
      audioLevel = Math.random() * 100;
      console.log('⚠️ No ESP32 data available, using fallback random values');
    }

    const eventTimestamp = new Date().toISOString();

    console.log('[RealtimeThreat][STEP 1] Realtime check started');
    console.log(serializeLog({
      timestamp: eventTimestamp,
      currentScreenOrFeature: debugContext.currentScreenOrFeature || 'dangerDetectionService.analyzeUserDangerLevel',
      triggerSource: debugContext.triggerSource || 'unknown',
      captureArmed: true,
      audioCaptureActive: false,
      currentSensorSnapshot: esp32Telemetry || null,
      recordingId: debugContext.recordingId || null,
      emotionLabel: normalizedEmotionLabel || null,
      emotionConfidence: Number(emotionConfidence),
      effectiveEmotionConfidence,
    }));

    const requestUrl = `${API_BASE_URL}/multimodal-predict`;
    const requestHeaders = {
      'Content-Type': 'application/json',
    };
    const requestBody = {
      emotion_confidence: effectiveEmotionConfidence,
      motion,
      heart_rate: heartRate,
    };

    console.log('[RealtimeThreat][STEP 2] Right before the request is sent');
    console.log(serializeLog({
      timestamp: eventTimestamp,
      endpointUrl: requestUrl,
      requestHeaders,
      fullRequestBody: requestBody,
      localComputedValues: {
        emotionConfidence: Number(emotionConfidence),
        emotionLabel: normalizedEmotionLabel || null,
        effectiveEmotionConfidence,
        motion,
        heartRate,
        audioLevel,
        usingHardwareData,
        debugContext,
      },
      exactReasonRequestIsBeingSent: debugContext.requestReason || 'Need multimodal threat risk from emotion confidence plus sensor data',
    }));

    await addGeoFenceAlertHistoryItem({
      message: `🔴 Threat Analysis START: emotion=${normalizedEmotionLabel || 'unknown'}, emotion_confidence=${effectiveEmotionConfidence.toFixed(3)}, motion=${motion.toFixed(2)}, heart_rate=${heartRate} bpm, audio_level=${audioLevel.toFixed(0)}, hardware=${usingHardwareData ? '✅' : '❌'}`,
      timestamp: eventTimestamp,
      eventType: 'DANGER_ANALYSIS_STARTED',
      details: {
        emotionConfidence: Number(emotionConfidence),
        emotionLabel: normalizedEmotionLabel || null,
        effectiveEmotionConfidence,
        motion,
        heartRate,
        audioLevel,
        hardwareDataUsed: usingHardwareData,
        imuData: usingHardwareData ? {
          roll: esp32Telemetry?.roll,
          pitch: esp32Telemetry?.pitch,
          yaw: esp32Telemetry?.yaw,
        } : null,
        ppgData: usingHardwareData ? {
          fingerOn: esp32Telemetry?.fingerOn,
          spo2: esp32Telemetry?.spo2,
        } : null,
      },
    });

    const requestStartAt = Date.now();
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    });

    const responseTimeMs = Date.now() - requestStartAt;
    const rawResponseBody = await response.text();
    let parsedResponse = null;
    let parsingError = null;
    try {
      parsedResponse = rawResponseBody ? JSON.parse(rawResponseBody) : null;
    } catch (error) {
      parsingError = error?.message || String(error);
    }

    console.log('[RealtimeThreat][STEP 3] Right after the request returns');
    console.log(serializeLog({
      timestamp: new Date().toISOString(),
      httpStatusCode: response.status,
      responseTimeMs,
      rawResponseBody,
      parsedJsonResponse: parsedResponse,
      parsingError,
    }));

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    if (parsingError) {
      throw new Error(`API response parsing failed: ${parsingError}`);
    }

    const data = parsedResponse;
    const normalizedRiskLevel = String(data?.risk_level || 'UNKNOWN')
      .trim()
      .toUpperCase();
    
    console.log('🔍 THREAT ANALYSIS RESULT:', { 
      ...data, 
      normalizedRiskLevel,
      hardwareSensors: { motion, heartRate, audioLevel },
      dataSource: usingHardwareData ? 'ESP32' : 'FALLBACK'
    });

    const resolvedMotion =
      typeof data?.motion_used === 'number' ? data.motion_used : motion;
    const resolvedHeartRate =
      typeof data?.heart_rate_used === 'number' ? data.heart_rate_used : heartRate;

    console.log('[RealtimeThreat][STEP 4] Frontend decision logic after trigger evaluation');
    console.log(serializeLog({
      timestamp: new Date().toISOString(),
      responseTreatedAsThreat: isDangerRisk(normalizedRiskLevel),
      exactConditionThatCausedDecision: `risk_level normalized to ${normalizedRiskLevel}`,
      captureSkippedOrTriggered: isDangerRisk(normalizedRiskLevel) ? 'triggered' : 'skipped',
      confidence: effectiveEmotionConfidence,
      emotionLabel: normalizedEmotionLabel || null,
      risk_level: normalizedRiskLevel,
      emotion: data?.emotion ?? null,
      panic: data?.panic ?? null,
      motion_used: resolvedMotion,
      heart_rate_used: resolvedHeartRate,
      trigger_reason: debugContext.requestReason || null,
    }));

    await addGeoFenceAlertHistoryItem({
      message: `🔴 Threat Analysis RESULT: risk=${normalizedRiskLevel}, emotion=${normalizedEmotionLabel || 'unknown'}, emotion_confidence=${effectiveEmotionConfidence.toFixed(3)}, motion=${resolvedMotion.toFixed(2)}, heart_rate=${resolvedHeartRate} bpm, audio=${audioLevel.toFixed(0)}, threatDetected=${isDangerRisk(normalizedRiskLevel) ? '🚨 YES' : '✓ No'}`,
      eventType: 'DANGER_ANALYSIS_RESULT',
      details: {
        emotionConfidence: Number(emotionConfidence),
        emotionLabel: normalizedEmotionLabel || null,
        effectiveEmotionConfidence,
        motion: resolvedMotion,
        heartRate: resolvedHeartRate,
        audioLevel,
        riskLevel: normalizedRiskLevel,
        threatDetected: isDangerRisk(normalizedRiskLevel),
        hardwareDataUsed: usingHardwareData,
      },
    });

    console.log('[RealtimeThreat][FINAL SUMMARY]');
    console.log(serializeLog({
      timestamp: new Date().toISOString(),
      wasThreatDetected: isDangerRisk(normalizedRiskLevel),
      wasCaptureTriggered: true,
      wasUploadSkipped: false,
      exactConditionThatDecidedIt: `risk_level normalized to ${normalizedRiskLevel}`,
      emotion: data?.emotion ?? null,
      confidence: effectiveEmotionConfidence,
      emotionLabel: normalizedEmotionLabel || null,
      panic: data?.panic ?? null,
      risk_level: normalizedRiskLevel,
      motion_used: resolvedMotion,
      heart_rate_used: resolvedHeartRate,
      trigger_reason: debugContext.requestReason || null,
      recordingId: debugContext.recordingId || null,
    }));

    return {
      ...data,
      risk_level: normalizedRiskLevel,
    };
  } catch (error) {
    console.error('❌ Error analyzing danger level:', error);
    await addGeoFenceAlertHistoryItem({
      message: `❌ Threat analysis failed: ${error?.message || 'Unknown error'}`,
      eventType: 'DANGER_ANALYSIS_FAILED',
      details: {
        emotionConfidence: Number(emotionConfidence),
        error: error?.message,
      },
    });
    throw error;
  }
}

/**
 * Check if user is in danger based on risk level
 * @param {string} riskLevel - Risk level from API ('SAFE', 'SUSPICIOUS', 'DANGER')
 * @returns {boolean}
 */
export function isDangerRisk(riskLevel) {
  const normalized = String(riskLevel || '').trim().toUpperCase();
  return normalized === 'DANGER' || normalized === 'HIGH' || normalized === 'THREAT' || normalized === '1';
}
