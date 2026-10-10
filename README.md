# ✈️ Letenky – denní sledování cen do jihovýchodní Asie

Statická microsite, která si každý den sama stáhne ceny letenek pro pevně dané trasy
a termíny, uloží je do repozitáře jako JSON a zobrazí v tabulce s grafem trendu.
Žádný server, žádná databáze, žádné měsíční platby.

**Co sleduje:**

| | |
|---|---|
| Odlet z | Praha (PRG), Vídeň (VIE), Mnichov (MUC), Bratislava (BTS), Drážďany (DRS) |
| Cíl | Kuala Lumpur (KUL), Manila (MNL), Hanoj (HAN), Ho Či Minovo Město (SGN), Singapur (SIN), Phnom Penh (PNH), Siem Reap (SAI), Cebu (CEB) |
| Odlet | 26.–28. 12. 2026 |
| Návrat | 7.–11. 1. 2027 |
| Cestující | 2 dospělí |
| Měna | CZK |

To je 5 × 8 × 3 × 5 = **600 kombinací denně**. Vše se dá změnit v [`config/search.json`](config/search.json).

---

## 1. Odkud se berou data a proč zrovna odtud

Původní plán počítal s **Amadeus Self-Service API**. To už nejde použít:
Amadeus 17. 7. 2026 svůj self-service portál pro vývojáře úplně vypnul – registrace
jsou zavřené a existující klíče přestaly fungovat. Zbyl jen Amadeus Enterprise,
který vyžaduje IATA akreditaci.

**Kiwi.com Tequila** je od roku 2024 jen pro vybrané B2B partnery na pozvánku,
veřejný self-service přístup neexistuje.

Zůstaly tyhle možnosti:

| Zdroj | Cena | Spolehlivost | Snadnost |
|---|---|---|---|
| **Travelpayouts / Aviasales Data API** ← *použito* | zdarma, bez karty, 300 req/min | cachované ceny z reálných hledání za posledních ~7 dní | registrace + token, hotovo za 10 minut |
| RapidAPI „Sky Scrapper" (wrapper nad Skyscanner) | free tier ~100 req/měsíc (nám by vydržel 2 dny), placené ~10–30 USD/měs | třetí strana, nejasné ToS | jednoduché, ale placené |
| SerpApi (Google Flights) | 100 hledání/měsíc zdarma, pak ~75 USD/měs | nejvyšší (přímo Google Flights) | jednoduché, ale drahé |
| Duffel / přímé NDC | vyžaduje smlouvy s aerolinkami | – | nereálné pro osobní projekt |
| Scraping Kayak / Google Flights | „zdarma" | křehké, **porušuje podmínky použití**, hrozí zablokování IP | nedoporučeno |

**Zvolený zdroj: Travelpayouts Data API.** Jako jediný zvládne 600 dotazů denně
zdarma. Je to affiliate program Aviasales – token dostaneš po běžné registraci.

### Co to znamená v praxi

- Ceny jsou **z cache**, ne z živého vyhledávání. Jsou to reálné ceny, které
  v posledních dnech našli uživatelé Aviasales. Pro sledování trendu („klesá to,
  nebo roste?") to stačí; **před nákupem si cenu vždy ověř kliknutím na odkaz.**
- Pro exotické kombinace (např. Drážďany → Siem Reap) nemusí cache obsahovat nic.
  Skript to zaloguje jako „bez dat" a pokračuje dál; navíc pro takové trasy zkusí
  ještě záložní dotaz v měsíčním rozlišení.
- API vrací **cenu za jednoho cestujícího** za celou zpáteční cestu. Cena za 2 osoby
  na stránce je prostý dvojnásobek – reálná cena za dva se může o pár set korun lišit
  a nezahrnuje zavazadla ani poplatky za platbu.

Zdroje: [Amadeus shutdown (PhocusWire)](https://www.phocuswire.com/amadeus-shut-down-self-service-apis-portal-developers) ·
[Kiwi.com partnerships](https://media.kiwi.com/articles-and-interviews/better-for-business-kiwi-com-takes-a-new-approach-to-partnerships/) ·
[Travelpayouts Data API](https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API)

---

## 2. Co musíš udělat ty (krok za krokem)

### Krok 1 – Travelpayouts účet a token  *(~10 minut, nutné)*

1. Zaregistruj se na <https://www.travelpayouts.com> (zdarma, bez platební karty).
2. Při registraci se ptají na web/projekt, kam budeš odkazy dávat – vyplň adresu
   téhle microsite, tedy `https://hrebenav.github.io/Letenky/`.
3. Po přihlášení najdi v profilu sekci **API token** (v nastavení účtu / v sekci
   pro vývojáře) a token si zkopíruj.
4. Volitelně si poznamenej i svůj **marker** (affiliate ID) – propíše se do odkazů
   na Aviasales. Bez něj to funguje úplně stejně.

### Krok 2 – Vložit token do GitHubu  *(~2 minuty, nutné)*

V repozitáři: **Settings → Secrets and variables → Actions → New repository secret**

| Název | Hodnota |
|---|---|
| `TRAVELPAYOUTS_TOKEN` | token z kroku 1 |
| `TRAVELPAYOUTS_MARKER` | marker z kroku 1 *(volitelné)* |

### Krok 3 – Zapnout GitHub Pages  *(~1 minuta)*

**Settings → Pages → Source: „Deploy from a branch" → Branch: `main`, složka `/ (root)` → Save.**

Za minutu bude stránka na `https://hrebenav.github.io/Letenky/`. Každý denní commit
s novými daty ji automaticky aktualizuje.

Pak ještě v **Settings → Secrets and variables → Actions → Variables** přidej
`SITE_URL` = `https://hrebenav.github.io/Letenky/` – tahle adresa se pak objeví
jako tlačítko v e-mailu s upozorněním.

### Krok 4 – První ostrý běh  *(~2 minuty)*

1. Záložka **Actions → Denní stahování cen letenek → Run workflow**.
2. Nejdřív zvol režim **`sample`** – projede jen 2 trasy a hned uvidíš v logu,
   jestli token funguje.
3. Když log skončí `✔ hotovo`, spusť to znovu s režimem **`live`** (plný běh, ~2–5 minut).
4. Od té chvíle to jede samo každý den v 6:10 ráno.

> **Pozor:** naplánované workflow (`schedule`) běží v GitHub Actions jen z výchozí
> větve repozitáře. Soubory proto musí zůstat na `main`.

### Krok 5 – E-mailová upozornění  *(volitelné, ale doporučené)*

Mail chodí ze dvou důvodů:

1. **💣 cenová bomba** – cena aspoň **15 % pod dosavadním minimem** dané trasy.
   Potřebuje aspoň pár dní historie, takže první dny se neozve.
2. **🎯 cílová cena** – jakákoli nabídka pod částkou, kterou si nastavíš v
   `config/search.json` → `alerts.targetPriceTotal` (cena **za celou partu**, v CZK).
   **Funguje od prvního běhu, historii nepotřebuje** – pokud startuješ pozdě a nemáš
   čas čekat na trend, je tohle to důležitější ze dvou upozornění.

Dej tam číslo, za které bys to reálně koupila, ne vysněné – při příliš štědrém cíli
ti první den přijde mail s deseti nabídkami. Stejný nález se neopakuje dřív než
za týden (nebo dokud nezlevní o další 3 %).

**Varianta A – Resend (doporučeno, nic se neinstaluje):**

1. Registrace na <https://resend.com> (free tier 3 000 e-mailů měsíčně).
2. Vygeneruj API klíč.
3. Přidej do secrets:

   | Název | Hodnota |
   |---|---|
   | `RESEND_API_KEY` | klíč z Resendu |
   | `ALERT_EMAIL_TO` | tvoje adresa |
   | `ALERT_EMAIL_FROM` | *(volitelné)* výchozí je `Letenky <onboarding@resend.dev>` |

   Bez ověřené vlastní domény umí Resend posílat z `onboarding@resend.dev` na adresu,
   kterou jsi použila při registraci. Pokud chceš posílat jinam, ověř si v Resendu doménu.

**Varianta B – vlastní SMTP (Gmail app password, Seznam apod.):**

| Název | Hodnota |
|---|---|
| `SMTP_HOST` | např. `smtp.gmail.com` |
| `SMTP_PORT` | `587` (nebo `465`) |
| `SMTP_USER` | e-mail |
| `SMTP_PASS` | heslo aplikace (ne běžné heslo k účtu!) |
| `ALERT_EMAIL_TO` | adresa příjemce |

Workflow si `nodemailer` doinstaluje sám, jakmile uvidí vyplněný `SMTP_HOST`.

Když nenastavíš nic, skript upozornění jen vypíše do logu běhu a nic neposílá.

---

## 3. Spuštění lokálně

```sh
git clone https://github.com/hrebenav/Letenky.git
cd Letenky

# Stránka s demo daty, která jsou v repu (bez API, bez tokenu)
npm run serve            # otevři http://localhost:3000

# Vlastní běh proti API
export TRAVELPAYOUTS_TOKEN=...
npm run fetch:sample     # 2 trasy, rychlá kontrola tokenu
npm run fetch            # plný běh, ~600 dotazů

# Bez tokenu – vygeneruje smyšlená data, ať je vidět, jak stránka vypadá
npm run fetch:mock
npm run seed:demo        # doplní 27 dní historie (kvůli grafu)
npm run seed:clean       # demo historii zase smaže

npm run notify:dry       # ukáže, co by e-mail obsahoval, a nic nepošle
```

> Stránku je potřeba otevírat přes server (`npm run serve`), ne dvojklikem na
> `index.html` – prohlížeč by kvůli CORS nenačetl JSON soubory.

Demo data poznáš na stránce podle modrého pruhu „Ukázková data" nahoře. **Ostrý běh
ukázkové snapshoty v historii sám ignoruje**, takže se ti do trendu ani do e-mailů
nepropíšou. Jakmile se nabaží reálná historie, můžeš je uklidit: `npm run seed:clean`.

---

## 4. Struktura

```
index.html                    stránka
assets/style.css              styly (světlý i tmavý režim)
assets/app.js                 filtry, tabulka, graf (čisté SVG, bez knihoven)
config/search.json            ► JEDINÉ místo, kde se mění trasy a termíny
scripts/fetch-prices.mjs      denní stahování
scripts/notify.mjs            e-mail při cenové bombě
scripts/seed-demo.mjs         generátor ukázkových dat
scripts/lib/travelpayouts.mjs klient API (retry, timeouty, odkazy na booking)
scripts/lib/history.mjs       baseline, trend, vyhodnocení slev
scripts/lib/mock.mjs          demo generátor
scripts/lib/airlines.mjs      IATA kódy aerolinek → názvy
data/latest.json              poslední běh (tohle čte stránka)
data/summary.json             časová řada pro graf
data/history/YYYY-MM-DD.json  denní snapshoty (zdroj historie)
data/alerts.json              co už bylo odesláno e-mailem
.github/workflows/            denní cron
```

### Jak změnit parametry hledání

Vše v [`config/search.json`](config/search.json) – přidání destinace je jeden řádek:

```json
{ "code": "BKK", "name": "Bangkok", "country": "Thajsko" }
```

Po commitu se změna projeví při dalším běhu. Pozor na počet kombinací:
`odletová letiště × cílová letiště × dny odletu × dny návratu`. Při ~1 500 kombinacích
se běh protáhne na zhruba 10 minut, což je pořád v pohodě.

---

## 5. Jak se pozná dobrá cena

Skript si pro každou trasu drží **historii denních minim**. Z ní počítá průměr a minimum
(minimálně po 3 dnech historie – dřív se nic nevyhodnocuje):

| Označení | Co znamená | Potřebuje historii? |
|---|---|---|
| **💣 cenová bomba** | 15 % a víc pod historickým **průměrem** trasy | ano, ≥ 3 dny |
| **↓ nové minimum** | levnější než cokoli, co na téhle trase dosud bylo vidět | ano, ≥ 3 dny |
| **🎯 pod cílem** | pod `alerts.targetPriceTotal` (cena za celou partu) | **ne** |

E-mail chodí při **💣** (tam je podmínka přísnější – 15 % pod dosavadním *minimem*, ne
průměrem, aby nechodila pošta kvůli běžnému kolísání) a při **🎯**.
Cílová cena se navíc kreslí do grafu jako vodorovná čára.

Obojí se nastavuje v `config/search.json` → `alerts.thresholdPct` a `alerts.targetPriceTotal`.

---

## 6. Odolnost proti chybám

- Selhání jedné kombinace neshodí celý běh – zaloguje se a pokračuje se dál.
  Přehled chyb je i dole na stránce.
- Na HTTP 429 a 5xx se dotaz opakuje třikrát s prodlužující se pauzou.
- Běh je idempotentní: dnešní snapshot se přepíše, historie zůstane.
- Souběžné běhy workflow jsou zakázané (`concurrency`), push se opakuje až třikrát.
- Když notifikace selže, workflow tím nespadne – data jsou už uložená.

## 7. Náklady

Nula. Travelpayouts Data API je zdarma, GitHub Actions i Pages jsou pro veřejné
repozitáře zdarma. Denní běh spotřebuje pár minut výpočetního času a přidá do repa
~100 kB dat denně.
