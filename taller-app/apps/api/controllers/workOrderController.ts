import { Request, Response } from 'express';
import { db, vehicles, workOrders, appointments } from '@taller/database';
import { eq, and, ne } from 'drizzle-orm';

export async function createWorkOrder(req: Request, res: Response) {
  try {
    const { 
      plate, 
      status, 
      mileage, 
      estimatedCost, 
      nextServiceMonth, 
      mechanicNotes,
      oldPartPhoto,
      newPartPhoto  
    } = req.body;

    if (!plate) {
      return res.status(400).json({ error: 'La placa es obligatoria.' });
    }

    const queryPlate = plate.toUpperCase().trim();

    const vehicleRecord = await db.query.vehicles.findFirst({
      where: eq(vehicles.plate, queryPlate)
    });

    if (!vehicleRecord) {
      return res.status(404).json({ error: 'Vehículo no encontrado.' });
    }

    const [newOrder] = await db.insert(workOrders).values({
      vehicleId: vehicleRecord.id,
      status: status || 'diagnosis',
      mileage,
      estimatedCost,
      nextServiceMonth,
      mechanicNotes,
      oldPartPhoto: oldPartPhoto || null,
      newPartPhoto: newPartPhoto || null
    }).returning();

    if (mileage) {
      await db.update(vehicles)
        .set({ mileage })
        .where(eq(vehicles.id, vehicleRecord.id));
    }

    await db.update(appointments)
      .set({ status: 'completed' })
      .where(
        and(
          eq(appointments.vehicleId, vehicleRecord.id),
          ne(appointments.status, 'completed')
        )
      );

    return res.status(201).json({ success: true, workOrder: newOrder });
  } catch (error: any) {
    console.error('Error al guardar orden:', error);
    return res.status(500).json({ error: error.message });
  }
}

export async function getReports(req: Request, res: Response) {
  try {
    const mechanicFilter = req.query.mechanic as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    
    // Traemos TODAS las órdenes terminadas haciendo innerJoin
    const rows = await db.select({
      workOrder: workOrders,
      vehicle: vehicles
    })
    .from(workOrders)
    .innerJoin(vehicles, eq(workOrders.vehicleId, vehicles.id))
    .where(eq(workOrders.status, 'ready')); 

    let filteredRows = rows;

    if (startDate) {
      const startObj = new Date(`${startDate}T00:00:00`);
      filteredRows = filteredRows.filter(r => {
        const rDate = new Date((r.workOrder as any).createdAt || new Date());
        return rDate >= startObj;
      });
    }

    if (endDate) {
      const endObj = new Date(`${endDate}T23:59:59`);
      filteredRows = filteredRows.filter(r => {
        const rDate = new Date((r.workOrder as any).createdAt || new Date());
        return rDate <= endObj;
      });
    }

    let reports = filteredRows.map((row) => {
      const rawDate = (row.workOrder as any).createdAt || new Date(); 
      const formattedDate = new Date(rawDate).toLocaleDateString('es-ES');

      return {
        id: row.workOrder.id,
        date: formattedDate,
        plate: row.vehicle.plate, 
        serviceType: 'Servicio de Taller', 
        mechanic: 'Taller', 
        cost: row.workOrder.estimatedCost || '$0.00',
        status: row.workOrder.status,
        notes: row.workOrder.mechanicNotes || ''
      };
    });

    if (mechanicFilter && mechanicFilter !== 'todos') {
        reports = reports.filter(r => 
          r.notes.toLowerCase().includes(mechanicFilter.toLowerCase())
        );
        reports = reports.map(r => ({ ...r, mechanic: mechanicFilter }));
    }

    // Retornamos TODOS los reportes filtrados. El frontend se encarga de paginarlos.
    return res.status(200).json({ success: true, reports });
  } catch (error: any) {
    console.error('Error al generar el reporte:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}