/**
 * 🧹 Cleanup Orphaned Recordings - Delete recordings in Supabase that don't have Firestore entries
 * 
 * Usage:
 * 1. Set CLEANUP_USER_ID to your user UID
 * 2. Run: node cleanupOrphanedRecordings.js
 * 
 * This will:
 * - List all recordings in Supabase storage
 * - Check if each has a corresponding Firestore document
 * - Delete orphaned files
 */

import { supabase } from "../supabase.js";
import { db } from "../firebase.js";
import { collection, getDocs, query, where } from "firebase/firestore";

// ⚠️ SET THIS TO YOUR USER UID
const CLEANUP_USER_ID = "YOUR_USER_UID_HERE";

function log(icon, message) {
  console.log(`${icon} [${new Date().toLocaleTimeString()}] ${message}`);
}

async function getRecordingsFromFirestore(userUid) {
  try {
    log("📚", "Fetching Firestore recordings...");
    const q = query(collection(db, "recordings"), where("user_uid", "==", userUid));
    const querySnapshot = await getDocs(q);
    
    const firestoreRecordings = new Map();
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      firestoreRecordings.set(doc.id, {
        filename: data.filename,
        audio_storage_path: data.audio_storage_path,
        front_image_storage_path: data.front_image_storage_path,
        back_image_storage_path: data.back_image_storage_path,
      });
    });
    
    log("✅", `Found ${firestoreRecordings.size} recordings in Firestore`);
    return firestoreRecordings;
  } catch (err) {
    log("❌", `Failed to fetch Firestore recordings: ${err.message}`);
    throw err;
  }
}

async function getRecordingsFromStorage(userUid) {
  try {
    log("💾", "Fetching recordings from Supabase storage...");
    
    // List all files under recordings/userUid/
    const { data: files, error } = await supabase.storage
      .from("recordings")
      .list(`recordings/${userUid}/`, {
        limit: 1000,
        offset: 0,
      });
    
    if (error) {
      throw error;
    }
    
    const storageFiles = [];
    
    // Recursively list all files
    async function listRecursive(path) {
      const { data: items, error: err } = await supabase.storage
        .from("recordings")
        .list(path, { limit: 1000 });
      
      if (err) {
        throw err;
      }
      
      for (const item of items || []) {
        if (item.id === ".emptyFolderPlaceholder") continue;
        
        const fullPath = `${path}${item.name}`;
        if (item.metadata?.mimetype) {
          // It's a file
          storageFiles.push(fullPath);
        } else {
          // It's a folder, recurse
          await listRecursive(`${fullPath}/`);
        }
      }
    }
    
    await listRecursive(`recordings/${userUid}/`);
    
    log("✅", `Found ${storageFiles.length} files in Supabase storage`);
    return storageFiles;
  } catch (err) {
    log("❌", `Failed to fetch storage files: ${err.message}`);
    throw err;
  }
}

async function findOrphanedFiles(userUid, firestoreRecordings, storageFiles) {
  log("🔍", "Analyzing files for orphans...");
  
  const orphanedFiles = [];
  
  for (const file of storageFiles) {
    let isOrphaned = true;
    
    // Check if this file is referenced in any Firestore document
    for (const [docId, recording] of firestoreRecordings) {
      if (
        file === recording.audio_storage_path ||
        file === recording.front_image_storage_path ||
        file === recording.back_image_storage_path
      ) {
        isOrphaned = false;
        break;
      }
    }
    
    if (isOrphaned) {
      orphanedFiles.push(file);
      log("🗑️ ", `Orphaned: ${file}`);
    }
  }
  
  log("📊", `Found ${orphanedFiles.length} orphaned files out of ${storageFiles.length}`);
  return orphanedFiles;
}

async function deleteOrphanedFiles(orphanedFiles) {
  if (orphanedFiles.length === 0) {
    log("ℹ️ ", "No orphaned files to delete!");
    return { success: 0, failed: 0 };
  }
  
  log("🚨", `About to delete ${orphanedFiles.length} orphaned files!`);
  
  // Batch delete - Supabase allows up to 1000 files per request
  let success = 0;
  let failed = 0;
  
  const batchSize = 100;
  for (let i = 0; i < orphanedFiles.length; i += batchSize) {
    const batch = orphanedFiles.slice(i, i + batchSize);
    
    try {
      log("🗑️ ", `Deleting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(orphanedFiles.length / batchSize)} (${batch.length} files)...`);
      
      const { error } = await supabase.storage
        .from("recordings")
        .remove(batch);
      
      if (error) {
        log("❌", `Batch deletion error: ${error.message}`);
        failed += batch.length;
      } else {
        log("✅", `Batch deleted successfully`);
        success += batch.length;
      }
    } catch (err) {
      log("❌", `Failed to delete batch: ${err.message}`);
      failed += batch.length;
    }
  }
  
  return { success, failed };
}

async function cleanup(userUid) {
  try {
    if (userUid === "YOUR_USER_UID_HERE") {
      log("❌", "Please set CLEANUP_USER_ID to your actual user UID");
      process.exit(1);
    }
    
    log("🧹", "Starting orphaned recordings cleanup...");
    log("👤", `User ID: ${userUid}`);
    
    // Step 1: Get all Firestore recordings
    const firestoreRecordings = await getRecordingsFromFirestore(userUid);
    
    // Step 2: Get all storage files
    const storageFiles = await getRecordingsFromStorage(userUid);
    
    // Step 3: Find orphaned files
    const orphanedFiles = await findOrphanedFiles(userUid, firestoreRecordings, storageFiles);
    
    // Step 4: Delete orphaned files
    const result = await deleteOrphanedFiles(orphanedFiles);
    
    // Summary
    log("📊", "=== CLEANUP SUMMARY ===");
    log("📚", `Firestore recordings: ${firestoreRecordings.size}`);
    log("💾", `Storage files: ${storageFiles.length}`);
    log("🗑️ ", `Orphaned files found: ${orphanedFiles.length}`);
    log("✅", `Successfully deleted: ${result.success}`);
    log("❌", `Failed to delete: ${result.failed}`);
    log("🎉", "Cleanup complete!");
    
  } catch (err) {
    log("❌", `Cleanup failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

// Run cleanup
cleanup(CLEANUP_USER_ID);
