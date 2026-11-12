import { pgTable, uuid, varchar, text, timestamp, jsonb, decimal, integer, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// 1. TENANTS (SaaS - Negocios Cliente)
// ============================================================================
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  niche: varchar('niche', { length: 50 }),
  
  // 🎨 BRANDING (Marca Blanca UI/UX)
  logoUrl: text('logo_url'),
  coverImageUrl: text('cover_image_url'),
  primaryColor: varchar('primary_color', { length: 9 }).default('#FF5E00'), 
  fontFamily: varchar('font_family', { length: 50 }).default('Inter'),

  // 💳 FACTURACIÓN Y PAGOS (Stripe)
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }), 
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  stripeAccountId: varchar('stripe_account_id', { length: 255 }), 
  planTier: varchar('plan_tier', { length: 50 }).default('basic'), 
  subscriptionStatus: varchar('subscription_status', { length: 50 }).default('active'), 
  currentPeriodEnd: timestamp('current_period_end'), 

  // 📢 CONTROL DE LÍMITES (Marketing Push)
  pushLimitWeekly: integer('push_limit_weekly').default(0), 
  pushUsedThisWeek: integer('push_used_this_week').default(0),

  // 📍 GEOLOCALIZACIÓN Y CONTACTO
  phoneContact: varchar('phone_contact', { length: 50 }),
  address: varchar('address', { length: 255 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  zipCode: varchar('zip_code', { length: 20 }),
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 11, scale: 8 }),
  
  // 🕒 CONFIGURACIÓN OPERATIVA
  timezone: varchar('timezone', { length: 50 }).default('America/Los_Angeles'),
  businessHours: jsonb('business_hours').default({}), 
  
  // 📸 PORTAFOLIO VISUAL (Imágenes, descripciones y precios)
  portfolio: jsonb('portfolio').default([]),

  // 🌟 CONFIGURACIÓN DE FIDELIZACIÓN, REFERIDOS, CAMPAÑAS Y RESEÑAS
  loyaltyConfig: jsonb('loyalty_config').default({ 
    isActive: true, 
    visitsRequired: 10,           // Visitas necesarias para el premio
    rewardType: 'free_service',   // Tipo de premio ('free_service' | 'discount')
    rewardValue: 100,             // Valor (ej. 100%)
    referralActive: true,
    referralDiscountPercent: 20,
    reviews: [],
    campaigns: []
  }),

  createdAt: timestamp('created_at').defaultNow()
});

// ============================================================================
// 2. USERS (Clientes, Staff y Dueños - Módulo CCPA/GDPR)
// ============================================================================
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  role: varchar('role', { length: 50 }).default('client').notNull(), 
  
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(), 
  phone: varchar('phone', { length: 50 }), 
  zipCode: varchar('zip_code', { length: 20 }), 
  age: integer('age'), 
  
  // 🌟 MONEDERO DE VISITAS DEL CLIENTE
  loyaltyVisits: integer('loyalty_visits').default(0), 
  
  messagingOptOut: boolean('messaging_opt_out').default(false), 
  
  // ⚖️ CUMPLIMIENTO LEGAL (SOFT DELETE / ANONIMIZACIÓN)
  isAnonymized: boolean('is_anonymized').default(false),
  anonymizedAt: timestamp('anonymized_at'),
  
  metadata: jsonb('metadata').default({}), 
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    tenantEmailUnique: uniqueIndex('users_tenant_email_idx').on(table.tenantId, table.email),
  };
});

// ============================================================================
// 2.1 USER DEVICES (Múltiples dispositivos por usuario para Push)
// ============================================================================
export const userDevices = pgTable('user_devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  pushToken: varchar('push_token', { length: 255 }).notNull().unique(), 
  deviceModel: varchar('device_model', { length: 100 }), 
  os: varchar('os', { length: 50 }), 
  isActive: boolean('is_active').default(true),
  lastUsedAt: timestamp('last_used_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 3. INVENTORY
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
// 4. SERVICES CATALOG
// ============================================================================
export const services = pgTable('services', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  
  description: text('description'),
  imageUrl: text('image_url'),
  
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  durationMinutes: integer('duration_minutes').default(30),
  requiredInventory: jsonb('required_inventory').default({}),
  isActive: boolean('is_active').default(true), 
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 5. APPOINTMENTS / WORK ORDERS
// ============================================================================
export const appointments = pgTable('appointments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  clientId: uuid('client_id').references(() => users.id).notNull(),
  // 🌟 FIX FK: Apunta a staff.id
  staffId: uuid('staff_id').references(() => staff.id),
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
// 6. VEHICLES
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
// 7. WORK ORDERS / SALES (Master del POS)
// ============================================================================
export const workOrders = pgTable('work_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  appointmentId: uuid('appointment_id').references(() => appointments.id),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id),
  // 🌟 FIX FK: Apunta a staff.id
  staffId: uuid('staff_id').references(() => staff.id), 
  finalCost: decimal('final_cost', { precision: 10, scale: 2 }).notNull(), 
  mechanicNotes: text('mechanic_notes'),
  oldParts: text('old_parts'),
  newParts: text('new_parts'),
  oldPartImageUrl: text('old_part_image_url'), 
  newPartImageUrl: text('new_part_image_url'), 
  nextServiceRecommendation: varchar('next_service', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 8. STAFF
// ============================================================================
export const staff = pgTable('staff', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// 9. PUSH CAMPAIGNS (Marketing SaaS con Control Activa / Inactiva)
// ============================================================================
export const pushCampaigns = pgTable('push_campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  targetAudience: varchar('target_audience', { length: 50 }).default('all_clients'),
  isActive: boolean('is_active').default(true).notNull(),
  sentAt: timestamp('sent_at').defaultNow(),
});

// ============================================================================
// 10. REVIEWS (Calificaciones, 1 Like/Dislike y 1 Reseña Única por Cliente)
// ============================================================================
export const reviews = pgTable('reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  clientId: uuid('client_id').references(() => users.id).notNull(),
  appointmentId: uuid('appointment_id').references(() => appointments.id),
  rating: integer('rating').notNull(),
  reaction: varchar('reaction', { length: 20 }).default('like'), // 'like' | 'dislike'
  comment: text('comment'),
  likes: integer('likes').default(0),
  dislikes: integer('dislikes').default(0),
  isFlagged: boolean('is_flagged').default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    // 🌟 REGULACIÓN: Garantiza máximo 1 reseña y 1 reacción por Usuario en cada Negocio
    tenantClientUniqueReview: uniqueIndex('reviews_tenant_client_unique_idx').on(table.tenantId, table.clientId),
  };
});

// ============================================================================
// 11. REPORTS (Moderación y UGC compliance Apple/Google)
// ============================================================================
export const reports = pgTable('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  reporterId: uuid('reporter_id').references(() => users.id).notNull(), 
  targetType: varchar('target_type', { length: 50 }).notNull(), 
  targetId: uuid('target_id').notNull(), 
  reason: text('reason').notNull(), 
  status: varchar('status', { length: 50 }).default('pending'), 
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 12. AUDIT LOGS (Rastreo Legal CCPA/GDPR de acciones destructivas)
// ============================================================================
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(), 
  entityId: uuid('entity_id').notNull(), 
  action: varchar('action', { length: 100 }).notNull(), 
  performedBy: uuid('performed_by'), 
  details: jsonb('details').default({}), 
  ipAddress: varchar('ip_address', { length: 45 }), 
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 13. LEGAL DOCUMENTS (Control de Versiones de T&C y Políticas)
// ============================================================================
export const legalDocuments = pgTable('legal_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id), 
  documentType: varchar('document_type', { length: 50 }).notNull(), 
  version: varchar('version', { length: 20 }).notNull(), 
  contentUrl: text('content_url').notNull(), 
  isActive: boolean('is_active').default(true).notNull(),
  publishedAt: timestamp('published_at').defaultNow(),
});

// ============================================================================
// 14. USER LEGAL ACCEPTANCES (El registro inmutable de aceptación)
// ============================================================================
export const userLegalAcceptances = pgTable('user_legal_acceptances', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  documentId: uuid('document_id').references(() => legalDocuments.id).notNull(),
  acceptedAt: timestamp('accepted_at').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 45 }), 
  userAgent: text('user_agent'), 
});

// ============================================================================
// DEFINICIÓN DE RELACIONES (Drizzle ORM)
// ============================================================================
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  inventory: many(inventory),
  services: many(services),
  appointments: many(appointments),
  staff: many(staff),
  pushCampaigns: many(pushCampaigns),
  reviews: many(reviews),
  reports: many(reports),
  auditLogs: many(auditLogs),
  legalDocuments: many(legalDocuments),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  devices: many(userDevices),
  legalAcceptances: many(userLegalAcceptances),
  clientAppointments: many(appointments, { relationName: 'clientAppointments' }),
  reviews: many(reviews),
  reportsMade: many(reports),
}));

export const userDevicesRelations = relations(userDevices, ({ one }) => ({
  user: one(users, { fields: [userDevices.userId], references: [users.id] }),
}));

export const legalDocumentsRelations = relations(legalDocuments, ({ one, many }) => ({
  tenant: one(tenants, { fields: [legalDocuments.tenantId], references: [tenants.id] }),
  acceptances: many(userLegalAcceptances),
}));

export const userLegalAcceptancesRelations = relations(userLegalAcceptances, ({ one }) => ({
  user: one(users, { fields: [userLegalAcceptances.userId], references: [users.id] }),
  document: one(legalDocuments, { fields: [userLegalAcceptances.documentId], references: [legalDocuments.id] }),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  tenant: one(tenants, { fields: [inventory.tenantId], references: [tenants.id] }),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  tenant: one(tenants, { fields: [services.tenantId], references: [tenants.id] }),
  appointments: many(appointments),
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
  tenant: one(tenants, { fields: [staff.tenantId], references: [tenants.id] }),
  appointments: many(appointments),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  tenant: one(tenants, { fields: [appointments.tenantId], references: [tenants.id] }),
  client: one(users, { fields: [appointments.clientId], references: [users.id], relationName: 'clientAppointments' }),
  staff: one(staff, { fields: [appointments.staffId], references: [staff.id] }),
  service: one(services, { fields: [appointments.serviceId], references: [services.id] }),
}));

export const pushCampaignsRelations = relations(pushCampaigns, ({ one }) => ({
  tenant: one(tenants, { fields: [pushCampaigns.tenantId], references: [tenants.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  tenant: one(tenants, { fields: [reviews.tenantId], references: [tenants.id] }),
  client: one(users, { fields: [reviews.clientId], references: [users.id] }),
  appointment: one(appointments, { fields: [reviews.appointmentId], references: [appointments.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  tenant: one(tenants, { fields: [reports.tenantId], references: [tenants.id] }),
  reporter: one(users, { fields: [reports.reporterId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
}));