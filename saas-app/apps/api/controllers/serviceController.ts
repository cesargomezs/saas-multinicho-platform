import { Request, Response } from 'express';
import { db, services, tenants } from '@taller/database';
import { eq, and } from 'drizzle-orm';
import { notifyNearbyClientsPush, sendTelegramNotification } from './appointmentController';
import {
  buildBilingualServiceTranslations,
  ServiceTranslations,
} from '../src/services/translationService';

// 1. Listar todos los servicios del catálogo del tenant actual (incluye `translations` ES/EN)
export async function getServices(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers (x-tenant-id).' });
    }

    const tenantServices = await db
      .select()
      .from(services)
      .where(eq(services.tenantId, tenantId));

    return res.status(200).json({ success: true, services: tenantServices });
  } catch (error: any) {
    console.error('Error al obtener los servicios:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}

// 2. Crear un nuevo servicio en el catálogo del negocio (con traducción automática ES <-> EN) + Push y Telegram
export const createService = async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const {
      name,
      description,
      price,
      durationMinutes,
      imageUrl,
      sourceLang,
      translations: manualTranslations,
    } = req.body;

    if (!tenantId || !name || !price) {
      return res.status(400).json({ success: false, message: 'Faltan datos obligatorios' });
    }

    const cleanName = String(name).trim();
    const cleanDesc = description ? String(description).trim() : null;

    // Genera ambos idiomas (ES y EN) al momento de guardar, respetando ediciones manuales si vienen
    const translations = await buildBilingualServiceTranslations({
      name: cleanName,
      description: cleanDesc,
      sourceLang: sourceLang || 'es',
      manualTranslations: manualTranslations || null,
    });

    const [createdService] = await db
      .insert(services)
      .values({
        tenantId,
        name: cleanName,
        description: cleanDesc,
        price: String(price),
        durationMinutes: Number(durationMinutes || 30),
        imageUrl: imageUrl || null,
        translations,
      } as any)
      .returning();

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
                  eventType: 'new_service',
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
    console.error('Error creando servicio:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

// 3. Actualizar un servicio existente asegurando que pertenezca al tenant
//    - No llama al traductor si solo cambió `isActive`, `price`, `durationMinutes` o `imageUrl`.
//    - Si el dueño envió `translations` manuales, las guarda tal cual.
//    - Si cambió `name` o `description`, actualiza automáticamente ambos idiomas.
export async function updateService(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers (x-tenant-id).' });
    }

    const {
      name,
      description,
      price,
      durationMinutes,
      category,
      isActive,
      imageUrl,
      sourceLang,
      translations: manualTranslations,
    } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (description !== undefined) updateData.description = description ? String(description).trim() : null;
    if (price !== undefined) updateData.price = String(price);
    if (durationMinutes !== undefined) updateData.durationMinutes = Number(durationMinutes);
    if (category !== undefined) updateData.category = String(category).trim();
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

    const textChanged = name !== undefined || description !== undefined;

    if (manualTranslations && typeof manualTranslations === 'object') {
      // El dueño editó manualmente ES y/o EN: completar cualquier hueco faltante sin pisar sus cambios
      const [existing] = await db
        .select()
        .from(services)
        .where(and(eq(services.id, id), eq(services.tenantId, tenantId)));

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Servicio no encontrado o no pertenece a este tenant.' });
      }

      const prevTrans: ServiceTranslations = ((existing as any).translations || {}) as ServiceTranslations;
      const mergedManual: ServiceTranslations = {
        es: { ...(prevTrans.es || {}), ...(manualTranslations.es || {}) },
        en: { ...(prevTrans.en || {}), ...(manualTranslations.en || {}) },
      };

      updateData.translations = await buildBilingualServiceTranslations({
        name: updateData.name ?? existing.name,
        description: updateData.description !== undefined ? updateData.description : existing.description,
        sourceLang: sourceLang || 'es',
        manualTranslations: mergedManual,
      });
    } else if (textChanged) {
      const [existing] = await db
        .select()
        .from(services)
        .where(and(eq(services.id, id), eq(services.tenantId, tenantId)));

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Servicio no encontrado o no pertenece a este tenant.' });
      }

      const finalName = updateData.name ?? existing.name;
      const finalDesc = updateData.description !== undefined ? updateData.description : existing.description;
      const nameActuallyChanged = finalName !== existing.name;
      const descActuallyChanged = (finalDesc || '') !== (existing.description || '');
      const existingTrans = (existing as any).translations || {};
      const missingAnyLang = !existingTrans?.es?.name || !existingTrans?.en?.name;

      if (nameActuallyChanged || descActuallyChanged || missingAnyLang) {
        updateData.translations = await buildBilingualServiceTranslations({
          name: finalName,
          description: finalDesc,
          sourceLang: sourceLang || 'es',
        });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: 'No se enviaron datos válidos para actualizar.' });
    }

    const [updatedService] = await db
      .update(services)
      .set(updateData)
      .where(and(eq(services.id, id), eq(services.tenantId, tenantId)))
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

// 4. Backfill único: traduce todos los servicios antiguos del tenant que aún no tienen `translations` ES/EN
export async function backfillServiceTranslations(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const sourceLang = req.body?.sourceLang === 'en' ? 'en' : 'es';

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers (x-tenant-id).' });
    }

    const tenantServices = await db
      .select()
      .from(services)
      .where(eq(services.tenantId, tenantId));

    let updatedCount = 0;

    for (const srv of tenantServices) {
      const existingTrans = (srv as any).translations || {};
      if (existingTrans?.es?.name && existingTrans?.en?.name) {
        continue;
      }

      const translations = await buildBilingualServiceTranslations({
        name: srv.name,
        description: srv.description,
        sourceLang,
        manualTranslations: existingTrans,
      });

      await db
        .update(services)
        .set({ translations } as any)
        .where(and(eq(services.id, srv.id), eq(services.tenantId, tenantId)));

      updatedCount += 1;
    }

    return res.status(200).json({
      success: true,
      total: tenantServices.length,
      updatedCount,
    });
  } catch (error: any) {
    console.error('Error en backfill de traducciones de servicios:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}

// 5. Eliminar un servicio del catálogo
export async function deleteService(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers (x-tenant-id).' });
    }

    const [deleted] = await db
      .delete(services)
      .where(and(eq(services.id, id), eq(services.tenantId, tenantId)))
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
