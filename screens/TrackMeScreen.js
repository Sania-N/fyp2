//TrackMeScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import Header from '../components/Header';
import ChatFAB from '../components/ChatFAB';
import theme from '../styles/theme';
import { useNavigation } from '@react-navigation/native';


export default function TrackMeScreen() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
    const navigation = useNavigation();
  // Request permission + fetch location
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please allow location access to use this feature.');
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      setLoading(false);
    })();
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    const loc = await Location.getCurrentPositionAsync({});
    setLocation({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });
    setLoading(false);
  };

  if (loading) {
    return (
      <LinearGradient colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ marginTop: 10, color: '#fff' }}>Fetching your location...</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient 
      colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} 
      style={{ flex: 1 }}
    >
      <View style={styles.container}>
        <Header />
        <Text style={styles.title}>Track Me</Text>
        <Text style={styles.subtitle}>Share live location with your friends</Text>

        <TouchableOpacity
          style={styles.addFriendButton}
          onPress={() => navigation.navigate('ContactsScreen')}
        >
          <Text style={styles.addFriendText}>Add Friends</Text>
        </TouchableOpacity>

        {location ? (
          <MapView
            style={styles.map}
            showsUserLocation={true}
            region={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
          >
            <Marker coordinate={location} title="You are here" />
          </MapView>
        ) : (
          <Text style={{ textAlign: 'center', marginTop: 50, color: '#fff' }}>
            Location unavailable. Try again.
          </Text>
        )}

        <ChatFAB />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingBottom: 90 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginLeft: 20, marginTop: 10, color: '#fff' },
  subtitle: { marginLeft: 20, color: 'rgba(255, 255, 255, 0.7)' },
  addFriendButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 10,
    borderRadius: 8,
    alignSelf: 'flex-end',
    marginRight: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.5)',
  },
  addFriendText: { color: 'rgba(255, 200, 220, 1)', fontWeight: '600' },
  map: { flex: 1, margin: 10, borderRadius: 15 },
  trackButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    margin: 20,
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.5)',
  },
  trackText: { color: 'rgba(255, 200, 220, 1)', fontSize: 18, fontWeight: '600' },
});
