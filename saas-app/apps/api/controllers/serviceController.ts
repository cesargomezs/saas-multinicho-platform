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
export const createService = async (req: Request, res: Response) => {
  try {
    // Extraemos el tenantId de los headers (que envía tu función apiFetch del frontend)
    const tenantId = req.headers['x-tenant-id'] as string;
    
    // 🌟 FIX: Extraemos description e imageUrl del body para guardarlos
    const { name, description, price, durationMinutes, imageUrl } = req.body;

    if (!tenantId || !name || !price) {
      return res.status(400).json({ success: false, message: 'Faltan datos obligatorios' });
    }

    // Insertamos en PostgreSQL vía Drizzle ORM
    const newService = await db.insert(services).values({
      tenantId,
      name: name.trim(),
      description: description ? description.trim() : null, // 🌟 GUARDAMOS DESCRIPCIÓN
      price: String(price),
      durationMinutes: Number(durationMinutes || 30),
      imageUrl: imageUrl || null // 🌟 GUARDAMOS IMAGEN
    }).returning(); // .returning() nos devuelve el objeto recién creado con su ID real

    return res.status(201).json({ success: true, service: newService[0] });

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

    // 🌟 FIX: Agregamos imageUrl a las variables exactas que envía el frontend
    const { name, description, price, durationMinutes, category, isActive, imageUrl } = req.body;

    // 🌟 FIX: Armamos el objeto de actualización solo con los campos que vienen en el body
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null; // Permite vaciar la descripción
    if (price !== undefined) updateData.price = String(price);
    if (durationMinutes !== undefined) updateData.durationMinutes = Number(durationMinutes);
    if (category !== undefined) updateData.category = category.trim();
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl; // 🌟 GUARDAMOS IMAGEN AL EDITAR

    // 🌟 FIX: Prevenimos el error "No values to set" si el body llegó vacío
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