// Consultas GraphQL que usa la web de Instagram (verificadas el 22-11-2026).
// Instagram reasigna los doc_id con el tiempo: si una consulta deja de devolver lo esperado,
// el lector muestra un error claro y basta con actualizar el doc_id aquí (o en Ajustes, Fase 9).

export interface QueryDef {
  friendlyName: string;
  docId: string;
}

export const QUERIES = {
  profile: { friendlyName: 'PolarisProfilePageContentQuery', docId: '37095153540132433' },
  timeline: { friendlyName: 'PolarisProfilePostsTabContentQuery_connection', docId: '39535953862670189' },
  reels: { friendlyName: 'PolarisProfileReelsTabContentQuery_connection', docId: '28143376935350124' },
} satisfies Record<string, QueryDef>;

export type QueryName = keyof typeof QUERIES;

/** Instagram devuelve 12 por página aunque se pidan más. */
export const PAGE_SIZE = 12;

export function profileVariables(userId: string) {
  return {
    enable_integrity_filters: true,
    id: userId,
    __relay_internal__pv__PolarisCannesGuardianExperienceEnabledrelayprovider: true,
    __relay_internal__pv__PolarisCASB976ProfileEnabledrelayprovider: false,
    __relay_internal__pv__PolarisWebSchoolsEnabledrelayprovider: false,
    __relay_internal__pv__PolarisRepostsConsumptionEnabledrelayprovider: true,
    __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false,
  };
}

export function timelineVariables(username: string, cursor: string | null) {
  return {
    data: {
      count: PAGE_SIZE,
      include_reel_media_seen_timestamp: true,
      include_relationship_info: true,
      latest_besties_reel_media: true,
      latest_reel_media: true,
    },
    first: PAGE_SIZE,
    username,
    include_multi_captions: true,
    __relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider: true,
    __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false,
    __relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider: false,
    ...(cursor ? { after: cursor } : {}),
  };
}

export function reelsVariables(userId: string, cursor: string | null) {
  return {
    data: { include_feed_video: true, page_size: PAGE_SIZE, target_user_id: userId },
    first: PAGE_SIZE,
    id: userId,
    __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false,
    ...(cursor ? { after: cursor } : {}),
  };
}
