// Druhý zdroj cen: SerpApi nad Google Flights.
//
// Proč vůbec: Travelpayouts Data API vrací ceny, které nedávno hledali jiní
// lidé. U exotických tras (Singapur, Phnom Penh, Siem Reap, Cebu) je nikdo
// nehledá, takže tam cache zeje prázdnotou a čtyři destinace z osmi mlčí.
// SerpApi se ptá Google Flights naživo, takže odpověď přijde vždycky.
//
// Háček je rozpočet: free tier dává 250 dotazů MĚSÍČNĚ a 50 za hodinu. Při
// 600 kombinacích denně by došly za hodinu, proto se tenhle zdroj pouští jen
// na destinace, kde Travelpayouts selhává, a jen na jeden termín denně.
// Termíny se postupně střídají, takže se za pár týdnů projdou všechny.

const ENDPOINT = 'https://serpapi.com/search.json';

/** Cena je za jednoho dospělého; násobek pro skupinu si dopočítá volající. */
const ADULTS = 1;

export function createSerpProvider({
  apiKey,
  currency = 'CZK',
  language = 'cs',
  country = 'cz',
  timeoutMs = 30000,
  retries = 2,
  logger = console,
}) {
  if (!apiKey) throw new Error('Chybí SERPAPI_KEY.');

  let requestCount = 0;

  async function call(params) {
    const url = new URL(ENDPOINT);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set('api_key', apiKey);

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        requestCount += 1;
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (res.status === 429) {
          // Vyčerpaný hodinový nebo měsíční limit. Opakovat nemá smysl – kvóta
          // se neobnoví za pár vteřin a každý pokus by ukrojil z měsíčního fondu.
          throw Object.assign(new Error('SerpApi: vyčerpaná kvóta (429)'), { noRetry: true, quota: true });
        }
        if (res.status >= 500) throw new Error(`SerpApi: HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) throw Object.assign(new Error(`SerpApi: ${json.error}`), { noRetry: true });
        return json;
      } catch (error) {
        lastError = error;
        if (error.noRetry || attempt === retries) break;
        await sleep(1500 * attempt);
        logger.warn(`  ⟳ SerpApi pokus ${attempt}/${retries}: ${error.message}`);
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

    /**
     * Jeden dotaz pokryje všechna odletová letiště najednou – departure_id
     * bere víc kódů oddělených čárkou. To je to, co drží rozpočet při zemi.
     */
    async search({ origins, destination, departureDate, returnDate, maxTransfers }) {
      const json = await call({
        engine: 'google_flights',
        departure_id: origins.join(','),
        arrival_id: destination,
        outbound_date: departureDate,
        return_date: returnDate,
        type: 1,            // zpáteční
        adults: ADULTS,
        currency,
        hl: language,
        gl: country,
        // Google umí omezit přestupy už v dotazu: 1 = přímé, 2 = max 1 přestup,
        // 3 = max 2 přestupy. Nad dva se nefiltruje, protože 0 znamená "jakkoli".
        ...(Number.isFinite(maxTransfers) && maxTransfers <= 2 ? { stops: maxTransfers + 1 } : {}),
      });
      return [...(json.best_flights ?? []), ...(json.other_flights ?? [])];
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Převede jednu itineráž z Google Flights na náš tvar.
 *
 * Google počítá total_duration jako skutečnou dobu cesty v minutách včetně
 * čekání na přestupech a posunů časových pásem, takže se nic dopočítávat
 * nemusí – na rozdíl od Travelpayouts, kde se musí luštit z odkazu.
 */
export function normalizeSerpOffer(entry, { destination, departureDate, returnDate, passengers, maxTransfers }) {
  const legs = entry.flights ?? [];
  if (!legs.length || !Number.isFinite(entry.price)) return null;

  // Pojistka pro případ, že by Google parametr stops ignoroval nebo změnil význam.
  if (Number.isFinite(maxTransfers) && legs.length - 1 > maxTransfers) return null;

  const origin = legs[0].departure_airport?.id;
  if (!origin) return null;

  const airTime = legs.reduce((sum, l) => sum + (Number(l.duration) || 0), 0);

  return {
    id: `${origin}-${destination}-${departureDate}-${returnDate}`,
    source: 'serpapi',
    origin,
    destination,
    departureDate,
    returnDate,
    departureAt: legs[0].departure_airport?.time ?? null,
    returnAt: null,
    pricePerPerson: Math.round(entry.price),
    priceTotal: Math.round(entry.price * passengers),
    airline: legs[0].flight_number?.split(' ')[0] ?? null,
    airlineName: legs[0].airline ?? null,
    flightNumber: legs[0].flight_number ?? null,
    transfers: Math.max(0, legs.length - 1),
    returnTransfers: null,
    durationTo: airTime || null,
    durationBack: null,
    elapsedTotal: null,
    elapsedTo: Number.isFinite(entry.total_duration) ? entry.total_duration : null,
    elapsedBack: null,
    arrivesTo: legs.at(-1).arrival_airport?.time ?? null,
    arrivesBack: null,
    stopsTo: [origin, ...legs.slice(1).map((l) => l.departure_airport?.id).filter(Boolean), destination],
    stopsBack: null,
    link: googleFlightsLink({ origin, destination, departureDate, returnDate }),
  };
}

/** Odkaz do Google Flights – SerpApi vrací booking_token, ne použitelné URL. */
export function googleFlightsLink({ origin, destination, departureDate, returnDate }) {
  const q = `Flights from ${origin} to ${destination} on ${departureDate} through ${returnDate}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

/**
 * Vybere, na co se dnes zeptat. Rozpočet je přísný, takže jeden termín na
 * destinaci a den; index se odvozuje od data, aby se kombinace postupně
 * protočily a za pár týdnů byly pokryté všechny.
 */
export function planQueries({ destinations, datePairs, today, maxQueries }) {
  const pairs = datePairs ?? [];
  if (!pairs.length || maxQueries <= 0) return [];

  const dayIndex = Math.floor(new Date(`${today}T00:00:00Z`).getTime() / 86400000);

  return destinations.slice(0, maxQueries).map((destination, i) => {
    const [departureDate, returnDate] = pairs[(dayIndex + i) % pairs.length];
    return { destination, departureDate, returnDate };
  });
}
