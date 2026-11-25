// apps/api/src/services/translationService.ts
// Servicio de traducción bilingüe (ES <-> EN) 100% gratuito usando MyMemory API con fallback seguro.

export type SupportedLang = 'es' | 'en';

export interface BilingualServiceContent {
  name: string;
  description: string;
}

export interface ServiceTranslations {
  es?: BilingualServiceContent;
  en?: BilingualServiceContent;
}

export interface BilingualTitledContent {
  title: string;
  description?: string;
  message?: string;
}

export interface TitledTranslations {
  es?: BilingualTitledContent;
  en?: BilingualTitledContent;
}

const MYMEMORY_CONTACT_EMAIL =
  process.env.TRANSLATION_CONTACT_EMAIL || 'cesargomez853@gmail.com';

const normalizeLang = (lang?: string | null): SupportedLang => {
  return String(lang || '').toLowerCase().startsWith('en') ? 'en' : 'es';
};

/**
 * Traduce un texto usando MyMemory (hasta ~50,000 caracteres/día gratis con parámetro `de`).
 * Si la API externa falla, supera el timeout o devuelve advertencia de cuota, retorna el texto original
 * para nunca bloquear el guardado en base de datos.
 */
export async function translateTextFree(
  text: string | null | undefined,
  from: SupportedLang,
  to: SupportedLang
): Promise<string> {
  const clean = String(text || '').trim();
  if (!clean || from === to) return clean;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const url =
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}` +
      `&langpair=${from}|${to}&de=${encodeURIComponent(MYMEMORY_CONTACT_EMAIL)}`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return clean;

    const data: any = await res.json();
    const translated = String(data?.responseData?.translatedText || '').trim();

    if (
      !translated ||
      translated.toUpperCase().includes('MYMEMORY WARNING') ||
      translated.toUpperCase().includes('INVALID LANGUAGE PAIR')
    ) {
      return clean;
    }

    return translated;
  } catch (_err) {
    return clean;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Construye el objeto JSONB `translations` ({ es: { name, description }, en: { name, description } })
 * para un servicio del catálogo.
 * - Respeta traducciones manuales si vienen en `manualTranslations`.
 * - Solo traduce los campos faltantes en el idioma destino.
 */
export async function buildBilingualServiceTranslations(params: {
  name: string;
  description?: string | null;
  sourceLang?: string | null;
  manualTranslations?: ServiceTranslations | null;
}): Promise<ServiceTranslations> {
  const sourceLang = normalizeLang(params.sourceLang);
  const targetLang: SupportedLang = sourceLang === 'es' ? 'en' : 'es';

  const cleanName = String(params.name || '').trim();
  const cleanDesc = String(params.description || '').trim();
  const manual = params.manualTranslations || {};

  const sourceBlock: BilingualServiceContent = {
    name: String(manual[sourceLang]?.name || cleanName).trim(),
    description: String(
      manual[sourceLang]?.description !== undefined
        ? manual[sourceLang]?.description
        : cleanDesc
    ).trim(),
  };

  const hasManualTargetName = Boolean(manual[targetLang]?.name?.trim());
  const hasManualTargetDesc =
    manual[targetLang]?.description !== undefined &&
    (cleanDesc === '' || Boolean(manual[targetLang]?.description?.trim()));

  const [translatedName, translatedDesc] = await Promise.all([
    hasManualTargetName
      ? Promise.resolve(String(manual[targetLang]!.name).trim())
      : translateTextFree(sourceBlock.name, sourceLang, targetLang),
    hasManualTargetDesc
      ? Promise.resolve(String(manual[targetLang]!.description || '').trim())
      : sourceBlock.description
        ? translateTextFree(sourceBlock.description, sourceLang, targetLang)
        : Promise.resolve(''),
  ]);

  return {
    [sourceLang]: sourceBlock,
    [targetLang]: {
      name: translatedName || sourceBlock.name,
      description: translatedDesc,
    },
  };
}

/**
 * Helper reutilizable para traducir ítems de Portafolio ({ title, description })
 * o Campañas Push ({ title, message }) al guardarlos en `tenants.portfolio` o `loyalty_config.campaigns`.
 */
export async function buildBilingualTitledTranslations(params: {
  title: string;
  description?: string | null;
  message?: string | null;
  sourceLang?: string | null;
  manualTranslations?: TitledTranslations | null;
}): Promise<TitledTranslations> {
  const sourceLang = normalizeLang(params.sourceLang);
  const targetLang: SupportedLang = sourceLang === 'es' ? 'en' : 'es';
  const manual = params.manualTranslations || {};

  const cleanTitle = String(params.title || '').trim();
  const cleanDesc = params.description !== undefined ? String(params.description || '').trim() : undefined;
  const cleanMsg = params.message !== undefined ? String(params.message || '').trim() : undefined;

  const sourceBlock: BilingualTitledContent = {
    title: String(manual[sourceLang]?.title || cleanTitle).trim(),
    ...(cleanDesc !== undefined ? { description: String(manual[sourceLang]?.description ?? cleanDesc).trim() } : {}),
    ...(cleanMsg !== undefined ? { message: String(manual[sourceLang]?.message ?? cleanMsg).trim() } : {}),
  };

  const [tTitle, tDesc, tMsg] = await Promise.all([
    manual[targetLang]?.title?.trim()
      ? Promise.resolve(String(manual[targetLang]!.title).trim())
      : translateTextFree(sourceBlock.title, sourceLang, targetLang),
    cleanDesc !== undefined
      ? manual[targetLang]?.description !== undefined
        ? Promise.resolve(String(manual[targetLang]!.description || '').trim())
        : translateTextFree(sourceBlock.description, sourceLang, targetLang)
      : Promise.resolve(undefined),
    cleanMsg !== undefined
      ? manual[targetLang]?.message !== undefined
        ? Promise.resolve(String(manual[targetLang]!.message || '').trim())
        : translateTextFree(sourceBlock.message, sourceLang, targetLang)
      : Promise.resolve(undefined),
  ]);

  return {
    [sourceLang]: sourceBlock,
    [targetLang]: {
      title: tTitle || sourceBlock.title,
      ...(tDesc !== undefined ? { description: tDesc } : {}),
      ...(tMsg !== undefined ? { message: tMsg } : {}),
    },
  };
}
