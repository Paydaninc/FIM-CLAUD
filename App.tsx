import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider } from '@/context/AuthContext';
import RootNavigator from '@/navigation/RootNavigator';

// The Stripe SDK needs *a* publishable key at provider init time, but each
// payment screen re-configures it per-request with the connected account's
// key/id from the backend (see the payment endpoints in api/endpoints.ts) —
// direct charges must be attributed to the connected account, not the
// platform. This top-level key is only a safe default before that happens.
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

export default function App() {
  return (
    <SafeAreaProvider>
      <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </StripeProvider>
    </SafeAreaProvider>
  );
}
