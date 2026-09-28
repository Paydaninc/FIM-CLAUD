import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, typography } from '@/theme';

export const errorMessage = (e: any) => (e && e.message) || 'Something went wrong. Try again.';

export function money(v: any): string {
  const n = Number(v || 0);
  const fixed = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}$${fixed}`;
}

export function shortDate(d?: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: '#EEEDE8', fg: '#5F5E5A', label: 'Draft' },
  sent: { bg: '#E6F1FB', fg: '#185FA5', label: 'Sent' },
  viewed: { bg: '#E6F1FB', fg: '#185FA5', label: 'Viewed' },
  processing: { bg: '#EEEDFE', fg: '#534AB7', label: 'Processing' },
  paid: { bg: '#E1F5EE', fg: '#0F6E56', label: 'Paid' },
  overdue: { bg: '#FAEEDA', fg: '#854F0B', label: 'Overdue' },
  void: { bg: '#EEEDE8', fg: '#5F5E5A', label: 'Void' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] || STATUS.draft;
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
      <Text style={{ color: s.fg, fontSize: 12, fontWeight: '600' }}>{s.label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Banner({ tone, text }: { tone: 'success' | 'warning' | 'danger' | 'info'; text: string }) {
  const map = {
    success: ['#E1F5EE', '#0F6E56'], warning: ['#FAEEDA', '#854F0B'],
    danger: ['#FCEBEB', '#A32D2D'], info: ['#E6F1FB', '#185FA5'],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 10, padding: 12, marginBottom: spacing.md }}>
      <Text style={{ color: fg, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

export function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={[styles.rowText, bold && { fontWeight: '700', color: colors.text }]}>{left}</Text>
      <Text style={[styles.rowText, { color: colors.text }, bold && { fontWeight: '700' }]}>{right}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginRight: 8, marginBottom: 8,
        backgroundColor: active ? colors.accent : colors.surface, borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
      }}
    >
      <Text style={{ color: active ? '#fff' : colors.text, fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function InvoiceRow({ inv, onPress }: { inv: any; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.invRow}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{inv.client_name || 'No client'}</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
          Inv #{inv.invoice_number} · Due {shortDate(inv.due_date)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 }}>{money(inv.total)}</Text>
        <StatusBadge status={inv.status} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md,
  },
  rowText: { ...typography.body, color: colors.textSecondary },
  section: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.xs, textTransform: 'uppercase' },
  invRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
});
