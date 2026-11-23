import { Request, Response } from 'express';
import { db, services, tenants } from '@taller/database';
import { eq, and } from 'drizzle-orm';
import { notifyNearbyClientsPush, sendTelegramNotification } from './appointmentController';

// 1. Listar todos los servicios del catálogo del tenant actual
export async function getServices(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers (x-tenant-id).' });
    }

    const tenantServices = await db.select()
      .from(services)
      .where(eq(services.tenantId, tenantId));

    return res.status(200).json({ success: true, services: tenantServices });
  } catch (error: any) {
    console.error('Error al obtener los servicios:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}

// 2. Crear un nuevo servicio en el catálogo del negocio + Notificar Push a clientes cercanos por ZIP/radio
export const createService = async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { name, description, price, durationMinutes, imageUrl } = req.body;

    if (!tenantId || !name || !price) {
      return res.status(400).json({ success: false, message: 'Faltan datos obligatorios' });
    }

    const [createdService] = await db.insert(services).values({
      tenantId,
      name: name.trim(),
      description: description ? description.trim() : null,
      price: String(price),
      durationMinutes: Number(durationMinutes || 30),
      imageUrl: imageUrl || null
    }).returning();

    // Disparar en segundo plano Push a clientes en el código postal / radio cercano + aviso Telegram
    (async () => {
      try {
        const [tenantRow] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
        if (tenantRow && createdService) {
          const tAny = tenantRow as any;
          const zipCode = tAny.zipCode || tAny.zip_code || null;
          const latitude = tAny.latitude ?? null;
          const longitude = tAny.longitude ?? null;

          await Promise.allSettled([
            notifyNearbyClientsPush({
              zipCode,
              latitude,
              longitude,
              payload: {
                title: `✨ Nuevo servicio en ${tenantRow.name}`,
                body: `${createdService.name} por $${createdService.price}. ¡Reserva tu turno hoy!`,
                data: {
                  tenantId: tenantRow.id,
                  serviceId: createdService.id,
                  view: 'servicios',
                },
              },
            }),
            sendTelegramNotification(
              `🆕 <b>Nuevo servicio publicado en catálogo:</b> ${createdService.name} ($${createdService.price})`,
              tenantId,
              'system'
            ),
          ]);
        }
      } catch (bgErr) {
        console.warn('⚠️ Aviso enviando push de nuevo servicio:', bgErr);
      }
    })();

    return res.status(201).json({ success: true, service: createdService });
  } catch (error) {
    console.error("Error creando servicio:", error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

// 3. Actualizar un servicio existente asegurando que pertenezca al tenant
export async function updateService(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers (x-tenant-id).' });
    }

    const { name, description, price, durationMinutes, category, isActive, imageUrl } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (price !== undefined) updateData.price = String(price);
    if (durationMinutes !== undefined) updateData.durationMinutes = Number(durationMinutes);
    if (category !== undefined) updateData.category = category.trim();
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: 'No se enviaron datos válidos para actualizar.' });
    }

    const [updatedService] = await db.update(services)
      .set(updateData)
      .where(
        and(
          eq(services.id, id),
          eq(services.tenantId, tenantId)
        )
      )
      .returning();

    if (!updatedService) {
      return res.status(404).json({ success: false, error: 'Servicio no encontrado o no pertenece a este tenant.' });
    }

    return res.status(200).json({ success: true, service: updatedService });
  } catch (error: any) {
    console.error('Error al actualizar el servicio:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}

// 4. Eliminar un servicio del catálogo
export async function deleteService(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers (x-tenant-id).' });
    }

    const [deleted] = await db.delete(services)
      .where(
        and(
          eq(services.id, id),
          eq(services.tenantId, tenantId)
        )
      )
      .returning();

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Servicio no encontrado.' });
    }

    return res.status(200).json({ success: true, message: 'Servicio eliminado correctamente.' });
  } catch (error: any) {
    console.error('Error al eliminar el servicio:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}
