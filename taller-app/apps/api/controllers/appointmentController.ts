import { Request, Response } from 'express';
import { db, users, vehicles, appointments } from '@taller/database';
import { eq, and, gte, lt, ne } from 'drizzle-orm';

// Función auxiliar para enviar notificación al bot de Telegram del taller
async function sendTelegramNotification(message: string) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.warn('⚠️ Telegram Bot Token o Chat ID no configurados en las variables de entorno.');
      return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });
  } catch (error) {
    console.error('Error enviando notificación por Telegram:', error);
  }
}

export async function createAppointment(req: Request, res: Response) {
  try {
    const { 
      clientName, 
      clientEmail, 
      clientPhone, 
      carBrand, 
      carModel, 
      carYear, 
      carPlate, 
      carVin, 
      mileage,
      serviceType, 
      appointmentDate, 
      notes 
    } = req.body;

    if (!clientEmail || !clientName || !carPlate) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (nombre, email o placa).' });
    }

    const formattedPlate = carPlate.toUpperCase().trim();

    // 1. Buscar o crear el usuario
    let userRecord = await db.query.users.findFirst({
      where: eq(users.email, clientEmail.trim().toLowerCase())
    });

    if (!userRecord) {
      const [newUser] = await db.insert(users).values({
        name: clientName.trim(),
        email: clientEmail.trim().toLowerCase(),
        phone: clientPhone ? clientPhone.trim() : '',
        role: 'client',
      }).returning();
      userRecord = newUser;
    }

    // 2. Buscar o crear el vehículo asociado al usuario
    let vehicleRecord = await db.query.vehicles.findFirst({
      where: eq(vehicles.plate, formattedPlate)
    });

    if (!vehicleRecord) {
      const [newVehicle] = await db.insert(vehicles).values({
        userId: userRecord.id,
        plate: formattedPlate,
        vin: carVin ? carVin.toUpperCase().trim() : null,
        mileage: mileage ? String(mileage) : null,
        brand: carBrand || 'Porsche',
        model: carModel || '911 GT3',
        year: Number(carYear) || 2025,
      }).returning();
      vehicleRecord = newVehicle;
    } else {
      const [updatedVehicle] = await db.update(vehicles)
        .set({
          vin: carVin ? carVin.toUpperCase().trim() : vehicleRecord.vin,
          mileage: mileage ? String(mileage) : vehicleRecord.mileage
        })
        .where(eq(vehicles.id, vehicleRecord.id))
        .returning();
      vehicleRecord = updatedVehicle;
    }

    const parsedDate = appointmentDate ? new Date(appointmentDate) : new Date();

    // 3. Crear la cita
    const [newAppointment] = await db.insert(appointments).values({
      userId: userRecord.id,
      vehicleId: vehicleRecord.id,
      serviceType: serviceType || 'mechanical',
      appointmentDate: parsedDate,
      notes: notes || 'Sin notas adicionales',
      status: 'scheduled',
    }).returning();

    // 4. Enviar notificación al Telegram del mecánico con la placa corregida
    const serviceName = serviceType === 'bodywork' ? 'Latonería y Pintura' : 'Mecánica General';
    const dateFormatted = parsedDate.toLocaleString('es-ES', { timeZone: 'UTC' });
    
    const telegramMessage = 
      `🚨 *NUEVA CITA AGENDADA EN BAHÍA* 🚨\n\n` +
      `🚗 *Vehículo:* ${carBrand || 'Porsche'} ${carModel || '911 GT3'} (${carYear || 2025})\n` +
      `🔢 *Placa:* \`${formattedPlate}\`\n` +
      `👤 *Cliente:* ${clientName.trim()}\n` +
      `📞 *Teléfono:* +1 ${clientPhone ? clientPhone.trim() : 'Sin teléfono'}\n` +
      `🛠️ *Servicio:* ${serviceName}\n` +
      `📅 *Fecha y Hora:* ${dateFormatted} UTC\n` +
      `📝 *Notas:* ${notes || 'Ninguna'}`;

    sendTelegramNotification(telegramMessage);

    return res.status(201).json({ success: true, appointment: newAppointment });
  } catch (error: any) {
    console.error('Error al registrar la cita en Express:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
}

export async function getAppointments(req: Request, res: Response) {
  try {
    const list = await db.select().from(appointments);
    return res.json(list);
  } catch (error: any) {
    return res.status(500).json({ error: String(error) });
  }
}

export async function checkAvailability(req: Request, res: Response) {
  try {
    const { date } = req.query;
    
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ success: false, error: 'Fecha inválida.' });
    }

    const startOfDay = new Date(`${date}T00:00:00Z`);
    const endOfDay = new Date(`${date}T23:59:59Z`);

    const dayAppointments = await db.query.appointments.findMany({
      where: and(
        gte(appointments.appointmentDate, startOfDay),
        lt(appointments.appointmentDate, endOfDay)
      ),
      columns: {
        appointmentDate: true
      }
    });

    const bookedTimes = dayAppointments.map(app => {
      const appDate = new Date(app.appointmentDate);
      const hours = appDate.getUTCHours().toString().padStart(2, '0');
      const minutes = appDate.getUTCMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    });

    return res.status(200).json({ success: true, bookedTimes });
  } catch (error: any) {
    console.error('Error al verificar disponibilidad:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ESTA ES LA FUNCIÓN AJUSTADA PARA LEER EL LAZY LOADING DE LAS PESTAÑAS
export async function getTodaysAppointments(req: Request, res: Response) {
  try {
    const { filter } = req.query; // Puede ser 'hoy', 'manana' o 'semana'
    
    let startDate = new Date();
    let endDate = new Date();

    if (filter === 'manana') {
      startDate.setDate(startDate.getDate() + 1);
      endDate.setDate(endDate.getDate() + 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (filter === 'semana') {
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(endDate.getDate() + 7);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Default: 'hoy'
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    }

    const rows = await db.select({
      appointment: appointments,
      vehicle: vehicles,
      user: users
    })
    .from(appointments)
    .innerJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
    .innerJoin(users, eq(appointments.userId, users.id))
    .where(
      and(
        gte(appointments.appointmentDate, startDate),
        lt(appointments.appointmentDate, endDate),
        ne(appointments.status, 'completed')
      )
    )
    .orderBy(appointments.appointmentDate);

    const agendaAppointments = rows.map(row => {
      const appDate = new Date(row.appointment.appointmentDate);
      
      // Para la vista de 'semana', mostramos también el día (ej: "Lun, 10:30")
      const timeString = filter === 'semana' 
        ? `${appDate.toLocaleDateString('es-ES', { weekday: 'short' })}, ${appDate.getUTCHours().toString().padStart(2, '0')}:${appDate.getUTCMinutes().toString().padStart(2, '0')}`
        : `${appDate.getUTCHours().toString().padStart(2, '0')}:${appDate.getUTCMinutes().toString().padStart(2, '0')}`;

      return {
        id: row.appointment.id,
        time: timeString,
        clientName: row.user.name,
        plate: row.vehicle.plate,
        brand: row.vehicle.brand,
        model: row.vehicle.model,
        mileage: row.vehicle.mileage || '',
        serviceType: row.appointment.serviceType === 'mechanical' ? 'Mecánica' : 'Latonería',
        notes: row.appointment.notes
      };
    });

    return res.status(200).json({ success: true, appointments: agendaAppointments });
  } catch (error: any) {
    console.error('Error al obtener citas de la agenda:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}