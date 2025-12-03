//TrackMeScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import Header from '../components/Header';
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 10 }}>Fetching your location...</Text>
      </View>
    );
  }

  return (
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
        <Text style={{ textAlign: 'center', marginTop: 50 }}>
          Location unavailable. Try again.
        </Text>
      )}

      <TouchableOpacity style={styles.trackButton} onPress={handleRefresh}>
        <Text style={styles.trackText}>Refresh Location</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginLeft: 20, marginTop: 10 },
  subtitle: { marginLeft: 20, color: 'gray' },
  addFriendButton: {
    backgroundColor: '#800080',
    padding: 10,
    borderRadius: 8,
    alignSelf: 'flex-end',
    marginRight: 20,
  },
  addFriendText: { color: '#fff', fontWeight: '600' },
  map: { flex: 1, margin: 10, borderRadius: 15 },
  trackButton: {
    backgroundColor: theme.colors.primary,
    margin: 20,
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: 'center',
  },
  trackText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
