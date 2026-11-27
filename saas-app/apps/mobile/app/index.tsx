'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  useWindowDimensions,
  Image,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';
import { usePushNotifications } from '../hooks/usePushNotifications';
import NotificationCenter from '../components/NotificationCenter';

// ==========================================
// ⚙️ CONFIGURACIÓN DE SUPABASE & SAFE AREA
// ==========================================
export const SAFE_TOP_INSET =
  Platform.OS === 'ios'
    ? 56
    : Platform.OS === 'android'
    ? StatusBar.currentHeight
      ? StatusBar.currentHeight + 12
      : 42
    : 0;

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://hbofrqdubrtogwbuddsa.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'tu-anon-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

const toTitleCase = (str: string) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase());
};

const readPersistedJson = async <T,>(key: string, fallback: T): Promise<T> => {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const raw = window.localStorage?.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } else {
      try {
        const AsyncStorageMod = require('@react-native-async-storage/async-storage');
        const asyncStorage = AsyncStorageMod?.default || AsyncStorageMod;
        if (asyncStorage && typeof asyncStorage.getItem === 'function') {
          const raw = await asyncStorage.getItem(key);
          if (raw) return JSON.parse(raw) as T;
        }
      } catch (_asErr) {}
    }
    const mem = (globalThis as any).__picktimeNotifStore?.[key];
    if (mem !== undefined) return mem as T;
  } catch (_e) {}
  return fallback;
};

// ==========================================
// 🔒 IMAGEN PRIVADA SUPABASE PARA LOGOS DE NEGOCIOS
// ==========================================
const DirectoryTenantLogo = ({
  path,
  name,
  brandColor = '#FF5E00',
  size = 52,
}: {
  path?: string | null;
  name?: string;
  brandColor?: string;
  size?: number;
}) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const resolveLogo = async () => {
      if (!path) return;
      if (path.startsWith('http://') || path.startsWith('https://')) {
        if (path.includes('/public/autoflow/')) {
          const clean = path.split('/public/autoflow/')[1];
          if (clean) {
            const { data } = await supabase.storage.from('autoflow').createSignedUrl(clean, 3600);
            if (isMounted && data?.signedUrl) {
              setSignedUrl(data.signedUrl);
              return;
            }
          }
        }
        if (isMounted) setSignedUrl(path);
        return;
      }

      const { data, error } = await supabase.storage.from('autoflow').createSignedUrl(path, 3600);
      if (isMounted) {
        if (error || !data?.signedUrl) setImgError(true);
        else setSignedUrl(data.signedUrl);
      }
    };
    resolveLogo();
    return () => {
      isMounted = false;
    };
  }, [path]);

  if (!path || imgError || !signedUrl) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: brandColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: Math.round(size * 0.42) }}>
          {name ? name.charAt(0).toUpperCase() : 'A'}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: signedUrl }}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        borderWidth: 1.5,
        borderColor: brandColor,
        backgroundColor: '#000',
      }}
      resizeMode="cover"
    />
  );
};

// ==========================================
// 🧩 ESTILOS WEB DINÁMICOS (DARK / LIGHT)
// ==========================================
const WebStyles = ({ tColor }: { tColor: any }) => {
  if (Platform.OS !== 'web') return null;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
      html, body { background-color: ${tColor.bg}; color: ${tColor.text}; margin: 0; padding: 0; overflow-x: hidden; transition: background-color 0.25s ease; -webkit-font-smoothing: antialiased; }
      * { font-family: 'Inter', system-ui, sans-serif; box-sizing: border-box; }
      .dir-card { transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.22s ease; cursor: pointer; }
      .dir-card:hover { transform: translateY(-4px); border-color: rgba(255, 94, 0, 0.55) !important; }
    `,
      }}
    />
  );
};

const KNOWN_CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  'rancho cucamonga': { lat: 34.1064, lon: -117.5931 },
  'ontario': { lat: 34.0633, lon: -117.6509 },
  'upland': { lat: 34.0975, lon: -117.6484 },
  'fontana': { lat: 34.0922, lon: -117.4350 },
  'san bernardino': { lat: 34.1083, lon: -117.2898 },
  'riverside': { lat: 33.9806, lon: -117.3755 },
  'pasadena': { lat: 34.1478, lon: -118.1445 },
  'los angeles': { lat: 34.0522, lon: -118.2437 },
  'pomona': { lat: 34.0551, lon: -117.7500 },
  'claremont': { lat: 34.0967, lon: -117.7198 },
  'corona': { lat: 33.8753, lon: -117.5664 },
  'irvine': { lat: 33.6846, lon: -117.8265 },
  'anaheim': { lat: 33.8366, lon: -117.9143 },
  'miami': { lat: 25.7617, lon: -80.1918 },
};

const haversineMiles = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
};

export default function DirectoryHomeScreen() {
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isMobile = width <= 850;
  const brandOrange = '#FF5E00';

  // 🌓 TEMA SINCRONIZADO GLOBALMENTE (DARK / LIGHT)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const gTheme = (globalThis as any).__autoflowTheme;
    if (gTheme === 'light' || gTheme === 'dark') return gTheme;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('autoflow_theme');
        if (saved === 'light' || saved === 'dark') return saved;
      } catch (_e) {}
    }
    return 'dark';
  });

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    (globalThis as any).__autoflowTheme = nextTheme;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('autoflow_theme', nextTheme);
      } catch (_e) {}
    }
  };

  // 🌐 IDIOMA SINCRONIZADO GLOBALMENTE (ES / EN)
  const [lang, setLang] = useState<'es' | 'en'>(() => {
    const gLang = (globalThis as any).__autoflowLang;
    if (gLang === 'en' || gLang === 'es') return gLang;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('autoflow_lang');
        if (saved === 'en' || saved === 'es') return saved;
      } catch (_e) {}
    }
    return 'es';
  });

  const handleToggleLang = () => {
    const nextLang = lang === 'es' ? 'en' : 'es';
    setLang(nextLang);
    (globalThis as any).__autoflowLang = nextLang;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('autoflow_lang', nextLang);
      } catch (_e) {}
    }
  };

  const tr = useCallback((esText: string, enText: string) => (lang === 'en' ? enText : esText), [lang]);

  const tColor = useMemo(
    () =>
      ({
        dark: {
          bg: '#05070C',
          card: 'rgba(18, 22, 28, 0.88)',
          text: '#FFFFFF',
          muted: '#94A3B8',
          border: 'rgba(255,255,255,0.08)',
          input: 'rgba(0, 0, 0, 0.45)',
          nav: 'rgba(5, 7, 12, 0.92)',
        },
        light: {
          bg: '#F1F5F9',
          card: '#FFFFFF',
          text: '#0F172A',
          muted: '#475569',
          border: 'rgba(15, 23, 42, 0.1)',
          input: '#F8FAFC',
          nav: 'rgba(241, 245, 249, 0.94)',
        },
      })[theme],
    [theme]
  );

  // 📍 ESTADOS DE BÚSQUEDA Y FILTROS
  const [locationQuery, setLocationQuery] = useState('');
  const [radiusMiles, setRadiusMiles] = useState<number>(15);
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [resolvedCityLabel, setResolvedCityLabel] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState<string>('');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);
  const [allTenants, setAllTenants] = useState<any[]>(() => {
    const gTenants = (globalThis as any).__picktimeTenantsCache;
    if (Array.isArray(gTenants) && gTenants.length > 0) return gTenants;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage?.getItem('picktime_tenants_cache_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (_e) {}
    }
    return [];
  });
  const [isLoadingTenants, setIsLoadingTenants] = useState<boolean>(() => {
    const gTenants = (globalThis as any).__picktimeTenantsCache;
    if (Array.isArray(gTenants) && gTenants.length > 0) return false;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage?.getItem('picktime_tenants_cache_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return false;
        }
      } catch (_e) {}
    }
    return true;
  });
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [isSearchingZip, setIsSearchingZip] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Sesión detectada (cliente y/o dueño-staff) para Push Token y bandeja por rol
  const [notifSession, setNotifSession] = useState<{
    userId: string;
    tenantId: string;
    staffId: string;
    hasBusinessAccess: boolean;
  }>({ userId: '', tenantId: '', staffId: '', hasBusinessAccess: false });

  const getApiBaseUrl = useCallback(() => {
    const rawBase =
      process.env.EXPO_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      (Platform.OS === 'web' ? 'http://localhost:4000' : 'https://saas-multinicho-platform.onrender.com');
    return String(rawBase).replace(/\/+$/, '');
  }, []);

  const loadNotifSession = useCallback(async () => {
    const clientSess = await readPersistedJson<any>('picktimebook_client_session_global', null);
    const bizSess = await readPersistedJson<any>('picktimebook_business_session_v1', null);

    const userId = String(clientSess?.userId || clientSess?.id || '').trim();
    const tenantId = String(bizSess?.tenantId || '').trim();
    const staffId = String(bizSess?.staffId || '').trim();
    const hasBusinessAccess = Boolean(tenantId);

    const resolved = { userId, tenantId, staffId, hasBusinessAccess };
    setNotifSession(resolved);
    return resolved;
  }, []);

  useEffect(() => {
    loadNotifSession();
  }, [loadNotifSession]);

  // 🔔 Registrar Push Token en BD y sincronizar el badge sobre el icono de la app
  usePushNotifications({
    apiUrl: getApiBaseUrl(),
    userId: notifSession.userId || null,
    tenantId: notifSession.tenantId || null,
    role: notifSession.hasBusinessAccess ? 'tenant_owner' : 'client',
    zipCode: /^\d{5}$/.test(locationQuery.trim()) ? locationQuery.trim() : null,
    latitude: userCoords?.lat ?? null,
    longitude: userCoords?.lon ?? null,
  });

  // ❤️ FAVORITOS SINCRONIZADOS CON LA VISTA INTERNA DEL NEGOCIO
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    const gFavs = (globalThis as any).__autoflowFavorites;
    if (Array.isArray(gFavs)) return gFavs;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('autoflow_favorites_v1');
        const parsed = saved ? JSON.parse(saved) : [];
        (globalThis as any).__autoflowFavorites = parsed;
        return parsed;
      } catch (_e) {}
    }
    return [];
  });

  const toggleFavoriteTenant = (tenantIdStr: string) => {
    const key = `tenant:${String(tenantIdStr).toLowerCase()}`;
    setFavoriteIds((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key];
      (globalThis as any).__autoflowFavorites = next;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('autoflow_favorites_v1', JSON.stringify(next));
        } catch (_e) {}
      }
      return next;
    });
  };

  useEffect(() => {
    const catParam = Array.isArray(categoryParam) ? categoryParam[0] : categoryParam;
    if (catParam && typeof catParam === 'string') {
      setSelectedCategory(catParam.toLowerCase());
    }
  }, [categoryParam]);

  // 🗂️ CATEGORÍAS DISPONIBLES (TRADUCIDAS ES / EN)
  const categories = useMemo(
    () => [
      {
        code: 'automotive',
        title: tr('Talleres & Auto', 'Auto & Repair Shops'),
        desc: tr('Mecánica, llantas y mantenimiento.', 'Mechanics, tires, and maintenance.'),
        iconFamily: 'Ionicons' as const,
        iconName: 'car-sport-outline',
        color: '#FF5E00',
      },
      {
        code: 'barbershop',
        title: tr('Barberías & Cortes', 'Barbershops & Cuts'),
        desc: tr('Cortes clásicos, fade y perfilado de barba.', 'Classic cuts, fades, and beard grooming.'),
        iconFamily: 'Feather' as const,
        iconName: 'scissors',
        color: '#F59E0B',
      },
      {
        code: 'spa',
        title: tr('Spas & Bienestar', 'Spas & Wellness'),
        desc: tr('Masajes, faciales y cuidado personal.', 'Massages, facials, and personal care.'),
        iconFamily: 'Ionicons' as const,
        iconName: 'sparkles-outline',
        color: '#10B981',
      },
      {
        code: 'legal',
        title: tr('Abogados & Legal', 'Lawyers & Legal'),
        desc: tr('Inmigración, familia, accidentes y contratos.', 'Immigration, family, injury, and contracts.'),
        iconFamily: 'Feather' as const,
        iconName: 'shield',
        color: '#3B82F6',
      },
      {
        code: 'dental',
        title: tr('Odontología & Salud', 'Dental & Clinics'),
        desc: tr('Limpieza, ortodoncia, diseño de sonrisa y urgencias.', 'Cleanings, orthodontics, smile design, and urgent care.'),
        iconFamily: 'MCI' as const,
        iconName: 'tooth-outline',
        color: '#06B6D4',
      },
    ],
    [tr]
  );

  const [isDetectingGps, setIsDetectingGps] = useState<boolean>(false);

  const loadDirectoryTenants = useCallback(async () => {
    const hasCached = allTenants.length > 0;
    if (!hasCached) setIsLoadingTenants(true);
    setDirectoryError(null);

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => {
          try {
            controller.abort('timeout');
          } catch {
            controller.abort();
          }
        }, 20000)
      : null;

    try {
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/directory/search?radius=5000`, {
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const list =
        (Array.isArray(data?.tenants) && data.tenants) ||
        (Array.isArray(data?.businesses) && data.businesses) ||
        (Array.isArray(data?.results) && data.results) ||
        (Array.isArray(data?.data) && data.data) ||
        (Array.isArray(data) && data) ||
        [];

      setAllTenants(list);
      (globalThis as any).__picktimeTenantsCache = list;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          window.localStorage?.setItem('picktime_tenants_cache_v1', JSON.stringify(list));
        } catch (_e) {}
      }
    } catch (err: any) {
      const isAbortErr = err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('aborted');
      if (isAbortErr) {
        console.warn('Tiempo de espera agotado consultando /api/directory/search');
      } else {
        console.error('Error cargando /api/directory/search:', err);
      }
      if (!hasCached) {
        setDirectoryError(
          err?.name === 'AbortError'
            ? tr(
                'El servidor tardó demasiado en responder (puede estar despertando).',
                'The server took too long to respond (it may be waking up).'
              )
            : tr(
                'No pudimos cargar los negocios en este momento.',
                'Could not load businesses right now.'
              )
        );
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setIsLoadingTenants(false);
    }
  }, [allTenants.length, getApiBaseUrl, tr]);

  const detectMyCurrentLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      setIsDetectingGps(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const uLat = pos.coords.latitude;
          const uLon = pos.coords.longitude;
          setUserCoords({ lat: uLat, lon: uLon });

          let detectedZipOrCity = '';
          let friendlyLabel = tr('Tu ubicación actual (GPS)', 'Your current location (GPS)');

          try {
            const revRes = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${uLat}&longitude=${uLon}&localityLanguage=en`
            );
            if (revRes.ok) {
              const revData = await revRes.json();
              const postal = String(revData?.postcode || '').trim();
              const cityStr = String(revData?.city || revData?.locality || '').trim();
              const stateStr = String(revData?.principalSubdivisionCode || '').replace('US-', '');
              if (postal && /^\d{5}/.test(postal)) {
                detectedZipOrCity = postal.slice(0, 5);
                friendlyLabel = `${cityStr || 'GPS'}${stateStr ? `, ${stateStr}` : ''} (${detectedZipOrCity})`;
              } else if (cityStr) {
                detectedZipOrCity = cityStr;
                friendlyLabel = `${cityStr}${stateStr ? `, ${stateStr}` : ''}`;
              }
            }
          } catch (_revErr) {}

          if (radiusMiles < 25) {
            setRadiusMiles(25);
          }

          setResolvedCityLabel(friendlyLabel);
          if (detectedZipOrCity) {
            setLocationQuery(detectedZipOrCity);
          }
          setIsDetectingGps(false);
        },
        () => {
          setIsDetectingGps(false);
        },
        { enableHighAccuracy: false, timeout: 6000 }
      );
    }
  };

  useEffect(() => {
    loadDirectoryTenants();
  }, [loadDirectoryTenants]);

  const handleSearchNearby = async () => {
    const q = locationQuery.trim();
    setIsSearchingZip(true);
    try {
      if (!q) {
        setUserCoords(null);
        setResolvedCityLabel('');
        return;
      }

      const cleanZip = q.replace(/\D/g, '');
      if (cleanZip.length === 5) {
        try {
          const resZip = await fetch(`https://api.zippopotam.us/us/${cleanZip}`);
          if (resZip.ok) {
            const dataZip = await resZip.json();
            const place = dataZip?.places?.[0];
            if (place) {
              setUserCoords({
                lat: Number(place.latitude),
                lon: Number(place.longitude),
              });
              setResolvedCityLabel(`${place['place name']}, ${place['state abbreviation']} (${cleanZip})`);
              return;
            }
          }
        } catch (_zErr) {}
      }

      const cityKey = q.toLowerCase().trim();
      if (KNOWN_CITY_COORDS[cityKey]) {
        setUserCoords(KNOWN_CITY_COORDS[cityKey]);
        setResolvedCityLabel(`${toTitleCase(q)} (${radiusMiles} mi)`);
      } else {
        setUserCoords(null);
        setResolvedCityLabel(toTitleCase(q));
      }
    } catch (_e) {
    } finally {
      setIsSearchingZip(false);
    }
  };

  const getTenantBadgeInfo = useCallback(
    (
      item: any
    ): {
      kind: 'elite' | 'promo' | 'starter';
      isPremiumShowcase: boolean;
      badgeText: string | null;
      promoSubText: string | null;
    } => {
      const rawTier = String(item.planTier || item.plan_tier || item.plan || '').toLowerCase().trim();
      const rawPayment = String(item.paymentMethod || item.payment_method || '').toLowerCase().trim();

      let parsedLoyalty = item.loyaltyConfig || item.loyalty_config;
      if (typeof parsedLoyalty === 'string') {
        try {
          parsedLoyalty = JSON.parse(parsedLoyalty);
        } catch (_e) {
          parsedLoyalty = null;
        }
      }

      const activeCampaign = Array.isArray(parsedLoyalty?.campaigns)
        ? parsedLoyalty.campaigns.find((c: any) => c && c.is_active !== false)
        : null;
      const hasReferralPromo = Boolean(parsedLoyalty?.referralActive);
      const referralPct = Number(parsedLoyalty?.referralDiscountPercent || 20);
      const hasCouponAttr = Boolean(
        item.promoCode ||
          item.promo_code ||
          item.promoCodeId ||
          item.promo_code_id ||
          rawPayment === 'promo_code' ||
          parsedLoyalty?.promoCode
      );

      if (rawTier === 'elite' || rawTier === 'élite') {
        return {
          kind: 'elite',
          isPremiumShowcase: true,
          badgeText: tr('👑 PLAN ÉLITE • SERVICIO PREMIUM', '👑 ELITE PLAN • PREMIUM SERVICE'),
          promoSubText: activeCampaign?.title
            ? `📢 ${toTitleCase(activeCampaign.title)}`
            : hasReferralPromo
            ? tr(`🎁 Bono Referidos -${referralPct}% Activo`, `🎁 Referral Bonus -${referralPct}% Active`)
            : tr('⭐ Socio Verificado Nivel Élite', '⭐ Verified Elite Partner'),
        };
      }

      if (hasCouponAttr || activeCampaign || hasReferralPromo) {
        const label = activeCampaign?.title
          ? `🔥 ${toTitleCase(activeCampaign.title)}`
          : hasCouponAttr
          ? tr('🎟️ CUPÓN ACTIVO • IMPULSO LANZAMIENTO', '🎟️ ACTIVE COUPON • LAUNCH BOOST')
          : tr(`🔥 PROMO ATRACCIÓN • -${referralPct}% REFERIDOS`, `🔥 LAUNCH PROMO • -${referralPct}% REFERRAL`);

        return {
          kind: 'promo',
          isPremiumShowcase: true,
          badgeText: label,
          promoSubText: hasReferralPromo
            ? tr(`🎁 Gana -${referralPct}% recomendando amigos`, `🎁 Get -${referralPct}% referring friends`)
            : tr('🎁 Temporada Especial de Atracción de Clientes', '🎁 Special Client Attraction Offer'),
        };
      }

      const nameLower = String(item.name || '').toLowerCase();
      if (nameLower.includes('picktime') || nameLower.includes('autoflow')) {
        return {
          kind: 'elite',
          isPremiumShowcase: true,
          badgeText: tr('👑 PLAN ÉLITE • SERVICIO PREMIUM', '👑 ELITE PLAN • PREMIUM SERVICE'),
          promoSubText: tr('⭐ Socio Verificado Nivel Élite', '⭐ Verified Elite Partner'),
        };
      }
      if (
        nameLower.includes('latas') ||
        nameLower.includes('sonrisa') ||
        nameLower.includes('gómez') ||
        nameLower.includes('gomez')
      ) {
        return {
          kind: 'promo',
          isPremiumShowcase: true,
          badgeText: tr('🎟️ CUPÓN ACTIVO • IMPULSO LANZAMIENTO', '🎟️ ACTIVE COUPON • LAUNCH BOOST'),
          promoSubText: tr('🎁 Temporada Especial de Atracción de Clientes', '🎁 Special Client Attraction Offer'),
        };
      }

      return {
        kind: 'starter',
        isPremiumShowcase: false,
        badgeText: null,
        promoSubText: null,
      };
    },
    [tr]
  );

  const tenantsWithDistance = useMemo(() => {
    const mapped = allTenants.map((item) => {
      const rawNiche = String(item.niche || item.businessType || item.business_type || 'automotive').toLowerCase();
      let tLat = Number(item.latitude || 0);
      let tLon = Number(item.longitude || 0);

      if ((!tLat || !tLon) && item.city) {
        const cKey = String(item.city).toLowerCase().trim();
        if (KNOWN_CITY_COORDS[cKey]) {
          tLat = KNOWN_CITY_COORDS[cKey].lat;
          tLon = KNOWN_CITY_COORDS[cKey].lon;
        }
      }

      let distMiles: number | null = null;
      if (userCoords && tLat && tLon) {
        distMiles = haversineMiles(userCoords.lat, userCoords.lon, tLat, tLon);
      }

      const badgeInfo = getTenantBadgeInfo(item);

      return {
        ...item,
        normalizedNiche: rawNiche,
        distanceMiles: distMiles,
        tierKind: badgeInfo.kind,
        isPremiumShowcase: badgeInfo.isPremiumShowcase,
        badgeText: badgeInfo.badgeText,
        promoSubText: badgeInfo.promoSubText,
      };
    });

    const filtered = mapped.filter((item) => {
      if (userCoords && item.distanceMiles !== null) {
        return item.distanceMiles <= radiusMiles;
      }
      if (locationQuery.trim() && !/^\d{5}$/.test(locationQuery.trim()) && !userCoords) {
        const qLower = locationQuery.trim().toLowerCase();
        const matchCity = String(item.city || '').toLowerCase().includes(qLower);
        const matchZip = String(item.zipCode || item.zip_code || '').toLowerCase().includes(qLower);
        const matchName = String(item.name || '').toLowerCase().includes(qLower);
        const matchAddr = String(item.address || '').toLowerCase().includes(qLower);
        if (!matchCity && !matchZip && !matchName && !matchAddr) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (a.distanceMiles !== null && b.distanceMiles !== null && a.distanceMiles !== b.distanceMiles) {
        return a.distanceMiles - b.distanceMiles;
      }
      const rank = (k: string) => (k === 'elite' ? 0 : k === 'promo' ? 1 : 2);
      return rank(a.tierKind) - rank(b.tierKind);
    });
  }, [allTenants, userCoords, radiusMiles, locationQuery, getTenantBadgeInfo]);

  const countsByCategory = useMemo(() => {
    const map: Record<string, number> = {
      automotive: 0,
      barbershop: 0,
      spa: 0,
      legal: 0,
      dental: 0,
    };
    tenantsWithDistance.forEach((item) => {
      const n = item.normalizedNiche;
      if (map[n] !== undefined) map[n] += 1;
      else map.automotive += 1;
    });
    return map;
  }, [tenantsWithDistance]);

  const filteredBusinessesList = useMemo(() => {
    const cleanNameQ = nameQuery.trim().toLowerCase();
    return tenantsWithDistance
      .filter((item) => {
        if (selectedCategory && item.normalizedNiche !== selectedCategory) return false;
        if (onlyFavorites) {
          const favKey = `tenant:${String(item.id).toLowerCase()}`;
          if (!favoriteIds.includes(favKey)) return false;
        }
        if (cleanNameQ) {
          const bName = String(item.name || '').toLowerCase();
          const bCity = String(item.city || '').toLowerCase();
          const bAddr = String(item.address || '').toLowerCase();
          if (!bName.includes(cleanNameQ) && !bCity.includes(cleanNameQ) && !bAddr.includes(cleanNameQ)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const aFav = favoriteIds.includes(`tenant:${String(a.id).toLowerCase()}`) ? 1 : 0;
        const bFav = favoriteIds.includes(`tenant:${String(b.id).toLowerCase()}`) ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
        return 0;
      });
  }, [tenantsWithDistance, selectedCategory, onlyFavorites, favoriteIds, nameQuery]);

  const radiusOptions = [5, 10, 15, 25, 50];

  return (
    <View style={[styles.root, { backgroundColor: tColor.bg }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
      <WebStyles tColor={tColor} />

      {/* ============================================================== */}
      {/* 🌟 HEADER SUPERIOR DINÁMICO (PORTADA VS VISTA DE CATEGORÍA)    */}
      {/* ============================================================== */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: tColor.nav,
            borderBottomColor: tColor.border,
            paddingTop: SAFE_TOP_INSET || (isMobile ? 14 : 18),
            paddingHorizontal: isMobile ? 16 : 40,
            paddingBottom: isMobile ? 12 : 16,
          },
        ]}
      >
        {selectedCategory ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setSelectedCategory(null);
              setNameQuery('');
              setOnlyFavorites(false);
            }}
            style={{
              height: 40,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: tColor.card,
              borderWidth: 1,
              borderColor: tColor.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Feather name="arrow-left" size={16} color={tColor.text} />
            <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 13.5 }}>
              {tr('Volver a Categorías', 'Back to Categories')}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setSelectedCategory(null);
              setNameQuery('');
              setOnlyFavorites(false);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 9 : 12, flexShrink: 0 }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                backgroundColor: '#000000',
                borderWidth: 2.5,
                borderColor: brandOrange,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Image
                source={require('../assets/images/logopicktime.jpg')}
                style={{ width: '90%', height: '90%', transform: [{ scale: 1.55 }] }}
                resizeMode="contain"
              />
            </View>
            <Text
              style={{
                color: tColor.text,
                fontSize: isMobile ? 15 : 22,
                fontWeight: '900',
                letterSpacing: -0.2,
                flexShrink: 0,
              }}
              numberOfLines={1}
            >
              Pick-Time <Text style={{ color: '#FF5E00' }}>Book</Text>
            </Text>
          </TouchableOpacity>
        )}

        {/* Controles Derechos */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 8 : 10, flexShrink: 0 }}>
          {!selectedCategory ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setIsSettingsOpen(false);
                router.push('/register' as any);
              }}
              style={{
                height: isMobile ? 36 : 42,
                paddingHorizontal: isMobile ? 11 : 16,
                borderRadius: isMobile ? 11 : 12,
                backgroundColor: 'rgba(255, 94, 0, 0.12)',
                borderWidth: 1,
                borderColor: brandOrange,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Feather name="briefcase" size={13} color={brandOrange} />
              <Text style={{ color: brandOrange, fontWeight: '900', fontSize: isMobile ? 12 : 13.5 }} numberOfLines={1}>
                {isMobile ? tr('Negocios', 'Business') : tr('Soy un Negocio', 'For Business')}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setSelectedCategory(null);
                setNameQuery('');
                setOnlyFavorites(false);
              }}
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                backgroundColor: brandOrange,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  backgroundColor: '#000000',
                  borderWidth: 2.5,
                  borderColor: brandOrange,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Image
                  source={require('../assets/images/logopicktime.jpg')}
                  style={{ width: '90%', height: '90%', transform: [{ scale: 1.55 }] }}
                  resizeMode="contain"
                />
              </View>
            </TouchableOpacity>
          )}

          {/* 🔔 Componente Reutilizable NotificationCenter (Campana + Badge + Bottom Sheet) */}
          <NotificationCenter
            tColor={tColor}
            theme={theme}
            lang={lang}
            brandColor={brandOrange}
            isMobile={isMobile}
            apiBaseUrl={getApiBaseUrl()}
            currentTenantId={notifSession.tenantId || null}
            clientUserId={notifSession.userId || null}
            staffId={notifSession.staffId || null}
            hasBusinessAccess={notifSession.hasBusinessAccess}
            onOpen={() => {
              setIsSettingsOpen(false);
              loadNotifSession();
            }}
          />

          {/* ⚙️ Botón Único de Configuración (Idioma ES/EN + Tema Light/Dark) */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setIsSettingsOpen((prev) => !prev)}
            accessibilityLabel={tr('Abrir preferencias de idioma y apariencia', 'Open language and appearance settings')}
            style={{
              width: isMobile ? 36 : undefined,
              height: isMobile ? 36 : 42,
              paddingHorizontal: isMobile ? 0 : 15,
              borderRadius: isMobile ? 11 : 12,
              backgroundColor: isSettingsOpen ? `${brandOrange}22` : tColor.input,
              borderWidth: 1.5,
              borderColor: isSettingsOpen ? brandOrange : tColor.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Feather
              name="settings"
              size={16}
              color={isSettingsOpen ? brandOrange : tColor.text}
            />
            {!isMobile ? (
              <View
                style={{
                  paddingHorizontal: 5,
                  paddingVertical: 2,
                  borderRadius: 6,
                  backgroundColor: isSettingsOpen ? brandOrange : tColor.border,
                }}
              >
                <Text
                  style={{
                    color: isSettingsOpen ? '#FFFFFF' : tColor.text,
                    fontSize: 10,
                    fontWeight: '900',
                  }}
                >
                  {lang.toUpperCase()}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      {/* ⚙️ POPOVER FLOTANTE DE CONFIGURACIÓN (IDIOMA + TEMA CLARO / OSCURO) */}
      {isSettingsOpen ? (
        <>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setIsSettingsOpen(false)}
            style={{
              position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(2, 6, 23, 0.45)',
              backdropFilter: Platform.OS === 'web' ? 'blur(4px)' : undefined,
              zIndex: 240,
            } as any}
          />
          <View
            style={{
              position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
              top: Platform.OS === 'ios' ? 110 : Platform.OS === 'android' ? 96 : 74,
              right: isMobile ? 14 : 40,
              width: isMobile ? Math.min(width - 28, 330) : 320,
              backgroundColor: theme === 'dark' ? '#0B0F17' : '#FFFFFF',
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: tColor.border,
              padding: 18,
              zIndex: 250,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 16 },
              shadowOpacity: 0.45,
              shadowRadius: 28,
              elevation: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 12,
                marginBottom: 14,
                borderBottomWidth: 1,
                borderBottomColor: tColor.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: `${brandOrange}20`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="sliders" size={14} color={brandOrange} />
                </View>
                <Text style={{ color: tColor.text, fontSize: 14.5, fontWeight: '900' }}>
                  {tr('Preferencias', 'Preferences')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsSettingsOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={18} color={tColor.muted} />
              </TouchableOpacity>
            </View>

            <Text
              style={{
                color: tColor.muted,
                fontSize: 11,
                fontWeight: '900',
                textTransform: 'uppercase',
                letterSpacing: 0.7,
                marginBottom: 8,
              }}
            >
              🌐 {tr('Idioma de la App', 'App Language')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: tColor.input,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: tColor.border,
                padding: 4,
                gap: 6,
                marginBottom: 16,
              }}
            >
              {[
                { key: 'es', flag: '🇪🇸', label: 'Español' },
                { key: 'en', flag: '🇺🇸', label: 'English' },
              ].map((item) => {
                const active = lang === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (lang !== item.key) handleToggleLang();
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 9,
                      backgroundColor: active ? brandOrange : 'transparent',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>{item.flag}</Text>
                    <Text
                      style={{
                        color: active ? '#FFFFFF' : tColor.muted,
                        fontWeight: '900',
                        fontSize: 13,
                      }}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text
              style={{
                color: tColor.muted,
                fontSize: 11,
                fontWeight: '900',
                textTransform: 'uppercase',
                letterSpacing: 0.7,
                marginBottom: 8,
              }}
            >
              🌓 {tr('Tema Visual', 'Appearance')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: tColor.input,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: tColor.border,
                padding: 4,
                gap: 6,
              }}
            >
              {[
                { key: 'dark', icon: 'moon', iconColor: '#38BDF8', label: tr('Oscuro', 'Dark') },
                { key: 'light', icon: 'sun', iconColor: '#F59E0B', label: tr('Claro', 'Light') },
              ].map((tOpt) => {
                const active = theme === tOpt.key;
                return (
                  <TouchableOpacity
                    key={tOpt.key}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (theme !== tOpt.key) handleToggleTheme();
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 9,
                      backgroundColor: active ? brandOrange : 'transparent',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Feather name={tOpt.icon as any} size={14} color={active ? '#FFFFFF' : tOpt.iconColor} />
                    <Text
                      style={{
                        color: active ? '#FFFFFF' : tColor.muted,
                        fontWeight: '900',
                        fontSize: 13,
                      }}
                    >
                      {tOpt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </>
      ) : null}

      {/* ============================================================== */}
      {/* 🔎 CONTENIDO PRINCIPAL:                                        */}
      {/*    MODO A) VISTA DEDICADA DE CATEGORÍA                           */}
      {/*    MODO B) PORTADA PRINCIPAL (BUSCADOR + CATEGORÍAS + PREMIUM) */}
      {/* ============================================================== */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: isMobile ? 16 : 40,
            paddingTop: isMobile ? 20 : 32,
            paddingBottom: 64,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center' }}>
          {selectedCategory ? (
            (() => {
              const selectedCatObj = categories.find((c) => c.code === selectedCategory);
              const catAccent = selectedCatObj?.color || brandOrange;

              return (
                <View>
                  <View style={{ marginBottom: 20 }}>
                    <Text
                      style={{
                        fontSize: isMobile ? 28 : 38,
                        fontWeight: '900',
                        color: tColor.text,
                        letterSpacing: -0.4,
                      }}
                    >
                      {selectedCatObj?.title || tr('Negocios', 'Businesses')}
                    </Text>
                    <Text style={{ color: tColor.muted, fontSize: 14, marginTop: 4 }}>
                      {selectedCatObj?.desc ||
                        tr('Explora los negocios disponibles en esta categoría.', 'Explore available businesses in this category.')}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.searchCard,
                      {
                        backgroundColor: tColor.card,
                        borderColor: tColor.border,
                        padding: isMobile ? 16 : 22,
                        marginBottom: 22,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 0 }]}>
                        {tr('¿BUSCAS UN NEGOCIO EN ESPECÍFICO?', 'LOOKING FOR A SPECIFIC BUSINESS?')}
                      </Text>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setOnlyFavorites((prev) => !prev)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: 20,
                          backgroundColor: onlyFavorites ? 'rgba(239, 68, 68, 0.18)' : tColor.input,
                          borderWidth: 1,
                          borderColor: onlyFavorites ? '#EF4444' : tColor.border,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Ionicons
                          name={onlyFavorites ? 'heart' : 'heart-outline'}
                          size={14}
                          color={onlyFavorites ? '#EF4444' : tColor.muted}
                        />
                        <Text
                          style={{
                            color: onlyFavorites ? '#EF4444' : tColor.text,
                            fontSize: 12,
                            fontWeight: '900',
                          }}
                        >
                          {onlyFavorites ? tr('Solo Favoritos ✓', 'Favorites Only ✓') : tr('Favoritos', 'Favorites')}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: tColor.input,
                        borderWidth: 1,
                        borderColor: nameQuery.trim() ? catAccent : tColor.border,
                        borderRadius: 14,
                        height: 50,
                        paddingHorizontal: 14,
                        gap: 10,
                      }}
                    >
                      <Feather name="search" size={16} color={tColor.muted} />
                      <TextInput
                        style={{
                          flex: 1,
                          color: tColor.text,
                          fontSize: 15,
                          fontWeight: '600',
                          outlineStyle: 'none',
                        } as any}
                        placeholder={tr('Buscar por nombre de negocio...', 'Search by business name...')}
                        placeholderTextColor={tColor.muted}
                        value={nameQuery}
                        onChangeText={setNameQuery}
                      />
                      {nameQuery.length > 0 ? (
                        <TouchableOpacity onPress={() => setNameQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Feather name="x-circle" size={17} color={tColor.muted} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {isLoadingTenants ? (
                    <View
                      style={{
                        backgroundColor: tColor.card,
                        borderColor: tColor.border,
                        borderWidth: 1,
                        borderRadius: 20,
                        padding: 40,
                        alignItems: 'center',
                      }}
                    >
                      <ActivityIndicator size="large" color={catAccent} />
                    </View>
                  ) : filteredBusinessesList.length === 0 ? (
                    <View
                      style={{
                        backgroundColor: tColor.card,
                        borderColor: tColor.border,
                        borderWidth: 1,
                        borderRadius: 20,
                        padding: 36,
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons name="search-outline" size={30} color={tColor.muted} />
                      <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 16, marginTop: 10, textAlign: 'center' }}>
                        {onlyFavorites
                          ? tr('Aún no tienes negocios marcados en Favoritos aquí', 'You have no Favorite businesses here yet')
                          : tr(`No encontramos negocios con "${nameQuery}"`, `No businesses found matching "${nameQuery}"`)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setNameQuery('');
                          setOnlyFavorites(false);
                        }}
                        style={{
                          marginTop: 14,
                          paddingHorizontal: 16,
                          paddingVertical: 9,
                          borderRadius: 10,
                          backgroundColor: catAccent,
                        }}
                      >
                        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>
                          {tr('Mostrar todos en esta categoría', 'Show all in this category')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', gap: 16 }}>
                      {filteredBusinessesList.map((biz, idx) => {
                        const tColorPrimary = biz.primaryColor || biz.primary_color || catAccent;
                        const favKey = `tenant:${String(biz.id).toLowerCase()}`;
                        const isFav = favoriteIds.includes(favKey);

                        let parsedLoyalty = biz.loyaltyConfig || biz.loyalty_config;
                        if (typeof parsedLoyalty === 'string') {
                          try {
                            parsedLoyalty = JSON.parse(parsedLoyalty);
                          } catch (_e) {
                            parsedLoyalty = null;
                          }
                        }
                        const reviewsArr = Array.isArray(parsedLoyalty?.reviews) ? parsedLoyalty.reviews : [];
                        const revCount = reviewsArr.length;
                        const avgRating =
                          revCount > 0
                            ? (
                                reviewsArr.reduce((acc: number, r: any) => acc + Number(r?.rating || 5), 0) / revCount
                              ).toFixed(1)
                            : '4.9';

                        const distDisplay = biz.distanceMiles !== null ? biz.distanceMiles : '2.4';
                        const cityZipText = [
                          biz.city ? toTitleCase(biz.city) : '',
                          biz.zipCode || biz.zip_code || '',
                        ]
                          .filter(Boolean)
                          .join(', ');

                        return (
                          <TouchableOpacity
                            key={`${biz.id}-${idx}`}
                            activeOpacity={0.9}
                            {...(Platform.OS === 'web' ? { className: 'dir-card' } : ({} as any))}
                            onPress={() => router.push(`/${biz.id}` as any)}
                            style={[
                              styles.businessCard,
                              {
                                backgroundColor: tColor.card,
                                borderColor: isFav ? '#EF4444' : tColor.border,
                                borderWidth: isFav ? 1.5 : 1,
                                minWidth: isMobile ? '100%' : 340,
                                flex: 1,
                                padding: 20,
                              },
                            ]}
                          >
                            <View
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                marginBottom: 16,
                              }}
                            >
                              {biz.logoUrl || biz.logo_url ? (
                                <DirectoryTenantLogo
                                  path={biz.logoUrl || biz.logo_url}
                                  name={biz.name}
                                  brandColor={tColorPrimary}
                                  size={52}
                                />
                              ) : (
                                <View
                                  style={{
                                    width: 52,
                                    height: 52,
                                    borderRadius: 14,
                                    backgroundColor: `${tColorPrimary}18`,
                                    borderWidth: 1,
                                    borderColor: `${tColorPrimary}45`,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  {selectedCatObj?.iconFamily === 'Feather' && (
                                    <Feather name={selectedCatObj.iconName as any} size={22} color={tColorPrimary} />
                                  )}
                                  {selectedCatObj?.iconFamily === 'Ionicons' && (
                                    <Ionicons name={selectedCatObj.iconName as any} size={23} color={tColorPrimary} />
                                  )}
                                  {selectedCatObj?.iconFamily === 'MCI' && (
                                    <MaterialCommunityIcons
                                      name={selectedCatObj.iconName as any}
                                      size={23}
                                      color={tColorPrimary}
                                    />
                                  )}
                                </View>
                              )}

                              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 4,
                                      paddingHorizontal: 10,
                                      paddingVertical: 4,
                                      borderRadius: 12,
                                      backgroundColor: 'rgba(245, 158, 11, 0.14)',
                                      borderWidth: 1,
                                      borderColor: 'rgba(245, 158, 11, 0.45)',
                                    }}
                                  >
                                    <Ionicons name="star" size={12} color="#F59E0B" />
                                    <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '900' }}>
                                      {avgRating} ({revCount})
                                    </Text>
                                  </View>

                                  <TouchableOpacity
                                    onPress={() => toggleFavoriteTenant(biz.id)}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    style={{
                                      width: 30,
                                      height: 30,
                                      borderRadius: 15,
                                      backgroundColor: isFav ? 'rgba(239, 68, 68, 0.18)' : tColor.input,
                                      borderWidth: 1,
                                      borderColor: isFav ? '#EF4444' : tColor.border,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <Ionicons
                                      name={isFav ? 'heart' : 'heart-outline'}
                                      size={15}
                                      color={isFav ? '#EF4444' : tColor.muted}
                                    />
                                  </TouchableOpacity>
                                </View>

                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                    borderRadius: 12,
                                    backgroundColor: 'rgba(59, 130, 246, 0.14)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(59, 130, 246, 0.4)',
                                  }}
                                >
                                  <Feather name="navigation" size={11} color="#60A5FA" />
                                  <Text style={{ color: '#60A5FA', fontSize: 11.5, fontWeight: '800' }}>
                                    {tr(`A ${distDisplay} millas`, `${distDisplay} mi away`)}
                                  </Text>
                                </View>
                              </View>
                            </View>

                            <Text style={{ color: tColor.text, fontSize: 21, fontWeight: '900', marginBottom: 4 }}>
                              {toTitleCase(biz.name || 'Negocio Verificado')}
                            </Text>
                            <Text style={{ color: tColor.muted, fontSize: 13.5, marginBottom: 16 }}>
                              {selectedCatObj?.title || tr('Servicio Verificado', 'Verified Service')}
                              {cityZipText ? `  •  ${cityZipText}` : ''}
                            </Text>

                            <View
                              style={{
                                borderTopWidth: 1,
                                borderTopColor: tColor.border,
                                paddingTop: 14,
                                gap: 10,
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                                <Text style={{ color: '#10B981', fontSize: 12.5, fontWeight: '800' }}>
                                  {tr('Turnos disponibles hoy', 'Slots available today')}
                                </Text>
                              </View>

                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{ color: tColorPrimary, fontSize: 14.5, fontWeight: '900' }}>
                                  {tr('Ver Catálogo y Agendar', 'View Catalog & Book')}
                                </Text>
                                <Feather name="arrow-right" size={15} color={tColorPrimary} />
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()
          ) : (
            <>
              <View style={{ marginBottom: isMobile ? 20 : 28 }}>
                <Text
                  style={{
                    fontSize: isMobile ? 32 : 46,
                    fontWeight: '900',
                    color: tColor.text,
                    lineHeight: isMobile ? 38 : 54,
                    letterSpacing: -0.6,
                  }}
                >
                  {tr('Encuentra ', 'Find ')}
                  <Text style={{ color: brandOrange }}>{tr('Servicios', 'Services')}</Text>
                  {' '}
                  {tr('Cerca de Ti', 'Near You')}
                </Text>
                <Text
                  style={{
                    color: tColor.muted,
                    fontSize: isMobile ? 14.5 : 16,
                    lineHeight: 22,
                    marginTop: 8,
                    maxWidth: 620,
                  }}
                >
                  {tr(
                    'Directorio inteligente. Explora negocios verificados en tu área.',
                    'Smart directory. Explore verified businesses in your area.'
                  )}
                </Text>
              </View>

              <View
                style={[
                  styles.searchCard,
                  {
                    backgroundColor: tColor.card,
                    borderColor: tColor.border,
                    padding: isMobile ? 18 : 26,
                    marginBottom: isMobile ? 28 : 36,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 0 }]}>
                    {tr('TU UBICACIÓN (ZIP / CIUDAD)', 'YOUR LOCATION (ZIP / CITY)')}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={detectMyCurrentLocation}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 8,
                      backgroundColor: `${brandOrange}18`,
                      borderWidth: 1,
                      borderColor: `${brandOrange}50`,
                    }}
                  >
                    <Feather name="navigation" size={11} color={brandOrange} />
                    <Text style={{ color: brandOrange, fontSize: 11, fontWeight: '900' }}>
                      {isDetectingGps
                        ? tr('Detectando GPS...', 'Detecting GPS...')
                        : tr('Usar mi ubicación actual', 'Use my current location')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[
                    styles.locationInput,
                    {
                      backgroundColor: tColor.input,
                      borderColor: tColor.border,
                      color: tColor.text,
                    },
                  ]}
                  placeholder={tr('Ej: 91730 o Los Angeles', 'e.g., 91730 or Los Angeles')}
                  placeholderTextColor={tColor.muted}
                  value={locationQuery}
                  onChangeText={setLocationQuery}
                  onSubmitEditing={handleSearchNearby}
                />

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 18,
                    marginBottom: 10,
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 0 }]}>
                    {tr('RADIO DE BÚSQUEDA', 'SEARCH RADIUS')}
                  </Text>
                  <Text style={{ color: brandOrange, fontSize: 12.5, fontWeight: '900' }}>
                    ⚡ {radiusMiles} {tr('Millas a la Redonda', 'Miles Around')}
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: tColor.input,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: tColor.border,
                    padding: 5,
                    marginBottom: 18,
                  }}
                >
                  {radiusOptions.map((mi) => {
                    const isSelected = radiusMiles === mi;
                    return (
                      <TouchableOpacity
                        key={mi}
                        activeOpacity={0.85}
                        onPress={() => setRadiusMiles(mi)}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor: isSelected ? brandOrange : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            color: isSelected ? '#FFFFFF' : tColor.muted,
                            fontWeight: isSelected ? '900' : '700',
                            fontSize: 13,
                          }}
                        >
                          {mi} mi
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleSearchNearby}
                  disabled={isSearchingZip}
                  style={[styles.primarySearchBtn, { backgroundColor: brandOrange }]}
                >
                  <Feather name="search" size={17} color="#FFFFFF" />
                  <Text style={styles.primarySearchBtnText}>
                    {isSearchingZip
                      ? tr('Buscando ubicación...', 'Searching location...')
                      : tr('Buscar Negocios Cercanos', 'Search Nearby Businesses')}
                  </Text>
                </TouchableOpacity>

                {resolvedCityLabel ? (
                  <View
                    style={{
                      marginTop: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(16, 185, 129, 0.35)',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: '#10B981', fontSize: 12.5, fontWeight: '800' }}>
                      📍 {tr('Filtrando cerca de:', 'Filtering near:')} {resolvedCityLabel}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setLocationQuery('');
                        setUserCoords(null);
                        setResolvedCityLabel('');
                      }}
                    >
                      <Text style={{ color: tColor.muted, fontSize: 12, fontWeight: '800' }}>
                        {tr('Limpiar ✕', 'Clear ✕')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: tColor.text, fontSize: isMobile ? 20 : 24, fontWeight: '900' }}>
                  {tr('Categorías Disponibles', 'Available Categories')}
                </Text>
              </View>

              <View
                style={{
                  flexDirection: isMobile ? 'column' : 'row',
                  flexWrap: 'wrap',
                  gap: 16,
                  marginBottom: 32,
                }}
              >
                {categories.map((cat) => {
                  const count = countsByCategory[cat.code] || 0;
                  return (
                    <TouchableOpacity
                      key={cat.code}
                      activeOpacity={0.88}
                      {...(Platform.OS === 'web' ? { className: 'dir-card' } : ({} as any))}
                      onPress={() => {
                        setNameQuery('');
                        setOnlyFavorites(false);
                        setSelectedCategory(cat.code);
                      }}
                      style={[
                        styles.categoryCard,
                        {
                          backgroundColor: tColor.card,
                          borderColor: tColor.border,
                          borderWidth: 1,
                          minWidth: isMobile ? '100%' : 310,
                          flex: 1,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                        <View
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 14,
                            backgroundColor: `${cat.color}18`,
                            borderWidth: 1,
                            borderColor: `${cat.color}40`,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {cat.iconFamily === 'Feather' && <Feather name={cat.iconName as any} size={22} color={cat.color} />}
                          {cat.iconFamily === 'Ionicons' && <Ionicons name={cat.iconName as any} size={23} color={cat.color} />}
                          {cat.iconFamily === 'MCI' && (
                            <MaterialCommunityIcons name={cat.iconName as any} size={23} color={cat.color} />
                          )}
                        </View>

                        <View
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 5,
                            borderRadius: 20,
                            backgroundColor: `${cat.color}18`,
                            borderWidth: 1,
                            borderColor: cat.color,
                          }}
                        >
                          <Text style={{ color: cat.color, fontSize: 12, fontWeight: '900' }}>
                            {count} {tr('Cerca', 'Nearby')}
                          </Text>
                        </View>
                      </View>

                      <Text style={{ color: tColor.text, fontSize: 20, fontWeight: '900', marginBottom: 6 }}>
                        {cat.title}
                      </Text>
                      <Text style={{ color: tColor.muted, fontSize: 13.5, lineHeight: 19, marginBottom: 16 }}>
                        {cat.desc}
                      </Text>

                      <View
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: tColor.border,
                          paddingTop: 14,
                          flexDirection: 'row',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Text style={{ color: cat.color, fontWeight: '900', fontSize: 13.5 }}>
                          {`${tr('Ver', 'View')} ${count} ${
                            count === 1 ? tr('negocio', 'business') : tr('negocios', 'businesses')
                          }`}
                        </Text>
                        <Feather name="arrow-right" size={15} color={cat.color} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {(() => {
                const premiumList = filteredBusinessesList.filter((b) => b.isPremiumShowcase);

                if (isLoadingTenants && allTenants.length === 0) {
                  return (
                    <View
                      style={{
                        backgroundColor: tColor.card,
                        borderColor: tColor.border,
                        borderWidth: 1,
                        borderRadius: 20,
                        padding: 40,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ActivityIndicator size="large" color={brandOrange} />
                      <Text style={{ color: tColor.muted, marginTop: 12, fontWeight: '700' }}>
                        {tr('Cargando Servicios Premium...', 'Loading Premium Services...')}
                      </Text>
                    </View>
                  );
                }

                if (directoryError && allTenants.length === 0) {
                  return (
                    <View
                      style={{
                        backgroundColor: tColor.card,
                        borderColor: tColor.border,
                        borderWidth: 1,
                        borderRadius: 20,
                        padding: 28,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12,
                      }}
                    >
                      <Feather name="wifi-off" size={24} color={brandOrange} />
                      <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 15, textAlign: 'center' }}>
                        {directoryError}
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={loadDirectoryTenants}
                        style={{
                          backgroundColor: brandOrange,
                          paddingHorizontal: 18,
                          paddingVertical: 10,
                          borderRadius: 12,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Feather name="refresh-cw" size={14} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>
                          {tr('Reintentar ahora', 'Retry now')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }

                if (premiumList.length === 0) return null;

                return (
                  <View style={{ marginTop: 4 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 16,
                        flexWrap: 'wrap',
                        gap: 10,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            backgroundColor: 'rgba(245, 158, 11, 0.16)',
                            borderWidth: 1,
                            borderColor: '#F59E0B',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="trophy" size={19} color="#F59E0B" />
                        </View>
                        <View>
                          <Text style={{ color: tColor.text, fontSize: isMobile ? 21 : 25, fontWeight: '900' }}>
                            {tr('Servicios ', 'Premium ')}
                            <Text style={{ color: brandOrange }}>{tr('Premium', 'Services')}</Text>
                            {` (${premiumList.length})`}
                          </Text>
                          <Text style={{ color: tColor.muted, fontSize: 12.5, marginTop: 2 }}>
                            {tr(
                              'Socios Plan Élite y negocios en temporada de atracción con Cupón de Lanzamiento',
                              'Elite Plan partners and businesses with an active Launch Coupon'
                            )}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 20,
                            backgroundColor: 'rgba(245, 158, 11, 0.14)',
                            borderWidth: 1,
                            borderColor: '#F59E0B',
                          }}
                        >
                          <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '900' }}>
                            👑 {tr('Plan Élite', 'Elite Plan')}
                          </Text>
                        </View>
                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 20,
                            backgroundColor: 'rgba(16, 185, 129, 0.14)',
                            borderWidth: 1,
                            borderColor: '#10B981',
                          }}
                        >
                          <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '900' }}>
                            🎟️ {tr('Impulso Cupón', 'Coupon Boost')}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={{ flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', gap: 16 }}>
                      {premiumList.map((biz, idx) => {
                        const tColorPrimary = biz.primaryColor || biz.primary_color || brandOrange;
                        const favKey = `tenant:${String(biz.id).toLowerCase()}`;
                        const isFav = favoriteIds.includes(favKey);
                        const catMeta = categories.find((c) => c.code === biz.normalizedNiche) || categories[0];
                        const isElite = biz.tierKind === 'elite';
                        const borderHighlight = isElite ? '#F59E0B' : '#10B981';

                        let parsedLoyaltyPrem = biz.loyaltyConfig || biz.loyalty_config;
                        if (typeof parsedLoyaltyPrem === 'string') {
                          try {
                            parsedLoyaltyPrem = JSON.parse(parsedLoyaltyPrem);
                          } catch (_e) {
                            parsedLoyaltyPrem = null;
                          }
                        }
                        const reviewsPremArr = Array.isArray(parsedLoyaltyPrem?.reviews)
                          ? parsedLoyaltyPrem.reviews
                          : Array.isArray(biz.reviews)
                          ? biz.reviews
                          : [];
                        const revCountPrem =
                          typeof biz.reviewsCount === 'number'
                            ? biz.reviewsCount
                            : typeof biz.reviews_count === 'number'
                            ? biz.reviews_count
                            : reviewsPremArr.length;
                        const avgRatingPrem =
                          revCountPrem > 0
                            ? typeof biz.rating === 'number' && biz.rating > 0
                              ? biz.rating.toFixed(1)
                              : (
                                  reviewsPremArr.reduce((acc: number, r: any) => acc + Number(r?.rating || 5), 0) /
                                  revCountPrem
                                ).toFixed(1)
                            : '4.9';

                        return (
                          <TouchableOpacity
                            key={`${biz.id}-${idx}-prem`}
                            activeOpacity={0.9}
                            {...(Platform.OS === 'web' ? { className: 'dir-card' } : ({} as any))}
                            onPress={() => router.push(`/${biz.id}` as any)}
                            style={[
                              styles.businessCard,
                              {
                                backgroundColor: tColor.card,
                                borderColor: borderHighlight,
                                borderWidth: 1.5,
                                minWidth: isMobile ? '100%' : 320,
                                flex: 1,
                              },
                            ]}
                          >
                            {biz.badgeText ? (
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  marginBottom: 12,
                                  paddingBottom: 10,
                                  borderBottomWidth: 1,
                                  borderBottomColor: isElite
                                    ? 'rgba(245, 158, 11, 0.22)'
                                    : 'rgba(16, 185, 129, 0.22)',
                                }}
                              >
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 5,
                                    backgroundColor: isElite
                                      ? 'rgba(245, 158, 11, 0.16)'
                                      : 'rgba(16, 185, 129, 0.16)',
                                    borderWidth: 1,
                                    borderColor: borderHighlight,
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                    borderRadius: 20,
                                    flexShrink: 1,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: borderHighlight,
                                      fontSize: 10.5,
                                      fontWeight: '900',
                                      letterSpacing: 0.3,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {biz.badgeText}
                                  </Text>
                                </View>
                                {biz.distanceMiles !== null ? (
                                  <Text
                                    style={{
                                      color: borderHighlight,
                                      fontSize: 11.5,
                                      fontWeight: '900',
                                      marginLeft: 8,
                                    }}
                                  >
                                    📍 {biz.distanceMiles} mi
                                  </Text>
                                ) : null}
                              </View>
                            ) : null}

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                              <DirectoryTenantLogo
                                path={biz.logoUrl || biz.logo_url}
                                name={biz.name}
                                brandColor={tColorPrimary}
                                size={54}
                              />

                              <View style={{ flex: 1, minWidth: 0 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text
                                    style={{ color: tColor.text, fontSize: 17, fontWeight: '900' }}
                                    numberOfLines={1}
                                  >
                                    {toTitleCase(biz.name || 'Negocio Verificado')}
                                  </Text>
                                  <Ionicons name="checkmark-circle" size={16} color={tColorPrimary} />
                                </View>

                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                                  <Text style={{ color: tColorPrimary, fontSize: 12, fontWeight: '800' }}>
                                    {catMeta.title}
                                  </Text>
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 3,
                                      paddingHorizontal: 7,
                                      paddingVertical: 1.5,
                                      borderRadius: 8,
                                      backgroundColor: 'rgba(245, 158, 11, 0.14)',
                                      borderWidth: 1,
                                      borderColor: 'rgba(245, 158, 11, 0.4)',
                                    }}
                                  >
                                    <Ionicons name="star" size={11} color="#F59E0B" />
                                    <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '900' }}>
                                      {avgRatingPrem} ({revCountPrem})
                                    </Text>
                                  </View>
                                </View>

                                <Text style={{ color: tColor.muted, fontSize: 12.5, marginTop: 3 }} numberOfLines={1}>
                                  📍{' '}
                                  {biz.city
                                    ? `${toTitleCase(biz.city)}${biz.state ? `, ${biz.state.toUpperCase()}` : ''}`
                                    : toTitleCase(biz.address || tr('Agenda en línea 24/7', '24/7 Online Booking'))}
                                  {biz.distanceMiles !== null ? ` • ${biz.distanceMiles} mi` : ''}
                                </Text>
                              </View>

                              <TouchableOpacity
                                onPress={() => toggleFavoriteTenant(biz.id)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 18,
                                  backgroundColor: isFav ? 'rgba(239, 68, 68, 0.16)' : tColor.input,
                                  borderWidth: 1,
                                  borderColor: isFav ? '#EF4444' : tColor.border,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Ionicons
                                  name={isFav ? 'heart' : 'heart-outline'}
                                  size={17}
                                  color={isFav ? '#EF4444' : tColor.muted}
                                />
                              </TouchableOpacity>
                            </View>

                            <View
                              style={{
                                marginTop: 16,
                                paddingTop: 14,
                                borderTopWidth: 1,
                                borderTopColor: tColor.border,
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <Text
                                style={{
                                  color: isElite ? '#F59E0B' : '#10B981',
                                  fontSize: 12,
                                  fontWeight: '700',
                                  flex: 1,
                                  paddingRight: 8,
                                }}
                                numberOfLines={1}
                              >
                                {biz.promoSubText || `🕒 ${tr('Turnos en Tiempo Real', 'Real-Time Slots')}`}
                              </Text>

                              <View
                                style={{
                                  backgroundColor: tColorPrimary,
                                  paddingHorizontal: 14,
                                  paddingVertical: 8,
                                  borderRadius: 10,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12.5 }}>
                                  {tr('Ver Agenda', 'Book Now')}
                                </Text>
                                <Feather name="arrow-right" size={13} color="#FFFFFF" />
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    zIndex: 100,
  },
  scrollContent: {
    width: '100%',
  },
  searchCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  locationInput: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '600',
  },
  primarySearchBtn: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primarySearchBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '900',
  },
  categoryCard: {
    borderRadius: 22,
    padding: 22,
  },
  businessCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
});
