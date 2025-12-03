// useAuth.js
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase"; // make sure path matches

export const useAuth = () => {
  const [user, setUser] = useState(undefined); // undefined = still checking

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser || null);
    });

    return unsubscribe;
  }, []);

  return user; 
};
