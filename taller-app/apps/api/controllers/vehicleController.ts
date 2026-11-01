import { Request, Response } from 'express';
import { db, vehicles, workOrders, users } from '@taller/database'; // <-- Agregamos 'users'
import { eq, or, desc } from 'drizzle-orm';

export async function lookupVehicle(req: Request, res: Response) {
  try {
    const rawPlate = req.params.plate;
    if (!rawPlate) {
      return res.status(400).json({ exists: false, message: 'Placa inválida.' });
    }

    const queryPlate = rawPlate.toUpperCase().trim();

    // 1. CRUCE TRIPLE EN UNA SOLA CONSULTA (Vehículo + Usuario + Órdenes)
    const rows = await db.select({
      vehicle: vehicles,
      user: users,
      workOrder: workOrders,
    })
    .from(vehicles)
    .innerJoin(users, eq(vehicles.userId, users.id)) // <-- CRUCE CON EL CLIENTE
    .leftJoin(workOrders, eq(vehicles.id, workOrders.vehicleId)) // <-- CRUCE CON EL HISTORIAL
    .where(
      or(
        eq(vehicles.plate, queryPlate),
        eq(vehicles.vin, queryPlate)
      )
    )
    .orderBy(desc(workOrders.createdAt));

    // Si no hay resultados, el vehículo no existe
    if (!rows || rows.length === 0) {
      return res.status(404).json({ 
        exists: false, 
        message: '¡Vehículo no registrado! Eres nuevo por acá, regístrate para crear tu expediente.' 
      });
    }

    // 2. Extraemos los datos maestros (se repiten en cada fila del JOIN, tomamos la primera)
    const vehicleRecord = rows[0].vehicle;
    const userRecord = rows[0].user;

    // 3. Filtramos y armamos el historial de órdenes
    const validWorkOrders = rows.filter(row => row.workOrder !== null);
    
    const formattedHistory = validWorkOrders.map((row, index) => {
      const wo = row.workOrder!;
      const dateObj = wo.createdAt ? new Date(wo.createdAt) : new Date();
      const dateString = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

      return {
        id: wo.id,
        date: dateString,
        type: wo.status === 'diagnosis' ? 'Diagnóstico' : 'Mantenimiento',
        title: `Orden de Trabajo #${validWorkOrders.length - index}`,
        mechanic: 'Taller',
        notes: wo.mechanicNotes || 'Sin reporte detallado.',
        status: wo.status,
        cost: wo.estimatedCost ? (wo.estimatedCost.startsWith('$') ? wo.estimatedCost : `$${Number(wo.estimatedCost).toFixed(2)}`) : '$0.00',
        mileage: wo.mileage || 'No registrado',
        oldPartPhoto: wo.oldPartPhoto || null, // <-- Asegura enviar las fotos al frontend
        newPartPhoto: wo.newPartPhoto || null
      };
    });

    // 4. RETORNAMOS TODO: EL CLIENTE, EL VEHÍCULO Y EL HISTORIAL
    return res.status(200).json({ 
      exists: true, 
      user: {
        name: userRecord.name,
        email: userRecord.email,
        phone: userRecord.phone
      },
      vehicle: {
        ...vehicleRecord,
        workOrders: formattedHistory
      } 
    });
  } catch (error: any) {
    console.error('Error en lookup de vehículo:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}