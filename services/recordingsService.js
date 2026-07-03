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

function serializeLog(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return JSON.stringify({ serializationError: error?.message || String(error) }, null, 2);
  }
}

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
    const audioStoragePath = storagePath;
    const frontImageStoragePath = frontImageUri ? `recordings/${userUid}/${ts}/images/${userUid}_${ts}_front.jpg` : null;
    const backImageStoragePath = backImageUri ? `recordings/${userUid}/${ts}/images/${userUid}_${ts}_back.jpg` : null;
    
    const docRef = await addDoc(collection(db, "recordings"), {
      user_uid: userUid,
      filename,
      audio_url: audioUrl,
      audio_storage_path: audioStoragePath,
      duration,
      front_image_url: images.front_image_url || null,
      front_image_storage_path: frontImageStoragePath,
      back_image_url: images.back_image_url || null,
      back_image_storage_path: backImageStoragePath,
      created_at: serverTimestamp(),
      emotion: null,
      confidence: null,
      panic: false,
      threat_level: null,  // ✅ NEW
      hardware_context: esp32Telemetry || null,  // ✅ NEW
    });
    console.log('✅ Firestore doc created:', docRef.id);
    console.log('[RecordingFlow] Firestore recordingId:', docRef.id);

    // 2️⃣ CALL FASTAPI WITH HARDWARE CONTEXT
    console.log('🧠 Calling detectEmotion with ESP32 context:', {
      audioUrl,
      esp32Available: !!esp32Telemetry,
      recordingId: docRef.id,
    });
    let result = null;
    try {
      result = await detectEmotion(audioUrl, esp32Telemetry, {
        recordingId: docRef.id,
        currentScreenOrFeature: 'RecordScreen.uploadRecording',
        triggerSource: 'recording_upload',
        requestReason: 'Recording uploaded and ready for emotion/threat analysis',
      });  // ✅ Pass telemetry
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
    console.log('[RecordingFlow][FINAL SUMMARY]');
    console.log(serializeLog({
      timestamp: new Date().toISOString(),
      recordingId: docRef.id,
      emotion: result?.emotion ?? null,
      confidence: result?.confidence ?? null,
      panic: result?.panic ?? false,
      risk_level: result?.risk_level ?? null,
      trigger_reason: 'Recording uploaded and analyzed',
    }));
    return {
      recordingId: docRef.id,
      audioUrl,
      emotion: result?.emotion ?? null,
      confidence: result?.confidence ?? null,
      panic: result?.panic ?? false,
      risk_level: result?.risk_level ?? null,
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

    console.log('[RecordingFlow] Firestore recordingId (file upload):', docRef.id);

    let result = null;
    try {
      result = await detectEmotion(audioUrl, esp32Telemetry, {
        recordingId: docRef.id,
        currentScreenOrFeature: 'uploadRecordingFile',
        triggerSource: 'recording_file_upload',
        requestReason: 'File upload ready for emotion/threat analysis',
      });
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
      risk_level: result?.risk_level ?? null,
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
export async function detectEmotion(audioUrl, esp32Telemetry = null, debugContext = {}) {
  try {
    console.log('🧠 [detectEmotion] Starting with:', { audioUrl, esp32Telemetry: !!esp32Telemetry, debugContext });
    console.log('[RealtimeThreat][STEP 1] Realtime check started');
    console.log(serializeLog({
      timestamp: new Date().toISOString(),
      currentScreenOrFeature: debugContext.currentScreenOrFeature || 'recordingsService.detectEmotion',
      triggerSource: debugContext.triggerSource || 'unknown',
      captureArmed: true,
      audioCaptureActive: false,
      currentSensorSnapshot: esp32Telemetry || null,
      recordingId: debugContext.recordingId || null,
    }));

    if (esp32Telemetry) {
      console.log('📊 [detectEmotion] Calling /realtime-threat endpoint...');

      const hasDirectMotion = typeof esp32Telemetry.motion === 'number' && Number.isFinite(esp32Telemetry.motion);
      const hasImuAngles =
        Number.isFinite(esp32Telemetry.roll) &&
        Number.isFinite(esp32Telemetry.pitch) &&
        Number.isFinite(esp32Telemetry.yaw);
      const dampedYaw = (Number(esp32Telemetry.yaw) || 0) * 0.35;
      const motionMagnitude = hasDirectMotion
        ? esp32Telemetry.motion
        : hasImuAngles
          ? Math.sqrt(
              (esp32Telemetry.roll || 0) * (esp32Telemetry.roll || 0) +
              (esp32Telemetry.pitch || 0) * (esp32Telemetry.pitch || 0) +
              dampedYaw * dampedYaw
            )
          : 0;

      const motion = hasDirectMotion
        ? esp32Telemetry.motion
        : hasImuAngles
          ? Math.sqrt(
              (esp32Telemetry.roll || 0) * (esp32Telemetry.roll || 0) +
              (esp32Telemetry.pitch || 0) * (esp32Telemetry.pitch || 0) +
              dampedYaw * dampedYaw
            )
          : 0;

      const heartRateValue = Number(esp32Telemetry.heartRate);
      const heartRate = Number.isFinite(heartRateValue) && heartRateValue > 0 ? heartRateValue : 0;
      const requestUrl = `${API_BASE_URL}/realtime-threat`;
      const requestHeaders = {
        'Content-Type': 'application/json',
        'x-trigger-source': 'realtime',
        'x-realtime': 'true',
      };
      const requestBody = {
        audio_url: audioUrl,
        motion,
        heart_rate: heartRate,
        trigger_reason: debugContext.requestReason || 'recording_upload',
      };

      console.log('📡 [detectEmotion] Hardware payload to /realtime-threat:', {
        motion,
        heartRate,
        fingerOn: esp32Telemetry.fingerOn,
        roll: esp32Telemetry.roll,
        pitch: esp32Telemetry.pitch,
        yaw: esp32Telemetry.yaw,
      });

      console.log('[RealtimeThreat][STEP 2] Right before the request is sent');
      console.log(serializeLog({
        timestamp: new Date().toISOString(),
        endpointUrl: requestUrl,
        requestHeaders,
        fullRequestBody: requestBody,
        localComputedValues: {
          motionMagnitude,
          motion,
          heartRateValue,
          heartRate,
          esp32Telemetry,
          debugContext,
        },
        exactReasonRequestIsBeingSent: debugContext.requestReason || 'ESP32 hardware data available for combined realtime analysis',
      }));

      const requestStartAt = Date.now();
      const combinedResponse = await fetch(requestUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });

      const responseTimeMs = Date.now() - requestStartAt;
      const rawResponseBody = await combinedResponse.text();
      let parsedResponse = null;
      let parsingError = null;
      try {
        parsedResponse = rawResponseBody ? JSON.parse(rawResponseBody) : null;
      } catch (error) {
        parsingError = error?.message || String(error);
      }

      console.log('[RealtimeThreat][STEP 3] Right after the request returns');
      console.log(serializeLog({
        timestamp: new Date().toISOString(),
        httpStatusCode: combinedResponse.status,
        responseTimeMs,
        rawResponseBody,
        parsedJsonResponse: parsedResponse,
        parsingError,
      }));

      if (!combinedResponse.ok) {
        throw new Error(`Realtime threat detection failed: ${combinedResponse.status}`);
      }

      if (parsingError) {
        throw new Error(`Realtime threat detection response parsing failed: ${parsingError}`);
      }

      const combinedData = parsedResponse;
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
        recordingId: debugContext.recordingId || null,
      };
    }

    // Step 1: Get emotion from audio
    console.log('📊 [detectEmotion] Calling /predict endpoint...');
    const emotionRequestUrl = `${API_BASE_URL}/predict`;
    const emotionRequestHeaders = { 'Content-Type': 'application/json' };
    const emotionRequestBody = { audio_url: audioUrl };

    console.log('[RealtimeThreat][STEP 2] Right before the request is sent');
    console.log(serializeLog({
      timestamp: new Date().toISOString(),
      endpointUrl: emotionRequestUrl,
      requestHeaders: emotionRequestHeaders,
      fullRequestBody: emotionRequestBody,
      localComputedValues: {
        audioUrl,
        recordingId: debugContext.recordingId || null,
        debugContext,
      },
      exactReasonRequestIsBeingSent: debugContext.requestReason || 'No ESP32 telemetry available; requesting audio emotion only',
    }));

    const emotionRequestStartAt = Date.now();
    const emotionResponse = await fetch(emotionRequestUrl, {
      method: 'POST',
      headers: emotionRequestHeaders,
      body: JSON.stringify(emotionRequestBody),
    });

    const emotionResponseTimeMs = Date.now() - emotionRequestStartAt;
    const emotionRawResponseBody = await emotionResponse.text();
    let emotionParsedResponse = null;
    let emotionParsingError = null;
    try {
      emotionParsedResponse = emotionRawResponseBody ? JSON.parse(emotionRawResponseBody) : null;
    } catch (error) {
      emotionParsingError = error?.message || String(error);
    }

    console.log('[RealtimeThreat][STEP 3] Right after the request returns');
    console.log(serializeLog({
      timestamp: new Date().toISOString(),
      httpStatusCode: emotionResponse.status,
      responseTimeMs: emotionResponseTimeMs,
      rawResponseBody: emotionRawResponseBody,
      parsedJsonResponse: emotionParsedResponse,
      parsingError: emotionParsingError,
    }));

    if (!emotionResponse.ok) {
      throw new Error(`Emotion detection failed: ${emotionResponse.status}`);
    }

    if (emotionParsingError) {
      throw new Error(`Emotion detection response parsing failed: ${emotionParsingError}`);
    }

    const emotionData = emotionParsedResponse;
    console.log('📊 [detectEmotion] Audio emotion result:', emotionData);

    const emotionConfidence = emotionData.confidence;

    // Step 2: Get threat level using emotion + hardware data
    console.log('🚨 [detectEmotion] Calling threat analysis with hardware fusion...');
    let threatData = null;
    
    if (esp32Telemetry) {
      console.log('✅ [detectEmotion] Using REAL ESP32 hardware data');
      threatData = await analyzeUserDangerLevel(
        emotionConfidence,
        esp32Telemetry,  // ✅ Pass real sensor data
        debugContext,
        emotionData?.emotion || null
      );
    } else {
      console.log('⚠️ [detectEmotion] No ESP32 data, using fallback mode');
      threatData = await analyzeUserDangerLevel(emotionConfidence, null, debugContext, emotionData?.emotion || null);  // Fallback
    }

    console.log('🚨 [detectEmotion] Threat analysis result:', threatData);

    // Combine results
    const finalResult = {
      ...emotionData,
      ...threatData,
      hardware_data_used: !!esp32Telemetry,
      sensor_context: esp32Telemetry || null,
      recordingId: debugContext.recordingId || null,
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
  DELETE RECORDING: Firestore + Supabase Storage
  Handles both stored paths (new method) and path reconstruction (fallback)
============================================================ */
export async function deleteRecording(id, filename, audioURL, frontURL, backURL, audioStoragePath = null, frontStoragePath = null, backStoragePath = null) {
  try {
    console.log('🗑️  deleteRecording START:', { 
      id, 
      filename, 
      useStoredPaths: !!(audioStoragePath || frontStoragePath || backStoragePath)
    });
    
    const supabaseClient = getSupabaseClient();
    const files = [];

    // ✅ Method 1: Use stored storage paths (preferred - more reliable)
    if (audioStoragePath) {
      files.push(audioStoragePath);
      console.log('📄 Using stored audio path:', audioStoragePath);
    } else {
      // ⚠️ Fallback: Reconstruct path from filename
      console.log('⚠️  audioStoragePath not provided, reconstructing from filename...');
      const filenameParts = filename.split("_");
      if (filenameParts.length < 2) {
        throw new Error(`Invalid filename format: ${filename}. Expected format: userUID_timestamp.m4a`);
      }
      const user = filenameParts[0];
      const ts = filenameParts[1].split(".")[0];
      files.push(`recordings/${user}/${ts}/audio/${filename}`);
    }

    if (frontStoragePath) {
      files.push(frontStoragePath);
      console.log('🖼️  Using stored front image path:', frontStoragePath);
    } else if (frontURL && typeof frontURL === 'string') {
      console.log('⚠️  frontStoragePath not provided, extracting from URL...');
      const filenameParts = filename.split("_");
      const user = filenameParts[0];
      const ts = filenameParts[1].split(".")[0];
      files.push(`recordings/${user}/${ts}/images/${frontURL.split("/").pop()}`);
    }

    if (backStoragePath) {
      files.push(backStoragePath);
      console.log('🖼️  Using stored back image path:', backStoragePath);
    } else if (backURL && typeof backURL === 'string') {
      console.log('⚠️  backStoragePath not provided, extracting from URL...');
      const filenameParts = filename.split("_");
      const user = filenameParts[0];
      const ts = filenameParts[1].split(".")[0];
      files.push(`recordings/${user}/${ts}/images/${backURL.split("/").pop()}`);
    }

    if (files.length === 0) {
      console.warn('⚠️  No files to delete from storage');
    } else {
      console.log('🚀 Deleting from Supabase storage:', files);
      const { data: storageData, error: storageError } = await supabaseClient.storage
        .from("recordings")
        .remove(files);
      
      if (storageError) {
        console.error('❌ Supabase storage deletion error:', storageError);
        // Don't throw - continue to delete Firestore doc
        console.log('⚠️  Continuing with Firestore deletion despite storage error');
      } else {
        console.log('✅ Files deleted from Supabase storage');
      }
    }

    // Delete Firestore document
    console.log('🗑️  Deleting Firestore document:', id);
    await deleteDoc(doc(db, "recordings", id));
    console.log('✅ Firestore document deleted');
    
    console.log('✅ deleteRecording COMPLETE');
    
  } catch (err) {
    console.error("❌ deleteRecording FAILED:", {
      errorMessage: err.message,
      errorCode: err.code,
      fullError: err
    });
    throw err;
  }
}

/* ============================================================
  UPDATE NAME ONLY
============================================================ */
export async function renameRecording(id, newName) {
  await updateDoc(doc(db, "recordings", id), { filename: newName });
}

/* ============================================================
  MIGRATE OLD RECORDINGS - Add storage paths to existing docs
  This helps fix deletion issues for recordings created before storage paths were stored
  Returns: { success: number, failed: number, skipped: number }
============================================================ */
export async function migrateOldRecordings(userUid) {
  try {
    console.log('🔄 Starting migration for user:', userUid);
    
    const q = query(
      collection(db, "recordings"),
      where("user_uid", "==", userUid)
    );
    
    const querySnapshot = await getDocs(q);
    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const docSnapshot of querySnapshot.docs) {
      const recording = docSnapshot.data();
      
      // Skip if storage paths already exist
      if (recording.audio_storage_path && recording.back_image_storage_path) {
        console.log(`⏭️  Skipping ${docSnapshot.id} - paths already exist`);
        skipped++;
        continue;
      }

      try {
        const filenameParts = recording.filename?.split("_") || [];
        if (filenameParts.length < 2) {
          console.warn(`❌ Cannot migrate ${docSnapshot.id} - invalid filename format`);
          failed++;
          continue;
        }

        const user = filenameParts[0];
        const ts = filenameParts[1].split(".")[0];

        const updates = {};
        
        // Add audio path if missing
        if (!recording.audio_storage_path) {
          updates.audio_storage_path = `recordings/${user}/${ts}/audio/${recording.filename}`;
        }
        
        // Add image paths if missing
        if (!recording.front_image_storage_path && recording.front_image_url) {
          updates.front_image_storage_path = `recordings/${user}/${ts}/images/${user}_${ts}_front.jpg`;
        }
        
        if (!recording.back_image_storage_path && recording.back_image_url) {
          updates.back_image_storage_path = `recordings/${user}/${ts}/images/${user}_${ts}_back.jpg`;
        }

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, "recordings", docSnapshot.id), updates);
          console.log(`✅ Migrated ${docSnapshot.id}:`, updates);
          success++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`❌ Failed to migrate ${docSnapshot.id}:`, err);
        failed++;
      }
    }

    console.log('🎉 Migration complete:', { success, failed, skipped });
    return { success, failed, skipped };
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  }
}
