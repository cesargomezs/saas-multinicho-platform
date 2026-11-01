import { pgTable, text, timestamp, uuid, integer, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  phone: text('phone').notNull(),
  role: text('role').notNull().default('client'), // 'admin', 'mechanic', 'client'
  createdAt: timestamp('created_at').defaultNow(),
});

export const vehicles = pgTable('vehicles', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id).notNull(),
    brand: text('brand').notNull(),
    model: text('model').notNull(),
    year: integer('year').notNull(),
    plate: text('plate').unique().notNull(),
    vin: text('vin'),
    mileage: text('mileage'), // <-- Kilometraje actual general
    messagingOptOut: boolean('messaging_opt_out').default(false),
    createdAt: timestamp('created_at').defaultNow(),
  });

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(), // <-- Agregado
  vehicleId: uuid('vehicle_id').references(() => vehicles.id).notNull(),
  serviceType: text('service_type').notNull(), // 'mechanical' o 'bodywork' (latonería)
  appointmentDate: timestamp('appointment_date').notNull(),
  status: text('status').notNull().default('scheduled'), // 'scheduled', 'confirmed', 'completed', 'cancelled'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const workOrders = pgTable('work_orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id).notNull(),
    status: text('status').notNull().default('diagnosis'), 
    mileage: text('mileage'), // <-- Kilometraje exacto al momento de esta orden
    mechanicNotes: text('mechanic_notes'),
    estimatedCost: text('estimated_cost'),
    nextServiceMonth: text('next_service_month'),
    oldPartPhoto: text('old_part_photo'), 
    newPartPhoto: text('new_part_photo'), 
    createdAt: timestamp('created_at').defaultNow(),
  });