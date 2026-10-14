// Demo provider – generuje pseudonáhodná, ale realistická data bez volání API.
// Slouží k vyzkoušení celého pipeline a vzhledu stránky, než bude k dispozici token.
// Data z tohoto providera se v UI označí jako DEMO.
import { bookingLink } from './travelpayouts.mjs';

const BASE_PRICE = {
  KUL: 17500, MNL: 21000, HAN: 16500, SGN: 16800, SIN: 19500, PNH: 20500, SAI: 22500, CEB: 23000,
};
const ORIGIN_FACTOR = { PRG: 1.0, VIE: 0.96, MUC: 0.94, BTS: 1.05, DRS: 1.08 };
const CARRIERS = ['QR', 'EK', 'TK', 'EY', 'SQ', 'MH', 'VN', 'LH', 'AF', 'KL', 'CZ', 'HU'];

// Deterministický hash -> stejný vstup dá stejnou cenu v rámci jednoho dne.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function createMockProvider({ marker = '', seed = new Date().toISOString().slice(0, 10) } = {}) {
  let requestCount = 0;
  return {
    get requestCount() {
      return requestCount;
    },
    async searchDatePair({ origin, destination, departureDate, returnDate }) {
      requestCount += 1;
      const key = `${seed}|${origin}|${destination}|${departureDate}|${returnDate}`;
      const r = hash(key);
      // ~12 % kombinací nemá v cache žádnou nabídku, stejně jako u reálného API.
      if (r < 0.12) return [];
      const base = (BASE_PRICE[destination] ?? 20000) * (ORIGIN_FACTOR[origin] ?? 1);
      let price = Math.round((base * (0.74 + hash(`p${key}`) * 0.66)) / 10) * 10;
      // V demo režimu jednu kombinaci v aktuálním snapshotu úmyslně srazíme dolů,
      // aby bylo na stránce vidět, jak vypadá badge „cenová bomba“.
      if (seed === new Date().toISOString().slice(0, 10) && origin === 'MUC' && destination === 'KUL' && departureDate === '2026-12-27' && returnDate === '2027-01-09') {
        price = Math.round((base * 0.6) / 10) * 10;
      }
      const transfers = hash(`t${key}`) < 0.25 ? 0 : hash(`t${key}`) < 0.8 ? 1 : 2;
      const durationTo = 780 + Math.round(hash(`d${key}`) * 900);
      const durationBack = 780 + Math.round(hash(`e${key}`) * 900);
      // Skutečná doba cesty = let + čekání na přestupech. Mock to musí umět taky,
      // jinak by se nedal ověřit rozpad z odkazu (parseItinerary).
      const waitTo = transfers * (90 + Math.round(hash(`w${key}`) * 600));
      const waitBack = transfers * (90 + Math.round(hash(`v${key}`) * 600));
      const elapsedTo = durationTo + waitTo;
      const elapsedBack = durationBack + waitBack;
      // Odkaz ve stejném tvaru, jaký posílá API: dvojice timestampů + kódy letišť.
      const depTs = Math.floor(new Date(`${departureDate}T06:25:00Z`).getTime() / 1000);
      const retTs = Math.floor(new Date(`${returnDate}T06:10:00Z`).getTime() / 1000);
      const chain = (a, b, n) => [a, ...Array.from({ length: n }, (_, i) => ['BUD', 'IST', 'DXB'][i % 3]), b].join('');
      const leg = (dep, minutes, ports) =>
        `${dep}${dep + minutes * 60}${String(100 + Math.floor(hash(`f${key}`) * 899)).padStart(6, '0')}${ports}`;
      const token = `XX${leg(depTs, elapsedTo, chain(origin, destination, transfers))}${leg(retTs, elapsedBack, chain(destination, origin, transfers))}_mock_1`;

      return [
        {
          origin,
          destination,
          origin_airport: origin,
          destination_airport: destination,
          price,
          airline: CARRIERS[Math.floor(hash(`a${key}`) * CARRIERS.length)],
          flight_number: String(100 + Math.floor(hash(`f${key}`) * 899)),
          departure_at: `${departureDate}T${String(6 + Math.floor(hash(`h${key}`) * 15)).padStart(2, '0')}:25:00+01:00`,
          return_at: `${returnDate}T${String(6 + Math.floor(hash(`r${key}`) * 15)).padStart(2, '0')}:10:00+07:00`,
          transfers,
          return_transfers: transfers,
          duration_to: durationTo,
          duration_back: durationBack,
          duration: elapsedTo + elapsedBack,
          link: `/search/${origin}${destination}?t=${token}`,
        },
      ];
    },
    async searchMonth() {
      requestCount += 1;
      return [];
    },
    bookingLink: (args) => bookingLink({ ...args, marker }),
  };
}
