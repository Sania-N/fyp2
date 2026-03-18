// services/dangerDetectionService.js
import { API_BASE_URL } from '../api';
import { addGeoFenceAlertHistoryItem } from './geoFenceService';

/**
 * Call the multimodal-predict endpoint to assess danger risk
 * @param {number} emotionConfidence - Confidence level of detected emotion (0-1)
 * @returns {Promise<{risk_level: string, motion_used: number, heart_rate_used: number}>}
 */
export async function analyzeUserDangerLevel(emotionConfidence) {
  try {
    // Generate random sensor data for motion and heart rate
    const motion = Math.random() * 10; // 0-10
    const heartRate = 70 + Math.random() * 50; // 70-120
    const eventTimestamp = new Date().toISOString();

    await addGeoFenceAlertHistoryItem({
      message: `Danger analysis started: emotion_confidence=${Number(emotionConfidence).toFixed(3)}, motion=${motion.toFixed(2)}, heart_rate=${heartRate.toFixed(0)} bpm`,
      timestamp: eventTimestamp,
      eventType: 'DANGER_ANALYSIS_STARTED',
      details: {
        emotionConfidence: Number(emotionConfidence),
        motion,
        heartRate,
      },
    });

    const response = await fetch(`${API_BASE_URL}/multimodal-predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emotion_confidence: emotionConfidence,
        motion: motion,
        heart_rate: heartRate,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('🔍 Danger analysis result:', data);

    const resolvedMotion =
      typeof data?.motion_used === 'number' ? data.motion_used : motion;
    const resolvedHeartRate =
      typeof data?.heart_rate_used === 'number' ? data.heart_rate_used : heartRate;

    await addGeoFenceAlertHistoryItem({
      message: `Danger analysis result: risk=${data?.risk_level || 'UNKNOWN'}, emotion_confidence=${Number(emotionConfidence).toFixed(3)}, motion=${resolvedMotion.toFixed(2)}, heart_rate=${resolvedHeartRate.toFixed(0)} bpm`,
      eventType: 'DANGER_ANALYSIS_RESULT',
      details: {
        emotionConfidence: Number(emotionConfidence),
        motion: resolvedMotion,
        heartRate: resolvedHeartRate,
        riskLevel: data?.risk_level || 'UNKNOWN',
      },
    });

    return data;
  } catch (error) {
    console.error('❌ Error analyzing danger level:', error);
    await addGeoFenceAlertHistoryItem({
      message: `Danger analysis failed: ${error?.message || 'Unknown error'}`,
      eventType: 'DANGER_ANALYSIS_FAILED',
      details: {
        emotionConfidence: Number(emotionConfidence),
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
  return riskLevel === 'DANGER';
}
