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
    const urls = {};

    // Only upload back image
    if (backImageUri) {
      const name = `${userUid}_${timestamp}_back.jpg`;
      const path = `recordings/${userUid}/${timestamp}/images/${name}`;
      
      // Read file as base64
      const base64Data = await FileSystem.readAsStringAsync(backImageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const { error } = await supabase.storage.from("recordings").upload(path, decode(base64Data), {
        contentType: "image/jpeg",
      });
      if (error) throw error;
      const { data } = supabase.storage.from("recordings").getPublicUrl(path);
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
export async function uploadRecording(userUid, localUri, frontImageUri, backImageUri, duration = 0) {
  try {
    const ts = Date.now();
    const filename = `${userUid}_${ts}.m4a`;
    const storagePath = `recordings/${userUid}/${ts}/audio/${filename}`;

    // Read audio file as base64 and upload
    const base64Audio = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { error } = await supabase.storage.from("recordings").upload(storagePath, decode(base64Audio), {
      contentType: "audio/m4a",
    });
    if (error) throw error;

    const { data: audioData } = supabase.storage.from("recordings").getPublicUrl(storagePath);
    const audioUrl = audioData?.publicUrl || null;
    console.log("🎵 Audio uploaded:", audioUrl);

    // Upload images
    const images = await uploadImages(userUid, frontImageUri, backImageUri, ts);

    // Save metadata in Firestore
    const docRef = await addDoc(collection(db, "recordings"), {
      user_uid: userUid,
      filename,
      audio_url: audioUrl,
      front_image_url: images.front_image_url || null,
      back_image_url: images.back_image_url || null,
      duration,
      created_at: serverTimestamp(),
    });

    console.log("🔥 Saved to Firestore Successfully with ID:", docRef.id);
    return audioUrl;
  } catch (err) {
    console.error("uploadRecording failed", err);
    throw err;
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
    const user = filename.split("_")[0];
    const ts = filename.split("_")[1].split(".")[0];
    const base = `recordings/${user}/${ts}/`;

    const files = [`${base}audio/${filename}`];

    if (frontURL) files.push(`${base}images/${frontURL.split("/").pop()}`);
    if (backURL) files.push(`${base}images/${backURL.split("/").pop()}`);

    // supabase remove expects array of paths
    await supabase.storage.from("recordings").remove(files);

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
