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

export async function handleClientAnonymize(req: Request, res: Response) {
  try {
    const headerTenant = (req.headers['x-tenant-id'] as string) || '';
    const bodyTenant = (req.body?.tenantId as string) || '';
    const tenantId = headerTenant || bodyTenant || null;
    const {
      id,
      clientId,
      email,
      reasonCode,
      reasonLabel,
      customFeedback,
      appointmentsCount,
    } = req.body || {};

    const targetId = String(id || clientId || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!targetId && !cleanEmail) {
      return res.status(400).json({ success: false, error: 'Se requiere id o email del cliente.' });
    }

    let targetUser: any = null;
    if (targetId) {
      const found = await db.select().from(users).where(eq(users.id, targetId));
      targetUser = found[0] || null;
    }
    if (!targetUser && cleanEmail) {
      const byEmail = await db
        .select()
        .from(users)
        .where(
          tenantId
            ? and(eq(users.tenantId, tenantId), eq(users.email, cleanEmail))
            : eq(users.email, cleanEmail)
        );
      targetUser = byEmail[0] || null;
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado.' });
    }

    const userUuid = String(targetUser.id);
    const effectiveTenantId = tenantId || (targetUser.tenantId ? String(targetUser.tenantId) : null);

    // 1. Asegurar tabla de log de motivos sin PII (account_deletion_logs) y registrar el motivo
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS public.account_deletion_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        user_id UUID,
        role VARCHAR(30) DEFAULT 'client',
        reason_code VARCHAR(60) NOT NULL,
        reason_label TEXT NOT NULL,
        custom_feedback TEXT,
        appointments_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const finalReasonCode = String(reasonCode || 'unspecified').trim().slice(0, 60);
    const finalReasonLabel = String(reasonLabel || 'No especificado').trim();
    const finalFeedback = customFeedback ? String(customFeedback).trim().slice(0, 500) : null;
    const aptCountNum = Number.isFinite(Number(appointmentsCount)) ? Number(appointmentsCount) : 0;

    await db.execute(sql`
      INSERT INTO public.account_deletion_logs (
        tenant_id, user_id, role, reason_code, reason_label, custom_feedback, appointments_count, created_at
      )
      VALUES (
        ${effectiveTenantId ? sql`${effectiveTenantId}::uuid` : sql`NULL`},
        ${userUuid}::uuid,
        'client',
        ${finalReasonCode},
        ${finalReasonLabel},
        ${finalFeedback},
        ${aptCountNum},
        NOW()
      )
    `);

    // 1b. Registrar evento en public.audit_logs si existe la tabla en BD (sin PII)
    try {
      await db.execute(sql`
        INSERT INTO public.audit_logs (
          tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
        )
        VALUES (
          ${effectiveTenantId ? sql`${effectiveTenantId}::uuid` : sql`NULL`},
          ${userUuid}::uuid,
          'account_anonymized',
          'user',
          ${userUuid},
          ${JSON.stringify({
            role: 'client',
            reasonCode: finalReasonCode,
            reasonLabel: finalReasonLabel,
            appointmentsCount: aptCountNum,
          })}::jsonb,
          NOW()
        )
      `);
    } catch (_auditErr) {
      // Si la tabla audit_logs tiene otro esquema de columnas en BD, insertar en columnas estándar seguras
      await db.execute(sql`
        INSERT INTO public.audit_logs (action, details, created_at)
        VALUES (
          'account_anonymized',
          ${`user=${userUuid} tenant=${effectiveTenantId || 'none'} reason=${finalReasonCode}`},
          NOW()
        )
      `).catch(() => {});
    }

    // 1c. Notificación por correo electrónico de confirmación de eliminación/anonimización (si RESEND_API_KEY está configurado)
    const originalEmail = String(targetUser.email || '').trim().toLowerCase();
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && originalEmail && !originalEmail.endsWith('@anonymized.local')) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'PickTime Book <no-reply@picktimebook.com>',
            to: [originalEmail],
            subject: 'Confirmación de eliminación y anonimización de cuenta',
            html: `<p>Hola,</p><p>Te confirmamos que tu solicitud de eliminación de cuenta fue procesada y tus datos personales fueron anonimizados.</p><p><strong>Motivo registrado:</strong> ${finalReasonLabel}</p><p>El historial operativo del negocio se conserva de forma anonimizada sin datos personales.</p>`,
          }),
        });
      } catch (_mailErr) {
        console.warn('⚠️ No se pudo enviar el correo de confirmación de eliminación:', _mailErr);
      }
    }

    // 2. Desactivar dispositivos y limpiar tokens push en public.user_devices
    await db.execute(sql`
      UPDATE public.user_devices
      SET is_active = FALSE, push_token = NULL, expo_push_token = NULL, last_used_at = NOW()
      WHERE user_id = ${userUuid}::uuid
    `).catch(() => {});

    // 3. Limpiar URLs de imágenes sensibles en work_orders asociadas a las citas del cliente sin borrar registros contables
    const clientApts = await db.select().from(appointments).where(eq(appointments.clientId, userUuid));
    const aptIdsList = clientApts.map((a: any) => String(a.id)).filter(Boolean);
    if (aptIdsList.length > 0) {
      await db.execute(sql`
        UPDATE public.work_orders
        SET old_part_image_url = NULL,
            new_part_image_url = NULL
        WHERE appointment_id::text = ANY(${aptIdsList})
      `).catch(() => {});
    }

    // 4. Anonimizar registro en public.users (manteniendo integridad referencial)
    const anonEmail = `deleted_${userUuid.slice(0, 8)}_${Date.now()}@anonymized.local`;
    await db
      .update(users)
      .set({
        name: 'Anónimo',
        email: anonEmail,
        phone: '',
        metadata: {
          anonymized: true,
          anonymizedAt: new Date().toISOString(),
          deletionReasonCode: finalReasonCode,
        },
      } as any)
      .where(eq(users.id, userUuid));

    await db.execute(sql`
      UPDATE public.users
      SET password_hash = NULL,
          apple_user_id = NULL
      WHERE id = ${userUuid}::uuid
    `).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Cuenta anonimizada y motivo registrado correctamente.',
    });
  } catch (error: any) {
    console.error('Error en handleClientAnonymize:', error);
    return res.status(500).json({ success: false, error: error.message || 'Error anonimizando cuenta.' });
  }
}

router.post('/', handleClientAuth);
router.post('/anonymize', handleClientAnonymize);

export default router;
