// services/cameraService.js
import { Camera } from "expo-camera";

export async function requestCameraPermission() {
  try {
    const { status } = await Camera.requestCameraPermissionsAsync();
    return status === "granted";
  } catch (err) {
    console.warn("Camera permission request failed:", err);
    return false;
  }
}

// NOTE:
// captureBothCameras is implemented inside RecordScreen.js (single Camera switching approach)
// to keep switching logic close to the Camera component and state.
