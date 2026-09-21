// Mapa IATA kódů aerolinek na názvy. Travelpayouts vrací jen dvoupísmenný kód.
// Neznámý kód se v UI zobrazí tak, jak přišel – klidně sem přidej další.
export const AIRLINES = {
  AF: 'Air France', AI: 'Air India', AK: 'AirAsia', AY: 'Finnair', AZ: 'ITA Airways',
  BA: 'British Airways', BI: 'Royal Brunei', BR: 'EVA Air', CA: 'Air China', CI: 'China Airlines',
  CX: 'Cathay Pacific', CZ: 'China Southern', D7: 'AirAsia X', DL: 'Delta', EK: 'Emirates',
  ET: 'Ethiopian Airlines', EY: 'Etihad Airways', FD: 'Thai AirAsia', FR: 'Ryanair', GA: 'Garuda Indonesia',
  GF: 'Gulf Air', HU: 'Hainan Airlines', HX: 'Hong Kong Airlines', HY: 'Uzbekistan Airways',
  J2: 'Azerbaijan Airlines', JL: 'Japan Airlines', JQ: 'Jetstar', K6: 'Cambodia Angkor Air',
  KC: 'Air Astana', KE: 'Korean Air', KL: 'KLM', KU: 'Kuwait Airways', LH: 'Lufthansa',
  LO: 'LOT Polish Airlines', LX: 'Swiss', MF: 'Xiamen Airlines', MH: 'Malaysia Airlines',
  MS: 'EgyptAir', MU: 'China Eastern', NH: 'ANA', OD: 'Batik Air Malaysia', OS: 'Austrian Airlines',
  OZ: 'Asiana Airlines', PC: 'Pegasus Airlines', PG: 'Bangkok Airways', PR: 'Philippine Airlines',
  QF: 'Qantas', QH: 'Bamboo Airways', QR: 'Qatar Airways', RJ: 'Royal Jordanian', SK: 'SAS',
  SL: 'Thai Lion Air', SQ: 'Singapore Airlines', SU: 'Aeroflot', SV: 'Saudia', TG: 'Thai Airways',
  TK: 'Turkish Airlines', TR: 'Scoot', UA: 'United Airlines', UL: 'SriLankan Airlines',
  UZ: 'Buraq Air', VJ: 'VietJet Air', VN: 'Vietnam Airlines', W6: 'Wizz Air', WY: 'Oman Air',
  XY: 'flynas', Z2: 'Philippines AirAsia', '3K': 'Jetstar Asia', '5J': 'Cebu Pacific',
  '6E': 'IndiGo', '8M': 'Myanmar Airways', 'BL': 'Pacific Airlines', 'PQ': 'SkyUp',
};

export function airlineName(code) {
  if (!code) return '—';
  return AIRLINES[code] || code;
}
