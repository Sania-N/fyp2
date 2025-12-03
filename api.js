// api.js
import axios from "axios";
import { auth } from "./firebase";

// ✅ Single base URL for all API calls
const base_url = "http://10.135.53.168:8000"; // 🔥 Ensure IP is correct
export async function syncUserWithBackend(name) {
  const user = auth.currentUser;
  if (!user) return;

  await axios.post(`${base_url}/users/register`, {
    uid: user.uid,
    name: name || user.displayName || "User",
    email: user.email,
  });
}




// Fetch user from FastAPI/Postgres
export async function fetchUserFromBackend() {
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated Firebase user");

  try {
    const response = await axios.get(`${base_url}/users/${user.uid}`, { timeout: 8000 });
    return response.data; // { id, email }
  } catch (err) {
    console.log("Fetch User Error:", err.message);
    throw err;
  }
}

// Update user
export async function updateUserProfile(data) {
  const user = auth.currentUser;
  if (!user) throw new Error("User not logged in");

  try {
    const response = await axios.put(
      `${base_url}/users/update/${user.uid}`,
      data,
      { timeout: 8000 }
    );
    console.log("Update response received:", response.data);
    return response.data;
  } catch (err) {
    console.log("Update Failed - Full Error:", err);
    
    if (err.response) {
      // Server responded with error status
      console.log("Response status:", err.response.status);
      console.log("Response data:", err.response.data);
      throw new Error(`Server error: ${err.response.status} - ${err.response.data?.detail || err.response.data?.message || "Unknown error"}`);
    } else if (err.request) {
      // Request made but no response
      console.log("No response from server");
      throw new Error("No response from server. Check if backend is running.");
    } else {
      // Error setting up request
      throw new Error(`Request error: ${err.message}`);
    }
  }
}
// Upload recording
export const uploadRecording = async (userUid, audioPath, frontImagePath = null, backImagePath = null) => {
  try {
    const response = await fetch(`${base_url}/recordings/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_uid: userUid,
        audio_path: audioPath,
        front_image_path: frontImagePath,
        back_image_path: backImagePath,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save recording metadata');
    }

    const data = await response.json();
    console.log('Recording metadata synced with backend successfully', data);
  } catch (error) {
    console.error('Error uploading recording metadata:', error);
  }
};
