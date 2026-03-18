// services/sosService.js
import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { auth } from '../firebase';
import { getUserContacts } from './contactService';
import { sendSOSConfirmation } from './notificationsService';
import { getGeoFenceAlertHistory } from './geoFenceService';

/**
 * Format phone number for WhatsApp
 * @param {string} phone - Phone number to format
 * @returns {string} Formatted phone number
 */
const formatPhoneForWhatsApp = (phone) => {
  const cleaned = phone.replace(/[^\d]/g, '');
  return cleaned.replace(/^\+/, '');
};

const isSameLocalDay = (timestamp, referenceDate = new Date()) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;

  return (
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth() &&
    date.getDate() === referenceDate.getDate()
  );
};

const toSafeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toClockTime = (timestamp) => {
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return '';
  }
};

const buildAlertDetailLine = (alert) => {
  const details = alert?.details || {};
  const parts = [];

  if (details.emotion) parts.push(`emotion=${details.emotion}`);

  const confidence = toSafeNumber(details.emotionConfidence);
  if (confidence !== null) parts.push(`confidence=${confidence.toFixed(3)}`);

  const motion = toSafeNumber(details.motion);
  if (motion !== null) parts.push(`motion=${motion.toFixed(2)}`);

  const heartRate = toSafeNumber(details.heartRate);
  if (heartRate !== null) parts.push(`heart_rate=${heartRate.toFixed(0)} bpm`);

  if (details.riskLevel) parts.push(`risk=${details.riskLevel}`);
  if (details.buttonPressed === true) parts.push('button_pressed=true');
  if (details.sosSent === true) parts.push('sos_sent=true');
  if (details.sosSent === false) parts.push('sos_sent=false');
  if (details.contactName) parts.push(`contact=${details.contactName}`);
  if (details.reason) parts.push(`reason=${details.reason}`);
  if (details.action) parts.push(`action=${details.action}`);

  const timerRemaining = toSafeNumber(details.timerRemaining);
  if (timerRemaining !== null) parts.push(`timer_remaining=${timerRemaining}s`);

  if (parts.length === 0) {
    return 'No extra details';
  }

  return parts.join(', ');
};

const buildTodaysAlertsContext = async () => {
  try {
    const history = await getGeoFenceAlertHistory();
    const todayItems = history
      .filter((item) => isSameLocalDay(item?.timestamp))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (todayItems.length === 0) {
      return 'DETAILS (Today):\nNo alert events recorded today.';
    }

    const rows = todayItems.map((item, index) => {
      const timeText = toClockTime(item?.timestamp) || 'Unknown time';
      return `${index + 1}. [${timeText}] ${item?.message || 'Alert event'}\n   detail: ${buildAlertDetailLine(item)}`;
    });

    return `DETAILS (Today):\n${rows.join('\n')}`;
  } catch (error) {
    console.warn('Failed to load today alert context for SOS message:', error);
    return 'DETAILS (Today):\nCould not load alert details.';
  }
};

/**
 * Generate SOS message with location + today's alert details
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @returns {Promise<string>} Formatted SOS message
 */
const generateSOSMessage = async (latitude, longitude) => {
  const googleMapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
  const detailsBlock = await buildTodaysAlertsContext();

  return `🚨 SOS ALERT 🚨\n\nI am in danger. Please help me immediately!\n\n${detailsBlock}\n\n📍 Location:\n${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n\n🗺️ ${googleMapsLink}\n\nSent from Safety App.`;
};

/**
 * Send WhatsApp message via wa.me/ deep link
 * @param {string} phoneNumber - Contact phone number
 * @param {string} contactName - Contact name
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} True if successful
 */
const sendWhatsAppMessage = async (phoneNumber, contactName, message) => {
  try {
    const formattedPhone = formatPhoneForWhatsApp(phoneNumber);
    const encodedMessage = encodeURIComponent(message);
    const directWhatsAppUrl = `whatsapp://send?phone=${formattedPhone}&text=${encodedMessage}`;
    const webWhatsAppUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;

    console.log(`📨 SOS message length: ${message.length} chars`);

    const canOpenDirect = await Linking.canOpenURL(directWhatsAppUrl);
    if (canOpenDirect) {
      await Linking.openURL(directWhatsAppUrl);
      return true;
    }

    const canOpenWeb = await Linking.canOpenURL(webWhatsAppUrl);
    if (canOpenWeb) {
      await Linking.openURL(webWhatsAppUrl);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error sending WhatsApp to ${contactName}:`, error);
    return false;
  }
};

/**
 * Trigger SOS alert - gets location and sends to emergency contact
 * Can be called from anywhere in the app
 * @returns {Promise<{success: boolean, message: string, contactName?: string}>}
 */
export async function triggerSOSAlert() {
  try {
    // 1️⃣ Check if user is logged in
    const uid = auth.currentUser?.uid;
    if (!uid) {
      return { success: false, message: 'User not logged in' };
    }

    // 2️⃣ Get user's current location
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { success: false, message: 'Location permission denied' };
    }

    let location;
    try {
      location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
    } catch (locError) {
      console.error('Location error:', locError);
      return { success: false, message: 'Could not get location' };
    }

    const latitude = location.coords.latitude;
    const longitude = location.coords.longitude;

    // 3️⃣ Fetch trusted contacts from Firestore
    let contacts;
    try {
      contacts = await getUserContacts(uid);
    } catch (contactError) {
      console.error('Error fetching contacts:', contactError);
      return { success: false, message: 'Could not fetch contacts' };
    }

    if (!contacts || contacts.length === 0) {
      return { success: false, message: 'No contacts configured' };
    }

    // 3.5️⃣ Find the priority/emergency contact
    const priorityContact = contacts.find((c) => c.isPriority === true);
    if (!priorityContact) {
      return { success: false, message: 'No emergency contact set' };
    }

    // 4️⃣ Validate priority contact has phone number
    if (
      !priorityContact.phone ||
      priorityContact.phone.toString().trim().length === 0
    ) {
      return { success: false, message: 'Emergency contact phone invalid' };
    }

    // 5️⃣ Generate SOS message with location
    const sosMessage = await generateSOSMessage(latitude, longitude);

    // 6️⃣ Send SOS to priority contact via WhatsApp
    const success = await sendWhatsAppMessage(
      priorityContact.phone,
      priorityContact.name,
      sosMessage
    );

    // 7️⃣ Log SOS confirmation
    if (success) {
      try {
        await sendSOSConfirmation({
          contactName: priorityContact.name,
          timestamp: new Date().toISOString(),
        });
      } catch (confirmError) {
        console.warn('Could not send SOS confirmation:', confirmError);
      }

      return {
        success: true,
        message: `SOS sent to ${priorityContact.name}`,
        contactName: priorityContact.name,
      };
    } else {
      return {
        success: false,
        message: `WhatsApp not available or invalid number for ${priorityContact.name}`,
      };
    }
  } catch (error) {
    console.error('SOS Error:', error);
    return { success: false, message: `Error: ${error.message}` };
  }
}
