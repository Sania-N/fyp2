// 🔴 IMPORTANT: Change LOCAL_IP to your backend machine's IP address
// Find it: On Windows machine → cmd → ipconfig → IPv4 Address
// Example: 192.168.1.100, 192.168.137.1, etc.
// Use 127.0.0.1 or localhost ONLY if running on same device as backend

const LOCAL_IP = "10.252.136.166"; // ⚠️ CHANGE THIS TO YOUR BACKEND IP= 192.168.100.11  , 10.252.136.166
const API_PORT = 8000;

export const API_BASE_URL = `http://${LOCAL_IP}:${API_PORT}`;

console.log('[API] Base URL configured:', API_BASE_URL);
console.log('[API] ⚠️ If /predict fails, verify LOCAL_IP matches your backend machine IP');

if (typeof LOCAL_IP !== 'string' || LOCAL_IP.trim().length === 0) {
	console.warn('[API] LOCAL_IP is missing or empty. Requests will fail until it is configured.');
}

if (typeof API_BASE_URL !== 'string' || API_BASE_URL.trim().length === 0) {
	console.error('[API] API_BASE_URL is undefined or empty.');
}
