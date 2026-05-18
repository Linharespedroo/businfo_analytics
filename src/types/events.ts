/**
 * Tipos canônicos dos eventos rastreados no app BusInfo.
 * Fonte: GA4 → BigQuery (events_*).
 */

export const TRACKED_EVENTS = [
  'session_start',
  'buscar_linha',
  'ver_detalhe_linha',
  'ver_trilhos',
  'adicionar_favorito',
  'remover_favorito',
  'filtrar_veiculo',
  'usar_localizacao',
  'tocar_parada',
  'qr_scan',
  'stop_view',
  'timer_expired',
  'app_store_click',
] as const;

export type EventName = (typeof TRACKED_EVENTS)[number];

export const EVENT_LABELS: Record<EventName, string> = {
  session_start: 'Sessões',
  buscar_linha: 'Buscas de linha',
  ver_detalhe_linha: 'Detalhes de linha',
  ver_trilhos: 'Visualização de traçado',
  adicionar_favorito: 'Favoritações',
  remover_favorito: 'Remoção de favoritos',
  filtrar_veiculo: 'Filtros de veículo',
  usar_localizacao: 'Localizações usadas',
  tocar_parada: 'Cliques em paradas',
  qr_scan: 'QR scans',
  stop_view: 'Acessos à parada',
  timer_expired: 'Limite de visitas',
  app_store_click: 'Cliques na loja',
};

export type Cidade = string;
export type LinhaCodigo = string;
