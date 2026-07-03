/**
 * 🚨 Threat Trigger Detection Service
 * 
 * Monitors lightweight signals continuously and detects triggers
 * when abnormal patterns occur (HR spike, motion abnormal, loud sound)
 * 
 * This is the EVENT that starts the threat detection pipeline!
 */

export class ThreatTriggerService {
  constructor() {
    // Baseline calibration (first 2 minutes)
    this.baselineHR = null;
    this.calibrationSamples = [];
    this.calibrationDuration = 120000; // 2 minutes
    this.calibrationStartTime = null;
    this.isCalibrated = false;

    // Thresholds (relative to baseline)
    this.hrSpikeThreshold = 25; // bpm above baseline
    // Accel jerk detection uses raw accelerometer deviation from 1.0g.
    // Typical sudden jerk / impact values are in the ~0.0-2.0+ g range.
    this.accelJerkThreshold = 0.3; // g's
    this.loudSoundThreshold = 70; // 0-100 audio level scale

    // Debouncing (avoid single-reading false positives)
    // Use separate requirements per signal: HR needs more consecutive confirmations,
    // motion and sound can be fewer readings to stay responsive.
    this.consecutiveReadingsRequiredHr = 5;
    // Require more than one sample to avoid one-off IMU spikes
    this.consecutiveReadingsRequiredMotion = 2;
    this.consecutiveReadingsRequiredSound = 2;
    this.triggerCounts = {
      hr_spike: 0,
      motion_abnormal: 0,
      loud_sound: 0,
    };

    // Cooldown (don't trigger too frequently)
    this.lastTriggerTime = 0;
    this.triggerCooldownMs = 5000; // 5 seconds between triggers
    // Let the sensor settle before motion triggers are allowed
    this.motionSamplesSeen = 0;
    this.motionWarmupSamples = 4;
    // Inhibition state to temporarily ignore triggers while processing a capture
    this.inhibited = false;
    this._inhibitTimeout = null;

    // Default inhibition safety window after a trigger (ms)
    this.defaultInhibitMs = 20000; // 20s
    // Track last heart rate reading to detect sudden jumps
    this.lastHeartRate = null;
    this.lastDecisionDebug = null;
    this.lastNoTriggerLogAt = 0;
  }

  /**
   * Normalize IMU values into a conservative 0-10 motion score.
   * Yaw is damped because it tends to drift even when the device is still.
   */
  getNormalizedMotion(telemetry) {
    if (!telemetry) return 0;

    const roll = Number(telemetry.roll) || 0;
    const pitch = Number(telemetry.pitch) || 0;
    const yaw = (Number(telemetry.yaw) || 0) * 0.35;

    const rawMotion = Math.sqrt(
      roll * roll +
      pitch * pitch +
      yaw * yaw
    );

    return Math.min(10, rawMotion / 5);
  }

  /**
   * Normalize and validate heart-rate input.
   * Treat 0/invalid/finger-off values as unavailable data.
   */
  getValidHeartRate(telemetry) {
    const raw = Number(telemetry?.heartRate);
    const fingerOn = telemetry?.fingerOn;

    if (!Number.isFinite(raw)) return null;
    if (fingerOn === false) return null;

    // Typical wearable HR range; reject zero/noise/outliers.
    if (raw < 35 || raw > 220) return null;

    return raw;
  }

  /**
   * 📊 Calibrate baseline using first readings
   * @param {object} telemetry - Current {heartRate, roll, pitch, yaw, audioLevel}
   */
  startCalibration(telemetry) {
    if (this.calibrationStartTime === null) {
      this.calibrationStartTime = Date.now();
      console.log('🔧 [ThreatTrigger] Calibration started - sampling for 2 minutes...');
    }

    const validHeartRate = this.getValidHeartRate(telemetry);
    if (validHeartRate !== null) {
      this.calibrationSamples.push(validHeartRate);
    }

    const elapsedMs = Date.now() - this.calibrationStartTime;
    if (elapsedMs >= this.calibrationDuration) {
      // Calculate baseline from valid samples, with a safe fallback.
      if (this.calibrationSamples.length > 0) {
        this.baselineHR = Math.round(
          this.calibrationSamples.reduce((a, b) => a + b, 0) / this.calibrationSamples.length
        );
      } else {
        this.baselineHR = 75;
        console.warn('⚠️ [ThreatTrigger] No valid HR samples during calibration. Using fallback baseline 75 bpm.');
      }
      this.isCalibrated = true;
      console.log(`✅ [ThreatTrigger] Calibration complete! Baseline HR: ${this.baselineHR} bpm`);
      return true;
    }

    return false;
  }

  /**
   * 🎯 Analyze current telemetry for triggers
   * @param {object} telemetry - {heartRate, roll, pitch, yaw, audioLevel}
   * @returns {array} Array of trigger objects if detected
   */
  analyzeTelemetry(telemetry) {
    if (this.inhibited) {
      // When inhibited, ignore incoming telemetry for triggering
      return [];
    }

    if (!this.isCalibrated) {
      // Keep collecting HR samples for calibration, but do not block other triggers.
      this.startCalibration(telemetry);
    }

    const triggers = [];

    const validHeartRate = this.getValidHeartRate(telemetry);

    // ═══════════════════════════════════════════
    // TRIGGER A: Heart Rate Spike (allow immediately, use fallback baseline)
    // ═══════════════════════════════════════════════════════════════════
    // Use a safe fallback baseline when calibration hasn't completed yet
    const baselineUsed = Number.isFinite(this.baselineHR) ? this.baselineHR : 75;
    // Require both exceeding baseline+threshold AND a sudden jump to avoid brief touch artifacts
    const hrDelta = validHeartRate !== null && Number.isFinite(this.lastHeartRate)
      ? Math.abs(validHeartRate - this.lastHeartRate)
      : 0;
    const suddenHRJump = hrDelta >= 10; // bpm required change since last sample
    const hrSpike =
      validHeartRate !== null &&
      validHeartRate > baselineUsed + this.hrSpikeThreshold &&
      suddenHRJump;
    
    if (hrSpike) {
      this.triggerCounts.hr_spike++;
    } else {
      this.triggerCounts.hr_spike = 0; // Reset counter
    }

    if (this.triggerCounts.hr_spike >= this.consecutiveReadingsRequiredHr) {
      triggers.push({
        type: 'HR_SPIKE',
        value: validHeartRate,
        baseline: this.baselineHR,
        spike: validHeartRate - this.baselineHR,
        severity: 'MEDIUM',
        description: `Heart rate spike: ${validHeartRate} bpm (baseline: ${this.baselineHR})`,
      });
      console.log(`⚠️ [ThreatTrigger] HR_SPIKE detected: ${validHeartRate} bpm`);
    }

    // ═══════════════════════════════════════════
    // TRIGGER B: Motion Abnormality (use raw accelJerk from firmware)
    // ═══════════════════════════════════════════
    const accelJerk = Number(telemetry?.accelJerk) || 0;

    this.motionSamplesSeen += 1;

    const motionReady = this.motionSamplesSeen >= this.motionWarmupSamples;
    const motionAbnormal = motionReady && accelJerk >= this.accelJerkThreshold;

    if (motionAbnormal) {
      this.triggerCounts.motion_abnormal++;
    } else {
      this.triggerCounts.motion_abnormal = 0;
    }

    if (this.triggerCounts.motion_abnormal >= this.consecutiveReadingsRequiredMotion) {
      triggers.push({
        type: 'MOTION_ABNORMAL',
        value: accelJerk,
        threshold: this.accelJerkThreshold,
        severity: 'MEDIUM',
        description: `Motion jerk detected: ${accelJerk.toFixed(3)}g (threshold: ${this.accelJerkThreshold}g)`,
      });
      console.log(`⚠️ [ThreatTrigger] MOTION_ABNORMAL detected: ${accelJerk.toFixed(3)}g`);
    }

    // Update last heart rate reading for next delta calculation
    if (validHeartRate !== null) {
      this.lastHeartRate = validHeartRate;
    }

    // ═══════════════════════════════════════════
    // TRIGGER C: Loud Sound
    // ═══════════════════════════════════════════
    const loudSound = telemetry.audioLevel > this.loudSoundThreshold;

    if (loudSound) {
      this.triggerCounts.loud_sound++;
    } else {
      this.triggerCounts.loud_sound = 0;
    }

    if (this.triggerCounts.loud_sound >= this.consecutiveReadingsRequiredSound) {
      triggers.push({
        type: 'LOUD_SOUND',
        value: telemetry.audioLevel,
        threshold: this.loudSoundThreshold,
        severity: 'LOW',
        description: `Loud sound detected: ${telemetry.audioLevel}/100 (threshold: ${this.loudSoundThreshold})`,
      });
      console.log(`⚠️ [ThreatTrigger] LOUD_SOUND detected: ${telemetry.audioLevel}/100`);
    }

    return triggers;
  }

  /**
   * Temporarily inhibit triggers (used to prevent concurrent captures)
   * @param {number} ms - optional milliseconds to auto-release inhibition
   */
  inhibit(ms) {
    this.inhibited = true;
    // Reset counters to avoid carry-over
    this.resetTriggerCounters();
    if (this._inhibitTimeout) clearTimeout(this._inhibitTimeout);
    const timeoutMs = typeof ms === 'number' ? ms : this.defaultInhibitMs;
    this._inhibitTimeout = setTimeout(() => {
      this.releaseInhibition();
    }, timeoutMs);
    console.log(`🔕 [ThreatTrigger] Triggers inhibited for ${timeoutMs}ms`);
  }

  /**
   * Release inhibition immediately
   */
  releaseInhibition() {
    if (this._inhibitTimeout) {
      clearTimeout(this._inhibitTimeout);
      this._inhibitTimeout = null;
    }
    this.inhibited = false;
    console.log('🔔 [ThreatTrigger] Triggers re-enabled');
  }

  /**
   * 🚨 Evaluate if audio capture should be triggered
   * @param {array} triggers - Array of detected triggers
   * @returns {string|null} "HIGH", "MEDIUM", or null
   */
  shouldCaptureAudio(triggers, debugContext = {}) {
    const now = Date.now();
    const cooldownRemainingMs = Math.max(0, this.triggerCooldownMs - (now - this.lastTriggerTime));

    if (triggers.length === 0) {
      this.lastDecisionDebug = {
        timestamp: new Date().toISOString(),
        decision: null,
        reason: 'No triggers detected',
        triggerCount: 0,
        triggerTypes: [],
        cooldownRemainingMs,
        triggerCounts: { ...this.triggerCounts },
        inhibited: this.inhibited,
        debugContext,
      };
      if (now - this.lastNoTriggerLogAt >= 10000) {
        console.log('ℹ️ [ThreatTrigger] shouldCaptureAudio -> null (no triggers)', this.lastDecisionDebug);
        this.lastNoTriggerLogAt = now;
      }
      return null;
    }

    // Check cooldown to avoid too frequent captures
    if (now - this.lastTriggerTime < this.triggerCooldownMs) {
      this.lastDecisionDebug = {
        timestamp: new Date().toISOString(),
        decision: null,
        reason: 'Cooldown active',
        triggerCount: triggers.length,
        triggerTypes: triggers.map((trigger) => trigger.type),
        cooldownRemainingMs,
        triggerCounts: { ...this.triggerCounts },
        inhibited: this.inhibited,
        debugContext,
      };
      console.log('⏳ [ThreatTrigger] shouldCaptureAudio -> null (cooldown active)', this.lastDecisionDebug);
      return null;
    }

    // Multi-trigger logic
    if (triggers.length >= 2) {
      this.lastDecisionDebug = {
        timestamp: new Date().toISOString(),
        decision: 'HIGH',
        reason: 'Multiple triggers detected',
        triggerCount: triggers.length,
        triggerTypes: triggers.map((trigger) => trigger.type),
        cooldownRemainingMs: 0,
        triggerCounts: { ...this.triggerCounts },
        inhibited: this.inhibited,
        debugContext,
      };
      console.log('🔴 [ThreatTrigger] shouldCaptureAudio -> HIGH (multiple triggers)', this.lastDecisionDebug);
      this.lastTriggerTime = now;
      return 'HIGH';
    }

    if (triggers.length === 1) {
      const trigger = triggers[0];
      
      // Single loud sound alone is not enough (false positive prone)
      if (trigger.type === 'LOUD_SOUND') {
        this.lastDecisionDebug = {
          timestamp: new Date().toISOString(),
          decision: null,
          reason: 'Single LOUD_SOUND trigger ignored to reduce false positives',
          triggerCount: 1,
          triggerTypes: [trigger.type],
          cooldownRemainingMs: 0,
          triggerCounts: { ...this.triggerCounts },
          inhibited: this.inhibited,
          debugContext,
        };
        console.log('ℹ️ [ThreatTrigger] shouldCaptureAudio -> null (single loud sound ignored)', this.lastDecisionDebug);
        return null;
      }

      // HR spike or motion abnormal alone is worth checking
      this.lastDecisionDebug = {
        timestamp: new Date().toISOString(),
        decision: 'MEDIUM',
        reason: `Single ${trigger.type} trigger`,
        triggerCount: 1,
        triggerTypes: [trigger.type],
        cooldownRemainingMs: 0,
        triggerCounts: { ...this.triggerCounts },
        inhibited: this.inhibited,
        debugContext,
      };
      console.log(`⚠️ [ThreatTrigger] shouldCaptureAudio -> MEDIUM (single ${trigger.type})`, this.lastDecisionDebug);
      this.lastTriggerTime = now;
      return 'MEDIUM';
    }

    this.lastDecisionDebug = {
      timestamp: new Date().toISOString(),
      decision: null,
      reason: 'No capture condition matched',
      triggerCount: triggers.length,
      triggerTypes: triggers.map((trigger) => trigger.type),
      cooldownRemainingMs,
      triggerCounts: { ...this.triggerCounts },
      inhibited: this.inhibited,
      debugContext,
    };
    return null;
  }

  getLastDecisionDebug() {
    return this.lastDecisionDebug;
  }

  getDebugState() {
    const now = Date.now();
    return {
      timestamp: new Date().toISOString(),
      inhibited: this.inhibited,
      isCalibrated: this.isCalibrated,
      baselineHR: this.baselineHR,
      lastTriggerTime: this.lastTriggerTime,
      triggerCooldownMs: this.triggerCooldownMs,
      cooldownRemainingMs: Math.max(0, this.triggerCooldownMs - (now - this.lastTriggerTime)),
      triggerCounts: { ...this.triggerCounts },
      lastDecisionDebug: this.lastDecisionDebug,
    };
  }

  /**
   * 🔧 Update thresholds dynamically (e.g., GPS-based)
   * @param {string} context - 'safe_zone', 'risky_zone', 'very_risky_zone'
   */
  updateThresholds(context) {
    switch (context) {
      case 'safe_zone':
        this.hrSpikeThreshold = 30; // Higher threshold (less sensitive)
        this.motionJerkThreshold = 2.9;
        console.log('🟢 [ThreatTrigger] Safe zone thresholds applied');
        break;

      case 'risky_zone':
        this.hrSpikeThreshold = 20; // Lower threshold (more sensitive)
        this.motionJerkThreshold = 2.4;
        console.log('🟡 [ThreatTrigger] Risky zone thresholds applied');
        break;

      case 'very_risky_zone':
        this.hrSpikeThreshold = 15; // Very low threshold (very sensitive)
        this.motionJerkThreshold = 1.8;
        console.log('🔴 [ThreatTrigger] Very risky zone thresholds applied');
        break;

      default:
        break;
    }
  }

  /**
   * 📊 Get calibration status
   */
  getCalibrationStatus() {
    if (!this.isCalibrated && this.calibrationStartTime) {
      const elapsedSec = Math.round((Date.now() - this.calibrationStartTime) / 1000);
      return {
        isCalibrated: false,
        elapsedSeconds: elapsedSec,
        remainingSeconds: Math.max(0, 120 - elapsedSec),
      };
    }

    return {
      isCalibrated: this.isCalibrated,
      baselineHR: this.baselineHR,
    };
  }

  /**
   * 🔄 Reset trigger counters (used after capture)
   */
  resetTriggerCounters() {
    this.triggerCounts = {
      hr_spike: 0,
      motion_abnormal: 0,
      loud_sound: 0,
    };
    console.log('🔄 [ThreatTrigger] Trigger counters reset');
  }

  /**
   * 🔄 Reset calibration state when monitoring session restarts
   */
  resetCalibration() {
    this.baselineHR = null;
    this.calibrationSamples = [];
    this.calibrationStartTime = null;
    this.isCalibrated = false;
    this.lastTriggerTime = 0;
    this.resetTriggerCounters();
    console.log('🔄 [ThreatTrigger] Calibration reset');
  }
}

// Export singleton instance
export default new ThreatTriggerService();
