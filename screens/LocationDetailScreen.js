import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';

import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '../styles/theme';
import { getRouteSafety } from '../services/routeSafetyService';
import { useTravelSession } from '../context/TravelSessionContext';
import {
  addGeoFenceAlertHistoryItem,
  checkGeoFence,
  fetchDangerZones,
  GEOFENCE_WARNING_MESSAGE_TEXT,
  isRedZone,
  setGeoFenceAlertStatus,
  requestSafeRoute,
  sendGeoFenceWarningNotification,
} from '../services/geoFenceService';

const { width, height } = Dimensions.get('window');
const COLLAPSED_HEIGHT = height * 0.3; // 30% of screen height
const EXPANDED_HEIGHT = height * 0.7; // 70% of screen height

const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined) {
    return '--';
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const hourLabel = `${hours} hr${hours > 1 ? 's' : ''}`;
  return mins ? `${hourLabel} ${mins} min` : hourLabel;
};

const createCurrentLocationPoint = (coords, delta = 0.05) => ({
  latitude: coords.latitude,
  longitude: coords.longitude,
  latitudeDelta: delta,
  longitudeDelta: delta,
  name: 'Your location',
  address: 'Current position',
});

const TRAVEL_MODE_CONFIG = {
  drive: {
    icon: 'directions-car-filled',
    label: 'Drive',
    osrmProfile: 'driving',
    durationFactor: 1,
    estimationFactor: 1,
    trafficStatus: 'Fastest route now due to traffic conditions',
    fuelSaving: 0,
  },
  transit: {
    icon: 'directions-transit-filled',
    label: 'Transit',
    osrmProfile: 'driving',
    durationFactor: 1.8,
    estimationFactor: 1.8,
    trafficStatus: 'Transit estimate based on current traffic conditions',
    fuelSaving: 0,
  },
  walk: {
    icon: 'directions-walk',
    label: 'Walk',
    osrmProfile: 'foot',
    durationFactor: 1,
    estimationFactor: 12,
    trafficStatus: 'Walking route based on shortest available path',
    fuelSaving: 100,
  },
};

const getFuelEfficiencyIndex = (route, modeKey) => {
  const distanceKm = Math.max(0, Number(route?.distance || 0) / 1000);
  const durationHours = Math.max(1 / 120, Number(route?.duration || 0) / 3600);
  const averageSpeedKmh = distanceKm / durationHours;

  if (modeKey === 'walk') return 0;

  const baseFuelPerKm = modeKey === 'transit' ? 0.35 : 1;
  const lowSpeedPenalty = averageSpeedKmh < 45 ? ((45 - averageSpeedKmh) / 45) * 0.3 : 0;

  return distanceKm * baseFuelPerKm * (1 + lowSpeedPenalty);
};

const withCalculatedFuelSavings = (routes = [], modeKey) => {
  const routesWithIndex = routes.map((routeItem) => ({
    ...routeItem,
    fuelEfficiencyIndex: getFuelEfficiencyIndex(routeItem, modeKey),
  }));

  const maxIndex = Math.max(...routesWithIndex.map((routeItem) => routeItem.fuelEfficiencyIndex), 0);

  return routesWithIndex.map((routeItem) => {
    const fuelSaving =
      modeKey === 'walk'
        ? 100
        : maxIndex > 0
          ? Math.max(0, Math.round(((maxIndex - routeItem.fuelEfficiencyIndex) / maxIndex) * 100))
          : 0;

    return {
      ...routeItem,
      fuelSaving,
    };
  });
};

const SAFETY_SAMPLE_INTERVAL = 5;
const MAP_SAFETY_CIRCLE_INTERVAL = 15;
const GEO_FENCE_CHECK_INTERVAL = 5000;
const RED_ROUTE_SAFETY_THRESHOLD = 40;

const isDangerousRoute = (route) =>
  route && typeof route.safetyScore === 'number' && route.safetyScore < RED_ROUTE_SAFETY_THRESHOLD;

const getSafetyColor = (score) => {
  if (typeof score !== 'number') return theme.colors.primary;
  if (score > 70) return 'green';
  if (score >= 40) return 'orange';
  return 'red';
};

const getRouteChipPalette = (score, isSelected) => {
  if (typeof score !== 'number') {
    return isSelected
      ? {
          backgroundColor: theme.colors.primary,
          borderColor: theme.colors.primary,
          labelColor: '#FFF',
          metaColor: 'rgba(255, 255, 255, 0.9)',
        }
      : {
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderColor: 'rgba(0, 0, 0, 0.08)',
          labelColor: theme.colors.text,
          metaColor: '#666',
        };
  }

  if (score > 70) {
    return isSelected
      ? {
          backgroundColor: '#2FAD65',
          borderColor: '#2FAD65',
          labelColor: '#FFF',
          metaColor: 'rgba(255, 255, 255, 0.9)',
        }
      : {
          backgroundColor: '#E8F6EE',
          borderColor: '#2FAD65',
          labelColor: '#1F8A4D',
          metaColor: '#2F7D52',
        };
  }

  if (score >= 40) {
    return isSelected
      ? {
          backgroundColor: '#F39C12',
          borderColor: '#F39C12',
          labelColor: '#FFF',
          metaColor: 'rgba(255, 255, 255, 0.9)',
        }
      : {
          backgroundColor: '#FFF3E0',
          borderColor: '#F39C12',
          labelColor: '#A15B00',
          metaColor: '#B26A0A',
        };
  }

  return isSelected
    ? {
        backgroundColor: '#E74C3C',
        borderColor: '#E74C3C',
        labelColor: '#FFF',
        metaColor: 'rgba(255, 255, 255, 0.9)',
      }
    : {
        backgroundColor: '#FDEDEC',
        borderColor: '#E74C3C',
        labelColor: '#A93226',
        metaColor: '#B03A2E',
      };
};

const sampleCoordinatesForSafety = (coordinates = [], interval = SAFETY_SAMPLE_INTERVAL) => {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return [];
  }

  if (coordinates.length <= 10) {
    return coordinates;
  }

  const sampled = coordinates.filter((_, index) => index % interval === 0);
  const lastCoordinate = coordinates[coordinates.length - 1];
  const alreadyHasLast = sampled[sampled.length - 1] === lastCoordinate;

  if (!alreadyHasLast) {
    sampled.push(lastCoordinate);
  }

  return sampled;
};

const getSafetyCircleStyle = (score) => {
  if (typeof score !== 'number') {
    return {
      strokeColor: 'rgba(128, 0, 32, 0.7)',
      fillColor: 'rgba(128, 0, 32, 0.18)',
    };
  }

  if (score > 70) {
    return {
      strokeColor: 'rgba(47, 173, 101, 0.95)',
      fillColor: 'rgba(47, 173, 101, 0.28)',
    };
  }

  if (score >= 40) {
    return {
      strokeColor: 'rgba(234, 179, 8, 0.95)',
      fillColor: 'rgba(234, 179, 8, 0.28)',
    };
  }

  return {
    strokeColor: 'rgba(220, 38, 38, 0.95)',
    fillColor: 'rgba(220, 38, 38, 0.28)',
  };
};

const sampleCoordinatesForMapCircles = (coordinates = []) =>
  sampleCoordinatesForSafety(coordinates, MAP_SAFETY_CIRCLE_INTERVAL);

const areCoordinatesClose = (pointA, pointB, epsilon = 0.00005) => {
  if (!pointA || !pointB) return false;

  return (
    Math.abs(Number(pointA.latitude) - Number(pointB.latitude)) <= epsilon &&
    Math.abs(Number(pointA.longitude) - Number(pointB.longitude)) <= epsilon
  );
};

const getSafetyScoreText = (score) =>
  typeof score === 'number' ? `Safety: ${Math.round(score)}` : 'Analyzing...';

const getSafetyScoreTextColor = (score) => {
  if (typeof score !== 'number') return '#7C7C7C';
  if (score > 70) return '#2FAD65';
  if (score >= 40) return '#F39C12';
  return '#E74C3C';
};

const buildSafeRoutePayloadRoutes = (routes = []) =>
  routes.map((routeItem) => ({
    route_id: routeItem.routeId,
    coordinates: sampleCoordinatesForSafety(routeItem.coordinates).map((point) => ({
      lat: point.latitude,
      lng: point.longitude,
    })),
  }));

const mergeSafeRouteScores = (routes = [], safetyResults = []) => {
  const safetyByRouteId = new Map(
    (Array.isArray(safetyResults) ? safetyResults : []).map((item) => [
      Number(item.route_id),
      Number(item.safety_score),
    ])
  );

  return routes.map((routeItem) => {
    const nextSafetyScore = safetyByRouteId.get(routeItem.routeId);
    const safetyScore = Number.isFinite(nextSafetyScore)
      ? nextSafetyScore
      : routeItem.safetyScore ?? null;

    return {
      ...routeItem,
      safetyScore,
      color: getSafetyColor(safetyScore),
    };
  });
};

const LocationDetailScreen = ({ navigation, route }) => {
  const initialDestination = route?.params?.location ?? null;
  const [userLocation, setUserLocation] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(initialDestination);
  const [dangerZones, setDangerZones] = useState([]);
  const [geoFenceWarning, setGeoFenceWarning] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeAlternatives, setRouteAlternatives] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [hasExplicitRouteSelection, setHasExplicitRouteSelection] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [isSafetyLoading, setIsSafetyLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [selectedTravelMode, setSelectedTravelMode] = useState('drive');
  const mapRef = useRef(null);
  const {
    isTraveling,
    startTravelSession,
    stopTravelSession,
    activeRouteIndex,
    travelMode,
  } = useTravelSession();
  const navigationSubscriptionRef = useRef(null);
  const selectedTravelModeRef = useRef('drive');
  const selectedRouteIndexRef = useRef(0);
  const dangerZonesRef = useRef([]);
  const destinationRef = useRef(initialDestination);
  const routeAlternativesRef = useRef([]);
  const activeDangerZoneIdsRef = useRef(new Set());
  const isGeoFenceRecalcInFlightRef = useRef(false);

  const isSelectedRouteRed = useCallback(() => {
    const selectedRoute = routeAlternativesRef.current[selectedRouteIndexRef.current];
    return isDangerousRoute(selectedRoute);
  }, []);

  const showDangerousRouteAlert = useCallback(async (selectedRoute) => {
    if (!isDangerousRoute(selectedRoute)) {
      return;
    }

    const destinationName = destinationRef.current?.name || 'selected destination';
    const message = `Danger alert: the route you are following to ${destinationName} is unsafe. Please switch to a safer route.`;

    Alert.alert('Dangerous route selected', message);

    await addGeoFenceAlertHistoryItem({
      message,
      zone: {
        title: destinationName,
        severity: 'red',
      },
      timestamp: new Date().toISOString(),
    });
  }, []);

  // Animated value for bottom sheet position
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (route?.params?.location) {
      setDestination(route.params.location);
    }
  }, [route?.params?.location]);

  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);

  useEffect(() => {
    selectedTravelModeRef.current = selectedTravelMode;
  }, [selectedTravelMode]);

  useEffect(() => {
    selectedRouteIndexRef.current = selectedRouteIndex;
  }, [selectedRouteIndex]);

  useEffect(() => {
    routeAlternativesRef.current = routeAlternatives;
  }, [routeAlternatives]);

  useEffect(() => {
    dangerZonesRef.current = dangerZones;
  }, [dangerZones]);

  useEffect(() => {
    if (!userLocation || dangerZones.length === 0) {
      return;
    }

    evaluateGeoFence({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
    });
  }, [dangerZones.length, evaluateGeoFence, userLocation]);

  useEffect(() => {
    setIsNavigating(isTraveling);
  }, [isTraveling]);

  useEffect(() => {
    if (isTraveling && typeof travelMode === 'string' && travelMode.length > 0) {
      setSelectedTravelMode(travelMode);
    }
  }, [isTraveling, travelMode]);

  const createRouteInfo = (route, modeKey) => {
    const modeConfig = TRAVEL_MODE_CONFIG[modeKey] || TRAVEL_MODE_CONFIG.drive;
    const adjustedDurationSeconds = route.duration * modeConfig.durationFactor;
    const durationMinutes = Math.max(1, Math.round(adjustedDurationSeconds / 60));
    const arrivalDate = new Date(Date.now() + adjustedDurationSeconds * 1000);

    return {
      modeKey,
      durationMinutes,
      distanceKm: (route.distance / 1000).toFixed(1),
      arrivalTimeText: arrivalDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
      arrivalDateText: arrivalDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      trafficStatus: modeConfig.trafficStatus,
      fuelSaving: Number.isFinite(route?.fuelSaving) ? route.fuelSaving : modeConfig.fuelSaving,
      safetyScore: route?.safetyScore ?? null,
    };
  };

  const applySelectedRoute = (routes, index, modeKey) => {
    const selected = routes[index];
    if (!selected) return;

    setSelectedRouteIndex(index);
    setRouteCoordinates(selected.coordinates);
    setRouteInfo(createRouteInfo(selected, modeKey));

    if (mapRef.current && selected.coordinates.length > 0) {
      setTimeout(() => {
        if (!mapRef.current || selected.coordinates.length === 0) {
          return;
        }

        mapRef.current.fitToCoordinates(selected.coordinates, {
          edgePadding: { top: 100, right: 50, bottom: COLLAPSED_HEIGHT + 50, left: 50 },
          animated: true,
        });
      }, 300);
    }
  };

  const handleGeoFenceEntry = useCallback(
    async (zone, currentCoords) => {
      setGeoFenceWarning(GEOFENCE_WARNING_MESSAGE_TEXT);

      const shouldShowRedZoneTravelAlert =
        isTraveling && isSelectedRouteRed() && isRedZone(zone);
      const redZoneTravelMessage = zone?.title
        ? `You are in a red zone (${zone.title}) while following a red route. Recalculate immediately.`
        : 'You are in a red zone while following a red route. Recalculate immediately.';

      try {
        await sendGeoFenceWarningNotification(zone, {
          message: shouldShowRedZoneTravelAlert ? redZoneTravelMessage : undefined,
        });
      } catch (notificationError) {
        console.error('Error sending geo-fence notification:', notificationError);
      }

      if (shouldShowRedZoneTravelAlert) {
        Alert.alert('Red zone detected', redZoneTravelMessage);
      } else {
        Alert.alert(
          'High-risk area detected',
          `${GEOFENCE_WARNING_MESSAGE_TEXT}\nWe suggest recalculating the route.`
        );
      }

      const currentDestination = destinationRef.current;
      const currentRoutes = routeAlternativesRef.current;

      if (
        !currentDestination ||
        !Array.isArray(currentRoutes) ||
        currentRoutes.length === 0 ||
        isGeoFenceRecalcInFlightRef.current
      ) {
        return;
      }

      isGeoFenceRecalcInFlightRef.current = true;
      setIsSafetyLoading(true);

      try {
        const safeRouteResults = await requestSafeRoute({
          origin_lat: currentCoords.latitude,
          origin_lng: currentCoords.longitude,
          destination_lat: currentDestination.latitude,
          destination_lng: currentDestination.longitude,
          timestamp: new Date().toISOString(),
          routes: buildSafeRoutePayloadRoutes(currentRoutes),
        });

        const recalculatedRoutes = mergeSafeRouteScores(currentRoutes, safeRouteResults);
        setRouteAlternatives(recalculatedRoutes);

        const nextSelectedIndex = Math.min(
          selectedRouteIndexRef.current,
          Math.max(recalculatedRoutes.length - 1, 0)
        );

        if (recalculatedRoutes[nextSelectedIndex]) {
          applySelectedRoute(recalculatedRoutes, nextSelectedIndex, selectedTravelModeRef.current);
        }
      } catch (safeRouteError) {
        console.error('Error recalculating safe route after geo-fence hit:', safeRouteError);
      } finally {
        isGeoFenceRecalcInFlightRef.current = false;
        setIsSafetyLoading(false);
      }
    },
    [applySelectedRoute, isSelectedRouteRed, isTraveling]
  );

  const evaluateGeoFence = useCallback(
    async (currentCoords) => {
      const hadActiveZones = activeDangerZoneIdsRef.current.size > 0;
      const matchedZones = checkGeoFence(currentCoords, dangerZonesRef.current);
      const nextActiveIds = new Set(matchedZones.map((zone) => zone.id));
      const newlyEnteredZones = matchedZones.filter(
        (zone) => !activeDangerZoneIdsRef.current.has(zone.id)
      );

      activeDangerZoneIdsRef.current = nextActiveIds;

      if (!matchedZones.length) {
        setGeoFenceWarning(null);

        if (hadActiveZones) {
          setGeoFenceAlertStatus({
            active: false,
            message: GEOFENCE_WARNING_MESSAGE_TEXT,
          });
        }

        return;
      }

      setGeoFenceWarning(GEOFENCE_WARNING_MESSAGE_TEXT);

      if (newlyEnteredZones.length > 0 || !hadActiveZones) {
        setGeoFenceAlertStatus({
          active: true,
          message: GEOFENCE_WARNING_MESSAGE_TEXT,
        });
      }

      if (newlyEnteredZones.length > 0) {
        const prioritizedZone = newlyEnteredZones.find((zone) => isRedZone(zone)) || newlyEnteredZones[0];
        await handleGeoFenceEntry(prioritizedZone, currentCoords);
      }
    },
    [handleGeoFenceEntry]
  );
  
  const handleSwapLocations = () => {
    if (!origin || !destination) return;

    const nextOrigin = destination;
    const nextDestination = origin;

    setOrigin(nextOrigin);
    setDestination(nextDestination);
  };

  const handleStartNavigation = async () => {
    if (!destination) {
      Alert.alert('No destination', 'Please select a destination first.');
      return;
    }

    const selectedRoute = routeAlternatives[selectedRouteIndex];
    if (!hasExplicitRouteSelection || !selectedRoute) {
      Alert.alert('Select route first', 'Please select the route you want to follow before starting.');
      return;
    }

    try {
      await showDangerousRouteAlert(selectedRoute);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission needed', 'Allow location access to start navigation.');
        return;
      }

      if (navigationSubscriptionRef.current) {
        navigationSubscriptionRef.current.remove();
        navigationSubscriptionRef.current = null;
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (position) => {
          const liveLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          };

          setUserLocation(liveLocation);
          setOrigin(createCurrentLocationPoint(position.coords, 0.01));
          evaluateGeoFence(position.coords);

          if (mapRef.current) {
            mapRef.current.animateToRegion(liveLocation, 600);
          }
        }
      );

      navigationSubscriptionRef.current = subscription;
      setIsNavigating(true);
      startTravelSession(destination, {
        activeRouteIndex: selectedRouteIndex,
        travelMode: selectedTravelModeRef.current,
      });

      try {
        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const matchedZonesOnStart = checkGeoFence(
          currentPosition.coords,
          dangerZonesRef.current
        );

        if (matchedZonesOnStart.length > 0) {
          const prioritizedZone =
            matchedZonesOnStart.find((zone) => isRedZone(zone)) || matchedZonesOnStart[0];
          await handleGeoFenceEntry(prioritizedZone, currentPosition.coords);
          setGeoFenceAlertStatus({
            active: true,
            message: GEOFENCE_WARNING_MESSAGE_TEXT,
          });
        }
      } catch (geoFenceStartError) {
        console.error('Error checking geo-fence at trip start:', geoFenceStartError);
      }
    } catch (error) {
      console.error('Error starting in-app navigation:', error);
      Alert.alert('Unable to start navigation', 'Please try again.');
    }
  };

  const handleStopNavigation = () => {
    if (navigationSubscriptionRef.current) {
      navigationSubscriptionRef.current.remove();
      navigationSubscriptionRef.current = null;
    }
    setIsNavigating(false);
    stopTravelSession();
  };

  useEffect(() => {
    return () => {
      if (navigationSubscriptionRef.current) {
        navigationSubscriptionRef.current.remove();
        navigationSubscriptionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadDangerZoneData = async () => {
      try {
        const zones = await fetchDangerZones();
        if (isMounted) {
          setDangerZones(zones);
        }
      } catch (error) {
        console.error('Error fetching danger zones:', error);
      }
    };

    loadDangerZoneData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isNavigating || dangerZones.length === 0) {
      return undefined;
    }

    let isActive = true;

    const pollGeoFenceLocation = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!isActive) {
          return;
        }

        await evaluateGeoFence(position.coords);
      } catch (error) {
        console.error('Error checking geo-fence location:', error);
      }
    };

    pollGeoFenceLocation();
    const intervalId = setInterval(pollGeoFenceLocation, GEO_FENCE_CHECK_INTERVAL);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [dangerZones.length, evaluateGeoFence, isNavigating]);
  // PanResponder for dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, { dy }) => Math.abs(dy) > 5,
      onPanResponderMove: (evt, { dy }) => {
        // Calculate new position based on drag
        const newValue = isExpanded ? EXPANDED_HEIGHT - dy : COLLAPSED_HEIGHT - dy;
        
        // Constrain value between collapsed and expanded
        if (newValue >= COLLAPSED_HEIGHT && newValue <= EXPANDED_HEIGHT) {
          animatedValue.setValue(newValue);
        }
      },
      onPanResponderRelease: (evt, { dy, vy }) => {
        // Determine final position based on velocity and current position
        const currentHeight = isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
        const newHeight = currentHeight - dy;
        const threshold = (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2;

        let finalHeight = COLLAPSED_HEIGHT;
        
        if (vy < -0.5) {
          // Fast swipe up
          finalHeight = EXPANDED_HEIGHT;
        } else if (vy > 0.5) {
          // Fast swipe down
          finalHeight = COLLAPSED_HEIGHT;
        } else {
          // Snap based on position
          finalHeight = newHeight > threshold ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
        }

        setIsExpanded(finalHeight === EXPANDED_HEIGHT);

        Animated.spring(animatedValue, {
          toValue: finalHeight,
          useNativeDriver: false,
          tension: 50,
          friction: 10,
        }).start();
      },
    })
  ).current;

  // Initialize with collapsed position
  useEffect(() => {
    animatedValue.setValue(COLLAPSED_HEIGHT);
  }, []);

  // Get user location and route
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          const fallback = {
            latitude: 31.5497,
            longitude: 74.3436,
          };
          const fallbackRegion = {
            ...fallback,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          };
          setUserLocation(fallbackRegion);
          setOrigin(createCurrentLocationPoint(fallback));
          return;
        }

        const currentLocation = await Location.getCurrentPositionAsync({});
        const userLoc = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        setUserLocation(userLoc);
        setOrigin(createCurrentLocationPoint(currentLocation.coords));
        evaluateGeoFence(currentLocation.coords);

        // Get route
        getRoute(currentLocation.coords, selectedTravelModeRef.current);
      } catch (error) {
        console.error('Error getting location:', error);
        const fallback = {
          latitude: 31.5497,
          longitude: 74.3436,
        };
        const fallbackRegion = {
          ...fallback,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        setUserLocation(fallbackRegion);
        setOrigin(createCurrentLocationPoint(fallback));
        evaluateGeoFence(fallback);
      }
    };

    getUserLocation();
  }, []);

  // Get route from OSRM
  const getRoute = async (fromCoords, modeKey = selectedTravelModeRef.current) => {
  if (!fromCoords || !destination) return;

  setRouteInfo(null);
  setRouteAlternatives([]);
  setRouteCoordinates([]);
  setSelectedRouteIndex(
    isTraveling && Number.isInteger(activeRouteIndex) ? activeRouteIndex : 0
  );
  setHasExplicitRouteSelection(isTraveling);

  const modeConfig = TRAVEL_MODE_CONFIG[modeKey] || TRAVEL_MODE_CONFIG.drive;

  const start = `${fromCoords.longitude},${fromCoords.latitude}`;
  const end = `${destination.longitude},${destination.latitude}`;

  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/${modeConfig.osrmProfile}/${start};${end}?alternatives=true&geometries=geojson&overview=full&steps=true&annotations=true`
    );
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const alternatives = data.routes
        .map((routeItem, index) => {
          const segments = (routeItem.legs || []).flatMap((leg, legIndex) =>
            (leg.steps || []).map((step, stepIndex) => {
              const rawStreetName =
                typeof step.name === 'string' && step.name.trim().length > 0 ? step.name.trim() : null;
              const fallbackStreetName = [step.ref, step.destinations, step.rotary_name]
                .find((value) => typeof value === 'string' && value.trim().length > 0)
                ?.trim() || null;
              const stepCoords = Array.isArray(step.geometry?.coordinates)
                ? step.geometry.coordinates
                : [];
              const maneuverLocation = Array.isArray(step.maneuver?.location)
                ? {
                    latitude: step.maneuver.location[1],
                    longitude: step.maneuver.location[0],
                  }
                : null;

              return {
                id: `segment-${index}-${legIndex}-${stepIndex}`,
                legIndex,
                stepIndex,
                streetName: rawStreetName || fallbackStreetName,
                hasStreetName: Boolean(rawStreetName || fallbackStreetName),
                distance: step.distance ?? 0,
                duration: step.duration ?? 0,
                mode: step.mode || null,
                ref: step.ref || null,
                drivingSide: step.driving_side || null,
                maneuverType: step.maneuver?.type || null,
                maneuverModifier: step.maneuver?.modifier || null,
                maneuverLocation,
                coordinates: stepCoords.map((coord) => ({
                  latitude: coord[1],
                  longitude: coord[0],
                })),
              };
            })
          );

          return {
            id: `route-${index}`,
            routeId: index + 1,
            coordinates: (routeItem.geometry?.coordinates || []).map((coord) => ({
              latitude: coord[1],
              longitude: coord[0],
            })),
            distance: routeItem.distance,
            duration: routeItem.duration,
            safetyScore: null,
            color: theme.colors.primary,
            segments,
            streetNames: Array.from(
              new Set(
                segments
                  .map((segment) => segment.streetName)
                  .filter((name) => typeof name === 'string' && name.trim().length > 0)
              )
            ),
            label: index === 0 ? 'Fastest' : `Alternative ${index}`,
          };
        })
        .filter((routeItem) => routeItem.coordinates.length > 0)
        .sort((a, b) => a.duration - b.duration);

      const alternativesWithRouteIds = alternatives.map((routeItem, index) => ({
        ...routeItem,
        routeId: index + 1,
      }));

      const alternativesWithFuelSavings = withCalculatedFuelSavings(alternativesWithRouteIds, modeKey);

      let routesWithSafety = alternativesWithFuelSavings;

      try {
        setIsSafetyLoading(true);
        const safetyPayloadRoutes = alternativesWithFuelSavings.map((routeItem) => ({
          route_id: routeItem.routeId,
          coordinates: sampleCoordinatesForSafety(routeItem.coordinates).map((point) => ({
            lat: point.latitude,
            lng: point.longitude,
          })),
        }));
        const safetyPayload = {
          origin_lat: fromCoords.latitude,
          origin_lng: fromCoords.longitude,
          destination_lat: destination.latitude,
          destination_lng: destination.longitude,
          timestamp: new Date().toISOString(),
          routes: safetyPayloadRoutes,
        };

        const safetyResults = await getRouteSafety(safetyPayload);
        const safetyByRouteId = new Map(
          (Array.isArray(safetyResults) ? safetyResults : []).map((item) => [
            Number(item.route_id),
            Number(item.safety_score),
          ])
        );

        routesWithSafety = alternativesWithFuelSavings.map((routeItem) => {
          const safetyScore = safetyByRouteId.get(routeItem.routeId);
          return {
            ...routeItem,
            safetyScore: Number.isFinite(safetyScore) ? safetyScore : null,
            color: getSafetyColor(safetyScore),
          };
        });
      } catch (safetyError) {
        console.error('Error getting route safety:', safetyError);
      } finally {
        setIsSafetyLoading(false);
      }

      setRouteAlternatives(routesWithSafety);

      if (routesWithSafety.length > 0) {
        const lockedIndex =
          isTraveling && Number.isInteger(activeRouteIndex)
            ? Math.min(activeRouteIndex, Math.max(routesWithSafety.length - 1, 0))
            : 0;

        applySelectedRoute(routesWithSafety, lockedIndex, modeKey);
      }
    }
  } catch (error) {
    console.error('Error getting route:', error);
  }
};

  useEffect(() => {
    if (origin && destination) {
      getRoute(origin, selectedTravelMode);
    }
  }, [origin, destination, selectedTravelMode, isNavigating, activeRouteIndex]);

  // Bottom sheet animated style
  const sheetHeight = animatedValue;

  const getOptionDuration = (modeKey) => {
    if (!routeInfo) return '--';

    // Use estimationFactor (not durationFactor) so cross-profile modes like
    // drive (OSRM 'driving') and walk (OSRM 'foot') produce different estimates.
    const currentEstFactor =
      TRAVEL_MODE_CONFIG[selectedTravelMode]?.estimationFactor ?? 1;
    const targetEstFactor =
      TRAVEL_MODE_CONFIG[modeKey]?.estimationFactor ?? 1;

    const adjustedMinutes = Math.max(
      1,
      Math.round(routeInfo.durationMinutes * (targetEstFactor / currentEstFactor))
    );

    return formatDuration(adjustedMinutes);
  };

  const travelOptions = Object.entries(TRAVEL_MODE_CONFIG).map(([key, config]) => ({
    key,
    icon: config.icon,
    label: config.label,
    duration: getOptionDuration(key),
    active: key === selectedTravelMode,
  }));

  const selectedModeConfig = TRAVEL_MODE_CONFIG[selectedTravelMode] || TRAVEL_MODE_CONFIG.drive;

  const handleTravelModeSelect = (modeKey) => {
    if (isNavigating) {
      Alert.alert('Stop navigation first', 'Stop current navigation before switching travel mode.');
      return;
    }

    setSelectedTravelMode(modeKey);
  };

  const handleAlternativeSelect = (index) => {
    if (!routeAlternatives.length) return;

    if (isNavigating) {
      Alert.alert('Stop navigation first', 'Stop current navigation before switching routes.');
      return;
    }

    setHasExplicitRouteSelection(true);
    applySelectedRoute(routeAlternatives, index, selectedTravelMode);
  };

  const handleDebugRouteData = () => {
    const selectedRoute = routeAlternatives[selectedRouteIndex] || null;
    if (!selectedRoute) {
      Alert.alert('Debug Route Data', 'No selected route available yet.');
      return;
    }

    const segments = Array.isArray(selectedRoute.segments) ? selectedRoute.segments : [];
    const firstStreetNames = segments
      .map((segment) => segment.streetName)
      .filter((name) => typeof name === 'string' && name.trim().length > 0)
      .slice(0, 5);

    console.log('Selected Route Debug', {
      routeId: selectedRoute.id,
      label: selectedRoute.label,
      distance: selectedRoute.distance,
      duration: selectedRoute.duration,
      segmentCount: segments.length,
      streetNamesPreview: firstStreetNames,
      segmentsPreview: segments.slice(0, 3),
    });

    Alert.alert(
      'Route Debug',
      `Segments: ${segments.length}\nStreets: ${firstStreetNames.join(', ') || 'N/A'}`
    );
  };

  const orderedRouteAlternatives = routeAlternatives
    .map((routeItem, index) => ({ routeItem, index }))
    .sort((a, b) => {
      const aSelected = a.index === selectedRouteIndex ? 1 : 0;
      const bSelected = b.index === selectedRouteIndex ? 1 : 0;
      return aSelected - bSelected;
    });

  const mapVisibleRouteAlternatives = isNavigating
    ? orderedRouteAlternatives.filter(({ index }) => index === selectedRouteIndex)
    : orderedRouteAlternatives;

  const originDisplayName = origin?.name || 'Your location';
  const originDisplayAddress = origin?.address || 'Current position';
  const destinationDisplayName = destination?.name || 'Selected destination';
  const destinationDisplayAddress = destination?.address || 'Destination location';
  const shouldShowOriginMarker = Boolean(origin) && !areCoordinatesClose(origin, userLocation);
  const shouldShowDestinationMarker =
    Boolean(destination) && !areCoordinatesClose(destination, origin);

  return (
    <SafeAreaView style={styles.container}>
      {userLocation && destination && (
        <View style={styles.locationSummaryContainer} pointerEvents="box-none">
          <View style={styles.locationSummaryCard}>
            <View style={styles.locationSummaryContent}>
              <View style={styles.locationRow}>
                <View style={styles.locationRowLeft}>
                  <View style={styles.originDot} />
                  <View style={styles.locationMeta}>
                    <Text style={styles.locationRowLabel}>{originDisplayName}</Text>
                    <Text style={styles.locationRowSubtext}>{originDisplayAddress}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.locationDivider} />

              <View style={styles.locationRow}>
                <View style={styles.locationRowLeft}>
                  <MaterialIcons name="location-on" size={22} color="#FF3B30" />
                  <View style={styles.locationMeta}>
                    <Text style={styles.locationRowLabel}>{destinationDisplayName}</Text>
                    <Text style={styles.locationRowSubtext} numberOfLines={1}>
                      {destinationDisplayAddress}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={styles.locationCardAction}
              onPress={handleSwapLocations} // <-- attach here
          >
              <MaterialIcons name="swap-vert" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      {/* Map */}
      {userLocation ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={userLocation}
          showsUserLocation
          loadingEnabled
          provider={PROVIDER_GOOGLE}
        >
          {/* User Location Marker */}
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            }}
            title="Your Location"
            pinColor={theme.colors.primary}
          >
            <View style={styles.userMarker}>
              <View style={styles.userMarkerInner} />
            </View>
          </Marker>

          {/* Route Origin Marker (when swapped or custom origin differs from live location) */}
          {shouldShowOriginMarker && (
            <Marker
              coordinate={{
                latitude: origin.latitude,
                longitude: origin.longitude,
              }}
              title={originDisplayName}
              description={originDisplayAddress}
            >
              <View style={styles.originLocationMarker}>
                <MaterialIcons name="trip-origin" size={22} color={theme.colors.primary} />
              </View>
            </Marker>
          )}

          {/* Selected Location Marker */}
          {shouldShowDestinationMarker && (
            <Marker
              coordinate={{
                latitude: destination.latitude,
                longitude: destination.longitude,
              }}
              title={destinationDisplayName}
              description={destinationDisplayAddress}
            >
              <View style={styles.locationMarker}>
                <MaterialIcons name="location-on" size={28} color="#FF3B30" />
              </View>
            </Marker>
          )}

          {/* Route Polylines */}
          {mapVisibleRouteAlternatives.map(({ routeItem, index }) => (
            <Polyline
              key={routeItem.id}
              coordinates={routeItem.coordinates}
              strokeColor={
                index === selectedRouteIndex
                  ? theme.colors.primary
                  : 'rgba(45, 80, 255, 0.35)'
              }
              strokeWidth={index === selectedRouteIndex ? 4 : 3}
              lineDashPattern={index === selectedRouteIndex ? undefined : [8, 6]}
              zIndex={index === selectedRouteIndex ? 2 : 1}
              tappable
              onPress={() => handleAlternativeSelect(index)}
            />
          ))}

          {mapVisibleRouteAlternatives.map(({ routeItem }) => {
            const circleStyle = getSafetyCircleStyle(routeItem.safetyScore);
            const sampledCirclePoints = sampleCoordinatesForMapCircles(routeItem.coordinates);

            return sampledCirclePoints.map((point, pointIndex) => (
              <Circle
                key={`detail-route-safety-circle-${routeItem.id}-${pointIndex}`}
                center={point}
                radius={50}
                strokeColor={circleStyle.strokeColor}
                fillColor={circleStyle.fillColor}
                strokeWidth={1}
              />
            ));
          })}
        </MapView>
      ) : (
        <View style={styles.loadingContainer} />
      )}

      <View style={styles.safetyLegendCard} pointerEvents="none">
        <View style={styles.safetyLegendRow}>
          <View style={[styles.safetyLegendDot, { backgroundColor: '#2FAD65' }]} />
          <Text style={styles.safetyLegendText}>Safe ({'>'}70)</Text>
        </View>
        <View style={styles.safetyLegendRow}>
          <View style={[styles.safetyLegendDot, { backgroundColor: '#F39C12' }]} />
          <Text style={styles.safetyLegendText}>Moderate (40–70)</Text>
        </View>
        <View style={styles.safetyLegendRow}>
          <View style={[styles.safetyLegendDot, { backgroundColor: '#E74C3C' }]} />
          <Text style={styles.safetyLegendText}>Unsafe ({'<'}40)</Text>
        </View>
      </View>

      {isSafetyLoading && (
        <View style={styles.safetyLoadingBanner} pointerEvents="none">
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.safetyLoadingBannerText}>Analyzing route safety...</Text>
        </View>
      )}

      {geoFenceWarning && (
        <View
          style={[
            styles.geoFenceAlertBanner,
            isSafetyLoading && styles.geoFenceAlertBannerOffset,
          ]}
          pointerEvents="none"
        >
          <MaterialIcons name="warning-amber" size={18} color="#B42318" />
          <View style={styles.geoFenceAlertContent}>
            <Text style={styles.geoFenceAlertText}>{geoFenceWarning}</Text>
            <Text style={styles.geoFenceAlertSubtext}>Suggested action: recalculate route.</Text>
          </View>
        </View>
      )}

      {/* Draggable Bottom Sheet */}
      <Animated.View
        style={[
          styles.bottomSheet,
          {
            height: sheetHeight,
          },
        ]}
      >
        <View style={styles.dragZone} {...panResponder.panHandlers}>
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>
          <View style={styles.locationHeader}>
            <View style={styles.locationTitleContainer}>
              <Text style={styles.locationTitle}>
                {destination ? destination.name : 'No destination selected'}
              </Text>
              {destination && (
                <Text style={styles.locationSubtitle} numberOfLines={2}>
                  {destination.address}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <MaterialIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Sheet Content */}
        <View style={styles.sheetContent}>
          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={styles.contentScrollContent}
            showsVerticalScrollIndicator={false}
            scrollEnabled={isExpanded}
          >
            <View style={styles.modeSelectorRow}>
              {travelOptions.map((option) => (
                <View key={option.key} style={styles.modeOptionColumn}>
                  <TouchableOpacity
                    style={[
                      styles.modeOption,
                      option.active && styles.modeOptionActive,
                    ]}
                    onPress={() => handleTravelModeSelect(option.key)}
                  >
                    <MaterialIcons
                      name={option.icon}
                      size={18}
                      color={option.active ? '#FFF' : '#6F7781'}
                    />
                    <Text
                      style={[
                        styles.modeOptionLabel,
                        option.active && styles.modeOptionLabelActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={[
                      styles.modeOptionDuration,
                      option.active && styles.modeOptionDurationActive,
                    ]}
                  >
                    {option.duration}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.routeCard}>
              <View style={styles.routeBadgeRow}>
                <View style={[styles.modePill, styles.modePillActive]}>
                  <MaterialIcons
                    name={selectedModeConfig.icon}
                    size={16}
                    color={theme.colors.background}
                  />
                  <Text style={styles.modePillText}>{selectedModeConfig.label}</Text>
                </View>
                <Text style={styles.routeDurationText}>
                  {routeInfo ? `${routeInfo.durationMinutes} min` : '--'}
                </Text>
              </View>

              <Text style={styles.arrivalLabel}>
                {routeInfo
                  ? `Arrive ${routeInfo.arrivalTimeText}, ${routeInfo.arrivalDateText}`
                  : 'Arrive --'}
              </Text>
              <Text style={styles.routeSubtext}>
                {routeInfo ? routeInfo.trafficStatus : 'Looking up traffic...'}
              </Text>
              {routeInfo?.safetyScore !== null && routeInfo?.safetyScore !== undefined && (
                <Text style={styles.routeSafetyText}>Safety score: {routeInfo.safetyScore}</Text>
              )}

              {routeAlternatives.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.routeAlternativesScroll}
                  contentContainerStyle={styles.routeAlternativesContent}
                >
                  {routeAlternatives.map((routeItem, index) => (
                    <TouchableOpacity
                      key={routeItem.id}
                      style={[
                        styles.routeChip,
                        {
                          backgroundColor: getRouteChipPalette(
                            routeItem.safetyScore,
                            index === selectedRouteIndex
                          ).backgroundColor,
                          borderColor: getRouteChipPalette(
                            routeItem.safetyScore,
                            index === selectedRouteIndex
                          ).borderColor,
                          borderWidth: index === selectedRouteIndex ? 2 : 1,
                        },
                      ]}
                      onPress={() => handleAlternativeSelect(index)}
                    >
                      <Text
                        style={[
                          styles.routeChipLabel,
                          {
                            color: getRouteChipPalette(
                              routeItem.safetyScore,
                              index === selectedRouteIndex
                            ).labelColor,
                          },
                        ]}
                      >
                        {routeItem.label}
                      </Text>
                      <Text
                        style={[
                          styles.routeChipMeta,
                          {
                            color: getRouteChipPalette(
                              routeItem.safetyScore,
                              index === selectedRouteIndex
                            ).metaColor,
                          },
                        ]}
                      >
                        {`${Math.max(1, Math.round(routeItem.duration / 60))} min • ${(routeItem.distance / 1000).toFixed(1)} km`}
                      </Text>
                      <Text
                        style={[
                          styles.routeChipSafety,
                          { color: getSafetyScoreTextColor(routeItem.safetyScore) },
                        ]}
                      >
                        {getSafetyScoreText(routeItem.safetyScore)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <View style={styles.routeMetaRow}>
                <View style={styles.routeMetaItem}>
                  <Text style={styles.routeDistanceText}>
                    {routeInfo ? `${routeInfo.distanceKm} km` : '-- km'}
                  </Text>
                  <Text style={styles.routeMetaCaption}>Distance</Text>
                </View>
                <View style={styles.routeEcoRow}>
                  <MaterialIcons name="eco" size={18} color="#2FAD65" />
                  <Text style={styles.routeEcoText}>
                    {routeInfo
                      ? `Saves ${routeInfo.fuelSaving}% gas`
                      : 'Optimizing route'}
                  </Text>
                </View>
              </View>

              <View style={styles.routeActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.routeActionButton,
                    styles.routeActionPrimary,
                    !isNavigating && !hasExplicitRouteSelection && styles.routeActionPrimaryDisabled,
                  ]}
                  onPress={isNavigating ? handleStopNavigation : handleStartNavigation}
                  disabled={!isNavigating && !hasExplicitRouteSelection}
                >
                  <Text style={styles.routeActionTextPrimary}>{isNavigating ? 'Stop' : 'Start'}</Text>
                </TouchableOpacity>
                {isNavigating && (
                  <TouchableOpacity
                    style={[styles.routeActionButton, styles.routeActionSecondary]}
                    onPress={() => navigation.goBack()}
                  >
                    <Text style={styles.routeActionTextSecondary}>Back</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.routeActionButton, styles.routeActionSecondary]}
                  onPress={handleDebugRouteData}
                >
                  <Text style={styles.routeActionTextSecondary}>Debug Route Data</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  userMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  userMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  locationMarker: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  originLocationMarker: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: '#D8D8D8',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 10,
    zIndex: 100,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingBottom: 8,
    backgroundColor: theme.colors.background,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#D0D0D0',
    borderRadius: 2,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  dragZone: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: theme.colors.background,
  },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
  },
  locationTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  locationTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  locationSubtitle: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  contentScroll: {
    flex: 1,
  },
  contentScrollContent: {
    paddingBottom: 32,
  },
  modeSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modeOptionColumn: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modeOption: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F1F3F6',
  },
  modeOptionActive: {
    backgroundColor: theme.colors.primary,
  },
  modeOptionLabel: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#6F7781',
  },
  modeOptionLabelActive: {
    color: '#FFF',
  },
  modeOptionDuration: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#6F7781',
  },
  modeOptionDurationActive: {
    color: theme.colors.text,
  },
  routeCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  routeBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E9ECF2',
  },
  modePillActive: {
    backgroundColor: theme.colors.text,
  },
  modePillText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.background,
  },
  routeDurationText: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
  },
  arrivalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  routeSubtext: {
    fontSize: 13,
    color: '#6A6A6A',
    marginBottom: 14,
  },
  routeSafetyText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  routeAlternativesScroll: {
    marginBottom: 14,
  },
  routeAlternativesContent: {
    paddingVertical: 2,
  },
  routeChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  routeChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  routeChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  routeChipLabelActive: {
    color: '#FFF',
  },
  routeChipMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  routeChipSafety: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  routeChipMetaActive: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  routeMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  routeMetaItem: {
    flexDirection: 'column',
  },
  routeDistanceText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  routeMetaCaption: {
    fontSize: 12,
    color: '#8E8E93',
  },
  routeEcoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F6EE',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  routeEcoText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#1F8A4D',
  },
  routeActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  routeActionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  routeActionPrimary: {
    backgroundColor: theme.colors.primary,
  },
  routeActionPrimaryDisabled: {
    opacity: 0.5,
  },
  routeActionSecondary: {
    borderWidth: 1,
    borderColor: '#D7D7D7',
    backgroundColor: '#FFF',
  },
  routeActionTextPrimary: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  routeActionTextSecondary: {
    color: '#1F1F1F',
    fontWeight: '600',
    fontSize: 15,
  },
  locationSummaryContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 150,
  },
  locationSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  locationSummaryContent: {
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  originDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
    marginRight: 12,
  },
  locationMeta: {
    flex: 1,
  },
  locationRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  locationRowSubtext: {
    fontSize: 12,
    color: '#7A7A7A',
    marginTop: 2,
  },
  locationDivider: {
    height: 1,
    backgroundColor: '#EFEFEF',
    marginVertical: 10,
  },
  locationCardAction: {
    padding: 8,
    marginLeft: 10,
  },
  safetyLegendCard: {
    position: 'absolute',
    top: 88,
    right: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 160,
  },
  safetyLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 1,
  },
  safetyLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  safetyLegendText: {
    fontSize: 11,
    color: '#444',
  },
  safetyLoadingBanner: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 160,
  },
  safetyLoadingBannerText: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
  geoFenceAlertBanner: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEECEC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#F7C9C5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 160,
  },
  geoFenceAlertBannerOffset: {
    top: 102,
  },
  geoFenceAlertContent: {
    flex: 1,
    marginLeft: 8,
  },
  geoFenceAlertText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B42318',
  },
  geoFenceAlertSubtext: {
    fontSize: 12,
    color: '#7A271A',
    marginTop: 2,
  },
});

export default LocationDetailScreen;
