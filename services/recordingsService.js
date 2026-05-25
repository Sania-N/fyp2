// services/recordingsService.js
import { supabase } from "../supabase";
import { db } from "../firebase";
import * as FileSystem from "expo-file-system/legacy";
import {
  addDoc,
  collection,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { API_BASE_URL } from "../api";
import { analyzeUserDangerLevel } from "./dangerDetectionService";

const getSupabaseClient = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY to enable recording uploads.');
  }

  return supabase;
};

// Helper to decode base64 to Uint8Array
function decode(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/* ============================================================
  UPLOAD IMAGES TO SUPABASE (back camera only)
============================================================ */
export async function uploadImages(userUid, frontImageUri, backImageUri, timestamp) {
  try {
    const supabaseClient = getSupabaseClient();
    const urls = {};

    // Only upload back image
    if (backImageUri) {
      const name = `${userUid}_${timestamp}_back.jpg`;
      const path = `recordings/${userUid}/${timestamp}/images/${name}`;
      
      // Read file as base64
      const base64Data = await FileSystem.readAsStringAsync(backImageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const { error } = await supabaseClient.storage.from("recordings").upload(path, decode(base64Data), {
        contentType: "image/jpeg",
      });
      if (error) throw error;
      const { data } = supabaseClient.storage.from("recordings").getPublicUrl(path);
      urls.back_image_url = data?.publicUrl || null;
      console.log("📸 Back image uploaded:", urls.back_image_url);
    }

    return urls;
  } catch (err) {
    console.error("❌ Upload image failed:", err);
    throw err;
  }
}

/* ============================================================
  UPLOAD AUDIO + SAVE FIRESTORE METADATA
============================================================ */
export async function uploadRecording(
  userUid,
  localUri,
  frontImageUri,
  backImageUri,
  duration = 0,
  esp32Telemetry = null  // ✅ NEW parameter for hardware data
) {
  try {
    console.log('🚀 uploadRecording START:', { 
      userUid, 
      localUri, 
      duration,
      esp32Available: !!esp32Telemetry
    });
    const supabaseClient = getSupabaseClient();
    const ts = Date.now();
    const filename = `${userUid}_${ts}.m4a`;
    const storagePath = `recordings/${userUid}/${ts}/audio/${filename}`;

    console.log('📝 Reading audio file:', localUri);
    const base64Audio = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log('✅ Audio file read. Size:', base64Audio.length, 'bytes');

    console.log('📤 Uploading to Supabase:', storagePath);
    await supabaseClient.storage
      .from("recordings")
      .upload(storagePath, decode(base64Audio), {
        contentType: "audio/m4a",
      });
    console.log('✅ Audio uploaded to Supabase');

    const { data } = supabaseClient.storage
      .from("recordings")
      .getPublicUrl(storagePath);

    const audioUrl = data.publicUrl;
    console.log('🔗 Audio URL:', audioUrl);

    console.log('📸 Uploading images...');
    const images = await uploadImages(userUid, frontImageUri, backImageUri, ts);
    console.log('✅ Images uploaded:', images);

    // 1️⃣ Create Firestore doc first
    console.log('📝 Creating Firestore document...');
    const docRef = await addDoc(collection(db, "recordings"), {
      user_uid: userUid,
      filename,
      audio_url: audioUrl,
      duration,
      front_image_url: images.front_image_url || null,
      back_image_url: images.back_image_url || null,
      created_at: serverTimestamp(),
      emotion: null,
      confidence: null,
      panic: false,
      threat_level: null,  // ✅ NEW
      hardware_context: esp32Telemetry || null,  // ✅ NEW
    });
    console.log('✅ Firestore doc created:', docRef.id);

    // 2️⃣ CALL FASTAPI WITH HARDWARE CONTEXT
    console.log('🧠 Calling detectEmotion with ESP32 context:', {
      audioUrl,
      esp32Available: !!esp32Telemetry
    });
    let result = null;
    try {
      result = await detectEmotion(audioUrl, esp32Telemetry);  // ✅ Pass telemetry
      console.log('✅ ML result received:', result);
    } catch (mlError) {
      console.warn('⚠️ ML detection failed, keeping recording saved:', mlError.message || mlError);
    }

    // 3️⃣ UPDATE FIRESTORE WITH ML RESULT
    if (result) {
      console.log('📤 Updating Firestore with ML results...');
      await updateDoc(doc(db, "recordings", docRef.id), {
        emotion: result.emotion,
        confidence: result.confidence,
        panic: result.panic,
        threat_level: result.risk_level || null,  // ✅ NEW
      });
      console.log('✅ Firestore updated successfully');
    }

    console.log('🎉 uploadRecording COMPLETE');
    return {
      recordingId: docRef.id,
      audioUrl,
      emotion: result?.emotion ?? null,
      confidence: result?.confidence ?? null,
      panic: result?.panic ?? false,
      threatLevel: result?.risk_level ?? null,  // ✅ NEW
      hardwareContext: esp32Telemetry,  // ✅ NEW
    };
  } catch (err) {
    console.error("❌ uploadRecording FAILED:", err.message || err);
    console.error("Stack:", err.stack);
    throw err;
  }
}

/* ============================================================
  UPLOAD A PRE-CREATED AUDIO FILE (WAV/M4A) + SAVE METADATA
  Used by ESP32 WebSocket capture workflow which writes a WAV to disk
============================================================ */
export async function uploadRecordingFile(
  userUid,
  localUri,
  filename,
  duration = 0,
  esp32Telemetry = null,
  frontImageUri = null,
  backImageUri = null
) {
  try {
    console.log('🚀 uploadRecordingFile START:', { userUid, localUri, filename, duration });
    const supabaseClient = getSupabaseClient();
    const ts = Date.now();
    const storagePath = `recordings/${userUid}/${ts}/audio/${filename}`;

    console.log('📝 Reading audio file (file):', localUri);
    const base64Audio = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log('📤 Uploading to Supabase (file):', storagePath);
    await supabaseClient.storage
      .from('recordings')
      .upload(storagePath, decode(base64Audio), {
        contentType: filename.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/m4a',
      });

    const { data } = supabaseClient.storage
      .from('recordings')
      .getPublicUrl(storagePath);

    const audioUrl = data.publicUrl;
    console.log('🔗 Audio URL (file):', audioUrl);

    const images = await uploadImages(userUid, frontImageUri, backImageUri, ts);

    const docRef = await addDoc(collection(db, 'recordings'), {
      user_uid: userUid,
      filename,
      audio_url: audioUrl,
      duration,
      front_image_url: images.front_image_url || null,
      back_image_url: images.back_image_url || null,
      created_at: serverTimestamp(),
      emotion: null,
      confidence: null,
      panic: false,
      threat_level: null,
      hardware_context: esp32Telemetry || null,
    });

    let result = null;
    try {
      result = await detectEmotion(audioUrl, esp32Telemetry);
    } catch (mlError) {
      console.warn('⚠️ ML detection failed (file upload):', mlError.message || mlError);
    }

    if (result) {
      await updateDoc(doc(db, 'recordings', docRef.id), {
        emotion: result.emotion,
        confidence: result.confidence,
        panic: result.panic,
        threat_level: result.risk_level || null,
      });
    }

    return {
      recordingId: docRef.id,
      audioUrl,
      emotion: result?.emotion ?? null,
      confidence: result?.confidence ?? null,
      panic: result?.panic ?? false,
      threatLevel: result?.risk_level ?? null,
      hardwareContext: esp32Telemetry,
    };
  } catch (err) {
    console.error('❌ uploadRecordingFile FAILED:', err.message || err);
    throw err;
  }
}

/**
 * 🧠 Call emotion detection + threat analysis with hardware fusion
 * @param {string} audioUrl - URL to audio file
 * @param {object} esp32Telemetry - Hardware sensor data (heart rate, motion, audio level)
 * @returns {Promise<{emotion, confidence, panic, risk_level}>}
 */
export async function detectEmotion(audioUrl, esp32Telemetry = null) {
  try {
    console.log('🧠 [detectEmotion] Starting with:', { audioUrl, esp32Telemetry: !!esp32Telemetry });

    if (esp32Telemetry) {
      console.log('📊 [detectEmotion] Calling /realtime-threat endpoint...');

      const hasDirectMotion = typeof esp32Telemetry.motion === 'number' && Number.isFinite(esp32Telemetry.motion);
      const hasImuAngles =
        Number.isFinite(esp32Telemetry.roll) &&
        Number.isFinite(esp32Telemetry.pitch) &&
        Number.isFinite(esp32Telemetry.yaw);

      const motion = hasDirectMotion
        ? esp32Telemetry.motion
        : hasImuAngles
          ? Math.sqrt(
              (esp32Telemetry.roll || 0) * (esp32Telemetry.roll || 0) +
              (esp32Telemetry.pitch || 0) * (esp32Telemetry.pitch || 0) +
              (esp32Telemetry.yaw || 0) * (esp32Telemetry.yaw || 0)
            )
          : 0;

      const heartRateValue = Number(esp32Telemetry.heartRate);
      const heartRate = Number.isFinite(heartRateValue) && heartRateValue > 0 ? heartRateValue : 0;

      console.log('📡 [detectEmotion] Hardware payload to /realtime-threat:', {
        motion,
        heartRate,
        fingerOn: esp32Telemetry.fingerOn,
        roll: esp32Telemetry.roll,
        pitch: esp32Telemetry.pitch,
        yaw: esp32Telemetry.yaw,
      });

      const combinedResponse = await fetch(`${API_BASE_URL}/realtime-threat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-trigger-source': 'realtime',
          'x-realtime': 'true',
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          motion,
          heart_rate: heartRate,
          trigger_reason: 'recording_upload',
        }),
      });

      if (!combinedResponse.ok) {
        throw new Error(`Realtime threat detection failed: ${combinedResponse.status}`);
      }

      const combinedData = await combinedResponse.json();
      console.log('📊 [detectEmotion] Realtime threat result:', combinedData);

      return {
        audio_url: audioUrl,
        emotion: combinedData.emotion ?? null,
        confidence: combinedData.confidence ?? null,
        panic: combinedData.panic ?? false,
        risk_level: combinedData.risk_level ?? null,
        motion: typeof combinedData.motion_used === 'number' ? combinedData.motion_used : motion,
        heart_rate: typeof combinedData.heart_rate_used === 'number' ? combinedData.heart_rate_used : heartRate,
        timestamp: combinedData.timestamp || new Date().toISOString(),
        hardware_data_used: true,
        sensor_context: esp32Telemetry,
      };
    }

    // Step 1: Get emotion from audio
    console.log('📊 [detectEmotion] Calling /predict endpoint...');
    const emotionResponse = await fetch(`${API_BASE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_url: audioUrl }),
    });

    if (!emotionResponse.ok) {
      throw new Error(`Emotion detection failed: ${emotionResponse.status}`);
    }

    const emotionData = await emotionResponse.json();
    console.log('📊 [detectEmotion] Audio emotion result:', emotionData);

    const emotionConfidence = emotionData.confidence;

    // Step 2: Get threat level using emotion + hardware data
    console.log('🚨 [detectEmotion] Calling threat analysis with hardware fusion...');
    let threatData = null;
    
    if (esp32Telemetry) {
      console.log('✅ [detectEmotion] Using REAL ESP32 hardware data');
      threatData = await analyzeUserDangerLevel(
        emotionConfidence, 
        esp32Telemetry  // ✅ Pass real sensor data
      );
    } else {
      console.log('⚠️ [detectEmotion] No ESP32 data, using fallback mode');
      threatData = await analyzeUserDangerLevel(emotionConfidence);  // Fallback
    }

    console.log('🚨 [detectEmotion] Threat analysis result:', threatData);

    // Combine results
    const finalResult = {
      ...emotionData,
      ...threatData,
      hardware_data_used: !!esp32Telemetry,
      sensor_context: esp32Telemetry || null,
    };

    console.log('✅ [detectEmotion] Final combined result:', finalResult);
    return finalResult;

  } catch (error) {
    console.error('❌ [detectEmotion] Error:', error);
    throw error;
  }
}

/* ============================================================
  FETCH + STREAM
============================================================ */
export async function getUserRecordings(userUid) {
  const q = query(collection(db, "recordings"), where("user_uid", "==", userUid), orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function listenUserRecordings(userUid, onUpdate) {
  const q = query(collection(db, "recordings"), where("user_uid", "==", userUid), orderBy("created_at", "desc"));
  return onSnapshot(q, (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/* ============================================================
  DELETE FILES + FIRESTORE DOC
  deleteRecording(id, filename, audioURL, frontURL?, backURL?)
============================================================ */
export async function deleteRecording(id, filename, audioURL, frontURL, backURL) {
  try {
    const supabaseClient = getSupabaseClient();
    const user = filename.split("_")[0];
    const ts = filename.split("_")[1].split(".")[0];
    const base = `recordings/${user}/${ts}/`;

    const files = [`${base}audio/${filename}`];

    if (frontURL) files.push(`${base}images/${frontURL.split("/").pop()}`);
    if (backURL) files.push(`${base}images/${backURL.split("/").pop()}`);

    // supabase remove expects array of paths
    await supabaseClient.storage.from("recordings").remove(files);

    // delete firestore doc
    await deleteDoc(doc(db, "recordings", id));
  } catch (err) {
    console.error("deleteRecording failed", err);
    throw err;
  }
}

/* ============================================================
  UPDATE NAME ONLY
============================================================ */
export async function renameRecording(id, newName) {
  await updateDoc(doc(db, "recordings", id), { filename: newName });
}
