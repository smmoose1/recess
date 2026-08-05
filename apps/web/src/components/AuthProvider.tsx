"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { getClientAuth } from "@/lib/firebase/client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getClientAuth();
    const unsub = onAuthStateChanged(auth, async (next) => {
      if (!next) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error("Anonymous sign-in failed", err);
          setLoading(false);
        }
        return;
      }
      setUser(next);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
