import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Platform, useWindowDimensions, TextInput, ActivityIndicator, Image, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// ⚙️ CONFIGURACIÓN DE SUPABASE & API MULTIPLATAFORMA
// ==========================================
const BASE_HOST = process.env.EXPO_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || (Platform.OS === 'web' ? 'http://localhost:4000' : 'http://127.0.0.1:4000');
const API_URL = `${BASE_HOST.replace(/\/$/, '')}/api`;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hbofrqdubrtogwbuddsa.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'tu-anon-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

// 📱 ESPACIADO SUPERIOR SEGURO PARA CÁMARA / DYNAMIC ISLAND / RELOJ EN iOS Y BARRA DE ESTADO EN ANDROID
export const SAFE_TOP_INSET = Platform.OS === 'ios' ? 60 : Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 42) : 0;

interface Business {
  id: string;
  name: string;
  niche: string;
  city: string;
  zipCode: string;
  logoUrl: string | null;
  primaryColor: string | null;
  distance: string | null;
  label: string;
  icon: string;
  latitude?: string;
  longitude?: string;
  loyaltyConfig?: any;
  loyalty_config?: any;
}

// ==========================================
// 🎨 COMPONENTE UI/UX: CONTENEDOR DE ÍCONO VECTORIAL GLASSMORPHISM
// ==========================================
const ProIconBox = ({ 
  family = 'Feather', 
  name, 
  color = '#FF5E00', 
  size = 24, 
  boxSize = 54 
}: { 
  family?: 'Feather' | 'Ionicons' | 'MCI', 
  name: string, 
  color?: string, 
  size?: number, 
  boxSize?: number 
}) => (
  <View style={{
    width: boxSize,
    height: boxSize,
    borderRadius: Math.round(boxSize * 0.28),
    backgroundColor: `${color}18`,
    borderWidth: 1,
    borderColor: `${color}40`,
    alignItems: 'center',
    justifyContent: 'center',
  }}>
    {family === 'Feather' && <Feather name={name as any} size={size} color={color} />}
    {family === 'Ionicons' && <Ionicons name={name as any} size={size} color={color} />}
    {family === 'MCI' && <MaterialCommunityIcons name={name as any} size={size} color={color} />}
  </View>
);

const getNicheIconProps = (niche?: string, primaryColor?: string | null) => {
  const n = (niche || '').toLowerCase();
  if (n === 'spa') return { family: 'Ionicons' as const, name: 'sparkles-outline', color: primaryColor || '#10B981' };
  if (n === 'barbershop') return { family: 'Feather' as const, name: 'scissors', color: primaryColor || '#FF5E00' };
  if (n === 'legal') return { family: 'Feather' as const, name: 'shield', color: primaryColor || '#3B82F6' };
  if (n === 'dental') return { family: 'MCI' as const, name: 'tooth-outline', color: primaryColor || '#06B6D4' };
  return { family: 'Ionicons' as const, name: 'car-sport-outline', color: primaryColor || '#FF5E00' };
};

// ==========================================
// 🔒 COMPONENTE LOCAL PARA LOGOS PRIVADOS DEL DIRECTORIO
// ==========================================
const DirectoryLogo = ({ logoUrl, niche, primaryColor }: { logoUrl: string | null, icon?: string, niche?: string, primaryColor?: string | null }) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    const getLogo = async () => {
      if (!logoUrl) return;
      let cleanPath = logoUrl;
      if (cleanPath.includes('/public/autoflow/')) {
        cleanPath = cleanPath.split('/public/autoflow/')[1];
      } else if (cleanPath.includes('/sign/autoflow/')) {
        cleanPath = cleanPath.split('/sign/autoflow/')[1];
      }
      cleanPath = cleanPath.split('?')[0];

      const { data } = await supabase.storage.from('autoflow').createSignedUrl(cleanPath, 3600);
      if (data?.signedUrl) {
        setResolvedUrl(data.signedUrl);
      }
    };
    getLogo();
  }, [logoUrl]);

  if (!resolvedUrl) {
    const iconProps = getNicheIconProps(niche, primaryColor);
    return <ProIconBox family={iconProps.family} name={iconProps.name} color={iconProps.color} size={26} boxSize={56} />;
  }

  if (Platform.OS === 'web') {
    return (
      <img 
        src={resolvedUrl} 
        alt="Logo del negocio" 
        style={{ width: '56px', height: '56px', borderRadius: '14px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: '#000' }} 
      />
    );
  }

  return <Image source={{ uri: resolvedUrl }} style={{ width: 56, height: 56, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: '#000' }} resizeMode="cover" />;
};

export default function GlobalDirectory() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width <= 850;

  const [locationQuery, setLocationQuery] = useState('');
  const [selectedRadius, setSelectedRadius] = useState('30');
  const params = useLocalSearchParams();
  const [activeCategory, setActiveCategory] = useState<string | null>((params.category as string) || null);
  const [nameQuery, setNameQuery] = useState('');
  
  const [globalResults, setGlobalResults] = useState<Business[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // 🔄 Hidrata cada negocio con su loyaltyConfig (reviews, likes, dislikes) desde /api/tenants/info
  const enrichBusinessesWithReviews = useCallback(async (businesses: Business[]): Promise<Business[]> => {
    return Promise.all(
      businesses.map(async (biz) => {
        try {
          const resInfo = await fetch(`${API_URL}/tenants/info?t=${Date.now()}`, {
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': String(biz.id),
            },
          });
          if (resInfo.ok) {
            const infoJson = await resInfo.json();
            const remoteLoyalty = infoJson?.tenant?.loyaltyConfig || infoJson?.tenant?.loyalty_config;
            if (remoteLoyalty) {
              return {
                ...biz,
                loyaltyConfig: typeof remoteLoyalty === 'string' ? JSON.parse(remoteLoyalty) : remoteLoyalty,
                logoUrl: infoJson?.tenant?.logoUrl || biz.logoUrl,
                primaryColor: infoJson?.tenant?.primaryColor || biz.primaryColor,
              };
            }
          }
        } catch (_e) {}
        return biz;
      })
    );
  }, []);

  const fetchDirectory = useCallback(async (searchNiche = 'all') => {
    setIsSearching(true);
    try {
      const searchParams = new URLSearchParams({
        locationQuery: locationQuery.trim(),
        radius: selectedRadius,
        niche: searchNiche,
      });

      const response = await fetch(`${API_URL}/directory/search?${searchParams.toString()}`);
      const json = await response.json();

      if (json.success && Array.isArray(json.data)) {
        setGlobalResults(json.data);
        const enriched = await enrichBusinessesWithReviews(json.data);
        setGlobalResults(enriched);
      }
    } catch (error) {
      console.error('Error de red:', error);
    } finally {
      setIsSearching(false);
    }
  }, [locationQuery, selectedRadius, enrichBusinessesWithReviews]);

  useEffect(() => {
    fetchDirectory();
  }, [fetchDirectory]);

  useEffect(() => {
    if (params.category) {
      setActiveCategory(String(params.category));
      fetchDirectory();
    }
  }, [params.category, fetchDirectory]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onFocus = () => { fetchDirectory(); };
      window.addEventListener('focus', onFocus);
      return () => window.removeEventListener('focus', onFocus);
    }
  }, [fetchDirectory]);

  const handleSearch = () => {
    setActiveCategory(null);
    setNameQuery('');
    fetchDirectory();
  };

  const categoryCounts = useMemo(() => {
    return {
      automotive: globalResults.filter(b => b.niche === 'automotive').length,
      spa: globalResults.filter(b => b.niche === 'spa').length,
      barbershop: globalResults.filter(b => b.niche === 'barbershop').length,
      legal: globalResults.filter(b => b.niche === 'legal').length,
      dental: globalResults.filter(b => b.niche === 'dental').length,
    };
  }, [globalResults]);

  const specificResults = useMemo(() => {
    if (!activeCategory) return [];
    let results = globalResults.filter(biz => biz.niche === activeCategory);
    if (nameQuery) {
      results = results.filter(biz => biz.name.toLowerCase().includes(nameQuery.toLowerCase()));
    }
    return results;
  }, [activeCategory, globalResults, nameQuery]);

  if (!activeCategory) {
    return (
      <View style={styles.appContainer}>
        {/* HEADER B2C CON SAFE AREA PARA RELOJ / CÁMARA EN iOS Y ANDROID */}
        <View
          style={[
            styles.topNavbar,
            {
              paddingTop: SAFE_TOP_INSET,
              height: (isMobile ? 64 : 70) + SAFE_TOP_INSET,
              paddingHorizontal: isMobile ? 16 : 40,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: '#FF5E00', width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 18 }}>A</Text>
            </View>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFF' }}>AutoFlow</Text>
          </View>

          <TouchableOpacity 
            style={[styles.partnerButton, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: isMobile ? 8 : 10, paddingHorizontal: isMobile ? 14 : 18 }]} 
            onPress={() => router.push('/register' as any)}
          >
            <Feather name="briefcase" size={14} color="#FF5E00" />
            <Text style={[styles.partnerButtonText, isMobile && { fontSize: 13 }]}>Soy un Negocio</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.contentArea,
            { paddingHorizontal: isMobile ? 16 : 40, paddingTop: isMobile ? 20 : 36, paddingBottom: 48 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.header, { marginBottom: isMobile ? 28 : 40 }]}>
            <Text style={[styles.title, isMobile && { fontSize: 30, lineHeight: 36, marginBottom: 10 }]}>
              Encuentra <Text style={styles.accent}>Servicios</Text> Cerca de Ti
            </Text>
            <Text style={[styles.subtitle, isMobile && { fontSize: 15, lineHeight: 22, marginBottom: 24 }]}>
              Directorio inteligente. Explora negocios verificados en tu área.
            </Text>
            
            <View style={[styles.searchConsole, isMobile && { padding: 20, borderRadius: 20 }]}>
              <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
                <View style={{ flex: isMobile ? undefined : 2 }}>
                  <Text style={styles.inputLabel}>Tu Ubicación (Zip / Ciudad)</Text>
                  <TextInput 
                    style={styles.searchInput}
                    placeholder="Ej: 91730 o Los Angeles"
                    placeholderTextColor="#94A3B8"
                    value={locationQuery}
                    onChangeText={setLocationQuery}
                  />
                </View>
                
                <View style={{ flex: isMobile ? undefined : 1.5 }}>
                  <Text style={styles.inputLabel}>Radio de Búsqueda</Text>
                  {Platform.OS === 'web' ? (
                    <select style={styles.webSelect as any} value={selectedRadius} onChange={(e) => setSelectedRadius(e.target.value)}>
                      <option value="10">10 millas</option>
                      <option value="20">20 millas</option>
                      <option value="30">30 millas</option>
                      <option value="50">50 millas</option>
                    </select>
                  ) : (
                    <TextInput style={styles.searchInput} value={`${selectedRadius} Millas`} editable={false} />
                  )}
                </View>

                <View style={{ justifyContent: 'flex-end' }}>
                  <TouchableOpacity style={[styles.primaryButton, { flexDirection: 'row', gap: 8, width: isMobile ? '100%' : undefined }]} onPress={handleSearch} disabled={isSearching}>
                    {isSearching ? <ActivityIndicator color="#FFF" /> : (
                      <>
                        <Feather name="search" size={18} color="#FFF" />
                        <Text style={styles.primaryButtonText}>Buscar</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          <Text style={{ color: '#FFF', fontSize: isMobile ? 18 : 20, fontWeight: 'bold', marginBottom: 18 }}>Categorías Disponibles</Text>
          <View style={[styles.bentoGrid, isMobile && { gap: 16 }]}>
            <TouchableOpacity style={[styles.glassCard, isMobile && { minWidth: '100%', padding: 22 }]} activeOpacity={0.7} onPress={() => setActiveCategory('automotive')}>
              <View style={styles.cardHeader}>
                <ProIconBox family="Ionicons" name="car-sport-outline" color="#FF5E00" size={28} boxSize={54} />
                <View style={styles.countBadge}><Text style={styles.countText}>{categoryCounts.automotive} Cerca</Text></View>
              </View>
              <Text style={[styles.cardTitle, isMobile && { fontSize: 20 }]}>Talleres & Auto</Text>
              <Text style={styles.cardSubtitle}>Mecánica, llantas y mantenimiento.</Text>
              <View style={styles.cardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.footerLink}>Ver {categoryCounts.automotive} negocios</Text>
                  <Feather name="arrow-right" size={16} color="#FF5E00" />
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.glassCard, isMobile && { minWidth: '100%', padding: 22 }]} activeOpacity={0.7} onPress={() => setActiveCategory('spa')}>
              <View style={styles.cardHeader}>
                <ProIconBox family="Ionicons" name="sparkles-outline" color="#10B981" size={26} boxSize={54} />
                <View style={[styles.countBadge, { borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}><Text style={[styles.countText, { color: '#10B981' }]}>{categoryCounts.spa} Cerca</Text></View>
              </View>
              <Text style={[styles.cardTitle, isMobile && { fontSize: 20 }]}>Spas & Bienestar</Text>
              <Text style={styles.cardSubtitle}>Masajes, faciales y relajación.</Text>
              <View style={styles.cardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.footerLink, { color: '#10B981' }]}>Ver {categoryCounts.spa} negocios</Text>
                  <Feather name="arrow-right" size={16} color="#10B981" />
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.glassCard, isMobile && { minWidth: '100%', padding: 22 }]} activeOpacity={0.7} onPress={() => setActiveCategory('barbershop')}>
              <View style={styles.cardHeader}>
                <ProIconBox family="Feather" name="scissors" color="#FF5E00" size={26} boxSize={54} />
                <View style={styles.countBadge}><Text style={styles.countText}>{categoryCounts.barbershop} Cerca</Text></View>
              </View>
              <Text style={[styles.cardTitle, isMobile && { fontSize: 20 }]}>Barberías</Text>
              <Text style={styles.cardSubtitle}>Cortes clásicos, barba y estilo.</Text>
              <View style={styles.cardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.footerLink}>Ver {categoryCounts.barbershop} negocios</Text>
                  <Feather name="arrow-right" size={16} color="#FF5E00" />
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.glassCard, isMobile && { minWidth: '100%', padding: 22 }]} activeOpacity={0.7} onPress={() => setActiveCategory('legal')}>
              <View style={styles.cardHeader}>
                <ProIconBox family="Feather" name="shield" color="#3B82F6" size={26} boxSize={54} />
                <View style={[styles.countBadge, { borderColor: '#3B82F6', backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}><Text style={[styles.countText, { color: '#3B82F6' }]}>{categoryCounts.legal} Cerca</Text></View>
              </View>
              <Text style={[styles.cardTitle, isMobile && { fontSize: 20 }]}>Abogados & Firmas</Text>
              <Text style={styles.cardSubtitle}>Asesoría legal, inmigración, familia y contratos (Presencial / Teléfono).</Text>
              <View style={styles.cardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.footerLink, { color: '#3B82F6' }]}>Ver {categoryCounts.legal} bufetes</Text>
                  <Feather name="arrow-right" size={16} color="#3B82F6" />
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.glassCard, isMobile && { minWidth: '100%', padding: 22 }]} activeOpacity={0.7} onPress={() => setActiveCategory('dental')}>
              <View style={styles.cardHeader}>
                <ProIconBox family="MCI" name="tooth-outline" color="#06B6D4" size={28} boxSize={54} />
                <View style={[styles.countBadge, { borderColor: '#06B6D4', backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}><Text style={[styles.countText, { color: '#06B6D4' }]}>{categoryCounts.dental} Cerca</Text></View>
              </View>
              <Text style={[styles.cardTitle, isMobile && { fontSize: 20 }]}>Odontología & Clínicas</Text>
              <Text style={styles.cardSubtitle}>Limpieza dental, ortodoncia, implantes y urgencias odontológicas.</Text>
              <View style={styles.cardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.footerLink, { color: '#06B6D4' }]}>Ver {categoryCounts.dental} clínicas</Text>
                  <Feather name="arrow-right" size={16} color="#06B6D4" />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  const categoryName = activeCategory === 'spa' ? 'Spas & Centros de Bienestar' : activeCategory === 'automotive' ? 'Talleres Automotrices' : activeCategory === 'legal' ? 'Abogados & Firmas Legales' : activeCategory === 'dental' ? 'Centros Odontológicos & Clínicas' : 'Barberías';
  const activeHeaderIcon = getNicheIconProps(activeCategory);

  return (
    <View style={styles.appContainer}>
      {/* BARRA SUPERIOR EN VISTA DE CATEGORÍA CON SAFE AREA PARA RELOJ / CÁMARA EN iOS Y ANDROID */}
      <View
        style={[
          styles.topNavbar,
          {
            paddingTop: SAFE_TOP_INSET,
            height: (isMobile ? 62 : 70) + SAFE_TOP_INSET,
            paddingHorizontal: isMobile ? 16 : 40,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.backButton, { marginBottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }]}
          onPress={() => { setActiveCategory(null); setNameQuery(''); }}
        >
          <Feather name="arrow-left" size={16} color="#FFFFFF" />
          <Text style={[styles.backButtonText, { color: '#FFFFFF' }]}>Volver a Categorías</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ backgroundColor: '#FF5E00', width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 15 }}>A</Text>
          </View>
          {!isMobile ? <Text style={{ fontSize: 17, fontWeight: '900', color: '#FFF' }}>AutoFlow</Text> : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.contentArea,
          { paddingHorizontal: isMobile ? 16 : 40, paddingTop: isMobile ? 20 : 32, paddingBottom: 48 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { marginBottom: isMobile ? 24 : 32, paddingTop: 0 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <ProIconBox family={activeHeaderIcon.family} name={activeHeaderIcon.name} color={activeHeaderIcon.color} size={26} boxSize={52} />
            <Text style={[styles.title, { marginBottom: 0, flex: 1, fontSize: isMobile ? 24 : 38 }]}>{categoryName}</Text>
          </View>
          <Text style={[styles.subtitle, isMobile && { fontSize: 14.5, lineHeight: 21, marginBottom: 20 }]}>
            Encontramos {specificResults.length} opciones a menos de {selectedRadius} millas de tu búsqueda.
          </Text>
          
          <View style={[styles.searchConsole, isMobile && { padding: 18, borderRadius: 18 }]}>
            <Text style={styles.inputLabel}>¿Buscas un negocio en específico?</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TextInput 
                style={[styles.searchInput, { flex: 1 }]} 
                placeholder="Buscar por nombre de negocio..." 
                placeholderTextColor="#94A3B8"
                value={nameQuery} 
                onChangeText={setNameQuery}
              />
            </View>
          </View>
        </View>

        <View style={[styles.bentoGrid, isMobile && { gap: 16 }]}>
          {specificResults.length > 0 ? specificResults.map(biz => {
            const rawLoyalty = biz.loyaltyConfig || biz.loyalty_config || {};
            let loyalty: any = {};
            try {
              loyalty = typeof rawLoyalty === 'string' ? JSON.parse(rawLoyalty || '{}') : rawLoyalty;
            } catch (_e) {
              loyalty = {};
            }
            const reviews = Array.isArray(loyalty?.reviews) ? loyalty.reviews : [];
            const avg = reviews.length > 0
              ? (reviews.reduce((acc: number, r: any) => acc + Number(r.rating || 5), 0) / reviews.length).toFixed(1)
              : '5.0';
            const likes = reviews.filter((r: any) => r.reaction === 'like' || (!r.reaction && Number(r.rating) >= 4)).length;
            const dislikes = reviews.filter((r: any) => r.reaction === 'dislike' || (!r.reaction && Number(r.rating) <= 2)).length;
            const dist = biz.distance !== undefined && biz.distance !== null
              ? Number(biz.distance).toFixed(1)
              : '2.4';

            return (
              <TouchableOpacity 
                key={biz.id} 
                style={[styles.glassCard, { minWidth: isMobile ? '100%' : '48%', padding: isMobile ? 22 : 28, position: 'relative' }]} 
                activeOpacity={0.75}
                onPress={() => router.push(`/${biz.id}` as any)}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                  <DirectoryLogo logoUrl={biz.logoUrl} icon={biz.icon} niche={biz.niche} primaryColor={biz.primaryColor} />

                  <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 1 }}>
                    <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.45)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="star" size={13} color="#F59E0B" />
                      <Text style={{ color: '#F59E0B', fontWeight: '900', fontSize: 13 }}>{avg}</Text>
                      <View style={{ width: 1, height: 11, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 1 }} />
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          router.push(`/${biz.id}?view=expediente&reaction=like` as any);
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                      >
                        <Feather name="thumbs-up" size={12} color="#10B981" />
                        <Text style={{ color: '#10B981', fontWeight: '900', fontSize: 12 }}>{likes}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          router.push(`/${biz.id}?view=expediente&reaction=dislike` as any);
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 2 }}
                      >
                        <Feather name="thumbs-down" size={12} color="#EF4444" />
                        <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 12 }}>{dislikes}</Text>
                      </TouchableOpacity>
                      <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700' }}>({reviews.length})</Text>
                    </View>

                    <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.35)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Feather name="navigation" size={11} color="#60A5FA" />
                      <Text style={{ color: '#E2E8F0', fontSize: 11.5, fontWeight: '700' }}>A {dist} millas</Text>
                    </View>
                  </View>
                </View>

                <Text style={[styles.cardTitle, isMobile && { fontSize: 21 }]}>{biz.name}</Text>
                <Text style={styles.cardSubtitle}>{biz.label} • {biz.city}, {biz.zipCode}</Text>
                
                <View style={[styles.cardFooter, { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                    <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '700' }}>
                      Turnos disponibles hoy
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.footerLink, biz.primaryColor && { color: biz.primaryColor }]}>
                      Ver Catálogo y Agendar
                    </Text>
                    <Feather name="arrow-right" size={16} color={biz.primaryColor || '#FF5E00'} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }) : (
            <View style={[styles.glassCard, { width: '100%', alignItems: 'center', padding: 40 }]}>
              <View style={{ marginBottom: 16 }}>
                <ProIconBox family="Feather" name="compass" color="#94A3B8" size={32} boxSize={64} />
              </View>
              <Text style={{ color: '#FFF', fontSize: 19, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' }}>No encontramos coincidencias</Text>
              <Text style={{ color: '#94A3B8', textAlign: 'center' }}>Intenta buscar con otro nombre o ubicación.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: { flex: 1, backgroundColor: '#05070C' },
  topNavbar: { height: 70, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 40, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(5, 7, 12, 0.94)', zIndex: 100 },
  partnerButton: { backgroundColor: 'rgba(255, 94, 0, 0.15)', borderWidth: 1, borderColor: '#FF5E00', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12 },
  partnerButtonText: { color: '#FF5E00', fontWeight: 'bold', fontSize: 14 },
  contentArea: { padding: 20, maxWidth: 1200, alignSelf: 'center', width: '100%', minHeight: Platform.OS === 'web' ? ('100vh' as any) : '100%' },
  header: { paddingTop: Platform.OS === 'web' ? 12 : 0, marginBottom: 36 },
  title: { fontSize: Platform.OS === 'web' ? 44 : 32, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.8, marginBottom: 12 },
  accent: { color: '#FF5E00' },
  subtitle: { color: '#94A3B8', fontSize: 16.5, maxWidth: 700, lineHeight: 25, marginBottom: 28 },
  searchConsole: { backgroundColor: 'rgba(18, 22, 28, 0.85)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 24, padding: 28 },
  inputLabel: { fontSize: 12, color: '#94A3B8', fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase' },
  searchInput: { backgroundColor: 'rgba(0, 0, 0, 0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, height: 52, fontSize: 15.5 },
  webSelect: { backgroundColor: 'rgba(0, 0, 0, 0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, height: 52, fontSize: 15.5, width: '100%' },
  primaryButton: { backgroundColor: '#FF5E00', borderRadius: 12, alignItems: 'center', justifyContent: 'center', height: 52, paddingHorizontal: 28 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15.5 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  backButtonText: { color: '#A1A1AA', fontWeight: 'bold', fontSize: 13.5 },
  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, width: '100%' },
  glassCard: { backgroundColor: 'rgba(18, 22, 28, 0.65)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 22, padding: 26, flex: 1, minWidth: 280 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  cardIcon: { fontSize: 48 },
  countBadge: { backgroundColor: 'rgba(255, 94, 0, 0.15)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FF5E00' },
  countText: { color: '#FF5E00', fontSize: 12.5, fontWeight: '900' },
  distanceBadge: { backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  distanceText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  cardTitle: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', marginBottom: 6 },
  cardSubtitle: { fontSize: 14.5, color: '#94A3B8', marginBottom: 0 },
  cardFooter: { marginTop: 20, flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.08)', paddingTop: 16 },
  footerLink: { color: '#FF5E00', fontWeight: '800', fontSize: 14.5 }
});
