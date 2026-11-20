'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Platform, useWindowDimensions, Image, Switch, ActivityIndicator, Share, Modal } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// ⚙️ CONFIGURACIÓN DE SUPABASE & API
// ==========================================
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hbofrqdubrtogwbuddsa.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'tu-anon-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 0 } }
});



// ==========================================
// 🌎 LISTA PARAMETRIZADA DE INDICATIVOS DE PAÍS
// ==========================================
export const COUNTRY_CODES = [
  { code: '+1', flag: '🇺🇸', label: '🇺🇸 +1', name: 'Estados Unidos / Canadá' },
  { code: '+57', flag: '🇨🇴', label: '🇨🇴 +57', name: 'Colombia' },
  { code: '+52', flag: '🇲🇽', label: '🇲🇽 +52', name: 'México' },
  { code: '+34', flag: '🇪🇸', label: '🇪🇸 +34', name: 'España' },
  { code: '+54', flag: '🇦🇷', label: '🇦🇷 +54', name: 'Argentina' },
  { code: '+56', flag: '🇨🇱', label: '🇨🇱 +56', name: 'Chile' },
  { code: '+51', flag: '🇵🇪', label: '🇵🇪 +51', name: 'Perú' },
];

const CountryCodeSelector = ({
  value,
  onChange,
  tColor,
  width = 110
}: {
  value: string;
  onChange: (val: string) => void;
  tColor: any;
  width?: number;
}) => {
  if (Platform.OS === 'web') {
    return (
      <select
        className="web-input-override"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: `${width}px`,
          height: '100%',
          border: 'none',
          borderRight: `1px solid ${tColor.border}`,
          backgroundColor: tColor.border,
          borderRadius: 0,
          paddingLeft: '12px',
          fontWeight: 'bold',
          cursor: 'pointer'
        } as any}
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
    );
  }

  const currentIdx = COUNTRY_CODES.findIndex((c) => c.code === value);
  const currentItem = COUNTRY_CODES[currentIdx >= 0 ? currentIdx : 0];
  const handleCycleCountry = () => {
    const nextIdx = (currentIdx + 1) % COUNTRY_CODES.length;
    onChange(COUNTRY_CODES[nextIdx].code);
  };

  return (
    <TouchableOpacity
      onPress={handleCycleCountry}
      style={{
        paddingHorizontal: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderRightWidth: 1,
        borderColor: tColor.border,
        backgroundColor: tColor.border
      }}
    >
      <Text style={{ color: tColor.text, fontWeight: 'bold' }}>{currentItem.label} ▾</Text>
    </TouchableOpacity>
  );
};

// 🌟 CAPITALIZACIÓN AUTOMÁTICA (Letra Capitalizada en Nombres, Reseñas y Títulos) 🌟
const toTitleCase = (str: string) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
};

// Oración limpia para descripciones largas (solo primera letra en mayúscula, sin capitalizar cada palabra)
const toSentenceCase = (str: string) => {
  if (!str) return '';
  const clean = String(str).trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
};

const cleanPhoneDigits = (phoneStr?: string | null): string => {
  if (!phoneStr) return '';
  const digits = String(phoneStr).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

// 🕒 HELPER UNIVERSAL MULTI-PAÍS (WALL-CLOCK TIME):
// Convierte cualquier cita de la BD ("2026-11-12T14:00:00.000Z" o Date + time "14:00")
// en un objeto Date local exacto (2:00 PM = 14:00 en el reloj del usuario, sin restar ni sumar horas por UTC).
const parseAppointmentWallClock = (appObjOrStr: any, explicitTime?: string): Date => {
  if (!appObjOrStr) return new Date();
  const rawStr = typeof appObjOrStr === 'string'
    ? appObjOrStr
    : (appObjOrStr.metadata?.localDate || appObjOrStr.appointmentDate || appObjOrStr.date || '');
  const timeStr = explicitTime || (typeof appObjOrStr === 'object' ? (appObjOrStr.metadata?.localTime || appObjOrStr.time) : '') || '';
  const datePart = String(rawStr).split('T')[0];
  const cleanTime = timeStr
    ? String(timeStr).substring(0, 5)
    : (String(rawStr).includes('T') ? String(rawStr).split('T')[1].substring(0, 5) : '12:00');
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && /^\d{2}:\d{2}$/.test(cleanTime)) {
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = cleanTime.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }
  return new Date(rawStr);
};

// Formatea "14:00" -> "2:00 PM" de forma universal sin depender de conversiones UTC del navegador
const formatWallClockTime12h = (orderObj: any): string => {
  const rawTime = orderObj?.metadata?.localTime || orderObj?.time || (orderObj?.appointmentDate && String(orderObj.appointmentDate).includes('T') ? String(orderObj.appointmentDate).split('T')[1].substring(0, 5) : '');
  if (rawTime && /^\d{2}:\d{2}/.test(rawTime)) {
    const [hhStr, mmStr] = rawTime.substring(0, 5).split(':');
    const hh = parseInt(hhStr, 10);
    if (!isNaN(hh)) {
      const ampm = hh >= 12 ? 'PM' : 'AM';
      const hh12 = hh % 12 === 0 ? 12 : hh % 12;
      return `${hh12}:${mmStr} ${ampm}`;
    }
  }
  return rawTime || 'Hora N/A';
};

// 📅 HELPER UNIVERSAL: Generar enlace directo a Google Calendar en 1 clic (para Abogados, Odontólogos, etc.)
const buildGoogleCalendarUrl = (orderObj: any, businessName?: string, durationMin = 30): string => {
  const startDt = parseAppointmentWallClock(orderObj);
  const endDt = new Date(startDt.getTime() + durationMin * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const title = encodeURIComponent(`${orderObj?.service?.name || orderObj?.serviceType || 'Cita'} - ${orderObj?.clientName || 'Cliente'} (${businessName || 'AutoFlow'})`);
  const modalityLabel = orderObj?.metadata?.modality === 'phone_call' ? 'Llamada Telefónica' : orderObj?.metadata?.modality === 'video_call' ? 'Videollamada' : 'Presencial en Oficina/Consultorio';
  const details = encodeURIComponent(
    `Cliente/Paciente: ${orderObj?.clientName || 'N/A'}
Teléfono: ${orderObj?.clientPhone || 'N/A'}
Modalidad: ${modalityLabel}
Detalle/Motivo: ${orderObj?.metadata?.caseType || orderObj?.notes || 'Sin notas adicionales'}`
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(startDt)}/${fmt(endDt)}&details=${details}`;
};

const getReportDiscountInfo = (r: any, servicesList: ServiceInfo[]) => {
  const notesStr = String(r.mechanicNotes || r.notes || r.staffNotes || '').toUpperCase();
  if (notesStr.includes('REFERIR') || notesStr.includes('REFERIDO') || notesStr.includes('RECOMENDADO') || r.referralDiscountApplied) {
    return { type: 'referral', label: '🏆 Desc. Referido', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' };
  }
  if (notesStr.includes('PREMIO DE FIDELIDAD') || notesStr.includes('SERVICIO GRATIS') || r.rewardApplied) {
    return { type: 'loyalty', label: '🎁 Premio Fidelidad', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
  }
  const paid = Number(r.cost ?? r.finalCost ?? -1);
  if (paid >= 0 && r.service) {
    const matchedSrv = servicesList.find(s => s.name.toLowerCase() === String(r.service).toLowerCase());
    if (matchedSrv) {
      const catalogPrice = Number(matchedSrv.price);
      if (paid === 0 && catalogPrice > 0) {
        return { type: 'loyalty', label: '🎁 Premio (100%)', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
      }
      if (paid > 0 && paid < catalogPrice) {
        const pct = Math.round(((catalogPrice - paid) / catalogPrice) * 100);
        return { type: 'referral', label: `🏷️ Desc. (-${pct}%)`, color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' };
      }
    }
  }
  return null;
};

const formatCurrency = (value: string | number) => {
  if (value === null || value === undefined) return '';
  const strValue = String(value);
  const isDecimal = strValue.includes('.');
  const cleanStr = strValue.replace(/[^0-9.]/g, '');
  if (!cleanStr) return '';
  
  if (isDecimal) {
    const parts = cleanStr.split('.');
    const whole = parts[0] ? Number(parts[0]).toLocaleString('en-US') : '0';
    const decimal = parts[1] ? parts[1].substring(0, 2) : '00';
    return `$ ${whole}.${decimal}`;
  }
  
  return `$ ${Number(cleanStr).toLocaleString('en-US')}`;
};

// ==========================================
// 🔒 COMPONENTE LAZY LOAD PARA IMÁGENES PRIVADAS
// ==========================================
const PrivateSupabaseImage = ({ path, alt, isExpanded = false }: { path: string, alt: string, isExpanded?: boolean }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (!path) return;
      let cleanPath: string = path;
      
      if (cleanPath.startsWith('old/old/')) cleanPath = cleanPath.replace('old/old/', 'old/');
      if (cleanPath.startsWith('new/new/')) cleanPath = cleanPath.replace('new/new/', 'new/');
      if (cleanPath.startsWith('portfolio/portfolio/')) cleanPath = cleanPath.replace('portfolio/portfolio/', 'portfolio/');
      if (cleanPath.startsWith('services/services/')) cleanPath = cleanPath.replace('services/services/', 'services/');

      if (cleanPath.includes('/public/autoflow/')) {
        const splitResult = cleanPath.split('/public/autoflow/')[1];
        if (splitResult) cleanPath = splitResult;
      } else if (!cleanPath.includes('/')) {
        if (cleanPath.startsWith('old')) cleanPath = `old/${cleanPath}`;
        else if (cleanPath.startsWith('new')) cleanPath = `new/${cleanPath}`;
        else if (cleanPath.startsWith('portfolio')) cleanPath = `portfolio/${cleanPath}`;
        else if (cleanPath.startsWith('services')) cleanPath = `services/${cleanPath}`;
      }
      
      const { data, error } = await supabase.storage.from('autoflow').createSignedUrl(cleanPath, 3600);
      if (error || !data?.signedUrl) setError(true);
      else setSignedUrl(data.signedUrl);
    };
    fetchSignedUrl();
  }, [path]);

  if (error) {
    return (
      <View style={{ padding: 20, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: '#EF4444', fontStyle: 'italic' }}>❌ No disponible</Text>
      </View>
    );
  }
  
  if (!signedUrl) {
    return (
      <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <Text style={{ fontSize: 14, color: '#94A3B8', fontStyle: 'italic' }}>⏳ Cargando...</Text>
      </View>
    );
  }
  
  if (Platform.OS === 'web') {
    return (
      <img 
        src={signedUrl} 
        alt={alt} 
        style={{ width: '100%', height: '100%', maxHeight: isExpanded ? '85vh' : '100%', objectFit: 'cover', borderRadius: 'inherit', boxShadow: isExpanded ? '0 25px 50px -12px rgba(0,0,0,0.5)' : 'none', backgroundColor: '#000' }} 
      />
    );
  }
  return <Image source={{ uri: signedUrl }} style={{ width: '100%', height: '100%', borderRadius: 12 }} resizeMode="cover" />;
};

// ==========================================
// 🎠 CARRUSEL RESPONSIVE (SNAP + FLECHAS + PUNTOS)
// - Columnas automáticas según el ancho real del contenedor:
//   móvil = 1 tarjeta con "peek" de la siguiente, tablet = 2, desktop = 3, wide = 4.
// - Si hay menos tarjetas que columnas, se reparten para llenar el ancho (sin huecos).
// - Con muchos registros: flechas siempre, puntos si son pocos y barra de progreso si son muchos.
// ==========================================
function ResponsiveCarousel<T>({
  data,
  renderItem,
  gap = 24,
  minItemWidth = 280,
  maxItemWidth,
  maxCols = 4,
  tColor,
  brandColor,
  arrowTop = 120
}: {
  data: T[];
  renderItem: (item: T, idx: number, itemWidth: number) => React.ReactNode;
  gap?: number;
  minItemWidth?: number;
  maxItemWidth?: number;
  maxCols?: number;
  tColor: any;
  brandColor: string;
  arrowTop?: number | string;
}) {
  // `any` evita el conflicto de tipos del ref de ScrollView entre versiones de @types/react
  const scrollRef = useRef<any>(null);
  const [scrollX, setScrollX] = useState(0);
  const [viewW, setViewW] = useState(0);

  const count = data.length;
  const isNarrow = viewW > 0 && viewW < 560;

  let cols = 1;
  let itemWidth = viewW;
  if (viewW > 0) {
    if (isNarrow) {
      cols = 1;
      itemWidth = count > 1 ? Math.round(viewW * 0.86) : viewW;
    } else {
      cols = Math.max(1, Math.min(maxCols, Math.floor((viewW + gap) / (minItemWidth + gap))));
      cols = Math.min(cols, Math.max(1, count));
      itemWidth = Math.floor((viewW - gap * (cols - 1)) / cols);
    }
    if (maxItemWidth) itemWidth = Math.min(itemWidth, maxItemWidth);
  }

  const step = itemWidth + gap;
  const contentW = count * itemWidth + Math.max(0, count - 1) * gap;
  const maxX = Math.max(0, contentW - viewW);
  const canScroll = count > cols && maxX > 8;
  const positions = Math.max(1, count - cols + 1);
  const canLeft = scrollX > 8;
  const canRight = scrollX < maxX - 8;
  const activeIdx = !canScroll ? 0 : (scrollX >= maxX - 8 ? positions - 1 : Math.min(positions - 1, Math.max(0, Math.round(scrollX / step))));

  const goTo = (idx: number) => {
    const clamped = Math.max(0, Math.min(positions - 1, idx));
    scrollRef.current?.scrollTo({ x: Math.min(clamped * step, maxX), animated: true });
  };

  const arrowStyle = (side: 'left' | 'right') => ({
    position: 'absolute' as const,
    top: arrowTop as any,
    [side]: 8,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(5, 7, 12, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    zIndex: 20
  });

  const showDots = positions <= 8;
  const progress = maxX > 0 ? Math.min(1, Math.max(0, scrollX / maxX)) : 0;

  return (
    <View style={{ width: '100%' }} onLayout={(e) => setViewW(Math.floor(e.nativeEvent.layout.width))}>
      {viewW > 0 ? (
        <>
          <View style={{ position: 'relative' }}>
            <ScrollView
              ref={scrollRef}
              horizontal
              scrollEnabled={canScroll}
              showsHorizontalScrollIndicator={false}
              snapToInterval={step}
              snapToAlignment="start"
              decelerationRate="fast"
              scrollEventThrottle={32}
              onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
            >
              <View style={{ flexDirection: 'row', gap }}>
                {data.map((item, idx) => (
                  <View key={idx} style={{ width: itemWidth }}>
                    {renderItem(item, idx, itemWidth)}
                  </View>
                ))}
              </View>
            </ScrollView>

            {canScroll && canLeft ? (
              <TouchableOpacity activeOpacity={0.8} style={arrowStyle('left')} onPress={() => goTo(activeIdx - (cols > 1 ? cols : 1))}>
                <Feather name="chevron-left" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
            {canScroll && canRight ? (
              <TouchableOpacity activeOpacity={0.8} style={arrowStyle('right')} onPress={() => goTo(activeIdx + (cols > 1 ? cols : 1))}>
                <Feather name="chevron-right" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
          </View>

          {canScroll ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              {showDots ? (
                Array.from({ length: positions }).map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                    onPress={() => goTo(i)}
                    style={{ width: i === activeIdx ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === activeIdx ? brandColor : tColor.border }}
                  />
                ))
              ) : (
                <View style={{ width: 140, height: 4, borderRadius: 2, backgroundColor: tColor.border, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.max(8, progress * 100)}%`, height: '100%', backgroundColor: brandColor, borderRadius: 2 }} />
                </View>
              )}
              <Text style={{ color: tColor.muted, fontSize: 12, fontWeight: '800', marginLeft: 8 }}>
                {cols > 1 ? `${activeIdx + 1}–${Math.min(count, activeIdx + cols)} de ${count}` : `${activeIdx + 1} de ${count}`}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// ==========================================
// 🎨 COMPONENTE DE DEGRADADO CONTINUO REAL (WEB + iOS + ANDROID SIN BANDAS NI LÍNEAS)
// En iOS/Android genera un PNG 1x256 con curva cúbica de 256 niveles reales de canal alfa,
// eliminando por completo las franjas/escalones ("banding") de los <View> apilados.
// ==========================================
const buildSmoothGradientPngDataUri = (rgbStr: string): string => {
  const parts = rgbStr.split(',').map((s) => Math.max(0, Math.min(255, parseInt(s.trim(), 10) || 0)));
  const r = parts[0] ?? 5;
  const g = parts[1] ?? 7;
  const b = parts[2] ?? 12;
  const width = 1;
  const height = 256;

  // 1. Construir scanlines RGBA sin compresión (bloque deflate store)
  const rawLen = height * (1 + width * 4);
  const raw = new Uint8Array(rawLen);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filtro PNG = 0 (None)
    const t = y / (height - 1);
    // Curva ease-in-out suave de 0 a 255 niveles de opacidad
    const eased = t * t * (3 - 2 * t);
    const alpha = Math.round(eased * 255);
    raw[p++] = r;
    raw[p++] = g;
    raw[p++] = b;
    raw[p++] = alpha;
  }

  // 2. Envolver en stream zlib (sin compresión, BFINAL=1, BTYPE=00)
  const zlibLen = 2 + 5 + rawLen + 4;
  const zlib = new Uint8Array(zlibLen);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  zlib[2] = 0x01;
  zlib[3] = rawLen & 0xff;
  zlib[4] = (rawLen >> 8) & 0xff;
  const nlen = (~rawLen) & 0xffff;
  zlib[5] = nlen & 0xff;
  zlib[6] = (nlen >> 8) & 0xff;
  zlib.set(raw, 7);

  // Adler-32 checksum
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < rawLen; i++) {
    s1 = (s1 + raw[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = ((s2 << 16) | s1) >>> 0;
  let zp = 7 + rawLen;
  zlib[zp++] = (adler >>> 24) & 0xff;
  zlib[zp++] = (adler >>> 16) & 0xff;
  zlib[zp++] = (adler >>> 8) & 0xff;
  zlib[zp++] = adler & 0xff;

  // 3. Tabla CRC32 para chunks PNG
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const makeChunk = (typeStr: string, dataBytes: Uint8Array) => {
    const len = dataBytes.length;
    const out = new Uint8Array(12 + len);
    out[0] = (len >>> 24) & 0xff;
    out[1] = (len >>> 16) & 0xff;
    out[2] = (len >>> 8) & 0xff;
    out[3] = len & 0xff;
    for (let i = 0; i < 4; i++) out[4 + i] = typeStr.charCodeAt(i);
    out.set(dataBytes, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < 8 + len; i++) {
      crc = crcTable[(crc ^ out[i]) & 0xff] ^ (crc >>> 8);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    out[8 + len] = (crc >>> 24) & 0xff;
    out[9 + len] = (crc >>> 16) & 0xff;
    out[10 + len] = (crc >>> 8) & 0xff;
    out[11 + len] = crc & 0xff;
    return out;
  };

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array([
    0, 0, 0, width,
    0, 0, (height >> 8) & 0xff, height & 0xff,
    8, // 8-bit depth
    6, // RGBA color type
    0, 0, 0
  ]);
  const cIHDR = makeChunk('IHDR', ihdr);
  const cIDAT = makeChunk('IDAT', zlib);
  const cIEND = makeChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(sig.length + cIHDR.length + cIDAT.length + cIEND.length);
  let offset = 0;
  png.set(sig, offset); offset += sig.length;
  png.set(cIHDR, offset); offset += cIHDR.length;
  png.set(cIDAT, offset); offset += cIDAT.length;
  png.set(cIEND, offset);

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let b64 = '';
  for (let i = 0; i < png.length; i += 3) {
    const b0 = png[i];
    const b1 = i + 1 < png.length ? png[i + 1] : 0;
    const b2 = i + 2 < png.length ? png[i + 2] : 0;
    b64 += chars[b0 >> 2];
    b64 += chars[((b0 & 3) << 4) | (b1 >> 4)];
    b64 += i + 1 < png.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    b64 += i + 2 < png.length ? chars[b2 & 63] : '=';
  }
  return `data:image/png;base64,${b64}`;
};

const GRADIENT_URI_CACHE: Record<string, string> = {};

const BottomHalfGradientOverlay = ({
  heightPct = '52%',
  baseColor = '14, 18, 24'
}: {
  heightPct?: string;
  baseColor?: string;
}) => {
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: heightPct as any,
          backgroundImage: `linear-gradient(180deg, rgba(${baseColor}, 0) 0%, rgba(${baseColor}, 0.28) 35%, rgba(${baseColor}, 0.72) 72%, rgba(${baseColor}, 0.96) 100%)`
        } as any}
      />
    );
  }

  if (!GRADIENT_URI_CACHE[baseColor]) {
    GRADIENT_URI_CACHE[baseColor] = buildSmoothGradientPngDataUri(baseColor);
  }

  return (
    <Image
      pointerEvents="none"
      source={{ uri: GRADIENT_URI_CACHE[baseColor] }}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: heightPct as any,
      }}
      resizeMode="stretch"
    />
  );
};

// ==========================================
// 🧩 ESTILOS WEB DINÁMICOS
// ==========================================
const WebStyles = ({ theme, tColor, brandColor }: { theme: 'dark' | 'light', tColor: any, brandColor: string }) => {
  if (Platform.OS !== 'web') return null;
  return (
    <style dangerouslySetInnerHTML={{__html: `
      html, body { background-color: ${tColor.bg}; color: ${tColor.text}; margin: 0; padding: 0; overflow-x: hidden; max-width: 100vw; transition: background-color 0.3s ease; -webkit-font-smoothing: antialiased; }
      * { font-family: 'Inter', system-ui, sans-serif; box-sizing: border-box; }
      .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; width: 100%; max-height: 600px; overflow-y: auto; }
      .table-responsive::-webkit-scrollbar { width: 8px; height: 8px; }
      .table-responsive::-webkit-scrollbar-track { background: transparent; }
      .table-responsive::-webkit-scrollbar-thumb { background: ${tColor.border}; border-radius: 4px; }
      .glass-table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: 800px; }
      .glass-table th { position: sticky; top: 0; background-color: ${theme === 'dark' ? '#12161C' : '#E2E8F0'}; z-index: 10; border-bottom: 2px solid ${tColor.border}; color: ${brandColor}; font-size: 13px; font-weight: 900; text-transform: uppercase; padding: 20px 24px; text-align: left; letter-spacing: 0.5px; }
      .glass-table td { border-bottom: 1px solid ${tColor.border}; font-size: 14.5px; font-weight: 500; color: ${tColor.text}; padding: 20px 24px; text-align: left; vertical-align: middle; }
      .web-input-override { height: 48px !important; background-color: ${tColor.input} !important; border: 1px solid ${tColor.border} !important; color: ${tColor.text} !important; border-radius: 12px !important; padding: 0 16px !important; font-size: 14.5px !important; outline: none !important; width: 100% !important; color-scheme: ${theme} !important; transition: all 0.3s ease; }
      .web-input-override option { background-color: ${theme === 'dark' ? '#12161C' : '#FFF'} !important; color: ${tColor.text} !important; }
      .modal-overlay { backdrop-filter: blur(12px); }
      .horarios-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
      .chart-bar-col { transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; }
      .chart-bar-col:hover { transform: translateY(-4px) scale(1.04); }
      .portal-dock-scroll, .portal-dock-scroll > div { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      .portal-dock-scroll::-webkit-scrollbar, .portal-dock-scroll > div::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      .portal-tab-pill { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; user-select: none; }
      .portal-tab-pill:hover { background-color: ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)'} !important; }
      .portal-tab-pill-active { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; user-select: none; box-shadow: 0 4px 14px -2px ${brandColor}66; }
      .portal-nav-arrow { transition: all 0.18s ease; cursor: pointer; backdrop-filter: blur(10px); }
      .portal-nav-arrow:hover { transform: scale(1.08); background-color: ${brandColor} !important; border-color: ${brandColor} !important; }
    `}} />
  );
};

// ==========================================
// 🧩 INTERFACES DE TYPESCRIPT
// ==========================================
interface PortfolioItem { url: string; title: string; description: string; }
interface ReviewItem { id: string; clientKey: string; clientName: string; rating: number; reaction?: 'like' | 'dislike'; comment: string; serviceName?: string; createdAt: string; }
interface PushCampaignItem { id: string; tenant_id?: string; title: string; message: string; target_audience: string; is_active?: boolean; sent_at: string; }
interface VapiVoiceConfig { isActive?: boolean; phoneNumber?: string; privateApiKey?: string; phoneNumberId?: string; assistantId?: string; languageMode?: 'bilingual' | 'es' | 'en'; transferPhone?: string; webhookBaseUrl?: string; allowUrgentOverride?: boolean; lastSyncedAt?: string; }
interface TelegramChannelConfig { isActive?: boolean; channelName?: string; chatId?: string; botToken?: string; notifyNewAppointments?: boolean; notifyRecordings?: boolean; notifyConfirmationsAndCancels?: boolean; notifyPOSClosures?: boolean; updatedAt?: string; }
interface LoyaltyConfig { isActive: boolean; visitsRequired: number; rewardType: 'free_service' | 'discount'; rewardValue: number; referralActive?: boolean; referralDiscountPercent?: number; reviews?: ReviewItem[]; campaigns?: PushCampaignItem[]; vapiConfig?: VapiVoiceConfig; telegramConfig?: TelegramChannelConfig; staffPortalPin?: string; }
interface TenantInfo { id: string; name: string; businessType?: string; niche?: string; logoUrl?: string | null; primaryColor?: string | null; business_hours?: any; businessHours?: any; portfolio?: PortfolioItem[]; loyaltyConfig?: LoyaltyConfig; }
interface ServiceInfo { id: string; name: string; description: string | null; price: string; durationMinutes?: number; isActive?: boolean; imageUrl?: string | null; } 
interface StaffInfo { id: string; name: string; role: string; isActive?: boolean; }
interface ReportItem { id: string; date?: string; createdAt?: string; plate?: string; clientName?: string; service?: string; mechanicId?: string; mechanicName?: string; cost?: number; finalCost?: number | string; status?: string; mechanicNotes?: string; notes?: string; _empty?: boolean; }

// ==========================================
// 🚩 REPORTES DE CONTENIDO + DECLARACIÓN LEGAL DEL NEGOCIO
// ==========================================
interface ReportTarget { type: 'review' | 'portfolio' | 'service' | 'campaign' | 'business'; id: string; title: string; excerpt?: string; }

const REPORT_REASONS = [
  { key: 'copyright_spam', label: 'Infracción de Copyright o Spam' },
  { key: 'offensive', label: 'Contenido inapropiado u ofensivo' },
  { key: 'false_info', label: 'Información falsa o engañosa' },
  { key: 'not_exists', label: 'El negocio no existe' },
];

// Casilla obligatoria antes de que el negocio publique imágenes, servicios o campañas
const ContentTermsCheck = ({ value, onChange, tColor, brandColor, lang = 'es' }: { value: boolean; onChange: (v: boolean) => void; tColor: any; brandColor: string; lang?: 'es' | 'en' }) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() => onChange(!value)}
    style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: value ? brandColor : tColor.border, backgroundColor: tColor.input, marginBottom: 16 }}
  >
    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: value ? brandColor : tColor.muted, backgroundColor: value ? brandColor : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
      {value ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
    </View>
    <Text style={{ flex: 1, color: tColor.muted, fontSize: 12, lineHeight: 18 }}>
      <Text style={{ color: tColor.text, fontWeight: '800' }}>
        {lang === 'en' ? 'I declare that I hold the rights or have authorization ' : 'Declaro que soy titular de los derechos o cuento con autorización '}
      </Text>
      {lang === 'en'
        ? 'for the images and texts I publish, that they are not offensive, illegal, or misleading, and that I assume full responsibility for this content before third parties. AutoFlow only hosts content published by businesses, does not verify it, and may remove reported content.'
        : 'de las imágenes y textos que publico, que no son ofensivos, ilegales ni engañosos, y que asumo toda la responsabilidad por este contenido frente a terceros. AutoFlow solo aloja lo que publican los negocios, no lo verifica y puede retirar el contenido que sea reportado.'}
    </Text>
  </TouchableOpacity>
);

export default function TenantDashboardScreen() {
  const router = useRouter();
  const { tenantId, view: viewParam, reaction: reactionParam, role: roleParam, section: sectionParam } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isMobile = width <= 850;

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const gTheme = (globalThis as any).__autoflowTheme;
    if (gTheme === 'light' || gTheme === 'dark') return gTheme;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('autoflow_theme');
        if (saved === 'light' || saved === 'dark') return saved;
      } catch (e) {}
    }
    return 'dark';
  });

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    (globalThis as any).__autoflowTheme = nextTheme;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try { window.localStorage.setItem('autoflow_theme', nextTheme); } catch (e) {}
    }
  };

  const [lang, setLang] = useState<'es' | 'en'>(() => {
    const gLang = (globalThis as any).__autoflowLang;
    if (gLang === 'en' || gLang === 'es') return gLang;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('autoflow_lang');
        if (saved === 'en' || saved === 'es') return saved;
      } catch (e) {}
    }
    return 'es';
  });

  const handleToggleLang = () => {
    const nextLang = lang === 'es' ? 'en' : 'es';
    setLang(nextLang);
    (globalThis as any).__autoflowLang = nextLang;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try { window.localStorage.setItem('autoflow_lang', nextLang); } catch (e) {}
    }
  };

  // 🌐 Helper universal de traducción instantánea (Español / Inglés)
  const tr = (esText: string, enText: string): string => (lang === 'en' ? enText : esText);

  const t = useMemo(() => ({
    es: {
      navBookings: 'Reservas',
      navRecords: 'Expediente',
      navPortal: 'Portal Interno',
      navBack: 'Volver',
      navSupport: 'Soporte',
      navLogout: 'Cerrar Sesión',
      navMainTitle: 'Navegación Principal',
      navPortalSections: 'Secciones del Portal Interno (Scroll)',
      promoBadge: '📢 PROMO ACTIVA',
      promoClaim: 'Aprovechar Ahora →',
      heroTitle1: 'Servicios',
      heroTitle2: 'Premium',
      heroSubtitle: 'Reserva tu cita en línea en tiempo real con cualquiera de nuestros profesionales disponibles.',
      distancePrefix: 'Estás a',
      distanceSuffix: 'millas de',
      ratePrompt: '¿Ya nos visitaste? Toca 👍 o 👎 para calificar →',
      bookNow: 'Reservar Cita',
      noActiveServices: 'El catálogo no tiene servicios activos.',
      ourWork1: 'Nuestros',
      ourWork2: 'Trabajos',
      reviewsTitle1: 'Opiniones y Reacciones',
      reviewsTitle2: 'Verificadas',
      likesLabel: 'Me gusta',
      dislikesLabel: 'No me gusta',
      verifiedClients: 'clientes verificados',
      likeBtn: 'Me gustó',
      dislikeBtn: 'No me gustó',
      onlyCompletedRule: '🔒 Solo clientes con un servicio completado pueden calificar.',
      noReviewsTitle: 'Aún no hay valoraciones registradas',
      noReviewsSub: 'Los clientes que completan su servicio pueden dar 👍 Like o dejar una reseña única directamente desde su Expediente.',
      reportListing: 'Reportar publicación',
      reportSent: 'Reporte enviado',
      recordsTitle: 'Expediente',
      recordsSubAuto: 'Ingresa la placa para consultar el historial.',
      recordsSubOther: 'Ingresa el Teléfono o ID para consultar historial.',
      platePlaceholder: 'Placa (Ej: JNT776)',
      phoneIdPlaceholder: 'Teléfono o ID',
      searchBtn: '🔍 Consultar',
      searchingBtn: 'Buscando...',
      newSearchBtn: '🔍 Otra Búsqueda',
      bookFromRecordBtn: '📅 Agendar Cita',
      officialRatingTitle: '⭐ Tu Calificación Oficial como Cliente',
      vipPlanTitle: 'Plan de Incentivos VIP 🎁',
      scheduledAptsTitle: '📅 Tus Citas Programadas',
      confirmAttendanceBtn: 'Confirmar Asistencia',
      confirmingBtn: 'Confirmando...',
      cancelAptBtn: 'Cancelar Cita',
      visitHistoryTitle: 'Historial de Visitas',
      noClosedOrders: 'No registra órdenes cerradas.',
      visitNum: 'Visita #',
      servicePerformed: 'Servicio Realizado',
      costPaid: 'Costo Pagado',
      staffAccessTitle: 'Acceso Operativo',
      staffOf: 'Personal de',
      signInBtn: 'Ingresar',
      wrongPin: 'PIN Incorrecto',
      activeSessionBadge: '🟢 Sesión Operativa Activa',
      supportActionBtn: 'Conectar con Soporte',
      logoutActionBtn: 'Cerrar Sesión',
      tabOrders: 'Órdenes',
      tabUpcoming: 'Próximos',
      tabReports: 'Reportes',
      tabStaff: 'Personal',
      tabCatalog: 'Catálogo',
      tabHours: 'Horarios',
      tabPortfolio: 'Portafolio',
      tabLoyalty: 'Fidelidad',
      tabAiReception: 'Recepción IA',
      noScheduledOrders: 'No hay órdenes programadas.',
      completeOrderBtn: '📋 Completar Orden',
      cancelBtn: 'Cancelar',
      reportsTitle: 'Facturación y Analítica de Tráfico',
      hideChartBtn: '📊 Ocultar Gráfica de Tráfico',
      showChartBtn: '📈 Ver Gráfica de Tráfico y Campañas',
      kpiRevenue: 'TOTAL DE INGRESOS',
      kpiCompleted: 'SERVICIOS COMPLETADOS',
      kpiPromos: 'PROMOS / REFERIDOS APLICADOS',
      staffMgmtTitle: 'Gestión de Equipo / Staff',
      catalogMgmtTitle: 'Gestión de Catálogo',
      newServiceBtn: '+ Nuevo Servicio',
      hoursTitle: 'Horarios de Atención',
      saveHoursBtn: '💾 Guardar Horarios',
      closedLabel: 'CERRADO',
      portfolioTitle: 'Portafolio Visual',
      addWorkBtn: '+ Agregar Trabajo',
      loyaltyTitle: 'Programas de Retención',
      saveRulesBtn: '💾 Guardar Reglas',
      aiReceptionTitle: 'Recepcionista Telefónica IA 24/7 (Bilingüe ES / EN)',
      aiReceptionSub: 'Tu propio asistente de voz contesta llamadas, verifica qué profesional está libre, agenda en tu calendario y graba la llamada.',
      connectAiBtn: '⚡ Conectar y Autoconfigurar Recepcionista IA',
      tgChannelTitle: 'Canal Interno de Telegram (Exclusivo de este Consultorio / Negocio)',
      saveTgBtn: '💾 Guardar Canal de Telegram en BD',
      testTgBtn: '🔔 Enviar Alerta de Prueba al Consultorio',
      helpSupportBtn: 'Ayuda / Soporte',
      newBookingTitle: 'Nueva Reserva',
      selectedServiceLabel: 'Servicio Seleccionado',
      aptDateLabel: 'Día de la Cita',
      aptTimeLabel: 'Hora de la Cita',
      confirmBookingBtn: 'Confirmar Agendamiento',
      processingBtn: 'Procesando...',
      posTitle: 'Cierre de Servicio (POS)',
      closeOrderBillBtn: '✅ Cerrar Orden y Facturar',
      cancelModalTitle: 'Cancelar Cita y Liberar Turno',
      confirmCancelBtn: 'Confirmar Cancelación',
      supportModalTitle: 'Soporte y Acompañamiento AutoFlow',
      supportModalSub: 'Atención directa del equipo técnico (Mensaje privado a AutoFlow)',
      reportModalTitle: 'Reportar Contenido',
      submitReportBtn: 'Enviar Reporte',
    },
    en: {
      navBookings: 'Bookings',
      navRecords: 'Records',
      navPortal: 'Staff Portal',
      navBack: 'Back',
      navSupport: 'Support',
      navLogout: 'Log Out',
      navMainTitle: 'Main Navigation',
      navPortalSections: 'Staff Portal Sections (Scroll)',
      promoBadge: '📢 ACTIVE PROMO',
      promoClaim: 'Claim Offer →',
      heroTitle1: 'Premium',
      heroTitle2: 'Services',
      heroSubtitle: 'Book your appointment online in real time with any of our available professionals.',
      distancePrefix: 'You are',
      distanceSuffix: 'miles from',
      ratePrompt: 'Already visited us? Tap 👍 or 👎 to rate →',
      bookNow: 'Book Now',
      noActiveServices: 'No active services in the catalog.',
      ourWork1: 'Our',
      ourWork2: 'Work',
      reviewsTitle1: 'Verified',
      reviewsTitle2: 'Reviews & Reactions',
      likesLabel: 'Likes',
      dislikesLabel: 'Dislikes',
      verifiedClients: 'verified clients',
      likeBtn: 'Like',
      dislikeBtn: 'Dislike',
      onlyCompletedRule: '🔒 Only clients with a completed service can rate.',
      noReviewsTitle: 'No ratings registered yet',
      noReviewsSub: 'Clients who complete a service can leave a 👍 Like or a verified review from their Records.',
      reportListing: 'Report listing',
      reportSent: 'Report sent',
      recordsTitle: 'Client Records',
      recordsSubAuto: 'Enter the license plate to check service history.',
      recordsSubOther: 'Enter Phone Number or ID to check service history.',
      platePlaceholder: 'Plate (e.g., JNT776)',
      phoneIdPlaceholder: 'Phone or ID',
      searchBtn: '🔍 Search',
      searchingBtn: 'Searching...',
      newSearchBtn: '🔍 New Search',
      bookFromRecordBtn: '📅 Book Appointment',
      officialRatingTitle: '⭐ Your Official Client Rating',
      vipPlanTitle: 'VIP Loyalty Plan 🎁',
      scheduledAptsTitle: '📅 Your Scheduled Appointments',
      confirmAttendanceBtn: 'Confirm Attendance',
      confirmingBtn: 'Confirming...',
      cancelAptBtn: 'Cancel Appointment',
      visitHistoryTitle: 'Visit History',
      noClosedOrders: 'No completed visits found.',
      visitNum: 'Visit #',
      servicePerformed: 'Service Performed',
      costPaid: 'Amount Paid',
      staffAccessTitle: 'Staff Access',
      staffOf: 'Staff of',
      signInBtn: 'Sign In',
      wrongPin: 'Incorrect PIN',
      activeSessionBadge: '🟢 Active Staff Session',
      supportActionBtn: 'Contact Support',
      logoutActionBtn: 'Log Out',
      tabOrders: 'Orders',
      tabUpcoming: 'Upcoming',
      tabReports: 'Reports',
      tabStaff: 'Staff',
      tabCatalog: 'Catalog',
      tabHours: 'Hours',
      tabPortfolio: 'Portfolio',
      tabLoyalty: 'Loyalty',
      tabAiReception: 'AI Reception',
      noScheduledOrders: 'No scheduled orders.',
      completeOrderBtn: '📋 Complete Order',
      cancelBtn: 'Cancel',
      reportsTitle: 'Billing & Traffic Analytics',
      hideChartBtn: '📊 Hide Traffic Chart',
      showChartBtn: '📈 View Traffic & Campaign Chart',
      kpiRevenue: 'TOTAL REVENUE',
      kpiCompleted: 'COMPLETED SERVICES',
      kpiPromos: 'PROMOS / REFERRALS APPLIED',
      staffMgmtTitle: 'Team / Staff Management',
      catalogMgmtTitle: 'Catalog Management',
      newServiceBtn: '+ New Service',
      hoursTitle: 'Business Hours',
      saveHoursBtn: '💾 Save Hours',
      closedLabel: 'CLOSED',
      portfolioTitle: 'Visual Portfolio',
      addWorkBtn: '+ Add Work',
      loyaltyTitle: 'Retention & Loyalty Programs',
      saveRulesBtn: '💾 Save Rules',
      aiReceptionTitle: '24/7 AI Phone Receptionist (Bilingual ES / EN)',
      aiReceptionSub: 'Your own voice assistant answers calls, checks available professionals, books in your calendar, and records calls.',
      connectAiBtn: '⚡ Connect & Auto-Configure AI Receptionist',
      tgChannelTitle: 'Internal Telegram Channel (Exclusive to this Office / Business)',
      saveTgBtn: '💾 Save Telegram Channel to DB',
      testTgBtn: '🔔 Send Test Alert to Office',
      helpSupportBtn: 'Help / Support',
      newBookingTitle: 'New Booking',
      selectedServiceLabel: 'Selected Service',
      aptDateLabel: 'Appointment Date',
      aptTimeLabel: 'Appointment Time',
      confirmBookingBtn: 'Confirm Booking',
      processingBtn: 'Processing...',
      posTitle: 'Service Checkout (POS)',
      closeOrderBillBtn: '✅ Close Order & Bill',
      cancelModalTitle: 'Cancel Appointment & Free Slot',
      confirmCancelBtn: 'Confirm Cancellation',
      supportModalTitle: 'AutoFlow Support & Onboarding',
      supportModalSub: 'Direct technical team assistance (Private message to AutoFlow)',
      reportModalTitle: 'Report Content',
      submitReportBtn: 'Submit Report',
    }
  })[lang], [lang]);

  const handleStaffLogout = () => {
    setIsMechanicAuth(false);
    setPortalAccessRole('staff');
    setMechanicPin('');
    setIsMobileMenuOpen(false);
    setIsSupportModalOpen(false);
  };
  const tColor = useMemo(() => ({
    dark: { bg: '#05070C', card: 'rgba(18, 22, 28, 0.75)', text: '#FFFFFF', muted: '#94A3B8', border: 'rgba(255,255,255,0.08)', input: 'rgba(0, 0, 0, 0.4)', nav: 'rgba(5, 7, 12, 0.85)' },
    light: { bg: '#F1F5F9', card: 'rgba(255, 255, 255, 0.85)', text: '#0F131A', muted: '#475569', border: 'rgba(0,0,0,0.1)', input: 'rgba(255, 255, 255, 0.6)', nav: 'rgba(241, 245, 249, 0.85)' }
  })[theme], [theme]);

  const urlPath = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : '';
  const safeTenantId = String(tenantId || urlPath).toLowerCase();
  
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [clientDistanceMiles, setClientDistanceMiles] = useState<string | null>(null);
  
  const dbNiche = tenantInfo?.niche?.toLowerCase() || tenantInfo?.businessType?.toLowerCase() || '';
  const isSpa = dbNiche === 'spa' || (!dbNiche && safeTenantId.includes('spa'));
  const isBarbershop = dbNiche === 'barbershop' || (!dbNiche && safeTenantId.includes('barber'));
  const isLegal = dbNiche === 'legal' || (!dbNiche && (safeTenantId.includes('legal') || safeTenantId.includes('abogad') || safeTenantId.includes('law')));
  const isDental = dbNiche === 'dental' || (!dbNiche && (safeTenantId.includes('dental') || safeTenantId.includes('odonto') || safeTenantId.includes('clinic')));
  const isAutomotive = !isSpa && !isBarbershop && !isLegal && !isDental; 

  const brandColor = tenantInfo?.primaryColor || (isLegal ? '#3B82F6' : isDental ? '#06B6D4' : '#FF5E00');
  const staffTerm = isAutomotive ? tr('Mecánico', 'Mechanic') : isBarbershop ? tr('Barbero', 'Barber') : isLegal ? tr('Abogado(a)', 'Attorney') : isDental ? tr('Odontólogo(a)', 'Dentist') : tr('Especialista', 'Specialist');

  const bgImage = useMemo(() => {
    if (isSpa) return 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=2000&auto=format&fit=crop'; 
    if (isBarbershop) return 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=2000&auto=format&fit=crop';
    if (isLegal) return 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=2000&auto=format&fit=crop';
    if (isDental) return 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?q=80&w=2000&auto=format&fit=crop';
    return 'https://images.unsplash.com/photo-1613214149922-f1809c99b414?q=80&w=2000&auto=format&fit=crop';
  }, [isSpa, isBarbershop, isLegal, isDental]);

  const [isMechanicAuth, setIsMechanicAuth] = useState(false);
  const [portalAccessRole, setPortalAccessRole] = useState<'owner' | 'staff'>('staff');
  const [mechanicEmail, setMechanicEmail] = useState('');
  const [mechanicPin, setMechanicPin] = useState('');
  const [showMechanicPassword, setShowMechanicPassword] = useState(false);
  const [isAuthenticatingStaff, setIsAuthenticatingStaff] = useState(false);
  const [staffAccessPin, setStaffAccessPin] = useState('1234');
  const [showStaffAccessPin, setShowStaffAccessPin] = useState(false);
  const [isSavingStaffPin, setIsSavingStaffPin] = useState(false);
  
  const [agendaFilter, setAgendaFilter] = useState<'today' | 'upcoming' | 'reports' | 'staff' | 'catalogo' | 'horarios' | 'portafolio' | 'fidelidad' | 'recepcion_ia'>('today');
  const [activeView, setActiveView] = useState<'servicios' | 'expediente' | 'mecanico'>('servicios');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [todayOrders, setTodayOrders] = useState<any[]>([]);
  const [upcomingOrders, setUpcomingOrders] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [servicesList, setServicesList] = useState<ServiceInfo[]>([]);
  const [reportsData, setReportsData] = useState<ReportItem[]>([]);
  const [annualReportsData, setAnnualReportsData] = useState<ReportItem[]>([]);
  const [showTrafficChart, setShowTrafficChart] = useState<boolean>(true);
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(() => new Date().getMonth());
  const trafficChartScrollRef = useRef<any>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<any | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState<string>('');
  const [cancelOrigin, setCancelOrigin] = useState<'client' | 'staff'>('client');
  const [isCancellingApt, setIsCancellingApt] = useState<boolean>(false);
  const [confirmingAptId, setConfirmingAptId] = useState<string | null>(null);
  const [sendingReminderAptId, setSendingReminderAptId] = useState<string | null>(null);

  const [isCatalogModalVisible, setIsCatalogModalVisible] = useState(false);
  const [catalogEditingId, setCatalogEditingId] = useState<string | null>(null);
  const [catalogFormName, setCatalogFormName] = useState('');
  const [catalogFormDesc, setCatalogFormDesc] = useState(''); 
  const [catalogFormPrice, setCatalogFormPrice] = useState('');
  const [catalogFormDuration, setCatalogFormDuration] = useState('30');
  const [catalogFormFile, setCatalogFormFile] = useState<File | null>(null); 
  const [catalogFormPreview, setCatalogFormPreview] = useState<string | null>(null); 
  const catalogInputRef = useRef<HTMLInputElement>(null); 

  const [newStaffName, setNewStaffName] = useState('');
  const [selectedStaffRole, setSelectedStaffRole] = useState('');
  const [customStaffRole, setCustomStaffRole] = useState('');
  const [isStaffRoleDropdownOpen, setIsStaffRoleDropdownOpen] = useState(false);
  const [isCatalogServiceDropdownOpen, setIsCatalogServiceDropdownOpen] = useState(false);
  const [isCatalogDurationDropdownOpen, setIsCatalogDurationDropdownOpen] = useState(false);
  const [isPortfolioTitleDropdownOpen, setIsPortfolioTitleDropdownOpen] = useState(false);
  
  const [finalCost, setFinalCost] = useState('');
  const [exitMileage, setExitMileage] = useState('');
  const [oldParts, setOldParts] = useState('');
  const [newParts, setNewParts] = useState('');
  const [mechanicNotes, setMechanicNotes] = useState('');
  const [nextServiceTime, setNextServiceTime] = useState('');
  const [assignedMechanicId, setAssignedMechanicId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oldPartImage, setOldPartImage] = useState<File | null>(null);
  const [oldPartPreview, setOldPartPreview] = useState<string | null>(null);
  const [newPartImage, setNewPartImage] = useState<File | null>(null);
  const [newPartPreview, setNewPartPreview] = useState<string | null>(null);
  const oldFileInputRef = useRef<HTMLInputElement>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const portalTabsScrollRef = useRef<any>(null);
  const [portalTabsScrollX, setPortalTabsScrollX] = useState(0);
  const [portalTabsContentW, setPortalTabsContentW] = useState(0);
  const [portalTabsViewW, setPortalTabsViewW] = useState(0);

  const [clientVisits, setClientVisits] = useState<number | null>(null);
  const [isCheckingLoyalty, setIsCheckingLoyalty] = useState(false);
  const [rewardApplied, setRewardApplied] = useState(false);
  const [applyReferralDiscount, setApplyReferralDiscount] = useState(false);
  const [activeReferredBy, setActiveReferredBy] = useState<string | null>(null); 
  
  const [localLoyalty, setLocalLoyalty] = useState<LoyaltyConfig>({ isActive: false, visitsRequired: 10, rewardType: 'free_service', rewardValue: 100, referralActive: false, referralDiscountPercent: 20, reviews: [], campaigns: [] });
  const [isSubmittingLoyalty, setIsSubmittingLoyalty] = useState(false);

  // Campañas Push (public.push_campaigns + respaldo en config)
  const [pushCampaignsList, setPushCampaignsList] = useState<PushCampaignItem[]>([]);
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignMessage, setCampaignMessage] = useState('');
  const [campaignAudience, setCampaignAudience] = useState('all_clients');
  const [isSendingCampaign, setIsSendingCampaign] = useState(false);

  // Reseñas y Reacciones Únicas por Usuario (1 Like/Dislike y 1 Reseña por Cliente)
  const [reviewsList, setReviewsList] = useState<ReviewItem[]>([]);
  const [isEditingClientReview, setIsEditingClientReview] = useState<boolean>(false);
  // Reacción elegida desde la vista pública: se aplica sola cuando el cliente se verifica en Expediente
  const [pendingReaction, setPendingReaction] = useState<'like' | 'dislike' | null>(null);

  // Reportes de contenido y declaración del negocio
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportContact, setReportContact] = useState('');
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [reportedKeys, setReportedKeys] = useState<string[]>([]);
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

  const toggleFavoriteItem = (favId: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(favId) ? prev.filter((x) => x !== favId) : [...prev, favId];
      (globalThis as any).__autoflowFavorites = next;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try { window.localStorage.setItem('autoflow_favorites_v1', JSON.stringify(next)); } catch (_e) {}
      }
      return next;
    });
  };
  const [acceptedContentTerms, setAcceptedContentTerms] = useState(false);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  // Reservas B2C
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState('');
  const [selectedBookingStaff, setSelectedBookingStaff] = useState('');
  const [isSearchingPlate, setIsSearchingPlate] = useState(false);
  const [isPlateSearched, setIsPlateSearched] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [bookingCountryCode, setBookingCountryCode] = useState('+1');
  const [referredByCountryCode, setReferredByCountryCode] = useState('+1');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [timePeriodTab, setTimePeriodTab] = useState<'morning' | 'afternoon'>('morning');
  const [searchPlate, setSearchPlate] = useState('');
  const [carBrand, setCarBrand] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carYear, setCarYear] = useState('');
  const [carMileage, setCarMileage] = useState('');
  const [quickNotes, setQuickNotes] = useState('');
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [referredByPhone, setReferredByPhone] = useState('');
  const [bookingClientCoupons, setBookingClientCoupons] = useState<number>(0);
  const [bookingAuthMethod, setBookingAuthMethod] = useState<'apple' | 'google' | 'manual' | null>(null);
  const [bookingEntryMode, setBookingEntryMode] = useState<'existing' | 'new' | null>(null);
  const [isAuthenticatingProvider, setIsAuthenticatingProvider] = useState<boolean>(false);

  const lookupExistingClientByIdentifier = async (identifier: string) => {
    const cleanQ = String(identifier || '').trim().toLowerCase();
    if (!cleanQ) return null;
    try {
      const res = await apiFetch(`/api/clients/history/${encodeURIComponent(cleanQ)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.client) {
          let meta = data.client.metadata;
          if (typeof meta === 'string') {
            try { meta = JSON.parse(meta); } catch (_e) { meta = {}; }
          }
          const dbEarned = Number(meta?.earnedReferralDiscounts || 0);
          const cPhoneClean = cleanPhoneDigits(data.client.phone);
          const liveEarned = cPhoneClean && pendingReferralsByPhone[cPhoneClean] ? pendingReferralsByPhone[cPhoneClean].length : 0;
          const totalEarned = Math.max(0, dbEarned + liveEarned);
          const visitsCount = Number(data.client.loyaltyVisits ?? (Array.isArray(data.serviceHistory) ? data.serviceHistory.length : 0));

          if (data.client.name) setClientName(toTitleCase(data.client.name));
          if (data.client.email) setClientEmail(data.client.email);
          if (data.client.phone) {
            const rawPhone = String(data.client.phone);
            const matchedCode = COUNTRY_CODES.find((c) => rawPhone.startsWith(c.code));
            if (matchedCode) setBookingCountryCode(matchedCode.code);
            setClientPhone(rawPhone.replace(/^\+\d+\s*/, ''));
          }
          setBookingMatchedVisits(visitsCount);
          setBookingClientCoupons(totalEarned);
          setIsExistingClient(visitsCount > 0 || (Array.isArray(data.serviceHistory) && data.serviceHistory.length > 0));
          if (data.vehicle) {
            setSearchPlate(data.vehicle.plate || '');
            setCarBrand(toTitleCase(data.vehicle.brand || ''));
            setCarModel(toTitleCase(data.vehicle.model || ''));
            setCarYear(data.vehicle.year || '');
            setCarMileage(data.vehicle.currentMileage || '');
          }
          return data.client;
        }
      }
    } catch (_e) {}
    return null;
  };

  const handleAppleProviderAuth = async () => {
    if (Platform.OS !== 'ios') {
      alert(tr('La autenticación con iOS (Apple ID) está disponible en iPhone/iPad.', 'iOS (Apple ID) authentication is available on iOS devices.'));
      return;
    }

    setIsAuthenticatingProvider(true);
    try {
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        alert(tr('Inicia sesión con tu Apple ID en Ajustes del simulador o recompila el binario nativo con pod install.', 'Sign in with your Apple ID in Simulator Settings or rebuild the native binary with pod install.'));
        setIsAuthenticatingProvider(false);
        return;
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const appleFullName = [credential?.fullName?.givenName, credential?.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      const appleEmail = credential?.email || '';
      const appleUserId = credential?.user || '';

      let matchedClient: any = null;
      if (appleEmail) {
        matchedClient = await lookupExistingClientByIdentifier(appleEmail);
      }
      if (!matchedClient && appleUserId) {
        matchedClient = await lookupExistingClientByIdentifier(appleUserId);
      }

      if (matchedClient) {
        // Cuenta existente encontrada: autocompletar datos reales y beneficios
        setBookingAuthMethod('apple');
        setBookingEntryMode(null);
        setShowBookingQuickLookup(false);
      } else {
        // Usuario nuevo con Apple ID: limpiar datos previos y dejar campos listos para completar
        setIsExistingClient(false);
        setBookingMatchedVisits(0);
        setBookingClientCoupons(0);
        setClientName(appleFullName ? toTitleCase(appleFullName) : '');
        setClientEmail(appleEmail || '');
        setClientPhone('');
        setBookingAuthMethod('apple');
        setBookingEntryMode(null);
        setShowBookingQuickLookup(false);
      }
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      const errDetail = [err?.code, err?.message].filter(Boolean).join(' - ');
      alert(
        tr(
          `No se pudo validar tu cuenta de iOS (Apple).${errDetail ? `\n\nDetalle: ${errDetail}` : ''}\n\nVerifica que el simulador tenga sesión de Apple ID en Ajustes y que el target de Xcode tenga "Sign in with Apple" firmado con una cuenta Apple Developer.`,
          `Could not verify your iOS (Apple) account.${errDetail ? `\n\nDetail: ${errDetail}` : ''}\n\nMake sure Simulator is signed into an Apple ID in Settings and Xcode has "Sign in with Apple" signed with an Apple Developer account.`
        )
      );
    } finally {
      setIsAuthenticatingProvider(false);
    }
  };
  const [acceptedBookingTerms, setAcceptedBookingTerms] = useState<boolean>(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState<boolean>(false);
  const [legalDocHtml, setLegalDocHtml] = useState<string>('');
  const [legalDocVersion, setLegalDocVersion] = useState<string>('');
  const [isLoadingLegalDoc, setIsLoadingLegalDoc] = useState<boolean>(false);

  const [legalDocErrorDetail, setLegalDocErrorDetail] = useState<string>('');

  const loadActiveTermsFromDb = async () => {
    setIsLoadingLegalDoc(true);
    setLegalDocErrorDetail('');
    const candidateEndpoints = [
      '/api/legal-documents/active?type=terms_and_conditions',
      '/api/appointments/legal-documents/active?type=terms_and_conditions',
      '/api/tenants/legal-documents/active?type=terms_and_conditions',
    ];
    let lastDebug = '';

    for (const ep of candidateEndpoints) {
      try {
        const res = await apiFetch(ep);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const doc = data?.document || (Array.isArray(data) ? data[0] : data);
          const htmlVal = doc?.content_html || doc?.contentHtml || data?.content_html || data?.contentHtml;
          if (htmlVal) {
            setLegalDocHtml(String(htmlVal));
            setLegalDocVersion(String(doc?.version || data?.version || ''));
            setIsLoadingLegalDoc(false);
            return;
          }
          lastDebug = `HTTP ${res.status} en ${ep} (sin content_html)`;
        } else {
          lastDebug = `HTTP ${res.status} en ${ep}`;
        }
      } catch (err: any) {
        lastDebug = `Error red en ${ep}: ${err?.message || String(err)}`;
      }
    }

    setLegalDocErrorDetail(lastDebug);
    setIsLoadingLegalDoc(false);
  };

  useEffect(() => {
    if (isTermsModalOpen) {
      loadActiveTermsFromDb();
    }
  }, [isTermsModalOpen]);

  const parseHtmlBlocksForModal = (htmlStr: string) => {
    const clean = String(htmlStr || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h1|h2|h3|h4|li|section|article)>/gi, '\n\n')
      .replace(/<(h1|h2|h3|h4)[^>]*>/gi, '###TITLE###')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');

    return clean
      .split(/\n{1,}/)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((block) => {
        if (block.startsWith('###TITLE###')) {
          return { isTitle: true, text: block.replace(/^###TITLE###/, '').trim() };
        }
        return { isTitle: false, text: block };
      });
  };
  const [isExistingClient, setIsExistingClient] = useState(false);
  const [showBookingQuickLookup, setShowBookingQuickLookup] = useState(false);
  const [bookingLookupQuery, setBookingLookupQuery] = useState('');
  const [isSearchingBookingClient, setIsSearchingBookingClient] = useState(false);
  const [bookingMatchedVisits, setBookingMatchedVisits] = useState<number>(0);
  // Campos especializados para Abogados (legal) y Centros Odontológicos (dental)
  const [appointmentModality, setAppointmentModality] = useState<'in_person' | 'phone_call' | 'video_call'>('in_person');
  const [caseOrTreatmentArea, setCaseOrTreatmentArea] = useState<string>('');
  const [opposingPartyOrInsurance, setOpposingPartyOrInsurance] = useState<string>('');
  const [urgencyLevel, setUrgencyLevel] = useState<'normal' | 'priority' | 'urgent'>('normal');

  // 📞 Estados para Recepción Telefónica IA (Vapi.ai BYOK 1-Clic)
  const [vapiConfig, setVapiConfig] = useState<VapiVoiceConfig>({
    isActive: false,
    phoneNumber: '',
    privateApiKey: '',
    phoneNumberId: '',
    assistantId: '',
    languageMode: 'bilingual',
    transferPhone: '',
    allowUrgentOverride: true,
    lastSyncedAt: ''
  });
  const [isSyncingVapi, setIsSyncingVapi] = useState<boolean>(false);
  const [isSimulatingVoiceCall, setIsSimulatingVoiceCall] = useState<boolean>(false);
  const [vapiActivationNotice, setVapiActivationNotice] = useState<string | null>(null);

  // 📲 Estados para Canal Interno de Telegram Parametrizado por Consultorio / Negocio
  const [telegramConfig, setTelegramConfig] = useState<TelegramChannelConfig>({
    isActive: true,
    channelName: '',
    chatId: '',
    botToken: '',
    notifyNewAppointments: true,
    notifyRecordings: true,
    notifyConfirmationsAndCancels: true,
    notifyPOSClosures: true
  });
  const [isSavingTelegram, setIsSavingTelegram] = useState<boolean>(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState<boolean>(false);
  const [isDetectingTelegramChat, setIsDetectingTelegramChat] = useState<boolean>(false);

  // 🎧 Estados para Soporte y Acompañamiento Técnico AutoFlow
  const [isSupportModalOpen, setIsSupportModalOpen] = useState<boolean>(false);
  const [supportContactName, setSupportContactName] = useState<string>('');
  const [supportContactPhone, setSupportContactPhone] = useState<string>('');
  const [supportTopic, setSupportTopic] = useState<string>('🤖 Configurar Recepcionista IA (Vapi)');
  const [supportMessage, setSupportMessage] = useState<string>('');
  const [isSendingSupport, setIsSendingSupport] = useState<boolean>(false);

  // Expediente
  const [expedienteQuery, setExpedienteQuery] = useState('');
  const [expedienteCountryCode, setExpedienteCountryCode] = useState('+1');
  const [isSearchingExpediente, setIsSearchingExpediente] = useState(false);
  const [clientExpedienteData, setClientExpedienteData] = useState<any | null>(null);
  const [isExpedienteExpanded, setIsExpedienteExpanded] = useState(true);
  const [expandedImage, setExpandedImage] = useState<{ path: string, alt: string } | null>(null);

  const defaultHoursConfig = {
    monday: { isOpen: true, open: '08:00', close: '18:00' },
    tuesday: { isOpen: true, open: '08:00', close: '18:00' },
    wednesday: { isOpen: true, open: '08:00', close: '18:00' },
    thursday: { isOpen: true, open: '08:00', close: '18:00' },
    friday: { isOpen: true, open: '08:00', close: '18:00' },
    saturday: { isOpen: true, open: '09:00', close: '14:00' },
    sunday: { isOpen: false, open: '00:00', close: '00:00' },
  };
  const [localHours, setLocalHours] = useState<any>(defaultHoursConfig);
  const [isSubmittingConfig, setIsSubmittingConfig] = useState(false);

  const daysOfWeekMap = [
    { key: 'monday', label: 'Lunes' },
    { key: 'tuesday', label: 'Martes' },
    { key: 'wednesday', label: 'Miércoles' },
    { key: 'thursday', label: 'Jueves' },
    { key: 'friday', label: 'Viernes' },
    { key: 'saturday', label: 'Sábado' },
    { key: 'sunday', label: 'Domingo' }
  ];

  const [localPortfolio, setLocalPortfolio] = useState<PortfolioItem[]>([]);
  const [isAddingPortfolio, setIsAddingPortfolio] = useState(false);
  const [portfolioEditingIndex, setPortfolioEditingIndex] = useState<number | null>(null);
  const [portfolioFormTitle, setPortfolioFormTitle] = useState(''); 
  const [portfolioFormDesc, setPortfolioFormDesc] = useState('');
  const [portfolioFormFile, setPortfolioFormFile] = useState<File | null>(null);
  const [portfolioFormPreview, setPortfolioFormPreview] = useState<string | null>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);

  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - 30);
  const [reportStartDate, setReportStartDate] = useState<string>(defaultStart.toISOString().split('T')[0] || '');
  const [reportEndDate, setReportEndDate] = useState<string>(new Date().toISOString().split('T')[0] || '');
  const [activeReportDateField, setActiveReportDateField] = useState<'start' | 'end' | null>(null);
  const [reportCalendarMonth, setReportCalendarMonth] = useState<Date>(() => new Date());
  const [reportMechanic, setReportMechanic] = useState('');
  const [reportPage, setReportPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const mechanicQuickNotes = isAutomotive 
    ? ['Niveles OK', 'Frenos Desgastados', 'Fugas de Aceite', 'Requiere Alineación'] 
    : isBarbershop
      ? ['Requiere hidratación', 'Corte de puntas', 'Cuero cabelludo sensible', 'Aplicar tónico']
      : isLegal
        ? ['Sin conflicto de interés', 'Documentación pendiente', 'Caso viable', 'Requiere poder firmado', 'Audiencia programada']
        : isDental
          ? ['Radiografía panorámica OK', 'Requiere profilaxis', 'Sensibilidad dental', 'Plan de ortodoncia', 'Control post-operatorio']
          : ['Sin alergias', 'Requiere sesión extra', 'Piel sensible', 'Tratamiento completado'];
    
  const nextServiceOptions = isAutomotive 
    ? ['3 Meses', '6 Meses', '1 Año', '5,000 Millas']
    : isLegal
      ? ['1 Semana (Revisión)', '15 Días (Seguimiento)', '1 Mes (Audiencia)', '3 Meses']
      : isDental
        ? ['1 Semana (Control)', '1 Mes (Ajuste)', '6 Meses (Limpieza)', '1 Año']
        : ['1 Semana', '15 Días', '1 Mes', '2 Meses'];
    
  const clientQuickServices = isAutomotive 
    ? ['Cambio de Aceite', 'Revisión General', 'Frenos', 'Ruidos', 'Llantas']
    : isBarbershop
      ? ['Corte de Cabello', 'Perfilado de Barba', 'Cejas', 'Corte de Niño', 'Colorimetría']
      : isLegal
        ? ['Inmigración / Visas', 'Familia / Divorcio', 'Accidente / Lesiones', 'Laboral / Despido', 'Contratos / Civil', 'Penal / Urgente']
        : isDental
          ? ['Dolor / Urgencia Dental', 'Limpieza / Blanqueamiento', 'Ortodoncia / Brackets', 'Implantes / Prótesis', 'Valoración 1ra Vez', 'Odontopediatría']
          : ['Masaje Relajante', 'Corte Clásico', 'Facial', 'Coloración'];

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const baseUrls = [
      process.env.EXPO_PUBLIC_API_URL,
      process.env.NEXT_PUBLIC_API_URL,
      'https://saas-multinicho-platform.onrender.com',
      'http://127.0.0.1:4000'
    ].filter((u, idx, arr): u is string => Boolean(u && String(u).trim() && arr.indexOf(u) === idx));

    const headerTenantId = Array.isArray(tenantId) ? tenantId[0] : (tenantId || '123e4567-e89b-12d3-a456-426614174000');
    const headers = { 'Content-Type': 'application/json', 'x-tenant-id': headerTenantId, ...(options.headers || {}) };

    let lastRes: Response | null = null;
    let lastErr: any = null;

    for (const baseUrl of baseUrls) {
      const cleanBase = String(baseUrl).replace(/\/+$/, '');
      try {
        const res = await fetch(`${cleanBase}${url}`, { ...options, headers });
        lastRes = res;
        if (res.ok || res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
          return res;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    if (lastRes) return lastRes;
    throw lastErr || new Error('No se pudo conectar con la API');
  };

  const normalizeOrders = (orders: any[]) => {
    const seenIds = new Set<string>();
    return (orders || [])
      .filter((o: any) => {
        if (!o || o.status === 'cancelled') return false;
        const oid = String(o.id || '');
        if (oid && seenIds.has(oid)) return false;
        if (oid) seenIds.add(oid);
        return true;
      })
      .map((o: any) => {
        let safeMeta = o.metadata;
        if (typeof safeMeta === 'string') {
          try { safeMeta = JSON.parse(safeMeta); } catch (e) { safeMeta = {}; }
        }
        let safeClientMeta = o.clientMetadata;
        if (typeof safeClientMeta === 'string') {
          try { safeClientMeta = JSON.parse(safeClientMeta); } catch (e) { safeClientMeta = {}; }
        }
        return { ...o, metadata: safeMeta || {}, clientMetadata: safeClientMeta || {} };
      });
  };

  // 🛠️ Helper para unir citas de hoy + próximos días SIN duplicar IDs (porque filter=upcoming también incluye hoy)
  const getMergedUniqueAppointments = (todayList: any[], upcomingList: any[]) => {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const item of [...(todayList || []), ...(upcomingList || [])]) {
      if (!item || item.status === 'cancelled') continue;
      const key = String(item.id || '');
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      result.push(item);
    }
    return result;
  };

  // 🔔 Función para disparar Notificación Push Nativa en el Navegador / Sistema Operativo (Localhost)
  const triggerBrowserLocalNotification = (title: string, body: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: tenantInfo?.logoUrl || undefined });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            new Notification(title, { body, icon: tenantInfo?.logoUrl || undefined });
          }
        });
      }
    }
  };

  // 🌟 CARGAR CAMPAÑAS SIN ERRORES EN RED 🌟
  const fetchPushCampaigns = async (currentTenantUuid?: string) => {
    try {
      const resInfo = await apiFetch('/api/tenants/info');
      if (resInfo.ok) {
        const dataInfo = await resInfo.json();
        const parsedLoyalty = typeof dataInfo.tenant?.loyaltyConfig === 'string'
          ? JSON.parse(dataInfo.tenant.loyaltyConfig)
          : dataInfo.tenant?.loyaltyConfig;
        if (Array.isArray(parsedLoyalty?.campaigns)) {
          setPushCampaignsList(parsedLoyalty.campaigns);
        }
      }
    } catch (e) {}
  };

  // 🌟 ENVIAR Y GUARDAR CAMPAÑA EN public.push_campaigns + RESPALDO AUTOMÁTICO EN /api/tenants/config 🌟
  const handleSendPushCampaign = async () => {
    if (!acceptedContentTerms) {
      alert('Debes aceptar la declaración de contenido para poder publicar.');
      return;
    }
    if (!campaignTitle.trim() || !campaignMessage.trim()) {
      alert('Por favor ingresa un título y un mensaje para la campaña.');
      return;
    }
    setIsSendingCampaign(true);
    const targetTenant = tenantInfo?.id || (Array.isArray(tenantId) ? tenantId[0] : String(tenantId || '123e4567-e89b-12d3-a456-426614174000'));
    const nowIso = new Date().toISOString();
    const cleanTitle = toTitleCase(campaignTitle.trim());
    const cleanMessage = toTitleCase(campaignMessage.trim());

    try {
      const finalNewItem: PushCampaignItem = {
        id: `cmp-${Date.now()}`,
        tenant_id: String(targetTenant),
        title: cleanTitle,
        message: cleanMessage,
        target_audience: campaignAudience,
        is_active: true,
        sent_at: nowIso
      };

      const updatedCampaigns = [finalNewItem, ...pushCampaignsList];
      const updatedLoyaltyConfig: LoyaltyConfig = {
        ...localLoyalty,
        reviews: reviewsList,
        campaigns: updatedCampaigns
      };

      // Guardar y sincronizar en PostgreSQL 18 a través de /api/tenants/config
      const resConfig = await apiFetch('/api/tenants/config', {
        method: 'PUT',
        body: JSON.stringify({ loyaltyConfig: updatedLoyaltyConfig })
      });

      if (resConfig.ok) {
        const dataConfig = await resConfig.json();
        const savedLoyalty = typeof dataConfig.tenant?.loyaltyConfig === 'string'
          ? JSON.parse(dataConfig.tenant.loyaltyConfig)
          : dataConfig.tenant?.loyaltyConfig;
        setPushCampaignsList(savedLoyalty?.campaigns || updatedCampaigns);
        setLocalLoyalty(savedLoyalty || updatedLoyaltyConfig);
        setTenantInfo((prev) => (prev ? { ...prev, loyaltyConfig: savedLoyalty || updatedLoyaltyConfig } : prev));
      } else {
        setPushCampaignsList(updatedCampaigns);
        setLocalLoyalty(updatedLoyaltyConfig);
        setTenantInfo((prev) => (prev ? { ...prev, loyaltyConfig: updatedLoyaltyConfig } : prev));
      }

      // Disparar notificación push en tiempo real en el navegador local
      triggerBrowserLocalNotification(cleanTitle, cleanMessage);

      setCampaignTitle('');
      setCampaignMessage('');
      alert('🚀 ¡Campaña ACTIVA enviada y registrada con éxito!');
    } catch (e) {
      alert('Error enviando la campaña.');
    } finally {
      setIsSendingCampaign(false);
    }
  };

  // 🌟 ACTIVAR / INACTIVAR UNA CAMPAÑA DEL HISTORIAL 🌟
  const handleToggleCampaignStatus = async (campaignId: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    const updatedCampaigns = pushCampaignsList.map((c) =>
      c.id === campaignId ? { ...c, is_active: nextStatus } : c
    );
    setPushCampaignsList(updatedCampaigns);

    const updatedLoyaltyConfig: LoyaltyConfig = {
      ...localLoyalty,
      reviews: reviewsList,
      campaigns: updatedCampaigns
    };
    setLocalLoyalty(updatedLoyaltyConfig);
    setTenantInfo((prev) => (prev ? { ...prev, loyaltyConfig: updatedLoyaltyConfig } : prev));

    try {
      await apiFetch('/api/tenants/config', {
        method: 'PUT',
        body: JSON.stringify({ loyaltyConfig: updatedLoyaltyConfig })
      });

      if (nextStatus) {
        const activatedCamp = updatedCampaigns.find((c) => c.id === campaignId);
        if (activatedCamp) {
          triggerBrowserLocalNotification(toTitleCase(activatedCamp.title), toTitleCase(activatedCamp.message));
        }
      }
    } catch (e) {
      console.error('Error cambiando estado de campaña:', e);
    }
  };

  // 🌟 IDENTIFICADOR ÚNICO DEL CLIENTE EN EXPEDIENTE PARA PERMITIR SOLO 1 VOTO Y 1 RESEÑA POR USUARIO 🌟
  const currentExpedienteClientKey = useMemo(() => {
    if (!clientExpedienteData?.client) return '';
    return String(
      clientExpedienteData.client.id ||
      cleanPhoneDigits(clientExpedienteData.client.phone) ||
      clientExpedienteData.client.email ||
      clientExpedienteData.client.name ||
      ''
    ).toLowerCase();
  }, [clientExpedienteData]);

  const currentClientExistingReview = useMemo(() => {
    if (!currentExpedienteClientKey) return null;
    const cNameLower = String(clientExpedienteData?.client?.name || '').toLowerCase();
    return reviewsList.find((r: any) =>
      String(r.clientKey || r.workOrderId || '').toLowerCase() === currentExpedienteClientKey ||
      (cNameLower && String(r.clientName || '').toLowerCase() === cNameLower)
    ) || null;
  }, [reviewsList, currentExpedienteClientKey, clientExpedienteData]);

  // 🌟 REACCIÓN DE 1 CLIC (👍 LIKE / 👎 DISLIKE) ÚNICA POR CLIENTE SINCRONIZADA CON BD 🌟
  const handleQuickClientReaction = async (reactionType: 'like' | 'dislike') => {
    if (!currentExpedienteClientKey) return;
    setIsSubmittingReview(true);
    try {
      const cName = toTitleCase(clientExpedienteData?.client?.name || 'Cliente Verificado');
      const cPhone = clientExpedienteData?.client?.phone || expedienteQuery || '';
      const latestService = clientExpedienteData?.serviceHistory?.[0]?.service?.name || clientExpedienteData?.serviceHistory?.[0]?.serviceType || 'Cliente Verificado';

      const updatedReview: ReviewItem = {
        id: currentClientExistingReview?.id || `rev-${Date.now()}`,
        clientKey: currentExpedienteClientKey,
        clientName: cName,
        rating: reactionType === 'like' ? 5 : 2,
        reaction: reactionType,
        comment: currentClientExistingReview?.comment ? toTitleCase(currentClientExistingReview.comment) : '',
        serviceName: latestService,
        createdAt: new Date().toISOString()
      };

      const filteredOthers = reviewsList.filter((r: any) =>
        String(r.clientKey || r.clientId || r.workOrderId || '').toLowerCase() !== currentExpedienteClientKey &&
        String(r.clientName || '').toLowerCase() !== cName.toLowerCase()
      );

      let finalReviews = [updatedReview, ...filteredOthers];

      try {
        const resRev = await apiFetch('/api/reviews', {
          method: 'POST',
          body: JSON.stringify({
            clientId: clientExpedienteData?.client?.id || currentExpedienteClientKey,
            clientName: cName,
            clientPhone: cPhone,
            rating: updatedReview.rating,
            reaction: reactionType,
            comment: updatedReview.comment,
            serviceName: latestService
          })
        });
        if (resRev.ok) {
          const dataRev = await resRev.json();
          if (Array.isArray(dataRev.reviews)) {
            finalReviews = dataRev.reviews;
          }
        }
      } catch (_e) {}

      const updatedLoyaltyConfig: LoyaltyConfig = { ...localLoyalty, reviews: finalReviews, campaigns: pushCampaignsList };
      await apiFetch('/api/tenants/config', {
        method: 'PUT',
        body: JSON.stringify({ loyaltyConfig: updatedLoyaltyConfig })
      });

      setReviewsList(finalReviews);
      setLocalLoyalty(updatedLoyaltyConfig);
      setTenantInfo((prev) => (prev ? { ...prev, loyaltyConfig: updatedLoyaltyConfig } : prev));
    } catch (e) {
      alert('Error registrando tu reacción.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // 🌟 GUARDAR RESEÑA ÚNICA POR CLIENTE (CON LETRA CAPITALIZADA AUTOMÁTICA) 🌟
  const handleSaveUniqueClientReview = async () => {
    if (!currentExpedienteClientKey) return;
    setIsSubmittingReview(true);
    try {
      const cName = toTitleCase(clientExpedienteData?.client?.name || 'Cliente Verificado');
      const cPhone = clientExpedienteData?.client?.phone || expedienteQuery || '';
      const latestService = clientExpedienteData?.serviceHistory?.[0]?.service?.name || clientExpedienteData?.serviceHistory?.[0]?.serviceType || 'Cliente Verificado';
      const reactionVal: 'like' | 'dislike' = reviewRating >= 4 ? 'like' : 'dislike';

      const newReview: ReviewItem = {
        id: currentClientExistingReview?.id || `rev-${Date.now()}`,
        clientKey: currentExpedienteClientKey,
        clientName: cName,
        rating: reviewRating,
        reaction: reactionVal,
        comment: toTitleCase(reviewComment.trim()),
        serviceName: latestService,
        createdAt: new Date().toISOString()
      };

      const filteredOthers = reviewsList.filter((r: any) =>
        String(r.clientKey || r.clientId || r.workOrderId || '').toLowerCase() !== currentExpedienteClientKey &&
        String(r.clientName || '').toLowerCase() !== cName.toLowerCase()
      );

      let finalReviews = [newReview, ...filteredOthers];

      try {
        const resRev = await apiFetch('/api/reviews', {
          method: 'POST',
          body: JSON.stringify({
            clientId: clientExpedienteData?.client?.id || currentExpedienteClientKey,
            clientName: cName,
            clientPhone: cPhone,
            rating: reviewRating,
            reaction: reactionVal,
            comment: newReview.comment,
            serviceName: latestService
          })
        });
        if (resRev.ok) {
          const dataRev = await resRev.json();
          if (Array.isArray(dataRev.reviews)) {
            finalReviews = dataRev.reviews;
          }
        }
      } catch (_e) {}

      const updatedLoyaltyConfig: LoyaltyConfig = { ...localLoyalty, reviews: finalReviews, campaigns: pushCampaignsList };
      await apiFetch('/api/tenants/config', {
        method: 'PUT',
        body: JSON.stringify({ loyaltyConfig: updatedLoyaltyConfig })
      });

      setReviewsList(finalReviews);
      setLocalLoyalty(updatedLoyaltyConfig);
      setTenantInfo((prev) => (prev ? { ...prev, loyaltyConfig: updatedLoyaltyConfig } : prev));
      setIsEditingClientReview(false);
      alert('⭐ ¡Tu calificación oficial ha sido guardada!');
    } catch (e) {
      alert('Error guardando la reseña.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const fetchAgendaData = async () => {
    try {
      const resToday = await apiFetch('/api/appointments/today');
      if (resToday.ok) { 
        const data = await resToday.json(); 
        if (data.success) setTodayOrders(normalizeOrders(data.appointments || [])); 
      }
      const resUpcoming = await apiFetch('/api/appointments/today?filter=upcoming');
      if (resUpcoming.ok) { 
        const data = await resUpcoming.json(); 
        if (data.success) setUpcomingOrders(normalizeOrders(data.appointments || [])); 
      }
    } catch (err) { console.error("Error agenda:", err); }
  };

  const fetchTenantData = async () => {
    try {
      const resInfo = await apiFetch('/api/tenants/info');
      if (resInfo.ok) {
        const dataInfo = await resInfo.json();
        if (dataInfo.success) {
          let parsedLoyalty = dataInfo.tenant.loyaltyConfig || dataInfo.tenant.loyalty_config;
          if (typeof parsedLoyalty === 'string') {
             try { parsedLoyalty = JSON.parse(parsedLoyalty); } catch (e) {}
          }
          let parsedHours = dataInfo.tenant.business_hours || dataInfo.tenant.businessHours;
          if (typeof parsedHours === 'string') {
             try { parsedHours = JSON.parse(parsedHours); } catch (e) {}
          }
          let parsedPortfolio = dataInfo.tenant.portfolio;
          if (typeof parsedPortfolio === 'string') {
             try { parsedPortfolio = JSON.parse(parsedPortfolio); } catch (e) {}
          }

          // Combinar siempre con defaultHoursConfig para que {} nunca deje al negocio sin horarios
          const mergedHours = {
            ...defaultHoursConfig,
            ...(parsedHours && typeof parsedHours === 'object' ? parsedHours : {}),
          };

          const updatedTenant = {
            ...dataInfo.tenant,
            loyaltyConfig: parsedLoyalty,
            business_hours: mergedHours,
            businessHours: mergedHours,
            portfolio: parsedPortfolio
          };

          setTenantInfo(updatedTenant);
          setLocalHours(mergedHours);
          if (parsedPortfolio) setLocalPortfolio(parsedPortfolio);
          const initialPin =
            parsedLoyalty?.staffPortalPin ||
            dataInfo.tenant?.portalPin ||
            dataInfo.tenant?.portal_pin ||
            '1234';
          setStaffAccessPin(String(initialPin));

          if (parsedLoyalty) {
            setLocalLoyalty(parsedLoyalty);
            if (Array.isArray(parsedLoyalty.reviews)) {
              setReviewsList(parsedLoyalty.reviews);
            }
            if (Array.isArray(parsedLoyalty.campaigns)) {
              setPushCampaignsList(parsedLoyalty.campaigns);
            }
            if (parsedLoyalty.vapiConfig) {
              setVapiConfig((prev) => ({ ...prev, ...parsedLoyalty.vapiConfig }));
            }
            if (parsedLoyalty.telegramConfig || dataInfo.tenant?.telegramChatId || dataInfo.tenant?.telegram_chat_id) {
              setTelegramConfig((prev) => ({
                ...prev,
                ...(parsedLoyalty.telegramConfig || {}),
                chatId: parsedLoyalty.telegramConfig?.chatId || dataInfo.tenant?.telegramChatId || dataInfo.tenant?.telegram_chat_id || prev.chatId || '',
                botToken: parsedLoyalty.telegramConfig?.botToken || dataInfo.tenant?.telegramBotToken || dataInfo.tenant?.telegram_bot_token || prev.botToken || '',
                channelName: parsedLoyalty.telegramConfig?.channelName || dataInfo.tenant?.name || prev.channelName || ''
              }));
            }
          }
          if (dataInfo.tenant?.id) {
            fetchPushCampaigns(dataInfo.tenant.id);
          }
        }
      }
      const resServices = await apiFetch('/api/services');
      if (resServices.ok) {
        const dataServices = await resServices.json();
        if (dataServices.success && dataServices.services.length > 0) {
          setServicesList(dataServices.services);
          const firstActive = dataServices.services.find((s: any) => s.isActive !== false);
          if (firstActive) setSelectedServiceType(firstActive.id);
        }
      }
      fetchAgendaData();
      
      const resStaff = await apiFetch('/api/staff');
      if (resStaff.ok) { 
        const data = await resStaff.json(); 
        if (data.success && Array.isArray(data.staff) && data.staff.length > 0) {
          const mappedStaff = data.staff.map((s: any) => ({ ...s, isActive: s.isActive ?? true }));
          setStaffList(mappedStaff);
        } else {
          setStaffList([{ id: 'stf-1', name: 'Especialista Principal', role: 'Titular / General', isActive: true }]);
        }
      } else {
        setStaffList([{ id: 'stf-1', name: 'Especialista Principal', role: 'Titular / General', isActive: true }]);
      }
    } catch (err) { 
      setStaffList([{ id: 'stf-1', name: 'Personal (Demo)', role: 'General', isActive: true }]);
    }
  };

  useEffect(() => {
    if (safeTenantId) {
      fetchTenantData();
      loadActiveTermsFromDb();
    }
  }, [safeTenantId]);

  // 📍 CÁLCULO AUTOMÁTICO DE DISTANCIA EN MILLAS ENTRE EL CLIENTE Y EL NEGOCIO (HAVERSINE)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const userLat = pos.coords.latitude;
          const userLon = pos.coords.longitude;
          const tLat = Number((tenantInfo as any)?.latitude || 34.1478); // Default Pasadena CA si no tiene coords
          const tLon = Number((tenantInfo as any)?.longitude || -118.1445);
          const toRad = (v: number) => (v * Math.PI) / 180;
          const R = 3958.8; // Radio de la Tierra en millas
          const dLat = toRad(tLat - userLat);
          const dLon = toRad(tLon - userLon);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(userLat)) * Math.cos(toRad(tLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const miles = (R * c).toFixed(1);
          setClientDistanceMiles(miles);
        },
        () => {
          setClientDistanceMiles('2.4');
        }
      );
    } else {
      setClientDistanceMiles('2.4');
    }
  }, [tenantInfo]);

  const loadReports = async () => {
    try {
      const queryParams = new URLSearchParams({ startDate: reportStartDate, endDate: reportEndDate });
      if (reportMechanic) queryParams.append('mechanicId', reportMechanic);
      const res = await apiFetch(`/api/work-orders/reports?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) { setReportsData(data.reports || []); setReportPage(1); }
      }

      const currentYear = new Date().getFullYear();
      const annualParams = new URLSearchParams({ startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31` });
      if (reportMechanic) annualParams.append('mechanicId', reportMechanic);
      const resAnnual = await apiFetch(`/api/work-orders/reports?${annualParams.toString()}`);
      if (resAnnual.ok) {
        const dataAnnual = await resAnnual.json();
        if (dataAnnual.success) { setAnnualReportsData(dataAnnual.reports || []); }
      }
    } catch (err) { console.error("Error cargando reportes", err); }
  };

  useEffect(() => { if (agendaFilter === 'reports') loadReports(); }, [agendaFilter]);

  const ratingSummary = useMemo(() => {
    if (!reviewsList || reviewsList.length === 0) {
      return { avg: '5.0', count: 0, likes: 0, dislikes: 0 };
    }
    const sum = reviewsList.reduce((acc, r) => acc + Number(r.rating || 5), 0);
    const likes = reviewsList.filter((r) => r.reaction === 'like' || (!r.reaction && Number(r.rating) >= 4)).length;
    const dislikes = reviewsList.filter((r) => r.reaction === 'dislike' || (!r.reaction && Number(r.rating) <= 2)).length;
    return {
      avg: (sum / reviewsList.length).toFixed(1),
      count: reviewsList.length,
      likes,
      dislikes
    };
  }, [reviewsList]);

  const monthlyTrafficStats = useMemo(() => {
    const monthsNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const fullMonthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const sourceList = annualReportsData.length > 0 ? annualReportsData : reportsData;

    const counts = Array(12).fill(0);
    const revenues = Array(12).fill(0);
    const monthClients: Record<number, string[]> = {};
    const monthPromos: Record<number, number> = {};
    for (let i = 0; i < 12; i++) {
      monthClients[i] = [];
      monthPromos[i] = 0;
    }

    let discountsCount = 0;

    sourceList.forEach((r: any) => {
      const rawDate = r.date || r.createdAt;
      const hasPromo = getReportDiscountInfo(r, servicesList) !== null;
      if (hasPromo) discountsCount += 1;

      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const m = d.getMonth();
          counts[m] += 1;
          revenues[m] += Number(r.cost || r.finalCost || 0);
          if (hasPromo) monthPromos[m] += 1;

          const cName = toTitleCase(String(r.clientName || 'Cliente General').trim());
          if (cName && !monthClients[m].includes(cName)) {
            monthClients[m].push(cName);
          }
        }
      }
    });

    const maxCount = Math.max(...counts, 1);
    const currentMonthIdx = new Date().getMonth();

    let lowestMonthIdx = 0;
    let lowestVal = Infinity;
    let highestMonthIdx = 0;
    let highestVal = -1;

    for (let i = 0; i <= currentMonthIdx; i++) {
      if (counts[i] < lowestVal) {
        lowestVal = counts[i];
        lowestMonthIdx = i;
      }
      if (counts[i] > highestVal) {
        highestVal = counts[i];
        highestMonthIdx = i;
      }
    }

    const items = monthsNames.map((shortName, idx) => {
      const uniqueClientsList = monthClients[idx] || [];
      const avgTicket = counts[idx] > 0 ? Math.round(revenues[idx] / counts[idx]) : 0;
      return {
        index: idx,
        shortName,
        fullName: fullMonthNames[idx],
        count: counts[idx],
        uniqueUsersCount: uniqueClientsList.length,
        clientsList: uniqueClientsList,
        promosUsed: monthPromos[idx] || 0,
        revenue: revenues[idx],
        avgTicket,
        heightPct: Math.max(10, Math.round((counts[idx] / maxCount) * 100)),
        isLowest: idx === lowestMonthIdx && idx <= currentMonthIdx,
        isHighest: idx === highestMonthIdx && counts[idx] > 0
      };
    });

    return {
      items,
      lowestMonthName: fullMonthNames[lowestMonthIdx],
      lowestMonthCount: lowestVal === Infinity ? 0 : lowestVal,
      highestMonthName: fullMonthNames[highestMonthIdx],
      highestMonthCount: Math.max(0, highestVal),
      discountsCount
    };
  }, [annualReportsData, reportsData, servicesList]);

  const convertImageToWebp = (file: File): Promise<File> => { 
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image(); 
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas'); let width = img.width; let height = img.height;
          if (width > height) { if (width > 1200) { height = Math.round((height *= 1200 / width)); width = 1200; } } else { if (height > 1200) { width = Math.round((width *= 1200 / height)); height = 1200; } }
          canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
              if (!blob) return reject(new Error('Fallo compresión WebP'));
              resolve(new File([blob], `${file.name.substring(0, file.name.lastIndexOf('.')) || file.name}.webp`, { type: 'image/webp' }));
            }, 'image/webp', 0.8);
        }; img.onerror = (error: any) => reject(error);
      }; reader.onerror = (error: any) => reject(error);
    });
  };

  const uploadImageToSupabase = async (fileOrUri: any, folderName: string) => {
    try {
      const fileName = `${folderName}-${Date.now()}.webp`; 
      const filePath = `${folderName}/${fileName}`;
      let uploadBody: any = fileOrUri;

      // Soporte nativo iOS / Android cuando se selecciona imagen desde galería (URI local)
      if (typeof fileOrUri === 'string' || (fileOrUri && typeof fileOrUri === 'object' && fileOrUri.uri)) {
        const uriStr = typeof fileOrUri === 'string' ? fileOrUri : fileOrUri.uri;
        const resp = await fetch(uriStr);
        uploadBody = await resp.blob();
      }

      const { error } = await supabase.storage.from('autoflow').upload(filePath, uploadBody, { upsert: true, contentType: 'image/webp' });
      return error ? null : filePath; 
    } catch (err) { return null; }
  };

  // 📱 Selector universal de imágenes para iOS / Android (Antes, Después, Portafolio y Catálogo)
  const handleNativeImagePick = async (target: 'old' | 'new' | 'portfolio' | 'catalog') => {
    if (Platform.OS === 'web') return;
    try {
      const dynamicReq: any = typeof require !== 'undefined' ? require : null;
      const ImagePicker = dynamicReq ? dynamicReq('expo-image-picker') : null;
      if (!ImagePicker) return;
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        alert('Se requiere permiso para acceder a tus fotos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        allowsEditing: true,
        quality: 0.82,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const uri = asset.uri;
        if (target === 'old') {
          setOldPartImage({ uri } as any);
          setOldPartPreview(uri);
        } else if (target === 'new') {
          setNewPartImage({ uri } as any);
          setNewPartPreview(uri);
        } else if (target === 'portfolio') {
          setPortfolioFormFile({ uri } as any);
          setPortfolioFormPreview(uri);
        } else if (target === 'catalog') {
          setCatalogFormFile({ uri } as any);
          setCatalogFormPreview(uri);
        }
      }
    } catch (_err) {
      alert('No se pudo abrir la galería de fotos en este dispositivo.');
    }
  };

  const handleSaveHours = async () => {
    setIsSubmittingConfig(true);
    try {
      const res = await apiFetch('/api/tenants/config', { 
        method: 'PUT', body: JSON.stringify({ business_hours: localHours }) 
      });
      if (res.ok) {
        setTenantInfo(prev => prev ? { ...prev, business_hours: localHours, businessHours: localHours } : prev);
        alert('✅ Horarios actualizados correctamente.');
      } else {
        alert('Error guardando los horarios.');
      }
    } catch (e) { alert('Error de red.'); }
    finally { setIsSubmittingConfig(false); }
  };

  const handleSaveLoyalty = async () => {
    setIsSubmittingLoyalty(true);
    try {
      const payloadLoyalty = { ...localLoyalty, reviews: reviewsList, campaigns: pushCampaignsList };
      const res = await apiFetch('/api/tenants/config', { 
        method: 'PUT', body: JSON.stringify({ loyaltyConfig: payloadLoyalty }) 
      });
      if (res.ok) {
        alert('✅ Programa de fidelización actualizado.');
        setTenantInfo(prev => prev ? { ...prev, loyaltyConfig: payloadLoyalty } : null);
      }
      else alert('Error guardando configuración.');
    } catch (e) { alert('Error de red.'); }
    finally { setIsSubmittingLoyalty(false); }
  };

  const handlePortfolioImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const webpFile = await convertImageToWebp(e.target.files[0]);
        setPortfolioFormFile(webpFile);
        setPortfolioFormPreview(URL.createObjectURL(webpFile));
      } catch (err) {
        alert('Error procesando la imagen. Intenta con otra.');
      }
    }
  };

  const handleEditPortfolioItem = (idx: number) => {
    const item = localPortfolio[idx];
    setPortfolioEditingIndex(idx);
    setPortfolioFormTitle(item.title || '');
    setPortfolioFormDesc(item.description || '');
    setPortfolioFormPreview(item.url); 
    setPortfolioFormFile(null); 
    setIsAddingPortfolio(true);
  };

  const handleSavePortfolioItem = async () => {
    if (!acceptedContentTerms) {
      alert('Debes aceptar la declaración de contenido para poder publicar.');
      return;
    }
    if (!portfolioFormTitle) {
      alert('Debes escribir un título para la imagen.');
      return;
    }
    if (portfolioEditingIndex === null && !portfolioFormFile) {
      alert('Debes seleccionar una imagen para un trabajo nuevo.');
      return;
    }

    setIsSubmittingConfig(true);
    try {
      let finalUrl = portfolioEditingIndex !== null ? localPortfolio[portfolioEditingIndex].url : '';
      
      if (portfolioFormFile) {
        const path = await uploadImageToSupabase(portfolioFormFile, 'portfolio');
        if (!path) throw new Error('Fallo al subir a Supabase');
        finalUrl = path;
      }

      const newItem: PortfolioItem = { 
        url: finalUrl, 
        title: toTitleCase(portfolioFormTitle), 
        description: toTitleCase(portfolioFormDesc) 
      };
      
      let updatedPortfolio = [...localPortfolio];
      if (portfolioEditingIndex !== null) {
        updatedPortfolio[portfolioEditingIndex] = newItem; 
      } else {
        updatedPortfolio.push(newItem); 
      }

      const res = await apiFetch('/api/tenants/config', { 
        method: 'PUT', body: JSON.stringify({ portfolio: updatedPortfolio }) 
      });
      
      if (res.ok) {
        setLocalPortfolio(updatedPortfolio);
        handleCancelPortfolioForm();
      } else {
        alert('Error guardando el ítem en la base de datos.');
      }
    } catch (err) { alert('Error de conexión.'); }
    finally { setIsSubmittingConfig(false); }
  };

  const handleRemovePortfolioItem = async (indexToRemove: number) => {
    const updatedPortfolio = localPortfolio.filter((_, idx) => idx !== indexToRemove);
    setLocalPortfolio(updatedPortfolio);
    await apiFetch('/api/tenants/config', { 
      method: 'PUT', body: JSON.stringify({ portfolio: updatedPortfolio }) 
    });
  };

  const handleCancelPortfolioForm = () => {
    setIsAddingPortfolio(false);
    setPortfolioEditingIndex(null);
    setPortfolioFormTitle('');
    setPortfolioFormDesc('');
    setPortfolioFormFile(null);
    setPortfolioFormPreview(null);
    setIsPortfolioTitleDropdownOpen(false);
  };

  const handleCatalogImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const webpFile = await convertImageToWebp(e.target.files[0]);
        setCatalogFormFile(webpFile);
        setCatalogFormPreview(URL.createObjectURL(webpFile));
      } catch (err) {
        alert('Error procesando la imagen del catálogo.');
      }
    }
  };

  const handleEditCatalogService = (srv: ServiceInfo) => {
    setCatalogEditingId(srv.id);
    setCatalogFormName(srv.name);
    setCatalogFormDesc(srv.description || '');
    setCatalogFormPrice(formatCurrency(srv.price));
    setCatalogFormDuration(String(srv.durationMinutes || 30));
    setCatalogFormPreview(srv.imageUrl || null);
    setCatalogFormFile(null);
    setIsCatalogModalVisible(true);
  };

  const handleSaveCatalogService = async () => {
    if (!acceptedContentTerms) {
      alert('Debes aceptar la declaración de contenido para poder publicar.');
      return;
    }
    if (!catalogFormName || !catalogFormPrice) { 
      alert('Por favor, ingresa el nombre y el precio.'); 
      return; 
    }
    setIsSubmitting(true);
    try {
      let finalImageUrl = catalogFormPreview && !catalogFormPreview.startsWith('blob:') ? catalogFormPreview : null;

      if (catalogFormFile) {
        const path = await uploadImageToSupabase(catalogFormFile, 'services');
        if (path) finalImageUrl = path;
      }

      const cleanPrice = catalogFormPrice.replace(/[^0-9.]/g, '');
      const method = catalogEditingId ? 'PUT' : 'POST';
      const endpoint = catalogEditingId ? `/api/services/${catalogEditingId}` : '/api/services';
      
      const res = await apiFetch(endpoint, {
        method, 
        body: JSON.stringify({ 
          name: toTitleCase(catalogFormName), 
          description: toTitleCase(catalogFormDesc), 
          price: cleanPrice, 
          durationMinutes: Number(catalogFormDuration),
          imageUrl: finalImageUrl 
        })
      });
      
      const data = await res.json();
      if (data.success && data.service) {
        if (catalogEditingId) { setServicesList(prev => prev.map(s => s.id === catalogEditingId ? data.service : s)); } 
        else { setServicesList(prev => [...prev, data.service]); }
        setIsCatalogModalVisible(false); 
        setCatalogEditingId(null); 
        setCatalogFormName(''); 
        setCatalogFormDesc('');
        setCatalogFormPrice(''); 
        setCatalogFormDuration('30');
        setCatalogFormFile(null);
        setCatalogFormPreview(null);
      } else { alert('Error del servidor: ' + data.message); }
    } catch (error) { alert('Error de conexión al guardar el servicio.'); } 
    finally { setIsSubmitting(false); }
  };

  // 🌟 MOTOR MULTITURNO: PERMITE AGENDAR N CITAS EN PARALELO SI HAY N ESTILISTAS ACTIVOS 🌟
  // Devuelve la lista de estilistas que están LIBRES en una fecha y hora determinadas
  const getFreeStaffForSlot = (dateStr: string, timeStr: string, serviceIdStr: string): StaffInfo[] => {
    const activeMembers = staffList.filter(s => s.isActive !== false);
    if (!dateStr || !timeStr || activeMembers.length === 0) return activeMembers;

    const serviceSelected = servicesList.find(s => s.id === serviceIdStr);
    const durationMin = serviceSelected?.durationMinutes || 30;
    const slotStart = parseAppointmentWallClock(dateStr, timeStr);
    const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);

    const dayAppointments = getMergedUniqueAppointments(todayOrders, upcomingOrders).filter(app => {
      if (!app.appointmentDate) return false;
      return app.appointmentDate.startsWith(dateStr);
    });

    const overlappingApps = dayAppointments.filter(app => {
      const appStart = parseAppointmentWallClock(app);
      const appDuration = app.service?.durationMinutes || app.metadata?.durationMinutes || 30;
      const appEnd = new Date(appStart.getTime() + appDuration * 60000);
      return slotStart < appEnd && slotEnd > appStart;
    });

    // Estilistas explícitamente ocupados en esa franja
    const busyStaffIds = overlappingApps
      .map(app => app.staffId || app.metadata?.assignedStaffId)
      .filter(Boolean);

    // Citas sin estilista específico asignado consumen 1 silla libre cada una
    const unassignedOverlappingCount = overlappingApps.filter(
      app => !app.staffId && !app.metadata?.assignedStaffId
    ).length;

    const explicitlyFreeStaff = activeMembers.filter(stf => !busyStaffIds.includes(stf.id));
    if (unassignedOverlappingCount > 0) {
      return explicitlyFreeStaff.slice(unassignedOverlappingCount);
    }
    return explicitlyFreeStaff;
  };

  // 🗓️ Al abrir el modal de reserva, asegurar servicio seleccionado y preseleccionar el primer día abierto según los Horarios del Portal Interno
  useEffect(() => {
    if (!isBookingModalOpen) return;
    if (!selectedServiceType && servicesList.length > 0) {
      const firstActive = servicesList.find(s => s.isActive !== false) || servicesList[0];
      if (firstActive) setSelectedServiceType(firstActive.id);
    }
    if (!appointmentDate) {
      const currentHours: any = {
        ...defaultHoursConfig,
        ...(tenantInfo?.business_hours || tenantInfo?.businessHours || {}),
        ...(localHours || {}),
      };
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const base = new Date();
      for (let i = 0; i < 14; i++) {
        const candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
        const dayKey = dayNames[candidate.getDay()];
        const conf = currentHours[dayKey];
        if (!conf || conf.isOpen !== false) {
          const yyyy = candidate.getFullYear();
          const mm = String(candidate.getMonth() + 1).padStart(2, '0');
          const dd = String(candidate.getDate()).padStart(2, '0');
          setAppointmentDate(`${yyyy}-${mm}-${dd}`);
          break;
        }
      }
    }
  }, [isBookingModalOpen, selectedServiceType, servicesList, tenantInfo, localHours]);

  // 🕒 MOTOR DE TURNOS: Toma estrictamente los horarios habilitados por el dueño en el Portal Interno
  useEffect(() => {
    if (!appointmentDate || !selectedServiceType) {
      setAvailableTimes([]);
      return;
    }

    const serviceSelected = servicesList.find(s => s.id === selectedServiceType);
    const durationMin = serviceSelected?.durationMinutes || 30;
    const activeMembers = staffList.filter(s => s.isActive !== false);

    const dayAppointments = getMergedUniqueAppointments(todayOrders, upcomingOrders).filter(app => {
      if (!app.appointmentDate) return false;
      const appDateStr = app.metadata?.localDate || String(app.appointmentDate).split('T')[0];
      return appDateStr === appointmentDate;
    });

    const [year, month, day] = appointmentDate.split('-').map(Number);
    if (!year || !month || !day) {
      setAvailableTimes([]);
      return;
    }
    const dateObj = new Date(year, month - 1, day);
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const selectedDayName = dayNames[dateObj.getDay()];

    // Combinar horarios guardados por el dueño en el Portal Interno
    const currentHours: any = {
      ...defaultHoursConfig,
      ...(tenantInfo?.business_hours || tenantInfo?.businessHours || {}),
      ...(localHours || {}),
    };

    const dayConfig = currentHours[selectedDayName];
    if (!dayConfig || dayConfig.isOpen === false) {
      // El dueño marcó este día como CERRADO en el Portal Interno
      setAvailableTimes([]);
      setAppointmentTime('');
      return;
    }

    const openHour = dayConfig.open ? parseInt(String(dayConfig.open).split(':')[0], 10) : 8;
    const openMin = dayConfig.open ? parseInt(String(dayConfig.open).split(':')[1] || '0', 10) : 0;
    const closeHour = dayConfig.close ? parseInt(String(dayConfig.close).split(':')[0], 10) : 18;
    const closeMin = dayConfig.close ? parseInt(String(dayConfig.close).split(':')[1] || '0', 10) : 0;

    const startTotalMinutes = openHour * 60 + openMin;
    const endTotalMinutes = closeHour * 60 + closeMin;

    const slots: string[] = [];
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = appointmentDate === todayStr;

    for (let mins = startTotalMinutes; mins + durationMin <= endTotalMinutes; mins += 30) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const timeString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const slotStart = parseAppointmentWallClock(appointmentDate, timeString);
      const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);

      // Si es hoy, ocultar únicamente horas que ya pasaron
      if (isToday && slotStart.getTime() < now.getTime() - 15 * 60 * 1000) {
        continue;
      }

      if (selectedBookingStaff) {
        const isThisStaffBusy = dayAppointments.some(app => {
          const appStaff = app.staffId || app.metadata?.assignedStaffId;
          if (appStaff !== selectedBookingStaff) return false;
          const appStart = parseAppointmentWallClock(app);
          const appDuration = app.service?.durationMinutes || app.metadata?.durationMinutes || 30;
          const appEnd = new Date(appStart.getTime() + appDuration * 60000);
          return slotStart < appEnd && slotEnd > appStart;
        });

        if (!isThisStaffBusy) {
          slots.push(timeString);
        }
      } else if (activeMembers.length > 0) {
        const freeMembers = getFreeStaffForSlot(appointmentDate, timeString, selectedServiceType);
        if (freeMembers.length > 0) {
          slots.push(timeString);
        }
      } else {
        const isOverlap = dayAppointments.some(app => {
          const appStart = parseAppointmentWallClock(app);
          const appDuration = app.service?.durationMinutes || app.metadata?.durationMinutes || 30;
          const appEnd = new Date(appStart.getTime() + appDuration * 60000);
          return slotStart < appEnd && slotEnd > appStart;
        });
        if (!isOverlap) {
          slots.push(timeString);
        }
      }
    }
    
    setAvailableTimes(slots);
    if (slots.length > 0) {
      const nextTime = (!appointmentTime || !slots.includes(appointmentTime)) ? slots[0] : appointmentTime;
      setAppointmentTime(nextTime);
      const hourNum = parseInt(String(nextTime).split(':')[0], 10);
      setTimePeriodTab(hourNum < 12 ? 'morning' : 'afternoon');
    } else {
      setAppointmentTime('');
    }
  }, [appointmentDate, selectedServiceType, selectedBookingStaff, todayOrders, upcomingOrders, servicesList, localHours, tenantInfo, staffList]);

  const pendingReferralsByPhone = useMemo(() => {
    const map: Record<string, string[]> = {};
    getMergedUniqueAppointments(todayOrders, upcomingOrders).forEach((o: any) => {
      const ref = cleanPhoneDigits(o.metadata?.referredBy || o.metadata?.preferences?.referredBy);
      if (ref && ref.length >= 7) {
        if (!map[ref]) map[ref] = [];
        const cName = toTitleCase(o.clientName || 'Un amigo');
        if (!map[ref].includes(cName)) map[ref].push(cName);
      }
    });
    return map;
  }, [todayOrders, upcomingOrders]);

  useEffect(() => {
    if (!isBookingModalOpen) return;
    const cleanPhone = cleanPhoneDigits(clientPhone);
    const cleanEmail = clientEmail.trim().toLowerCase();
    const query = cleanEmail.includes('@') ? cleanEmail : (cleanPhone.length >= 7 ? cleanPhone : '');
    
    if (!query) {
      setBookingClientCoupons(0);
      setIsExistingClient(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/clients/history/${query}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.client) {
            let meta = data.client.metadata;
            if (typeof meta === 'string') {
              try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
            }
            const dbCoupons = Number(meta?.earnedReferralDiscounts || 0);
            const cPhoneClean = cleanPhoneDigits(data.client.phone || clientPhone);
            const livePending = cPhoneClean && pendingReferralsByPhone[cPhoneClean] ? pendingReferralsByPhone[cPhoneClean].length : 0;
            setBookingClientCoupons(Math.max(0, dbCoupons + livePending));

            const visitsCount = Number(data.client.loyaltyVisits ?? (Array.isArray(data.serviceHistory) ? data.serviceHistory.length : 0));
            setBookingMatchedVisits(visitsCount);
            const hasHistory = (data.serviceHistory && data.serviceHistory.length > 0) || visitsCount > 0;
            if (!clientName.trim() && data.client.name) setClientName(toTitleCase(data.client.name));
            if (!clientEmail.trim() && data.client.email) setClientEmail(data.client.email);
            setIsExistingClient(hasHistory);
            if (hasHistory) setReferredByPhone('');
          } else {
            const livePending = cleanPhone && pendingReferralsByPhone[cleanPhone] ? pendingReferralsByPhone[cleanPhone].length : 0;
            setBookingClientCoupons(livePending);
            setIsExistingClient(false);
          }
        } else {
          const livePending = cleanPhone && pendingReferralsByPhone[cleanPhone] ? pendingReferralsByPhone[cleanPhone].length : 0;
          setBookingClientCoupons(livePending);
          setIsExistingClient(false);
        }
      } catch (e) {}
    }, 500);

    return () => clearTimeout(timer);
  }, [clientEmail, clientPhone, isBookingModalOpen, pendingReferralsByPhone]);

  const availableRoles = useMemo(() => {
    if (isAutomotive) return ['Mecánico General', 'Especialista en Frenos', 'Electricista Automotriz', 'Técnico de Suspensión', 'Jefe de Taller'];
    if (isSpa) return ['Masajista Profesional', 'Cosmetóloga', 'Esteticista', 'Terapeuta Corporal', 'Especialista en Spa'];
    if (isBarbershop) return ['Barbero Senior', 'Estilista', 'Especialista en Barba', 'Colorista', 'Barbero Master'];
    if (isLegal) return ['Abogado Socio / Titular', 'Abogado de Inmigración', 'Abogado de Familia / Civil', 'Abogado Penalista / Laboral', 'Paralegal / Asociado'];
    if (isDental) return ['Odontólogo General', 'Ortodoncista', 'Endodoncista / Cirujano Oral', 'Implantólogo / Rehabilitador', 'Higienista Dental'];
    return ['Especialista', 'Técnico', 'Asistente', 'Gerente'];
  }, [isAutomotive, isSpa, isBarbershop, isLegal, isDental]);

  // 📋 Plantillas predefinidas de Servicios por Nicho para el modal "+ Nuevo Servicio"
  const availableServiceTemplates = useMemo(() => {
    if (isBarbershop) {
      return [
        { name: 'Corte Clásico / Fade', price: '35', duration: '30', desc: 'Corte De Cabello Personalizado Con Degradado Limpio Y Peinado.' },
        { name: 'Corte + Perfilado De Barba VIP', price: '50', duration: '45', desc: 'Corte Completo, Perfilado De Barba Con Toalla Caliente Y Vapor De Ozono.' },
        { name: 'Perfilado Y Ritual De Barba', price: '25', duration: '30', desc: 'Afeitado Tradicional Con Navaja, Aceites Esenciales Y Toalla Caliente.' },
        { name: 'Corte De Niño (Kids Cut)', price: '28', duration: '30', desc: 'Corte Moderno O Clásico Para Niños Con Paciencia Y Estilo.' },
        { name: 'Cejas + Limpieza Facial Express', price: '20', duration: '15', desc: 'Perfilado De Cejas Con Navaja Y Mascarilla Negra Purificante.' },
      ];
    }
    if (isSpa) {
      return [
        { name: 'Masaje Relajante Cuerpo Completo', price: '85', duration: '60', desc: 'Terapia De Relajación Profunda Con Aromaterapia Y Aceites Tibios.' },
        { name: 'Limpieza Facial Profunda', price: '75', duration: '60', desc: 'Extracción De Impurezas, Hidratación Y Máscara LED Rejuvenecedora.' },
        { name: 'Masaje Descontracturante (Tejido Profundo)', price: '95', duration: '60', desc: 'Alivio De Tensión Muscular En Espalda, Cuello Y Hombros.' },
        { name: 'Drenaje Linfático / Reductor', price: '90', duration: '60', desc: 'Activación De Circulación Y Eliminación De Retención De Líquidos.' },
      ];
    }
    if (isLegal) {
      return [
        { name: 'Consulta Legal Inicial (Evaluación)', price: '100', duration: '45', desc: 'Análisis De Viabilidad Del Caso, Revisión De Documentos Y Estrategia Legal.' },
        { name: 'Asesoría De Inmigración / Petición Familiar', price: '150', duration: '60', desc: 'Revisión De Estatus Migratorio, Visas, Residencia O Ciudadanía.' },
        { name: 'Consulta De Derecho De Familia / Divorcio', price: '120', duration: '45', desc: 'Custodia, Manutención, Acuerdos Prenupciales Y Divorcio.' },
        { name: 'Redacción Y Revisión De Contratos', price: '180', duration: '60', desc: 'Blindaje Legal Para Contratos Comerciales, Civiles O Laborales.' },
      ];
    }
    if (isDental) {
      return [
        { name: 'Valoración Odontológica + Diagnóstico', price: '50', duration: '30', desc: 'Examen Clínico Completo Y Plan De Tratamiento Personalizado.' },
        { name: 'Limpieza Dental Ultrasónica (Profilaxis)', price: '90', duration: '45', desc: 'Eliminación De Sarro, Pulido Dental Y Aplicación De Flúor.' },
        { name: 'Blanqueamiento Dental LED', price: '220', duration: '60', desc: 'Aclaramiento Dental Seguro En Consultorio Con Gel De Alta Concentración.' },
        { name: 'Urgencia / Dolor Dental', price: '80', duration: '30', desc: 'Atención Inmediata Para Dolor Agudo, Fractura O Infección.' },
      ];
    }
    return [
      { name: 'Cambio De Aceite Sintético + Filtro', price: '75', duration: '45', desc: 'Aceite Full Sintético, Filtro Nuevo Y Revisión De 15 Puntos De Seguridad.' },
      { name: 'Diagnóstico Computarizado (Scanner)', price: '65', duration: '30', desc: 'Lectura De Códigos Check Engine Y Revisión Electrónica Completa.' },
      { name: 'Servicio De Frenos (Pastillas Y Discos)', price: '160', duration: '60', desc: 'Inspección Y Reemplazo De Pastillas De Freno Con Purgado De Líquido.' },
      { name: 'Alineación Y Balanceo Computarizado', price: '85', duration: '45', desc: 'Ajuste De Geometría De Suspensión Y Balanceo De Las 4 Ruedas.' },
      { name: 'Mantenimiento General Preventivo', price: '140', duration: '90', desc: 'Revisión De Niveles, Frenos, Suspensión, Batería Y Filtros.' },
    ];
  }, [isBarbershop, isSpa, isLegal, isDental]);

  const activeStaffList = useMemo(() => staffList.filter(s => s.isActive !== false), [staffList]);
  const activeCatalogServices = useMemo(() => servicesList.filter(s => s.isActive !== false), [servicesList]);
  
  const paginatedReports = useMemo(() => {
    if (isPrinting) return reportsData;
    const start = (reportPage - 1) * ITEMS_PER_PAGE;
    const sliced = reportsData.slice(start, start + ITEMS_PER_PAGE);
    const padded: any[] = [...sliced];
    if (reportsData.length > 0 && !isPrinting) {
      while (padded.length < ITEMS_PER_PAGE) padded.push({ _empty: true, id: `empty-${padded.length}` });
    }
    return padded;
  }, [reportsData, reportPage, isPrinting]);

  const totalRevenue = useMemo(() => reportsData.reduce((acc, curr: any) => acc + (Number(curr.cost || curr.finalCost) || 0), 0), [reportsData]);
  const totalPages = Math.ceil(reportsData.length / ITEMS_PER_PAGE) || 1;

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'old' | 'new') => {
    if (e.target.files && e.target.files[0]) {
      const rawFile = e.target.files[0];
      try {
        const webpFile = await convertImageToWebp(rawFile);
        const url = URL.createObjectURL(webpFile);
        if (type === 'old') { setOldPartImage(webpFile); setOldPartPreview(url); } else { setNewPartImage(webpFile); setNewPartPreview(url); }
      } catch (err) { alert('Error procesando la imagen.'); }
    }
  };

  const handleOpenPOS = async (order: any) => {
    let safeOrder = { ...order };
    if (typeof safeOrder.metadata === 'string') {
       try { safeOrder.metadata = JSON.parse(safeOrder.metadata); } catch(e){}
    }
    if (typeof safeOrder.clientMetadata === 'string') {
       try { safeOrder.clientMetadata = JSON.parse(safeOrder.clientMetadata); } catch(e){}
    }
    
    setSelectedOrder(safeOrder);
    
    if (safeOrder.service?.price) {
      setFinalCost(`$ ${Number(safeOrder.service.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    } else if (safeOrder.estimatedCost) {
      setFinalCost(`$ ${Number(safeOrder.estimatedCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    } else {
      setFinalCost('');
    }

    setClientVisits(null);
    setRewardApplied(false);
    setApplyReferralDiscount(false);
    setActiveReferredBy(null);
    setAssignedMechanicId(safeOrder.staffId || safeOrder.metadata?.assignedStaffId || (activeStaffList[0]?.id || '')); 
    
    if (tenantInfo?.loyaltyConfig?.isActive && safeOrder.clientEmail) {
      setIsCheckingLoyalty(true);
      try {
        const res = await apiFetch(`/api/clients/history/${safeOrder.clientEmail}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.client) {
            const visitsFromWallet = data.client.loyaltyVisits;
            const closedVisits = visitsFromWallet !== undefined ? visitsFromWallet : (data.serviceHistory ? data.serviceHistory.length : 0);
            setClientVisits(closedVisits);

            let parsedClientMeta = data.client.metadata;
            if (typeof parsedClientMeta === 'string') {
              try { parsedClientMeta = JSON.parse(parsedClientMeta); } catch (e) { parsedClientMeta = {}; }
            }
            setSelectedOrder((prev: any) => prev ? { ...prev, clientMetadata: parsedClientMeta || {} } : prev);
          }
        }
      } catch (err) {
        console.error("Error verificando fidelidad:", err);
      } finally {
        setIsCheckingLoyalty(false);
      }
    }

    const refPhone = safeOrder.metadata?.referredBy || safeOrder.metadata?.preferences?.referredBy || '';
    if (refPhone && refPhone.trim() !== '') {
      setActiveReferredBy(refPhone.trim());
    }
  };

  const handleApplyLoyaltyReward = () => {
    if (!tenantInfo?.loyaltyConfig) return;
    
    if (tenantInfo.loyaltyConfig.rewardType === 'free_service') {
      setFinalCost('$ 0.00');
      setMechanicNotes(prev => `🎉 PREMIO DE FIDELIDAD APLICADO (Servicio Gratis). ${prev}`.trim());
    } else if (tenantInfo.loyaltyConfig.rewardType === 'discount') {
      let basePrice = 0;
      if (selectedOrder?.service?.price) {
        basePrice = Number(selectedOrder.service.price);
      } else {
        basePrice = Number(finalCost.replace(/[^0-9.]/g, ''));
      }
      
      const discount = tenantInfo.loyaltyConfig.rewardValue || 50; 
      const newVal = basePrice - (basePrice * (discount / 100));
      
      setFinalCost(`$ ${newVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      setMechanicNotes(prev => `🎉 PREMIO DE FIDELIDAD APLICADO (${discount}% Descuento). ${prev}`.trim());
    }
    
    setRewardApplied(true);
    alert('¡Recompensa de visitas aplicada con éxito al total!');
  };

  const toggleReferralDiscount = (val: boolean) => {
    setApplyReferralDiscount(val);
    if (!tenantInfo?.loyaltyConfig) return;

    let basePrice = 0;
    if (selectedOrder?.service?.price) {
       basePrice = Number(selectedOrder.service.price);
    } else if (selectedOrder?.estimatedCost) {
       basePrice = Number(selectedOrder.estimatedCost);
    } else {
       basePrice = Number(finalCost.replace(/[^0-9.]/g, ''));
    }

    if (val) {
      const discount = tenantInfo.loyaltyConfig.referralDiscountPercent || 20; 
      const newVal = basePrice - (basePrice * (discount / 100));
      setFinalCost(`$ ${newVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      setMechanicNotes(prev => `🏆 DESCUENTO POR REFERIR APLICADO (${discount}%). ${prev}`.trim());
    } else {
      setFinalCost(`$ ${basePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      setMechanicNotes(prev => prev.replace(new RegExp(`(🤝|🏆) DESCUENTO (POR VENIR RECOMENDADO|DE REFERIDO APLICADO|POR REFERIR APLICADO) \\(\\d+%\\)\\. `), ''));
    }
  };

  const handleCompleteWorkOrder = async () => {
    if (!assignedMechanicId) { alert("Asigne al personal responsable."); return; }
    setIsSubmitting(true);
    try {
      let oldImageUrl = await (oldPartImage ? uploadImageToSupabase(oldPartImage, 'old') : null);
      let newImageUrl = await (newPartImage ? uploadImageToSupabase(newPartImage, 'new') : null);
      const cleanCost = finalCost.replace(/[^0-9.]/g, '');

      const payload = { 
        finalCost: cleanCost, exitMileage, oldParts: toTitleCase(oldParts), newParts: toTitleCase(newParts), mechanicNotes: toTitleCase(mechanicNotes), nextServiceDate: nextServiceTime, 
        staffId: assignedMechanicId, oldPartImageUrl: oldImageUrl, newPartImageUrl: newImageUrl,
        rewardApplied: rewardApplied, 
        referralDiscountApplied: applyReferralDiscount 
      };
      
      const res = await apiFetch(`/api/appointments/${selectedOrder.id}/complete`, { method: 'PUT', body: JSON.stringify(payload) });
      if(res.ok){
         alert('✅ Orden cerrada con éxito.');
         setSelectedOrder(null); setOldPartImage(null); setOldPartPreview(null); setNewPartImage(null); setNewPartPreview(null); setOldParts(''); setNewParts(''); setMechanicNotes(''); setClientVisits(null); setRewardApplied(false); setApplyReferralDiscount(false); setActiveReferredBy(null);
         fetchAgendaData();
      } else { alert('Error del servidor al guardar la orden.'); }
    } catch (error) { alert('Error al cerrar orden.'); } finally { setIsSubmitting(false); }
  };

  // 🌟 CANCELAR CITA, LIBERAR EL ESPACIO EN LA AGENDA Y ENVIAR TELEGRAM + NOTIFICACIÓN PUSH 🌟
  const openCancelAppointmentModal = (orderObj: any, origin: 'client' | 'staff') => {
    setCancellingOrder(orderObj);
    setCancelOrigin(origin);
    setCancelReasonText('');
  };

  const handleConfirmCancelAppointment = async () => {
    if (!cancellingOrder?.id) return;
    setIsCancellingApt(true);
    try {
      const reasonClean = cancelReasonText.trim()
        ? toTitleCase(cancelReasonText.trim())
        : (cancelOrigin === 'client' ? 'Cancelada por el cliente desde Expediente' : 'Cancelada desde el Portal Interno');

      // 1. Llamar al endpoint de cancelación en el backend (que envía Telegram + Push Expo + libera BD)
      let backendOk = false;
      try {
        const resCancel = await apiFetch(`/api/appointments/${cancellingOrder.id}/cancel`, {
          method: 'PUT',
          body: JSON.stringify({
            reason: reasonClean,
            cancelledBy: cancelOrigin,
            clientName: cancellingOrder.clientName || clientExpedienteData?.client?.name || 'Cliente',
            clientPhone: cancellingOrder.clientPhone || clientExpedienteData?.client?.phone || '',
            serviceName: cancellingOrder.service?.name || cancellingOrder.serviceType || 'Servicio',
            appointmentDate: cancellingOrder.appointmentDate || cancellingOrder.date || '',
            time: cancellingOrder.time || ''
          })
        });
        if (resCancel.ok) backendOk = true;
      } catch (e) {}

      // 2. Remover inmediatamente de todayOrders y upcomingOrders en memoria para liberar el espacio al instante
      setTodayOrders((prev) => prev.filter((o) => o.id !== cancellingOrder.id));
      setUpcomingOrders((prev) => prev.filter((o) => o.id !== cancellingOrder.id));
      if (selectedOrder?.id === cancellingOrder.id) {
        setSelectedOrder(null);
      }

      // 3. Disparar Notificación Push local en el navegador / sistema operativo
      const datePretty = (cancellingOrder.appointmentDate || cancellingOrder.date)
        ? new Date(cancellingOrder.appointmentDate || cancellingOrder.date).toLocaleDateString('es-ES')
        : 'Hoy';
      const timePretty = cancellingOrder.time || '';
      const pushTitle = `❌ Cita Cancelada — Turno Liberado (${timePretty || datePretty})`;
      const pushBody = `La cita de ${toTitleCase(cancellingOrder.clientName || clientExpedienteData?.client?.name || 'Cliente')} (${toTitleCase(cancellingOrder.service?.name || cancellingOrder.serviceType || 'Servicio')}) fue cancelada. ¡El espacio de las ${timePretty || datePretty} ya está disponible nuevamente!`;
      triggerBrowserLocalNotification(pushTitle, pushBody);

      setCancellingOrder(null);
      setCancelReasonText('');
      fetchAgendaData();
      alert('✅ Cita cancelada con éxito. El espacio quedó libre en la agenda y se envió la alerta por Telegram y Notificación Push.');
    } catch (error) {
      alert('Error al cancelar la cita.');
    } finally {
      setIsCancellingApt(false);
    }
  };

  // 🕒 Calcula cuántas horas faltan para la cita (para políticas de 6h recordatorio y 3h límite de cancelación)
  const getHoursUntilAppointment = (orderObj: any): number => {
    const rawDate = orderObj?.appointmentDate || orderObj?.date;
    if (!rawDate) return 24;
    const datePart = String(rawDate).split('T')[0];
    const timePart = orderObj?.time || (String(rawDate).includes('T') ? String(rawDate).split('T')[1].substring(0, 5) : '12:00');
    const localTarget = new Date(`${datePart}T${timePart}:00`);
    const targetTime = !isNaN(localTarget.getTime()) ? localTarget.getTime() : new Date(rawDate).getTime();
    return Number(((targetTime - Date.now()) / (1000 * 60 * 60)).toFixed(1));
  };

  // ✅ CONFIRMAR ASISTENCIA A LA CITA (6 HORAS ANTES) Y ENVIAR TELEGRAM + NOTIFICACIÓN PUSH
  const handleConfirmAttendance = async (orderObj: any, confirmedBy: 'client' | 'staff' = 'client') => {
    if (!orderObj?.id) return;
    setConfirmingAptId(orderObj.id);
    try {
      const cName = toTitleCase(orderObj.clientName || clientExpedienteData?.client?.name || 'Cliente');
      const sName = toTitleCase(orderObj.service?.name || orderObj.serviceType || 'Servicio General');
      const timeStr = orderObj.time || 'Hora programada';

      await apiFetch(`/api/appointments/${orderObj.id}/confirm`, {
        method: 'PUT',
        body: JSON.stringify({
          confirmedBy,
          clientName: cName,
          clientPhone: orderObj.clientPhone || clientExpedienteData?.client?.phone || '',
          serviceName: sName,
          appointmentDate: orderObj.appointmentDate || orderObj.date || '',
          time: timeStr
        })
      });

      const markConfirmed = (list: any[]) =>
        list.map((o) =>
          o.id === orderObj.id
            ? {
                ...o,
                status: 'confirmed',
                metadata: { ...(o.metadata || {}), attendanceConfirmed: true, confirmedAt: new Date().toISOString() }
              }
            : o
        );

      setTodayOrders(markConfirmed);
      setUpcomingOrders(markConfirmed);

      triggerBrowserLocalNotification(
        `✅ Asistencia Confirmada (${timeStr})`,
        `${cName} confirmó su asistencia para ${sName} a las ${timeStr}. ¡Todo listo en agenda!`
      );

      fetchAgendaData();
      alert(`✅ ¡Asistencia confirmada! Se notificó al negocio por Telegram y Notificación Push.`);
    } catch (e) {
      alert('Error al confirmar la asistencia.');
    } finally {
      setConfirmingAptId(null);
    }
  };

  // 🔔 ENVIAR RECORDATORIO DE 6 HORAS (SOLICITAR CONFIRMACIÓN O CANCELACIÓN A TIEMPO)
  const handleSendSixHourReminder = async (orderObj: any) => {
    if (!orderObj?.id) return;
    setSendingReminderAptId(orderObj.id);
    try {
      const cName = toTitleCase(orderObj.clientName || 'Cliente');
      const sName = toTitleCase(orderObj.service?.name || orderObj.serviceType || 'Servicio General');
      const timeStr = orderObj.time || 'hoy';

      await apiFetch(`/api/appointments/${orderObj.id}/remind`, {
        method: 'POST',
        body: JSON.stringify({
          clientName: cName,
          clientPhone: orderObj.clientPhone || '',
          serviceName: sName,
          appointmentDate: orderObj.appointmentDate || orderObj.date || '',
          time: timeStr
        })
      });

      triggerBrowserLocalNotification(
        `⏰ Recordatorio 6h antes — ${tenantInfo?.name || 'AutoFlow'}`,
        `Hola ${cName}, te recordamos tu cita de ${sName} a las ${timeStr}. Confirma tu asistencia o cancela con al menos 3h de anticipación en tu Expediente.`
      );

      const markReminded = (list: any[]) =>
        list.map((o) =>
          o.id === orderObj.id
            ? { ...o, metadata: { ...(o.metadata || {}), reminder6hSent: true, reminderSentAt: new Date().toISOString() } }
            : o
        );
      setTodayOrders(markReminded);
      setUpcomingOrders(markReminded);

      alert(`🔔 Recordatorio de 6 horas enviado a ${cName} por Telegram y Notificación Push.`);
    } catch (e) {
      alert('Error enviando el recordatorio.');
    } finally {
      setSendingReminderAptId(null);
    }
  };

  // ⚡ AUTOCONFIGURACIÓN EN 1 CLIC DEL RECEPCIONISTA DE VOZ EN VAPI.AI (MODELO BYOK - EL DUEÑO PAGA SUS LLAMADAS)
  const handleAutoConfigureVapiAssistant = async () => {
    if (!vapiConfig.privateApiKey?.trim() && !vapiConfig.phoneNumber?.trim()) {
      alert('Por favor pega tu "Private Key" de Vapi (la primera clave con punticos •••••• que sale arriba en Claves API).');
      return;
    }
    setIsSyncingVapi(true);
    try {
      const res = await apiFetch('/api/tenants/vapi-setup', {
        method: 'POST',
        body: JSON.stringify({
          vapiConfig: {
            ...vapiConfig,
            isActive: true,
            lastSyncedAt: new Date().toISOString()
          },
          businessName: tenantInfo?.name || 'Nuestro Negocio',
          niche: dbNiche || (isLegal ? 'legal' : isDental ? 'dental' : isSpa ? 'spa' : isBarbershop ? 'barbershop' : 'automotive'),
          services: activeCatalogServices.map((s) => ({ id: s.id, name: s.name, price: s.price, durationMinutes: s.durationMinutes || 30 })),
          staff: activeStaffList.map((st) => ({ id: st.id, name: st.name, role: st.role })),
          businessHours: localHours
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const savedVapi = data.vapiConfig || { ...vapiConfig, isActive: true, lastSyncedAt: new Date().toISOString() };
        setVapiConfig(savedVapi);
        const updatedLoyalty = { ...localLoyalty, reviews: reviewsList, campaigns: pushCampaignsList, vapiConfig: savedVapi };
        setLocalLoyalty(updatedLoyalty);
        setTenantInfo((prev) => (prev ? { ...prev, loyaltyConfig: updatedLoyalty } : prev));
        const noticeMsg = data.message || `🤖 ¡Agente Virtual IA Activado! Línea: ${savedVapi.phoneNumber || 'Activa'}`;
        setVapiActivationNotice(noticeMsg);
        triggerBrowserLocalNotification(
          `🤖 ¡Agente Virtual IA Activado! — ${tenantInfo?.name || 'AutoFlow'}`,
          `Línea ${savedVapi.phoneNumber || ''} conectada y lista para recibir llamadas en lenguaje natural.`
        );
        alert(noticeMsg);
      } else {
        alert(data.message || 'Error al configurar el asistente de voz.');
      }
    } catch (err) {
      alert('Error de red al conectar con el motor de voz.');
    } finally {
      setIsSyncingVapi(false);
    }
  };

  // 📲 FUNCIONES PARA PARAMETRIZAR Y PROBAR EL CANAL INTERNO DE TELEGRAM DEL CONSULTORIO / NEGOCIO
  const handleDetectTelegramChatId = async () => {
    setIsDetectingTelegramChat(true);
    try {
      const res = await apiFetch('/api/tenants/telegram-detect-chat', {
        method: 'POST',
        body: JSON.stringify({ botToken: telegramConfig.botToken || '' })
      });
      const data = await res.json();
      if (res.ok && data.success && data.chatId) {
        setTelegramConfig((prev) => ({
          ...prev,
          chatId: String(data.chatId),
          channelName: prev.channelName || data.channelName || tenantInfo?.name || 'Canal Interno'
        }));
        alert(data.message || `✅ Chat ID detectado: ${data.chatId}`);
      } else {
        alert(data.message || 'No se encontraron mensajes recientes en el Bot. Envía "hola" en tu grupo de Telegram e inténtalo de nuevo.');
      }
    } catch (e) {
      alert('Error de red al intentar detectar el Chat ID de Telegram.');
    } finally {
      setIsDetectingTelegramChat(false);
    }
  };

  const handleSaveTelegramChannel = async () => {
    if (!telegramConfig.chatId?.trim()) {
      alert('Por favor ingresa o autodetecta el "Telegram Chat ID" del grupo o usuario del consultorio.');
      return;
    }
    setIsSavingTelegram(true);
    try {
      const res = await apiFetch('/api/tenants/telegram-config', {
        method: 'PUT',
        body: JSON.stringify({
          telegramConfig: {
            ...telegramConfig,
            channelName: telegramConfig.channelName?.trim() || tenantInfo?.name || 'Canal Interno'
          }
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const savedTg = data.telegramConfig || telegramConfig;
        setTelegramConfig(savedTg);
        const updatedLoyalty = { ...localLoyalty, reviews: reviewsList, campaigns: pushCampaignsList, vapiConfig, telegramConfig: savedTg };
        setLocalLoyalty(updatedLoyalty);
        setTenantInfo((prev) => (prev ? { ...prev, loyaltyConfig: updatedLoyalty } : prev));
        alert(data.message || '✅ Canal interno de Telegram guardado en la base de datos.');
      } else {
        alert(data.message || 'Error guardando la configuración de Telegram.');
      }
    } catch (e) {
      alert('Error de red al guardar el canal de Telegram.');
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handleTestTelegramChannel = async () => {
    setIsTestingTelegram(true);
    try {
      const res = await apiFetch('/api/tenants/telegram-test', {
        method: 'POST',
        body: JSON.stringify({
          telegramConfig: {
            ...telegramConfig,
            channelName: telegramConfig.channelName?.trim() || tenantInfo?.name || 'Canal Interno'
          },
          businessName: tenantInfo?.name || 'Consultorio / Negocio'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message || '🚀 ¡Mensaje de prueba enviado a tu grupo de Telegram!');
      } else {
        alert(data.message || 'No se pudo enviar el mensaje de prueba. Verifica el Chat ID.');
      }
    } catch (e) {
      alert('Error de red al probar el canal de Telegram.');
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const openSupportModal = (defaultTopic?: string) => {
    setSupportContactName((prev) => prev || activeStaffList[0]?.name || tenantInfo?.name || '');
    setSupportContactPhone((prev) => prev || (tenantInfo as any)?.phoneContact || vapiConfig?.transferPhone || '');
    if (defaultTopic) setSupportTopic(defaultTopic);
    setSupportMessage('');
    setIsSupportModalOpen(true);
  };

  const handleSendAutoFlowSupport = async () => {
    if (!supportContactPhone.trim() && !supportMessage.trim()) {
      alert('Por favor indícanos tu teléfono/WhatsApp o una breve nota para comunicarnos contigo.');
      return;
    }
    setIsSendingSupport(true);
    try {
      const sectionLabel = activeView === 'mecanico'
        ? `Portal Interno ➔ ${agendaFilter}`
        : activeView === 'expediente'
          ? 'Expediente'
          : 'Reservas';

      const res = await apiFetch('/api/support/autoflow', {
        method: 'POST',
        body: JSON.stringify({
          businessName: tenantInfo?.name || 'Negocio / Consultorio',
          contactName: supportContactName.trim() || activeStaffList[0]?.name || 'Encargado',
          contactPhone: supportContactPhone.trim(),
          topic: supportTopic,
          message: supportMessage.trim() || `Solicito acompañamiento paso a paso para: ${supportTopic}`,
          currentSection: sectionLabel
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsSupportModalOpen(false);
        setSupportMessage('');
        alert(data.message || '🎧 ¡Solicitud enviada al equipo de Soporte AutoFlow! En breve te contactaremos.');
      } else {
        alert(data.message || 'No se pudo enviar la solicitud a Soporte AutoFlow.');
      }
    } catch (e) {
      alert('Error de red al conectar con Soporte AutoFlow.');
    } finally {
      setIsSendingSupport(false);
    }
  };

  // 📞 SIMULADOR LOCAL DE LLAMADA ENTRANTE IA (PARA PROBAR AGENDAMIENTO TELEFÓNICO + TELEGRAM + PUSH SIN GASTAR SALDO)
  const handleSimulatePhoneBooking = async (lang: 'es' | 'en' = 'es') => {
    setIsSimulatingVoiceCall(true);
    try {
      const now = new Date();
      const targetTime = new Date(now.getTime() + 4 * 60 * 60 * 1000); // +4h (cumple regla de 3h)
      const yyyy = targetTime.getFullYear();
      const mm = String(targetTime.getMonth() + 1).padStart(2, '0');
      const dd = String(targetTime.getDate()).padStart(2, '0');
      const hh = String(Math.min(17, Math.max(9, targetTime.getHours()))).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const timeStr = `${hh}:00`;

      const firstService = activeCatalogServices[0];
      const firstStaff = activeStaffList[0];

      const sampleSummary = isLegal
        ? (lang === 'en'
            ? 'Client called in English requesting a legal consultation regarding an immigration visa review. Requested phone modality.'
            : 'El cliente llamó solicitando asesoría legal sobre un trámite de inmigración / contrato. Prefiere consulta telefónica.')
        : isDental
          ? (lang === 'en'
              ? 'Patient called in English reporting molar sensitivity and requesting a dental evaluation + cleaning. Has dental insurance.'
              : 'Paciente llamó por sensibilidad dental y solicita valoración odontológica + limpieza. Indica primera vez.')
          : (lang === 'en'
              ? 'Customer called in English to schedule an appointment for today.'
              : 'Cliente llamó a la línea IA para agendar turno disponible.');

      const res = await apiFetch('/api/vapi/webhook', {
        method: 'POST',
        body: JSON.stringify({
          simulated: true,
          language: lang,
          clientName: 'Cesar Gomez (Voz IA)',
          clientPhone: '+1 9512586016',
          clientEmail: 'cesar.gomez@autoflow.ai',
          serviceId: firstService?.id || '',
          serviceName: firstService?.name || (isLegal ? 'Consulta Legal Inicial' : isDental ? 'Valoración Odontológica' : 'Servicio General'),
          staffId: firstStaff?.id || null,
          staffName: firstStaff?.name || '',
          appointmentDate: dateStr,
          appointmentTime: timeStr,
          modality: isLegal ? 'phone_call' : 'in_person',
          caseType: isLegal ? 'Inmigración / Contratos' : isDental ? 'Valoración + Limpieza' : 'General',
          opposingParty: '',
          urgency: 'normal',
          callSummary: sampleSummary,
          recordingUrl: 'https://www2.cs.uic.edu/~i101/SoundFiles/BabyElephantWalk60.wav'
        })
      });

      if (res.ok) {
        triggerBrowserLocalNotification(
          `📞 Nueva Cita por Llamada IA (${lang.toUpperCase()})`,
          `Agendada para ${dateStr} a las ${timeStr}. Revisa Telegram y tu agenda.`
        );
        await fetchAgendaData();
        setAgendaFilter('today');
        alert(`📞 ¡Llamada IA (${lang === 'en' ? 'Inglés' : 'Español'}) simulada con éxito!

La cita ya quedó agendada en tu calendario a las ${timeStr} y se disparó el mensaje a Telegram con enlace a Google Calendar.`);
      } else {
        alert('Asegúrate de tener al menos 1 servicio creado en tu Catálogo para simular la reserva telefónica.');
      }
    } catch (e) {
      alert('Error simulando llamada IA.');
    } finally {
      setIsSimulatingVoiceCall(false);
    }
  };

  const handleSearchExpediente = async () => {
    if (!expedienteQuery) return;
    setIsSearchingExpediente(true); setClientExpedienteData(null); setIsEditingClientReview(false);
    try {
      const res = await apiFetch(`/api/clients/history/${expedienteQuery.trim()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          let safeClient = { ...data.client };
          if (typeof safeClient.metadata === 'string') {
             try { safeClient.metadata = JSON.parse(safeClient.metadata); } catch(e){}
          }
          setClientExpedienteData({ ...data, client: safeClient });
          setIsExpedienteExpanded(false); 
        } else { alert('No se encontró historial para esta búsqueda.'); }
      } else {
        alert('No se encontró historial para esta búsqueda.');
      }
    } catch (err) { alert('Error de red.'); } finally { setIsSearchingExpediente(false); }
  };

  // 🌟 Aplica la reacción pendiente (👍/👎) una vez el cliente fue verificado en Expediente 🌟
  useEffect(() => {
    if (!pendingReaction || !clientExpedienteData?.client || !currentExpedienteClientKey) return;
    const reaction = pendingReaction;
    setPendingReaction(null);
    const hasVisits =
      (Array.isArray(clientExpedienteData.serviceHistory) && clientExpedienteData.serviceHistory.length > 0) ||
      Number(clientExpedienteData.client?.loyaltyVisits || 0) > 0 ||
      Boolean(clientExpedienteData.client?.id);
    if (!hasVisits) {
      alert('Para calificar necesitas estar registrado en el negocio. ¡Te esperamos pronto!');
      return;
    }
    (async () => {
      await handleQuickClientReaction(reaction);
      alert(reaction === 'like' ? '👍 ¡Gracias! Registramos tu Me gustó.' : '👎 Gracias por tu opinión. Trabajaremos para mejorar.');
    })();
  }, [pendingReaction, clientExpedienteData, currentExpedienteClientKey]);

  const handleSearchVehicle = async () => {
    if (!searchPlate) return;
    setIsSearchingPlate(true);
    try {
      const res = await apiFetch(`/api/clients/vehicle/${searchPlate}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.vehicle) {
          setCarBrand(data.vehicle.brand || ''); setCarModel(data.vehicle.model || ''); setCarYear(data.vehicle.year || ''); setCarMileage(data.vehicle.currentMileage || ''); 
          if (data.client) { setClientName(toTitleCase(data.client.name || '')); setClientEmail(data.client.email || ''); setClientPhone(data.client.phone ? data.client.phone.replace(/^\+\d+\s*/, '') : ''); }
          setIsPlateSearched(true);
        } else { setIsPlateSearched(true); }
      }
    } catch (error) { setIsPlateSearched(true); } finally { setIsSearchingPlate(false); }
  };

  const handleBookFromExpediente = () => {
    if (!clientExpedienteData) return;
    if (clientExpedienteData.client) {
      setClientName(toTitleCase(clientExpedienteData.client.name || ''));
      setClientEmail(clientExpedienteData.client.email || '');
      setClientPhone(clientExpedienteData.client.phone ? clientExpedienteData.client.phone.replace(/^\+\d+\s*/, '') : '');
      
      const dbEarned = Number(clientExpedienteData.client.metadata?.earnedReferralDiscounts || 0);
      const cPhone = cleanPhoneDigits(clientExpedienteData.client.phone);
      const liveEarned = cPhone && pendingReferralsByPhone[cPhone] ? pendingReferralsByPhone[cPhone].length : 0;
      const totalEarned = Math.max(0, dbEarned + liveEarned);

      setBookingClientCoupons(totalEarned);
      setIsExistingClient((clientExpedienteData.serviceHistory && clientExpedienteData.serviceHistory.length > 0) || Number(clientExpedienteData.client.loyaltyVisits || 0) > 0);
      if (totalEarned > 0) {
        setQuickNotes(`(Aplica Descuento de Referidor - ${totalEarned} pendientes) `);
      }
    }
    if (clientExpedienteData.vehicle) {
      setSearchPlate(clientExpedienteData.vehicle.plate || '');
      setCarBrand(clientExpedienteData.vehicle.brand || '');
      setCarModel(clientExpedienteData.vehicle.model || '');
      setCarYear(clientExpedienteData.vehicle.year || '');
      setCarMileage(clientExpedienteData.vehicle.currentMileage || '');
    }
    setIsPlateSearched(true); setIsBookingModalOpen(true);
  };

  // ⚡ Búsqueda rápida "¡Ya estoy registrado!" directo dentro del modal de Nueva Reserva
  const handleQuickLookupInBooking = async () => {
    const rawQ = bookingLookupQuery.trim();
    if (!rawQ) {
      alert('Ingresa tu número de teléfono, correo o placa para autocompletar tus datos.');
      return;
    }
    setIsSearchingBookingClient(true);
    try {
      const cleanQ = rawQ.includes('@') ? rawQ.toLowerCase() : (cleanPhoneDigits(rawQ) || rawQ.toUpperCase());
      const res = await apiFetch(`/api/clients/history/${cleanQ}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.client) {
          setClientName(toTitleCase(data.client.name || ''));
          setClientEmail(data.client.email || '');
          const rawPhone = String(data.client.phone || '');
          const matchedCode = COUNTRY_CODES.find(c => rawPhone.startsWith(c.code));
          if (matchedCode) setBookingCountryCode(matchedCode.code);
          setClientPhone(rawPhone.replace(/^\+\d+\s*/, ''));

          let meta = data.client.metadata;
          if (typeof meta === 'string') {
            try { meta = JSON.parse(meta); } catch (_e) { meta = {}; }
          }
          const dbEarned = Number(meta?.earnedReferralDiscounts || 0);
          const cPhoneClean = cleanPhoneDigits(data.client.phone);
          const liveEarned = cPhoneClean && pendingReferralsByPhone[cPhoneClean] ? pendingReferralsByPhone[cPhoneClean].length : 0;
          const totalEarned = Math.max(0, dbEarned + liveEarned);

          const visitsCount = Number(data.client.loyaltyVisits ?? (Array.isArray(data.serviceHistory) ? data.serviceHistory.length : 0));
          setBookingMatchedVisits(visitsCount);
          setBookingClientCoupons(totalEarned);
          setIsExistingClient(true);
          setReferredByPhone('');
          setShowBookingQuickLookup(false);

          if (data.vehicle) {
            setSearchPlate(data.vehicle.plate || '');
            setCarBrand(toTitleCase(data.vehicle.brand || ''));
            setCarModel(toTitleCase(data.vehicle.model || ''));
            setCarYear(data.vehicle.year || '');
            setCarMileage(data.vehicle.currentMileage || '');
          }
          return;
        }
      }
      alert('No encontramos un registro previo con ese dato. Puedes llenar tus datos abajo para registrarte en esta reserva.');
    } catch (_e) {
      alert('Error al buscar tus datos.');
    } finally {
      setIsSearchingBookingClient(false);
    }
  };

  const handleBookService = async () => {
    if (!clientName.trim()) {
      alert(tr('Por favor completa tu Nombre Completo.', 'Please enter your Full Name.'));
      return;
    }
    if (!clientPhone.trim() || cleanPhoneDigits(clientPhone).length < 7) {
      alert(tr('Por favor ingresa un número de Teléfono válido.', 'Please enter a valid Phone Number.'));
      return;
    }
    if (!acceptedBookingTerms) {
      alert(tr('Debes leer y aceptar los Términos y Condiciones para confirmar tu reserva.', 'You must read and accept the Terms & Conditions to confirm your booking.'));
      return;
    }
    setIsSubmitting(true);
    try {
      const combinedDateTime = appointmentDate && appointmentTime ? `${appointmentDate}T${appointmentTime}:00Z` : new Date().toISOString();
      
      // 🌟 AUTO-ASIGNACIÓN DE ESTILISTA LIBRE SI ELIGIÓ "CUALQUIERA DISPONIBLE" 🌟
      let finalAssignedStaffId = selectedBookingStaff || null;
      if (!finalAssignedStaffId && appointmentDate && appointmentTime) {
        const freeMembersNow = getFreeStaffForSlot(appointmentDate, appointmentTime, selectedServiceType);
        if (freeMembersNow.length > 0) {
          finalAssignedStaffId = freeMembersNow[0].id;
        }
      }
      const assignedStaffObj = staffList.find(s => s.id === finalAssignedStaffId);

      let metadataObj: any = {};
      const formattedReferredBy = referredByPhone ? `${referredByCountryCode} ${referredByPhone.trim()}` : '';
      if (isAutomotive) {
        metadataObj = { carPlate: searchPlate, carBrand: toTitleCase(carBrand), carModel: toTitleCase(carModel), carYear, carMileage };
        if (formattedReferredBy && !isExistingClient) metadataObj.referredBy = formattedReferredBy;
      } else {
        if (formattedReferredBy && !isExistingClient) metadataObj.referredBy = formattedReferredBy;
      }
      if (appointmentDate) metadataObj.localDate = appointmentDate;
      if (appointmentTime) metadataObj.localTime = appointmentTime;
      metadataObj.modality = appointmentModality;
      if (caseOrTreatmentArea) metadataObj.caseType = toTitleCase(caseOrTreatmentArea.trim());
      if (opposingPartyOrInsurance) metadataObj.opposingParty = toTitleCase(opposingPartyOrInsurance.trim());
      if (urgencyLevel) metadataObj.urgency = urgencyLevel;
      if (finalAssignedStaffId) {
        metadataObj.assignedStaffId = finalAssignedStaffId;
        if (assignedStaffObj) metadataObj.assignedStaffName = toTitleCase(assignedStaffObj.name);
      }
        
      const formattedPhone = clientPhone.startsWith('+') ? clientPhone : `${bookingCountryCode} ${clientPhone.trim()}`;
      const response = await apiFetch('/api/appointments', {
        method: 'POST', 
        body: JSON.stringify({ 
          clientName: toTitleCase(clientName), 
          clientEmail, 
          clientPhone: formattedPhone, 
          serviceId: selectedServiceType, 
          staffId: finalAssignedStaffId, 
          appointmentDate: combinedDateTime, 
          notes: toTitleCase(quickNotes), 
          acceptedTerms: acceptedBookingTerms,
          deviceInfo: {
            os: Platform.OS,
            authProvider: bookingAuthMethod || 'manual'
          },
          metadata: JSON.stringify(metadataObj)
        })
      });
      if (response.ok) { alert(`¡Cita confirmada!`); setIsBookingModalOpen(false); setIsPlateSearched(false); setReferredByPhone(''); fetchAgendaData(); }
      else { alert('Error del servidor al confirmar cita.'); }
    } catch (error) { alert('Error agendando cita.'); } finally { setIsSubmitting(false); }
  };

  const exportToCSV = async () => {
    const headers = ["Fecha", "Identificador", "Beneficio / Promo", "Cliente", "Servicio", "Personal", "Total Cobrado"];
    const csvRows = reportsData.map(r => {
      const promoInfo = getReportDiscountInfo(r, servicesList);
      const dateFormatted = r.date ? new Date(r.date).toLocaleDateString('es-ES') : (r.createdAt ? new Date(r.createdAt).toLocaleDateString('es-ES') : 'N/A');
      return `${dateFormatted},${isAutomotive ? (r.plate || 'N/A') : (r.id ? r.id.slice(0,6).toUpperCase() : 'N/A')},${promoInfo ? promoInfo.label : 'Tarifa Regular'},${r.clientName || ''},${r.service || ''},${r.mechanicName || ''},$${r.cost || r.finalCost || 0}`;
    });
    const rawCsv = headers.join(",") + "\n" + csvRows.join("\n");

    if (Platform.OS === 'web') {
      const csvContent = "data:text/csv;charset=utf-8," + rawCsv;
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.setAttribute("download", `Reporte_AutoFlow_${reportStartDate}_al_${reportEndDate}.csv`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
      return;
    }

    try {
      await Share.share({
        title: `Reporte CSV (${reportStartDate} al ${reportEndDate})`,
        message: rawCsv,
      });
    } catch (_e) {}
  };

  // 🖨️ Generador de archivo PDF real en memoria (Estándar PDF 1.4 nativo sin librerías externas)
  const buildRealPdfBase64 = (linesArr: string[]): string => {
    const sanitizePdfText = (str: string) =>
      String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, ' ')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');

    const maxLines = 44;
    const safeLines = linesArr.slice(0, maxLines);
    let streamContent = 'BT\n/F1 10 Tf\n50 750 Td\n15 TL\n';
    safeLines.forEach((line, idx) => {
      const clean = sanitizePdfText(line);
      if (idx === 0) {
        streamContent += `/F1 13 Tf (${clean}) Tj\n/F1 10 Tf\n`;
      } else {
        streamContent += `T* (${clean}) Tj\n`;
      }
    });
    streamContent += 'ET';

    const objs = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
      `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    ];

    let pdfStr = '%PDF-1.4\n';
    const offsets: number[] = [];
    objs.forEach((o) => {
      offsets.push(pdfStr.length);
      pdfStr += o;
    });
    const xrefStart = pdfStr.length;
    pdfStr += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((off) => {
      pdfStr += `${String(off).padStart(10, '0')} 00000 n \n`;
    });
    pdfStr += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let b64 = '';
    for (let i = 0; i < pdfStr.length; i += 3) {
      const b0 = pdfStr.charCodeAt(i) & 0xff;
      const b1 = i + 1 < pdfStr.length ? pdfStr.charCodeAt(i + 1) & 0xff : 0;
      const b2 = i + 2 < pdfStr.length ? pdfStr.charCodeAt(i + 2) & 0xff : 0;
      b64 += chars[b0 >> 2];
      b64 += chars[((b0 & 3) << 4) | (b1 >> 4)];
      b64 += i + 1 < pdfStr.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
      b64 += i + 2 < pdfStr.length ? chars[b2 & 63] : '=';
    }
    return `data:application/pdf;base64,${b64}`;
  };

  const exportToPDF = async () => {
    if (Platform.OS === 'web') {
      setIsPrinting(true);
      setTimeout(() => { window.print(); setIsPrinting(false); }, 800);
      return;
    }

    const textLines = reportsData.map((r: any, idx: number) => {
      const dateStr = r.date ? new Date(r.date).toLocaleDateString('es-ES') : (r.createdAt ? new Date(r.createdAt).toLocaleDateString('es-ES') : 'N/A');
      const promoInfo = getReportDiscountInfo(r, servicesList);
      return `${idx + 1}. [${dateStr}] ${toTitleCase(r.clientName || 'Cliente')} - ${toTitleCase(r.service || 'Servicio')} ($${Number(r.cost || r.finalCost || 0).toLocaleString('en-US')}) - ${promoInfo ? promoInfo.label : 'Tarifa Regular'}`;
    });

    const reportLines = [
      `REPORTE OFICIAL DE SERVICIOS - ${(tenantInfo?.name || 'AutoFlow').toUpperCase()}`,
      `Periodo: ${reportStartDate} al ${reportEndDate}`,
      `Total de Ingresos: $${totalRevenue.toLocaleString('en-US')}   |   Servicios Completados: ${reportsData.length}`,
      `-------------------------------------------------------------------------`,
      ...(textLines.length > 0 ? textLines : ['Sin registros en este rango de fechas.']),
    ];

    const summaryReport = reportLines.join('\n');
    const pdfDataUri = buildRealPdfBase64(reportLines);

    try {
      if (Platform.OS === 'ios') {
        // En iOS pasamos UNICAMENTE `url: pdfDataUri` (sin `message`) para que iOS comparta el PDF real y nunca lo convierta en texto
        await Share.share({
          title: `Reporte_${(tenantInfo?.name || 'AutoFlow').replace(/\s+/g, '_')}_${reportStartDate}.pdf`,
          url: pdfDataUri,
        });
      } else {
        await Share.share({
          title: `Reporte Oficial ${tenantInfo?.name || 'AutoFlow'}`,
          message: summaryReport,
        });
      }
    } catch (_err) {
      try {
        await Share.share({
          title: `Reporte Oficial ${tenantInfo?.name || 'AutoFlow'}`,
          message: summaryReport,
        });
      } catch (_e2) {}
    }
  };

  const handleAddStaff = async () => {
    if (!newStaffName || (!selectedStaffRole && !customStaffRole)) return;
    const finalRole = selectedStaffRole === 'custom' ? toTitleCase(customStaffRole.trim()) : selectedStaffRole;
    const finalName = toTitleCase(newStaffName.trim());
    try {
      const res = await apiFetch('/api/staff', { method: 'POST', body: JSON.stringify({ name: finalName, role: finalRole }) });
      if (res.ok) {
        const data = await res.json();
        setStaffList([...staffList, data.member || { id: Date.now().toString(), name: finalName, role: finalRole, isActive: true }]);
        setNewStaffName(''); setSelectedStaffRole(''); setCustomStaffRole(''); setIsStaffRoleDropdownOpen(false);
      }
    } catch (err) { alert('Error guardando staff'); }
  };

  const toggleStaffStatus = async (id: string, currentStatus: boolean) => {
    try {
      const nextStatus = !currentStatus;
      await apiFetch(`/api/staff/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: nextStatus }) });
      setStaffList(staffList.map(s => s.id === id ? { ...s, isActive: nextStatus } : s));
    } catch (err) { console.error(err); }
  };

  // 🔐 Actualizar el Código PIN de Empleados en tiempo real (revoca acceso inmediato al personal que se retira)
  const handleSaveStaffPin = async () => {
    const cleanPin = staffAccessPin.trim().replace(/\D/g, '');
    if (cleanPin.length < 4 || cleanPin.length > 6) {
      alert(tr('El código PIN de empleados debe tener entre 4 y 6 números.', 'The employee PIN must be between 4 and 6 digits.'));
      return;
    }
    setIsSavingStaffPin(true);
    try {
      const updatedLoyalty: LoyaltyConfig = {
        ...localLoyalty,
        reviews: reviewsList,
        campaigns: pushCampaignsList,
        vapiConfig,
        telegramConfig,
        staffPortalPin: cleanPin,
      };
      const res = await apiFetch('/api/tenants/config', {
        method: 'PUT',
        body: JSON.stringify({
          portalPin: cleanPin,
          loyaltyConfig: updatedLoyalty,
        }),
      });
      if (res.ok) {
        setStaffAccessPin(cleanPin);
        setLocalLoyalty(updatedLoyalty);
        setTenantInfo((prev) => (prev ? { ...prev, loyaltyConfig: updatedLoyalty, portalPin: cleanPin } as any : prev));
        alert(
          tr(
            `🔒 ¡Código de acceso actualizado a "${cleanPin}"!\n\nEl código anterior quedó invalidado de inmediato. Solo quienes tengan este nuevo PIN podrán ver las citas y cerrar órdenes.`,
            `🔒 Staff access code updated to "${cleanPin}"!\n\nThe previous code is now invalid.`
          )
        );
      } else {
        alert(tr('No se pudo actualizar el PIN en el servidor.', 'Could not update PIN on the server.'));
      }
    } catch (_e) {
      alert(tr('Error de red al guardar el nuevo PIN.', 'Network error saving new PIN.'));
    } finally {
      setIsSavingStaffPin(false);
    }
  };

  const handleToggleServiceStatus = async (id: string, currentStatus: boolean) => {
    try {
      const nextStatus = !currentStatus;
      await apiFetch(`/api/services/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: nextStatus }) });
      setServicesList(servicesList.map(s => s.id === id ? { ...s, isActive: nextStatus } : s));
    } catch (err) { console.error('Error:', err); }
  };

  const handleNavigate = (view: 'servicios' | 'expediente' | 'mecanico') => { setActiveView(view); setIsMobileMenuOpen(false); if (view !== 'expediente') setPendingReaction(null); };
  const startReactionFlow = (type: 'like' | 'dislike') => { setPendingReaction(type); handleNavigate('expediente'); };

  // Llegada desde el directorio o desde "Soy un Negocio" (Owner Portal):
  // /{tenantId}?view=mecanico&role=owner&section=catalogo
  useEffect(() => {
    const v = Array.isArray(viewParam) ? viewParam[0] : viewParam;
    const r = Array.isArray(reactionParam) ? reactionParam[0] : reactionParam;
    const rl = Array.isArray(roleParam) ? roleParam[0] : roleParam;
    const sec = Array.isArray(sectionParam) ? sectionParam[0] : sectionParam;

    if (v === 'expediente') setActiveView('expediente');
    if (v === 'mecanico') {
      setActiveView('mecanico');
      if (rl === 'owner') {
        setIsMechanicAuth(true);
        setPortalAccessRole('owner');
      }
      if (sec) {
        setAgendaFilter(sec as any);
      }
    }
    if (r === 'like' || r === 'dislike') setPendingReaction(r);
  }, [viewParam, reactionParam, roleParam, sectionParam]);

  // 🚩 Reportar contenido: abre el modal / cierra / envía al backend (que avisa por Telegram)
  const openReport = (target: ReportTarget) => {
    setReportReason('');
    setReportDetails('');
    setReportContact('');
    setReportTarget(target);
  };
  const closeReport = () => { setReportTarget(null); };

  const handleSubmitReport = async () => {
    if (!reportTarget) return;
    if (!reportReason) { alert('Selecciona el motivo del reporte.'); return; }
    setIsSendingReport(true);
    try {
      const reasonObj = REPORT_REASONS.find((r) => r.key === reportReason);
      const res = await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: tenantInfo?.id || (Array.isArray(tenantId) ? tenantId[0] : String(tenantId || '')),
          tenantName: tenantInfo?.name || '',
          targetType: reportTarget.type,
          targetId: reportTarget.id,
          targetTitle: reportTarget.title,
          targetExcerpt: reportTarget.excerpt || '',
          reason: reportReason,
          reasonLabel: reasonObj?.label || reportReason,
          details: reportDetails.trim(),
          reporterContact: reportContact.trim(),
          pageUrl: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : '',
          createdAt: new Date().toISOString()
        })
      });
      if (res.ok) {
        setReportedKeys((prev) => [...prev, `${reportTarget.type}:${reportTarget.id}`]);
        closeReport();
        alert('✅ Gracias. Recibimos tu reporte y nuestro equipo lo revisará.');
      } else {
        alert('No pudimos enviar el reporte. Intenta de nuevo en unos minutos.');
      }
    } catch (e) {
      alert('Error de red al enviar el reporte.');
    } finally {
      setIsSendingReport(false);
    }
  };

  const renderReportButton = (target: ReportTarget, compact = false, extraStyle: any = {}) => {
    const already = reportedKeys.includes(`${target.type}:${target.id}`);
    return (
      <TouchableOpacity
        disabled={already}
        onPress={() => openReport(target)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Reportar contenido"
        style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: already ? 0.6 : 1 }, compact ? { width: 28, height: 28, borderRadius: 14 } : {}, extraStyle]}
      >
        <Feather name="flag" size={compact ? 13 : 14} color={already ? '#10B981' : tColor.muted} />
        {!compact ? (
          <Text style={{ color: already ? '#10B981' : tColor.muted, fontSize: 12.5, fontWeight: '700' }}>
            {already ? 'Reporte enviado' : 'Reportar publicación'}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };
  const activeOrdersList = useMemo(() => {
    const allUnique = getMergedUniqueAppointments(todayOrders, upcomingOrders);
    const nowLocal = new Date();
    const todayLocalStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
    if (agendaFilter === 'today') {
      return allUnique.filter((o: any) => {
        const dStr = o.metadata?.localDate || (o.appointmentDate ? String(o.appointmentDate).split('T')[0] : '');
        return dStr === todayLocalStr;
      });
    }
    if (agendaFilter === 'upcoming') {
      return allUnique.filter((o: any) => {
        const dStr = o.metadata?.localDate || (o.appointmentDate ? String(o.appointmentDate).split('T')[0] : '');
        return dStr >= todayLocalStr;
      });
    }
    return todayOrders;
  }, [agendaFilter, todayOrders, upcomingOrders]);

  const selectedOrderPhoneClean = cleanPhoneDigits(selectedOrder?.clientPhone);
  const selectedOrderEarnedCoupons = Number(selectedOrder?.clientMetadata?.earnedReferralDiscounts || 0);
  const selectedOrderLiveReferrals = selectedOrderPhoneClean ? (pendingReferralsByPhone[selectedOrderPhoneClean] || []) : [];
  const totalAvailableReferralCouponsPOS = Math.max(0, selectedOrderEarnedCoupons + selectedOrderLiveReferrals.length);

  const activeMonthTooltipData = hoveredMonthIdx !== null ? monthlyTrafficStats.items[hoveredMonthIdx] : null;

  return (
    <View style={[styles.root, { backgroundColor: tColor.bg }]}>
      <Image key={`${bgImage}-${theme}`} source={{ uri: bgImage }} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: theme === 'dark' ? 0.15 : 0.05 } as any]} resizeMode="cover" />
      <WebStyles theme={theme} tColor={tColor} brandColor={brandColor} />

      {/* 🌟 MENÚ SUPERIOR RESPONSIVE VERTICAL (WEB + iOS SAFE AREA + ANDROID STATUS BAR) 🌟 */}
      <View style={[styles.header, { 
        position: Platform.OS === 'web' ? ('sticky' as any) : 'relative', top: 0, zIndex: 200,
        backgroundColor: tColor.nav, backdropFilter: Platform.OS === 'web' ? 'blur(16px)' : 'none',
        paddingHorizontal: isMobile ? 14 : 40,
        paddingTop: Platform.OS === 'ios' ? 56 : Platform.OS === 'android' ? 42 : (isMobile ? 12 : 18),
        paddingBottom: isMobile ? 12 : 18,
        borderBottomWidth: 1, borderBottomColor: tColor.border, display: isPrinting ? 'none' : 'flex',
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        gap: isMobile ? 8 : 16
      }]}>
        
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => tenantInfo?.logoUrl ? setExpandedImage({ path: tenantInfo.logoUrl, alt: tenantInfo?.name || 'Logo' }) : handleNavigate('servicios')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 10 : 12, flex: 1, minWidth: 0 }}
        >
          {tenantInfo?.logoUrl ? (
             <View style={{ width: isMobile ? 42 : 48, height: isMobile ? 42 : 48, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: brandColor, backgroundColor: '#000', flexShrink: 0 }}>
               <PrivateSupabaseImage path={tenantInfo.logoUrl} alt={tenantInfo.name || 'Logo'} />
             </View>
          ) : (
             <View style={{ backgroundColor: brandColor, width: isMobile ? 42 : 48, height: isMobile ? 42 : 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
               <Text style={{ color: '#FFF', fontWeight: '900', fontSize: isMobile ? 18 : 20 }}>{tenantInfo?.name ? tenantInfo.name.charAt(0).toUpperCase() : 'A'}</Text>
             </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: isMobile ? 16 : 20, fontWeight: '900', color: tColor.text }} numberOfLines={1} ellipsizeMode="tail">
              {tenantInfo?.name || 'AutoFlow'}
            </Text>
          </View>
        </TouchableOpacity>

        {!isMobile ? (
          <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center' }}>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 }} onPress={() => handleNavigate('servicios')}>
              <Feather name="calendar" size={15} color={activeView === 'servicios' ? brandColor : tColor.muted} />
              <Text style={{ color: activeView === 'servicios' ? brandColor : tColor.text, fontWeight: '800' }}>{t.navBookings}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 }} onPress={() => handleNavigate('expediente')}>
              <Feather name="file-text" size={15} color={activeView === 'expediente' ? brandColor : tColor.muted} />
              <Text style={{ color: activeView === 'expediente' ? brandColor : tColor.text, fontWeight: '800' }}>{t.navRecords}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 }} onPress={() => handleNavigate('mecanico')}>
              <Feather name="sliders" size={15} color={activeView === 'mecanico' ? brandColor : tColor.muted} />
              <Text style={{ color: activeView === 'mecanico' ? brandColor : tColor.text, fontWeight: '800' }}>{t.navPortal}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 7 : 10, flexShrink: 0 }}>
          {/* ⚙️ Botón Único de Configuración (Idioma ES/EN + Tema Light/Dark) — Idéntico al Directorio */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setIsMobileMenuOpen(false);
              setIsSettingsOpen((prev) => !prev);
            }}
            accessibilityLabel={tr('Abrir preferencias de idioma y apariencia', 'Open language and appearance settings')}
            style={{
              height: isMobile ? 36 : 42,
              paddingHorizontal: isMobile ? 9 : 12,
              borderRadius: isMobile ? 10 : 12,
              backgroundColor: isSettingsOpen ? `${brandColor}22` : tColor.input,
              borderWidth: 1.5,
              borderColor: isSettingsOpen ? brandColor : tColor.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Feather
              name="settings"
              size={15}
              color={isSettingsOpen ? brandColor : tColor.text}
            />
            <View
              style={{
                paddingHorizontal: 5,
                paddingVertical: 1.5,
                borderRadius: 6,
                backgroundColor: isSettingsOpen ? brandColor : tColor.border,
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
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, {
              backgroundColor: tColor.input,
              borderColor: tColor.border,
              flexDirection: 'row',
              gap: 5,
              height: isMobile ? 36 : 42,
              paddingVertical: 0,
              paddingHorizontal: isMobile ? 10 : 18,
              borderRadius: isMobile ? 10 : 12
            }]}
            onPress={() => {
              setIsSettingsOpen(false);
              if (router.canGoBack()) {
                router.back();
              } else {
                router.push(`/?category=${dbNiche}`);
              }
            }}
          >
            <Feather name="arrow-left" size={14} color={tColor.text} />
            <Text style={[styles.secondaryButtonText, { color: tColor.text, fontSize: isMobile ? 12.5 : 14 }]}>{t.navBack}</Text>
          </TouchableOpacity>

          {isMobile ? (
            <TouchableOpacity
              style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: isMobileMenuOpen ? brandColor : tColor.border, borderRadius: 10 }}
              onPress={() => {
                setIsSettingsOpen(false);
                setIsMobileMenuOpen(!isMobileMenuOpen);
              }}
            >
              <Feather name={isMobileMenuOpen ? 'x' : 'menu'} size={18} color={isMobileMenuOpen ? '#FFFFFF' : tColor.text} />
            </TouchableOpacity>
          ) : null}
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
              backgroundColor: 'rgba(2, 6, 23, 0.5)',
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
                    backgroundColor: `${brandColor}20`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="sliders" size={14} color={brandColor} />
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
                      backgroundColor: active ? brandColor : 'transparent',
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
                      backgroundColor: active ? brandColor : 'transparent',
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

      {/* 📱 MENÚ DESPLEGABLE MÓVIL CON BACKDROP Y SAFE AREA PARA iOS / ANDROID 📱 */}
      {isMobile && isMobileMenuOpen ? (
        <>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setIsMobileMenuOpen(false)}
            style={{
              position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
              top: Platform.OS === 'ios' ? 108 : Platform.OS === 'android' ? 94 : 64,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(2, 6, 23, 0.65)',
              backdropFilter: Platform.OS === 'web' ? 'blur(6px)' : undefined,
              zIndex: 240
            } as any}
          />
          <View style={{
            position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
            top: Platform.OS === 'ios' ? 112 : Platform.OS === 'android' ? 98 : 68,
            left: 14,
            right: 14,
            maxHeight: '78vh' as any,
            backgroundColor: theme === 'dark' ? '#0B0F17' : '#FFFFFF',
            zIndex: 250,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: tColor.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 16 },
            shadowOpacity: 0.45,
            shadowRadius: 28,
            overflow: 'hidden'
          }}>
          <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ padding: 16 }}>
            <Text style={{ color: tColor.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.8 }}>
              {t.navMainTitle}
            </Text>
            <TouchableOpacity style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: tColor.border, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => handleNavigate('servicios')}>
              <Feather name="calendar" size={18} color={activeView === 'servicios' ? brandColor : tColor.text} />
              <Text style={{ color: activeView === 'servicios' ? brandColor : tColor.text, fontWeight: 'bold', fontSize: 15 }}>{t.navBookings}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: tColor.border, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => handleNavigate('expediente')}>
              <Feather name="file-text" size={18} color={activeView === 'expediente' ? brandColor : tColor.text} />
              <Text style={{ color: activeView === 'expediente' ? brandColor : tColor.text, fontWeight: 'bold', fontSize: 15 }}>{t.navRecords}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 14, borderBottomWidth: isMechanicAuth ? 1 : 0, borderBottomColor: tColor.border, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => handleNavigate('mecanico')}>
              <Feather name="sliders" size={18} color={activeView === 'mecanico' ? brandColor : tColor.text} />
              <Text style={{ color: activeView === 'mecanico' ? brandColor : tColor.text, fontWeight: 'bold', fontSize: 15 }}>{t.navPortal}</Text>
            </TouchableOpacity>

            {isMechanicAuth ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ color: brandColor, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.8 }}>
                  {t.navPortalSections}
                </Text>
                {(portalAccessRole === 'owner'
                  ? [
                      { key: 'today', label: t.tabOrders, icon: 'check-square' },
                      { key: 'upcoming', label: t.tabUpcoming, icon: 'calendar' },
                      { key: 'reports', label: t.tabReports, icon: 'bar-chart-2' },
                      { key: 'staff', label: `${t.tabStaff} (${staffTerm})`, icon: 'users' },
                      { key: 'catalogo', label: t.tabCatalog, icon: 'tag' },
                      { key: 'horarios', label: t.tabHours, icon: 'clock' },
                      { key: 'portafolio', label: t.tabPortfolio, icon: 'image' },
                      { key: 'fidelidad', label: t.tabLoyalty, icon: 'gift' },
                      { key: 'recepcion_ia', label: t.tabAiReception, icon: 'phone-call' },
                    ]
                  : [
                      { key: 'today', label: t.tabOrders, icon: 'check-square' },
                      { key: 'upcoming', label: t.tabUpcoming, icon: 'calendar' },
                    ]
                ).map((sec) => {
                  const isActiveSec = activeView === 'mecanico' && agendaFilter === sec.key;
                  return (
                    <TouchableOpacity
                      key={sec.key}
                      onPress={() => {
                        setActiveView('mecanico');
                        setAgendaFilter(sec.key as any);
                        setIsMobileMenuOpen(false);
                      }}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        marginBottom: 4,
                        backgroundColor: isActiveSec ? `${brandColor}20` : 'transparent',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10
                      }}
                    >
                      <Feather name={sec.icon as any} size={16} color={isActiveSec ? brandColor : tColor.muted} />
                      <Text style={{ color: isActiveSec ? brandColor : tColor.text, fontWeight: isActiveSec ? '900' : '600', fontSize: 14 }}>
                        {sec.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: tColor.border }}>
                  <TouchableOpacity
                    onPress={() => { setIsMobileMenuOpen(false); openSupportModal(); }}
                    style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: 'rgba(56, 189, 248, 0.14)', borderWidth: 1, borderColor: '#38BDF8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Feather name="headphones" size={15} color="#38BDF8" />
                    <Text style={{ color: '#38BDF8', fontWeight: '900', fontSize: 13 }}>{t.navSupport}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleStaffLogout}
                    style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: 'rgba(239, 68, 68, 0.14)', borderWidth: 1, borderColor: '#EF4444', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Feather name="log-out" size={15} color="#EF4444" />
                    <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 13 }}>{t.navLogout}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
        </>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.contentArea,
          {
            paddingHorizontal: isMobile ? 16 : 40,
            paddingTop: isMobile ? 16 : 24,
            paddingBottom: isMobile ? 48 : 64
          }
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ============================================================== */}
        {/* VISTA 1: B2C SERVICIOS, PORTAFOLIO Y RESEÑAS VERIFICADAS       */}
        {/* ============================================================== */}
        {activeView === 'servicios' ? (
          <View style={{ width: '100%', minWidth: 0 }}>
            {/* 🖼️ 1. TARJETA HERO ORDENADA: IMAGEN ARRIBA + TEXTO DEBAJO DE LA IMAGEN (CERO CRUCE EN MÓVIL) 🖼️ */}
            <View
              style={{
                width: '100%',
                borderRadius: isMobile ? 22 : 28,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: tColor.border,
                backgroundColor: tColor.card,
                marginBottom: 16,
                ...Platform.select({
                  web: { boxShadow: theme === 'dark' ? '0 22px 48px -12px rgba(0,0,0,0.7)' : '0 18px 36px -10px rgba(15,23,42,0.18)' } as any,
                  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 20 },
                  android: { elevation: 10 }
                })
              }}
            >
              {/* Bloque Superior: Imagen con degradado suave y solo Categoría (izq) + Guardar Favorito (der) */}
              <View style={{ width: '100%', height: isMobile ? 210 : 270, position: 'relative', backgroundColor: '#05070C' }}>
                {tenantInfo?.logoUrl ? (
                  <TouchableOpacity
                    activeOpacity={0.95}
                    onPress={() => setExpandedImage({ path: tenantInfo.logoUrl!, alt: tenantInfo?.name || 'Portada' })}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
                  >
                    <PrivateSupabaseImage path={tenantInfo.logoUrl} alt={tenantInfo?.name || 'Portada'} />
                  </TouchableOpacity>
                ) : (
                  <Image
                    source={{ uri: bgImage }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                )}

                <BottomHalfGradientOverlay heightPct="38%" baseColor="18, 22, 28" />

                {/* Fila superior limpia: Solo Categoría a la izquierda y Corazón de Favoritos + Ampliar a la derecha */}
                <View
                  style={{
                    position: 'absolute',
                    top: isMobile ? 12 : 18,
                    left: isMobile ? 12 : 20,
                    right: isMobile ? 12 : 20,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    zIndex: 10
                  }}
                >
                  <View
                    style={{
                      backgroundColor: 'rgba(15, 23, 42, 0.78)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.22)',
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 20,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      ...(Platform.OS === 'web' ? { backdropFilter: 'blur(12px)' } : {}) as any
                    }}
                  >
                    <Feather
                      name={isLegal ? 'briefcase' : isDental ? 'heart' : isBarbershop ? 'scissors' : isSpa ? 'sun' : 'tool'}
                      size={12}
                      color={brandColor}
                    />
                    <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '900' }}>
                      {isLegal
                        ? tr('Firma Legal', 'Law Firm')
                        : isDental
                          ? tr('Clínica Dental', 'Dental Clinic')
                          : isBarbershop
                            ? tr('Barbería & Estilo', 'Barbershop')
                            : isSpa
                              ? tr('Spa & Bienestar', 'Spa & Wellness')
                              : tr('Taller Especializado', 'Auto Service')}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {/* Único botón Corazón para guardar el negocio en Mis Favoritos */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => toggleFavoriteItem(`tenant:${safeTenantId}`)}
                      style={{
                        backgroundColor: favoriteIds.includes(`tenant:${safeTenantId}`)
                          ? 'rgba(239, 68, 68, 0.24)'
                          : 'rgba(15, 23, 42, 0.78)',
                        borderWidth: 1,
                        borderColor: favoriteIds.includes(`tenant:${safeTenantId}`)
                          ? '#EF4444'
                          : 'rgba(255,255,255,0.22)',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 20,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(12px)' } : {}) as any
                      }}
                    >
                      <Ionicons
                        name={favoriteIds.includes(`tenant:${safeTenantId}`) ? 'heart' : 'heart-outline'}
                        size={15}
                        color={favoriteIds.includes(`tenant:${safeTenantId}`) ? '#EF4444' : '#FFFFFF'}
                      />
                      <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' }}>
                        {favoriteIds.includes(`tenant:${safeTenantId}`)
                          ? tr('En Favoritos', 'Saved')
                          : tr('Guardar', 'Save')}
                      </Text>
                    </TouchableOpacity>

                    {tenantInfo?.logoUrl ? (
                      <TouchableOpacity
                        onPress={() => setExpandedImage({ path: tenantInfo.logoUrl!, alt: tenantInfo?.name || 'Portada' })}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: 'rgba(15, 23, 42, 0.75)',
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.22)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          ...(Platform.OS === 'web' ? { backdropFilter: 'blur(12px)' } : {}) as any
                        }}
                      >
                        <Feather name="maximize-2" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Bloque Inferior: TEXTO DEBAJO DE LA IMAGEN (Ordenado, limpio y sin cruzarse en móvil) */}
              <View style={{ padding: isMobile ? 18 : 26, backgroundColor: tColor.card }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  {tenantInfo?.logoUrl ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setExpandedImage({ path: tenantInfo.logoUrl!, alt: tenantInfo?.name || 'Logo' })}
                      style={{
                        width: isMobile ? 46 : 54,
                        height: isMobile ? 46 : 54,
                        borderRadius: 14,
                        overflow: 'hidden',
                        borderWidth: 2,
                        borderColor: brandColor,
                        backgroundColor: '#000',
                        flexShrink: 0
                      }}
                    >
                      <PrivateSupabaseImage path={tenantInfo.logoUrl} alt={tenantInfo?.name || 'Logo'} />
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={{
                        width: isMobile ? 46 : 54,
                        height: isMobile ? 46 : 54,
                        borderRadius: 14,
                        backgroundColor: brandColor,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 2,
                        borderColor: 'rgba(255,255,255,0.35)',
                        flexShrink: 0
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: isMobile ? 20 : 24 }}>
                        {tenantInfo?.name ? tenantInfo.name.charAt(0).toUpperCase() : 'A'}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text
                        style={{ color: tColor.text, fontSize: isMobile ? 18 : 22, fontWeight: '900' }}
                        numberOfLines={1}
                      >
                        {tenantInfo?.name || 'AutoFlow'}
                      </Text>
                      <Ionicons name="checkmark-circle" size={17} color={brandColor} />
                    </View>
                    <Text style={{ color: tColor.muted, fontSize: isMobile ? 12 : 13, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
                      {clientDistanceMiles
                        ? `📍 ${t.distancePrefix} ${clientDistanceMiles} ${t.distanceSuffix} ${tenantInfo?.name || 'AutoFlow'}`
                        : tr('Agenda Abierta 24/7 en Tiempo Real', '24/7 Real-Time Online Booking')}
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: isMobile ? 24 : 32, fontWeight: '900', color: tColor.text, marginBottom: 4, lineHeight: isMobile ? 29 : 38 }}>
                  {t.heroTitle1} <Text style={{ color: brandColor }}>{t.heroTitle2}</Text>
                </Text>
                <Text style={{ color: tColor.muted, fontSize: isMobile ? 13 : 14, lineHeight: isMobile ? 19 : 21 }}>
                  {t.heroSubtitle}
                </Text>
              </View>
            </View>

            {/* ⭐ 2. BARRA INTERACTIVA DE CALIFICACIÓN Y REACCIONES RÁPIDAS (ÚNICO LUGAR DE ESTRELLAS Y LIKES) ⭐ */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => handleNavigate('expediente')}
              style={{
                backgroundColor: tColor.card,
                borderWidth: 1,
                borderColor: tColor.border,
                paddingHorizontal: isMobile ? 14 : 20,
                paddingVertical: isMobile ? 12 : 14,
                borderRadius: 18,
                marginBottom: 14,
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                justifyContent: 'space-between',
                gap: 12
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: `${brandColor}18`, borderWidth: 1, borderColor: `${brandColor}40`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Feather name="award" size={18} color={brandColor} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="star" size={14} color="#F59E0B" />
                      <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 14 }}>{ratingSummary.avg}</Text>
                    </View>
                    <TouchableOpacity onPress={() => startReactionFlow('like')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                      <Feather name="thumbs-up" size={12} color="#10B981" />
                      <Text style={{ color: '#10B981', fontWeight: '900', fontSize: 12.5 }}>{ratingSummary.likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => startReactionFlow('dislike')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                      <Feather name="thumbs-down" size={12} color="#EF4444" />
                      <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 12.5 }}>{ratingSummary.dislikes}</Text>
                    </TouchableOpacity>
                    <Text style={{ color: tColor.muted, fontSize: 11, fontWeight: 'bold' }}>({ratingSummary.count})</Text>
                  </View>
                  <Text style={{ color: brandColor, fontSize: 11.5, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
                    {t.ratePrompt}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* 🌟 3. BANNER DE CAMPAÑA PUSH ACTIVA (REUBICADO DEBAJO DEL HERO Y COMPACTO PARA NO QUITAR PROTAGONISMO) 🌟 */}
            {pushCampaignsList.filter(c => c.is_active !== false).slice(0, 1).map((activeCamp) => (
              <View key={`${activeCamp.id}-banner`} style={{ backgroundColor: 'rgba(255, 94, 0, 0.09)', borderWidth: 1, borderColor: `${brandColor}66`, borderRadius: 16, paddingHorizontal: isMobile ? 14 : 18, paddingVertical: isMobile ? 12 : 13, marginBottom: isMobile ? 24 : 32, flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: 10, position: 'relative' }}>
                <View style={{ flex: 1, paddingRight: isMobile ? 24 : 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                    <View style={{ backgroundColor: brandColor, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>{t.promoBadge}</Text>
                    </View>
                    <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 14 }}>{toTitleCase(activeCamp.title)}</Text>
                  </View>
                  <Text style={{ color: tColor.muted, fontSize: 12.5, lineHeight: 17 }}>{toTitleCase(activeCamp.message)}</Text>
                </View>
                {renderReportButton({ type: 'campaign', id: activeCamp.id, title: activeCamp.title, excerpt: String(activeCamp.message || '').slice(0, 200) }, true, { position: 'absolute', top: 8, right: 8 })}
                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor, paddingVertical: 9, paddingHorizontal: 15, borderRadius: 10 }]} onPress={() => { setIsBookingModalOpen(true); setIsPlateSearched(false); }}>
                  <Text style={[styles.primaryButtonText, { fontSize: 12.5 }]}>{t.promoClaim}</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={[styles.bentoGrid, { gap: isMobile ? 16 : 24 }]}>
              {activeCatalogServices.length > 0 ? activeCatalogServices.map((srv, idx) => (
                <View key={`${srv.id}-${idx}`} style={[styles.flexCard, { backgroundColor: tColor.card, borderColor: tColor.border, padding: 0, overflow: 'hidden', minWidth: isMobile ? '100%' : 300 }]}>
                  {srv.imageUrl ? (
                    <TouchableOpacity style={{ width: '100%', height: 205, backgroundColor: tColor.input, position: 'relative' }} onPress={() => setExpandedImage({ path: srv.imageUrl!, alt: srv.name })}>
                       <PrivateSupabaseImage path={srv.imageUrl} alt={srv.name} />
                       <BottomHalfGradientOverlay heightPct="36%" baseColor="18, 22, 28" />
                    </TouchableOpacity>
                  ) : null}
                  {renderReportButton({ type: 'service', id: srv.id, title: srv.name, excerpt: String(srv.description || '').slice(0, 200) }, true, { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', zIndex: 5 })}
                  <View style={{ padding: isMobile ? 20 : 28 }}>
                    <Text style={{ fontSize: isMobile ? 18 : 20, fontWeight: '800', color: tColor.text, marginBottom: 10, paddingRight: 28 }}>{toTitleCase(srv.name)}</Text>
                    {srv.description ? (
                      <Text style={{ color: tColor.muted, marginBottom: 20, lineHeight: 21, fontSize: 13.5 }}>{toSentenceCase(srv.description)}</Text>
                    ) : (
                      <Text style={{ color: tColor.muted, marginBottom: 20, fontSize: 13.5 }}>⏱️ {srv.durationMinutes || 30} {tr('minutos', 'minutes')}</Text>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: tColor.border, paddingTop: 16, gap: 12 }}>
                      <Text style={{ fontSize: isMobile ? 22 : 24, fontWeight: '900', color: brandColor }}>${srv.price}</Text>
                      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor, paddingVertical: isMobile ? 12 : 14, paddingHorizontal: isMobile ? 18 : 24 }]} onPress={() => { setSelectedServiceType(srv.id); setIsBookingModalOpen(true); setIsPlateSearched(false); }}><Text style={styles.primaryButtonText}>{t.bookNow}</Text></TouchableOpacity>
                    </View>
                  </View>
                </View>
              )) : (<View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border }]}><Text style={{ color: tColor.muted, textAlign: 'center' }}>{t.noActiveServices}</Text></View>)}
            </View>

            {localPortfolio.length > 0 ? (
              <View style={{ marginTop: isMobile ? 40 : 60, marginBottom: 20, width: '100%' }}>
                <Text style={{ fontSize: isMobile ? 24 : 28, fontWeight: '900', color: tColor.text, marginBottom: 20 }}>{t.ourWork1} <Text style={{ color: brandColor }}>{t.ourWork2}</Text></Text>
                <ResponsiveCarousel
                  data={localPortfolio}
                  gap={isMobile ? 16 : 24}
                  minItemWidth={260}
                  maxCols={4}
                  tColor={tColor}
                  brandColor={brandColor}
                  arrowTop="34%"
                  renderItem={(item, idx, itemWidth) => (
                    <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: tColor.border, backgroundColor: tColor.card }}>
                      <TouchableOpacity style={{ width: '100%', height: Math.min(340, Math.max(230, Math.round(itemWidth * 0.88))), backgroundColor: tColor.input, position: 'relative' }} onPress={() => setExpandedImage({ path: item.url, alt: item.title })}>
                        <PrivateSupabaseImage path={item.url} alt={item.title || `Portafolio ${idx + 1}`} />
                        <BottomHalfGradientOverlay heightPct="36%" baseColor="18, 22, 28" />
                      </TouchableOpacity>
                      {renderReportButton({ type: 'portfolio', id: item.url, title: item.title, excerpt: String(item.description || '').slice(0, 200) }, true, { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', zIndex: 5 })}
                      <View style={{ padding: 18 }}>
                        <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 17, marginBottom: 4 }}>{toTitleCase(item.title)}</Text>
                        {item.description ? (
                          <Text style={{ color: tColor.muted, fontSize: 13.5, marginBottom: 8 }} numberOfLines={2}>{toTitleCase(item.description)}</Text>
                        ) : null}
                      </View>
                    </View>
                  )}
                />
              </View>
            ) : null}

            {/* 🌟 SECCIÓN PÚBLICA DE REACCIONES (👍/👎) Y RESEÑAS DE CLIENTES VERIFICADOS 🌟 */}
            <View style={{ marginTop: isMobile ? 36 : 48, marginBottom: 40, width: '100%', minWidth: 0 }}>
              <View style={{ marginBottom: 22, width: '100%', minWidth: 0 }}>
                <Text style={{ fontSize: isMobile ? 22 : 26, fontWeight: '900', color: tColor.text, lineHeight: isMobile ? 28 : 32 }}>
                  {t.reviewsTitle1} <Text style={{ color: brandColor }}>{t.reviewsTitle2}</Text>
                </Text>
                <Text style={{ color: tColor.muted, fontSize: isMobile ? 12 : 13, marginTop: 6, lineHeight: 18 }}>
                  👍 {ratingSummary.likes} {t.likesLabel}  •  👎 {ratingSummary.dislikes} {t.dislikesLabel}  •  ⭐ {ratingSummary.avg} ({ratingSummary.count} {t.verifiedClients})
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, width: '100%' }}>
                  <TouchableOpacity
                    onPress={() => startReactionFlow('like')}
                    style={{
                      flex: isMobile ? 1 : undefined,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#10B981',
                      backgroundColor: 'rgba(16, 185, 129, 0.12)'
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>👍</Text>
                    <Text style={{ color: '#10B981', fontWeight: '900', fontSize: 12.5 }}>{t.likeBtn}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => startReactionFlow('dislike')}
                    style={{
                      flex: isMobile ? 1 : undefined,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#EF4444',
                      backgroundColor: 'rgba(239, 68, 68, 0.12)'
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>👎</Text>
                    <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 12.5 }}>{t.dislikeBtn}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ color: tColor.muted, fontSize: 11.5, marginTop: 10, lineHeight: 16 }}>
                  {t.onlyCompletedRule}
                </Text>
              </View>

              {reviewsList.length === 0 ? (
                <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, padding: 28, alignItems: 'center' }]}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>👍</Text>
                  <Text style={{ color: tColor.text, fontWeight: 'bold', fontSize: 16 }}>{t.noReviewsTitle}</Text>
                  <Text style={{ color: tColor.muted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                    {t.noReviewsSub}
                  </Text>
                </View>
              ) : (
                <ResponsiveCarousel
                  data={[...reviewsList].sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())}
                  gap={20}
                  minItemWidth={300}
                  maxItemWidth={460}
                  maxCols={3}
                  tColor={tColor}
                  brandColor={brandColor}
                  arrowTop="38%"
                  renderItem={(rev) => {
                    const isLike = rev.reaction === 'like' || (!rev.reaction && Number(rev.rating) >= 4);
                    return (
                        <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, flex: 1, padding: 24, justifyContent: 'space-between' }]}>
                          <View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={{ backgroundColor: isLike ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: isLike ? '#10B981' : '#EF4444' }}>
                                  <Text style={{ color: isLike ? '#10B981' : '#EF4444', fontSize: 11, fontWeight: '900' }}>
                                    {isLike ? tr('👍 Me gustó', '👍 Liked') : tr('👎 Por mejorar', '👎 Needs improvement')}
                                  </Text>
                                </View>
                                <Text style={{ color: '#F59E0B', fontSize: 13, letterSpacing: 1 }}>
                                  {'★'.repeat(rev.rating)}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={{ color: tColor.muted, fontSize: 11 }}>
                                  {new Date(rev.createdAt).toLocaleDateString('es-ES')}
                                </Text>
                                {renderReportButton({ type: 'review', id: rev.id, title: `Reseña de ${rev.clientName}`, excerpt: String(rev.comment || '').slice(0, 200) }, true)}
                              </View>
                            </View>
                            {rev.comment ? (
                              <Text style={{ color: tColor.text, fontSize: 14, lineHeight: 20, fontStyle: 'italic', marginBottom: 16 }}>
                                "{toTitleCase(rev.comment)}"
                              </Text>
                            ) : (
                              <Text style={{ color: tColor.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 16 }}>
                                {isLike ? tr('El cliente recomendó este negocio con un 👍.', 'The client recommended this business with a 👍.') : tr('El cliente calificó este negocio sin dejar comentario.', 'The client rated this business without leaving a comment.')}
                              </Text>
                            )}
                          </View>
                          <View style={{ borderTopWidth: 1, borderTopColor: tColor.border, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 13 }}>👤 {toTitleCase(rev.clientName)}</Text>
                            {rev.serviceName ? (
                              <Text style={{ color: brandColor, fontSize: 11, fontWeight: 'bold' }}>✨ {toTitleCase(rev.serviceName)}</Text>
                            ) : null}
                          </View>
                        </View>
                    );
                  }}
                />
              )}
            </View>

            {/* 🚩 PIE LEGAL: REPORTAR PUBLICACIÓN */}
            <View style={{ borderTopWidth: 1, borderTopColor: tColor.border, paddingTop: 20, paddingBottom: 12, alignItems: 'center', gap: 8 }}>
              {renderReportButton({ type: 'business', id: tenantInfo?.id || String(safeTenantId), title: tenantInfo?.name || 'Negocio' })}
              <Text style={{ color: tColor.muted, fontSize: 11, textAlign: 'center', maxWidth: 560, lineHeight: 16 }}>
                {tr('AutoFlow aloja contenido publicado por los negocios y no verifica su titularidad. Si crees que algo infringe tus derechos o es inapropiado, repórtalo y lo revisaremos.', 'AutoFlow hosts content published by businesses and does not verify ownership. If you believe anything infringes your rights or is inappropriate, report it and we will review it.')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ============================================================== */}
        {/* VISTA 2: EXPEDIENTE CLIENTE (1 SOLA RESEÑA Y 1 LIKE POR CLIENTE)*/}
        {/* ============================================================== */}
        {activeView === 'expediente' ? (
          <View style={{ flex: 1 }}>
            <View style={{ paddingTop: 10, paddingBottom: 16, alignItems: 'center' }}>
              <View style={{ width: '100%', maxWidth: 800 }}>
                {(!clientExpedienteData || isExpedienteExpanded) ? (
                  <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, width: '100%', padding: isMobile ? 20 : 32 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <Text style={{ fontSize: isMobile ? 20 : 26, fontWeight: '900', color: tColor.text }}>
                        <Text style={{ fontSize: isMobile ? 24 : 32 }}>📋 </Text> Expediente
                      </Text>
                      {clientExpedienteData ? (
                        <TouchableOpacity onPress={() => setIsExpedienteExpanded(false)}>
                          <Text style={{ color: tColor.muted, fontWeight: 'bold', fontSize: 24 }}>✕</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    
                    <Text style={{ color: tColor.muted, marginBottom: 20 }}>
                      {isAutomotive ? 'Ingresa la placa para consultar el historial.' : 'Ingresa el Teléfono o ID para consultar historial.'}
                    </Text>

                    {pendingReaction ? (
                      <View style={{ backgroundColor: pendingReaction === 'like' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: pendingReaction === 'like' ? '#10B981' : '#EF4444', borderRadius: 12, padding: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Text style={{ fontSize: 22 }}>{pendingReaction === 'like' ? '👍' : '👎'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 13 }}>Casi listo: verifica que eres cliente</Text>
                          <Text style={{ color: tColor.muted, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
                            {isAutomotive ? 'Ingresa tu placa' : 'Ingresa tu teléfono o ID'} y registraremos tu {pendingReaction === 'like' ? 'Me gustó' : 'No me gustó'} automáticamente.
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => setPendingReaction(null)}>
                          <Text style={{ color: tColor.muted, fontWeight: 'bold', fontSize: 12 }}>Cancelar</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    
                    <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, width: '100%' }}>
                      {isAutomotive ? (
                        <TextInput 
                          style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 'bold' }]} 
                          placeholder="Placa (Ej: JNT776)" 
                          placeholderTextColor={tColor.muted} 
                          value={expedienteQuery} 
                          onChangeText={text => setExpedienteQuery(text.toUpperCase())} 
                        />
                      ) : (
                        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: tColor.input, borderRadius: 12, borderWidth: 1, borderColor: tColor.border, overflow: 'hidden', minHeight: 48 }}>
                          <CountryCodeSelector value={expedienteCountryCode} onChange={setExpedienteCountryCode} tColor={tColor} width={115} />
                          <TextInput 
                            style={{ flex: 1, color: tColor.text, paddingHorizontal: 16, fontSize: 18, fontWeight: 'bold', textAlign: 'center', outlineStyle: 'none' } as any} 
                            placeholder="Teléfono o ID" 
                            placeholderTextColor={tColor.muted} 
                            value={expedienteQuery} 
                            onChangeText={text => setExpedienteQuery(text.toUpperCase())} 
                          />
                        </View>
                      )}
                      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor }, isMobile ? { height: 48 } : {}]} onPress={handleSearchExpediente as any} disabled={isSearchingExpediente}>
                        <Text style={styles.primaryButtonText}>{isSearchingExpediente ? 'Buscando...' : '🔍 Consultar'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {(clientExpedienteData && !isExpedienteExpanded) ? (
                  <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', padding: 16, borderLeftWidth: 4, borderLeftColor: brandColor, gap: 16 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={[styles.plateBadge, { backgroundColor: brandColor }]}>
                        <Text style={styles.plateText}>{isAutomotive ? clientExpedienteData.vehicle?.plate : 'VIP'}</Text>
                      </View>
                      <View>
                        <Text style={{ color: tColor.text, fontWeight: 'bold', fontSize: 15 }}>{toTitleCase(clientExpedienteData.client?.name || 'General')}</Text>
                        <Text style={{ color: tColor.muted, fontSize: 13 }}>📞 {expedienteCountryCode} {clientExpedienteData.client?.phone?.replace(/^\+\d+\s*/, '') || 'N/A'}</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 12, width: isMobile ? '100%' : 'auto' }}>
                      <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: tColor.input, borderColor: tColor.border, paddingHorizontal: 12, paddingVertical: 10, flex: isMobile ? 1 : undefined }]} onPress={() => setIsExpedienteExpanded(true)}>
                        <Text style={[styles.secondaryButtonText, { color: tColor.text }]}>🔍 Otra Búsqueda</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor, paddingHorizontal: 16, paddingVertical: 10, flex: isMobile ? 1 : undefined }]} onPress={handleBookFromExpediente}>
                        <Text style={styles.primaryButtonText}>📅 Agendar Cita</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>

            {clientExpedienteData ? (
              <View style={{ maxWidth: 800, alignSelf: 'center', width: '100%', paddingTop: 8, paddingBottom: 60, gap: 16 }}>
                
                {/* 🌟 TARJETA ÚNICA DE OPINIÓN POR USUARIO (CON LETRA CAPITALIZADA AUTOMÁTICA) 🌟 */}
                {clientExpedienteData.client ? (() => {
                  const isLiked = currentClientExistingReview && (currentClientExistingReview.reaction === 'like' || (!currentClientExistingReview.reaction && Number(currentClientExistingReview.rating) >= 4));
                  const isDisliked = currentClientExistingReview && (currentClientExistingReview.reaction === 'dislike' || (!currentClientExistingReview.reaction && Number(currentClientExistingReview.rating) <= 2));

                  return (
                    <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, padding: 20 }]}>
                      <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 14 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 16 }}>
                            ⭐ Tu Calificación Oficial como Cliente
                          </Text>
                          <Text style={{ color: tColor.muted, fontSize: 12, marginTop: 4 }}>
                            {currentClientExistingReview
                              ? 'Ya registraste tu reacción para este negocio (1 calificación permitida por cliente).'
                              : '¿Qué te pareció nuestro servicio? Reacciona en 1 clic sin escribir nada o deja un comentario opcional:'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <TouchableOpacity
                            disabled={isSubmittingReview}
                            onPress={() => handleQuickClientReaction('like')}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                              paddingVertical: 10,
                              paddingHorizontal: 14,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: isLiked ? '#10B981' : tColor.border,
                              backgroundColor: isLiked ? 'rgba(16, 185, 129, 0.2)' : tColor.input
                            }}
                          >
                            <Text style={{ fontSize: 15 }}>👍</Text>
                            <Text style={{ color: isLiked ? '#10B981' : tColor.text, fontWeight: '900', fontSize: 12 }}>
                              {isLiked ? 'Me gustó ✓' : 'Me gustó'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            disabled={isSubmittingReview}
                            onPress={() => handleQuickClientReaction('dislike')}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                              paddingVertical: 10,
                              paddingHorizontal: 14,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: isDisliked ? '#EF4444' : tColor.border,
                              backgroundColor: isDisliked ? 'rgba(239, 68, 68, 0.2)' : tColor.input
                            }}
                          >
                            <Text style={{ fontSize: 15 }}>👎</Text>
                            <Text style={{ color: isDisliked ? '#EF4444' : tColor.text, fontWeight: '900', fontSize: 12 }}>
                              {isDisliked ? 'No me gustó ✓' : 'No me gustó'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              if (isEditingClientReview) {
                                setIsEditingClientReview(false);
                              } else {
                                setReviewRating(currentClientExistingReview?.rating || 5);
                                setReviewComment(currentClientExistingReview?.comment ? toTitleCase(currentClientExistingReview.comment) : '');
                                setIsEditingClientReview(true);
                              }
                            }}
                            style={{
                              paddingVertical: 10,
                              paddingHorizontal: 14,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: '#F59E0B',
                              backgroundColor: 'rgba(245, 158, 11, 0.12)'
                            }}
                          >
                            <Text style={{ color: '#F59E0B', fontWeight: '900', fontSize: 12 }}>
                              {currentClientExistingReview?.comment ? '✏️ Editar mi reseña' : '💬 Dejar Reseña (Opcional)'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {currentClientExistingReview?.comment && !isEditingClientReview ? (
                        <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: tColor.border }}>
                          <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>
                            {'★'.repeat(currentClientExistingReview.rating)}{'☆'.repeat(Math.max(0, 5 - currentClientExistingReview.rating))}
                          </Text>
                          <Text style={{ color: tColor.text, fontSize: 14, fontStyle: 'italic', fontWeight: '500' }}>
                            "{toTitleCase(currentClientExistingReview.comment)}"
                          </Text>
                        </View>
                      ) : null}

                      {isEditingClientReview ? (
                        <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: tColor.border }}>
                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <TouchableOpacity
                                key={star}
                                onPress={() => setReviewRating(star)}
                                style={{
                                  paddingVertical: 6,
                                  paddingHorizontal: 12,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: reviewRating >= star ? '#F59E0B' : tColor.border,
                                  backgroundColor: reviewRating >= star ? 'rgba(245, 158, 11, 0.2)' : 'transparent'
                                }}
                              >
                                <Text style={{ color: reviewRating >= star ? '#F59E0B' : tColor.muted, fontWeight: '900' }}>{star} ★</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <TextInput
                            style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, minHeight: 65, marginBottom: 12 }]}
                            placeholder="Escribe Tu Comentario (Ej: Recomiendo El Servicio Me Encanta)..."
                            placeholderTextColor={tColor.muted}
                            multiline
                            value={reviewComment}
                            onChangeText={(text) => setReviewComment(toTitleCase(text))}
                          />
                          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                            <TouchableOpacity
                              style={[styles.secondaryButton, { backgroundColor: tColor.input, borderColor: tColor.border, paddingVertical: 8, paddingHorizontal: 14 }]}
                              onPress={() => setIsEditingClientReview(false)}
                            >
                              <Text style={[styles.secondaryButtonText, { color: tColor.text, fontSize: 12 }]}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.primaryButton, { backgroundColor: brandColor, paddingVertical: 8, paddingHorizontal: 16 }]}
                              onPress={handleSaveUniqueClientReview}
                              disabled={isSubmittingReview}
                            >
                              <Text style={[styles.primaryButtonText, { fontSize: 12 }]}>{isSubmittingReview ? 'Guardando...' : '💾 Guardar Mi Reseña'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })() : null}

                {/* 🌟 BANNER DE PREMIO POR REFERIR EN EL EXPEDIENTE 🌟 */}
                {(() => {
                  const dbCoupons = Number(clientExpedienteData.client?.metadata?.earnedReferralDiscounts || 0);
                  const expPhoneClean = cleanPhoneDigits(clientExpedienteData.client?.phone);
                  const liveRefs = expPhoneClean ? (pendingReferralsByPhone[expPhoneClean] || []) : [];
                  const totalCoupons = Math.max(0, dbCoupons + liveRefs.length);
                  const refNames = liveRefs.length > 0 ? liveRefs.join(', ') : (clientExpedienteData.client?.metadata?.lastReferred || 'tus amigos');

                  return (tenantInfo?.loyaltyConfig?.referralActive && totalCoupons > 0) ? (
                    <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#3B82F6' }}>
                       <Text style={{ color: '#3B82F6', fontWeight: '900', fontSize: 18, marginBottom: 8 }}>🏆 ¡Premio por Referir Ganado! </Text>
                       <Text style={{ color: tColor.text, fontSize: 14, fontWeight: 'bold', lineHeight: 22 }}>
                         ¡Te has ganado un {tenantInfo.loyaltyConfig.referralDiscountPercent || 20}% de descuento gracias a que referiste a {refNames}! Tienes {totalCoupons} cupón(es) listo(s) para usar en tu cita.
                       </Text>
                       <Text style={{ color: '#3B82F6', fontSize: 13, fontWeight: 'bold', marginTop: 8 }}>
                         💡 Tu {staffTerm.toLowerCase()} ya lo ve en el sistema, ¡solo recuérdale aplicarlo al momento de pagar!
                       </Text>
                    </View>
                  ) : null;
                })()}

                {/* 🌟 BANNER DE MOTIVACIÓN Y REFERIDOS EN EL EXPEDIENTE 🌟 */}
                {(tenantInfo?.loyaltyConfig?.isActive && clientExpedienteData.client) ? (
                  <View style={{ backgroundColor: tColor.input, padding: 24, borderRadius: 16, borderWidth: 1, borderColor: brandColor }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 18 }}>Plan de Incentivos VIP 🎁</Text>
                      <Text style={{ color: brandColor, fontWeight: '900', fontSize: 18 }}>
                        {clientExpedienteData.client.loyaltyVisits || 0} / {tenantInfo.loyaltyConfig.visitsRequired || 10}
                      </Text>
                    </View>
                    
                    <View style={{ width: '100%', height: 12, backgroundColor: tColor.border, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
                      <View style={{ 
                        width: `${Math.min(100, ((clientExpedienteData.client.loyaltyVisits || 0) / (tenantInfo.loyaltyConfig.visitsRequired || 10)) * 100)}%`, 
                        height: '100%', 
                        backgroundColor: (clientExpedienteData.client.loyaltyVisits || 0) >= (tenantInfo.loyaltyConfig.visitsRequired || 10) ? '#FFD700' : brandColor 
                      }} />
                    </View>
                    
                    <Text style={{ color: tColor.text, fontSize: 14, fontWeight: 'bold' }}>
                      {(clientExpedienteData.client.loyaltyVisits || 0) >= (tenantInfo.loyaltyConfig.visitsRequired || 10) 
                        ? '🎉 ¡Felicidades! Tienes una recompensa lista para canjear en esta visita.'
                        : `¡Ya casi! Solo te faltan ${Math.max(0, (tenantInfo.loyaltyConfig.visitsRequired || 10) - (clientExpedienteData.client.loyaltyVisits || 0))} visitas para desbloquear tu recompensa.`}
                    </Text>

                    {tenantInfo.loyaltyConfig.referralActive ? (
                      <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: tColor.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Text style={{ fontSize: 24 }}>🤝</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: 14 }}>¿Quieres ganar un {tenantInfo.loyaltyConfig.referralDiscountPercent || 20}% de descuento y sumar puntos más rápido?</Text>
                          <Text style={{ color: tColor.muted, fontSize: 13, marginTop: 4 }}>
                            Dile a tus amigos nuevos que ingresen tu número telefónico ({clientExpedienteData.client.phone ? clientExpedienteData.client.phone : 'tu número registrado'}) al agendar su primera cita. ¡Tú recibirás un {tenantInfo.loyaltyConfig.referralDiscountPercent || 20}% de descuento en tu corte y +1 visita acumulada!
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* 🌟 CITAS PROGRAMADAS ACTIVAS DEL CLIENTE (CON OPCIÓN DE CANCELAR Y LIBERAR TURNO) 🌟 */}
                {(() => {
                  const expPhoneClean = cleanPhoneDigits(clientExpedienteData.client?.phone || expedienteQuery);
                  const expEmailClean = String(clientExpedienteData.client?.email || '').trim().toLowerCase();
                  const expPlateUpper = String(clientExpedienteData.vehicle?.plate || expedienteQuery || '').trim().toUpperCase();

                  const clientActiveAppointments = getMergedUniqueAppointments(todayOrders, upcomingOrders).filter((ord) => {
                    if (ord.status === 'cancelled' || ord.status === 'completed') return false;
                    const ordPhone = cleanPhoneDigits(ord.clientPhone);
                    const ordEmail = String(ord.clientEmail || '').trim().toLowerCase();
                    const ordPlate = String(ord.plate || ord.metadata?.carPlate || '').trim().toUpperCase();
                    if (expPhoneClean.length >= 7 && ordPhone === expPhoneClean) return true;
                    if (expEmailClean && ordEmail === expEmailClean) return true;
                    if (isAutomotive && expPlateUpper && ordPlate === expPlateUpper) return true;
                    return false;
                  });

                  if (clientActiveAppointments.length === 0) return null;

                  return (
                    <View style={{ gap: 12, marginTop: 8, marginBottom: 8 }}>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: tColor.text }}>
                        📅 Tus Citas Programadas ({clientActiveAppointments.length})
                      </Text>
                      <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.35)', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="clock" size={18} color="#3B82F6" />
                        <Text style={{ color: tColor.muted, fontSize: 12, flex: 1, lineHeight: 18 }}>
                          <Text style={{ color: tColor.text, fontWeight: '900' }}>Política de Reserva y Recordatorio (6h / 3h): </Text>
                          Te enviamos un recordatorio <Text style={{ color: '#3B82F6', fontWeight: '800' }}>6 horas antes</Text> de tu turno para que confirmes tu asistencia en 1 clic. Si necesitas cancelar, hazlo con al menos <Text style={{ color: brandColor, fontWeight: '800' }}>3 horas de anticipación</Text> para liberar el espacio.
                        </Text>
                      </View>

                      {clientActiveAppointments.map((aptItem, aptIdx) => {
                        const stfId = aptItem.staffId || aptItem.metadata?.assignedStaffId;
                        const stfObj = staffList.find((s) => s.id === stfId);
                        const stfName = stfObj?.name || aptItem.metadata?.assignedStaffName;
                        const aptDateObj = aptItem.appointmentDate ? parseAppointmentWallClock(aptItem) : null;
                        const dateStr = aptDateObj ? aptDateObj.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Programada';
                        const isAttendanceConfirmed = aptItem.status === 'confirmed' || aptItem.metadata?.attendanceConfirmed === true;
                        const hoursLeft = getHoursUntilAppointment(aptItem);
                        const isReminderWindow = hoursLeft > 0 && hoursLeft <= 6 && !isAttendanceConfirmed;

                        return (
                          <View
                            key={`${aptItem.id}-${aptIdx}`}
                            style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: isAttendanceConfirmed ? '#10B981' : (isReminderWindow ? '#F59E0B' : brandColor), borderWidth: 1.5, padding: 20, gap: 14 }]}
                          >
                            {isReminderWindow ? (
                              <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)', borderWidth: 1, borderColor: '#F59E0B', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Feather name="bell" size={16} color="#F59E0B" />
                                <Text style={{ color: tColor.text, fontSize: 12, fontWeight: '800', flex: 1 }}>
                                  ⏰ Faltan {hoursLeft}h para tu cita. ¿Confirmas tu asistencia o prefieres liberar el espacio?
                                </Text>
                              </View>
                            ) : null}

                            <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 16 }}>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                  <View style={{ backgroundColor: isAttendanceConfirmed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.15)', borderWidth: 1, borderColor: isAttendanceConfirmed ? '#10B981' : '#3B82F6', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 }}>
                                    <Text style={{ color: isAttendanceConfirmed ? '#10B981' : '#3B82F6', fontSize: 11, fontWeight: '900' }}>
                                      {isAttendanceConfirmed ? '✅ ASISTENCIA CONFIRMADA' : '🕒 PENDIENTE DE CONFIRMAR'}
                                    </Text>
                                  </View>
                                  <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 14 }}>
                                    🗓️ {toTitleCase(dateStr)}  •  🕒 {aptItem.time || 'Hora confirmada'}
                                  </Text>
                                </View>
                                <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 17, marginBottom: 4 }}>
                                  ✨ {toTitleCase(aptItem.service?.name || aptItem.serviceType || 'Servicio General')}
                                </Text>
                                {stfName ? (
                                  <Text style={{ color: brandColor, fontSize: 12.5, fontWeight: '800' }}>
                                    👤 {staffTerm}: {toTitleCase(stfName)}
                                  </Text>
                                ) : null}
                              </View>

                              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                                {!isAttendanceConfirmed ? (
                                  <TouchableOpacity
                                    disabled={confirmingAptId === aptItem.id}
                                    onPress={() => handleConfirmAttendance(aptItem, 'client')}
                                    style={{ backgroundColor: '#10B981', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, flex: isMobile ? 1 : undefined, justifyContent: 'center' }}
                                  >
                                    <Feather name="check-circle" size={15} color="#FFFFFF" />
                                    <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>
                                      {confirmingAptId === aptItem.id ? 'Confirmando...' : 'Confirmar Asistencia'}
                                    </Text>
                                  </TouchableOpacity>
                                ) : null}

                                <TouchableOpacity
                                  onPress={() => openCancelAppointmentModal(aptItem, 'client')}
                                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: '#EF4444', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, flex: isMobile ? 1 : undefined, justifyContent: 'center' }}
                                >
                                  <Feather name="x-circle" size={15} color="#EF4444" />
                                  <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 13 }}>
                                    {hoursLeft > 0 && hoursLeft < 3 ? 'Cancelar (< 3h)' : 'Cancelar Cita'}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}

                <Text style={{ fontSize: 20, fontWeight: '900', color: tColor.text, marginTop: 8 }}>Historial de Visitas</Text>

                {clientExpedienteData.serviceHistory.length === 0 ? (
                  <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border }]}><Text style={{ color: tColor.muted, textAlign: 'center' }}>No registra órdenes cerradas.</Text></View>
                ) : (
                  (() => {
                    const sortedHistory = [...clientExpedienteData.serviceHistory].sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                    
                    return sortedHistory.map((wo: any, idx: number) => (
                      <View key={`${wo.id || 'wo'}-${idx}`} style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: tColor.border, paddingBottom: 12, marginBottom: 16 }}>
                          <Text style={styles.activeStatusBadge}>Visita #{sortedHistory.length - idx}</Text>
                          <Text style={{ color: tColor.muted, fontWeight: 'bold' }}>{new Date(wo.createdAt).toLocaleDateString('es-ES')}</Text>
                        </View>
                        
                        <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' } as any}>
                          <View style={{ flex: 1, minWidth: 150 }}>
                            <Text style={[styles.inputLabel, { color: tColor.muted }]}>Servicio Realizado</Text>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: tColor.text }}>{toTitleCase(wo.service?.name || wo.serviceType || 'Servicio General')}</Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 120 }}>
                            <Text style={[styles.inputLabel, { color: tColor.muted }]}>Costo Pagado</Text>
                            <Text style={{ fontSize: 22, fontWeight: '900', color: brandColor }}>${Number(wo.finalCost || 0).toLocaleString('en-US')}</Text>
                          </View>
                        </View>

                        {(wo.notes || wo.mechanicNotes || wo.oldParts || wo.newParts) ? (
                          <View style={{ marginTop: 16, backgroundColor: tColor.input, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: tColor.border }}>
                            <Text style={{ fontSize: 12, color: brandColor, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                              {isAutomotive ? '🛠️ Detalles del Trabajo' : '✨ Detalle del Servicio'}
                            </Text>
                            
                            {wo.oldParts ? (
                              <View style={{ marginBottom: 6 }}>
                                <Text style={{ color: tColor.muted, fontSize: 13, fontWeight: 'bold' }}>
                                  {isAutomotive ? 'Estado Inicial:' : 'Detalles Iniciales:'}
                                </Text>
                                <Text style={{ color: tColor.text, fontSize: 14 }}>{toTitleCase(wo.oldParts)}</Text>
                              </View>
                            ) : null}
                            
                            {wo.newParts ? (
                              <View style={{ marginBottom: 6 }}>
                                <Text style={{ color: tColor.muted, fontSize: 13, fontWeight: 'bold' }}>Resultado:</Text>
                                <Text style={{ color: tColor.text, fontSize: 14 }}>{toTitleCase(wo.newParts)}</Text>
                              </View>
                            ) : null}
                            
                            {(wo.mechanicNotes || wo.notes) ? (
                              <View style={{ marginBottom: 2 }}>
                                <Text style={{ color: tColor.muted, fontSize: 13, fontWeight: 'bold' }}>
                                  {isAutomotive ? 'Notas Técnicas:' : 'Notas del Profesional:'}
                                </Text>
                                <Text style={{ color: tColor.text, fontSize: 14 }}>{toTitleCase(wo.mechanicNotes || wo.notes)}</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                        
                        {(wo.oldPartImageUrl || wo.newPartImageUrl) ? (
                          <View style={{ flexDirection: 'row', gap: 16, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderColor: tColor.border }}>
                            {wo.oldPartImageUrl ? (
                              <TouchableOpacity style={{ flex: 1, backgroundColor: tColor.input, borderWidth: 1, borderColor: tColor.border, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }} onPress={() => setExpandedImage({ path: wo.oldPartImageUrl, alt: 'Evidencia (Antes)' })}>
                                <Text style={{ color: brandColor, fontWeight: 'bold', fontSize: 13 }}>📸 Ver Foto (Antes)</Text>
                              </TouchableOpacity>
                            ) : null}
                            {wo.newPartImageUrl ? (
                              <TouchableOpacity style={{ flex: 1, backgroundColor: tColor.input, borderWidth: 1, borderColor: tColor.border, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }} onPress={() => setExpandedImage({ path: wo.newPartImageUrl, alt: 'Evidencia (Después)' })}>
                                <Text style={{ color: brandColor, fontWeight: 'bold', fontSize: 13 }}>📸 Ver Foto (Después)</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    ));
                  })()
                )}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ============================================================== */}
        {/* VISTA 3: PORTAL INTERNO B2B                                    */}
        {/* ============================================================== */}
        {activeView === 'mecanico' ? (
          <View>
            {!isMechanicAuth ? (
              <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, maxWidth: 460, alignSelf: 'center', width: '100%', alignItems: 'center', padding: isMobile ? 24 : 32 }]}>
                <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: `${brandColor}18`, borderWidth: 1, borderColor: `${brandColor}45`, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Feather name="key" size={26} color={brandColor} />
                </View>
                <Text style={{ fontSize: 24, fontWeight: '900', color: tColor.text, marginBottom: 6, textAlign: 'center' }}>
                  {tr(`Acceso Empleados (${staffTerm})`, `Employee Access (${staffTerm})`)}
                </Text>
                <Text style={{ color: tColor.muted, marginBottom: 24, textAlign: 'center', fontSize: 13.5, lineHeight: 19 }}>
                  {tr(
                    `Ingresa el código de acceso de empleados de ${tenantInfo?.name || 'este negocio'} para ver las citas en agenda y cerrar servicios.`,
                    `Enter the employee access code for ${tenantInfo?.name || 'this business'} to view scheduled appointments and close orders.`
                  )}
                </Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, textAlign: 'center', fontSize: 24, letterSpacing: 8, marginBottom: 16, width: '100%' }]}
                  placeholder="••••"
                  placeholderTextColor={tColor.muted}
                  secureTextEntry
                  keyboardType="numeric"
                  maxLength={6}
                  value={mechanicPin}
                  onChangeText={(txt) => setMechanicPin(txt.replace(/\D/g, ''))}
                />
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: brandColor, width: '100%', marginBottom: 14 }]}
                  disabled={isAuthenticatingStaff}
                  onPress={async () => {
                    const cleanPin = mechanicPin.trim();
                    if (!cleanPin) {
                      return alert(tr('Ingresa el código de acceso de empleado.', 'Enter the employee access code.'));
                    }
                    setIsAuthenticatingStaff(true);
                    try {
                      const configuredPin = localLoyalty?.staffPortalPin || (tenantInfo as any)?.portalPin || (tenantInfo as any)?.portal_pin;
                      if (configuredPin) {
                        if (cleanPin === String(configuredPin).trim()) {
                          setPortalAccessRole('staff');
                          setAgendaFilter('today');
                          setIsMechanicAuth(true);
                          setMechanicPin('');
                        } else {
                          alert(t.wrongPin);
                        }
                      } else {
                        const res = await apiFetch('/api/tenants/auth-staff', {
                          method: 'POST',
                          body: JSON.stringify({ password: cleanPin }),
                        });
                        const json = await res.json();
                        if (res.ok && json.success) {
                          setPortalAccessRole('staff');
                          setAgendaFilter('today');
                          setIsMechanicAuth(true);
                          setMechanicPin('');
                        } else {
                          alert(json.message || t.wrongPin);
                        }
                      }
                    } catch (_e) {
                      alert(tr('Error de conexión al validar el código.', 'Connection error validating access code.'));
                    } finally {
                      setIsAuthenticatingStaff(false);
                    }
                  }}
                >
                  <Text style={styles.primaryButtonText}>
                    {isAuthenticatingStaff
                      ? tr('Verificando código...', 'Verifying code...')
                      : tr('Ver Agenda y Cerrar Citas', 'View Schedule & Close Orders')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push('/register' as any)}
                  style={{ paddingVertical: 8, paddingHorizontal: 12 }}
                >
                  <Text style={{ color: tColor.muted, fontSize: 12, textAlign: 'center' }}>
                    {tr('¿Eres el dueño del negocio? ', 'Are you the business owner? ')}
                    <Text style={{ color: brandColor, fontWeight: '800', textDecorationLine: 'underline' }}>
                      {tr('Administra todo desde Soy un Negocio →', 'Manage everything in Business Portal →')}
                    </Text>
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {/* Insignia superior indicando si está en Modo Operativo (PIN Staff) o Modo Dueño Administrador */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: portalAccessRole === 'owner' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(59, 130, 246, 0.14)', borderWidth: 1, borderColor: portalAccessRole === 'owner' ? '#10B981' : '#3B82F6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                    <Feather name={portalAccessRole === 'owner' ? 'shield' : 'user-check'} size={14} color={portalAccessRole === 'owner' ? '#10B981' : '#60A5FA'} />
                    <Text style={{ color: portalAccessRole === 'owner' ? '#10B981' : '#60A5FA', fontWeight: '900', fontSize: 12 }}>
                      {portalAccessRole === 'owner'
                        ? tr('MODO DUEÑO / ADMINISTRADOR (9 Módulos Activos)', 'OWNER / ADMIN MODE (All 9 Modules)')
                        : tr(`MODO OPERATIVO ${staffTerm.toUpperCase()} (Agenda y Cierre POS)`, `STAFF MODE (${staffTerm} — Schedule & POS)`)}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {portalAccessRole === 'owner' ? (
                      <TouchableOpacity
                        onPress={() => router.push('/register' as any)}
                        style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: tColor.input, borderWidth: 1, borderColor: tColor.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                      >
                        <Feather name="grid" size={13} color={brandColor} />
                        <Text style={{ color: tColor.text, fontWeight: '800', fontSize: 12 }}>
                          {tr('Mis Negocios', 'My Businesses')}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      onPress={handleStaffLogout}
                      style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(239, 68, 68, 0.14)', borderWidth: 1, borderColor: '#EF4444', flexDirection: 'row', alignItems: 'center', gap: 6 }}
                    >
                      <Feather name="log-out" size={13} color="#EF4444" />
                      <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 12 }}>{t.navLogout}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {(() => {
                  const allPortalMenuItems = [
                    { key: 'today', label: 'Órdenes de Hoy', icon: 'check-square' },
                    { key: 'upcoming', label: 'Próximos Turnos', icon: 'calendar' },
                    { key: 'reports', label: 'Reportes', icon: 'bar-chart-2' },
                    { key: 'staff', label: 'Personal', icon: 'users' },
                    { key: 'catalogo', label: 'Catálogo', icon: 'tag' },
                    { key: 'horarios', label: 'Horarios', icon: 'clock' },
                    { key: 'portafolio', label: 'Portafolio', icon: 'image' },
                    { key: 'fidelidad', label: 'Fidelidad', icon: 'gift' },
                    { key: 'recepcion_ia', label: 'Recepción IA', icon: 'phone-call' },
                  ] as const;

                  const portalMenuItems = portalAccessRole === 'owner'
                    ? allPortalMenuItems
                    : allPortalMenuItems.filter((item) => item.key === 'today' || item.key === 'upcoming');

                  const hasOverflow = portalTabsContentW > portalTabsViewW + 6;
                  const canScrollLeft = hasOverflow && portalTabsScrollX > 8;
                  const canScrollRight = hasOverflow && portalTabsScrollX < (portalTabsContentW - portalTabsViewW - 8);

                  const handleStepScroll = (direction: 'left' | 'right') => {
                    const step = Math.max(180, Math.round(portalTabsViewW * 0.55));
                    const nextX = direction === 'left'
                      ? Math.max(0, portalTabsScrollX - step)
                      : Math.min(Math.max(0, portalTabsContentW - portalTabsViewW), portalTabsScrollX + step);
                    portalTabsScrollRef.current?.scrollTo({ x: nextX, animated: true });
                  };

                  return (
                    <View
                      style={{
                        backgroundColor: tColor.card,
                        borderWidth: 1,
                        borderColor: tColor.border,
                        borderRadius: 16,
                        padding: 5,
                        marginBottom: 28,
                        flexDirection: 'row',
                        alignItems: 'center',
                        position: 'relative',
                        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px)', boxShadow: theme === 'dark' ? '0 8px 24px -8px rgba(0,0,0,0.5)' : '0 8px 24px -8px rgba(15,23,42,0.08)' } : {}) as any,
                      }}
                    >
                      {canScrollLeft ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => handleStepScroll('left')}
                          {...(Platform.OS === 'web' ? { className: 'portal-nav-arrow' } : {}) as any}
                          style={{
                            width: 30,
                            height: 34,
                            borderRadius: 10,
                            backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
                            borderWidth: 1,
                            borderColor: tColor.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 4,
                            zIndex: 10,
                          }}
                        >
                          <Feather name="chevron-left" size={15} color={tColor.text} />
                        </TouchableOpacity>
                      ) : null}

                      <ScrollView
                        ref={portalTabsScrollRef}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        scrollEventThrottle={16}
                        onLayout={(e) => setPortalTabsViewW(Math.floor(e.nativeEvent.layout.width))}
                        onContentSizeChange={(w) => setPortalTabsContentW(Math.floor(w))}
                        onScroll={(e) => setPortalTabsScrollX(e.nativeEvent.contentOffset.x)}
                        {...(Platform.OS === 'web' ? { className: 'portal-dock-scroll' } : {}) as any}
                        style={{ flex: 1 }}
                        contentContainerStyle={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          flexGrow: 1,
                        }}
                      >
                        {portalMenuItems.map((tabItem) => {
                          const isTabActive = agendaFilter === tabItem.key;
                          return (
                            <TouchableOpacity
                              key={tabItem.key}
                              activeOpacity={0.85}
                              onPress={() => setAgendaFilter(tabItem.key)}
                              {...(Platform.OS === 'web' ? { className: isTabActive ? 'portal-tab-pill-active' : 'portal-tab-pill' } : {}) as any}
                              style={{
                                flexGrow: 1,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 7,
                                paddingVertical: 10,
                                paddingHorizontal: isMobile ? 14 : 16,
                                borderRadius: 11,
                                backgroundColor: isTabActive ? brandColor : 'transparent',
                              }}
                            >
                              <Feather
                                name={tabItem.icon as any}
                                size={14}
                                color={isTabActive ? '#FFFFFF' : tColor.muted}
                              />
                              <Text
                                numberOfLines={1}
                                style={{
                                  color: isTabActive ? '#FFFFFF' : (theme === 'dark' ? '#CBD5E1' : '#334155'),
                                  fontWeight: isTabActive ? '800' : '600',
                                  fontSize: 13,
                                  letterSpacing: 0.15,
                                }}
                              >
                                {tabItem.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      {canScrollRight ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => handleStepScroll('right')}
                          {...(Platform.OS === 'web' ? { className: 'portal-nav-arrow' } : {}) as any}
                          style={{
                            width: 30,
                            height: 34,
                            borderRadius: 10,
                            backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
                            borderWidth: 1,
                            borderColor: tColor.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: 4,
                            zIndex: 10,
                          }}
                        >
                          <Feather name="chevron-right" size={15} color={tColor.text} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })()}

                {agendaFilter === 'recepcion_ia' ? (
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                      <View>
                        <Text style={[styles.sectionTitle, { color: tColor.text, marginBottom: 4 }]}>
                          Recepcionista Telefónica IA 24/7 (Bilingüe ES / EN)
                        </Text>
                        <Text style={{ color: tColor.muted, fontSize: 13.5 }}>
                          Tu propio asistente de voz contesta llamadas, verifica qué {staffTerm.toLowerCase()} está libre, agenda en tu calendario y graba la llamada.
                        </Text>
                      </View>
                      <View style={{ backgroundColor: vapiConfig.isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: vapiConfig.isActive ? '#10B981' : '#F59E0B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name={vapiConfig.isActive ? 'check-circle' : 'phone-Call' as any} size={15} color={vapiConfig.isActive ? '#10B981' : '#F59E0B'} />
                        <Text style={{ color: vapiConfig.isActive ? '#10B981' : '#F59E0B', fontWeight: '900', fontSize: 12.5 }}>
                          {vapiConfig.isActive ? `LÍNEA IA ACTIVA (${vapiConfig.phoneNumber})` : 'PENDIENTE DE VINCULAR'}
                        </Text>
                      </View>
                    </View>

                    {/* Guía ultra-sencilla de 3 pasos (idéntica al menú en español de Vapi.ai para que el cliente no se pierda) */}
                    <View style={[styles.bentoGrid, { marginBottom: 24 }]}>
                      <View style={[styles.flexCard, { backgroundColor: tColor.card, borderColor: tColor.border, padding: 24 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${brandColor}20`, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: brandColor, fontWeight: '900' }}>1</Text>
                          </View>
                          <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 15 }}>Activa Facturación en Vapi</Text>
                        </View>
                        <Text style={{ color: tColor.muted, fontSize: 12.5, lineHeight: 19, marginBottom: 14 }}>
                          Entra a <Text style={{ color: tColor.text, fontWeight: 'bold' }}>Vapi.ai</Text> y en el menú izquierdo haz clic en <Text style={{ color: '#10B981', fontWeight: 'bold' }}>💳 Facturación y pago</Text> (o <Text style={{ color: '#10B981', fontWeight: 'bold' }}>Comprar créditos</Text> abajo) para asociar tu tarjeta.
                        </Text>
                        {Platform.OS === 'web' ? (
                          <TouchableOpacity
                            style={[styles.secondaryButton, { backgroundColor: tColor.input, borderColor: tColor.border, paddingVertical: 10 }]}
                            onPress={() => window.open('https://dashboard.vapi.ai/org/api-keys', '_blank')}
                          >
                            <Text style={[styles.secondaryButtonText, { color: brandColor, fontSize: 12.5 }]}>Abrir Claves API en Vapi.ai ↗</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      <View style={[styles.flexCard, { backgroundColor: tColor.card, borderColor: tColor.border, padding: 24 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${brandColor}20`, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: brandColor, fontWeight: '900' }}>2</Text>
                          </View>
                          <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 15 }}>Copia la "Private Key" (Arriba)</Text>
                        </View>
                        <Text style={{ color: tColor.muted, fontSize: 12.5, lineHeight: 19 }}>
                          En el menú izquierdo entra a <Text style={{ color: tColor.text, fontWeight: 'bold' }}>🔒 Claves API</Text> y copia la <Text style={{ color: '#F59E0B', fontWeight: '900' }}>Private Key</Text> (la primera de arriba que tiene punticos <Text style={{ fontWeight: 'bold' }}>••••••••</Text>).{'\n'}
                          <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 11.5 }}>⚠️ No copies la Public Key de abajo.</Text>
                        </Text>
                      </View>

                      <View style={[styles.flexCard, { backgroundColor: tColor.card, borderColor: tColor.border, padding: 24 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${brandColor}20`, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: brandColor, fontWeight: '900' }}>3</Text>
                          </View>
                          <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 15 }}>¡Cero Configuración Extra!</Text>
                        </View>
                        <Text style={{ color: tColor.muted, fontSize: 12.5, lineHeight: 19 }}>
                          Pega tu <Text style={{ color: tColor.text, fontWeight: 'bold' }}>Private Key</Text> abajo y pulsa el botón. <Text style={{ color: '#10B981', fontWeight: 'bold' }}>No tienes que crear ningún agente en Vapi:</Text> AutoFlow lo crea, lo entrena y lo enlaza a tu teléfono solo.
                        </Text>
                      </View>
                    </View>

                    {/* Formulario de Conexión 1-Clic */}
                    <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, marginBottom: 28 }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
                        <Text style={{ color: tColor.text, fontSize: 18, fontWeight: '900' }}>
                          ⚙️ Conecta tu Cuenta en 1 Solo Paso
                        </Text>
                        {vapiConfig.assistantId ? (
                          <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.14)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                            <Text style={{ color: '#60A5FA', fontSize: 11, fontWeight: '800' }}>
                              🤖 Agente ID: {vapiConfig.assistantId.slice(0, 12)}...
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginBottom: 18 }}>
                        <View style={{ flex: 1.6 }}>
                          <Text style={[styles.inputLabel, { color: '#F59E0B' }]}>
                            🔑 1. Pega aquí tu "Private Key" de Vapi (Obligatorio — La clave de arriba con ••••••••)
                          </Text>
                          <TextInput
                            style={[styles.formInput, { backgroundColor: tColor.input, borderColor: brandColor, color: tColor.text }]}
                            placeholder="Pega tu Private Key (de Claves API privadas)..."
                            placeholderTextColor={tColor.muted}
                            secureTextEntry
                            value={vapiConfig.privateApiKey || ''}
                            onChangeText={(t) => setVapiConfig({ ...vapiConfig, privateApiKey: t.trim() })}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted }]}>🌎 2. Idioma del Recepcionista IA</Text>
                          {Platform.OS === 'web' ? (
                            <select
                              className="web-input-override"
                              value={vapiConfig.languageMode || 'bilingual'}
                              onChange={(e) => setVapiConfig({ ...vapiConfig, languageMode: e.target.value as any })}
                            >
                              <option value="bilingual">🌎 Bilingüe Automático (Español + Inglés)</option>
                              <option value="es">🇪🇸 Solo Español</option>
                              <option value="en">🇺🇸 Solo Inglés</option>
                            </select>
                          ) : (
                            <TextInput
                              style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]}
                              value={vapiConfig.languageMode || 'bilingual'}
                              editable={false}
                            />
                          )}
                        </View>
                      </View>

                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginBottom: 18 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted }]}>
                            📞 Número en Vapi o Código de Área Deseado (Se detecta o crea automático)
                          </Text>
                          <TextInput
                            style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]}
                            placeholder="Opcional: Ej. 909 (o se detecta solo de tu cuenta Vapi)"
                            placeholderTextColor={tColor.muted}
                            value={vapiConfig.phoneNumber || ''}
                            onChangeText={(t) => setVapiConfig({ ...vapiConfig, phoneNumber: t })}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted }]}>📲 Teléfono Humano para Transferir Urgencias (Opcional)</Text>
                          <TextInput
                            style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]}
                            placeholder="Ej: +1 909 555 0100 (Desvío si el cliente pide humano)"
                            placeholderTextColor={tColor.muted}
                            value={vapiConfig.transferPhone || ''}
                            onChangeText={(t) => setVapiConfig({ ...vapiConfig, transferPhone: t })}
                          />
                        </View>
                      </View>

                      <View style={{ marginBottom: 18 }}>
                        <Text style={[styles.inputLabel, { color: '#10B981' }]}>
                          🌐 URL Pública del Túnel HTTPS / Servidor (Para pruebas desde localhost.run sin reiniciar backend)
                        </Text>
                        <TextInput
                          style={[styles.formInput, { backgroundColor: tColor.input, borderColor: 'rgba(16, 185, 129, 0.45)', color: tColor.text }]}
                          placeholder="Ej: https://b5b46f7862d679.lhr.life (Si lo dejas vacío usa PUBLIC_API_URL de tu .env)"
                          placeholderTextColor={tColor.muted}
                          autoCapitalize="none"
                          value={vapiConfig.webhookBaseUrl || ''}
                          onChangeText={(t) => setVapiConfig({ ...vapiConfig, webhookBaseUrl: t.trim() })}
                        />
                      </View>

                      {vapiActivationNotice ? (
                        <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.14)', borderWidth: 1.5, borderColor: '#10B981', borderRadius: 12, padding: 14, marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Feather name="check-circle" size={20} color="#10B981" />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#10B981', fontWeight: '900', fontSize: 13.5 }}>
                              🤖 ¡Notificación de Activación Enviada a Telegram y Vapi!
                            </Text>
                            <Text style={{ color: tColor.text, fontSize: 12, marginTop: 2, lineHeight: 18 }}>
                              {vapiActivationNotice}
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      <View style={{ backgroundColor: tColor.input, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: tColor.border, marginBottom: 20 }}>
                        <Text style={{ color: brandColor, fontWeight: '900', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>
                          🧠 Conocimiento que AutoFlow inyecta automáticamente en tu IA ({isLegal ? 'Modo Bufete Legal' : isDental ? 'Modo Clínica Odontológica' : 'Modo Recepción Pro'}):
                        </Text>
                        <Text style={{ color: tColor.muted, fontSize: 12.5, lineHeight: 19 }}>
                          • <Text style={{ color: tColor.text, fontWeight: 'bold' }}>Profesionales activos ({activeStaffList.length}):</Text> {activeStaffList.map((s) => s.name).join(', ') || 'Cualquiera disponible'}{'\n'}
                          • <Text style={{ color: tColor.text, fontWeight: 'bold' }}>Servicios y Tarifas ({activeCatalogServices.length}):</Text> {activeCatalogServices.map((s) => `${s.name} (${Number(s.price) === 0 ? 'Evaluación Gratis' : '$' + s.price})`).join(', ') || 'Catálogo general'}{'\n'}
                          • <Text style={{ color: tColor.text, fontWeight: 'bold' }}>Protocolo de Preguntas:</Text> {isLegal ? 'Pregunta nombre completo, correo electrónico (para enviar confirmación y Google Calendar), área del caso (Inmigración, Familia, Civil, Penal, Laboral) y modalidad (Presencial, Llamada o Videollamada).' : isDental ? 'Pregunta nombre completo, correo electrónico (para enviar confirmación), motivo o urgencia dental, y fecha/hora deseada.' : 'Pregunta nombre, servicio deseado y verifica disponibilidad respetando las 3 horas de anticipación.'}
                        </Text>
                      </View>

                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
                        <TouchableOpacity
                          style={[styles.primaryButton, { backgroundColor: brandColor, flex: 1, width: '100%', flexDirection: 'row', gap: 10, paddingVertical: 16 }]}
                          onPress={handleAutoConfigureVapiAssistant}
                          disabled={isSyncingVapi}
                        >
                          <Feather name="zap" size={18} color="#FFFFFF" />
                          <Text style={styles.primaryButtonText}>
                            {isSyncingVapi ? 'Programando Asistente en Vapi...' : '⚡ Conectar y Autoconfigurar Recepcionista IA'}
                          </Text>
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', gap: 10, width: isMobile ? '100%' : 'auto' }}>
                          <TouchableOpacity
                            style={[styles.secondaryButton, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: '#10B981', paddingVertical: 14, paddingHorizontal: 16, flex: isMobile ? 1 : undefined, flexDirection: 'row', gap: 6 }]}
                            onPress={() => handleSimulatePhoneBooking('es')}
                            disabled={isSimulatingVoiceCall}
                          >
                            <Feather name="phone-incoming" size={15} color="#10B981" />
                            <Text style={{ color: '#10B981', fontWeight: '900', fontSize: 12.5 }}>
                              {isSimulatingVoiceCall ? 'Simulando...' : 'Probar Llamada (ES)'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.secondaryButton, { backgroundColor: 'rgba(59, 130, 246, 0.12)', borderColor: '#3B82F6', paddingVertical: 14, paddingHorizontal: 16, flex: isMobile ? 1 : undefined, flexDirection: 'row', gap: 6 }]}
                            onPress={() => handleSimulatePhoneBooking('en')}
                            disabled={isSimulatingVoiceCall}
                          >
                            <Feather name="globe" size={15} color="#3B82F6" />
                            <Text style={{ color: '#3B82F6', fontWeight: '900', fontSize: 12.5 }}>
                              {isSimulatingVoiceCall ? 'Simulando...' : 'Test Call (EN)'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    {/* ===================================================================== */}
                    {/* 📲 CANAL INTERNO DE TELEGRAM PARAMETRIZADO POR CONSULTORIO / NEGOCIO  */}
                    {/* ===================================================================== */}
                    <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, marginBottom: 28 }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: tColor.border }}>
                        <View style={{ flex: 1, minWidth: 240 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(14, 165, 233, 0.18)', borderWidth: 1, borderColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' }}>
                              <Feather name="send" size={16} color="#0EA5E9" />
                            </View>
                            <Text style={{ color: tColor.text, fontSize: 19, fontWeight: '900' }}>
                              Canal Interno de Telegram (Exclusivo de este Consultorio / Negocio)
                            </Text>
                          </View>
                          <Text style={{ color: tColor.muted, fontSize: 13, marginTop: 2 }}>
                            Parametriza en la base de datos a qué grupo o chat privado de Telegram llegarán las citas, grabaciones de voz IA y cierres de caja de <Text style={{ color: tColor.text, fontWeight: 'bold' }}>{tenantInfo?.name || 'este negocio'}</Text>.
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <View style={{ backgroundColor: telegramConfig.chatId ? 'rgba(16, 185, 129, 0.15)' : 'rgba(14, 165, 233, 0.15)', borderWidth: 1, borderColor: telegramConfig.chatId ? '#10B981' : '#0EA5E9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                            <Text style={{ color: telegramConfig.chatId ? '#10B981' : '#38BDF8', fontWeight: '900', fontSize: 11.5 }}>
                              {telegramConfig.chatId ? `🟢 CANAL PROPIO (${telegramConfig.chatId})` : '🔵 CANAL GLOBAL (.ENV)'}
                            </Text>
                          </View>
                          <Switch
                            value={telegramConfig.isActive !== false}
                            onValueChange={(val) => setTelegramConfig({ ...telegramConfig, isActive: val })}
                            trackColor={{ false: '#3e3e3e', true: '#0EA5E9' }}
                          />
                        </View>
                      </View>

                      {/* Mini guía de 3 pasos para crear el grupo del consultorio */}
                      <View style={[styles.bentoGrid, { marginBottom: 20, gap: 14 }]}>
                        <View style={{ flex: 1, minWidth: 220, backgroundColor: tColor.input, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: tColor.border }}>
                          <Text style={{ color: '#38BDF8', fontWeight: '900', fontSize: 12.5, marginBottom: 4 }}>
                            PASO 1: Crea el Grupo del Consultorio
                          </Text>
                          <Text style={{ color: tColor.muted, fontSize: 12, lineHeight: 18 }}>
                            En Telegram crea un grupo con tu equipo (ej. <Text style={{ color: tColor.text, fontWeight: 'bold' }}>"Agenda {tenantInfo?.name || 'Consultorio'}"</Text>) y agrega como miembro a nuestro Bot oficial de AutoFlow (o a tu propio Bot).
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 220, backgroundColor: tColor.input, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: tColor.border }}>
                          <Text style={{ color: '#38BDF8', fontWeight: '900', fontSize: 12.5, marginBottom: 4 }}>
                            PASO 2: Autodetecta el Chat ID en 1 Clic
                          </Text>
                          <Text style={{ color: tColor.muted, fontSize: 12, lineHeight: 18 }}>
                            Escribe un mensaje cualquiera en ese grupo (ej. <Text style={{ color: '#10B981', fontWeight: 'bold' }}>"hola"</Text>) y pulsa abajo el botón <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>🔍 Autodetectar Chat ID</Text>. El código se llenará solo.
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 220, backgroundColor: tColor.input, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: tColor.border }}>
                          <Text style={{ color: '#38BDF8', fontWeight: '900', fontSize: 12.5, marginBottom: 4 }}>
                            PASO 3: Guarda y Prueba en Vivo
                          </Text>
                          <Text style={{ color: tColor.muted, fontSize: 12, lineHeight: 18 }}>
                            Pulsa <Text style={{ color: tColor.text, fontWeight: 'bold' }}>Guardar Canal en BD</Text> y luego <Text style={{ color: '#10B981', fontWeight: 'bold' }}>Enviar Alerta de Prueba</Text>. Todas las citas de este negocio llegarán directo a ese grupo.
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginBottom: 18 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted }]}>
                            🏷️ Nombre Identificador del Canal / Consultorio
                          </Text>
                          <TextInput
                            style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]}
                            placeholder={`Ej: Recepción ${tenantInfo?.name || 'Consultorio'}`}
                            placeholderTextColor={tColor.muted}
                            value={telegramConfig.channelName || ''}
                            onChangeText={(t) => setTelegramConfig({ ...telegramConfig, channelName: t })}
                          />
                        </View>

                        <View style={{ flex: 1.4 }}>
                          <Text style={[styles.inputLabel, { color: '#38BDF8' }]}>
                            🆔 Telegram Chat ID del Grupo o Consultorio (Ej: -10019283746 o 8819436619)
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TextInput
                              style={[styles.formInput, { flex: 1, backgroundColor: tColor.input, borderColor: '#0EA5E9', color: tColor.text, fontWeight: 'bold' }]}
                              placeholder="Pega el Chat ID o pulsa Autodetectar 👉"
                              placeholderTextColor={tColor.muted}
                              value={telegramConfig.chatId || ''}
                              onChangeText={(t) => setTelegramConfig({ ...telegramConfig, chatId: t.trim() })}
                            />
                            <TouchableOpacity
                              onPress={handleDetectTelegramChatId}
                              disabled={isDetectingTelegramChat}
                              style={{ backgroundColor: 'rgba(14, 165, 233, 0.16)', borderWidth: 1, borderColor: '#0EA5E9', borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 }}
                            >
                              <Feather name="search" size={14} color="#38BDF8" />
                              <Text style={{ color: '#38BDF8', fontWeight: '900', fontSize: 12 }}>
                                {isDetectingTelegramChat ? 'Buscando...' : 'Autodetectar'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>

                      <View style={{ marginBottom: 18 }}>
                        <Text style={[styles.inputLabel, { color: tColor.muted }]}>
                          🤖 Token de Bot Propio en @BotFather (Opcional — Déjalo vacío para usar el Bot Oficial de AutoFlow)
                        </Text>
                        <TextInput
                          style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]}
                          placeholder="Opcional (Marca Blanca): Ej. 8761446131:AAE84W20I... (Si lo dejas vacío usa el Bot central de AutoFlow)"
                          placeholderTextColor={tColor.muted}
                          secureTextEntry
                          value={telegramConfig.botToken || ''}
                          onChangeText={(t) => setTelegramConfig({ ...telegramConfig, botToken: t.trim() })}
                        />
                      </View>

                      {/* Filtros de qué eventos notificar al grupo del consultorio */}
                      <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 10 }]}>
                        🔔 ¿Qué alertas deseas recibir en el grupo de Telegram de este negocio?
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
                        {[
                          { key: 'notifyNewAppointments', label: '📅 Nuevas Citas (Web + Voz IA)' },
                          { key: 'notifyRecordings', label: '🎙️ Audio y Resumen de Llamadas IA' },
                          { key: 'notifyConfirmationsAndCancels', label: '✅ Confirmaciones (6h) y Cancelaciones' },
                          { key: 'notifyPOSClosures', label: '💰 Cierres de Servicio y Cobros (POS)' }
                        ].map((evItem) => {
                          const isChecked = (telegramConfig as any)[evItem.key] !== false;
                          return (
                            <TouchableOpacity
                              key={evItem.key}
                              onPress={() => setTelegramConfig({ ...telegramConfig, [evItem.key]: !isChecked })}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                paddingVertical: 9,
                                paddingHorizontal: 14,
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: isChecked ? '#0EA5E9' : tColor.border,
                                backgroundColor: isChecked ? 'rgba(14, 165, 233, 0.14)' : tColor.input
                              }}
                            >
                              <Feather name={isChecked ? 'check-square' : 'square'} size={15} color={isChecked ? '#38BDF8' : tColor.muted} />
                              <Text style={{ color: isChecked ? tColor.text : tColor.muted, fontSize: 12.5, fontWeight: '800' }}>
                                {evItem.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
                        <TouchableOpacity
                          style={[styles.primaryButton, { backgroundColor: '#0EA5E9', flex: 1, flexDirection: 'row', gap: 8, paddingVertical: 15 }]}
                          onPress={handleSaveTelegramChannel}
                          disabled={isSavingTelegram}
                        >
                          <Feather name="save" size={16} color="#FFFFFF" />
                          <Text style={styles.primaryButtonText}>
                            {isSavingTelegram ? 'Guardando en BD...' : '💾 Guardar Canal de Telegram en BD'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.secondaryButton, { backgroundColor: 'rgba(16, 185, 129, 0.14)', borderColor: '#10B981', flex: 1, flexDirection: 'row', gap: 8, paddingVertical: 15 }]}
                          onPress={handleTestTelegramChannel}
                          disabled={isTestingTelegram}
                        >
                          <Feather name="send" size={16} color="#10B981" />
                          <Text style={{ color: '#10B981', fontWeight: '900', fontSize: 14 }}>
                            {isTestingTelegram ? 'Enviando prueba...' : '🔔 Enviar Alerta de Prueba al Consultorio'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : null}

                {agendaFilter === 'horarios' ? (
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
                      <Text style={[styles.sectionTitle, { color: tColor.text, marginBottom: 0 }]}>Horarios de Atención</Text>
                      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor }]} onPress={handleSaveHours} disabled={isSubmittingConfig}>
                        <Text style={styles.primaryButtonText}>{isSubmittingConfig ? 'Guardando...' : '💾 Guardar Horarios'}</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: tColor.muted, marginBottom: 24 }}>Apaga los días que no trabajes y ajusta tus horas de apertura y cierre.</Text>
                    <View style={[styles.bentoGrid, { gap: 16 }]}>
                      {daysOfWeekMap.map((dayObj) => {
                        const conf = localHours[dayObj.key] || { isOpen: true, open: '08:00', close: '18:00' };
                        return (
                          <View key={dayObj.key} style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, padding: 20, minWidth: isMobile ? '100%' : 280, flex: 1, opacity: conf.isOpen ? 1 : 0.55 }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                              <Text style={{ color: tColor.text, fontSize: 18, fontWeight: 'bold' }}>{dayObj.label}</Text>
                              <Switch 
                                value={conf.isOpen} 
                                onValueChange={(val) => setLocalHours({ ...localHours, [dayObj.key]: { ...conf, isOpen: val } })}
                                trackColor={{ false: '#3e3e3e', true: brandColor }}
                              />
                            </View>
                            {conf.isOpen ? (
                              <View style={{ flexDirection: 'row', gap: 12 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.inputLabel, { color: tColor.muted }]}>Apertura</Text>
                                  {Platform.OS === 'web' ? (
                                    <input type="time" className="web-input-override" value={conf.open} onChange={(e) => setLocalHours({ ...localHours, [dayObj.key]: { ...conf, open: e.target.value } })} />
                                  ) : (
                                    <TextInput
                                      style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, textAlign: 'center', fontWeight: '800' }]}
                                      value={conf.open}
                                      placeholder="08:00"
                                      placeholderTextColor={tColor.muted}
                                      onChangeText={(val) => setLocalHours({ ...localHours, [dayObj.key]: { ...conf, open: val } })}
                                    />
                                  )}
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.inputLabel, { color: tColor.muted }]}>Cierre</Text>
                                  {Platform.OS === 'web' ? (
                                    <input type="time" className="web-input-override" value={conf.close} onChange={(e) => setLocalHours({ ...localHours, [dayObj.key]: { ...conf, close: e.target.value } })} />
                                  ) : (
                                    <TextInput
                                      style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, textAlign: 'center', fontWeight: '800' }]}
                                      value={conf.close}
                                      placeholder="18:00"
                                      placeholderTextColor={tColor.muted}
                                      onChangeText={(val) => setLocalHours({ ...localHours, [dayObj.key]: { ...conf, close: val } })}
                                    />
                                  )}
                                </View>
                              </View>
                            ) : (
                              <Text style={{ color: tColor.muted, textAlign: 'center', fontWeight: 'bold', marginTop: 10 }}>CERRADO</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {/* 🌟 PESTAÑA FIDELIDAD + CAMPAÑAS PUSH (CON CAPITALIZACIÓN Y RESPALDO CONFIG) 🌟 */}
                {agendaFilter === 'fidelidad' ? (
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
                      <Text style={[styles.sectionTitle, { color: tColor.text, marginBottom: 0 }]}>Programas de Retención</Text>
                      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor }]} onPress={handleSaveLoyalty} disabled={isSubmittingLoyalty}>
                        <Text style={styles.primaryButtonText}>{isSubmittingLoyalty ? 'Guardando...' : '💾 Guardar Reglas'}</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: tColor.muted, marginBottom: 24 }}>Atrae nuevos clientes y retén a los que ya tienes con estas herramientas automatizadas.</Text>
                    
                    <View style={styles.bentoGrid}>
                      <View style={[styles.flexCard, { backgroundColor: tColor.card, borderColor: tColor.border }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: tColor.border }}>
                          <View style={{ flex: 1, paddingRight: 16 }}>
                            <Text style={{ color: tColor.text, fontSize: 18, fontWeight: 'bold' }}>1. Fidelización por Visitas 🎁</Text>
                            <Text style={{ color: tColor.muted, fontSize: 13, marginTop: 4 }}>Alerta al cobrar cuando el cliente alcanza la meta de visitas.</Text>
                          </View>
                          <Switch 
                            value={localLoyalty.isActive} 
                            onValueChange={(val) => setLocalLoyalty({ ...localLoyalty, isActive: val })}
                            trackColor={{ false: '#3e3e3e', true: brandColor }}
                          />
                        </View>

                        <View style={{ opacity: localLoyalty.isActive ? 1 : 0.5, pointerEvents: localLoyalty.isActive ? 'auto' : 'none' }}>
                          <View style={{ marginBottom: 20 }}>
                            <Text style={[styles.inputLabel, { color: tColor.muted }]}>Visitas Requeridas para el Premio</Text>
                            <TextInput 
                              style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]} 
                              placeholder="Ej: 10" 
                              keyboardType="numeric"
                              placeholderTextColor={tColor.muted} 
                              value={String(localLoyalty.visitsRequired)} 
                              onChangeText={t => setLocalLoyalty({ ...localLoyalty, visitsRequired: Number(t.replace(/\D/g, '')) || 0 })} 
                            />
                          </View>

                          <View style={{ marginBottom: 20 }}>
                            <Text style={[styles.inputLabel, { color: tColor.muted }]}>Tipo de Recompensa</Text>
                            {Platform.OS === 'web' ? (
                              <select className="web-input-override" value={localLoyalty.rewardType} onChange={e => setLocalLoyalty({ ...localLoyalty, rewardType: e.target.value as any })}>
                                <option value="free_service">Servicio Gratis (100% Descuento)</option>
                                <option value="discount">Porcentaje de Descuento</option>
                              </select>
                            ) : (
                              <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]} value={localLoyalty.rewardType} editable={false} />
                            )}
                          </View>

                          {localLoyalty.rewardType === 'discount' ? (
                            <View style={{ marginBottom: 20 }}>
                              <Text style={[styles.inputLabel, { color: tColor.muted }]}>Porcentaje de Descuento (%)</Text>
                              <TextInput 
                                style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]} 
                                placeholder="Ej: 50" 
                                keyboardType="numeric"
                                placeholderTextColor={tColor.muted} 
                                value={String(localLoyalty.rewardValue)} 
                                onChangeText={t => setLocalLoyalty({ ...localLoyalty, rewardValue: Number(t.replace(/\D/g, '')) || 0 })} 
                              />
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <View style={[styles.flexCard, { backgroundColor: tColor.card, borderColor: tColor.border }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: tColor.border }}>
                          <View style={{ flex: 1, paddingRight: 16 }}>
                            <Text style={{ color: tColor.text, fontSize: 18, fontWeight: 'bold' }}>2. Programa de Referidos 🤝</Text>
                            <Text style={{ color: tColor.muted, fontSize: 13, marginTop: 4 }}>El cliente que refiere a un amigo nuevo gana un cupón de descuento y +1 Visita.</Text>
                          </View>
                          <Switch 
                            value={localLoyalty.referralActive || false} 
                            onValueChange={(val) => setLocalLoyalty({ ...localLoyalty, referralActive: val })}
                            trackColor={{ false: '#3e3e3e', true: brandColor }}
                          />
                        </View>

                        <View style={{ opacity: localLoyalty.referralActive ? 1 : 0.5, pointerEvents: localLoyalty.referralActive ? 'auto' : 'none' }}>
                           <View style={{ marginBottom: 20 }}>
                            <Text style={[styles.inputLabel, { color: tColor.muted }]}>Descuento para el Cliente que Refiere (%)</Text>
                            <TextInput 
                              style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]} 
                              placeholder="Ej: 20" 
                              keyboardType="numeric"
                              placeholderTextColor={tColor.muted} 
                              value={String(localLoyalty.referralDiscountPercent || 20)} 
                              onChangeText={t => setLocalLoyalty({ ...localLoyalty, referralDiscountPercent: Number(t.replace(/\D/g, '')) || 0 })} 
                            />
                            <Text style={{ color: tColor.muted, fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
                               Cuando el amigo referido asista a su cita, el cliente que lo recomendó recibirá este porcentaje de descuento para su propio servicio.
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* 🌟 3. CAMPAÑAS PUSH Y REACTIVACIÓN 🌟 */}
                    <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, marginTop: 28 }]}>
                      <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: tColor.border, gap: 12 }}>
                        <View>
                          <Text style={{ color: tColor.text, fontSize: 20, fontWeight: '900' }}>3. Campañas Push y Difusión de Retención 📢</Text>
                          <Text style={{ color: tColor.muted, fontSize: 13, marginTop: 4 }}>
                            Lanza campañas promocionales en tus meses bajos (Tabla: <Text style={{ color: brandColor, fontWeight: 'bold' }}>public.push_campaigns</Text>).
                          </Text>
                        </View>
                        <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', borderWidth: 1, borderColor: '#10B981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}>
                          <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '900' }}>📊 Mes sugerido: {monthlyTrafficStats.lowestMonthName}</Text>
                        </View>
                      </View>

                      <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 10 }]}>⚡ Plantillas Inteligentes (1 Clic):</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                        <TouchableOpacity
                          style={[styles.chip, { backgroundColor: tColor.input, borderColor: brandColor }]}
                          onPress={() => {
                            setCampaignTitle(toTitleCase(`🔥 Promo Especial De ${monthlyTrafficStats.lowestMonthName}`));
                            setCampaignAudience('all_clients');
                            setCampaignMessage(toTitleCase(`¡Agenda Tu Cita Esta Semana En ${tenantInfo?.name || 'Nuestro Local'} Y Recibe Un Beneficio Especial O Trae A Un Amigo Para Ganar Un ${localLoyalty.referralDiscountPercent || 20}% De Descuento!`));
                          }}
                        >
                          <Text style={{ color: brandColor, fontSize: 12, fontWeight: 'bold' }}>+ Activar Mes Bajo ({monthlyTrafficStats.lowestMonthName})</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.chip, { backgroundColor: tColor.input, borderColor: '#3B82F6' }]}
                          onPress={() => {
                            setCampaignTitle(toTitleCase('🏆 ¡Tienes Un Cupón De Referido Esperando!'));
                            setCampaignAudience('coupon_holders');
                            setCampaignMessage(toTitleCase(`¡Hola! Tienes Un Cupón De ${localLoyalty.referralDiscountPercent || 20}% De Descuento Disponible Por Haber Recomendado A Tus Amigos. Agenda Tu Cita Hoy Y Redímelo.`));
                          }}
                        >
                          <Text style={{ color: '#3B82F6', fontSize: 12, fontWeight: 'bold' }}>+ Recordar Cupones Sin Usar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.chip, { backgroundColor: tColor.input, borderColor: '#10B981' }]}
                          onPress={() => {
                            setCampaignTitle(toTitleCase('🎁 ¡Te Extrañamos! Suma Visitas A Tu Tarjeta VIP'));
                            setCampaignAudience('inactive_30d');
                            setCampaignMessage(toTitleCase(`Hace Más De 30 Días No Nos Visitas. ¡Reserva Tu Turno En Línea Y Sigue Sumando Puntos Para Tu Premio De Fidelidad!`));
                          }}
                        >
                          <Text style={{ color: '#10B981', fontSize: 12, fontWeight: 'bold' }}>+ Reactivar Inactivos (+30 días)</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginBottom: 16 }}>
                        <View style={{ flex: 2 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted }]}>Título de la Campaña (title)</Text>
                          <TextInput
                            style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]}
                            placeholder="Ej: 🔥 20% Off Esta Semana"
                            placeholderTextColor={tColor.muted}
                            value={campaignTitle}
                            onChangeText={(t) => setCampaignTitle(toTitleCase(t))}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted }]}>Audiencia Objetivo (target_audience)</Text>
                          {Platform.OS === 'web' ? (
                            <select className="web-input-override" value={campaignAudience} onChange={(e) => setCampaignAudience(e.target.value)}>
                              <option value="all_clients">👥 Todos los Clientes</option>
                              <option value="inactive_30d">⏳ Inactivos (+30 días)</option>
                              <option value="coupon_holders">🏆 Con Cupones de Referido</option>
                              <option value="vip_loyalty">🎁 Clientes VIP (Fidelidad)</option>
                            </select>
                          ) : (
                            <TextInput
                              style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]}
                              value={campaignAudience}
                              onChangeText={setCampaignAudience}
                            />
                          )}
                        </View>
                      </View>

                      <View style={{ marginBottom: 20 }}>
                        <Text style={[styles.inputLabel, { color: tColor.muted }]}>Mensaje de la Campaña (message)</Text>
                        <TextInput
                          style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, minHeight: 80 }]}
                          placeholder="Escribe El Mensaje Promocional..."
                          placeholderTextColor={tColor.muted}
                          multiline
                          value={campaignMessage}
                          onChangeText={(t) => setCampaignMessage(toTitleCase(t))}
                        />
                      </View>

                      <ContentTermsCheck value={acceptedContentTerms} onChange={setAcceptedContentTerms} tColor={tColor} brandColor={brandColor} />

                      <TouchableOpacity
                        style={[styles.primaryButton, { backgroundColor: brandColor, alignSelf: isMobile ? 'stretch' : 'flex-start', paddingHorizontal: 28 }]}
                        onPress={handleSendPushCampaign}
                        disabled={isSendingCampaign}
                      >
                        <Text style={styles.primaryButtonText}>{isSendingCampaign ? 'Enviando campaña...' : '🚀 Lanzar y Registrar Campaña Push'}</Text>
                      </TouchableOpacity>

                      <View style={{ marginTop: 28, paddingTop: 20, borderTopWidth: 1, borderTopColor: tColor.border }}>
                        <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 15, marginBottom: 12 }}>
                          📋 Historial de Campañas Enviadas ({pushCampaignsList.length})
                        </Text>
                        {pushCampaignsList.length === 0 ? (
                          <Text style={{ color: tColor.muted, fontSize: 13, fontStyle: 'italic' }}>
                            Aún no has enviado campañas desde este panel.
                          </Text>
                        ) : (
                          <View style={{ gap: 10 }}>
                            {pushCampaignsList.slice(0, 10).map((cmp, cmpIdx) => {
                              const isCampActive = cmp.is_active !== false;
                              return (
                                <View 
                                  key={`${cmp.id}-${cmpIdx}`} 
                                  style={{ 
                                    backgroundColor: tColor.input, 
                                    padding: 16, 
                                    borderRadius: 12, 
                                    borderWidth: 1, 
                                    borderColor: isCampActive ? tColor.border : 'rgba(239, 68, 68, 0.25)', 
                                    opacity: isCampActive ? 1 : 0.6,
                                    flexDirection: isMobile ? 'column' : 'row', 
                                    justifyContent: 'space-between', 
                                    alignItems: isMobile ? 'flex-start' : 'center', 
                                    gap: 12 
                                  }}
                                >
                                  <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                      <Text style={[{ color: tColor.text, fontWeight: '900', fontSize: 14 }, !isCampActive ? { textDecorationLine: 'line-through' } : {}]}>
                                        {toTitleCase(cmp.title)}
                                      </Text>
                                      <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                                        <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: 'bold' }}>{cmp.target_audience}</Text>
                                      </View>
                                      <Text style={{ color: tColor.muted, fontSize: 11, fontWeight: 'bold' }}>
                                        🕒 {cmp.sent_at ? new Date(cmp.sent_at).toLocaleDateString('es-ES') : 'Enviada'}
                                      </Text>
                                    </View>
                                    <Text style={{ color: tColor.muted, fontSize: 12.5 }}>{toTitleCase(cmp.message)}</Text>
                                  </View>

                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    {isCampActive ? (
                                      <TouchableOpacity
                                        style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: '#F59E0B', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 }}
                                        onPress={() => triggerBrowserLocalNotification(toTitleCase(cmp.title), toTitleCase(cmp.message))}
                                      >
                                        <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '900' }}>🔔 Probar Push</Text>
                                      </TouchableOpacity>
                                    ) : null}

                                    <TouchableOpacity
                                      style={isCampActive ? styles.activeStatusBadge : styles.inactiveStatusBadge}
                                      onPress={() => handleToggleCampaignStatus(cmp.id, isCampActive)}
                                    >
                                      <Text style={isCampActive ? styles.activeStatusText : styles.inactiveStatusText}>
                                        {isCampActive ? 'ACTIVA' : 'INACTIVA'}
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ) : null}

                {agendaFilter === 'portafolio' ? (
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
                      <Text style={[styles.sectionTitle, { color: tColor.text, marginBottom: 0 }]}>Portafolio Visual</Text>
                      {!isAddingPortfolio ? (
                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor }]} onPress={() => setIsAddingPortfolio(true)}>
                          <Text style={styles.primaryButtonText}>+ Agregar Trabajo</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <Text style={{ color: tColor.muted, marginBottom: 24 }}>Sube imágenes de tus mejores trabajos y ponles un título atractivo.</Text>

                    {isAddingPortfolio ? (
                      <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, width: '100%', maxWidth: isMobile ? '100%' : 760, alignSelf: 'center', padding: isMobile ? 20 : 32 }]}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: tColor.text, marginBottom: 20 }}>
                          {portfolioEditingIndex !== null ? (isLegal ? 'Editar Caso / Publicación' : 'Editar Trabajo') : (isLegal ? 'Nuevo Caso de Éxito / Publicación' : 'Nuevo Trabajo')}
                        </Text>
                        
                        <View style={{ marginBottom: 20 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted }]}>
                            {isLegal ? 'Imagen o Documento Visual' : 'Foto del Trabajo'} {portfolioEditingIndex !== null && '(Opcional cambiar)'}
                          </Text>
                          {!portfolioFormPreview ? (
                            <View style={{ marginTop: 8 }}>
                              {Platform.OS === 'web' ? (
                                <input type="file" ref={portfolioInputRef as any} accept="image/*" style={{ display: 'none' }} onChange={handlePortfolioImageSelect} />
                              ) : null}
                              <TouchableOpacity
                                style={{ alignItems: 'center', justifyContent: 'center', padding: 24, borderWidth: 2, borderColor: tColor.border, borderRadius: 12, backgroundColor: tColor.input, borderStyle: 'dashed' }}
                                onPress={() => Platform.OS === 'web' ? portfolioInputRef.current?.click() : handleNativeImagePick('portfolio')}
                              >
                                <Text style={{ fontSize: 32, marginBottom: 8 }}>📸</Text>
                                <Text style={{ color: tColor.muted, fontSize: 14, fontWeight: 'bold' }}>Toca para subir imagen</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={{ position: 'relative', width: '100%', height: 220, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: tColor.border, marginTop: 8, backgroundColor: '#000' }}>
                              {(portfolioFormPreview.startsWith('blob:') || portfolioFormPreview.startsWith('file:') || portfolioFormPreview.startsWith('ph:') || portfolioFormPreview.startsWith('content:')) ? (
                                Platform.OS === 'web' ? <img src={portfolioFormPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Image source={{ uri: portfolioFormPreview }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                              ) : (
                                <PrivateSupabaseImage path={portfolioFormPreview} alt="Preview" />
                              )}
                              <TouchableOpacity style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }} onPress={() => { setPortfolioFormPreview(null); setPortfolioFormFile(null); }}>
                                <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>

                        <View style={{ marginBottom: 16 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                            <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 0 }]}>
                              {isLegal ? 'Título del Caso o Área de Práctica' : 'Título del Trabajo'}
                            </Text>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => setIsPortfolioTitleDropdownOpen((prev) => !prev)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 5,
                                paddingVertical: 4,
                                paddingHorizontal: 10,
                                borderRadius: 8,
                                backgroundColor: `${brandColor}18`,
                                borderWidth: 1,
                                borderColor: `${brandColor}50`,
                              }}
                            >
                              <Feather name="list" size={12} color={brandColor} />
                              <Text style={{ color: brandColor, fontSize: 11.5, fontWeight: '900' }}>
                                {isPortfolioTitleDropdownOpen ? 'Ocultar sugeridos' : 'Elegir trabajo sugerido'}
                              </Text>
                              <Feather name={isPortfolioTitleDropdownOpen ? 'chevron-up' : 'chevron-down'} size={13} color={brandColor} />
                            </TouchableOpacity>
                          </View>

                          {isPortfolioTitleDropdownOpen ? (
                            <View
                              style={{
                                marginBottom: 12,
                                backgroundColor: theme === 'dark' ? '#0B0F17' : '#FFFFFF',
                                borderWidth: 1,
                                borderColor: tColor.border,
                                borderRadius: 14,
                                padding: 8,
                                gap: 6,
                              }}
                            >
                              <Text style={{ color: tColor.muted, fontSize: 11, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2 }}>
                                ⚡ Toca uno para autocompletar título y descripción del trabajo:
                              </Text>
                              {availableServiceTemplates.map((tpl, idx) => {
                                const isSelectedWork = portfolioFormTitle.toLowerCase() === tpl.name.toLowerCase();
                                return (
                                  <TouchableOpacity
                                    key={`port-tpl-${tpl.name}-${idx}`}
                                    activeOpacity={0.8}
                                    onPress={() => {
                                      setPortfolioFormTitle(toTitleCase(tpl.name));
                                      setPortfolioFormDesc(toTitleCase(tpl.desc));
                                      setIsPortfolioTitleDropdownOpen(false);
                                    }}
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      paddingVertical: 10,
                                      paddingHorizontal: 12,
                                      borderRadius: 10,
                                      backgroundColor: isSelectedWork ? `${brandColor}22` : tColor.input,
                                      borderWidth: 1,
                                      borderColor: isSelectedWork ? brandColor : 'transparent',
                                    }}
                                  >
                                    <View style={{ flex: 1, paddingRight: 8 }}>
                                      <Text style={{ color: isSelectedWork ? brandColor : tColor.text, fontWeight: '800', fontSize: 13.5 }}>
                                        {tpl.name}
                                      </Text>
                                      <Text style={{ color: tColor.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                                        ✨ {tpl.desc}
                                      </Text>
                                    </View>
                                    <Ionicons
                                      name={isSelectedWork ? 'checkmark-circle' : 'add-circle-outline'}
                                      size={18}
                                      color={isSelectedWork ? brandColor : tColor.muted}
                                    />
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ) : null}

                          <TextInput 
                            style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]} 
                            placeholder={isLegal ? 'Escribe el título o elige uno arriba (Ej: Residencia Aprobada)...' : isDental ? 'Escribe el título o elige uno arriba (Ej: Diseño De Sonrisa)...' : isAutomotive ? 'Escribe el título o elige uno arriba (Ej: Reparación De Motor)...' : 'Escribe el título o elige uno arriba (Ej: Fade + Barba)...'} 
                            placeholderTextColor={tColor.muted} 
                            value={portfolioFormTitle} 
                            onChangeText={t => setPortfolioFormTitle(toTitleCase(t))} 
                          />
                        </View>
                        
                        <View style={{ marginBottom: 24 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted }]}>Descripción Detallada (Opcional)</Text>
                          <TextInput 
                            style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, minHeight: 70 }]} 
                            placeholder={isLegal ? 'Ej: Asesoría Integral Y Representación Ante Corte...' : isDental ? 'Ej: Tratamiento Estético En 2 Sesiones Sin Dolor...' : isAutomotive ? 'Ej: Diagnóstico Computarizado Y Repuestos Originales...' : 'Ej: Incluye Vapor De Ozono Y Toalla Caliente...'} 
                            placeholderTextColor={tColor.muted} 
                            multiline
                            value={portfolioFormDesc} 
                            onChangeText={t => setPortfolioFormDesc(toTitleCase(t))} 
                          />
                        </View>

                        <ContentTermsCheck value={acceptedContentTerms} onChange={setAcceptedContentTerms} tColor={tColor} brandColor={brandColor} />

                        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
                           <TouchableOpacity style={[styles.secondaryButton, { flex: 1, backgroundColor: tColor.input, borderColor: tColor.border }]} onPress={handleCancelPortfolioForm}>
                            <Text style={[styles.secondaryButtonText, { color: tColor.text }]}>Cancelar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.primaryButton, { flex: 1, backgroundColor: brandColor }]} onPress={handleSavePortfolioItem} disabled={isSubmittingConfig}>
                            <Text style={styles.primaryButtonText}>{isSubmittingConfig ? 'Guardando...' : '💾 Guardar'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.bentoGrid}>
                        {localPortfolio.length === 0 ? (
                          <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, width: '100%', alignItems: 'center', padding: 48 }]}>
                            <Text style={{ fontSize: 48, marginBottom: 16 }}>📸</Text>
                            <Text style={{ color: tColor.text, fontSize: 18, fontWeight: 'bold' }}>Aún no tienes fotos en tu portafolio.</Text>
                          </View>
                        ) : (
                          localPortfolio.map((item, idx) => (
                            <View key={idx} style={{ position: 'relative', width: isMobile ? '100%' : 250, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: tColor.border, backgroundColor: tColor.card }}>
                              <TouchableOpacity style={{ width: '100%', height: 280, backgroundColor: tColor.input }} onPress={() => setExpandedImage({ path: item.url, alt: item.title })}>
                                <PrivateSupabaseImage path={item.url} alt={item.title || `Portafolio ${idx}`} />
                              </TouchableOpacity>
                              <View style={{ padding: 16 }}>
                                <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 16, marginBottom: 4 }}>{toTitleCase(item.title)}</Text>
                                {item.description ? (
                                  <Text style={{ color: tColor.muted, fontSize: 13, marginBottom: 8 }} numberOfLines={2}>{toTitleCase(item.description)}</Text>
                                ) : null}
                              </View>

                              <TouchableOpacity style={{ position: 'absolute', top: 12, right: 56, backgroundColor: tColor.input, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: tColor.border }} onPress={() => handleEditPortfolioItem(idx)}>
                                <Text style={{ fontSize: 14 }}>✏️</Text>
                              </TouchableOpacity>

                              <TouchableOpacity style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(239, 68, 68, 0.9)', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFF' }} onPress={() => handleRemovePortfolioItem(idx)}>
                                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          ))
                        )}
                      </View>
                    )}
                  </View>
                ) : null}

                {agendaFilter === 'catalogo' ? (
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                      <Text style={[styles.sectionTitle, { color: tColor.text }]}>Gestión de Catálogo</Text>
                      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor }]} onPress={() => { 
                        setCatalogEditingId(null); 
                        setCatalogFormName(''); 
                        setCatalogFormDesc('');
                        setCatalogFormPrice(''); 
                        setCatalogFormDuration('30'); 
                        setCatalogFormPreview(null);
                        setCatalogFormFile(null);
                        setIsCatalogModalVisible(true); 
                      }}>
                        <Text style={styles.primaryButtonText}>+ Nuevo Servicio</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.bentoGrid}>
                      {servicesList.length === 0 ? (
                        <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, width: '100%', alignItems: 'center', padding: 48 }]}>
                          <Text style={{ fontSize: 48, marginBottom: 16 }}>📋</Text>
                          <Text style={{ color: tColor.text, fontSize: 18, fontWeight: 'bold' }}>Tu catálogo está vacío</Text>
                        </View>
                      ) : (
                        servicesList.map((srv, idx) => (
                          <View key={`${srv.id}-${idx}`} style={[styles.flexCard, { backgroundColor: tColor.card, borderColor: tColor.border, minWidth: isMobile ? '100%' : 320, padding: 0, overflow: 'hidden' }, srv.isActive === false ? { opacity: 0.5 } : {}]}>
                            {srv.imageUrl ? (
                              <TouchableOpacity style={{ width: '100%', height: 180, backgroundColor: tColor.input, borderBottomWidth: 1, borderColor: tColor.border }} onPress={() => setExpandedImage({ path: srv.imageUrl!, alt: srv.name })}>
                                <PrivateSupabaseImage path={srv.imageUrl} alt={srv.name} />
                              </TouchableOpacity>
                            ) : null}
                            <View style={{ padding: 24 }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Text style={[styles.cardTitle, { color: tColor.text, marginBottom: 8 }, srv.isActive === false ? { textDecorationLine: 'line-through' } : {}]}>{toTitleCase(srv.name)}</Text>
                                <TouchableOpacity style={srv.isActive !== false ? styles.activeStatusBadge : styles.inactiveStatusBadge} onPress={() => handleToggleServiceStatus(srv.id, srv.isActive !== false)}>
                                  <Text style={srv.isActive !== false ? styles.activeStatusText : styles.inactiveStatusText}>{srv.isActive !== false ? 'ACTIVO' : 'INACTIVO'}</Text>
                                </TouchableOpacity>
                              </View>
                              
                              {srv.description ? (
                                <Text style={{ color: tColor.muted, marginBottom: 16, lineHeight: 22 }}>{toTitleCase(srv.description)}</Text>
                              ) : (
                                <Text style={{ color: tColor.muted, marginBottom: 16 }}>⏱️ {srv.durationMinutes || 30} minutos</Text>
                              )}
                              
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', borderTopWidth: 1, borderColor: tColor.border, paddingTop: 16 }}>
                                <Text style={{ fontSize: 24, fontWeight: '900', color: brandColor }}>${srv.price}</Text>
                                <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: tColor.input, borderColor: tColor.border }]} onPress={() => handleEditCatalogService(srv)}>
                                  <Text style={[styles.secondaryButtonText, { color: tColor.text }]}>Editar</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                ) : null}

                {(agendaFilter === 'today' || agendaFilter === 'upcoming') ? (
                  <View style={styles.bentoGrid}>
                    {activeOrdersList.length === 0 ? (
                      <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border }]}><Text style={{ color: tColor.muted, textAlign: 'center' }}>No hay órdenes programadas.</Text></View>
                    ) : (
                      activeOrdersList.map((order, idx) => {
                        const orderPhoneClean = cleanPhoneDigits(order.clientPhone);
                        const earnedInDb = Number(order.clientMetadata?.earnedReferralDiscounts || 0);
                        const liveReferredFriends = orderPhoneClean ? (pendingReferralsByPhone[orderPhoneClean] || []) : [];
                        const totalReferrerCoupons = Math.max(0, earnedInDb + liveReferredFriends.length);

                        return (
                          <View key={`${order.id}-${idx}`} style={[styles.flexCard, { backgroundColor: tColor.card, borderColor: tColor.border, minWidth: isMobile ? '100%' : 320 }]}>
                            <View style={styles.orderHeader}>
                              {isAutomotive ? (
                                <View style={[styles.plateBadge, { backgroundColor: brandColor }]}><Text style={styles.plateText}>{order.plate || order.metadata?.carPlate || 'N/A'}</Text></View>
                              ) : (
                                <View style={[styles.plateBadge, { backgroundColor: brandColor }]}><Text style={styles.plateText}>🎫 Turno {idx + 1}</Text></View>
                              )}
                              <View style={[styles.statusBadge, { backgroundColor: tColor.input }]}><Text style={[styles.statusDot, { color: brandColor }]}>●</Text><Text style={{ color: tColor.text, fontSize: 12, fontWeight: 'bold' }}>{formatWallClockTime12h(order)}</Text></View>
                            </View>
                            
                            <View style={styles.orderDetails}>
                              {((order.metadata?.referredBy && order.metadata.referredBy.trim() !== '') || (order.metadata?.preferences?.referredBy && order.metadata.preferences.referredBy.trim() !== '')) ? (
                                <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12, borderWidth: 1, borderColor: '#10B981' }}>
                                  <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '900', marginBottom: 2 }}>🤝 RECOMENDADO POR: {order.metadata.referredBy || order.metadata.preferences.referredBy}</Text>
                                  <Text style={{ color: tColor.text, fontSize: 10 }}>Al cerrar esta orden se acreditará el {tenantInfo?.loyaltyConfig?.referralDiscountPercent || 20}% de descuento al referidor.</Text>
                                </View>
                              ) : null}

                              {(totalReferrerCoupons > 0) ? (
                                <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12, borderWidth: 1, borderColor: '#3B82F6' }}>
                                  <Text style={{ color: '#3B82F6', fontSize: 11, fontWeight: '900', marginBottom: 2 }}>
                                    🏆 CUPÓN POR REFERIR ({totalReferrerCoupons} disp.){liveReferredFriends.length > 0 ? ` — Refirió a: ${liveReferredFriends.join(', ')}` : ''}
                                  </Text>
                                  <Text style={{ color: tColor.text, fontSize: 10 }}>¡Este cliente recomendó a un amigo! Aplica su {tenantInfo?.loyaltyConfig?.referralDiscountPercent || 20}% de descuento al cobrar.</Text>
                                </View>
                              ) : null}

                              {isAutomotive ? (
                                <>
                                  <Text style={{ fontSize: 20, fontWeight: '800', color: tColor.text, marginBottom: 4 }}>{toTitleCase(order.metadata?.carBrand || order.brand || '')} {toTitleCase(order.metadata?.carModel || order.model || '')}</Text>
                                  <Text style={{ fontSize: 14, color: tColor.muted }}>Cliente: <Text style={{ fontWeight: 'bold', color: tColor.text }}>{toTitleCase(order.clientName || '')}</Text></Text>
                                </>
                              ) : (
                                <>
                                  <Text style={{ fontSize: 20, fontWeight: '800', color: tColor.text, marginBottom: 4 }}>{toTitleCase(order.clientName || 'Cliente')}</Text>
                                  <Text style={{ fontSize: 14, color: tColor.muted }}>Contacto: <Text style={{ fontWeight: 'bold', color: tColor.text }}>{order.clientPhone || order.clientEmail || 'N/A'}</Text></Text>
                                </>
                              )}
                            </View>

                            <View style={[styles.serviceBox, { backgroundColor: tColor.input, borderColor: tColor.border }]}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                                <Text style={{ color: tColor.text, fontSize: 14, fontWeight: '700' }}>✨ {toTitleCase(order.service?.name || order.serviceType || 'Servicio General')}</Text>
                                {order.metadata?.bookedVia === 'vapi_voice_ai' ? (
                                  <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)', borderWidth: 1, borderColor: '#8B5CF6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Feather name="phone-incoming" size={11} color="#A78BFA" />
                                    <Text style={{ color: '#A78BFA', fontSize: 10, fontWeight: '900' }}>LLAMADA IA ({String(order.metadata?.callLanguage || 'ES').toUpperCase()})</Text>
                                  </View>
                                ) : null}
                              </View>

                              {/* Modalidad de la cita (Presencial, Llamada o Videollamada) */}
                              {order.metadata?.modality ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                  <Feather
                                    name={order.metadata.modality === 'phone_call' ? 'phone' : order.metadata.modality === 'video_call' ? 'video' : 'map-pin'}
                                    size={12}
                                    color="#3B82F6"
                                  />
                                  <Text style={{ color: '#3B82F6', fontSize: 12, fontWeight: '800' }}>
                                    Modalidad: {order.metadata.modality === 'phone_call' ? '📞 Llamada Telefónica' : order.metadata.modality === 'video_call' ? '💻 Videollamada' : '📍 Presencial en Oficina/Consultorio'}
                                  </Text>
                                </View>
                              ) : null}

                              {/* Datos de Triage Legal / Odontológico */}
                              {order.metadata?.caseType ? (
                                <Text style={{ color: tColor.text, fontSize: 12, fontWeight: '700', marginTop: 4 }}>
                                  {isLegal ? '⚖️ Área Legal:' : isDental ? '🦷 Motivo Dental:' : '📌 Motivo:'} <Text style={{ color: tColor.muted }}>{toTitleCase(order.metadata.caseType)}</Text>
                                </Text>
                              ) : null}
                              {order.metadata?.opposingParty ? (
                                <Text style={{ color: tColor.text, fontSize: 11.5, fontWeight: '700', marginTop: 2 }}>
                                  {isLegal ? '🛡️ Contraparte:' : '🏥 Seguro / Cobertura:'} <Text style={{ color: tColor.muted }}>{toTitleCase(order.metadata.opposingParty)}</Text>
                                </Text>
                              ) : null}
                              {order.metadata?.callSummary ? (
                                <View style={{ marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)', borderWidth: 1, borderColor: tColor.border }}>
                                  <Text style={{ color: '#A78BFA', fontSize: 10.5, fontWeight: '900', marginBottom: 2 }}>🤖 RESUMEN DE LA LLAMADA IA:</Text>
                                  <Text style={{ color: tColor.muted, fontSize: 11.5, fontStyle: 'italic', lineHeight: 16 }}>"{order.metadata.callSummary}"</Text>
                                </View>
                              ) : null}

                              {(() => {
                                const stfId = order.staffId || order.metadata?.assignedStaffId;
                                const stfObj = staffList.find(s => s.id === stfId);
                                const stfName = stfObj?.name || order.metadata?.assignedStaffName;
                                return stfName ? (
                                  <Text style={{ color: brandColor, fontSize: 12, fontWeight: '800', marginTop: 8 }}>
                                    👤 {staffTerm}: {toTitleCase(stfName)}
                                  </Text>
                                ) : (
                                  <Text style={{ color: tColor.muted, fontSize: 12, fontWeight: '600', marginTop: 8 }}>
                                    👤 {staffTerm}: Cualquiera disponible
                                  </Text>
                                );
                              })()}

                              {/* Botones rápidos: Escuchar Grabación de Vapi + Agregar a Google Calendar */}
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: tColor.border }}>
                                {order.metadata?.recordingUrl && Platform.OS === 'web' ? (
                                  <TouchableOpacity
                                    onPress={() => window.open(order.metadata.recordingUrl, '_blank')}
                                    style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', borderWidth: 1, borderColor: '#8B5CF6', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}
                                  >
                                    <Feather name="play-circle" size={12} color="#A78BFA" />
                                    <Text style={{ color: '#A78BFA', fontSize: 11, fontWeight: '900' }}>Escuchar Llamada</Text>
                                  </TouchableOpacity>
                                ) : null}
                                {Platform.OS === 'web' ? (
                                  <TouchableOpacity
                                    onPress={() => window.open(buildGoogleCalendarUrl(order, tenantInfo?.name), '_blank')}
                                    style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.4)', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}
                                  >
                                    <Feather name="calendar" size={12} color="#60A5FA" />
                                    <Text style={{ color: '#60A5FA', fontSize: 11, fontWeight: '800' }}>+ Google Calendar</Text>
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            </View>
                            {/* Estado de confirmación de asistencia (6h antes) */}
                            {(() => {
                              const isConfirmed = order.status === 'confirmed' || order.metadata?.attendanceConfirmed === true;
                              return (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: isConfirmed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)', borderWidth: 1, borderColor: isConfirmed ? '#10B981' : 'rgba(245, 158, 11, 0.4)' }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Feather name={isConfirmed ? 'check-circle' : 'clock'} size={13} color={isConfirmed ? '#10B981' : '#F59E0B'} />
                                    <Text style={{ color: isConfirmed ? '#10B981' : '#F59E0B', fontSize: 11.5, fontWeight: '900' }}>
                                      {isConfirmed ? 'Asistencia Confirmada' : 'Sin confirmar (Aviso 6h)'}
                                    </Text>
                                  </View>
                                  {!isConfirmed ? (
                                    <TouchableOpacity
                                      disabled={sendingReminderAptId === order.id}
                                      onPress={() => handleSendSixHourReminder(order)}
                                      style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 }}
                                    >
                                      <Text style={{ color: '#F59E0B', fontSize: 10.5, fontWeight: '900' }}>
                                        {sendingReminderAptId === order.id ? 'Enviando...' : '🔔 Recordar 6h'}
                                      </Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              );
                            })()}

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto' }}>
                              <TouchableOpacity
                                style={[styles.primaryButton, { backgroundColor: brandColor, flex: 1 }]}
                                onPress={() => handleOpenPOS(order)}
                              >
                                <Text style={styles.primaryButtonText}>📋 Completar Orden</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: '#EF4444', paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                                onPress={() => openCancelAppointmentModal(order, 'staff')}
                              >
                                <Feather name="x-circle" size={15} color="#EF4444" />
                                <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 13 }}>Cancelar</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                ) : null}

                {agendaFilter === 'reports' ? (
                  <View style={{ width: '100%', gap: isMobile ? 18 : 24 }}>
                    <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: 12, display: isPrinting ? 'none' : 'flex' }}>
                      <Text style={[styles.sectionTitle, { color: tColor.text, marginBottom: 0, fontSize: isMobile ? 20 : 22 }]}>Facturación y Analítica de Tráfico</Text>
                      <TouchableOpacity 
                        style={[styles.secondaryButton, { backgroundColor: showTrafficChart ? brandColor : tColor.input, borderColor: showTrafficChart ? brandColor : tColor.border, paddingVertical: 11, paddingHorizontal: 16 }]} 
                        onPress={() => setShowTrafficChart(!showTrafficChart)}
                      >
                        <Text style={[styles.secondaryButtonText, { color: showTrafficChart ? '#FFF' : tColor.text, fontSize: 13 }]}>
                          {showTrafficChart ? '📊 Ocultar Gráfica de Tráfico' : '📈 Ver Gráfica de Tráfico y Campañas'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    
                    <View style={{ flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', gap: isMobile ? 12 : 20, width: '100%', display: isPrinting ? 'none' : 'flex' }}>
                      <View style={[styles.glassCard, { flex: isMobile ? undefined : 1, minWidth: isMobile ? '100%' : 240, backgroundColor: tColor.card, borderColor: tColor.border, borderLeftWidth: 4, borderLeftColor: brandColor, padding: isMobile ? 18 : 24 }]}>
                        <Text style={[styles.kpiLabel, { color: tColor.muted }]}>TOTAL DE INGRESOS</Text>
                        <Text style={[styles.kpiValue, { color: tColor.text, fontSize: isMobile ? 28 : 36 }]}>${totalRevenue.toLocaleString('en-US')}</Text>
                      </View>
                      <View style={[styles.glassCard, { flex: isMobile ? undefined : 1, minWidth: isMobile ? '100%' : 240, backgroundColor: tColor.card, borderColor: tColor.border, padding: isMobile ? 18 : 24 }]}>
                        <Text style={[styles.kpiLabel, { color: tColor.muted }]}>SERVICIOS COMPLETADOS</Text>
                        <Text style={[styles.kpiValue, { color: tColor.text, fontSize: isMobile ? 28 : 36 }]}>{reportsData.length}</Text>
                      </View>
                      <View style={[styles.glassCard, { flex: isMobile ? undefined : 1, minWidth: isMobile ? '100%' : 240, backgroundColor: tColor.card, borderColor: tColor.border, borderLeftWidth: 4, borderLeftColor: '#3B82F6', padding: isMobile ? 18 : 24 }]}>
                        <Text style={[styles.kpiLabel, { color: tColor.muted }]}>PROMOS / REFERIDOS APLICADOS</Text>
                        <Text style={[styles.kpiValue, { color: '#3B82F6', fontSize: isMobile ? 28 : 36 }]}>
                          {reportsData.filter(r => getReportDiscountInfo(r, servicesList) !== null).length}
                        </Text>
                      </View>
                    </View>

                    {(showTrafficChart && !isPrinting) ? (
                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 18 : 24, width: '100%' }}>
                        <View style={[styles.glassCard, { flex: isMobile ? undefined : 2, width: '100%', backgroundColor: tColor.card, borderColor: tColor.border, padding: isMobile ? 18 : 24 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                            <View style={{ flex: 1, minWidth: 240 }}>
                              <Text style={{ color: tColor.text, fontSize: 18, fontWeight: '900' }}>📈 Tráfico Mensual y Recaudo ({new Date().getFullYear()})</Text>
                              <Text style={{ color: tColor.muted, fontSize: 12, marginTop: 2 }}>
                                💡 Pasa el mouse (o toca una barra) para ver los clientes atendidos y el recaudo detallado.
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' }} />
                                <Text style={{ color: tColor.muted, fontSize: 11 }}>Mes Pico</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: brandColor }} />
                                <Text style={{ color: tColor.muted, fontSize: 11 }}>Estándar</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' }} />
                                <Text style={{ color: tColor.muted, fontSize: 11 }}>Mes Bajo</Text>
                              </View>
                            </View>
                          </View>

                          <View style={{ 
                            minHeight: 78, 
                            backgroundColor: activeMonthTooltipData ? (theme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : '#FFFFFF') : tColor.input, 
                            borderRadius: 14, 
                            paddingVertical: 12, 
                            paddingHorizontal: 16, 
                            marginBottom: 16, 
                            borderWidth: 1, 
                            borderColor: activeMonthTooltipData ? brandColor : tColor.border,
                            flexDirection: isMobile ? 'column' : 'row',
                            justifyContent: 'space-between',
                            alignItems: isMobile ? 'flex-start' : 'center',
                            gap: 12,
                            overflow: 'hidden'
                          }}>
                            {activeMonthTooltipData ? (
                              <>
                                <View style={{ flex: 1, minWidth: 200 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                    <Text style={{ color: brandColor, fontWeight: '900', fontSize: 15, textTransform: 'uppercase' }}>
                                      📅 {activeMonthTooltipData.fullName} {new Date().getFullYear()}
                                    </Text>
                                    {activeMonthTooltipData.isLowest ? (
                                      <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#EF4444' }}>
                                        <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '900' }}>⚠️ MES MÁS BAJO</Text>
                                      </View>
                                    ) : null}
                                    {activeMonthTooltipData.isHighest ? (
                                      <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#10B981' }}>
                                        <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '900' }}>🔥 RÉCORD DE TRÁFICO</Text>
                                      </View>
                                    ) : null}
                                  </View>

                                  <Text style={{ color: tColor.text, fontSize: 12.5, fontWeight: '600', flexShrink: 1 }} numberOfLines={2}>
                                    👥 <Text style={{ fontWeight: '900' }}>{activeMonthTooltipData.uniqueUsersCount} cliente(s) único(s)</Text> ({activeMonthTooltipData.count} servicios):{' '}
                                    <Text style={{ color: tColor.muted }}>
                                      {activeMonthTooltipData.clientsList.length > 0 
                                        ? (activeMonthTooltipData.clientsList.slice(0, 4).join(', ') + (activeMonthTooltipData.clientsList.length > 4 ? ` y +${activeMonthTooltipData.clientsList.length - 4} más` : ''))
                                        : 'Sin clientes registrados en este mes'}
                                    </Text>
                                  </Text>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center', borderLeftWidth: isMobile ? 0 : 1, borderLeftColor: tColor.border, paddingLeft: isMobile ? 0 : 16, flexWrap: 'wrap' }}>
                                  <View>
                                    <Text style={{ color: tColor.muted, fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>Recaudo del Mes</Text>
                                    <Text style={{ color: '#10B981', fontSize: 20, fontWeight: '900' }}>
                                      ${activeMonthTooltipData.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </Text>
                                  </View>
                                  <View>
                                    <Text style={{ color: tColor.muted, fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>Ticket Prom.</Text>
                                    <Text style={{ color: tColor.text, fontSize: 15, fontWeight: '800' }}>
                                      ${activeMonthTooltipData.avgTicket}
                                    </Text>
                                  </View>
                                  {activeMonthTooltipData.promosUsed > 0 ? (
                                    <View>
                                      <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>Promos</Text>
                                      <Text style={{ color: '#3B82F6', fontSize: 15, fontWeight: '900' }}>
                                        🏆 {activeMonthTooltipData.promosUsed}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              </>
                            ) : (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <Text style={{ fontSize: 20 }}>👆</Text>
                                <Text style={{ color: tColor.muted, fontSize: 12.5, fontWeight: '600', flex: 1, flexWrap: 'wrap', lineHeight: 18 }}>
                                  Pasa el cursor sobre cualquiera de los 12 meses abajo para inspeccionar el <Text style={{ color: tColor.text, fontWeight: 'bold' }}>recaudo ($)</Text>, <Text style={{ color: tColor.text, fontWeight: 'bold' }}>usuarios atendidos</Text> y <Text style={{ color: tColor.text, fontWeight: 'bold' }}>ticket promedio</Text>.
                                </Text>
                              </View>
                            )}
                          </View>

                          <ScrollView
                            ref={trafficChartScrollRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            onLayout={() => {
                              const currentM = new Date().getMonth();
                              setHoveredMonthIdx((prev) => (prev === null ? currentM : prev));
                              if (currentM >= 5) {
                                setTimeout(() => {
                                  trafficChartScrollRef.current?.scrollTo({ x: Math.max(0, (currentM - 3) * 48), animated: true });
                                }, 120);
                              }
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 215, minWidth: 560, width: '100%', paddingTop: 36, paddingBottom: 8, gap: 10, borderBottomWidth: 1, borderColor: tColor.border }}>
                              {monthlyTrafficStats.items.map((m) => {
                                const isHovered = hoveredMonthIdx === m.index;
                                const barColor = m.isLowest ? '#EF4444' : (m.isHighest ? '#10B981' : (m.count > 0 ? brandColor : tColor.border));

                                return (
                                  <TouchableOpacity
                                    key={m.shortName}
                                    activeOpacity={0.85}
                                    onPress={() => setHoveredMonthIdx(isHovered ? null : m.index)}
                                    {...(Platform.OS === 'web' ? {
                                      onMouseEnter: () => setHoveredMonthIdx(m.index),
                                      onMouseLeave: () => setHoveredMonthIdx(null),
                                      className: 'chart-bar-col'
                                    } : {}) as any}
                                    style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', minWidth: 40, position: 'relative' }}
                                  >
                                    {isHovered ? (
                                      <View style={{ 
                                        position: 'absolute', 
                                        top: -30, 
                                        backgroundColor: '#0F172A', 
                                        paddingHorizontal: 7, 
                                        paddingVertical: 3, 
                                        borderRadius: 6, 
                                        borderWidth: 1, 
                                        borderColor: barColor,
                                        zIndex: 30,
                                        alignItems: 'center'
                                      }}>
                                        <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '900' }}>${m.revenue}</Text>
                                        <Text style={{ color: '#FFF', fontSize: 9, fontWeight: 'bold' }}>👥 {m.uniqueUsersCount}</Text>
                                      </View>
                                    ) : (
                                      <View style={{ alignItems: 'center', marginBottom: 4 }}>
                                        <Text style={{ color: m.count > 0 ? tColor.text : tColor.muted, fontSize: 10.5, fontWeight: '900' }}>
                                          {m.count > 0 ? `$${m.revenue}` : '0'}
                                        </Text>
                                        <Text style={{ color: tColor.muted, fontSize: 9, fontWeight: 'bold' }}>
                                          👥 {m.uniqueUsersCount}
                                        </Text>
                                      </View>
                                    )}

                                    <View 
                                      style={{ 
                                        width: isHovered ? '88%' : '72%', 
                                        maxWidth: 34,
                                        height: `${m.heightPct}%`, 
                                        backgroundColor: barColor, 
                                        borderRadius: 8,
                                        opacity: isHovered ? 1 : (m.count > 0 ? 0.9 : 0.3),
                                        borderWidth: isHovered ? 2 : 0,
                                        borderColor: '#FFFFFF'
                                      }} 
                                    />

                                    <Text style={{ 
                                      color: isHovered ? brandColor : (m.isLowest ? '#EF4444' : tColor.muted), 
                                      fontSize: 11.5, 
                                      fontWeight: isHovered || m.isLowest || m.isHighest ? '900' : 'bold', 
                                      marginTop: 8 
                                    }}>
                                      {m.shortName}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </ScrollView>
                        </View>

                        <View style={[styles.glassCard, { flex: isMobile ? undefined : 1, width: '100%', backgroundColor: tColor.card, borderColor: tColor.border, padding: isMobile ? 18 : 24, justifyContent: 'space-between' }]}>
                          <View>
                            <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12, borderWidth: 1, borderColor: '#EF4444' }}>
                              <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '900' }}>💡 ALERTA DE TRÁFICO PARA EL DUEÑO</Text>
                            </View>
                            <Text style={{ color: tColor.text, fontSize: 17, fontWeight: '900', marginBottom: 8 }}>
                              Mes con menor flujo: <Text style={{ color: '#EF4444' }}>{monthlyTrafficStats.lowestMonthName}</Text> ({monthlyTrafficStats.lowestMonthCount} servicios)
                            </Text>
                            <Text style={{ color: tColor.muted, fontSize: 13, lineHeight: 20, marginBottom: 16 }}>
                              {monthlyTrafficStats.highestMonthCount > 0 
                                ? `Tu mes más fuerte es ${monthlyTrafficStats.highestMonthName} (${monthlyTrafficStats.highestMonthCount} servicios). Para levantar las ventas en ${monthlyTrafficStats.lowestMonthName}, activa una campaña:`
                                : `A medida que cierres órdenes, aquí verás qué mes cae el tráfico para activar promociones inteligentes:`}
                            </Text>

                            <View style={{ backgroundColor: tColor.input, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: tColor.border, marginBottom: 16 }}>
                              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🚀 Campañas sugeridas:</Text>
                              <Text style={{ color: tColor.text, fontSize: 12, lineHeight: 18 }}>
                                • Subir el bono de referidos al <Text style={{ fontWeight: 'bold' }}>25% o 30%</Text> durante {monthlyTrafficStats.lowestMonthName}.{'\n'}
                                • Lanzar una campaña en <Text style={{ fontWeight: 'bold' }}>push_campaigns</Text> a tus clientes inactivos.
                              </Text>
                            </View>
                          </View>

                          <TouchableOpacity 
                            style={[styles.primaryButton, { backgroundColor: brandColor, paddingVertical: 13 }]} 
                            onPress={() => {
                              setCampaignTitle(toTitleCase(`🔥 Promo Especial De ${monthlyTrafficStats.lowestMonthName}`));
                              setCampaignAudience('all_clients');
                              setCampaignMessage(toTitleCase(`¡Reserva Tu Cita En ${tenantInfo?.name || 'Nuestro Local'} Este Mes Y Aprovecha Nuestros Beneficios VIP Y Descuentos Por Referir Amigos!`));
                              setAgendaFilter('fidelidad');
                            }}
                          >
                            <Text style={[styles.primaryButtonText, { fontSize: 13.5 }]}>🎁 Crear Campaña en Fidelidad</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}

                    <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, padding: isMobile ? 18 : 24, flexDirection: isMobile ? 'column' : 'row', gap: 14, alignItems: isMobile ? 'stretch' : 'flex-end', display: isPrinting ? 'none' : 'flex' }]}>
                      {Platform.OS !== 'web' ? (
                        /* 📅 SELECTOR DE FECHAS INTERACTIVO Y RANGOS RÁPIDOS PARA MÓVIL (SIN TECLADO NI "PASTE/SELECT") */
                        <View style={{ width: '100%', gap: 12 }}>
                          {/* Atajos rápidos de rango de fecha */}
                          <View>
                            <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 6 }]}>⚡ Periodo Rápido:</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                              {[
                                {
                                  label: 'Hoy',
                                  apply: () => {
                                    const now = new Date();
                                    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                                    setReportStartDate(iso);
                                    setReportEndDate(iso);
                                    setActiveReportDateField(null);
                                  },
                                },
                                {
                                  label: 'Últimos 7 Días',
                                  apply: () => {
                                    const end = new Date();
                                    const start = new Date();
                                    start.setDate(end.getDate() - 7);
                                    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                    setReportStartDate(fmt(start));
                                    setReportEndDate(fmt(end));
                                    setActiveReportDateField(null);
                                  },
                                },
                                {
                                  label: 'Este Mes',
                                  apply: () => {
                                    const now = new Date();
                                    const startIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                                    const endIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                                    setReportStartDate(startIso);
                                    setReportEndDate(endIso);
                                    setActiveReportDateField(null);
                                  },
                                },
                                {
                                  label: 'Últimos 30 Días',
                                  apply: () => {
                                    const end = new Date();
                                    const start = new Date();
                                    start.setDate(end.getDate() - 30);
                                    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                    setReportStartDate(fmt(start));
                                    setReportEndDate(fmt(end));
                                    setActiveReportDateField(null);
                                  },
                                },
                                {
                                  label: `Año ${new Date().getFullYear()}`,
                                  apply: () => {
                                    const yr = new Date().getFullYear();
                                    setReportStartDate(`${yr}-01-01`);
                                    setReportEndDate(`${yr}-12-31`);
                                    setActiveReportDateField(null);
                                  },
                                },
                              ].map((preset, pIdx) => (
                                <TouchableOpacity
                                  key={pIdx}
                                  activeOpacity={0.8}
                                  onPress={preset.apply}
                                  style={{
                                    paddingVertical: 7,
                                    paddingHorizontal: 12,
                                    borderRadius: 10,
                                    backgroundColor: tColor.input,
                                    borderWidth: 1,
                                    borderColor: tColor.border,
                                  }}
                                >
                                  <Text style={{ color: tColor.text, fontSize: 12, fontWeight: '800' }}>{preset.label}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>

                          {/* Botones Desde y Hasta que abren el calendario visual al tocarlos */}
                          <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.inputLabel, { color: tColor.muted }]}>Desde:</Text>
                              <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => {
                                  const next = activeReportDateField === 'start' ? null : 'start';
                                  setActiveReportDateField(next);
                                  if (next && reportStartDate) {
                                    const parts = reportStartDate.split('-').map(Number);
                                    if (parts[0] && parts[1]) setReportCalendarMonth(new Date(parts[0], parts[1] - 1, 1));
                                  }
                                }}
                                style={[
                                  styles.formInput,
                                  {
                                    backgroundColor: tColor.input,
                                    borderColor: activeReportDateField === 'start' ? brandColor : tColor.border,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingHorizontal: 12,
                                  },
                                ]}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                  <Feather name="calendar" size={15} color={brandColor} />
                                  <Text style={{ color: tColor.text, fontWeight: '800', fontSize: 13.5 }}>
                                    {reportStartDate || 'Elegir fecha'}
                                  </Text>
                                </View>
                                <Feather name={activeReportDateField === 'start' ? 'chevron-up' : 'chevron-down'} size={15} color={tColor.muted} />
                              </TouchableOpacity>
                            </View>

                            <View style={{ flex: 1 }}>
                              <Text style={[styles.inputLabel, { color: tColor.muted }]}>Hasta:</Text>
                              <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => {
                                  const next = activeReportDateField === 'end' ? null : 'end';
                                  setActiveReportDateField(next);
                                  if (next && reportEndDate) {
                                    const parts = reportEndDate.split('-').map(Number);
                                    if (parts[0] && parts[1]) setReportCalendarMonth(new Date(parts[0], parts[1] - 1, 1));
                                  }
                                }}
                                style={[
                                  styles.formInput,
                                  {
                                    backgroundColor: tColor.input,
                                    borderColor: activeReportDateField === 'end' ? brandColor : tColor.border,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingHorizontal: 12,
                                  },
                                ]}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                  <Feather name="calendar" size={15} color={brandColor} />
                                  <Text style={{ color: tColor.text, fontWeight: '800', fontSize: 13.5 }}>
                                    {reportEndDate || 'Elegir fecha'}
                                  </Text>
                                </View>
                                <Feather name={activeReportDateField === 'end' ? 'chevron-up' : 'chevron-down'} size={15} color={tColor.muted} />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Calendario mensual desplegable al tocar "Desde" o "Hasta" */}
                          {activeReportDateField ? (() => {
                            const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                            const dayHeaders = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
                            const yr = reportCalendarMonth.getFullYear();
                            const mo = reportCalendarMonth.getMonth();
                            const firstDayWeek = new Date(yr, mo, 1).getDay();
                            const daysInMonth = new Date(yr, mo + 1, 0).getDate();
                            const selectedIso = activeReportDateField === 'start' ? reportStartDate : reportEndDate;

                            const cells: (number | null)[] = [];
                            for (let i = 0; i < firstDayWeek; i++) cells.push(null);
                            for (let d = 1; d <= daysInMonth; d++) cells.push(d);

                            return (
                              <View
                                style={{
                                  backgroundColor: theme === 'dark' ? '#0B0F17' : '#FFFFFF',
                                  borderWidth: 1.5,
                                  borderColor: brandColor,
                                  borderRadius: 16,
                                  padding: 14,
                                  marginTop: 4,
                                }}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                  <TouchableOpacity
                                    onPress={() => setReportCalendarMonth(new Date(yr, mo - 1, 1))}
                                    style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: tColor.input, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: tColor.border }}
                                  >
                                    <Feather name="chevron-left" size={16} color={tColor.text} />
                                  </TouchableOpacity>

                                  <View style={{ alignItems: 'center' }}>
                                    <Text style={{ color: brandColor, fontSize: 10.5, fontWeight: '900', textTransform: 'uppercase' }}>
                                      Seleccionando fecha {activeReportDateField === 'start' ? 'DESDE' : 'HASTA'}
                                    </Text>
                                    <Text style={{ color: tColor.text, fontSize: 15, fontWeight: '900', marginTop: 2 }}>
                                      {monthNames[mo]} {yr}
                                    </Text>
                                  </View>

                                  <TouchableOpacity
                                    onPress={() => setReportCalendarMonth(new Date(yr, mo + 1, 1))}
                                    style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: tColor.input, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: tColor.border }}
                                  >
                                    <Feather name="chevron-right" size={16} color={tColor.text} />
                                  </TouchableOpacity>
                                </View>

                                <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                                  {dayHeaders.map((dh) => (
                                    <View key={dh} style={{ flex: 1, alignItems: 'center' }}>
                                      <Text style={{ color: tColor.muted, fontSize: 11, fontWeight: '800' }}>{dh}</Text>
                                    </View>
                                  ))}
                                </View>

                                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                  {cells.map((dayNum, cIdx) => {
                                    if (!dayNum) {
                                      return <View key={`empty-${cIdx}`} style={{ width: '14.28%', height: 38 }} />;
                                    }
                                    const isoStr = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                                    const isSel = selectedIso === isoStr;
                                    const isInRange = reportStartDate && reportEndDate && isoStr >= reportStartDate && isoStr <= reportEndDate;

                                    return (
                                      <TouchableOpacity
                                        key={isoStr}
                                        activeOpacity={0.8}
                                        onPress={() => {
                                          if (activeReportDateField === 'start') {
                                            setReportStartDate(isoStr);
                                            if (reportEndDate && isoStr > reportEndDate) {
                                              setReportEndDate(isoStr);
                                            }
                                            setActiveReportDateField('end');
                                          } else {
                                            setReportEndDate(isoStr);
                                            if (reportStartDate && isoStr < reportStartDate) {
                                              setReportStartDate(isoStr);
                                            }
                                            setActiveReportDateField(null);
                                          }
                                        }}
                                        style={{
                                          width: '14.28%',
                                          height: 38,
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          borderRadius: 10,
                                          backgroundColor: isSel
                                            ? brandColor
                                            : isInRange
                                            ? `${brandColor}22`
                                            : 'transparent',
                                        }}
                                      >
                                        <Text
                                          style={{
                                            color: isSel ? '#FFFFFF' : isInRange ? brandColor : tColor.text,
                                            fontWeight: isSel || isInRange ? '900' : '600',
                                            fontSize: 13,
                                          }}
                                        >
                                          {dayNum}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>

                                <TouchableOpacity
                                  onPress={() => setActiveReportDateField(null)}
                                  style={{ marginTop: 10, paddingVertical: 8, alignItems: 'center', borderRadius: 10, backgroundColor: tColor.input }}
                                >
                                  <Text style={{ color: tColor.muted, fontSize: 12, fontWeight: '800' }}>Cerrar Calendario</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })() : null}
                        </View>
                      ) : (
                        <>
                          <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1, minWidth: 140 }}>
                            <Text style={[styles.inputLabel, { color: tColor.muted }]}>Desde:</Text>
                            <input type="date" className="web-input-override" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} />
                          </View>
                          <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1, minWidth: 140 }}>
                            <Text style={[styles.inputLabel, { color: tColor.muted }]}>Hasta:</Text>
                            <input type="date" className="web-input-override" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} />
                          </View>
                        </>
                      )}
                      <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1, minWidth: 140 }}>
                        <Text style={[styles.inputLabel, { color: tColor.muted }]}>Filtrar Personal:</Text>
                        {Platform.OS === 'web' ? (
                          <select className="web-input-override" value={reportMechanic} onChange={(e) => setReportMechanic(e.target.value)}>
                            <option value="">Todo el personal</option>
                            {staffList.map((m, idx) => <option key={`${m.id}-${idx}`} value={m.id}>{m.name}</option>)}
                          </select>
                        ) : (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <TouchableOpacity style={[styles.chip, { backgroundColor: tColor.input, borderColor: tColor.border }, !reportMechanic ? { backgroundColor: brandColor, borderColor: brandColor } : {}]} onPress={() => setReportMechanic('')}><Text style={[styles.chipText, { color: tColor.muted }, !reportMechanic ? styles.activeChipText : {}]}>Todos</Text></TouchableOpacity>
                            {staffList.map((m, idx) => (
                              <TouchableOpacity key={`${m.id}-${idx}`} style={[styles.chip, { backgroundColor: tColor.input, borderColor: tColor.border }, reportMechanic === m.id ? { backgroundColor: brandColor, borderColor: brandColor } : {}]} onPress={() => setReportMechanic(m.id)}>
                                <Text style={[styles.chipText, { color: tColor.muted }, reportMechanic === m.id ? styles.activeChipText : {}]}>{m.name}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        )}
                      </View>
                      
                      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor, height: 48, paddingHorizontal: 24, justifyContent: 'center' }]} onPress={() => { setReportPage(1); loadReports(); }}>
                        <Text style={styles.primaryButtonText}>🔍 Filtrar</Text>
                      </TouchableOpacity>
                      
                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
                        <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: tColor.input, borderColor: tColor.border, height: 48, paddingHorizontal: 16 }]} onPress={exportToCSV}>
                          <Text style={[styles.secondaryButtonText, { color: tColor.text }]}>📥 CSV</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.primaryButton, { height: 48, backgroundColor: brandColor, paddingHorizontal: 16 }]} onPress={exportToPDF}>
                          <Text style={styles.primaryButtonText}>🖨️ PDF</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {(isPrinting && Platform.OS === 'web') ? (
                       <View style={{ marginBottom: 20, paddingBottom: 20, borderBottomWidth: 2, borderColor: '#000' }}>
                         <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#000' }}>Reporte de Servicios Oficial</Text>
                         <Text style={{ fontSize: 14, color: '#333', marginTop: 8 }}>Periodo: {new Date(reportStartDate).toLocaleDateString('es-ES')} al {new Date(reportEndDate).toLocaleDateString('es-ES')}</Text>
                         <Text style={{ fontSize: 14, color: '#333' }}>Personal: {reportMechanic ? staffList.find(m => m.id === reportMechanic)?.name : 'Todos'}</Text>
                         <View style={{ flexDirection: 'row', gap: 32, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderColor: '#CCC' }}>
                            <Text style={{ fontWeight: 'bold', color: '#000' }}>Total de Ingresos: ${totalRevenue.toLocaleString('en-US')}</Text>
                            <Text style={{ fontWeight: 'bold', color: '#000' }}>Servicios: {reportsData.length}</Text>
                         </View>
                       </View>
                    ) : null}

                    <View style={[styles.glassCard, { backgroundColor: tColor.card, borderColor: tColor.border, padding: 0, overflow: 'hidden' }, isPrinting ? { backgroundColor: 'transparent', borderWidth: 0, overflow: 'visible' } : {}]}>
                      {Platform.OS === 'web' ? (
                        <div className="table-responsive">
                          <table className="glass-table">
                            <thead>
                              <tr>
                                <th>FECHA</th>
                                <th>{isAutomotive ? 'PLACA / PROMO' : 'ID REF / BENEFICIO'}</th>
                                <th>CLIENTE</th>
                                <th>SERVICIO</th>
                                <th>PERSONAL</th>
                                <th>VALOR ($)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reportsData.length > 0 ? (
                                paginatedReports.map((r: any, i: number) => {
                                  if (r._empty) {
                                    return (
                                      <tr key={`empty-${i}`} className="empty-row">
                                        <td className="text-transparent">-</td>
                                        <td className="text-transparent">-</td>
                                        <td className="text-transparent">-</td>
                                        <td className="text-transparent">-</td>
                                        <td className="text-transparent">-</td>
                                        <td className="text-transparent">-</td>
                                      </tr>
                                    );
                                  }

                                  const discountBadge = getReportDiscountInfo(r, servicesList);

                                  return (
                                    <tr key={`${r.id || 'row'}-${i}`}>
                                      <td>{r.date ? new Date(r.date).toLocaleDateString('es-ES') : (r.createdAt ? new Date(r.createdAt).toLocaleDateString('es-ES') : 'N/A')}</td>
                                      <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                          <strong>{isAutomotive ? (r.plate || 'N/A') : (r.id ? r.id.slice(0,6).toUpperCase() : 'N/A')}</strong>
                                          {discountBadge ? (
                                            <span style={{ 
                                              backgroundColor: discountBadge.bg, 
                                              color: discountBadge.color, 
                                              border: `1px solid ${discountBadge.color}`, 
                                              padding: '2px 8px', 
                                              borderRadius: '6px', 
                                              fontSize: '11px', 
                                              fontWeight: 900,
                                              letterSpacing: '0.3px'
                                            }}>
                                              {discountBadge.label}
                                            </span>
                                          ) : (
                                            <span style={{ color: tColor.muted, fontSize: '11px' }}>Tarifa Regular</span>
                                          )}
                                        </div>
                                      </td>
                                      <td>{toTitleCase(r.clientName || '')}</td>
                                      <td>{toTitleCase(r.service || '')}</td>
                                      <td className="text-muted" style={{ color: tColor.muted }}>{toTitleCase(r.mechanicName || 'Especialista')}</td>
                                      <td className="text-accent" style={{ color: discountBadge ? '#FFD700' : brandColor, fontWeight: 900 }}>
                                        ${Number(r.cost || r.finalCost || 0).toLocaleString('en-US')}
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: tColor.muted, fontWeight: 'bold', fontSize: '15px' }}>No hay registros en estas fechas.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        /* 📱 VISTA NATIVA MÓVIL DE REPORTES (iOS / ANDROID SIN CRUCES NI MENSAJES DE SOLO WEB) 📱 */
                        <View style={{ padding: 16, gap: 12 }}>
                          {reportsData.length > 0 ? (
                            reportsData
                              .slice((reportPage - 1) * ITEMS_PER_PAGE, reportPage * ITEMS_PER_PAGE)
                              .map((r: any, i: number) => {
                                const discountBadge = getReportDiscountInfo(r, servicesList);
                                const dateFormatted = r.date
                                  ? new Date(r.date).toLocaleDateString('es-ES')
                                  : r.createdAt
                                  ? new Date(r.createdAt).toLocaleDateString('es-ES')
                                  : 'N/A';

                                return (
                                  <View
                                    key={`${r.id || 'mob-row'}-${i}`}
                                    style={{
                                      backgroundColor: tColor.input,
                                      borderWidth: 1,
                                      borderColor: tColor.border,
                                      borderRadius: 14,
                                      padding: 14,
                                      gap: 8,
                                    }}
                                  >
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <View style={{ backgroundColor: `${brandColor}22`, borderWidth: 1, borderColor: `${brandColor}55`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                          <Text style={{ color: brandColor, fontSize: 11, fontWeight: '900' }}>
                                            {isAutomotive ? (r.plate || 'N/A') : (r.id ? r.id.slice(0, 6).toUpperCase() : 'ORD')}
                                          </Text>
                                        </View>
                                        <Text style={{ color: tColor.muted, fontSize: 12, fontWeight: '700' }}>
                                          🗓️ {dateFormatted}
                                        </Text>
                                      </View>
                                      <Text style={{ color: discountBadge ? '#FFD700' : brandColor, fontSize: 17, fontWeight: '900' }}>
                                        ${Number(r.cost || r.finalCost || 0).toLocaleString('en-US')}
                                      </Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                      <Text style={{ color: tColor.text, fontSize: 14.5, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                                        👤 {toTitleCase(r.clientName || 'Cliente General')}
                                      </Text>
                                      {discountBadge ? (
                                        <View style={{ backgroundColor: discountBadge.bg, borderWidth: 1, borderColor: discountBadge.color, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                                          <Text style={{ color: discountBadge.color, fontSize: 10, fontWeight: '900' }}>
                                            {discountBadge.label}
                                          </Text>
                                        </View>
                                      ) : (
                                        <Text style={{ color: tColor.muted, fontSize: 11 }}>Tarifa Regular</Text>
                                      )}
                                    </View>

                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: tColor.border, paddingTop: 8 }}>
                                      <Text style={{ color: tColor.muted, fontSize: 12.5, flex: 1 }} numberOfLines={1}>
                                        ✨ {toTitleCase(r.service || 'Servicio General')}
                                      </Text>
                                      <Text style={{ color: tColor.muted, fontSize: 11.5, fontWeight: '700' }}>
                                        {staffTerm}: {toTitleCase(r.mechanicName || 'General')}
                                      </Text>
                                    </View>
                                  </View>
                                );
                              })
                          ) : (
                            <View style={{ paddingVertical: 36, alignItems: 'center' }}>
                              <Feather name="file-text" size={32} color={tColor.muted} style={{ marginBottom: 10 }} />
                              <Text style={{ color: tColor.text, fontWeight: '800', fontSize: 15 }}>
                                No hay registros en estas fechas
                              </Text>
                              <Text style={{ color: tColor.muted, fontSize: 12.5, marginTop: 4, textAlign: 'center' }}>
                                Ajusta el rango de fechas arriba o cierra una orden en el POS para verla aquí.
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {!isPrinting ? (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: isMobile ? 16 : 24, borderTopWidth: 1, borderTopColor: tColor.border, backgroundColor: theme === 'dark' ? '#12161C' : '#E2E8F0' }}>
                          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: tColor.input, borderColor: tColor.border, paddingVertical: 10, paddingHorizontal: 14 }, reportPage === 1 ? { opacity: 0.5 } : {}]} disabled={reportPage === 1} onPress={() => setReportPage(p => Math.max(1, p - 1))}>
                            <Text style={[styles.secondaryButtonText, { color: tColor.text, fontSize: 13 }]}>Anterior</Text>
                          </TouchableOpacity>
                          <Text style={{ color: tColor.text, fontWeight: 'bold', fontSize: 13.5 }}>Página {reportPage} de {totalPages}</Text>
                          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: tColor.input, borderColor: tColor.border, paddingVertical: 10, paddingHorizontal: 14 }, reportPage === totalPages ? { opacity: 0.5 } : {}]} disabled={reportPage === totalPages} onPress={() => setReportPage(p => Math.min(totalPages, p + 1))}>
                            <Text style={[styles.secondaryButtonText, { color: tColor.text, fontSize: 13 }]}>Siguiente</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {agendaFilter === 'staff' ? (
                  <View>
                    <Text style={[styles.sectionTitle, { color: tColor.text }]}>Gestión de Equipo / Staff</Text>

                    {/* 🔐 TARJETA DE SEGURIDAD EXCLUSIVA DEL DUEÑO: VER Y CAMBIAR EL PIN DE ACCESO A LAS CITAS */}
                    <View
                      style={[
                        styles.glassCard,
                        {
                          backgroundColor: tColor.card,
                          borderColor: brandColor,
                          borderWidth: 1.5,
                          padding: isMobile ? 18 : 24,
                          marginBottom: 24,
                        },
                      ]}
                    >
                      <View
                        style={{
                          flexDirection: isMobile ? 'column' : 'row',
                          justifyContent: 'space-between',
                          alignItems: isMobile ? 'stretch' : 'center',
                          gap: 16,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                            <View
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 10,
                                backgroundColor: `${brandColor}22`,
                                borderWidth: 1,
                                borderColor: brandColor,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Feather name="shield" size={17} color={brandColor} />
                            </View>
                            <Text style={{ color: tColor.text, fontSize: isMobile ? 16 : 18, fontWeight: '900' }}>
                              {tr('Código de Acceso para Empleados (PIN de Citas y POS)', 'Employee Access Code (Appointments & POS PIN)')}
                            </Text>
                            <View
                              style={{
                                backgroundColor: 'rgba(16, 185, 129, 0.14)',
                                borderWidth: 1,
                                borderColor: '#10B981',
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 6,
                              }}
                            >
                              <Text style={{ color: '#10B981', fontSize: 10.5, fontWeight: '900' }}>
                                {tr('SOLO VISIBLE PARA EL DUEÑO', 'OWNER ONLY')}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ color: tColor.muted, fontSize: 13, lineHeight: 19 }}>
                            {tr(
                              `Con este PIN de 4 a 6 dígitos tus profesionales (${staffTerm}) entran a "Portal Interno" únicamente para ver las citas del día y cerrar órdenes. Si alguien se retira del negocio, cámbialo aquí y su acceso quedará bloqueado al instante.`,
                              `Your staff (${staffTerm}) use this 4–6 digit PIN to view daily appointments and close orders. If someone leaves the team, change it here to revoke their access immediately.`
                            )}
                          </Text>
                        </View>

                        <View
                          style={{
                            flexDirection: isMobile ? 'column' : 'row',
                            alignItems: isMobile ? 'stretch' : 'center',
                            gap: 10,
                            minWidth: isMobile ? '100%' : 340,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: tColor.input,
                              borderWidth: 1,
                              borderColor: tColor.border,
                              borderRadius: 12,
                              height: 48,
                              paddingHorizontal: 12,
                              flex: 1,
                            }}
                          >
                            <Feather name="key" size={16} color={brandColor} style={{ marginRight: 8 }} />
                            <TextInput
                              style={{
                                flex: 1,
                                color: tColor.text,
                                fontSize: 18,
                                fontWeight: '900',
                                letterSpacing: 6,
                                outlineStyle: 'none',
                              } as any}
                              placeholder="1234"
                              placeholderTextColor={tColor.muted}
                              secureTextEntry={!showStaffAccessPin}
                              keyboardType="numeric"
                              maxLength={6}
                              value={staffAccessPin}
                              onChangeText={(txt) => setStaffAccessPin(txt.replace(/\D/g, ''))}
                            />
                            <TouchableOpacity
                              onPress={() => setShowStaffAccessPin((prev) => !prev)}
                              style={{ padding: 6 }}
                              accessibilityLabel="Ver u ocultar PIN"
                            >
                              <Feather name={showStaffAccessPin ? 'eye-off' : 'eye'} size={17} color={tColor.muted} />
                            </TouchableOpacity>
                          </View>

                          <TouchableOpacity
                            onPress={() => {
                              const randomPin = String(Math.floor(1000 + Math.random() * 9000));
                              setStaffAccessPin(randomPin);
                              setShowStaffAccessPin(true);
                            }}
                            style={{
                              height: 48,
                              paddingHorizontal: 12,
                              borderRadius: 12,
                              backgroundColor: tColor.input,
                              borderWidth: 1,
                              borderColor: tColor.border,
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexDirection: 'row',
                              gap: 6,
                            }}
                          >
                            <Feather name="refresh-cw" size={14} color={tColor.text} />
                            <Text style={{ color: tColor.text, fontWeight: '800', fontSize: 12.5 }}>
                              {tr('Generar PIN', 'Random PIN')}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.primaryButton,
                              {
                                backgroundColor: brandColor,
                                height: 48,
                                paddingHorizontal: 18,
                                flexDirection: 'row',
                                gap: 7,
                              },
                            ]}
                            onPress={handleSaveStaffPin}
                            disabled={isSavingStaffPin}
                          >
                            <Feather name="lock" size={15} color="#FFFFFF" />
                            <Text style={styles.primaryButtonText}>
                              {isSavingStaffPin ? tr('Guardando...', 'Saving...') : tr('Cambiar PIN', 'Update PIN')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    <View style={styles.bentoGrid}>
                      <View style={[styles.flexCard, { backgroundColor: tColor.card, borderColor: tColor.border, minWidth: isMobile ? '100%' : 320 }]}>
                        <Text style={[styles.cardTitle, { color: tColor.text }]}>➕ Registrar Miembro</Text>
                        
                        <View style={{ flexDirection: 'column', gap: 16 } as any}>
                          <View>
                            <Text style={[styles.inputLabel, { color: tColor.muted }]}>Nombre Completo</Text>
                            <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]} placeholder="Ej: Andy Perez" placeholderTextColor={tColor.muted} value={newStaffName} onChangeText={text => setNewStaffName(toTitleCase(text))} />
                          </View>
                          
                          <View>
                            <Text style={[styles.inputLabel, { color: tColor.muted }]}>Especialidad / Cargo</Text>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => setIsStaffRoleDropdownOpen((prev) => !prev)}
                              style={[
                                styles.formInput,
                                {
                                  backgroundColor: tColor.input,
                                  borderColor: isStaffRoleDropdownOpen || selectedStaffRole ? brandColor : tColor.border,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  paddingHorizontal: 16,
                                  height: 52,
                                },
                              ]}
                            >
                              <Text
                                numberOfLines={1}
                                style={{
                                  flex: 1,
                                  fontSize: 15,
                                  fontWeight: selectedStaffRole ? '800' : '500',
                                  color: selectedStaffRole ? tColor.text : tColor.muted,
                                }}
                              >
                                {selectedStaffRole === 'custom'
                                  ? '➕ Otro (Personalizado)...'
                                  : selectedStaffRole
                                  ? selectedStaffRole
                                  : 'Seleccione especialidad acorde al negocio...'}
                              </Text>
                              <Feather
                                name={isStaffRoleDropdownOpen ? 'chevron-up' : 'chevron-down'}
                                size={18}
                                color={isStaffRoleDropdownOpen ? brandColor : tColor.muted}
                              />
                            </TouchableOpacity>

                            {isStaffRoleDropdownOpen ? (
                              <View
                                style={{
                                  marginTop: 8,
                                  backgroundColor: theme === 'dark' ? '#0B0F17' : '#FFFFFF',
                                  borderWidth: 1,
                                  borderColor: tColor.border,
                                  borderRadius: 14,
                                  padding: 8,
                                  gap: 6,
                                }}
                              >
                                {availableRoles.map((role, idx) => {
                                  const isSelectedRole = selectedStaffRole === role;
                                  return (
                                    <TouchableOpacity
                                      key={`${role}-${idx}`}
                                      activeOpacity={0.8}
                                      onPress={() => {
                                        setSelectedStaffRole(role);
                                        setIsStaffRoleDropdownOpen(false);
                                      }}
                                      style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        paddingVertical: 12,
                                        paddingHorizontal: 14,
                                        borderRadius: 10,
                                        backgroundColor: isSelectedRole ? `${brandColor}22` : tColor.input,
                                        borderWidth: 1,
                                        borderColor: isSelectedRole ? brandColor : 'transparent',
                                      }}
                                    >
                                      <Text
                                        style={{
                                          color: isSelectedRole ? brandColor : tColor.text,
                                          fontWeight: isSelectedRole ? '900' : '600',
                                          fontSize: 14,
                                        }}
                                      >
                                        {role}
                                      </Text>
                                      <Ionicons
                                        name={isSelectedRole ? 'checkmark-circle' : 'ellipse-outline'}
                                        size={18}
                                        color={isSelectedRole ? brandColor : tColor.muted}
                                      />
                                    </TouchableOpacity>
                                  );
                                })}

                                <TouchableOpacity
                                  activeOpacity={0.8}
                                  onPress={() => {
                                    setSelectedStaffRole('custom');
                                    setIsStaffRoleDropdownOpen(false);
                                  }}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 12,
                                    paddingHorizontal: 14,
                                    borderRadius: 10,
                                    backgroundColor: selectedStaffRole === 'custom' ? `${brandColor}22` : tColor.input,
                                    borderWidth: 1,
                                    borderColor: selectedStaffRole === 'custom' ? brandColor : 'transparent',
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: selectedStaffRole === 'custom' ? brandColor : tColor.muted,
                                      fontWeight: '800',
                                      fontSize: 14,
                                    }}
                                  >
                                    ➕ Otro (Personalizado)...
                                  </Text>
                                  <Ionicons
                                    name={selectedStaffRole === 'custom' ? 'checkmark-circle' : 'add-circle-outline'}
                                    size={18}
                                    color={selectedStaffRole === 'custom' ? brandColor : tColor.muted}
                                  />
                                </TouchableOpacity>
                              </View>
                            ) : null}
                          </View>

                          {selectedStaffRole === 'custom' ? (
                            <View>
                              <Text style={[styles.inputLabel, { color: brandColor }]}>Especifique el cargo:</Text>
                              <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]} placeholder="Ej: Especialista Senior" placeholderTextColor={tColor.muted} value={customStaffRole} onChangeText={text => setCustomStaffRole(toTitleCase(text))} />
                            </View>
                          ) : null}

                          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor }]} onPress={handleAddStaff as any}>
                            <Text style={styles.primaryButtonText}>Guardar en el Sistema</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={[styles.flexCard, { backgroundColor: tColor.card, borderColor: tColor.border, minWidth: isMobile ? '100%' : 320 }]}>
                        <Text style={[styles.cardTitle, { color: tColor.text }]}>📋 Personal Registrado ({staffList.length})</Text>
                        <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
                          {staffList.map((m, idx) => (
                            <View key={`${m.id}-${idx}`} style={[styles.staffRow, { backgroundColor: tColor.input, borderColor: tColor.border }, !m.isActive ? { opacity: 0.6 } : {}]}>
                              <View>
                                <Text style={[styles.staffName, { color: tColor.text }, !m.isActive ? { textDecorationLine: 'line-through' } : {}]}>{toTitleCase(m.name)}</Text>
                                <Text style={[styles.staffRole, { color: brandColor }]}>{toTitleCase(m.role)}</Text>
                              </View>
                              <TouchableOpacity style={m.isActive ? styles.activeStatusBadge : styles.inactiveStatusBadge} onPress={() => toggleStaffStatus(m.id, m.isActive ?? true)}>
                                <Text style={m.isActive ? styles.activeStatusText : styles.inactiveStatusText}>{m.isActive ? 'ACTIVO' : 'INACTIVO'}</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    </View>
                  </View>
                ) : null}

              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* ==========================================
          MODALES B2C / POS (100% COMPLETOS)
          ========================================== */}
      {isBookingModalOpen ? (
        <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
          <ScrollView contentContainerStyle={styles.modalContentWrapper}>
            <View style={[styles.modalContent, { backgroundColor: tColor.bg, borderColor: tColor.border }]}>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: tColor.input }]} onPress={() => { setIsBookingModalOpen(false); setIsPlateSearched(false); }}><Text style={{color: tColor.text}}>✕</Text></TouchableOpacity>
              <Text style={[styles.pageTitle, { color: tColor.text }]}>Nueva Reserva</Text>
              
              {isAutomotive && !isPlateSearched ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 48, marginBottom: 16 }}>🚗</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: tColor.text, marginBottom: 12 }}>¿Ya nos has visitado antes?</Text>
                  <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, maxWidth: 250, textAlign: 'center', fontSize: 20, letterSpacing: 2, marginBottom: 24 }]} placeholder="Placa (Ej: JNT776)" placeholderTextColor={tColor.muted} value={searchPlate} onChangeText={text => setSearchPlate(text.toUpperCase())} />
                  <View style={{ flexDirection: 'row', gap: 16, width: '100%', justifyContent: 'center' }}>
                    <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor, flex: 1, maxWidth: 200 }]} onPress={handleSearchVehicle} disabled={isSearchingPlate}><Text style={styles.primaryButtonText}>{isSearchingPlate ? 'Buscando...' : '🔍 Buscar Placa'}</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: tColor.input, borderColor: tColor.border, flex: 1, maxWidth: 200 }]} onPress={() => setIsPlateSearched(true)}><Text style={[styles.secondaryButtonText, { color: tColor.text }]}>Primera Vez ➔</Text></TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'column', gap: 16 } as any}>
                  <View style={{ marginBottom: 24 }}>
                    <Text style={[styles.inputLabel, { color: tColor.muted }]}>Servicio Seleccionado</Text>
                    {Platform.OS === 'web' ? (
                      <select className="web-input-override" value={selectedServiceType} onChange={e => setSelectedServiceType(e.target.value)}>
                        {activeCatalogServices.map((srv, idx) => <option key={`${srv.id}-${idx}`} value={srv.id}>{toTitleCase(srv.name)} - ${srv.price}</option>)}
                      </select>
                    ) : (
                      <View style={{ backgroundColor: tColor.input, borderWidth: 1, borderColor: tColor.border, borderRadius: 12, padding: 14 }}>
                        {(() => {
                          const srvObj = servicesList.find(s => s.id === selectedServiceType);
                          return (
                            <View>
                              <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 16, marginBottom: 2 }}>
                                {toTitleCase(srvObj?.name || 'Servicio Seleccionado')} — ${srvObj?.price || '0'}
                              </Text>
                              {srvObj?.description ? (
                                <Text style={{ color: tColor.muted, fontSize: 12.5 }} numberOfLines={2}>
                                  {toSentenceCase(srvObj.description)}
                                </Text>
                              ) : null}
                            </View>
                          );
                        })()}
                      </View>
                    )}
                  </View>

                  {(activeStaffList.length > 0) ? (
                    <View style={{ marginBottom: 24, backgroundColor: tColor.input, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: brandColor, borderStyle: 'dashed' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                        <Text style={[styles.inputLabel, { color: brandColor, marginBottom: 0 }]}>
                          👤 Elegir {staffTerm} ({activeStaffList.length} {activeStaffList.length === 1 ? 'profesional activo' : 'profesionales en simultáneo'})
                        </Text>
                        {(appointmentDate && appointmentTime) ? (() => {
                          const freeNow = getFreeStaffForSlot(appointmentDate, appointmentTime, selectedServiceType);
                          return (
                            <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#10B981' }}>
                              <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '900' }}>
                                ✅ {freeNow.length} de {activeStaffList.length} disponible(s) a las {appointmentTime}
                              </Text>
                            </View>
                          );
                        })() : null}
                      </View>
                      {Platform.OS === 'web' ? (
                        <select className="web-input-override" value={selectedBookingStaff} onChange={e => setSelectedBookingStaff(e.target.value)}>
                          <option value="">✨ Cualquiera disponible (Asignación inteligente de silla libre)</option>
                          {activeStaffList.map((stf, idx) => {
                            const isFreeAtSelectedSlot = (appointmentDate && appointmentTime)
                              ? getFreeStaffForSlot(appointmentDate, appointmentTime, selectedServiceType).some(f => f.id === stf.id)
                              : true;
                            return (
                              <option key={`${stf.id}-${idx}`} value={stf.id}>
                                {toTitleCase(stf.name)} ({toTitleCase(stf.role)}) {(appointmentDate && appointmentTime) ? (isFreeAtSelectedSlot ? '— 🟢 Libre a esta hora' : '— 🔴 Ocupado a esta hora') : ''}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => setSelectedBookingStaff('')}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: !selectedBookingStaff ? brandColor : tColor.border,
                              backgroundColor: !selectedBookingStaff ? brandColor : tColor.bg,
                            }}
                          >
                            <Text style={{ color: !selectedBookingStaff ? '#FFFFFF' : tColor.text, fontSize: 12, fontWeight: '800' }}>
                              ✨ Cualquiera disponible
                            </Text>
                          </TouchableOpacity>
                          {activeStaffList.map((stf, idx) => {
                            const isSel = selectedBookingStaff === stf.id;
                            return (
                              <TouchableOpacity
                                key={`${stf.id}-mob-${idx}`}
                                onPress={() => setSelectedBookingStaff(isSel ? '' : stf.id)}
                                style={{
                                  paddingVertical: 8,
                                  paddingHorizontal: 12,
                                  borderRadius: 10,
                                  borderWidth: 1,
                                  borderColor: isSel ? brandColor : tColor.border,
                                  backgroundColor: isSel ? brandColor : tColor.bg,
                                }}
                              >
                                <Text style={{ color: isSel ? '#FFFFFF' : tColor.text, fontSize: 12, fontWeight: '800' }}>
                                  👤 {toTitleCase(stf.name)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* Píldoras visuales de quién está libre en la hora elegida */}
                      {(appointmentDate && appointmentTime) ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                          {activeStaffList.map((stf, stfPillIdx) => {
                            const isFree = getFreeStaffForSlot(appointmentDate, appointmentTime, selectedServiceType).some(f => f.id === stf.id);
                            const isSelected = selectedBookingStaff === stf.id;
                            return (
                              <TouchableOpacity
                                key={`${stf.id}-pill-${stfPillIdx}`}
                                disabled={!isFree}
                                onPress={() => setSelectedBookingStaff(isSelected ? '' : stf.id)}
                                style={{
                                  paddingVertical: 6,
                                  paddingHorizontal: 10,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: isSelected ? brandColor : (isFree ? '#10B981' : '#EF4444'),
                                  backgroundColor: isSelected ? brandColor : (isFree ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'),
                                  opacity: isFree ? 1 : 0.5
                                }}
                              >
                                <Text style={{ color: isSelected ? '#FFF' : (isFree ? '#10B981' : '#EF4444'), fontSize: 11, fontWeight: '800' }}>
                                  {isFree ? '🟢' : '🔴'} {toTitleCase(stf.name)} {isFree ? '(Libre)' : '(Ocupado)'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {isAutomotive ? (
                    <View style={{ backgroundColor: tColor.input, padding: 24, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: tColor.border }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={{ fontSize: 16, color: brandColor, fontWeight: '800' }}>Datos del Vehículo</Text>
                        <TouchableOpacity onPress={() => setIsPlateSearched(false)}><Text style={{ color: tColor.muted, textDecorationLine: 'underline', fontSize: 13, fontWeight: 'bold' }}>Volver a buscar</Text></TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginBottom: 16 }}>
                        <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, flex: 1 }]} placeholder="Placa" placeholderTextColor={tColor.muted} value={searchPlate} onChangeText={text => setSearchPlate(text.toUpperCase())} />
                        <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, flex: 1 }]} placeholder="Marca" placeholderTextColor={tColor.muted} value={carBrand} onChangeText={t => setCarBrand(toTitleCase(t))} />
                        <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, flex: 1 }]} placeholder="Modelo" placeholderTextColor={tColor.muted} value={carModel} onChangeText={t => setCarModel(toTitleCase(t))} />
                      </View>
                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginBottom: 20 }}>
                        <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, flex: 1 }]} placeholder="Año" placeholderTextColor={tColor.muted} keyboardType="numeric" value={carYear} onChangeText={setCarYear} />
                        <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.text, flex: 1 }]} placeholder="Kilometraje" placeholderTextColor={tColor.muted} keyboardType="numeric" value={carMileage} onChangeText={setCarMileage} />
                      </View>
                      <Text style={{ fontSize: 13, color: tColor.muted, fontWeight: 'bold', marginBottom: 12 }}>Síntomas rápidos:</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {clientQuickServices.map((qs, idx) => (
                          <TouchableOpacity key={`${qs}-${idx}`} style={[styles.chip, { backgroundColor: tColor.input, borderColor: tColor.border }, quickNotes.includes(qs) ? { backgroundColor: brandColor, borderColor: brandColor } : {}]} onPress={() => setQuickNotes(prev => prev.includes(qs) ? prev : `${prev} ${qs}`.trim())}>
                            <Text style={[styles.chipText, { color: tColor.muted }, quickNotes.includes(qs) ? styles.activeChipText : {}]}>+ {qs}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, minHeight: 80, marginTop: 16 }]} placeholder="Detalles Adicionales..." placeholderTextColor={tColor.muted} multiline value={quickNotes} onChangeText={t => setQuickNotes(toTitleCase(t))} />
                    </View>
                  ) : (
                    <View style={{ backgroundColor: tColor.input, padding: 20, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: tColor.border }}>
                      <Text style={{ fontSize: 15, color: brandColor, fontWeight: '900', marginBottom: 12 }}>
                        {isLegal ? '⚖️ Modalidad y Detalles del Caso Legal' : isDental ? '🦷 Detalles de Valoración Odontológica' : '✨ Preferencias de tu Cita'}
                      </Text>

                      {/* Selector de Modalidad (Solo para Abogados o Clínicas que ofrecen atenciones remotas) */}
                      {(isLegal || isDental) ? (
                        <View style={{ marginBottom: 16 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted }]}>Modalidad de Atención</Text>
                          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                            {[
                              { id: 'in_person', label: isDental ? '📍 En Consultorio' : '📍 En Oficina / Local' },
                              { id: 'phone_call', label: '📞 Por Llamada Telefónica' },
                              { id: 'video_call', label: '💻 Videollamada (Zoom/Meet)' }
                            ].map((mod) => {
                              const activeMod = appointmentModality === mod.id;
                              return (
                                <TouchableOpacity
                                  key={mod.id}
                                  onPress={() => setAppointmentModality(mod.id as any)}
                                  style={{
                                    flex: 1,
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                    borderRadius: 10,
                                    borderWidth: 1,
                                    borderColor: activeMod ? brandColor : tColor.border,
                                    backgroundColor: activeMod ? `${brandColor}20` : 'transparent',
                                    alignItems: 'center'
                                  }}
                                >
                                  <Text style={{ color: activeMod ? brandColor : tColor.text, fontWeight: '800', fontSize: 12.5 }}>{mod.label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ) : null}

                      <Text style={[styles.inputLabel, { color: tColor.muted }]}>
                        {isLegal ? 'Área del Caso (Selecciona o escribe):' : isDental ? 'Motivo de Consulta Dental:' : 'Motivo o Servicio Rápido:'}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        {clientQuickServices.map((qs, idx) => {
                          const isSelectedChip = caseOrTreatmentArea === qs || quickNotes.includes(qs);
                          return (
                            <TouchableOpacity
                              key={`${qs}-${idx}`}
                              style={[styles.chip, { backgroundColor: tColor.input, borderColor: tColor.border, marginBottom: 4 }, isSelectedChip ? { backgroundColor: brandColor, borderColor: brandColor } : {}]}
                              onPress={() => {
                                setCaseOrTreatmentArea(qs);
                                setQuickNotes((prev) => (prev.includes(qs) ? prev : `${prev} ${qs}`.trim()));
                              }}
                            >
                              <Text style={[styles.chipText, { color: tColor.muted }, isSelectedChip ? styles.activeChipText : {}]}>+ {qs}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {(isLegal || isDental) ? (
                        <View style={{ marginBottom: 12 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted }]}>
                            {isLegal ? 'Nombre de la Contraparte (Para verificar conflicto de interés - Opcional)' : 'Seguro Dental / EPS o Particular (Opcional)'}
                          </Text>
                          <TextInput
                            style={[styles.formInput, { backgroundColor: tColor.bg, borderColor: tColor.border, color: tColor.text }]}
                            placeholder={isLegal ? 'Ej: Empresa XYZ o Nombre de contraparte' : 'Ej: Delta Dental / Particular / Primera Vez'}
                            placeholderTextColor={tColor.muted}
                            value={opposingPartyOrInsurance}
                            onChangeText={(t) => setOpposingPartyOrInsurance(toTitleCase(t))}
                          />
                        </View>
                      ) : null}

                      <TextInput
                        style={[styles.formInput, { backgroundColor: tColor.bg, borderColor: tColor.border, color: tColor.text, minHeight: 65 }]}
                        placeholder={isLegal ? 'Describe brevemente tu situación o si tienes audiencia próxima...' : isDental ? 'Indica si tienes dolor agudo, sensibilidad o algún antecedente médico...' : 'Notas adicionales para tu profesional...'}
                        placeholderTextColor={tColor.muted}
                        multiline
                        value={quickNotes}
                        onChangeText={(t) => setQuickNotes(toTitleCase(t))}
                      />
                    </View>
                  )}

                  {/* ⚡ TARJETA "¿YA ESTÁS REGISTRADO?" — AUTOCOMPLETAR O SOY NUEVO -> iOS / GOOGLE / USUARIO */}
                  <View
                    style={{
                      backgroundColor: isExistingClient ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.08)',
                      borderWidth: 1,
                      borderColor: isExistingClient ? '#10B981' : (bookingEntryMode !== null ? brandColor : 'rgba(59, 130, 246, 0.35)'),
                      borderRadius: 16,
                      padding: isMobile ? 14 : 16,
                      marginBottom: 14,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          backgroundColor: isExistingClient ? 'rgba(16, 185, 129, 0.2)' : `${brandColor}22`,
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        <Feather name={isExistingClient ? 'user-check' : 'zap'} size={16} color={isExistingClient ? '#10B981' : brandColor} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: tColor.text, fontWeight: '900', fontSize: isMobile ? 14.5 : 14, lineHeight: 20 }}>
                          {isExistingClient
                            ? tr(`¡Hola de nuevo, ${clientName.split(' ')[0] || 'Cliente VIP'}!`, `Welcome back, ${clientName.split(' ')[0] || 'VIP Client'}!`)
                            : tr('¿Ya estás registrado con nosotros?', 'Already registered with us?')}
                        </Text>
                        <Text style={{ color: tColor.muted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                          {isExistingClient
                            ? tr(
                                `Cliente verificado • ${bookingMatchedVisits} visita(s)${bookingClientCoupons > 0 ? ` • 🏆 ${bookingClientCoupons} cupón(es)` : ''}`,
                                `Verified client • ${bookingMatchedVisits} visit(s)${bookingClientCoupons > 0 ? ` • 🏆 ${bookingClientCoupons} coupon(s)` : ''}`
                              )
                            : tr('Valida tu cuenta con iOS o Google, o completa tus datos como Usuario.', 'Verify with iOS or Google, or fill in your details as User.')}
                        </Text>
                      </View>
                    </View>

                    {isExistingClient ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setIsExistingClient(false);
                          setBookingMatchedVisits(0);
                          setBookingClientCoupons(0);
                          setClientName('');
                          setClientEmail('');
                          setClientPhone('');
                          setBookingLookupQuery('');
                          setBookingAuthMethod(null);
                          setAcceptedBookingTerms(false);
                          setBookingEntryMode('existing');
                        }}
                        style={{
                          marginTop: 12,
                          height: 40,
                          paddingHorizontal: 14,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: tColor.border,
                          backgroundColor: tColor.input,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <Text style={{ color: tColor.muted, fontWeight: '900', fontSize: 12.5 }}>
                          {tr('Cambiar cliente', 'Switch client')}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            if (bookingEntryMode === 'existing') {
                              setBookingEntryMode(null);
                            } else {
                              setBookingAuthMethod(null);
                              setBookingEntryMode('existing');
                            }
                          }}
                          style={{
                            flex: 1,
                            height: 42,
                            paddingHorizontal: 10,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: bookingEntryMode === 'existing' ? brandColor : (bookingEntryMode === null ? brandColor : tColor.border),
                            backgroundColor: bookingEntryMode === 'existing' || bookingEntryMode === null ? brandColor : tColor.input,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                          }}
                        >
                          <Text numberOfLines={1} style={{ color: bookingEntryMode === 'existing' || bookingEntryMode === null ? '#FFFFFF' : tColor.text, fontWeight: '900', fontSize: 12 }}>
                            {bookingEntryMode === 'existing'
                              ? tr('Cerrar ✕', 'Close ✕')
                              : tr('⚡ Autocompletar', '⚡ Autofill')}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            if (bookingEntryMode === 'new') {
                              setBookingEntryMode(null);
                            } else {
                              setBookingAuthMethod(null);
                              setBookingEntryMode('new');
                            }
                          }}
                          style={{
                            flex: 1,
                            height: 42,
                            paddingHorizontal: 10,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: bookingEntryMode === 'new' ? brandColor : tColor.border,
                            backgroundColor: bookingEntryMode === 'new' ? brandColor : tColor.input,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                          }}
                        >
                          {bookingEntryMode !== 'new' ? <Feather name="user-plus" size={13} color={brandColor} /> : null}
                          <Text numberOfLines={1} style={{ color: bookingEntryMode === 'new' ? '#FFFFFF' : tColor.text, fontWeight: '900', fontSize: 12 }}>
                            {bookingEntryMode === 'new'
                              ? tr('Cerrar ✕', 'Close ✕')
                              : tr('Soy nuevo', 'I am new')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {bookingEntryMode !== null && !isExistingClient ? (
                      <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: tColor.border, gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <Text style={{ color: tColor.text, fontSize: 12, fontWeight: '800', flex: 1 }}>
                            {bookingEntryMode === 'new'
                              ? tr('Elige cómo deseas registrarte:', 'Choose how you want to sign up:')
                              : tr('Elige cómo validar y cargar tus datos:', 'Choose how to verify and load your info:')}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16, 185, 129, 0.12)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.35)', paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 8 }}>
                            <Feather name="shield" size={11} color="#10B981" />
                            <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '900' }}>
                              {tr('Protegido', 'Protected')}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={isAuthenticatingProvider}
                            onPress={handleAppleProviderAuth}
                            style={{
                              flex: 1,
                              height: 44,
                              borderRadius: 11,
                              backgroundColor: theme === 'dark' ? '#FFFFFF' : '#0F131A',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              paddingHorizontal: 8,
                            }}
                          >
                            <Ionicons name="logo-apple" size={16} color={theme === 'dark' ? '#000000' : '#FFFFFF'} />
                            <Text numberOfLines={1} style={{ color: theme === 'dark' ? '#000000' : '#FFFFFF', fontWeight: '900', fontSize: 12.5 }}>
                              iOS
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={isAuthenticatingProvider}
                            onPress={async () => {
                              setIsAuthenticatingProvider(true);
                              try {
                                if (Platform.OS === 'web') {
                                  await supabase.auth.signInWithOAuth({
                                    provider: 'google',
                                    options: { redirectTo: typeof window !== 'undefined' ? window.location.href : undefined }
                                  });
                                } else {
                                  alert(tr('Completa tu correo y datos para validar tu cuenta con Google o continuar como Usuario.', 'Enter your email and info to link your Google account or continue as User.'));
                                }
                              } catch (_e) {}
                              setIsExistingClient(false);
                              setBookingMatchedVisits(0);
                              setBookingClientCoupons(0);
                              setClientName('');
                              setClientEmail('');
                              setClientPhone('');
                              setBookingAuthMethod('google');
                              setBookingEntryMode(null);
                              setShowBookingQuickLookup(false);
                              setIsAuthenticatingProvider(false);
                            }}
                            style={{
                              flex: 1,
                              height: 44,
                              borderRadius: 11,
                              backgroundColor: tColor.bg,
                              borderWidth: 1,
                              borderColor: tColor.border,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              paddingHorizontal: 8,
                            }}
                          >
                            <Ionicons name="logo-google" size={15} color="#EA4335" />
                            <Text numberOfLines={1} style={{ color: tColor.text, fontWeight: '800', fontSize: 12.5 }}>
                              Google
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => {
                              setBookingAuthMethod('manual');
                              setBookingEntryMode(null);
                              setShowBookingQuickLookup(false);
                            }}
                            style={{
                              flex: 1,
                              height: 44,
                              borderRadius: 11,
                              backgroundColor: `${brandColor}16`,
                              borderWidth: 1,
                              borderColor: brandColor,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              paddingHorizontal: 8,
                            }}
                          >
                            <Feather name="user" size={15} color={brandColor} />
                            <Text numberOfLines={1} style={{ color: tColor.text, fontWeight: '900', fontSize: 12.5 }}>
                              {tr('Usuario', 'User')}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <Text style={{ color: tColor.muted, fontSize: 10.5, lineHeight: 15 }}>
                          {bookingEntryMode === 'new'
                            ? tr('🔒 Regístrate rápido con iOS o Google, o toca Usuario para ingresar tu información.', '🔒 Sign up fast with iOS or Google, or tap User to enter your details.')
                            : tr('🔒 Tus datos solo se utilizan para confirmar tu cita y proteger tu expediente.', '🔒 Your info is used solely to confirm your appointment and protect your record.')}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* ✅ FORMULARIO DE CONTACTO + CAMBIAR MÉTODO + TÉRMINOS (OCULTO HASTA ELEGIR MÉTODO O "NO ESTOY REGISTRADO") */}
                  {(bookingAuthMethod !== null || isExistingClient) ? (
                  <View style={{ backgroundColor: tColor.input, borderWidth: 1, borderColor: tColor.border, borderRadius: 16, padding: 16, marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: tColor.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <Ionicons
                          name={bookingAuthMethod === 'apple' ? 'logo-apple' : bookingAuthMethod === 'google' ? 'logo-google' : 'person-outline'}
                          size={16}
                          color={bookingAuthMethod === 'apple' ? (theme === 'dark' ? '#FFFFFF' : tColor.text) : bookingAuthMethod === 'google' ? '#EA4335' : brandColor}
                        />
                        <Text style={{ color: tColor.text, fontSize: 12.5, fontWeight: '900', flex: 1 }} numberOfLines={1}>
                          {bookingAuthMethod === 'apple'
                            ? 'iOS'
                            : bookingAuthMethod === 'google'
                            ? 'Google'
                            : tr('Usuario', 'User')}
                        </Text>
                      </View>

                      {!isExistingClient ? (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => {
                            setBookingAuthMethod(null);
                            setClientName('');
                            setClientEmail('');
                            setClientPhone('');
                            setAcceptedBookingTerms(false);
                            setBookingEntryMode('existing');
                            setShowBookingQuickLookup(false);
                          }}
                          style={{ paddingLeft: 8 }}
                        >
                          <Text style={{ color: brandColor, fontSize: 11, fontWeight: '900', textDecorationLine: 'underline' }}>
                            {tr('Cambiar método', 'Change method')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                      <View style={{ marginBottom: 14 }}>
                        <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 6 }]}>
                          {tr('NOMBRE COMPLETO *', 'FULL NAME *')}
                        </Text>
                        <TextInput
                          style={[styles.formInput, { backgroundColor: tColor.bg, borderColor: tColor.border, color: tColor.text }]}
                          placeholder={tr('Nombre Completo (Ej: Cesar Lopez)', 'Full Name (e.g., Cesar Lopez)')}
                          placeholderTextColor={tColor.muted}
                          value={clientName}
                          onChangeText={text => setClientName(toTitleCase(text))}
                        />
                      </View>

                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 14, marginBottom: 16 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 6 }]}>
                            {tr('TELÉFONO / WHATSAPP *', 'PHONE / WHATSAPP *')}
                          </Text>
                          <View style={{ flexDirection: 'row', backgroundColor: tColor.bg, borderRadius: 12, borderWidth: 1, borderColor: cleanPhoneDigits(clientPhone).length >= 7 ? '#10B981' : tColor.border, overflow: 'hidden', minHeight: 48 }}>
                            <CountryCodeSelector value={bookingCountryCode} onChange={setBookingCountryCode} tColor={tColor} width={105} />
                            <TextInput
                              style={{ flex: 1, color: tColor.text, padding: 14, fontWeight: '700', outlineStyle: 'none' } as any}
                              placeholder={tr('(909) 000-0000', '(909) 000-0000')}
                              placeholderTextColor={tColor.muted}
                              keyboardType="phone-pad"
                              value={clientPhone}
                              onChangeText={text => setClientPhone(text.replace(/[^0-9\s-]/g, ''))}
                            />
                          </View>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 6 }]}>
                            {tr('CORREO ELECTRÓNICO (OPCIONAL)', 'EMAIL ADDRESS (OPTIONAL)')}
                          </Text>
                          <TextInput
                            style={[styles.formInput, { backgroundColor: tColor.bg, borderColor: tColor.border, color: tColor.text }]}
                            placeholder={tr('ejemplo@correo.com', 'example@email.com')}
                            placeholderTextColor={tColor.muted}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={clientEmail}
                            onChangeText={setClientEmail}
                          />
                        </View>
                      </View>

                      {/* 📜 CHECKBOX DE TÉRMINOS Y CONDICIONES (OBLIGATORIO PARA AGENDAR) */}
                      <View
                        style={{
                          backgroundColor: acceptedBookingTerms ? 'rgba(16, 185, 129, 0.1)' : tColor.bg,
                          borderWidth: 1,
                          borderColor: acceptedBookingTerms ? '#10B981' : tColor.border,
                          borderRadius: 12,
                          padding: 12,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setAcceptedBookingTerms(!acceptedBookingTerms)}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            borderWidth: 2,
                            borderColor: acceptedBookingTerms ? brandColor : tColor.muted,
                            backgroundColor: acceptedBookingTerms ? brandColor : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {acceptedBookingTerms ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
                        </TouchableOpacity>

                        <View style={{ flex: 1 }}>
                          <Text style={{ color: tColor.muted, fontSize: 12.5, lineHeight: 18 }}>
                            <Text onPress={() => setAcceptedBookingTerms(!acceptedBookingTerms)}>
                              {tr('He leído y acepto los ', 'I have read and accept the ')}
                            </Text>
                            <Text
                              onPress={() => setIsTermsModalOpen(true)}
                              style={{ color: brandColor, fontWeight: '900', textDecorationLine: 'underline' }}
                            >
                              {tr('Términos y Condiciones', 'Terms & Conditions')}
                            </Text>
                            <Text onPress={() => setAcceptedBookingTerms(!acceptedBookingTerms)}>
                              {tr(' de PickTime Book.', ' of PickTime Book.')}
                            </Text>
                          </Text>
                        </View>
                      </View>
                  </View>
                  ) : null}

                  {/* 📜 MODAL DEDICADO PARA LEER LOS TÉRMINOS Y CONDICIONES COMPLETOS */}
                  <Modal
                    visible={isTermsModalOpen}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setIsTermsModalOpen(false)}
                  >
                    <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.82)', justifyContent: 'center', padding: 20 }}>
                      <View style={{ backgroundColor: theme === 'dark' ? '#0B0F17' : '#FFFFFF', borderRadius: 22, borderWidth: 1.5, borderColor: tColor.border, padding: 24, maxHeight: '80%', maxWidth: 540, width: '100%', alignSelf: 'center' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: tColor.border, paddingBottom: 12 }}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={{ color: tColor.text, fontSize: 18, fontWeight: '900' }}>
                              📜 {tr('Términos, Condiciones y Privacidad', 'Terms, Conditions & Privacy')}
                            </Text>
                            {legalDocVersion ? (
                              <Text style={{ color: brandColor, fontSize: 11, fontWeight: '800', marginTop: 2 }}>
                                {tr(`Versión vigente: ${legalDocVersion}`, `Active version: ${legalDocVersion}`)}
                              </Text>
                            ) : null}
                          </View>
                          <TouchableOpacity onPress={() => setIsTermsModalOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Feather name="x" size={20} color={tColor.muted} />
                          </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 10 }}>
                          {isLoadingLegalDoc ? (
                            <View style={{ paddingVertical: 28, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                              <ActivityIndicator size="small" color={brandColor} />
                              <Text style={{ color: tColor.muted, fontSize: 12.5 }}>
                                {tr('Cargando documento legal...', 'Loading legal document...')}
                              </Text>
                            </View>
                          ) : legalDocHtml ? (
                            Platform.OS === 'web' ? (
                              <div
                                style={{ color: tColor.muted, fontSize: 13, lineHeight: '1.6' }}
                                dangerouslySetInnerHTML={{ __html: legalDocHtml }}
                              />
                            ) : (
                              parseHtmlBlocksForModal(legalDocHtml).map((blk, bIdx) => (
                                <Text
                                  key={`legal-blk-${bIdx}`}
                                  style={
                                    blk.isTitle
                                      ? { color: tColor.text, fontSize: 14.5, fontWeight: '900', marginTop: bIdx > 0 ? 6 : 0 }
                                      : { color: tColor.muted, fontSize: 12.5, lineHeight: 19 }
                                  }
                                >
                                  {blk.text}
                                </Text>
                              ))
                            )
                          ) : (
                            <View style={{ paddingVertical: 16, gap: 10 }}>
                              <Text style={{ color: tColor.text, fontSize: 13.5, fontWeight: '800' }}>
                                {tr(
                                  'No se pudo obtener el documento legal activo desde la base de datos.',
                                  'Could not retrieve the active legal document from the database.'
                                )}
                              </Text>
                              <Text style={{ color: tColor.muted, fontSize: 12.5, lineHeight: 18 }}>
                                {tr(
                                  'Verifica que exista un registro activo (is_active = true) en public.legal_documents y que el servidor/API esté accesible.',
                                  'Verify there is an active record (is_active = true) in public.legal_documents and that the API/server is reachable.'
                                )}
                              </Text>
                              {legalDocErrorDetail ? (
                                <Text style={{ color: '#F59E0B', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                                  Detalle API: {legalDocErrorDetail}
                                </Text>
                              ) : null}
                              <TouchableOpacity
                                onPress={() => loadActiveTermsFromDb()}
                                style={{ alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: brandColor }}
                              >
                                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>
                                  {tr('Reintentar consulta a BD', 'Retry DB lookup')}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </ScrollView>

                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            setAcceptedBookingTerms(true);
                            setIsTermsModalOpen(false);
                          }}
                          style={{
                            marginTop: 16,
                            backgroundColor: brandColor,
                            paddingVertical: 14,
                            borderRadius: 12,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14.5 }}>
                            {tr('✓ He leído y Acepto los Términos', '✓ I have read & Accept the Terms')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Modal>

                  {(tenantInfo?.loyaltyConfig?.referralActive && bookingClientCoupons > 0) ? (
                    <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#3B82F6', marginBottom: 16 }}>
                      <Text style={{ color: '#3B82F6', fontWeight: '900', fontSize: 14, marginBottom: 4 }}>
                        🏆 ¡Tienes {bookingClientCoupons} cupón(es) de {tenantInfo.loyaltyConfig.referralDiscountPercent || 20}% de descuento por haber referido amigos!
                      </Text>
                      <Text style={{ color: tColor.text, fontSize: 12, lineHeight: 18 }}>
                        Tu {staffTerm.toLowerCase()} ya lo verá activo en el sistema al momento de cobrar tu cita.
                      </Text>
                    </View>
                  ) : null}

                  {isExistingClient && tenantInfo?.loyaltyConfig?.referralActive ? (
                    <View style={{ backgroundColor: tColor.input, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: tColor.border, marginBottom: 16 }}>
                      <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: 13 }}>🌟 Cliente Frecuente Verificado</Text>
                      <Text style={{ color: tColor.muted, fontSize: 12, marginTop: 4 }}>El código de referido de amigo nuevo solo aplica en tu primera cita.</Text>
                    </View>
                  ) : null}

                  {/* 🌟 AVISO DE POLÍTICA DE PROTECCIÓN AL NEGOCIO: 3H PARA AGENDAR Y RECORDATORIO 6H ANTES 🌟 */}
                  <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.4)', borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Feather name="shield" size={18} color="#F59E0B" style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 12.5, marginBottom: 3 }}>
                        Garantía de Puntualidad y Reserva Responsable
                      </Text>
                      <Text style={{ color: tColor.muted, fontSize: 11.5, lineHeight: 17 }}>
                        • Las reservas se programan con al menos <Text style={{ color: '#F59E0B', fontWeight: '900' }}>3 horas de anticipación</Text> para organizar tu atención sin contratiempos.{'\n'}
                        • Recibirás un recordatorio <Text style={{ color: '#10B981', fontWeight: '900' }}>6 horas antes</Text> de tu cita para confirmar tu asistencia en 1 clic o liberar el turno si no puedes asistir.
                      </Text>
                    </View>
                  </View>

                  {/* 📅 CALENDARIO INTERACTIVO + GRILLA DE HORARIOS HABILITADOS POR EL DUEÑO */}
                  <View style={{ marginBottom: 28, gap: 20 }}>
                    {/* 1. SELECCIÓN DE DÍA EN CALENDARIO */}
                    <View style={{ width: '100%' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 0 }]}>
                          📅 Día de la Cita
                        </Text>
                        {appointmentDate ? (
                          <Text style={{ color: brandColor, fontSize: 12.5, fontWeight: '900' }}>
                            Seleccionado: {appointmentDate}
                          </Text>
                        ) : null}
                      </View>

                      {/* Tira deslizable de los próximos 14 días según los Horarios del Portal Interno */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                      >
                        {(() => {
                          const currentHours: any = {
                            ...defaultHoursConfig,
                            ...(tenantInfo?.business_hours || tenantInfo?.businessHours || {}),
                            ...(localHours || {}),
                          };
                          const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                          const dayShortLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                          const monthShortLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                          const base = new Date();

                          return Array.from({ length: 14 }).map((_, idx) => {
                            const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + idx);
                            const yyyy = d.getFullYear();
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const dd = String(d.getDate()).padStart(2, '0');
                            const iso = `${yyyy}-${mm}-${dd}`;
                            const dKey = dayKeys[d.getDay()];
                            const dayConf = currentHours[dKey];
                            const isDayOpen = !dayConf || dayConf.isOpen !== false;
                            const isSelected = appointmentDate === iso;

                            return (
                              <TouchableOpacity
                                key={iso}
                                activeOpacity={0.8}
                                disabled={!isDayOpen}
                                onPress={() => setAppointmentDate(iso)}
                                style={{
                                  width: 74,
                                  paddingVertical: 12,
                                  paddingHorizontal: 8,
                                  borderRadius: 14,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderWidth: 1.5,
                                  borderColor: isSelected ? brandColor : (isDayOpen ? tColor.border : 'rgba(239,68,68,0.25)'),
                                  backgroundColor: isSelected ? brandColor : (isDayOpen ? tColor.input : 'rgba(239,68,68,0.06)'),
                                  opacity: isDayOpen ? 1 : 0.45,
                                }}
                              >
                                <Text style={{ color: isSelected ? '#FFF' : tColor.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>
                                  {idx === 0 ? 'Hoy' : dayShortLabels[d.getDay()]}
                                </Text>
                                <Text style={{ color: isSelected ? '#FFF' : tColor.text, fontSize: 20, fontWeight: '900', marginVertical: 2 }}>
                                  {d.getDate()}
                                </Text>
                                <Text style={{ color: isSelected ? '#FFF' : (isDayOpen ? '#10B981' : '#EF4444'), fontSize: 10, fontWeight: '800' }}>
                                  {isDayOpen ? monthShortLabels[d.getMonth()] : 'Cerrado'}
                                </Text>
                              </TouchableOpacity>
                            );
                          });
                        })()}
                      </ScrollView>

                      {Platform.OS === 'web' ? (
                        <View style={{ marginTop: 10 }}>
                          <input
                            type="date"
                            className="web-input-override"
                            value={appointmentDate}
                            onChange={e => setAppointmentDate(e.target.value)}
                          />
                        </View>
                      ) : null}
                    </View>

                    {/* 2. GRILLA DE HORARIOS DISPONIBLES POR JORNADA (☀️ MAÑANA / 🌤️ TARDE + BOTONES SIMÉTRICOS) */}
                    <View style={{ width: '100%' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 0 }]}>
                          🕒 Horarios Disponibles
                        </Text>
                        {appointmentTime ? (
                          <Text style={{ color: '#10B981', fontSize: 12.5, fontWeight: '900' }}>
                            ✓ Turno: {formatWallClockTime12h({ time: appointmentTime })}
                          </Text>
                        ) : null}
                      </View>

                      {availableTimes.length === 0 ? (
                        <View style={{ backgroundColor: tColor.input, borderWidth: 1, borderColor: tColor.border, borderRadius: 14, padding: 18, alignItems: 'center' }}>
                          <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 13.5, textAlign: 'center' }}>
                            {!appointmentDate
                              ? 'Selecciona un día arriba para ver los horarios.'
                              : 'No hay turnos disponibles en esta fecha (Día cerrado o sin cupos). Elige otro día arriba.'}
                          </Text>
                        </View>
                      ) : (() => {
                        const morningSlots = availableTimes.filter((tSlot) => parseInt(String(tSlot).split(':')[0], 10) < 12);
                        const afternoonSlots = availableTimes.filter((tSlot) => parseInt(String(tSlot).split(':')[0], 10) >= 12);
                        const activeTab = (timePeriodTab === 'morning' && morningSlots.length === 0 && afternoonSlots.length > 0)
                          ? 'afternoon'
                          : (timePeriodTab === 'afternoon' && afternoonSlots.length === 0 && morningSlots.length > 0)
                            ? 'morning'
                            : timePeriodTab;
                        const visibleSlots = activeTab === 'morning' ? morningSlots : afternoonSlots;

                        return (
                          <View>
                            {/* Selector Segmentado: ☀️ Mañana vs 🌤️ Tarde */}
                            <View
                              style={{
                                flexDirection: 'row',
                                gap: 8,
                                backgroundColor: 'rgba(0,0,0,0.35)',
                                padding: 5,
                                borderRadius: 14,
                                borderWidth: 1,
                                borderColor: tColor.border,
                                marginBottom: 14,
                              }}
                            >
                              <TouchableOpacity
                                activeOpacity={0.85}
                                disabled={morningSlots.length === 0}
                                onPress={() => {
                                  setTimePeriodTab('morning');
                                  if (morningSlots.length > 0 && !morningSlots.includes(appointmentTime)) {
                                    setAppointmentTime(morningSlots[0]);
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  paddingVertical: 10,
                                  borderRadius: 10,
                                  backgroundColor: activeTab === 'morning' ? brandColor : 'transparent',
                                  opacity: morningSlots.length === 0 ? 0.4 : 1,
                                }}
                              >
                                <Feather name="sun" size={14} color={activeTab === 'morning' ? '#FFFFFF' : '#F59E0B'} />
                                <Text style={{ color: activeTab === 'morning' ? '#FFFFFF' : tColor.text, fontWeight: '900', fontSize: 13 }}>
                                  Mañana ({morningSlots.length})
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                activeOpacity={0.85}
                                disabled={afternoonSlots.length === 0}
                                onPress={() => {
                                  setTimePeriodTab('afternoon');
                                  if (afternoonSlots.length > 0 && !afternoonSlots.includes(appointmentTime)) {
                                    setAppointmentTime(afternoonSlots[0]);
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  paddingVertical: 10,
                                  borderRadius: 10,
                                  backgroundColor: activeTab === 'afternoon' ? brandColor : 'transparent',
                                  opacity: afternoonSlots.length === 0 ? 0.4 : 1,
                                }}
                              >
                                <Feather name="sunset" size={14} color={activeTab === 'afternoon' ? '#FFFFFF' : '#38BDF8'} />
                                <Text style={{ color: activeTab === 'afternoon' ? '#FFFFFF' : tColor.text, fontWeight: '900', fontSize: 13 }}>
                                  Tarde ({afternoonSlots.length})
                                </Text>
                              </TouchableOpacity>
                            </View>

                            {/* Cuadrícula de 3 columnas exactas (sin flexGrow para que el último botón nunca se estire) */}
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {visibleSlots.map((tSlot) => {
                                const isSelectedTime = appointmentTime === tSlot;
                                const freeStaffAtSlot = getFreeStaffForSlot(appointmentDate, tSlot, selectedServiceType);
                                return (
                                  <TouchableOpacity
                                    key={tSlot}
                                    activeOpacity={0.8}
                                    onPress={() => setAppointmentTime(tSlot)}
                                    style={{
                                      width: isMobile ? '31.4%' : '23.5%',
                                      paddingVertical: 12,
                                      paddingHorizontal: 6,
                                      borderRadius: 12,
                                      borderWidth: 1.5,
                                      borderColor: isSelectedTime ? brandColor : tColor.border,
                                      backgroundColor: isSelectedTime ? brandColor : tColor.input,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <Text style={{ color: isSelectedTime ? '#FFFFFF' : tColor.text, fontWeight: '900', fontSize: 13.5 }}>
                                      {formatWallClockTime12h({ time: tSlot })}
                                    </Text>
                                    {activeStaffList.length > 0 ? (
                                      <Text style={{ color: isSelectedTime ? '#FFFFFF' : '#10B981', fontSize: 10, fontWeight: '800', marginTop: 2 }}>
                                        {freeStaffAtSlot.length} disp.
                                      </Text>
                                    ) : null}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        );
                      })()}
                    </View>
                  </View>

                  <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor, paddingVertical: 20 }]} onPress={handleBookService as any} disabled={isSubmitting}>
                    <Text style={[styles.primaryButtonText, { fontSize: 16 }]}>{isSubmitting ? 'Procesando...' : 'Confirmar Agendamiento'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {selectedOrder ? (
        <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
          <ScrollView contentContainerStyle={styles.modalContentWrapper}>
            <View style={[styles.modalContent, { backgroundColor: tColor.bg, borderColor: tColor.border }]}>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: tColor.input }]} onPress={() => setSelectedOrder(null)}><Text style={{color: tColor.text}}>✕</Text></TouchableOpacity>
              <Text style={[styles.pageTitle, { color: tColor.text }]}>Cierre de Servicio (POS)</Text>
              
              <View style={{ backgroundColor: tColor.input, padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: tColor.border }}>
                {isAutomotive ? (
                  <>
                    <Text style={{ color: tColor.text, fontSize: 16, fontWeight: 'bold' }}>Vehículo: <Text style={{ color: brandColor }}>{toTitleCase(selectedOrder.metadata?.carBrand || selectedOrder.brand || '')}</Text></Text>
                    <Text style={{ color: tColor.muted, fontSize: 14 }}>Placa: {selectedOrder.metadata?.carPlate || selectedOrder.plate} | Cliente: {toTitleCase(selectedOrder.clientName || '')}</Text>
                  </>
                ) : (
                  <>
                    <Text style={{ color: tColor.text, fontSize: 16, fontWeight: 'bold' }}>Cliente: <Text style={{ color: brandColor }}>{toTitleCase(selectedOrder.clientName || '')}</Text></Text>
                    <Text style={{ color: tColor.muted, fontSize: 14 }}>Servicio: {toTitleCase(selectedOrder.service?.name || selectedOrder.serviceType || 'General')}</Text>
                  </>
                )}
              </View>

              {tenantInfo?.loyaltyConfig?.isActive ? (
                <View style={{ marginBottom: 24 }}>
                  {isCheckingLoyalty ? (
                     <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: tColor.input, borderRadius: 12, borderWidth: 1, borderColor: tColor.border }}>
                       <ActivityIndicator color={brandColor} style={{ marginRight: 12 }} />
                       <Text style={{ color: tColor.muted }}>Verificando visitas del cliente...</Text>
                     </View>
                  ) : (
                    <>
                      {(tenantInfo?.loyaltyConfig?.referralActive && totalAvailableReferralCouponsPOS > 0) ? (
                        <View style={{ marginBottom: 16, padding: 16, backgroundColor: 'rgba(16, 185, 129, 0.12)', borderRadius: 12, borderWidth: 1, borderColor: '#10B981' }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flex: 1, paddingRight: 16 }}>
                              <Text style={{ color: '#10B981', fontWeight: '900', fontSize: 15 }}>🏆 ¡Premio por Referir Disponible!</Text>
                              <Text style={{ color: tColor.text, fontSize: 13, marginTop: 4 }}>
                                {selectedOrderLiveReferrals.length > 0 
                                  ? `Recomendó a: ${selectedOrderLiveReferrals.join(', ')}. ` 
                                  : ''}
                                Tiene {totalAvailableReferralCouponsPOS} cupón(es) de {tenantInfo.loyaltyConfig.referralDiscountPercent || 20}% de descuento listo(s) para aplicar (se usa 1 por servicio y el resto se guarda para su próxima visita).
                              </Text>
                            </View>
                            <Switch 
                              value={applyReferralDiscount} 
                              onValueChange={toggleReferralDiscount}
                              trackColor={{ false: '#3e3e3e', true: '#10B981' }}
                            />
                          </View>
                        </View>
                      ) : null}

                      {clientVisits !== null ? (
                        <View style={[{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: tColor.border }, 
                          clientVisits >= (tenantInfo.loyaltyConfig.visitsRequired || 10) && !rewardApplied ? { backgroundColor: 'rgba(255, 215, 0, 0.1)', borderColor: '#FFD700' } : { backgroundColor: tColor.input }
                        ]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View>
                              <Text style={{ color: tColor.text, fontWeight: 'bold', fontSize: 14 }}>
                                Programa de Fidelidad
                              </Text>
                              <Text style={{ color: tColor.muted, fontSize: 12, marginTop: 4 }}>
                                Lleva {clientVisits} visitas de {tenantInfo.loyaltyConfig.visitsRequired || 10} necesarias.
                              </Text>
                            </View>
                            
                            {(clientVisits >= (tenantInfo.loyaltyConfig.visitsRequired || 10) && !rewardApplied) ? (
                              <TouchableOpacity 
                                style={{ backgroundColor: '#FFD700', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 }}
                                onPress={handleApplyLoyaltyReward}
                                disabled={applyReferralDiscount}
                              >
                                <Text style={{ color: '#000', fontWeight: '900', fontSize: 12 }}>🎁 CANJEAR PREMIO</Text>
                              </TouchableOpacity>
                            ) : null}
                            
                            {rewardApplied ? (
                               <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: 12 }}>✅ Premio Aplicado</Text>
                            ) : null}
                          </View>
                          
                          <View style={{ width: '100%', height: 6, backgroundColor: tColor.border, borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
                             <View style={{ 
                               width: `${Math.min(100, (clientVisits / (tenantInfo.loyaltyConfig.visitsRequired || 10)) * 100)}%`, 
                               height: '100%', 
                               backgroundColor: clientVisits >= (tenantInfo.loyaltyConfig.visitsRequired || 10) ? '#FFD700' : brandColor 
                             }} />
                          </View>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}

              {(tenantInfo?.loyaltyConfig?.referralActive && activeReferredBy) ? (
                <View style={{ marginBottom: 24, padding: 16, backgroundColor: 'rgba(16, 185, 129, 0.08)', borderRadius: 12, borderWidth: 1, borderColor: '#10B981' }}>
                  <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: 14 }}>🤝 Viene Recomendado</Text>
                  <Text style={{ color: tColor.text, fontSize: 13, marginTop: 4 }}>
                    Referido por el número: <Text style={{ fontWeight: 'bold' }}>{activeReferredBy}</Text>
                  </Text>
                  <Text style={{ color: tColor.muted, fontSize: 12, marginTop: 4 }}>
                    Al cerrar y facturar esta orden, se le sumará automáticamente +1 visita y el cupón de {tenantInfo.loyaltyConfig.referralDiscountPercent || 20}% de descuento al cliente que lo recomendó.
                  </Text>
                </View>
              ) : null}
              
              <View style={{ flexDirection: 'column', gap: 16 } as any}>
                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 24 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: tColor.muted }]}>Valor Final a Cobrar ($)</Text>
                    <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: (rewardApplied || applyReferralDiscount) ? '#FFD700' : tColor.border, fontSize: 24, fontWeight: '900', color: (rewardApplied || applyReferralDiscount) ? '#FFD700' : brandColor }]} placeholder="$ 25.00" placeholderTextColor={tColor.muted} value={finalCost} onChangeText={(v) => setFinalCost(formatCurrency(v))} keyboardType="numeric" />
                  </View>
                  {isAutomotive ? (
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inputLabel, { color: tColor.muted }]}>Millaje de Salida</Text>
                      <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, fontSize: 18, fontWeight: 'bold' }]} placeholder="Ej: 21000" placeholderTextColor={tColor.muted} value={exitMileage} onChangeText={setExitMileage} keyboardType="numeric" />
                    </View>
                  ) : null}
                </View>

                <View style={{ marginBottom: 24 }}>
                  <Text style={[styles.inputLabel, { color: tColor.muted }]}>⚙️ Asignar Personal Responsable</Text>
                  {Platform.OS === 'web' ? (
                    <select className="web-input-override" value={assignedMechanicId} onChange={e => setAssignedMechanicId(e.target.value)} style={{ marginBottom: 10 }}>
                      <option value="" disabled>Seleccione el personal a cargo</option>
                      {activeStaffList.map((m, idx) => <option key={`${m.id}-${idx}`} value={m.id}>{toTitleCase(m.name)} ({toTitleCase(m.role)})</option>)}
                    </select>
                  ) : null}

                  {/* Lista interactiva de empleados (Funciona en iOS, Android y Web en 1 toque) */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {activeStaffList.length > 0 ? activeStaffList.map((m, idx) => {
                      const isSelStaff = assignedMechanicId === m.id;
                      return (
                        <TouchableOpacity
                          key={`${m.id}-pos-${idx}`}
                          activeOpacity={0.85}
                          onPress={() => setAssignedMechanicId(m.id)}
                          style={{
                            flexGrow: 1,
                            minWidth: isMobile ? '46%' : 160,
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            borderRadius: 12,
                            borderWidth: 1.5,
                            borderColor: isSelStaff ? brandColor : tColor.border,
                            backgroundColor: isSelStaff ? `${brandColor}22` : tColor.input,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <View
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              backgroundColor: isSelStaff ? brandColor : tColor.border,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Feather name={isSelStaff ? 'check' : 'user'} size={14} color="#FFFFFF" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 13.5 }} numberOfLines={1}>
                              {toTitleCase(m.name)}
                            </Text>
                            <Text style={{ color: isSelStaff ? brandColor : tColor.muted, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                              {toTitleCase(m.role)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }) : (
                      <Text style={{ color: tColor.muted, fontSize: 13 }}>No hay personal activo registrado.</Text>
                    )}
                  </View>
                </View>

                <View style={{ backgroundColor: tColor.input, padding: 24, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: tColor.border }}>
                  <Text style={{ margin: 0, marginBottom: 16, fontSize: 16, color: tColor.text, fontWeight: '800' }}>
                    {isAutomotive ? 'Reporte y Evidencias Técnicas' : 'Fotos del Trabajo (Opcional)'}
                  </Text>
                  <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 20 }}>
                    <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1 }}>
                      <Text style={{ fontSize: 13, color: tColor.muted, fontWeight: 'bold' }}>
                        {isAutomotive ? 'Nota 1 / Estado Inicial' : 'Detalles Iniciales (Opcional)'}
                      </Text>
                      <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, marginTop: 8, marginBottom: 12 }]} placeholder="Detalle..." placeholderTextColor={tColor.muted} value={oldParts} onChangeText={t => setOldParts(toTitleCase(t))} />
                      {!oldPartPreview ? (
                        <View style={{ marginTop: 4 }}>
                          {Platform.OS === 'web' ? (
                            <input type="file" ref={oldFileInputRef as any} accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageChange(e as any, 'old')} />
                          ) : null}
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={{ alignItems: 'center', justifyContent: 'center', padding: 14, borderWidth: 1.5, borderColor: brandColor, borderRadius: 12, backgroundColor: `${brandColor}12`, borderStyle: 'dashed', flexDirection: 'row', gap: 8 }}
                            onPress={() => Platform.OS === 'web' ? oldFileInputRef.current?.click() : handleNativeImagePick('old')}
                          >
                            <Feather name="camera" size={16} color={brandColor} />
                            <Text style={{ color: tColor.text, fontSize: 13, fontWeight: '800' }}>📸 Subir Foto (Antes)</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{ position: 'relative', width: '100%', height: 140, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: tColor.border, marginTop: 8, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                          {Platform.OS === 'web' ? (
                            <img src={oldPartPreview} alt="Evidencia Antes WebP" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Image source={{ uri: oldPartPreview }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          )}
                          <TouchableOpacity style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.75)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }} onPress={() => { setOldPartPreview(null); setOldPartImage(null); }}>
                            <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <View style={{ width: isMobile ? '100%' : undefined, flex: isMobile ? undefined : 1 }}>
                      <Text style={{ fontSize: 13, color: tColor.muted, fontWeight: 'bold' }}>
                        {isAutomotive ? 'Nota 2 / Resultado' : 'Resultado Final (Opcional)'}
                      </Text>
                      <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, marginTop: 8, marginBottom: 12 }]} placeholder="Detalle..." placeholderTextColor={tColor.muted} value={newParts} onChangeText={t => setNewParts(toTitleCase(t))} />
                      {!newPartPreview ? (
                        <View style={{ marginTop: 4 }}>
                          {Platform.OS === 'web' ? (
                            <input type="file" ref={newFileInputRef as any} accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageChange(e as any, 'new')} />
                          ) : null}
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={{ alignItems: 'center', justifyContent: 'center', padding: 14, borderWidth: 1.5, borderColor: '#10B981', borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.12)', borderStyle: 'dashed', flexDirection: 'row', gap: 8 }}
                            onPress={() => Platform.OS === 'web' ? newFileInputRef.current?.click() : handleNativeImagePick('new')}
                          >
                            <Feather name="camera" size={16} color="#10B981" />
                            <Text style={{ color: tColor.text, fontSize: 13, fontWeight: '800' }}>📸 Subir Foto (Después)</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{ position: 'relative', width: '100%', height: 140, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: tColor.border, marginTop: 8, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                          {Platform.OS === 'web' ? (
                            <img src={newPartPreview} alt="Evidencia Después WebP" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Image source={{ uri: newPartPreview }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          )}
                          <TouchableOpacity style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.75)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }} onPress={() => { setNewPartPreview(null); setNewPartImage(null); }}>
                            <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                <View style={{ marginBottom: 24 }}>
                  <Text style={[styles.inputLabel, { color: tColor.muted }]}>Notas y Diagnóstico Interno</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 }}>
                    {mechanicQuickNotes.map((opt, idx) => (
                      <TouchableOpacity key={`${opt}-${idx}`} style={[styles.chip, { backgroundColor: tColor.input, borderColor: tColor.border }, mechanicNotes.includes(opt) ? { backgroundColor: brandColor, borderColor: brandColor } : {}]} onPress={() => setMechanicNotes(prev => prev.includes(opt) ? prev : `${prev} ${opt}. `.trimStart())}>
                        <Text style={[styles.chipText, { color: tColor.muted }, mechanicNotes.includes(opt) ? styles.activeChipText : {}]}>+ {opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {Platform.OS === 'web' ? (
                    <textarea className="form-input" placeholder="Describe Los Ajustes Realizados..." value={mechanicNotes} onChange={(e: any) => setMechanicNotes(toTitleCase(e.target.value))} style={{ width: '100%', minHeight: '100px', padding: '14px', borderRadius: '12px', backgroundColor: tColor.input, border: `1px solid ${tColor.border}`, color: tColor.text, outline: 'none', resize: 'vertical' } as any} />
                  ) : (
                    <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, minHeight: 100 }]} multiline placeholder="Describe Los Ajustes..." placeholderTextColor={tColor.muted} value={mechanicNotes} onChangeText={t => setMechanicNotes(toTitleCase(t))} />
                  )}
                </View>

                <View style={{ marginBottom: 32 }}>
                  <Text style={[styles.inputLabel, { color: tColor.muted }]}>Alerta de Próxima Visita</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {nextServiceOptions.map((opt, idx) => (
                      <TouchableOpacity key={`${opt}-${idx}`} style={[styles.chip, { backgroundColor: tColor.input, borderColor: tColor.border }, nextServiceTime === opt ? { backgroundColor: brandColor, borderColor: brandColor } : {}]} onPress={() => setNextServiceTime(opt)}>
                        <Text style={[styles.chipText, { color: tColor.muted }, nextServiceTime === opt ? styles.activeChipText : {}]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                
                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor, paddingVertical: 20 }]} onPress={handleCompleteWorkOrder as any} disabled={isSubmitting}>
                  <Text style={[styles.primaryButtonText, { fontSize: 16 }]}>{isSubmitting ? 'Procesando...' : '✅ Cerrar Orden y Facturar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      ) : null}

      {isCatalogModalVisible ? (
        <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
          <ScrollView contentContainerStyle={styles.modalContentWrapper}>
            <View style={[styles.modalContent, { backgroundColor: tColor.bg, borderColor: tColor.border }]}>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: tColor.input }]} onPress={() => setIsCatalogModalVisible(false)}><Text style={{color: tColor.text}}>✕</Text></TouchableOpacity>
              <Text style={[styles.pageTitle, { color: tColor.text }]}>{catalogEditingId ? 'Editar Servicio' : 'Nuevo Servicio'}</Text>
              
              <View style={{ flexDirection: 'column', gap: 16 } as any}>
                <View>
                  <Text style={[styles.inputLabel, { color: tColor.muted }]}>Foto del Servicio (Opcional)</Text>
                  {!catalogFormPreview ? (
                    <View style={{ marginTop: 8 }}>
                      {Platform.OS === 'web' ? (
                        <input type="file" ref={catalogInputRef as any} accept="image/*" style={{ display: 'none' }} onChange={handleCatalogImageSelect} />
                      ) : null}
                      <TouchableOpacity
                        style={{ alignItems: 'center', justifyContent: 'center', padding: 24, borderWidth: 2, borderColor: tColor.border, borderRadius: 12, backgroundColor: tColor.input, borderStyle: 'dashed' }}
                        onPress={() => Platform.OS === 'web' ? catalogInputRef.current?.click() : handleNativeImagePick('catalog')}
                      >
                        <Text style={{ fontSize: 32, marginBottom: 8 }}>📸</Text>
                        <Text style={{ color: tColor.muted, fontSize: 14, fontWeight: 'bold' }}>Toca para subir foto</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ position: 'relative', width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: tColor.border, marginTop: 8, backgroundColor: '#000' }}>
                      {(catalogFormPreview.startsWith('blob:') || catalogFormPreview.startsWith('file:') || catalogFormPreview.startsWith('ph:') || catalogFormPreview.startsWith('content:')) ? (
                        Platform.OS === 'web' ? <img src={catalogFormPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Image source={{ uri: catalogFormPreview }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <PrivateSupabaseImage path={catalogFormPreview} alt="Preview" />
                      )}
                      <TouchableOpacity style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }} onPress={() => { setCatalogFormPreview(null); setCatalogFormFile(null); }}>
                        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={[styles.inputLabel, { color: tColor.muted, marginBottom: 0 }]}>Nombre del Servicio</Text>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setIsCatalogServiceDropdownOpen((prev) => !prev)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingVertical: 4,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        backgroundColor: `${brandColor}18`,
                        borderWidth: 1,
                        borderColor: `${brandColor}50`,
                      }}
                    >
                      <Feather name="list" size={12} color={brandColor} />
                      <Text style={{ color: brandColor, fontSize: 11.5, fontWeight: '900' }}>
                        {isCatalogServiceDropdownOpen ? 'Ocultar sugeridos' : 'Elegir servicio predefinido'}
                      </Text>
                      <Feather name={isCatalogServiceDropdownOpen ? 'chevron-up' : 'chevron-down'} size={13} color={brandColor} />
                    </TouchableOpacity>
                  </View>

                  {isCatalogServiceDropdownOpen ? (
                    <View
                      style={{
                        marginBottom: 12,
                        backgroundColor: theme === 'dark' ? '#0B0F17' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: tColor.border,
                        borderRadius: 14,
                        padding: 8,
                        gap: 6,
                      }}
                    >
                      <Text style={{ color: tColor.muted, fontSize: 11, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2 }}>
                        ⚡ Toca uno para autocompletar nombre, precio y duración:
                      </Text>
                      {availableServiceTemplates.map((tpl, idx) => {
                        const isSelectedTpl = catalogFormName.toLowerCase() === tpl.name.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={`${tpl.name}-${idx}`}
                            activeOpacity={0.8}
                            onPress={() => {
                              setCatalogFormName(tpl.name);
                              setCatalogFormDesc(tpl.desc);
                              setCatalogFormPrice(formatCurrency(tpl.price));
                              setCatalogFormDuration(tpl.duration);
                              setIsCatalogServiceDropdownOpen(false);
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 10,
                              backgroundColor: isSelectedTpl ? `${brandColor}22` : tColor.input,
                              borderWidth: 1,
                              borderColor: isSelectedTpl ? brandColor : 'transparent',
                            }}
                          >
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ color: isSelectedTpl ? brandColor : tColor.text, fontWeight: '800', fontSize: 13.5 }}>
                                {tpl.name}
                              </Text>
                              <Text style={{ color: tColor.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                                ⏱️ {tpl.duration} min • Sugerido: ${tpl.price}
                              </Text>
                            </View>
                            <Ionicons
                              name={isSelectedTpl ? 'checkmark-circle' : 'add-circle-outline'}
                              size={18}
                              color={isSelectedTpl ? brandColor : tColor.muted}
                            />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}

                  <TextInput
                    style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]}
                    placeholder="Escribe el nombre o elige uno arriba..."
                    placeholderTextColor={tColor.muted}
                    value={catalogFormName}
                    onChangeText={t => setCatalogFormName(toTitleCase(t))}
                  />
                </View>

                <View>
                  <Text style={[styles.inputLabel, { color: tColor.muted }]}>Descripción Detallada (Opcional)</Text>
                  <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, minHeight: 60 }]} placeholder="Ej. Incluye Lavado Y Perfilado..." placeholderTextColor={tColor.muted} multiline value={catalogFormDesc} onChangeText={t => setCatalogFormDesc(toTitleCase(t))} />
                </View>

                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: tColor.muted }]}>Precio ($)</Text>
                    <TextInput style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text }]} placeholder="$ 0" keyboardType="numeric" placeholderTextColor={tColor.muted} value={catalogFormPrice} onChangeText={t => setCatalogFormPrice(formatCurrency(t))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: tColor.muted }]}>Duración (Min)</Text>
                    {Platform.OS === 'web' ? (
                      <select className="web-input-override" value={catalogFormDuration} onChange={e => setCatalogFormDuration(e.target.value)}>
                        <option value="15">15 minutos</option><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">1 hora</option><option value="90">1.5 horas</option><option value="120">2 horas</option><option value="180">3 horas</option>
                      </select>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setIsCatalogDurationDropdownOpen((prev) => !prev)}
                        style={[
                          styles.formInput,
                          {
                            backgroundColor: tColor.input,
                            borderColor: isCatalogDurationDropdownOpen ? brandColor : tColor.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingHorizontal: 14,
                          },
                        ]}
                      >
                        <Text style={{ color: tColor.text, fontWeight: '800', fontSize: 14 }}>
                          {catalogFormDuration === '60'
                            ? '1 hora (60m)'
                            : catalogFormDuration === '90'
                            ? '1.5 horas (90m)'
                            : catalogFormDuration === '120'
                            ? '2 horas (120m)'
                            : catalogFormDuration === '180'
                            ? '3 horas (180m)'
                            : `${catalogFormDuration || '30'} min`}
                        </Text>
                        <Feather name={isCatalogDurationDropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color={tColor.muted} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {isCatalogDurationDropdownOpen && Platform.OS !== 'web' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: tColor.input, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: tColor.border }}>
                    {[
                      { val: '15', label: '15 min' },
                      { val: '30', label: '30 min' },
                      { val: '45', label: '45 min' },
                      { val: '60', label: '1 hora' },
                      { val: '90', label: '1.5 horas' },
                      { val: '120', label: '2 horas' },
                      { val: '180', label: '3 horas' },
                    ].map((dOpt) => {
                      const activeDur = catalogFormDuration === dOpt.val;
                      return (
                        <TouchableOpacity
                          key={dOpt.val}
                          onPress={() => {
                            setCatalogFormDuration(dOpt.val);
                            setIsCatalogDurationDropdownOpen(false);
                          }}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            backgroundColor: activeDur ? brandColor : tColor.bg,
                            borderWidth: 1,
                            borderColor: activeDur ? brandColor : tColor.border,
                          }}
                        >
                          <Text style={{ color: activeDur ? '#FFFFFF' : tColor.text, fontSize: 12, fontWeight: '800' }}>
                            {dOpt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
                
                <View style={{ marginTop: 8 }}>
                  <ContentTermsCheck value={acceptedContentTerms} onChange={setAcceptedContentTerms} tColor={tColor} brandColor={brandColor} />
                </View>
                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: brandColor, marginTop: 0 }]} onPress={handleSaveCatalogService} disabled={isSubmitting}>
                  <Text style={styles.primaryButtonText}>{isSubmitting ? 'Guardando...' : 'Guardar Servicio'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      ) : null}

      {reportTarget ? (
        <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
          <ScrollView contentContainerStyle={styles.modalContentWrapper}>
            <View style={[styles.modalContent, { backgroundColor: tColor.bg, borderColor: tColor.border, maxWidth: 460, padding: 28 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: tColor.text, fontSize: 22, fontWeight: '900' }}>Reportar Contenido</Text>
                <TouchableOpacity onPress={closeReport} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="x" size={22} color={tColor.text} />
                </TouchableOpacity>
              </View>
              <Text style={{ color: tColor.muted, fontSize: 13, lineHeight: 19, marginBottom: 6 }}>
                Selecciona el motivo por el cual deseas reportar este contenido. Nuestro equipo lo revisará de inmediato.
              </Text>
              <Text style={{ color: tColor.text, fontSize: 12, fontWeight: '800', marginBottom: 14 }} numberOfLines={2}>
                📌 {reportTarget.title}
              </Text>

              {REPORT_REASONS.map((r, i) => {
                const selected = reportReason === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    activeOpacity={0.8}
                    onPress={() => setReportReason(r.key)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: i === REPORT_REASONS.length - 1 ? 0 : 1, borderBottomColor: tColor.border }}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? '#FF5C6C' : tColor.muted, alignItems: 'center', justifyContent: 'center' }}>
                      {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF5C6C' }} /> : null}
                    </View>
                    <Text style={{ color: tColor.text, fontSize: 15, fontWeight: selected ? '800' : '500', flex: 1 }}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}

              <TextInput
                style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, minHeight: 70, marginTop: 16 }]}
                placeholder="Detalles adicionales (opcional)"
                placeholderTextColor={tColor.muted}
                multiline
                maxLength={500}
                value={reportDetails}
                onChangeText={setReportDetails}
              />
              <TextInput
                style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, marginTop: 12 }]}
                placeholder={reportReason === 'copyright_spam' ? 'Tu correo o teléfono (recomendado en reclamos de copyright)' : 'Tu correo o teléfono (opcional)'}
                placeholderTextColor={tColor.muted}
                maxLength={120}
                value={reportContact}
                onChangeText={setReportContact}
              />

              <Text style={{ color: tColor.muted, fontSize: 11, lineHeight: 16, marginTop: 14 }}>
                Los negocios son responsables del contenido que publican. AutoFlow revisa los reportes y puede retirar contenido que infrinja derechos de terceros o nuestras normas. Los reportes de mala fe pueden ser ignorados.
              </Text>

              <TouchableOpacity
                style={{ backgroundColor: '#FF5C6C', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 18, opacity: (!reportReason || isSendingReport) ? 0.55 : 1 }}
                onPress={handleSubmitReport}
                disabled={!reportReason || isSendingReport}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>{isSendingReport ? 'Enviando...' : 'Enviar Reporte'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      ) : null}

      {cancellingOrder ? (
        <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
          <ScrollView contentContainerStyle={styles.modalContentWrapper}>
            <View style={[styles.modalContent, { backgroundColor: tColor.bg, borderColor: tColor.border, maxWidth: 480, padding: 28 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 1, borderColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="calendar" size={18} color="#EF4444" />
                  </View>
                  <Text style={{ color: tColor.text, fontSize: 20, fontWeight: '900' }}>Cancelar Cita y Liberar Turno</Text>
                </View>
                <TouchableOpacity onPress={() => setCancellingOrder(null)}>
                  <Feather name="x" size={22} color={tColor.text} />
                </TouchableOpacity>
              </View>

              <View style={{ backgroundColor: tColor.input, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: tColor.border, marginBottom: 16 }}>
                <Text style={{ color: tColor.text, fontWeight: '900', fontSize: 15 }}>
                  👤 {toTitleCase(cancellingOrder.clientName || clientExpedienteData?.client?.name || 'Cliente')}
                </Text>
                <Text style={{ color: brandColor, fontWeight: '800', fontSize: 13, marginTop: 4 }}>
                  ✨ {toTitleCase(cancellingOrder.service?.name || cancellingOrder.serviceType || 'Servicio General')}  •  🕒 {cancellingOrder.time || 'Turno agendado'}
                </Text>
                <Text style={{ color: tColor.muted, fontSize: 12, marginTop: 4 }}>
                  Al cancelar, este horario quedará libre de inmediato para otros clientes y se enviará una notificación por Telegram y Push.
                </Text>
              </View>

              <Text style={[styles.inputLabel, { color: tColor.muted }]}>Motivo de la cancelación (Opcional)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {['Surgió un imprevisto', 'Cambio de horario', 'Cliente no puede asistir', 'Solicitud del cliente'].map((mOpt) => (
                  <TouchableOpacity
                    key={mOpt}
                    onPress={() => setCancelReasonText(mOpt)}
                    style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: cancelReasonText === mOpt ? '#EF4444' : tColor.border, backgroundColor: cancelReasonText === mOpt ? 'rgba(239, 68, 68, 0.15)' : tColor.input }}
                  >
                    <Text style={{ color: cancelReasonText === mOpt ? '#EF4444' : tColor.muted, fontSize: 11.5, fontWeight: 'bold' }}>{mOpt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, minHeight: 70, marginBottom: 20 }]}
                placeholder="Escribe el motivo si deseas agregar detalles..."
                placeholderTextColor={tColor.muted}
                multiline
                value={cancelReasonText}
                onChangeText={setCancelReasonText}
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={[styles.secondaryButton, { flex: 1, backgroundColor: tColor.input, borderColor: tColor.border }]}
                  onPress={() => setCancellingOrder(null)}
                >
                  <Text style={[styles.secondaryButtonText, { color: tColor.text }]}>Volver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, { flex: 1.5, backgroundColor: '#EF4444', flexDirection: 'row', gap: 8 }]}
                  onPress={handleConfirmCancelAppointment}
                  disabled={isCancellingApt}
                >
                  <Feather name="x-circle" size={16} color="#FFF" />
                  <Text style={styles.primaryButtonText}>{isCancellingApt ? 'Cancelando...' : 'Confirmar Cancelación'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      ) : null}

      {isSupportModalOpen ? (
        <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
          <ScrollView contentContainerStyle={styles.modalContentWrapper}>
            <View style={[styles.modalContent, { backgroundColor: tColor.bg, borderColor: tColor.border, maxWidth: 520, padding: 28 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(56, 189, 248, 0.16)', borderWidth: 1, borderColor: '#38BDF8', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="headphones" size={20} color="#38BDF8" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: tColor.text, fontSize: 19, fontWeight: '900' }}>{t.supportModalTitle}</Text>
                    <Text style={{ color: '#38BDF8', fontSize: 11.5, fontWeight: '700' }}>{t.supportModalSub}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setIsSupportModalOpen(false)}>
                  <Feather name="x" size={22} color={tColor.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: tColor.muted, marginTop: 8 }]}>{tr('Tu Nombre o Encargado', 'Your Name or Manager')}</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, marginBottom: 14 }]}
                placeholder="Ej: Cesar Gomez"
                placeholderTextColor={tColor.muted}
                value={supportContactName}
                onChangeText={setSupportContactName}
              />

              <Text style={[styles.inputLabel, { color: tColor.muted }]}>{tr('Tu Teléfono / WhatsApp Directo', 'Your Direct Phone / WhatsApp')}</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, marginBottom: 14 }]}
                placeholder="Ej: +1 909 555 0199"
                placeholderTextColor={tColor.muted}
                value={supportContactPhone}
                onChangeText={setSupportContactPhone}
              />

              <Text style={[styles.inputLabel, { color: tColor.muted }]}>{tr('¿En qué te acompañamos?', 'How can we help you?')}</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: tColor.input, borderColor: tColor.border, color: tColor.text, minHeight: 80, marginBottom: 18 }]}
                placeholder={tr('Escribe tu duda o solicita acompañamiento paso a paso...', 'Write your question or request step-by-step assistance...')}
                placeholderTextColor={tColor.muted}
                multiline
                value={supportMessage}
                onChangeText={setSupportMessage}
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={[styles.secondaryButton, { flex: 1, backgroundColor: tColor.input, borderColor: tColor.border }]}
                  onPress={() => setIsSupportModalOpen(false)}
                >
                  <Text style={[styles.secondaryButtonText, { color: tColor.text }]}>{t.cancelBtn}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, { flex: 1.5, backgroundColor: '#0EA5E9', flexDirection: 'row', gap: 8 }]}
                  onPress={handleSendAutoFlowSupport}
                  disabled={isSendingSupport}
                >
                  <Feather name="send" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>{isSendingSupport ? t.processingBtn : tr('Enviar a Soporte', 'Send to Support')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      ) : null}

      {expandedImage ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 2000, justifyContent: 'center', alignItems: 'center' }]}>
          <TouchableOpacity style={{ position: 'absolute', top: Platform.OS === 'ios' ? 56 : 24, right: 24, backgroundColor: 'rgba(255,255,255,0.1)', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', zIndex: 2100 }} onPress={() => setExpandedImage(null)}>
            <Text style={{ color: '#FFF', fontSize: 20 }}>✕</Text>
          </TouchableOpacity>
          <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '900', marginBottom: 16 }}>{expandedImage.alt}</Text>
          <View style={{ width: '90%', height: '80%' }}>
            <PrivateSupabaseImage path={expandedImage.path} alt={expandedImage.alt} isExpanded={true} />
          </View>
        </View>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', overflow: 'hidden' as any },
  contentArea: { padding: 20, maxWidth: 1200, alignSelf: 'center', width: '100%', minHeight: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, width: '100%' },
  pageTitle: { fontSize: 28, fontWeight: '900', marginBottom: 8 },
  sectionTitle: { fontSize: 22, fontWeight: '900', marginBottom: 20 },
  primaryButton: { paddingVertical: 14, paddingHorizontal: 22, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14.5 },
  secondaryButton: { borderWidth: 1, paddingVertical: 14, paddingHorizontal: 22, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontWeight: '800', fontSize: 14.5 },
  formInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14.5, width: '100%' },
  inputLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase' },
  tabsContainer: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 28, padding: 8, borderRadius: 16 },
  tab: { flex: 1, minWidth: 120, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  tabText: { fontWeight: '800', fontSize: 14 },
  bentoGrid: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', flexWrap: 'wrap', gap: 20, width: '100%' },
  glassCard: { borderWidth: 1, borderRadius: 22, padding: 22, width: '100%', maxWidth: '100%' },
  flexCard: { borderWidth: 1, borderRadius: 22, padding: 22, flexGrow: 1, minWidth: 260, maxWidth: '100%' },
  modalOverlay: { backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000 },
  modalContentWrapper: {
    flexGrow: 1,
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 62 : Platform.OS === 'android' ? 46 : 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  modalContent: { borderWidth: 1, borderRadius: 24, padding: 24, width: '100%', maxWidth: 750, position: 'relative' },
  closeBtn: { position: 'absolute', top: 20, right: 20, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, marginRight: 8, marginBottom: 8 },
  chipText: { fontWeight: 'bold', fontSize: 13 },
  activeChipText: { color: '#FFFFFF' },
  filterGroup: { width: '100%', minWidth: 140 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  emptyText: { textAlign: 'center', fontWeight: 'bold', fontSize: 16 },
  orderCard: { borderWidth: 1, borderRadius: 16, padding: 20, flex: 1, minWidth: 260, maxWidth: '100%', display: 'flex', flexDirection: 'column' },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  plateBadge: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  plateText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16, letterSpacing: 1.5 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  statusDot: { fontSize: 12, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  orderDetails: { marginBottom: 16 },
  vehicleTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  clientName: { fontSize: 14 },
  serviceBox: { borderWidth: 1, padding: 16, borderRadius: 12, marginBottom: 24 },
  serviceText: { fontSize: 14, fontWeight: '700' },
  kpiLabel: { fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase' },
  kpiValue: { fontSize: 36, fontWeight: '900', marginTop: 8 },
  staffRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  staffName: { fontWeight: 'bold', fontSize: 14.5 },
  staffRole: { fontSize: 12, marginTop: 4 },
  activeStatusBadge: { backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12 },
  activeStatusText: { color: '#10B981', fontSize: 12, fontWeight: 'bold' },
  inactiveStatusBadge: { backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12 },
  inactiveStatusText: { color: '#EF4444', fontSize: 12, fontWeight: 'bold' }
});
