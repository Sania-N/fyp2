// services/authService.js
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

// Helper function to get user-friendly error messages
const getErrorMessage = (errorCode) => {
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'Invalid email address';
    case 'auth/user-disabled':
      return 'This account has been disabled';
    case 'auth/user-not-found':
      return 'No account found with this email';
    case 'auth/wrong-password':
      return 'Incorrect password';
    case 'auth/invalid-credential':
      return 'Invalid email or password';
    case 'auth/email-already-in-use':
      return 'Email is already registered';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters';
    case 'auth/operation-not-allowed':
      return 'Account creation is disabled';
    case 'auth/too-many-requests':
      return 'Too many login attempts. Please try again later';
    default:
      return 'An error occurred. Please try again';
  }
};

// SIGN UP + CREATE FIRESTORE USER
export const registerUser = async (email, password, username) => {
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;

    await setDoc(doc(db, "users", uid), {
      uid,
      email,
      username,
      createdAt: new Date(),
    });

    return userCred.user;
  } catch (error) {
    const errorMessage = getErrorMessage(error.code);
    const customError = new Error(errorMessage);
    throw customError;
  }
};

// LOGIN + CHECK FIRESTORE USER EXISTS
export const loginUser = async (email, password) => {
  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;

    // If user doc does NOT exist → create it
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid,
        email,
        username: email.split("@")[0],
        createdAt: new Date(),
      });
    }

    return userCred.user;
  } catch (error) {
    const errorMessage = getErrorMessage(error.code);
    const customError = new Error(errorMessage);
    throw customError;
  }
};
