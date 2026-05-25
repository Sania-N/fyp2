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
    // Motion thresholds are on a 0-10 normalized scale (see calculateMotionFromIMU)
    // Lowered for higher sensitivity to smaller movements
    this.motionAbnormalThreshold = 3; // 0-10 scale (more sensitive)
    // Require a smaller sudden change to catch quick small movements (0-10 scale)
    this.motionDeltaThreshold = 1.0; // normalized change within short interval
    this.loudSoundThreshold = 70; // 0-100 audio level scale

    // Debouncing (avoid single-reading false positives)
    // Use separate requirements per signal: HR needs more consecutive confirmations,
    // motion and sound can be fewer readings to stay responsive.
    this.consecutiveReadingsRequiredHr = 5;
    // Make motion responsive: single confirmation is enough
    this.consecutiveReadingsRequiredMotion = 1;
    this.consecutiveReadingsRequiredSound = 2;
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
    // Track last heart rate reading to detect sudden jumps
    this.lastHeartRate = null;
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
    // TRIGGER B: Motion Abnormality (use normalized 0-10 motion)
    // ═══════════════════════════════════════════
    const rawMotion = Math.sqrt(
      (telemetry.roll || 0) * (telemetry.roll || 0) +
      (telemetry.pitch || 0) * (telemetry.pitch || 0) +
      (telemetry.yaw || 0) * (telemetry.yaw || 0)
    );

    // Normalize to 0-10 (same logic as dangerDetectionService.calculateMotionFromIMU)
    const motionMagnitude = Math.min(10, rawMotion / 5);

    // Compute delta since last sample (normalized scale)
    const now = Date.now();
    const delta = Math.abs(motionMagnitude - (this.lastMotionMagnitude || 0));
    const deltaMs = now - (this.lastMotionAt || now);

    const suddenChange = delta >= this.motionDeltaThreshold && deltaMs < 2000; // within 2s
    const motionAbnormal = motionMagnitude > this.motionAbnormalThreshold && suddenChange;

    if (motionAbnormal) {
      this.triggerCounts.motion_abnormal++;
    } else {
      this.triggerCounts.motion_abnormal = 0;
    }

    if (this.triggerCounts.motion_abnormal >= this.consecutiveReadingsRequiredMotion) {
      triggers.push({
        type: 'MOTION_ABNORMAL',
        value: motionMagnitude,
        threshold: this.motionAbnormalThreshold,
        delta: delta,
        severity: 'MEDIUM',
        description: `Motion detected: ${motionMagnitude.toFixed(2)} (delta ${delta.toFixed(2)}, threshold: ${this.motionAbnormalThreshold})`,
      });
      console.log(`⚠️ [ThreatTrigger] MOTION_ABNORMAL detected: ${motionMagnitude.toFixed(2)} (delta ${delta.toFixed(2)})`);
    }

    // Update last motion tracking (store normalized value)
    this.lastMotionMagnitude = motionMagnitude;
    this.lastMotionAt = now;

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
