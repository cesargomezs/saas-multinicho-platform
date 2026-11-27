import { Request, Response } from 'express';
// Importamos la interfaz SQL explícita para tipar correctamente los filtros
import { sql, eq, and, ilike, or, SQL } from 'drizzle-orm';

// Importamos la BD y el esquema desde el paquete del monorepo
import { db, tenants, services } from '@taller/database';

// ⚡ Caché ligera en memoria con TTL corto (10s) para acelerar consultas repetidas del directorio
const DIRECTORY_CACHE_TTL_MS = 10_000;
const directoryCache = new Map<string, { expiresAt: number; payload: any }>();

// 🗺️ Diccionario Geográfico rápido (evita llamadas externas bloqueantes en ZIPs/ciudades frecuentes)
const MOCK_GEOCODER: Record<string, { lat: number; lng: number }> = {
  '91730': { lat: 34.1064, lng: -117.5931 }, // Rancho Cucamonga
  'rancho cucamonga': { lat: 34.1064, lng: -117.5931 },
  '90036': { lat: 34.0620, lng: -118.3490 }, // Los Angeles
  'los angeles': { lat: 34.0620, lng: -118.3490 },
  '91101': { lat: 34.1458, lng: -118.1319 }, // Pasadena
  'pasadena': { lat: 34.1458, lng: -118.1319 },
};

const parseLoyaltyObject = (rawLoyalty: any): Record<string, any> | null => {
  if (!rawLoyalty) return null;
  if (typeof rawLoyalty === 'string') {
    try {
      const parsed = JSON.parse(rawLoyalty);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof rawLoyalty === 'object' ? rawLoyalty : null;
};

export const searchDirectory = async (req: Request, res: Response) => {
  try {
    const { locationQuery, niche, radius, nameQuery } = req.query;
    const cacheKey = JSON.stringify({
      locationQuery: String(locationQuery || '').trim().toLowerCase(),
      niche: String(niche || 'all').trim().toLowerCase(),
      radius: String(radius || '30').trim(),
      nameQuery: String(nameQuery || '').trim().toLowerCase(),
    });

    const cached = directoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.status(200).json(cached.payload);
    }

    // 1. Inicializamos el arreglo tipado estrictamente como consultas SQL
    const filters: SQL[] = [];

    // 2. Filtro por Categoría/Nicho (Taller, Spa, Barbería, Legal, Dental)
    if (niche && niche !== 'all') {
      filters.push(eq(tenants.niche, niche as string));
    }

    // 3. Filtro Específico por Nombre de Negocio
    if (nameQuery) {
      filters.push(ilike(tenants.name, `%${nameQuery}%`));
    }

    let userLat: number | null = null;
    let userLng: number | null = null;

    // 4. Geocodificación y Fallback
    if (locationQuery) {
      const queryLower = (locationQuery as string).toLowerCase().trim();
      const coordinates = MOCK_GEOCODER[queryLower];

      if (coordinates) {
        userLat = coordinates.lat;
        userLng = coordinates.lng;
      } else {
        const fallbackCondition = or(
          ilike(tenants.city, `%${queryLower}%`),
          ilike(tenants.zipCode, `%${queryLower}%`)
        );

        if (fallbackCondition) {
          filters.push(fallbackCondition);
        }
      }
    }

    let results: any[];
    const maxDistance = radius ? parseFloat(radius as string) : 30;
    const loyaltyCol = (tenants as any).loyaltyConfig ?? (tenants as any).loyalty_config;

    // ========================================================================
    // 🧠 MOTOR DE BÚSQUEDA GEOGRÁFICA (FÓRMULA HAVERSINE EN POSTGRESQL)
    // ========================================================================
    if (userLat !== null && userLng !== null) {
      const distanceSql = sql<number>`(
        3959 * acos(
          cos(radians(${userLat})) * 
          cos(radians(${tenants.latitude})) * 
          cos(radians(${tenants.longitude}) - radians(${userLng})) + 
          sin(radians(${userLat})) * 
          sin(radians(${tenants.latitude}))
        )
      )`;

      filters.push(sql`${distanceSql} <= ${maxDistance}`);

      results = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          niche: tenants.niche,
          city: tenants.city,
          state: tenants.state,
          zipCode: tenants.zipCode,
          logoUrl: tenants.logoUrl,
          primaryColor: tenants.primaryColor,
          latitude: tenants.latitude,
          longitude: tenants.longitude,
          ...(loyaltyCol ? { loyaltyConfig: loyaltyCol } : {}),
          distance: distanceSql.mapWith(Number),
        })
        .from(tenants)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(distanceSql);
    } else {
      // ========================================================================
      // BÚSQUEDA ESTÁNDAR (Sin coordenadas)
      // ========================================================================
      results = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          niche: tenants.niche,
          city: tenants.city,
          state: tenants.state,
          zipCode: tenants.zipCode,
          logoUrl: tenants.logoUrl,
          primaryColor: tenants.primaryColor,
          latitude: tenants.latitude,
          longitude: tenants.longitude,
          ...(loyaltyCol ? { loyaltyConfig: loyaltyCol } : {}),
        })
        .from(tenants)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(tenants.name);
    }

    // 5. Formatear los resultados para la UI del Directorio con rating real y conteo de reseñas
    const formattedResults = results.map((biz: any) => {
      const parsedLoyalty = parseLoyaltyObject(biz.loyaltyConfig ?? biz.loyalty_config);
      const reviews = Array.isArray(parsedLoyalty?.reviews) ? parsedLoyalty.reviews : [];
      const reviewsCount = reviews.length;
      const rating =
        reviewsCount > 0
          ? Number(
              (
                reviews.reduce((acc: number, r: any) => acc + Number(r?.rating ?? 5), 0) /
                reviewsCount
              ).toFixed(1)
            )
          : null;

      return {
        ...biz,
        loyaltyConfig: parsedLoyalty,
        rating,
        reviewsCount,
        label:
          biz.niche === 'automotive'
            ? 'Taller Automotriz'
            : biz.niche === 'spa'
            ? 'Spa & Relajación'
            : biz.niche === 'legal'
            ? 'Firma Legal / Abogados'
            : biz.niche === 'dental'
            ? 'Clínica Odontológica'
            : 'Barbería Clásica',
        icon:
          biz.niche === 'automotive'
            ? '🚗'
            : biz.niche === 'spa'
            ? '💆‍♀️'
            : biz.niche === 'legal'
            ? '⚖️'
            : biz.niche === 'dental'
            ? '🦷'
            : '✂️',
        distance:
          'distance' in biz && biz.distance !== null ? Number(biz.distance).toFixed(1) : null,
      };
    });

    const responsePayload = {
      success: true,
      count: formattedResults.length,
      data: formattedResults,
    };

    directoryCache.set(cacheKey, {
      expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS,
      payload: responsePayload,
    });

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('Error en búsqueda de directorio:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

export const getTenantById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 1. Buscar la información base del Tenant (Marca Blanca, Info legal, etc)
    const tenantResult = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id as string))
      .limit(1);

    if (tenantResult.length === 0) {
      return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
    }

    const tenantData: any = tenantResult[0];
    const parsedLoyalty = parseLoyaltyObject(tenantData.loyaltyConfig ?? tenantData.loyalty_config);
    const reviews = Array.isArray(parsedLoyalty?.reviews) ? parsedLoyalty.reviews : [];
    const reviewsCount = reviews.length;
    const rating =
      reviewsCount > 0
        ? Number(
            (
              reviews.reduce((acc: number, r: any) => acc + Number(r?.rating ?? 5), 0) /
              reviewsCount
            ).toFixed(1)
          )
        : null;

    // 2. Buscar el catálogo de servicios de este negocio
    const catalog = await db
      .select({
        id: services.id,
        name: services.name,
        price: services.price,
        durationMinutes: services.durationMinutes,
      })
      .from(services)
      .where(eq(services.tenantId, id as string))
      .orderBy(services.name);

    return res.status(200).json({
      success: true,
      data: {
        ...tenantData,
        loyaltyConfig: parsedLoyalty ?? tenantData.loyaltyConfig,
        rating,
        reviewsCount,
        services: catalog,
      },
    });
  } catch (error) {
    console.error('Error al obtener perfil del negocio:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};
