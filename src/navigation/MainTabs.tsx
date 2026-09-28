import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import DashboardScreen from '@/screens/dashboard/DashboardScreen';
import InvoiceListScreen from '@/screens/invoices/InvoiceListScreen';
import InvoiceDetailScreen from '@/screens/invoices/InvoiceDetailScreen';
import InvoiceCreateScreen from '@/screens/invoices/InvoiceCreateScreen';
import ClientListScreen from '@/screens/clients/ClientListScreen';
import ClientCreateScreen from '@/screens/clients/ClientCreateScreen';
import SettingsScreen from '@/screens/settings/SettingsScreen';
import BusinessEditScreen from '@/screens/settings/BusinessEditScreen';
import StripeConnectScreen from '@/screens/onboarding/StripeConnectScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const icon = (glyph: string) => ({ color }: { color: string }) => <Text style={{ fontSize: 18, color }}>{glyph}</Text>;

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarIcon: icon('⌂') }} />
      <Tab.Screen name="Invoices" component={InvoiceListScreen} options={{ tabBarIcon: icon('▤') }} />
      <Tab.Screen name="Clients" component={ClientListScreen} options={{ tabBarIcon: icon('☺') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: icon('⚙') }} />
    </Tab.Navigator>
  );
}

export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false }}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: 'Invoice' }} />
      <Stack.Screen name="InvoiceCreate" component={InvoiceCreateScreen} options={{ title: 'New invoice' }} />
      <Stack.Screen name="ClientCreate" component={ClientCreateScreen} options={{ title: 'New client' }} />
      <Stack.Screen name="BusinessEdit" component={BusinessEditScreen} options={{ title: 'Business info' }} />
      <Stack.Screen name="StripeConnect" component={StripeConnectScreen} options={{ title: 'Connect Stripe' }} />
    </Stack.Navigator>
  );
}
