#!/usr/bin/env node
// Stáhne ceny letenek pro všechny kombinace trasa × datum odletu × datum návratu
// a uloží je jako statický JSON, který čte microsite.
//
// Použití:
//   node scripts/fetch-prices.mjs              # ostrý běh (potřebuje TRAVELPAYOUTS_TOKEN)
//   node scripts/fetch-prices.mjs --mock       # demo data, bez API a bez tokenu
//   node scripts/fetch-prices.mjs --sample     # jen první 2 trasy, na rychlé ověření tokenu
//   node scripts/fetch-prices.mjs --dry-run    # nic nezapisuje na disk
//
// Běh je idempotentní: snapshot za dnešní den se přepíše, historie zůstává.
// Chyba jedné kombinace běh nezastaví – zaloguje se a pokračuje se dál.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider } from './lib/travelpayouts.mjs';
import { createMockProvider } from './lib/mock.mjs';
import { airlineName } from './lib/airlines.mjs';
import { annotateDeals, buildBaselines, buildTrend, loadHistory, routeKey } from './lib/history.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'history');

const args = new Set(process.argv.slice(2));
const MOCK = args.has('--mock');
const SAMPLE = args.has('--sample');
const DRY_RUN = args.has('--dry-run');
const VERBOSE = args.has('--verbose');

const today = new Date().toISOString().slice(0, 10);

function log(...a) {
  console.log(...a);
}
function debug(...a) {
  if (VERBOSE) console.log('   ', ...a);
}

/** Spustí úlohy s omezenou souběžností; jedna spadlá úloha nezastaví ostatní. */
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { ok: true, value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error, item: items[index] };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function normalizeOffer(raw, task, config, provider) {
  const pricePerPerson = Number(raw.price);
  if (!Number.isFinite(pricePerPerson) || pricePerPerson <= 0) return null;
  const passengers = config.passengers;
  return {
    id: `${task.origin.code}-${task.destination.code}-${task.departureDate}-${task.returnDate}`,
    origin: task.origin.code,
    destination: task.destination.code,
    departureDate: task.departureDate,
    returnDate: task.returnDate,
    departureAt: raw.departure_at ?? null,
    returnAt: raw.return_at ?? null,
    // Travelpayouts vrací cenu za jednoho cestujícího za celou zpáteční cestu.
    pricePerPerson: Math.round(pricePerPerson),
    priceTotal: Math.round(pricePerPerson * passengers),
    airline: raw.airline ?? null,
    airlineName: airlineName(raw.airline),
    flightNumber: raw.flight_number ?? null,
    transfers: Number.isFinite(raw.transfers) ? raw.transfers : null,
    returnTransfers: Number.isFinite(raw.return_transfers) ? raw.return_transfers : null,
    durationTo: Number.isFinite(raw.duration_to) ? raw.duration_to : null,
    durationBack: Number.isFinite(raw.duration_back) ? raw.duration_back : null,
    link: provider.bookingLink({
      origin: task.origin.code,
      destination: task.destination.code,
      departureDate: task.departureDate,
      returnDate: task.returnDate,
      passengers,
    }),
  };
}

async function main() {
  const config = JSON.parse(await readFile(path.join(ROOT, 'config', 'search.json'), 'utf8'));

  let origins = config.origins;
  let destinations = config.destinations;
  if (SAMPLE) {
    origins = origins.slice(0, 1);
    destinations = destinations.slice(0, 2);
    log('⚑ SAMPLE režim: jen', origins.map((o) => o.code).join(','), '→', destinations.map((d) => d.code).join(','));
  }

  const provider = MOCK
    ? createMockProvider({ marker: process.env.TRAVELPAYOUTS_MARKER ?? '' })
    : createProvider({
        token: process.env.TRAVELPAYOUTS_TOKEN,
        marker: process.env.TRAVELPAYOUTS_MARKER ?? '',
        currency: config.currency,
        market: config.market,
        timeoutMs: config.fetch.timeoutMs,
        retries: config.fetch.retries,
      });

  const tasks = [];
  for (const origin of origins) {
    for (const destination of destinations) {
      for (const departureDate of config.departureDates) {
        for (const returnDate of config.returnDates) {
          tasks.push({ origin, destination, departureDate, returnDate });
        }
      }
    }
  }

  log(`▶ ${today} – ${tasks.length} kombinací (${origins.length} odletových × ${destinations.length} cílových × ${config.departureDates.length} × ${config.returnDates.length})`);
  log(`  režim: ${MOCK ? 'DEMO (mock data)' : 'ostrý (Travelpayouts)'} | měna: ${config.currency.toUpperCase()} | cestující: ${config.passengers}`);

  const started = Date.now();
  const errors = [];
  const offersByCombo = new Map();
  let emptyCount = 0;

  const results = await runPool(tasks, config.fetch.concurrency, async (task) => {
    const raw = await provider.searchDatePair({
      origin: task.origin.code,
      destination: task.destination.code,
      departureDate: task.departureDate,
      returnDate: task.returnDate,
    });
    return { task, raw };
  });

  for (const result of results) {
    if (!result.ok) {
      const { origin, destination, departureDate, returnDate } = result.item;
      errors.push({
        route: `${origin.code}-${destination.code}`,
        departureDate,
        returnDate,
        message: String(result.error?.message ?? result.error).slice(0, 300),
      });
      debug(`✗ ${origin.code}→${destination.code} ${departureDate}/${returnDate}: ${result.error?.message}`);
      continue;
    }
    const { task, raw } = result.value;
    if (!raw.length) {
      emptyCount += 1;
      continue;
    }
    // API řadíme podle ceny, ale pro jistotu vybíráme minimum sami.
    const cheapest = raw.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
    const offer = normalizeOffer(cheapest, task, config, provider);
    if (offer) offersByCombo.set(offer.id, offer);
  }

  // Záložní měsíční dotaz pro trasy, kde přesné termíny nevrátily vůbec nic.
  if (config.fetch.monthFallback && !MOCK) {
    const depMonth = config.departureDates[0].slice(0, 7);
    const retMonth = config.returnDates[0].slice(0, 7);
    const depSet = new Set(config.departureDates);
    const retSet = new Set(config.returnDates);
    const emptyRoutes = [];
    for (const origin of origins) {
      for (const destination of destinations) {
        const key = `${origin.code}-${destination.code}`;
        const hasAny = [...offersByCombo.values()].some((o) => routeKey(o) === key);
        if (!hasAny) emptyRoutes.push({ origin, destination });
      }
    }
    if (emptyRoutes.length) {
      log(`  ↻ měsíční fallback pro ${emptyRoutes.length} tras bez dat`);
      const fallback = await runPool(emptyRoutes, config.fetch.concurrency, async ({ origin, destination }) => {
        const raw = await provider.searchMonth({
          origin: origin.code,
          destination: destination.code,
          departureMonth: depMonth,
          returnMonth: retMonth,
        });
        return { origin, destination, raw };
      });
      for (const result of fallback) {
        if (!result.ok) {
          errors.push({
            route: `${result.item.origin.code}-${result.item.destination.code}`,
            departureDate: depMonth,
            returnDate: retMonth,
            message: `měsíční fallback: ${String(result.error?.message ?? result.error).slice(0, 200)}`,
          });
          continue;
        }
        const { origin, destination, raw } = result.value;
        for (const item of raw) {
          const dep = String(item.departure_at ?? '').slice(0, 10);
          const ret = String(item.return_at ?? '').slice(0, 10);
          if (!depSet.has(dep) || !retSet.has(ret)) continue;
          const task = { origin, destination, departureDate: dep, returnDate: ret };
          const offer = normalizeOffer(item, task, config, provider);
          if (!offer) continue;
          const existing = offersByCombo.get(offer.id);
          if (!existing || offer.priceTotal < existing.priceTotal) offersByCombo.set(offer.id, offer);
        }
      }
    }
  }

  const offers = [...offersByCombo.values()].sort((a, b) => a.priceTotal - b.priceTotal);
  const elapsed = Math.round((Date.now() - started) / 100) / 10;

  log(`✔ hotovo za ${elapsed}s: ${offers.length} nabídek, ${emptyCount} kombinací bez dat, ${errors.length} chyb, ${provider.requestCount} requestů`);
  if (errors.length) {
    const preview = errors.slice(0, 5).map((e) => `${e.route} ${e.departureDate}: ${e.message}`);
    log('  chyby (prvních 5):\n   - ' + preview.join('\n   - '));
  }

  // Historie a vyhodnocení „cenových bomb“.
  const history = await loadHistory(HISTORY_DIR, config.history.baselineDays);
  // Ostrý běh nikdy nepočítá baseline z ukázkových dat – jinak by demo historie
  // vyrobila falešné „cenové bomby" a poslala kvůli nim e-mail.
  const historyWithoutToday = history.filter((s) => s.date !== today && (MOCK || s.mode !== 'demo'));
  const skippedDemo = history.filter((s) => s.date !== today && !MOCK && s.mode === 'demo').length;
  if (skippedDemo) log(`  ⚑ ignoruji ${skippedDemo} ukázkových snapshotů v historii`);
  const baselines = buildBaselines(historyWithoutToday);
  const annotated = annotateDeals(offers, baselines, {
    thresholdPct: config.alerts.thresholdPct,
    minHistoryDays: config.alerts.minHistoryDays,
  });

  const todaySnapshot = { date: today, offers: annotated };
  const trend = buildTrend(historyWithoutToday, todaySnapshot, config.history.trendDays);

  const meta = {
    generatedAt: new Date().toISOString(),
    date: today,
    mode: MOCK ? 'demo' : 'live',
    currency: config.currency.toUpperCase(),
    passengers: config.passengers,
    thresholdPct: config.alerts.thresholdPct,
    source: MOCK ? 'demo generátor (bez API)' : 'Travelpayouts / Aviasales Data API (cachované ceny)',
    stats: {
      combinations: tasks.length,
      offers: annotated.length,
      empty: emptyCount,
      errors: errors.length,
      requests: provider.requestCount,
      elapsedSeconds: elapsed,
      historyDays: baselines.historyDays,
    },
  };

  const latest = {
    ...meta,
    config: {
      origins,
      destinations,
      departureDates: config.departureDates,
      returnDates: config.returnDates,
    },
    baselines: baselines.byRoute,
    offers: annotated,
    errors: errors.slice(0, 100),
  };

  const summary = {
    updatedAt: meta.generatedAt,
    currency: meta.currency,
    trendDays: config.history.trendDays,
    trend,
    baselines: baselines.byRoute,
  };

  // Pojistka: když běh nenajde vůbec nic a přitom hlásí chyby, je něco rozbité
  // (vypršelý token, výpadek API). V takovém případě raději nic nepřepisujeme –
  // na stránce zůstanou včerejší data místo prázdné tabulky.
  if (offers.length === 0 && errors.length > 0) {
    throw new Error(
      `Nenalezena ani jedna nabídka a ${errors.length} kombinací skončilo chybou – data zůstávají beze změny. ` +
        `První chyba: ${errors[0].message}`,
    );
  }

  if (DRY_RUN) {
    log('⚑ --dry-run: nic se nezapisuje');
    log(JSON.stringify({ ...meta, cheapest: annotated.slice(0, 3) }, null, 2));
    return { latest, annotated, config };
  }

  // Historický snapshot drží jen to, co je potřeba pro trend a baseline – ať repozitář neroste zbytečně.
  const snapshotOffers = annotated.map((o) => ({
    origin: o.origin,
    destination: o.destination,
    departureDate: o.departureDate,
    returnDate: o.returnDate,
    priceTotal: o.priceTotal,
    airline: o.airline,
    transfers: o.transfers,
  }));

  await mkdir(HISTORY_DIR, { recursive: true });
  await writeFile(path.join(HISTORY_DIR, `${today}.json`), JSON.stringify({ ...meta, offers: snapshotOffers }));
  await writeFile(path.join(DATA_DIR, 'latest.json'), JSON.stringify(latest, null, 1));
  await writeFile(path.join(DATA_DIR, 'summary.json'), JSON.stringify(summary));
  log(`  zapsáno: data/latest.json, data/summary.json, data/history/${today}.json`);

  return { latest, annotated, config };
}

main().catch((error) => {
  console.error('✖ běh selhal:', error);
  process.exitCode = 1;
});
