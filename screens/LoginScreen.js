import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
    <LinearGradient colors={theme.gradient.background} style={styles.container}>
      <Text style={styles.title}>Welcome Back </Text>

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

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Logging in..." : "Login"}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
        <Text style={styles.link}>Don't have an account? Sign up</Text>
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
