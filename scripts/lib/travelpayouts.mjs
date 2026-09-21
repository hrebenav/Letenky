// Klient nad Travelpayouts (Aviasales) Data API – endpoint /aviasales/v3/prices_for_dates.
//
// Co API vrací: nejlevnější letenky, které v posledních dnech reálně našli uživatelé
// Aviasales (cache, ne živé vyhledávání). Pro sledování trendu to stačí, před nákupem
// je potřeba cenu ověřit kliknutím na odkaz.
//
// Dokumentace: https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API

const BASE = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const AVIASALES = 'https://www.aviasales.com';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Datum 2026-12-26 -> "2612" (formát, který používá vyhledávací URL Aviasales). */
function ddmm(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${d}${m}`;
}

/**
 * Deterministický odkaz do vyhledávání Aviasales pro konkrétní trasu, termín a počet cestujících.
 * Nespoléhá na pole `link` z API (to občas chybí) a vždy vede na živé vyhledávání.
 */
export function bookingLink({ origin, destination, departureDate, returnDate, passengers, marker }) {
  const path = `${origin}${ddmm(departureDate)}${destination}${ddmm(returnDate)}${passengers}`;
  const url = new URL(`${AVIASALES}/search/${path}`);
  if (marker) url.searchParams.set('marker', marker);
  return url.toString();
}

export function createProvider({
  token,
  marker = '',
  currency = 'czk',
  market = 'cz',
  timeoutMs = 20000,
  retries = 3,
  logger = console,
}) {
  if (!token) throw new Error('Chybí TRAVELPAYOUTS_TOKEN.');

  let requestCount = 0;

  async function call(params) {
    const url = new URL(BASE);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    url.searchParams.set('currency', currency);
    url.searchParams.set('market', market);
    url.searchParams.set('token', token);

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        requestCount += 1;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': 'letenky-microsite/1.0' },
        });
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.ok) {
          // 4xx mimo 429 nemá smysl opakovat (špatný token, neplatný IATA kód…)
          const body = await res.text();
          const err = new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
          err.fatal = res.status === 401 || res.status === 403;
          throw Object.assign(err, { noRetry: true });
        }
        const json = await res.json();
        if (json && json.success === false) {
          throw Object.assign(new Error(`API: ${json.error || 'neznámá chyba'}`), { noRetry: true });
        }
        return Array.isArray(json?.data) ? json.data : [];
      } catch (error) {
        lastError = error;
        if (error.noRetry || attempt === retries) break;
        const backoff = 500 * 2 ** (attempt - 1) + Math.random() * 250;
        logger.warn(`  ⟳ pokus ${attempt}/${retries} selhal (${error.message}), čekám ${Math.round(backoff)} ms`);
        await sleep(backoff);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  return {
    get requestCount() {
      return requestCount;
    },

    /** Nejlevnější nabídky pro jeden konkrétní pár dat (odlet + návrat). */
    async searchDatePair({ origin, destination, departureDate, returnDate, limit = 5 }) {
      return call({
        origin,
        destination,
        departure_at: departureDate,
        return_at: returnDate,
        one_way: 'false',
        direct: 'false',
        sorting: 'price',
        unique: 'false',
        limit,
      });
    },

    /**
     * Záložní dotaz v měsíčním rozlišení. Používá se, když pro trasu nevrátí
     * žádný z přesných datumových párů nic – cache API je pro exotické trasy řidší.
     */
    async searchMonth({ origin, destination, departureMonth, returnMonth, limit = 100 }) {
      return call({
        origin,
        destination,
        departure_at: departureMonth,
        return_at: returnMonth,
        one_way: 'false',
        direct: 'false',
        sorting: 'price',
        unique: 'false',
        limit,
      });
    },

    bookingLink: (args) => bookingLink({ ...args, marker }),
  };
}
