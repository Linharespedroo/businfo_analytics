#!/usr/bin/env tsx
/**
 * Gera um bundle.json sintético com formato idêntico ao live, para que o
 * GitHub Pages renderize um demo funcional sem credenciais reais.
 * Determinístico por seed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildBundle } from './transforms/build-bundle';
import { pipelineConfig } from './config';

const SEED = 4711;
let rng = mulberry32(SEED);

const CIDADES = [
  'SP', 'SP_ABC', 'EMTU_ABC', 'EMTU_INT', 'BARUERI', 'JANDIRA',
  'RIO_BRT', 'RIO_MUNI', 'CAMPINAS', 'SJC', 'TAUBATE',
];
const ORGAOS_BY_CIDADE: Record<string, string> = {
  SP: 'SPTrans', SP_ABC: 'EMTU', EMTU_ABC: 'EMTU', EMTU_INT: 'EMTU',
  BARUERI: 'Cittati', JANDIRA: 'Cittati',
  RIO_BRT: 'BRT Rio', RIO_MUNI: 'Prefeitura RJ',
  CAMPINAS: 'EMTU', SJC: 'EMTU', TAUBATE: 'EMTU',
};

// linhas representativas
const LINHAS_BASE = [
  '8000', '8019', '8022', '8400', '8500', '177H', '477P', '5111',
  '2719', '975A', '107T', '107P', '7545', '5300', '6056', '107A',
  '477A', '107M', '167Y', '917H', '5106', '7245', '927', '2024',
  '107M-10', '8506', '8025', '278R', '407A', '5114',
];

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = () => rng();
const ri = (min: number, max: number) => Math.floor(r() * (max - min + 1)) + min;
const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function gen() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const DAYS = 90;

  // Diários — base com sazonalidade semanal + tendência leve + ruído
  const daily = Array.from({ length: DAYS }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (DAYS - 1 - i));
    const day = date.getDay();
    const weekendFactor = day === 0 || day === 6 ? 0.55 : 1;
    const trend = 1 + i * 0.0035;
    const noise = 0.85 + r() * 0.3;
    const base = 1200 * weekendFactor * trend * noise;
    const sessions = Math.round(base * 1.6);
    const events = Math.round(base * 5.5);
    return {
      data: ymd(date),
      users: Math.round(base),
      new_users: Math.round(base * 0.18),
      sessions,
      events,
      buscas: Math.round(base * 1.9),
      favoritos: Math.round(base * 0.22),
      detalhes: Math.round(base * 1.1),
      localizacoes: Math.round(base * 0.7),
      paradas: Math.round(base * 0.5),
      qr_scans: Math.round(base * 0.08),
    };
  });

  // Hourly: bimodal (pico 7-9h e 17-19h), reduzido em fim-de-semana
  const hourly: Array<{ weekday: number; hour: number; value: number }> = [];
  for (let w = 0; w < 7; w++) {
    for (let h = 0; h < 24; h++) {
      const morning = Math.exp(-0.5 * ((h - 8) / 2) ** 2) * 1.2;
      const evening = Math.exp(-0.5 * ((h - 18) / 2.2) ** 2) * 1.4;
      const weekendMult = w >= 5 ? 0.5 : 1;
      const value = Math.round((morning + evening) * 1500 * weekendMult * (0.85 + r() * 0.3));
      hourly.push({ weekday: w, hour: h, value });
    }
  }

  // Linhas — cada (linha,cidade)
  const linhas = LINHAS_BASE.flatMap((codigo) => {
    const cities = [pick(CIDADES), pick(CIDADES)];
    return Array.from(new Set(cities)).map((cidade) => {
      const buscas = ri(50, 4500);
      return {
        linha: codigo,
        cidade,
        buscas,
        detalhes: Math.round(buscas * (0.4 + r() * 0.3)),
        favoritados: Math.round(buscas * (0.05 + r() * 0.15)),
        removidos: Math.round(buscas * (0.01 + r() * 0.05)),
        usuarios_unicos: Math.round(buscas * (0.3 + r() * 0.3)),
      };
    });
  });

  const linhaGrowth = linhas.map((l) => {
    const recent = Math.round(l.buscas * (0.3 + r() * 0.4));
    const previous = Math.round(l.buscas * (0.2 + r() * 0.5));
    return { linha: l.linha, cidade: l.cidade, recent, previous };
  });

  const favoritos = linhas.slice(0, 60).map((l) => ({
    linha: l.linha,
    cidade: l.cidade,
    adicionados: l.favoritados,
    removidos: l.removidos,
  }));

  const cidades = CIDADES.map((cidade) => {
    const usuarios = ri(800, 15000);
    const recent_7d = ri(200, 3000);
    const previous_7d = Math.round(recent_7d * (0.8 + r() * 0.5));
    const recent_30d = ri(900, 12000);
    const previous_30d = Math.round(recent_30d * (0.8 + r() * 0.5));
    return {
      cidade,
      usuarios,
      buscas: Math.round(usuarios * 2.5),
      detalhes: Math.round(usuarios * 1.3),
      favoritos: Math.round(usuarios * 0.3),
      recent_7d,
      previous_7d,
      recent_30d,
      previous_30d,
    };
  });

  // GeoPoints concentrados em São Paulo, ABC, Rio
  const clusters = [
    { lat: -23.55, lon: -46.63, n: 1800 }, // São Paulo
    { lat: -23.66, lon: -46.53, n: 600 },  // ABC
    { lat: -22.91, lon: -43.18, n: 700 },  // Rio
    { lat: -23.51, lon: -46.87, n: 350 },  // Barueri
    { lat: -23.18, lon: -45.88, n: 280 },  // SJC
    { lat: -22.90, lon: -47.06, n: 320 },  // Campinas
  ];
  const geoPoints = clusters.flatMap((c) =>
    Array.from({ length: c.n }, () => ({
      lat: c.lat + (r() - 0.5) * 0.18,
      lon: c.lon + (r() - 0.5) * 0.22,
      precisao: pick(['alta', 'média', 'baixa', 'desconhecida']),
      weight: 1 + Math.floor(r() * 5),
    }))
  );

  // Paradas
  const PARADA_NAMES = [
    'Term. Pirituba', 'Term. Santo Amaro', 'Term. Cap. Leite', 'Pq. Dom Pedro',
    'Term. Itaquera', 'Av. Paulista 1500', 'Term. Lapa', 'Term. Mercado',
    'Av. Cásper Líbero', 'Rua 25 de Março', 'Praça da Sé', 'Tucuruvi',
    'Vila Mariana', 'Aclimação', 'Term. Vila Nova', 'Term. ABC',
  ];
  const FONTES = ['sptrans', 'emtu', 'rio_brt', 'cittati'];
  const paradas = PARADA_NAMES.map((nome, i) => {
    const acessos = ri(80, 4000);
    const erros = Math.round(acessos * r() * 0.18);
    return {
      parada_id: `P-${1000 + i}`,
      parada_nome: nome,
      fonte: pick(FONTES),
      acessos,
      erros,
      ultimo_erro: erros > 0 ? pick(['timeout', 'permission_denied', 'not_found', 'rate_limit']) : null,
    };
  });

  const funnel = [{ s1: 38000, s2: 24500, s3: 8400, s4: 3100 }];

  // Cohorts — 12 semanas, retenção decai exponencialmente
  const cohortsRaw: Array<{ cohort_week: string; week_offset: number; users: number }> = [];
  for (let c = 0; c < 12; c++) {
    const cohortDate = new Date(today);
    cohortDate.setDate(cohortDate.getDate() - (12 - c) * 7);
    const monday = new Date(cohortDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const cohort_week = ymd(monday);
    const size = ri(450, 1400);
    for (let off = 0; off <= Math.min(8, 12 - c); off++) {
      const ret = off === 0 ? 1 : Math.exp(-off * 0.45) * (0.8 + r() * 0.2);
      cohortsRaw.push({ cohort_week, week_offset: off, users: Math.round(size * ret) });
    }
  }

  // Metadata simulado do Neon
  const linhasMeta = linhas.map((l) => ({
    linha: l.linha,
    cidade: l.cidade,
    orgao: ORGAOS_BY_CIDADE[l.cidade] ?? 'Outros',
    operador: pick(['Viação Cidade Dutra', 'Sambaíba', 'Empresa Auto Viação', 'Express', 'Metrópolis']),
    area: l.cidade === 'SP' ? String(ri(1, 8)) : null,
  }));
  const cidadesMeta = CIDADES.map((cidade) => ({
    cidade,
    orgao: ORGAOS_BY_CIDADE[cidade] ?? 'Outros',
    linhas_count: ri(20, 400),
    frota_count: ri(50, 2000),
  }));

  const bundle = buildBundle(
    {
      daily,
      hourly,
      linhas,
      linhaGrowth,
      favoritos,
      cidades,
      geoPoints,
      paradas,
      funnel,
      cohortsRaw,
      source: 'sample',
    },
    { linhasMeta, cidadesMeta }
  );

  fs.mkdirSync(pipelineConfig.output.dir, { recursive: true });
  const bundlePath = path.join(pipelineConfig.output.dir, pipelineConfig.output.bundleFile);
  fs.writeFileSync(bundlePath, JSON.stringify(bundle));
  fs.writeFileSync(
    path.join(pipelineConfig.output.dir, pipelineConfig.output.manifestFile),
    JSON.stringify(
      {
        generatedAt: bundle.meta.generatedAt,
        pipelineVersion: bundle.meta.pipelineVersion,
        rangeStart: bundle.meta.rangeStart,
        rangeEnd: bundle.meta.rangeEnd,
        source: 'sample',
        sizeBytes: fs.statSync(bundlePath).size,
      },
      null,
      2
    )
  );
  console.log(
    `✓ sample bundle gerado em ${bundlePath} (${(fs.statSync(bundlePath).size / 1024).toFixed(1)} KB)`
  );
}

gen();
