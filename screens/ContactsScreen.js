// ContactsScreen.js
import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View, Text, FlatList, TouchableOpacity, Modal, StyleSheet, SafeAreaView, Alert, TextInput
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import theme from '../styles/theme';
import { auth } from '../firebase';
import { saveContact, getUserContacts, deleteContact, updateContact } from '../services/contactService';

export default function ContactsScreen() {
  const [phoneContacts, setPhoneContacts] = useState([]);
  const [savedContacts, setSavedContacts] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [editContactId, setEditContactId] = useState(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const navigation = useNavigation();

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    loadSavedContacts();
  }, []);

  const loadSavedContacts = async () => {
    const contacts = await getUserContacts(uid);
    setSavedContacts(contacts);
  };

  const loadPhoneContacts = async () => {
    try {
      const { status, canAskAgain } = await Contacts.requestPermissionsAsync();
      
      if (status !== "granted") {
        if (canAskAgain) {
          Alert.alert(
            "Permission Required",
            "SafetyApp needs access to your contacts to add them. Please allow full access in settings.",
            [
              { text: "Cancel", style: "cancel" },
              { 
                text: "Allow", 
                onPress: async () => {
                  // Trigger permission request again
                  const retryStatus = await Contacts.requestPermissionsAsync();
                  if (retryStatus.status === "granted") {
                    fetchContacts();
                  }
                }
              }
            ]
          );
        } else {
          Alert.alert(
            "Permission Denied",
            "Please enable contact access in your phone settings to add contacts.",
            [{ text: "OK", style: "default" }]
          );
        }
        return;
      }

      fetchContacts();
    } catch (error) {
      console.error('Permission error:', error);
      Alert.alert("Error", "Failed to request permission");
    }
  };

  const fetchContacts = async () => {
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
        ],
      });

      if (!data || data.length === 0) {
        Alert.alert("No Contacts", "No contacts found on your device.");
        return;
      }

      const contactsWithPhone = data.filter(c => c.phoneNumbers && c.phoneNumbers.length > 0);
      
      if (contactsWithPhone.length === 0) {
        Alert.alert("No Contacts", "No contacts with phone numbers found.");
        return;
      }

      setPhoneContacts(contactsWithPhone);
      setModalVisible(true);
      console.log(`Loaded ${contactsWithPhone.length} contacts with phone numbers`);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      Alert.alert("Error", "Failed to load contacts");
    }
  };

  const addContactToFirestore = async (contact) => {
  if (editContactId) {
    // Edit Contact
    await updateContact(uid, editContactId, contact); // Use service function
    Alert.alert("Contact Updated", `${contact.name} updated successfully`);
    setEditContactId(null);
  } else {
    await saveContact(uid, contact); // Add new contact
    Alert.alert("Contact Saved", `${contact.name} added to trusted list`);
  }

  loadSavedContacts();
  setModalVisible(false);
  setManualModalVisible(false);
  setManualName('');
  setManualPhone('');
};


  const handleManualSubmit = () => {
    if (!manualName || !manualPhone) {
      return Alert.alert("Error", "Please enter both name and phone number");
    }
    addContactToFirestore({
      name: manualName,
      phone: manualPhone,
      timestamp: Date.now(),
    });
  };

  // ➤ Open action menu for Edit/Delete
  const openActionMenu = (contact) => {
    setSelectedContact(contact);
    setActionModalVisible(true);
  };

  // ➤ Delete Contact
  const handleDelete = async () => {
    Alert.alert("Delete Contact", "Are you sure you want to delete this contact?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteContact(uid, selectedContact.id);
          loadSavedContacts();
          setActionModalVisible(false);
        }
      }
    ]);
  };

  // ➤ Edit Contact
  const handleEdit = () => {
    setManualName(selectedContact.name);
    setManualPhone(selectedContact.phone);
    setEditContactId(selectedContact.id);
    setManualModalVisible(true);
    setActionModalVisible(false);
  };

  return (
    <LinearGradient colors={theme.gradient.background} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity
  style={styles.backButton}
  onPress={() => navigation.goBack()}
>
  <Ionicons name="arrow-back" size={24} color="#800020" />
  
</TouchableOpacity>

        <Text style={styles.title}>Trusted Contacts</Text>

        <FlatList
          data={savedContacts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.contactCard}>
              <View>
                <Text style={styles.contactName}>{item.name}</Text>
                <Text style={styles.contactPhone}>{item.phone}</Text>
              </View>
              <TouchableOpacity onPress={() => openActionMenu(item)}>
                <Ionicons name="ellipsis-vertical" size={24} color="#800020" />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text>No saved contacts yet.</Text>}
        />

        <TouchableOpacity style={styles.addButton} onPress={() => Alert.alert(
          "Add Contact",
          "Choose how to add a contact",
          [
            { text: "Import from Phone", onPress: loadPhoneContacts },
            { text: "Enter Manually", onPress: () => setManualModalVisible(true) },
            { text: "Cancel", style: "cancel" }
          ]
        )}>
          <Ionicons name="person-add" size={22} color="#fff" />
          <Text style={styles.addText}>Add Contact</Text>
        </TouchableOpacity>
      </View>

      {/* Phone Contacts Modal */}
      <Modal visible={modalVisible} animationType="slide">
        <SafeAreaView style={{ flex: 1 }}>
          <FlatList
            data={phoneContacts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.phoneItem}
                onPress={() => addContactToFirestore({
                  name: item.name,
                  phone: item.phoneNumbers[0]?.number || "N/A",
                  timestamp: Date.now(),
                })}
              >
                <Text style={styles.phoneName}>{item.name}</Text>
                <Text style={styles.phoneNumber}>{item.phoneNumbers[0]?.number}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
            <Text style={{ color: "#fff" }}>Close</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* Manual Entry Modal */}
      <Modal visible={manualModalVisible} animationType="slide">
        <SafeAreaView style={styles.manualModal}>
          <Text style={styles.modalTitle}>{editContactId ? "Edit Contact" : "Add Contact Manually"}</Text>
          <TextInput
            placeholder="Name"
            value={manualName}
            onChangeText={setManualName}
            style={styles.input}
          />
          <TextInput
            placeholder="Phone Number"
            value={manualPhone}
            onChangeText={setManualPhone}
            keyboardType="phone-pad"
            style={styles.input}
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleManualSubmit}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={() => {
            setManualModalVisible(false);
            setEditContactId(null);
          }}>
            <Text style={{ color: "#fff" }}>Cancel</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* Action Modal: Edit/Delete */}
      <Modal visible={actionModalVisible} transparent animationType="fade">
        <View style={styles.actionOverlay}>
          <View style={styles.actionModal}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleEdit}>
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "red" }]} onPress={handleDelete}>
              <Text style={[styles.actionText, { color: "#fff" }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ccc" }]} onPress={() => setActionModalVisible(false)}>
              <Text style={styles.actionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: "transparent" },
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 10, color: "#800020" },
  backButton: { marginBottom: 15 },
  contactCard: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#FDF5F7", borderLeftWidth: 4, borderLeftColor: "#800020", padding: 12, borderRadius: 10, marginVertical: 5 },
  contactName: { fontSize: 16, fontWeight: "600", color: "#333" },
  contactPhone: { color: "#666" },
  addButton: { flexDirection: "row", backgroundColor: "#800020", padding: 12, borderRadius: 10, marginTop: 15, justifyContent: "center" },
  addText: { color: "#fff", fontWeight: "700", marginLeft: 5 },
  phoneItem: { padding: 15, borderBottomWidth: 1, borderColor: "#E8D5D9" },
  phoneName: { fontSize: 16, fontWeight: "600", color: "#333" },
  phoneNumber: { color: "#666" },
  closeBtn: { backgroundColor: "#800020", padding: 15, alignItems: "center", margin: 10, borderRadius: 8 },
  manualModal: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#fff" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 20, textAlign: "center", color: "#800020" },
  input: { borderWidth: 1, borderColor: "#E8D5D9", borderRadius: 8, padding: 12, marginBottom: 15, backgroundColor: "#FDF5F7" },
  saveBtn: { backgroundColor: "#800020", padding: 15, alignItems: "center", borderRadius: 8, marginBottom: 10 },
  actionOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  actionModal: { width: 250, backgroundColor: "#fff", borderRadius: 10, padding: 20 },
  actionBtn: { padding: 15, alignItems: "center", marginVertical: 5, borderRadius: 8, backgroundColor: "#F9E8EB" },
  actionText: { fontSize: 16, fontWeight: "600", color: "#333" },
});
