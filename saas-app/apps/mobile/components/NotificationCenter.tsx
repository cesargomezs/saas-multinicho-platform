'use client';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Modal,
  Animated,
  PanResponder,
  AppState,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

export interface AppNotificationItem {
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

export interface NotificationCenterProps {
  tColor: {
    bg: string;
    card: string;
    text: string;
    muted: string;
    border: string;
    input: string;
  };
  theme: 'dark' | 'light';
  lang: 'es' | 'en';
  brandColor?: string;
  isMobile?: boolean;
  apiBaseUrl?: string;
  currentTenantId?: string | null;
  clientUserId?: string | null;
  staffId?: string | null;
  hasBusinessAccess?: boolean;
  onOpen?: () => void;
  onSelectNotification?: (item: AppNotificationItem) => boolean | void;
}

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
  tColor: NotificationCenterProps['tColor'];
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

export default function NotificationCenter({
  tColor,
  theme,
  lang,
  brandColor = '#FF5E00',
  isMobile = true,
  apiBaseUrl,
  currentTenantId,
  clientUserId,
  staffId,
  hasBusinessAccess,
  onOpen,
  onSelectNotification,
}: NotificationCenterProps) {
  const router = useRouter();
  const tr = useCallback((esText: string, enText: string) => (lang === 'en' ? enText : esText), [lang]);

  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [notifRoleTab, setNotifRoleTab] = useState<'all' | 'client' | 'business'>('all');

  const [resolvedSession, setResolvedSession] = useState<{
    userId: string;
    tenantId: string;
    staffId: string;
    hasBusinessAccess: boolean;
  }>({
    userId: String(clientUserId || '').trim(),
    tenantId: String(currentTenantId || '').trim(),
    staffId: String(staffId || '').trim(),
    hasBusinessAccess: Boolean(hasBusinessAccess && currentTenantId),
  });

  const getApiBase = useCallback(() => {
    const raw =
      apiBaseUrl ||
      process.env.EXPO_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://saas-multinicho-platform.onrender.com';
    return String(raw).replace(/\/+$/, '');
  }, [apiBaseUrl]);

  const loadSession = useCallback(async () => {
    const clientSess = await readPersistedJson<any>('picktimebook_client_session_global', null);
    const bizSess = await readPersistedJson<any>('picktimebook_business_session_v1', null);

    const effectiveUserId = String(clientUserId || clientSess?.userId || clientSess?.id || '').trim();
    const effectiveTenantId = String(
      (hasBusinessAccess ? currentTenantId : '') || bizSess?.tenantId || ''
    ).trim();
    const effectiveStaffId = String(staffId || bizSess?.staffId || '').trim();
    const effectiveHasBiz = Boolean(effectiveTenantId && (hasBusinessAccess || bizSess?.tenantId));

    const next = {
      userId: effectiveUserId,
      tenantId: effectiveTenantId,
      staffId: effectiveStaffId,
      hasBusinessAccess: effectiveHasBiz,
    };
    setResolvedSession(next);
    if (!effectiveHasBiz) setNotifRoleTab('client');
    return next;
  }, [clientUserId, currentTenantId, staffId, hasBusinessAccess]);

  const fetchNotificationsFromDb = useCallback(async () => {
    setIsLoadingNotifs(true);
    try {
      const sess = await loadSession();
      const apiBase = getApiBase();
      const requests: Promise<AppNotificationItem[]>[] = [];

      const mapRow = (r: any, fallbackRole: 'client' | 'business'): AppNotificationItem => {
        const rawData =
          typeof r.data === 'string'
            ? (() => {
                try {
                  return JSON.parse(r.data);
                } catch {
                  return {};
                }
              })()
            : r.data || {};
        const ev = String(r.eventType || r.event_type || '').toLowerCase();
        const roleVal: 'client' | 'business' =
          r.role === 'business' || fallbackRole === 'business' ? 'business' : 'client';
        return {
          id: String(r.id),
          title: String(r.title || ''),
          body: String(r.body || ''),
          role: roleVal,
          category:
            roleVal === 'business'
              ? 'staff_alert'
              : ev.includes('promo') || ev.includes('campaign')
              ? 'promo'
              : ev.includes('appointment')
              ? 'appointment'
              : 'nearby_zip',
          tenantId: r.tenantId || rawData.tenantId ? String(r.tenantId || rawData.tenantId) : undefined,
          appointmentId: rawData.appointmentId ? String(rawData.appointmentId) : undefined,
          zipCode: rawData.zipCode ? String(rawData.zipCode) : undefined,
          createdAt: String(r.createdAt || r.created_at || new Date().toISOString()),
          isRead: Boolean(r.isRead ?? r.is_read ?? false),
          data: rawData,
        };
      };

      if (sess.userId) {
        requests.push(
          fetch(`${apiBase}/api/notifications?role=client&userId=${encodeURIComponent(sess.userId)}`)
            .then((res) => (res.ok ? res.json() : { notifications: [] }))
            .then((json) =>
              Array.isArray(json?.notifications) ? json.notifications.map((r: any) => mapRow(r, 'client')) : []
            )
            .catch(() => [])
        );
      }

      if (sess.hasBusinessAccess && sess.tenantId) {
        const qs = new URLSearchParams({ role: 'business', tenantId: sess.tenantId });
        if (sess.staffId) qs.set('staffId', sess.staffId);
        requests.push(
          fetch(`${apiBase}/api/notifications?${qs.toString()}`)
            .then((res) => (res.ok ? res.json() : { notifications: [] }))
            .then((json) =>
              Array.isArray(json?.notifications) ? json.notifications.map((r: any) => mapRow(r, 'business')) : []
            )
            .catch(() => [])
        );
      }

      if (requests.length === 0) {
        setNotifications([]);
        return;
      }

      const batches = await Promise.all(requests);
      const merged = batches
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setNotifications(merged);
    } finally {
      setIsLoadingNotifs(false);
    }
  }, [getApiBase, loadSession]);

  useEffect(() => {
    fetchNotificationsFromDb();
  }, [fetchNotificationsFromDb]);

  useEffect(() => {
    if (isOpen) {
      fetchNotificationsFromDb();
    }
  }, [isOpen, fetchNotificationsFromDb]);

  useEffect(() => {
    let prevState = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (prevState !== 'active' && nextState === 'active') {
        fetchNotificationsFromDb();
      }
      prevState = nextState;
    });
    return () => sub.remove();
  }, [fetchNotificationsFromDb]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let recvSub: any = null;
    try {
      const Notifications = require('expo-notifications');
      if (typeof Notifications?.addNotificationReceivedListener === 'function') {
        recvSub = Notifications.addNotificationReceivedListener(() => {
          fetchNotificationsFromDb();
        });
      }
    } catch (_e) {}
    return () => {
      try {
        recvSub?.remove?.();
      } catch (_e) {}
    };
  }, [fetchNotificationsFromDb]);

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      try {
        const Notifications = require('expo-notifications');
        if (typeof Notifications?.setBadgeCountAsync === 'function') {
          Notifications.setBadgeCountAsync(unreadNotifCount).catch(() => {});
        }
      } catch (_e) {}
    }
  }, [unreadNotifCount]);

  const handleDeleteNotification = useCallback(
    (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      fetch(`${getApiBase()}/api/notifications/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {});
    },
    [getApiBase]
  );

  const handleMarkAllRead = useCallback(() => {
    const apiBase = getApiBase();
    const targetRole = resolvedSession.hasBusinessAccess
      ? notifRoleTab === 'business'
        ? 'business'
        : 'client'
      : 'client';

    if (notifRoleTab === 'all' && resolvedSession.hasBusinessAccess) {
      setNotifications((prev) =>
        prev.filter((n) => n.role !== 'client').map((n) => ({ ...n, isRead: true }))
      );
      if (resolvedSession.userId) {
        fetch(`${apiBase}/api/notifications/read`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'client', userId: resolvedSession.userId }),
        }).catch(() => {});
      }
      if (resolvedSession.tenantId) {
        fetch(`${apiBase}/api/notifications/read`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'business', tenantId: resolvedSession.tenantId }),
        }).catch(() => {});
      }
      return;
    }

    setNotifications((prev) =>
      targetRole === 'client'
        ? prev.filter((n) => n.role !== 'client')
        : prev.map((n) => (n.role === 'business' ? { ...n, isRead: true } : n))
    );

    fetch(`${apiBase}/api/notifications/read`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: targetRole,
        userId: resolvedSession.userId || undefined,
        tenantId: resolvedSession.tenantId || undefined,
      }),
    }).catch(() => {});
  }, [getApiBase, notifRoleTab, resolvedSession]);

  const handleClearAll = useCallback(() => {
    const apiBase = getApiBase();
    const rolesToClear: ('client' | 'business')[] = !resolvedSession.hasBusinessAccess
      ? ['client']
      : notifRoleTab === 'all'
      ? ['client', 'business']
      : [notifRoleTab];

    setNotifications((prev) => prev.filter((n) => !rolesToClear.includes(n.role)));

    rolesToClear.forEach((r) => {
      fetch(`${apiBase}/api/notifications`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: r,
          userId: resolvedSession.userId || undefined,
          tenantId: resolvedSession.tenantId || undefined,
        }),
      }).catch(() => {});
    });
  }, [getApiBase, notifRoleTab, resolvedSession]);

  const handleNotificationTap = useCallback(
    (item: AppNotificationItem) => {
      setNotifications((prev) =>
        item.role === 'client'
          ? prev.filter((n) => n.id !== item.id)
          : prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );

      fetch(`${getApiBase()}/api/notifications/read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, role: item.role }),
      }).catch(() => {});

      setIsOpen(false);

      if (onSelectNotification) {
        const handled = onSelectNotification(item);
        if (handled === true) return;
      }

      if (!item.tenantId) return;

      if (item.role === 'business') {
        const qs = new URLSearchParams({ view: 'mecanico', section: 'today' });
        if (item.appointmentId) qs.set('appointmentId', item.appointmentId);
        router.push(`/${item.tenantId}?${qs.toString()}` as any);
        return;
      }

      if (item.appointmentId) {
        router.push(
          `/${item.tenantId}?view=expediente&appointmentId=${encodeURIComponent(item.appointmentId)}` as any
        );
        return;
      }

      router.push(`/${item.tenantId}` as any);
    },
    [getApiBase, onSelectNotification, router]
  );

  const visibleNotifications = useMemo(() => {
    if (!resolvedSession.hasBusinessAccess) {
      return notifications.filter((n) => n.role === 'client');
    }
    return notifications.filter((n) => notifRoleTab === 'all' || n.role === notifRoleTab);
  }, [notifications, notifRoleTab, resolvedSession.hasBusinessAccess]);

  return (
    <>
      {/* 🔔 Botón Campana con Contador (Badge) */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          onOpen?.();
          setIsOpen(true);
        }}
        accessibilityLabel={tr('Abrir notificaciones', 'Open notifications')}
        style={{
          width: isMobile ? 36 : 42,
          height: isMobile ? 36 : 42,
          borderRadius: isMobile ? 10 : 12,
          backgroundColor: isOpen ? `${brandColor}22` : tColor.input,
          borderWidth: 1.5,
          borderColor: isOpen ? brandColor : tColor.border,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <Feather
          name="bell"
          size={16}
          color={isOpen || unreadNotifCount > 0 ? brandColor : tColor.text}
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

      {/* 🔔 Bottom Sheet Pro de Notificaciones */}
      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 23, 0.72)' }}>
          <TouchableOpacity activeOpacity={1} style={{ flex: 1 }} onPress={() => setIsOpen(false)} />

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
                    backgroundColor: `${brandColor}20`,
                    borderWidth: 1,
                    borderColor: `${brandColor}45`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="bell" size={16} color={brandColor} />
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
                onPress={() => setIsOpen(false)}
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

            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
              {resolvedSession.hasBusinessAccess ? (
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
                    { key: 'all' as const, label: `${tr('Todas', 'All')} (${notifications.length})` },
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
                          backgroundColor: active ? brandColor : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{ color: active ? '#FFFFFF' : tColor.muted, fontSize: 12, fontWeight: '900' }}
                          numberOfLines={1}
                        >
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              {visibleNotifications.length > 0 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleMarkAllRead}
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
                    onPress={handleClearAll}
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

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 }}
            >
              {isLoadingNotifs && visibleNotifications.length === 0 ? (
                <View style={{ paddingVertical: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="small" color={brandColor} />
                  <Text style={{ color: tColor.muted, fontSize: 12.5, marginTop: 10, fontWeight: '700' }}>
                    {tr('Cargando notificaciones...', 'Loading notifications...')}
                  </Text>
                </View>
              ) : visibleNotifications.length === 0 ? (
                <View style={{ paddingVertical: 44, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }}>
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
                          'Aquí aparecerán tus recordatorios de citas, confirmaciones y promos activas.',
                          'Your appointment reminders, confirmations, and active promos will appear here.'
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
    </>
  );
}
