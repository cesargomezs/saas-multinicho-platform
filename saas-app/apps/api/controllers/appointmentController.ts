import { Request, Response } from 'express';
import crypto from 'crypto';

// 🔐 Hash seguro de contraseña para usuarios que eligen acceso tradicional (Correo + Password)
const hashClientPassword = (plainPassword: string): string => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plainPassword), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
};

const verifyClientPassword = (plainPassword: string, storedHash?: string | null): boolean => {
  if (!plainPassword || !storedHash) return false;
  if (storedHash.startsWith('scrypt:') || storedHash.startsWith('scrypt$')) {
    const sep = storedHash.startsWith('scrypt$') ? '$' : ':';
    const parts = storedHash.split(sep);
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const keyHex = parts[2];
    const derived = crypto.scryptSync(String(plainPassword), salt, 64);
    const keyBuf = Buffer.from(keyHex, 'hex');
    if (derived.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(derived, keyBuf);
  }
  return String(plainPassword) === String(storedHash);
};

import { db, users, appointments, services, vehicles, workOrders, tenants } from '@taller/database';
import { eq, and, gte, lt, ne, inArray, ilike, sql } from 'drizzle-orm'; 

// =========================================================================
// 📲 SERVICIO CENTRAL DE NOTIFICACIONES PUSH (EXPO PUSH API + DRIZZLE ORM)
// =========================================================================
export interface ExpoPushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

export async function sendExpoPushInBatches(
  tokens: string[],
  payload: ExpoPushPayload,
  meta?: { tenantId?: string | null; eventType?: string }
): Promise<void> {
  const uniqueTokens = [
    ...new Set(tokens.filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken['))),
  ];
  if (uniqueTokens.length === 0) return;

  const eventType = meta?.eventType || String(payload.data?.eventType || 'notification');
  const tenantUuid = meta?.tenantId || (payload.data?.tenantId ? String(payload.data.tenantId) : null);
  const dataJsonStr = JSON.stringify(payload.data || {});

  const CHUNK_SIZE = 100;
  const deadTokens: string[] = [];

  for (let i = 0; i < uniqueTokens.length; i += CHUNK_SIZE) {
    const chunk = uniqueTokens.slice(i, i + CHUNK_SIZE);
    const messages = chunk.map((to) => ({
      to,
      sound: 'default',
      title: payload.title,
      body: payload.body,
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
      console.log('📲 [EXPO PUSH] Enviados:', chunk.length, '| Respuesta Expo:', JSON.stringify(json));

      const tickets: any[] = Array.isArray(json?.data) ? json.data : [];
      for (let idx = 0; idx < chunk.length; idx++) {
        const tok = chunk[idx];
        const ticket = tickets[idx];
        const isErr = !res.ok || ticket?.status === 'error';
        const errCode = ticket?.details?.error || '';
        if (errCode === 'DeviceNotRegistered') {
          deadTokens.push(tok);
        }
        const statusVal = isErr ? 'failed' : 'sent';
        const errMsg = isErr ? (ticket?.message || errCode || `HTTP ${res.status}`) : null;

        await db.execute(sql`
          INSERT INTO public.push_notifications (
            tenant_id, user_id, device_id, push_token, event_type, title, body, data, status, error_message, sent_at, created_at
          )
          SELECT
            ${tenantUuid ? sql`${tenantUuid}::uuid` : sql`ud.tenant_id`},
            ud.user_id,
            ud.id,
            ${tok},
            ${eventType},
            ${payload.title},
            ${payload.body},
            ${dataJsonStr}::jsonb,
            ${statusVal},
            ${errMsg},
            ${isErr ? sql`NULL` : sql`NOW()`},
            NOW()
          FROM public.user_devices ud
          WHERE ud.push_token = ${tok}
          LIMIT 1
        `).catch(() => {});
      }
    } catch (err: any) {
      console.error('⚠️ Error enviando lote Expo Push:', err);
      for (const tok of chunk) {
        await db.execute(sql`
          INSERT INTO public.push_notifications (
            tenant_id, user_id, device_id, push_token, event_type, title, body, data, status, error_message, created_at
          )
          SELECT
            ${tenantUuid ? sql`${tenantUuid}::uuid` : sql`ud.tenant_id`},
            ud.user_id,
            ud.id,
            ${tok},
            ${eventType},
            ${payload.title},
            ${payload.body},
            ${dataJsonStr}::jsonb,
            'failed',
            ${String(err?.message || err)},
            NOW()
          FROM public.user_devices ud
          WHERE ud.push_token = ${tok}
          LIMIT 1
        `).catch(() => {});
      }
    }
  }

  for (const dead of deadTokens) {
    await db.execute(sql`
      UPDATE public.user_devices
      SET is_active = FALSE, last_used_at = NOW()
      WHERE push_token = ${dead}
    `).catch(() => {});
  }
}

export async function notifyTenantPush(
  tenantId: string,
  payload: ExpoPushPayload,
  targetStaffOrUserId?: string | null
): Promise<void> {
  if (!tenantId) return;
  try {
    const tokenSet = new Set<string>();
    const isValidUuid =
      typeof targetStaffOrUserId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetStaffOrUserId.trim());

    if (isValidUuid) {
      const cleanId = targetStaffOrUserId!.trim();

      // 1) Buscar trabajador/barbero en public.staff por id o por user_id si existe
      const staffLookup = await db.execute(sql`
        SELECT *
        FROM public.staff
        WHERE (id = ${cleanId}::uuid OR user_id = ${cleanId}::uuid)
          AND tenant_id = ${tenantId}::uuid
        LIMIT 1
      `).catch(() => ({ rows: [] }));
      const staffRows = Array.isArray(staffLookup) ? staffLookup : (staffLookup as any).rows || [];
      const staffRec = staffRows[0] || null;
      const staffName = staffRec?.name ? String(staffRec.name).trim() : '';
      const staffPhoneDigits = staffRec?.phone
        ? String(staffRec.phone).replace(/\D/g, '').slice(-10)
        : '';
      const linkedStaffUserId = staffRec?.user_id ? String(staffRec.user_id).trim() : '';

      if (linkedStaffUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(linkedStaffUserId)) {
        const byLinkedUserRes = await db.execute(sql`
          SELECT COALESCE(d.expo_push_token, d.push_token) AS push_token
          FROM public.user_devices d
          WHERE d.is_active = TRUE
            AND d.user_id = ${linkedStaffUserId}::uuid
            AND COALESCE(d.expo_push_token, d.push_token) LIKE 'ExponentPushToken[%';
        `);
        const linkedRows = Array.isArray(byLinkedUserRes) ? byLinkedUserRes : (byLinkedUserRes as any).rows || [];
        linkedRows.forEach((r: any) => {
          if (r?.push_token) tokenSet.add(String(r.push_token));
        });
      }

      // Cruce por teléfono (últimos 10 dígitos) en public.users
      if (tokenSet.size === 0 && staffPhoneDigits.length >= 7) {
        const byPhoneRes = await db.execute(sql`
          SELECT COALESCE(d.expo_push_token, d.push_token) AS push_token
          FROM public.user_devices d
          INNER JOIN public.users u ON u.id = d.user_id
          WHERE d.is_active = TRUE
            AND (d.tenant_id = ${tenantId}::uuid OR u.tenant_id = ${tenantId}::uuid)
            AND RIGHT(regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g'), 10) = ${staffPhoneDigits}
            AND COALESCE(d.expo_push_token, d.push_token) LIKE 'ExponentPushToken[%';
        `);
        const phoneRows = Array.isArray(byPhoneRes) ? byPhoneRes : (byPhoneRes as any).rows || [];
        phoneRows.forEach((r: any) => {
          if (r?.push_token) tokenSet.add(String(r.push_token));
        });
      }

      // Cruce secundario por nombre normalizado en public.users
      if (tokenSet.size === 0 && staffName) {
        const matchedUsersRes = await db.execute(sql`
          SELECT COALESCE(d.expo_push_token, d.push_token) AS push_token
          FROM public.user_devices d
          INNER JOIN public.users u ON u.id = d.user_id
          WHERE d.is_active = TRUE
            AND (d.tenant_id = ${tenantId}::uuid OR u.tenant_id = ${tenantId}::uuid)
            AND LOWER(REGEXP_REPLACE(TRIM(u.name), '\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM(${staffName}), '\s+', ' ', 'g'))
            AND COALESCE(d.expo_push_token, d.push_token) LIKE 'ExponentPushToken[%';
        `);
        const matchedRows = Array.isArray(matchedUsersRes) ? matchedUsersRes : (matchedUsersRes as any).rows || [];
        matchedRows.forEach((r: any) => {
          if (r?.push_token) tokenSet.add(String(r.push_token));
        });
      }

      // Revisión directa por user_id si coincide con un usuario staff/owner
      if (tokenSet.size === 0) {
        const directUserRes = await db.execute(sql`
          SELECT COALESCE(d.expo_push_token, d.push_token) AS push_token
          FROM public.user_devices d
          LEFT JOIN public.users u ON u.id = d.user_id
          WHERE d.is_active = TRUE
            AND d.user_id = ${cleanId}::uuid
            AND COALESCE(u.role, 'staff') <> 'client'
            AND COALESCE(d.expo_push_token, d.push_token) LIKE 'ExponentPushToken[%';
        `);
        const directRows = Array.isArray(directUserRes) ? directUserRes : (directUserRes as any).rows || [];
        directRows.forEach((r: any) => {
          if (r?.push_token) tokenSet.add(String(r.push_token));
        });
      }
    }

    // Fallback a dispositivos activos del staff/dueño del negocio si el trabajador asignado aún no tiene token propio
    if (tokenSet.size === 0) {
      const devRes = await db.execute(sql`
        SELECT COALESCE(d.expo_push_token, d.push_token) AS push_token
        FROM public.user_devices d
        LEFT JOIN public.users u ON u.id = d.user_id
        WHERE d.is_active = TRUE
          AND (d.tenant_id = ${tenantId}::uuid OR u.tenant_id = ${tenantId}::uuid)
          AND COALESCE(u.role, 'staff') <> 'client'
          AND COALESCE(d.expo_push_token, d.push_token) LIKE 'ExponentPushToken[%';
      `);
      const devRows = Array.isArray(devRes) ? devRes : (devRes as any).rows || [];
      devRows.forEach((r: any) => {
        if (r?.push_token) tokenSet.add(String(r.push_token));
      });
    }

    await sendExpoPushInBatches([...tokenSet], payload, { tenantId, eventType: String(payload.data?.eventType || 'appointment') });
  } catch (err) {
    console.warn('⚠️ Error notifyTenantPush:', err);
  }
}

export async function notifyClientPush(
  tenantId: string,
  clientUserId: string,
  payload: ExpoPushPayload,
  eventType = 'appointment_reminder'
): Promise<void> {
  if (!tenantId || !clientUserId) return;
  try {
    const res = await db.execute(sql`
      SELECT COALESCE(d.expo_push_token, d.push_token) AS push_token
      FROM public.user_devices d
      WHERE d.is_active = TRUE
        AND d.user_id = ${clientUserId}::uuid
        AND COALESCE(d.expo_push_token, d.push_token) LIKE 'ExponentPushToken[%';
    `);
    const rows = Array.isArray(res) ? res : (res as any).rows || [];
    const tokens = rows.map((r: any) => String(r.push_token || '').trim()).filter(Boolean);
    await sendExpoPushInBatches(tokens, payload, { tenantId, eventType });
  } catch (err) {
    console.warn('⚠️ Error notifyClientPush:', err);
  }
}

export async function notifyNearbyClientsPush(params: {
  zipCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  payload: ExpoPushPayload;
}): Promise<void> {
  try {
    const zipClean = params.zipCode ? String(params.zipCode).trim() : null;
    const latNum = params.latitude !== null && params.latitude !== undefined ? Number(params.latitude) : null;
    const lonNum = params.longitude !== null && params.longitude !== undefined ? Number(params.longitude) : null;

    const res = await db.execute(sql`
      SELECT COALESCE(d.expo_push_token, d.push_token) AS push_token
      FROM public.user_devices d
      INNER JOIN public.users u ON u.id = d.user_id
      WHERE d.is_active = TRUE
        AND COALESCE(u.role, 'client') = 'client'
        AND COALESCE(d.expo_push_token, d.push_token) LIKE 'ExponentPushToken[%'
        AND (
          (${zipClean}::text IS NOT NULL AND COALESCE(d.zip_code, u.zip_code) = ${zipClean})
          OR (
            ${latNum}::double precision IS NOT NULL AND ${lonNum}::double precision IS NOT NULL
            AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
            AND (3958.8 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians(${latNum})) * cos(radians(d.latitude)) *
                cos(radians(d.longitude) - radians(${lonNum})) +
                sin(radians(${latNum})) * sin(radians(d.latitude))
              ))
            )) <= 8.0
          )
        )
    `);
    const rows = Array.isArray(res) ? res : (res as any).rows || [];
    await sendExpoPushInBatches(
      rows.map((r: any) => String(r.push_token)),
      params.payload,
      { eventType: String(params.payload.data?.eventType || 'new_service') }
    );
  } catch (err) {
    console.warn('⚠️ Error notifyNearbyClientsPush:', err);
  }
}

// POST /api/push-tokens/register
export async function registerDevicePushToken(req: Request, res: Response) {
  try {
    const headerTenant = (req.headers['x-tenant-id'] as string) || null;
    const {
      expoPushToken,
      userId,
      tenantId,
      role,
      zipCode,
      latitude,
      longitude,
    } = req.body || {};

    if (!expoPushToken || typeof expoPushToken !== 'string' || !expoPushToken.startsWith('ExponentPushToken[')) {
      return res.status(400).json({ success: false, message: 'Token de Expo inválido.' });
    }

    const resolvedTenantId = tenantId || headerTenant || null;
    const resolvedRole = role || (resolvedTenantId ? 'tenant_owner' : 'client');
    const cleanZip = zipCode ? String(zipCode).trim().slice(0, 15) : null;
    const latVal = latitude !== undefined && latitude !== null && !Number.isNaN(Number(latitude)) ? Number(latitude) : null;
    const lonVal = longitude !== undefined && longitude !== null && !Number.isNaN(Number(longitude)) ? Number(longitude) : null;

    let targetUserId = userId || null;
    if (!targetUserId && resolvedTenantId) {
      const existingUsers = await db.select().from(users).where(eq(users.tenantId, resolvedTenantId));
      const fallbackStaffOrClient =
        existingUsers.find((u: any) => u.role === 'owner' || u.role === 'admin' || u.role === 'staff') ||
        existingUsers[0] ||
        null;
      if (fallbackStaffOrClient) {
        targetUserId = fallbackStaffOrClient.id;
      }
    }

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere userId o un usuario registrado en el negocio para vincular el dispositivo en user_devices.'
      });
    }

    const cleanToken = expoPushToken.trim();
    const devType = String(req.body?.deviceType || req.body?.os || 'mobile').slice(0, 50);

    await db.execute(sql`
      ALTER TABLE public.user_devices
        ADD COLUMN IF NOT EXISTS expo_push_token TEXT,
        ADD COLUMN IF NOT EXISTS device_type VARCHAR(50)
    `).catch(() => {});

    await db.execute(sql`
      INSERT INTO public.user_devices (
        user_id, tenant_id, push_token, expo_push_token, device_model, device_type, os, zip_code, latitude, longitude, is_active, last_used_at, created_at
      )
      VALUES (
        ${targetUserId}::uuid,
        ${resolvedTenantId ? sql`${resolvedTenantId}::uuid` : sql`NULL`},
        ${cleanToken},
        ${cleanToken},
        ${`Expo Device (${resolvedRole})`},
        ${devType},
        ${devType},
        ${cleanZip},
        ${latVal},
        ${lonVal},
        TRUE,
        NOW(),
        NOW()
      )
      ON CONFLICT (push_token)
      DO UPDATE SET
        user_id = COALESCE(EXCLUDED.user_id, public.user_devices.user_id),
        tenant_id = COALESCE(EXCLUDED.tenant_id, public.user_devices.tenant_id),
        expo_push_token = COALESCE(EXCLUDED.expo_push_token, public.user_devices.expo_push_token),
        device_type = COALESCE(EXCLUDED.device_type, public.user_devices.device_type),
        zip_code = COALESCE(EXCLUDED.zip_code, public.user_devices.zip_code),
        latitude = COALESCE(EXCLUDED.latitude, public.user_devices.latitude),
        longitude = COALESCE(EXCLUDED.longitude, public.user_devices.longitude),
        is_active = TRUE,
        last_used_at = NOW()
    `);

    return res.status(200).json({ success: true, message: 'Token push registrado correctamente.' });
  } catch (error: any) {
    console.error('❌ Error registrando expoPushToken:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


// 📱 MOTOR MULTI-BOT Y MULTI-TENANT DE TELEGRAM (ENVÍA AL BOT DEL CONSULTORIO + BOT CENTRAL .ENV)
export type TelegramEventType = 'appointment' | 'recording' | 'status' | 'pos' | 'campaign' | 'system';

export const sendTelegramNotification = async (
  message: string,
  tenantId?: string | null,
  eventType: TelegramEventType = 'appointment'
): Promise<{ sent: boolean; chatIdUsed?: string; error?: string }> => {
  const envToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const envChatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

  let customToken = '';
  let customChatId = '';
  let businessHeader = '';
  let isChannelEnabled = true;

  if (tenantId) {
    try {
      // Consultamos únicamente columnas base garantizadas (name y loyaltyConfig) para que jamás falle el SELECT
      const [tenantRow] = await db
        .select({ name: tenants.name, loyaltyConfig: tenants.loyaltyConfig })
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      if (tenantRow) {
        const loyaltyObj =
          typeof tenantRow.loyaltyConfig === 'string'
            ? JSON.parse(tenantRow.loyaltyConfig || '{}')
            : (tenantRow.loyaltyConfig || {});
        const tgConf = loyaltyObj?.telegramConfig || {};

        if (tgConf.isActive === false) {
          isChannelEnabled = false;
        }

        // Filtros granulares por tipo de evento configurados por el consultorio/negocio
        if (eventType === 'appointment' && tgConf.notifyNewAppointments === false) isChannelEnabled = false;
        if (eventType === 'recording' && tgConf.notifyRecordings === false) isChannelEnabled = false;
        if (eventType === 'status' && tgConf.notifyConfirmationsAndCancels === false) isChannelEnabled = false;
        if (eventType === 'pos' && tgConf.notifyPOSClosures === false) isChannelEnabled = false;

        customChatId = String(tgConf.chatId || '').trim();
        customToken = String(tgConf.botToken || '').trim();

        const channelLabel = tgConf.channelName || tenantRow.name || '';
        if (channelLabel && !message.includes(tenantRow.name)) {
          businessHeader = `🏥 <b>[${channelLabel}]</b>\n`;
        }
      }
    } catch (dbErr) {
      console.warn('⚠️ Aviso leyendo config de Telegram del tenant:', dbErr);
    }
  }

  if (!isChannelEnabled) {
    return { sent: false, error: 'Notificaciones desactivadas para este evento.' };
  }

  // Helper interno que envía a un Bot y, si falta el chatId o falla, lo autodescubre vía getUpdates
  const dispatchToBot = async (botToken: string, targetChatId: string): Promise<{ ok: boolean; chatId?: string; err?: string }> => {
    if (!botToken) return { ok: false, err: 'Sin Bot Token' };
    let finalChatId = targetChatId;

    const trySend = async (cid: string) => {
      return fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cid,
          text: `${businessHeader}${message.trim()}`,
          parse_mode: 'HTML'
        })
      });
    };

    try {
      if (finalChatId) {
        const firstTry = await trySend(finalChatId);
        if (firstTry.ok) return { ok: true, chatId: finalChatId };
      }

      // Si el bot nuevo no tenía Chat ID o dio error, autodescubrimos su último chat activo en vivo
      const updRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=20`);
      if (updRes.ok) {
        const updData = await updRes.json();
        const list: any[] = Array.isArray(updData?.result) ? updData.result : [];
        for (let i = list.length - 1; i >= 0; i--) {
          const u = list[i];
          const detectedId =
            u?.message?.chat?.id ||
            u?.channel_post?.chat?.id ||
            u?.my_chat_member?.chat?.id ||
            u?.callback_query?.message?.chat?.id;
          if (detectedId) {
            finalChatId = String(detectedId);
            const retry = await trySend(finalChatId);
            if (retry.ok) return { ok: true, chatId: finalChatId };
            break;
          }
        }
      }
      return { ok: false, chatId: finalChatId, err: 'El Bot no encontró un chat activo. Envía "hola" o "/start" al Bot en Telegram.' };
    } catch (e: any) {
      return { ok: false, chatId: finalChatId, err: e?.message || String(e) };
    }
  };

  const targetsToSend: { token: string; chatId: string }[] = [];

  // 1. Bot/Canal específico configurado en el Consultorio/Negocio
  if (customToken || customChatId) {
    targetsToSend.push({
      token: customToken || envToken,
      chatId: customChatId || envChatId
    });
  }

  // 2. Bot Central del .env (siempre recibe copia de respaldo si es distinto al personalizado)
  if (envToken && (envToken !== customToken || envChatId !== customChatId)) {
    targetsToSend.push({
      token: envToken,
      chatId: envChatId
    });
  }

  let anySent = false;
  let lastChatId = '';
  let lastErr = '';

  for (const target of targetsToSend) {
    const res = await dispatchToBot(target.token, target.chatId);
    if (res.ok) {
      anySent = true;
      lastChatId = res.chatId || target.chatId;
    } else if (res.err) {
      lastErr = res.err;
    }
  }

  return { sent: anySent, chatIdUsed: lastChatId, error: anySent ? undefined : lastErr };
};

// 🛠️ Helper seguro para parsear JSON que pudo haber quedado doblemente stringificado en BD
const safeParseJSON = (data: any): any => {
  if (!data) return {};
  if (typeof data === 'object') return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    } catch (e) {
      return {};
    }
  }
  return {};
};

// 🛠️ Helper para extraer los últimos 10 dígitos limpios de cualquier teléfono
const extractCleanPhone = (phoneStr: string): string => {
  if (!phoneStr) return '';
  const digits = String(phoneStr).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

// 🛠️ Helper para evitar el error "violates foreign key constraint appointments_staff_id_users_id_fk"
const resolveSafeUserStaffId = async (candidateStaffId?: string | null): Promise<string | null> => {
  if (!candidateStaffId || typeof candidateStaffId !== 'string' || candidateStaffId.trim() === '') {
    return null;
  }
  try {
    const [existingUser] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.id, candidateStaffId));
    return existingUser ? existingUser.id : null;
  } catch (e) {
    return null;
  }
};

// 🕒 HELPER UNIVERSAL MULTI-PAÍS (WALL-CLOCK TIME):
// Garantiza que si el cliente agenda "14:00" (2:00 PM), en la BD y en Telegram SIEMPRE sea "2:00 PM"
// sin importar en qué país o zona horaria esté el cliente o el servidor (EE.UU., Colombia, México, España, etc.).
const parseWallClockAppointmentDate = (rawDateStr: string, explicitDate?: string, explicitTime?: string): Date => {
  if (explicitDate && explicitTime && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate) && /^\d{2}:\d{2}/.test(explicitTime)) {
    return new Date(`${explicitDate}T${explicitTime.substring(0, 5)}:00.000Z`);
  }
  const cleanStr = String(rawDateStr || '').trim();
  const match = cleanStr.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (match) {
    return new Date(`${match[1]}T${match[2]}:00.000Z`);
  }
  return new Date(cleanStr);
};

// Formatea la fecha y hora exacta agendada ("14:00" -> "11/12/2026, 2:00 PM") sin restar ni sumar horas por zona horaria
const formatWallClockForNotification = (scheduledAtDate?: Date | string | null, metaObj?: any, fallbackDate?: string, fallbackTime?: string): string => {
  let iso = '';
  if (metaObj?.localDate && metaObj?.localTime) {
    iso = `${metaObj.localDate}T${metaObj.localTime}:00.000Z`;
  } else if (fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate) && fallbackTime && /^\d{2}:\d{2}/.test(fallbackTime)) {
    iso = `${fallbackDate}T${fallbackTime.substring(0, 5)}:00.000Z`;
  } else if (scheduledAtDate instanceof Date && !isNaN(scheduledAtDate.getTime())) {
    iso = scheduledAtDate.toISOString();
  } else if (typeof scheduledAtDate === 'string' && scheduledAtDate.includes('T')) {
    iso = scheduledAtDate;
  }

  if (iso && iso.includes('T')) {
    const [datePart, timePartRaw] = iso.split('T');
    const [yyyy, mm, dd] = datePart.split('-');
    const [hhStr, minStr] = timePartRaw.substring(0, 5).split(':');
    const hh = parseInt(hhStr, 10);
    if (!isNaN(hh) && yyyy && mm && dd) {
      const ampm = hh >= 12 ? 'PM' : 'AM';
      const hh12 = hh % 12 === 0 ? 12 : hh % 12;
      return `${mm}/${dd}/${yyyy}, ${hh12}:${minStr} ${ampm}`;
    }
  }
  return fallbackDate || fallbackTime || 'Horario programado';
};


// 📅 Helper para incluir link de "Agregar a Google Calendar" en 1 clic dentro de los mensajes de Telegram
const buildTelegramGoogleCalendarLink = (scheduledAtDate: Date, titleStr: string, detailsStr: string, durationMin = 30): string => {
  try {
    const endDt = new Date(scheduledAtDate.getTime() + durationMin * 60000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0];
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(titleStr)}&dates=${fmt(scheduledAtDate)}/${fmt(endDt)}&details=${encodeURIComponent(detailsStr)}`;
  } catch (e) {
    return 'https://calendar.google.com';
  }
};

// 🔍 BUSCAR VEHÍCULO POR PLACA (EXPEDIENTE)
export async function getVehicleByPlate(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const plate = req.params.plate;

    if (!tenantId || !plate) {
      return res.status(400).json({ error: 'Falta el tenantId o la placa.' });
    }

    const [result] = await db.select({
      vehicle: vehicles,
      client: users
    })
    .from(vehicles)
    .innerJoin(users, eq(vehicles.clientId, users.id))
    .where(
      and(
        eq(vehicles.tenantId, tenantId),
        eq(vehicles.plate, plate.toUpperCase())
      )
    );

    if (!result) {
      return res.status(200).json({ success: false, message: 'Vehículo no encontrado' });
    }

    return res.status(200).json({
      success: true,
      vehicle: result.vehicle,
      client: {
        ...result.client,
        metadata: safeParseJSON(result.client.metadata)
      }
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

const DEFAULT_TERMS_HTML = `<div class="terms-container"><h2>Términos, Condiciones y Privacidad — PickTime Book</h2><p><strong>1. Creación Automática de Expediente Digital:</strong> Al agendar tu cita con iOS, Google o con tu Nombre y Teléfono, PickTime Book crea o actualiza tu expediente digital sin requerir contraseñas.</p><p><strong>2. Puntualidad, Recordatorios (6h) y Cancelación (3h):</strong> Recibirás un recordatorio 6 horas antes de tu turno y solicitamos cancelar con al menos 3 horas de anticipación.</p><p><strong>3. Privacidad y Seguridad de Datos:</strong> Tus datos de contacto se utilizan exclusivamente para coordinar tus servicios.</p></div>`;

// =========================================================================
// ⚖️📱 REGISTRO EN LEGAL_DOCUMENTS + USER_LEGAL_ACCEPTANCES + USER_DEVICES
// =========================================================================
async function recordLegalAcceptanceAndDevice(params: {
  req: Request;
  userId: string;
  tenantId: string;
  acceptedTerms?: boolean;
  deviceInfo?: {
    pushToken?: string;
    expoPushToken?: string;
    deviceModel?: string;
    os?: string;
    authProvider?: string;
  };
}) {
  const { req, userId, tenantId, acceptedTerms = true, deviceInfo } = params;

  // 1. Registrar aceptación legal en user_legal_acceptances tomando el documento activo de legal_documents
  if (acceptedTerms !== false) {
    try {
      let activeDocId: string | null = null;

      const docRowsRes = await db.execute(sql`
        SELECT id
        FROM public.legal_documents
        WHERE (document_type ILIKE 'terms%' OR document_type ILIKE 'term&conditions%')
          AND is_active = true
        ORDER BY CASE WHEN tenant_id IS NULL THEN 0 ELSE 1 END, published_at DESC
        LIMIT 1
      `);
      const docRows = Array.isArray(docRowsRes) ? docRowsRes : (docRowsRes as any).rows || [];
      if (docRows.length > 0 && docRows[0]?.id) {
        activeDocId = String(docRows[0].id);
      } else {
        // Si no existe ningún registro en legal_documents, creamos el documento activo inicial con content_html
        const insertedDocRes = await db.execute(sql`
          INSERT INTO public.legal_documents (tenant_id, document_type, version, content_html, content_url, is_active, published_at)
          VALUES (${tenantId}::uuid, 'terms_and_conditions', '2026.1', ${DEFAULT_TERMS_HTML}, 'https://autoflow.app/legal/terms', true, NOW())
          RETURNING id
        `);
        const insertedDocRows = Array.isArray(insertedDocRes) ? insertedDocRes : (insertedDocRes as any).rows || [];
        if (insertedDocRows.length > 0 && insertedDocRows[0]?.id) {
          activeDocId = String(insertedDocRows[0].id);
        }
      }

      if (activeDocId) {
        const forwardedFor = String(req.headers['x-forwarded-for'] || '');
        const ipAddress = (forwardedFor.split(',')[0] || req.socket?.remoteAddress || '').trim().slice(0, 45) || null;
        const userAgent = String(req.headers['user-agent'] || '').trim() || null;

        await db.execute(sql`
          INSERT INTO public.user_legal_acceptances (user_id, document_id, accepted_at, ip_address, user_agent)
          VALUES (${userId}::uuid, ${activeDocId}::uuid, NOW(), ${ipAddress}, ${userAgent})
        `);
      }
    } catch (legalErr) {
      console.warn('⚠️ Aviso registrando aceptación legal (user_legal_acceptances):', legalErr);
    }
  }

  // 2. Registrar / actualizar dispositivo en user_devices
  try {
    const rawToken = String(
      deviceInfo?.pushToken ||
      deviceInfo?.expoPushToken ||
      req.body?.pushToken ||
      req.body?.expoPushToken ||
      ''
    ).trim();
    const hasValidExpoToken = rawToken.startsWith('ExponentPushToken[');
    const finalPushToken = hasValidExpoToken ? rawToken.slice(0, 255) : null;

    const effectiveProvider = String(
      deviceInfo?.authProvider ||
      req.body?.authProvider ||
      safeParseJSON(req.body?.metadata)?.authProvider ||
      ''
    ).trim();
    const providerSuffix = effectiveProvider ? ` (${effectiveProvider})` : '';
    const deviceModel = String(
      deviceInfo?.deviceModel ||
      req.body?.deviceModel ||
      `Client Device${providerSuffix}`
    ).slice(0, 100);

    const osName = String(
      deviceInfo?.os ||
      req.body?.os ||
      (String(req.headers['user-agent'] || '').toLowerCase().includes('iphone') || String(req.headers['user-agent'] || '').toLowerCase().includes('ios')
        ? 'ios'
        : String(req.headers['user-agent'] || '').toLowerCase().includes('android')
          ? 'android'
          : 'web')
    ).slice(0, 50);

    await db.execute(sql`
      ALTER TABLE public.user_devices
        ADD COLUMN IF NOT EXISTS tenant_id UUID,
        ADD COLUMN IF NOT EXISTS expo_push_token TEXT,
        ADD COLUMN IF NOT EXISTS device_type VARCHAR(50),
        ADD COLUMN IF NOT EXISTS zip_code VARCHAR(15),
        ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION
    `).catch(() => {});

    const cleanZip = req.body?.zipCode ? String(req.body.zipCode).trim().slice(0, 15) : null;
    const latVal = req.body?.latitude !== undefined && req.body?.latitude !== null && !Number.isNaN(Number(req.body.latitude)) ? Number(req.body.latitude) : null;
    const lonVal = req.body?.longitude !== undefined && req.body?.longitude !== null && !Number.isNaN(Number(req.body.longitude)) ? Number(req.body.longitude) : null;

    if (finalPushToken) {
      await db.execute(sql`
        INSERT INTO public.user_devices (
          user_id, tenant_id, push_token, expo_push_token, device_model, device_type, os, zip_code, latitude, longitude, is_active, last_used_at, created_at
        )
        VALUES (
          ${userId}::uuid,
          ${tenantId}::uuid,
          ${finalPushToken},
          ${finalPushToken},
          ${deviceModel},
          ${osName},
          ${osName},
          ${cleanZip},
          ${latVal},
          ${lonVal},
          true,
          NOW(),
          NOW()
        )
        ON CONFLICT (push_token)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          tenant_id = COALESCE(EXCLUDED.tenant_id, public.user_devices.tenant_id),
          expo_push_token = EXCLUDED.expo_push_token,
          device_model = EXCLUDED.device_model,
          device_type = EXCLUDED.device_type,
          os = EXCLUDED.os,
          zip_code = COALESCE(EXCLUDED.zip_code, public.user_devices.zip_code),
          latitude = COALESCE(EXCLUDED.latitude, public.user_devices.latitude),
          longitude = COALESCE(EXCLUDED.longitude, public.user_devices.longitude),
          is_active = true,
          last_used_at = NOW()
      `);
    } else {
      // Registro 1:N de cada dispositivo/sesión distinta (ej. otro navegador, otro equipo o login con Google)
      const incomingUserAgent = String(req.headers['user-agent'] || '').trim().slice(0, 120);
      const sessionFingerprint = incomingUserAgent
        ? `${deviceModel} | ${incomingUserAgent.slice(0, 50)}`
        : deviceModel;

      const existingSameSession = await db.execute(sql`
        SELECT id
        FROM public.user_devices
        WHERE user_id = ${userId}::uuid
          AND device_model = ${sessionFingerprint.slice(0, 100)}
          AND COALESCE(os, '') = ${osName}
        ORDER BY last_used_at DESC NULLS LAST
        LIMIT 1
      `);
      const existingRows = Array.isArray(existingSameSession) ? existingSameSession : (existingSameSession as any).rows || [];

      if (existingRows.length > 0 && existingRows[0]?.id) {
        await db.execute(sql`
          UPDATE public.user_devices
          SET tenant_id = COALESCE(${tenantId}::uuid, tenant_id),
              device_type = ${osName},
              os = ${osName},
              zip_code = COALESCE(${cleanZip}, zip_code),
              latitude = COALESCE(${latVal}, latitude),
              longitude = COALESCE(${lonVal}, longitude),
              last_used_at = NOW()
          WHERE id = ${String(existingRows[0].id)}::uuid
        `);
      } else {
        await db.execute(sql`
          INSERT INTO public.user_devices (
            user_id, tenant_id, push_token, expo_push_token, device_model, device_type, os, zip_code, latitude, longitude, is_active, last_used_at, created_at
          )
          VALUES (
            ${userId}::uuid,
            ${tenantId}::uuid,
            NULL,
            NULL,
            ${sessionFingerprint.slice(0, 100)},
            ${osName},
            ${osName},
            ${cleanZip},
            ${latVal},
            ${lonVal},
            false,
            NOW(),
            NOW()
          )
        `);
      }
    }
  } catch (devErr) {
    console.warn('⚠️ Aviso registrando dispositivo (user_devices):', devErr);
  }
}

// =========================================================================
// 🔔 PLANIFICADOR DE RECORDATORIOS AL AGENDAR (6H / 2H / 1H -> push_notifications)
// =========================================================================
export interface ScheduledReminderRule {
  ruleKey: 'reminder_6h' | 'reminder_2h' | 'reminder_1h';
  hoursBefore: number;
  label: string;
  scheduledForIso: string;
  status: 'scheduled';
}

export function buildAppointmentReminderRules(params: {
  parsedDate: Date;
  localDate?: string | null;
  localTime?: string | null;
  nowMs?: number;
}): {
  appointmentIso: string;
  hoursUntilAppointment: number;
  rules: ScheduledReminderRule[];
} {
  const nowMs = params.nowMs ?? Date.now();
  let apptMs = params.parsedDate.getTime();

  if (params.localDate && /^\d{4}-\d{2}-\d{2}$/.test(params.localDate)) {
    const [y, m, d] = params.localDate.split('-').map(Number);
    const tParts = (params.localTime || '12:00').split(':').map(Number);
    const hh = Number.isFinite(tParts[0]) ? tParts[0] : 12;
    const mm = Number.isFinite(tParts[1]) ? tParts[1] : 0;
    apptMs = new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  }

  const hoursUntilAppointment = Number(((apptMs - nowMs) / (1000 * 60 * 60)).toFixed(2));
  const candidates: { ruleKey: 'reminder_6h' | 'reminder_2h' | 'reminder_1h'; hoursBefore: number; label: string }[] = [
    { ruleKey: 'reminder_6h', hoursBefore: 6, label: 'Recordatorio 6 horas antes' },
    { ruleKey: 'reminder_2h', hoursBefore: 2, label: 'Recordatorio 2 horas antes' },
    { ruleKey: 'reminder_1h', hoursBefore: 1, label: 'Recordatorio 1 hora antes' },
  ];

  const rules: ScheduledReminderRule[] = [];
  for (const c of candidates) {
    const triggerMs = apptMs - c.hoursBefore * 60 * 60 * 1000;
    if (triggerMs > nowMs + 60 * 1000) {
      rules.push({
        ruleKey: c.ruleKey,
        hoursBefore: c.hoursBefore,
        label: c.label,
        scheduledForIso: new Date(triggerMs).toISOString(),
        status: 'scheduled',
      });
    }
  }

  // Si falta menos de 1h para la cita, dejamos al menos una regla de recordatorio inmediato programado
  if (rules.length === 0) {
    rules.push({
      ruleKey: 'reminder_1h',
      hoursBefore: 1,
      label: 'Recordatorio inmediato / corta anticipación',
      scheduledForIso: new Date(nowMs).toISOString(),
      status: 'scheduled',
    });
  }

  return {
    appointmentIso: new Date(apptMs).toISOString(),
    hoursUntilAppointment,
    rules,
  };
}

async function insertScheduledRemindersIntoPushNotifications(params: {
  tenantId: string;
  clientUserId: string;
  appointmentId: string;
  clientName: string;
  serviceName: string;
  formattedWhen: string;
  rules: ScheduledReminderRule[];
}): Promise<void> {
  const { tenantId, clientUserId, appointmentId, clientName, serviceName, formattedWhen, rules } = params;
  if (!tenantId || !clientUserId || !rules.length) return;

  try {
    await db.execute(sql`
      ALTER TABLE public.push_notifications
        ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ
    `).catch(() => {});

    const devRes = await db.execute(sql`
      SELECT id, COALESCE(expo_push_token, push_token) AS push_token
      FROM public.user_devices
      WHERE user_id = ${clientUserId}::uuid
        AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
      ORDER BY is_active DESC, last_used_at DESC NULLS LAST
      LIMIT 1
    `).catch(() => ({ rows: [] }));
    const devRows = Array.isArray(devRes) ? devRes : (devRes as any).rows || [];
    const deviceId = devRows[0]?.id || null;
    const pushToken = devRows[0]?.push_token || null;

    for (const rule of rules) {
      const title =
        rule.hoursBefore >= 6
          ? '⏰ Recordatorio de tu Cita (6 horas antes)'
          : rule.hoursBefore >= 2
          ? '⏰ Recordatorio de tu Cita (2 horas antes)'
          : '⏰ Recordatorio de tu Cita (1 hora antes)';

      const body = `Hola ${clientName.trim()}, tu cita de ${serviceName} es el ${formattedWhen}. Confirma tu asistencia o cancela con al menos 3h de anticipación.`;
      const payloadData = JSON.stringify({
        tenantId,
        appointmentId,
        eventType: rule.ruleKey,
        hoursBefore: rule.hoursBefore,
        scheduledFor: rule.scheduledForIso,
        action: 'confirm_or_cancel',
      });

      await db.execute(sql`
        INSERT INTO public.push_notifications (
          tenant_id, user_id, device_id, push_token, event_type, title, body, data, status, scheduled_for, created_at
        )
        VALUES (
          ${tenantId}::uuid,
          ${clientUserId}::uuid,
          ${deviceId ? sql`${deviceId}::uuid` : sql`NULL`},
          ${pushToken},
          ${rule.ruleKey},
          ${title},
          ${body},
          ${payloadData}::jsonb,
          'scheduled',
          ${rule.scheduledForIso}::timestamptz,
          NOW()
        )
      `).catch(() => {});
    }
  } catch (err) {
    console.warn('⚠️ Aviso insertando recordatorios programados en push_notifications:', err);
  }
}

// 📝 CREAR CITA Y DISPARAR NOTIFICACIÓN A TELEGRAM
export async function createAppointment(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(400).json({ error: 'Falta identificador (x-tenant-id).' });

    const { clientName, clientEmail, clientPhone, clientPassword, authProvider, serviceId, staffId, appointmentDate, notes, metadata, acceptedTerms, deviceInfo } = req.body;
    
    // Usamos appointmentDate (que viene del front) o scheduledAt por compatibilidad
    const finalDateStr = appointmentDate || req.body.scheduledAt;

    const cleanPhoneDigitsForEmail = extractCleanPhone(clientPhone || '');
    const normalizedEmail = String(clientEmail || '').trim().toLowerCase()
      || (cleanPhoneDigitsForEmail ? `tel.${cleanPhoneDigitsForEmail}@autoflow.local` : '');

    if (!normalizedEmail || !clientName || !finalDateStr) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (Nombre, Fecha y Correo o Teléfono).' });
    }

    let resolvedServiceId = serviceId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(resolvedServiceId || ''));
    if (!isUuid) {
      const existingServices = await db.select().from(services).where(eq(services.tenantId, tenantId));
      if (existingServices.length > 0) {
        resolvedServiceId = existingServices[0].id;
      } else {
        const [createdDefaultSrv] = await db.insert(services).values({
          tenantId,
          name: 'Consulta / Servicio General',
          description: 'Servicio principal del negocio',
          price: '50.00',
          durationMinutes: 30,
          isActive: true
        } as any).returning();
        resolvedServiceId = createdDefaultSrv.id;
      }
    }

    const cleanMetadata = safeParseJSON(metadata);

    // 🌟 FIND OR CREATE USER 
    let [user] = await db.select().from(users).where(and(eq(users.email, normalizedEmail), eq(users.tenantId, tenantId)));
    
    if (!user && cleanPhoneDigitsForEmail.length >= 7) {
      const [userByPhone] = await db.select().from(users).where(
        and(
          eq(users.tenantId, tenantId),
          sql`regexp_replace(${users.phone}, '[^0-9]', '', 'g') LIKE ${'%' + cleanPhoneDigitsForEmail + '%'}`
        )
      );
      if (userByPhone) user = userByPhone;
    }

    const resolvedProvider = String(authProvider || deviceInfo?.authProvider || cleanMetadata?.authProvider || 'manual').toLowerCase();
    const hashedPwd = clientPassword && String(clientPassword).trim().length >= 4
      ? hashClientPassword(String(clientPassword).trim())
      : null;

    if (!user) {
      const initialUserMeta: any = {
        authProvider: resolvedProvider,
        ...(hashedPwd ? { passwordHash: hashedPwd } : {}),
        ...(cleanMetadata?.appleUserId ? { appleUserId: cleanMetadata.appleUserId } : {}),
      };
      const isOauthProvider = resolvedProvider === 'apple' || resolvedProvider === 'google';
      try {
        await db.execute(sql`
          ALTER TABLE public.users
            ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(30) DEFAULT 'manual',
            ADD COLUMN IF NOT EXISTS is_verified_provider BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS apple_user_id VARCHAR(255)
        `);
      } catch (_colErr) {}

      [user] = await db.insert(users).values({ 
        tenantId, 
        name: clientName.trim(), 
        email: normalizedEmail, 
        phone: clientPhone?.trim() || '', 
        role: 'client',
        metadata: initialUserMeta
      } as any).returning();

      try {
        await db.execute(sql`
          UPDATE public.users
          SET auth_provider = ${resolvedProvider},
              is_verified_provider = ${isOauthProvider},
              apple_user_id = ${cleanMetadata?.appleUserId ? String(cleanMetadata.appleUserId) : null}
          WHERE id = ${user.id}::uuid
        `);
      } catch (_updColErr) {}
    } else {
      const existingUserMeta = safeParseJSON(user.metadata);
      const mergedUserMeta: any = {
        ...existingUserMeta,
        authProvider: resolvedProvider !== 'manual' ? resolvedProvider : (existingUserMeta.authProvider || 'manual'),
        ...(hashedPwd ? { passwordHash: hashedPwd } : {}),
        ...(cleanMetadata?.appleUserId ? { appleUserId: cleanMetadata.appleUserId } : {}),
      };
      const isOauthUpdate = resolvedProvider === 'apple' || resolvedProvider === 'google';
      [user] = await db.update(users).set({ 
        name: clientName.trim(), 
        phone: clientPhone?.trim() || user.phone,
        email: String(clientEmail || '').trim().includes('@') ? String(clientEmail).trim().toLowerCase() : user.email,
        metadata: mergedUserMeta
      } as any).where(eq(users.id, user.id)).returning();

      try {
        await db.execute(sql`
          UPDATE public.users
          SET auth_provider = CASE WHEN ${isOauthUpdate} THEN ${resolvedProvider} ELSE COALESCE(auth_provider, 'manual') END,
              is_verified_provider = COALESCE(is_verified_provider, false) OR ${isOauthUpdate},
              apple_user_id = COALESCE(${cleanMetadata?.appleUserId ? String(cleanMetadata.appleUserId) : null}, apple_user_id)
          WHERE id = ${user.id}::uuid
        `);
      } catch (_updColErr2) {}
    }

    // ⚖️📱 Registrar aceptación legal (desde legal_documents -> user_legal_acceptances) y dispositivo en user_devices
    await recordLegalAcceptanceAndDevice({
      req,
      userId: user.id,
      tenantId,
      acceptedTerms: acceptedTerms !== false,
      deviceInfo: deviceInfo || cleanMetadata?.deviceInfo
    });

    // 🌟 VEHÍCULO
    let vehicleRecord: any = null;
    if (cleanMetadata.carPlate) {
      const plateUpper = cleanMetadata.carPlate.toUpperCase();
      let [existingVehicle] = await db.select().from(vehicles).where(and(eq(vehicles.plate, plateUpper), eq(vehicles.tenantId, tenantId)));
      
      if (!existingVehicle) {
        [vehicleRecord] = await db.insert(vehicles).values({
          tenantId, 
          clientId: user.id, 
          plate: plateUpper, 
          brand: cleanMetadata.carBrand, 
          model: cleanMetadata.carModel, 
          year: cleanMetadata.carYear, 
          currentMileage: cleanMetadata.carMileage
        }).returning();
      } else {
        [vehicleRecord] = await db.update(vehicles).set({ 
          currentMileage: cleanMetadata.carMileage 
        }).where(eq(vehicles.id, existingVehicle.id)).returning();
      }
    }

    // 🌟 RESPETAR LA HORA EXACTA DEL RELOJ (WALL-CLOCK) SIN DESFASE DE ZONA HORARIA + METADATA
    const parsedDate = parseWallClockAppointmentDate(finalDateStr, cleanMetadata?.localDate, cleanMetadata?.localTime);
    
    const rawRefPhone = cleanMetadata?.referredBy || cleanMetadata?.preferences?.referredBy || req.body?.referredBy || '';
    const refPhone = extractCleanPhone(rawRefPhone);

    // Verificamos si staffId existe en la tabla users para no romper la FK "appointments_staff_id_users_id_fk"
    const safeDbStaffId = await resolveSafeUserStaffId(staffId);

    const finalMediaAndReports: any = vehicleRecord 
      ? { vehicleId: vehicleRecord.id, ...cleanMetadata } 
      : { ...cleanMetadata };

    if (refPhone) {
      finalMediaAndReports.referredBy = refPhone;
    }
    if (staffId) {
      finalMediaAndReports.assignedStaffId = staffId;
    }

    const reminderPlan = buildAppointmentReminderRules({
      parsedDate,
      localDate: cleanMetadata?.localDate,
      localTime: cleanMetadata?.localTime,
    });
    finalMediaAndReports.reminderRules = reminderPlan.rules;
    finalMediaAndReports.hoursUntilAppointment = reminderPlan.hoursUntilAppointment;

    const [apt] = await db.insert(appointments).values({ 
      tenantId, 
      clientId: user.id, 
      staffId: safeDbStaffId, 
      serviceId: resolvedServiceId, 
      scheduledAt: parsedDate, 
      status: 'scheduled', 
      staffNotes: notes || 'Sin notas', 
      mediaAndReports: finalMediaAndReports, 
      estimatedCost: '0.00', 
      finalCost: '0.00' 
    }).returning();

    const [bookedService] = resolvedServiceId
      ? await db.select().from(services).where(eq(services.id, resolvedServiceId))
      : [null as any];
    const prettyAptWhenForRule = formatWallClockForNotification(parsedDate, finalMediaAndReports);
    await insertScheduledRemindersIntoPushNotifications({
      tenantId,
      clientUserId: user.id,
      appointmentId: apt.id,
      clientName: clientName.trim(),
      serviceName: bookedService?.name || 'Servicio General',
      formattedWhen: prettyAptWhenForRule,
      rules: reminderPlan.rules,
    });

    // 🔔 DISPARAR NOTIFICACIÓN A TELEGRAM (MULTI-NICHO + LINK GOOGLE CALENDAR)
    const modalityText = cleanMetadata?.modality === 'phone_call' ? '📞 Llamada Telefónica' : cleanMetadata?.modality === 'video_call' ? '💻 Videollamada' : '📍 Presencial';
    const gcalUrl = buildTelegramGoogleCalendarLink(
      parsedDate,
      `Cita AutoFlow: ${clientName.trim()}`,
      `Teléfono: ${clientPhone?.trim() || 'N/A'} | Modalidad: ${modalityText} | Notas: ${notes || 'Sin detalles'}`
    );
    const telegramMsg = `
🚨 <b>¡NUEVA RESERVA EN AUTOFLOW!</b> 🚨
👤 <b>Cliente/Paciente:</b> ${clientName.trim()}
📞 <b>Teléfono:</b> ${clientPhone?.trim() || 'N/A'}
🗓️ <b>Fecha y Hora:</b> ${formatWallClockForNotification(parsedDate, finalMediaAndReports)}
📍 <b>Modalidad:</b> ${modalityText}
${cleanMetadata.carPlate ? `🚗 <b>Vehículo:</b> ${cleanMetadata.carPlate}
` : ''}${cleanMetadata.caseType ? `📌 <b>Área / Motivo:</b> ${cleanMetadata.caseType}
` : ''}${cleanMetadata.opposingParty ? `🛡️ <b>Contraparte / Seguro:</b> ${cleanMetadata.opposingParty}
` : ''}📝 <b>Notas:</b> ${notes || 'Sin detalles'}
${refPhone ? `🤝 <b>Referido por:</b> ${refPhone}
` : ''}📅 <a href="${gcalUrl}"><b>+ Agregar a Google Calendar en 1 Clic</b></a>
    `;
    
    const prettyAptWhen = formatWallClockForNotification(parsedDate, finalMediaAndReports);
    await Promise.allSettled([
      sendTelegramNotification(telegramMsg, tenantId, 'appointment'),
      notifyTenantPush(tenantId, {
        title: `📅 Nueva Cita: ${clientName.trim()}`,
        body: `${prettyAptWhen} • ${modalityText}`,
        data: { tenantId, appointmentId: apt.id, staffId: safeDbStaffId || staffId || null, view: 'mecanico' },
      }, safeDbStaffId || staffId || null),
    ]);

    return res.status(201).json({ success: true, appointment: apt });
  } catch (error: any) { 
    console.error("Error agendando:", error);
    return res.status(500).json({ error: error.message }); 
  }
}

export async function getAppointments(req: Request, res: Response) {
  try { return res.json(await db.select().from(appointments).where(eq(appointments.tenantId, req.headers['x-tenant-id'] as string))); } catch (error: any) { return res.status(500).json({ error: String(error) }); }
}

export async function checkAvailability(req: Request, res: Response) {
  try {
    const dayApts = await db.query.appointments.findMany({
      where: and(
        eq(appointments.tenantId, req.headers['x-tenant-id'] as string),
        gte(appointments.scheduledAt, new Date(`${req.query.date}T00:00:00Z`)),
        lt(appointments.scheduledAt, new Date(`${req.query.date}T23:59:59Z`)),
        ne(appointments.status, 'cancelled')
      ),
      columns: { scheduledAt: true }
    });
    return res.status(200).json({ success: true, bookedTimes: dayApts.map(a => `${new Date(a.scheduledAt).getUTCHours().toString().padStart(2, '0')}:${new Date(a.scheduledAt).getUTCMinutes().toString().padStart(2, '0')}`) });
  } catch (error: any) { return res.status(500).json({ success: false, error: error.message }); }
}

// 🗓️ OBTENER CITAS DE HOY O PRÓXIMOS DÍAS
export async function getTodaysAppointments(req: Request, res: Response) {
  try {
    // Ventana universal multi-país: restamos 14h al inicio del día UTC para cubrir todas las zonas horarias (América y Europa) sin perder citas del día
    let start = new Date(); 
    start.setUTCHours(0, 0, 0, 0);
    start = new Date(start.getTime() - 14 * 60 * 60 * 1000);
    
    let end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    
    if (req.query.filter === 'upcoming') {
      end.setUTCDate(end.getUTCDate() + 8);
    } else {
      end = new Date(end.getTime() + 14 * 60 * 60 * 1000);
    }

    const rows = await db.select({ 
      apt: appointments, 
      cli: users, 
      svc: services,
      wo: workOrders
    })
    .from(appointments)
    .innerJoin(users, eq(appointments.clientId, users.id))
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .leftJoin(workOrders, eq(workOrders.appointmentId, appointments.id))
    .where(
      and(
        eq(appointments.tenantId, req.headers['x-tenant-id'] as string), 
        gte(appointments.scheduledAt, start), 
        lt(appointments.scheduledAt, end), 
        ne(appointments.status, 'completed'),
        ne(appointments.status, 'cancelled')
      )
    )
    .orderBy(appointments.scheduledAt);

    const vehicleIds = rows.map(r => {
        const meta = safeParseJSON(r.apt.mediaAndReports);
        return meta?.vehicleId;
    }).filter(Boolean);
      
    let vehiclesMap: any = {};
    if (vehicleIds.length > 0) {
      const vecs = await db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds));
      vecs.forEach(v => { vehiclesMap[v.id] = v; });
    }

    return res.status(200).json({ 
      success: true, 
      appointments: rows.map(r => {
        const meta = safeParseJSON(r.apt.mediaAndReports);
        const clientMeta = safeParseJSON(r.cli.metadata);
        const vehicle = meta?.vehicleId ? vehiclesMap[meta.vehicleId] : null;
        
        const dbDateStr = r.apt.scheduledAt.toISOString(); 
        const timePart = meta?.localTime || dbDateStr.split('T')[1].substring(0, 5); 

        return { 
          id: r.apt.id, 
          status: r.apt.status,
          date: dbDateStr,
          appointmentDate: dbDateStr,
          time: timePart, 
          staffId: r.apt.staffId || meta?.assignedStaffId || null,
          clientName: r.cli.name,
          clientPhone: r.cli.phone,
          clientEmail: r.cli.email,
          clientMetadata: clientMeta, 
          plate: vehicle?.plate || meta?.carPlate || 'N/A', 
          brand: vehicle?.brand || meta?.carBrand || '', 
          model: vehicle?.model || meta?.carModel || '', 
          year: vehicle?.year || meta?.carYear || '', 
          mileage: vehicle?.currentMileage || meta?.carMileage || '0', 
          serviceType: r.svc?.name || 'General', 
          estimatedCost: r.apt.estimatedCost || '0.00',
          notes: r.apt.staffNotes,
          metadata: meta, 
          hasWorkOrder: !!r.wo,
          service: r.svc 
        };
      }) 
    });
  } catch (error: any) { 
    return res.status(500).json({ success: false, error: error.message }); 
  }
}

// 🛠️ POS UNIVERSAL: CIERRE DE ORDEN Y LÓGICA DE FIDELIZACIÓN (WIN-WIN)
export async function completeWorkOrder(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { appointmentId } = req.params;
    
    console.log("📥 Recibiendo cierre de orden para ID:", appointmentId, "Tenant:", tenantId);

    const { 
      finalCost, 
      mechanicNotes, 
      exitMileage, 
      oldParts, 
      newParts, 
      nextServiceDate, 
      staffId,
      oldPartImageUrl, 
      newPartImageUrl,
      rewardApplied,            
      referralDiscountApplied   
    } = req.body;

    if (!tenantId || !appointmentId) {
      return res.status(400).json({ error: 'Faltan identificadores (tenantId o appointmentId).' });
    }

    const [currentApt] = await db.select().from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));

    if (!currentApt) {
      return res.status(404).json({ error: 'Cita u Orden no encontrada en la base de datos.' });
    }

    const existingMetadata = safeParseJSON(currentApt.mediaAndReports);
    const vehicleId = existingMetadata.vehicleId || null;
    
    // Validamos si el staffId existe en users para no violar la FK en work_orders o appointments
    const requestedStaffId = staffId || currentApt.staffId || existingMetadata.assignedStaffId || null;
    const safeDbStaffId = await resolveSafeUserStaffId(requestedStaffId);

    let workOrder: any = null;
    try {
      const [wo] = await db.insert(workOrders).values({
        tenantId,
        appointmentId: currentApt.id,
        vehicleId: vehicleId, 
        staffId: requestedStaffId,
        finalCost: finalCost ? String(finalCost) : '0.00',
        mechanicNotes: mechanicNotes || '',
        oldParts: oldParts || '',
        newParts: newParts || '',
        oldPartImageUrl: oldPartImageUrl || null, 
        newPartImageUrl: newPartImageUrl || null, 
        nextServiceRecommendation: nextServiceDate || ''
      }).returning();
      workOrder = wo;
    } catch (woErr: any) {
      const [woFallback] = await db.insert(workOrders).values({
        tenantId,
        appointmentId: currentApt.id,
        vehicleId: vehicleId, 
        staffId: safeDbStaffId,
        finalCost: finalCost ? String(finalCost) : '0.00',
        mechanicNotes: mechanicNotes || '',
        oldParts: oldParts || '',
        newParts: newParts || '',
        oldPartImageUrl: oldPartImageUrl || null, 
        newPartImageUrl: newPartImageUrl || null, 
        nextServiceRecommendation: nextServiceDate || ''
      }).returning();
      workOrder = woFallback;
    }

    if (vehicleId && exitMileage) {
      await db.update(vehicles)
        .set({ currentMileage: String(exitMileage) })
        .where(eq(vehicles.id, vehicleId));
    }

    const [updatedApt] = await db.update(appointments).set({
      status: 'completed',
      staffId: safeDbStaffId,
      finalCost: finalCost ? String(finalCost) : '0.00',
      staffNotes: mechanicNotes || currentApt.staffNotes,
      mediaAndReports: { 
        ...existingMetadata, 
        workOrderId: workOrder.id,
        assignedStaffId: requestedStaffId 
      } 
    }).where(eq(appointments.id, appointmentId)).returning();

    // =========================================================================
    // 🎁 MOTOR DE FIDELIZACIÓN Y REFERIDOS (1 CUPÓN POR SERVICIO + ACUMULACIÓN)
    // =========================================================================
    
    // 1. Manejo del Cliente Actual (El que está pagando hoy)
    const [client] = await db.select().from(users).where(eq(users.id, currentApt.clientId));
    
    if (client) {
      const clientMeta = safeParseJSON(client.metadata);
      let currentVisits = Number(client.loyaltyVisits || 0);

      if (rewardApplied) {
        currentVisits = 0;
      } else {
        currentVisits += 1;
      }

      // 🌟 REGLA DE FIDELIDAD: Solo consume 1 cupón por servicio.
      if (referralDiscountApplied) {
        clientMeta.earnedReferralDiscounts = Number(clientMeta.earnedReferralDiscounts || 0) - 1;
      }

      await db.update(users).set({ 
        loyaltyVisits: currentVisits,
        metadata: clientMeta 
      }).where(eq(users.id, client.id));
    }

    // 2. Darle el Premio al Referidor (Cuando el amigo recomendado completa su cita)
    const rawReferredBy = existingMetadata.referredBy || existingMetadata.preferences?.referredBy || '';
    const cleanPhone = extractCleanPhone(rawReferredBy);
    
    if (cleanPhone.length >= 7) {
      const [referrer] = await db.select().from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            sql`regexp_replace(${users.phone}, '[^0-9]', '', 'g') LIKE ${'%' + cleanPhone + '%'}`
          )
        );
      
      if (referrer && referrer.id !== client?.id) {
        const referrerMeta = safeParseJSON(referrer.metadata);
        const earned = Number(referrerMeta.earnedReferralDiscounts || 0) + 1;

        await db.update(users).set({ 
          loyaltyVisits: Number(referrer.loyaltyVisits || 0) + 1, 
          metadata: { 
            ...referrerMeta, 
            earnedReferralDiscounts: earned, 
            lastReferred: client?.name || 'un amigo' 
          } 
        }).where(eq(users.id, referrer.id));
        
        console.log(`✅ [REFERIDO] Premio guardado para el usuario: ${referrer.name} (Total cupones: ${earned}) por referir a ${client?.name}`);
        
        sendTelegramNotification(`🎉 <b>¡Referido Exitoso!</b>\nEl usuario ${referrer.name} acaba de ganar +1 punto de fidelidad y 1 CUPÓN DE DESCUENTO (Disponibles: ${earned}) porque su referido (${client?.name}) completó su primera cita.`, tenantId, 'pos');
      } else {
        console.log(`❌ [REFERIDO] No se encontró referidor válido con el número: ${cleanPhone}`);
      }
    }

    sendTelegramNotification(`
💰 <b>¡SERVICIO COMPLETADO Y FACTURADO (POS)!</b> ✅
👤 <b>Cliente/Paciente:</b> ${client?.name || 'Cliente'}
💵 <b>Total Cobrado:</b> $${finalCost ? String(finalCost) : '0.00'}
📝 <b>Notas / Diagnóstico:</b> ${mechanicNotes || 'Sin observaciones'}
${nextServiceDate ? `📅 <b>Próximo Control/Visita:</b> ${nextServiceDate}` : ''}
    `, tenantId, 'pos').catch(() => {});

    return res.status(200).json({ 
      success: true, 
      message: 'Orden guardada con éxito y Puntos actualizados.',
      workOrder, 
      order: updatedApt
    });

  } catch (error: any) {
    console.error("🔴 Error crítico en completeWorkOrder:", error);
    return res.status(500).json({ success: false, error: error.message }); 
  }
}

// 📋 EXPEDIENTE COMPLETO DEL VEHÍCULO Y CLIENTE
export async function getClientVehicleHistory(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { identifier } = req.params;

    if (!tenantId || !identifier) {
      return res.status(400).json({ error: 'Falta el identificador de búsqueda.' });
    }

    let clientRecord: any = null;
    let vehicleRecord: any = null;
    let rawOrders: any[] = [];
    const cleanIdentifier = identifier.trim().toLowerCase();

    // 1. Buscar por Email
    if (cleanIdentifier.includes('@')) {
      const [client] = await db.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.email, cleanIdentifier)));
      if (!client) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
      clientRecord = client;
      
      const apts = await db.select().from(appointments).where(eq(appointments.clientId, client.id));
      if (apts.length > 0) {
        rawOrders = await db.select({
          wo: workOrders,
          svc: services
        })
        .from(workOrders)
        .innerJoin(appointments, eq(workOrders.appointmentId, appointments.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(inArray(workOrders.appointmentId, apts.map(a => a.id)))
        .orderBy(workOrders.createdAt);
      }

    // 2. Buscar por Teléfono (Ignorando +1, espacios o guiones en ambos lados)
    } else if (cleanIdentifier.replace(/\D/g, '').length >= 7) {
      const numericPhone = extractCleanPhone(cleanIdentifier); 
      
      const [client] = await db.select().from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            sql`regexp_replace(${users.phone}, '[^0-9]', '', 'g') LIKE ${'%' + numericPhone + '%'}`
          )
        );

      if (!client) return res.status(404).json({ success: false, error: 'Cliente no encontrado.' });
      clientRecord = client;

      const apts = await db.select().from(appointments).where(eq(appointments.clientId, client.id));
      if (apts.length > 0) {
        rawOrders = await db.select({
          wo: workOrders,
          svc: services
        })
        .from(workOrders)
        .innerJoin(appointments, eq(workOrders.appointmentId, appointments.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(inArray(workOrders.appointmentId, apts.map(a => a.id)))
        .orderBy(workOrders.createdAt);
      }

    // 3. Buscar por Placa de Vehículo
    } else {
      const [vRecord] = await db.select().from(vehicles)
        .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.plate, cleanIdentifier.toUpperCase())));

      if (!vRecord) {
        return res.status(404).json({ success: false, error: 'No se encontró registro con ese dato.' });
      }
      vehicleRecord = vRecord; 

      const [cRecord] = await db.select().from(users).where(eq(users.id, vRecord.clientId));
      clientRecord = cRecord;

      rawOrders = await db.select({
        wo: workOrders,
        svc: services
      })
      .from(workOrders)
      .innerJoin(appointments, eq(workOrders.appointmentId, appointments.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(eq(workOrders.vehicleId, vRecord.id))
      .orderBy(workOrders.createdAt);
    }

    const formattedHistory = rawOrders.map(row => ({
      ...row.wo,
      service: row.svc 
    }));

    return res.status(200).json({
      success: true,
      client: clientRecord ? { ...clientRecord, metadata: safeParseJSON(clientRecord.metadata) } : null,
      vehicle: vehicleRecord,
      serviceHistory: formattedHistory 
    });

  } catch (error: any) {
    console.error("Error en búsqueda de expediente:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// =========================================================================
// 📢 ENDPOINTS PARA LA TABLA public.push_campaigns (OBTENER Y CREAR)
// =========================================================================
export async function getPushCampaigns(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(400).json({ error: 'Falta x-tenant-id' });

    const result = await db.execute(sql`
      SELECT id, tenant_id, title, message, target_audience, sent_at
      FROM public.push_campaigns
      WHERE tenant_id = ${tenantId}
      ORDER BY sent_at DESC
    `);

    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    return res.status(200).json({ success: true, campaigns: rows });
  } catch (error: any) {
    console.error("Error obteniendo push_campaigns:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createPushCampaign(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { title, message, target_audience } = req.body;

    if (!tenantId || !title || !message) {
      return res.status(400).json({ error: 'Faltan datos obligatorios de la campaña.' });
    }

    const result = await db.execute(sql`
      INSERT INTO public.push_campaigns (tenant_id, title, message, target_audience, sent_at)
      VALUES (${tenantId}, ${title}, ${message}, ${target_audience || 'all_clients'}, NOW())
      RETURNING id, tenant_id, title, message, target_audience, sent_at
    `);

    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    const created = rows[0];

    await sendTelegramNotification(`📢 <b>¡CAMPAÑA PUSH ENVIADA!</b>\n🎯 <b>Audiencia:</b> ${target_audience}\n📌 <b>Título:</b> ${title}\n💬 <b>Mensaje:</b> ${message}`, tenantId, 'campaign');

    return res.status(201).json({ success: true, campaign: created });
  } catch (error: any) {
    console.error("Error creando push_campaign:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// =========================================================================
// ⭐ ENDPOINT OFICIAL: 1 SOLA RESEÑA Y 1 LIKE/DISLIKE POR CLIENTE ÚNICO
// =========================================================================
export async function saveClientReview(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { clientId, clientName, clientPhone, rating, reaction, comment, serviceName } = req.body;

    if (!tenantId || (!clientId && !clientPhone && !clientName)) {
      return res.status(400).json({ error: 'Falta identificar al cliente o al negocio.' });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) return res.status(404).json({ error: 'Negocio no encontrado.' });

    const loyaltyConfig = safeParseJSON((tenant as any).loyaltyConfig);
    const existingReviews: any[] = Array.isArray(loyaltyConfig.reviews) ? loyaltyConfig.reviews : [];

    const cleanPhoneKey = extractCleanPhone(clientPhone || '');
    const clientKey = String(clientId || cleanPhoneKey || clientName).toLowerCase().trim();

    // Regulación estricta: Filtramos cualquier reseña previa del mismo cliente (por ID, Teléfono o Nombre)
    const filteredReviews = existingReviews.filter((r: any) => {
      const rKey = String(r.clientId || extractCleanPhone(r.clientPhone || '') || r.clientName || '').toLowerCase().trim();
      return rKey !== clientKey;
    });

    const newReview = {
      id: `rev-${clientKey}`,
      clientId: clientId || cleanPhoneKey || clientName,
      clientPhone: cleanPhoneKey,
      clientName: clientName || 'Cliente Verificado',
      rating: Number(rating || (reaction === 'dislike' ? 2 : 5)),
      reaction: reaction || (Number(rating) >= 4 ? 'like' : 'dislike'),
      comment: comment ? String(comment).trim() : '',
      serviceName: serviceName || 'Cliente Frecuente',
      createdAt: new Date().toISOString()
    };

    const updatedReviews = [newReview, ...filteredReviews];
    const updatedLoyalty = { ...loyaltyConfig, reviews: updatedReviews };

    await db.update(tenants)
      .set({ loyaltyConfig: updatedLoyalty } as any)
      .where(eq(tenants.id, tenantId));

    return res.status(200).json({
      success: true,
      review: newReview,
      reviews: updatedReviews
    });
  } catch (error: any) {
    console.error("Error guardando reseña única:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// =========================================================================
// ❌ CANCELAR CITA, LIBERAR ESPACIO EN AGENDA Y ENVIAR TELEGRAM + EXPO PUSH
// =========================================================================
export async function cancelAppointment(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { appointmentId } = req.params;
    const { reason, cancelledBy, clientName, clientPhone, serviceName, appointmentDate, time } = req.body || {};

    if (!tenantId || !appointmentId) {
      return res.status(400).json({ success: false, error: 'Faltan identificadores (tenantId o appointmentId).' });
    }

    const [currentApt] = await db.select().from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));

    if (!currentApt) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada.' });
    }

    const [client] = await db.select().from(users).where(eq(users.id, currentApt.clientId));
    let [service] = currentApt.serviceId
      ? await db.select().from(services).where(eq(services.id, currentApt.serviceId))
      : [null as any];

    const existingMeta = safeParseJSON(currentApt.mediaAndReports);
    const cancelReason = reason ? String(reason).trim() : 'Sin motivo especificado';
    const whoCancelled = cancelledBy === 'client' ? 'Cliente (desde Expediente)' : 'Personal del Negocio (Portal Interno)';

    // 1. Marcar como 'cancelled' en PostgreSQL (con fallback seguro si el enum de status no tiene 'cancelled')
    let cancelledApt: any = null;
    try {
      const [updated] = await db.update(appointments)
        .set({
          status: 'cancelled',
          staffNotes: `❌ CANCELADA (${whoCancelled}): ${cancelReason}`,
          mediaAndReports: {
            ...existingMeta,
            cancelledAt: new Date().toISOString(),
            cancelledBy: cancelledBy || 'staff',
            cancelReason
          }
        })
        .where(eq(appointments.id, appointmentId))
        .returning();
      cancelledApt = updated;
    } catch (enumErr) {
      await db.delete(appointments).where(eq(appointments.id, appointmentId));
      cancelledApt = { ...currentApt, status: 'cancelled' };
    }

    const finalClientName = client?.name || clientName || 'Cliente';
    const finalClientPhone = client?.phone || clientPhone || 'N/A';
    const finalServiceName = service?.name || serviceName || 'Servicio General';
    const formattedDate = formatWallClockForNotification(currentApt.scheduledAt, existingMeta, appointmentDate, time);

    // 2. Disparar alerta a Telegram informando que el turno quedó libre
    const telegramMsg = `
❌ <b>¡CITA CANCELADA — ESPACIO LIBERADO!</b> ❌
👤 <b>Cliente:</b> ${finalClientName}
📞 <b>Teléfono:</b> ${finalClientPhone}
🗓️ <b>Turno liberado:</b> ${formattedDate}
🛠️ <b>Servicio:</b> ${finalServiceName}
🙋‍♂️ <b>Cancelada por:</b> ${whoCancelled}
📝 <b>Motivo:</b> ${cancelReason}
✅ <i>El horario ya quedó disponible nuevamente en la agenda.</i>
    `;
    await sendTelegramNotification(telegramMsg, tenantId, 'status');

    // 3. Disparar Notificación Push vía Expo al cliente y al trabajador/barbero asignado
    await Promise.allSettled([
      notifyClientPush(
        tenantId,
        String(currentApt.clientId),
        {
          title: '❌ Cita Cancelada',
          body: `Tu cita de ${finalServiceName} (${formattedDate}) fue cancelada.`,
          data: { tenantId, appointmentId, status: 'cancelled', eventType: 'appointment_cancelled' },
        },
        'appointment_cancelled'
      ),
      notifyTenantPush(
        tenantId,
        {
          title: '❌ Cita Cancelada — Turno Disponible',
          body: `${finalClientName} canceló ${finalServiceName} (${formattedDate}). El espacio ya está libre.`,
          data: { tenantId, appointmentId, status: 'cancelled', eventType: 'appointment_cancelled' },
        },
        currentApt.staffId || existingMeta?.assignedStaffId || null
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Cita cancelada y espacio liberado exitosamente.',
      appointment: cancelledApt
    });
  } catch (error: any) {
    console.error('Error cancelando cita:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


// =========================================================================
// ✅ CONFIRMAR ASISTENCIA (RESPUESTA AL RECORDATORIO DE 6 HORAS) -> TELEGRAM + EXPO PUSH
// =========================================================================
export async function confirmAppointment(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { appointmentId } = req.params;
    const { confirmedBy, clientName, clientPhone, serviceName, appointmentDate, time } = req.body || {};

    if (!tenantId || !appointmentId) {
      return res.status(400).json({ success: false, error: 'Faltan identificadores (tenantId o appointmentId).' });
    }

    const [currentApt] = await db.select().from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));

    if (!currentApt) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada.' });
    }

    const [client] = await db.select().from(users).where(eq(users.id, currentApt.clientId));
    const [service] = currentApt.serviceId
      ? await db.select().from(services).where(eq(services.id, currentApt.serviceId))
      : [null as any];

    const existingMeta = safeParseJSON(currentApt.mediaAndReports);
    const [updatedApt] = await db.update(appointments)
      .set({
        status: 'confirmed',
        mediaAndReports: {
          ...existingMeta,
          attendanceConfirmed: true,
          confirmedAt: new Date().toISOString(),
          confirmedBy: confirmedBy || 'client'
        }
      })
      .where(eq(appointments.id, appointmentId))
      .returning();

    const finalClientName = client?.name || clientName || 'Cliente';
    const finalClientPhone = client?.phone || clientPhone || 'N/A';
    const finalServiceName = service?.name || serviceName || 'Servicio General';
    const formattedDate = formatWallClockForNotification(currentApt.scheduledAt, existingMeta, appointmentDate, time);

    // 1. Notificar a Telegram que el cliente confirmó su asistencia
    const telegramMsg = `
✅ <b>¡ASISTENCIA CONFIRMADA POR EL CLIENTE!</b> ✅
👤 <b>Cliente:</b> ${finalClientName}
📞 <b>Teléfono:</b> ${finalClientPhone}
🗓️ <b>Cita:</b> ${formattedDate}
🛠️ <b>Servicio:</b> ${finalServiceName}
🔒 <i>El cliente confirmó su asistencia (Política 6h/3h). Turno 100% asegurado.</i>
    `;
    await sendTelegramNotification(telegramMsg, tenantId, 'status');

    // 2. Enviar Notificación Push vía Expo al cliente y al trabajador/barbero del negocio
    await Promise.allSettled([
      notifyClientPush(
        tenantId,
        String(currentApt.clientId),
        {
          title: '✅ Asistencia Confirmada',
          body: `Tu cita de ${finalServiceName} (${formattedDate}) está confirmada.`,
          data: { tenantId, appointmentId, status: 'confirmed', eventType: 'appointment_confirmed' },
        },
        'appointment_confirmed'
      ),
      notifyTenantPush(
        tenantId,
        {
          title: '✅ Asistencia Confirmada',
          body: `${finalClientName} confirmó su cita de ${finalServiceName} (${formattedDate}).`,
          data: { tenantId, appointmentId, status: 'confirmed', eventType: 'appointment_confirmed' },
        },
        currentApt.staffId || existingMeta?.assignedStaffId || null
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Asistencia confirmada exitosamente.',
      appointment: updatedApt
    });
  } catch (error: any) {
    console.error('Error confirmando asistencia:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// =========================================================================
// 🔔 RECORDATORIO 6 HORAS ANTES (SOLICITA CONFIRMAR O LIBERAR CON 3H DE MARGEN)
// =========================================================================
export async function sendAppointmentReminder(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { appointmentId } = req.params;
    const { clientName, clientPhone, serviceName, appointmentDate, time } = req.body || {};

    if (!tenantId || !appointmentId) {
      return res.status(400).json({ success: false, error: 'Faltan identificadores.' });
    }

    const [currentApt] = await db.select().from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));

    if (!currentApt) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada.' });
    }

    const [client] = await db.select().from(users).where(eq(users.id, currentApt.clientId));
    const [service] = currentApt.serviceId
      ? await db.select().from(services).where(eq(services.id, currentApt.serviceId))
      : [null as any];

    const existingMeta = safeParseJSON(currentApt.mediaAndReports);
    await db.update(appointments)
      .set({
        mediaAndReports: {
          ...existingMeta,
          reminder6hSent: true,
          reminderSentAt: new Date().toISOString()
        }
      })
      .where(eq(appointments.id, appointmentId));

    const finalClientName = client?.name || clientName || 'Cliente';
    const finalClientPhone = client?.phone || clientPhone || 'N/A';
    const finalServiceName = service?.name || serviceName || 'Servicio General';
    const formattedDate = formatWallClockForNotification(currentApt.scheduledAt, existingMeta, appointmentDate, time);

    const telegramMsg = `
⏰ <b>¡RECORDATORIO DE CITA (6 HORAS ANTES)!</b> ⏰
👤 <b>Cliente:</b> ${finalClientName} (${finalClientPhone})
🗓️ <b>Horario:</b> ${formattedDate}
🛠️ <b>Servicio:</b> ${finalServiceName}
📲 <i>Se solicitó al cliente confirmar su asistencia en Expediente o cancelar con mínimo 3 horas de anticipación para no perder el espacio.</i>
    `;
    await sendTelegramNotification(telegramMsg, tenantId, 'status');

    // Enviar Push a dispositivos activos
    try {
      const devicesRes = await db.execute(sql`
        SELECT d.push_token 
        FROM public.user_devices d
        INNER JOIN public.users u ON u.id = d.user_id
        WHERE u.tenant_id = ${tenantId}::uuid AND d.is_active = true
      `);
      const deviceRows = Array.isArray(devicesRes) ? devicesRes : (devicesRes as any).rows || [];
      const tokens = deviceRows.map((r: any) => r.push_token).filter((t: string) => t && t.startsWith('ExponentPushToken'));

      if (tokens.length > 0) {
        const pushMessages = tokens.map((token: string) => ({
          to: token,
          sound: 'default',
          title: '⏰ Recordatorio de tu Cita (En 6 horas)',
          body: `Hola ${finalClientName}, confirma tu asistencia para ${finalServiceName} (${formattedDate}) o libera el turno con al menos 3h de anticipación.`,
          data: { tenantId, appointmentId, action: 'confirm_or_cancel' }
        }));

        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(pushMessages)
        });
      }
    } catch (pushErr) {}

    return res.status(200).json({
      success: true,
      message: 'Recordatorio de 6 horas enviado por Telegram y Push.'
    });
  } catch (error: any) {
    console.error('Error enviando recordatorio 6h:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


// =========================================================================
// 🛠️ HELPERS DE VALIDACIÓN ESTRICTA PARA VOZ IA (TELÉFONO, NOMBRE "(Voz IA)", EMAIL, FECHA Y HORA NATURAL)
// =========================================================================

// Capitaliza palabras y agrega siempre el sufijo "(Voz IA)" cuando hay un nombre real
const formatVoiceAiClientName = (rawName?: string | null, existingDbName?: string | null): string => {
  const cleanCandidate = String(rawName || '')
    .replace(/\(Voz IA\)/gi, '')
    .replace(/\(Voice AI\)/gi, '')
    .trim();

  const isGeneric = (val: string) => {
    if (!val || val.length < 2) return true;
    const lower = val.toLowerCase();
    return (
      lower === 'cliente telefónico' ||
      lower === 'cliente telefonico' ||
      lower === 'cliente' ||
      lower === 'customer' ||
      lower === 'unknown' ||
      lower === 'usuario' ||
      lower === 'llamada entrante' ||
      lower === 'n/a' ||
      lower === 'null' ||
      lower === 'undefined'
    );
  };

  if (!isGeneric(cleanCandidate)) {
    const titled = cleanCandidate.replace(/(^|\s)\S/g, (m) => m.toUpperCase());
    return `${titled} (Voz IA)`;
  }

  const cleanExisting = String(existingDbName || '')
    .replace(/\(Voz IA\)/gi, '')
    .replace(/\(Voice AI\)/gi, '')
    .trim();

  if (!isGeneric(cleanExisting)) {
    const titledExisting = cleanExisting.replace(/(^|\s)\S/g, (m) => m.toUpperCase());
    return `${titledExisting} (Voz IA)`;
  }

  return 'Cliente Telefónico (Voz IA)';
};

// Valida y prioriza el teléfono real (Caller ID de Vapi o teléfono dictado válido)
const resolveValidVoicePhone = (callerIdPhone?: string | null, spokenPhone?: string | null, existingDbPhone?: string | null): string => {
  const isValidRealPhone = (p?: string | null) => {
    if (!p) return false;
    const digits = String(p).replace(/\D/g, '');
    if (digits.length < 7) return false;
    if (/^0+$/.test(digits) || digits.includes('0000000') || digits === '1234567890') return false;
    return true;
  };

  const formatCleanPhone = (raw: string) => {
    const trimmed = String(raw).trim();
    const digits = trimmed.replace(/\D/g, '');
    if (trimmed.startsWith('+')) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
  };

  if (isValidRealPhone(callerIdPhone)) return formatCleanPhone(callerIdPhone!);
  if (isValidRealPhone(spokenPhone)) return formatCleanPhone(spokenPhone!);
  if (isValidRealPhone(existingDbPhone)) return formatCleanPhone(existingDbPhone!);
  return '+10000000000';
};

// Normaliza correos hablados por voz ("cesar arroba gmail punto com" -> "cesar@gmail.com")
const normalizeSpokenEmail = (rawEmail?: string | null, cleanPhone10?: string): { email: string; isReal: boolean } => {
  if (rawEmail && typeof rawEmail === 'string') {
    const cleaned = rawEmail
      .toLowerCase()
      .replace(/\s+arroba\s+/g, '@')
      .replace(/\s+at\s+/g, '@')
      .replace(/\s+punto\s+/g, '.')
      .replace(/\s+dot\s+/g, '.')
      .replace(/\s+/g, '')
      .trim();

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) && !cleaned.endsWith('@autoflow.voice')) {
      return { email: cleaned, isReal: true };
    }
  }
  const fallback = `tel.${cleanPhone10 || Date.now()}@autoflow.voice`.toLowerCase();
  return { email: fallback, isReal: false };
};

// 🗓️ PARSER INTELIGENTE DE FECHA EN LENGUAJE NATURAL (ESPAÑOL E INGLÉS)
// Soporta: "mañana", "pasado mañana", "lunes", "viernes", "15 de noviembre", "november 15", "2026-11-15", "15/11/2026"
const normalizeVoiceDate = (rawDate?: string | null): string => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const dayAfterTomorrow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().split('T')[0];

  if (!rawDate) return tomorrowStr;
  const clean = String(rawDate)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Quita tildes para comparar fácil

  if (clean.includes('pasado manana') || clean.includes('day after tomorrow')) return dayAfterTomorrowStr;
  if (clean === 'hoy' || clean === 'today' || clean.includes('para hoy')) return todayStr;
  if (clean.includes('manana') || clean.includes('tomorrow')) return tomorrowStr;

  // 1. Si ya viene como YYYY-MM-DD
  const isoMatch = clean.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = isoMatch[2].padStart(2, '0');
    const dd = isoMatch[3].padStart(2, '0');
    const testDt = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
    if (!isNaN(testDt.getTime())) return `${yyyy}-${mm}-${dd}`;
  }

  // 2. Si dice un mes en español o inglés ("15 de noviembre", "noviembre 15", "nov 15")
  const monthsMap: Record<string, number> = {
    enero: 1, jan: 1, january: 1,
    febrero: 2, feb: 2, february: 2,
    marzo: 3, mar: 3, march: 3,
    abril: 4, apr: 4, april: 4,
    mayo: 5, may: 5,
    junio: 6, jun: 6, june: 6,
    julio: 7, jul: 7, july: 7,
    agosto: 8, aug: 8, august: 8,
    septiembre: 9, sep: 9, sept: 9, september: 9,
    octubre: 10, oct: 10, october: 10,
    noviembre: 11, nov: 11, november: 11,
    diciembre: 12, dic: 12, dec: 12, december: 12
  };

  for (const [mName, mNum] of Object.entries(monthsMap)) {
    const regex1 = new RegExp(`(\\d{1,2})\\s*(?:de\\s*)?${mName}(?:\\s*(?:de|del)?\\s*(\\d{4}))?`);
    const regex2 = new RegExp(`${mName}\\s*(\\d{1,2})(?:[,\\s]+(\\d{4}))?`);
    const m1 = clean.match(regex1);
    const m2 = clean.match(regex2);
    const matched = m1 || m2;
    if (matched) {
      const dayNum = parseInt(matched[1], 10);
      const yearNum = matched[2] ? parseInt(matched[2], 10) : now.getFullYear();
      if (dayNum >= 1 && dayNum <= 31) {
        return `${yearNum}-${String(mNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      }
    }
  }

  // 3. Si dice un día de la semana ("lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo")
  const weekdaysMap: Record<string, number> = {
    domingo: 0, sunday: 0,
    lunes: 1, monday: 1,
    martes: 2, tuesday: 2,
    miercoles: 3, wednesday: 3,
    jueves: 4, thursday: 4,
    viernes: 5, friday: 5,
    sabado: 6, saturday: 6
  };

  for (const [wName, targetDay] of Object.entries(weekdaysMap)) {
    if (clean.includes(wName)) {
      const currentDay = now.getDay();
      let daysAhead = (targetDay - currentDay + 7) % 7;
      if (daysAhead === 0) daysAhead = 7; // Próximo día de la semana
      const nextDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
      return nextDate.toISOString().split('T')[0];
    }
  }

  // 4. Si viene como DD/MM/YYYY o MM/DD/YYYY
  const slashMatch = clean.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    let yyyy = slashMatch[3] ? parseInt(slashMatch[3], 10) : now.getFullYear();
    if (yyyy < 100) yyyy += 2000;
    const mm = String(p1 > 12 ? p2 : p1).padStart(2, '0');
    const dd = String(p1 > 12 ? p1 : p2).padStart(2, '0');
    const testDt = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
    if (!isNaN(testDt.getTime())) return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(rawDate);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return tomorrowStr;
};

// 🕒 PARSER INTELIGENTE DE HORA EN LENGUAJE NATURAL ("2 de la tarde" -> "14:00", "10 de la mañana" -> "10:00", "3 y media" -> "15:30")
const normalizeVoiceTime = (rawTime?: string | null): string => {
  if (!rawTime) return '14:00';
  const clean = String(rawTime)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const isPM = clean.includes('pm') || clean.includes('p.m') || clean.includes('tarde') || clean.includes('noche');
  const isAM = clean.includes('am') || clean.includes('a.m') || clean.includes('manana') || clean.includes('madrugada');
  const hasHalf = clean.includes('y media') || clean.includes(':30') || clean.includes('treinta');

  // Extraer hora y minutos numéricos si existen
  const timeMatch = clean.match(/(\d{1,2})(?::(\d{2}))?/);
  if (timeMatch) {
    let hh = parseInt(timeMatch[1], 10);
    let mm = timeMatch[2] ? parseInt(timeMatch[2], 10) : (hasHalf ? 30 : 0);

    if (isPM && hh < 12) hh += 12;
    else if (isAM && hh === 12) hh = 0;
    else if (!isAM && !isPM && hh >= 1 && hh <= 7) hh += 12; // Horario comercial: "a las 2" = 14:00

    hh = Math.min(23, Math.max(0, hh));
    mm = Math.min(59, Math.max(0, mm));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // Números hablados en letras ("dos de la tarde", "diez de la manana")
  const wordHours: Record<string, number> = {
    una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12
  };
  for (const [word, hVal] of Object.entries(wordHours)) {
    if (clean.includes(word)) {
      let hh = hVal;
      if (isPM && hh < 12) hh += 12;
      else if (!isAM && hh >= 1 && hh <= 7) hh += 12;
      const mm = hasHalf ? '30' : '00';
      return `${String(hh).padStart(2, '0')}:${mm}`;
    }
  }

  return '14:00';
};

// Genera una tabla de los próximos 10 días con su nombre de día y fecha para que la IA traduzca sola sin preguntar formatos
const buildNaturalCalendarReferenceForPrompt = (): string => {
  const daysEs = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const monthsEs = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const now = new Date();
  const lines: string[] = [];

  for (let i = 0; i < 10; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const iso = d.toISOString().split('T')[0];
    const dayName = daysEs[d.getDay()];
    const dayNum = d.getDate();
    const monthName = monthsEs[d.getMonth()];
    const prefix = i === 0 ? 'HOY' : i === 1 ? 'MAÑANA' : i === 2 ? 'PASADO MAÑANA' : `El ${dayName}`;
    lines.push(`- ${prefix} (${dayName} ${dayNum} de ${monthName}) = ${iso}`);
  }
  return lines.join('\n');
};

// Resuelve de forma segura el tenantId aunque Vapi no envíe query params o el ID por defecto no exista
const resolveValidTenantIdForWebhook = async (candidateTenantId?: string | null, assistantId?: string | null): Promise<string> => {
  try {
    const allTenants = await db.select().from(tenants);
    if (allTenants.length === 0) return candidateTenantId || '123e4567-e89b-12d3-a456-426614174000';

    if (candidateTenantId) {
      const exact = allTenants.find((t) => t.id === candidateTenantId);
      if (exact) return exact.id;
    }

    if (assistantId) {
      const byAssistant = allTenants.find((t) => {
        const lConf = safeParseJSON((t as any).loyaltyConfig);
        return lConf?.vapiConfig?.assistantId === assistantId;
      });
      if (byAssistant) return byAssistant.id;
    }

    const activeVapiTenant = allTenants.find((t) => {
      const lConf = safeParseJSON((t as any).loyaltyConfig);
      return lConf?.vapiConfig?.isActive === true;
    });
    if (activeVapiTenant) return activeVapiTenant.id;

    return allTenants[0].id;
  } catch (e) {
    return candidateTenantId || '123e4567-e89b-12d3-a456-426614174000';
  }
};

// =========================================================================
// ⚡ AUTOCONFIGURADOR 1-CLIC DE RECEPCIONISTA IA EN VAPI.AI (MODELO BYOK)
// - Payload 100% compatible con Vapi (sin propiedades rechazadas por DTO)
// - Pide Nombre, Correo, Motivo y Día/Hora en lenguaje natural (sin contraparte ni formatos especiales)
// - Envía notificación de activación a todos los Bots de Telegram configurados
// =========================================================================
export async function configureTenantVapiAssistant(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(400).json({ success: false, message: 'Falta x-tenant-id en los headers.' });

    const { vapiConfig, businessName, niche, services: servicesListInput, staff: staffListInput } = req.body || {};
    const apiKeyClean = String(vapiConfig?.privateApiKey || '').trim();

    if (!apiKeyClean && !vapiConfig?.phoneNumber?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Por favor pega tu Private Key de Vapi (la primera clave de arriba en "Claves API").'
      });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) return res.status(404).json({ success: false, message: 'Negocio no encontrado.' });

    const currentNiche = String(niche || (tenant as any).niche || 'automotive').toLowerCase();
    const bizTitle = businessName || tenant.name || 'AutoFlow';
    const staffSummary = Array.isArray(staffListInput) && staffListInput.length > 0
      ? staffListInput.map((s: any) => `${s.name} (${s.role || 'Profesional'})`).join(', ')
      : 'Equipo profesional disponible';
    const servicesSummary = Array.isArray(servicesListInput) && servicesListInput.length > 0
      ? servicesListInput.map((s: any) => `${s.name} ($${s.price})`).join(', ')
      : 'Consulta general';

    const calendarCheatSheet = buildNaturalCalendarReferenceForPrompt();

    const roleInstruction = currentNiche === 'legal'
      ? `Eres la recepcionista legal bilingüe (Español e Inglés) del bufete de abogados "${bizTitle}". Conversa de forma cálida, breve y humana. Pregunta: 1) Nombre y apellido del cliente, 2) Correo electrónico para enviarle la confirmación de su cita, 3) Área o motivo de su consulta (Inmigración, Familia, Laboral, Civil, Penal o Contratos), y 4) Qué día y a qué hora le gustaría su cita y si la prefiere Presencial, por Llamada Telefónica o Videollamada.`
      : currentNiche === 'dental'
        ? `Eres la recepcionista virtual bilingüe (Español e Inglés) de la clínica odontológica "${bizTitle}". Conversa de forma cálida y humana. Pregunta: 1) Nombre y apellido del paciente, 2) Correo electrónico para enviarle la confirmación, 3) Motivo de su consulta (Limpieza, Dolor o Urgencia dental, Ortodoncia, Implantes o Valoración), y 4) Qué día y a qué hora le queda bien.`
        : `Eres la recepcionista virtual bilingüe (Español e Inglés) de "${bizTitle}". Conversa de forma cálida y humana. Pregunta: 1) Nombre y apellido del cliente, 2) Correo electrónico para enviarle la confirmación, 3) Servicio que desea, y 4) Qué día y a qué hora le gustaría venir.`;

    const systemPrompt = `${roleInstruction}

CALENDARIO DE REFERENCIA AUTOMÁTICO (Usa esta guía para traducir días hablados a fecha):
${calendarCheatSheet}

Profesionales activos en el equipo: ${staffSummary}.
Catálogo de servicios y tarifas: ${servicesSummary}.
Horario de atención: Lunes a Sábado de 9:00 AM a 5:00 PM.

REGLAS DE CONVERSACIÓN NATURAL:
1. PROHIBIDO pedirle al cliente que diga la fecha o la hora en un formato especial. NUNCA menciones palabras como "formato año-mes-día", "YYYY-MM-DD", "formato de 24 horas" ni "HH:mm".
2. Deja que el cliente diga el día y la hora con sus propias palabras (por ejemplo: "mañana a las 2 de la tarde", "el viernes a las 10 de la mañana", "el 19 de noviembre a las 4"). Tú lo conviertes silenciosamente usando el Calendario de Referencia.
3. NO preguntes por nombre de contraparte ni datos innecesarios.
4. Si el cliente habla en inglés, respóndele en inglés fluido. Si habla en español, respóndele en español.
5. Apenas el cliente te confirme su nombre, correo electrónico, motivo/servicio, día y hora, invoca INMEDIATAMENTE la función "book_appointment" UNA SOLA VEZ para guardar la cita en la base de datos.`;

    const rawWebhookBase = String(
      vapiConfig?.webhookBaseUrl?.trim() ||
      process.env.PUBLIC_API_URL ||
      process.env.EXPO_PUBLIC_API_URL ||
      'http://localhost:4000'
    ).replace(/\/+$/, '');

    if (rawWebhookBase.includes('xxxx')) {
      return res.status(400).json({
        success: false,
        message: '⚠️ Tu URL de túnel todavía dice "https://xxxx.lhr.life". Pega la URL real de tu terminal (ej. https://6aeb640668651b.lhr.life) en la casilla "URL Pública del Túnel HTTPS".'
      });
    }

    const webhookUrl = `${rawWebhookBase}/api/vapi/webhook?tenantId=${tenantId}`;
    const isHttpsWebhook = webhookUrl.startsWith('https://');

    if (!isHttpsWebhook) {
      return res.status(400).json({
        success: false,
        message: `⚠️ Vapi requiere una URL pública con HTTPS para agendar citas y tu URL actual es "${rawWebhookBase}". Pega tu link https://....lhr.life en la casilla "URL Pública del Túnel HTTPS".`
      });
    }

    const oldAssistantId = vapiConfig?.assistantId || '';
    let remoteAssistantId = '';
    let detectedPhoneNumber = vapiConfig?.phoneNumber?.trim() || '';
    let detectedPhoneNumberId = vapiConfig?.phoneNumberId || '';
    let vapiApiMessage = '✅ Configuración guardada.';

    if (apiKeyClean.length >= 10) {
      const toolsArray = [
        {
          type: 'function',
          function: {
            name: 'check_availability',
            description: 'Consulta los horarios disponibles para una fecha o día.',
            parameters: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'Fecha en YYYY-MM-DD o día solicitado' }
              },
              required: ['date']
            }
          },
          server: { url: webhookUrl }
        },
        {
          type: 'function',
          function: {
            name: 'book_appointment',
            description: 'Guarda la cita del cliente en la base de datos y envía la notificación a Telegram.',
            parameters: {
              type: 'object',
              properties: {
                clientName: { type: 'string', description: 'Nombre y apellido real del cliente' },
                clientEmail: { type: 'string', description: 'Correo electrónico del cliente' },
                clientPhone: { type: 'string', description: 'Teléfono del cliente (opcional)' },
                appointmentDate: { type: 'string', description: 'Fecha acordada en YYYY-MM-DD o día hablado (ej. mañana, viernes)' },
                appointmentTime: { type: 'string', description: 'Hora acordada en HH:mm 24h (ej. 14:00) o hablada (ej. 2:00 PM)' },
                serviceName: { type: 'string', description: 'Nombre del servicio o tipo de consulta' },
                staffName: { type: 'string', description: 'Nombre del profesional asignado' },
                modality: { type: 'string', description: 'in_person, phone_call o video_call' },
                caseType: { type: 'string', description: 'Motivo breve de la consulta o área del caso' },
                language: { type: 'string', description: 'es o en' }
              },
              required: ['clientName', 'appointmentDate', 'appointmentTime']
            }
          },
          server: { url: webhookUrl }
        }
      ];

      // Payload limpio con las propiedades exactas soportadas por Vapi DTO
      const vapiPayload: any = {
        name: `AutoFlow - ${bizTitle}`.slice(0, 40),
        firstMessage: vapiConfig?.languageMode === 'en'
          ? `Hello! Thank you for calling ${bizTitle}. Who do I have the pleasure of speaking with, and how can I help you schedule your appointment today?`
          : `¡Hola! Gracias por comunicarte con ${bizTitle}. ¿Con quién tengo el gusto de hablar y en qué te puedo colaborar hoy con tu cita?`,
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'multi'
        },
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }],
          tools: toolsArray
        },
        serverMessages: ['tool-calls', 'function-call', 'end-of-call-report'],
        artifactPlan: {
          recordingEnabled: true,
          transcriptPlan: { enabled: true }
        },
        serverUrl: webhookUrl,
        ...(vapiConfig?.transferPhone?.trim() ? { forwardingPhoneNumber: vapiConfig.transferPhone.trim() } : {})
      };

      // PASO A: Crear un Agente NUEVO en Vapi para garantizar que el webhookUrl nuevo quede activo sin caché viejo
      let vapiRes = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeyClean}`
        },
        body: JSON.stringify(vapiPayload)
      });

      if (vapiRes.status === 401 || vapiRes.status === 403) {
        return res.status(400).json({
          success: false,
          message: '⚠️ Clave rechazada por Vapi. Asegúrate de copiar la "Private Key" (la de arriba con punticos •••••• en Claves API) y NO la "Public Key" de abajo.'
        });
      }

      if (!vapiRes.ok) {
        const errTxt = await vapiRes.text();
        console.error('❌ Error de Vapi creando asistente:', errTxt);
        return res.status(400).json({
          success: false,
          message: `⚠️ Vapi rechazó la configuración (${vapiRes.status}): ${errTxt}`
        });
      }

      const vapiData = await vapiRes.json();
      remoteAssistantId = vapiData.id;

      // Eliminar el asistente anterior en segundo plano para no acumular agentes viejos en Vapi
      if (oldAssistantId && !oldAssistantId.startsWith('vapi-ast-') && oldAssistantId !== remoteAssistantId) {
        fetch(`https://api.vapi.ai/assistant/${oldAssistantId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${apiKeyClean}` }
        }).catch(() => {});
      }

      // PASO B: Vincular el Número de Teléfono en Vapi con el Nuevo Agente creado
      if (remoteAssistantId) {
        try {
          const phonesRes = await fetch('https://api.vapi.ai/phone-number', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKeyClean}` }
          });

          if (phonesRes.ok) {
            const phonesList = await phonesRes.json();
            if (Array.isArray(phonesList) && phonesList.length > 0) {
              const cleanInputDigits = extractCleanPhone(detectedPhoneNumber);
              const matchedPhone = (cleanInputDigits.length >= 7
                ? phonesList.find((p: any) => extractCleanPhone(p.number || '').includes(cleanInputDigits))
                : null) || phonesList[0];

              if (matchedPhone?.id) {
                detectedPhoneNumberId = matchedPhone.id;
                detectedPhoneNumber = matchedPhone.number || detectedPhoneNumber;

                const phonePatchRes = await fetch(`https://api.vapi.ai/phone-number/${matchedPhone.id}`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKeyClean}`
                  },
                  body: JSON.stringify({
                    assistantId: remoteAssistantId,
                    serverUrl: webhookUrl,
                    name: `Línea AutoFlow - ${bizTitle}`.slice(0, 40)
                  })
                });
                if (!phonePatchRes.ok) {
                  console.warn('⚠️ Aviso PATCH phone-number Vapi:', await phonePatchRes.text());
                }

                vapiApiMessage = `🤖 ¡Agente Virtual IA Activado con Éxito!\n🆔 Nuevo ID: ${remoteAssistantId}\n📞 Línea enlazada: ${detectedPhoneNumber}\n🌐 Webhook activo: ${rawWebhookBase}`;
              }
            }
          }
        } catch (phoneErr) {
          console.warn('⚠️ Aviso vinculando número en Vapi:', phoneErr);
        }
      }
    }

    // 🩺 AUTO-VERIFICACIÓN EN VIVO DEL TÚNEL HTTPS (Compruebe que internet llega hasta este backend)
    let tunnelVerified = false;
    let tunnelPingError = '';
    try {
      const pingController = new AbortController();
      const pingTimeout = setTimeout(() => pingController.abort(), 6000);
      const pingRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ healthcheck: true, tenantId }),
        signal: pingController.signal
      });
      clearTimeout(pingTimeout);
      if (pingRes.ok) {
        const pingJson = await pingRes.json().catch(() => ({}));
        if (pingJson?.ok) {
          tunnelVerified = true;
        } else {
          tunnelPingError = `Respuesta inesperada del túnel (HTTP ${pingRes.status})`;
        }
      } else {
        tunnelPingError = `El túnel devolvió HTTP ${pingRes.status} (verifica que localhost.run siga abierto en tu terminal)`;
      }
    } catch (pingErr: any) {
      tunnelPingError = pingErr?.message || 'No se pudo conectar al túnel HTTPS desde internet';
    }

    if (!tunnelVerified) {
      await sendTelegramNotification(`
🚨 <b>¡ALERTA DE CONEXIÓN EN RECEPCIÓN IA!</b> 🚨
🏢 <b>Negocio:</b> ${bizTitle}
🌐 <b>Túnel probado:</b> ${rawWebhookBase}
❌ <b>Problema detectado:</b> ${tunnelPingError}
💡 <i>Vapi creó el agente (${remoteAssistantId}), pero el túnel HTTPS no respondió a la prueba de conexión. Verifica tu terminal de localhost.run.</i>
      `, tenantId, 'system');

      return res.status(400).json({
        success: false,
        message: `⚠️ El Agente se creó en Vapi (${remoteAssistantId}), pero tu túnel HTTPS (${rawWebhookBase}) NO respondió a la prueba de conexión (${tunnelPingError}). Revisa que el túnel esté activo en tu terminal y vuelve a pulsar el botón.`
      });
    }

    const existingLoyalty = safeParseJSON((tenant as any).loyaltyConfig);
    const updatedVapiConfig = {
      ...vapiConfig,
      webhookBaseUrl: rawWebhookBase,
      phoneNumber: detectedPhoneNumber || vapiConfig?.phoneNumber || 'Línea IA Configurada',
      phoneNumberId: detectedPhoneNumberId,
      privateApiKey: apiKeyClean,
      isActive: true,
      assistantId: remoteAssistantId || `vapi-ast-${tenantId.slice(0, 8)}`,
      lastSyncedAt: new Date().toISOString()
    };

    const updatedLoyalty = {
      ...existingLoyalty,
      vapiConfig: updatedVapiConfig
    };

    await db.update(tenants)
      .set({ loyaltyConfig: updatedLoyalty } as any)
      .where(eq(tenants.id, tenantId));

    // 🔔 DISPARAR SIEMPRE LA NOTIFICACIÓN DE ACTIVACIÓN DEL AGENTE VIRTUAL A TELEGRAM
    await sendTelegramNotification(`
🤖 <b>¡AGENTE VIRTUAL IA ACTIVADO Y SINCRONIZADO!</b> 🚀
🏢 <b>Negocio:</b> ${bizTitle}
📞 <b>Línea IA:</b> ${updatedVapiConfig.phoneNumber}
🆔 <b>Agente Vapi ID:</b> ${updatedVapiConfig.assistantId}
🌐 <b>Túnel / Webhook:</b> ${rawWebhookBase}
🌎 <b>Idioma:</b> ${String(updatedVapiConfig.languageMode || 'bilingual').toUpperCase()}
✅ <i>Conversación 100% natural activada y apuntando al túnel actual.</i>
    `, tenantId, 'system');

    return res.status(200).json({
      success: true,
      message: vapiApiMessage,
      vapiConfig: updatedVapiConfig
    });
  } catch (error: any) {
    console.error('Error configurando Vapi Assistant:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

// =========================================================================
// 💾 HELPER INTERNO PARA GUARDAR O ACTUALIZAR CLIENTE + CITA DE VOZ IA EN BD
// =========================================================================
const upsertVoiceClientAndAppointment = async (params: {
  tenantId: string;
  rawClientName?: string;
  rawClientEmail?: string;
  callerIdPhone?: string;
  spokenPhone?: string;
  rawDate?: string;
  rawTime?: string;
  serviceId?: string;
  serviceName?: string;
  staffId?: string | null;
  staffName?: string | null;
  modality?: string;
  caseType?: string;
  callLanguage?: string;
  callSummary?: string;
  recordingUrl?: string;
  callTranscript?: string;
  callId?: string;
  sendTelegram?: boolean;
}) => {
  const {
    tenantId,
    rawClientName,
    rawClientEmail,
    callerIdPhone,
    spokenPhone,
    rawDate,
    rawTime,
    serviceId,
    serviceName,
    staffId,
    staffName,
    modality: rawModality,
    caseType: rawCaseType,
    callLanguage = 'es',
    callSummary: rawCallSummary,
    recordingUrl = '',
    callTranscript = '',
    callId = '',
    sendTelegram = true
  } = params;

  // 1. Validar Teléfono real (Caller ID o dictado)
  const validatedPhone = resolveValidVoicePhone(callerIdPhone, spokenPhone);
  const cleanPhone10 = extractCleanPhone(validatedPhone);

  // 2. Validar Correo Electrónico
  const { email: normalizedEmail, isReal: isRealEmail } = normalizeSpokenEmail(rawClientEmail, cleanPhone10);

  // 3. Buscar si el cliente ya existe en este negocio (por correo o por los 10 dígitos del teléfono)
  let existingUserByEmail: any = null;
  let existingUserByPhone: any = null;

  const [foundByEmail] = await db.select().from(users).where(
    and(eq(users.tenantId, tenantId), eq(users.email, normalizedEmail))
  );
  if (foundByEmail) existingUserByEmail = foundByEmail;

  if (cleanPhone10.length >= 7 && cleanPhone10 !== '0000000000') {
    const [foundByPhone] = await db.select().from(users).where(
      and(
        eq(users.tenantId, tenantId),
        sql`regexp_replace(${users.phone}, '[^0-9]', '', 'g') LIKE ${'%' + cleanPhone10 + '%'}`
      )
    );
    if (foundByPhone) existingUserByPhone = foundByPhone;
  }

  let targetUser = existingUserByEmail || existingUserByPhone || null;

  // 4. Formatear el Nombre agregando siempre "(Voz IA)"
  const finalClientName = formatVoiceAiClientName(rawClientName, targetUser?.name);
  const finalClientPhone = resolveValidVoicePhone(callerIdPhone, spokenPhone, targetUser?.phone);

  if (!targetUser) {
    try {
      const [insertedUser] = await db.insert(users).values({
        tenantId,
        name: finalClientName,
        email: normalizedEmail,
        phone: finalClientPhone,
        role: 'client'
      }).returning();
      targetUser = insertedUser;
    } catch (userInsertErr) {
      // Si hubo colisión concurrente por índice único (tenantId, email), recuperamos el usuario existente
      const [retryUser] = await db.select().from(users).where(
        and(eq(users.tenantId, tenantId), eq(users.email, normalizedEmail))
      );
      if (retryUser) {
        targetUser = retryUser;
      } else {
        throw userInsertErr;
      }
    }
  } else {
    let emailToUpdate = targetUser.email;
    if (isRealEmail && normalizedEmail !== targetUser.email) {
      if (!existingUserByEmail || existingUserByEmail.id === targetUser.id) {
        emailToUpdate = normalizedEmail;
      }
    }

    const [updatedUser] = await db.update(users)
      .set({
        name: finalClientName,
        phone: finalClientPhone,
        email: emailToUpdate
      })
      .where(eq(users.id, targetUser.id))
      .returning();
    targetUser = updatedUser;
  }

  // 5. Resolver Servicio del Catálogo
  const tenantServices = await db.select().from(services).where(eq(services.tenantId, tenantId));
  let resolvedServiceId = serviceId || '';
  let resolvedServiceName = serviceName || rawCaseType || 'Consulta Inicial';

  if (resolvedServiceId) {
    const foundSrv = tenantServices.find((s) => s.id === resolvedServiceId);
    if (foundSrv) resolvedServiceName = foundSrv.name;
    else resolvedServiceId = '';
  }

  if (!resolvedServiceId && tenantServices.length > 0) {
    const searchTerm = String(serviceName || rawCaseType || '').toLowerCase().trim();
    const matchedByName = (searchTerm
      ? tenantServices.find((s) => s.name.toLowerCase().includes(searchTerm) || searchTerm.includes(s.name.toLowerCase()))
      : null) || tenantServices[0];
    resolvedServiceId = matchedByName.id;
    resolvedServiceName = matchedByName.name;
  }

  if (!resolvedServiceId) {
    const [createdSrv] = await db.insert(services).values({
      tenantId,
      name: resolvedServiceName,
      description: 'Consulta agendada por Recepcionista IA',
      price: '50.00',
      durationMinutes: 30,
      isActive: true
    } as any).returning();
    resolvedServiceId = createdSrv.id;
  }

  // 6. Normalizar Fecha y Hora (Acepta "mañana", "viernes", "2 de la tarde", etc.)
  let datePart = normalizeVoiceDate(rawDate);
  let timePart = normalizeVoiceTime(rawTime);
  let parsedDate = parseWallClockAppointmentDate(`${datePart}T${timePart}:00.000Z`, datePart, timePart);
  if (isNaN(parsedDate.getTime())) {
    datePart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    timePart = '14:00';
    parsedDate = new Date(`${datePart}T${timePart}:00.000Z`);
  }
  const safeDbStaffId = await resolveSafeUserStaffId(staffId);

  const cleanModality = String(rawModality || '').toLowerCase();
  const modality: 'in_person' | 'phone_call' | 'video_call' =
    cleanModality.includes('presencial') || cleanModality === 'in_person'
      ? 'in_person'
      : cleanModality.includes('video') || cleanModality === 'video_call'
        ? 'video_call'
        : 'phone_call';

  const caseType = String(rawCaseType || '').trim();
  const callSummary =
    rawCallSummary ||
    `Cita agendada por Recepcionista IA (${callLanguage.toUpperCase()})${caseType ? ` — Motivo: ${caseType}` : ''}`;

  // 7. Evitar duplicados filtrando en memoria para no chocar con enums de status en PostgreSQL
  const rawClientApts = await db.select().from(appointments).where(
    and(
      eq(appointments.tenantId, tenantId),
      eq(appointments.clientId, targetUser.id)
    )
  );
  const clientApts = rawClientApts.filter((a) => a.status !== 'cancelled');

  const existingSameApt = clientApts.find((a) => {
    const m = safeParseJSON(a.mediaAndReports);
    if (callId && m?.vapiCallId === callId) return true;
    return a.scheduledAt.getTime() === parsedDate.getTime();
  });

  const mediaPayload = {
    bookedVia: 'vapi_voice_ai',
    vapiCallId: callId || undefined,
    callLanguage,
    clientPhone: finalClientPhone,
    clientEmail: targetUser.email,
    localDate: datePart,
    localTime: timePart,
    modality,
    caseType,
    callSummary,
    attendanceConfirmed: true,
    recordingUrl: recordingUrl || undefined,
    callTranscript: callTranscript || undefined,
    assignedStaffId: staffId || null,
    assignedStaffName: staffName || null
  };

  let apt: any = null;
  if (existingSameApt) {
    const prevMeta = safeParseJSON(existingSameApt.mediaAndReports);
    const [updatedApt] = await db.update(appointments)
      .set({
        serviceId: resolvedServiceId,
        staffNotes: callSummary,
        mediaAndReports: { ...prevMeta, ...mediaPayload }
      })
      .where(eq(appointments.id, existingSameApt.id))
      .returning();
    apt = updatedApt;
  } else {
    // Usamos status: 'scheduled' (idéntico a createAppointment) para garantizar compatibilidad con el ENUM de PostgreSQL
    const [insertedApt] = await db.insert(appointments).values({
      tenantId,
      clientId: targetUser.id,
      staffId: safeDbStaffId,
      serviceId: resolvedServiceId,
      scheduledAt: parsedDate,
      status: 'scheduled',
      staffNotes: callSummary,
      mediaAndReports: mediaPayload,
      estimatedCost: '0.00',
      finalCost: '0.00'
    }).returning();
    apt = insertedApt;
  }

  if (sendTelegram && !existingSameApt) {
    const modalityLabel =
      modality === 'phone_call'
        ? '📞 Llamada Telefónica'
        : modality === 'video_call'
          ? '💻 Videollamada'
          : '📍 Presencial en Oficina/Consultorio';
    const formattedDateStr = formatWallClockForNotification(parsedDate, mediaPayload);
    const gcalLink = buildTelegramGoogleCalendarLink(
      parsedDate,
      `[Voz IA] ${resolvedServiceName} - ${finalClientName}`,
      `Cliente: ${finalClientName}\nTeléfono: ${finalClientPhone}\nCorreo: ${targetUser.email}\nModalidad: ${modalityLabel}\nMotivo: ${caseType || resolvedServiceName}\nResumen IA: ${callSummary}`
    );

    const displayEmail = targetUser.email.endsWith('@autoflow.voice') ? 'No indicado en llamada' : targetUser.email;

    const telegramMsg = `
📞 <b>¡NUEVA CITA AGENDADA POR RECEPCIONISTA IA (${callLanguage.toUpperCase()})!</b> 🤖
👤 <b>Cliente/Paciente:</b> ${finalClientName}
📞 <b>Teléfono:</b> ${finalClientPhone}
📧 <b>Correo:</b> ${displayEmail}
🗓️ <b>Fecha y Hora:</b> ${formattedDateStr}
📍 <b>Modalidad:</b> ${modalityLabel}
🛠️ <b>Servicio:</b> ${resolvedServiceName}
${caseType ? `📌 <b>Motivo:</b> ${caseType}\n` : ''}💬 <b>Resumen IA:</b> <i>"${callSummary}"</i>
📅 <a href="${gcalLink}"><b>+ Agregar a Google Calendar en 1 Clic</b></a>
    `;
    await Promise.allSettled([
      sendTelegramNotification(telegramMsg, tenantId, 'appointment'),
      notifyTenantPush(tenantId, {
        title: `📞 Nueva Cita por Voz IA: ${finalClientName}`,
        body: `${resolvedServiceName} • ${formattedDateStr}`,
        data: { tenantId, appointmentId: apt.id, staffId: safeDbStaffId || staffId || null, view: 'mecanico' },
      }, safeDbStaffId || staffId || null),
    ]);
  }

  return {
    apt,
    user: targetUser,
    finalClientName,
    finalClientPhone,
    datePart,
    timePart,
    resolvedServiceName
  };
};

// =========================================================================
// 📞 WEBHOOK BILINGÜE (ES/EN) DE VAPI.AI + LOGS EN TERMINAL
// =========================================================================
export async function handleVapiVoiceWebhook(req: Request, res: Response) {
  let resolvedTenantIdForAlert: string | null = null;
  try {
    const body = req.body || {};

    // Respuesta inmediata para auto-verificación de conectividad del túnel
    if (body.healthcheck === true) {
      return res.status(200).json({ ok: true, reachable: true, timestamp: new Date().toISOString() });
    }

    const isFromVapiServer = Boolean(body.message);
    const vapiMessage = body.message || {};
    const messageType = String(vapiMessage.type || (body.simulated ? 'direct_voice_booking' : ''));
    const callId = String(vapiMessage.call?.id || body.callId || '');

    console.log(`📞 [VAPI WEBHOOK] Evento recibido: "${messageType}" | CallID: ${callId}`);

    const rawCandidateTenantId =
      (req.query.tenantId as string) ||
      (req.headers['x-tenant-id'] as string) ||
      vapiMessage.call?.assistant?.metadata?.tenantId ||
      vapiMessage.assistant?.metadata?.tenantId ||
      null;
    const incomingAssistantId = vapiMessage.call?.assistantId || vapiMessage.assistant?.id || null;
    const tenantId = await resolveValidTenantIdForWebhook(rawCandidateTenantId, incomingAssistantId);
    resolvedTenantIdForAlert = tenantId;

    const callerIdNumber =
      vapiMessage.call?.customer?.number ||
      body.call?.customer?.number ||
      vapiMessage.customer?.number ||
      '';

    // =========================================================================
    // A) REPORTE DE FIN DE LLAMADA ("end-of-call-report")
    // =========================================================================
    if (messageType === 'end-of-call-report') {
      const recordingUrl =
        vapiMessage.recordingUrl ||
        vapiMessage.artifact?.recordingUrl ||
        vapiMessage.artifact?.stereoRecordingUrl ||
        vapiMessage.call?.recordingUrl ||
        '';
      const summary =
        vapiMessage.summary ||
        vapiMessage.analysis?.summary ||
        '';
      const transcript =
        vapiMessage.transcript ||
        vapiMessage.artifact?.transcript ||
        '';
      const structured = safeParseJSON(vapiMessage.analysis?.structuredData);

      const cleanCaller10 = extractCleanPhone(callerIdNumber || structured?.clientPhone || '');
      let existingApt: any = null;
      let matchedClient: any = null;

      const allTenantApts = await db.select().from(appointments).where(eq(appointments.tenantId, tenantId));
      if (callId) {
        existingApt = allTenantApts.find((a) => safeParseJSON(a.mediaAndReports)?.vapiCallId === callId) || null;
      }

      if (!existingApt && cleanCaller10.length >= 7) {
        const [clientByPhone] = await db.select().from(users).where(
          and(
            eq(users.tenantId, tenantId),
            sql`regexp_replace(${users.phone}, '[^0-9]', '', 'g') LIKE ${'%' + cleanCaller10 + '%'}`
          )
        );
        if (clientByPhone) {
          matchedClient = clientByPhone;
          const clientApts = allTenantApts
            .filter((a) => a.clientId === clientByPhone.id && a.status !== 'cancelled')
            .sort((a, b) => new Date(b.createdAt || b.scheduledAt).getTime() - new Date(a.createdAt || a.scheduledAt).getTime());
          existingApt = clientApts[0] || null;
        }
      }

      if (existingApt) {
        if (!matchedClient) {
          const [foundCli] = await db.select().from(users).where(eq(users.id, existingApt.clientId));
          matchedClient = foundCli;
        }
        const meta = safeParseJSON(existingApt.mediaAndReports);
        await db.update(appointments)
          .set({
            staffNotes: summary || transcript || existingApt.staffNotes,
            mediaAndReports: {
              ...meta,
              vapiCallId: callId || meta.vapiCallId,
              recordingUrl: recordingUrl || meta.recordingUrl,
              callSummary: summary || meta.callSummary,
              callTranscript: transcript || meta.callTranscript
            }
          })
          .where(eq(appointments.id, existingApt.id));
      }

      const lowerTranscript = `${summary} ${transcript}`.toLowerCase();
      const hadTechnicalProblemInCall =
        !existingApt &&
        (lowerTranscript.includes('problema técnico') ||
          lowerTranscript.includes('problema tecnico') ||
          lowerTranscript.includes('technical problem') ||
          lowerTranscript.includes('no pude agendar') ||
          lowerTranscript.includes('error'));

      if (hadTechnicalProblemInCall) {
        const displayPhone = resolveValidVoicePhone(callerIdNumber, structured?.clientPhone);
        await sendTelegramNotification(`
🚨 <b>¡ALERTA: PROBLEMA TÉCNICO EN LLAMADA DE VOZ IA!</b> 🚨
📞 <b>Teléfono del llamante:</b> ${displayPhone}
🆔 <b>Call ID:</b> ${callId || 'N/A'}
⚠️ <b>Estado:</b> La llamada terminó sin registrar la cita en la base de datos.
${summary ? `📝 <b>Resumen de la conversación:</b> <i>"${summary}"</i>\n` : ''}${transcript ? `💬 <b>Transcripción:</b> <i>"${String(transcript).slice(0, 400)}"</i>\n` : ''}${recordingUrl ? `🎧 <a href="${recordingUrl}"><b>▶️ Escuchar Audio de la Llamada</b></a>` : ''}
        `, tenantId, 'system');
      } else if (recordingUrl || summary) {
        const displayPhone = matchedClient?.phone || resolveValidVoicePhone(callerIdNumber, structured?.clientPhone);
        const displayName = matchedClient?.name || formatVoiceAiClientName(structured?.clientName);
        const displayEmail =
          matchedClient?.email && !String(matchedClient.email).endsWith('@autoflow.voice')
            ? matchedClient.email
            : structured?.clientEmail || '';

        const tgRecordingMsg = `
🎙️ <b>¡GRABACIÓN Y RESUMEN DE LLAMADA IA!</b> 🎙️
👤 <b>Cliente:</b> ${displayName}
📞 <b>Teléfono:</b> ${displayPhone}
${displayEmail ? `📧 <b>Correo:</b> ${displayEmail}\n` : ''}${summary ? `📝 <b>Resumen IA:</b> <i>"${summary}"</i>\n` : ''}${transcript ? `💬 <b>Transcripción:</b> <i>"${String(transcript).slice(0, 280)}${String(transcript).length > 280 ? '...' : ''}"</i>\n` : ''}${recordingUrl ? `🎧 <a href="${recordingUrl}"><b>▶️ Escuchar Grabación de la Llamada (Audio)</b></a>` : ''}
        `;
        await sendTelegramNotification(tgRecordingMsg, tenantId, 'recording');
      }

      return res.status(200).json({ success: true, updatedAppointmentId: existingApt?.id || null });
    }

    // =========================================================================
    // 🔒 BLOQUEO ANTI-SPAM: IGNORAR EVENTOS INTERMEDIOS DE VAPI
    // =========================================================================
    if (
      isFromVapiServer &&
      messageType !== 'tool-calls' &&
      messageType !== 'function-call' &&
      !body.simulated
    ) {
      return res.status(200).json({ ok: true, ignoredEvent: messageType });
    }

    const rawToolCallsList: any[] =
      (Array.isArray(vapiMessage.toolCalls) && vapiMessage.toolCalls.length > 0 ? vapiMessage.toolCalls : null) ||
      (Array.isArray(vapiMessage.toolCallList) && vapiMessage.toolCallList.length > 0 ? vapiMessage.toolCallList : null) ||
      (Array.isArray(vapiMessage.toolWithToolCallList) && vapiMessage.toolWithToolCallList.length > 0
        ? vapiMessage.toolWithToolCallList.map((item: any) => item.toolCall || item)
        : null) ||
      (vapiMessage.functionCall
        ? [{ id: 'fn-call', function: { name: vapiMessage.functionCall.name, arguments: vapiMessage.functionCall.parameters } }]
        : []);

    if (isFromVapiServer && rawToolCallsList.length === 0 && !body.simulated) {
      return res.status(200).json({ ok: true, ignored: 'no_tool_call' });
    }

    // Si es una llamada directa del simulador en el frontend
    if (body.simulated || (!isFromVapiServer && rawToolCallsList.length === 0)) {
      const simRes = await upsertVoiceClientAndAppointment({
        tenantId,
        rawClientName: body.clientName,
        rawClientEmail: body.clientEmail,
        callerIdPhone: body.clientPhone,
        spokenPhone: body.clientPhone,
        rawDate: body.appointmentDate,
        rawTime: body.appointmentTime,
        serviceId: body.serviceId,
        serviceName: body.serviceName,
        staffId: body.staffId,
        staffName: body.staffName,
        modality: body.modality,
        caseType: body.caseType,
        callLanguage: body.language || 'es',
        callSummary: body.callSummary,
        recordingUrl: body.recordingUrl,
        callId: `sim-${Date.now()}`,
        sendTelegram: true
      });

      const confirmText = `Cita confirmada para ${simRes.finalClientName} el día ${simRes.datePart} a las ${simRes.timePart} para ${simRes.resolvedServiceName}.`;
      return res.status(200).json({
        success: true,
        message: confirmText,
        appointment: simRes.apt
      });
    }

    const results: { name: string; toolCallId: string; result: string }[] = [];

    for (const tc of rawToolCallsList) {
      const tcId = String(tc?.id || tc?.toolCallId || 'tool-call-1');
      const fnName = String(tc?.function?.name || tc?.name || 'book_appointment');
      const fnArgs = safeParseJSON(tc?.function?.arguments ?? tc?.arguments ?? tc?.parameters ?? {});

      console.log(`🛠️ [VAPI TOOL] Ejecutando "${fnName}" con args:`, fnArgs);

      if (fnName === 'check_availability') {
        try {
          const targetDate = normalizeVoiceDate(fnArgs.date || fnArgs.appointmentDate);
          const rawDayApts = await db.select().from(appointments).where(
            and(
              eq(appointments.tenantId, tenantId),
              gte(appointments.scheduledAt, new Date(`${targetDate}T00:00:00Z`)),
              lt(appointments.scheduledAt, new Date(`${targetDate}T23:59:59Z`))
            )
          );
          const dayApts = rawDayApts.filter((a) => a.status !== 'cancelled');
          const bookedHours = dayApts.map((a) => a.scheduledAt.toISOString().split('T')[1].substring(0, 5));
          const standardSlots = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
          const freeSlots = standardSlots.filter((s) => !bookedHours.includes(s));

          const resultText = freeSlots.length > 0
            ? `Horarios disponibles para ${targetDate}: ${freeSlots.join(', ')}`
            : `No hay horarios libres el ${targetDate}. Por favor ofrécele otro día al cliente.`;

          results.push({ name: fnName, toolCallId: tcId, result: resultText });
        } catch (availErr) {
          results.push({
            name: fnName,
            toolCallId: tcId,
            result: 'Horarios disponibles: 09:00, 10:00, 11:00, 14:00, 15:00, 16:00, 17:00'
          });
        }
        continue;
      }

      if (fnName === 'book_appointment') {
        try {
          const booked = await upsertVoiceClientAndAppointment({
            tenantId,
            rawClientName: fnArgs.clientName || fnArgs.name || fnArgs.customerName || fnArgs.fullName,
            rawClientEmail: fnArgs.clientEmail || fnArgs.email || fnArgs.customerEmail || fnArgs.correo,
            callerIdPhone: callerIdNumber,
            spokenPhone: fnArgs.clientPhone || fnArgs.phone || fnArgs.telefono,
            rawDate: fnArgs.appointmentDate || fnArgs.date || fnArgs.fecha,
            rawTime: fnArgs.appointmentTime || fnArgs.time || fnArgs.hora,
            serviceId: fnArgs.serviceId,
            serviceName: fnArgs.serviceName || fnArgs.service || fnArgs.servicio,
            staffId: fnArgs.staffId || null,
            staffName: fnArgs.staffName || null,
            modality: fnArgs.modality || fnArgs.modalidad,
            caseType: fnArgs.caseType || fnArgs.reason || fnArgs.motivo,
            callLanguage: fnArgs.language || 'es',
            callSummary: fnArgs.callSummary,
            recordingUrl: fnArgs.recordingUrl,
            callId,
            sendTelegram: true
          });

          const confirmText =
            (fnArgs.language || 'es') === 'en'
              ? `Appointment successfully booked for ${booked.finalClientName} on ${booked.datePart} at ${booked.timePart} for ${booked.resolvedServiceName}.`
              : `Cita agendada con éxito para ${booked.finalClientName} el día ${booked.datePart} a las ${booked.timePart} para ${booked.resolvedServiceName}.`;

          console.log(`✅ [VAPI TOOL] Cita guardada en BD: ID ${booked.apt?.id}`);
          results.push({ name: fnName, toolCallId: tcId, result: confirmText });
        } catch (bookErr: any) {
          console.error('❌ Error en tool book_appointment:', bookErr);
          const errDetail = bookErr?.message || String(bookErr || 'Error desconocido en BD');
          await sendTelegramNotification(`
🚨 <b>¡ERROR TÉCNICO AL AGENDAR CITA POR VOZ IA!</b> 🚨
⚠️ <b>Detalle del Error:</b> <code>${errDetail}</code>
👤 <b>Cliente:</b> ${fnArgs.clientName || fnArgs.name || 'No capturado'}
📞 <b>Teléfono:</b> ${callerIdNumber || fnArgs.clientPhone || 'N/A'}
📧 <b>Correo:</b> ${fnArgs.clientEmail || fnArgs.email || 'N/A'}
🗓️ <b>Fecha / Hora solicitada:</b> ${fnArgs.appointmentDate || 'N/A'} — ${fnArgs.appointmentTime || 'N/A'}
🛠️ <b>Servicio / Motivo:</b> ${fnArgs.serviceName || fnArgs.caseType || 'N/A'}
💡 <i>El backend recibió la llamada de Vapi pero falló al guardar en PostgreSQL. Revisa el error arriba para agendar manualmente si es necesario.</i>
          `, tenantId, 'system');

          results.push({
            name: fnName,
            toolCallId: tcId,
            result: `Error técnico interno al guardar la cita: ${errDetail}`
          });
        }
        continue;
      }

      results.push({ name: fnName, toolCallId: tcId, result: 'OK' });
    }

    return res.status(200).json({
      result: results[0]?.result || 'OK',
      results
    });
  } catch (error: any) {
    console.error('❌ Error general en handleVapiVoiceWebhook:', error);
    await sendTelegramNotification(`
🚨 <b>¡EXCEPCIÓN CRÍTICA EN WEBHOOK DE VOZ IA!</b> 🚨
⚠️ <b>Error:</b> <code>${error?.message || String(error)}</code>
📦 <b>Payload recibido:</b> <code>${JSON.stringify(req.body || {}).slice(0, 350)}</code>
    `, resolvedTenantIdForAlert, 'system').catch(() => {});
    return res.status(200).json({ result: 'Error interno en webhook', results: [], ok: true });
  }
}


// =========================================================================
// 📲 GESTIÓN DEL CANAL INTERNO DE TELEGRAM PARAMETRIZADO POR CONSULTORIO / NEGOCIO
// 1. configureTenantTelegramChannel: Guarda Chat ID, Bot Token opcional y filtros en BD
// 2. detectTenantTelegramChatId: Detecta automáticamente el Chat ID del grupo del consultorio (1 clic)
// 3. testTenantTelegramChannel: Envía un mensaje de prueba en vivo al grupo/canal del consultorio
// =========================================================================
export async function configureTenantTelegramChannel(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(400).json({ success: false, message: 'Falta x-tenant-id en los headers.' });

    const { telegramConfig } = req.body || {};
    const chatIdClean = String(telegramConfig?.chatId || '').trim();
    const botTokenClean = String(telegramConfig?.botToken || '').trim();
    const isActive = telegramConfig?.isActive !== false;

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) return res.status(404).json({ success: false, message: 'Negocio no encontrado.' });

    const existingLoyalty = safeParseJSON((tenant as any).loyaltyConfig);
    const savedTelegramConfig = {
      isActive,
      channelName: String(telegramConfig?.channelName || tenant.name || 'Canal Interno').trim(),
      chatId: chatIdClean,
      botToken: botTokenClean,
      notifyNewAppointments: telegramConfig?.notifyNewAppointments !== false,
      notifyRecordings: telegramConfig?.notifyRecordings !== false,
      notifyConfirmationsAndCancels: telegramConfig?.notifyConfirmationsAndCancels !== false,
      notifyPOSClosures: telegramConfig?.notifyPOSClosures !== false,
      updatedAt: new Date().toISOString()
    };

    const updatedLoyalty = {
      ...existingLoyalty,
      telegramConfig: savedTelegramConfig
    };

    // Guardar en loyalty_config JSONB y también en las columnas dedicadas de public.tenants
    await db.update(tenants)
      .set({ loyaltyConfig: updatedLoyalty } as any)
      .where(eq(tenants.id, tenantId));

    try {
      await db.execute(sql`
        UPDATE public.tenants
        SET telegram_chat_id = ${chatIdClean || null},
            telegram_bot_token = ${botTokenClean || null},
            telegram_enabled = ${isActive}
        WHERE id = ${tenantId}::uuid
      `);
    } catch (colErr) {}

    return res.status(200).json({
      success: true,
      message: '✅ Canal interno de Telegram parametrizado y guardado en la base de datos.',
      telegramConfig: savedTelegramConfig
    });
  } catch (error: any) {
    console.error('Error guardando configuración de Telegram:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function detectTenantTelegramChatId(req: Request, res: Response) {
  try {
    const { botToken } = req.body || {};
    const tokenToUse = String(botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();

    if (!tokenToUse) {
      return res.status(400).json({
        success: false,
        message: 'No hay un Bot Token configurado en el servidor (.env) ni en la casilla de Bot propio.'
      });
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${tokenToUse}/getUpdates?limit=25`);
    if (!tgRes.ok) {
      return res.status(400).json({
        success: false,
        message: 'Token de Bot inválido o rechazado por Telegram. Verifica el Bot Token.'
      });
    }

    const tgData = await tgRes.json();
    const updates: any[] = Array.isArray(tgData?.result) ? tgData.result : [];

    // Buscamos desde el mensaje más reciente hacia atrás cualquier grupo, supergrupo, canal o chat directo
    const detectedChats: { chatId: string; title: string; type: string }[] = [];
    const seenIds = new Set<string>();

    for (let i = updates.length - 1; i >= 0; i--) {
      const u = updates[i];
      const chatObj =
        u?.message?.chat ||
        u?.channel_post?.chat ||
        u?.my_chat_member?.chat ||
        u?.callback_query?.message?.chat;

      if (chatObj && chatObj.id) {
        const cid = String(chatObj.id);
        if (!seenIds.has(cid)) {
          seenIds.add(cid);
          const title =
            chatObj.title ||
            [chatObj.first_name, chatObj.last_name].filter(Boolean).join(' ') ||
            chatObj.username ||
            `Chat ${cid}`;
          detectedChats.push({
            chatId: cid,
            title,
            type: chatObj.type || 'private'
          });
        }
      }
    }

    if (detectedChats.length === 0) {
      return res.status(200).json({
        success: false,
        message: '⚠️ Aún no detectamos mensajes recientes. Entra a tu grupo de Telegram donde agregaste al Bot, envía la palabra "hola" o "/activar" y vuelve a pulsar este botón.'
      });
    }

    // Preferimos un grupo/supergrupo si existe, o el chat más reciente
    const preferredGroup = detectedChats.find((c) => c.type === 'supergroup' || c.type === 'group' || c.type === 'channel') || detectedChats[0];

    return res.status(200).json({
      success: true,
      chatId: preferredGroup.chatId,
      channelName: preferredGroup.title,
      type: preferredGroup.type,
      allDetectedChats: detectedChats,
      message: `✅ ¡Canal detectado automáticamente! "${preferredGroup.title}" (ID: ${preferredGroup.chatId}).`
    });
  } catch (error: any) {
    console.error('Error detectando Chat ID de Telegram:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function testTenantTelegramChannel(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { telegramConfig, businessName } = req.body || {};

    // Si envió datos en pantalla sin guardar aún, los guardamos primero para que la prueba use lo que está en pantalla
    if (tenantId && telegramConfig) {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
      if (tenant) {
        const existingLoyalty = safeParseJSON((tenant as any).loyaltyConfig);
        const mergedTg = {
          ...(existingLoyalty.telegramConfig || {}),
          ...telegramConfig,
          isActive: true
        };
        await db.update(tenants)
          .set({ loyaltyConfig: { ...existingLoyalty, telegramConfig: mergedTg } } as any)
          .where(eq(tenants.id, tenantId));

        try {
          await db.execute(sql`
            UPDATE public.tenants
            SET telegram_chat_id = ${String(mergedTg.chatId || '').trim() || null},
                telegram_bot_token = ${String(mergedTg.botToken || '').trim() || null},
                telegram_enabled = true
            WHERE id = ${tenantId}::uuid
          `);
        } catch (e) {}
      }
    }

    const bizTitle = businessName || telegramConfig?.channelName || 'Tu Consultorio / Negocio';
    const testMsg = `
🔔 <b>¡CANAL INTERNO DE COMUNICACIÓN CONECTADO!</b> ✅
🏢 <b>Consultorio / Negocio:</b> ${bizTitle}
📲 <b>Canal:</b> ${telegramConfig?.channelName || 'Recepción y Equipo Interno'}
🤖 <b>Estado:</b> Enlazado en tiempo real con AutoFlow + Recepcionista IA.

<i>A partir de este momento, tu equipo recibirá en este grupo las citas agendadas por voz o web, las grabaciones de llamadas IA, confirmaciones de asistencia y cierres de caja.</i>
    `;

    const sendRes = await sendTelegramNotification(testMsg, tenantId, 'system');

    if (!sendRes.sent) {
      return res.status(400).json({
        success: false,
        message: `⚠️ No se pudo entregar el mensaje a Telegram (${sendRes.error || 'Verifica que el Chat ID sea correcto y que el Bot sea miembro del grupo'}).`
      });
    }

    return res.status(200).json({
      success: true,
      message: `🚀 ¡Mensaje de prueba enviado con éxito al Chat ID ${sendRes.chatIdUsed}! Revisa tu Telegram.`
    });
  } catch (error: any) {
    console.error('Error probando canal de Telegram:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}


// =========================================================================
// 🎧 SOPORTE Y ACOMPAÑAMIENTO TÉCNICO AUTOFLOW (SOLO AL TELEGRAM CENTRAL DE AUTOFLOW)
// IMPORTANTE: Nunca envía al Telegram del cliente/consultorio; va exclusivamente
// al TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID central de AutoFlow (.env).
// =========================================================================
export async function requestAutoFlowSupport(req: Request, res: Response) {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || '';
    const {
      businessName,
      contactName,
      contactPhone,
      topic,
      message,
      currentSection
    } = req.body || {};

    const envToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const envChatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

    if (!envToken || !envChatId) {
      return res.status(500).json({
        success: false,
        message: '⚠️ El canal central de soporte de AutoFlow (.env) no está configurado en el servidor.'
      });
    }

    let resolvedBizName = String(businessName || '').trim() || 'Negocio / Consultorio';
    let nicheLabel = '';
    let diagnosticSummary = '';

    if (tenantId) {
      try {
        const [tenantRow] = await db
          .select({ name: tenants.name, niche: tenants.niche, loyaltyConfig: tenants.loyaltyConfig })
          .from(tenants)
          .where(eq(tenants.id, tenantId));

        if (tenantRow) {
          resolvedBizName = tenantRow.name || resolvedBizName;
          nicheLabel = tenantRow.niche ? ` (${String(tenantRow.niche).toUpperCase()})` : '';
          const lConf = safeParseJSON(tenantRow.loyaltyConfig);
          const hasVapi = Boolean(lConf?.vapiConfig?.isActive && lConf?.vapiConfig?.assistantId);
          const hasTg = Boolean(lConf?.telegramConfig?.chatId);
          diagnosticSummary = `Vapi IA: ${hasVapi ? `Activo (${lConf?.vapiConfig?.phoneNumber || 'OK'})` : 'Sin vincular'} | Telegram propio: ${hasTg ? lConf.telegramConfig.chatId : 'Sin configurar'}`;
        }
      } catch (dbErr) {}
    }

    const cleanContact = String(contactName || 'Encargado del Negocio').trim();
    const cleanPhone = String(contactPhone || 'No indicado').trim();
    const cleanTopic = String(topic || 'Acompañamiento de Configuración').trim();
    const cleanMsg = String(message || 'Solicito acompañamiento para parametrizar el portal interno.').trim();
    const cleanSection = String(currentSection || 'Portal Interno').trim();

    // Mensaje dirigido EXCLUSIVAMENTE a AutoFlow (envToken + envChatId)
    const autoFlowSupportMsg = `
🆘 <b>¡NUEVA SOLICITUD DE SOPORTE Y ACOMPAÑAMIENTO!</b> 🎧
🏢 <b>Negocio:</b> ${resolvedBizName}${nicheLabel}
🆔 <b>Tenant ID:</b> <code>${tenantId || 'N/A'}</code>
📍 <b>Sección actual:</b> ${cleanSection}
🎯 <b>Tema:</b> ${cleanTopic}
👤 <b>Solicitante:</b> ${cleanContact}
📞 <b>Teléfono / WhatsApp:</b> ${cleanPhone}
💬 <b>Detalle:</b> <i>"${cleanMsg}"</i>
${diagnosticSummary ? `🔎 <b>Estado técnico:</b> ${diagnosticSummary}
` : ''}⚡ <i>Nota: Este mensaje llegó únicamente a AutoFlow (no al cliente).</i>
    `.trim();

    const tgResponse = await fetch(`https://api.telegram.org/bot${envToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: envChatId,
        text: autoFlowSupportMsg,
        parse_mode: 'HTML'
      })
    });

    if (!tgResponse.ok) {
      const errText = await tgResponse.text();
      console.error('❌ Error enviando soporte a AutoFlow Telegram:', errText);
      return res.status(500).json({
        success: false,
        message: 'No se pudo contactar al equipo de soporte en este momento. Intenta nuevamente.'
      });
    }

    return res.status(200).json({
      success: true,
      message: '🎧 ¡Solicitud enviada al equipo de Soporte AutoFlow! En breve nos comunicaremos contigo para acompañarte paso a paso.'
    });
  } catch (error: any) {
    console.error('Error en requestAutoFlowSupport:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

// =========================================================================
// 📜 OBTENER DOCUMENTO LEGAL ACTIVO DESDE public.legal_documents (content_html)
// =========================================================================
export async function getActiveLegalDocument(req: Request, res: Response) {
  try {
    const docType = String(req.query.type || 'terms_and_conditions').trim();

    const rowsRes = await db.execute(sql`
      SELECT id, tenant_id, document_type, version, content_html, content_url, is_active, published_at
      FROM public.legal_documents
      WHERE (document_type ILIKE ${docType} OR document_type ILIKE 'terms%' OR document_type ILIKE 'term&conditions%')
        AND is_active = true
      ORDER BY CASE WHEN tenant_id IS NULL THEN 0 ELSE 1 END, published_at DESC
      LIMIT 1
    `);

    const rows = Array.isArray(rowsRes) ? rowsRes : (rowsRes as any).rows || [];
    if (rows.length > 0) {
      return res.status(200).json({ success: true, document: rows[0] });
    }

    return res.status(200).json({
      success: true,
      document: {
        id: null,
        document_type: 'terms_and_conditions',
        version: '2026.1',
        content_html: DEFAULT_TERMS_HTML,
        is_active: true
      }
    });
  } catch (error: any) {
    console.error('Error leyendo legal_documents:', error);
    return res.status(200).json({
      success: true,
      document: {
        id: null,
        document_type: 'terms_and_conditions',
        version: '2026.1',
        content_html: DEFAULT_TERMS_HTML,
        is_active: true
      }
    });
  }
}

// =========================================================================
// 🔐 VALIDACIÓN DE USUARIO CONTRA TABLA public.users (iOS, Google o Correo + Password)
// - Para iOS / Google: valida que el correo o appleUserId exista en public.users (o users global)
//   y devuelve sus datos + historial sin exponer expedientes por teléfono público.
// - Para Usuario (Correo + Contraseña): verifica email + passwordHash en users.metadata
//   (o permite establecer contraseña la primera vez si el usuario ya existía sin clave).
// =========================================================================
export async function authenticateClientUser(req: Request, res: Response) {
  try {
    const headerTenant = (req.headers['x-tenant-id'] as string) || '';
    const bodyTenant = (req.body?.tenantId as string) || '';
    const tenantId = headerTenant || bodyTenant;
    const { provider, email, password, appleUserId, fullName, phone, setPasswordIfEmpty, updateProfile } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Falta identificador del negocio (x-tenant-id).' });
    }

    const cleanProvider = String(provider || 'manual').toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanAppleId = String(appleUserId || '').trim();

    let matchedUser: any = null;

    try {
      await db.execute(sql`
        ALTER TABLE public.users
          ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(30) DEFAULT 'manual',
          ADD COLUMN IF NOT EXISTS is_verified_provider BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS apple_user_id VARCHAR(255)
      `);
    } catch (_colErr3) {}

    // 1. Buscar usuario en este negocio (tenantId)
    const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));

    if (cleanEmail) {
      matchedUser = tenantUsers.find((u) => String(u.email || '').trim().toLowerCase() === cleanEmail) || null;
    }
    if (!matchedUser && cleanAppleId) {
      matchedUser = tenantUsers.find((u) => {
        const m = safeParseJSON(u.metadata);
        return m?.appleUserId === cleanAppleId || (u as any)?.appleUserId === cleanAppleId;
      }) || null;
    }

    // 2. Si es OAuth (iOS o Google) y no estaba aún en este tenant, buscamos si ya existe en otro negocio de la plataforma
    if (!matchedUser && (cleanProvider === 'apple' || cleanProvider === 'google')) {
      const allUsers = await db.select().from(users);
      let globalUser: any = null;
      if (cleanEmail) {
        globalUser = allUsers.find((u) => String(u.email || '').trim().toLowerCase() === cleanEmail) || null;
      }
      if (!globalUser && cleanAppleId) {
        globalUser = allUsers.find((u) => safeParseJSON(u.metadata)?.appleUserId === cleanAppleId) || null;
      }

      if (globalUser) {
        // Sincronizar perfil verificado en este negocio automáticamente
        const [createdLocal] = await db.insert(users).values({
          tenantId,
          name: fullName?.trim() || globalUser.name || 'Cliente Verificado',
          email: cleanEmail || globalUser.email,
          phone: globalUser.phone || '',
          role: 'client',
          metadata: {
            authProvider: cleanProvider,
            ...(cleanAppleId ? { appleUserId: cleanAppleId } : {}),
          }
        } as any).returning();
        matchedUser = createdLocal;
      }
    }

    if (!matchedUser && cleanEmail) {
      const allUsers = await db.select().from(users);
      const anyTenantUser = allUsers.find((u) => String(u.email || '').trim().toLowerCase() === cleanEmail) || null;
      if (anyTenantUser) {
        if (cleanProvider === 'apple' || cleanProvider === 'google') {
          const [syncedUser] = await db.insert(users).values({
            tenantId,
            name: fullName?.trim() || anyTenantUser.name || 'Cliente Verificado',
            email: cleanEmail,
            phone: anyTenantUser.phone || '',
            role: 'client',
            metadata: {
              ...(safeParseJSON(anyTenantUser.metadata)),
              authProvider: cleanProvider,
              ...(cleanAppleId ? { appleUserId: cleanAppleId } : {}),
            }
          } as any).returning();
          matchedUser = syncedUser;
        } else {
          matchedUser = anyTenantUser;
        }
      }
    }

    if (!matchedUser) {
      return res.status(404).json({
        success: false,
        notRegistered: true,
        error: cleanProvider === 'manual'
          ? 'No encontramos una cuenta con ese correo electrónico. Verifica tu correo o regístrate al reservar tu primera cita.'
          : `Cuenta ${cleanProvider === 'apple' ? 'iOS (Apple)' : 'Google'} verificada${cleanEmail ? ` (${cleanEmail})` : ''}, pero aún no está vinculada a un expediente en la base de datos. Reserva tu primera cita o ingresa con tu Usuario (Correo y Contraseña).`
      });
    }

    if (updateProfile && matchedUser) {
      const updFields: any = {};
      if (fullName && String(fullName).trim()) updFields.name = String(fullName).trim();
      if (phone && String(phone).trim()) updFields.phone = String(phone).trim();
      if (Object.keys(updFields).length > 0) {
        const [updatedProfileUser] = await db
          .update(users)
          .set(updFields)
          .where(eq(users.id, matchedUser.id))
          .returning();
        if (updatedProfileUser) matchedUser = updatedProfileUser;
      }
    }

    const userMeta = safeParseJSON(matchedUser.metadata);

    // 3. Si es acceso tradicional ("manual" = Correo + Contraseña), validar contraseña
    if (cleanProvider === 'manual') {
      const cleanPass = String(password || '').trim();
      if (!cleanPass) {
        return res.status(400).json({ success: false, error: 'Ingresa tu contraseña para acceder al expediente.' });
      }

      const existingHash = matchedUser.passwordHash || (matchedUser as any).password_hash || userMeta?.passwordHash;
      if (existingHash) {
        const isValid = verifyClientPassword(cleanPass, existingHash);
        if (!isValid) {
          return res.status(401).json({ success: false, error: 'Contraseña incorrecta. Intenta nuevamente.' });
        }
      } else if (setPasswordIfEmpty) {
        // Si el cliente había sido creado antes (ej. por llamada IA o recepción) sin contraseña, la protegemos ahora
        const newHash = hashClientPassword(cleanPass);
        const [updatedWithPass] = await db.update(users)
          .set({ metadata: { ...userMeta, authProvider: 'manual', passwordHash: newHash } } as any)
          .where(eq(users.id, matchedUser.id))
          .returning();
        matchedUser = updatedWithPass;
      } else {
        return res.status(401).json({
          success: false,
          needsPasswordSetup: true,
          error: 'Tu cuenta aún no tiene contraseña asignada. Activa "Crear contraseña ahora" o ingresa con iOS / Google.'
        });
      }
    } else {
      // Actualizar proveedor OAuth en metadata si cambió
      if (userMeta?.authProvider !== cleanProvider || (cleanAppleId && !userMeta?.appleUserId)) {
        const [updatedOauth] = await db.update(users)
          .set({
            metadata: {
              ...userMeta,
              authProvider: cleanProvider,
              ...(cleanAppleId ? { appleUserId: cleanAppleId } : {}),
            }
          } as any)
          .where(eq(users.id, matchedUser.id))
          .returning();
        matchedUser = updatedOauth;
      }
    }

    // 4. Cargar historial de citas y servicios completados del usuario autenticado
    const apts = await db.select().from(appointments).where(eq(appointments.clientId, matchedUser.id));
    let rawOrders: any[] = [];
    if (apts.length > 0) {
      rawOrders = await db.select({
        wo: workOrders,
        svc: services
      })
      .from(workOrders)
      .innerJoin(appointments, eq(workOrders.appointmentId, appointments.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(inArray(workOrders.appointmentId, apts.map((a) => a.id)))
      .orderBy(workOrders.createdAt);
    }

    const [vehicleRecord] = await db.select().from(vehicles)
      .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.clientId, matchedUser.id)));

    const safeClientOut = {
      ...matchedUser,
      metadata: (() => {
        const m = safeParseJSON(matchedUser.metadata);
        delete m.passwordHash; // Nunca enviar el hash de contraseña al frontend
        return m;
      })()
    };

    return res.status(200).json({
      success: true,
      client: safeClientOut,
      vehicle: vehicleRecord || null,
      serviceHistory: rawOrders.map((row) => ({ ...row.wo, service: row.svc }))
    });
  } catch (error: any) {
    console.error('Error en authenticateClientUser:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


// =========================================================================
// ✏️ ACTUALIZAR NOMBRE Y TELÉFONO DEL CLIENTE EN BASE DE DATOS (PUT /api/clients/profile)
// =========================================================================
export async function updateClientProfile(req: Request, res: Response) {
  try {
    const headerTenant = (req.headers['x-tenant-id'] as string) || '';
    const { id, clientId, tenantId: bodyTenant, name, fullName, phone, clientPhone, email, appleUserId } = req.body || {};
    const resolvedTenantId = headerTenant || bodyTenant || '';
    const cleanName = String(name || fullName || '').trim();
    const cleanPhone = String(phone || clientPhone || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const targetId = String(id || clientId || '').trim();

    if (!cleanName && !cleanPhone) {
      return res.status(400).json({ success: false, error: 'Debes enviar nombre o teléfono para actualizar.' });
    }

    const allUsers = await db.select().from(users);
    let targetUser: any = null;

    if (targetId) {
      targetUser = allUsers.find((u: any) => String(u.id) === targetId) || null;
    }
    if (!targetUser && cleanEmail) {
      targetUser =
        allUsers.find(
          (u: any) =>
            String(u.email || '').trim().toLowerCase() === cleanEmail &&
            (!resolvedTenantId || String(u.tenantId || (u as any).tenant_id || '') === resolvedTenantId)
        ) ||
        allUsers.find((u: any) => String(u.email || '').trim().toLowerCase() === cleanEmail) ||
        null;
    }
    if (!targetUser && appleUserId) {
      targetUser =
        allUsers.find((u: any) => {
          const m = safeParseJSON(u.metadata);
          return m?.appleUserId === String(appleUserId).trim() || (u as any)?.appleUserId === String(appleUserId).trim();
        }) || null;
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado en la base de datos.' });
    }

    const updateValues: any = {};
    if (cleanName) updateValues.name = cleanName;
    if (cleanPhone) updateValues.phone = cleanPhone;

    const [updatedUser] = await db
      .update(users)
      .set(updateValues)
      .where(eq(users.id, targetUser.id))
      .returning();

    const safeClientOut = {
      ...updatedUser,
      metadata: (() => {
        const m = safeParseJSON(updatedUser.metadata);
        delete m.passwordHash;
        return m;
      })(),
    };

    return res.status(200).json({
      success: true,
      message: 'Perfil actualizado en PostgreSQL.',
      client: safeClientOut,
    });
  } catch (error: any) {
    console.error('Error en updateClientProfile:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


// =========================================================================
// ⏰ CRON JOB AUTOMÁTICO (RECORDATORIOS 6H ANTES -> TELEGRAM + EXPO PUSH)
// =========================================================================
let reminderCronInterval: ReturnType<typeof setInterval> | null = null;
let isReminderCronRunning = false;

export async function runSixHourAppointmentRemindersJob(): Promise<{ processed: number; sent: number }> {
  if (isReminderCronRunning) return { processed: 0, sent: 0 };
  isReminderCronRunning = true;
  let processed = 0;
  let sent = 0;

  try {
    const nowMs = Date.now();
    // Ventana objetivo: citas entre 5.5h y 6.5h en el futuro (evaluado cada 5 min)
    const minFutureMs = nowMs + 5 * 60 * 60 * 1000;
    const maxFutureMs = nowMs + 7 * 60 * 60 * 1000;

    const candidateRows = await db
      .select({
        apt: appointments,
        cli: users,
        svc: services,
      })
      .from(appointments)
      .innerJoin(users, eq(appointments.clientId, users.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(
        and(
          gte(appointments.scheduledAt, new Date(minFutureMs)),
          lt(appointments.scheduledAt, new Date(maxFutureMs)),
          ne(appointments.status, 'cancelled'),
          ne(appointments.status, 'completed')
        )
      );

    for (const row of candidateRows) {
      processed += 1;
      const aptObj = row.apt;
      const meta = safeParseJSON(aptObj.mediaAndReports);

      if (meta?.reminder6hSent === true || meta?.attendanceConfirmed === true) {
        continue;
      }

      const scheduledMs = new Date(aptObj.scheduledAt).getTime();
      const hoursUntil = (scheduledMs - nowMs) / (1000 * 60 * 60);
      if (hoursUntil < 5.25 || hoursUntil > 6.75) {
        continue;
      }

      const tenantId = String(aptObj.tenantId);
      const clientName = row.cli?.name || 'Cliente';
      const clientPhone = row.cli?.phone || 'N/A';
      const serviceName = row.svc?.name || 'Servicio General';
      const formattedDate = formatWallClockForNotification(aptObj.scheduledAt, meta);

      const telegramMsg = `
⏰ <b>¡RECORDATORIO AUTOMÁTICO DE CITA (6 HORAS ANTES)!</b> ⏰
👤 <b>Cliente:</b> ${clientName} (${clientPhone})
🗓️ <b>Horario:</b> ${formattedDate}
🛠️ <b>Servicio:</b> ${serviceName}
📲 <i>Recordatorio automático disparado por Cron: confirma tu asistencia o cancela con al menos 3 horas de anticipación.</i>
      `;

      await Promise.allSettled([
        sendTelegramNotification(telegramMsg, tenantId, 'status'),
        notifyClientPush(
          tenantId,
          String(aptObj.clientId),
          {
            title: '⏰ Recordatorio de tu Cita (En ~6 horas)',
            body: `Hola ${clientName}, tu cita de ${serviceName} es a las ${formattedDate}. Confirma o cancela con mínimo 3h de anticipación.`,
            data: { tenantId, appointmentId: aptObj.id, eventType: 'appointment_reminder_6h' },
          },
          'appointment_reminder_6h'
        ),
        notifyTenantPush(
          tenantId,
          {
            title: `⏰ Cita en ~6h: ${clientName}`,
            body: `${serviceName} • ${formattedDate}`,
            data: { tenantId, appointmentId: aptObj.id, eventType: 'appointment_reminder_6h' },
          },
          aptObj.staffId || meta?.assignedStaffId || null
        ),
      ]);

      await db
        .update(appointments)
        .set({
          mediaAndReports: {
            ...meta,
            reminder6hSent: true,
            reminderSentAt: new Date().toISOString(),
          },
        })
        .where(eq(appointments.id, aptObj.id));

      sent += 1;
    }

    return { processed, sent };
  } catch (cronErr) {
    console.warn('⚠️ Error ejecutando Cron de recordatorios 6h:', cronErr);
    return { processed, sent };
  } finally {
    isReminderCronRunning = false;
  }
}

export function startAppointmentRemindersCron(intervalMs = 5 * 60 * 1000): void {
  if (reminderCronInterval) return;
  runSixHourAppointmentRemindersJob().catch(() => {});
  reminderCronInterval = setInterval(() => {
    runSixHourAppointmentRemindersJob().catch(() => {});
  }, intervalMs);
  console.log(`⏰ [CRON] Recordatorios automáticos de citas (6h) activo cada ${Math.round(intervalMs / 60000)} min.`);
}
