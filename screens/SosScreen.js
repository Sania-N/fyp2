// screens/SosScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert
} from 'react-native';

import Header from '../components/Header';
import theme from '../styles/theme';
import { LinearGradient } from 'expo-linear-gradient';

import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { auth } from '../firebase';
import { getUserContacts } from '../services/contactService';

export default function SosScreen() {
  const [sending, setSending] = useState(false);

  const handleSendSOS = async () => {
    try {
      setSending(true);

      const uid = auth.currentUser?.uid;
      if (!uid) {
        Alert.alert("Error", "You must be logged in.");
        setSending(false);
        return;
      }

      // 1️⃣ Fetch Saved Contacts
      const contacts = await getUserContacts(uid);
      if (!contacts || contacts.length === 0) {
        Alert.alert("No Contacts", "Add trusted contacts first.");
        setSending(false);
        return;
      }

      // 2️⃣ Get User Location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Location permission required.");
        setSending(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const latitude = loc.coords.latitude;
      const longitude = loc.coords.longitude;
      const locationURL = `https://maps.google.com/?q=${latitude},${longitude}`;

      // 3️⃣ Prepare SOS Message
      const message = `⚠️ *SOS ALERT*\nI am in danger! Please help me.\n\n📍 My Location: ${locationURL}\n\nSent via SafetyApp`;

      // 4️⃣ Send WhatsApp Messages to All Contacts
      let successCount = 0;
      for (const contact of contacts) {
        const phone = contact.phone.replace(/\D/g, ''); // Remove non-digits
        const whatsappSendUrl = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
        
        try {
          const canOpen = await Linking.canOpenURL(whatsappSendUrl);
          if (canOpen) {
            await Linking.openURL(whatsappSendUrl);
            successCount++;
          }
          // Add a small delay between sending to different contacts
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error sending to ${contact.name}:`, error);
        }
      }

      if (successCount > 0) {
        Alert.alert(
          "SOS Sent Successfully",
          `SOS alerts sent to ${successCount} contact${successCount > 1 ? 's' : ''}.\n\nWhatsApp will open for each contact.`,
          [{ text: "OK", onPress: () => setSending(false) }]
        );
      } else {
        Alert.alert(
          "WhatsApp Not Available",
          "WhatsApp is not installed on your device. Please install WhatsApp to send SOS alerts.",
          [{ text: "OK", onPress: () => setSending(false) }]
        );
      }
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Something went wrong: " + error.message);
    }

    setSending(false);
  };

  return (
    <LinearGradient colors={theme.gradient.background} style={styles.gradient}>
      <View style={styles.container}>
        <Header />
        <View style={styles.centerContent}>
          <Text style={styles.title}>Emergency SOS</Text>
          <Text style={styles.subtitle}>Press the button below to send alerts</Text>

          <TouchableOpacity
            style={[styles.sosButton, sending && { opacity: 0.6 }]}
            onPress={handleSendSOS}
            disabled={sending}
          >
            <Text style={styles.sosText}>
              {sending ? "SENDING..." : "SEND SOS"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, backgroundColor: "transparent" },
  centerContent: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 10, color: theme.colors.primary },
  subtitle: { color: "#666", marginBottom: 40, fontSize: 16 },
  sosButton: {
    backgroundColor: theme.colors.primary,
    width: 180,
    height: 180,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 8,
  },
  sosText: { color: "#fff", fontWeight: "bold", fontSize: 20 },
});
