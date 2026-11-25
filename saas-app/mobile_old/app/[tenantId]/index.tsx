// apps/mobile/app/[tenantId]/index.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function TenantDashboard() {
  const { tenantId } = useLocalSearchParams();
  const [tenantInfo, setTenantInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Petición conectada a tu API local usando el x-tenant-id
    fetch('http://127.0.0.1:4000/api/tenants/info', {
      headers: { 'x-tenant-id': String(tenantId) }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) setTenantInfo(data.tenant);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tenantId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF5E00" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.badge}>SUCURSAL ACTIVA</Text>
      <Text style={styles.title}>{tenantInfo?.name || 'Cargando Negocio...'}</Text>
      <Text style={styles.subtitle}>ID del Tenant: {tenantId}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#05070C' },
  container: { padding: 24, justifyContent: 'center', minHeight: '100%', backgroundColor: '#05070C' },
  badge: { color: '#FF5E00', fontWeight: '900', fontSize: 12, marginBottom: 8, letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: '900', color: '#FFF', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#94A3B8' }
});