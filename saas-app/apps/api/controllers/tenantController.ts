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
    const hashedPin = portalPin && String(portalPin).trim() ? hashPasswordScrypt(String(portalPin).trim()) : null;
    const tenantUuid = id || crypto.randomUUID();

    // Si el frontend no mandó lat/lon pero hay un zipCode, calculamos las coordenadas en el BACKEND automáticamente
    let finalLat = req.body.latitude ? String(req.body.latitude) : null;
    let finalLon = req.body.longitude ? String(req.body.longitude) : null;
    const cleanZip = zipCode ? String(zipCode).trim() : '';

    if ((!finalLat || !finalLon) && cleanZip.length === 5) {
      try {
        const zipRes = await fetch(`https://api.zippopotam.us/us/${cleanZip}`);
        if (zipRes.ok) {
          const zipData = await zipRes.json();
          if (zipData && zipData.places && zipData.places.length > 0) {
            finalLat = String(zipData.places[0].latitude);
            finalLon = String(zipData.places[0].longitude);
          }
        }
      } catch (_e) {}
    }

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
      zipCode: cleanZip || null,
      latitude: finalLat,
      longitude: finalLon,
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

    // 2. Validar contra portal_pin_hash (Código de Acceso para Empleados configurado al crear el negocio)
    if (tenantPinHash) {
      if (verifyPasswordScrypt(String(password).trim(), tenantPinHash)) {
        return res.status(200).json({
          success: true,
          role: 'staff',
          message: 'Acceso autorizado para personal operativo',
          tenantName: tenant.name,
        });
      }
      // Si el negocio ya tiene su propio PIN configurado y no se envió email, no permitir '1234' por defecto
      if (!cleanEmail) {
        return res.status(401).json({
          success: false,
          message: 'Código de acceso de empleado incorrecto.',
        });
      }
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

    // 4. Fallback solo para negocios antiguos que aún tienen portal_pin_hash y admin_password_hash en NULL
    if (!tenantPinHash && !tenantPasswordHash && String(password).trim() === '1234') {
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

// 🔑 Login Global de Dueño/Administrador en "Soy un Negocio" (Devuelve todos los negocios creados con ese correo y valida su contraseña)
export async function loginOwnerAccount(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const rawPassword = String(password || '');

    if (!cleanEmail || !rawPassword) {
      return res.status(400).json({ success: false, message: 'Por favor ingresa tu correo y contraseña.' });
    }

    // Buscar todos los negocios registrados con ese admin_email (o en public.users con rol owner)
    const allTenants = await db.select().from(tenants);
    const matchedTenants = allTenants.filter(
      (t: any) => String(t.adminEmail || t.admin_email || '').trim().toLowerCase() === cleanEmail
    );

    if (matchedTenants.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No encontramos negocios registrados con este correo electrónico.',
      });
    }

    // Verificar que la contraseña coincida con al menos uno de sus negocios (o usuario owner)
    const validTenants = matchedTenants.filter((t: any) => {
      const hash = t.adminPasswordHash || t.admin_password_hash || t.password;
      if (!hash) return false;
      return verifyPasswordScrypt(rawPassword, hash);
    });

    if (validTenants.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Contraseña incorrecta para esta cuenta administradora.',
      });
    }

    return res.status(200).json({
      success: true,
      adminEmail: cleanEmail,
      tenants: validTenants.map((t: any) => ({
        id: t.id,
        name: t.name,
        niche: t.niche,
        city: t.city,
        state: t.state,
        zipCode: t.zipCode,
        logoUrl: t.logoUrl,
        primaryColor: t.primaryColor || '#FF5E00',
        planTier: t.planTier || 'starter',
      })),
    });
  } catch (error: any) {
    console.error('❌ Error en loginOwnerAccount:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error interno del servidor.' });
  }
}


// 🔍 Buscador en el Directorio con Haversine (15 millas a la redonda por defecto y soporte de coordenadas lat/lon)
export async function searchDirectory(req: Request, res: Response) {
  try {
    const { locationQuery, radius, niche } = req.query;
    const cleanQuery = String(locationQuery || '').trim().toLowerCase();
    const maxRadius = Number(radius) || 15; // 15 millas a la redonda por defecto
    const targetNiche = String(niche || 'all').trim().toLowerCase();

    // 1. Obtener todos los tenants activos
    let allTenants = await db.select().from(tenants);
    allTenants = allTenants.filter((t: any) => {
      const status = String(t.subscriptionStatus || t.subscription_status || 'active').toLowerCase();
      const activeFlag = t.isActive !== false && t.is_active !== false;
      return status === 'active' && activeFlag;
    });

    if (targetNiche && targetNiche !== 'all') {
      allTenants = allTenants.filter((t: any) => String(t.niche || '').toLowerCase() === targetNiche);
    }

    // 2. Si el usuario ingresó un Zip Code (5 dígitos) o Ciudad, obtenemos sus coordenadas desde Zippopotam.us o filtramos
    let centerLat: number | null = null;
    let centerLon: number | null = null;

    if (cleanQuery.length === 5 && /^\d{5}$/.test(cleanQuery)) {
      try {
        const zipRes = await fetch(`https://api.zippopotam.us/us/${cleanQuery}`);
        if (zipRes.ok) {
          const zipData = await zipRes.json();
          if (zipData && zipData.places && zipData.places.length > 0) {
            centerLat = Number(zipData.places[0].latitude);
            centerLon = Number(zipData.places[0].longitude);
          }
        }
      } catch (_e) {}
    }

    // Fórmula Haversine para calcular distancia exacta en millas entre dos coordenadas (lat1, lon1) y (lat2, lon2)
    const calculateHaversineMiles = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const toRad = (x: number) => (x * Math.PI) / 180;
      const R = 3958.8; // Radio de la Tierra en millas
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    let matchedTenants = allTenants;

    if (centerLat !== null && centerLon !== null) {
      // Filtrar estrictamente por el radio (ej. 15 millas) usando Haversine
      matchedTenants = allTenants.filter((t: any) => {
        const tLat = Number(t.latitude);
        const tLon = Number(t.longitude);
        if (!tLat || !tLon) {
          // Si el negocio no tiene lat/lon pero coincide el zip code, lo incluimos
          const zip = String(t.zipCode || t.zip_code || '').trim().toLowerCase();
          return zip === cleanQuery;
        }
        const dist = calculateHaversineMiles(centerLat!, centerLon!, tLat, tLon);
        return dist <= maxRadius;
      });
    } else if (cleanQuery) {
      // Búsqueda por texto (Ciudad, Estado o Nombre)
      matchedTenants = allTenants.filter((t: any) => {
        const zip = String(t.zipCode || t.zip_code || '').trim().toLowerCase();
        const city = String(t.city || '').trim().toLowerCase();
        const state = String(t.state || '').trim().toLowerCase();
        const name = String(t.name || '').trim().toLowerCase();
        return zip.includes(cleanQuery) || city.includes(cleanQuery) || state.includes(cleanQuery) || name.includes(cleanQuery);
      });
    }

    // Mapear resultados con distancia calculada
    const results = matchedTenants.map((t: any) => {
      const nicheCode = String(t.niche || 'automotive').toLowerCase();
      let label = 'Taller Automotriz';
      if (nicheCode === 'spa') label = 'Spa & Bienestar';
      else if (nicheCode === 'barbershop') label = 'Barbería Clásica';
      else if (nicheCode === 'legal') label = 'Firma Legal / Abogados';
      else if (nicheCode === 'dental') label = 'Clínica Odontológica';

      let distanceStr = '2.4';
      if (centerLat !== null && centerLon !== null && t.latitude && t.longitude) {
        const d = calculateHaversineMiles(centerLat, centerLon, Number(t.latitude), Number(t.longitude));
        distanceStr = d.toFixed(1);
      }

      return {
        id: t.id,
        name: t.name,
        niche: nicheCode,
        city: t.city || 'Rancho Cucamonga',
        state: t.state || 'CA',
        zipCode: t.zipCode || t.zip_code || '91730',
        logoUrl: t.logoUrl || t.logo_url,
        primaryColor: t.primaryColor || t.primary_color || '#FF5E00',
        distance: distanceStr,
        label,
        icon: nicheCode === 'spa' ? 'sparkles' : nicheCode === 'barbershop' ? 'scissors' : nicheCode === 'legal' ? 'shield' : nicheCode === 'dental' ? 'tooth' : 'car',
        latitude: t.latitude,
        longitude: t.longitude,
        loyaltyConfig: t.loyaltyConfig || t.loyalty_config,
      };
    });

    // Ordenar por distancia de menor a mayor
    results.sort((a, b) => Number(a.distance) - Number(b.distance));

    return res.status(200).json({ success: true, data: results });
  } catch (error: any) {
    console.error('❌ Error en searchDirectory:', error);
    return res.status(500).json({ success: false, message: error.message || String(error) });
  }
}
