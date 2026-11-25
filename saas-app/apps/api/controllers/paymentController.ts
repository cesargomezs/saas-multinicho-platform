import { Request, Response } from 'express';
import { db, tenants, payments } from '@taller/database';
import { eq, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';

const SUPER_ADMIN_EMAIL = 'cesargomez853@gmail.com';

const PLAN_PRICES_CENTS: Record<string, { amountCents: number; amountDollars: string; label: string }> = {
  starter: { amountCents: 2900, amountDollars: '29.00', label: 'Starter Mensual' },
  pro: { amountCents: 7900, amountDollars: '79.00', label: 'Profesional Mensual' },
  elite: { amountCents: 14900, amountDollars: '149.00', label: 'Élite Mensual' },
};

// ============================================================================
// 🎛️ 1. INTERRUPTOR GLOBAL DE PAGOS CON TARJETA (SUPERADMIN)
// ============================================================================
export async function getPlatformSettings(_req: Request, res: Response) {
  try {
    const result = await db.execute(sql`
      SELECT key, value
      FROM public.platform_settings
      WHERE key = 'card_payments_enabled'
      LIMIT 1
    `);
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    const rawVal = rows?.[0]?.value;
    const cardPaymentsEnabled = rawVal === true || rawVal === 'true';
    return res.status(200).json({ success: true, cardPaymentsEnabled });
  } catch (error: any) {
    return res.status(200).json({ success: true, cardPaymentsEnabled: false });
  }
}

export async function setCardPaymentsEnabled(req: Request, res: Response) {
  try {
    const { enabled, ownerEmail } = req.body || {};
    const cleanOwner = String(ownerEmail || '').trim().toLowerCase();

    if (cleanOwner !== SUPER_ADMIN_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Solo el SuperAdmin autorizado puede cambiar este interruptor.',
      });
    }

    const boolVal = Boolean(enabled);
    await db.execute(sql`
      INSERT INTO public.platform_settings (key, value, updated_at)
      VALUES ('card_payments_enabled', ${String(boolVal)}, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `);

    return res.status(200).json({
      success: true,
      cardPaymentsEnabled: boolVal,
    });
  } catch (error: any) {
    console.error('❌ Error en setCardPaymentsEnabled:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error guardando configuración.' });
  }
}

// ============================================================================
// 💳 2. CREAR SESIÓN DE STRIPE CHECKOUT + REGISTRO PENDIENTE EN `public.payments`
// ============================================================================
export async function createStripeCheckoutSession(req: Request, res: Response) {
  try {
    const { tenantId, planTier, customerEmail, successUrl, cancelUrl } = req.body || {};
    const cleanTenantId = String(tenantId || '').trim();
    const tier = String(planTier || 'pro').trim().toLowerCase();
    const planInfo = PLAN_PRICES_CENTS[tier] || PLAN_PRICES_CENTS.pro;

    if (!cleanTenantId) {
      return res.status(400).json({ success: false, message: 'Falta tenantId para iniciar el checkout.' });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, cleanTenantId));
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Negocio no encontrado.' });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const paymentId = crypto.randomUUID();

    // Si STRIPE_SECRET_KEY está configurada en el entorno, crear sesión real en Stripe API
    if (stripeSecretKey && stripeSecretKey.startsWith('sk_')) {
      const params = new URLSearchParams();
      params.append('mode', 'subscription');
      params.append('success_url', successUrl || 'https://picktimebook.com/register?payment=success');
      params.append('cancel_url', cancelUrl || 'https://picktimebook.com/register?payment=cancel');
      params.append('line_items[0][price_data][currency]', 'usd');
      params.append('line_items[0][price_data][unit_amount]', String(planInfo.amountCents));
      params.append('line_items[0][price_data][recurring][interval]', 'month');
      params.append('line_items[0][price_data][product_data][name]', `PickTime Book - ${planInfo.label}`);
      params.append('metadata[tenantId]', cleanTenantId);
      params.append('metadata[planTier]', tier);
      params.append('metadata[paymentId]', paymentId);

      const emailToUse = String(customerEmail || (tenant as any).adminEmail || '').trim();
      if (emailToUse) {
        params.append('customer_email', emailToUse);
      }

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const sessionJson: any = await stripeRes.json();
      if (!stripeRes.ok || !sessionJson?.id || !sessionJson?.url) {
        throw new Error(sessionJson?.error?.message || 'Error creando sesión en Stripe.');
      }

      await db.insert(payments).values({
        id: paymentId,
        tenantId: cleanTenantId,
        stripeCustomerId: sessionJson.customer || null,
        stripeCheckoutSessionId: sessionJson.id,
        amount: planInfo.amountDollars,
        currency: 'usd',
        status: 'pending',
        paymentMethod: 'stripe_card',
        planTier: tier,
        metadata: { source: 'stripe_checkout', planLabel: planInfo.label },
      } as any);

      return res.status(200).json({
        success: true,
        paymentId,
        sessionId: sessionJson.id,
        checkoutUrl: sessionJson.url,
      });
    }

    // Modo preparación / sin clave Stripe aún en el servidor: registra intento pendiente en `public.payments`
    const simulatedSessionId = `cs_pending_${paymentId.replace(/-/g, '').slice(0, 20)}`;
    await db.insert(payments).values({
      id: paymentId,
      tenantId: cleanTenantId,
      stripeCheckoutSessionId: simulatedSessionId,
      amount: planInfo.amountDollars,
      currency: 'usd',
      status: 'pending',
      paymentMethod: 'stripe_card',
      planTier: tier,
      metadata: { source: 'stripe_pending_config', planLabel: planInfo.label },
    } as any);

    return res.status(200).json({
      success: true,
      configured: false,
      paymentId,
      message: 'Tabla payments lista. Configura STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET en el servidor para redirigir a Stripe Checkout.',
    });
  } catch (error: any) {
    console.error('❌ Error en createStripeCheckoutSession:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error creando sesión de pago.' });
  }
}

// ============================================================================
// 🔔 3. WEBHOOK DE STRIPE (ACTUALIZA `payments` Y `tenants` DE FORMA IDEMPOTENTE)
// ============================================================================
export async function handleStripeWebhook(req: Request, res: Response) {
  try {
    const event = req.body || {};
    const eventType = String(event?.type || '');
    const obj = event?.data?.object || {};

    if (!eventType) {
      return res.status(400).json({ received: false, error: 'Evento inválido' });
    }

    const metaTenantId = String(obj?.metadata?.tenantId || '').trim();
    const metaPlanTier = String(obj?.metadata?.planTier || '').trim();
    const sessionId = obj?.object === 'checkout.session' ? String(obj?.id || '') : String(obj?.checkout_session || '');
    const paymentIntentId = obj?.payment_intent ? String(obj.payment_intent) : (obj?.object === 'payment_intent' ? String(obj?.id || '') : '');
    const invoiceId = obj?.object === 'invoice' ? String(obj?.id || '') : (obj?.invoice ? String(obj.invoice) : '');
    const customerId = obj?.customer ? String(obj.customer) : null;
    const subscriptionId = obj?.subscription ? String(obj.subscription) : (obj?.object === 'subscription' ? String(obj?.id || '') : null);

    let resolvedTenantId = metaTenantId;
    if (!resolvedTenantId && customerId) {
      const [foundTenant] = await db.select().from(tenants).where(eq(tenants.stripeCustomerId, customerId));
      if (foundTenant) resolvedTenantId = foundTenant.id;
    }

    if (eventType === 'checkout.session.completed' || eventType === 'invoice.paid') {
      const paidDollars =
        typeof obj?.amount_total === 'number'
          ? (obj.amount_total / 100).toFixed(2)
          : typeof obj?.amount_paid === 'number'
            ? (obj.amount_paid / 100).toFixed(2)
            : '0.00';

      if (resolvedTenantId) {
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        // Idempotencia: si ya existe por sessionId o invoiceId, actualizar; si no, insertar
        const existingBySession = sessionId
          ? await db.select().from(payments).where(eq(payments.stripeCheckoutSessionId, sessionId))
          : [];
        const existingByInvoice = !existingBySession.length && invoiceId
          ? await db.select().from(payments).where(eq(payments.stripeInvoiceId, invoiceId))
          : [];
        const existingRecord = existingBySession[0] || existingByInvoice[0];

        if (existingRecord) {
          await db
            .update(payments)
            .set({
              status: 'succeeded',
              amount: paidDollars,
              stripeCustomerId: customerId || existingRecord.stripeCustomerId,
              stripeSubscriptionId: subscriptionId || existingRecord.stripeSubscriptionId,
              stripePaymentIntentId: paymentIntentId || existingRecord.stripePaymentIntentId,
              stripeInvoiceId: invoiceId || existingRecord.stripeInvoiceId,
              receiptUrl: obj?.receipt_url || existingRecord.receiptUrl,
              paidAt: now,
              updatedAt: now,
            } as any)
            .where(eq(payments.id, existingRecord.id));
        } else {
          await db.insert(payments).values({
            tenantId: resolvedTenantId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            stripeCheckoutSessionId: sessionId || null,
            stripePaymentIntentId: paymentIntentId || null,
            stripeInvoiceId: invoiceId || null,
            amount: paidDollars,
            currency: String(obj?.currency || 'usd'),
            status: 'succeeded',
            paymentMethod: 'stripe_card',
            planTier: metaPlanTier || null,
            billingPeriodStart: now,
            billingPeriodEnd: periodEnd,
            receiptUrl: obj?.receipt_url || null,
            metadata: { eventType },
            paidAt: now,
          } as any);
        }

        const tenantUpdate: any = {
          subscriptionStatus: 'active',
          currentPeriodEnd: periodEnd,
        };
        if (customerId) tenantUpdate.stripeCustomerId = customerId;
        if (subscriptionId) tenantUpdate.stripeSubscriptionId = subscriptionId;
        if (metaPlanTier) tenantUpdate.planTier = metaPlanTier;

        await db.update(tenants).set(tenantUpdate).where(eq(tenants.id, resolvedTenantId));
      }
    } else if (eventType === 'invoice.payment_failed') {
      if (resolvedTenantId) {
        await db
          .update(tenants)
          .set({ subscriptionStatus: 'past_due' } as any)
          .where(eq(tenants.id, resolvedTenantId));

        if (invoiceId) {
          await db
            .update(payments)
            .set({
              status: 'failed',
              failureReason: obj?.last_payment_error?.message || 'Pago rechazado por el emisor',
              updatedAt: new Date(),
            } as any)
            .where(eq(payments.stripeInvoiceId, invoiceId));
        }
      }
    } else if (eventType === 'customer.subscription.deleted') {
      if (resolvedTenantId) {
        await db
          .update(tenants)
          .set({ subscriptionStatus: 'canceled' } as any)
          .where(eq(tenants.id, resolvedTenantId));
      }
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('❌ Error en handleStripeWebhook:', error);
    return res.status(500).json({ received: false, error: error.message || 'Webhook error' });
  }
}

// ============================================================================
// 📜 4. HISTORIAL DE PAGOS POR TENANT
// ============================================================================
export async function getTenantPayments(req: Request, res: Response) {
  try {
    const tenantId = String(req.headers['x-tenant-id'] || req.query.tenantId || '').trim();
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Falta tenantId.' });
    }

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.tenantId, tenantId))
      .orderBy(desc(payments.createdAt))
      .limit(50);

    return res.status(200).json({ success: true, payments: rows });
  } catch (error: any) {
    console.error('❌ Error en getTenantPayments:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error consultando pagos.' });
  }
}
