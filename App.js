// App.js
import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from './useAuth';   // <-- Using your hook
import theme from './styles/theme';

// Screens
import OnboardingScreen from './screens/OnboardingScreen';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import TrackMeScreen from './screens/TrackMeScreen';
import RecordScreen from './screens/RecordScreen';
import SosScreen from './screens/SosScreen';
import ChatbotScreen from './screens/ChatbotScreen';
import RoutesScreen from './screens/RoutesScreen';
import SearchLocationsScreen from './screens/SearchLocationsScreen';
import LocationDetailScreen from './screens/LocationDetailScreen';
import MenuScreen from './screens/MenuScreen';
import ProfileScreen from './screens/ProfileScreen';
import RecordingsHistoryScreen from './screens/RecordingsHistoryScreen';
import ContactsScreen from './screens/ContactsScreen';
import AlertsScreen from './screens/AlertsScreen';
import TravelSessionWidget from './components/TravelSessionWidget';
import { TravelSessionProvider, useTravelSession } from './context/TravelSessionContext';
import { DangerAlertProvider } from './context/DangerAlertContext';
import DangerPopupModal from './components/DangerPopupModal';
import {
  attachNotificationListeners,
  detachNotificationListeners,
  initializeNotificationHandling,
  registerForPushNotifications,
} from './services/notificationsService';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ---------------------------
// Main Tabs
// ---------------------------
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: 'rgba(255, 200, 220, 1)',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.4)',
        tabBarStyle: {
          height: 75,
          paddingBottom: 8,
          borderTopLeftRadius: 35,
          borderTopRightRadius: 35,
          borderBottomLeftRadius: 35,
          borderBottomRightRadius: 35,
          backgroundColor: '#2d1b2e',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255, 200, 220, 0.2)',
          position: 'absolute',
          bottom: 12,
          left: 12,
          right: 12,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowOffset: { width: 0, height: 12 },
          shadowRadius: 20,
          elevation: 15,
          borderWidth: 1,
          borderColor: 'rgba(255, 200, 220, 0.15)',
        },
        tabBarIcon: ({ color }) => {
          const icons = {
            "Track Me": "location-outline",
            "Record": "mic-outline",
            "SOS": "alert-circle-outline",
            "Routes": "map-outline",
          };
          return <Ionicons name={icons[route.name]} size={26} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Track Me" component={TrackMeScreen} />
      <Tab.Screen name="Record" component={RecordScreen} />
      <Tab.Screen name="SOS" component={SosScreen} />
      <Tab.Screen name="Routes" component={RoutesScreen} />
    </Tab.Navigator>
  );
}

// ---------------------------
// App Container
// ---------------------------
function AppNavigator() {
  const user = useAuth();  // <--- Now everything depends on this
  const navigationRef = useNavigationContainerRef();
  const [currentRouteName, setCurrentRouteName] = useState(null);
  const { isTraveling, destination } = useTravelSession();

  const handleNavigateToActiveTrip = useCallback(() => {
    if (!destination) return;

    navigationRef.navigate('LocationDetail', {
      location: destination,
    });
  }, [destination, navigationRef]);

  const handleNavigationStateChange = useCallback(() => {
    const currentRoute = navigationRef.getCurrentRoute();
    setCurrentRouteName(currentRoute?.name || null);
  }, [navigationRef]);

  if (user === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={handleNavigationStateChange}
      onStateChange={handleNavigationStateChange}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>

        {/* ------------------- */}
        {/* Authenticated Routes */}
        {/* ------------------- */}
        {user ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="SearchLocations" component={SearchLocationsScreen} />
            <Stack.Screen name="LocationDetail" component={LocationDetailScreen} />
            <Stack.Screen name="ChatbotScreen" component={ChatbotScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="MenuScreen" component={MenuScreen} />
            <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
            <Stack.Screen name="RecordingsHistory" component={RecordingsHistoryScreen} />
            <Stack.Screen name="ContactsScreen" component={ContactsScreen} />
            <Stack.Screen name="AlertsScreen" component={AlertsScreen} />
          </>
        ) : (
          <>
            {/* ---------------------- */}
            {/* Public (Unauthenticated) */}
            {/* ---------------------- */}
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        )}

      </Stack.Navigator>

      {isTraveling && currentRouteName !== 'LocationDetail' && (
        <TravelSessionWidget onPress={handleNavigateToActiveTrip} />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    initializeNotificationHandling();

    registerForPushNotifications().catch((error) => {
      console.error('Push notification registration failed:', error);
    });

    attachNotificationListeners({
      onNotificationReceived: (notification) => {
        console.log('Foreground notification received:', notification?.request?.content?.data || {});
      },
      onNotificationResponse: (response) => {
        console.log('Notification opened from background/quit:', response?.notification?.request?.content?.data || {});
      },
    });

    return () => {
      detachNotificationListeners();
    };
  }, []);

  return (
    <TravelSessionProvider>
      <DangerAlertProvider>
        <AppNavigator />
        <DangerPopupModal />
      </DangerAlertProvider>
    </TravelSessionProvider>
  );
}
