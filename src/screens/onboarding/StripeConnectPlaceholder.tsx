import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Form';
import { colors, spacing, typography } from '@/theme';

/**
 * PLACEHOLDER — real "Create new Stripe account" / "Connect existing
 * account" screen comes in the next mobile phase (it needs an in-app
 * browser flow for Account Links / OAuth, plus deep-link handling for the
 * return/callback — see App.tsx's linking config, already wired for it).
 * This exists so the navigator has somewhere to land after the business
 * profile step, and so the app is demoable end-to-end today.
 */
export default function StripeConnectPlaceholder() {
  const { business, refresh } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect Stripe</Text>
      <Text style={styles.body}>
        {business?.business_name}'s profile is set up. Next: connecting Stripe so you can
        accept payments — this screen (Create new account / Connect existing account, with the
        hosted onboarding flow) is built in the next phase.
      </Text>
      <Button title="Refresh status" onPress={refresh} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'center' },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
});
