// services/contactService.js
import { db } from "../firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, query, setDoc } from "firebase/firestore";

// ➤ Add New Contact
export async function addContactToFirestore(userUid, contact) {
  return await addDoc(collection(db, "users", userUid, "contacts"), contact);
}

// ➤ Update Existing Contact
export async function updateContact(userUid, contactId, contact) {
  const contactRef = doc(db, "users", userUid, "contacts", contactId);
  return await setDoc(contactRef, contact, { merge: true }); // merge=true to update only provided fields
}

// ➤ Fetch All Contacts
export async function getContacts(userUid) {
  const snapshot = await getDocs(collection(db, "users", userUid, "contacts"));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ➤ Fetch User Contacts (alternative helper)
export const getUserContacts = async (uid) => {
  const q = query(collection(db, "users", uid, "contacts"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

// ➤ Delete Contact
export async function deleteContact(userUid, contactId) {
  await deleteDoc(doc(db, "users", userUid, "contacts", contactId));
}

// ➤ Save Contact (alias to add)
export const saveContact = async (uid, contact) => {
  await addDoc(collection(db, "users", uid, "contacts"), contact);
};
