import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import theme from '../styles/theme';

export default function Header() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <Image source={require('../assets/logo.png')} style={styles.logo} />
      <View style={styles.icons}>
        <TouchableOpacity activeOpacity={0.7}>
          <Ionicons
            name="notifications-outline"
            size={26}
            color="#fff"
            style={{ marginRight: 15 }}
          />
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
});
