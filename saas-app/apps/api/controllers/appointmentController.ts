import { Request, Response } from 'express';
import { db, users, appointments, services, vehicles, workOrders, tenants } from '@taller/database';
import { eq, and, gte, lt, ne, inArray, ilike, sql } from 'drizzle-orm'; 

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

// 🛠️ Helper seguro para parsear JSON que pudo haber quedado doblemente stringificado en BD
const safeParseJSON = (data: any): any => {
  if (!data) return {};
  if (typeof data === 'object') return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    } catch (e) {
      return {};
    }
  }
  return {};
};

// 🛠️ Helper para extraer los últimos 10 dígitos limpios de cualquier teléfono
const extractCleanPhone = (phoneStr: string): string => {
  if (!phoneStr) return '';
  const digits = String(phoneStr).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

// 🛠️ Helper para evitar el error "violates foreign key constraint appointments_staff_id_users_id_fk"
const resolveSafeUserStaffId = async (candidateStaffId?: string | null): Promise<string | null> => {
  if (!candidateStaffId || typeof candidateStaffId !== 'string' || candidateStaffId.trim() === '') {
    return null;
  }
  try {
    const [existingUser] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.id, candidateStaffId));
    return existingUser ? existingUser.id : null;
  } catch (e) {
    return null;
  }
};

// 🕒 HELPER UNIVERSAL MULTI-PAÍS (WALL-CLOCK TIME):
// Garantiza que si el cliente agenda "14:00" (2:00 PM), en la BD y en Telegram SIEMPRE sea "2:00 PM"
// sin importar en qué país o zona horaria esté el cliente o el servidor (EE.UU., Colombia, México, España, etc.).
const parseWallClockAppointmentDate = (rawDateStr: string, explicitDate?: string, explicitTime?: string): Date => {
  if (explicitDate && explicitTime && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate) && /^\d{2}:\d{2}/.test(explicitTime)) {
    return new Date(`${explicitDate}T${explicitTime.substring(0, 5)}:00.000Z`);
  }
  const cleanStr = String(rawDateStr || '').trim();
  const match = cleanStr.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (match) {
    return new Date(`${match[1]}T${match[2]}:00.000Z`);
  }
  return new Date(cleanStr);
};

// Formatea la fecha y hora exacta agendada ("14:00" -> "11/12/2026, 2:00 PM") sin restar ni sumar horas por zona horaria
const formatWallClockForNotification = (scheduledAtDate?: Date | string | null, metaObj?: any, fallbackDate?: string, fallbackTime?: string): string => {
  let iso = '';
  if (metaObj?.localDate && metaObj?.localTime) {
    iso = `${metaObj.localDate}T${metaObj.localTime}:00.000Z`;
  } else if (fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate) && fallbackTime && /^\d{2}:\d{2}/.test(fallbackTime)) {
    iso = `${fallbackDate}T${fallbackTime.substring(0, 5)}:00.000Z`;
  } else if (scheduledAtDate instanceof Date && !isNaN(scheduledAtDate.getTime())) {
    iso = scheduledAtDate.toISOString();
  } else if (typeof scheduledAtDate === 'string' && scheduledAtDate.includes('T')) {
    iso = scheduledAtDate;
  }

  if (iso && iso.includes('T')) {
    const [datePart, timePartRaw] = iso.split('T');
    const [yyyy, mm, dd] = datePart.split('-');
    const [hhStr, minStr] = timePartRaw.substring(0, 5).split(':');
    const hh = parseInt(hhStr, 10);
    if (!isNaN(hh) && yyyy && mm && dd) {
      const ampm = hh >= 12 ? 'PM' : 'AM';
      const hh12 = hh % 12 === 0 ? 12 : hh % 12;
      return `${mm}/${dd}/${yyyy}, ${hh12}:${minStr} ${ampm}`;
    }
  }
  return fallbackDate || fallbackTime || 'Horario programado';
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
      client: {
        ...result.client,
        metadata: safeParseJSON(result.client.metadata)
      }
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

    const { clientName, clientEmail, clientPhone, serviceId, staffId, appointmentDate, notes, metadata } = req.body;
    
    // Usamos appointmentDate (que viene del front) o scheduledAt por compatibilidad
    const finalDateStr = appointmentDate || req.body.scheduledAt;

    if (!clientEmail || !clientName || !serviceId || !finalDateStr) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (Email, Nombre, Servicio, Fecha).' });
    }

    const cleanMetadata = safeParseJSON(metadata);

    // 🌟 FIND OR CREATE USER 
    let [user] = await db.select().from(users).where(and(eq(users.email, clientEmail.trim().toLowerCase()), eq(users.tenantId, tenantId)));
    
    if (!user) {
      [user] = await db.insert(users).values({ 
        tenantId, 
        name: clientName.trim(), 
        email: clientEmail.trim().toLowerCase(), 
        phone: clientPhone?.trim() || '', 
        role: 'client'
      }).returning();
    } else {
      [user] = await db.update(users).set({ 
        name: clientName.trim(), 
        phone: clientPhone?.trim() || user.phone 
      }).where(eq(users.id, user.id)).returning();
    }

    // 🌟 VEHÍCULO
    let vehicleRecord: any = null;
    if (cleanMetadata.carPlate) {
      const plateUpper = cleanMetadata.carPlate.toUpperCase();
      let [existingVehicle] = await db.select().from(vehicles).where(and(eq(vehicles.plate, plateUpper), eq(vehicles.tenantId, tenantId)));
      
      if (!existingVehicle) {
        [vehicleRecord] = await db.insert(vehicles).values({
          tenantId, 
          clientId: user.id, 
          plate: plateUpper, 
          brand: cleanMetadata.carBrand, 
          model: cleanMetadata.carModel, 
          year: cleanMetadata.carYear, 
          currentMileage: cleanMetadata.carMileage
        }).returning();
      } else {
        [vehicleRecord] = await db.update(vehicles).set({ 
          currentMileage: cleanMetadata.carMileage 
        }).where(eq(vehicles.id, existingVehicle.id)).returning();
      }
    }

    // 🌟 RESPETAR LA HORA EXACTA DEL RELOJ (WALL-CLOCK) SIN DESFASE DE ZONA HORARIA + METADATA
    const parsedDate = parseWallClockAppointmentDate(finalDateStr, cleanMetadata?.localDate, cleanMetadata?.localTime);
    
    const rawRefPhone = cleanMetadata?.referredBy || cleanMetadata?.preferences?.referredBy || req.body?.referredBy || '';
    const refPhone = extractCleanPhone(rawRefPhone);

    // Verificamos si staffId existe en la tabla users para no romper la FK "appointments_staff_id_users_id_fk"
    const safeDbStaffId = await resolveSafeUserStaffId(staffId);

    const finalMediaAndReports: any = vehicleRecord 
      ? { vehicleId: vehicleRecord.id, ...cleanMetadata } 
      : { ...cleanMetadata };

    if (refPhone) {
      finalMediaAndReports.referredBy = refPhone;
    }
    if (staffId) {
      finalMediaAndReports.assignedStaffId = staffId;
    }

    const [apt] = await db.insert(appointments).values({ 
      tenantId, 
      clientId: user.id, 
      staffId: safeDbStaffId, 
      serviceId, 
      scheduledAt: parsedDate, 
      status: 'scheduled', 
      staffNotes: notes || 'Sin notas', 
      mediaAndReports: finalMediaAndReports, 
      estimatedCost: '0.00', 
      finalCost: '0.00' 
    }).returning();

    // 🔔 DISPARAR NOTIFICACIÓN A TELEGRAM
    const telegramMsg = `
🚨 <b>¡NUEVA RESERVA EN AUTOFLOW!</b> 🚨
👤 <b>Cliente:</b> ${clientName.trim()}
📞 <b>Teléfono:</b> ${clientPhone?.trim() || 'N/A'}
🗓️ <b>Fecha:</b> ${formatWallClockForNotification(parsedDate, finalMediaAndReports)}
🚗 <b>Vehículo:</b> ${cleanMetadata.carPlate || 'No registrada'}
🛠️ <b>Servicio:</b> Revisa el sistema para más detalles.
📝 <b>Notas:</b> ${notes || 'Sin detalles'}
${refPhone ? `🤝 <b>Referido por:</b> ${refPhone}` : ''}
    `;
    
    sendTelegramNotification(telegramMsg);

    return res.status(201).json({ success: true, appointment: apt });
  } catch (error: any) { 
    console.error("Error agendando:", error);
    return res.status(500).json({ error: error.message }); 
  }
}

export async function getAppointments(req: Request, res: Response) {
  try { return res.json(await db.select().from(appointments).where(eq(appointments.tenantId, req.headers['x-tenant-id'] as string))); } catch (error: any) { return res.status(500).json({ error: String(error) }); }
}

export async function checkAvailability(req: Request, res: Response) {
  try {
    const dayApts = await db.query.appointments.findMany({
      where: and(
        eq(appointments.tenantId, req.headers['x-tenant-id'] as string),
        gte(appointments.scheduledAt, new Date(`${req.query.date}T00:00:00Z`)),
        lt(appointments.scheduledAt, new Date(`${req.query.date}T23:59:59Z`)),
        ne(appointments.status, 'cancelled')
      ),
      columns: { scheduledAt: true }
    });
    return res.status(200).json({ success: true, bookedTimes: dayApts.map(a => `${new Date(a.scheduledAt).getUTCHours().toString().padStart(2, '0')}:${new Date(a.scheduledAt).getUTCMinutes().toString().padStart(2, '0')}`) });
  } catch (error: any) { return res.status(500).json({ success: false, error: error.message }); }
}

// 🗓️ OBTENER CITAS DE HOY O PRÓXIMOS DÍAS
export async function getTodaysAppointments(req: Request, res: Response) {
  try {
    // Ventana universal multi-país: restamos 14h al inicio del día UTC para cubrir todas las zonas horarias (América y Europa) sin perder citas del día
    let start = new Date(); 
    start.setUTCHours(0, 0, 0, 0);
    start = new Date(start.getTime() - 14 * 60 * 60 * 1000);
    
    let end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    
    if (req.query.filter === 'upcoming') {
      end.setUTCDate(end.getUTCDate() + 8);
    } else {
      end = new Date(end.getTime() + 14 * 60 * 60 * 1000);
    }

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
        ne(appointments.status, 'completed'),
        ne(appointments.status, 'cancelled')
      )
    )
    .orderBy(appointments.scheduledAt);

    const vehicleIds = rows.map(r => {
        const meta = safeParseJSON(r.apt.mediaAndReports);
        return meta?.vehicleId;
    }).filter(Boolean);
      
    let vehiclesMap: any = {};
    if (vehicleIds.length > 0) {
      const vecs = await db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds));
      vecs.forEach(v => { vehiclesMap[v.id] = v; });
    }

    return res.status(200).json({ 
      success: true, 
      appointments: rows.map(r => {
        const meta = safeParseJSON(r.apt.mediaAndReports);
        const clientMeta = safeParseJSON(r.cli.metadata);
        const vehicle = meta?.vehicleId ? vehiclesMap[meta.vehicleId] : null;
        
        const dbDateStr = r.apt.scheduledAt.toISOString(); 
        const timePart = meta?.localTime || dbDateStr.split('T')[1].substring(0, 5); 

        return { 
          id: r.apt.id, 
          status: r.apt.status,
          date: dbDateStr,
          appointmentDate: dbDateStr,
          time: timePart, 
          staffId: r.apt.staffId || meta?.assignedStaffId || null,
          clientName: r.cli.name,
          clientPhone: r.cli.phone,
          clientEmail: r.cli.email,
          clientMetadata: clientMeta, 
          plate: vehicle?.plate || meta?.carPlate || 'N/A', 
          brand: vehicle?.brand || meta?.carBrand || '', 
          model: vehicle?.model || meta?.carModel || '', 
          year: vehicle?.year || meta?.carYear || '', 
          mileage: vehicle?.currentMileage || meta?.carMileage || '0', 
          serviceType: r.svc?.name || 'General', 
          estimatedCost: r.apt.estimatedCost || '0.00',
          notes: r.apt.staffNotes,
          metadata: meta, 
          hasWorkOrder: !!r.wo,
          service: r.svc 
        };
      }) 
    });
  } catch (error: any) { 
    return res.status(500).json({ success: false, error: error.message }); 
  }
}

// 🛠️ POS UNIVERSAL: CIERRE DE ORDEN Y LÓGICA DE FIDELIZACIÓN (WIN-WIN)
export async function completeWorkOrder(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { appointmentId } = req.params;
    
    console.log("📥 Recibiendo cierre de orden para ID:", appointmentId, "Tenant:", tenantId);

    const { 
      finalCost, 
      mechanicNotes, 
      exitMileage, 
      oldParts, 
      newParts, 
      nextServiceDate, 
      staffId,
      oldPartImageUrl, 
      newPartImageUrl,
      rewardApplied,            
      referralDiscountApplied   
    } = req.body;

    if (!tenantId || !appointmentId) {
      return res.status(400).json({ error: 'Faltan identificadores (tenantId o appointmentId).' });
    }

    const [currentApt] = await db.select().from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));

    if (!currentApt) {
      return res.status(404).json({ error: 'Cita u Orden no encontrada en la base de datos.' });
    }

    const existingMetadata = safeParseJSON(currentApt.mediaAndReports);
    const vehicleId = existingMetadata.vehicleId || null;
    
    // Validamos si el staffId existe en users para no violar la FK en work_orders o appointments
    const requestedStaffId = staffId || currentApt.staffId || existingMetadata.assignedStaffId || null;
    const safeDbStaffId = await resolveSafeUserStaffId(requestedStaffId);

    let workOrder: any = null;
    try {
      const [wo] = await db.insert(workOrders).values({
        tenantId,
        appointmentId: currentApt.id,
        vehicleId: vehicleId, 
        staffId: requestedStaffId,
        finalCost: finalCost ? String(finalCost) : '0.00',
        mechanicNotes: mechanicNotes || '',
        oldParts: oldParts || '',
        newParts: newParts || '',
        oldPartImageUrl: oldPartImageUrl || null, 
        newPartImageUrl: newPartImageUrl || null, 
        nextServiceRecommendation: nextServiceDate || ''
      }).returning();
      workOrder = wo;
    } catch (woErr: any) {
      const [woFallback] = await db.insert(workOrders).values({
        tenantId,
        appointmentId: currentApt.id,
        vehicleId: vehicleId, 
        staffId: safeDbStaffId,
        finalCost: finalCost ? String(finalCost) : '0.00',
        mechanicNotes: mechanicNotes || '',
        oldParts: oldParts || '',
        newParts: newParts || '',
        oldPartImageUrl: oldPartImageUrl || null, 
        newPartImageUrl: newPartImageUrl || null, 
        nextServiceRecommendation: nextServiceDate || ''
      }).returning();
      workOrder = woFallback;
    }

    if (vehicleId && exitMileage) {
      await db.update(vehicles)
        .set({ currentMileage: String(exitMileage) })
        .where(eq(vehicles.id, vehicleId));
    }

    const [updatedApt] = await db.update(appointments).set({
      status: 'completed',
      staffId: safeDbStaffId,
      finalCost: finalCost ? String(finalCost) : '0.00',
      staffNotes: mechanicNotes || currentApt.staffNotes,
      mediaAndReports: { 
        ...existingMetadata, 
        workOrderId: workOrder.id,
        assignedStaffId: requestedStaffId 
      } 
    }).where(eq(appointments.id, appointmentId)).returning();

    // =========================================================================
    // 🎁 MOTOR DE FIDELIZACIÓN Y REFERIDOS (1 CUPÓN POR SERVICIO + ACUMULACIÓN)
    // =========================================================================
    
    // 1. Manejo del Cliente Actual (El que está pagando hoy)
    const [client] = await db.select().from(users).where(eq(users.id, currentApt.clientId));
    
    if (client) {
      const clientMeta = safeParseJSON(client.metadata);
      let currentVisits = Number(client.loyaltyVisits || 0);

      if (rewardApplied) {
        currentVisits = 0;
      } else {
        currentVisits += 1;
      }

      // 🌟 REGLA DE FIDELIDAD: Solo consume 1 cupón por servicio.
      if (referralDiscountApplied) {
        clientMeta.earnedReferralDiscounts = Number(clientMeta.earnedReferralDiscounts || 0) - 1;
      }

      await db.update(users).set({ 
        loyaltyVisits: currentVisits,
        metadata: clientMeta 
      }).where(eq(users.id, client.id));
    }

    // 2. Darle el Premio al Referidor (Cuando el amigo recomendado completa su cita)
    const rawReferredBy = existingMetadata.referredBy || existingMetadata.preferences?.referredBy || '';
    const cleanPhone = extractCleanPhone(rawReferredBy);
    
    if (cleanPhone.length >= 7) {
      const [referrer] = await db.select().from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            sql`regexp_replace(${users.phone}, '[^0-9]', '', 'g') LIKE ${'%' + cleanPhone + '%'}`
          )
        );
      
      if (referrer && referrer.id !== client?.id) {
        const referrerMeta = safeParseJSON(referrer.metadata);
        const earned = Number(referrerMeta.earnedReferralDiscounts || 0) + 1;

        await db.update(users).set({ 
          loyaltyVisits: Number(referrer.loyaltyVisits || 0) + 1, 
          metadata: { 
            ...referrerMeta, 
            earnedReferralDiscounts: earned, 
            lastReferred: client?.name || 'un amigo' 
          } 
        }).where(eq(users.id, referrer.id));
        
        console.log(`✅ [REFERIDO] Premio guardado para el usuario: ${referrer.name} (Total cupones: ${earned}) por referir a ${client?.name}`);
        
        sendTelegramNotification(`🎉 <b>¡Referido Exitoso!</b>\nEl usuario ${referrer.name} acaba de ganar +1 punto de fidelidad y 1 CUPÓN DE DESCUENTO (Disponibles: ${earned}) porque su referido (${client?.name}) completó su primera cita.`);
      } else {
        console.log(`❌ [REFERIDO] No se encontró referidor válido con el número: ${cleanPhone}`);
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Orden guardada con éxito y Puntos actualizados.',
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
    const { identifier } = req.params;

    if (!tenantId || !identifier) {
      return res.status(400).json({ error: 'Falta el identificador de búsqueda.' });
    }

    let clientRecord: any = null;
    let vehicleRecord: any = null;
    let rawOrders: any[] = [];
    const cleanIdentifier = identifier.trim().toLowerCase();

    // 1. Buscar por Email
    if (cleanIdentifier.includes('@')) {
      const [client] = await db.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.email, cleanIdentifier)));
      if (!client) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
      clientRecord = client;
      
      const apts = await db.select().from(appointments).where(eq(appointments.clientId, client.id));
      if (apts.length > 0) {
        rawOrders = await db.select({
          wo: workOrders,
          svc: services
        })
        .from(workOrders)
        .innerJoin(appointments, eq(workOrders.appointmentId, appointments.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(inArray(workOrders.appointmentId, apts.map(a => a.id)))
        .orderBy(workOrders.createdAt);
      }

    // 2. Buscar por Teléfono (Ignorando +1, espacios o guiones en ambos lados)
    } else if (cleanIdentifier.replace(/\D/g, '').length >= 7) {
      const numericPhone = extractCleanPhone(cleanIdentifier); 
      
      const [client] = await db.select().from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            sql`regexp_replace(${users.phone}, '[^0-9]', '', 'g') LIKE ${'%' + numericPhone + '%'}`
          )
        );

      if (!client) return res.status(404).json({ success: false, error: 'Cliente no encontrado.' });
      clientRecord = client;

      const apts = await db.select().from(appointments).where(eq(appointments.clientId, client.id));
      if (apts.length > 0) {
        rawOrders = await db.select({
          wo: workOrders,
          svc: services
        })
        .from(workOrders)
        .innerJoin(appointments, eq(workOrders.appointmentId, appointments.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(inArray(workOrders.appointmentId, apts.map(a => a.id)))
        .orderBy(workOrders.createdAt);
      }

    // 3. Buscar por Placa de Vehículo
    } else {
      const [vRecord] = await db.select().from(vehicles)
        .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.plate, cleanIdentifier.toUpperCase())));

      if (!vRecord) {
        return res.status(404).json({ success: false, error: 'No se encontró registro con ese dato.' });
      }
      vehicleRecord = vRecord; 

      const [cRecord] = await db.select().from(users).where(eq(users.id, vRecord.clientId));
      clientRecord = cRecord;

      rawOrders = await db.select({
        wo: workOrders,
        svc: services
      })
      .from(workOrders)
      .innerJoin(appointments, eq(workOrders.appointmentId, appointments.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(eq(workOrders.vehicleId, vRecord.id))
      .orderBy(workOrders.createdAt);
    }

    const formattedHistory = rawOrders.map(row => ({
      ...row.wo,
      service: row.svc 
    }));

    return res.status(200).json({
      success: true,
      client: clientRecord ? { ...clientRecord, metadata: safeParseJSON(clientRecord.metadata) } : null,
      vehicle: vehicleRecord,
      serviceHistory: formattedHistory 
    });

  } catch (error: any) {
    console.error("Error en búsqueda de expediente:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// =========================================================================
// 📢 ENDPOINTS PARA LA TABLA public.push_campaigns (OBTENER Y CREAR)
// =========================================================================
export async function getPushCampaigns(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(400).json({ error: 'Falta x-tenant-id' });

    const result = await db.execute(sql`
      SELECT id, tenant_id, title, message, target_audience, sent_at
      FROM public.push_campaigns
      WHERE tenant_id = ${tenantId}
      ORDER BY sent_at DESC
    `);

    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    return res.status(200).json({ success: true, campaigns: rows });
  } catch (error: any) {
    console.error("Error obteniendo push_campaigns:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createPushCampaign(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { title, message, target_audience } = req.body;

    if (!tenantId || !title || !message) {
      return res.status(400).json({ error: 'Faltan datos obligatorios de la campaña.' });
    }

    const result = await db.execute(sql`
      INSERT INTO public.push_campaigns (tenant_id, title, message, target_audience, sent_at)
      VALUES (${tenantId}, ${title}, ${message}, ${target_audience || 'all_clients'}, NOW())
      RETURNING id, tenant_id, title, message, target_audience, sent_at
    `);

    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    const created = rows[0];

    sendTelegramNotification(`📢 <b>¡CAMPAÑA PUSH ENVIADA!</b>\n🎯 <b>Audiencia:</b> ${target_audience}\n📌 <b>Título:</b> ${title}\n💬 <b>Mensaje:</b> ${message}`);

    return res.status(201).json({ success: true, campaign: created });
  } catch (error: any) {
    console.error("Error creando push_campaign:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// =========================================================================
// ⭐ ENDPOINT OFICIAL: 1 SOLA RESEÑA Y 1 LIKE/DISLIKE POR CLIENTE ÚNICO
// =========================================================================
export async function saveClientReview(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { clientId, clientName, clientPhone, rating, reaction, comment, serviceName } = req.body;

    if (!tenantId || (!clientId && !clientPhone && !clientName)) {
      return res.status(400).json({ error: 'Falta identificar al cliente o al negocio.' });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) return res.status(404).json({ error: 'Negocio no encontrado.' });

    const loyaltyConfig = safeParseJSON((tenant as any).loyaltyConfig);
    const existingReviews: any[] = Array.isArray(loyaltyConfig.reviews) ? loyaltyConfig.reviews : [];

    const cleanPhoneKey = extractCleanPhone(clientPhone || '');
    const clientKey = String(clientId || cleanPhoneKey || clientName).toLowerCase().trim();

    // Regulación estricta: Filtramos cualquier reseña previa del mismo cliente (por ID, Teléfono o Nombre)
    const filteredReviews = existingReviews.filter((r: any) => {
      const rKey = String(r.clientId || extractCleanPhone(r.clientPhone || '') || r.clientName || '').toLowerCase().trim();
      return rKey !== clientKey;
    });

    const newReview = {
      id: `rev-${clientKey}`,
      clientId: clientId || cleanPhoneKey || clientName,
      clientPhone: cleanPhoneKey,
      clientName: clientName || 'Cliente Verificado',
      rating: Number(rating || (reaction === 'dislike' ? 2 : 5)),
      reaction: reaction || (Number(rating) >= 4 ? 'like' : 'dislike'),
      comment: comment ? String(comment).trim() : '',
      serviceName: serviceName || 'Cliente Frecuente',
      createdAt: new Date().toISOString()
    };

    const updatedReviews = [newReview, ...filteredReviews];
    const updatedLoyalty = { ...loyaltyConfig, reviews: updatedReviews };

    await db.update(tenants)
      .set({ loyaltyConfig: updatedLoyalty } as any)
      .where(eq(tenants.id, tenantId));

    return res.status(200).json({
      success: true,
      review: newReview,
      reviews: updatedReviews
    });
  } catch (error: any) {
    console.error("Error guardando reseña única:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// =========================================================================
// ❌ CANCELAR CITA, LIBERAR ESPACIO EN AGENDA Y ENVIAR TELEGRAM + EXPO PUSH
// =========================================================================
export async function cancelAppointment(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { appointmentId } = req.params;
    const { reason, cancelledBy, clientName, clientPhone, serviceName, appointmentDate, time } = req.body || {};

    if (!tenantId || !appointmentId) {
      return res.status(400).json({ success: false, error: 'Faltan identificadores (tenantId o appointmentId).' });
    }

    const [currentApt] = await db.select().from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));

    if (!currentApt) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada.' });
    }

    const [client] = await db.select().from(users).where(eq(users.id, currentApt.clientId));
    let [service] = currentApt.serviceId
      ? await db.select().from(services).where(eq(services.id, currentApt.serviceId))
      : [null as any];

    const existingMeta = safeParseJSON(currentApt.mediaAndReports);
    const cancelReason = reason ? String(reason).trim() : 'Sin motivo especificado';
    const whoCancelled = cancelledBy === 'client' ? 'Cliente (desde Expediente)' : 'Personal del Negocio (Portal Interno)';

    // 1. Marcar como 'cancelled' en PostgreSQL (libera automáticamente el turno y la silla del profesional)
    const [cancelledApt] = await db.update(appointments)
      .set({
        status: 'cancelled',
        staffNotes: `❌ CANCELADA (${whoCancelled}): ${cancelReason}`,
        mediaAndReports: {
          ...existingMeta,
          cancelledAt: new Date().toISOString(),
          cancelledBy: cancelledBy || 'staff',
          cancelReason
        }
      })
      .where(eq(appointments.id, appointmentId))
      .returning();

    const finalClientName = client?.name || clientName || 'Cliente';
    const finalClientPhone = client?.phone || clientPhone || 'N/A';
    const finalServiceName = service?.name || serviceName || 'Servicio General';
    const formattedDate = formatWallClockForNotification(currentApt.scheduledAt, existingMeta, appointmentDate, time);

    // 2. Disparar alerta a Telegram informando que el turno quedó libre
    const telegramMsg = `
❌ <b>¡CITA CANCELADA — ESPACIO LIBERADO!</b> ❌
👤 <b>Cliente:</b> ${finalClientName}
📞 <b>Teléfono:</b> ${finalClientPhone}
🗓️ <b>Turno liberado:</b> ${formattedDate}
🛠️ <b>Servicio:</b> ${finalServiceName}
🙋‍♂️ <b>Cancelada por:</b> ${whoCancelled}
📝 <b>Motivo:</b> ${cancelReason}
✅ <i>El horario ya quedó disponible nuevamente en la agenda.</i>
    `;
    sendTelegramNotification(telegramMsg);

    // 3. Disparar Notificación Push vía Expo a los dispositivos registrados en public.user_devices
    try {
      const devicesRes = await db.execute(sql`
        SELECT d.push_token 
        FROM public.user_devices d
        INNER JOIN public.users u ON u.id = d.user_id
        WHERE u.tenant_id = ${tenantId}::uuid AND d.is_active = true
      `);
      const deviceRows = Array.isArray(devicesRes) ? devicesRes : (devicesRes as any).rows || [];
      const tokens = deviceRows.map((r: any) => r.push_token).filter((t: string) => t && t.startsWith('ExponentPushToken'));

      if (tokens.length > 0) {
        const pushMessages = tokens.map((token: string) => ({
          to: token,
          sound: 'default',
          title: '❌ Cita Cancelada — Turno Disponible',
          body: `${finalClientName} canceló ${finalServiceName} (${formattedDate}). El espacio ya está libre.`,
          data: { tenantId, appointmentId, status: 'cancelled' }
        }));

        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(pushMessages)
        });
      }
    } catch (pushErr) {
      console.warn('⚠️ Info Push en cancelación:', pushErr);
    }

    return res.status(200).json({
      success: true,
      message: 'Cita cancelada y espacio liberado exitosamente.',
      appointment: cancelledApt
    });
  } catch (error: any) {
    console.error('Error cancelando cita:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


// =========================================================================
// ✅ CONFIRMAR ASISTENCIA (RESPUESTA AL RECORDATORIO DE 6 HORAS) -> TELEGRAM + EXPO PUSH
// =========================================================================
export async function confirmAppointment(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { appointmentId } = req.params;
    const { confirmedBy, clientName, clientPhone, serviceName, appointmentDate, time } = req.body || {};

    if (!tenantId || !appointmentId) {
      return res.status(400).json({ success: false, error: 'Faltan identificadores (tenantId o appointmentId).' });
    }

    const [currentApt] = await db.select().from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));

    if (!currentApt) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada.' });
    }

    const [client] = await db.select().from(users).where(eq(users.id, currentApt.clientId));
    const [service] = currentApt.serviceId
      ? await db.select().from(services).where(eq(services.id, currentApt.serviceId))
      : [null as any];

    const existingMeta = safeParseJSON(currentApt.mediaAndReports);
    const [updatedApt] = await db.update(appointments)
      .set({
        status: 'confirmed',
        mediaAndReports: {
          ...existingMeta,
          attendanceConfirmed: true,
          confirmedAt: new Date().toISOString(),
          confirmedBy: confirmedBy || 'client'
        }
      })
      .where(eq(appointments.id, appointmentId))
      .returning();

    const finalClientName = client?.name || clientName || 'Cliente';
    const finalClientPhone = client?.phone || clientPhone || 'N/A';
    const finalServiceName = service?.name || serviceName || 'Servicio General';
    const formattedDate = formatWallClockForNotification(currentApt.scheduledAt, existingMeta, appointmentDate, time);

    // 1. Notificar a Telegram que el cliente confirmó su asistencia
    const telegramMsg = `
✅ <b>¡ASISTENCIA CONFIRMADA POR EL CLIENTE!</b> ✅
👤 <b>Cliente:</b> ${finalClientName}
📞 <b>Teléfono:</b> ${finalClientPhone}
🗓️ <b>Cita:</b> ${formattedDate}
🛠️ <b>Servicio:</b> ${finalServiceName}
🔒 <i>El cliente confirmó su asistencia (Política 6h/3h). Turno 100% asegurado.</i>
    `;
    sendTelegramNotification(telegramMsg);

    // 2. Enviar Notificación Push vía Expo a los dispositivos del negocio
    try {
      const devicesRes = await db.execute(sql`
        SELECT d.push_token 
        FROM public.user_devices d
        INNER JOIN public.users u ON u.id = d.user_id
        WHERE u.tenant_id = ${tenantId}::uuid AND d.is_active = true
      `);
      const deviceRows = Array.isArray(devicesRes) ? devicesRes : (devicesRes as any).rows || [];
      const tokens = deviceRows.map((r: any) => r.push_token).filter((t: string) => t && t.startsWith('ExponentPushToken'));

      if (tokens.length > 0) {
        const pushMessages = tokens.map((token: string) => ({
          to: token,
          sound: 'default',
          title: '✅ Asistencia Confirmada',
          body: `${finalClientName} confirmó su cita de ${finalServiceName} (${formattedDate}).`,
          data: { tenantId, appointmentId, status: 'confirmed' }
        }));

        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(pushMessages)
        });
      }
    } catch (pushErr) {}

    return res.status(200).json({
      success: true,
      message: 'Asistencia confirmada exitosamente.',
      appointment: updatedApt
    });
  } catch (error: any) {
    console.error('Error confirmando asistencia:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// =========================================================================
// 🔔 RECORDATORIO 6 HORAS ANTES (SOLICITA CONFIRMAR O LIBERAR CON 3H DE MARGEN)
// =========================================================================
export async function sendAppointmentReminder(req: Request, res: Response) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { appointmentId } = req.params;
    const { clientName, clientPhone, serviceName, appointmentDate, time } = req.body || {};

    if (!tenantId || !appointmentId) {
      return res.status(400).json({ success: false, error: 'Faltan identificadores.' });
    }

    const [currentApt] = await db.select().from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));

    if (!currentApt) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada.' });
    }

    const [client] = await db.select().from(users).where(eq(users.id, currentApt.clientId));
    const [service] = currentApt.serviceId
      ? await db.select().from(services).where(eq(services.id, currentApt.serviceId))
      : [null as any];

    const existingMeta = safeParseJSON(currentApt.mediaAndReports);
    await db.update(appointments)
      .set({
        mediaAndReports: {
          ...existingMeta,
          reminder6hSent: true,
          reminderSentAt: new Date().toISOString()
        }
      })
      .where(eq(appointments.id, appointmentId));

    const finalClientName = client?.name || clientName || 'Cliente';
    const finalClientPhone = client?.phone || clientPhone || 'N/A';
    const finalServiceName = service?.name || serviceName || 'Servicio General';
    const formattedDate = formatWallClockForNotification(currentApt.scheduledAt, existingMeta, appointmentDate, time);

    const telegramMsg = `
⏰ <b>¡RECORDATORIO DE CITA (6 HORAS ANTES)!</b> ⏰
👤 <b>Cliente:</b> ${finalClientName} (${finalClientPhone})
🗓️ <b>Horario:</b> ${formattedDate}
🛠️ <b>Servicio:</b> ${finalServiceName}
📲 <i>Se solicitó al cliente confirmar su asistencia en Expediente o cancelar con mínimo 3 horas de anticipación para no perder el espacio.</i>
    `;
    sendTelegramNotification(telegramMsg);

    // Enviar Push a dispositivos activos
    try {
      const devicesRes = await db.execute(sql`
        SELECT d.push_token 
        FROM public.user_devices d
        INNER JOIN public.users u ON u.id = d.user_id
        WHERE u.tenant_id = ${tenantId}::uuid AND d.is_active = true
      `);
      const deviceRows = Array.isArray(devicesRes) ? devicesRes : (devicesRes as any).rows || [];
      const tokens = deviceRows.map((r: any) => r.push_token).filter((t: string) => t && t.startsWith('ExponentPushToken'));

      if (tokens.length > 0) {
        const pushMessages = tokens.map((token: string) => ({
          to: token,
          sound: 'default',
          title: '⏰ Recordatorio de tu Cita (En 6 horas)',
          body: `Hola ${finalClientName}, confirma tu asistencia para ${finalServiceName} (${formattedDate}) o libera el turno con al menos 3h de anticipación.`,
          data: { tenantId, appointmentId, action: 'confirm_or_cancel' }
        }));

        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(pushMessages)
        });
      }
    } catch (pushErr) {}

    return res.status(200).json({
      success: true,
      message: 'Recordatorio de 6 horas enviado por Telegram y Push.'
    });
  } catch (error: any) {
    console.error('Error enviando recordatorio 6h:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
