/**
 * 🎤 Audio Capture Service for Event-Driven Threat Detection
 * 
 * When trigger occurs:
 * 1. Start recording audio for 10 seconds
 * 2. Upload to Supabase
 * 3. Call threat detection endpoint
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase, supabaseUrl, supabaseKey } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Dynamic NetInfo loader: avoids static import so bundler won't fail if package absent
async function getNetworkState() {
  try {
    // require at runtime to avoid Metro resolving the package at bundle time
    // eslint-disable-next-line global-require
    const NetInfo = require('@react-native-community/netinfo');
    if (NetInfo && typeof NetInfo.fetch === 'function') {
      return await NetInfo.fetch();
    }
  } catch (e) {
    // Fall back to navigator.onLine if available, else assume connected
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
        return { isConnected: navigator.onLine };
      }
    } catch (err) {
      // ignore
    }
  }
  return { isConnected: true };
}

export class EventDrivenAudioCaptureService {
  constructor() {
    this.recording = null;
    this.isRecording = false;
    this.recordingStartTime = null;
    this.recordingDurationMs = 8000; // 8 seconds post-trigger window
    this.lastRecordedUri = null; // ← Store URI permanently so it survives multiple stop calls
  }

  /**
   * 🎙️ Start recording audio for threat analysis
   * @returns {Promise<void>}
   */
  async startRecording() {
    try {
      if (this.isRecording) {
        console.warn('⚠️ [AudioCapture] Already recording');
        return;
      }

      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Audio permission denied');
      }

      // Configure audio
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      // Start recording
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY
      );
      await recording.startAsync();

      this.recording = recording;
      this.isRecording = true;
      this.recordingStartTime = Date.now();

      console.log('🎙️ [AudioCapture] Recording started (8s window)');

      // Auto-stop after 8 seconds (stop directly without calling stopRecording)
      setTimeout(async () => {
        if (this.isRecording && this.recording) {
          try {
            console.log('[AudioCapture] Auto-stopping recording after duration limit');
            await this.recording.stopAndUnloadAsync();
            this.lastRecordedUri = this.recording.getURI(); // ← Save URI permanently
            this.isRecording = false;
            this.recording = null;
            console.log('✅ [AudioCapture] Auto-stopped, URI saved:', this.lastRecordedUri);
          } catch (err) {
            console.error('[AudioCapture] Auto-stop error:', err);
            this.isRecording = false;
            this.recording = null;
          }
        }
      }, this.recordingDurationMs);

      return true;
    } catch (error) {
      console.error('❌ [AudioCapture] Error starting recording:', error);
      throw error;
    }
  }

  /**
   * ⏹️ Stop recording and get file path (idempotent - safe to call multiple times)
   * @returns {Promise<string>} Path to recorded m4a file
   */
  async stopRecording() {
    try {
      // If already stopped but we have a saved URI, return it
      if (!this.recording && this.lastRecordedUri) {
        console.log('✅ [AudioCapture] Recording already stopped, returning saved URI:', this.lastRecordedUri);
        return this.lastRecordedUri;
      }

      // If never started, return saved URI if available, else null
      if (!this.recording || !this.isRecording) {
        console.log('⚠️ [AudioCapture] Recording not active, using saved URI if available');
        return this.lastRecordedUri || null;
      }

      // Actually stop the recording
      const recordingRef = this.recording;
      this.isRecording = false;
      this.recording = null;

      await recordingRef.stopAndUnloadAsync();
      const tempUri = recordingRef.getURI();

      // Save URI permanently
      this.lastRecordedUri = tempUri;

      console.log('✅ [AudioCapture] Recording stopped:', tempUri);

      return tempUri;
    } catch (error) {
      console.error('❌ [AudioCapture] Error stopping recording:', error);
      throw error;
    }
  }

  /**
   * 📤 Upload recorded audio to Supabase
   * @param {string} localUri - Path to m4a file
   * @param {string} userUid - User ID
   * @returns {Promise<string>} Public URL of uploaded audio
   */
  async uploadAudioToSupabase(localUri, userUid) {
    try {
      console.log('📤 [AudioCapture] Uploading to Supabase:', localUri);

      // Verify file exists and log size
      const info = await FileSystem.getInfoAsync(localUri, { size: true });
      if (!info.exists) {
        console.error('❌ [AudioCapture] Local recording file does not exist:', localUri);
        throw new Error('Local recording file missing');
      }
      console.log('📁 [AudioCapture] Local file size:', info.size);

      const ts = Date.now();
      const filename = `threat_${userUid}_${ts}.m4a`;
      const storagePath = `recordings/${userUid}/${ts}/audio/${filename}`;

      // Mirror the working manual upload path exactly: read base64 and upload bytes.
      const base64Audio = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log('✅ [AudioCapture] Audio file read. Size:', base64Audio.length, 'bytes');

      console.log('[AudioCapture] Attempting supabase.storage.upload with path:', storagePath);
      const uploadResult = await supabase.storage
        .from('recordings')
        .upload(storagePath, this.base64Decode(base64Audio), {
          contentType: 'audio/m4a',
        });

      if (uploadResult.error) {
        console.error('[AudioCapture] Supabase upload error:', uploadResult.error);
        throw uploadResult.error;
      }

      // Get public URL
      const { data } = supabase.storage.from('recordings').getPublicUrl(storagePath);
      const audioUrl = data?.publicUrl;
      console.log('✅ [AudioCapture] Uploaded to:', audioUrl);

      return audioUrl;
    } catch (error) {
      console.error('❌ [AudioCapture] Upload error:', error);
      throw error;
    }
  }

  /**
   * 🔧 Utility: Decode base64
   */
  base64Decode(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * 🧠 Main orchestration: Capture + Upload + Process
   * @param {string} userUid - User ID
   * @param {object} currentTelemetry - {heartRate, roll, pitch, yaw}
   * @param {function} onSuccess - Callback with threat result
   * @param {function} onError - Error callback
   */
  async captureAndAnalyze(userUid, currentTelemetry, onSuccess, onError) {
    try {
      console.log('🔴 [AudioCapture] Threat trigger detected! Starting capture...');

      // Process any pending analyses (non-blocking)
      this.processPendingAnalyses().catch(err => console.warn('[AudioCapture] processPendingAnalyses error:', err));

      // Reset URI for this capture session
      this.lastRecordedUri = null;

      // Step 1: Start recording
      await this.startRecording();

      // Step 2: Wait for recording to complete (8 seconds + buffer for async operations)
      await new Promise(resolve => setTimeout(resolve, this.recordingDurationMs + 500));

      // Step 3: Get recorded file (stopRecording is now idempotent - returns lastRecordedUri if available)
      const recordedUri = await this.stopRecording();
      if (!recordedUri) {
        console.error('❌ [AudioCapture] No recording URI available (file not created)');
        throw new Error('Recording file not created');
      }

      console.log('✅ [AudioCapture] Using recording URI:', recordedUri);

      // Step 4: Upload to Supabase
      const audioUrl = await this.uploadAudioToSupabase(recordedUri, userUid);

      // Step 5: Call threat detection API
      console.log('🚨 [AudioCapture] Processing threat...');
      const threatResult = await this.callThreatDetectionAPI(
        audioUrl,
        currentTelemetry
      );

      console.log('✅ [AudioCapture] Threat analysis complete:', threatResult);

      if (onSuccess) {
        onSuccess(threatResult);
      }

      return threatResult;
    } catch (error) {
      console.error('❌ [AudioCapture] Analysis failed:', error);
      if (onError) {
        onError(error);
      }
      throw error;
    }
  }

  /**
   * 🧠 Call backend threat detection API with timeout
   * @param {string} audioUrl - Supabase audio URL
   * @param {object} telemetry - Current sensor state
   * @returns {Promise<object>} Threat analysis result
   */
  async callThreatDetectionAPI(audioUrl, telemetry) {
    try {
      const { API_BASE_URL } = require('../api');

      // Calculate motion from IMU
      const motionMagnitude = Math.sqrt(
        telemetry.roll * telemetry.roll +
        telemetry.pitch * telemetry.pitch +
        telemetry.yaw * telemetry.yaw
      );
      const motion = Math.min(10, motionMagnitude / 5);

      // Helper: fetch with timeout + retries + exponential backoff
      const fetchWithTimeout = (url, options, timeoutMs = 12000) => {
        return Promise.race([
          fetch(url, options),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API request timeout')), timeoutMs)
          )
        ]);
      };

      const fetchWithRetry = async (url, options, retries = 3, backoffMs = 800) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            const net = await getNetworkState();
            if (!net.isConnected) throw new Error('No network connection');

            const res = await fetchWithTimeout(url, options, 12000);
            return res;
          } catch (err) {
            if (attempt === retries) throw err;
            const wait = backoffMs * Math.pow(2, attempt - 1);
            console.warn(`[AudioCapture] Request failed (attempt ${attempt}): ${err.message}. Retrying in ${wait}ms`);
            await new Promise(r => setTimeout(r, wait));
          }
        }
      };

      // Single backend call: /realtime-threat does audio emotion + multimodal analysis together.
      console.log('📊 [AudioCapture] Calling /realtime-threat for combined analysis... (timeout: 12s)');
      console.log('🔗 [AudioCapture] API URL:', `${API_BASE_URL}/realtime-threat`);
      const combinedRes = await fetchWithRetry(`${API_BASE_URL}/realtime-threat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-trigger-source': 'realtime',
          'x-realtime': 'true',
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          motion,
          heart_rate: telemetry.heartRate,
          trigger_reason: 'event_driven_capture',
        }),
      }, 3, 800);

      if (!combinedRes.ok) {
        console.error(`❌ [AudioCapture] /realtime-threat returned status ${combinedRes.status}`);
        throw new Error(`Threat detection failed (${combinedRes.status})`);
      }
      const threatData = await combinedRes.json();
      console.log('✅ [AudioCapture] Threat result received:', threatData.risk_level);

      // Combine results
      return {
        audio_url: audioUrl,
        emotion: threatData.emotion,
        confidence: threatData.confidence,
        panic: threatData.panic,
        risk_level: threatData.risk_level,
        motion: typeof threatData.motion_used === 'number' ? threatData.motion_used : motion,
        heart_rate: typeof threatData.heart_rate_used === 'number' ? threatData.heart_rate_used : telemetry.heartRate,
        timestamp: threatData.timestamp || new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ [AudioCapture] API error:', error);

      // Persist failed analysis job to AsyncStorage for later retry
      try {
        const raw = await AsyncStorage.getItem('pendingThreats');
        const pending = JSON.parse(raw || '[]');
        pending.push({ audioUrl, telemetry, error: error.message, ts: Date.now() });
        await AsyncStorage.setItem('pendingThreats', JSON.stringify(pending));
        console.log('[AudioCapture] Saved failed analysis to pendingThreats (length=', pending.length, ')');
      } catch (qerr) {
        console.error('[AudioCapture] Failed to persist pending analysis:', qerr);
      }

      throw error;
    }
  }

  /**
   * Process any pending threat analysis jobs saved locally
   */
  async processPendingAnalyses() {
    try {
      const net = await getNetworkState();
      if (!net.isConnected) return;

      const raw = await AsyncStorage.getItem('pendingThreats');
      const pending = JSON.parse(raw || '[]');
      if (!pending.length) return;

      console.log(`[AudioCapture] Processing ${pending.length} pending analyses`);
      const { API_BASE_URL } = require('../api');

      // Simple sequential processing
      for (const job of pending.slice()) {
        try {
          const emotionRes = await fetch(`${API_BASE_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_url: job.audioUrl }),
          });
          if (!emotionRes.ok) throw new Error('predict failed');
          const emotionData = await emotionRes.json();

          const threatRes = await fetch(`${API_BASE_URL}/multimodal-predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              emotion_confidence: emotionData.confidence,
              motion: job.telemetry.motion || 0,
              heart_rate: job.telemetry.heartRate,
            }),
          });
          if (!threatRes.ok) throw new Error('multimodal failed');

          // Remove job from pending list on success
          const current = JSON.parse(await AsyncStorage.getItem('pendingThreats') || '[]');
          const remaining = current.filter(p => p.ts !== job.ts);
          await AsyncStorage.setItem('pendingThreats', JSON.stringify(remaining));
          console.log('[AudioCapture] Pending analysis processed and removed');
        } catch (inner) {
          console.warn('[AudioCapture] Pending analysis processing failed:', inner.message);
          // leave job for retry later
        }
      }
    } catch (err) {
      console.error('[AudioCapture] processPendingAnalyses error:', err);
    }
  }

  /**
   * 📊 Get recording status
   */
  getStatus() {
    if (this.isRecording) {
      const elapsed = Date.now() - this.recordingStartTime;
      const remaining = Math.max(0, this.recordingDurationMs - elapsed);
      return {
        isRecording: true,
        elapsedMs: elapsed,
        remainingMs: remaining,
        remainingSeconds: Math.ceil(remaining / 1000),
      };
    }

    return {
      isRecording: false,
    };
  }
}

export default new EventDrivenAudioCaptureService();
