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
import { saveContact, getUserContacts, deleteContact, updateContact, setPriorityContact } from '../services/contactService';

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
  const [permissionGranted, setPermissionGranted] = useState(false);
  const navigation = useNavigation();

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    loadSavedContacts();
    checkContactPermission();
  }, []);

  const checkContactPermission = async () => {
    const { status } = await Contacts.getPermissionsAsync();
    setPermissionGranted(status === "granted");
  };

  const requestContactPermission = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      setPermissionGranted(status === "granted");
      
      if (status === "granted") {
        Alert.alert("✅ Permission Granted", "You can now import contacts from your phone!");
      } else {
        Alert.alert(
          "⚠️ Permission Denied",
          "Please enable contact access in your phone settings:\n\nSettings > Apps > SafetyApp > Permissions > Contacts",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error("Permission error:", error);
    }
  };

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
    <LinearGradient colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity
  style={styles.backButton}
  onPress={() => navigation.goBack()}
>
  <Ionicons name="arrow-back" size={24} color="#fff" />
  
</TouchableOpacity>

        <Text style={styles.title}>Trusted Contacts</Text>

        {!permissionGranted && (
          <TouchableOpacity style={styles.permissionBanner} onPress={requestContactPermission}>
            <Ionicons name="lock-closed" size={20} color="#ffb3c6" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.permissionTitle}>Grant Contact Access</Text>
              <Text style={styles.permissionText}>Enable to import contacts from your phone</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ffb3c6" />
          </TouchableOpacity>
        )}

        <FlatList
          data={savedContacts.sort((a, b) => (b.isPriority ? 1 : 0) - (a.isPriority ? 1 : 0))}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.contactCard, item.isPriority && styles.priorityContactCard]}>
              <View>
                <Text style={[styles.contactName, item.isPriority && { color: '#ffb3c6' }]}>{item.name}</Text>
                <Text style={[styles.contactPhone, item.isPriority && { color: '#ffb3c6' }]}>{item.phone}</Text>
                {item.isPriority && (
                  <Text style={{
                    color: "#ffb3c6",
                    fontSize: 12,
                    fontWeight: "700",
                    marginTop: 4
                  }}>
                    ★ Emergency Contact
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => openActionMenu(item)}>
                <Ionicons name="ellipsis-vertical" size={24} color={item.isPriority ? "#ffb3c6" : "#800020"} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={{ color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center', marginTop: 40, fontSize: 16 }}>No saved contacts yet.</Text>}
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
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={async () => {
                await setPriorityContact(uid, selectedContact.id);
                loadSavedContacts();
                setActionModalVisible(false);
                Alert.alert("Priority Set", `${selectedContact.name} is now your emergency contact`);
              }}
            >
              <Text style={styles.actionText}>Set as Emergency Contact</Text>
            </TouchableOpacity>
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
  container: { padding: 20, paddingBottom: 110 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 16, color: "#fff" },
  backButton: { marginBottom: 15 },
  contactCard: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(77, 20, 60, 0.4)", borderLeftWidth: 3, borderLeftColor: "rgba(255, 200, 220, 0.8)", padding: 16, borderRadius: 12, marginVertical: 8, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.1)" },
  priorityContactCard: { backgroundColor: "rgba(255, 200, 220, 0.15)", borderLeftColor: "#ffb3c6", borderLeftWidth: 4, borderColor: "rgba(255, 200, 220, 0.4)" },
  contactName: { fontSize: 16, fontWeight: "600", color: "#fff" },
  contactPhone: { color: "rgba(255, 255, 255, 0.6)", marginTop: 4 },
  permissionBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255, 200, 220, 0.15)", borderWidth: 1.5, borderColor: "rgba(255, 200, 220, 0.4)", borderRadius: 12, padding: 16, marginBottom: 16 },
  permissionTitle: { fontSize: 14, fontWeight: "700", color: "#ffb3c6" },
  permissionText: { fontSize: 12, color: "rgba(255, 200, 220, 0.8)", marginTop: 2 },
  addButton: { flexDirection: "row", backgroundColor: "rgba(255, 255, 255, 0.1)", padding: 14, borderRadius: 12, marginTop: 20, justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255, 200, 220, 0.5)" },
  addText: { color: "rgba(255, 200, 220, 1)", fontWeight: "700", marginLeft: 8 },
  phoneItem: { padding: 15, borderBottomWidth: 1, borderColor: "rgba(255, 255, 255, 0.1)", backgroundColor: "rgba(77, 20, 60, 0.3)" },
  phoneName: { fontSize: 16, fontWeight: "600", color: "#fff" },
  phoneNumber: { color: "rgba(255, 255, 255, 0.6)", marginTop: 4 },
  closeBtn: { backgroundColor: "rgba(255, 200, 220, 0.15)", padding: 15, alignItems: "center", margin: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255, 200, 220, 0.3)" },
  manualModal: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#2d1b2e" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 20, textAlign: "center", color: "#fff" },
  input: { borderWidth: 1, borderColor: "rgba(255, 200, 220, 0.3)", borderRadius: 10, padding: 14, marginBottom: 15, backgroundColor: "rgba(255, 255, 255, 0.08)", color: "#fff", placeholderTextColor: "rgba(255, 255, 255, 0.4)" },
  saveBtn: { backgroundColor: "rgba(255, 255, 255, 0.1)", padding: 15, alignItems: "center", borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255, 200, 220, 0.5)" },
  actionOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)" },
  actionModal: { width: 250, backgroundColor: "#2d1b2e", borderRadius: 15, padding: 20, borderWidth: 1, borderColor: "rgba(255, 200, 220, 0.2)" },
  actionBtn: { padding: 15, alignItems: "center", marginVertical: 8, borderRadius: 10, backgroundColor: "rgba(255, 255, 255, 0.1)", borderWidth: 1, borderColor: "rgba(255, 200, 220, 0.3)" },
  actionText: { fontSize: 16, fontWeight: "600", color: "rgba(255, 200, 220, 1)" },
});
