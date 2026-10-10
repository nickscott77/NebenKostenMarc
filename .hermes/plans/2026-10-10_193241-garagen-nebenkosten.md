# Plan: Lokale Garagen-Nebenkosten-Webseite (NebenKostenMarc)

- Datum: 2026-10-10
- Repo: `nickscott77/NebenKostenMarc` (privat), lokal `/opt/data/artifacts/nebenkosten`, Branch `main`
- Modus: nur dieser Plan. Kein Code, kein Commit, kein Push in dieser Runde.

## 1. Goal

Eine einzige, ohne Build/Server in jedem Standard-Browser lauffähige lokale Webseite, die 14 Garagen + Waschhaus, Mieter (auch mehrere Garagen pro Mieter), unterjährige Mieterwechsel mit Stichtags-Abrechnung sowie die jährlichen Kosten verwaltet und pro Mieter eine Abrechnung erzeugt; alle Daten liegen in einer JSON-Struktur mit Im-/Export.

## 2. Current context / Annahmen

- Repo-Stand: nur `IDEA.md` (1 Satz), `README.md`, `.gitignore` (`*.xlsx`, `.env`). Commit `b2bfcaf` ist auf `origin/main` gepusht.
- Fachlogik aus `Garagen - Kopie.xlsx` (Analyse vom 10.10.2026, Datei liegt NICHT im Repo, Datenschutz):
  - Zeitraum 2025: Zentral 1.008,64 kWh, Garagen 612,99 kWh, Betriebsverbrauch 395,65 kWh.
  - Preis: 0,33 €/kWh, Grundgebühr aktuell 0. Formel je Garage: `Grundgebühr-Anteil/15 + kWh × Preis`.
  - Betriebskosten 2025: 100 € (Überwachung), Umlage `Kosten/14 × Faktor` (Garage 5 = 3, Garage 6/7 = 0, sonst 1).
  - Rechnung heute: nur eigener Strom + Betriebskosten; Betriebsverbrauch (Anteil Anlage) wird NICHT umgelegt (offene Fachfrage, siehe §6).
  - Auffälligkeit: Garage 14 = 384,22 kWh (63 % des Garagenverbrauchs) — Seed-Daten übernehmen, aber als Beispiel kennzeichnen.
- Annahmen (im Plan als änderbar markiert):
  - A1: 14 Garagen + Waschhaus sind Stammdaten, vom Nutzer editierbar (kein hartcodiertes Limit).
  - A2: Abrechnung in ganzen Tagen, inklusiv (`Tage = Ende - Anfang + 1`). XLSX nutzte exklusiv (364 statt 365) — bewusst geändert, im UI dokumentiert.
  - A3: Zählerstände sind pro Messpunkt (Zentral + je Garage) mit Datum; Verbrauch = Differenz aufeinanderfolgender Ablesungen.
  - A4: Betriebskosten pro Kalenderjahr mit Datum, Betrag, Schlüssel (`fix-pro-garage`, `pro-kwh`, `nach-faktor`, `anlage-anteil`) — um die offene Anlagen-Umlage abzubilden.
  - A5: Keine echten Mieterdaten als Seed — synthetische Demo-Daten (`Demo Mieter A/B`), echte XLSX-Daten werden NUR per manuellem Import durch Tino eingepflegt.
  - A6: Deutsch als einzige UI-Sprache. Zahlenformat `de-DE`, Währung Euro.
- Werkzeuge verfügbar: `node v26`, `python3`, Browser nicht automatisierbar — Tests laufen in Node + statische Checks + manuelle Browser-Abnahme.

## 3. Architecture (3 Sätze)

Multi-File ohne Build: `index.html` + `css/style.css` + `js/store.js` (JSON-State, localStorage, Im-/Export) + `js/billing.js` (reine, DOM-freie Abrechnungsfunktionen) + `js/app.js` (UI) + `data/seed-2025.json` (synthetische Demo-Daten) + `tests/run-tests.mjs` (Node-Testrunner mit eingebetteten Fixtures, kein Framework). `billing.js` ist bewusst framework- und DOM-frei, damit dieselbe Datei per `<script>` im Browser und per `import` in Node unter Test läuft. Persistenz zweistufig: automatisches `localStorage`-Snapshot bei jeder Änderung plus expliziter JSON-Datei-Export/Import (Versionierte Struktur mit `schemaVersion: 1`), damit die Seite per Doppelklick (`file://`) UND per `python3 -m http.server` läuft (kein `fetch` beim Start — Seed wird per `<script>`-Einbettung oder Datei-Import geladen, nie per XHR-Pflicht).

## 4. 3 Designvorschläge (Startpunkt, ein Vorschlag wird in Task 1 gewählt)

Gemeinsame Regeln für alle: System-Fonts, max. 900 px Inhaltsbreite, eine Akzentfarbe, keine Icons nötig, alles mit Tastatur bedienbar, Druck per `@media print` (nur Abrechnungsbereich sichtbar). Alle drei sind als klickbarer statischer Mock스크린 beschrieben — der Implementierer baut in Task 2 ZUERST alle drei als `design/a.html`, `design/b.html`, `design/c.html` (reines HTML/CSS, kein JS, synthetische Daten), Tino klickt sich durch und wählt.

### Vorschlag A — „Dashboard" (eine Seite, alles im Blick)

- Layout: Kopf (Jahr-Selektor + Mieter-Selektor + Button „Abrechnung drucken"), darunter 3 Karten (Zentral-Verbrauch, Garagen-Summe, offene Kosten), darunter Tabelle aller Garagen (Garage | Mieter | Zähler alt→neu | kWh | €), darunter Kostenliste des Jahres.
- Stärke: wenig Klicks, ideal für die jährliche Routine (ablesen → prüfen → drucken).
- Schwäche: Mieterwechsel-UI (Stichtag) hat wenig Platz; wird als Dialog gelöst.
- Passt wenn: Tino macht 1× pro Jahr alles in einem Rutsch.

### Vorschlag B — „Reiter-App" (empfohlen)

- Layout: 5 Reiter: `Garagen` | `Mieter` | `Zähler` | `Kosten` | `Abrechnung`. Jeder Reiter genau EINE Tabelle + EIN Formular darunter. Reiter `Abrechnung`: oben Mieter + Zeitraum (von/bis, Default = Kalenderjahr), Button „Berechnen", darunter Ergebnis-Tabelle (Positionen wie heutige XLSX-Rechnung: Garagenstrom, Anlage-Anteil, Betriebskosten, Summe) + Druck-Button.
- Stärke: Mieterwechsel (Belegung mit von/bis pro Garage) und Stichtags-Abrechnung sind erstklassige Screens, kein Dialog-Gefummel.
- Schwäche: ein Klick mehr als A.
- Passt wenn: unterjährige Wechsel sind der eigentliche Schmerz (laut Auftrag: ja). **Empfehlung: B.**

### Vorschlag C — „Rechnung zuerst" (minimal, druckorientiert)

- Layout: fast nur die Rechnung wie auf Papier (Kopf mit Vermieter, Adressblock, Zeitraum, Positions-Tabelle, Fuß mit Bankdaten/Kleinunternehmer-Hinweis) + ein schmaler Einstellungs-Aufklappbereich (Stammdaten als `<details>`-Elemente).
- Stärke: minimalstes UI, Ausdruck ist das Produkt, fast kein Lernaufwand.
- Schwäche: Zählererfassung in Aufklapp-Formularen ist bei 15 Messpunkten mühsam; keine Übersicht.
- Passt wenn: Tino will nur Belege erzeugen und verwaltet Stände weiter in XLSX (Fallback-Szenario).

## 5. Datenmodell (JSON, `schemaVersion: 1`)

Vollständiges Beispiel (`data/seed-2025.json`, synthetisch). Dateiname und Pfade exakt so anlegen:

```json
{
  "schemaVersion": 1,
  "garages": [
    { "id": "g1", "label": "Garage 1", "meterId": "m-g1", "factor": 1 },
    { "id": "wash", "label": "Waschhaus", "meterId": "m-wash", "factor": 0, "shared": true }
  ],
  "tenants": [
    { "id": "t-demo-a", "firstName": "Demo", "lastName": "Mieter A", "street": "Musterstr.", "houseNo": "1", "zip": "02763", "city": "Zittau" }
  ],
  "occupancy": [
    { "garageId": "g1", "tenantId": "t-demo-a", "from": "2025-01-01", "to": null }
  ],
  "readings": [
    { "meterId": "central", "date": "2025-01-01", "value": 0 },
    { "meterId": "central", "date": "2025-12-31", "value": 1008.64 },
    { "meterId": "m-g1", "date": "2025-01-01", "value": 0 },
    { "meterId": "m-g1", "date": "2025-12-31", "value": 7.84 }
  ],
  "years": [
    {
      "year": 2025,
      "kwhPrice": 0.33,
      "baseFeeTotal": 0,
      "costs": [
        { "date": "2025-04-17", "label": "Überwachung", "amount": 100.0, "key": "nach-faktor" }
      ]
    }
  ],
  "landlord": {
    "name": "Garagenvermietung Hartmann",
    "contact": "Marc Hartmann · Graf-Yorck-Str. 6 · 02763 Zittau",
    "taxNote": "Kleinunternehmen – keine Umsatzsteuer.",
    "bank": { "holder": "Tino Zwahr", "iban": "DE00 0000 0000 0000 0000 00", "bic": "XXXXXXXX", "bankName": "DKB" }
  }
}
```

Regeln: `occupancy.to: null` = laufend. Pro Garage dürfen sich Zeiträume NICHT überlappen (Validierung). `factor` wie XLSX (0 = keine Betriebskosten-Umlage). Bankdaten im Seed bewusst ungültig — echte erst durch Tino.

## 6. Abrechnungslogik (verbindlich, exakt so implementieren)

Funktionssignaturen in `js/billing.js` (DOM-frei, ES-Modul + Browser-Global via Wrapper, siehe Task 6):

```js
// Tage inklusiv: daysInclusive('2025-01-01','2025-12-31') === 365
export function daysInclusive(fromISO, toISO) { /* ... */ }
// Verbrauch eines Zählers im Zeitraum: letzte Ablesung ≤ Ende minus letzte Ablesung < Anfang.
// Fehlt eine Ablesung exakt an den Grenzen, wird zeitanteilig NICHT interpoliert, sondern
// die nächstliegende Ablesung davor/danach genommen und die Annahme im Ergebnis als `hint` vermerkt.
export function meterUsage(readings, meterId, fromISO, toISO) { /* {kwh, fromReading, toReading, hint} */ }
// Vollabrechnung eines Mieters über alle seine Belegungen im Zeitraum.
export function billTenant(state, tenantId, fromISO, toISO) {
  // Rückgabe: { tenant, period: {from,to,days}, lines: [{label, garage?, kwh?, amount}...], total, hints: [...] }
  // Zeilen-Typen: 'strom' (kwh × kwhPrice), 'grundgebuehr' (baseFeeTotal/15 × Tage/365, nur wenn > 0),
  // 'betriebskosten' (je Kostenposten: amount/14 × factor × Tage-im-Jahr/365 bei Wechsel),
  // 'anlage' (Betriebsverbrauch-Anteil: nur wenn yearConfig.allocateShared === true, Default false → 0 + hint).
}
```

Verteilschlüssel Betriebskosten bei Mieterwechsel: zeitanteilig nach Tagen (`Betrag/14 × Faktor × eigeneTage/365`), Strom nach Zählerdifferenz der belegten Tage (Ablesung zum Stichtag erforderlich — fehlt sie, `hint: "Stichtagsablesung fehlt, Zeitraum-Anteil geschätzt"` und Schätzung = Jahresverbrauch × Tage/365, als Schätzung gekennzeichnet). Rundung: erst am Ende je Zeile auf Cent (`Math.round(x*100)/100`), Summe aus gerundeten Zeilen.

## 7. Step-by-step Tasks (Reihenfolge verbindlich, je 2–5 min)

Jeder Task = TDD: 1) Test schreiben, 2) `node tests/run-tests.mjs` → ROT sehen, 3) minimal implementieren, 4) GRÜN sehen, 5) committen (lokal, KEIN Push ohne Freigabe). Nach jedem Task: `node --check <datei>` für Syntax.

- **Task 0 — Gerüst.** Dateien: `.hermes/plans/` (existiert), `index.html`, `css/style.css`, `js/app.js`, `js/store.js`, `js/billing.js`, `tests/run-tests.mjs`, `data/seed-2025.json`, `design/`. Minimaler Hello-World-Stand: `index.html` lädt CSS+`app.js`, zeigt „NebenKostenMarc lädt …", `node tests/run-tests.mjs` gibt `0 tests, 0 failed` aus. Verify: `python3 -m http.server 8000 & sleep 1; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/index.html` → `200`; danach Server stoppen (`fg` + `Ctrl-C` bzw. `kill %1`). Commit: `chore: gerüst`.
- **Task 1 — Designentscheidung vorbereiten.** Drei statische Mocks `design/a.html`, `design/b.html`, `design/c.html` nach §4 (reines HTML/CSS, kopierte Tabellen mit Demo-Zahlen aus §2, kein JS). Verify: alle drei per `curl` 200 + Screenshot-/Klick-Abnahme durch Tino. Commit: `docs: 3 designvorschläge`. STOPP: ohne Tinos Wahl nicht mit Task 3+ fortfahren (nur Task 2 parallel möglich).
- **Task 2 — Seed + Store (Daten).** `data/seed-2025.json` exakt nach §5 (alle 14 Garagen + Waschhaus, Demo-Mieter, Demo-Ablesungen angelehnt an 2025-Zahlen). `js/store.js`: `loadState(json)`, `saveState()` (localStorage Key `nkm-v1`), `exportFile()` (Download `nebenkosten-2025.json`), `importFile(file)` (parsen + `schemaVersion`-Check + Überlappungs-Validierung), `validate(state)` → Array von Fehlerstrings (leeres Array = ok). Tests in `tests/run-tests.mjs`: Seed lädt, Überlappung wird erkannt, falsche `schemaVersion` wird abgelehnt, Export-JSON round-trippt. Verify: `node tests/run-tests.mjs` → z. B. `12 tests, 0 failed`. Commit: `feat: store + seed`.
- **Task 3 — Billing Kern (reine Logik).** `js/billing.js` mit `daysInclusive`, `meterUsage`, `billTenant` nach §6. Fixture im Test: Demo-Mieter ganzjährig Garage 1 (7,84 kWh × 0,33 = 2,59 € + 7,14 € Betriebskosten = 9,73 € — Zahlen aus Test-Console ablesen und als Erwartung festschreiben). Wechsel-Fixture: Mieter A 01.01.–30.06., Mieter B ab 01.07. (Stichtagsablesung vorhanden) → Summe beider = Ganzjahres-Betrag ± 1 Cent. Verify: `node tests/run-tests.mjs` GRÜN. Commit: `feat: abrechnungslogik`.
- **Task 4 — UI Gerüst (gewähltes Design).** Nur das von Tino gewählte Design aus Task 1 als `index.html` ausbauen (die anderen beiden bleiben als `design/`-Referenz). Statische Struktur + Navigation/Reiter, noch ohne Logik-Verdrahtung, Seed fest eingebettet. Verify: `curl` 200 + manuelle Browser-Abnahme (alle Reiter klickbar). Commit: `feat: ui-grundgerüst (<a|b|c>)`.
- **Task 5 — CRUD verdrahten.** `js/app.js`: Garagen-, Mieter-, Belegungs-, Zähler-, Kosten-Tabellen rendern + Formulare (anlegen/editieren/löschen mit `confirm()`), jede Änderung → `store.saveState()` + Re-Render. Validierungsfehler aus `store.validate()` als rote Box. Verify: manuelles Klick-Protokoll (anlegen → Reload → noch da). Commit: `feat: crud`.
- **Task 6 — Abrechnungs-Screen.** Zeitraum-Selektor + Mieter-Selektor + `billTenant()`-Aufruf + Ergebnis-Tabelle (Positionen wie XLSX: Strom, Grundgebühr, Anlage, Betriebskosten, Summe) + `hints` als gelbe Box + Druck-Button (`@media print`). Browser-Kompatibilität: `billing.js` als ES-Modul UND als klassisches Script ladbar — dazu am Dateiende dieser exakte Wrapper (kein Bundler):
  ```html
  <script src="js/billing.js"></script>
  ```
  ```js
  // am Ende von js/billing.js (nach den export-functions zusätzlich):
  if (typeof window !== "undefined") { window.NKM = { daysInclusive, meterUsage, billTenant }; }
  ```
  Verify: `node tests/run-tests.mjs` GRÜN + Ausdruck aus Chrome/Firefox/Edge als PDF ok. Commit: `feat: abrechnung`.
- **Task 7 — Im-/Export + `file://`-Nachweis.** Buttons „Exportieren"/„Importieren" + `data/seed-2025.json`-Neustart („Demo-Daten laden"). Verify: Seite per Doppelklick aus dem Dateimanager öffnen (kein Server) → alle Funktionen nutzbar; zusätzlich `python3 -m http.server`-Check per `curl`. Commit: `feat: im-export`.
- **Task 8 — Härtung + README.** Edge-Cases: keine Ablesung vorhanden (hint statt Crash), Mieter ohne Belegung (leere Rechnung 0,00 €), Jahr ohne Kosten, Löschen belegter Garage blockiert. `README.md` ergänzen: Start (Doppelklick vs. Server-Einzeiler `python3 -m http.server 8000`), Datenablage (localStorage + JSON-Export), Datenschutz-Hinweis (keine echten Daten committen). Verify: komplette Suite GRÜN + `git status --short` zeigt nur gewollte Dateien (kein `.env`, kein `*.xlsx`). Commit: `docs: readme + härtung`. Danach: Push NUR nach Tino-Freigabe (§6).

Testrunner-Vorlage (`tests/run-tests.mjs`, in Task 0 exakt so anlegen — kein Framework nötig):

```js
import { daysInclusive } from "../js/billing.js";
let passed = 0, failed = 0;
export function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error("FAIL:", name, "-", e.message); }
}
export function eq(a, b, msg = "") {
  if (a !== b) throw new Error(`${msg} erwartet ${b}, war ${a}`);
}
// Tests für Task 0 als Smoke:
test("runner läuft", () => eq(1, 1));
console.log(`${passed + failed} tests, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

Erwartete Ausgaben zur Orientierung: ROT = `1 tests, 1 failed` + Exit 1; GRÜN = `N tests, 0 failed` + Exit 0.

## 8. Tests / Validation (global)

- Pro Task TDD (ROT→GRÜN→Commit), Suite-Schwelle: `node tests/run-tests.mjs` muss vor jedem Commit `0 failed` melden.
- Statisch: `node --check js/*.js` nach jeder JS-Änderung; `python3 -c "import json;json.load(open('data/seed-2025.json'))"` nach jeder Daten-Änderung.
- Browser-Abnahme (manuell, 3 Punkte): a) Doppelklick-Start ohne Server, b) CRUD → Reload → persistent, c) Rechnung Garage-1-Demo = 2,59 € + 7,14 €.
- Referenz-Rechnung zum Abgleich: XLSX Garage 2/2025 = 7,25 kWh → 2,39 € + 7,14 € = **9,54 €** (als Demo-Fixture nachstellbar).
- Verboten: Tests löschen/aufweichen für Grün; echte Mieter-/Bankdaten in Seed/Tests/Commits; Push ohne Freigabe.

## 9. Entscheidungen (Grill-Runden 10.10.2026, Frontier leer)

- Kostenarten: Strom + freie Kostenposten (`key` je Posten).
- Anlage/Betriebsverbrauch: trägt der Vermieter (`allocateShared: false`, Zeile 0 € + Hinweis).
- Design: **B Reiter-App**.
- Bankdaten/Steuernummer: Platzhalter im Repo, echte nur lokal.
- Waschhaus: immer 0 €, keine Abrechnung, kein Beleg.
- Fehlende Stichtagsablesung: Schätzung (zeitanteilig) mit Kennzeichnung.
- Mehrere Garagen pro Mieter: **eine Sammelrechnung** (Positionen je Garage, eine Summe).
- Altdaten: Neustart mit Demo-Daten, Tino pflegt 2025 manuell ein (kein XLSX-Import).

## 10. Risiken, Tradeoffs

- R1 `file://` + ES-Module: `import` zwischen lokalen Dateien wird vom Browser blockiert (CORS). Mitigation: `billing.js`/`store.js` als klassische `<script>` (Globals `window.NKM`), KEINE `import`-Kette im Browser; `tests/run-tests.mjs` nutzt `import`, liest dieselben Dateien als Text und evaluiert sie — falls das bricht, Fallback: Logik in `billing.js` doppelt pflegen ist VERBOTEN, stattdessen Test per `node --experimental-vm-modules` auf das Browser-Bundle umstellen.
- R2 Stichtagsablesung fehlt bei Wechsel → Schätzung mit Kennzeichnung (beschlossen, §6). Echte Ablesepflicht bleibt Nutzer-Sache.
- R3 Betriebsverbrauch-Umlage (395 kWh ≈ 130 €): trägt der Vermieter (entschieden 10.10.2026). `allocateShared`-Flag bleibt vorbereitet, Default `false`.
- R4 Überlappungs-Validierung blockiert Speichern — bei Altdaten-Import (XLSX-Tippfehler) kann das nerven. Mitigation: Import zeigt Fehler, lässt aber „trotzdem laden (prüfen)" zu, markiert Zeilen rot.
- R5 `localStorage`-Limit (~5 MB) — für 15 Zähler × Jahrzehnte irrelevant; JSON-Export ist die Wahrheit, `localStorage` nur Komfort.
- R6 `gh`-Login mit Token scheitert (fehlender `read:org`-Scope); Push nur via Askpass-Helper — kein Code-Problem, nur Release-Prozess.
- Offene Fragen an Tino: alle in Grill-Runden am 10.10.2026 entschieden, siehe §9.
