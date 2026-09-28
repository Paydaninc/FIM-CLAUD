import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listClients, createInvoice, sendInvoice, Client } from '@/api/endpoints';
import { useAuth } from '@/context/AuthContext';
import { FormInput, Button, ErrorText } from '@/components/Form';
import { Card, Chip, SectionTitle, Row, money, errorMessage } from '@/components/ui';
import { colors, spacing } from '@/theme';

interface Item { description: string; quantity: string; unit_price: string }
const blank = (): Item => ({ description: '', quantity: '1', unit_price: '' });

export default function InvoiceCreateScreen({ navigation }: any) {
  const { business } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string | undefined>();
  const [items, setItems] = useState<Item[]>([blank()]);
  const [discountType, setDiscountType] = useState<'percent' | 'fixed' | undefined>();
  const [discountValue, setDiscountValue] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => { listClients().then((r) => setClients(r.clients)).catch(() => {}); }, []));

  const update = (i: number, patch: Partial<Item>) => setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  // Live preview using the same rule as the server: tax on each full line, discount subtracted separately.
  const taxRate = Number(business?.default_tax_rate || 0);
  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const tax = subtotal * (taxRate / 100);
  const dv = Number(discountValue) || 0;
  const discount = Math.min(discountType === 'percent' ? subtotal * (dv / 100) : discountType === 'fixed' ? dv : 0, subtotal);
  const total = subtotal - discount + tax;

  const save = async () => {
    setError(null);
    const lines = items.filter((it) => it.description.trim() || it.unit_price);
    if (lines.length === 0) { setError('Add at least one line item.'); return; }
    if (lines.some((l) => !l.description.trim() || !(Number(l.quantity) > 0) || !(Number(l.unit_price) >= 0) || l.unit_price === '')) {
      setError('Each line needs a description, a quantity above 0, and a price.'); return;
    }
    setSaving(true);
    try {
      const { invoice } = await createInvoice({
        client_id: clientId,
        notes: notes || undefined,
        discount_type: discountType,
        discount_value: discountType ? dv : undefined,
        line_items: lines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unit_price: Number(l.unit_price) })),
      });
      // Skip the intermediate "draft" step — go straight to a sent invoice with payment options showing.
      try { await sendInvoice(invoice.id); } catch { /* still navigate; they can send manually from there */ }
      navigation.replace('InvoiceDetail', { id: invoice.id });
    } catch (e) { setError(errorMessage(e)); }
    finally { setSaving(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
      <SectionTitle>Client</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {clients.map((c) => <Chip key={c.id} label={c.name} active={clientId === c.id} onPress={() => setClientId(clientId === c.id ? undefined : c.id)} />)}
        <Chip label="+ New client" onPress={() => navigation.navigate('ClientCreate')} />
      </View>

      <SectionTitle>Line items</SectionTitle>
      {items.map((it, i) => (
        <Card key={i}>
          <FormInput label="Description" value={it.description} onChangeText={(t) => update(i, { description: t })} autoCapitalize="sentences" placeholder="Lawn maintenance" />
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, marginRight: 8 }}><FormInput label="Qty" value={it.quantity} onChangeText={(t) => update(i, { quantity: t })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1, marginLeft: 8 }}><FormInput label="Unit price ($)" value={it.unit_price} onChangeText={(t) => update(i, { unit_price: t })} keyboardType="decimal-pad" placeholder="0.00" /></View>
          </View>
          {items.length > 1 && (
            <TouchableOpacity onPress={() => setItems(items.filter((_, idx) => idx !== i))}><Text style={{ color: colors.danger, fontSize: 13 }}>Remove line</Text></TouchableOpacity>
          )}
        </Card>
      ))}
      <Button title="+ Add line item" variant="secondary" onPress={() => setItems([...items, blank()])} />

      <SectionTitle>Discount (optional)</SectionTitle>
      <View style={{ flexDirection: 'row' }}>
        <Chip label="None" active={!discountType} onPress={() => setDiscountType(undefined)} />
        <Chip label="Percent %" active={discountType === 'percent'} onPress={() => setDiscountType('percent')} />
        <Chip label="Fixed $" active={discountType === 'fixed'} onPress={() => setDiscountType('fixed')} />
      </View>
      {discountType && <FormInput label={discountType === 'percent' ? 'Discount (%)' : 'Discount ($)'} value={discountValue} onChangeText={setDiscountValue} keyboardType="decimal-pad" />}

      <FormInput label="Notes / terms" value={notes} onChangeText={setNotes} autoCapitalize="sentences" multiline placeholder="Thank you for your business!" />

      <Card>
        <Row left="Subtotal" right={money(subtotal)} />
        {discount > 0 && <Row left="Discount" right={`-${money(discount)}`} />}
        <Row left={`Tax (${taxRate}%)`} right={money(tax)} />
        <Row left="Total" right={money(total)} bold />
      </Card>

      <ErrorText message={error} />
      <Button title="Next" onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background } });
