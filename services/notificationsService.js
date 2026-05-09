import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let notificationResponseSubscription = null;
let notificationReceivedSubscription = null;

const formatTimestamp = (timestamp = new Date().toISOString()) => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return new Date().toLocaleString();
  }
};

const buildNotificationBody = (message, timestamp) => `${message}\nTime: ${formatTimestamp(timestamp)}`;

const isExpoGoClient = () =>
  Constants?.executionEnvironment === 'storeClient' || Constants?.appOwnership === 'expo';

export const supportsRemotePushNotifications = () => !isExpoGoClient();

const scheduleLocalNotification = async ({ title, message, timestamp, type }) => {
  const resolvedTimestamp = timestamp || new Date().toISOString();

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: buildNotificationBody(message, resolvedTimestamp),
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: {
        type,
        message,
        timestamp: resolvedTimestamp,
      },
    },
    trigger: null,
  });

  return {
    title,
    message,
    timestamp: resolvedTimestamp,
    type,
  };
};

export const initializeNotificationHandling = () => {
  // Skip notification handler setup in Expo Go to avoid remote push notification errors in SDK 53+
  if (isExpoGoClient()) {
    console.info('Skipping notification handler setup in Expo Go.');
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
};

export const registerForPushNotifications = async () => {
  if (!supportsRemotePushNotifications()) {
    console.info('Skipping remote push registration because this runtime is Expo Go. Use a development build for Expo push tokens.');
    return {
      granted: false,
      pushToken: null,
      skipped: true,
      reason: 'Expo Go does not support remote push notifications. Use a development build.',
    };
  }

  let finalStatus;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return {
      granted: false,
      pushToken: null,
    };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return {
      granted: true,
      pushToken: tokenData.data,
    };
  } catch (error) {
    console.warn('Unable to get Expo push token:', error);
    return {
      granted: true,
      pushToken: null,
    };
  }
};

export const sendDangerAlert = async ({
  message = 'Potential danger detected nearby. Stay alert and move to safety.',
  timestamp,
} = {}) =>
  scheduleLocalNotification({
    title: 'Danger Detected Alert',
    message,
    timestamp,
    type: 'danger_detected',
  });

export const sendGeoFenceWarning = async ({
  zoneTitle,
  message,
  timestamp,
} = {}) => {
  const resolvedMessage = message ||
    `Warning: You are entering a high-risk area.${zoneTitle ? ` Zone: ${zoneTitle}.` : ''}`.trim();

  return scheduleLocalNotification({
    title: 'Geo-fence Warning',
    message: resolvedMessage,
    timestamp,
    type: 'geo_fence_warning',
  });
};

export const sendSOSConfirmation = async ({
  contactName,
  message,
  timestamp,
} = {}) => {
  const resolvedMessage =
    message ||
    `Your SOS alert has been sent${contactName ? ` to ${contactName}` : ''}. Help is being notified.`;

  return scheduleLocalNotification({
    title: 'SOS Confirmation',
    message: resolvedMessage,
    timestamp,
    type: 'sos_confirmation',
  });
};

export const sendContactResponseNotification = async ({
  contactName,
  message,
  timestamp,
} = {}) => {
  const resolvedMessage =
    message ||
    `${contactName || 'Your emergency contact'} has responded to your alert.`;

  return scheduleLocalNotification({
    title: 'Emergency Contact Response',
    message: resolvedMessage,
    timestamp,
    type: 'contact_response',
  });
};

export const attachNotificationListeners = ({
  onNotificationReceived,
  onNotificationResponse,
} = {}) => {
  // Skip attaching listeners in Expo Go to avoid remote push notification errors in SDK 53+
  if (isExpoGoClient()) {
    console.info('Skipping notification listeners in Expo Go.');
    return;
  }

  notificationReceivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    if (typeof onNotificationReceived === 'function') {
      onNotificationReceived(notification);
    }
  });

  notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (typeof onNotificationResponse === 'function') {
      onNotificationResponse(response);
    }
  });
};

export const detachNotificationListeners = () => {
  if (notificationReceivedSubscription) {
    notificationReceivedSubscription.remove();
    notificationReceivedSubscription = null;
  }

  if (notificationResponseSubscription) {
    notificationResponseSubscription.remove();
    notificationResponseSubscription = null;
  }
};
