import crypto from 'crypto';
import { Request, Response } from 'express';
import { eq, and, inArray, sql } from 'drizzle-orm';

export const hashClientPassword = (plainPassword: string): string => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plainPassword), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
};

export const verifyClientPassword = (plainPassword: string, storedHash?: string | null): boolean => {
  if (!plainPassword || !storedHash) return false;
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
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

export async function authenticateClientUserHandler(
  req: Request,
  res: Response,
  deps: { db: any; users: any; appointments: any; services: any; vehicles: any; workOrders: any; safeParseJSON: (v: any) => any }
) {
  const { db, users, appointments, services, vehicles, workOrders, safeParseJSON } = deps;
  try {
    const headerTenant = (req.headers['x-tenant-id'] as string) || '';
    const bodyTenant = (req.body?.tenantId as string) || '';
    const tenantId = headerTenant || bodyTenant;
    const { provider, email, password, appleUserId, fullName, setPasswordIfEmpty } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Falta identificador del negocio (x-tenant-id).' });
    }

    const cleanProvider = String(provider || 'manual').toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanAppleId = String(appleUserId || '').trim();

    try {
      await db.execute(sql`
        ALTER TABLE public.users
          ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(30) DEFAULT 'manual',
          ADD COLUMN IF NOT EXISTS is_verified_provider BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS apple_user_id VARCHAR(255)
      `);
    } catch (_colErr) {}

    const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
    let matchedUser: any = null;

    if (cleanEmail) {
      matchedUser = tenantUsers.find((u: any) => String(u.email || '').trim().toLowerCase() === cleanEmail) || null;
    }
    if (!matchedUser && cleanAppleId) {
      matchedUser =
        tenantUsers.find((u: any) => {
          const m = safeParseJSON(u.metadata);
          return m?.appleUserId === cleanAppleId || u?.appleUserId === cleanAppleId;
        }) || null;
    }

    if (!matchedUser && (cleanProvider === 'apple' || cleanProvider === 'google')) {
      const allUsers = await db.select().from(users);
      let globalUser: any = null;
      if (cleanEmail) {
        globalUser = allUsers.find((u: any) => String(u.email || '').trim().toLowerCase() === cleanEmail) || null;
      }
      if (!globalUser && cleanAppleId) {
        globalUser = allUsers.find((u: any) => safeParseJSON(u.metadata)?.appleUserId === cleanAppleId) || null;
      }

      if (globalUser) {
        const [createdLocal] = await db
          .insert(users)
          .values({
            tenantId,
            name: fullName?.trim() || globalUser.name || 'Cliente Verificado',
            email: cleanEmail || globalUser.email,
            phone: globalUser.phone || '',
            role: 'client',
            metadata: {
              authProvider: cleanProvider,
              ...(cleanAppleId ? { appleUserId: cleanAppleId } : {}),
            },
          })
          .returning();
        matchedUser = createdLocal;
      }
    }

    if (!matchedUser && cleanEmail) {
      const allUsers = await db.select().from(users);
      const anyTenantUser =
        allUsers.find((u: any) => String(u.email || '').trim().toLowerCase() === cleanEmail) || null;
      if (anyTenantUser) {
        if (cleanProvider === 'apple' || cleanProvider === 'google') {
          const [syncedUser] = await db
            .insert(users)
            .values({
              tenantId,
              name: fullName?.trim() || anyTenantUser.name || 'Cliente Verificado',
              email: cleanEmail,
              phone: anyTenantUser.phone || '',
              role: 'client',
              metadata: {
                ...safeParseJSON(anyTenantUser.metadata),
                authProvider: cleanProvider,
                ...(cleanAppleId ? { appleUserId: cleanAppleId } : {}),
              },
            })
            .returning();
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
        error:
          cleanProvider === 'manual'
            ? 'No encontramos una cuenta con ese correo electrónico. Verifica tu correo o regístrate al reservar tu primera cita.'
            : `Cuenta ${cleanProvider === 'apple' ? 'iOS (Apple)' : 'Google'} verificada${cleanEmail ? ` (${cleanEmail})` : ''}, pero aún no está vinculada a un expediente en la base de datos. Reserva tu primera cita o ingresa con tu Usuario (Correo y Contraseña).`,
      });
    }

    const userMeta = safeParseJSON(matchedUser.metadata);

    if (cleanProvider === 'manual') {
      const cleanPass = String(password || '').trim();
      if (!cleanPass) {
        return res.status(400).json({ success: false, error: 'Ingresa tu contraseña para acceder al expediente.' });
      }
      if (userMeta?.passwordHash) {
        const isValid = verifyClientPassword(cleanPass, userMeta.passwordHash);
        if (!isValid) {
          return res.status(401).json({ success: false, error: 'Contraseña incorrecta. Intenta nuevamente.' });
        }
      } else if (setPasswordIfEmpty) {
        const newHash = hashClientPassword(cleanPass);
        const [updatedWithPass] = await db
          .update(users)
          .set({ metadata: { ...userMeta, authProvider: 'manual', passwordHash: newHash } })
          .where(eq(users.id, matchedUser.id))
          .returning();
        matchedUser = updatedWithPass;
      } else {
        return res.status(401).json({
          success: false,
          needsPasswordSetup: true,
          error: 'Tu cuenta aún no tiene contraseña asignada. Activa "Crear contraseña ahora" o ingresa con iOS / Google.',
        });
      }
    } else if (userMeta?.authProvider !== cleanProvider || (cleanAppleId && !userMeta?.appleUserId)) {
      const [updatedOauth] = await db
        .update(users)
        .set({
          metadata: {
            ...userMeta,
            authProvider: cleanProvider,
            ...(cleanAppleId ? { appleUserId: cleanAppleId } : {}),
          },
        })
        .where(eq(users.id, matchedUser.id))
        .returning();
      matchedUser = updatedOauth;
    }

    const apts = await db.select().from(appointments).where(eq(appointments.clientId, matchedUser.id));
    let rawOrders: any[] = [];
    if (apts.length > 0) {
      rawOrders = await db
        .select({ wo: workOrders, svc: services })
        .from(workOrders)
        .innerJoin(appointments, eq(workOrders.appointmentId, appointments.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(inArray(workOrders.appointmentId, apts.map((a: any) => a.id)))
        .orderBy(workOrders.createdAt);
    }

    const [vehicleRecord] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.clientId, matchedUser.id)));

    const safeClientOut = {
      ...matchedUser,
      metadata: (() => {
        const m = safeParseJSON(matchedUser.metadata);
        delete m.passwordHash;
        return m;
      })(),
    };

    return res.status(200).json({
      success: true,
      client: safeClientOut,
      vehicle: vehicleRecord || null,
      serviceHistory: rawOrders.map((row: any) => ({ ...row.wo, service: row.svc })),
    });
  } catch (error: any) {
    console.error('Error en authenticateClientUserHandler:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
