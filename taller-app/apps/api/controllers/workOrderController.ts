import { Request, Response } from 'express';
import { db, appointments, users, services, workOrders } from '@taller/database';
import { eq, and } from 'drizzle-orm';

export async function createWorkOrder(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers.' });
    }

    const { 
      appointmentId, 
      status, 
      mileage, 
      estimatedCost, 
      finalCost,
      mechanicNotes,
      media          
    } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: 'El ID de la cita es obligatorio.' });
    }

    const appointmentRecord = await db.query.appointments.findFirst({
      where: and(
        eq(appointments.id, appointmentId),
        eq(appointments.tenantId, tenantId)
      )
    });

    if (!appointmentRecord) {
      return res.status(404).json({ error: 'Cita no encontrada.' });
    }

    const existingMedia = (appointmentRecord.mediaAndReports as any) || {};
    const updatedMedia = {
      ...existingMedia,
      ...(mileage && { mileage }),
      photos: media ? [...(existingMedia.photos || []), media] : (existingMedia.photos || [])
    };

    const [updatedAppointment] = await db.update(appointments)
      .set({
        status: status || 'completed',
        estimatedCost: estimatedCost ? String(estimatedCost) : appointmentRecord.estimatedCost,
        finalCost: finalCost ? String(finalCost) : appointmentRecord.finalCost,
        staffNotes: mechanicNotes || appointmentRecord.staffNotes,
        mediaAndReports: updatedMedia
      } as any)
      .where(eq(appointments.id, appointmentId))
      .returning();

    return res.status(201).json({ success: true, appointment: updatedAppointment });
  } catch (error: any) {
    console.error('Error al actualizar la orden/cita:', error);
    return res.status(500).json({ error: error.message });
  }
}

export async function getReports(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID requerido en los headers.' });
    }

    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    
    // Consultamos la BD
    const rows = await db.select({
      appointment: appointments,
      client: users,
      service: services
    })
    .from(appointments)
    .innerJoin(users, eq(appointments.clientId, users.id))
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.status, 'completed')
      )
    ); 

    let filteredRows = rows;

    // Filtros de fecha robustos
    if (startDate) {
      const startObj = new Date(`${startDate}T00:00:00Z`);
      filteredRows = filteredRows.filter(r => {
        const rDate = new Date(r.appointment.scheduledAt || new Date());
        return rDate >= startObj;
      });
    }

    if (endDate) {
      const endObj = new Date(`${endDate}T23:59:59Z`);
      filteredRows = filteredRows.filter(r => {
        const rDate = new Date(r.appointment.scheduledAt || new Date());
        return rDate <= endObj;
      });
    }

    // Formateamos la data EXACTAMENTE como el frontend lo espera (interfaz ReportItem)
    const reports = filteredRows.map((row) => {
      const rawDate = row.appointment.scheduledAt || new Date(); 
      // Formato ISO YYYY-MM-DD para compatibilidad estricta con el frontend
      const isoDate = new Date(rawDate).toISOString().split('T')[0];
      const metaData = (row.appointment.mediaAndReports as any) || {};
      
      // Parsear el costo a número para que el frontend pueda sumar los KPIs
      const rawCost = row.appointment.finalCost || row.appointment.estimatedCost || '0';
      const numericCost = parseFloat(rawCost.replace(/[^0-9.-]+/g, "")) || 0;

      return {
        id: row.appointment.id,
        date: isoDate,
        clientName: row.client.name,
        plate: metaData.carPlate || metaData.identifier || 'N/A',
        service: row.service ? row.service.name : 'Servicio General', // Frontend espera 'service', no 'serviceType'
        mechanicId: row.appointment.staffId || 'No Asignado', 
        mechanicName: row.appointment.staffId || 'Especialista', // Ideal cruzar con tabla staff
        cost: numericCost,
        status: row.appointment.status.toUpperCase(),
        notes: row.appointment.staffNotes || ''
      };
    });

    // Ordenar de más reciente a más antiguo
    reports.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return res.status(200).json({ success: true, reports });
  } catch (error: any) {
    console.error('Error al generar los reportes:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}