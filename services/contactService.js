// services/contactService.js
import { db } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  setDoc,
  updateDoc
} from "firebase/firestore";

/* ================================
   ADD NEW CONTACT
================================ */
export async function addContactToFirestore(userUid, contact) {
  return await addDoc(
    collection(db, "users", userUid, "contacts"),
    {
      ...contact,
      isPriority: false, // default
    }
  );
}

/* ================================
   UPDATE EXISTING CONTACT
================================ */
export async function updateContact(userUid, contactId, contact) {
  const contactRef = doc(db, "users", userUid, "contacts", contactId);
  return await setDoc(contactRef, contact, { merge: true });
}

/* ================================
   FETCH ALL CONTACTS
================================ */
export async function getContacts(userUid) {
  const snapshot = await getDocs(
    collection(db, "users", userUid, "contacts")
  );

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/* ================================
   FETCH USER CONTACTS (USED IN UI)
================================ */
export const getUserContacts = async (uid) => {
  const q = query(collection(db, "users", uid, "contacts"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

/* ================================
   DELETE CONTACT
================================ */
export async function deleteContact(userUid, contactId) {
  await deleteDoc(
    doc(db, "users", userUid, "contacts", contactId)
  );
}

/* ================================
   SAVE CONTACT (ALIAS)
================================ */
export const saveContact = async (uid, contact) => {
  await addDoc(
    collection(db, "users", uid, "contacts"),
    {
      ...contact,
      isPriority: false, // default
    }
  );
};

/* ================================
   ⭐ SET PRIORITY EMERGENCY CONTACT
   ONLY ONE CAN BE TRUE
================================ */
export const setPriorityContact = async (uid, contactId) => {
  const contactsRef = collection(db, "users", uid, "contacts");
  const snapshot = await getDocs(contactsRef);

  // 1️⃣ Remove priority from ALL contacts
  for (const docSnap of snapshot.docs) {
    await updateDoc(docSnap.ref, { isPriority: false });
  }

  // 2️⃣ Set selected contact as priority
  const selectedRef = doc(db, "users", uid, "contacts", contactId);
  await updateDoc(selectedRef, { isPriority: true });
};
