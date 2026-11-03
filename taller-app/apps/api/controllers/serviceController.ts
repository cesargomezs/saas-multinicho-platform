import { Request, Response } from 'express';
import { db, services } from '@taller/database';
import { eq, and } from 'drizzle-orm';

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

// 2. Crear un nuevo servicio en el catálogo del negocio
export async function createService(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers (x-tenant-id).' });
    }

    const { name, description, price, duration, category } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'El nombre del servicio y el precio son obligatorios.' });
    }

    const [newService] = await db.insert(services).values({
      tenantId,
      name: name.trim(),
      description: description ? description.trim() : null,
      price: String(price),
      duration: duration ? Number(duration) : 30, // Duración estimada en minutos por defecto
      category: category ? category.trim() : 'general'
    } as any).returning();

    return res.status(201).json({ success: true, service: newService });
  } catch (error: any) {
    console.error('Error al crear el servicio:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}

// 3. Actualizar un servicio existente asegurando que pertenezca al tenant
export async function updateService(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers (x-tenant-id).' });
    }

    const { name, description, price, duration, category } = req.body;

    const [updatedService] = await db.update(services)
      .set({
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(price !== undefined && { price: String(price) }),
        ...(duration !== undefined && { duration: Number(duration) }),
        ...(category && { category: category.trim() })
      })
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