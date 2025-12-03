import { db, auth } from "../firebase";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";

export const getUser = async () => {
  const user = auth.currentUser;
  if (!user) return null;

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
};

export const updateUsername = async (newName) => {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = doc(db, "users", user.uid);
  return updateDoc(userRef, { username: newName });
};

// realtime listener -> menu updates LIVE
export const listenUser = (setState) => {
  const user = auth.currentUser;
  if (!user) return;

  const docRef = doc(db, "users", user.uid);
  return onSnapshot(docRef, (snap) => setState(snap.data()));
};
