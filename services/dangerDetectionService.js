// services/dangerDetectionService.js
import { API_BASE_URL } from '../api';
import { addGeoFenceAlertHistoryItem } from './geoFenceService';

/**
 * 📱 Calculate motion magnitude from IMU data
 * @param {object} telemetry - ESP32 telemetry with roll, pitch, yaw
 * @returns {number} Motion value (0-10 scale)
 */
function calculateMotionFromIMU(telemetry) {
  if (!telemetry) return 0;
  
  const { roll = 0, pitch = 0, yaw = 0 } = telemetry;
  
  // Calculate magnitude of angle vector
  const motionMagnitude = Math.sqrt(
    roll * roll + pitch * pitch + yaw * yaw
  );
  
  // Normalize to 0-10 scale
  // Typical motion: 0-50 degrees, map to 0-10
  const normalizedMotion = Math.min(10, motionMagnitude / 5);
  
  return Number(normalizedMotion.toFixed(2));
}

/**
 * 🎤 Call multimodal threat detection with REAL hardware data
 * @param {number} emotionConfidence - From audio analysis (0-1)
 * @param {object} esp32Telemetry - Real sensor data from watch (OPTIONAL)
 * @returns {Promise<{risk_level, motion_used, heart_rate_used}>}
 */
export async function analyzeUserDangerLevel(emotionConfidence, esp32Telemetry = null) {
  try {
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

    await addGeoFenceAlertHistoryItem({
      message: `🔴 Threat Analysis START: emotion_confidence=${Number(emotionConfidence).toFixed(3)}, motion=${motion.toFixed(2)}, heart_rate=${heartRate} bpm, audio_level=${audioLevel.toFixed(0)}, hardware=${usingHardwareData ? '✅' : '❌'}`,
      timestamp: eventTimestamp,
      eventType: 'DANGER_ANALYSIS_STARTED',
      details: {
        emotionConfidence: Number(emotionConfidence),
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

    const response = await fetch(`${API_BASE_URL}/multimodal-predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emotion_confidence: emotionConfidence,
        motion: motion,              // ✅ REAL IMU data or fallback
        heart_rate: heartRate,       // ✅ REAL PPG data or fallback
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
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

    await addGeoFenceAlertHistoryItem({
      message: `🔴 Threat Analysis RESULT: risk=${normalizedRiskLevel}, emotion=${Number(emotionConfidence).toFixed(3)}, motion=${resolvedMotion.toFixed(2)}, heart_rate=${resolvedHeartRate} bpm, audio=${audioLevel.toFixed(0)}, threatDetected=${isDangerRisk(normalizedRiskLevel) ? '🚨 YES' : '✓ No'}`,
      eventType: 'DANGER_ANALYSIS_RESULT',
      details: {
        emotionConfidence: Number(emotionConfidence),
        motion: resolvedMotion,
        heartRate: resolvedHeartRate,
        audioLevel,
        riskLevel: normalizedRiskLevel,
        threatDetected: isDangerRisk(normalizedRiskLevel),
        hardwareDataUsed: usingHardwareData,
      },
    });

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
  return normalized === 'DANGER' || normalized === 'HIGH' || normalized === 'THREAT' || normalized === 'SUSPICIOUS' || normalized === '1';
}
