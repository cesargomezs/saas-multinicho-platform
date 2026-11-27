// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Switch,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export interface CookieConsentPreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  version: string;
  updatedAt: string;
}

const COOKIE_STORAGE_KEY = 'picktime_cookie_consent_v1';
const POLICY_VERSION = '1.0';

export const getSavedCookieConsent = (): CookieConsentPreferences | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(COOKIE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.essential === 'boolean') {
      return parsed as CookieConsentPreferences;
    }
  } catch (_e) {}
  return null;
};

export const openCookiePreferencesModal = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('picktime:open-cookie-modal'));
  } catch (_e) {}
};

export default function CookieConsentBanner() {
  if (Platform.OS !== 'web') return null;

  const { width } = useWindowDimensions();
  const isMobile = width <= 720;

  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lang, setLang] = useState<'es' | 'en'>('es');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [marketingEnabled, setMarketingEnabled] = useState(false);

  const syncUiPrefs = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const gLang = (globalThis as any).__autoflowLang || window.localStorage?.getItem('autoflow_lang');
      if (gLang === 'en' || gLang === 'es') setLang(gLang);
      const gTheme = (globalThis as any).__autoflowTheme || window.localStorage?.getItem('autoflow_theme');
      if (gTheme === 'light' || gTheme === 'dark') setTheme(gTheme);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    syncUiPrefs();
    const existing = getSavedCookieConsent();
    if (!existing) {
      setIsBannerVisible(true);
    } else {
      setAnalyticsEnabled(Boolean(existing.analytics));
      setMarketingEnabled(Boolean(existing.marketing));
    }

    const handleOpenEvent = () => {
      syncUiPrefs();
      const latest = getSavedCookieConsent();
      if (latest) {
        setAnalyticsEnabled(Boolean(latest.analytics));
        setMarketingEnabled(Boolean(latest.marketing));
      }
      setIsModalOpen(true);
    };

    const handleStorage = () => syncUiPrefs();

    window.addEventListener('picktime:open-cookie-modal', handleOpenEvent);
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(syncUiPrefs, 1500);

    return () => {
      window.removeEventListener('picktime:open-cookie-modal', handleOpenEvent);
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, [syncUiPrefs]);

  const tr = (esText: string, enText: string) => (lang === 'en' ? enText : esText);

  const savePreferences = (prefs: { analytics: boolean; marketing: boolean }) => {
    const payload: CookieConsentPreferences = {
      essential: true,
      analytics: prefs.analytics,
      marketing: prefs.marketing,
      version: POLICY_VERSION,
      updatedAt: new Date().toISOString(),
    };
    try {
      window.localStorage?.setItem(COOKIE_STORAGE_KEY, JSON.stringify(payload));
      (globalThis as any).__picktimeCookieConsent = payload;

      // Si el usuario rechaza analítica o marketing, limpiar posibles claves no esenciales
      if (!prefs.analytics) {
        window.localStorage?.removeItem('picktime_analytics_id');
      }
      if (!prefs.marketing) {
        window.localStorage?.removeItem('picktime_marketing_ref');
      }

      window.dispatchEvent(new CustomEvent('picktime:cookie-consent-updated', { detail: payload }));
    } catch (_e) {}

    setAnalyticsEnabled(prefs.analytics);
    setMarketingEnabled(prefs.marketing);
    setIsBannerVisible(false);
    setIsModalOpen(false);
  };

  const isDark = theme === 'dark';
  const palette = {
    bg: isDark ? '#0B0F17' : '#FFFFFF',
    card: isDark ? '#121824' : '#F8FAFC',
    text: isDark ? '#FFFFFF' : '#0F172A',
    muted: isDark ? '#94A3B8' : '#475569',
    border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
    accent: '#FF5E00',
  };

  return (
    <>
      {/* 🍪 Banner inferior discreto solo en Web */}
      {isBannerVisible && !isModalOpen ? (
        <View
          style={[
            styles.bannerContainer,
            {
              backgroundColor: palette.bg,
              borderColor: palette.border,
              padding: isMobile ? 16 : 20,
            },
          ]}
        >
          <View style={[styles.bannerInner, { flexDirection: isMobile ? 'column' : 'row' }]}>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: 'rgba(255, 94, 0, 0.14)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="shield" size={14} color={palette.accent} />
                </View>
                <Text style={{ color: palette.text, fontWeight: '900', fontSize: 14.5 }}>
                  {tr('Cookies y Privacidad en Pick-Time Book', 'Cookies & Privacy on Pick-Time Book')}
                </Text>
              </View>
              <Text style={{ color: palette.muted, fontSize: 12.5, lineHeight: 18 }}>
                {tr(
                  'Usamos cookies y almacenamiento local esenciales para mantener tu sesión, idioma y tema visual, además de cookies opcionales para mejorar la experiencia (CCPA / GDPR). Puedes aceptar todas, usar solo las esenciales o personalizarlas.',
                  'We use essential cookies and local storage to keep your session, language, and theme active, plus optional cookies to improve your experience (CCPA / GDPR). You can accept all, keep essential only, or customize.'
                )}
              </Text>
            </View>

            <View
              style={{
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                gap: 8,
                marginTop: isMobile ? 10 : 0,
              }}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setIsModalOpen(true)}
                style={[
                  styles.btnSecondary,
                  { borderColor: palette.border, backgroundColor: palette.card },
                ]}
              >
                <Text style={{ color: palette.text, fontWeight: '800', fontSize: 12.5 }}>
                  {tr('Configurar', 'Customize')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => savePreferences({ analytics: false, marketing: false })}
                style={[
                  styles.btnSecondary,
                  { borderColor: palette.border, backgroundColor: palette.card },
                ]}
              >
                <Text style={{ color: palette.text, fontWeight: '800', fontSize: 12.5 }}>
                  {tr('Solo esenciales', 'Essential only')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => savePreferences({ analytics: true, marketing: true })}
                style={[styles.btnPrimary, { backgroundColor: palette.accent }]}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12.5 }}>
                  {tr('Aceptar todas', 'Accept all')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {/* ⚙️ Modal de Preferencias Granulares de Cookies */}
      <Modal
        visible={isModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: palette.bg,
                borderColor: palette.border,
              },
            ]}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 14,
                marginBottom: 14,
                borderBottomWidth: 1,
                borderBottomColor: palette.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="sliders" size={18} color={palette.accent} />
                <Text style={{ color: palette.text, fontSize: 17, fontWeight: '900' }}>
                  {tr('Preferencias de Cookies', 'Cookie Preferences')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsModalOpen(false)}>
                <Feather name="x" size={20} color={palette.muted} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: palette.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 16 }}>
              {tr(
                'Elige qué categorías de cookies y almacenamiento local deseas permitir en este navegador:',
                'Choose which categories of cookies and local storage you want to allow in this browser:'
              )}
            </Text>

            {/* 1. Esenciales */}
            <View style={[styles.prefRow, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: palette.text, fontWeight: '900', fontSize: 13.5 }}>
                  {tr('Estrictamente necesarias (Siempre activas)', 'Strictly Necessary (Always active)')}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
                  {tr(
                    'Autenticación, seguridad, preferencia de idioma (ES/EN), tema visual y reservas.',
                    'Authentication, security, language preference (ES/EN), theme, and bookings.'
                  )}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 8,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                }}
              >
                <Text style={{ color: '#10B981', fontWeight: '900', fontSize: 11 }}>
                  {tr('Activas', 'Active')}
                </Text>
              </View>
            </View>

            {/* 2. Analítica y rendimiento */}
            <View style={[styles.prefRow, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: palette.text, fontWeight: '900', fontSize: 13.5 }}>
                  {tr('Analítica y rendimiento', 'Analytics & Performance')}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
                  {tr(
                    'Nos ayuda a medir tiempos de carga y mejorar la navegación del directorio.',
                    'Helps us measure load times and improve directory navigation.'
                  )}
                </Text>
              </View>
              <Switch
                value={analyticsEnabled}
                onValueChange={setAnalyticsEnabled}
                trackColor={{ false: '#334155', true: palette.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* 3. Marketing y campañas */}
            <View style={[styles.prefRow, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: palette.text, fontWeight: '900', fontSize: 13.5 }}>
                  {tr('Promociones y atribución', 'Promotions & Attribution')}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
                  {tr(
                    'Permite recordar cupones promocionales y campañas de negocios locales.',
                    'Allows remembering promotional coupons and local business campaigns.'
                  )}
                </Text>
              </View>
              <Switch
                value={marketingEnabled}
                onValueChange={setMarketingEnabled}
                trackColor={{ false: '#334155', true: palette.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => savePreferences({ analytics: false, marketing: false })}
                style={[
                  styles.btnSecondary,
                  { flex: 1, borderColor: palette.border, backgroundColor: palette.card, height: 44 },
                ]}
              >
                <Text style={{ color: palette.text, fontWeight: '800', fontSize: 13 }}>
                  {tr('Rechazar opcionales', 'Reject optional')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() =>
                  savePreferences({ analytics: analyticsEnabled, marketing: marketingEnabled })
                }
                style={[styles.btnPrimary, { flex: 1, backgroundColor: palette.accent, height: 44 }]}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>
                  {tr('Guardar selección', 'Save preferences')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'fixed' as any,
    bottom: 16,
    left: 16,
    right: 16,
    maxWidth: 1040,
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
  },
  bannerInner: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  btnPrimary: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 22,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
});
