import React, { useEffect, useState } from 'react';
import { 
  View, Text, Image, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../styles/theme';
import { auth } from '../firebase';
import { updateProfile } from "firebase/auth";
import { getUser, updateUsername } from "../services/userService"; // import service

export default function ProfileScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  // 🔥 Fetch name from Firestore users → NOT auth.displayName
  useEffect(() => {
    async function load() {
      const data = await getUser();
      if (data) {
        setUsername(data.username);
        setEmail(data.email);
      }
      setLoading(false);
    }
    load();
  }, []);

  // 🔥 Save username to Firestore
  const handleSave = async () => {
    if (!username.trim()) return Alert.alert("Error", "Username cannot be empty!");

    setLoading(true);
    try {
      await updateUsername(username.trim()); // update Firestore username

      // OPTIONAL update Firebase displayName
      await updateProfile(auth.currentUser, { displayName: username.trim() });

      setEditing(false);
      Alert.alert("Success", "Profile updated!");

    } catch (err) {
      Alert.alert("Error updating profile");
      console.log(err);
    }
    setLoading(false);
  };

  if (loading) return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.colors.primary}/>
    </View>
  );

  return (
    <View style={styles.container}>

      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back-outline" size={28} color={theme.colors.primary}/>
      </TouchableOpacity>

      <Image 
        source={{ uri:'https://cdn-icons-png.flaticon.com/512/847/847969.png' }} 
        style={styles.avatar}
      />

      {/* Username */}
      {editing ? (
        <TextInput 
          style={styles.input}
          value={username}
          onChangeText={setUsername}
        />
      ) : (
        <Text style={styles.name}>{username}</Text>
      )}

      <Text style={styles.email}>{email}</Text>

      {/* EDIT → SAVE */}
      <TouchableOpacity style={styles.button} onPress={editing ? handleSave : () => setEditing(true)}>
        <Text style={styles.buttonText}>{editing ? "Save" : "Edit Profile"}</Text>
      </TouchableOpacity>

      {/* LOGOUT */}
      <TouchableOpacity 
        style={[styles.button, { backgroundColor:'#ddd' }]}
        onPress={async() => { await auth.signOut(); navigation.replace("Login"); }}
      >
        <Text style={[styles.buttonText,{color:'#000'}]}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},
  backButton:{position:'absolute',top:20,left:20,padding:10},
  avatar:{width:120,height:120,borderRadius:60,marginBottom:15},
  name:{fontSize:22,fontWeight:'700',marginBottom:5},
  email:{color:'gray',marginBottom:20},
  input:{backgroundColor:'#f1f1f1',padding:12,width:'75%',fontSize:17,borderRadius:10,textAlign:'center'},
  button:{backgroundColor:theme.colors.primary,padding:12,borderRadius:10,marginTop:15,width:'60%'},
  buttonText:{textAlign:'center',fontSize:16,color:'#fff',fontWeight:'600'}
});
