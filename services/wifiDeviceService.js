import axios from 'axios';

/**
 * WiFi Device Service - connects to ESP32 watch over local network
 * Polls telemetry endpoint for sensor data (IMU, GPS, PPG, WiFi/I2S status)
 */
export class WiFiDeviceService {
  static pollingInterval = null;
  static isPollRequestInFlight = false;
  static didNotifyConnectionLost = false;
  static consecutivePollFailures = 0;
  static lastTelemetrySuccessAt = 0;
  static POLL_FAILURE_THRESHOLD = 6;
  static POLL_INTERVAL_MS = 1500; // increased to reduce request overlap
  static TELEMETRY_TIMEOUT_MS = 3500; // allow more time for ESP32 responses
  static MIN_STALE_MS_BEFORE_DISCONNECT = 15000; // slightly longer before disconnect

  // Telemetry structure matching ESP32 firmware
  static DEFAULT_TELEMETRY = {
    roll: 0,
    pitch: 0,
    yaw: 0,
    heartRate: 0,
    spo2: 0,
    fingerOn: false,
    audioLevel: 0,
    latitude: 0,
    longitude: 0,
    altitude: 0,
    speed: 0,
    satellites: 0,
    hdop: 0,
    gpsValid: false,
    wifiConnected: false,
    i2sRunning: false,
    audioWaveform: Array(48).fill(0),
    audioCaptureArmed: false,
    audioCaptureActive: false,
    audioCaptureSession: 0,
    gpsTime: '--:--:--',
    gpsDate: '--/--/----',
  };

  /**
   * Connect to ESP32 device via WiFi
   * @param {string} deviceIP - IP address of ESP32 (e.g., "192.168.100.15")
   * @param {function} onTelemetryUpdate - callback when telemetry data arrives
   */
  static async connectToDevice(deviceIP, onTelemetryUpdate, onConnectionLost) {
    try {
      console.log('[WiFi Device] Connecting to:', deviceIP);
      
      // Test connection with status endpoint
      const response = await axios.get(`http://${deviceIP}:8080/api/status`, {
        timeout: 5000,
      });

      console.log('[WiFi Device] Connected! Status:', response.data);
      this.consecutivePollFailures = 0;
      this.lastTelemetrySuccessAt = Date.now();
      this.didNotifyConnectionLost = false;
      this.isPollRequestInFlight = false;

      // Start polling telemetry
      this.startPolling(deviceIP, onTelemetryUpdate, onConnectionLost);

      return { ip: deviceIP, connected: true };
    } catch (error) {
      console.error('[WiFi Device] Connection failed:', error.message);
      throw new Error(`Failed to connect to ${deviceIP}: ${error.message}`);
    }
  }

  /**
   * Poll device for telemetry data every 500ms
   */
  static startPolling(deviceIP, onTelemetryUpdate, onConnectionLost) {
    // Clear any existing polling
    if (this.pollingInterval) clearInterval(this.pollingInterval);

    this.pollingInterval = setInterval(async () => {
      if (this.isPollRequestInFlight) {
        return;
      }

      this.isPollRequestInFlight = true;
      try {
        const response = await axios.get(`http://${deviceIP}:8080/api/telemetry`, {
          timeout: this.TELEMETRY_TIMEOUT_MS,
        });

        this.consecutivePollFailures = 0;
        this.lastTelemetrySuccessAt = Date.now();
        this.didNotifyConnectionLost = false;

        const telemetry = this.parseTelemetry(response.data);
        if (typeof onTelemetryUpdate === 'function') {
          onTelemetryUpdate(telemetry);
        }
      } catch (error) {
        this.consecutivePollFailures += 1;
        const staleForMs = Date.now() - this.lastTelemetrySuccessAt;

        console.warn(
          `[WiFi Device] Poll error (${this.consecutivePollFailures}/${this.POLL_FAILURE_THRESHOLD}) after ${staleForMs}ms stale:`,
          error.message
        );

        if (
          this.consecutivePollFailures >= this.POLL_FAILURE_THRESHOLD &&
          staleForMs >= this.MIN_STALE_MS_BEFORE_DISCONNECT &&
          !this.didNotifyConnectionLost
        ) {
          this.didNotifyConnectionLost = true;
          this.disconnect();

          if (typeof onTelemetryUpdate === 'function') {
            onTelemetryUpdate({ ...this.DEFAULT_TELEMETRY });
          }

          if (typeof onConnectionLost === 'function') {
            onConnectionLost(
              `Watch disconnected: telemetry endpoint not responding (${staleForMs}ms stale).`
            );
          }
        }
      } finally {
        this.isPollRequestInFlight = false;
      }
    }, this.POLL_INTERVAL_MS);
  }

  /**
   * Parse telemetry from ESP32 API response
   */
  static parseTelemetry(data) {
    try {
      return {
        // IMU (roll, pitch, yaw in degrees)
        roll: parseFloat(data.roll) || 0,
        pitch: parseFloat(data.pitch) || 0,
        yaw: parseFloat(data.yaw) || 0,

        // PPG (heart rate, SpO2, finger detection)
        heartRate: parseInt(data.heartRate) || 0,
        spo2: parseInt(data.spo2) || 0,
        fingerOn: data.fingerOn === true || data.fingerOn === 1,
        audioLevel: Math.max(0, Math.min(100, parseInt(data.audioLevel) || 0)),

        // GPS
        latitude: parseFloat(data.latitude) || 0,
        longitude: parseFloat(data.longitude) || 0,
        altitude: parseFloat(data.altitude) || 0,
        speed: parseFloat(data.speed) || 0,
        satellites: parseInt(data.satellites) || 0,
        hdop: parseFloat(data.hdop) || 99.9,
        gpsValid: data.gpsValid === true || data.gpsValid === 1,
        gpsTime: data.gpsTime || '--:--:--',
        gpsDate: data.gpsDate || '--/--/----',

        // Status flags
        wifiConnected: data.wifiConnected === true || data.wifiConnected === 1,
        i2sRunning: data.i2sRunning === true || data.i2sRunning === 1,
        audioWaveform: Array.isArray(data.audioWaveform)
          ? data.audioWaveform.map((value) => Math.max(0, Math.min(100, parseInt(value, 10) || 0)))
          : Array(48).fill(Math.max(0, Math.min(100, parseInt(data.audioLevel) || 0))),
        audioCaptureArmed: data.audioCaptureArmed === true || data.audioCaptureArmed === 1,
        audioCaptureActive: data.audioCaptureActive === true || data.audioCaptureActive === 1,
        audioCaptureSession: parseInt(data.audioCaptureSession, 10) || 0,
      };
    } catch (error) {
      console.error('[WiFi Device] Parse error:', error);
      return this.DEFAULT_TELEMETRY;
    }
  }

  /**
   * Stop polling and disconnect
   */
  static disconnect() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPollRequestInFlight = false;
    this.didNotifyConnectionLost = false;
    this.consecutivePollFailures = 0;
    this.lastTelemetrySuccessAt = 0;
    console.log('[WiFi Device] Disconnected');
  }
}

export default WiFiDeviceService;
