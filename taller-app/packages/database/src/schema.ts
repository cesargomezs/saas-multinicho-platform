import { pgTable, uuid, varchar, text, timestamp, jsonb, decimal, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// 1. TENANTS (SaaS - Negocios Cliente)
// ============================================================================
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  niche: varchar('niche', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow()
});

// ============================================================================
// 2. USERS (Clientes y Staff, con aislamiento Multi-Tenant)
// ============================================================================
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  role: varchar('role', { length: 50 }).default('client').notNull(), // 'admin', 'staff', 'client'
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  metadata: jsonb('metadata').default({}), 
  messagingOptOut: boolean('messaging_opt_out').default(false),
  expoPushToken: varchar('expo_push_token', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 3. INVENTORY (Control de stock general para cualquier negocio)
// ============================================================================
export const inventory = pgTable('inventory', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }),
  stock: decimal('stock', { precision: 10, scale: 2 }).default('0'),
  unit: varchar('unit', { length: 20 }),
  unitCost: decimal('unit_cost', { precision: 10, scale: 2 }).default('0'),
  minStockAlert: decimal('min_stock_alert', { precision: 10, scale: 2 }).default('5'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 4. SERVICES CATALOG (Catálogo genérico de servicios)
// ============================================================================
export const services = pgTable('services', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  durationMinutes: integer('duration_minutes').default(30),
  requiredInventory: jsonb('required_inventory').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 5. APPOINTMENTS / WORK ORDERS (Motor Operativo Central)
// ============================================================================
export const appointments = pgTable('appointments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  clientId: uuid('client_id').references(() => users.id).notNull(),
  staffId: uuid('staff_id').references(() => users.id),
  serviceId: uuid('service_id').references(() => services.id),
  scheduledAt: timestamp('scheduled_at').notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  estimatedCost: decimal('estimated_cost', { precision: 10, scale: 2 }),
  finalCost: decimal('final_cost', { precision: 10, scale: 2 }),
  notes: text('notes'),
  staffNotes: text('staff_notes'),
  mediaAndReports: jsonb('media_and_reports').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 6. VEHICLES (Master de Vehículos para agilizar futuras citas)
// ============================================================================
export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  clientId: uuid('client_id').references(() => users.id).notNull(),
  plate: varchar('plate', { length: 20 }).notNull(),
  brand: varchar('brand', { length: 100 }),
  model: varchar('model', { length: 100 }),
  year: varchar('year', { length: 4 }),
  currentMileage: varchar('current_mileage', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 7. WORK ORDERS / SALES (Master del POS, Ventas e Imágenes)
// ============================================================================
export const workOrders = pgTable('work_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  appointmentId: uuid('appointment_id').references(() => appointments.id),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id),
  staffId: uuid('staff_id').references(() => users.id), // El mecánico que hizo el trabajo
  
  finalCost: decimal('final_cost', { precision: 10, scale: 2 }).notNull(), // Para el reporte de ventas POS
  mechanicNotes: text('mechanic_notes'),
  
  oldParts: text('old_parts'),
  newParts: text('new_parts'),
  oldPartImageUrl: text('old_part_image_url'), // Link de Supabase
  newPartImageUrl: text('new_part_image_url'), // Link de Supabase
  
  nextServiceRecommendation: varchar('next_service', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 8. STAFF (Master del equipo de trabajo, para asignar citas y reportes)
// ============================================================================

export const staff = pgTable('staff', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// DEFINICIÓN DE RELACIONES (Drizzle ORM)
// ============================================================================
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  inventory: many(inventory),
  services: many(services),
  appointments: many(appointments),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  clientAppointments: many(appointments, { relationName: 'clientAppointments' }),
  staffAppointments: many(appointments, { relationName: 'staffAppointments' }),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  tenant: one(tenants, {
    fields: [inventory.tenantId],
    references: [tenants.id],
  }),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [services.tenantId],
    references: [tenants.id],
  }),
  appointments: many(appointments),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [appointments.tenantId],
    references: [tenants.id],
  }),
  client: one(users, {
    fields: [appointments.clientId],
    references: [users.id],
    relationName: 'clientAppointments',
  }),
  staff: one(users, {
    fields: [appointments.staffId],
    references: [users.id],
    relationName: 'staffAppointments',
  }),
  service: one(services, {
    fields: [appointments.serviceId],
    references: [services.id],
  }),
}));