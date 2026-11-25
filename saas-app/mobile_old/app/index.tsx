// apps/mobile/app/index.tsx
import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ImageBackground, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

const NICHE_THEMES = {
  automotive: { accent: '#FF5E00', bgImage: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?q=80&w=2000&auto=format&fit=crop' },
  spa: { accent: '#10B981', bgImage: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=2000&auto=format&fit=crop' },
  barbershop: { accent: '#3B82F6', bgImage: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=2000&auto=format&fit=crop' },
};

const saasDirectory = [
  { id: '123e4567-e89b-12d3-a456-426614174000', name: 'AutoFlow Central', niche: 'automotive', label: 'Taller Automotriz', icon: '🚗' },
  { id: 'spa-demo-uuid-1234', name: 'Zen Beauty Spa', niche: 'spa', label: 'Spa & Relajación', icon: '💆‍♀️' },
  { id: 'barber-demo-uuid-5678', name: 'Classic BarberShop', niche: 'barbershop', label: 'Barbería Clásica', icon: '✂️' },
];

export default function MobileDirectory() {
  const router = useRouter();
  const [selectedNiche, setSelectedNiche] = useState<keyof typeof NICHE_THEMES>('automotive');
  const currentTheme = NICHE_THEMES[selectedNiche] || NICHE_THEMES.automotive;

  return (
    <ImageBackground source={{ uri: currentTheme.bgImage }} style={styles.background} resizeMode="cover">
      <View style={styles.overlay} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>SaaS <Text style={{ color: currentTheme.accent }}>Multinicho</Text></Text>
        <Text style={styles.subtitle}>Selecciona un negocio para entrar a su sucursal.</Text>

        <View style={styles.grid}>
          {saasDirectory.map((biz) => {
            const bizTheme = NICHE_THEMES[biz.niche as keyof typeof NICHE_THEMES] || NICHE_THEMES.automotive;
            return (
              <TouchableOpacity 
                key={biz.id} 
                style={styles.card}
                onPressIn={() => setSelectedNiche(biz.niche as any)}
                onPress={() => router.push(`/${biz.id}` as any)}
              >
                <Text style={styles.icon}>{biz.icon}</Text>
                <Text style={styles.cardTitle}>{biz.name}</Text>
                <Text style={styles.cardDesc}>Plataforma para {biz.label}</Text>
                <Text style={[styles.enterText, { color: bizTheme.accent }]}>Entrar →</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 7, 12, 0.88)' },
  container: { padding: 24, justifyContent: 'center', minHeight: '100%' },
  title: { fontSize: 32, fontWeight: '900', color: '#FFF', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#94A3B8', marginBottom: 32 },
  grid: { gap: 16 },
  card: { backgroundColor: 'rgba(18, 22, 28, 0.75)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: 20 },
  icon: { fontSize: 36, marginBottom: 12 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', marginBottom: 4 },
  cardDesc: { fontSize: 13, color: '#94A3B8', marginBottom: 16 },
  enterText: { fontWeight: 'bold', fontSize: 14, textAlign: 'right' }
});