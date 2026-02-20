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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import theme from '../styles/theme';

const MenuItem = ({ icon, title, onPress }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress}>
    <Ionicons name={icon} size={24} color="#fff" />
    <Text style={styles.menuItemText}>{title}</Text>
    <Ionicons name="chevron-forward-outline" size={20} color="#fff" />
  </TouchableOpacity>
);

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
    <LinearGradient 
      colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} 
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close-outline" size={34} color="#fff" />
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

            {/* Header Card with Profile */}
            <View style={styles.headerCard}>
              <Image
                source={{ uri: 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                style={styles.avatar}
              />

              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={styles.userInfo}>
                  <Text style={styles.name}>{userData.name}</Text>
                  <Text style={styles.email}>{userData.email}</Text>
                </View>
              )}
            </View>

            {/* Menu Items Card */}
            <View style={styles.menuCard}>
              <MenuItem
                icon="home-outline"
                title="Dashboard"
                onPress={() => navigation.navigate('MainTabs', { screen: 'Track Me' })}
              />
              <View style={styles.menuDivider} />

              <MenuItem
                icon="person-outline"
                title="Profile"
                onPress={() => navigation.navigate('ProfileScreen')}
              />
              <View style={styles.menuDivider} />

              <MenuItem
                icon="map-outline"
                title="Safe Routes"
                onPress={() => navigation.navigate('MainTabs', { screen: 'Routes' })}
              />
              <View style={styles.menuDivider} />

              <MenuItem
                icon="shield-outline"
                title="Geo-fencing"
                onPress={() => {}}
              />
              <View style={styles.menuDivider} />

              <MenuItem
                icon="chatbubbles-outline"
                title="AI Chatbot"
                onPress={() => navigation.navigate('ChatbotScreen')}
              />
              <View style={styles.menuDivider} />

              <MenuItem
                icon="settings-outline"
                title="Settings"
                onPress={() => {}}
              />
            </View>

            {/* Logout Button */}
            <TouchableOpacity style={styles.logoutCard} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={24} color="rgba(255, 100, 130, 1)" />
              <Text style={styles.logoutText}>LOGOUT</Text>
            </TouchableOpacity>

          </ScrollView>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 15,
    marginTop: 10,
    zIndex: 10,
  },
  scroll: {
    alignItems: 'center',
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  headerCard: {
    width: '100%',
    backgroundColor: 'rgba(77, 20, 60, 0.4)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
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
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 15,
    opacity: 0.9,
  },
  userInfo: {
    alignItems: 'center',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
  },
  menuCard: {
    width: '100%',
    backgroundColor: 'rgba(77, 20, 60, 0.4)',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 15,
    color: '#fff',
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 18,
  },
  logoutCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 100, 130, 0.15)',
    borderRadius: 15,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 100, 130, 0.4)',
    marginBottom: 20,
  },
  logoutText: {
    color: 'rgba(255, 100, 130, 1)',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 10,
    letterSpacing: 0.5,
  },
});