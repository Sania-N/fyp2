import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';

import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '../styles/theme';

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
    trafficStatus: 'Fastest route now due to traffic conditions',
    fuelSaving: 11,
  },
  transit: {
    icon: 'directions-transit-filled',
    label: 'Transit',
    osrmProfile: 'driving',
    durationFactor: 1.8,
    trafficStatus: 'Transit estimate based on current traffic conditions',
    fuelSaving: 24,
  },
  walk: {
    icon: 'directions-walk',
    label: 'Walk',
    osrmProfile: 'foot',
    durationFactor: 1,
    trafficStatus: 'Walking route based on shortest available path',
    fuelSaving: 100,
  },
};

const LocationDetailScreen = ({ navigation, route }) => {
  const initialDestination = route?.params?.location ?? null;
  const [userLocation, setUserLocation] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(initialDestination);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeAlternatives, setRouteAlternatives] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeInfo, setRouteInfo] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [selectedTravelMode, setSelectedTravelMode] = useState('drive');
  const mapRef = useRef(null);
  const navigationSubscriptionRef = useRef(null);
  const selectedTravelModeRef = useRef('drive');

  // Animated value for bottom sheet position
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (route?.params?.location) {
      setDestination(route.params.location);
    }
  }, [route?.params?.location]);

  useEffect(() => {
    selectedTravelModeRef.current = selectedTravelMode;
  }, [selectedTravelMode]);

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
      fuelSaving: modeConfig.fuelSaving,
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
        mapRef.current.fitToCoordinates(selected.coordinates, {
          edgePadding: { top: 100, right: 50, bottom: COLLAPSED_HEIGHT + 50, left: 50 },
          animated: true,
        });
      }, 300);
    }
  };
  
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

    try {
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
          getRoute(position.coords, selectedTravelModeRef.current);

          if (mapRef.current) {
            mapRef.current.animateToRegion(liveLocation, 600);
          }
        }
      );

      navigationSubscriptionRef.current = subscription;
      setIsNavigating(true);
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
  };

  useEffect(() => {
    return () => {
      if (navigationSubscriptionRef.current) {
        navigationSubscriptionRef.current.remove();
        navigationSubscriptionRef.current = null;
      }
    };
  }, []);
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
  setSelectedRouteIndex(0);

  const modeConfig = TRAVEL_MODE_CONFIG[modeKey] || TRAVEL_MODE_CONFIG.drive;

  const start = `${fromCoords.longitude},${fromCoords.latitude}`;
  const end = `${destination.longitude},${destination.latitude}`;

  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/${modeConfig.osrmProfile}/${start};${end}?alternatives=true&geometries=geojson&overview=full`
    );
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const alternatives = data.routes
        .map((routeItem, index) => ({
          id: `route-${index}`,
          coordinates: (routeItem.geometry?.coordinates || []).map((coord) => ({
            latitude: coord[1],
            longitude: coord[0],
          })),
          distance: routeItem.distance,
          duration: routeItem.duration,
          label: index === 0 ? 'Fastest' : `Alternative ${index}`,
        }))
        .filter((routeItem) => routeItem.coordinates.length > 0)
        .sort((a, b) => a.duration - b.duration);

      setRouteAlternatives(alternatives);

      if (alternatives.length > 0) {
        applySelectedRoute(alternatives, 0, modeKey);
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
  }, [origin, destination, selectedTravelMode]);

  // Bottom sheet animated style
  const sheetHeight = animatedValue;

  const getOptionDuration = (modeKey) => {
    if (!routeInfo) return '--';

    const currentModeFactor =
      TRAVEL_MODE_CONFIG[selectedTravelMode]?.durationFactor ?? TRAVEL_MODE_CONFIG.drive.durationFactor;
    const targetModeFactor =
      TRAVEL_MODE_CONFIG[modeKey]?.durationFactor ?? TRAVEL_MODE_CONFIG.drive.durationFactor;

    const adjustedMinutes = Math.max(
      1,
      Math.round(routeInfo.durationMinutes * (targetModeFactor / currentModeFactor))
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

  const handleAlternativeSelect = (index) => {
    if (!routeAlternatives.length) return;
    applySelectedRoute(routeAlternatives, index, selectedTravelMode);
  };

  const orderedRouteAlternatives = routeAlternatives
    .map((routeItem, index) => ({ routeItem, index }))
    .sort((a, b) => {
      const aSelected = a.index === selectedRouteIndex ? 1 : 0;
      const bSelected = b.index === selectedRouteIndex ? 1 : 0;
      return aSelected - bSelected;
    });

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
                    <Text style={styles.locationRowLabel}>Your location</Text>
                    <Text style={styles.locationRowSubtext}>Current position</Text>
                  </View>
                </View>
              </View>

              <View style={styles.locationDivider} />

              <View style={styles.locationRow}>
                <View style={styles.locationRowLeft}>
                  <MaterialIcons name="location-on" size={22} color="#FF3B30" />
                  <View style={styles.locationMeta}>
                    <Text style={styles.locationRowLabel}>{destination.name}</Text>
                    <Text style={styles.locationRowSubtext} numberOfLines={1}>
                      {destination.address}
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

          {/* Selected Location Marker */}
          {destination && (
            <Marker
              coordinate={{
                latitude: destination.latitude,
                longitude: destination.longitude,
              }}
              title={destination.name}
            >
              <View style={styles.locationMarker}>
                <MaterialIcons name="location-on" size={28} color="#FF3B30" />
              </View>
            </Marker>
          )}

          {/* Route Polylines */}
          {orderedRouteAlternatives.map(({ routeItem, index }) => (
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
        </MapView>
      ) : (
        <View style={styles.loadingContainer} />
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
                    onPress={() => setSelectedTravelMode(option.key)}
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
                        index === selectedRouteIndex && styles.routeChipActive,
                      ]}
                      onPress={() => handleAlternativeSelect(index)}
                    >
                      <Text
                        style={[
                          styles.routeChipLabel,
                          index === selectedRouteIndex && styles.routeChipLabelActive,
                        ]}
                      >
                        {routeItem.label}
                      </Text>
                      <Text
                        style={[
                          styles.routeChipMeta,
                          index === selectedRouteIndex && styles.routeChipMetaActive,
                        ]}
                      >
                        {`${Math.max(1, Math.round(routeItem.duration / 60))} min • ${(routeItem.distance / 1000).toFixed(1)} km`}
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
                  style={[styles.routeActionButton, styles.routeActionPrimary]}
                  onPress={isNavigating ? handleStopNavigation : handleStartNavigation}
                >
                  <Text style={styles.routeActionTextPrimary}>{isNavigating ? 'Stop' : 'Start'}</Text>
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
});

export default LocationDetailScreen;
