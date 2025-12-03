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

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.actionButtons}>
              <TouchableOpacity onPress={() => playAudio(item)} style={styles.playButton}>
                <Ionicons name={playingId === item.id ? "pause" : "play"} size={24} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleRename(item)} style={styles.iconButton}>
                <Ionicons name="pencil" size={20} color="#333" />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconButton}>
                <Ionicons name="trash-outline" size={20} color="#ff3b30" />
              </TouchableOpacity>
            </View>

            {(item.front_image_url || item.back_image_url) && (
              <View style={styles.imagesContainer}>
                {item.front_image_url && <Image source={{ uri: item.front_image_url }} style={styles.image} />}
                {item.back_image_url && <Image source={{ uri: item.back_image_url }} style={styles.image} />}
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading)
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#800020" />
      </View>
    );

  return (
    <LinearGradient colors={theme.gradient.background} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={28} color="#800020" />
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
    paddingTop: 10,
    paddingBottom: 5,
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
    color: "#800020",
    marginBottom: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  card: {
    backgroundColor: "#FDF5F7",
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#800020",
    padding: 16,
    marginBottom: 10,
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
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  time: {
    color: "#666",
    fontSize: 13,
  },
  duration: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E8D5D9",
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  playButton: {
    backgroundColor: "#800020",
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  iconButton: {
    backgroundColor: "#F0E5E8",
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  imagesContainer: {
    flexDirection: "row",
    gap: 10,
  },
  image: {
    width: 90,
    height: 110,
    borderRadius: 8,
    backgroundColor: "#E8D5D9",
  },
  emptyText: {
    textAlign: "center",
    color: "#8E8E93",
    fontSize: 16,
    marginTop: 40,
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
