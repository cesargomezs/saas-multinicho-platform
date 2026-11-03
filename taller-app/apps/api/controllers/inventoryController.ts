import { Request, Response } from 'express';
import { db, inventory } from '@taller/database';
import { eq, and } from 'drizzle-orm';

// Listar todo el inventario/catálogo del tenant actual
export async function getInventory(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers.' });
    }

    const items = await db.select()
      .from(inventory)
      .where(eq(inventory.tenantId, tenantId));

    return res.status(200).json({ success: true, items });
  } catch (error: any) {
    console.error('Error al obtener el inventario:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}

// Crear un nuevo producto o recurso en el inventario del tenant
export async function createInventoryItem(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers.' });
    }

    const { name, sku, category, price, stock, metadata } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'El nombre y el precio son obligatorios.' });
    }

    const [newItem] = await db.insert(inventory).values({
      tenantId,
      name: name.trim(),
      sku: sku ? sku.trim() : null,
      category: category || 'general',
      price: String(price),
      stock: stock !== undefined ? String(stock) : '0',
      metadata: metadata || {}
    } as any).returning();

    return res.status(201).json({ success: true, item: newItem });
  } catch (error: any) {
    console.error('Error al crear ítem de inventario:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}

// Actualizar un ítem de inventario asegurando que pertenezca al tenant
export async function updateInventoryItem(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers.' });
    }

    const { name, sku, category, price, stock, metadata } = req.body;

    const [updatedItem] = await db.update(inventory)
      .set({
        ...(name && { name: name.trim() }),
        ...(sku !== undefined && { sku }),
        ...(category && { category }),
        ...(price !== undefined && { price: String(price) }),
        ...(stock !== undefined && { stock: String(stock) }),
        ...(metadata && { metadata })
      })
      .where(
        and(
          eq(inventory.id, id),
          eq(inventory.tenantId, tenantId)
        )
      )
      .returning();

    if (!updatedItem) {
      return res.status(404).json({ success: false, error: 'Ítem no encontrado o no pertenece a este tenant.' });
    }

    return res.status(200).json({ success: true, item: updatedItem });
  } catch (error: any) {
    console.error('Error al actualizar inventario:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}

// Eliminar un ítem del inventario
export async function deleteInventoryItem(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers.' });
    }

    const [deleted] = await db.delete(inventory)
      .where(
        and(
          eq(inventory.id, id),
          eq(inventory.tenantId, tenantId)
        )
      )
      .returning();

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Ítem no encontrado.' });
    }

    return res.status(200).json({ success: true, message: 'Ítem eliminado correctamente.' });
  } catch (error: any) {
    console.error('Error al eliminar ítem:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}