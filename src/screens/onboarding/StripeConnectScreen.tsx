import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@/context/AuthContext';
import { startExpressOnboarding, startStandardOnboarding } from '@/api/endpoints';
import { Button, ErrorText } from '@/components/Form';
import { Card, Banner, errorMessage } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

const RETURN_URL = 'freeinvoicemaker://stripe-connect-return';

/** Onboarding step 3: connect Stripe — new account (Express) or existing account (Standard OAuth). */
export default function StripeConnectScreen({ navigation }: any) {
  const { business, stripeStatus, refresh, logout, skipStripeSetup } = useAuth();
  // Reached two ways: as the forced onboarding step (no back stack — offers Skip/Log out) or
  // pushed later from Settings or a payment-method prompt (has a back stack — just a back arrow).
  const embedded = navigation?.canGoBack?.() ?? false;
  const [busy, setBusy] = useState<'express' | 'standard' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'express' | 'standard') => {
    setError(null);
    setBusy(kind);
    try {
      const { onboardingUrl } = kind === 'express' ? await startExpressOnboarding() : await startStandardOnboarding();
      await WebBrowser.openAuthSessionAsync(onboardingUrl, RETURN_URL);
      // Whether the user finished or bailed, re-check the real account status.
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const started = stripeStatus?.connected && !stripeStatus.readyForPayments;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect Stripe</Text>
      <Text style={styles.body}>
        {business?.business_name} needs a Stripe account to accept card and bank payments. Payouts go straight to your bank.
        {!embedded && ' You can skip this for now — cash still works, and you\'ll be asked again the first time you try card, bank, link, or Tap to Pay.'}
      </Text>

      {started && (
        <Banner tone="warning" text="Your Stripe account is created but not finished yet. Continue onboarding to start accepting payments." />
      )}

      <Card>
        <Text style={styles.cardTitle}>I don't have a Stripe account</Text>
        <Text style={styles.cardBody}>We'll create one for you — takes a few minutes.</Text>
        <Button title={started ? 'Continue Stripe onboarding' : 'Create a new Stripe account'} onPress={() => run('express')} loading={busy === 'express'} disabled={busy !== null} />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>I already have Stripe</Text>
        <Text style={styles.cardBody}>Log in and connect your existing account.</Text>
        <Button title="Connect my existing account" variant="secondary" onPress={() => run('standard')} loading={busy === 'standard'} disabled={busy !== null} />
      </Card>

      <ErrorText message={error} />
      <Button title="Check status again" variant="secondary" onPress={refresh} disabled={busy !== null} />
      {embedded ? (
        <Button title="Done for now" variant="secondary" onPress={() => navigation.goBack()} disabled={busy !== null} />
      ) : (
        <>
          <Button
            title="Skip for now"
            variant="secondary"
            onPress={skipStripeSetup}
            disabled={busy !== null}
          />
          <Button title="Log out" variant="secondary" onPress={logout} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'center' },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  cardTitle: { ...typography.h2, color: colors.text, marginBottom: 4 },
  cardBody: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
});
