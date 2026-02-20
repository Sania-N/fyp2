import React, { useEffect, useState } from 'react';
import { 
  View, Text, Image, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, ScrollView, SafeAreaView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../styles/theme';
import { auth } from '../firebase';
import { updateProfile } from "firebase/auth";
import { getUser, updateUsername } from "../services/userService";

export default function ProfileScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getUser();
      if (data) {
        setUsername(data.username);
        setEmail(data.email);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    if (!username.trim()) return Alert.alert("Error", "Username cannot be empty!");

    setLoading(true);
    try {
      await updateUsername(username.trim());
      await updateProfile(auth.currentUser, { displayName: username.trim() });
      setEditing(false);
      Alert.alert("Success", "Profile updated!");
    } catch (err) {
      Alert.alert("Error updating profile");
      console.log(err);
    }
    setLoading(false);
  };

  if (loading) return (
    <LinearGradient colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} style={styles.container}>
      <ActivityIndicator size="large" color="#fff"/>
    </LinearGradient>
  );

  return (
    <LinearGradient 
      colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} 
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Back Button */}
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back-outline" size={28} color="#fff"/>
          </TouchableOpacity>

          {/* Card Container */}
          <View style={styles.cardContainer}>
            {/* Avatar */}
            <Image 
              source={{ uri:'https://cdn-icons-png.flaticon.com/512/847/847969.png' }} 
              style={styles.avatar}
            />

            {/* Username */}
            {editing ? (
              <TextInput 
                style={styles.editInput}
                value={username}
                onChangeText={setUsername}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
            ) : (
              <Text style={styles.name}>{username}</Text>
            )}

            {/* Email */}
            <Text style={styles.email}>{email}</Text>

            {/* Edit/Save Button */}
            <TouchableOpacity 
              style={styles.editButtonGradient}
              onPress={editing ? handleSave : () => setEditing(true)}
            >
              <Text style={styles.editButtonText}>
                {editing ? "SAVE" : "EDIT PROFILE"}
              </Text>
            </TouchableOpacity>

            {/* Logout Button */}
            <TouchableOpacity 
              style={styles.logoutButtonGradient}
              onPress={async() => { await auth.signOut(); navigation.replace("Login"); }}
            >
              <Text style={styles.logoutText}>LOGOUT</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 15,
    marginLeft: 10,
  },
  cardContainer: {
    width: '90%',
    maxWidth: 380,
    backgroundColor: 'rgba(77, 20, 60, 0.4)',
    borderRadius: 25,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 20,
    opacity: 0.9,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  email: {
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 25,
    fontSize: 14,
  },
  editInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    width: '90%',
    fontSize: 17,
    borderRadius: 10,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 25,
    textAlign: 'center',
  },
  editButtonGradient: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.5)',
    alignItems: 'center',
    marginBottom: 15,
  },
  editButtonText: {
    color: 'rgba(255, 200, 220, 1)',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  buttonGradient: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 15,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  buttonText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  logoutButtonGradient: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.5)',
    alignItems: 'center',
  },
  logoutText: {
    color: 'rgba(255, 200, 220, 1)',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
