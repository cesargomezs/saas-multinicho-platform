import { Request, Response } from 'express';
import { db, staff } from '@taller/database';
import { eq, and } from 'drizzle-orm';

// 📋 OBTENER EL PERSONAL DEL TENANT ACTUAL
export async function getStaff(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(400).json({ error: 'Falta el x-tenant-id.' });

    const team = await db.select().from(staff).where(eq(staff.tenantId, tenantId));

    return res.status(200).json({ success: true, staff: team });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ➕ CREAR NUEVO MIEMBRO DEL PERSONAL
export async function createStaff(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { name, role, isActive } = req.body;

    if (!tenantId || !name || !role) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (tenantId, name, role).' });
    }

    const [newMember] = await db.insert(staff).values({
      tenantId,
      name: name.trim(),
      role: role.trim(),
      isActive: isActive !== undefined ? isActive : true
    }).returning();

    return res.status(201).json({ success: true, member: newMember });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// 🔄 ACTUALIZAR ESTADO O DATOS DEL PERSONAL (Activo / Inactivo)
export async function updateStaff(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;
    const { name, role, isActive } = req.body;

    if (!tenantId || !id) {
      return res.status(400).json({ error: 'Falta el tenantId o el ID del miembro del staff.' });
    }

    const [existingMember] = await db.select().from(staff)
      .where(and(eq(staff.id, id), eq(staff.tenantId, tenantId)));

    if (!existingMember) {
      return res.status(404).json({ error: 'Miembro del personal no encontrado.' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (role !== undefined) updateData.role = role.trim();
    if (isActive !== undefined) updateData.isActive = isActive; // 👈 Aquí se actualiza el booleano en la BD

    const [updatedMember] = await db.update(staff)
      .set(updateData)
      .where(and(eq(staff.id, id), eq(staff.tenantId, tenantId)))
      .returning();

    return res.status(200).json({ success: true, member: updatedMember });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}