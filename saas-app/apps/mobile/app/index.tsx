import React, { useState, useMemo, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Platform, useWindowDimensions, TextInput, ActivityIndicator, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// ⚙️ CONFIGURACIÓN DE SUPABASE & API
// ==========================================
const API_URL = Platform.OS === 'web' ? 'http://localhost:4000/api' : 'http://192.168.1.XX:4000/api'; 
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hbofrqdubrtogwbuddsa.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'tu-anon-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

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

// Extrae las reseñas desde loyaltyConfig (viene como objeto o como string JSON)
const parseReviews = (rawLoyalty: any): any[] => {
  try {
    const loyalty = typeof rawLoyalty === 'string' ? JSON.parse(rawLoyalty || '{}') : (rawLoyalty || {});
    return Array.isArray(loyalty?.reviews) ? loyalty.reviews : [];
  } catch (e) {
    return [];
  }
};

// Mismas reglas que el panel del negocio, para que los números coincidan
const getReviewStats = (reviews: any[]) => {
  const count = reviews.length;
  const avg = count > 0
    ? (reviews.reduce((acc: number, r: any) => acc + Number(r.rating || 5), 0) / count).toFixed(1)
    : '5.0';
  const likes = reviews.filter((r: any) => r.reaction === 'like' || (!r.reaction && Number(r.rating) >= 4)).length;
  const dislikes = reviews.filter((r: any) => r.reaction === 'dislike' || (!r.reaction && Number(r.rating) <= 2)).length;
  return { count, avg, likes, dislikes };
};

export default function GlobalDirectory() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width <= 850;

  const [locationQuery, setLocationQuery] = useState('');
  const [selectedRadius, setSelectedRadius] = useState('30');
  const params = useLocalSearchParams();
  const [activeCategory, setActiveCategory] = useState<string | null>((params.category as string) || null);

  useEffect(() => {
    if (params.category) {
      setActiveCategory(String(params.category));
    }
  }, [params.category]);
  const [nameQuery, setNameQuery] = useState('');
  
  const [globalResults, setGlobalResults] = useState<Business[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Reseñas por negocio (respaldo cuando /directory/search no trae loyaltyConfig.reviews)
  const [reviewsByBiz, setReviewsByBiz] = useState<Record<string, any[]>>({});

  const fetchDirectory = async (searchNiche = 'all') => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        locationQuery: locationQuery.trim(),
        radius: selectedRadius,
        niche: searchNiche,
      });

      const response = await fetch(`${API_URL}/directory/search?${params.toString()}`);
      const json = await response.json();

      if (json.success) {
        setGlobalResults(json.data);
      }
    } catch (error) {
      console.error("Error de red:", error);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    fetchDirectory();
  }, []);

  // 🌟 Completa calificación/likes/dislikes reales de cada negocio listado 🌟
  useEffect(() => {
    const pending = globalResults.filter(
      (biz) => parseReviews(biz.loyaltyConfig || biz.loyalty_config).length === 0 && reviewsByBiz[biz.id] === undefined
    );
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        pending.map(async (biz) => {
          try {
            const res = await fetch(`${API_URL}/tenants/info`, {
              headers: { 'Content-Type': 'application/json', 'x-tenant-id': biz.id },
            });
            if (!res.ok) return [biz.id, []] as [string, any[]];
            const json = await res.json();
            return [biz.id, parseReviews(json?.tenant?.loyaltyConfig)] as [string, any[]];
          } catch (e) {
            return [biz.id, []] as [string, any[]];
          }
        })
      );
      if (cancelled) return;
      setReviewsByBiz((prev) => {
        const next = { ...prev };
        entries.forEach(([id, revs]) => { next[id] = revs; });
        return next;
      });
    })();

    return () => { cancelled = true; };
  }, [globalResults]);

  // 👍/👎 desde la tarjeta: abre el negocio directo en Expediente para verificar al cliente y registrar la reacción
  const goRateBusiness = (bizId: string, reaction: 'like' | 'dislike') => {
    router.push(`/${bizId}?view=expediente&reaction=${reaction}` as any);
  };

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
        {/* HEADER B2C CON ACCESO A SOCIOS (B2B) */}
        <View style={styles.topNavbar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ backgroundColor: '#FF5E00', width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 18 }}>A</Text>
            </View>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFF' }}>AutoFlow</Text>
          </View>

          {/* BOTÓN CLAVE PARA DUEÑOS DE NEGOCIOS */}
          <TouchableOpacity 
            style={[styles.partnerButton, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} 
            onPress={() => router.push('/register' as any)}
          >
            <Feather name="briefcase" size={15} color="#FF5E00" />
            <Text style={styles.partnerButtonText}>Soy un Negocio</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.contentArea} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Encuentra <Text style={styles.accent}>Servicios</Text> Cerca de Ti</Text>
            <Text style={styles.subtitle}>Directorio inteligente. Explora negocios verificados en tu área.</Text>
            
            <View style={styles.searchConsole}>
              <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.inputLabel}>Tu Ubicación (Zip / Ciudad)</Text>
                  <TextInput 
                    style={styles.searchInput} placeholder="Ej: 91730 o Los Angeles" placeholderTextColor="#94A3B8"
                    value={locationQuery} onChangeText={setLocationQuery}
                  />
                </View>
                
                <View style={{ flex: 1.5 }}>
                  <Text style={styles.inputLabel}>Radio de Búsqueda</Text>
                  {Platform.OS === 'web' ? (
                    <select style={styles.webSelect as any} value={selectedRadius} onChange={(e) => setSelectedRadius(e.target.value)}>
                      <option value="10">10 millas</option><option value="20">20 millas</option><option value="30">30 millas</option><option value="50">50 millas</option>
                    </select>
                  ) : (
                    <TextInput style={styles.searchInput} value={`${selectedRadius} Millas`} editable={false} />
                  )}
                </View>

                <View style={{ justifyContent: 'flex-end' }}>
                  <TouchableOpacity style={[styles.primaryButton, { flexDirection: 'row', gap: 8 }]} onPress={handleSearch} disabled={isSearching}>
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

          <Text style={{ color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 24 }}>Categorías Disponibles</Text>
          <View style={styles.bentoGrid}>
            <TouchableOpacity style={[styles.glassCard, isMobile && { minWidth: '100%' }]} activeOpacity={0.7} onPress={() => setActiveCategory('automotive')}>
              <View style={styles.cardHeader}>
                <ProIconBox family="Ionicons" name="car-sport-outline" color="#FF5E00" size={28} boxSize={56} />
                <View style={styles.countBadge}><Text style={styles.countText}>{categoryCounts.automotive} Cerca</Text></View>
              </View>
              <Text style={styles.cardTitle}>Talleres & Auto</Text>
              <Text style={styles.cardSubtitle}>Mecánica, llantas y mantenimiento.</Text>
              <View style={styles.cardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.footerLink}>Ver {categoryCounts.automotive} negocios</Text>
                  <Feather name="arrow-right" size={16} color="#FF5E00" />
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.glassCard, isMobile && { minWidth: '100%' }]} activeOpacity={0.7} onPress={() => setActiveCategory('spa')}>
              <View style={styles.cardHeader}>
                <ProIconBox family="Ionicons" name="sparkles-outline" color="#10B981" size={26} boxSize={56} />
                <View style={[styles.countBadge, { borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}><Text style={[styles.countText, { color: '#10B981' }]}>{categoryCounts.spa} Cerca</Text></View>
              </View>
              <Text style={styles.cardTitle}>Spas & Bienestar</Text>
              <Text style={styles.cardSubtitle}>Masajes, faciales y relajación.</Text>
              <View style={styles.cardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.footerLink, { color: '#10B981' }]}>Ver {categoryCounts.spa} negocios</Text>
                  <Feather name="arrow-right" size={16} color="#10B981" />
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.glassCard, isMobile && { minWidth: '100%' }]} activeOpacity={0.7} onPress={() => setActiveCategory('barbershop')}>
              <View style={styles.cardHeader}>
                <ProIconBox family="Feather" name="scissors" color="#FF5E00" size={26} boxSize={56} />
                <View style={styles.countBadge}><Text style={styles.countText}>{categoryCounts.barbershop} Cerca</Text></View>
              </View>
              <Text style={styles.cardTitle}>Barberías</Text>
              <Text style={styles.cardSubtitle}>Cortes clásicos, barba y estilo.</Text>
              <View style={styles.cardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.footerLink}>Ver {categoryCounts.barbershop} negocios</Text>
                  <Feather name="arrow-right" size={16} color="#FF5E00" />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  const categoryName = activeCategory === 'spa' ? 'Spas & Centros de Bienestar' : activeCategory === 'automotive' ? 'Talleres Automotrices' : 'Barberías';
  const activeHeaderIcon = getNicheIconProps(activeCategory);

  return (
    <View style={styles.appContainer}>
      <ScrollView contentContainerStyle={styles.contentArea} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={[styles.backButton, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} onPress={() => { setActiveCategory(null); setNameQuery(''); }}>
          <Feather name="arrow-left" size={16} color="#A1A1AA" />
          <Text style={styles.backButtonText}>Volver a Categorías</Text>
        </TouchableOpacity>

        <View style={[styles.header, { marginBottom: 32 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <ProIconBox family={activeHeaderIcon.family} name={activeHeaderIcon.name} color={activeHeaderIcon.color} size={28} boxSize={58} />
            <Text style={[styles.title, { marginBottom: 0 }]}>{categoryName}</Text>
          </View>
          <Text style={styles.subtitle}>Encontramos {specificResults.length} opciones a menos de {selectedRadius} millas de tu búsqueda.</Text>
          
          <View style={styles.searchConsole}>
            <Text style={styles.inputLabel}>¿Buscas un negocio en específico?</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TextInput 
                style={[styles.searchInput, { flex: 1 }]} 
                placeholder={`Buscar por nombre de negocio...`} 
                placeholderTextColor="#94A3B8"
                value={nameQuery} 
                onChangeText={setNameQuery}
              />
            </View>
          </View>
        </View>

        <View style={styles.bentoGrid}>
          {specificResults.length > 0 ? specificResults.map(biz => (
            <TouchableOpacity 
              key={biz.id} 
              style={[styles.glassCard, { minWidth: isMobile ? '100%' : '48%', position: 'relative' }]} 
              activeOpacity={0.7}
              onPress={() => router.push(`/${biz.id}` as any)}
            >
              <View style={styles.cardHeader}>
                {/* 🌟 LOGOTIPO PRIVADO O VECTORIAL PROFESIONAL UI/UX 🌟 */}
                <DirectoryLogo logoUrl={biz.logoUrl} icon={biz.icon} niche={biz.niche} primaryColor={biz.primaryColor} />
              </View>

              {/* 🌟 CALIFICACIÓN Y DISTANCIA VECTORIAL (ESQUINA SUPERIOR DERECHA) 🌟 */}
              {(() => {
                const payloadReviews = parseReviews(biz.loyaltyConfig || biz.loyalty_config);
                const reviews = payloadReviews.length > 0 ? payloadReviews : (reviewsByBiz[biz.id] || []);
                const { avg, likes, dislikes, count } = getReviewStats(reviews);

                const dist = biz.distance !== undefined && biz.distance !== null
                  ? Number(biz.distance).toFixed(1)
                  : '2.4';

                return (
                  <View style={{ position: 'absolute', top: 24, right: 24, alignItems: 'flex-end', gap: 8 }}>
                    <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.45)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="star" size={13} color="#F59E0B" />
                      <Text style={{ color: '#F59E0B', fontWeight: '900', fontSize: 13 }}>{avg}</Text>
                      <View style={{ width: 1, height: 11, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 2 }} />
                      <TouchableOpacity
                        onPress={() => goRateBusiness(biz.id, 'like')}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}
                      >
                        <Feather name="thumbs-up" size={12} color="#10B981" />
                        <Text style={{ color: '#10B981', fontWeight: '900', fontSize: 12 }}>{likes}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => goRateBusiness(biz.id, 'dislike')}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                      >
                        <Feather name="thumbs-down" size={12} color="#EF4444" />
                        <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 12 }}>{dislikes}</Text>
                      </TouchableOpacity>
                      <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700' }}>({count})</Text>
                    </View>
                    <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.35)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Feather name="navigation" size={11} color="#60A5FA" />
                      <Text style={{ color: '#E2E8F0', fontSize: 12, fontWeight: '700' }}>A {dist} millas</Text>
                    </View>
                  </View>
                );
              })()}
              <Text style={styles.cardTitle}>{biz.name}</Text>
              <Text style={styles.cardSubtitle}>{biz.label} • {biz.city}, {biz.zipCode}</Text>
              
              <View style={[styles.cardFooter, { justifyContent: 'space-between', alignItems: 'center' }]}>
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
          )) : (
            <View style={[styles.glassCard, { width: '100%', alignItems: 'center', padding: 48 }]}>
              <View style={{ marginBottom: 16 }}>
                <ProIconBox family="Feather" name="compass" color="#94A3B8" size={32} boxSize={64} />
              </View>
              <Text style={{ color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>No encontramos coincidencias</Text>
              <Text style={{ color: '#94A3B8' }}>Intenta buscar con otro nombre o ubicación.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: { flex: 1, backgroundColor: '#05070C' },
  topNavbar: { height: 70, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 40, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(5, 7, 12, 0.9)' },
  partnerButton: { backgroundColor: 'rgba(255, 94, 0, 0.150)', borderWidth: 1, borderColor: '#FF5E00', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12 },
  partnerButtonText: { color: '#FF5E00', fontWeight: 'bold', fontSize: 14 },
  contentArea: { padding: Platform.OS === 'web' ? 40 : 20, maxWidth: 1200, alignSelf: 'center', width: '100%', minHeight: Platform.OS === 'web' ? '100vh' : '100%' },
  header: { paddingTop: Platform.OS === 'web' ? 20 : 0, marginBottom: 40 },
  title: { fontSize: Platform.OS === 'web' ? 48 : 36, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1, marginBottom: 16 },
  accent: { color: '#FF5E00' },
  subtitle: { color: '#94A3B8', fontSize: 18, maxWidth: 700, lineHeight: 28, marginBottom: 40 },
  searchConsole: { backgroundColor: 'rgba(18, 22, 28, 0.85)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 24, padding: 32 },
  inputLabel: { fontSize: 13, color: '#94A3B8', fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase' },
  searchInput: { backgroundColor: 'rgba(0, 0, 0, 0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, height: 56, fontSize: 16 },
  webSelect: { backgroundColor: 'rgba(0, 0, 0, 0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, height: 56, fontSize: 16, width: '100%' },
  primaryButton: { backgroundColor: '#FF5E00', borderRadius: 12, alignItems: 'center', justifyContent: 'center', height: 56, paddingHorizontal: 32 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  backButtonText: { color: '#A1A1AA', fontWeight: 'bold', fontSize: 14 },
  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, width: '100%' },
  glassCard: { backgroundColor: 'rgba(18, 22, 28, 0.65)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 24, padding: 32, flex: 1, minWidth: 320 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  cardIcon: { fontSize: 48 },
  countBadge: { backgroundColor: 'rgba(255, 94, 0, 0.15)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FF5E00' },
  countText: { color: '#FF5E00', fontSize: 13, fontWeight: '900' },
  distanceBadge: { backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  distanceText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  cardTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginBottom: 8 },
  cardSubtitle: { fontSize: 15, color: '#94A3B8', marginBottom: 0 },
  cardFooter: { marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.08)', paddingTop: 20 },
  footerLink: { color: '#FF5E00', fontWeight: '800', fontSize: 15 }
});