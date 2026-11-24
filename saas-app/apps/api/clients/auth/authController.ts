import { Request, Response, Router } from 'express';
import { db, users, appointments, services, vehicles, workOrders } from '@taller/database';
import { eq, and, inArray, sql } from 'drizzle-orm';

const router = Router();

const safeParseJSON = (data: any): any => {
  if (!data) return {};
  if (typeof data === 'object') return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    } catch (_e) {
      return {};
    }
  }
  return {};
};

export async function handleClientAuth(req: Request, res: Response) {
  try {
    const headerTenant = (req.headers['x-tenant-id'] as string) || '';
    const bodyTenant = (req.body?.tenantId as string) || '';
    const tenantId = headerTenant || bodyTenant;
    const { provider, email, appleUserId, fullName, phone, updateProfile } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Falta identificador del negocio (x-tenant-id).' });
    }

    const cleanProvider = String(provider || 'google').toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanAppleId = String(appleUserId || '').trim();

    let matchedUser: any = null;

    const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));

    if (cleanEmail) {
      matchedUser =
        tenantUsers.find((u: any) => String(u.email || '').trim().toLowerCase() === cleanEmail) || null;
    }
    if (!matchedUser && cleanAppleId) {
      matchedUser =
        tenantUsers.find((u: any) => {
          const m = safeParseJSON(u.metadata);
          return m?.appleUserId === cleanAppleId || (u as any)?.appleUserId === cleanAppleId;
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
            name: String(fullName || '').trim() || globalUser.name || 'Cliente Verificado',
            email: cleanEmail || globalUser.email,
            phone: globalUser.phone || '',
            role: 'client',
            metadata: {
              authProvider: cleanProvider,
              ...(cleanAppleId ? { appleUserId: cleanAppleId } : {}),
            },
          } as any)
          .returning();
        matchedUser = createdLocal;
      }
    }

    if (!matchedUser) {
      return res.status(404).json({
        success: false,
        notRegistered: true,
        error: `Cuenta ${cleanProvider === 'google' ? 'Google' : 'iOS'} verificada${cleanEmail ? ` (${cleanEmail})` : ''}, pero aún no está vinculada a un expediente en la base de datos.`,
      });
    }

    if (updateProfile) {
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

    const apts = await db.select().from(appointments).where(eq(appointments.clientId, matchedUser.id));
    let rawOrders: any[] = [];
    if (apts.length > 0) {
      rawOrders = await db
        .select({
          wo: workOrders,
          svc: services,
        })
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
    console.error('Error en handleClientAuth:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

router.post('/', handleClientAuth);

export default router;
