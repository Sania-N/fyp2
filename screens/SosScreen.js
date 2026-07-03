// screens/SosScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Header from '../components/Header';
import ChatFAB from '../components/ChatFAB';
import theme from '../styles/theme';
import { LinearGradient } from 'expo-linear-gradient';

import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { auth } from '../firebase';
import { getUserContacts } from '../services/contactService';
import { sendSOSConfirmation } from '../services/notificationsService';
import {
  formatPhoneForWhatsApp,
  generateSOSMessage,
  sendWhatsAppMessage
} from '../services/sosService';

const HELPLINE_NUMBERS = [
  {
    id: 1,
    number: '1124',
    label: 'Punjab Highway Patrol',
    description: 'Road safety & traffic assistance',
    icon: 'car-outline',
  },
  {
    id: 2,
    number: '130',
    label: 'Motorway Police',
    description: 'Motorway emergencies & assistance',
    icon: 'shield-checkmark-outline',
  },
  {
    id: 3,
    number: '1043',
    label: 'Punjab Commission on Status of Women',
    description: 'Women safety & support services',
    icon: 'person-outline',
  },
  {
    id: 4,
    number: '1122',
    label: 'Rescue Service',
    description: 'Emergency rescue & medical aid',
    icon: 'medical-outline',
  },
];

export default function SosScreen() {
  const [sending, setSending] = useState(false);

  const handleCallHelpline = (phoneNumber, helplineName) => {
    const url = `tel:${phoneNumber}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('Error', `Cannot call ${helplineName}. Phone calls not supported on this device.`);
        }
      })
      .catch(() => {
        Alert.alert('Error', `Unable to initiate call to ${helplineName}`);
      });
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
      const sosMessage = await generateSOSMessage(latitude, longitude);

      // 6️⃣ Send SOS to priority contact via WhatsApp
      const success = await sendWhatsAppMessage(priorityContact.phone, priorityContact.name, sosMessage);

      // 7️⃣ Show result alert
      if (success) {
        await sendSOSConfirmation({
          contactName: priorityContact.name,
          timestamp: new Date().toISOString(),
        });

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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
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

          <View style={styles.helplineSection}>
            <Text style={styles.helplineTitle}>📞 Emergency Helplines</Text>
            <View style={styles.helplineCardsContainer}>
              {HELPLINE_NUMBERS.map((helpline) => (
                <TouchableOpacity
                  key={helpline.id}
                  style={styles.helplineCard}
                  onPress={() => handleCallHelpline(helpline.number, helpline.label)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardHeader}>
                    <Ionicons
                      name={helpline.icon}
                      size={28}
                      color="#ff1493"
                      style={styles.cardIcon}
                    />
                    <View style={styles.cardTitleContainer}>
                      <Text style={styles.cardLabel}>{helpline.label}</Text>
                      <Text style={styles.cardDescription}>{helpline.description}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardNumber}>{helpline.number}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
      <ChatFAB />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, backgroundColor: "transparent" },
  scrollContent: {
    paddingBottom: 120,
  },
  centerContent: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
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
    marginBottom: 30,
  },
  helplineSection: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  helplineTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 16,
    textAlign: "center",
  },
  helplineCardsContainer: {
    gap: 12,
  },
  helplineCard: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 200, 220, 0.3)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  cardIcon: {
    marginRight: 12,
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
  },
  cardNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ff1493",
    marginLeft: 12,
  },
});
