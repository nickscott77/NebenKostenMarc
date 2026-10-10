# NebenKostenMarc

Lokale Webseite zur Nebenkostenabrechnung vermieteter Garagen (14 Garagen + Waschhaus).

- Kein Build, kein Server nötig. Läuft per Doppelklick auf `index.html` in jedem Standard-Browser.
- Alternative mit Server: `python3 -m http.server 8000` → http://localhost:8000/index.html
- Daten: JSON (`data/seed-2025.json` = synthetische Demo-Daten), Ablage im Browser-`localStorage`, Wahrheit ist der JSON-Export (Reiter „Daten").
- Nach jeder Seed-Änderung: `js/seed-data.js` neu erzeugen mit
  `python3 -c "import json; d=open('data/seed-2025.json',encoding='utf-8').read(); open('js/seed-data.js','w',encoding='utf-8').write('window.NKM_SEED = ' + d + ';')"`
- Tests: `node tests/run-tests.mjs` bzw. `npm test` (Erwartung: `0 failed`; einmalig `npm install` nötig — dev-only Dependency `jsdom` für die DOM-Smoke-Tests), Syntax: `node --check js/*.js`.
- Vermieterdaten: Reiter „Vermieter" (Name, Kontakt, Steuernotiz, Bankverbindung) — erscheinen als Kopf- und Fußzeile auf der Abrechnung und im Ausdruck.
- Abrechnungsregeln: Tage inklusiv, Strom nach Zählerdifferenz, Betriebskosten `Betrag/14 × Faktor × Tage/365`,
  Anlage trägt der Vermieter, Sammelrechnung pro Mieter, Schätzung bei fehlender Stichtagsablesung (gekennzeichnet).
- Rundung: pro Zeile auf Cent; Summe aus gerundeten Zeilen. Referenz Garage 2/2025 = 2,39 € + 7,14 € = **9,53 €**
  (9,54 € ergäbe nur ungerundetes Addieren — kein Bug).
- Datenschutz: Keine echten Mieter-/Bankdaten committen. Keine XLSX ins Repo (`.gitignore`: `*.xlsx`, `.env`).
