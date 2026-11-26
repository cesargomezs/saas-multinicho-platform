import { Request, Response } from 'express';
import { db } from '@taller/database';
import { sql } from 'drizzle-orm';

// 1. GET /api/notifications?role=client|business&userId=...&tenantId=...&staffId=...
export async function getNotifications(req: Request, res: Response) {
  try {
    const role = String(req.query.role || 'client').toLowerCase() === 'business' ? 'business' : 'client';
    const userId = String(req.query.userId || '').trim();
    const tenantId = String(req.query.tenantId || req.headers['x-tenant-id'] || '').trim();
    const staffId = String(req.query.staffId || '').trim();

    if (role === 'business') {
      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'tenantId requerido para bandeja de negocio.' });
      }

      // Limpieza automática de días anteriores para este negocio (sin borrar citas futuras)
      await db.execute(sql`
        UPDATE public.push_notifications
        SET is_deleted = true, is_read = true
        WHERE tenant_id = ${tenantId}::uuid
          AND role = 'business'
          AND is_deleted = false
          AND created_at < CURRENT_DATE
          AND (
            data->>'appointmentDate' IS NULL
            OR LEFT(data->>'appointmentDate', 10) < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
          )
      `);

      // Traer solo las de HOY + servicios/citas FUTURAS
      const result = await db.execute(sql`
        SELECT id, tenant_id AS "tenantId", user_id AS "userId", role, event_type AS "eventType",
               title, body, data, is_read AS "isRead", created_at AS "createdAt"
        FROM public.push_notifications
        WHERE tenant_id = ${tenantId}::uuid
          AND role = 'business'
          AND is_deleted = false
          AND (
            created_at >= CURRENT_DATE
            OR (
              data->>'appointmentDate' IS NOT NULL
              AND LEFT(data->>'appointmentDate', 10) >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
            )
          )
          AND (
            ${staffId === ''}
            OR data->>'staffId' IS NULL
            OR data->>'staffId' = ''
            OR data->>'staffId' = ${staffId}
          )
        ORDER BY created_at DESC
        LIMIT 50
      `);

      const rows = Array.isArray(result) ? result : (result as any).rows || [];
      return res.status(200).json({ success: true, notifications: rows });
    }

    // ROL CLIENTE: solo ve las que NO ha leído ni eliminado
    if (!userId) {
      return res.status(200).json({ success: true, notifications: [] });
    }

    const result = await db.execute(sql`
      SELECT id, tenant_id AS "tenantId", user_id AS "userId", role, event_type AS "eventType",
             title, body, data, is_read AS "isRead", created_at AS "createdAt"
      FROM public.push_notifications
      WHERE user_id = ${userId}::uuid
        AND role = 'client'
        AND is_deleted = false
        AND is_read = false
      ORDER BY created_at DESC
      LIMIT 50
    `);

    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    return res.status(200).json({ success: true, notifications: rows });
  } catch (error: any) {
    console.error('❌ Error en getNotifications:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error cargando notificaciones.' });
  }
}

// 2. PUT /api/notifications/read (Marca 1 o todas como leídas; si es cliente, también la quita de la bandeja)
export async function markNotificationsRead(req: Request, res: Response) {
  try {
    const { id, userId, tenantId, role } = req.body || {};
    const isClient = String(role || 'client').toLowerCase() !== 'business';

    if (id) {
      await db.execute(sql`
        UPDATE public.push_notifications
        SET is_read = true,
            is_deleted = CASE WHEN ${isClient} THEN true ELSE is_deleted END
        WHERE id = ${id}::uuid
      `);
      return res.status(200).json({ success: true });
    }

    if (isClient && userId) {
      await db.execute(sql`
        UPDATE public.push_notifications
        SET is_read = true, is_deleted = true
        WHERE user_id = ${userId}::uuid AND role = 'client' AND is_deleted = false
      `);
    } else if (!isClient && tenantId) {
      await db.execute(sql`
        UPDATE public.push_notifications
        SET is_read = true
        WHERE tenant_id = ${tenantId}::uuid AND role = 'business' AND is_deleted = false
      `);
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Error en markNotificationsRead:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

// 3. DELETE /api/notifications/:id (Swipe a la derecha o botón caneca)
export async function deleteNotificationById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'ID requerido.' });

    await db.execute(sql`
      UPDATE public.push_notifications
      SET is_deleted = true, is_read = true
      WHERE id = ${id}::uuid
    `);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

// 4. DELETE /api/notifications (Botón "Eliminar todas")
export async function deleteAllNotifications(req: Request, res: Response) {
  try {
    const { userId, tenantId, role } = req.body || {};
    const isClient = String(role || 'client').toLowerCase() !== 'business';

    if (isClient && userId) {
      await db.execute(sql`
        UPDATE public.push_notifications
        SET is_deleted = true, is_read = true
        WHERE user_id = ${userId}::uuid AND role = 'client' AND is_deleted = false
      `);
    } else if (!isClient && tenantId) {
      await db.execute(sql`
        UPDATE public.push_notifications
        SET is_deleted = true, is_read = true
        WHERE tenant_id = ${tenantId}::uuid AND role = 'business' AND is_deleted = false
      `);
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}