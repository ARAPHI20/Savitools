'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AuthUser,
  connectFluxa,
  getCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  refreshSession,
  register as apiRegister,
  verifyEmail as apiVerifyEmail,
} from './api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  connectFluxaAccount: (apiKey: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const refreshed = await refreshSession();
      if (refreshed.user) {
        setUser(refreshed.user);
        return;
      }
    } catch {
      // Fall through to /auth/me when refresh token is missing or invalid.
    }

    try {
      const current = await getCurrentUser();
      setUser(current.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    setUser(result.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    // POST /auth/register now sends a verification email and returns { userId, message }.
    // The user is NOT logged in until they click the link. We return the message so the
    // caller can display it to the user.
    await apiRegister(email, password);
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    const result = await apiVerifyEmail(token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const connectFluxaAccount = useCallback(async (apiKey: string) => {
    const result = await connectFluxa(apiKey);
    setUser(result.user);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      connectFluxaAccount,
      verifyEmail,
      refreshUser,
    }),
    [user, loading, login, register, logout, connectFluxaAccount, verifyEmail, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
