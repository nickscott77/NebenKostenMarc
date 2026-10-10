// Abrechnungslogik (DOM-frei). Browser: window.NKM.billing. Node: ESM-Import.
const DAY_MS = 86400000;

function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function nextDayISO(t) {
  return new Date(t + DAY_MS).toISOString().slice(0, 10);
}
function round2(x) {
  return Math.round(x * 100) / 100;
}

// Tage inklusiv: daysInclusive('2025-01-01','2025-12-31') === 365.
function daysInclusive(fromISO, toISO) {
  return Math.round((parseISO(toISO) - parseISO(fromISO)) / DAY_MS) + 1;
}

function prevDayISO(iso) {
  return new Date(parseISO(iso) - DAY_MS).toISOString().slice(0, 10);
}

// Verbrauch eines Zählers im Zeitraum.
// Exakt nur mit Ablesung am Anfang (Tag selbst oder Vortag = Stichtag) UND am Ende;
// sonst Schätzung = Jahresverbrauch × Tage/365 (gekennzeichnet). Keine Interpolation.
function meterUsage(readings, meterId, fromISO, toISO, allowEstimate) {
  if (allowEstimate === undefined) allowEstimate = true;
  const rs = readings
    .filter((r) => r.meterId === meterId)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const hints = [];
  let end = null;
  for (const r of rs) if (r.date <= toISO) end = r;
  if (!end) {
    hints.push(`keine Ablesung für ${meterId} bis ${toISO}`);
    return { kwh: 0, fromReading: null, toReading: null, estimated: true, hints };
  }
  let start = null;
  for (const r of rs) if (r.date <= fromISO) start = r;
  const startOK = !!start && (start.date === fromISO || start.date === prevDayISO(fromISO));
  const endOK = end.date === toISO;
  const diff = end.value - (start ? start.value : 0);
  if (diff < 0) {
    hints.push(`fallender Zählerstand bei ${meterId} (${start ? start.date : "?"}→${end.date}) — bitte prüfen`);
    return { kwh: 0, fromReading: start, toReading: end, estimated: true, hints };
  }
  if ((startOK && endOK) || !allowEstimate) {
    const exact = startOK && endOK && !!start;
    const out = hints.slice();
    if (!start) out.push(`kein Anfangsstand für ${meterId} ab ${fromISO}, ab 0 gerechnet`);
    else if (!exact && !allowEstimate) out.push(`Referenz unvollständig (${meterId} ${fromISO}–${toISO})`);
    return { kwh: diff, fromReading: start, toReading: end, estimated: !exact, hints: out };
  }
  // Schätzung über Jahresreferenz (exakt bestimmbar, keine Rekursion).
  const y = yearOf(fromISO);
  const ref = meterUsage(readings, meterId, `${y}-01-01`, `${y}-12-31`, false);
  const segDays = daysInclusive(fromISO, toISO);
  if (!ref.estimated && ref.kwh >= 0) {
    hints.push(`keine Stichtagsablesung (${meterId} ${fromISO}–${toISO}), zeitanteilig geschätzt`);
    return { kwh: (ref.kwh * segDays) / daysInYear(y), fromReading: start, toReading: end, estimated: true, hints };
  }
  hints.push(`keine Stichtagsablesung und keine Jahresreferenz (${meterId}), Differenz verwendet — bitte prüfen`);
  return { kwh: diff, fromReading: start, toReading: end, estimated: true, hints };
}

function yearOf(iso) {
  return Number(iso.slice(0, 4));
}
function daysInYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}
function findYear(state, y) {
  return (state.years || []).find((yy) => yy.year === y) || { year: y, kwhPrice: 0, baseFeeTotal: 0, costs: [], allocateShared: false };
}

// Vollabrechnung eines Mieters (Sammelrechnung über alle seine Garagen).
function billTenant(state, tenantId, fromISO, toISO) {
  const tenant = (state.tenants || []).find((t) => t.id === tenantId);
  if (!tenant) throw new Error(`unbekannter Mieter: ${tenantId}`);
  const lines = [];
  const hints = [];
  const garages = Object.fromEntries((state.garages || []).map((g) => [g.id, g]));
  const occs = (state.occupancy || []).filter(
    (o) => o.tenantId === tenantId && o.from <= toISO && (o.to === null || o.to >= fromISO)
  );
  for (const o of occs) {
    const g = garages[o.garageId];
    if (!g) continue;
    if (g.shared) continue; // Waschhaus: immer 0 €, kein Beleg.
    // Segment auf Abrechnungszeitraum schneiden, dann je Kalenderjahr teilen.
    let segFrom = o.from > fromISO ? o.from : fromISO;
    const segEnd = (o.to === null || o.to > toISO ? toISO : o.to);
    while (segFrom <= segEnd) {
      const y = yearOf(segFrom);
      const yEnd = `${y}-12-31` < segEnd ? `${y}-12-31` : segEnd;
      const yc = findYear(state, y);
      const days = daysInclusive(segFrom, yEnd);
      const usage = meterUsage(state.readings || [], g.meterId, segFrom, yEnd);
      if (usage.estimated) {
        hints.push(`Stichtagsablesung fehlt (${g.label} ${segFrom}–${yEnd}), als Schätzung markiert`);
      }
      lines.push({
        kind: "strom", garage: g.label, period: { from: segFrom, to: yEnd },
        kwh: round2(usage.kwh), amount: round2(usage.kwh * yc.kwhPrice),
        label: `Strom ${g.label} (${segFrom}–${yEnd})`, estimated: usage.estimated,
      });
      if (yc.baseFeeTotal > 0) {
        const fee = (yc.baseFeeTotal / (state.baseFeeDivisor || 15)) * (days / daysInYear(y));
        lines.push({ kind: "grundgebuehr", garage: g.label, amount: round2(fee), label: `Grundgebühr ${g.label} (${segFrom}–${yEnd})` });
      }
      for (const c of yc.costs || []) {
        if (c.key === "nach-faktor") {
          const liable = (state.garages || []).filter((gg) => !gg.shared).length || 1;
          const share = (c.amount / liable) * (days / daysInYear(y));
          lines.push({ kind: "betriebskosten", garage: g.label, amount: round2(share), label: `${c.label} ${g.label} (${segFrom}–${yEnd})` });
        } else {
          hints.push(`Umlageschlüssel unbekannt: ${c.key} (${c.label})`);
        }
      }
      segFrom = nextDayISO(parseISO(yEnd));
    }
  }
  const anyShared = (state.years || []).some((y) => y.allocateShared);
  if (anyShared) {
    hints.push("Anlagen-Umlage aktiv, aber nicht implementiert — bitte melden");
  } else {
    lines.push({ kind: "anlage", amount: 0, label: "Anlage (Anteilig)" });
    if (occs.length) hints.push("Betriebsverbrauch (Anlage) trägt der Vermieter");
  }
  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { tenant, period: { from: fromISO, to: toISO, days: daysInclusive(fromISO, toISO) }, lines, total, hints };
}

if (typeof window !== "undefined") {
  window.NKM = window.NKM || {};
  window.NKM.billing = { daysInclusive, meterUsage, billTenant, round2 };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { daysInclusive, meterUsage, billTenant, round2 };
}
