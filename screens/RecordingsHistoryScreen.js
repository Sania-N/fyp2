// screens/RecordingsHistoryScreen.js
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import theme from "../styles/theme";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Audio } from "expo-av";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import {
  getUserRecordings,
  listenUserRecordings,
  deleteRecording,
  renameRecording,
} from "../services/recordingsService";

export default function RecordingsHistoryScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { userUid } = route.params;

  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [savingPhoto, setSavingPhoto] = useState(false);

  const soundRef = useRef(null);

  useEffect(() => {
    const unsub = listenUserRecordings(userUid, (arr) => {
      setRecordings(arr);
      setLoading(false);
    });

    getUserRecordings(userUid)
      .then((arr) => {
        if (arr.length && recordings.length === 0) {
          setRecordings(arr);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));

    return () => {
      if (unsub) unsub();
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, [userUid]);

  const formatDate = (ts) => {
    try {
      if (!ts) return "";
      const date = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
      const options = { day: "numeric", month: "short", year: "numeric" };
      return date.toLocaleDateString("en-GB", options);
    } catch {
      return "";
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const playAudio = async (item) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setPlayingId(null);
      }

      if (!item.audio_url) {
        Alert.alert("Error", "No audio URL available for this recording.");
        return;
      }

      setPlayingId(item.id);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: item.audio_url },
        { shouldPlay: true }
      );

      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) {
          if (status.error) {
            console.error("Audio load error:", status.error);
          }
          return;
        }
        if (status.didJustFinish || (status.positionMillis >= status.durationMillis && !status.isPlaying)) {
          setPlayingId(null);
          try {
            sound.unloadAsync();
          } catch {}
          soundRef.current = null;
        }
      });
    } catch (err) {
      console.error("playAudio error", err);
      Alert.alert("Playback error", "Unable to play this recording: " + err.message);
      setPlayingId(null);
    }
  };

  const handleDelete = (item) => {
    Alert.alert("Delete Recording", "Are you sure you want to delete this recording?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        onPress: async () => {
          try {
            setDeleting(true);
            // pass front & back URLs (may be undefined) so service can remove them
            await deleteRecording(item.id, item.filename, item.audio_url, item.front_image_url, item.back_image_url);
            Alert.alert("Success", "Recording deleted successfully");
            setExpandedId(null);
          } catch (err) {
            Alert.alert("Error", "Failed to delete recording: " + (err.message || err));
          } finally {
            setDeleting(false);
          }
        },
        style: "destructive",
      },
    ]);
  };

  const handleRename = (item) => {
    setSelectedRecording(item);
    setNewName(item.filename);
    setRenameModalVisible(true);
  };

  const confirmRename = async () => {
    if (!newName.trim()) {
      Alert.alert("Error", "Name cannot be empty");
      return;
    }
    try {
      setDeleting(true);
      await renameRecording(selectedRecording.id, newName.trim());
      setRenameModalVisible(false);
      setNewName("");
      setSelectedRecording(null);
      Alert.alert("Success", "Recording renamed successfully");
    } catch (err) {
      Alert.alert("Error", "Failed to rename recording: " + (err.message || err));
    } finally {
      setDeleting(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const openPhotoModal = (photoUri) => {
    setSelectedPhoto(photoUri);
    setPhotoModalVisible(true);
  };

  const savePhotoToGallery = async () => {
    try {
      setSavingPhoto(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Gallery permission is required to save photos.");
        return;
      }

      // Download photo to local cache first
      const filename = selectedPhoto.split("/").pop() || `photo_${Date.now()}.jpg`;
      const localUri = `${FileSystem.cacheDirectory}${filename}`;

      // Download the image
      await FileSystem.downloadAsync(selectedPhoto, localUri);

      // Save to gallery
      const asset = await MediaLibrary.createAssetAsync(localUri);
      await MediaLibrary.createAlbumAsync("Safety App", asset, false);

      Alert.alert("Success", "Photo saved to gallery!");
      setPhotoModalVisible(false);
    } catch (error) {
      console.error("Save photo error:", error);
      Alert.alert("Error", "Failed to save photo: " + error.message);
    } finally {
      setSavingPhoto(false);
    }
  };

  const renderItem = ({ item }) => {
    const isExpanded = expandedId === item.id;

    return (
      <TouchableOpacity style={styles.card} onPress={() => toggleExpand(item.id)} activeOpacity={0.7}>
        <View style={styles.cardTop}>
          <View style={styles.recordingInfo}>
            <Text style={styles.recordingName}>{item.filename}</Text>
            <Text style={styles.time}>{formatDate(item.created_at)}</Text>
          </View>
          <Text style={styles.duration}>{formatDuration(item.duration)}</Text>
        </View>
      {/* 🧠 Emotion Detection Result */}
{item.emotion && (
  <View style={{ marginTop: 6 }}>
    <Text
      style={{
        fontSize: 14,
        fontWeight: "600",
        color: item.panic ? "#D32F2F" : "#2E7D32",
      }}
    >
      Emotion: {item.emotion.toUpperCase()}
    </Text>

    {item.confidence !== null && (
      <Text style={{ fontSize: 12, color: "#555" }}>
        Confidence: {(item.confidence * 100).toFixed(1)}%
      </Text>
    )}
  </View>
)}

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.actionButtons}>
              <TouchableOpacity onPress={() => playAudio(item)} style={styles.playButton}>
                <Ionicons name={playingId === item.id ? "pause" : "play"} size={24} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleRename(item)} style={styles.iconButton}>
                <Ionicons name="pencil" size={20} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconButton}>
                <Ionicons name="trash-outline" size={20} color="#ff3b30" />
              </TouchableOpacity>
            </View>

            {(item.front_image_url || item.back_image_url) && (
              <View style={styles.imagesContainer}>
                {item.front_image_url && (
                  <TouchableOpacity onPress={() => openPhotoModal(item.front_image_url)} activeOpacity={0.7}>
                    <Image source={{ uri: item.front_image_url }} style={styles.image} />
                    <Text style={styles.imageLabel}>Front</Text>
                  </TouchableOpacity>
                )}
                {item.back_image_url && (
                  <TouchableOpacity onPress={() => openPhotoModal(item.back_image_url)} activeOpacity={0.7}>
                    <Image source={{ uri: item.back_image_url }} style={styles.image} />
                    <Text style={styles.imageLabel}>Back</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading)
    return (
      <LinearGradient colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </LinearGradient>
    );

  return (
    <LinearGradient colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        <Text style={styles.title}>All Recordings</Text>
        <FlatList data={recordings} keyExtractor={(item) => item.id} renderItem={renderItem} ListEmptyComponent={<Text style={styles.emptyText}>No recordings found.</Text>} showsVerticalScrollIndicator={false} />
      </View>

      {/* Rename Modal */}
      <Modal visible={renameModalVisible} transparent animationType="fade" onRequestClose={() => setRenameModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rename Recording</Text>
            <TextInput style={styles.modalInput} value={newName} onChangeText={setNewName} placeholder="Enter new name" autoFocus />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setRenameModalVisible(false)} disabled={deleting} style={[styles.modalButton, styles.cancelButton]}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmRename} disabled={deleting} style={[styles.modalButton, styles.saveButton]}>
                {deleting ? <ActivityIndicator color="#fff" /> : <Text style={[styles.buttonText, { color: "#fff" }]}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo Viewer Modal */}
      <Modal visible={photoModalVisible} transparent animationType="fade" onRequestClose={() => setPhotoModalVisible(false)}>
        <View style={styles.photoModalOverlay}>
          <TouchableOpacity style={styles.photoCloseButton} onPress={() => setPhotoModalVisible(false)}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>

          {selectedPhoto && <Image source={{ uri: selectedPhoto }} style={styles.fullPhoto} resizeMode="contain" />}

          <View style={styles.photoButtonsContainer}>
            <TouchableOpacity
              style={[styles.photoButton, styles.savePhotoButton]}
              onPress={savePhotoToGallery}
              disabled={savingPhoto}
            >
              {savingPhoto ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="download" size={22} color="#fff" />
                  <Text style={styles.photoButtonText}>Save to Gallery</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.photoButton, styles.cancelPhotoButton]}
              onPress={() => setPhotoModalVisible(false)}
              disabled={savingPhoto}
            >
              <Text style={styles.photoButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  header: {
    paddingHorizontal: 15,
    paddingTop: 0,
    paddingBottom: 0,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: "transparent",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  card: {
    backgroundColor: "rgba(77, 20, 60, 0.4)",
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "rgba(255, 200, 220, 1)",
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  recordingInfo: {
    flex: 1,
    marginRight: 12,
  },
  recordingName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  time: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 13,
  },
  duration: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "500",
  },
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.15)",
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  playButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 200, 220, 0.5)",
  },
  iconButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 200, 220, 0.4)",
  },
  imagesContainer: {
    flexDirection: "row",
    gap: 10,
  },
  image: {
    width: 90,
    height: 110,
    borderRadius: 8,
    backgroundColor: "rgba(77, 20, 60, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  imageLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    marginTop: 6,
    textAlign: "center",
  },
  emptyText: {
    textAlign: "center",
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 16,
    marginTop: 40,
    fontWeight: "500",
  },
  // Photo Modal Styles
  photoModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoCloseButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  fullPhoto: {
    width: "90%",
    height: "60%",
    borderRadius: 12,
  },
  photoButtonsContainer: {
    position: "absolute",
    bottom: 40,
    width: "90%",
    gap: 12,
    alignSelf: "center",
  },
  photoButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  savePhotoButton: {
    backgroundColor: "#800020",
  },
  cancelPhotoButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    borderColor: "#fff",
  },
  photoButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1C1C1E",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    color: "#fff",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#3A3A3C",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 20,
    fontSize: 16,
    backgroundColor: "#2C2C2E",
    color: "#fff",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#3A3A3C",
  },
  saveButton: {
    backgroundColor: "#800020",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
