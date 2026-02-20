// screens/SosScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';

import Header from '../components/Header';
import ChatFAB from '../components/ChatFAB';
import theme from '../styles/theme';
import { LinearGradient } from 'expo-linear-gradient';

import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { auth } from '../firebase';
import { getUserContacts } from '../services/contactService';

export default function SosScreen() {
  const [sending, setSending] = useState(false);

  // Format phone number for WhatsApp (add + prefix for wa.me/)
  const formatPhoneForWhatsApp = (phone) => {
    // Remove any spaces, dashes, parentheses
    const cleaned = phone.replace(/[^\d]/g, '');
    // If already has +, remove it (then we'll add back as needed)
    const withoutPlus = cleaned.replace(/^\+/, '');
    // Ensure it starts with country code (no +)
    return withoutPlus;
  };

  // Generate SOS message with location
  const generateSOSMessage = (latitude, longitude) => {
    const googleMapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
    return `🚨 SOS ALERT 🚨\n\nI am in danger. Please help me immediately!\n\n📍 Location:\n${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n\n🗺️ ${googleMapsLink}\n\nSent from Safety App.`;
  };

  // Send WhatsApp message using wa.me/ deep link
  const sendWhatsAppMessage = async (phoneNumber, contactName, message) => {
    try {
      const formattedPhone = formatPhoneForWhatsApp(phoneNumber);
      
      // Using wa.me/ format: https://wa.me/PHONE_NUMBER?text=MESSAGE
      const whatsappURL = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
      
      // Check if the URL can be opened
      const canOpen = await Linking.canOpenURL(whatsappURL);
      
      if (canOpen) {
        await Linking.openURL(whatsappURL);
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error(`Error sending WhatsApp to ${contactName}:`, error);
      return false;
    }
  };

  const handleSendSOS = async () => {
    try {
      setSending(true);

      // 1️⃣ Check if user is logged in
      const uid = auth.currentUser?.uid;
      if (!uid) {
        Alert.alert("Error", "You must be logged in.");
        setSending(false);
        return;
      }

      // 2️⃣ Get user's current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Location permission is required to send SOS.");
        setSending(false);
        return;
      }

      let location = null;
      try {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
      } catch (locError) {
        Alert.alert("Location Error", "Unable to fetch your location. Please try again.");
        setSending(false);
        return;
      }

      const latitude = location.coords.latitude;
      const longitude = location.coords.longitude;

      // 3️⃣ Fetch trusted contacts from Firestore
      const contacts = await getUserContacts(uid);
      if (!contacts || contacts.length === 0) {
        Alert.alert("No Contacts", "Please add trusted contacts first to send SOS alerts.");
        setSending(false);
        return;
      }

      // 3.5️⃣ Find the priority/emergency contact
      const priorityContact = contacts.find(c => c.isPriority === true);
      if (!priorityContact) {
        Alert.alert("No Emergency Contact", "Please set an emergency contact in your trusted contacts list.");
        setSending(false);
        return;
      }

      // 4️⃣ Validate priority contact has phone number
      if (!priorityContact.phone || priorityContact.phone.toString().trim().length === 0) {
        Alert.alert("Invalid Contact", "Your emergency contact doesn't have a valid phone number.");
        setSending(false);
        return;
      }

      // 5️⃣ Generate SOS message with location
      const sosMessage = generateSOSMessage(latitude, longitude);

      // 6️⃣ Send SOS to priority contact via WhatsApp
      const success = await sendWhatsAppMessage(priorityContact.phone, priorityContact.name, sosMessage);

      // 7️⃣ Show result alert
      if (success) {
        Alert.alert(
          "✅ SOS Alert Sent",
          `Emergency SOS sent to ${priorityContact.name}.\n\nWhatsApp will open to confirm sending.`
        );
      } else {
        Alert.alert(
          "WhatsApp Not Available",
          `Unable to send SOS alert to ${priorityContact.name}. Please ensure:\n\n• WhatsApp is installed\n• Phone number is valid\n• You have an active internet connection`
        );
      }
    } catch (error) {
      console.error("SOS Error:", error);
      Alert.alert("Error", `Failed to send SOS: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <LinearGradient colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} style={styles.gradient}>
      <View style={styles.container}>
        <Header />
        <View style={styles.centerContent}>
          <Text style={styles.title}>🚨 Emergency SOS</Text>
          <Text style={styles.subtitle}>Send WhatsApp alerts to trusted contacts</Text>
          <Text style={styles.infoText}>
            Your trusted contacts will receive an SOS alert via WhatsApp with your real-time location.
          </Text>

          <TouchableOpacity
            style={[styles.sosButton, sending && styles.sosButtonDisabled]}
            onPress={handleSendSOS}
            disabled={sending}
          >
            {sending ? (
              <>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.sosText}>SENDING...</Text>
              </>
            ) : (
              <Text style={styles.sosText}>SEND SOS</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.warningText}>
            ⚠️ Make sure WhatsApp is installed and you have active internet connection
          </Text>
        </View>
      </View>
      <ChatFAB />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, backgroundColor: "transparent", paddingBottom: 90 },
  centerContent: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center",
    paddingHorizontal: 20,
  },
  title: { 
    fontSize: 32, 
    fontWeight: "700", 
    marginBottom: 12, 
    color: "#fff",
    textAlign: "center",
  },
  subtitle: { 
    color: "rgba(255, 255, 255, 0.8)", 
    marginBottom: 16, 
    fontSize: 16,
    textAlign: "center",
    fontWeight: "600",
  },
  infoText: {
    color: "rgba(255, 255, 255, 0.7)",
    marginBottom: 30,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: "85%",
  },
  sosButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    width: 280,
    height: 280,
    borderRadius: 140,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(255, 200, 220, 0.5)",
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 30,
    elevation: 20,
    marginVertical: 20,
    borderWidth: 3,
    borderColor: "rgba(255, 200, 220, 0.8)",
  },
  sosButtonDisabled: {
    opacity: 0.7,
  },
  sosText: { 
    color: "rgba(255, 200, 220, 1)", 
    fontWeight: "bold", 
    fontSize: 28,
    marginTop: 10,
  },
  warningText: {
    color: "rgba(255, 150, 150, 1)",
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
    marginTop: 20,
  },
});
