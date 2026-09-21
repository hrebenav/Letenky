// Práce s historií cen: načtení snapshotů, výpočet baseline (průměr/minimum)
// a sestavení časové řady pro graf trendu.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const routeKey = (offer) => `${offer.origin}-${offer.destination}`;
export const comboKey = (offer) =>
  `${offer.origin}-${offer.destination}|${offer.departureDate}|${offer.returnDate}`;

/** Načte historické snapshoty (nejnovější poslední), maximálně `maxDays` posledních dní. */
export async function loadHistory(historyDir, maxDays = 60) {
  let files;
  try {
    files = await readdir(historyDir);
  } catch {
    return [];
  }
  const snapshots = [];
  const wanted = files
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .slice(-maxDays);

  for (const file of wanted) {
    try {
      const raw = await readFile(path.join(historyDir, file), 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.offers)) {
        snapshots.push({ date: file.replace('.json', ''), offers: parsed.offers, mode: parsed.mode });
      }
    } catch (error) {
      console.warn(`  ! historický soubor ${file} se nepodařilo načíst: ${error.message}`);
    }
  }
  return snapshots;
}

/** Nejnižší cena za den pro každý klíč (trasa / konkrétní kombinace dat). */
function dailyMinima(snapshots, keyFn) {
  const perKey = new Map();
  for (const snapshot of snapshots) {
    const dayMin = new Map();
    for (const offer of snapshot.offers) {
      const key = keyFn(offer);
      const current = dayMin.get(key);
      if (current === undefined || offer.priceTotal < current) dayMin.set(key, offer.priceTotal);
    }
    for (const [key, price] of dayMin) {
      if (!perKey.has(key)) perKey.set(key, []);
      perKey.get(key).push({ date: snapshot.date, price });
    }
  }
  return perKey;
}

function stats(series) {
  const prices = series.map((s) => s.price);
  const sum = prices.reduce((a, b) => a + b, 0);
  const min = Math.min(...prices);
  const minEntry = series.find((s) => s.price === min);
  return {
    days: prices.length,
    avg: Math.round(sum / prices.length),
    min,
    minDate: minEntry?.date ?? null,
  };
}

/**
 * Baseline = statistika denních minim z historie (bez dnešního běhu).
 * Vrací hodnoty na úrovni trasy i konkrétní kombinace termínů.
 */
export function buildBaselines(snapshots) {
  const byRoute = {};
  const byCombo = {};
  for (const [key, series] of dailyMinima(snapshots, routeKey)) byRoute[key] = stats(series);
  for (const [key, series] of dailyMinima(snapshots, comboKey)) byCombo[key] = stats(series);
  return { byRoute, byCombo, historyDays: snapshots.length };
}

/**
 * Doplní k nabídkám informaci, jak moc jsou pod historickým průměrem / minimem.
 * `dealPct` = o kolik procent je cena pod historickým PRŮMĚREM dané trasy (badge v UI).
 * `vsMinPct` = o kolik procent je pod historickým MINIMEM (podklad pro notifikaci).
 */
export function annotateDeals(offers, baselines, { thresholdPct, minHistoryDays }) {
  const enoughHistory = baselines.historyDays >= minHistoryDays;
  return offers.map((offer) => {
    const base = baselines.byRoute[routeKey(offer)];
    if (!enoughHistory || !base || base.days < minHistoryDays) {
      return { ...offer, dealPct: null, vsMinPct: null, isDeal: false, isAllTimeLow: false };
    }
    const dealPct = Math.round(((base.avg - offer.priceTotal) / base.avg) * 1000) / 10;
    const vsMinPct = Math.round(((base.min - offer.priceTotal) / base.min) * 1000) / 10;
    return {
      ...offer,
      dealPct,
      vsMinPct,
      isDeal: dealPct >= thresholdPct,
      isAllTimeLow: offer.priceTotal < base.min,
    };
  });
}

/**
 * Časová řada pro graf: pro každý den nejnižší cena na každé trase.
 * Stránka si z toho dokáže spočítat minimum pro libovolnou kombinaci filtrů,
 * aniž by musela stahovat celou historii.
 */
export function buildTrend(snapshots, todaySnapshot, trendDays) {
  const all = [...snapshots.filter((s) => s.date !== todaySnapshot.date), todaySnapshot].slice(-trendDays);
  return all.map((snapshot) => {
    const byRoute = {};
    let min = null;
    for (const offer of snapshot.offers) {
      if (min === null || offer.priceTotal < min) min = offer.priceTotal;
      const key = routeKey(offer);
      const current = byRoute[key];
      if (current === undefined || offer.priceTotal < current) byRoute[key] = offer.priceTotal;
    }
    return { date: snapshot.date, min, byRoute, offerCount: snapshot.offers.length };
  });
}
