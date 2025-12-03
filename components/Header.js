import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import theme from '../styles/theme';

export default function Header() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>I'M SAFE</Text>
      <View style={styles.icons}>
        <TouchableOpacity activeOpacity={0.7}>
          <Ionicons
            name="notifications-outline"
            size={26}
            color="#000"
            style={{ marginRight: 15 }}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('MenuScreen')}>
          <Ionicons name="menu-outline" size={30} color="#000" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40, // leaves proper space at top
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  logo: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
