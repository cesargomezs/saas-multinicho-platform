import { Request, Response } from 'express';
import { db, staff, users } from '@taller/database';
import { eq, and, sql } from 'drizzle-orm';

const extractPhoneDigits10 = (phoneStr?: string | null): string => {
  if (!phoneStr) return '';
  const digits = String(phoneStr).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

async function syncStaffUserRecord(params: {
  tenantId: string;
  name: string;
  phone?: string | null;
}) {
  const { tenantId, name, phone } = params;
  const cleanPhoneStr = phone ? String(phone).trim() : '';
  const digits10 = extractPhoneDigits10(cleanPhoneStr);
  if (digits10.length < 7) return null;

  const staffEmail = `staff.${digits10}@autoflow.local`;

  const [byEmail] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, staffEmail)));

  if (byEmail) {
    const [updatedUser] = await db
      .update(users)
      .set({
        name: name.trim(),
        phone: cleanPhoneStr,
        role: 'staff',
      } as any)
      .where(eq(users.id, byEmail.id))
      .returning();
    return updatedUser;
  }

  const [byPhone] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        sql`RIGHT(regexp_replace(COALESCE(${users.phone}, ''), '[^0-9]', '', 'g'), 10) = ${digits10}`
      )
    );

  if (byPhone) {
    const [updatedUser] = await db
      .update(users)
      .set({
        name: name.trim(),
        phone: cleanPhoneStr,
        role: 'staff',
      } as any)
      .where(eq(users.id, byPhone.id))
      .returning();
    return updatedUser;
  }

  const [createdUser] = await db
    .insert(users)
    .values({
      tenantId,
      name: name.trim(),
      email: staffEmail,
      phone: cleanPhoneStr,
      role: 'staff',
    } as any)
    .returning();

  return createdUser;
}

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

// ➕ CREAR NUEVO MIEMBRO DEL PERSONAL + ASOCIAR EN USERS COMO STAFF
export async function createStaff(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { name, phone, role, isActive } = req.body;

    if (!tenantId || !name || !role) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (tenantId, name, role).' });
    }

    const cleanName = String(name).trim();
    const cleanPhone = phone ? String(phone).trim() : null;

    const [newMember] = await db
      .insert(staff)
      .values({
        tenantId,
        name: cleanName,
        phone: cleanPhone,
        role: String(role).trim(),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      } as any)
      .returning();

    const staffUser = await syncStaffUserRecord({
      tenantId,
      name: cleanName,
      phone: cleanPhone,
    });

    return res.status(201).json({
      success: true,
      member: newMember,
      staffUser,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// 🔄 ACTUALIZAR ESTADO O DATOS DEL PERSONAL (Activo / Inactivo / Teléfono)
export async function updateStaff(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;
    const { name, phone, role, isActive } = req.body;

    if (!tenantId || !id) {
      return res.status(400).json({ error: 'Falta el tenantId o el ID del miembro del staff.' });
    }

    const [existingMember] = await db
      .select()
      .from(staff)
      .where(and(eq(staff.id, id), eq(staff.tenantId, tenantId)));

    if (!existingMember) {
      return res.status(404).json({ error: 'Miembro del personal no encontrado.' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (phone !== undefined) updateData.phone = phone ? String(phone).trim() : null;
    if (role !== undefined) updateData.role = String(role).trim();
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const [updatedMember] = await db
      .update(staff)
      .set(updateData)
      .where(and(eq(staff.id, id), eq(staff.tenantId, tenantId)))
      .returning();

    const effectiveName = (updatedMember as any).name;
    const effectivePhone = (updatedMember as any).phone;
    const staffUser = await syncStaffUserRecord({
      tenantId,
      name: effectiveName,
      phone: effectivePhone,
    });

    return res.status(200).json({
      success: true,
      member: updatedMember,
      staffUser,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}