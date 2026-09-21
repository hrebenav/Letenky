#!/usr/bin/env node
// Vývojová pomůcka: vyrobí historii demo dat za posledních N dní, aby se dal
// vyzkoušet graf trendu a badge „cenová bomba“ ještě před prvním ostrým během.
// S reálnými daty nemá nic společného – ostrý běh si historii buduje sám, den po dni.
//
//   node scripts/seed-demo.mjs 21      # 21 dní zpět
//   node scripts/seed-demo.mjs --clean # smaže demo historii

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createMockProvider } from './lib/mock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HISTORY_DIR = path.join(ROOT, 'data', 'history');

async function clean() {
  let files = [];
  try {
    files = await readdir(HISTORY_DIR);
  } catch {
    return;
  }
  let removed = 0;
  for (const file of files) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
    const parsed = JSON.parse(await readFile(path.join(HISTORY_DIR, file), 'utf8'));
    if (parsed.mode === 'demo') {
      await rm(path.join(HISTORY_DIR, file));
      removed += 1;
    }
  }
  console.log(`smazáno ${removed} demo snapshotů`);
}

async function main() {
  if (process.argv.includes('--clean')) return clean();

  const days = Number(process.argv[2] ?? 21);
  const config = JSON.parse(await readFile(path.join(ROOT, 'config', 'search.json'), 'utf8'));
  await mkdir(HISTORY_DIR, { recursive: true });

  for (let back = days; back >= 1; back -= 1) {
    const date = new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);
    const provider = createMockProvider({ seed: date });
    const offers = [];
    for (const origin of config.origins) {
      for (const destination of config.destinations) {
        for (const departureDate of config.departureDates) {
          for (const returnDate of config.returnDates) {
            const [raw] = await provider.searchDatePair({
              origin: origin.code,
              destination: destination.code,
              departureDate,
              returnDate,
            });
            if (!raw) continue;
            offers.push({
              origin: origin.code,
              destination: destination.code,
              departureDate,
              returnDate,
              priceTotal: raw.price * config.passengers,
              airline: raw.airline,
              transfers: raw.transfers,
            });
          }
        }
      }
    }
    offers.sort((a, b) => a.priceTotal - b.priceTotal);
    await writeFile(
      path.join(HISTORY_DIR, `${date}.json`),
      JSON.stringify(
        { generatedAt: `${date}T04:00:00.000Z`, date, mode: 'demo', currency: config.currency.toUpperCase(), passengers: config.passengers, offers },
      ),
    );
  }
  console.log(`vygenerováno ${days} demo snapshotů v data/history/`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
