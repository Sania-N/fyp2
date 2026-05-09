import { Platform } from 'react-native';
import { GOOGLE_MAPS_API_KEY } from '@env';

const pickFirstValue = (...values) => {
  for (const value of values) {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (
        normalized.length > 0 &&
        normalized.toLowerCase() !== 'undefined' &&
        normalized.toLowerCase() !== 'null'
      ) {
        return normalized;
      }
    }
  }

  return undefined;
};

export const googleMapsApiKey = pickFirstValue(
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_API_KEY
);

export const hasGoogleMapsApiKey = Boolean(googleMapsApiKey);

export const canRenderGoogleMaps = Platform.OS !== 'android' || hasGoogleMapsApiKey;

export const getGoogleMapsMissingKeyMessage = () =>
  'Google Maps is not configured for Android on this build. Add a Google Maps API key to enable map views.';