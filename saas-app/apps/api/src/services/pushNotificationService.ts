import { db } from '@taller/database';
import { sql } from 'drizzle-orm';

export interface ExpoPushPayload {
  title: string;
  body: string;
  badge?: number;
  data?: Record<string, any>;
}

export async function registerDeviceToken(params: {
  expoPushToken: string;
  userId?: string | null;
  tenantId?: string | null;
  role?: 'client' | 'tenant_owner' | 'staff';
  zipCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  if (!params.expoPushToken?.startsWith('ExponentPushToken[')) {
    throw new Error('Token de Expo inválido');
  }

  const cleanZip = params.zipCode ? String(params.zipCode).trim().slice(0, 15) : null;
  const latVal = params.latitude !== undefined && params.latitude !== null ? Number(params.latitude) : null;
  const lonVal = params.longitude !== undefined && params.longitude !== null ? Number(params.longitude) : null;

  await db.execute(sql`
    INSERT INTO public.device_push_tokens (
      expo_push_token, user_id, tenant_id, role, zip_code, latitude, longitude, is_active, updated_at
    )
    VALUES (
      ${params.expoPushToken.trim()},
      ${params.userId ? sql`${params.userId}::uuid` : sql`NULL`},
      ${params.tenantId ? sql`${params.tenantId}::uuid` : sql`NULL`},
      ${params.role || 'client'},
      ${cleanZip},
      ${latVal},
      ${lonVal},
      TRUE,
      NOW()
    )
    ON CONFLICT (expo_push_token)
    DO UPDATE SET
      user_id = COALESCE(EXCLUDED.user_id, public.device_push_tokens.user_id),
      tenant_id = COALESCE(EXCLUDED.tenant_id, public.device_push_tokens.tenant_id),
      role = EXCLUDED.role,
      zip_code = COALESCE(EXCLUDED.zip_code, public.device_push_tokens.zip_code),
      latitude = COALESCE(EXCLUDED.latitude, public.device_push_tokens.latitude),
      longitude = COALESCE(EXCLUDED.longitude, public.device_push_tokens.longitude),
      is_active = TRUE,
      updated_at = NOW()
  `);
}

export async function sendExpoPushInBatches(tokens: string[], payload: ExpoPushPayload): Promise<void> {
  const uniqueTokens = [
    ...new Set(tokens.filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken['))),
  ];
  if (uniqueTokens.length === 0) return;

  const CHUNK_SIZE = 100;
  const deadTokens: string[] = [];

  for (let i = 0; i < uniqueTokens.length; i += CHUNK_SIZE) {
    const chunk = uniqueTokens.slice(i, i + CHUNK_SIZE);
    const messages = chunk.map((to) => ({
      to,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      ...(typeof payload.badge === 'number' ? { badge: payload.badge } : {}),
      data: payload.data || {},
    }));

    try {
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
      if (Array.isArray(json?.data)) {
        json.data.forEach((ticket: any, idx: number) => {
          if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
            deadTokens.push(chunk[idx]);
          }
        });
      }
    } catch (err) {
      console.error('⚠️ Error enviando lote Expo Push:', err);
    }
  }

  for (const dead of deadTokens) {
    await db.execute(sql`
      UPDATE public.device_push_tokens
      SET is_active = FALSE, updated_at = NOW()
      WHERE expo_push_token = ${dead}
    `).catch(() => {});
  }
}

// Helper interno para persistir la notificación en la bandeja real (public.push_notifications)
async function saveNotificationToInbox(params: {
  tenantId?: string | null;
  userId?: string | null;
  pushToken?: string | null;
  role: 'client' | 'business';
  eventType: string;
  payload: ExpoPushPayload;
}) {
  try {
    await db.execute(sql`
      INSERT INTO public.push_notifications (
        tenant_id, user_id, push_token, role, event_type, title, body, data, status, is_read, is_deleted, sent_at, created_at
      )
      VALUES (
        ${params.tenantId ? sql`${params.tenantId}::uuid` : sql`NULL`},
        ${params.userId ? sql`${params.userId}::uuid` : sql`NULL`},
        ${params.pushToken || null},
        ${params.role},
        ${params.eventType},
        ${params.payload.title},
        ${params.payload.body},
        ${JSON.stringify(params.payload.data || {})}::jsonb,
        'sent',
        FALSE,
        FALSE,
        NOW(),
        NOW()
      )
    `);
  } catch (err) {
    console.error('⚠️ Error guardando notificación en push_notifications:', err);
  }
}

// 🏢 Notificar al Dueño / Barbero / Staff (se guarda en bandeja de negocio + Expo Push)
export async function notifyTenantPush(tenantId: string, payload: ExpoPushPayload): Promise<void> {
  if (!tenantId) return;

  const devRes = await db.execute(sql`
    SELECT expo_push_token, user_id
    FROM public.device_push_tokens
    WHERE is_active = TRUE AND tenant_id = ${tenantId}::uuid
  `);
  const rows = Array.isArray(devRes) ? devRes : (devRes as any).rows || [];

  // Guardar 1 registro en bandeja de negocio (Hoy + Futuros)
  await saveNotificationToInbox({
    tenantId,
    userId: rows[0]?.user_id ? String(rows[0].user_id) : null,
    pushToken: rows[0]?.expo_push_token ? String(rows[0].expo_push_token) : null,
    role: 'business',
    eventType: String(payload.data?.eventType || 'appointment'),
    payload,
  });

  await sendExpoPushInBatches(
    rows.map((r: any) => String(r.expo_push_token)),
    payload
  );
}

// 👤 Notificar a un Cliente específico (confirmación, cancelación, recordatorio 6h)
export async function notifyClientPush(
  userId: string,
  tenantId: string | null,
  payload: ExpoPushPayload
): Promise<void> {
  if (!userId) return;

  const devRes = await db.execute(sql`
    SELECT expo_push_token
    FROM public.device_push_tokens
    WHERE is_active = TRUE AND user_id = ${userId}::uuid
  `);
  const rows = Array.isArray(devRes) ? devRes : (devRes as any).rows || [];

  await saveNotificationToInbox({
    tenantId,
    userId,
    pushToken: rows[0]?.expo_push_token ? String(rows[0].expo_push_token) : null,
    role: 'client',
    eventType: String(payload.data?.eventType || 'appointment'),
    payload,
  });

  await sendExpoPushInBatches(
    rows.map((r: any) => String(r.expo_push_token)),
    payload
  );
}

// 📍 Notificar a Clientes cercanos por ZIP o radio <= 8 millas (nuevos negocios / promos)
export async function notifyNearbyClientsPush(params: {
  zipCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  payload: ExpoPushPayload;
}): Promise<void> {
  const zipClean = params.zipCode ? String(params.zipCode).trim() : null;
  const latNum = params.latitude !== null && params.latitude !== undefined ? Number(params.latitude) : null;
  const lonNum = params.longitude !== null && params.longitude !== undefined ? Number(params.longitude) : null;

  const res = await db.execute(sql`
    SELECT expo_push_token, user_id
    FROM public.device_push_tokens
    WHERE is_active = TRUE
      AND role = 'client'
      AND (
        (${zipClean}::text IS NOT NULL AND zip_code = ${zipClean})
        OR (
          ${latNum}::double precision IS NOT NULL AND ${lonNum}::double precision IS NOT NULL
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND (3958.8 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(${latNum})) * cos(radians(latitude)) *
              cos(radians(longitude) - radians(${lonNum})) +
              sin(radians(${latNum})) * sin(radians(latitude))
            ))
          )) <= 8.0
        )
      )
  `);
  const rows = Array.isArray(res) ? res : (res as any).rows || [];

  // Guardar en bandeja una vez por cada user_id único alcanzado
  const seenUsers = new Set<string>();
  const tenantIdFromData = params.payload.data?.tenantId ? String(params.payload.data.tenantId) : null;
  const eventType = String(params.payload.data?.eventType || 'nearby_zip');

  for (const r of rows) {
    const uid = r.user_id ? String(r.user_id) : null;
    if (uid && !seenUsers.has(uid)) {
      seenUsers.add(uid);
      await saveNotificationToInbox({
        tenantId: tenantIdFromData,
        userId: uid,
        pushToken: String(r.expo_push_token),
        role: 'client',
        eventType,
        payload: params.payload,
      });
    }
  }

  await sendExpoPushInBatches(
    rows.map((r: any) => String(r.expo_push_token)),
    params.payload
  );
}