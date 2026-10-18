#!/usr/bin/env node
// Pošle e-mail, když se objeví „cenová bomba“ – cena aspoň o X % pod dosavadním
// historickým minimem dané trasy. Stav odeslaných upozornění se drží v data/alerts.json,
// aby ti stejný nález nechodil každý den znovu.
//
// Podporované kanály (stačí jeden, skript si vybere podle vyplněných proměnných):
//   1) Resend  – RESEND_API_KEY, ALERT_EMAIL_TO, (volitelně ALERT_EMAIL_FROM)
//   2) SMTP    – SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO (+ balík nodemailer)
//
// Když není nastaveno nic, skript jen vypíše, co by poslal, a skončí úspěchem.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Každý profil hlídá jiné termíny, takže potřebuje i vlastní stav odeslaných
// upozornění – jinak by nález v jednom profilu umlčel stejnou trasu v druhém.
const PROFILE = (() => {
  const i = process.argv.indexOf('--profile');
  return i !== -1 ? process.argv[i + 1] : null;
})();
const DATA_DIR = PROFILE ? path.join(ROOT, 'data', PROFILE) : path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'alerts.json');

const DRY_RUN = process.argv.includes('--dry-run');
const RE_ALERT_AFTER_DAYS = 7; // po týdnu připomeneme i dřív poslaný nález
const RE_ALERT_IF_CHEAPER_PCT = 3; // nebo když je nález o 3 % levnější než minule

const czk = (n) => new Intl.NumberFormat('cs-CZ').format(n) + ' Kč';
const czDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('cs-CZ', { timeZone: 'UTC' });

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function pickAlerts(latest, state) {
  const threshold = latest.thresholdPct ?? 15;
  const target = latest.targetPriceTotal ?? null;
  const now = Date.now();
  const alerts = [];

  for (const offer of latest.offers ?? []) {
    const baseline = latest.baselines?.[`${offer.origin}-${offer.destination}`];
    const isBomb =
      baseline && offer.vsMinPct !== null && offer.vsMinPct !== undefined && offer.vsMinPct >= threshold;
    // Cílová cena nepotřebuje historii – platí od prvního běhu.
    const isTarget = target !== null && offer.priceTotal <= target;
    if (!isBomb && !isTarget) continue;

    const key = `${offer.origin}-${offer.destination}|${offer.departureDate}|${offer.returnDate}`;
    const previous = state.sent?.[key];
    if (previous) {
      const ageDays = (now - new Date(previous.at).getTime()) / 86400000;
      const cheaperBy = ((previous.priceTotal - offer.priceTotal) / previous.priceTotal) * 100;
      if (ageDays < RE_ALERT_AFTER_DAYS && cheaperBy < RE_ALERT_IF_CHEAPER_PCT) continue;
    }
    alerts.push({ key, offer, baseline: isBomb ? baseline : null, isBomb, isTarget });
  }

  // Napřed cenové bomby podle velikosti slevy, pak nálezy pod cílovou cenou od nejlevnějšího.
  return alerts.sort((a, b) => {
    if (a.isBomb !== b.isBomb) return a.isBomb ? -1 : 1;
    if (a.isBomb) return b.offer.vsMinPct - a.offer.vsMinPct;
    return a.offer.priceTotal - b.offer.priceTotal;
  });
}

function renderEmail(alerts, latest, siteUrl) {
  const names = new Map([
    ...(latest.config?.origins ?? []).map((o) => [o.code, o.name]),
    ...(latest.config?.destinations ?? []).map((d) => [d.code, d.name]),
  ]);
  const cityName = (code) => names.get(code) ?? code;

  const bombs = alerts.filter((a) => a.isBomb).length;
  const targets = alerts.length - bombs;

  const rows = alerts
    .map(({ offer, baseline, isBomb }) => {
      const link = siteUrl ? `<a href="${offer.link}">rezervovat</a>` : offer.link;
      const why = isBomb
        ? `<span style="color:#047857;font-weight:600">💣 −${offer.vsMinPct} %</span><br><span style="color:#6b7280;font-size:13px">vs. min. ${czk(baseline.min)}</span>`
        : `<span style="color:#047857;font-weight:600">🎯 pod cílem</span><br><span style="color:#6b7280;font-size:13px">cíl ${czk(latest.targetPriceTotal)}</span>`;
      return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>${cityName(offer.origin)} → ${cityName(offer.destination)}</strong><br><span style="color:#6b7280;font-size:13px">${czDate(offer.departureDate)} – ${czDate(offer.returnDate)} · ${offer.airlineName} · ${offer.transfers ?? '?'}× přestup</span></td>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap"><strong style="font-size:16px">${czk(offer.priceTotal)}</strong><br><span style="color:#6b7280;font-size:13px">za ${latest.passengers} osoby</span></td>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">${why}</td>
  <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${link}</td>
</tr>`;
    })
    .join('\n');

  const html = `<!doctype html><html lang="cs"><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f9fafb;padding:24px;margin:0">
<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
<h1 style="margin:0 0 4px;font-size:20px">✈️ ${bombs ? 'Cenová bomba na letenky' : 'Letenky pod tvou cílovou cenou'}</h1>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px">${[bombs && `${bombs}× aspoň ${latest.thresholdPct} % pod dosavadním minimem`, targets && `${targets}× pod cílem ${czk(latest.targetPriceTotal)}`].filter(Boolean).join(' · ')} · data z ${new Date(latest.generatedAt).toLocaleString('cs-CZ')}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
${siteUrl ? `<p style="margin:20px 0 0"><a href="${siteUrl}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">Otevřít přehled</a></p>` : ''}
<p style="margin:20px 0 0;color:#9ca3af;font-size:12px">Ceny jsou z cache Aviasales a nemusí být aktuální – před nákupem si je ověř kliknutím na odkaz.</p>
</div></body></html>`;

  const text = alerts
    .map(({ offer, baseline, isBomb }) => {
      const why = isBomb
        ? `−${offer.vsMinPct} % vs. minimum ${czk(baseline.min)}`
        : `pod cílovou cenou ${czk(latest.targetPriceTotal)}`;
      return `${cityName(offer.origin)} → ${cityName(offer.destination)} ${czDate(offer.departureDate)}–${czDate(offer.returnDate)}: ${czk(offer.priceTotal)} za ${latest.passengers} osoby (${why})\n${offer.link}`;
    })
    .join('\n\n');

  const first = alerts[0];
  const mark = first.isBomb ? `−${first.offer.vsMinPct} %` : 'pod cílem';
  const subject = `${first.isBomb ? '💣' : '🎯'} ${czk(first.offer.priceTotal)} ${cityName(first.offer.origin)} → ${cityName(first.offer.destination)} (${mark})${alerts.length > 1 ? ` a ${alerts.length - 1} další` : ''}`;
  return { subject, html, text };
}

async function sendViaResend({ subject, html, text }, to) {
  const from = process.env.ALERT_EMAIL_FROM || 'Letenky <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: to.split(',').map((s) => s.trim()), subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return 'resend';
}

async function sendViaSmtp({ subject, html, text }, to) {
  let nodemailer;
  try {
    nodemailer = (await import('nodemailer')).default;
  } catch {
    throw new Error('SMTP je nastavené, ale chybí balík nodemailer (npm install nodemailer).');
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
  });
  return 'smtp';
}

async function main() {
  const latest = await readJson(path.join(DATA_DIR, 'latest.json'), null);
  if (!latest) {
    console.log('notify: data/latest.json neexistuje – nic k odeslání.');
    return;
  }
  if (latest.mode === 'demo') {
    console.log('notify: běh byl v DEMO režimu, notifikace se neposílají.');
    return;
  }

  const state = await readJson(STATE_FILE, { sent: {} });
  state.sent ??= {};

  const config = await readJson(path.join(ROOT, 'config', 'search.json'), {});
  const maxPerRun = config?.alerts?.maxEmailsPerRun ?? 10;
  const alerts = pickAlerts(latest, state).slice(0, maxPerRun);
  if (!alerts.length) {
    console.log('notify: žádný nový nález k odeslání.');
    return;
  }
  console.log(
    `notify: ${alerts.length} nových nálezů (${alerts.filter((a) => a.isBomb).length}× cenová bomba, ` +
      `${alerts.filter((a) => !a.isBomb).length}× pod cílovou cenou).`,
  );

  const to = process.env.ALERT_EMAIL_TO;
  const message = renderEmail(alerts, latest, process.env.SITE_URL || '');

  if (DRY_RUN || !to || (!process.env.RESEND_API_KEY && !process.env.SMTP_HOST)) {
    console.log('notify: e-mail není nakonfigurovaný (nebo --dry-run), jen vypisuji obsah:\n');
    console.log(message.subject);
    console.log(message.text);
    return;
  }

  const channel = process.env.RESEND_API_KEY
    ? await sendViaResend(message, to)
    : await sendViaSmtp(message, to);
  console.log(`notify: odesláno přes ${channel} na ${to}`);

  const at = new Date().toISOString();
  for (const { key, offer } of alerts) {
    state.sent[key] = { at, priceTotal: offer.priceTotal, vsMinPct: offer.vsMinPct };
  }
  // Úklid: držíme jen záznamy z posledních 90 dnů.
  const cutoff = Date.now() - 90 * 86400000;
  for (const [key, entry] of Object.entries(state.sent)) {
    if (new Date(entry.at).getTime() < cutoff) delete state.sent[key];
  }
  await writeFile(STATE_FILE, JSON.stringify(state, null, 1));
}

main().catch((error) => {
  // Selhání notifikace nesmí shodit celý workflow – data už jsou uložená.
  console.error('notify: chyba při odesílání –', error.message);
});
