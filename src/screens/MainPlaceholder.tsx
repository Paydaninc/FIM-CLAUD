import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Form';
import { colors, spacing, typography } from '@/theme';

/**
 * PLACEHOLDER — Dashboard, Invoice list/create/edit/detail, Client list,
 * and Settings tabs are built in upcoming mobile phases. This confirms the
 * full auth → onboarding → "main app" state machine works end-to-end
 * before those screens exist.
 */
export default function MainPlaceholder() {
  const { user, business, logout } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>You're all set, {business?.business_name}</Text>
      <Text style={styles.body}>
        Logged in as {user?.email}. Stripe is connected and ready for payments.{'\n\n'}
        Dashboard, invoices, clients, and settings screens are next.
      </Text>
      <Button title="Log out" onPress={logout} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'center' },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
});
