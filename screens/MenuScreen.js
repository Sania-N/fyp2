// MenuScreen.js
import React, { useState, useEffect } from 'react';
import { getAuth, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase"; 

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import theme from '../styles/theme';

export default function MenuScreen() {
  const navigation = useNavigation();
  const auth = getAuth();

  const [userData, setUserData] = useState({
    name: 'Loading...',
    email: 'Loading...',
  });
  const [loading, setLoading] = useState(true);

  // 🔥 Real-Time Firestore Listener (Updates when name changes)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const userDocRef = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setUserData({
          name: data.username || data.name || "User",
          email: user.email,
        });
      } else {
        setUserData({ name: "User", email: user.email });
      }
      setLoading(false);
    });

    return () => unsubscribe(); // clean listener
  }, []);

  // Logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("Logged out");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        
        {/* Close button */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close-outline" size={34} />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.scroll}>

          {/* Profile header */}
          <View style={styles.header}>
            <Image
              source={{ uri: 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
              style={styles.avatar}
            />

            {loading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <>
                <Text style={styles.name}>{userData.name}</Text>
                <Text style={styles.email}>{userData.email}</Text>
              </>
            )}
          </View>

          {/* Menu Items */}
          <View style={styles.menuList}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Track Me' })}
            >
              <Ionicons name="home-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.menuText}>Dashboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('ProfileScreen')}
            >
              <Ionicons name="person-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.menuText}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Routes' })}
            >
              <Ionicons name="map-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.menuText}>Safe Routes</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="shield-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.menuText}>Geo-fencing</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Chatbot' })}
            >
              <Ionicons name="chatbubbles-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.menuText}>AI Chatbot</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="settings-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.menuText}>Settings</Text>
            </TouchableOpacity>
          </View>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: '#fff' }, container: { flex: 1, backgroundColor: '#fff' }, closeButton: { alignSelf: 'flex-end', padding: 15, marginTop: 10, zIndex: 10 }, scroll: { alignItems: 'center', paddingBottom: 40 }, header: { alignItems: 'center', marginTop: 10 }, avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 10 }, name: { fontSize: 20, fontWeight: '700' }, email: { color: 'gray', marginBottom: 20 }, menuList: { width: '90%', marginTop: 10 }, menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 0.5, borderColor: '#ddd', }, menuText: { fontSize: 16, marginLeft: 15 }, logoutButton: { marginTop: 30, backgroundColor: theme.colors.primary, paddingVertical: 12, paddingHorizontal: 60, borderRadius: 25, }, logoutText: { color: '#fff', fontWeight: '600' }, });