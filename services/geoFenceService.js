import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../api';
import {
  registerForPushNotifications,
  sendGeoFenceWarning,
} from './notificationsService';

const FALLBACK_DANGER_ZONES_ENDPOINT = 'http://192.168.100.11:8000/danger-zones';
const FALLBACK_SAFE_ROUTE_ENDPOINT = 'http://192.168.100.11:8000/safe-route';
const GEOFENCE_NOTIFICATION_MESSAGE = 'Warning: You are entering a high-risk area.';
const EARTH_RADIUS_METERS = 6371000;
const GEOFENCE_ALERT_STORAGE_KEY = '@geofence_active_alert';
const GEOFENCE_ALERT_HISTORY_STORAGE_KEY = '@geofence_alert_history';
const RED_ORANGE_SEVERITIES = new Set(['red', 'orange', 'high', 'very_high', 'critical']);
const ORANGE_SEVERITY_THRESHOLD = 3;
const RED_SEVERITY_THRESHOLD = 4.5;
const MAX_STORED_GEOFENCE_ALERTS = 100;

const getBaseApiUrl = () =>
  typeof API_BASE_URL === 'string' && API_BASE_URL.trim().length > 0
    ? API_BASE_URL.trim().replace(/\/+$/, '')
    : null;

const getDangerZonesEndpoint = () =>
  getBaseApiUrl()
    ? `${getBaseApiUrl()}/danger-zones`
    : FALLBACK_DANGER_ZONES_ENDPOINT;

const getDangerZonesEndpoints = () => {
  const primaryEndpoint = getDangerZonesEndpoint();

  return [
    primaryEndpoint,
    `${primaryEndpoint}/`,
    primaryEndpoint.replace('/danger-zones', '/danger_zones'),
    `${primaryEndpoint.replace('/danger-zones', '/danger_zones')}/`,
  ].filter((endpoint, index, endpoints) => endpoint && endpoints.indexOf(endpoint) === index);
};

const getSafeRouteEndpoint = () =>
  getBaseApiUrl()
    ? `${getBaseApiUrl()}/safe-route`
    : FALLBACK_SAFE_ROUTE_ENDPOINT;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSeverity = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const resolveSeverityBand = (value) => {
  const numericSeverity = toNumber(value);
  if (numericSeverity !== null) {
    if (numericSeverity >= RED_SEVERITY_THRESHOLD) {
      return 'red';
    }
    if (numericSeverity >= ORANGE_SEVERITY_THRESHOLD) {
      return 'orange';
    }
    return null;
  }

  const normalizedSeverity = normalizeSeverity(value);
  if (!normalizedSeverity) {
    return null;
  }

  if (normalizedSeverity.includes('red')) {
    return 'red';
  }

  if (normalizedSeverity.includes('orange')) {
    return 'orange';
  }

  if (RED_ORANGE_SEVERITIES.has(normalizedSeverity)) {
    return normalizedSeverity;
  }

  return null;
};

const isRedSeverityBand = (value) => resolveSeverityBand(value) === 'red';

const getSeverityLabel = (value) => {
  const band = resolveSeverityBand(value);
  if (band === 'red') {
    return 'Red';
  }

  if (band === 'orange') {
    return 'Orange';
  }

  const normalizedSeverity = normalizeSeverity(value);
  if (!normalizedSeverity) {
    return 'High-risk';
  }

  return normalizedSeverity.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
};

const buildGeoFenceAlertMessage = (zone) => {
  const severityText = getSeverityLabel(zone?.severity);
  return `${severityText} zone alert: ${GEOFENCE_NOTIFICATION_MESSAGE} ${zone?.title ? `Zone: ${zone.title}.` : ''}`.trim();
};

const normalizeStoredAlertRecord = (item, index = 0) => ({
  id: item?.id || `geofence-alert-${Date.now()}-${index}`,
  message: item?.message || GEOFENCE_NOTIFICATION_MESSAGE,
  timestamp: item?.timestamp || new Date().toISOString(),
  zoneTitle: item?.zoneTitle || null,
  severity: item?.severity ?? null,
  details:
    item?.details && typeof item.details === 'object' && !Array.isArray(item.details)
      ? item.details
      : null,
  eventType: item?.eventType || null,
});

export const getGeoFenceAlertHistory = async () => {
  try {
    const storedValue = await AsyncStorage.getItem(GEOFENCE_ALERT_HISTORY_STORAGE_KEY);
    if (!storedValue) {
      return [];
    }

    const parsed = JSON.parse(storedValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item, index) => normalizeStoredAlertRecord(item, index));
  } catch (error) {
    console.error('Error reading geo-fence alert history:', error);
    return [];
  }
};

export const addGeoFenceAlertHistoryItem = async ({
  message,
  zone,
  timestamp,
  details,
  eventType,
} = {}) => {
  try {
    const existingHistory = await getGeoFenceAlertHistory();
    const nextRecord = normalizeStoredAlertRecord(
      {
        id: `geofence-alert-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        message: message || buildGeoFenceAlertMessage(zone),
        timestamp: timestamp || new Date().toISOString(),
        zoneTitle: zone?.title || null,
        severity: zone?.severity ?? null,
        details:
          details && typeof details === 'object' && !Array.isArray(details) ? details : null,
        eventType: eventType || null,
      },
      0
    );

    const nextHistory = [nextRecord, ...existingHistory].slice(0, MAX_STORED_GEOFENCE_ALERTS);
    await AsyncStorage.setItem(GEOFENCE_ALERT_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
    return nextRecord;
  } catch (error) {
    console.error('Error storing geo-fence alert history item:', error);
    return null;
  }
};

const getRadiusInMeters = (zone, severityKey = null) => {
  const severityPrefix = severityKey ? `${severityKey}_` : '';
  const rawRadius = toNumber(
    zone?.[`${severityPrefix}radius`] ??
      zone?.[`${severityPrefix}radius_meters`] ??
      zone?.[`${severityPrefix}radiusMeters`] ??
      zone?.[`${severityPrefix}radius_meter`] ??
      zone?.[`${severityPrefix}radius_km`] ??
      zone?.[`${severityPrefix}radiusKm`] ??
      zone?.geofence_radius ??
      zone?.geofenceRadius ??
      zone?.distance ??
      zone?.distance_meters ??
      zone?.distanceMeters ??
      zone?.radius ??
      zone?.radius_meters ??
      zone?.radiusMeters ??
      zone?.radius_meter ??
      zone?.radius_km ??
      zone?.radiusKm
  );

  const radiusUnit = String(
    zone?.[`${severityPrefix}radius_unit`] ||
      zone?.[`${severityPrefix}radiusUnit`] ||
      zone?.radius_unit ||
      zone?.radiusUnit ||
      zone?.distance_unit ||
      zone?.distanceUnit ||
      ''
  ).toLowerCase();

  if (rawRadius === null) {
    return null;
  }

  if (
    zone?.[`${severityPrefix}radius_km`] !== undefined ||
    zone?.[`${severityPrefix}radiusKm`] !== undefined ||
    zone?.radius_km !== undefined ||
    zone?.radiusKm !== undefined ||
    radiusUnit === 'km' ||
    radiusUnit === 'kilometer' ||
    radiusUnit === 'kilometers'
  ) {
    return rawRadius * 1000;
  }

  if (radiusUnit === 'mile' || radiusUnit === 'miles' || radiusUnit === 'mi') {
    return rawRadius * 1609.34;
  }

  return rawRadius;
};

const getPointFromZone = (zone) => {
  const latitude = toNumber(
    zone?.latitude ?? zone?.lat ?? zone?.center_lat ?? zone?.centerLat ?? zone?.center?.latitude
  );
  const longitude = toNumber(
    zone?.longitude ??
      zone?.lng ??
      zone?.lon ??
      zone?.center_lng ??
      zone?.centerLng ??
      zone?.center?.longitude
  );

  if (latitude !== null && longitude !== null) {
    return { latitude, longitude };
  }

  const geometryType = String(zone?.geometry?.type || '').toLowerCase();
  const coordinates = zone?.geometry?.coordinates;

  if (geometryType === 'point' && Array.isArray(coordinates) && coordinates.length >= 2) {
    const [pointLng, pointLat] = coordinates;
    const parsedLat = toNumber(pointLat);
    const parsedLng = toNumber(pointLng);

    if (parsedLat !== null && parsedLng !== null) {
      return { latitude: parsedLat, longitude: parsedLng };
    }
  }

  return null;
};

const toPolygonCoordinates = (geometry) => {
  const geometryType = String(geometry?.type || '').toLowerCase();
  const coordinates = geometry?.coordinates;

  if (geometryType === 'polygon' && Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
    return coordinates[0]
      .map((point) => {
        if (!Array.isArray(point) || point.length < 2) return null;
        const [lng, lat] = point;
        const latitude = toNumber(lat);
        const longitude = toNumber(lng);
        return latitude !== null && longitude !== null ? { latitude, longitude } : null;
      })
      .filter(Boolean);
  }

  if (
    geometryType === 'multipolygon' &&
    Array.isArray(coordinates) &&
    Array.isArray(coordinates[0]) &&
    Array.isArray(coordinates[0][0])
  ) {
    return coordinates[0][0]
      .map((point) => {
        if (!Array.isArray(point) || point.length < 2) return null;
        const [lng, lat] = point;
        const latitude = toNumber(lat);
        const longitude = toNumber(lng);
        return latitude !== null && longitude !== null ? { latitude, longitude } : null;
      })
      .filter(Boolean);
  }

  return [];
};

const isPointInPolygon = (point, polygon = []) => {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  let inside = false;
  const testX = Number(point.longitude);
  const testY = Number(point.latitude);

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const vertexI = polygon[i];
    const vertexJ = polygon[j];

    const xi = Number(vertexI.longitude);
    const yi = Number(vertexI.latitude);
    const xj = Number(vertexJ.longitude);
    const yj = Number(vertexJ.latitude);

    const intersects =
      yi > testY !== yj > testY &&
      testX < ((xj - xi) * (testY - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const shouldTriggerGeoFenceSeverity = (zone) => {
  return Boolean(resolveSeverityBand(zone?.severity));
};

const resolveZoneId = (zone, index) =>
  zone?.id ?? zone?.zone_id ?? zone?.zoneId ?? `zone-${index}`;

export const getDangerZoneId = (zone, index = 0) => String(resolveZoneId(zone, index));

export const isRedZone = (zone) => isRedSeverityBand(zone?.severity);

export const normalizeDangerZone = (zone, index = 0) => {
  const point = getPointFromZone(zone);
  const polygonCoordinates = toPolygonCoordinates(zone?.geometry);
  const radius = getRadiusInMeters(zone);
  const resolvedSeverity =
    zone?.severity ||
    zone?.risk_level ||
    zone?.riskLevel ||
    zone?.zone_color ||
    zone?.zoneColor ||
    zone?.color ||
    'high';
  const normalizedSeverity = normalizeSeverity(resolvedSeverity);
  const baseId = getDangerZoneId(zone, index);

  if ((!point && polygonCoordinates.length < 3) || (radius !== null && radius <= 0)) {
    return null;
  }

  return {
    ...zone,
    id: normalizedSeverity ? `${baseId}:${normalizedSeverity}` : baseId,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    radius,
    title: zone?.title || zone?.name || 'High-risk area',
    severity: resolvedSeverity,
    polygonCoordinates,
  };
};

export const fetchDangerZones = async () => {
  const toZonesFromGeoJson = (featureCollection) => {
    const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];

    return features.map((feature, index) => {
      const properties = feature?.properties || {};

      return {
        ...properties,
        id: feature?.id ?? properties?.id ?? `feature-zone-${index}`,
        title: properties?.title ?? properties?.name,
        severity:
          properties?.severity ||
          properties?.risk_level ||
          properties?.riskLevel ||
          properties?.zone_color ||
          properties?.zoneColor ||
          properties?.color,
        geometry: feature?.geometry,
      };
    });
  };

  const flattenZoneBuckets = (payloadData) => {
    if (!payloadData || typeof payloadData !== 'object') {
      return [];
    }

    const bucketCandidates = [
      { key: 'zones', severity: null },
      { key: 'danger_zones', severity: null },
      { key: 'dangerZones', severity: null },
      { key: 'red_zones', severity: 'red' },
      { key: 'redZones', severity: 'red' },
      { key: 'orange_zones', severity: 'orange' },
      { key: 'orangeZones', severity: 'orange' },
      { key: 'high_risk_zones', severity: 'high' },
      { key: 'highRiskZones', severity: 'high' },
    ];

    return bucketCandidates.flatMap(({ key, severity }) => {
      const value = payloadData[key];
      if (!Array.isArray(value)) {
        return [];
      }

      return value.map((zone) =>
        severity && !zone?.severity && !zone?.risk_level ? { ...zone, severity } : zone
      );
    });
  };

  let lastError = null;

  for (const endpoint of getDangerZonesEndpoints()) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 404) {
        lastError = new Error(`Danger zones request failed with status ${response.status}`);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Danger zones request failed with status ${response.status}`);
      }

      const payload = await response.json();
      const payloadData = payload?.data ?? payload?.result ?? payload;
      const geoJsonZones =
        Array.isArray(payloadData?.features) || Array.isArray(payload?.features)
          ? toZonesFromGeoJson(Array.isArray(payloadData?.features) ? payloadData : payload)
          : [];
      const flattenedBucketZones = flattenZoneBuckets(payloadData);
      const zones = Array.isArray(payloadData)
        ? payloadData
        : Array.isArray(payload)
        ? payload
        : flattenedBucketZones.length > 0
          ? flattenedBucketZones
          : geoJsonZones;

      return zones
        .map((zone, index) => normalizeDangerZone(zone, index))
        .filter(Boolean);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError?.message?.includes('status 404')) {
    console.warn(
      `Geo-fence alerts are disabled: no danger zones endpoint found. Expected one of: ${getDangerZonesEndpoints().join(', ')}`
    );
    return [];
  }

  throw lastError || new Error('Danger zones request failed');
};

export const getDistanceMeters = (from, to) => {
  const startLat = (Number(from.latitude) * Math.PI) / 180;
  const endLat = (Number(to.latitude) * Math.PI) / 180;
  const deltaLat = ((Number(to.latitude) - Number(from.latitude)) * Math.PI) / 180;
  const deltaLng = ((Number(to.longitude) - Number(from.longitude)) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

export const checkGeoFence = (userLocation, dangerZones = []) => {
  if (
    !userLocation ||
    typeof userLocation.latitude !== 'number' ||
    typeof userLocation.longitude !== 'number' ||
    !Array.isArray(dangerZones) ||
    dangerZones.length === 0
  ) {
    return [];
  }

  return dangerZones.filter((zone) => {
    if (!shouldTriggerGeoFenceSeverity(zone)) {
      return false;
    }

    if (Array.isArray(zone?.polygonCoordinates) && zone.polygonCoordinates.length >= 3) {
      return isPointInPolygon(userLocation, zone.polygonCoordinates);
    }

    if (!Number.isFinite(Number(zone?.latitude)) || !Number.isFinite(Number(zone?.longitude))) {
      return false;
    }

    const zoneRadius = Number(zone?.radius);
    if (!Number.isFinite(zoneRadius) || zoneRadius <= 0) {
      return false;
    }

    const distanceMeters = getDistanceMeters(userLocation, zone);
    return distanceMeters <= zoneRadius;
  });
};

export const registerGeoFenceNotificationsAsync = async () => {
  const registration = await registerForPushNotifications();
  return Boolean(registration?.granted);
};

export const sendGeoFenceWarningNotification = async (zone, options = {}) => {
  const message =
    typeof options?.message === 'string' && options.message.trim().length > 0
      ? options.message.trim()
      : buildGeoFenceAlertMessage(zone);
  const timestamp = options?.timestamp || new Date().toISOString();

  await addGeoFenceAlertHistoryItem({
    message,
    zone,
    timestamp,
  });

  const isGranted = await registerGeoFenceNotificationsAsync();
  if (!isGranted) {
    return false;
  }

  await sendGeoFenceWarning({
    zoneTitle: zone?.title,
    message,
    timestamp,
  });

  return true;
};

export const requestSafeRoute = async (payload) => {
  const response = await fetch(getSafeRouteEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      timestamp: payload?.timestamp || new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Safe route request failed with status ${response.status}`);
  }

  return response.json();
};

export const setGeoFenceAlertStatus = async ({ active, message }) => {
  try {
    const payload = {
      active: Boolean(active),
      message: message || GEOFENCE_NOTIFICATION_MESSAGE,
      updatedAt: Date.now(),
    };

    await AsyncStorage.setItem(GEOFENCE_ALERT_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Error persisting geo-fence alert status:', error);
  }
};

export const getGeoFenceAlertStatus = async () => {
  try {
    const storedValue = await AsyncStorage.getItem(GEOFENCE_ALERT_STORAGE_KEY);
    if (!storedValue) {
      return {
        active: false,
        message: GEOFENCE_NOTIFICATION_MESSAGE,
        updatedAt: null,
      };
    }

    const parsed = JSON.parse(storedValue);
    return {
      active: Boolean(parsed?.active),
      message: parsed?.message || GEOFENCE_NOTIFICATION_MESSAGE,
      updatedAt: parsed?.updatedAt || null,
    };
  } catch (error) {
    console.error('Error reading geo-fence alert status:', error);
    return {
      active: false,
      message: GEOFENCE_NOTIFICATION_MESSAGE,
      updatedAt: null,
    };
  }
};

export const GEOFENCE_WARNING_MESSAGE_TEXT = GEOFENCE_NOTIFICATION_MESSAGE;
