import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { isDemoMode } from '@/api/client';
import { Button } from '@/components/Form';
import ServerSettings from '@/components/ServerSettings';
import { Card, Banner, Row, SectionTitle } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function SettingsScreen() {
  const { user, business, stripeStatus, refresh, logout } = useAuth();
  const [checking, setChecking] = useState(false);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
      {isDemoMode() && <Banner tone="info" text="You're in demo mode — everything here is sample data and nothing is saved to a server." />}

      <SectionTitle>Business</SectionTitle>
      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{business?.business_name}</Text>
        <Text style={{ color: colors.textSecondary, marginTop: 2 }}>{[business?.address_line1, business?.city, business?.state].filter(Boolean).join(', ')}</Text>
        <Row left="Default tax rate" right={`${business?.default_tax_rate ?? 0}%`} />
        <Row left="Payment terms" right={business?.default_payment_terms || '—'} />
      </Card>

      <SectionTitle>Stripe</SectionTitle>
      <Card>
        <Row left="Charges" right={stripeStatus?.chargesEnabled ? 'Enabled' : 'Not enabled'} />
        <Row left="Payouts" right={stripeStatus?.payoutsEnabled ? 'Enabled' : 'Not enabled'} />
        <Row left="Platform fee" right="1% per card/bank payment" />
        <Button title="Refresh Stripe status" variant="secondary" loading={checking} onPress={async () => { setChecking(true); await refresh(); setChecking(false); }} />
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card><Text style={{ color: colors.text }}>{user?.email}</Text></Card>

      {!isDemoMode() && (
        <>
          <SectionTitle>Server</SectionTitle>
          <Card><ServerSettings /></Card>
        </>
      )}
      <View style={{ height: spacing.sm }} />
      <Button title={isDemoMode() ? 'Exit demo' : 'Log out'} variant="danger" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background } });
