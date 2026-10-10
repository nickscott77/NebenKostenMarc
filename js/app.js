// UI (Design B: Reiter-App). Browser only. Logik aus window.NKM.
(function () {
  "use strict";
  var S = window.NKM.store, B = window.NKM.billing;
  var LS_OK = true;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function eur(n) {
    return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }
  function uid(p) {
    return p + "-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  }

  var state = null, tab = "garagen", billResult = null;
  var billSel = { tenant: "", from: "2025-01-01", to: "2025-12-31" };
  var msg = "", msgErr = false;

  function persist() {
    try { S.saveSnapshot(state); } catch (e) { LS_OK = false; }
  }
  function setMsg(t, err) { msg = t; msgErr = !!err; }

  function currentTenant(garageId, date) {
    var d = date || "9999-12-31";
    var occ = (state.occupancy || []).filter(function (o) {
      return o.garageId === garageId && o.from <= d && (o.to === null || o.to >= d);
    });
    var last = occ.filter(function (o) { return o.to === null; })[0] || occ[occ.length - 1];
    if (!last) return "–";
    var t = state.tenants.filter(function (x) { return x.id === last.tenantId; })[0];
    return t ? t.lastName + ", " + t.firstName : "?";
  }

  function render() {
    var app = document.getElementById("app");
    var errs = S.validate(state);
    var h = '<nav class="tabs noprint">' + ["garagen", "mieter", "zaehler", "kosten", "vermieter", "abrechnung", "daten"]
      .map(function (t) { return '<button data-tab="' + t + '"' + (t === tab ? ' class="active"' : "") + ">" +
        { garagen: "Garagen", mieter: "Mieter", zaehler: "Zähler", kosten: "Kosten", vermieter: "Vermieter", abrechnung: "Abrechnung", daten: "Daten" }[t] + "</button>"; })
      .join("") + "</nav>";
    if (errs.length) h += '<p class="error">Datenfehler: ' + esc(errs.join("; ")) + "</p>";
    if (msg) h += '<p class="' + (msgErr ? "error" : "") + '">' + esc(msg) + "</p>";
    h += ({ garagen: vGaragen, mieter: vMieter, zaehler: vZaehler, kosten: vKosten, vermieter: vVermieter, abrechnung: vAbrechnung, daten: vDaten })[tab]();
    app.innerHTML = h;
    bind(app);
  }

  function vGaragen() {
    var rows = state.garages.map(function (g) {
      return "<tr><td>" + esc(g.label) + "</td><td>" + esc(g.meterId) + "</td>" +
        "<td>" + esc(currentTenant(g.id)) + '</td><td class="noprint"><button data-del-garage="' + esc(g.id) + '">Löschen</button></td></tr>';
    }).join("");
    return "<h2>Garagen</h2><table><tr><th>Garage</th><th>Zähler</th><th>Mieter</th><th class='noprint'></th></tr>" +
      rows + "</table><form id='f-garage' class='noprint'><input name='label' placeholder='Garage 15' required> " +
      "<input name='meterId' placeholder='m-g15' required> " +
      "<button>Anlegen</button></form>";
  }

  function vMieter() {
    var rows = state.tenants.map(function (t) {
      var occ = (state.occupancy || []).filter(function (o) { return o.tenantId === t.id; });
      var gs = occ.map(function (o) {
        var g = state.garages.filter(function (x) { return x.id === o.garageId; })[0];
        return esc(g ? g.label : o.garageId) + " (" + esc(o.from) + "–" + esc(o.to || "…") +
          ') <button data-del-occ="' + esc(o.garageId + "|" + o.tenantId + "|" + o.from + "|" + (o.to || "")) + '">×</button>';
      }).join("<br>");
      return "<tr><td>" + esc(t.lastName) + ", " + esc(t.firstName) + "<br><small>" + esc(t.street || "") + " " +
        esc(t.houseNo || "") + ", " + esc(t.zip || "") + " " + esc(t.city || "") + "</small></td><td>" + gs +
        '</td><td class="noprint"><button data-del-tenant="' + esc(t.id) + '">Löschen</button></td></tr>';
    }).join("");
    var gOpts = state.garages.filter(function (g) { return !g.shared; })
      .map(function (g) { return "<option value='" + esc(g.id) + "'>" + esc(g.label) + "</option>"; }).join("");
    var tOpts = state.tenants.map(function (t) {
      return "<option value='" + esc(t.id) + "'>" + esc(t.lastName) + ", " + esc(t.firstName) + "</option>";
    }).join("");
    return "<h2>Mieter</h2><table><tr><th>Mieter</th><th>Belegung</th><th class='noprint'></th></tr>" + rows +
      "</table><form id='f-tenant' class='noprint'><input name='firstName' placeholder='Vorname' required> " +
      "<input name='lastName' placeholder='Nachname' required> <input name='street' placeholder='Straße'> " +
      "<input name='houseNo' placeholder='Nr' style='width:4em'> <input name='zip' placeholder='PLZ' style='width:6em'> " +
      "<input name='city' placeholder='Ort'> <button>Anlegen</button></form>" +
      "<h3 class='noprint'>Belegung</h3><form id='f-occ' class='noprint'><select name='tenantId'>" + tOpts +
      "</select> <select name='garageId'>" + gOpts + "</select> <input name='from' type='date' required> " +
      "<input name='to' type='date'> <button>Zuordnen</button></form>";
  }

  function vZaehler() {
    var meters = ["central"].concat(state.garages.map(function (g) { return g.meterId; }));
    var sel = vZaehler.sel || "central";
    var rs = state.readings.filter(function (r) { return r.meterId === sel; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var rows = rs.map(function (r) {
      return "<tr><td>" + esc(r.date) + "</td><td>" + esc(r.value) + "</td></tr>";
    }).join("");
    var opts = meters.map(function (m) {
      return "<option" + (m === sel ? " selected" : "") + ">" + esc(m) + "</option>";
    }).join("");
    return "<h2>Zähler</h2><label class='noprint'>Zähler <select id='meter-sel'>" + opts +
      "</select></label><table><tr><th>Datum</th><th>Stand</th></tr>" + rows +
      "</table><form id='f-reading' class='noprint'><input name='date' type='date' required> " +
      "<input name='value' type='number' step='0.01' min='0' required> <button>Eintragen</button></form>";
  }
  vZaehler.sel = "central";

  function vKosten() {
    var y = vKosten.year || (state.years[0] && state.years[0].year);
    var yOpts = state.years.map(function (yy) {
      return "<option" + (yy.year === y ? " selected" : "") + ">" + yy.year + "</option>";
    }).join("");
    var yc = state.years.filter(function (yy) { return yy.year === y; })[0] || { kwhPrice: 0, baseFeeTotal: 0, costs: [] };
    var rows = (yc.costs || []).map(function (c, i) {
      return "<tr><td>" + esc(c.date) + "</td><td>" + esc(c.label) + "</td><td>" + eur(c.amount) + "</td><td>" + esc(c.key) +
        '</td><td class="noprint"><button data-del-cost="' + y + "|" + i + '">×</button></td></tr>';
    }).join("");
    return "<h2>Kosten</h2><label class='noprint'>Jahr <select id='year-sel'>" + yOpts + "</select></label> " +
      "<span>Preis: " + esc(yc.kwhPrice) + " €/kWh · Grundgebühr gesamt: " + eur(yc.baseFeeTotal || 0) + "</span>" +
      "<table><tr><th>Datum</th><th>Artikel</th><th>Summe</th><th>Schlüssel</th><th class='noprint'></th></tr>" + rows +
      "</table><form id='f-cost' class='noprint'><input name='date' type='date' required> <input name='label' placeholder='Artikel' required> " +
      "<input name='amount' type='number' step='0.01' min='0' required> <select name='key'><option>nach-faktor</option></select> " +
      "<button>Eintragen</button></form><form id='f-year' class='noprint'>Jahr <input name='year' type='number' style='width:5em' required> " +
      "Preis <input name='kwhPrice' type='number' step='0.001' min='0' value='0.33' style='width:5em'> <button>Jahr anlegen</button></form>";
  }

  function vVermieter() {
    var L = state.landlord || {}, BK = L.bank || {};
    return "<h2>Vermieter</h2><p>Angaben erscheinen als Kopf- und Fußzeile auf der Abrechnung.</p>" +
      "<form id='f-landlord' class='noprint'>" +
      "<input name='name' placeholder='Name / Firma' value=\"" + esc(L.name || "") + "\" required> " +
      "<input name='contact' placeholder='Kontakt (Anschrift · Telefon)' value=\"" + esc(L.contact || "") + "\" style='width:26em'> " +
      "<input name='taxNote' placeholder='Steuernotiz' value=\"" + esc(L.taxNote || "") + "\" style='width:26em'><br>" +
      "<input name='holder' placeholder='Kontoinhaber' value=\"" + esc(BK.holder || "") + "\"> " +
      "<input name='iban' placeholder='IBAN' value=\"" + esc(BK.iban || "") + "\" style='width:19em'> " +
      "<input name='bic' placeholder='BIC' value=\"" + esc(BK.bic || "") + "\"> " +
      "<input name='bankName' placeholder='Bank' value=\"" + esc(BK.bankName || "") + "\"> " +
      "<button>Speichern</button></form>";
  }

  function vAbrechnung() {
    if (!billSel.tenant && state.tenants[0]) billSel.tenant = state.tenants[0].id;
    var tOpts = state.tenants.map(function (t) {
      return "<option value='" + esc(t.id) + "'" + (t.id === billSel.tenant ? " selected" : "") + ">" +
        esc(t.lastName) + ", " + esc(t.firstName) + "</option>";
    }).join("");
    var h = "<h2>Abrechnung (Sammelrechnung)</h2><form id='f-bill' class='noprint'><select name='tenant'>" + tOpts +
      "</select> <input name='from' type='date' value='" + esc(billSel.from) + "' required> <input name='to' type='date' value='" +
      esc(billSel.to) + "' required> <button>Berechnen</button> <button type='button' id='btn-print'>Drucken</button></form>";
    if (billResult) {
      var b = billResult, L = state.landlord || {}, BK = L.bank || {};
      h += "<div class='invoice-head'><div class='invoice-landlord'><strong>" + esc(L.name || "—") + "</strong><br><small>" +
        esc(L.contact || "") + "</small></div><div class='invoice-addr'>" +
        esc(b.tenant.firstName + " " + b.tenant.lastName) + "<br>" +
        esc((b.tenant.street || "") + " " + (b.tenant.houseNo || "")) + "<br>" +
        esc((b.tenant.zip || "") + " " + (b.tenant.city || "")) + "</div></div>";
      h += "<h3>" + esc(b.tenant.lastName) + ", " + esc(b.tenant.firstName) + " · " + esc(b.period.from) + "–" + esc(b.period.to) +
        " (" + b.period.days + " Tage)</h3>";
      if (b.hints.length) h += '<div class="hint">' + b.hints.map(esc).join("<br>") + "</div>";
      h += "<table><tr><th>Position</th><th>kWh</th><th>€</th></tr>" + b.lines.map(function (l) {
        return "<tr><td>" + esc(l.label) + (l.estimated ? " (Schätzung)" : "") + "</td><td>" +
          (l.kwh == null ? "" : esc(l.kwh)) + "</td><td>" + eur(l.amount) + "</td></tr>";
      }).join("") + "<tr><th>Rechnungsbetrag</th><th></th><th>" + eur(b.total) + "</th></tr></table>";
      if (L.taxNote) h += '<p class="invoice-foot">' + esc(L.taxNote) + "</p>";
      if (BK.holder || BK.iban) h += '<p class="invoice-foot">Zahlung: ' + esc(BK.holder || "") + " · IBAN " + esc(BK.iban || "") +
        (BK.bic ? " · BIC " + esc(BK.bic) : "") + (BK.bankName ? " · " + esc(BK.bankName) : "") + "</p>";
    }
    return h;
  }

  function vDaten() {
    return "<h2>Daten</h2><p>Speicherung: localStorage (automatisch)" + (LS_OK ? "" : " — NICHT verfügbar") +
      "; Wahrheit: JSON-Export.</p><p class='noprint'><button id='btn-export'>Exportieren (JSON-Datei)</button> " +
      "<label>Importieren <input type='file' id='file-import' accept='.json'></label> " +
      "<button id='btn-seed'>Demo-Daten laden</button></p>";
  }

  function bind(app) {
    app.querySelectorAll("[data-tab]").forEach(function (b) {
      b.onclick = function () { tab = b.getAttribute("data-tab"); msg = ""; render(); };
    });
    var q = function (s) { return app.querySelector(s); };
    var fg = q("#f-garage");
    if (fg) fg.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fg);
      var label = String(fd.get("label")).trim(), meterId = String(fd.get("meterId")).trim();
      if (state.garages.some(function (g) { return g.label === label || g.meterId === meterId; })) {
        setMsg("Garage oder Zähler existiert bereits.", true); render(); return;
      }
      state.garages.push({ id: uid("g"), label: label, meterId: meterId });
      persist(); setMsg("Garage angelegt."); render();
    };
    app.querySelectorAll("[data-del-garage]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-del-garage");
        if ((state.occupancy || []).some(function (o) { return o.garageId === id; })) { setMsg("Belegte Garage kann nicht gelöscht werden.", true); render(); return; }
        var g = state.garages.filter(function (x) { return x.id === id; })[0];
        var n = state.readings.filter(function (r) { return g && r.meterId === g.meterId; }).length;
        if (!confirm("Garage inkl. " + n + " Zählerständen wirklich löschen?")) return;
        state.readings = state.readings.filter(function (r) { return r.meterId !== (g && g.meterId); });
        state.garages = state.garages.filter(function (x) { return x.id !== id; });
        persist(); setMsg("Garage gelöscht."); render();
      };
    });
    var ft = q("#f-tenant");
    if (ft) ft.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(ft);
      state.tenants.push({ id: uid("t"), firstName: String(fd.get("firstName")).trim(), lastName: String(fd.get("lastName")).trim(),
        street: String(fd.get("street")).trim(), houseNo: String(fd.get("houseNo")).trim(),
        zip: String(fd.get("zip")).trim(), city: String(fd.get("city")).trim() });
      persist(); setMsg("Mieter angelegt."); render();
    };
    app.querySelectorAll("[data-del-tenant]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-del-tenant");
        if ((state.occupancy || []).some(function (o) { return o.tenantId === id; })) { setMsg("Mieter mit Belegung kann nicht gelöscht werden.", true); render(); return; }
        if (!confirm("Mieter wirklich löschen?")) return;
        state.tenants = state.tenants.filter(function (x) { return x.id !== id; });
        persist(); setMsg("Mieter gelöscht."); render();
      };
    });
    var fo = q("#f-occ");
    if (fo) fo.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fo);
      var cand = { garageId: String(fd.get("garageId")), tenantId: String(fd.get("tenantId")),
        from: String(fd.get("from")), to: String(fd.get("to")) || null };
      var errs = S.validate(Object.assign({}, state, { occupancy: state.occupancy.concat([cand]) }));
      if (errs.length) { setMsg(errs.join("; "), true); render(); return; }
      state.occupancy.push(cand); persist(); setMsg("Belegung eingetragen."); render();
    };
    app.querySelectorAll("[data-del-occ]").forEach(function (b) {
      b.onclick = function () {
        var p = b.getAttribute("data-del-occ").split("|");
        state.occupancy = state.occupancy.filter(function (o) {
          return !(o.garageId === p[0] && o.tenantId === p[1] && o.from === p[2] && (o.to || "") === (p[3] || ""));
        });
        persist(); setMsg("Belegung entfernt."); render();
      };
    });
    var ms = q("#meter-sel");
    if (ms) ms.onchange = function () { vZaehler.sel = ms.value; render(); };
    var fr = q("#f-reading");
    if (fr) fr.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fr);
      state.readings.push({ meterId: vZaehler.sel, date: String(fd.get("date")), value: Number(fd.get("value")) });
      var errs = S.validate(state);
      if (errs.length) { state.readings.pop(); setMsg(errs.join("; "), true); render(); return; }
      persist(); setMsg("Zählerstand eingetragen."); render();
    };
    var ys = q("#year-sel");
    if (ys) ys.onchange = function () { vKosten.year = Number(ys.value); render(); };
    var fc = q("#f-cost");
    if (fc) fc.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fc);
      var yc = state.years.filter(function (yy) { return yy.year === vKosten.year; })[0];
      if (!yc) { setMsg("Jahr wählen.", true); render(); return; }
      yc.costs.push({ date: String(fd.get("date")), label: String(fd.get("label")).trim(),
        amount: Number(fd.get("amount")), key: String(fd.get("key")) });
      persist(); setMsg("Kosten eingetragen."); render();
    };
    var fy = q("#f-year");
    if (fy) fy.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fy);
      var y = Number(fd.get("year"));
      if (state.years.some(function (yy) { return yy.year === y; })) { setMsg("Jahr existiert.", true); render(); return; }
      state.years.push({ year: y, kwhPrice: Number(fd.get("kwhPrice")), baseFeeTotal: 0, costs: [], allocateShared: false });
      vKosten.year = y; persist(); setMsg("Jahr angelegt."); render();
    };
    var fl = q("#f-landlord");
    if (fl) fl.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fl);
      state.landlord = {
        name: String(fd.get("name")).trim(),
        contact: String(fd.get("contact")).trim(),
        taxNote: String(fd.get("taxNote")).trim(),
        bank: {
          holder: String(fd.get("holder")).trim(),
          iban: String(fd.get("iban")).trim(),
          bic: String(fd.get("bic")).trim(),
          bankName: String(fd.get("bankName")).trim()
        }
      };
      persist(); setMsg("Vermieterdaten gespeichert."); render();
    };
    var fb = q("#f-bill");
    if (fb) fb.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(fb);
      billSel = { tenant: String(fd.get("tenant")), from: String(fd.get("from")), to: String(fd.get("to")) };
      try { billResult = B.billTenant(state, billSel.tenant, billSel.from, billSel.to); setMsg(""); }
      catch (err) { billResult = null; setMsg(err.message, true); }
      render();
    };
    var bp = q("#btn-print");
    if (bp) bp.onclick = function () { window.print(); };
    var be = q("#btn-export");
    if (be) be.onclick = function () {
      var blob = new Blob([S.exportJson(state)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "nebenkosten-" + ((billSel.from || "").slice(0, 4) || vKosten.year || "export") + ".json";
      a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };
    var fi = q("#file-import");
    if (fi) fi.onchange = function () {
      var f = fi.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try { state = S.loadState(String(rd.result)); billResult = null; persist(); setMsg("Importiert: " + f.name); }
        catch (err) { setMsg(err.message, true); }
        render();
      };
      rd.readAsText(f);
    };
    var bs = q("#btn-seed");
    if (bs) bs.onclick = function () {
      if (!confirm("Demo-Daten laden? Aktuelle Daten werden ersetzt.")) return;
      state = S.loadState(JSON.parse(JSON.stringify(window.NKM_SEED)));
      billResult = null; persist(); setMsg("Demo-Daten geladen."); render();
    };
  }

  function boot() {
    try {
      state = S.loadSnapshot();
    } catch (e) { state = null; }
    if (!state) {
      if (window.NKM_SEED) {
        state = S.loadState(JSON.parse(JSON.stringify(window.NKM_SEED)));
      } else {
        document.getElementById("app").innerHTML =
          "<p class='error'>Keine Daten. Bitte seed-data.js einbinden oder JSON importieren.</p>";
        return;
      }
    }
    if (!vKosten.year && state.years[0]) vKosten.year = state.years[0].year;
    document.getElementById("app-status").textContent = "bereit";
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
