import { uploadRecordingFile } from './recordingsService';
import * as FileSystem from 'expo-file-system/legacy';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;
const BUFFER_SECONDS = 8; // keep rolling 8s

class EspWebsocketService {
  ws = null;
  deviceIP = null;
  connected = false;
  onWaveform = null;
  onStatus = null;

  // circular buffer for last N samples (Int16)
  ringBuffer = null;
  ringWritePos = 0;
  ringSizeSamples = SAMPLE_RATE * BUFFER_SECONDS;
  samplesWritten = 0;

  latestTelemetry = null;

  connect(deviceIP, onWaveform, onStatus) {
    this.disconnect();
    this.deviceIP = deviceIP;
    this.onWaveform = onWaveform;
    this.onStatus = onStatus;

    try {
      const url = `ws://${deviceIP}:8081`;
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.connected = true;
        this.ringBuffer = new Int16Array(this.ringSizeSamples);
        this.ringWritePos = 0;
        this.samplesWritten = 0;
        if (this.onStatus) this.onStatus({ connected: true });
        console.log('[ESP WS] Connected to', url);
      };

      this.ws.onmessage = (evt) => {
        if (!evt.data) return;
        const ab = evt.data;
        const pcm = new Int16Array(ab);
        // append to ring buffer
        for (let i = 0; i < pcm.length; i++) {
          this.ringBuffer[this.ringWritePos] = pcm[i];
          this.ringWritePos = (this.ringWritePos + 1) % this.ringSizeSamples;
        }
        this.samplesWritten = Math.min(this.samplesWritten + pcm.length, this.ringSizeSamples);

        // compute simple 48-bin waveform from this chunk
        const bins = new Array(48).fill(0);
        const samplesPerBin = Math.max(1, Math.floor(pcm.length / 48));
        for (let b = 0; b < 48; b++) {
          let peak = 0;
          const base = b * samplesPerBin;
          for (let j = 0; j < samplesPerBin && base + j < pcm.length; j++) {
            const v = Math.abs(pcm[base + j]);
            if (v > peak) peak = v;
          }
          bins[b] = Math.min(100, Math.round((peak / 32767) * 100));
        }

        // Throttle/dedupe waveform emissions to avoid state update storms
        const now = Date.now();
        if (!this._lastEmitTs) this._lastEmitTs = 0;
        if (!this._lastBins) this._lastBins = new Array(48).fill(-1);
        const elapsed = now - this._lastEmitTs;
        const same = bins.every((v, idx) => v === this._lastBins[idx]);
        // Emit at most 20 Hz and only if bins changed
        if ((elapsed >= 50 && !same) || (!same && this._lastEmitTs === 0)) {
          this._lastEmitTs = now;
          this._lastBins = bins.slice();
          if (this.onWaveform) this.onWaveform(bins);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        if (this.onStatus) this.onStatus({ connected: false });
        console.log('[ESP WS] Closed');
      };

      this.ws.onerror = (err) => {
        console.warn('[ESP WS] Error', err.message || err);
      };
    } catch (err) {
      console.error('[ESP WS] Connect failed:', err);
    }
  }

  disconnect() {
    try {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    } catch (e) {}
    this.connected = false;
    this.ringBuffer = null;
    this.ringWritePos = 0;
    this.samplesWritten = 0;
  }

  // Extract last N seconds of samples (Int16Array)
  _extractLastSamples(seconds = BUFFER_SECONDS) {
    const wanted = Math.min(this.ringSizeSamples, SAMPLE_RATE * seconds);
    const available = Math.min(this.samplesWritten || 0, wanted);
    const out = new Int16Array(available);
    if (available === 0) return out;
    let start = (this.ringWritePos - available + this.ringSizeSamples) % this.ringSizeSamples;
    for (let i = 0; i < available; i++) {
      out[i] = this.ringBuffer[(start + i) % this.ringSizeSamples];
    }
    return out;
  }

  async captureAndUpload(userUid, frontImageUri = null, backImageUri = null) {
    if (!this.ringBuffer) throw new Error('No audio buffer available');

    const captureSeconds = Math.min(BUFFER_SECONDS, (this.samplesWritten || 0) / SAMPLE_RATE || BUFFER_SECONDS);
    const totalSamples = this._extractLastSamples(captureSeconds);

    if (totalSamples.length === 0) {
      throw new Error('No valid audio samples captured yet');
    }

    const pcmBytes = new Uint8Array(totalSamples.buffer);

    // Build WAV header + PCM16LE data
    const dataSize = pcmBytes.length;
    const header = new ArrayBuffer(44);
    const dv = new DataView(header);
    let p = 0;
    function writeString(s) {
      for (let i = 0; i < s.length; i++) dv.setUint8(p++, s.charCodeAt(i));
    }
    writeString('RIFF');
    dv.setUint32(p, 36 + dataSize, true); p += 4; // file size - 8
    writeString('WAVE');
    writeString('fmt ');
    dv.setUint32(p, 16, true); p += 4; // fmt chunk size
    dv.setUint16(p, 1, true); p += 2; // PCM
    dv.setUint16(p, CHANNELS, true); p += 2;
    dv.setUint32(p, SAMPLE_RATE, true); p += 4;
    dv.setUint32(p, SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, true); p += 4; // byte rate
    dv.setUint16(p, CHANNELS * BYTES_PER_SAMPLE, true); p += 2; // block align
    dv.setUint16(p, BYTES_PER_SAMPLE * 8, true); p += 2; // bits per sample
    writeString('data');
    dv.setUint32(p, dataSize, true); p += 4;

    // concat header + pcm
    const wavBytes = new Uint8Array(44 + dataSize);
    wavBytes.set(new Uint8Array(header), 0);
    wavBytes.set(pcmBytes, 44);

    // Convert to base64 (safe for RN) without relying on Node Buffer
    let binary = '';
    for (let i = 0; i < wavBytes.length; i++) binary += String.fromCharCode(wavBytes[i]);
    const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(wavBytes).toString('base64');
    const filename = `${userUid}_${Date.now()}.wav`;
    const uri = `${FileSystem.documentDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
    console.log('[ESP WS] WAV written to', uri);

    // Upload using recordingsService helper
    const result = await uploadRecordingFile(userUid, uri, filename, totalSamples.length / SAMPLE_RATE, this.latestTelemetry || null, frontImageUri, backImageUri);
    // cleanup
    try { await FileSystem.deleteAsync(uri); } catch (e) {}
    return result;
  }
}

export default new EspWebsocketService();
