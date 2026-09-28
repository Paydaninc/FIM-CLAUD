import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getToken, setToken, setDemoMode } from '@/api/client';
import {
  getMe, getMyBusiness, getStripeStatus,
  User, Business, StripeStatus,
  login as apiLogin, signup as apiSignup, logout as apiLogout,
} from '@/api/endpoints';

interface AuthState {
  loading: boolean;
  user: User | null;
  business: Business | null;
  stripeStatus: StripeStatus | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  enterDemo: () => Promise<void>;
  refresh: () => Promise<void>;
  /** True once the user has chosen "Skip for now" on Stripe onboarding. Card, bank, link and Tap to Pay stay
   *  gated behind a "finish setup" prompt until Stripe is actually connected; only cash works either way. */
  stripeSkipped: boolean;
  skipStripeSetup: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [stripeSkipped, setStripeSkipped] = useState(false);

  /**
   * Re-fetches user/business/Stripe status. Called on app start (if a
   * token is already stored) and after every onboarding step completes, so
   * the navigator below always reflects the real current state rather than
   * something the app assumed locally.
   */
  const refresh = useCallback(async () => {
    try {
      const { user: me } = await getMe();
      setUser(me);

      try {
        const { business: biz } = await getMyBusiness();
        setBusiness(biz);
      } catch {
        setBusiness(null); // 404 = no business profile yet, not a real error
      }

      try {
        const status = await getStripeStatus();
        setStripeStatus(status);
      } catch {
        setStripeStatus(null);
      }

      const skipped = await SecureStore.getItemAsync('fim_stripe_skip');
      setStripeSkipped(skipped === 'true');
    } catch {
      // Token invalid/expired — treat as logged out.
      await setToken(null);
      setUser(null);
      setBusiness(null);
      setStripeStatus(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    await apiLogin(email, password);
    await refresh();
  };

  const signup = async (email: string, password: string) => {
    await apiSignup(email, password);
    await refresh();
  };

  const enterDemo = async () => {
    setDemoMode(true);
    await refresh();
  };

  const skipStripeSetup = async () => {
    await SecureStore.setItemAsync('fim_stripe_skip', 'true');
    setStripeSkipped(true);
  };

  const logout = async () => {
    setDemoMode(false);
    await SecureStore.deleteItemAsync('fim_stripe_skip').catch(() => {});
    await apiLogout();
    setUser(null);
    setBusiness(null);
    setStripeStatus(null);
    setStripeSkipped(false);
  };

  return (
    <AuthContext.Provider value={{ loading, user, business, stripeStatus, login, signup, logout, enterDemo, refresh, stripeSkipped, skipStripeSetup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
