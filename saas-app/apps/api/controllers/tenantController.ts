import { Request, Response } from 'express';
import { db, tenants, users } from '@taller/database';
import { eq, and, sql } from 'drizzle-orm';
import crypto from 'crypto';

// 🔐 Helper criptográfico nativo (scrypt + salt aleatorio) para guardar y verificar contraseñas seguras
export const hashPasswordScrypt = (plainPassword: string): string => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
};

export const verifyPasswordScrypt = (plainPassword: string, storedHash?: string | null): boolean => {
  if (!plainPassword || !storedHash) return false;
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const [, salt, keyHex] = parts;
    const derivedBuf = crypto.scryptSync(plainPassword, salt, 64);
    const storedBuf = Buffer.from(keyHex, 'hex');
    if (derivedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, storedBuf);
  }
  // Fallback si se guardó texto plano previamente
  return plainPassword === storedHash;
};

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

const extractCleanPhone = (phoneStr?: string | null): string => {
  if (!phoneStr) return '';
  const digits = String(phoneStr).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

// 📱 Disparo de Notificación Push Real desde Localhost (Telegram + Expo Push Service)
const dispatchLocalPushNotifications = async (tenantId: string, title: string, message: string, targetAudience: string) => {
  // 1. Enviar aviso a Telegram si está configurado en .env
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: `📢 <b>¡CAMPAÑA PUSH ACTIVA!</b>\n🎯 <b>Audiencia:</b> ${targetAudience}\n📌 <b>${title}</b>\n💬 ${message}`,
          parse_mode: 'HTML'
        })
      });
    } catch (e) {}
  }

  // 2. Buscar dispositivos móviles registrados en public.user_devices para este tenant y enviarles Expo Push
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
      const messages = tokens.map((token: string) => ({
        to: token,
        sound: 'default',
        title,
        body: message,
        data: { tenantId, targetAudience }
      }));

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(messages)
      });
      console.log(`📲 Push enviado a ${tokens.length} dispositivos móviles.`);
    }
  } catch (errPush) {
    console.log('ℹ️ Info Push Local:', errPush);
  }
};

// 1. Registrar un nuevo negocio (Tenant) + Guardar adminEmail y adminPasswordHash en BD
export async function createTenant(req: Request, res: Response) {
  try {
    const {
      id,
      name,
      niche,
      address,
      city,
      state,
      zipCode,
      logoUrl,
      primaryColor,
      planTier,
      subscriptionStatus,
      adminEmail,
      email,
      password,
      portalPin,
    } = req.body;

    if (!name || !niche) {
      return res.status(400).json({ success: false, message: 'El nombre del negocio y la categoría son obligatorios.' });
    }

    const cleanAdminEmail = (adminEmail || email || '').trim().toLowerCase() || null;
    const rawPassword = password ? String(password) : '';
    const hashedPassword = rawPassword ? hashPasswordScrypt(rawPassword) : null;
    const hashedPin = portalPin ? hashPasswordScrypt(String(portalPin)) : null;
    const tenantUuid = id || crypto.randomUUID();

    const [newTenant] = await db.insert(tenants).values({
      id: tenantUuid,
      name: name.trim(),
      niche: niche.trim(),
      adminEmail: cleanAdminEmail,
      adminPasswordHash: hashedPassword,
      portalPinHash: hashedPin,
      address: address ? address.trim() : null,
      city: city ? city.trim() : null,
      state: state ? state.trim().toUpperCase() : null,
      zipCode: zipCode ? zipCode.trim() : null,
      logoUrl: logoUrl || null,
      primaryColor: primaryColor || '#FF5E00',
      planTier: planTier || 'starter',
      subscriptionStatus: subscriptionStatus || 'active',
    } as any).returning();

    // También creamos/actualizamos el usuario administrador en public.users con su password_hash
    if (cleanAdminEmail && hashedPassword) {
      try {
        await db.execute(sql`
          INSERT INTO public.users (tenant_id, role, name, email, password_hash, password_updated_at, zip_code)
          VALUES (
            ${tenantUuid}::uuid,
            'owner',
            ${name.trim() + ' (Admin)'},
            ${cleanAdminEmail},
            ${hashedPassword},
            NOW(),
            ${zipCode ? zipCode.trim() : null}
          )
          ON CONFLICT (tenant_id, email)
          DO UPDATE SET
            role = 'owner',
            password_hash = EXCLUDED.password_hash,
            password_updated_at = NOW()
        `);
      } catch (usrErr) {
        console.warn('⚠️ Aviso creando usuario owner en public.users:', usrErr);
      }
    }

    return res.status(201).json({ success: true, tenant: newTenant });
  } catch (error: any) {
    console.error('❌ Error al registrar el tenant en la BD:', error);
    return res.status(500).json({ success: false, message: error.message || String(error) });
  }
}

// 2. Obtener la información y configuración del tenant actual + Campañas (con is_active) y Reseñas
export async function getTenantInfo(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID requerido.' });

    let [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));

    if (!tenant) {
      const defaultName = tenantId.includes('spa') ? 'Zen Beauty Spa' : tenantId.includes('barber') ? 'Classic BarberShop' : 'AutoFlow Central';
      const defaultType = tenantId.includes('spa') ? 'spa' : tenantId.includes('barber') ? 'barbershop' : 'automotive';

      const [createdTenant] = await db.insert(tenants).values({
        id: tenantId,
        name: defaultName,
        niche: defaultType,
        subscriptionStatus: 'active'
      } as any).returning();
      
      tenant = createdTenant;
    }

    const parsedLoyalty = safeParseJSON((tenant as any).loyaltyConfig);

    // 📢 Cargar campañas desde public.push_campaigns incluyendo is_active
    try {
      const cmpResult = await db.execute(sql`
        SELECT id, tenant_id, title, message, target_audience, COALESCE(is_active, true) AS is_active, sent_at
        FROM public.push_campaigns
        WHERE tenant_id = ${tenantId}::uuid
        ORDER BY sent_at DESC
      `);
      const dbCampaigns = Array.isArray(cmpResult) ? cmpResult : (cmpResult as any).rows || [];
      if (dbCampaigns.length > 0) {
        parsedLoyalty.campaigns = dbCampaigns;
      }
    } catch (cmpErr) {
      console.warn('⚠️ No se pudieron leer push_campaigns:', cmpErr);
    }

    // ⭐ Cargar reseñas desde public.reviews
    try {
      const revResult = await db.execute(sql`
        SELECT 
          r.id,
          r.client_id AS "clientKey",
          u.name AS "clientName",
          r.rating,
          r.reaction,
          r.comment,
          r.created_at AS "createdAt"
        FROM public.reviews r
        INNER JOIN public.users u ON u.id = r.client_id
        WHERE r.tenant_id = ${tenantId}::uuid
        ORDER BY r.created_at DESC
      `);
      const dbReviews = Array.isArray(revResult) ? revResult : (revResult as any).rows || [];
      if (dbReviews.length > 0) {
        parsedLoyalty.reviews = dbReviews;
      }
    } catch (revErr) {
      console.warn('⚠️ No se pudieron leer reviews:', revErr);
    }

    return res.status(200).json({
      success: true,
      tenant: {
        ...tenant,
        loyaltyConfig: parsedLoyalty
      }
    });
  } catch (error: any) {
    return res.status(200).json({ 
      success: true, 
      tenant: { 
        id: req.headers['x-tenant-id'] || '123e4567-e89b-12d3-a456-426614174000', 
        name: 'AutoFlow Central', 
        niche: 'automotive' 
      } 
    });
  }
}

// 3. Actualizar configuración del tenant + Sincronizar Campañas (Activas/Inactivas) y Reseñas
export async function updateTenantConfig(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Falta x-tenant-id en los headers' });
    }

    const { business_hours, portfolio, portfolio_images, loyaltyConfig } = req.body;
    const updateData: any = {};
    
    if (business_hours !== undefined) updateData.businessHours = business_hours;
    
    const newPortfolio = portfolio || portfolio_images;
    if (newPortfolio !== undefined) updateData.portfolio = newPortfolio;

    if (loyaltyConfig !== undefined) {
      const cleanLoyalty = safeParseJSON(loyaltyConfig);

      // =====================================================================
      // 📢 1. SINCRONIZAR CAMPAÑAS (INSERTAR NUEVAS Y ACTUALIZAR ACTIVA/INACTIVA)
      // =====================================================================
      if (Array.isArray(cleanLoyalty.campaigns) && cleanLoyalty.campaigns.length > 0) {
        for (let i = 0; i < cleanLoyalty.campaigns.length; i++) {
          const camp = cleanLoyalty.campaigns[i];
          if (!camp || !camp.title || !camp.message) continue;
          const isActiveBool = camp.is_active !== false;
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(camp.id || ''));

          try {
            if (isUuid) {
              // Actualizar estado is_active de una campaña existente en PostgreSQL
              await db.execute(sql`
                UPDATE public.push_campaigns
                SET is_active = ${isActiveBool},
                    title = ${camp.title},
                    message = ${camp.message},
                    target_audience = ${camp.target_audience || 'all_clients'}
                WHERE id = ${camp.id}::uuid AND tenant_id = ${tenantId}::uuid
              `);
            } else {
              // Verificar si ya existe por título y mensaje
              const existingCheck = await db.execute(sql`
                SELECT id FROM public.push_campaigns
                WHERE tenant_id = ${tenantId}::uuid
                  AND title = ${camp.title}
                  AND message = ${camp.message}
                LIMIT 1
              `);
              const existingRows = Array.isArray(existingCheck) ? existingCheck : (existingCheck as any).rows || [];

              if (existingRows.length > 0) {
                cleanLoyalty.campaigns[i].id = existingRows[0].id;
                await db.execute(sql`
                  UPDATE public.push_campaigns
                  SET is_active = ${isActiveBool}
                  WHERE id = ${existingRows[0].id}::uuid
                `);
              } else {
                // Insertar campaña nueva y disparar notificación push desde local
                const insertedResult = await db.execute(sql`
                  INSERT INTO public.push_campaigns (tenant_id, title, message, target_audience, is_active, sent_at)
                  VALUES (
                    ${tenantId}::uuid,
                    ${camp.title},
                    ${camp.message},
                    ${camp.target_audience || 'all_clients'},
                    ${isActiveBool},
                    NOW()
                  )
                  RETURNING id, tenant_id, title, message, target_audience, is_active, sent_at
                `);
                const insertedRows = Array.isArray(insertedResult) ? insertedResult : (insertedResult as any).rows || [];
                if (insertedRows[0]) {
                  cleanLoyalty.campaigns[i] = insertedRows[0];
                  if (isActiveBool) {
                    dispatchLocalPushNotifications(tenantId, camp.title, camp.message, camp.target_audience || 'all_clients');
                  }
                }
              }
            }
          } catch (errCamp) {
            console.error('⚠️ Error sincronizando campaña:', errCamp);
          }
        }
      }

      // =====================================================================
      // ⭐ 2. SINCRONIZAR RESEÑAS Y LIKES/DISLIKES CON LA TABLA public.reviews
      // =====================================================================
      if (Array.isArray(cleanLoyalty.reviews) && cleanLoyalty.reviews.length > 0) {
        const latestRev = cleanLoyalty.reviews[0];
        if (latestRev) {
          try {
            let resolvedClientId: string | null = null;
            const rawKey = String(latestRev.clientKey || latestRev.workOrderId || '').trim();
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawKey);

            if (isUuid) {
              const [uById] = await db.select().from(users).where(and(eq(users.id, rawKey), eq(users.tenantId, tenantId)));
              if (uById) resolvedClientId = uById.id;
            }

            if (!resolvedClientId && rawKey) {
              const cleanDigits = extractCleanPhone(rawKey);
              if (cleanDigits.length >= 7) {
                const [uByPhone] = await db.select().from(users).where(
                  and(
                    eq(users.tenantId, tenantId),
                    sql`regexp_replace(${users.phone}, '[^0-9]', '', 'g') LIKE ${'%' + cleanDigits + '%'}`
                  )
                );
                if (uByPhone) resolvedClientId = uByPhone.id;
              }
            }

            if (!resolvedClientId && latestRev.clientName) {
              const [uByName] = await db.select().from(users).where(
                and(
                  eq(users.tenantId, tenantId),
                  sql`LOWER(${users.name}) = ${String(latestRev.clientName).toLowerCase().trim()}`
                )
              );
              if (uByName) resolvedClientId = uByName.id;
            }

            if (resolvedClientId) {
              const ratingNum = Number(latestRev.rating || 5);
              const reactionStr = latestRev.reaction || (ratingNum >= 4 ? 'like' : 'dislike');
              const likesCount = reactionStr === 'like' ? 1 : 0;
              const dislikesCount = reactionStr === 'dislike' ? 1 : 0;
              const commentStr = latestRev.comment || '';

              await db.execute(sql`
                INSERT INTO public.reviews (tenant_id, client_id, rating, reaction, comment, likes, dislikes, created_at)
                VALUES (
                  ${tenantId}::uuid,
                  ${resolvedClientId}::uuid,
                  ${ratingNum},
                  ${reactionStr},
                  ${commentStr},
                  ${likesCount},
                  ${dislikesCount},
                  NOW()
                )
                ON CONFLICT (tenant_id, client_id)
                DO UPDATE SET
                  rating = EXCLUDED.rating,
                  reaction = EXCLUDED.reaction,
                  comment = EXCLUDED.comment,
                  likes = EXCLUDED.likes,
                  dislikes = EXCLUDED.dislikes,
                  created_at = NOW()
              `);
            }
          } catch (errRev) {
            console.error('⚠️ Error sincronizando public.reviews:', errRev);
          }
        }
      }

      updateData.loyaltyConfig = cleanLoyalty;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No hay datos válidos para actualizar' });
    }

    const [updatedTenant] = await db.update(tenants)
      .set(updateData)
      .where(eq(tenants.id, tenantId))
      .returning();

    if (!updatedTenant) {
      return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
    }

    return res.status(200).json({ success: true, tenant: updatedTenant });
  } catch (error: any) {
    console.error('❌ Error al actualizar config del tenant:', error);
    return res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
}

// 🔐 Autenticación segura del Portal Interno por Tenant (Verifica Hash scrypt en tenants y users)
export async function authenticateTenantStaff(req: Request, res: Response) {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || req.body.tenantId;
    const { email, password } = req.body;

    if (!tenantId || !password) {
      return res.status(400).json({ success: false, message: 'Faltan credenciales para validar el acceso.' });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Negocio no encontrado.' });
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const tenantAdminEmail = String((tenant as any).adminEmail || (tenant as any).admin_email || '').trim().toLowerCase();
    const tenantPasswordHash = (tenant as any).adminPasswordHash || (tenant as any).admin_password_hash || null;
    const tenantPinHash = (tenant as any).portalPinHash || (tenant as any).portal_pin_hash || null;

    // 1. Validar contra admin_password_hash del tenant
    if (tenantPasswordHash) {
      const emailMatches = !cleanEmail || !tenantAdminEmail || cleanEmail === tenantAdminEmail;
      if (emailMatches && verifyPasswordScrypt(String(password), tenantPasswordHash)) {
        return res.status(200).json({
          success: true,
          message: 'Acceso autorizado al Portal Interno',
          tenantName: tenant.name,
          adminEmail: tenantAdminEmail,
        });
      }
    }

    // 2. Validar contra portal_pin_hash si configuró PIN
    if (tenantPinHash && verifyPasswordScrypt(String(password), tenantPinHash)) {
      return res.status(200).json({
        success: true,
        message: 'Acceso autorizado por PIN del negocio',
        tenantName: tenant.name,
      });
    }

    // 3. Validar contra la tabla public.users (rol owner / staff)
    if (cleanEmail) {
      const [userRow] = await db
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.email, cleanEmail)));

      if (userRow && (userRow as any).passwordHash) {
        if (verifyPasswordScrypt(String(password), (userRow as any).passwordHash)) {
          await db.execute(sql`
            UPDATE public.users
            SET failed_login_attempts = 0, last_login_at = NOW()
            WHERE id = ${userRow.id}::uuid
          `);
          return res.status(200).json({
            success: true,
            message: 'Acceso autorizado al Portal Interno',
            tenantName: tenant.name,
            adminEmail: cleanEmail,
          });
        } else {
          await db.execute(sql`
            UPDATE public.users
            SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1
            WHERE id = ${userRow.id}::uuid
          `);
        }
      }
    }

    // 4. Fallback solo para negocios antiguos que aún tienen admin_password_hash en NULL
    if (!tenantPasswordHash && String(password) === '1234') {
      return res.status(200).json({
        success: true,
        message: 'Acceso autorizado (negocio sin contraseña configurada aún)',
        tenantName: tenant.name,
      });
    }

    return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos.' });
  } catch (error: any) {
    console.error('Error en autenticación de staff:', error);
    return res.status(500).json({ success: false, message: error.message || String(error) });
  }
}