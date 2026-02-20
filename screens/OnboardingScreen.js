import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../styles/theme';

export default function OnboardingScreen({ navigation }) {
  return (
    <LinearGradient 
      colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} 
      style={styles.container}
    >
      <View style={styles.cardContainer}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image source={require('../assets/logo.png')} style={styles.logo} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Your Intelligent Safety Companion</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          Stay secure with AI-powered detection, geo-fencing, and instant SOS alerts.
        </Text>

        {/* Features List */}
        <View style={styles.featuresContainer}>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark" size={24} color="rgba(255,200,220,1)" />
            <Text style={styles.featureText}>AI-powered detection</Text>
          </View>

          <View style={styles.featureItem}>
            <Ionicons name="location" size={24} color="rgba(255,200,220,1)" />
            <Text style={styles.featureText}>Geo-fencing alerts</Text>
          </View>

          <View style={styles.featureItem}>
            <Ionicons name="alert-circle" size={24} color="rgba(255,200,220,1)" />
            <Text style={styles.featureText}>Instant SOS alerts</Text>
          </View>
        </View>

        {/* Get Started Button */}
        <TouchableOpacity 
          style={styles.getStartedButton}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.getStartedButtonText}>GET STARTED</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardContainer: {
    width: '90%',
    maxWidth: 380,
    backgroundColor: 'rgba(77, 20, 60, 0.4)',
    borderRadius: 30,
    padding: 40,
    alignItems: 'center',
    backdropFilter: 'blur(10px)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  logoContainer: {
    marginBottom: 30,
  },
  logo: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 15,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 20,
  },
  featuresContainer: {
    width: '100%',
    marginBottom: 30,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  featureText: {
    color: 'rgba(255, 255, 255, 0.8)',
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  getStartedButton: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.5)',
    alignItems: 'center',
    marginBottom: 20,
  },
  getStartedButtonText: {
    color: 'rgba(255, 200, 220, 1)',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  buttonGradient: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 30,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  linkText: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    fontSize: 14,
  },
  linkHighlight: {
    color: 'rgba(255, 200, 220, 1)',
    fontWeight: '600',
  },
});
