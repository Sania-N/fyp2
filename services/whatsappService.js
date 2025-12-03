import { Linking, Alert } from "react-native";

export const sendWhatsAppMessage = async (phone, message) => {
  if (!phone) {
    Alert.alert("Error", "No phone number found.");
    return;
  }

  const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;

  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert("WhatsApp Not Installed", "Install WhatsApp to send SOS alert.");
      return;
    }
    await Linking.openURL(url);
  } catch (err) {
    Alert.alert("Error", "Could not open WhatsApp.");
  }
};
