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
          duration_to: 780 + Math.round(hash(`d${key}`) * 900),
          duration_back: 780 + Math.round(hash(`e${key}`) * 900),
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
