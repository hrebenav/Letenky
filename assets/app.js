// Microsite čte jen statické JSON soubory, které vygeneroval scripts/fetch-prices.mjs.
// Žádný backend, žádné knihovny – graf je ručně kreslené inline SVG.

import { destinationArt, accentFor } from './destinations.mjs';

const el = (id) => document.getElementById(id);

const state = {
  latest: null,
  summary: null,
  originNames: new Map(),
  destinationNames: new Map(),
  filters: {
    origins: new Set(),
    destinations: new Set(),
    maxTransfers: '',
    sort: 'price',
    bestPerRoute: true,
    dealsOnly: false,
  },
  limit: 100,
  chart: null,
};

/* ---------- formátování ---------- */

const czkFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
const czk = (value) => `${czkFormat.format(Math.round(value))} Kč`;
// Zkratka na tisíce počítá s jedním desetinným místem, takže ji nesmí tisknout
// czkFormat (0 desetinných). Jinak se při úzkém rozpětí cen slijí všechny
// značky osy do jedné hodnoty – "38 tis., 38 tis., 37 tis., 37 tis.".
const thousandsFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
const czkShort = (value) =>
  value >= 10000 ? `${thousandsFormat.format(Math.round(value / 100) / 10)} tis.` : czkFormat.format(value);

function dayMonth(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${Number(d)}. ${Number(m)}.`;
}
function dayMonthYear(isoDate) {
  return `${dayMonth(isoDate)} ${isoDate.slice(0, 4)}`;
}
/** Hodina z ISO časové značky, v místním čase letiště (offset je v datech). */
function clockTime(iso) {
  if (!iso) return null;
  const m = String(iso).match(/T(\d{2}):(\d{2})/);
  return m ? `${Number(m[1])}:${m[2]}` : null;
}

function duration(minutes) {
  if (!Number.isFinite(minutes)) return null;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
const cityName = (code) => state.originNames.get(code) ?? state.destinationNames.get(code) ?? code;
const routeOf = (offer) => `${offer.origin}-${offer.destination}`;
/** Kombinace trasa+termín bez pořadového čísla varianty (id končí na "#0", "#1"…). */
const comboOf = (offer) => String(offer.id).split('#')[0];

/* ---------- načtení dat ---------- */

/** Profily mají vlastní data i historii; který se zobrazuje, říká ?profil= v URL. */
const PROFILES = {
  '': { dir: 'data', label: 'Pevné termíny' },
  flex: { dir: 'data/flex', label: 'Flexibilní termín' },
};

function currentProfile() {
  const key = new URLSearchParams(location.search).get('profil') ?? '';
  return PROFILES[key] ? key : '';
}

function dataDir() {
  return PROFILES[currentProfile()].dir;
}

async function loadJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function init() {
  try {
    const dir = dataDir();
    const [latest, summary] = await Promise.all([
      loadJson(`${dir}/latest.json`),
      loadJson(`${dir}/summary.json`),
    ]);
    state.latest = latest;
    state.summary = summary;
  } catch (error) {
    showBanner(
      `Nepodařilo se načíst data (${error.message}). Pokud jsi stránku otevřela přímo ze souboru, spusť ji přes lokální server: <code>npx serve .</code>`,
      'warn',
    );
    el('app').setAttribute('aria-busy', 'false');
    return;
  }

  for (const o of state.latest.config.origins) state.originNames.set(o.code, o.name);
  for (const d of state.latest.config.destinations) state.destinationNames.set(d.code, d.name);

  buildChips();
  markActiveTab();
  bindControls();
  applyTransferCap();
  renderHeader();
  render();
  el('app').setAttribute('aria-busy', 'false');
}

function showBanner(html, variant) {
  const banner = el('banner');
  banner.innerHTML = html;
  banner.className = variant ? `banner banner--${variant}` : 'banner';
  banner.hidden = false;
}

// Běh je naplánovaný jednou denně; 36 h dává rezervu na zpoždění cronu v Actions.
const STALE_AFTER_HOURS = 36;

/* ---------- hlavička a filtry ---------- */

function renderHeader() {
  const { latest } = state;
  const generated = new Date(latest.generatedAt);
  const ageHours = (Date.now() - generated.getTime()) / 3_600_000;
  const dep = latest.config.departureDates;
  const ret = latest.config.returnDates;
  // U flexibilního profilu samotné rozpětí dat nestačí – podstatné je pravidlo
  // o minimální délce pobytu, jinak to vypadá jako obyčejné širší okno.
  const rule = latest.config.tripRule ? ` · ${latest.config.tripRule}` : '';
  el('subtitle').textContent =
    `Odlet ${dayMonth(dep[0])}–${dayMonthYear(dep.at(-1))} · návrat ${dayMonth(ret[0])}–${dayMonthYear(ret.at(-1))}${rule} · ` +
    `${latest.passengers} dospělí · ceny v ${latest.currency} · aktualizováno ${generated.toLocaleString('cs-CZ')}`;

  el('footer-source').textContent = `Zdroj dat: ${latest.source}. Historie: ${latest.stats.historyDays + 1} dní.`;

  if (latest.mode === 'demo') {
    showBanner(
      '<strong>Ukázková data.</strong> Tenhle běh proběhl v demo režimu bez připojení k API – čísla jsou vymyšlená a slouží jen k ukázce vzhledu. Po nastavení tokenu se stránka naplní reálnými cenami.',
      'warn',
    );
  } else if (ageHours > STALE_AFTER_HOURS) {
    // Denní úloha umí selhat tiše celé týdny (stalo se: 19 běhů v řadě).
    // Stránka je jediné místo, kam se člověk dívá, tak ať je to vidět tady.
    const days = Math.floor(ageHours / 24);
    const age = days >= 1 ? `${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}` : `${Math.round(ageHours)} hodin`;
    showBanner(
      `<strong>Data jsou stará ${age}.</strong> Denní úloha zřejmě neproběhla – zkontroluj záložku ` +
      '<em>Actions</em> v GitHub repozitáři, jestli poslední běh neskončil chybou.',
      'warn',
    );
  } else if (latest.stats.errors > 0) {
    showBanner(`Poslední běh skončil s ${latest.stats.errors} chybami u jednotlivých kombinací – ostatní data jsou v pořádku.`);
  }
}

/** Zvýrazní záložku odpovídající zobrazenému profilu. */
function markActiveTab() {
  const key = currentProfile();
  for (const tab of document.querySelectorAll('.tab')) {
    const isActive = (tab.dataset.profile ?? '') === key;
    tab.classList.toggle('is-active', isActive);
    if (isActive) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

/** Přepíše první volbu filtru přestupů podle stropu, který platí v datech. */
function applyTransferCap() {
  const cap = state.latest.config.maxTransfers;
  const select = el('filter-transfers');
  const any = select.querySelector('option[value=""]');
  if (!Number.isFinite(cap)) return;
  if (any) any.textContent = `max ${cap} (vše, co sledujeme)`;
  for (const option of select.querySelectorAll('option[value]')) {
    const v = Number(option.value);
    if (Number.isFinite(v) && v > cap) option.remove();
  }
}

function buildChips() {
  const make = (container, items, set) => {
    container.innerHTML = '';
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.textContent = item.name;
      button.title = item.code;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (set.has(item.code)) set.delete(item.code);
        else set.add(item.code);
        button.setAttribute('aria-pressed', String(set.has(item.code)));
        state.limit = 100;
        render();
      });
      container.appendChild(button);
    }
  };
  make(el('filter-origins'), state.latest.config.origins, state.filters.origins);
  make(el('filter-destinations'), state.latest.config.destinations, state.filters.destinations);
}

function bindControls() {
  el('filter-transfers').addEventListener('change', (e) => {
    state.filters.maxTransfers = e.target.value;
    render();
  });
  el('filter-sort').addEventListener('change', (e) => {
    state.filters.sort = e.target.value;
    render();
  });
  el('filter-best-per-route').addEventListener('change', (e) => {
    state.filters.bestPerRoute = e.target.checked;
    state.limit = 100;
    render();
  });
  el('filter-deals-only').addEventListener('change', (e) => {
    state.filters.dealsOnly = e.target.checked;
    state.limit = 100;
    render();
  });
  el('filter-reset').addEventListener('click', () => {
    state.filters.origins.clear();
    state.filters.destinations.clear();
    state.filters.maxTransfers = '';
    state.filters.dealsOnly = false;
    el('filter-transfers').value = '';
    el('filter-deals-only').checked = false;
    for (const chip of document.querySelectorAll('.chip')) chip.setAttribute('aria-pressed', 'false');
    state.limit = 100;
    render();
  });
  el('offers-more').addEventListener('click', () => {
    state.limit += 100;
    renderTable(currentOffers());
  });

  const toggle = el('theme-toggle');
  const stored = localStorage.getItem('letenky-theme');
  if (stored) document.documentElement.dataset.theme = stored;
  toggle.addEventListener('click', () => {
    const isDark =
      document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('letenky-theme', next);
    render();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderChart(), 150);
  });
}

/* ---------- výběr dat podle filtrů ---------- */

function selectedRoutes() {
  const { origins, destinations } = state.filters;
  const routes = [];
  for (const o of state.latest.config.origins) {
    if (origins.size && !origins.has(o.code)) continue;
    for (const d of state.latest.config.destinations) {
      if (destinations.size && !destinations.has(d.code)) continue;
      routes.push(`${o.code}-${d.code}`);
    }
  }
  return routes;
}

function currentOffers() {
  const { filters } = state;
  const maxTransfers = filters.maxTransfers === '' ? null : Number(filters.maxTransfers);

  let offers = state.latest.offers.filter((offer) => {
    if (filters.origins.size && !filters.origins.has(offer.origin)) return false;
    if (filters.destinations.size && !filters.destinations.has(offer.destination)) return false;
    if (maxTransfers !== null) {
      const t = Math.max(offer.transfers ?? 0, offer.returnTransfers ?? 0);
      if (t > maxTransfers) return false;
    }
    if (filters.dealsOnly && !offer.isDeal) return false;
    return true;
  });

  if (filters.bestPerRoute) {
    // Nejdřív se pro každou trasu najde nejvýhodnější termín, pak se nechají
    // VŠECHNY jeho varianty. Kdyby se vybírala jedna nabídka, zmizely by
    // dražší, ale pohodlnější alternativy – a kvůli těm se sbírají.
    const bestCombo = new Map();
    for (const offer of offers) {
      const key = routeOf(offer);
      const current = bestCombo.get(key);
      if (!current || offer.priceTotal < current.priceTotal) bestCombo.set(key, offer);
    }
    const keepCombos = new Set([...bestCombo.values()].map((o) => comboOf(o)));
    const best = new Map();
    for (const offer of offers) {
      if (keepCombos.has(comboOf(offer))) best.set(offer.id, offer);
    }
    offers = [...best.values()];
  }

  const sorters = {
    price: (a, b) => a.priceTotal - b.priceTotal,
    deal: (a, b) => (b.dealPct ?? -999) - (a.dealPct ?? -999) || a.priceTotal - b.priceTotal,
    departure: (a, b) => a.departureDate.localeCompare(b.departureDate) || a.priceTotal - b.priceTotal,
    route: (a, b) => routeOf(a).localeCompare(routeOf(b)) || a.priceTotal - b.priceTotal,
    // Nabídky bez známé doby cesty nebo počtu přestupů padají na konec –
    // jinak by se tvářily jako nejrychlejší jen proto, že údaj chybí.
    duration: (a, b) => (a.elapsedTo ?? Infinity) - (b.elapsedTo ?? Infinity) || a.priceTotal - b.priceTotal,
    stops: (a, b) => (a.transfers ?? Infinity) - (b.transfers ?? Infinity) || a.priceTotal - b.priceTotal,
  };
  return offers.sort(sorters[filters.sort] ?? sorters.price);
}

/* ---------- vykreslení ---------- */

function render() {
  const offers = currentOffers();
  renderTiles(offers);
  renderChart();
  renderDestinationBars();
  renderTable(offers);
  renderErrors();
}

function renderTiles(offers) {
  const cheapest = offers[0] && offers.reduce((a, b) => (b.priceTotal < a.priceTotal ? b : a));
  if (cheapest) {
    el('kpi-today-value').textContent = czk(cheapest.pricePerPerson);
    el('kpi-today-note').textContent =
      `${cityName(cheapest.origin)} → ${cityName(cheapest.destination)} · ${dayMonth(cheapest.departureDate)}–${dayMonth(cheapest.returnDate)} · ${czk(cheapest.priceTotal)} za ${passengers()} ${passengers() < 5 ? 'osoby' : 'osob'}`;
  } else {
    el('kpi-today-value').textContent = '—';
    el('kpi-today-note').textContent = 'pro zvolené filtry nic nenalezeno';
  }

  const series = trendSeries();
  const withValue = series.filter((p) => p.value !== null);
  if (withValue.length) {
    const min = withValue.reduce((a, b) => (b.value < a.value ? b : a));
    el('kpi-alltime-value').textContent = czk(min.value);
    el('kpi-alltime-note').textContent = `nejníže ${dayMonthYear(min.date)} · sledováno ${withValue.length} dní`;
    const avg = withValue.reduce((sum, p) => sum + p.value, 0) / withValue.length;
    el('kpi-avg-value').textContent = czk(avg);
    const todayValue = withValue.at(-1).value;
    const diff = Math.round(((todayValue - avg) / avg) * 1000) / 10;
    el('kpi-avg-note').textContent =
      diff === 0 ? 'dnešek přesně na průměru' : `dnešek je ${diff < 0 ? `${Math.abs(diff)} % pod` : `${diff} % nad`} průměrem`;
  } else {
    el('kpi-alltime-value').textContent = '—';
    el('kpi-alltime-note').textContent = 'zatím není historie';
    el('kpi-avg-value').textContent = '—';
    el('kpi-avg-note').textContent = 'první běh, historie se teprve buduje';
  }

  const { stats } = state.latest;
  el('kpi-coverage-value').textContent = `${stats.offers} / ${stats.combinations}`;
  el('kpi-coverage-note').textContent =
    `kombinací s nabídkou · ${stats.empty} bez dat · ${stats.errors} chyb`;
}

/** Časová řada nejnižší ceny pro aktuálně vybrané trasy. */
/** Počet cestujících, pro který fetch skript počítal priceTotal. */
function passengers() {
  return state.latest?.passengers || 1;
}

function trendSeries() {
  const routes = new Set(selectedRoutes());
  return (state.summary.trend ?? []).map((day) => {
    let min = null;
    let count = 0;
    for (const [route, price] of Object.entries(day.byRoute ?? {})) {
      if (!routes.has(route)) continue;
      count += 1;
      if (min === null || price < min) min = price;
    }
    // summary.json drží ceny za celou skupinu; dashboard mluví za osobu,
    // tak se dělí jednou tady a všechno dál už je ve stejné jednotce.
    return { date: day.date, value: min === null ? null : min / passengers(), count };
  });
}

/* ---------- graf ---------- */

function niceTicks(min, max, count) {
  const span = Math.max(max - min, 1);
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const error = rough / magnitude;
  const step = magnitude * (error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1);
  const ticks = [];
  for (let value = Math.ceil(min / step) * step; value <= max + 1e-6; value += step) ticks.push(value);
  return ticks;
}

function renderChart() {
  const canvas = el('chart-canvas');
  const series = trendSeries();
  const points = series.filter((p) => p.value !== null);
  const routeCount = selectedRoutes().length;
  const totalRoutes = state.latest.config.origins.length * state.latest.config.destinations.length;

  el('chart-sub').textContent =
    `nejnižší cena za osobu, ${routeCount === totalRoutes ? 'všechny trasy' : `vybrané trasy (${routeCount})`}`;

  if (points.length < 2) {
    canvas.innerHTML =
      '<p class="empty">Graf se objeví, až bude aspoň dva dny historie. Každý denní běh přidá jeden bod.</p>';
    el('chart-caption').textContent = '';
    renderTrendTable(series);
    return;
  }

  const width = Math.max(canvas.clientWidth || 640, 320);
  const height = 250;
  const margin = { top: 16, right: 60, bottom: 26, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max((rawMax - rawMin) * 0.15, rawMax * 0.01);
  // Cílovou cenu zobrazíme jen když je v dohledu – jinak by zploštila celou křivku.
  const target = state.latest.targetPriceTotal ?? null;
  const showTarget = target !== null && target > rawMin * 0.65 && target < rawMax * 1.35;
  const yMin = showTarget ? Math.min(rawMin - pad, target - pad * 0.6) : rawMin - pad;
  const yMax = showTarget ? Math.max(rawMax + pad, target + pad * 0.6) : rawMax + pad;

  const x = (i) => margin.left + (points.length === 1 ? plotWidth / 2 : (i / (points.length - 1)) * plotWidth);
  const y = (v) => margin.top + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;

  const seenTickLabels = new Set();
  const ticks = niceTicks(yMin, yMax, 4).filter((t) => {
    const label = czkShort(t);
    if (seenTickLabels.has(label)) return false;
    seenTickLabels.add(label);
    return true;
  });
  const minPoint = points.reduce((a, b) => (b.value < a.value ? b : a));
  const minIndex = points.indexOf(minPoint);
  const lastIndex = points.length - 1;

  const gridMarkup = ticks
    .map(
      (tick) =>
        `<line class="grid-line" x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}"></line>` +
        `<text class="axis-label axis-label--num" x="${margin.left - 8}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end">${czkShort(tick)}</text>`,
    )
    .join('');

  const everyNth = Math.max(1, Math.ceil(points.length / Math.max(3, Math.floor(plotWidth / 70))));
  const xLabels = points
    .map((p, i) =>
      i % everyNth === 0 || i === lastIndex
        ? `<text class="axis-label" x="${x(i).toFixed(1)}" y="${height - 6}" text-anchor="middle">${dayMonth(p.date)}</text>`
        : '',
    )
    .join('');

  const targetMarkup = showTarget
    ? `<line class="target-line" x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}"></line>` +
      `<text class="target-label" x="${(margin.left + plotWidth + 6).toFixed(1)}" y="${(y(target) + 4).toFixed(1)}">cíl</text>`
    : '';

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  const lastValue = points[lastIndex].value;
  const labels = [
    `<circle class="series-dot" cx="${x(lastIndex).toFixed(1)}" cy="${y(lastValue).toFixed(1)}" r="4.5"></circle>`,
    `<text class="endpoint-label" x="${(x(lastIndex) + 9).toFixed(1)}" y="${(y(lastValue) + 4).toFixed(1)}">${czk(lastValue)}</text>`,
  ];
  // U ploché křivky (všechny dny stejná cena) je značka minima jen šum –
  // hodnotu už nese popisek na konci. Navíc by se její text tiskl přes osu.
  if (minIndex !== lastIndex && rawMax > rawMin) {
    // U krajních bodů se text zarovná dovnitř grafu, ať nepřeteče přes osu.
    const anchor = x(minIndex) > margin.left + plotWidth * 0.75
      ? 'end'
      : x(minIndex) < margin.left + plotWidth * 0.1
        ? 'start'
        : 'middle';
    labels.push(
      `<circle class="series-dot series-dot--deal" cx="${x(minIndex).toFixed(1)}" cy="${y(minPoint.value).toFixed(1)}" r="4.5"></circle>`,
      `<text class="axis-label axis-label--num" x="${x(minIndex).toFixed(1)}" y="${(y(minPoint.value) + 18).toFixed(1)}" text-anchor="${anchor}">min ${czkShort(minPoint.value)}</text>`,
    );
  }

  canvas.innerHTML = `
<svg viewBox="0 0 ${width} ${height}" role="img" tabindex="0"
     aria-label="Vývoj nejnižší ceny za posledních ${points.length} dní, od ${czk(points[0].value)} do ${czk(lastValue)}.">
  ${gridMarkup}
  ${targetMarkup}
  ${xLabels}
  <g id="crosshair-group" hidden>
    <line class="crosshair" y1="${margin.top}" y2="${margin.top + plotHeight}" x1="0" x2="0"></line>
    <circle class="series-dot" r="5" cx="0" cy="0"></circle>
  </g>
  <path class="series-line" d="${path}"></path>
  ${labels.join('')}
  <rect class="hit-area" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>
</svg>`;

  el('chart-caption').textContent =
    (showTarget ? `Vodorovná čára je tvoje cílová cena ${czk(target)}. ` : '') +
    'Každý bod je nejnižší nalezená cena daného dne. Filtr přestupů se do grafu nepromítá – historie si pamatuje jen nejnižší cenu na trase.';

  attachChartInteraction(canvas.querySelector('svg'), points, { x, y, margin, plotWidth });
  renderTrendTable(series);
}

function attachChartInteraction(svg, points, geometry) {
  const group = svg.querySelector('#crosshair-group');
  const line = group.querySelector('line');
  const dot = group.querySelector('circle');
  const tooltip = el('tooltip');
  let activeIndex = null;

  const show = (index) => {
    if (index === null || !points[index]) return;
    activeIndex = index;
    const point = points[index];
    const px = geometry.x(index);
    const py = geometry.y(point.value);
    line.setAttribute('x1', px);
    line.setAttribute('x2', px);
    dot.setAttribute('cx', px);
    dot.setAttribute('cy', py);
    group.removeAttribute('hidden');

    tooltip.innerHTML =
      `<strong>${czk(point.value)}</strong><br>` +
      `<span class="tooltip__row">${dayMonthYear(point.date)} · ${point.count} tras s nabídkou</span>`;
    tooltip.hidden = false;

    const rect = svg.getBoundingClientRect();
    const scale = rect.width / svg.viewBox.baseVal.width;
    const anchorX = rect.left + px * scale;
    const anchorY = rect.top + py * scale;
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.min(Math.max(8, anchorX - box.width / 2), window.innerWidth - box.width - 8)}px`;
    // nad bodem, a když by vyjel nad okno, tak pod ním
    const above = anchorY - box.height - 16;
    tooltip.style.top = `${above < 8 ? anchorY + 18 : above}px`;
  };

  const hide = () => {
    activeIndex = null;
    group.setAttribute('hidden', '');
    tooltip.hidden = true;
  };

  const indexFromEvent = (event) => {
    const rect = svg.getBoundingClientRect();
    const scale = svg.viewBox.baseVal.width / rect.width;
    const svgX = (event.clientX - rect.left) * scale;
    const ratio = (svgX - geometry.margin.left) / geometry.plotWidth;
    return Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
  };

  svg.addEventListener('pointermove', (event) => show(indexFromEvent(event)));
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('blur', hide);
  svg.addEventListener('focus', () => show(points.length - 1));
  svg.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const base = activeIndex ?? points.length - 1;
    show(Math.min(points.length - 1, Math.max(0, base + (event.key === 'ArrowRight' ? 1 : -1))));
  });
}

function renderTrendTable(series) {
  const body = el('trend-table').querySelector('tbody');
  body.innerHTML = series
    .slice()
    .reverse()
    .map(
      (point) =>
        `<tr><td>${dayMonthYear(point.date)}</td><td class="num">${point.value === null ? '—' : czk(point.value)}</td><td class="num">${point.count}</td></tr>`,
    )
    .join('');
}

/* ---------- sloupce podle destinace ---------- */

function renderDestinationBars() {
  const container = el('dest-cards');
  const byDestination = new Map();
  for (const offer of currentOffers()) {
    const current = byDestination.get(offer.destination);
    if (!current || offer.priceTotal < current.priceTotal) byDestination.set(offer.destination, offer);
  }
  const rows = [...byDestination.values()].sort((a, b) => a.priceTotal - b.priceTotal);
  if (!rows.length) {
    container.innerHTML = '<p class="empty">Žádná data pro zvolené filtry.</p>';
    return;
  }

  const cheapest = rows[0].priceTotal;
  container.innerHTML = rows.map((offer) => card(offer, cheapest)).join('');

  // Klik na kartu = filtr na tu destinaci. Druhý klik filtr zase sundá.
  for (const node of container.querySelectorAll('.dest-card')) {
    node.addEventListener('click', () => {
      const code = node.dataset.code;
      const chip = document.querySelector(`#filter-destinations [data-value="${code}"]`);
      if (chip) chip.click();
      else {
        state.filters.destinations.has(code)
          ? state.filters.destinations.delete(code)
          : state.filters.destinations.add(code);
        render();
      }
    });
  }
}

function countryOf(code) {
  return state.latest.config.destinations.find((d) => d.code === code)?.country ?? '';
}

function card(offer, cheapest) {
  const accent = accentFor(offer.destination);
  const active = state.filters.destinations.has(offer.destination);
  const diff = offer.priceTotal - cheapest;

  const flags = [];
  if (offer.isDeal) flags.push('<span class="pill pill--deal">💣 cenová bomba</span>');
  if (offer.underTarget) flags.push('<span class="pill pill--target">🎯 pod cílem</span>');
  if (!flags.length && diff === 0) flags.push('<span class="pill pill--best">nejlevnější dnes</span>');

  const transfers = offer.transfers === 0
    ? 'přímý let'
    : `${offer.transfers}× přestup`;

  return `<article class="dest-card${active ? ' is-active' : ''}" data-code="${offer.destination}"
    style="--accent-light:${accent.light};--accent-dark:${accent.dark}"
    tabindex="0" role="button" aria-pressed="${active}"
    aria-label="${cityName(offer.destination)} od ${czk(offer.pricePerPerson)} za osobu, filtrovat">
  <div class="dest-card__media">${destinationArt(offer.destination)}</div>
  <div class="dest-card__body">
    <h3 class="dest-card__title">${cityName(offer.destination)}</h3>
    <p class="dest-card__country">${countryOf(offer.destination)}</p>
    <p class="dest-card__price">${czk(offer.pricePerPerson)}</p>
    <p class="dest-card__meta">z ${cityName(offer.origin)} · ${transfers}</p>
    <div class="dest-card__flags">${flags.join('')}</div>
  </div>
</article>`;
}

/* ---------- tabulka nabídek ---------- */

function renderTable(offers) {
  const body = el('offers-body');
  const shown = offers.slice(0, state.limit);

  el('offers-empty').hidden = offers.length > 0;
  el('offers-more').hidden = offers.length <= state.limit;
  el('offers-more').textContent = `Zobrazit dalších ${Math.min(100, offers.length - state.limit)}`;
  const underTarget = offers.filter((o) => o.underTarget).length;
  el('table-sub').textContent =
    offers.length === 0
      ? 'nic nenalezeno'
      : `${shown.length} z ${offers.length} nabídek` +
        (state.filters.bestPerRoute ? ' · nejvýhodnější termín pro každou trasu, včetně variant' : '') +
        (underTarget ? ` · ${underTarget} pod cílovou cenou ${czk(state.latest.targetPriceTotal)}` : '');

  body.innerHTML = shown
    .map((offer) => {
      const transfers =
        offer.transfers === null || offer.transfers === undefined
          ? '—'
          : offer.transfers === 0
            ? 'přímý'
            : `${offer.transfers}×`;
      // POZOR: duration_to z API je čistý čas ve vzduchu, ne doba cesty.
      // U nabídky PRG→HAN se 3 přestupy hlásí API 17 h 10 min, zatímco reálná
      // cesta trvá 35 h 50 min – zbytek je čekání na přestupech. Popisek to
      // proto musí říct nahlas, jinak si to každý přečte jako celkovou dobu.
      // Hlavní je skutečná doba cesty (let + čekání na přestupech). Čistý letový
      // čas je až záloha pro nabídky, u kterých se rozpad z odkazu nepovedl.
      const travelTime = duration(offer.elapsedTo);
      const flightTime = duration(offer.durationTo);
      const depTime = clockTime(offer.departureAt);
      const retTime = clockTime(offer.returnAt);
      const via = offer.stopsTo?.length > 2 ? offer.stopsTo.slice(1, -1).join(' · ') : null;
      const arrival = offer.arrivesTo ? `${dayMonth(offer.arrivesTo.slice(0, 10))} ${clockTime(offer.arrivesTo)}` : null;
      // Badge nese ikonu i text – význam nikdy nestojí jen na barvě.
      let deal;
      if (offer.dealPct === null || offer.dealPct === undefined) {
        deal = offer.underTarget ? '<span class="badge">🎯 pod cílem</span>' : '<span class="muted">—</span>';
      } else {
        const main = offer.isDeal
          ? `<span class="badge">💣 cenová bomba −${offer.dealPct} %</span>`
          : `<span class="muted">${offer.dealPct > 0 ? '−' : '+'}${Math.abs(offer.dealPct)} %</span>`;
        const low = offer.isAllTimeLow ? '<span class="badge">↓ nové minimum</span>' : '';
        const target = offer.underTarget ? '<span class="badge">🎯 pod cílem</span>' : '';
        deal = low || target ? `<span class="badges">${main}${low}${target}</span>` : main;
      }

      // Štítek říká, proč je varianta v tabulce, i když není nejlevnější.
      const VARIANTS = {
        fewestStops: ['nejmíň přestupů', 'Dráž než nejlevnější varianta na stejné trase a termín, ale s míň přestupy.'],
        fastest: ['nejrychlejší', 'Dráž než nejlevnější varianta na stejné trase a termín, ale cesta je kratší.'],
      };
      const v = VARIANTS[offer.variant];
      const variantTag = v ? `<span class="variant" title="${v[1]}">${v[0]}</span>` : '';

      return `<tr${offer.variant && offer.variant !== 'cheapest' ? ' class="is-variant"' : ''}>
  <td data-col="route" class="route">${cityName(offer.origin)} → ${cityName(offer.destination)}${variantTag}<small>${offer.origin} → ${offer.destination}</small></td>
  <td data-col="dates">${dayMonth(offer.departureDate)}${depTime ? ` <span class="muted">${depTime}</span>` : ''} – ${dayMonth(offer.returnDate)}${retTime ? ` <span class="muted">${retTime}</span>` : ''} ${offer.returnDate.slice(0, 4)}${travelTime
    ? `<small class="muted" title="Celková doba cesty tam: od odletu z Prahy po přistání v cíli, včetně čekání na přestupech. Posun časových pásem je už započtený, takže 73 h je 73 h na hodinkách.${flightTime ? ` Z toho ve vzduchu ${flightTime}.` : ''}${arrival ? ` Přílet ${arrival} místního času.` : ''}${via ? ` Přes ${via}.` : ''}">na cestě ${travelTime}${arrival ? ` · přílet ${arrival}` : ''}${via ? ` · přes ${via}` : ''}</small>`
    : flightTime
      ? `<small class="muted" title="Čistý čas ve vzduchu. Celkovou dobu cesty se u téhle nabídky nepodařilo zjistit, takže čekání na přestupech v čísle není.">ve vzduchu ${flightTime}${(offer.transfers ?? 0) > 1 ? ' + přestupy' : ''}</small>`
      : ''}</td>
  <td data-col="price" class="num price">${czk(offer.pricePerPerson)}</td>
  <td data-col="perPerson" class="num muted">${czk(offer.priceTotal)}</td>
  <td data-col="airline">${offer.source === 'serpapi' ? '<span class="src" title="Živý dotaz do Google Flights přes SerpApi. Travelpayouts pro tuhle trasu nic nemá.">GF</span> ' : ''}${offer.airlineName ?? '—'}</td>
  <td data-col="transfers" class="num">${transfers}</td>
  <td data-col="deal" class="num">${deal}</td>
  <td data-col="link"><a class="book" href="${offer.link}" target="_blank" rel="noopener noreferrer">rezervovat ↗</a></td>
</tr>`;
    })
    .join('');
}

function renderErrors() {
  const errors = state.latest.errors ?? [];
  el('errors-card').hidden = errors.length === 0;
  if (!errors.length) return;
  el('errors-sub').textContent = `${state.latest.stats.errors} chyb při posledním běhu (zobrazeno max. 20)`;
  el('errors-list').innerHTML = errors
    .slice(0, 20)
    .map((error) => `<li>${error.route} ${error.departureDate} / ${error.returnDate}: ${error.message}</li>`)
    .join('');
}

init();
