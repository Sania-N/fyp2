// SignupScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../styles/theme';
import { registerUser } from "../services/authService";

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password || !confirm) {
      Alert.alert("Error", "All fields are required");
      return;
    }

    if (password !== confirm) {
      Alert.alert("Error", "Passwords do not match");
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
    <LinearGradient colors={theme.gradient.background} style={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        secureTextEntry
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={confirm}
        secureTextEntry
        onChangeText={setConfirm}
      />

      <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Signing up..." : "Sign Up"}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Already have an account? Login</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 25, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', color: theme.colors.primary, marginBottom: 20 },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 15,
    borderRadius: 10,
    marginVertical: 15,
  },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 16 },
  link: { color: theme.colors.primary, textAlign: 'center', marginTop: 10 },
});
