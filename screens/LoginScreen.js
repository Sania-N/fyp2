import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../styles/theme';
import { loginUser } from "../services/authService";

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Email and password required");
      return;
    }

    setLoading(true);

    try {
      const user = await loginUser(email, password);
      console.log("Logged in as:", user.uid);

      Alert.alert("Success", "Logged in!");
      navigation.replace("MainTabs");

    } catch (error) {
      console.log("Login error:", error.message);
      Alert.alert("Error", error.message);
    }

    setLoading(false);
  };

  return (
    <LinearGradient 
      colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} 
      style={styles.container}
    >
      <View style={styles.cardContainer}>
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <Ionicons name="person-circle" size={80} color="rgba(255,255,255,0.3)" />
        </View>

        {/* Email Input */}
        <View style={styles.inputGroup}>
          <Ionicons name="mail-outline" size={20} color="rgba(255,255,255,0.6)" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Email ID"
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Password Input */}
        <View style={styles.inputGroup}>
          <Ionicons name="lock-closed-outline" size={20} color="rgba(255,255,255,0.6)" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={password}
            secureTextEntry
            onChangeText={setPassword}
          />
        </View>

        {/* Forgot Password */}
        <View style={styles.optionsContainer}>
          <TouchableOpacity onPress={() => Alert.alert("Info", "Password reset feature coming soon!")}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {/* Login Button */}
        <TouchableOpacity 
          style={styles.loginButton} 
          onPress={handleLogin} 
          disabled={loading}
        >
          <Text style={styles.loginButtonText}>
            {loading ? "LOGGING IN..." : "LOGIN"}
          </Text>
        </TouchableOpacity>

        {/* Sign Up Link */}
        <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
          <Text style={styles.linkText}>
            Don't have an account? <Text style={styles.linkHighlight}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardContainer: {
    width: '90%',
    maxWidth: 380,
    backgroundColor: 'rgba(77, 20, 60, 0.4)',
    borderRadius: 30,
    padding: 40,
    alignItems: 'center',
    backdropFilter: 'blur(10px)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  avatarContainer: {
    marginBottom: 30,
    opacity: 0.8,
  },
  inputGroup: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    paddingBottom: 12,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  optionsContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rememberText: {
    color: 'rgba(255, 255, 255, 0.7)',
    marginLeft: 8,
    fontSize: 14,
  },
  forgotText: {
    color: 'rgba(255, 200, 220, 0.8)',
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.5)',
    alignItems: 'center',
    marginBottom: 20,
  },
  loginButtonText: {
    color: 'rgba(255, 200, 220, 1)',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  linkText: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    fontSize: 14,
  },
  linkHighlight: {
    color: 'rgba(255, 200, 220, 1)',
    fontWeight: '600',
  },
});
