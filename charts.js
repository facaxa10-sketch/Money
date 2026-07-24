/* Piccola libreria di grafici su <canvas> — nessuna dipendenza esterna.
   Espone window.NChart con: doughnut() e bars(). */
(function () {
  "use strict";

  function setupCanvas(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.clientWidth || 300;
    const h = rect.height || canvas.clientHeight || 200;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, w, h };
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function fmtEuro(n) {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
  }

  // Gestione tooltip condiviso
  function ensureTooltip() {
    let tip = document.getElementById("__chartTip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "__chartTip";
      tip.style.cssText =
        "position:fixed;pointer-events:none;z-index:500;background:#1e293b;color:#fff;" +
        "padding:6px 10px;border-radius:8px;font-size:12.5px;font-weight:600;opacity:0;" +
        "transition:opacity .12s;box-shadow:0 4px 12px rgba(0,0,0,.25);white-space:nowrap;";
      document.body.appendChild(tip);
    }
    return tip;
  }
  function showTip(x, y, html) {
    const tip = ensureTooltip();
    tip.innerHTML = html;
    tip.style.left = x + 12 + "px";
    tip.style.top = y + 12 + "px";
    tip.style.opacity = "1";
  }
  function hideTip() {
    const tip = document.getElementById("__chartTip");
    if (tip) tip.style.opacity = "0";
  }

  /* ---------- DOUGHNUT ---------- */
  function doughnut(canvas, data) {
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total <= 0) return;

    const legendW = Math.min(200, w * 0.42);
    const cx = (w - legendW) / 2;
    const cy = h / 2;
    const r = Math.min((w - legendW) / 2, h / 2) - 8;
    const inner = r * 0.6;
    const slices = [];
    let start = -Math.PI / 2;

    data.forEach((d) => {
      const angle = (d.value / total) * Math.PI * 2;
      const end = start + angle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      slices.push({ start, end, d });
      start = end;
    });

    // buco centrale
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // totale al centro
    ctx.fillStyle = cssVar("--text");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 15px -apple-system, sans-serif";
    ctx.fillText(fmtEuro(total), cx, cy);

    // legenda
    const lx = w - legendW + 10;
    let ly = Math.max(14, cy - (data.length * 22) / 2);
    ctx.textAlign = "left";
    ctx.font = "600 12.5px -apple-system, sans-serif";
    data.forEach((d) => {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(lx, ly - 6, 12, 12, 3) : ctx.rect(lx, ly - 6, 12, 12);
      ctx.fill();
      ctx.fillStyle = cssVar("--text");
      const pct = Math.round((d.value / total) * 100);
      let label = d.label;
      if (label.length > 14) label = label.slice(0, 13) + "…";
      ctx.fillText(`${label} · ${pct}%`, lx + 18, ly);
      ly += 22;
    });

    attachDoughnutHover(canvas, cx, cy, r, inner, slices, total);
  }

  function attachDoughnutHover(canvas, cx, cy, r, inner, slices, total) {
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < inner || dist > r) { hideTip(); return; }
      let a = Math.atan2(dy, dx);
      if (a < -Math.PI / 2) a += Math.PI * 2;
      const hit = slices.find((s) => a >= s.start && a < s.end);
      if (hit) {
        const pct = Math.round((hit.d.value / total) * 100);
        showTip(e.clientX, e.clientY, `${hit.d.label}<br>${fmtEuro(hit.d.value)} · ${pct}%`);
      } else hideTip();
    };
    canvas.onmouseleave = hideTip;
  }

  /* ---------- BARS (raggruppate) ---------- */
  function bars(canvas, cfg) {
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const labels = cfg.labels;
    const series = cfg.series;
    const padL = 52, padR = 12, padT = 12, padB = 34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    let max = 0;
    labels.forEach((_, i) => series.forEach((s) => { max = Math.max(max, s.values[i] || 0); }));
    if (max <= 0) max = 1;
    const niceMax = niceCeil(max);

    // griglia + assi Y
    ctx.strokeStyle = cssVar("--border");
    ctx.fillStyle = cssVar("--text-muted");
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const val = (niceMax / steps) * i;
      const y = padT + plotH - (val / niceMax) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(shortNum(val), padL - 8, y);
    }

    const groupW = plotW / labels.length;
    const barGap = 4;
    const barW = Math.min(28, (groupW - 12) / series.length - barGap);
    const rects = [];

    labels.forEach((lab, i) => {
      const gx = padL + groupW * i + groupW / 2;
      const totalBarsW = series.length * barW + (series.length - 1) * barGap;
      let bx = gx - totalBarsW / 2;
      series.forEach((s) => {
        const val = s.values[i] || 0;
        const bh = (val / niceMax) * plotH;
        const by = padT + plotH - bh;
        ctx.fillStyle = s.color;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(bx, by, barW, bh, [4, 4, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(bx, by, barW, bh);
        }
        rects.push({ x: bx, y: by, w: barW, h: bh, name: s.name, val, label: lab, color: s.color });
        bx += barW + barGap;
      });
      // etichetta X
      ctx.fillStyle = cssVar("--text-muted");
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "11px -apple-system, sans-serif";
      ctx.fillText(lab, gx, padT + plotH + 8);
    });

    attachBarHover(canvas, rects);
  }

  function attachBarHover(canvas, rects) {
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = rects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y - 2 && y <= r.y + r.h);
      if (hit) {
        showTip(e.clientX, e.clientY, `${hit.label} — ${hit.name}<br>${fmtEuro(hit.val)}`);
      } else hideTip();
    };
    canvas.onmouseleave = hideTip;
  }

  function niceCeil(n) {
    const pow = Math.pow(10, Math.floor(Math.log10(n)));
    const d = n / pow;
    let nice;
    if (d <= 1) nice = 1; else if (d <= 2) nice = 2; else if (d <= 5) nice = 5; else nice = 10;
    return nice * pow;
  }
  function shortNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
    return String(Math.round(n));
  }

  window.NChart = { doughnut, bars };
})();
