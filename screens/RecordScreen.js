// screens/RecordScreen.js
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Audio } from "expo-av";
import { CameraView } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import Header from "../components/Header";
import theme from "../styles/theme";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../useAuth";
import { uploadRecording } from "../services/recordingsService";
import { requestCameraPermission } from "../services/cameraService";
import { useKeepAwake } from "expo-keep-awake";

export default function RecordScreen() {
  useKeepAwake();

  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [animatePulse, setAnimatePulse] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  const [frontImageUri, setFrontImageUri] = useState(null);
  const [backImageUri, setBackImageUri] = useState(null);

  const cameraRef = useRef(null);
  const [cameraType, setCameraType] = useState("back");
  const isCapturingRef = useRef(false);

  const recordingRef = useRef(null);
  const timerRef = useRef(null);
  const pulseRef = useRef(null);
  const captureIntervalRef = useRef(null);

  const navigation = useNavigation();
  const user = useAuth();

  // Permission
  useEffect(() => {
    (async () => {
      const granted = await requestCameraPermission();
      setHasCameraPermission(granted);

      if (!granted) console.warn("Camera permission not granted");
    })();
  }, []);

  // Timer & repeated image capture
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      pulseRef.current = setInterval(() => {
        setAnimatePulse((prev) => !prev);
      }, 600);

      if (hasCameraPermission) {
        captureIntervalRef.current = setInterval(async () => {
          await captureImagesFromBothCameras();
        }, 60000);

        captureImagesFromBothCameras(); // initial
      }
    } else {
      clearAllTimers();
      setRecordingTime(0);
    }

    return () => clearAllTimers();
  }, [isRecording, hasCameraPermission]);

  const clearAllTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pulseRef.current) clearInterval(pulseRef.current);
    if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Start Recording
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted")
        return Alert.alert("Permission Denied", "Enable mic access.");

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY
      );
      await recording.startAsync();

      recordingRef.current = recording;
      setIsRecording(true);

      if (hasCameraPermission) {
        console.log("📸 Capturing first images...");
        await captureImagesFromBothCameras();
      }

      console.log("🎙 Recording started");
    } catch (err) {
      console.log(err);
      Alert.alert("Error", "Could not start recording.");
    }
  };

  // Stop Recording
  const stopRecording = async () => {
    try {
      if (!recordingRef.current)
        return Alert.alert("No active recording.");

      setIsRecording(false);
      setUploading(true);

      await recordingRef.current.stopAndUnloadAsync();
      const tempUri = recordingRef.current.getURI();

      const directory = FileSystem.documentDirectory + "recordings/";
      const dir = await FileSystem.getInfoAsync(directory);
      if (!dir.exists)
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

      const finalPath = `${directory}audio_${Date.now()}.m4a`;
      await FileSystem.copyAsync({ from: tempUri, to: finalPath });

      if (hasCameraPermission) {
        await captureImagesFromBothCameras();
      }

      await uploadRecording(
        user.uid,
        finalPath,
        frontImageUri,
        backImageUri,
        recordingTime
      );

      Alert.alert("Success", "Recording uploaded with images.");
      setFrontImageUri(null);
      setBackImageUri(null);
      recordingRef.current = null;
    } catch (err) {
      console.log("stopRecording error:", err);
      Alert.alert("Failed", "Audio upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const toggleRecording = () => {
    isRecording ? stopRecording() : startRecording();
  };

  // Capture back camera image only
  const captureImagesFromBothCameras = async () => {
    if (!cameraRef.current || isCapturingRef.current) return;
    try {
      isCapturingRef.current = true;

      // Capture back camera image
      const back = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        skipProcessing: true,
      });
      if (back?.uri) {
        setBackImageUri(back.uri);
        console.log("📸 Back image captured:", back.uri);
      }

    } catch (err) {
      console.error("Image capture error:", err);
    } finally {
      isCapturingRef.current = false;
    }
  };

  const wait = (ms) => new Promise((res) => setTimeout(res, ms));

  return (
    <View style={styles.container}>
      <Header />

      {/* Hidden Camera for silent capture */}
      {hasCameraPermission && (
        <View style={styles.hiddenCameraContainer} pointerEvents="none">
          <CameraView
            ref={cameraRef}
            style={styles.hiddenCamera}
            facing={cameraType}  // ⭐ SDK 54 CORRECT PROP
          />
        </View>
      )}

      <TouchableOpacity
        style={styles.historyCard}
        onPress={() =>
          navigation.navigate("RecordingsHistory", { userUid: user.uid })
        }
      >
        <Text style={styles.historyTitle}>Saved Recordings</Text>
        <Text style={styles.historySubtitle}>Tap to view</Text>
      </TouchableOpacity>

      <View style={styles.centerArea}>
        {isRecording && (
          <View style={styles.timerContainer}>
            <View
              style={[
                styles.recordingIndicator,
                animatePulse && styles.recordingIndicatorActive,
              ]}
            />
            <Text style={styles.timerText}>{formatTime(recordingTime)}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.recordButton,
            isRecording && { backgroundColor: theme.colors.danger },
          ]}
          onPress={toggleRecording}
          disabled={uploading}
        >
          <Text style={styles.recordText}>
            {uploading
              ? "Uploading..."
              : isRecording
              ? "Stop Recording"
              : "Start Recording"}
          </Text>
        </TouchableOpacity>

        {uploading && (
          <ActivityIndicator
            style={{ marginTop: 20 }}
            color={theme.colors.primary}
          />
        )}
      </View>
    </View>
  );
}

// ---------------- STYLES ----------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  hiddenCameraContainer: {
    position: "absolute",
    top: -1000,
    left: -1000,
    width: 140,
    height: 200,
    opacity: 0.01,
    overflow: "hidden",
  },
  hiddenCamera: {
    width: 140,
    height: 200,
  },

  historyCard: {
    backgroundColor: "#F3F3F3",
    padding: 20,
    borderRadius: 15,
    width: "90%",
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  historyTitle: { fontSize: 18, fontWeight: "600" },
  historySubtitle: { color: "gray" },

  centerArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 80,
  },

  timerContainer: {
    alignItems: "center",
    marginBottom: 50,
    backgroundColor: "#FEF0F0",
    paddingVertical: 25,
    paddingHorizontal: 40,
    borderRadius: 15,
    width: "85%",
  },
  recordingIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.danger,
    marginBottom: 12,
  },
  recordingIndicatorActive: {
    opacity: 0.5,
  },
  timerText: {
    fontSize: 36,
    fontWeight: "bold",
    color: theme.colors.danger,
    letterSpacing: 2,
  },

  recordButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 22,
    paddingHorizontal: 60,
    borderRadius: 15,
    minWidth: 250,
    alignItems: "center",
  },
  recordText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
