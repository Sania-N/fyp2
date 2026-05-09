// firebase.js
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import {
  FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID,
  FIREBASE_MEASUREMENT_ID
} from '@env';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBuwxfMxnZCGuXgihVcNoRip1kQV-DcaC8",
  authDomain: "speech-c05ca.firebaseapp.com",
  projectId: "speech-c05ca",
  storageBucket: "speech-c05ca.firebasestorage.app",
  messagingSenderId: "1083554266858",
  appId: "1:1083554266858:web:e7f44a92b0e4e0b9efe193",
  measurementId: "G-XWLZ1Z53Z5"
};

const pickFirstValue = (...values) => {
  for (const value of values) {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (
        normalized.length > 0 &&
        normalized.toLowerCase() !== "undefined" &&
        normalized.toLowerCase() !== "null"
      ) {
        return normalized;
      }
    }
  }
  return undefined;
};

// Prefer build-time env values, then local @env values, then known defaults.
const firebaseConfig = {
  apiKey: pickFirstValue(process.env.EXPO_PUBLIC_FIREBASE_API_KEY, FIREBASE_API_KEY, DEFAULT_FIREBASE_CONFIG.apiKey),
  authDomain: pickFirstValue(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, FIREBASE_AUTH_DOMAIN, DEFAULT_FIREBASE_CONFIG.authDomain),
  projectId: pickFirstValue(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_PROJECT_ID, DEFAULT_FIREBASE_CONFIG.projectId),
  storageBucket: pickFirstValue(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, FIREBASE_STORAGE_BUCKET, DEFAULT_FIREBASE_CONFIG.storageBucket),
  messagingSenderId: pickFirstValue(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, FIREBASE_MESSAGING_SENDER_ID, DEFAULT_FIREBASE_CONFIG.messagingSenderId),
  appId: pickFirstValue(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, FIREBASE_APP_ID, DEFAULT_FIREBASE_CONFIG.appId),
  measurementId: pickFirstValue(process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID, FIREBASE_MEASUREMENT_ID, DEFAULT_FIREBASE_CONFIG.measurementId)
};

const logFirebaseConfig = () => {
  const missingKeys = Object.entries(firebaseConfig)
    .filter(([, value]) => typeof value !== 'string' || value.trim().length === 0)
    .map(([key]) => key);

  console.log('[Firebase] Config ready:', {
    projectId: firebaseConfig.projectId || 'undefined',
    authDomain: firebaseConfig.authDomain || 'undefined',
    storageBucket: firebaseConfig.storageBucket || 'undefined',
    hasApiKey: Boolean(firebaseConfig.apiKey),
    hasAppId: Boolean(firebaseConfig.appId),
    hasMessagingSenderId: Boolean(firebaseConfig.messagingSenderId),
    hasMeasurementId: Boolean(firebaseConfig.measurementId),
  });

  if (missingKeys.length > 0) {
    console.warn('[Firebase] Missing config keys detected:', missingKeys);
  }
};

logFirebaseConfig();

// Initialize Firebase only once so production and refresh paths share the same instance.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let authInstance;

try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
} catch (error) {
  console.warn('[Firebase] initializeAuth was already called, reusing existing auth instance.', error?.message || error);
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const db = getFirestore(app);

export default app;

