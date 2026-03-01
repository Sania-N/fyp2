import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '../styles/theme';

const RoutesScreen = ({ navigation, route }) => {
  const mapRef = useRef(null);
  const [userLocation, setUserLocation] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [routesData, setRoutesData] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);

  // Handle selected location from SearchLocationsScreen
  useEffect(() => {
  if (route?.params?.selectedLocation && userLocation) {
    const location = route.params.selectedLocation;

    setSelectedLocation(location);

    // wait a tiny bit to ensure state updates
    setTimeout(() => {
      getRoute(location);
    }, 200);

    navigation.setParams({ selectedLocation: null });
  }
}, [route?.params?.selectedLocation, userLocation]);

  // Get user's location
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Location permission is required');
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      } catch (error) {
        console.error('Error getting location:', error);
        // Default location (Lahore, Pakistan)
        setUserLocation({
          latitude: 31.5497,
          longitude: 74.3436,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      } finally {
        setMapLoading(false);
      }
    };

    getUserLocation();
  }, []);

  // Get route from OSRM
  const getRoute = async (destination) => {
    if (!userLocation) {
      Alert.alert('Error', 'User location not available');
      return;
    }

    setLoading(true);
    try {
      const start = `${userLocation.longitude},${userLocation.latitude}`;
      const end = `${destination.longitude},${destination.latitude}`;

      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${start};${end}?alternatives=true&geometries=geojson&overview=full`
      );
      const data = await response.json();

      const osrmRoutes = (data.routes || []).map((route, index) => ({
        id: `${destination?.id || destination?.name || 'route'}-${index}`,
        coordinates: (route.geometry?.coordinates || []).map((coord) => ({
          latitude: coord[1],
          longitude: coord[0],
        })),
        distance: route.distance,
        duration: route.duration,
        label: index === 0 ? 'Fastest' : `Alternative ${index}`,
      }));

      const sortedRoutes = osrmRoutes
        .filter((route) => route.coordinates.length > 0)
        .sort((a, b) => a.duration - b.duration);

      if (!sortedRoutes.length) {
        Alert.alert('Routes Unavailable', 'Could not find alternative routes for this destination.');
        return;
      }

      setRoutesData(sortedRoutes);
      setSelectedRouteIndex(0);

      const primaryRoute = sortedRoutes[0];

      if (mapRef.current && primaryRoute.coordinates.length > 0) {
        setTimeout(() => {
          mapRef.current.fitToCoordinates(primaryRoute.coordinates, {
            edgePadding: { top: 100, right: 50, bottom: 140, left: 50 },
            animated: true,
          });
        }, 400);
      }
    } catch (error) {
      console.error('Error getting route:', error);
      Alert.alert('Error', 'Failed to get route');
    } finally {
      setLoading(false);
    }
  };

  const handleRouteSelect = (index) => {
    setSelectedRouteIndex(index);
    const selectedRoute = routesData[index];

    if (selectedRoute && mapRef.current && selectedRoute.coordinates.length > 0) {
      mapRef.current.fitToCoordinates(selectedRoute.coordinates, {
        edgePadding: { top: 100, right: 50, bottom: 140, left: 50 },
        animated: true,
      });
    }
  };

  const selectedRoute = routesData[selectedRouteIndex] || null;
  const arrivalTimeString = selectedRoute
    ? new Date(Date.now() + selectedRoute.duration * 1000).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  const durationMinutes = selectedRoute ? Math.max(1, Math.round(selectedRoute.duration / 60)) : 0;
  const distanceKm = selectedRoute ? (selectedRoute.distance / 1000).toFixed(1) : '0.0';
  const savingsPercent = selectedRoute ? 11 : 0;

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={theme.gradient.background} style={styles.gradient}>
        {/* Header with Search Button */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.searchContainer}
            onPress={() => navigation.navigate('SearchLocations')}
            activeOpacity={0.7}
          >
            <MaterialIcons name="location-on" size={20} color={theme.colors.primary} />
            <Text style={styles.searchPlaceholder}>Search locations...</Text>
          </TouchableOpacity>
        </View>
        {/* Map View */}
        {mapLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading map...</Text>
          </View>
        ) : userLocation ? (
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={userLocation}
              showsUserLocation
              followsUserLocation
              loadingEnabled
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

              {/* Route Alternatives */}
              {routesData.map((route, index) => (
                <Polyline
                  key={`route-${route.id}`}
                  coordinates={route.coordinates}
                  strokeColor={
                    index === selectedRouteIndex
                      ? theme.colors.primary
                      : 'rgba(45, 80, 255, 0.35)'
                  }
                  strokeWidth={index === selectedRouteIndex ? 5 : 4}
                  lineDashPattern={index === selectedRouteIndex ? undefined : [8, 6]}
                  tappable
                  onPress={() => handleRouteSelect(index)}
                />
              ))}

              {/* Duration Labels */}
              {routesData.map((route, index) => {
                if (!route.coordinates.length) return null;
                const midpoint = route.coordinates[Math.floor(route.coordinates.length / 2)];
                const durationLabel = `${Math.max(1, Math.round(route.duration / 60))} min`;

                return (
                  <Marker
                    key={`route-label-${route.id}`}
                    coordinate={midpoint}
                    anchor={{ x: 0.5, y: 0.5 }}
                    onPress={() => handleRouteSelect(index)}
                  >
                    <View
                      style={[
                        styles.durationBadge,
                        index === selectedRouteIndex && styles.durationBadgeActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.durationText,
                          index === selectedRouteIndex && styles.durationTextActive,
                        ]}
                      >
                        {durationLabel}
                      </Text>
                    </View>
                  </Marker>
                );
              })}
            </MapView>

            {selectedLocation && (
              <View style={styles.routeInfoPanel}>
                <View style={styles.panelHeader}>
                  <View>
                    <Text style={styles.locationName}>{selectedLocation.name}</Text>
                    <Text style={styles.locationAddress}>{selectedLocation.address}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedLocation(null)}>
                    <MaterialIcons name="close" size={24} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>

                {selectedRoute ? (
                  <>
                    <View style={styles.routeInfoHeader}>
                      <View>
                        <Text style={styles.arrivalText}>Arrive {arrivalTimeString}</Text>
                        <Text style={styles.arrivalHint}>Fastest route now due to traffic conditions</Text>
                      </View>
                      <View style={styles.durationCircle}>
                        <Text style={styles.durationCircleText}>{durationMinutes} min</Text>
                      </View>
                    </View>
                    <Text style={styles.distanceText}>
                      {distanceKm} km • Saves {savingsPercent}% gas
                    </Text>
                  </>
                ) : (
                  <Text style={styles.arrivalHint}>Finding the best route...</Text>
                )}

                <View style={styles.routeActionsRow}>
                  <TouchableOpacity style={[styles.routeActionButton, styles.startButton]}>
                    <MaterialIcons name="navigation" size={18} color="#FFF" />
                    <Text style={styles.startButtonText}>Start</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.routeActionButton}>
                    <MaterialIcons name="add-location" size={18} color={theme.colors.primary} />
                    <Text style={styles.secondaryActionText}>Add stops</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.routeActionButton, styles.routeActionButtonLast]}>
                    <MaterialIcons name="share" size={18} color={theme.colors.primary} />
                    <Text style={styles.secondaryActionText}>Share</Text>
                  </TouchableOpacity>
                </View>

                {routesData.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.routeAlternativesScroll}
                    contentContainerStyle={styles.routeAlternativesContent}
                  >
                    {routesData.map((route, index) => (
                      <TouchableOpacity
                        key={route.id}
                        style={[
                          styles.routeChip,
                          index === selectedRouteIndex && styles.routeChipActive,
                        ]}
                        onPress={() => handleRouteSelect(index)}
                      >
                        <Text
                          style={[
                            styles.routeChipLabel,
                            index === selectedRouteIndex && styles.routeChipLabelActive,
                          ]}
                        >
                          {route.label || `Route ${index + 1}`}
                        </Text>
                        <Text
                          style={[
                            styles.routeChipMeta,
                            index === selectedRouteIndex && styles.routeChipMetaActive,
                          ]}
                        >
                          {`${Math.round(route.duration / 60)} min • ${(route.distance / 1000).toFixed(1)} km`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Loading Overlay */}
            {loading && (
              <View style={styles.routeLoadingOverlay}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={48} color={theme.colors.danger} />
            <Text style={styles.errorText}>Unable to get your location</Text>
          </View>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  gradient: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 24,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchPlaceholder: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 16,
    color: '#999',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: theme.colors.danger,
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
  locationName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  locationAddress: {
    fontSize: 13,
    color: '#666',
  },
  routeLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 0,
  },
  routeInfoPanel: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  routeInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  arrivalText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  arrivalHint: {
    fontSize: 12,
    color: '#7C7C7C',
    marginTop: 2,
  },
  durationCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  durationCircleText: {
    color: '#FFF',
    fontWeight: '700',
  },
  distanceText: {
    fontSize: 14,
    color: '#606060',
    marginBottom: 12,
  },
  routeActionsRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  routeActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E6E6E6',
    marginRight: 8,
    backgroundColor: '#F4F4F6',
  },
  routeActionButtonLast: {
    marginRight: 0,
  },
  startButton: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  startButtonText: {
    color: '#FFF',
    fontWeight: '600',
    marginLeft: 6,
  },
  secondaryActionText: {
    color: theme.colors.primary,
    fontWeight: '600',
    marginLeft: 6,
  },
  routeAlternativesScroll: {
    marginTop: 6,
  },
  routeAlternativesContent: {
    paddingTop: 6,
    paddingBottom: 8,
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
  durationBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  durationBadgeActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  durationText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  durationTextActive: {
    color: '#FFF',
  },
});

export default RoutesScreen;
