import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import theme from '../styles/theme';
import { getGeoFenceAlertHistory, getGeoFenceAlertStatus } from '../services/geoFenceService';

export default function Header() {
  const navigation = useNavigation();
  const [geoFenceAlertState, setGeoFenceAlertState] = useState({
    active: false,
    message: 'Warning: You are entering a high-risk area.',
  });
  const [alertCount, setAlertCount] = useState(0);

  const refreshGeoFenceAlertState = useCallback(async () => {
    const [nextState, history] = await Promise.all([
      getGeoFenceAlertStatus(),
      getGeoFenceAlertHistory(),
    ]);
    setGeoFenceAlertState(nextState);
    setAlertCount(Array.isArray(history) ? history.length : 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshGeoFenceAlertState();
    }, [refreshGeoFenceAlertState])
  );

  useEffect(() => {
    refreshGeoFenceAlertState();

    const intervalId = setInterval(refreshGeoFenceAlertState, 5000);
    return () => {
      clearInterval(intervalId);
    };
  }, [refreshGeoFenceAlertState]);

  const handleAlertIconPress = () => {
    navigation.navigate('AlertsScreen');
  };

  return (
    <View style={styles.container}>
      <Image source={require('../assets/logo.png')} style={styles.logo} />
      <View style={styles.icons}>
        <TouchableOpacity activeOpacity={0.7} onPress={handleAlertIconPress}>
          <View style={styles.alertIconWrapper}>
          <Ionicons
            name="notifications-outline"
            size={26}
            color="#fff"
            style={{ marginRight: 15 }}
          />
            {(geoFenceAlertState.active || alertCount > 0) && <View style={styles.alertBadge} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('MenuScreen')}>
          <Ionicons name="menu-outline" size={30} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Platform.OS === 'ios' ? 28 : 22,
    paddingHorizontal: 20,
    paddingBottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  logo: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
  },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  alertIconWrapper: {
    position: 'relative',
  },
  alertBadge: {
    position: 'absolute',
    top: 1,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
});
