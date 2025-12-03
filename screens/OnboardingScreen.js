import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../styles/theme';

export default function OnboardingScreen({ navigation }) {
  return (
    <LinearGradient colors={theme.gradient.background} style={styles.container}>
      {/*<Image source={require('../assets/logo.png')} style={styles.logo} /> */}
      <Text style={styles.title}>Your Intelligent Safety Companion</Text>
      <Text style={styles.subtitle}>
        Stay secure with AI-powered detection, geo-fencing, and instant SOS alerts.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('Login')}
      >
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  logo: { width: 120, height: 120, marginBottom: 30 },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.primary, textAlign: 'center' },
  subtitle: { textAlign: 'center', color: 'gray', marginVertical: 15 },
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginTop: 30,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
