// SignupScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../styles/theme';
import { registerUser } from "../services/authService";

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const handleSignup = async () => {
    if (!email || !password || !confirm) {
      Alert.alert("Error", "All fields are required");
      return;
    }

    if (password !== confirm) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    if (!agreeTerms) {
      Alert.alert("Error", "Please agree to terms and conditions");
      return;
    }

    setLoading(true);

    try {
      const username = email.split("@")[0]; // simple username

      const user = await registerUser(email, password, username);
      console.log("User registered:", user.uid);

      Alert.alert("Success", "Account created!");
      navigation.replace("MainTabs");

    } catch (error) {
      console.log("Signup error:", error.message);
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
          <Ionicons name="person-add-outline" size={80} color="rgba(255,255,255,0.3)" />
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

        {/* Confirm Password Input */}
        <View style={styles.inputGroup}>
          <Ionicons name="lock-closed-outline" size={20} color="rgba(255,255,255,0.6)" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={confirm}
            secureTextEntry
            onChangeText={setConfirm}
          />
        </View>

        {/* Terms & Conditions */}
        <TouchableOpacity 
          style={styles.checkboxContainer}
          onPress={() => setAgreeTerms(!agreeTerms)}
        >
          <Ionicons 
            name={agreeTerms ? "checkbox" : "checkbox-outline"} 
            size={18} 
            color="rgba(255,255,255,0.7)" 
          />
          <Text style={styles.termsText}>I agree to Terms & Conditions</Text>
        </TouchableOpacity>

        {/* Sign Up Button */}
        <TouchableOpacity 
          style={styles.signupButton} 
          onPress={handleSignup} 
          disabled={loading}
        >
          <Text style={styles.signupButtonText}>
            {loading ? "SIGNING UP..." : "SIGN UP"}
          </Text>
        </TouchableOpacity>

        {/* Login Link */}
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkHighlight}>Login</Text>
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
  checkboxContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  termsText: {
    color: 'rgba(255, 255, 255, 0.7)',
    marginLeft: 8,
    fontSize: 14,
  },
  signupButton: {
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
  signupButtonText: {
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
