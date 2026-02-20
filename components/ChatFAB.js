import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import theme from '../styles/theme';

export default function ChatFAB() {
  const navigation = useNavigation();

  const handlePress = () => {
    navigation.navigate('ChatbotScreen');
  };

  return (
    <TouchableOpacity 
      style={styles.fab} 
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Ionicons name="chatbubbles" size={28} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 65,
    height: 65,
    borderRadius: 32,
    backgroundColor: '#2d1b2e',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 15,
    zIndex: 999,
    borderWidth: 2,
    borderColor: 'rgba(255, 200, 220, 0.5)',
  },
});
