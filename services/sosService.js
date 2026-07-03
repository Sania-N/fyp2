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
export const formatPhoneForWhatsApp = (phone) => {
  const cleaned = phone.replace(/[^\d]/g, '');
  return cleaned.replace(/^\+/, '');
};

export const isSameLocalDay = (timestamp, referenceDate = new Date()) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;

  return (
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth() &&
    date.getDate() === referenceDate.getDate()
  );
};

export const toSafeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const toClockTime = (timestamp) => {
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return '';
  }
};

export const buildReadableAlertSummary = (alert) => {
  const details = alert?.details || {};
  const sentences = [];

  const emotion = details.emotion;
  if (emotion) {
    const confidence = toSafeNumber(details.emotionConfidence);
    sentences.push(
      confidence !== null
        ? `Emotion detected: ${emotion} (confidence ${Math.round(confidence * 100)}%).`
        : `Emotion detected: ${emotion}.`
    );
  }

  const heartRate = toSafeNumber(details.heartRate);
  if (heartRate !== null) sentences.push(`Heart rate: ${heartRate.toFixed(0)} bpm.`);

  const motion = toSafeNumber(details.motion);
  if (motion !== null) sentences.push(`Motion level: ${motion.toFixed(1)}.`);

  if (details.audioLevel !== undefined && details.audioLevel !== null) {
    const audioLevel = toSafeNumber(details.audioLevel);
    if (audioLevel !== null) sentences.push(`Audio level: ${audioLevel.toFixed(0)}.`);
  }

  if (details.riskLevel) sentences.push(`Risk level: ${details.riskLevel}.`);
  if (details.reason) sentences.push(`Reason: ${details.reason}.`);
  if (details.action) sentences.push(`Action taken: ${details.action}.`);
  if (details.contactName) sentences.push(`Contact: ${details.contactName}.`);

  const timerRemaining = toSafeNumber(details.timerRemaining);
  if (timerRemaining !== null) sentences.push(`Timer remaining: ${timerRemaining.toFixed(0)} seconds.`);

  if (details.buttonPressed === true) sentences.push('Manual SOS button was pressed.');
  if (details.sosSent === true) sentences.push('SOS was sent.');
  if (details.sosSent === false) sentences.push('SOS was not sent.');

  if (sentences.length === 0) {
    return 'No additional details available.';
  }

  return sentences.join(' ');
};

export const buildTodaysAlertsContext = async () => {
  try {
    const history = await getGeoFenceAlertHistory();
    const todayItems = history
      .filter((item) => isSameLocalDay(item?.timestamp))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (todayItems.length === 0) {
      return 'Today:\nNo alert events were recorded.';
    }

    const rows = todayItems.map((item) => {
      const timeText = toClockTime(item?.timestamp) || 'Unknown time';
      const headline = item?.message || 'Alert event detected';
      const summary = buildReadableAlertSummary(item);
      return `At ${timeText}, ${headline}. ${summary}`;
    });

    return `Today:\n${rows.map((row) => `- ${row}`).join('\n')}`;
  } catch (error) {
    console.warn('Failed to load today alert context for SOS message:', error);
    return 'Today:\nCould not load alert details.';
  }
};

/**
 * Generate SOS message with location + today's alert details
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @returns {Promise<string>} Formatted SOS message
 */
export const generateSOSMessage = async (latitude, longitude) => {
  const googleMapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
  const detailsBlock = await buildTodaysAlertsContext();

  return `🚨 SOS ALERT 🚨\n\nI need help right now. Please contact me as soon as possible.\n\n${detailsBlock}\n\nCurrent location:\n${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n${googleMapsLink}\n\nSent from Safety App.`;
};

/**
 * Send WhatsApp message via wa.me/ deep link
 * @param {string} phoneNumber - Contact phone number
 * @param {string} contactName - Contact name
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} True if successful
 */
export const sendWhatsAppMessage = async (phoneNumber, contactName, message) => {
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
