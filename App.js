// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
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
import MenuScreen from './screens/MenuScreen';
import ProfileScreen from './screens/ProfileScreen';
import RecordingsHistoryScreen from './screens/RecordingsHistoryScreen';
import ContactsScreen from './screens/ContactsScreen';

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
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          height: 75,
          paddingBottom: 8,
          borderTopLeftRadius: 25,
          borderTopRightRadius: 25,
          backgroundColor: 'white',
          position: 'absolute',
        },
        tabBarIcon: ({ color }) => {
          const icons = {
            "Track Me": "location-outline",
            "Record": "mic-outline",
            "SOS": "alert-circle-outline",
            "Chatbot": "chatbubbles-outline",
            "Routes": "map-outline",
          };
          return <Ionicons name={icons[route.name]} size={26} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Track Me" component={TrackMeScreen} />
      <Tab.Screen name="Record" component={RecordScreen} />
      <Tab.Screen name="SOS" component={SosScreen} />
      <Tab.Screen name="Chatbot" component={ChatbotScreen} />
      <Tab.Screen name="Routes" component={RoutesScreen} />
    </Tab.Navigator>
  );
}

// ---------------------------
// App Container
// ---------------------------
export default function App() {
  const user = useAuth();  // <--- Now everything depends on this

  if (user === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>

        {/* ------------------- */}
        {/* Authenticated Routes */}
        {/* ------------------- */}
        {user ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="MenuScreen" component={MenuScreen} />
            <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
            <Stack.Screen name="RecordingsHistory" component={RecordingsHistoryScreen} />
            <Stack.Screen name="ContactsScreen" component={ContactsScreen} />
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
    </NavigationContainer>
  );
}
