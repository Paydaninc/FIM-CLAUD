import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/theme';

import LoginScreen from '@/screens/auth/LoginScreen';
import SignupScreen from '@/screens/auth/SignupScreen';
import BusinessProfileScreen from '@/screens/onboarding/BusinessProfileScreen';
import StripeConnectScreen from '@/screens/onboarding/StripeConnectScreen';
import MainStack from '@/navigation/MainTabs';

const Stack = createNativeStackNavigator();

const linking = { prefixes: ['freeinvoicemaker://'] };

/**
 * The entire "which screen should be showing" decision is a pure function
 * of auth state — no screen ever manually navigates between these top-level
 * stages. Complete a step, call refresh(), and this re-renders to the next
 * one automatically. Mirrors your spec's exact onboarding order.
 */
export default function RootNavigator() {
  const { loading, user, business, stripeStatus } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  let content;
  if (!user) {
    content = (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
      </Stack.Navigator>
    );
  } else if (!business) {
    content = (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
      </Stack.Navigator>
    );
  } else if (!stripeStatus?.readyForPayments) {
    content = (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="StripeConnect" component={StripeConnectScreen} />
      </Stack.Navigator>
    );
  } else {
    content = (
      <MainStack />
    );
  }

  return <NavigationContainer linking={linking}>{content}</NavigationContainer>;
}
