'use client';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Modal,
  Animated,
  PanResponder,
  AppState,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';

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

const PICKTIME_LOGO = require('../assets/images/logopicktime.jpg');

const toTitleCase = (str: string) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase());
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
const WebStyles = ({ theme, tColor }: { theme: 'dark' | 'light'; tColor: any }) => {
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
  const R = 3958.8; // Radio de la Tierra en millas
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
};


// ==========================================
// 🔔 CENTRO DE NOTIFICACIONES PRO (BADGE + SWIPE RIGHT TO DELETE)
// ==========================================
interface AppNotificationItem {
  id: string;
  title: string;
  body: string;
  role: 'client' | 'business';
  category: 'nearby_zip' | 'promo' | 'appointment' | 'staff_alert';
  tenantId?: string;
  appointmentId?: string;
  zipCode?: string;
  createdAt: string;
  isRead: boolean;
  data?: Record<string, any>;
}

const NOTIF_STORAGE_KEY = 'picktime_notifications_v1';
const NOTIF_DISMISSED_KEY = 'picktime_notifications_dismissed_v1';

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

const writePersistedJson = async (key: string, value: any): Promise<void> => {
  try {
    if (!(globalThis as any).__picktimeNotifStore) {
      (globalThis as any).__picktimeNotifStore = {};
    }
    (globalThis as any).__picktimeNotifStore[key] = value;

    const serialized = JSON.stringify(value);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage?.setItem(key, serialized);
    } else {
      try {
        const AsyncStorageMod = require('@react-native-async-storage/async-storage');
        const asyncStorage = AsyncStorageMod?.default || AsyncStorageMod;
        if (asyncStorage && typeof asyncStorage.setItem === 'function') {
          await asyncStorage.setItem(key, serialized);
        }
      } catch (_asErr) {}
    }
  } catch (_e) {}
};

const formatNotifRelativeTime = (isoStr: string, lang: 'es' | 'en'): string => {
  const ts = new Date(isoStr).getTime();
  if (Number.isNaN(ts)) return lang === 'en' ? 'Just now' : 'Ahora';
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 1) return lang === 'en' ? 'Just now' : 'Ahora';
  if (diffMin < 60) return lang === 'en' ? `${diffMin}m ago` : `Hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return lang === 'en' ? `${diffHr}h ago` : `Hace ${diffHr} h`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return lang === 'en' ? 'Yesterday' : 'Ayer';
  return lang === 'en' ? `${diffDays}d ago` : `Hace ${diffDays} d`;
};

const SwipeableNotificationRow = ({
  item,
  tColor,
  theme,
  lang,
  onPress,
  onDelete,
}: {
  item: AppNotificationItem;
  tColor: any;
  theme: 'dark' | 'light';
  lang: 'es' | 'en';
  onPress: (item: AppNotificationItem) => void;
  onDelete: (id: string) => void;
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowOpacity = useRef(new Animated.Value(1)).current;
  const isDeletingRef = useRef(false);

  const triggerDismissAnimation = useCallback(() => {
    if (isDeletingRef.current) return;
    isDeletingRef.current = true;
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 420,
        duration: 210,
        useNativeDriver: true,
      }),
      Animated.timing(rowOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDelete(item.id);
    });
  }, [item.id, onDelete, rowOpacity, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          !isDeletingRef.current && gesture.dx > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderMove: (_evt, gesture) => {
          if (gesture.dx > 0) {
            translateX.setValue(Math.min(gesture.dx, 260));
          }
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dx > 92 || gesture.vx > 0.65) {
            triggerDismissAnimation();
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              bounciness: 6,
              speed: 18,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [translateX, triggerDismissAnimation]
  );

  const accentColor =
    item.category === 'staff_alert'
      ? '#3B82F6'
      : item.category === 'promo'
      ? '#FF5E00'
      : item.category === 'appointment'
      ? '#10B981'
      : '#F59E0B';

  const iconName =
    item.category === 'staff_alert'
      ? 'briefcase'
      : item.category === 'promo'
      ? 'tag'
      : item.category === 'appointment'
      ? 'calendar'
      : 'map-pin';

  const roleTag =
    item.role === 'business'
      ? lang === 'en'
        ? 'Business / Staff'
        : 'Negocio / Staff'
      : item.zipCode
      ? `ZIP ${item.zipCode}`
      : item.category === 'promo'
      ? lang === 'en'
        ? 'Active Promo'
        : 'Promo Activa'
      : lang === 'en'
      ? 'Client'
      : 'Cliente';

  return (
    <Animated.View style={{ opacity: rowOpacity, marginBottom: 10, borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
      {/* Fondo rojo SOLO visible al deslizar hacia la derecha (invisible en reposo) */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: '#EF4444',
            borderRadius: 16,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 20,
            gap: 8,
            opacity: translateX.interpolate({
              inputRange: [0, 12, 56],
              outputRange: [0, 0, 1],
              extrapolate: 'clamp',
            }),
          },
        ]}
      >
        <Feather name="trash-2" size={18} color="#FFFFFF" />
        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>
          {lang === 'en' ? 'Delete' : 'Eliminar'}
        </Text>
      </Animated.View>

      {/* Tarjeta deslizable */}
      <Animated.View
        {...panResponder.panHandlers}
        style={{
          transform: [{ translateX }],
          backgroundColor: theme === 'dark' ? '#121721' : '#FFFFFF',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: item.isRead ? tColor.border : `${accentColor}66`,
          borderLeftWidth: 4,
          borderLeftColor: accentColor,
          overflow: 'hidden',
        }}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => onPress(item)}
          style={{ padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              backgroundColor: `${accentColor}1C`,
              borderWidth: 1,
              borderColor: `${accentColor}44`,
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <Feather name={iconName as any} size={17} color={accentColor} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                {!item.isRead ? (
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF5E00', flexShrink: 0 }} />
                ) : null}
                <Text style={{ color: tColor.text, fontWeight: item.isRead ? '700' : '900', fontSize: 13.5, flex: 1 }} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
              <Text style={{ color: tColor.muted, fontSize: 10.5, fontWeight: '700', flexShrink: 0 }}>
                {formatNotifRelativeTime(item.createdAt, lang)}
              </Text>
            </View>

            <Text style={{ color: tColor.muted, fontSize: 12.5, lineHeight: 17.5 }} numberOfLines={2}>
              {item.body}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2.5,
                  borderRadius: 7,
                  backgroundColor: `${accentColor}18`,
                }}
              >
                <Text style={{ color: accentColor, fontSize: 10.5, fontWeight: '900' }}>
                  {roleTag}
                </Text>
              </View>

              <TouchableOpacity
                onPress={triggerDismissAnimation}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={lang === 'en' ? 'Delete notification' : 'Eliminar notificación'}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: 'rgba(239, 68, 68, 0.14)',
                  borderWidth: 1,
                  borderColor: 'rgba(239, 68, 68, 0.35)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="trash-2" size={17} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
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

  const tr = (esText: string, enText: string) => (lang === 'en' ? enText : esText);

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
  const [allTenants, setAllTenants] = useState<any[]>([]);
  const [isLoadingTenants, setIsLoadingTenants] = useState<boolean>(true);
  const [isSearchingZip, setIsSearchingZip] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // 🔔 CENTRO DE NOTIFICACIONES + BADGE EN ICONO DE LA APP
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const [dismissedNotifIds, setDismissedNotifIds] = useState<string[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [notifRoleTab, setNotifRoleTab] = useState<'all' | 'client' | 'business'>('all');
  const [notifsHydrated, setNotifsHydrated] = useState<boolean>(false);

  // Cargar historial guardado de notificaciones y descartadas
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [savedNotifs, savedDismissed] = await Promise.all([
        readPersistedJson<AppNotificationItem[]>(NOTIF_STORAGE_KEY, []),
        readPersistedJson<string[]>(NOTIF_DISMISSED_KEY, []),
      ]);
      if (!mounted) return;
      if (Array.isArray(savedNotifs)) setNotifications(savedNotifs);
      if (Array.isArray(savedDismissed)) setDismissedNotifIds(savedDismissed);
      setNotifsHydrated(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Persistir notificaciones cada vez que cambian + sincronizar badge real del icono (iOS/Android)
  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  useEffect(() => {
    if (!notifsHydrated) return;
    writePersistedJson(NOTIF_STORAGE_KEY, notifications);
    if (Platform.OS !== 'web') {
      try {
        const Notifications = require('expo-notifications');
        if (typeof Notifications?.setBadgeCountAsync === 'function') {
          Notifications.setBadgeCountAsync(unreadNotifCount).catch(() => {});
        }
      } catch (_badgeErr) {}
    }
  }, [notifications, unreadNotifCount, notifsHydrated]);

  useEffect(() => {
    if (!notifsHydrated) return;
    writePersistedJson(NOTIF_DISMISSED_KEY, dismissedNotifIds);
  }, [dismissedNotifIds, notifsHydrated]);

  // Escuchar notificaciones push entrantes (Expo) para listarlas en tiempo real
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let recvSub: any = null;
    let respSub: any = null;
    try {
      const Notifications = require('expo-notifications');
      const pushIncomingToInbox = (notifObj: any, markRead = false) => {
        const content = notifObj?.request?.content || {};
        const data = (content?.data && typeof content.data === 'object') ? content.data : {};
        const incomingId = String(notifObj?.request?.identifier || data?.notificationId || `push-${Date.now()}`);
        const roleRaw = String(data?.role || data?.audience || '').toLowerCase();
        const eventRaw = String(data?.eventType || '').toLowerCase();
        const isBiz =
          roleRaw === 'owner' ||
          roleRaw === 'staff' ||
          roleRaw === 'barber' ||
          data?.view === 'mecanico' ||
          eventRaw.includes('staff') ||
          eventRaw.includes('assigned');

        const newItem: AppNotificationItem = {
          id: incomingId,
          title: String(content?.title || (isBiz ? 'Nueva alerta de tu negocio' : 'Nueva notificación')),
          body: String(content?.body || ''),
          role: isBiz ? 'business' : 'client',
          category: isBiz
            ? 'staff_alert'
            : eventRaw.includes('promo') || eventRaw.includes('campaign')
            ? 'promo'
            : data?.appointmentId
            ? 'appointment'
            : 'nearby_zip',
          tenantId: data?.tenantId ? String(data.tenantId) : undefined,
          appointmentId: data?.appointmentId ? String(data.appointmentId) : undefined,
          zipCode: data?.zipCode ? String(data.zipCode) : undefined,
          createdAt: new Date().toISOString(),
          isRead: markRead,
          data,
        };

        setNotifications((prev) => {
          const withoutDup = prev.filter((x) => x.id !== newItem.id);
          return [newItem, ...withoutDup].slice(0, 60);
        });
      };

      if (typeof Notifications?.addNotificationReceivedListener === 'function') {
        recvSub = Notifications.addNotificationReceivedListener((notification: any) => {
          pushIncomingToInbox(notification, false);
        });
      }
      if (typeof Notifications?.addNotificationResponseReceivedListener === 'function') {
        respSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
          pushIncomingToInbox(response?.notification, true);
        });
      }
    } catch (_e) {}

    return () => {
      try { recvSub?.remove?.(); } catch (_e) {}
      try { respSub?.remove?.(); } catch (_e) {}
    };
  }, []);

  const handleDeleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setDismissedNotifIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const handleMarkAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const handleClearAllNotifications = useCallback(() => {
    setNotifications((prev) => {
      const toDismiss = prev
        .filter((n) => notifRoleTab === 'all' || n.role === notifRoleTab)
        .map((n) => n.id);
      if (toDismiss.length > 0) {
        setDismissedNotifIds((dPrev) => Array.from(new Set([...dPrev, ...toDismiss])));
      }
      return notifRoleTab === 'all'
        ? []
        : prev.filter((n) => n.role !== notifRoleTab);
    });
  }, [notifRoleTab]);

  const handleNotificationTap = useCallback(
    (item: AppNotificationItem) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
      setIsNotificationsOpen(false);
      if (!item.tenantId) return;

      if (item.role === 'business') {
        const qs = new URLSearchParams({ view: 'mecanico', section: 'today' });
        if (item.appointmentId) qs.set('appointmentId', item.appointmentId);
        router.push(`/${item.tenantId}?${qs.toString()}` as any);
        return;
      }

      if (item.appointmentId) {
        router.push(`/${item.tenantId}?view=expediente&appointmentId=${encodeURIComponent(item.appointmentId)}` as any);
        return;
      }

      router.push(`/${item.tenantId}` as any);
    },
    [router]
  );

  const visibleNotifications = useMemo(() => {
    return notifications.filter((n) => notifRoleTab === 'all' || n.role === notifRoleTab);
  }, [notifications, notifRoleTab]);

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
    [lang]
  );

  const [isDetectingGps, setIsDetectingGps] = useState<boolean>(false);

  // 📡 1. CONSUMIR TODOS LOS NEGOCIOS ACTIVOS DE `/api/directory/search` UNA SOLA VEZ
  // (Sin enviar locationQuery al backend para que nunca devuelva [] cuando buscas un ZIP vecino, y hacer todo el filtrado abajo en el cliente)
  const loadDirectoryTenants = async () => {
    setIsLoadingTenants(true);
    try {
      const rawBase =
        process.env.EXPO_PUBLIC_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        (Platform.OS === 'web' ? 'http://localhost:4000' : 'http://127.0.0.1:4000');
      const API_URL = rawBase.replace(/\/$/, '');

      const res = await fetch(`${API_URL}/api/directory/search?radius=5000`);
      if (res.ok) {
        const data = await res.json();
        const list =
          (Array.isArray(data?.tenants) && data.tenants) ||
          (Array.isArray(data?.businesses) && data.businesses) ||
          (Array.isArray(data?.results) && data.results) ||
          (Array.isArray(data?.data) && data.data) ||
          (Array.isArray(data) && data) ||
          [];
        setAllTenants(list);
      }
    } catch (err) {
      console.error('Error cargando /api/directory/search:', err);
    } finally {
      setIsLoadingTenants(false);
    }
  };

  // 📍 BOTÓN OPCIONAL "USAR MI UBICACIÓN ACTUAL" (Solo cuando el usuario lo toca explícitamente)
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

          // Si el usuario está en San Bernardino (a ~17.3 mi de Rancho Cucamonga) y el radio está en 15 mi,
          // lo subimos automáticamente a 25 mi para que vea de inmediato los negocios cercanos de Rancho Cucamonga
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
    // Al abrir la app, carga todos los negocios del backend sin bloquear por GPS para que siempre muestre los negocios disponibles
    loadDirectoryTenants();
  }, []);

  // 🔄 Refrescar negocios automáticamente cuando la app regresa de segundo plano
  useEffect(() => {
    let prevState = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (prevState !== 'active' && nextState === 'active') {
        loadDirectoryTenants();
      }
      prevState = nextState;
    });
    return () => {
      sub.remove();
    };
  }, []);

  // 📍 Detectar nuevos negocios y promos activas en el código postal del cliente y agregarlos a su bandeja (si no fueron descartados)
  useEffect(() => {
    if (!notifsHydrated || allTenants.length === 0) return;

    const cleanZipSearch = locationQuery.replace(/\D/g, '');
    const candidates: AppNotificationItem[] = [];

    allTenants.forEach((biz: any) => {
      const bizZip = String(biz.zipCode || biz.zip_code || '').trim();
      if (cleanZipSearch.length === 5 && bizZip && bizZip !== cleanZipSearch) return;

      let parsedLoyalty = biz.loyaltyConfig || biz.loyalty_config;
      if (typeof parsedLoyalty === 'string') {
        try {
          parsedLoyalty = JSON.parse(parsedLoyalty);
        } catch (_e) {
          parsedLoyalty = null;
        }
      }

      // 1) Campañas activas de negocios cercanos
      const activeCamps = Array.isArray(parsedLoyalty?.campaigns)
        ? parsedLoyalty.campaigns.filter((c: any) => c && c.is_active !== false)
        : [];

      activeCamps.slice(0, 1).forEach((camp: any) => {
        const cid = `camp-${biz.id}-${camp.id || camp.title}`;
        candidates.push({
          id: cid,
          title: `${toTitleCase(biz.name || 'Negocio')}: ${toTitleCase(camp.translations?.[lang]?.title || camp.title || 'Promo Activa')}`,
          body: toTitleCase(camp.translations?.[lang]?.message || camp.message || ''),
          role: 'client',
          category: 'promo',
          tenantId: String(biz.id),
          zipCode: bizZip || undefined,
          createdAt: camp.sent_at || new Date().toISOString(),
          isRead: false,
        });
      });

      // 2) Negocio disponible en el código postal
      if (bizZip) {
        const nid = `zip-biz-${biz.id}-${bizZip}`;
        candidates.push({
          id: nid,
          title: tr(`Nuevo cerca de ti (ZIP ${bizZip})`, `New near you (ZIP ${bizZip})`),
          body: tr(
            `${toTitleCase(biz.name || 'Negocio')} ya tiene turnos disponibles en tu zona.`,
            `${toTitleCase(biz.name || 'Business')} now has appointments available in your area.`
          ),
          role: 'client',
          category: 'nearby_zip',
          tenantId: String(biz.id),
          zipCode: bizZip,
          createdAt: biz.createdAt || biz.created_at || new Date().toISOString(),
          isRead: false,
        });
      }
    });

    if (candidates.length === 0) return;

    setNotifications((prev) => {
      const existingIds = new Set(prev.map((x) => x.id));
      const dismissedSet = new Set(dismissedNotifIds);
      const fresh = candidates
        .filter((c) => !existingIds.has(c.id) && !dismissedSet.has(c.id))
        .slice(0, 8);
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev].slice(0, 60);
    });
  }, [allTenants, locationQuery, notifsHydrated, dismissedNotifIds, lang]);

  // 🔍 BUSCAR NEGOCIOS CERCANOS (FILTRADO INTELIGENTE EN EL CLIENTE POR COORDENADAS ZIP O CIUDAD)
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

  // 🏷️ CLASIFICADOR COMERCIAL DE VITRINA ("SERVICIOS PREMIUM" vs "TODOS LOS SERVICIOS"):
  // 1) Plan más alto (`planTier === 'elite'`) -> Va a "Servicios Premium" con insignia 👑 PLAN ÉLITE • SERVICIO PREMIUM
  // 2) Cupón / Campaña de Atracción (`promoCode` / `paymentMethod === 'promo_code'` / `loyaltyConfig` con campaña o referidos) -> Va a "Servicios Premium" con insignia 🎟️ CUPÓN ACTIVO • IMPULSO LANZAMIENTO
  // 3) Todos los negocios -> Aparecen siempre en el segundo bloque inferior ("Todos los Servicios Verificados") y en los contadores de Categorías
  const getTenantBadgeInfo = (
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

    // 1. PLAN MÁS ALTO (Plan Élite)
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

    // 2. CUPÓN DE LANZAMIENTO / TEMPORADA DE ATRACCIÓN DE CLIENTES
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

    // 3. Clasificación para negocios existentes en la BD donde `searchDirectory` aún no envía `planTier`:
    const nameLower = String(item.name || '').toLowerCase();
    if (nameLower.includes('picktime') || nameLower.includes('autoflow')) {
      return {
        kind: 'elite',
        isPremiumShowcase: true,
        badgeText: tr('👑 PLAN ÉLITE • SERVICIO PREMIUM', '👑 ELITE PLAN • PREMIUM SERVICE'),
        promoSubText: tr('⭐ Socio Verificado Nivel Élite', '⭐ Verified Elite Partner'),
      };
    }
    if (nameLower.includes('latas') || nameLower.includes('sonrisa') || nameLower.includes('gómez') || nameLower.includes('gomez')) {
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
  };

  // 🧮 FILTRADO EN MEMORIA SOBRE LOS NEGOCIOS CONSUMIDOS
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
  }, [allTenants, userCoords, radiusMiles, locationQuery, lang]);

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
        // Priorizar siempre los negocios Favoritos del usuario primero en los resultados
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
      <WebStyles theme={theme} tColor={tColor} />

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
          /* 🔙 BARRA SUPERIOR EN VISTA DE CATEGORÍA: "← Volver a Categorías" */
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
          /* 🏠 LOGO IZQUIERDO EN PORTADA PRINCIPAL */
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setSelectedCategory(null);
              setNameQuery('');
              setOnlyFavorites(false);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 9 : 12, flex: 0, minWidth: 0 }}
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
            <Text
              style={{ color: tColor.text, fontSize: isMobile ? 17 : 22, fontWeight: '900', letterSpacing: -0.2 }}
              numberOfLines={1}
            >
              PickTime
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
                setIsNotificationsOpen(false);
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

          {/* 🔔 Campana de Notificaciones con Contador (Badge) */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setIsSettingsOpen(false);
              setIsNotificationsOpen(true);
            }}
            accessibilityLabel={tr('Abrir notificaciones', 'Open notifications')}
            style={{
              width: isMobile ? 36 : 42,
              height: isMobile ? 36 : 42,
              borderRadius: isMobile ? 11 : 12,
              backgroundColor: isNotificationsOpen ? `${brandOrange}22` : tColor.input,
              borderWidth: 1.5,
              borderColor: isNotificationsOpen ? brandOrange : tColor.border,
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <Feather
              name="bell"
              size={16}
              color={isNotificationsOpen || unreadNotifCount > 0 ? brandOrange : tColor.text}
            />
            {unreadNotifCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -5,
                  right: -5,
                  minWidth: 19,
                  height: 19,
                  borderRadius: 10,
                  paddingHorizontal: 4,
                  backgroundColor: '#EF4444',
                  borderWidth: 2,
                  borderColor: theme === 'dark' ? '#05070C' : '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>
                  {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>

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
      {/*    MODO A) VISTA DEDICADA DE CATEGORÍA (COMO TU CAPTURA)       */}
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
            /* ============================================================ */
            /* 📂 MODO A: VISTA DEDICADA AL DAR CLICK EN UNA CATEGORÍA      */
            /*    - Título de la Categoría + Subtítulo                      */
            /*    - Tarjeta "¿BUSCAS UN NEGOCIO EN ESPECÍFICO?" + Favoritos  */
            /*    - Tarjetas detalladas de cada negocio de esa categoría    */
            /* ============================================================ */
            (() => {
              const selectedCatObj = categories.find((c) => c.code === selectedCategory);
              const catAccent = selectedCatObj?.color || brandOrange;

              return (
                <View>
                  {/* Título y descripción de la Categoría */}
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

                  {/* 🔎 TARJETA DEDICADA: "¿BUSCAS UN NEGOCIO EN ESPECÍFICO?" + FAVORITOS */}
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

                    {/* Input limpio con ícono de lupa y corazón integrado */}
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

                  {/* LISTADO DE TARJETAS DE LA CATEGORÍA (ESTILO DETALLADO DE TU CAPTURA) */}
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
                            : '5.0';

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
                            {/* Fila superior: Ícono de categoría/logo a la izquierda + Estrellas & Distancia a la derecha */}
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

                              {/* Pills derechas: ★ 5.0 (0) + ✈️ A 2.4 millas + Corazón Favorito */}
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

                            {/* Nombre del Negocio y Ubicación */}
                            <Text style={{ color: tColor.text, fontSize: 21, fontWeight: '900', marginBottom: 4 }}>
                              {toTitleCase(biz.name || 'Negocio Verificado')}
                            </Text>
                            <Text style={{ color: tColor.muted, fontSize: 13.5, marginBottom: 16 }}>
                              {selectedCatObj?.title || tr('Servicio Verificado', 'Verified Service')}
                              {cityZipText ? `  •  ${cityZipText}` : ''}
                            </Text>

                            {/* Pie de tarjeta: ● Turnos disponibles hoy + Ver Catálogo y Agendar → */}
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
            /* ============================================================ */
            /* 🏠 MODO B: PORTADA PRINCIPAL                                  */
            /*    - Hero + Buscador de Ubicación y Radio                     */
            /*    - Categorías Disponibles                                   */
            /*    - 🏆 Servicios Premium (Solo Plan Élite + Cupón Activo)    */
            /* ============================================================ */
            <>
              {/* TÍTULO HERO */}
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

              {/* TARJETA BUSCADORA DE UBICACIÓN Y RADIO EN MILLAS */}
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
                        onPress={() => {
                          setRadiusMiles(mi);
                        }}
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

              {/* CABECERA DE CATEGORÍAS */}
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

              {/* GRID DE TARJETAS DE CATEGORÍAS */}
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

              {/* ============================================================ */}
              {/* 🏆 SERVICIOS PREMIUM (SOLO PLAN ÉLITE + CUPÓN ACTIVO)        */}
              {/* ============================================================ */}
              {(() => {
                const premiumList = filteredBusinessesList.filter((b) => b.isPremiumShowcase);

                if (isLoadingTenants) {
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

                                <Text style={{ color: tColorPrimary, fontSize: 12, fontWeight: '800', marginTop: 2 }}>
                                  {catMeta.title}
                                </Text>

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

      {/* ============================================================== */}
      {/* 🔔 CENTRO DE NOTIFICACIONES (BOTTOM SHEET PRO + SWIPE RIGHT)   */}
      {/* ============================================================== */}
      <Modal
        visible={isNotificationsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsNotificationsOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 23, 0.72)' }}>
          <TouchableOpacity
            activeOpacity={1}
            style={{ flex: 1 }}
            onPress={() => setIsNotificationsOpen(false)}
          />

          <View
            style={{
              backgroundColor: theme === 'dark' ? '#0B0F17' : '#F8FAFC',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderTopWidth: 1.5,
              borderColor: tColor.border,
              maxHeight: '82%',
              width: '100%',
              maxWidth: 640,
              alignSelf: 'center',
              paddingTop: 10,
              paddingBottom: Platform.OS === 'ios' ? 30 : 20,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -10 },
              shadowOpacity: 0.45,
              shadowRadius: 24,
              elevation: 24,
            }}
          >
            {/* Drag handle pill */}
            <View
              style={{
                width: 42,
                height: 4,
                borderRadius: 2,
                backgroundColor: tColor.border,
                alignSelf: 'center',
                marginBottom: 14,
              }}
            />

            {/* Header del panel */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingBottom: 14,
                borderBottomWidth: 1,
                borderBottomColor: tColor.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: `${brandOrange}20`,
                    borderWidth: 1,
                    borderColor: `${brandOrange}45`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="bell" size={16} color={brandOrange} />
                </View>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: tColor.text, fontSize: 18, fontWeight: '900' }}>
                      {tr('Notificaciones', 'Notifications')}
                    </Text>
                    {unreadNotifCount > 0 ? (
                      <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900' }}>
                          {unreadNotifCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: tColor.muted, fontSize: 11.5, marginTop: 1 }}>
                    {tr('Desliza hacia la derecha para eliminar', 'Swipe right to delete')}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setIsNotificationsOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: tColor.input,
                  borderWidth: 1,
                  borderColor: tColor.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="x" size={18} color={tColor.text} />
              </TouchableOpacity>
            </View>

            {/* Pestañas por Rol: Todas | Cliente | Negocio */}
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: tColor.input,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: tColor.border,
                  padding: 4,
                  gap: 4,
                }}
              >
                {[
                  {
                    key: 'all' as const,
                    label: `${tr('Todas', 'All')} (${notifications.length})`,
                  },
                  {
                    key: 'client' as const,
                    label: `${tr('Cliente', 'Client')} (${notifications.filter((n) => n.role === 'client').length})`,
                  },
                  {
                    key: 'business' as const,
                    label: `${tr('Negocio', 'Business')} (${notifications.filter((n) => n.role === 'business').length})`,
                  },
                ].map((tab) => {
                  const active = notifRoleTab === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      activeOpacity={0.85}
                      onPress={() => setNotifRoleTab(tab.key)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 9,
                        backgroundColor: active ? brandOrange : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: active ? '#FFFFFF' : tColor.muted,
                          fontSize: 12,
                          fontWeight: '900',
                        }}
                        numberOfLines={1}
                      >
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Acciones rápidas: Marcar leídas + Eliminar todas */}
              {visibleNotifications.length > 0 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleMarkAllNotificationsRead}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(16, 185, 129, 0.35)',
                    }}
                  >
                    <Feather name="check-circle" size={13} color="#10B981" />
                    <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '900' }}>
                      {tr('Marcar leídas', 'Mark all read')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleClearAllNotifications}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(239, 68, 68, 0.38)',
                    }}
                  >
                    <Feather name="trash-2" size={13} color="#EF4444" />
                    <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '900' }}>
                      {tr('Eliminar todas', 'Delete all')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {/* Lista de Notificaciones deslizables hacia la derecha */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 }}
            >
              {visibleNotifications.length === 0 ? (
                <View
                  style={{
                    paddingVertical: 44,
                    paddingHorizontal: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: tColor.input,
                      borderWidth: 1,
                      borderColor: tColor.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 14,
                    }}
                  >
                    <Feather name="bell-off" size={24} color={tColor.muted} />
                  </View>
                  <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 16, textAlign: 'center' }}>
                    {tr('Estás al día', 'You are all caught up')}
                  </Text>
                  <Text style={{ color: tColor.muted, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19, maxWidth: 300 }}>
                    {notifRoleTab === 'business'
                      ? tr(
                          'Aquí verás las nuevas citas, confirmaciones y cancelaciones de tu negocio o silla.',
                          'Here you will see new bookings, confirmations, and cancellations for your business or chair.'
                        )
                      : tr(
                          'Aquí aparecerán nuevos negocios en tu código postal, promos activas y recordatorios de tus citas.',
                          'New businesses in your ZIP code, active promos, and appointment reminders will appear here.'
                        )}
                  </Text>
                </View>
              ) : (
                visibleNotifications.map((item) => (
                  <SwipeableNotificationRow
                    key={item.id}
                    item={item}
                    tColor={tColor}
                    theme={theme}
                    lang={lang}
                    onPress={handleNotificationTap}
                    onDelete={handleDeleteNotification}
                  />
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
