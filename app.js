/* Gestione Economica — logica applicativa.
   Tutti i dati sono salvati in localStorage: restano solo su questo dispositivo. */
(function () {
  "use strict";

  const STORAGE_KEY = "gestione-economica-v1";
  const PALETTE = ["#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#f59e0b",
    "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#9333ea"];

  const CAT_ICONS = {
    "Alimentari": "🛒", "Casa": "🏠", "Trasporti": "🚗", "Bollette": "💡",
    "Salute": "🩺", "Svago": "🎉", "Ristoranti": "🍽️", "Shopping": "🛍️",
    "Istruzione": "📚", "Viaggi": "✈️", "Altro": "📦",
    "Stipendio": "💼", "Bonus": "🎁", "Investimenti": "📈", "Rimborsi": "↩️", "Regali": "🎈"
  };

  const DEFAULTS = {
    transactions: [],
    categories: {
      expense: ["Alimentari", "Casa", "Trasporti", "Bollette", "Salute", "Svago", "Ristoranti", "Shopping", "Altro"],
      income: ["Stipendio", "Bonus", "Investimenti", "Rimborsi", "Altro"]
    },
    budgets: {}, // { categoria: importo }
    theme: "light"
  };

  let state = load();
  let viewMonth = new Date(); // mese visualizzato
  let filters = { search: "", type: "all", category: "all" };

  /* ---------- Persistenza ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredCloneSafe(DEFAULTS);
      const data = JSON.parse(raw);
      return {
        transactions: data.transactions || [],
        categories: {
          expense: (data.categories && data.categories.expense) || DEFAULTS.categories.expense.slice(),
          income: (data.categories && data.categories.income) || DEFAULTS.categories.income.slice()
        },
        budgets: data.budgets || {},
        theme: data.theme || "light"
      };
    } catch (e) {
      console.error("Errore nel caricamento dati:", e);
      return structuredCloneSafe(DEFAULTS);
    }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- Utility ---------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const euro = (n) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const iconFor = (cat) => CAT_ICONS[cat] || "•";

  function monthLabel(d) {
    return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  }
  function parseDate(str) { return new Date(str + "T00:00:00"); }

  function txInMonth(t, d) {
    const td = parseDate(t.date);
    return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
  }
  function monthTx(d) { return state.transactions.filter((t) => txInMonth(t, d)); }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function colorForCategory(cat, list) {
    const idx = list.indexOf(cat);
    return PALETTE[(idx >= 0 ? idx : list.length) % PALETTE.length];
  }

  /* ---------- Rendering principale ---------- */
  function renderAll() {
    $("#currentMonthLabel").textContent = monthLabel(viewMonth);
    renderDashboard();
    renderTransactions();
    renderBudget();
    renderReports();
    renderCategoriesEditor();
    renderCategoryFilter();
  }

  function renderDashboard() {
    const txs = monthTx(viewMonth);
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const savings = income - expense;
    const balance = state.transactions.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);

    $("#statBalance").textContent = euro(balance);
    $("#statIncome").textContent = euro(income);
    $("#statExpense").textContent = euro(expense);
    $("#statSavings").textContent = euro(savings);
    $("#statSavings").style.color = savings >= 0 ? "var(--savings)" : "var(--expense)";
    $("#statSavingsRate").textContent = income > 0
      ? `${Math.round((savings / income) * 100)}% delle entrate`
      : "nessuna entrata";

    // grafico uscite per categoria
    const byCat = groupByCategory(txs.filter((t) => t.type === "expense"), state.categories.expense);
    const catData = byCat.map((c) => ({ label: c.category, value: c.total, color: c.color }));
    const catEmpty = $("#categoryEmpty");
    if (catData.length) {
      catEmpty.style.display = "none";
      $("#categoryChart").style.display = "block";
      NChart.doughnut($("#categoryChart"), catData);
    } else {
      catEmpty.style.display = "block";
      $("#categoryChart").style.display = "none";
      clearCanvas($("#categoryChart"));
    }

    // trend 6 mesi
    renderTrend();

    // ultimi movimenti
    const recent = [...state.transactions].sort(byDateDesc).slice(0, 6);
    renderTxItems($("#recentList"), recent, false);
    $("#recentEmpty").style.display = recent.length ? "none" : "block";
  }

  function renderTrend() {
    const months = lastMonths(6);
    const labels = months.map((d) => d.toLocaleDateString("it-IT", { month: "short" }));
    const incomeVals = months.map((d) => monthTx(d).filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0));
    const expenseVals = months.map((d) => monthTx(d).filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0));
    NChart.bars($("#trendChart"), {
      labels,
      series: [
        { name: "Entrate", color: getCss("--income"), values: incomeVals },
        { name: "Uscite", color: getCss("--expense"), values: expenseVals }
      ]
    });
  }

  function renderTransactions() {
    let txs = [...state.transactions].sort(byDateDesc);
    if (filters.type !== "all") txs = txs.filter((t) => t.type === filters.type);
    if (filters.category !== "all") txs = txs.filter((t) => t.category === filters.category);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      txs = txs.filter((t) => (t.description || "").toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
    }
    renderTxItems($("#txList"), txs, true);
    $("#txEmpty").style.display = txs.length ? "none" : "block";
  }

  function renderTxItems(container, txs, withActions) {
    container.innerHTML = "";
    txs.forEach((t) => {
      const li = document.createElement("li");
      li.className = "tx-item";
      const sign = t.type === "income" ? "+" : "−";
      const dateStr = parseDate(t.date).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
      li.innerHTML = `
        <div class="tx-icon">${iconFor(t.category)}</div>
        <div class="tx-main">
          <div class="tx-desc">${escapeHtml(t.description || t.category)}</div>
          <div class="tx-meta">${escapeHtml(t.category)} · ${dateStr}</div>
        </div>
        <div class="tx-amount ${t.type}">${sign} ${euro(t.amount)}</div>
        ${withActions ? `<div class="tx-actions">
          <button class="icon-btn" data-edit="${t.id}" title="Modifica">✏️</button>
          <button class="icon-btn" data-del="${t.id}" title="Elimina">🗑️</button>
        </div>` : ""}`;
      container.appendChild(li);
    });
  }

  function renderBudget() {
    const wrap = $("#budgetList");
    wrap.innerHTML = "";
    const txs = monthTx(viewMonth).filter((t) => t.type === "expense");
    state.categories.expense.forEach((cat) => {
      const spent = txs.filter((t) => t.category === cat).reduce((s, t) => s + t.amount, 0);
      const limit = Number(state.budgets[cat]) || 0;
      const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : (spent > 0 ? 100 : 0);
      let cls = "";
      if (limit > 0) { if (spent > limit) cls = "over"; else if (spent >= limit * 0.8) cls = "warn"; }
      const remaining = limit - spent;
      const item = document.createElement("div");
      item.className = "budget-item";
      item.innerHTML = `
        <div class="budget-top">
          <span class="budget-name">${iconFor(cat)} ${escapeHtml(cat)}</span>
          <span class="budget-figures">
            ${euro(spent)}${limit > 0 ? ` / <input class="budget-input" type="number" min="0" step="10" value="${limit}" data-budget="${escapeAttr(cat)}" />` :
              ` / <input class="budget-input" type="number" min="0" step="10" placeholder="limite" data-budget="${escapeAttr(cat)}" />`}
          </span>
        </div>
        <div class="bar"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
        ${limit > 0 ? `<div class="budget-figures" style="margin-top:5px">${
          remaining >= 0 ? `Restano ${euro(remaining)}` : `Sforato di ${euro(-remaining)}`
        }</div>` : ""}`;
      wrap.appendChild(item);
    });
  }

  function renderReports() {
    // entrate vs uscite 6 mesi
    renderTrendInto("#ioChart");

    // ripartizione entrate mese corrente
    const incTx = monthTx(viewMonth).filter((t) => t.type === "income");
    const byCat = groupByCategory(incTx, state.categories.income);
    const data = byCat.map((c) => ({ label: c.category, value: c.total, color: c.color }));
    const empty = $("#incomeEmpty");
    if (data.length) {
      empty.style.display = "none";
      $("#incomeChart").style.display = "block";
      NChart.doughnut($("#incomeChart"), data);
    } else {
      empty.style.display = "block";
      $("#incomeChart").style.display = "none";
      clearCanvas($("#incomeChart"));
    }

    // riepilogo
    const txs = monthTx(viewMonth);
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const count = txs.length;
    const avgExp = txs.filter((t) => t.type === "expense").length
      ? expense / txs.filter((t) => t.type === "expense").length : 0;
    const topCat = byCategoryTop(txs.filter((t) => t.type === "expense"));
    const grid = $("#summaryGrid");
    grid.innerHTML = `
      ${summaryCard("Numero movimenti", count)}
      ${summaryCard("Entrate totali", euro(income))}
      ${summaryCard("Uscite totali", euro(expense))}
      ${summaryCard("Bilancio", euro(income - expense))}
      ${summaryCard("Spesa media", euro(avgExp))}
      ${summaryCard("Categoria top", topCat ? `${iconFor(topCat.category)} ${topCat.category}` : "—")}
    `;
  }

  function renderTrendInto(sel) {
    const months = lastMonths(6);
    const labels = months.map((d) => d.toLocaleDateString("it-IT", { month: "short" }));
    const incomeVals = months.map((d) => monthTx(d).filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0));
    const expenseVals = months.map((d) => monthTx(d).filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0));
    NChart.bars($(sel), {
      labels,
      series: [
        { name: "Entrate", color: getCss("--income"), values: incomeVals },
        { name: "Uscite", color: getCss("--expense"), values: expenseVals }
      ]
    });
  }

  function summaryCard(label, value) {
    return `<div class="summary-item"><div class="s-label">${label}</div><div class="s-value">${value}</div></div>`;
  }

  function renderCategoriesEditor() {
    renderChips($("#expenseCats"), state.categories.expense, "expense");
    renderChips($("#incomeCats"), state.categories.income, "income");
  }
  function renderChips(container, list, type) {
    container.innerHTML = "";
    list.forEach((cat) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = `${iconFor(cat)} ${escapeHtml(cat)} <button data-delcat="${escapeAttr(cat)}" data-cattype="${type}" title="Rimuovi">✕</button>`;
      container.appendChild(chip);
    });
  }

  function renderCategoryFilter() {
    const sel = $("#filterCategory");
    const current = sel.value;
    const all = [...new Set([...state.categories.expense, ...state.categories.income])];
    sel.innerHTML = `<option value="all">Tutte le categorie</option>` +
      all.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
    if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  }

  /* ---------- Helpers dati ---------- */
  function groupByCategory(txs, catOrder) {
    const map = {};
    txs.forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return Object.keys(map)
      .sort((a, b) => map[b] - map[a])
      .map((cat) => ({ category: cat, total: map[cat], color: colorForCategory(cat, catOrder) }));
  }
  function byCategoryTop(txs) {
    const g = groupByCategory(txs, state.categories.expense);
    return g[0] || null;
  }
  function byDateDesc(a, b) {
    const d = parseDate(b.date) - parseDate(a.date);
    return d !== 0 ? d : (b.createdAt || 0) - (a.createdAt || 0);
  }
  function lastMonths(n) {
    const arr = [];
    for (let i = n - 1; i >= 0; i--) {
      arr.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - i, 1));
    }
    return arr;
  }
  function getCss(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function clearCanvas(c) { const x = c.getContext("2d"); x && x.clearRect(0, 0, c.width, c.height); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ---------- Modale movimento ---------- */
  function openModal(tx) {
    const modal = $("#txModal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    if (tx) {
      $("#modalTitle").textContent = "Modifica movimento";
      $("#txId").value = tx.id;
      setType(tx.type);
      $("#txAmount").value = tx.amount;
      $("#txDesc").value = tx.description || "";
      $("#txDate").value = tx.date;
      fillCategorySelect(tx.type);
      $("#txCategory").value = tx.category;
    } else {
      $("#modalTitle").textContent = "Nuovo movimento";
      $("#txForm").reset();
      $("#txId").value = "";
      setType("expense");
      $("#txDate").value = todayStr();
      fillCategorySelect("expense");
    }
    setTimeout(() => $("#txAmount").focus(), 60);
  }
  function closeModal() {
    const modal = $("#txModal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
  function setType(type) {
    $$('input[name="txType"]').forEach((r) => { r.checked = r.value === type; });
  }
  function currentType() {
    const r = document.querySelector('input[name="txType"]:checked');
    return r ? r.value : "expense";
  }
  function fillCategorySelect(type) {
    const sel = $("#txCategory");
    const list = state.categories[type];
    sel.innerHTML = list.map((c) => `<option value="${escapeAttr(c)}">${iconFor(c)} ${escapeHtml(c)}</option>`).join("");
  }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function submitTx(e) {
    e.preventDefault();
    const id = $("#txId").value;
    const type = currentType();
    const amount = Math.round(parseFloat($("#txAmount").value) * 100) / 100;
    if (!(amount > 0)) { toast("Inserisci un importo valido"); return; }
    const tx = {
      id: id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      type,
      amount,
      category: $("#txCategory").value,
      description: $("#txDesc").value.trim(),
      date: $("#txDate").value,
      createdAt: Date.now()
    };
    if (id) {
      const i = state.transactions.findIndex((t) => t.id === id);
      if (i >= 0) { tx.createdAt = state.transactions[i].createdAt || Date.now(); state.transactions[i] = tx; }
      toast("Movimento aggiornato");
    } else {
      state.transactions.push(tx);
      toast("Movimento aggiunto");
    }
    save();
    // porta la vista sul mese del movimento
    viewMonth = new Date(parseDate(tx.date).getFullYear(), parseDate(tx.date).getMonth(), 1);
    closeModal();
    renderAll();
  }

  function deleteTx(id) {
    const tx = state.transactions.find((t) => t.id === id);
    if (!tx) return;
    if (!confirm(`Eliminare "${tx.description || tx.category}" (${euro(tx.amount)})?`)) return;
    state.transactions = state.transactions.filter((t) => t.id !== id);
    save();
    renderAll();
    toast("Movimento eliminato");
  }

  /* ---------- Categorie ---------- */
  function addCategory(type, name) {
    name = name.trim();
    if (!name) return;
    if (state.categories[type].includes(name)) { toast("Categoria già presente"); return; }
    state.categories[type].push(name);
    save();
    renderAll();
    toast("Categoria aggiunta");
  }
  function removeCategory(type, name) {
    const used = state.transactions.some((t) => t.type === type && t.category === name);
    if (used && !confirm(`La categoria "${name}" è usata da alcuni movimenti. Rimuoverla comunque? (I movimenti restano invariati)`)) return;
    state.categories[type] = state.categories[type].filter((c) => c !== name);
    if (state.budgets[name] != null && type === "expense") delete state.budgets[name];
    save();
    renderAll();
    toast("Categoria rimossa");
  }

  /* ---------- Import / Export ---------- */
  function exportJson() {
    download(JSON.stringify(state, null, 2), `backup-gestione-economica-${todayStr()}.json`, "application/json");
    toast("Backup esportato");
  }
  function exportCsv() {
    const header = ["Data", "Tipo", "Categoria", "Descrizione", "Importo"];
    const rows = [...state.transactions].sort(byDateDesc).map((t) => [
      t.date,
      t.type === "income" ? "Entrata" : "Uscita",
      t.category,
      (t.description || "").replace(/"/g, '""'),
      String(t.amount).replace(".", ",")
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    download("﻿" + csv, `movimenti-${todayStr()}.csv`, "text/csv");
    toast("CSV esportato");
  }
  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.transactions) throw new Error("Formato non valido");
        if (!confirm("Importare questo backup? I dati attuali verranno sostituiti.")) return;
        state = {
          transactions: data.transactions || [],
          categories: {
            expense: (data.categories && data.categories.expense) || DEFAULTS.categories.expense.slice(),
            income: (data.categories && data.categories.income) || DEFAULTS.categories.income.slice()
          },
          budgets: data.budgets || {},
          theme: data.theme || state.theme
        };
        save();
        applyTheme();
        renderAll();
        toast("Backup importato");
      } catch (err) {
        toast("File non valido");
      }
    };
    reader.readAsText(file);
  }
  function resetData() {
    if (!confirm("Vuoi cancellare TUTTI i dati? L'operazione è irreversibile.")) return;
    if (!confirm("Conferma definitiva: tutti i movimenti, categorie e budget verranno eliminati.")) return;
    state = structuredCloneSafe(DEFAULTS);
    state.theme = document.documentElement.getAttribute("data-theme") || "light";
    save();
    renderAll();
    toast("Dati cancellati");
  }

  /* ---------- Tema ---------- */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    $("#themeToggle").textContent = state.theme === "dark" ? "☀️ Tema" : "🌙 Tema";
  }
  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    save();
    renderAll(); // ridisegna i grafici con i nuovi colori
  }

  /* ---------- Navigazione viste ---------- */
  function switchView(name) {
    $$(".view").forEach((v) => v.classList.remove("active"));
    $(`#view-${name}`).classList.add("active");
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.view === name));
    closeSidebar();
    // ridisegna grafici della vista appena mostrata
    requestAnimationFrame(renderAll);
  }

  function openSidebar() { $("#sidebar").classList.add("open"); $("#overlay").classList.add("show"); }
  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#overlay").classList.remove("show"); }

  /* ---------- Event binding ---------- */
  function bind() {
    // navigazione
    $$("[data-view]").forEach((el) => el.addEventListener("click", () => switchView(el.dataset.view)));

    // mese
    $("#prevMonth").addEventListener("click", () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderAll(); });
    $("#nextMonth").addEventListener("click", () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderAll(); });

    // modale
    $("#openAddBtn").addEventListener("click", () => openModal(null));
    $("#closeModal").addEventListener("click", closeModal);
    $("#cancelModal").addEventListener("click", closeModal);
    $("#txModal").addEventListener("click", (e) => { if (e.target.id === "txModal") closeModal(); });
    $("#txForm").addEventListener("submit", submitTx);
    $$('input[name="txType"]').forEach((r) => r.addEventListener("change", () => fillCategorySelect(currentType())));

    // lista movimenti (delega)
    document.body.addEventListener("click", (e) => {
      const del = e.target.closest("[data-del]");
      const edit = e.target.closest("[data-edit]");
      const delcat = e.target.closest("[data-delcat]");
      if (del) deleteTx(del.dataset.del);
      if (edit) { const t = state.transactions.find((x) => x.id === edit.dataset.edit); if (t) openModal(t); }
      if (delcat) removeCategory(delcat.dataset.cattype, delcat.dataset.delcat);
    });

    // budget input (delega su change)
    $("#budgetList").addEventListener("change", (e) => {
      const input = e.target.closest("[data-budget]");
      if (!input) return;
      const cat = input.dataset.budget;
      const val = parseFloat(input.value);
      if (val > 0) state.budgets[cat] = val; else delete state.budgets[cat];
      save();
      renderBudget();
    });

    // filtri
    $("#searchTx").addEventListener("input", (e) => { filters.search = e.target.value; renderTransactions(); });
    $("#filterType").addEventListener("change", (e) => { filters.type = e.target.value; renderTransactions(); });
    $("#filterCategory").addEventListener("change", (e) => { filters.category = e.target.value; renderTransactions(); });

    // categorie
    $("#addExpenseCat").addEventListener("click", () => { addCategory("expense", $("#newExpenseCat").value); $("#newExpenseCat").value = ""; });
    $("#addIncomeCat").addEventListener("click", () => { addCategory("income", $("#newIncomeCat").value); $("#newIncomeCat").value = ""; });
    $("#newExpenseCat").addEventListener("keydown", (e) => { if (e.key === "Enter") { addCategory("expense", e.target.value); e.target.value = ""; } });
    $("#newIncomeCat").addEventListener("keydown", (e) => { if (e.key === "Enter") { addCategory("income", e.target.value); e.target.value = ""; } });

    // dati
    $("#exportJson").addEventListener("click", exportJson);
    $("#exportCsv").addEventListener("click", exportCsv);
    $("#importFile").addEventListener("change", (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ""; });
    $("#resetData").addEventListener("click", resetData);

    // tema
    $("#themeToggle").addEventListener("click", toggleTheme);

    // sidebar mobile
    $("#menuBtn").addEventListener("click", openSidebar);
    $("#overlay").addEventListener("click", closeSidebar);

    // tastiera
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
      if (e.key === "n" && !isTyping(e) && !$("#txModal").classList.contains("open")) { e.preventDefault(); openModal(null); }
    });

    // ridisegna grafici al ridimensionamento
    let rz;
    window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(renderAll, 150); });
  }
  function isTyping(e) {
    const t = e.target.tagName;
    return t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
  }

  /* ---------- Avvio ---------- */
  function seedDemoIfEmpty() {
    if (state.transactions.length > 0) return;
    // dati dimostrativi per il mese corrente e precedente
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const mk = (yy, mm, dd) => `${yy}-${String(mm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    const demo = [
      { type: "income", amount: 1800, category: "Stipendio", description: "Stipendio mensile", date: mk(y, m, 1) },
      { type: "expense", amount: 650, category: "Casa", description: "Affitto", date: mk(y, m, 2) },
      { type: "expense", amount: 220, category: "Alimentari", description: "Spesa settimanale", date: mk(y, m, 5) },
      { type: "expense", amount: 90, category: "Bollette", description: "Luce e gas", date: mk(y, m, 8) },
      { type: "expense", amount: 45, category: "Trasporti", description: "Carburante", date: mk(y, m, 10) },
      { type: "expense", amount: 60, category: "Ristoranti", description: "Cena fuori", date: mk(y, m, 12) },
      { type: "income", amount: 150, category: "Rimborsi", description: "Rimborso spese", date: mk(y, m, 15) },
      { type: "expense", amount: 35, category: "Svago", description: "Cinema e abbonamenti", date: mk(y, m, 16) }
    ];
    state.transactions = demo.map((d, i) => ({
      ...d,
      id: "demo" + i,
      createdAt: Date.now() + i
    }));
    // budget di esempio
    state.budgets = { "Casa": 700, "Alimentari": 300, "Bollette": 120, "Ristoranti": 120, "Trasporti": 100, "Svago": 80 };
    save();
  }

  function init() {
    applyTheme();
    seedDemoIfEmpty();
    bind();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
