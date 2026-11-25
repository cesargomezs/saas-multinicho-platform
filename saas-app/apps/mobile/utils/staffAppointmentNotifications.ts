import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

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

export interface StaffNotificationParams {
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  eventType: 'assigned' | 'cancelled';
  tenantId?: string | null;
  businessName?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  staffPhone?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  serviceName?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  reason?: string | null;
}

const cleanDigits = (phone?: string | null): string => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/**
 * Tokens generados localmente tipo `ExponentPushToken[ios-27.2-...]` NO son tokens reales de Expo Push (`ExponentPushToken[22chars]`).
 * Expo rechazará los sintéticos; por eso devolvemos `realExpoTokens` y `syntheticTokens` por separado para diagnóstico.
 */
function classifyExpoTokens(tokens: string[]): {
  realExpoTokens: string[];
  syntheticTokens: string[];
} {
  const realExpoTokens: string[] = [];
  const syntheticTokens: string[] = [];

  for (const raw of tokens) {
    const t = String(raw || '').trim();
    if (!t) continue;
    const match = t.match(/^(?:ExponentPushToken|ExpoPushToken)\[([^\]]+)\]$/);
    if (!match) continue;
    const inner = match[1];
    // Tokens reales de Expo suelen ser alfanuméricos tipo base64url (~18-26 chars) sin empezar por 'ios-' o 'android-'
    const looksSynthetic = /^(?:ios|android|web)-/i.test(inner);
    if (looksSynthetic) {
      syntheticTokens.push(t);
    } else {
      realExpoTokens.push(t);
    }
  }

  return { realExpoTokens, syntheticTokens };
}

async function resolveStaffPushTokens(params: StaffNotificationParams): Promise<{
  allTokens: string[];
  realExpoTokens: string[];
  syntheticTokens: string[];
}> {
  const tokens: string[] = [];

  try {
    let targetUserIds: string[] = [];

    if (supabaseUrl && !supabaseUrl.includes('tu-anon-key')) {
      const staffDigits = cleanDigits(params.staffPhone);
      if (params.staffId || staffDigits || params.staffName) {
        try {
          const { data: staffRows } = await supabase
            .from('staff')
            .select('id, user_id, phone, name')
            .limit(100);

          if (Array.isArray(staffRows)) {
            const matched = staffRows.filter((row: any) => {
              if (params.staffId && String(row.id) === String(params.staffId)) return true;
              if (staffDigits && cleanDigits(row.phone) === staffDigits) return true;
              if (
                params.staffName &&
                String(row.name || '').trim().toLowerCase() === String(params.staffName).trim().toLowerCase()
              ) {
                return true;
              }
              return false;
            });

            matched.forEach((m: any) => {
              const uid = m.user_id || m.userId;
              if (uid && !targetUserIds.includes(String(uid))) {
                targetUserIds.push(String(uid));
              }
            });
          }
        } catch (_stErr) {}
      }

      if (targetUserIds.length > 0) {
        const { data: devRows } = await supabase
          .from('user_devices')
          .select('push_token, device_model, user_id')
          .in('user_id', targetUserIds)
          .not('push_token', 'is', null);

        if (Array.isArray(devRows)) {
          devRows.forEach((d: any) => {
            const tok = String(d.push_token || '').trim();
            if (tok && !tokens.includes(tok)) tokens.push(tok);
          });
        }
      }

      // Si no se hallaron tokens por staffId, tomar los registrados en user_devices
      if (tokens.length === 0) {
        const { data: anyDevices } = await supabase
          .from('user_devices')
          .select('push_token, device_model, is_active')
          .not('push_token', 'is', null)
          .limit(30);

        if (Array.isArray(anyDevices)) {
          anyDevices.forEach((d: any) => {
            if (d.is_active === false) return;
            const tok = String(d.push_token || '').trim();
            if (tok && !tokens.includes(tok)) tokens.push(tok);
          });
        }
      }
    }
  } catch (_err) {}

  const { realExpoTokens, syntheticTokens } = classifyExpoTokens(tokens);
  return { allTokens: tokens, realExpoTokens, syntheticTokens };
}

async function sendExpoPushToTokens(
  realExpoTokens: string[],
  title: string,
  body: string,
  data: Record<string, any>
): Promise<{ attempted: number; response?: any }> {
  if (realExpoTokens.length === 0) {
    return { attempted: 0 };
  }

  try {
    const messages = realExpoTokens.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data,
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const json = await res.json().catch(() => null);
    console.log('[STAFF-PUSH] Expo push response:', JSON.stringify(json));
    return { attempted: realExpoTokens.length, response: json };
  } catch (expoErr: any) {
    console.error('[STAFF-PUSH] Expo push error:', expoErr);
    return { attempted: realExpoTokens.length, response: { error: String(expoErr?.message || expoErr) } };
  }
}

function triggerWebLocalAlert(title: string, body: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    } catch (_nErr) {}
  }
}

export async function notifyStaffAppointmentEvent(params: StaffNotificationParams): Promise<{
  sent: boolean;
  tokensCount: number;
  realExpoTokensCount: number;
  syntheticTokensCount: number;
  backendOk: boolean;
  expoResult?: any;
}> {
  const isAssigned = params.eventType === 'assigned';
  const staffLabel = params.staffName ? params.staffName.trim() : 'Staff asignado';
  const clientLabel = params.clientName ? params.clientName.trim() : 'Cliente';
  const serviceLabel = params.serviceName ? params.serviceName.trim() : 'Servicio';
  const dateLabel = params.appointmentDate ? String(params.appointmentDate).split('T')[0] : 'Hoy';
  const timeLabel = params.appointmentTime ? String(params.appointmentTime).substring(0, 5) : '';
  const whenStr = [dateLabel, timeLabel].filter(Boolean).join(' • ');

  const title = isAssigned
    ? `📌 Nueva cita asignada a ${staffLabel}`
    : `❌ Cita cancelada (${staffLabel})`;

  const body = isAssigned
    ? `${clientLabel} agendó ${serviceLabel}${whenStr ? ` (${whenStr})` : ''}.`
    : `La cita de ${clientLabel} (${serviceLabel}${whenStr ? ` • ${whenStr}` : ''}) fue cancelada${
        params.reason ? `: ${params.reason}` : '.'
      }`;

  const { allTokens, realExpoTokens, syntheticTokens } = await resolveStaffPushTokens(params);
  let backendOk = false;

  console.log('[STAFF-PUSH] Dispatching event:', {
    eventType: params.eventType,
    tenantId: params.tenantId,
    staffId: params.staffId,
    allTokensCount: allTokens.length,
    realExpoTokensCount: realExpoTokens.length,
    syntheticTokensCount: syntheticTokens.length,
  });

  for (const endpoint of ['/api/notifications/staff-event', '/api/notifications/send']) {
    try {
      const res = await params.apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          eventType: params.eventType,
          tenantId: params.tenantId || undefined,
          businessName: params.businessName || undefined,
          staffId: params.staffId || undefined,
          staffName: staffLabel,
          staffPhone: params.staffPhone || undefined,
          clientName: clientLabel,
          clientPhone: params.clientPhone || undefined,
          serviceName: serviceLabel,
          appointmentDate: params.appointmentDate || undefined,
          appointmentTime: params.appointmentTime || undefined,
          reason: params.reason || undefined,
          pushTokens: realExpoTokens.length > 0 ? realExpoTokens : allTokens,
          title,
          body,
        }),
      });
      if (res && res.ok) {
        backendOk = true;
        break;
      }
    } catch (apiErr) {
      console.error(`[STAFF-PUSH] Error calling ${endpoint}:`, apiErr);
    }
  }

  const expoResult = await sendExpoPushToTokens(realExpoTokens, title, body, {
    eventType: params.eventType,
    staffId: params.staffId || null,
    clientName: clientLabel,
    serviceName: serviceLabel,
    appointmentDate: dateLabel,
    appointmentTime: timeLabel,
  });

  triggerWebLocalAlert(title, body);

  return {
    sent: backendOk || realExpoTokens.length > 0,
    tokensCount: allTokens.length,
    realExpoTokensCount: realExpoTokens.length,
    syntheticTokensCount: syntheticTokens.length,
    backendOk,
    expoResult,
  };
}
