import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MapView from 'react-native-maps';
import Header from '../components/Header';
import theme from '../styles/theme';

export default function RoutesScreen() {
  return (
    <View style={styles.container}>
      <Header />
      <Text style={styles.title}>Safe Routes</Text>
      <Text style={styles.subtitle}>Find the safest route to your destination</Text>

      <MapView style={styles.map} />

      <TouchableOpacity style={styles.routeButton}>
        <Text style={styles.routeText}>Find Safe Route</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginLeft: 20, marginTop: 10 },
  subtitle: { marginLeft: 20, color: 'gray' },
  map: { flex: 1, margin: 10, borderRadius: 15 },
  routeButton: {
    backgroundColor: theme.colors.primary,
    margin: 20,
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: 'center',
  },
  routeText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
