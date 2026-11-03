import { Request, Response } from 'express';
import { db, users, appointments, services, vehicles, workOrders } from '@taller/database';
import { eq, and, gte, lt, ne, inArray } from 'drizzle-orm';

// 📱 Función utilitaria para enviar notificación a Telegram
const sendTelegramNotification = async (message: string) => {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️ Credenciales de Telegram no configuradas en el backend (.env).");
    return;
  }
  
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML' // Permite enviar negritas y emojis
      })
    });
    
    if (!response.ok) {
      console.error("Error en respuesta de Telegram:", await response.text());
    }
  } catch (error) {
    console.error("Excepción enviando Telegram:", error);
  }
};

// 🔍 BUSCAR VEHÍCULO POR PLACA (EXPEDIENTE)
export async function getVehicleByPlate(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const plate = req.params.plate;

    if (!tenantId || !plate) {
      return res.status(400).json({ error: 'Falta el tenantId o la placa.' });
    }

    const [result] = await db.select({
      vehicle: vehicles,
      client: users
    })
    .from(vehicles)
    .innerJoin(users, eq(vehicles.clientId, users.id))
    .where(
      and(
        eq(vehicles.tenantId, tenantId),
        eq(vehicles.plate, plate.toUpperCase())
      )
    );

    if (!result) {
      return res.status(200).json({ success: false, message: 'Vehículo no encontrado' });
    }

    return res.status(200).json({
      success: true,
      vehicle: result.vehicle,
      client: result.client
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// 📝 CREAR CITA Y DISPARAR NOTIFICACIÓN A TELEGRAM
export async function createAppointment(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(400).json({ error: 'Falta identificador (x-tenant-id).' });

    const { clientName, clientEmail, clientPhone, serviceId, staffId, scheduledAt, notes, metadata } = req.body;
    if (!clientEmail || !clientName || !serviceId) return res.status(400).json({ error: 'Faltan campos obligatorios.' });

    const cleanMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : (metadata || {});

    let [user] = await db.select().from(users).where(and(eq(users.email, clientEmail.trim().toLowerCase()), eq(users.tenantId, tenantId)));
    
    if (!user) {
      [user] = await db.insert(users).values({ 
        tenantId, name: clientName.trim(), email: clientEmail.trim().toLowerCase(), phone: clientPhone?.trim() || '', role: 'client'
      }).returning();
    }

    let vehicleRecord: any = null;
    if (cleanMetadata.carPlate) {
      const plateUpper = cleanMetadata.carPlate.toUpperCase();
      let [existingVehicle] = await db.select().from(vehicles).where(and(eq(vehicles.plate, plateUpper), eq(vehicles.tenantId, tenantId)));
      
      if (!existingVehicle) {
        [vehicleRecord] = await db.insert(vehicles).values({
          tenantId, clientId: user.id, plate: plateUpper, brand: cleanMetadata.carBrand, model: cleanMetadata.carModel, year: cleanMetadata.carYear, currentMileage: cleanMetadata.carMileage
        }).returning();
      } else {
        [vehicleRecord] = await db.update(vehicles).set({ 
          currentMileage: cleanMetadata.carMileage 
        }).where(eq(vehicles.id, existingVehicle.id)).returning();
      }
    }

    const parsedDate = scheduledAt ? new Date(scheduledAt) : new Date();
    const finalMediaAndReports = vehicleRecord ? { vehicleId: vehicleRecord.id } : { preferences: cleanMetadata };

    const [apt] = await db.insert(appointments).values({ 
      tenantId, clientId: user.id, staffId: staffId || null, serviceId, scheduledAt: parsedDate, status: 'scheduled', staffNotes: notes || 'Sin notas', 
      mediaAndReports: finalMediaAndReports, 
      estimatedCost: '0.00', finalCost: '0.00' 
    }).returning();

    // 🔔 DISPARAR NOTIFICACIÓN A TELEGRAM ANTES DE RESPONDER AL FRONTEND
    const telegramMsg = `
🚨 <b>¡NUEVA RESERVA EN AUTOFLOW!</b> 🚨
👤 <b>Cliente:</b> ${clientName.trim()}
📞 <b>Teléfono:</b> ${clientPhone?.trim() || 'N/A'}
🗓️ <b>Fecha:</b> ${parsedDate.toLocaleString('es-ES')}
🚗 <b>Vehículo:</b> ${cleanMetadata.carPlate || 'No registrada'}
🛠️ <b>Servicio:</b> Revisa el sistema para más detalles.
📝 <b>Notas:</b> ${notes || 'Sin detalles'}
    `;
    
    // Llamada no bloqueante (no frena el return si Telegram falla)
    sendTelegramNotification(telegramMsg);

    return res.status(201).json({ success: true, appointment: apt });
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
}

export async function getAppointments(req: Request, res: Response) {
  try { return res.json(await db.select().from(appointments).where(eq(appointments.tenantId, req.headers['x-tenant-id'] as string))); } catch (error: any) { return res.status(500).json({ error: String(error) }); }
}

export async function checkAvailability(req: Request, res: Response) {
  try {
    const dayApts = await db.query.appointments.findMany({ where: and(eq(appointments.tenantId, req.headers['x-tenant-id'] as string), gte(appointments.scheduledAt, new Date(`${req.query.date}T00:00:00Z`)), lt(appointments.scheduledAt, new Date(`${req.query.date}T23:59:59Z`))), columns: { scheduledAt: true } });
    return res.status(200).json({ success: true, bookedTimes: dayApts.map(a => `${new Date(a.scheduledAt).getUTCHours().toString().padStart(2, '0')}:${new Date(a.scheduledAt).getUTCMinutes().toString().padStart(2, '0')}`) });
  } catch (error: any) { return res.status(500).json({ success: false, error: error.message }); }
}

// 🗓️ OBTENER CITAS DE HOY O PRÓXIMOS DÍAS
export async function getTodaysAppointments(req: Request, res: Response) {
  try {
    let start = new Date(), end = new Date(); 
    start.setHours(0, 0, 0, 0); 
    
    // Configurar el rango de tiempo dependiendo del filtro (hoy o 7 días)
    if (req.query.filter === 'upcoming') {
      end.setDate(end.getDate() + 7); // Agenda a 7 días
      end.setHours(23, 59, 59, 999);
    } else {
      end.setHours(23, 59, 59, 999); // Solo hoy por defecto
    }

    // 1. Consultar citas cruzando con Clientes, Servicios y Órdenes de Trabajo (POS)
    const rows = await db.select({ 
      apt: appointments, 
      cli: users, 
      svc: services,
      wo: workOrders
    })
    .from(appointments)
    .innerJoin(users, eq(appointments.clientId, users.id))
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .leftJoin(workOrders, eq(workOrders.appointmentId, appointments.id))
    .where(
      and(
        eq(appointments.tenantId, req.headers['x-tenant-id'] as string), 
        gte(appointments.scheduledAt, start), 
        lt(appointments.scheduledAt, end), 
        ne(appointments.status, 'completed')
      )
    )
    .orderBy(appointments.scheduledAt);

    // 2. Cruzar con la tabla maestra de vehículos usando el ID del JSONB o de la relación
    const vehicleIds = rows.map(r => (r.apt.mediaAndReports as any)?.vehicleId).filter(Boolean);
    let vehiclesMap: any = {};
    if (vehicleIds.length > 0) {
      const vecs = await db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds));
      vecs.forEach(v => { vehiclesMap[v.id] = v; });
    }

    return res.status(200).json({ 
      success: true, 
      appointments: rows.map(r => {
        const vId = (r.apt.mediaAndReports as any)?.vehicleId;
        const vehicle = vId ? vehiclesMap[vId] : null;
        const d = new Date(r.apt.scheduledAt);
        
        return { 
          id: r.apt.id, 
          // Enviamos la fecha y hora completa para que el frontend decida qué mostrar
          date: d.toISOString(), 
          time: `${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}`, 
          clientName: r.cli.name, 
          plate: vehicle?.plate || 'N/A', 
          brand: vehicle?.brand || '', 
          model: vehicle?.model || '', 
          year: vehicle?.year || '', 
          mileage: vehicle?.currentMileage || '0', 
          serviceType: r.svc?.name || 'General', 
          estimatedCost: r.apt.estimatedCost || '0.00',
          notes: r.apt.staffNotes,
          hasWorkOrder: !!r.wo // Indica si ya pasó por el POS
        };
      }) 
    });
  } catch (error: any) { 
    return res.status(500).json({ success: false, error: error.message }); 
  }
}

// 🛠️ POS UNIVERSAL: CIERRE DE ORDEN Y PERSISTENCIA EN WORK_ORDERS
export async function completeWorkOrder(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { appointmentId } = req.params;
    
    console.log("📥 Recibiendo cierre de orden para ID:", appointmentId, "Tenant:", tenantId);
    console.log("📦 Payload recibido:", req.body);

    const { 
      finalCost, 
      mechanicNotes, 
      exitMileage, 
      oldParts, 
      newParts, 
      nextServiceDate, 
      oldPartImageUrl, 
      newPartImageUrl 
    } = req.body;

    if (!tenantId || !appointmentId) {
      return res.status(400).json({ error: 'Faltan identificadores (tenantId o appointmentId).' });
    }

    // 1. Buscamos la cita original
    const [currentApt] = await db.select().from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));

    if (!currentApt) {
      console.warn("⚠️ Cita no encontrada con ID:", appointmentId);
      return res.status(404).json({ error: 'Cita u Orden no encontrada en la base de datos.' });
    }

    const existingMetadata = currentApt.mediaAndReports as any || {};
    const vehicleId = existingMetadata.vehicleId || null;

    // 2. 💰 INSERCIÓN EN LA TABLA MAESTRA POS (workOrders)
    const [workOrder] = await db.insert(workOrders).values({
      tenantId,
      appointmentId: currentApt.id,
      vehicleId: vehicleId, 
      staffId: currentApt.staffId || null,
      finalCost: finalCost ? String(finalCost) : '0.00',
      mechanicNotes: mechanicNotes || '',
      oldParts: oldParts || '',
      newParts: newParts || '',
      oldPartImageUrl: oldPartImageUrl || null, 
      newPartImageUrl: newPartImageUrl || null, 
      nextServiceRecommendation: nextServiceDate || ''
    }).returning();

    console.log("✅ Work Order creada con éxito:", workOrder.id);

    // 3. 🚗 Actualizar el millaje de salida en la tabla de vehículos
    if (vehicleId && exitMileage) {
      await db.update(vehicles)
        .set({ currentMileage: String(exitMileage) })
        .where(eq(vehicles.id, vehicleId));
    }

    // 4. 🔄 CERRAR CICLO de la Cita
    const [updatedApt] = await db.update(appointments).set({
      status: 'completed',
      finalCost: finalCost ? String(finalCost) : '0.00',
      staffNotes: mechanicNotes || currentApt.staffNotes,
      mediaAndReports: { 
        ...existingMetadata, 
        workOrderId: workOrder.id 
      }
    }).where(eq(appointments.id, appointmentId)).returning();

    return res.status(200).json({ 
      success: true, 
      message: 'Orden guardada con éxito en work_orders',
      workOrder, 
      order: updatedApt 
    });

  } catch (error: any) {
    console.error("🔴 Error crítico en completeWorkOrder:", error);
    return res.status(500).json({ success: false, error: error.message }); 
  }
}

// 📋 EXPEDIENTE COMPLETO DEL VEHÍCULO Y CLIENTE
export async function getClientVehicleHistory(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { identifier } = req.params; // Puede ser placa o email

    if (!tenantId || !identifier) {
      return res.status(400).json({ error: 'Falta el identificador de búsqueda.' });
    }

    // 1. Buscamos el vehículo por placa o al usuario por email
    const [vehicleRecord] = await db.select().from(vehicles)
      .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.plate, identifier.toUpperCase())));

    if (!vehicleRecord) {
      return res.status(404).json({ success: false, error: 'No se encontró un vehículo con esa placa.' });
    }

    // 2. Buscamos al dueño (cliente)
    const [clientRecord] = await db.select().from(users)
      .where(eq(users.id, vehicleRecord.clientId));

    // 3. Traemos TODAS las órdenes de trabajo (historial POS e imágenes) de este vehículo
    const historyOrders = await db.select().from(workOrders)
      .where(eq(workOrders.vehicleId, vehicleRecord.id))
      .orderBy(workOrders.createdAt);

    return res.status(200).json({
      success: true,
      client: clientRecord,
      vehicle: vehicleRecord,
      serviceHistory: historyOrders // Aquí viaja todo el historial con fotos y costos
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}