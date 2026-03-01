import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../styles/theme';

const RECENT_STORAGE_KEY = '@search_recent_locations';
const DEFAULT_RECENT_LOCATIONS = [
  {
    id: 1,
    name: 'Pizza Palace',
    address: 'Nespak Street 13, Block E, Lahore',
    latitude: 31.5497,
    longitude: 74.3436,
    isRecent: true,
  },
  {
    id: 2,
    name: 'Shell Gas Station',
    address: 'Cologne Road, Lahore',
    latitude: 31.5485,
    longitude: 74.3465,
    isRecent: true,
  },
];

const SearchLocationsScreen = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentLocations, setRecentLocations] = useState(DEFAULT_RECENT_LOCATIONS);

  useEffect(() => {
    const loadRecentLocations = async () => {
      try {
        const stored = await AsyncStorage.getItem(RECENT_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length) {
            setRecentLocations(parsed);
            return;
          }
        }
        await AsyncStorage.setItem(
          RECENT_STORAGE_KEY,
          JSON.stringify(DEFAULT_RECENT_LOCATIONS)
        );
      } catch (error) {
        console.warn('Failed to load recent locations', error);
      }
    };

    loadRecentLocations();
  }, []);

  // Search locations using Nominatim API
  useEffect(() => {
    const searchLocations = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        searchQuery
      )}&format=json&limit=10`,
      {
        headers: {
          'User-Agent': 'ShecureApp/1.0 (your@email.com)',
        },
      }
    );
        const data = await response.json();

        // Transform API response to our format
        const results = data.map((item, index) => ({
          id: item.osm_id || index,
          name: item.name,
          address: item.display_name,
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
          isRecent: false,
        }));

        setSearchResults(results);
      } catch (error) {
        console.error('Error searching locations:', error);
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    };

    // Debounce the search
    const timer = setTimeout(() => {
      searchLocations();
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredLocations = searchQuery.trim() ? searchResults : recentLocations;

  const handleLocationSelect = async (location) => {
    const normalizedLocation = {
      id: location.id ?? `${location.latitude}-${location.longitude}`,
      name: location.name || location.display_name || 'Unknown place',
      address: location.address || location.display_name || '',
      latitude:
        typeof location.latitude === 'number'
          ? location.latitude
          : Number(location.lat),
      longitude:
        typeof location.longitude === 'number'
          ? location.longitude
          : Number(location.lon),
      isRecent: true,
      timestamp: Date.now(),
    };

    const updatedRecent = [
      normalizedLocation,
      ...recentLocations.filter((loc) => loc.id !== normalizedLocation.id),
    ].slice(0, 5);

    setRecentLocations(updatedRecent);

    try {
      await AsyncStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updatedRecent));
    } catch (error) {
      console.warn('Failed to save recent locations', error);
    }

    navigation.navigate('LocationDetail', { location: normalizedLocation });
  };

  const getSectionTitle = () => {
    if (searchQuery.trim()) {
      return `Results (${filteredLocations.length})`;
    }
    return 'Recent';
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={theme.gradient.background} style={styles.gradient}>
        {/* Header with Search Bar */}
        <View style={styles.header}>
          <View style={styles.searchBar}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <MaterialIcons name="arrow-back" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.searchInput}
              placeholder="Search locations..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <MaterialIcons name="close" size={20} color="#999" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Locations List */}
        <ScrollView
          style={styles.listContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Searching locations...</Text>
            </View>
          ) : filteredLocations.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>{getSectionTitle()}</Text>
              {filteredLocations.map((location) => (
                <TouchableOpacity
                  key={location.id}
                  style={styles.locationItem}
                  onPress={() => handleLocationSelect(location)}
                  activeOpacity={0.7}
                >
                  <View style={styles.iconContainer}>
                    <MaterialIcons name="location-on" size={20} color="#FFF" />
                  </View>

                  <View style={styles.locationInfo}>
                    <Text style={styles.locationName}>{location.name}</Text>
                    <Text style={styles.locationAddress} numberOfLines={2}>
                      {location.address}
                    </Text>
                  </View>

                  <MaterialIcons
                    name="chevron-right"
                    size={24}
                    color="#CCC"
                  />
                </TouchableOpacity>
              ))}
            </>
          ) : searchQuery.trim() ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="location-off" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No locations found</Text>
              <Text style={styles.emptySubText}>Try searching for a different place</Text>
            </View>
          ) : null}
        </ScrollView>
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  loadingContainer: {
    paddingVertical: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: theme.colors.primary,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});

export default SearchLocationsScreen;
