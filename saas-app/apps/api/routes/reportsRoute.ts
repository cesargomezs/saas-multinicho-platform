import { Router, Request, Response } from 'express';

const router = Router();

const VALID_REASONS = ['copyright_spam', 'offensive', 'false_info', 'not_exists'] as const;
const VALID_TARGETS = ['review', 'portfolio', 'service', 'campaign', 'business'] as const;

const REASON_EMOJI: Record<string, string> = {
  copyright_spam: '©️',
  offensive: '🚫',
  false_info: '⚠️',
  not_exists: '❓',
};

const TARGET_LABEL: Record<string, string> = {
  review: 'Reseña',
  portfolio: 'Foto del portafolio',
  service: 'Servicio del catálogo',
  campaign: 'Campaña promocional',
  business: 'Negocio completo',
};

// Telegram con parse_mode=HTML exige escapar estos 3 caracteres
const esc = (v: unknown, max = 300) =>
  String(v ?? '')
    .slice(0, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Límite simple por IP: 5 reportes cada 10 minutos (evita que te llenen el Telegram de spam)
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;
const isRateLimited = (ip: string) => {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
};

router.post('/', async (req: Request, res: Response) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ success: false, message: 'Demasiados reportes. Intenta más tarde.' });
    }

    const b = req.body || {};
    if (!VALID_REASONS.includes(b.reason) || !VALID_TARGETS.includes(b.targetType)) {
      return res.status(400).json({ success: false, message: 'Reporte inválido.' });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const appUrl = (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
    if (!token || !chatId) {
      console.error('[reports] Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
      return res.status(500).json({ success: false, message: 'Reportes no configurados.' });
    }

    const businessLink = appUrl && b.tenantId ? `${appUrl}/${encodeURIComponent(String(b.tenantId))}` : (b.pageUrl || '');

    const lines = [
      `🚩 <b>NUEVO REPORTE</b> ${REASON_EMOJI[b.reason] || ''}`,
      ``,
      `<b>Motivo:</b> ${esc(b.reasonLabel || b.reason, 80)}`,
      `<b>Tipo:</b> ${esc(TARGET_LABEL[b.targetType], 40)}`,
      `<b>Contenido:</b> ${esc(b.targetTitle, 120)}`,
      b.targetExcerpt ? `<b>Extracto:</b> ${esc(b.targetExcerpt, 220)}` : '',
      `<b>Negocio:</b> ${esc(b.tenantName, 80)}`,
      `<b>ID negocio:</b> <code>${esc(b.tenantId, 60)}</code>`,
      `<b>ID contenido:</b> <code>${esc(b.targetId, 160)}</code>`,
      b.details ? `\n<b>Detalles:</b> ${esc(b.details, 500)}` : '',
      b.reporterContact ? `<b>Contacto de quien reporta:</b> ${esc(b.reporterContact, 120)}` : '',
      businessLink ? `\n🔗 ${esc(businessLink, 300)}` : '',
      `\n🕒 ${esc(b.createdAt || new Date().toISOString(), 40)}`,
    ].filter(Boolean);

    // TODO (recomendado): guardar también el reporte en tu base de datos (tabla content_reports)
    // para tener historial y poder demostrar que lo atendiste. Ej.: INSERT INTO content_reports (...)

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!tgRes.ok) {
      console.error('[reports] Telegram respondió', tgRes.status, await tgRes.text());
      return res.status(502).json({ success: false, message: 'No se pudo notificar al equipo.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[reports] error', err);
    return res.status(500).json({ success: false, message: 'Error interno.' });
  }
});

export default router;
