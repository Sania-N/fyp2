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
    this.motionAbnormalThreshold = 30; // degrees magnitude
    // Require a sudden change (delta) to avoid static tilt false positives
    this.motionDeltaThreshold = 15; // degrees change within short interval
    this.loudSoundThreshold = 70; // 0-100 audio level scale

    // Debouncing (avoid single-reading false positives)
    this.consecutiveReadingsRequired = 3;
    this.triggerCounts = {
      hr_spike: 0,
      motion_abnormal: 0,
      loud_sound: 0,
    };

    // Cooldown (don't trigger too frequently)
    this.lastTriggerTime = 0;
    this.triggerCooldownMs = 5000; // 5 seconds between triggers
    // Track last motion magnitude/time to detect deltas
    this.lastMotionMagnitude = 0;
    this.lastMotionAt = 0;
    // Inhibition state to temporarily ignore triggers while processing a capture
    this.inhibited = false;
    this._inhibitTimeout = null;

    // Default inhibition safety window after a trigger (ms)
    this.defaultInhibitMs = 20000; // 20s
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

    this.calibrationSamples.push(telemetry.heartRate);

    const elapsedMs = Date.now() - this.calibrationStartTime;
    if (elapsedMs >= this.calibrationDuration) {
      // Calculate baseline (average of samples)
      this.baselineHR = Math.round(
        this.calibrationSamples.reduce((a, b) => a + b, 0) / this.calibrationSamples.length
      );
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
      const calibrated = this.startCalibration(telemetry);
      if (!calibrated) {
        return []; // Still calibrating
      }
    }

    const triggers = [];

    // ═══════════════════════════════════════════
    // TRIGGER A: Heart Rate Spike
    // ═══════════════════════════════════════════
    const hrSpike = telemetry.heartRate > this.baselineHR + this.hrSpikeThreshold;
    
    if (hrSpike) {
      this.triggerCounts.hr_spike++;
    } else {
      this.triggerCounts.hr_spike = 0; // Reset counter
    }

    if (this.triggerCounts.hr_spike >= this.consecutiveReadingsRequired) {
      triggers.push({
        type: 'HR_SPIKE',
        value: telemetry.heartRate,
        baseline: this.baselineHR,
        spike: telemetry.heartRate - this.baselineHR,
        severity: 'MEDIUM',
        description: `Heart rate spike: ${telemetry.heartRate} bpm (baseline: ${this.baselineHR})`,
      });
      console.log(`⚠️ [ThreatTrigger] HR_SPIKE detected: ${telemetry.heartRate} bpm`);
    }

    // ═══════════════════════════════════════════
    // TRIGGER B: Motion Abnormality
    // ═══════════════════════════════════════════
    const motionMagnitude = Math.sqrt(
      telemetry.roll * telemetry.roll +
      telemetry.pitch * telemetry.pitch +
      telemetry.yaw * telemetry.yaw
    );

    // Compute delta since last sample
    const now = Date.now();
    const delta = Math.abs(motionMagnitude - (this.lastMotionMagnitude || 0));
    const deltaMs = now - (this.lastMotionAt || now);

    // Consider motion abnormal only if both magnitude exceeds threshold AND there
    // is a sudden change (delta) within a short interval. This avoids static tilt
    // (device placed at angle) from triggering.
    const suddenChange = delta >= this.motionDeltaThreshold && deltaMs < 2000; // within 2s
    const motionAbnormal = motionMagnitude > this.motionAbnormalThreshold && suddenChange;

    if (motionAbnormal) {
      this.triggerCounts.motion_abnormal++;
    } else {
      this.triggerCounts.motion_abnormal = 0;
    }

    if (this.triggerCounts.motion_abnormal >= this.consecutiveReadingsRequired) {
      triggers.push({
        type: 'MOTION_ABNORMAL',
        value: motionMagnitude,
        threshold: this.motionAbnormalThreshold,
        delta: delta,
        severity: 'MEDIUM',
        description: `Motion detected: ${motionMagnitude.toFixed(1)}° (delta ${delta.toFixed(1)}°, threshold: ${this.motionAbnormalThreshold}°)`,
      });
      console.log(`⚠️ [ThreatTrigger] MOTION_ABNORMAL detected: ${motionMagnitude.toFixed(1)}° (delta ${delta.toFixed(1)}°)`);
    }

    // Update last motion tracking
    this.lastMotionMagnitude = motionMagnitude;
    this.lastMotionAt = now;

    // ═══════════════════════════════════════════
    // TRIGGER C: Loud Sound
    // ═══════════════════════════════════════════
    const loudSound = telemetry.audioLevel > this.loudSoundThreshold;

    if (loudSound) {
      this.triggerCounts.loud_sound++;
    } else {
      this.triggerCounts.loud_sound = 0;
    }

    if (this.triggerCounts.loud_sound >= this.consecutiveReadingsRequired) {
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
  shouldCaptureAudio(triggers) {
    if (triggers.length === 0) return null;

    // Check cooldown to avoid too frequent captures
    const now = Date.now();
    if (now - this.lastTriggerTime < this.triggerCooldownMs) {
      console.log('⏳ [ThreatTrigger] In cooldown period, skipping capture');
      return null;
    }

    // Multi-trigger logic
    if (triggers.length >= 2) {
      console.log('🔴 [ThreatTrigger] MULTIPLE TRIGGERS - HIGH confidence threat');
      this.lastTriggerTime = now;
      return 'HIGH';
    }

    if (triggers.length === 1) {
      const trigger = triggers[0];
      
      // Single loud sound alone is not enough (false positive prone)
      if (trigger.type === 'LOUD_SOUND') {
        console.log('⚠️ [ThreatTrigger] Single LOUD_SOUND - MEDIUM confidence (could be dog bark, music)');
        this.lastTriggerTime = now;
        return 'MEDIUM';
      }

      // HR spike or motion abnormal alone is worth checking
      console.log(`⚠️ [ThreatTrigger] Single ${trigger.type} - MEDIUM confidence`);
      this.lastTriggerTime = now;
      return 'MEDIUM';
    }

    return null;
  }

  /**
   * 🔧 Update thresholds dynamically (e.g., GPS-based)
   * @param {string} context - 'safe_zone', 'risky_zone', 'very_risky_zone'
   */
  updateThresholds(context) {
    switch (context) {
      case 'safe_zone':
        this.hrSpikeThreshold = 30; // Higher threshold (less sensitive)
        this.motionAbnormalThreshold = 35;
        console.log('🟢 [ThreatTrigger] Safe zone thresholds applied');
        break;

      case 'risky_zone':
        this.hrSpikeThreshold = 20; // Lower threshold (more sensitive)
        this.motionAbnormalThreshold = 25;
        console.log('🟡 [ThreatTrigger] Risky zone thresholds applied');
        break;

      case 'very_risky_zone':
        this.hrSpikeThreshold = 15; // Very low threshold (very sensitive)
        this.motionAbnormalThreshold = 20;
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
