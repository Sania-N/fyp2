import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MapView from 'react-native-maps';
import Header from '../components/Header';
import ChatFAB from '../components/ChatFAB';
import theme from '../styles/theme';

export default function RoutesScreen() {
  return (
    <LinearGradient colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} style={styles.gradient}>
      <View style={styles.container}>
        <Header />
        <Text style={styles.title}>Safe Routes</Text>
        <Text style={styles.subtitle}>Find the safest route to your destination</Text>

        <MapView style={styles.map} />

        <TouchableOpacity style={styles.routeButton}>
          <Text style={styles.routeText}>Find Safe Route</Text>
        </TouchableOpacity>
        <ChatFAB />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent', paddingBottom: 90 },
  title: { fontSize: 28, fontWeight: '700', marginLeft: 20, marginTop: 16, color: '#fff' },
  subtitle: { marginLeft: 20, color: 'rgba(255, 255, 255, 0.7)', fontSize: 15, fontWeight: '500' },
  map: { flex: 1, margin: 15, borderRadius: 15, marginBottom: 10 },
  routeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    margin: 20,
    borderRadius: 15,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 200, 220, 0.5)',
  },
  routeText: { color: 'rgba(255, 200, 220, 1)', fontSize: 18, fontWeight: '700' },
});
