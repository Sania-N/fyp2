// App.js
import React, { Component, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from './useAuth';   // <-- Using your hook
import { API_BASE_URL } from './api';
import app, { auth as firebaseAuth, db as firebaseDb } from './firebase';
import theme from './styles/theme';

// Screens
import OnboardingScreen from './screens/OnboardingScreen';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import HomeScreen from './screens/HomeScreen';
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
import RealtimeMonitoringScreen from './screens/RealtimeMonitoringScreen';
import TravelSessionWidget from './components/TravelSessionWidget';
import { TravelSessionProvider, useTravelSession } from './context/TravelSessionContext';
import { DangerAlertProvider } from './context/DangerAlertContext';
import { DeviceConnectionProvider } from './context/DeviceConnectionContext';
import { RealtimeThreatProvider } from './context/RealtimeThreatContext';
import DangerPopupModal from './components/DangerPopupModal';
import {
  attachNotificationListeners,
  detachNotificationListeners,
  initializeNotificationHandling,
  registerForPushNotifications,
  supportsRemotePushNotifications,
} from './services/notificationsService';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

console.log('[App] Module loaded');
console.log('[App] API base URL:', API_BASE_URL);
console.log('[App] Firebase app initialized:', Boolean(app));
console.log('[App] Firebase auth/db ready:', Boolean(firebaseAuth), Boolean(firebaseDb));

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[App] Unhandled render error:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
            App failed to render
          </Text>
          <Text style={{ textAlign: 'center', color: '#666' }}>
            Check the console logs for the startup error.
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#ff1493',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: {
          position: 'absolute',
          left: 36,
          right: 36,
          bottom: 22,
          backgroundColor: '#1a1a1a',
          borderRadius: 18,
          paddingBottom: 8,
          paddingTop: 8,
          height: 70,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.12)',
          elevation: 12,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowOffset: { width: 0, height: 8 },
          shadowRadius: 14,
          overflow: 'visible',
        },
        tabBarIcon: ({ color }) => {
          const icons = {
            "Home": "home-outline",
            "Track Me": "location-outline",
            "Record": "mic-outline",
            "SOS": "alert-circle-outline",
            "Routes": "map-outline",
          };
          return <Ionicons name={icons[route.name]} size={28} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
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
            <Stack.Screen
              name="RealtimeMonitoring"
              component={RealtimeMonitoringScreen}
              options={{ headerShown: false }}
            />
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
  const [startupError, setStartupError] = useState(null);
  const user = useAuth();

  useEffect(() => {
    console.log('[App] Starting notification bootstrap');

    try {
      initializeNotificationHandling();

      if (supportsRemotePushNotifications()) {
        registerForPushNotifications().catch((error) => {
          console.error('[App] Push notification registration failed:', error);
        });
      } else {
        console.info('[App] Remote push registration skipped in this runtime.');
      }

      attachNotificationListeners({
        onNotificationReceived: (notification) => {
          console.log('[App] Foreground notification received:', notification?.request?.content?.data || {});
        },
        onNotificationResponse: (response) => {
          console.log('[App] Notification opened from background/quit:', response?.notification?.request?.content?.data || {});
        },
      });
    } catch (error) {
      console.error('[App] Startup initialization failed:', error);
      setStartupError(error);
    }

    return () => {
      try {
        detachNotificationListeners();
      } catch (error) {
        console.warn('[App] Failed to detach notification listeners:', error);
      }
    };
  }, []);

  if (startupError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
          Startup error
        </Text>
        <Text style={{ textAlign: 'center', color: '#666' }}>
          The app could not finish initializing. Check logs for details.
        </Text>
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <TravelSessionProvider>
        <DeviceConnectionProvider>
          <DangerAlertProvider>
            <RealtimeThreatProvider userUid={user?.uid}>
              <AppNavigator />
              <DangerPopupModal />
            </RealtimeThreatProvider>
          </DangerAlertProvider>
        </DeviceConnectionProvider>
      </TravelSessionProvider>
    </AppErrorBoundary>
  );
}
