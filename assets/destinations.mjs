/* Vizuální identita destinací: vlastní akcentová barva a ilustrace dominanty.
 *
 * Ilustrace jsou ručně kreslené inline SVG, ne fotky. Důvod je praktický:
 * nic se nestahuje z cizího serveru, takže se nic nerozbije, když někdo
 * smaže obrázek, a repozitář zůstane v kilobajtech. Kreslí se dvěma barvami –
 * `currentColor` pro siluetu a průhledností odstupňované pozadí – takže se
 * samy přizpůsobí akcentu i tmavému režimu.
 *
 * Barvy jsou validovaná kategoriální paleta v pevném pořadí. Přiřazují se
 * podle destinace, NIKDY podle pořadí v žebříčku – jinak by přefiltrování
 * tabulky přebarvilo zbylé karty a barva by přestala nést význam.
 * Identitu navíc vždy nese i název na kartě, barva na to není sama.
 */

export const ACCENTS = {
  KUL: { light: '#2a78d6', dark: '#3987e5' },  // modrá
  MNL: { light: '#eb6834', dark: '#d95926' },  // oranžová
  HAN: { light: '#1baf7a', dark: '#199e70' },  // tyrkysová
  SGN: { light: '#eda100', dark: '#c98500' },  // žlutá
  SIN: { light: '#e87ba4', dark: '#d55181' },  // purpurová
  PNH: { light: '#008300', dark: '#008300' },  // zelená
  SAI: { light: '#4a3aa7', dark: '#9085e9' },  // fialová
  CEB: { light: '#e34948', dark: '#e66767' },  // červená
};

const FRAME = 'viewBox="0 0 160 92" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false"';
const SKY = '<rect x="0" y="0" width="160" height="92" fill="currentColor" opacity="0.07"/>';
const GROUND = '<rect x="0" y="78" width="160" height="14" fill="currentColor" opacity="0.22"/>';

/* Petronas Towers – dvě zužující se věže se spojovacím mostem. */
const KUL = `${SKY}
<circle cx="132" cy="22" r="9" fill="currentColor" opacity="0.18"/>
<path d="M58 78V34l6-9 6 9v44z" fill="currentColor" opacity="0.9"/>
<path d="M90 78V34l6-9 6 9v44z" fill="currentColor" opacity="0.9"/>
<rect x="63" y="12" width="2" height="14" fill="currentColor"/>
<rect x="95" y="12" width="2" height="14" fill="currentColor"/>
<rect x="70" y="46" width="20" height="4" fill="currentColor" opacity="0.9"/>
<rect x="30" y="58" width="16" height="20" fill="currentColor" opacity="0.45"/>
<rect x="114" y="52" width="18" height="26" fill="currentColor" opacity="0.45"/>
${GROUND}`;

/* Manila – koloniální zvonice s oblouky a kupolí, palma, nízká panorama. */
const MNL = `${SKY}
<circle cx="26" cy="24" r="10" fill="currentColor" opacity="0.18"/>
<rect x="70" y="30" width="20" height="48" fill="currentColor" opacity="0.9"/>
<path d="M68 30h24l-12-9z" fill="currentColor"/>
<circle cx="80" cy="18" r="4" fill="currentColor"/>
<path d="M80 14V8" stroke="currentColor" stroke-width="1.5" fill="none"/>
<path d="M75 44a5 5 0 0 1 10 0v8H75z" fill="currentColor" opacity="0.28"/>
<path d="M75 60a5 5 0 0 1 10 0v6H75z" fill="currentColor" opacity="0.28"/>
<rect x="100" y="56" width="14" height="22" fill="currentColor" opacity="0.45"/>
<rect x="118" y="62" width="12" height="16" fill="currentColor" opacity="0.35"/>
<rect x="44" y="52" width="4" height="26" fill="currentColor" opacity="0.8"/>
<path d="M46 52c-12-1-19 4-22 12 6-6 13-8 22-7zM46 52c12-1 19 4 22 12-6-6-13-8-22-7zM46 51c-9-5-11-11-8-18 1 7 4 12 10 15zM46 51c9-5 11-10 9-17-2 7-5 11-10 14z" fill="currentColor" opacity="0.8"/>
${GROUND}`

/* Hanoj – Želví věž na hladině Hoan Kiem: tři ustupující patra s přesahy. */
const HAN = `${SKY}
<rect x="66" y="56" width="28" height="22" fill="currentColor" opacity="0.85"/>
<path d="M56 56h48l-7-7H63z" fill="currentColor"/>
<path d="M54 49h52l-4-3H58z" fill="currentColor" opacity="0.55"/>
<rect x="70" y="36" width="20" height="13" fill="currentColor" opacity="0.85"/>
<path d="M60 36h40l-6-6H66z" fill="currentColor"/>
<rect x="74" y="22" width="12" height="8" fill="currentColor" opacity="0.85"/>
<path d="M66 22h28l-5-5H71z" fill="currentColor"/>
<path d="M80 17V9" stroke="currentColor" stroke-width="2" fill="none"/>
<circle cx="80" cy="8" r="2.5" fill="currentColor"/>
<rect x="76" y="62" width="8" height="16" fill="currentColor" opacity="0.3"/>
<rect x="0" y="78" width="160" height="14" fill="currentColor" opacity="0.28"/>
<path d="M18 83h28M110 83h30M46 88h32" stroke="currentColor" stroke-width="1.5" opacity="0.4" fill="none"/>`

/* Ho Či Minovo Město – Bitexco Tower s heliportem vyrůstajícím z pláště. */
const SGN = `${SKY}
<path d="M70 78V26c0-7 3-12 8-12s8 5 8 12v52z" fill="currentColor" opacity="0.9"/>
<path d="M86 40c10 0 16 2 19 4-3 3-9 5-19 5z" fill="currentColor"/>
<rect x="77" y="6" width="2" height="9" fill="currentColor"/>
<path d="M72 30h12M72 38h12M72 46h12M72 54h12M72 62h12" stroke="currentColor" stroke-width="1" opacity="0.25" fill="none"/>
<rect x="38" y="52" width="18" height="26" fill="currentColor" opacity="0.45"/>
<rect x="98" y="58" width="16" height="20" fill="currentColor" opacity="0.45"/>
<rect x="118" y="64" width="14" height="14" fill="currentColor" opacity="0.3"/>
<rect x="42" y="57" width="3" height="3" fill="currentColor" opacity="0.3"/>
<rect x="49" y="57" width="3" height="3" fill="currentColor" opacity="0.3"/>
${GROUND}`

/* Singapur – Marina Bay Sands a jeden Supertree. */
const SIN = `${SKY}
<rect x="54" y="30" width="7" height="48" fill="currentColor" opacity="0.9"/>
<rect x="72" y="30" width="7" height="48" fill="currentColor" opacity="0.9"/>
<rect x="90" y="30" width="7" height="48" fill="currentColor" opacity="0.9"/>
<path d="M42 30h66c4 0 5-3 1-5l-10-5H51l-10 5c-4 2-3 5 1 5z" fill="currentColor"/>
<path d="M104 20l10-6" stroke="currentColor" stroke-width="2" fill="none"/>
<path d="M130 78V46" stroke="currentColor" stroke-width="4" opacity="0.8" fill="none"/>
<path d="M130 46c-14-2-20-10-20-22 8 5 14 11 20 17 6-6 12-12 20-17 0 12-6 20-20 22z" fill="currentColor" opacity="0.7"/>
${GROUND}`;

/* Phnom Penh – trůnní sál Královského paláce se špicí. */
const PNH = `${SKY}
<path d="M56 78V52h48v26z" fill="currentColor" opacity="0.85"/>
<path d="M52 52h56l-8-10H60z" fill="currentColor"/>
<path d="M68 42h24l-6-10H74z" fill="currentColor" opacity="0.95"/>
<path d="M72 32h16l-8-20z" fill="currentColor"/>
<path d="M80 12V2" stroke="currentColor" stroke-width="2" fill="none"/>
<rect x="64" y="60" width="7" height="18" fill="currentColor" opacity="0.25"/>
<rect x="89" y="60" width="7" height="18" fill="currentColor" opacity="0.25"/>
<rect x="30" y="66" width="14" height="12" fill="currentColor" opacity="0.35"/>
<rect x="118" y="66" width="14" height="12" fill="currentColor" opacity="0.35"/>
${GROUND}`;

/* Siem Reap – Angkor Wat, pět věží nad hrází. */
const SAI = `${SKY}
<path d="M80 14c5 10 7 20 7 30H73c0-10 2-20 7-30z" fill="currentColor"/>
<path d="M52 28c4 8 6 16 6 24H46c0-8 2-16 6-24z" fill="currentColor" opacity="0.9"/>
<path d="M108 28c4 8 6 16 6 24h-12c0-8 2-16 6-24z" fill="currentColor" opacity="0.9"/>
<path d="M30 40c3 6 5 12 5 18H25c0-6 2-12 5-18z" fill="currentColor" opacity="0.75"/>
<path d="M130 40c3 6 5 12 5 18h-10c0-6 2-12 5-18z" fill="currentColor" opacity="0.75"/>
<rect x="22" y="58" width="116" height="8" fill="currentColor" opacity="0.8"/>
<rect x="14" y="66" width="132" height="5" fill="currentColor" opacity="0.5"/>
<rect x="0" y="74" width="160" height="18" fill="currentColor" opacity="0.28"/>`;

/* Cebu – pláž s palmami a výložníkovým člunem. */
const CEB = `${SKY}
<circle cx="124" cy="26" r="11" fill="currentColor" opacity="0.22"/>
<rect x="40" y="46" width="4" height="32" fill="currentColor" opacity="0.85"/>
<path d="M44 46c-14-1-23 4-27 14 7-7 16-9 27-8zM44 46c14-1 23 4 27 14-7-7-16-9-27-8zM44 45c-10-6-12-13-9-21 1 8 5 14 11 18zM44 45c10-6 13-12 11-20-2 8-6 13-12 17z" fill="currentColor" opacity="0.85"/>
<rect x="72" y="56" width="3" height="22" fill="currentColor" opacity="0.6"/>
<path d="M74 56c-10-1-17 3-20 10 5-5 12-7 20-6zM74 56c10-1 17 3 20 10-5-5-12-7-20-6zM74 55c-7-4-9-9-7-15 1 6 3 11 8 13z" fill="currentColor" opacity="0.6"/>
<path d="M96 74h40l-5 6h-30z" fill="currentColor" opacity="0.9"/>
<path d="M100 74V64l18 10z" fill="currentColor" opacity="0.7"/>
<rect x="0" y="80" width="160" height="12" fill="currentColor" opacity="0.3"/>
<path d="M8 86h26M52 86h30M100 86h28" stroke="currentColor" stroke-width="1.5" opacity="0.35" fill="none"/>`;

const ART = { KUL, MNL, HAN, SGN, SIN, PNH, SAI, CEB };

/** Neznámý kód dostane neutrální siluetu místo prázdna. */
const FALLBACK = `${SKY}
<rect x="44" y="48" width="18" height="30" fill="currentColor" opacity="0.6"/>
<rect x="68" y="36" width="20" height="42" fill="currentColor" opacity="0.8"/>
<rect x="94" y="54" width="18" height="24" fill="currentColor" opacity="0.5"/>
${GROUND}`;

export function destinationArt(code) {
  return `<svg class="dest-card__art" ${FRAME}>${ART[code] || FALLBACK}</svg>`;
}

export function accentFor(code) {
  return ACCENTS[code] || { light: '#52514e', dark: '#c3c2b7' };
}
