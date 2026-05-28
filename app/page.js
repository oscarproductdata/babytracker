"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";

const TIMEZONE = "Europe/Stockholm";

const THEME = {
  bg:          'var(--bg)',
  bg2:         'var(--bg2)',
  border:      'var(--border)',
  borderHover: 'var(--border-hover)',
  text:        'var(--text)',
  textMuted:   'var(--text-muted)',
  textFaint:   'var(--text-faint)',
  accent:      'var(--text)',
  accentDark:  'var(--text)',
  danger:      '#FF0004',
  timer:       '#16AF5D',
  timerStop:   '#1a1916',
  chartGrid:   'var(--border)',
  chartTick:   'var(--text-faint)',
  categories: {
    'Ersättning': { base: '#009855', chart: 'rgba(0,152,85,0.25)',   card: '#e8f4ee', text: '#1b4332' },
    'Amning':     { base: '#E7005D', chart: 'rgba(231,0,93,0.25)',   card: '#fdf2f8', text: '#6b0f35' },
    'Vikt':       { base: '#0C79DE', chart: 'rgba(12,121,222,0.25)', card: '#E6F3FF', text: '#0068C8' },
    'Bajs':       { base: '#713F12', chart: 'rgba(116,50,0,0.25)',   card: '#fef3c7', text: '#78350f' },
    'Kiss':       { base: '#F4A600', chart: 'rgba(244,166,0,0.25)',  card: '#fefce8', text: '#713f12' },
    'Promenad':   { base: '#F4A600', chart: 'rgba(244,166,0,0.25)',  card: '#fefce8', text: '#713f12' },
  },
  categoryDefault: { base: '#6b6860', chart: 'rgba(107,104,96,0.25)', card: '#f1efe8', text: '#44403c' },
};

function getCat(cat) { return THEME.categories[cat] || THEME.categoryDefault; }
function displayCat(cat, emojiMap) {
  const emoji = emojiMap?.[cat];
  return emoji ? `${emoji} ${cat}` : cat;
}
function CatLabel({ cat, emojiMap, style }) {
  const emoji = emojiMap?.[cat];
  return (
    <span style={style}>
      {emoji && <span>{emoji}</span>}
      {emoji && <span style={{ position: 'relative', top: 1 }}> {cat}</span>}
      {!emoji && cat}
    </span>
  );
}
function CountUp({ value, from, delay = 0 }) {
  const [display, setDisplay] = useState(from);
  useEffect(() => {
    const duration = 1000;
    const start = performance.now() + delay;
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
    let raf;
    function step(now) {
      if (now < start) { raf = requestAnimationFrame(step); return; }
      const t = Math.min((now - start) / duration, 1);
      setDisplay(Math.round(from + easeOut(t) * (value - from)));
      if (t < 1) raf = requestAnimationFrame(step);
      else setDisplay(value);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>{display}</span>;
}

const CATEGORY_UNITS = {};


const DEFAULT_CATEGORIES = [
  { name: 'Amning', emoji: '🤱', unit: 'min' },
  { name: 'Vikt', emoji: '⚖️', unit: 'gram' },
  { name: 'Bajs', emoji: '💩', unit: 'n/a' },
  { name: 'Kiss', emoji: '💧', unit: 'n/a' },
  { name: 'Ersättning', emoji: '🍼', unit: 'ml' },
];

function timeSince(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return h + 'h ' + (m > 0 ? m + 'min' : '');
  const d = Math.floor(h / 24), rh = h % 24;
  return d + 'd ' + rh + 'h ' + (m > 0 ? m + 'min' : '');
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE });
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('sv-SE', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TIMEZONE });
}

function pad(n) { return String(n).padStart(2, '0'); }

function toDatetimeLocal(ts) {
  const d = new Date(ts);
  const opts = { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
  const parts = new Intl.DateTimeFormat('sv-SE', opts).formatToParts(d);
  const get = t => parts.find(p => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function nowStockholm() { return toDatetimeLocal(Date.now()); }

const TrendChart = memo(function TrendChart({ entries, categories, emojiMap, darkMode }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const chartCats = categories.filter(c => c.name !== 'Vikt');
  const [activeCat, setActiveCat] = useState(chartCats[0]?.name || 'Amning');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.Chart || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const timeout = setTimeout(() => {
      const resolvedTick = getComputedStyle(document.documentElement).getPropertyValue('--text-faint').trim();
      const resolvedGrid = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
      const days = 7;
      const labels = [];
      const data = [];
      const counts = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('sv-SE', { weekday: 'short', timeZone: TIMEZONE }));
        const start = new Date(d.toLocaleDateString('sv-SE', { timeZone: TIMEZONE })).getTime();
        const end = start + 86400000;
        const dayEntries = entries.filter(e => e.what === activeCat && e.time >= start && e.time < end);
        const total = dayEntries.reduce((s, e) => {
          if (e.amountL || e.amountR) return s + (parseFloat(e.amountL) || 0) + (parseFloat(e.amountR) || 0);
          return s + (parseFloat(e.amount) || 0);
        }, 0);
        data.push(total);
        counts.push(dayEntries.length);
      }
      const cat = getCat(activeCat);
      const hasAmounts = data.some(v => v > 0);
      chartRef.current = new window.Chart(canvasRef.current, {
        type: 'bar',
        data: { labels, datasets: [
          ...(hasAmounts ? [{ label: 'Minuter', data, backgroundColor: cat.chart, borderColor: cat.base, borderWidth: 1.5, borderRadius: 6, yAxisID: 'y' }] : []),
          { label: 'Antal', data: counts, type: 'line', borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: 'rgba(255,255,255,0.7)', tension: 0.3, fill: false, yAxisID: hasAmounts ? 'y2' : 'y' },
        ]},
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, labels: { color: resolvedTick, font: { size: 11 }, boxWidth: 12 } } },
          scales: {
            x: { ticks: { color: resolvedTick, font: { size: 11 } }, grid: { color: resolvedGrid } },
            y: { ticks: { color: resolvedTick, font: { size: 11 } }, grid: { color: resolvedGrid }, beginAtZero: true, position: 'left' },
            ...(hasAmounts ? { y2: { ticks: { color: resolvedTick, font: { size: 11 } }, grid: { display: false }, beginAtZero: true, position: 'right' } } : {}),
          }
        }
      });
    }, 50);
    return () => clearTimeout(timeout);
  }, [activeCat, entries, darkMode]);

  return (
    <div style={S.chartCard}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {chartCats.map(c => {
          const theme = getCat(c.name);
          const isActive = activeCat === c.name;
          return (
            <button key={c.name} onClick={() => setActiveCat(c.name)} style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 20,
              border: '1px solid ' + (isActive ? theme.base : THEME.borderHover),
              background: isActive ? theme.base : 'none',
              color: isActive ? 'white' : THEME.textMuted,
              cursor: 'pointer',
            }}>{displayCat(c.name, emojiMap)}</button>
          );
        })}
      </div>
      <div style={{ position: 'relative', height: 180 }}>
        <canvas ref={canvasRef} role="img" aria-label="Trendgraf" />
      </div>
    </div>
  );
});

const GrowthChart = memo(function GrowthChart({ entries, birthTs, darkMode, child }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [range, setRange] = useState(13);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.Chart || !canvasRef.current || !birthTs) return;
    if (chartRef.current) chartRef.current.destroy();
    const timeout = setTimeout(() => {
      const resolvedTick = getComputedStyle(document.documentElement).getPropertyValue('--text-faint').trim();
      const resolvedGrid = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();

      // WHO girls percentiles — one point per week, x = days from birth
      const whoWeeks = Array.from({ length: 53 }, (_, i) => i);
      const p3  = [2.40,2.52,2.76,2.97,3.15,3.31,3.46,3.59,3.72,3.84,3.95,4.06,4.16,4.26,4.36,4.45,4.54,4.63,4.71,4.80,4.88,4.95,5.03,5.10,5.17,5.24,5.31,5.37,5.44,5.50,5.56,5.62,5.68,5.73,5.79,5.84,5.89,5.94,5.99,6.04,6.09,6.13,6.18,6.22,6.27,6.31,6.35,6.40,6.44,6.48,6.52,6.56,6.60];
      const p15 = [2.76,2.93,3.21,3.46,3.68,3.88,4.06,4.22,4.38,4.52,4.66,4.79,4.91,5.03,5.14,5.25,5.35,5.45,5.55,5.64,5.73,5.82,5.90,5.99,6.07,6.14,6.22,6.30,6.37,6.44,6.51,6.58,6.65,6.71,6.78,6.84,6.90,6.97,7.03,7.09,7.14,7.20,7.26,7.31,7.37,7.42,7.47,7.53,7.58,7.63,7.68,7.73,7.78];
      const p50 = [3.23,3.44,3.76,4.05,4.30,4.53,4.73,4.92,5.09,5.26,5.42,5.57,5.71,5.85,5.98,6.11,6.23,6.35,6.46,6.57,6.68,6.78,6.88,6.98,7.07,7.16,7.25,7.34,7.43,7.51,7.59,7.67,7.75,7.83,7.90,7.98,8.05,8.12,8.19,8.26,8.33,8.40,8.46,8.53,8.59,8.65,8.71,8.78,8.84,8.90,8.95,9.01,9.07];
      const p85 = [3.71,3.96,4.33,4.66,4.95,5.22,5.46,5.68,5.88,6.07,6.25,6.42,6.58,6.74,6.89,7.03,7.17,7.30,7.43,7.55,7.67,7.79,7.90,8.01,8.12,8.22,8.32,8.42,8.52,8.61,8.70,8.79,8.88,8.97,9.05,9.14,9.22,9.30,9.38,9.46,9.54,9.61,9.69,9.76,9.84,9.91,9.98,10.05,10.12,10.19,10.26,10.33,10.40];
      const p97 = [4.01,4.29,4.70,5.06,5.38,5.67,5.93,6.17,6.39,6.59,6.78,6.97,7.14,7.31,7.47,7.63,7.77,7.92,8.05,8.19,8.31,8.44,8.56,8.68,8.79,8.90,9.01,9.11,9.22,9.32,9.41,9.51,9.60,9.70,9.79,9.88,9.97,10.05,10.14,10.22,10.31,10.39,10.47,10.55,10.63,10.71,10.78,10.86,10.94,11.01,11.08,11.15,11.23];

      const toPoint = (w, val) => ({ x: w * 7, y: val });

      // Ellie's actual weigh-ins
      const viktEntries = entries.filter(e => e.what === 'Vikt' && e.amount).sort((a,b) => a.time - b.time);
      const dipCutoff = 14; // days

      const dipPoints = [];
      const normalPoints = [];
      viktEntries.forEach(e => {
        const dayAge = (e.time - birthTs) / (24 * 3600 * 1000);
        const kg = parseFloat(e.amount) > 100 ? parseFloat(e.amount) / 1000 : parseFloat(e.amount);
        if (dayAge <= dipCutoff) dipPoints.push({ x: dayAge, y: kg });
        else normalPoints.push({ x: dayAge, y: kg });
      });

      // Show latest weight as standalone solid dot, no shared points
      const lastEntry = viktEntries[viktEntries.length - 1];
      if (lastEntry) {
        const dayAge = (lastEntry.time - birthTs) / (24 * 3600 * 1000);
        const kg = parseFloat(lastEntry.amount) > 100 ? parseFloat(lastEntry.amount) / 1000 : parseFloat(lastEntry.amount);
        normalPoints.push({ x: dayAge, y: kg });
        // Remove from dipPoints if it's there to avoid overlap
        const dipIdx = dipPoints.findIndex(p => p.x === dayAge && p.y === kg);
        if (dipIdx >= 0) dipPoints.splice(dipIdx, 1);
      }

      const getWeightColor = (point, p3, p15, p85, p97) => {
        if (!point) return '#16AF5D';
        const weekIndex = Math.round(point.x / 7);
        if (weekIndex < 0 || weekIndex >= p3.length) return '#16AF5D';
        const w = point.y;
        if (w < p3[weekIndex] || w > p97[weekIndex]) return '#FF0004';
        if (w < p15[weekIndex] || w > p85[weekIndex]) return '#F4A600';
        return '#16AF5D';
      };

      chartRef.current = new window.Chart(canvasRef.current, {
        data: {
          datasets: [
            { type: 'line', data: whoWeeks.map((w,i) => toPoint(w, p97[i])), borderColor: 'rgba(55,138,221,0.75)', borderWidth: 1.5, borderDash: [5,4], backgroundColor: 'transparent', pointRadius: 0, tension: 0.3, fill: false },
            { type: 'line', data: whoWeeks.map((w,i) => toPoint(w, p85[i])), borderColor: 'rgba(55,138,221,0.2)', borderWidth: 0, backgroundColor: 'rgba(55,138,221,0.3)', pointRadius: 0, tension: 0, fill: '+1' },
            { type: 'line', data: whoWeeks.map((w,i) => toPoint(w, p50[i])), borderColor: '#378ADD', borderWidth: 2.5, backgroundColor: 'rgba(55,138,221,0.3)', pointRadius: 0, tension: 0, fill: '+1' },
            { type: 'line', data: whoWeeks.map((w,i) => toPoint(w, p15[i])), borderColor: 'rgba(55,138,221,0.15)', borderWidth: 0, backgroundColor: 'transparent', pointRadius: 0, tension: 0.3, fill: false },
            { type: 'line', data: whoWeeks.map((w,i) => toPoint(w, p3[i])), borderColor: 'rgba(55,138,221,0.75)', borderWidth: 1.5, borderDash: [5,4], backgroundColor: 'transparent', pointRadius: 0, tension: 0.3, fill: false },
            { type: 'scatter', label: 'Viktdipp', data: dipPoints, borderColor: 'rgba(150,150,150,0.6)', backgroundColor: 'rgba(150,150,150,0.4)', pointRadius: 5, pointHoverRadius: 7, pointStyle: 'circle', showLine: true, borderDash: [4,3], tension: 0, spanGaps: false },
            { type: 'scatter', label: 'Ellie', data: normalPoints, borderColor: normalPoints.map(p => getWeightColor(p, p3, p15, p85, p97)), backgroundColor: normalPoints.map(p => getWeightColor(p, p3, p15, p85, p97)), pointRadius: 6, pointHoverRadius: 8, showLine: true, tension: 0 },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: ctx => {
                  const d = new Date(birthTs + ctx[0].parsed.x * 24 * 3600 * 1000);
                  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: TIMEZONE });
                },
                label: ctx => {
                  if (ctx.dataset.label === 'Ellie') return `Ellie: ${ctx.parsed.y.toFixed(2)} kg`;
                  if (ctx.dataset.label === 'Viktdipp') return `Viktdipp: ${ctx.parsed.y.toFixed(2)} kg`;
                  return null;
                },
                filter: item => item.dataset.label === 'Ellie' || item.dataset.label === 'Viktdipp',
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              min: 0,
              max: range * 7,
              grid: { color: resolvedGrid },
              ticks: {
                color: resolvedTick, font: { size: 10 }, maxRotation: 45,
                stepSize: 7,
                callback: (val) => {
                  const week = val / 7;
                  if (Number.isInteger(week)) {
                    const d = new Date(birthTs + val * 24 * 3600 * 1000);
                    return `V${week} · ${d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: TIMEZONE })}`;
                  }
                  return '';
                }
              }
            },
            y: {
              grid: { color: resolvedGrid },
              ticks: { color: resolvedTick, font: { size: 11 }, callback: v => v.toFixed(1)+' kg' },
            }
          }
        }
      });
    }, 50);
    return () => clearTimeout(timeout);
  }, [entries, birthTs, darkMode, range]);

  return (
    <div style={S.chartCard}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: THEME.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tillväxtkurva</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[4, 8, 13, 26, 52].map(w => (
              <button key={w} onClick={() => setRange(w)} style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 20,
                border: '1px solid ' + (range === w ? THEME.text : THEME.border),
                background: range === w ? THEME.text : 'none',
                color: range === w ? THEME.bg : THEME.textMuted,
                cursor: 'pointer',
              }}>{w}v</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: THEME.textFaint, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 16, height: 3, background: '#378ADD', display: 'inline-block', borderRadius: 2 }}></span>p50</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 16, height: 8, background: 'rgba(55,138,221,0.15)', display: 'inline-block', borderRadius: 2 }}></span>p15–p85</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: '#16AF5D', display: 'inline-block', borderRadius: '50%' }}></span>Normal</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: '#F4A600', display: 'inline-block', borderRadius: '50%' }}></span>Bevaka</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: '#FF0004', display: 'inline-block', borderRadius: '50%' }}></span>Utanför</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 16, height: 0, borderTop: '2px dashed rgba(150,150,150,0.6)', display: 'inline-block' }}></span>Viktdipp</span>
        </div>
      </div>
      {(() => {
        const lastVikt = entries.filter(e => e.what === 'Vikt' && e.amount).sort((a,b) => b.time - a.time)[0];
        if (!lastVikt || !birthTs) return null;
        const dayAge = (lastVikt.time - birthTs) / (24 * 3600 * 1000);
        const weekIndex = Math.round(dayAge / 7);
        const actualKg = parseFloat(lastVikt.amount) > 100 ? parseFloat(lastVikt.amount) / 1000 : parseFloat(lastVikt.amount);
        const p50vals = [3.23,3.44,3.76,4.05,4.30,4.53,4.73,4.92,5.09,5.26,5.42,5.57,5.71,5.85,5.98,6.11,6.23,6.35,6.46,6.57,6.68,6.78,6.88,6.98,7.07,7.16,7.25,7.34,7.43,7.51,7.59,7.67,7.75,7.83,7.90,7.98,8.05,8.12,8.19,8.26,8.33,8.40,8.46,8.53,8.59,8.65,8.71,8.78,8.84,8.90,8.95,9.01,9.07];
        const exactWeek = dayAge / 7;
        const weekFloor = Math.floor(exactWeek);
        const weekCeil = Math.min(weekFloor + 1, p50vals.length - 1);
        const fraction = exactWeek - weekFloor;
        const medianKg = p50vals[weekFloor] + fraction * (p50vals[weekCeil] - p50vals[weekFloor]);
        const isDipPeriod = dayAge <= 14;
        const birthVikt = entries.filter(e => e.what === 'Vikt' && e.amount).sort((a,b) => a.time - b.time)[0];
        const birthKg = birthVikt ? (parseFloat(birthVikt.amount) > 100 ? parseFloat(birthVikt.amount) / 1000 : parseFloat(birthVikt.amount)) : null;
        const pctOfBirth = birthKg ? (actualKg / birthKg) * 100 : null;
        const diff = actualKg - medianKg;

        // During dip period: color based on % of birth weight
        // >93% green, 90-93% yellow, <90% red
        const dipColor = pctOfBirth >= 93 ? THEME.timer : pctOfBirth >= 90 ? '#F4A600' : '#FF0004';
        const diffColor = Math.abs(diff) < 0.2 ? THEME.timer : diff < 0 ? '#F4A600' : THEME.timer;

        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ background: THEME.bg, borderRadius: 10, padding: '10px 14px', border: '1px solid ' + THEME.border }}>
            <div style={{ fontSize: 11, color: THEME.textFaint, marginBottom: 4 }}>{child?.firstName || 'Barnets'} vikt</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: THEME.text }}>{actualKg.toFixed(2)} kg</div>
              <div style={{ fontSize: 11, color: THEME.textMuted, marginTop: 2 }}>{new Date(lastVikt.time).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: TIMEZONE })}</div>
            </div>
            {isDipPeriod ? (
              <div style={{ background: THEME.bg, borderRadius: 10, padding: '10px 14px', border: '1px solid ' + THEME.border }}>
                <div style={{ fontSize: 11, color: THEME.textFaint, marginBottom: 4 }}>% av födelsevikt</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: dipColor }}>{pctOfBirth?.toFixed(1)}%</div>
                <div style={{ fontSize: 11, color: THEME.textMuted, marginTop: 2 }}>
                  {pctOfBirth >= 93 ? '✓ Normal' : pctOfBirth >= 90 ? '⚠ Bevaka' : '✗ Kontakta BVC'}
                </div>
              </div>
            ) : (
              <div style={{ background: THEME.bg, borderRadius: 10, padding: '10px 14px', border: '1px solid ' + THEME.border }}>
                <div style={{ fontSize: 11, color: THEME.textFaint, marginBottom: 4 }}>p50 dag {Math.round(dayAge)} (v{exactWeek.toFixed(1)})</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: THEME.text }}>{medianKg.toFixed(2)} kg</div>
                <div style={{ fontSize: 11, color: diffColor, marginTop: 2 }}>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} kg vs median</div>
              </div>
            )}
          </div>
        );
      })()}
      <div style={{ position: 'relative', height: 200 }}>
        <canvas ref={canvasRef} role="img" aria-label="Tillväxtkurva" />
      </div>
    </div>
  );
});

const WeightChart = memo(function WeightChart({ entries, darkMode }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const cat = getCat('Vikt');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.Chart || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const timeout = setTimeout(() => {
      const resolvedTick = getComputedStyle(document.documentElement).getPropertyValue('--text-faint').trim();
      const resolvedGrid = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
      const weightData = entries.filter(e => e.what === 'Vikt' && e.amount).sort((a, b) => a.time - b.time);
      if (!weightData.length) return;
      const labels = weightData.map(e => new Date(e.time).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric', timeZone: TIMEZONE }));
      const data = weightData.map(e => parseFloat(e.amount));
      chartRef.current = new window.Chart(canvasRef.current, {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: cat.base, backgroundColor: cat.chart, borderWidth: 2, pointRadius: 4, pointBackgroundColor: cat.base, tension: 0.3, fill: true }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: resolvedTick, font: { size: 11 }, maxRotation: 45 }, grid: { color: resolvedGrid } },
            y: { ticks: { color: resolvedTick, font: { size: 11 } }, grid: { color: resolvedGrid } }
          }
        }
      });
    }, 50);
    return () => clearTimeout(timeout);
  }, [entries, darkMode]);

  return (
    <div style={S.chartCard}>
      <div style={{ position: 'relative', height: 180 }}>
        <canvas ref={canvasRef} role="img" aria-label="Viktutveckling" />
      </div>
    </div>
  );
});

const LengthChart = memo(function LengthChart({ entries, darkMode }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const cat = getCat('Längd');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.Chart || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const timeout = setTimeout(() => {
      const resolvedTick = getComputedStyle(document.documentElement).getPropertyValue('--text-faint').trim();
      const resolvedGrid = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
      const lengthData = entries.filter(e => e.what === 'Längd' && e.amount).sort((a, b) => a.time - b.time);
      if (!lengthData.length) return;
      const labels = lengthData.map(e => new Date(e.time).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric', timeZone: TIMEZONE }));
      const data = lengthData.map(e => parseFloat(e.amount));
      chartRef.current = new window.Chart(canvasRef.current, {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: cat.base, backgroundColor: cat.chart, borderWidth: 2, pointRadius: 4, pointBackgroundColor: cat.base, tension: 0.3, fill: true }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: resolvedTick, font: { size: 11 }, maxRotation: 45 }, grid: { color: resolvedGrid } },
            y: { ticks: { color: resolvedTick, font: { size: 11 } }, grid: { color: resolvedGrid } }
          }
        }
      });
    }, 50);
    return () => clearTimeout(timeout);
  }, [entries, darkMode]);

  return (
    <div style={S.chartCard}>
      <div style={{ position: 'relative', height: 180 }}>
        <canvas ref={canvasRef} role="img" aria-label="Längdutveckling" />
      </div>
    </div>
  );
});

function ChildSelector({ children, selectedChild, onSelect }) {
  if (!children || children.length <= 1) return null;
  return (
    <div className="cat-tabs" style={{ overflowX: 'auto', display: 'flex', gap: 8, padding: '0 16px 12px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {children.map(c => {
        const isActive = selectedChild?.child_id === c.child_id;
        return (
          <button key={c.child_id} onClick={() => onSelect(c)} style={{
            flexShrink: 0, padding: '8px 16px', borderRadius: 20,
            border: '1px solid ' + (isActive ? THEME.text : THEME.border),
            background: isActive ? THEME.text : THEME.bg2,
            color: isActive ? THEME.bg : THEME.text,
            fontSize: 13, fontWeight: isActive ? 600 : 400,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            transition: 'all 0.15s', whiteSpace: 'nowrap'
          }}>{c.emoji || '👶'} {c.firstName}</button>
        );
      })}
    </div>
  );
}

export default function App() {
  const { data: session, status } = useSession();
  const [page, setPage] = useState('dashboard');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [toast, setToast] = useState('');
  const [editEntry, setEditEntry] = useState(null);
  const [form, setForm] = useState({ what: '', time: '', amount: '', unit: 'n/a', child_id: 'ellie_001' });
  const [chartJsLoaded, setChartJsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timers, setTimers] = useState({});
  const [birthTs, setBirthTs] = useState(null);
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [showAddChild, setShowAddChild] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    const restored = {};
    Object.keys(localStorage).filter(k => k.startsWith('timer_') && !k.startsWith('timer_child_')).forEach(savedKey => {
      const cat = savedKey.replace('timer_', '');
      const start = parseInt(localStorage.getItem(savedKey));
      const child_id = localStorage.getItem('timer_child_' + cat) || null;
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const interval = setInterval(() => {
        setTimers(t => ({ ...t, [cat]: { ...t[cat], elapsed: Math.floor((Date.now() - start) / 1000) } }));
      }, 1000);
      restored[cat] = { start, elapsed, running: true, interval, child_id };
    });
    if (Object.keys(restored).length > 0) setTimers(restored);
  }, []);



  const emojiMap = Object.fromEntries(categories.map(c => [c.name, c.emoji]));
  const unitMap = Object.fromEntries(categories.map(c => [c.name, c.unit || 'n/a']));
  const timerRunning = Object.values(timers).some(t => t.running);
  const activeTimerCats = Object.keys(timers);

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.Chart) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      script.onload = () => setChartJsLoaded(true);
      document.head.appendChild(script);
    } else if (typeof window !== 'undefined' && window.Chart) {
      setChartJsLoaded(true);
    }
  }, []);

  const startTimer = (cat, child_id) => {
    if (timers[cat]?.running) return;
    if (cat === 'Amning_L' && timers['Amning_R']?.running) {
      clearInterval(timers['Amning_R'].interval);
      setTimers(t => ({ ...t, Amning_R: { ...t.Amning_R, running: false } }));
    }
    if (cat === 'Amning_R' && timers['Amning_L']?.running) {
      clearInterval(timers['Amning_L'].interval);
      setTimers(t => ({ ...t, Amning_L: { ...t.Amning_L, running: false } }));
    }
    const start = Date.now() - (timers[cat]?.elapsed || 0) * 1000;
    const timerChildId = timers[cat]?.child_id || child_id || selectedChild?.child_id;
    const interval = setInterval(() => {
      setTimers(t => ({ ...t, [cat]: { ...t[cat], elapsed: Math.floor((Date.now() - start) / 1000), running: true } }));
    }, 1000);
    setTimers(t => ({ ...t, [cat]: { start, elapsed: timers[cat]?.elapsed || 0, running: true, interval, child_id: timerChildId } }));
    localStorage.setItem('timer_' + cat, String(start));
    localStorage.setItem('timer_child_' + cat, timerChildId || '');
  };
  
  const pauseTimer = (cat) => {
    clearInterval(timers[cat]?.interval);
    setTimers(t => ({ ...t, [cat]: { ...t[cat], running: false } }));
    const side = cat.endsWith('_L') ? 'L' : cat.endsWith('_R') ? 'R' : null;
    if (side) { localStorage.setItem('last_amning_side', side); localStorage.setItem('last_amning_side_ts_' + side, String(Date.now())); }
  };
  
  const stopTimer = (cat) => {
    clearInterval(timers[cat]?.interval);
    const elapsed = timers[cat]?.elapsed || 0;
    const mins = Math.ceil(elapsed / 60);
    const baseCat = cat.replace('_L', '').replace('_R', '');
    const side = cat.endsWith('_L') ? 'L' : cat.endsWith('_R') ? 'R' : null;
    if (side) { localStorage.setItem('last_amning_side', side); localStorage.setItem('last_amning_side_ts_' + side, String(Date.now())); }
    const note = side ? `Sida: ${side}` : '';
    setForm(f => ({
        ...f,
        what: baseCat,
        time: nowStockholm(),
        amount: side ? f.amount : (mins > 0 ? String(mins) : '1'),
        amountL: side === 'L' ? (mins > 0 ? String(mins) : '1') : f.amountL,
        amountR: side === 'R' ? (mins > 0 ? String(mins) : '1') : f.amountR,
        unit: unitMap[baseCat] || 'n/a',
      }));
    setTimers(t => { const n = { ...t }; delete n[cat]; return n; });
    localStorage.removeItem('timer_' + cat);
    setPage('add');
  };
  
  const resetTimer = (cat) => {
    if (!cat) {
      Object.values(timers).forEach(t => clearInterval(t.interval));
      setTimers({});
      Object.keys(localStorage).filter(k => k.startsWith('timer_')).forEach(k => localStorage.removeItem(k));
      return;
    }
    clearInterval(timers[cat]?.interval);
    setTimers(t => { const n = { ...t }; delete n[cat]; return n; });
    localStorage.removeItem('timer_' + cat);
    localStorage.removeItem('timer_child_' + cat);
  };
  
  function formatTimer(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const fetchEntries = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('/api/entries', { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) { const data = await res.json(); setEntries(data); }
      else { const err = await res.json(); console.error('API error:', err); }
    } catch(e) { console.error('Fetch error:', e.message); }
    setLoading(false);
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        if (data.length) setCategories(data);
      }
    } catch(e) { console.error(e); }
    setCategoriesLoaded(true);
  }, []);

  const fetchChild = useCallback(async () => {
    try {
      const res = await fetch('/api/child');
      if (res.ok) {
        const data = await res.json();
        setChildren(data);
        if (data.length > 0) {
          setSelectedChild(data[0]);
          setBirthTs(data[0].birthTs);
          setForm(f => ({ ...f, child_id: data[0].child_id }));
        }
      }
    } catch(e) { console.error(e); }
  }, []);

  useEffect(() => { if (session) { fetchEntries(); fetchCategories(); fetchChild(); } }, [session, fetchEntries, fetchCategories, fetchChild]);
  useEffect(() => { 
    if (page === 'add' && !form.what && !timerRunning) {
      const defaultCat = selectedChild?.type === 'hund' ? 'Promenad' : 'Amning';
      setForm(f => ({ ...f, what: defaultCat, time: nowStockholm(), amount: '', unit: unitMap[defaultCat] || 'min', child_id: selectedChild?.child_id || f.child_id }));
    }
  }, [page, selectedChild]);

  const handleChildSelect = useCallback((c) => {
    setSelectedChild(c);
    setBirthTs(c.birthTs);
    setForm(f => ({ ...f, child_id: c.child_id }));
  }, []);

  const handleDarkModeToggle = useCallback(() => setDarkMode(d => !d), []);

  const handleCategoryClick = useCallback((cat) => {
    const unit = unitMap[cat] || 'n/a';
    setForm(f => ({ ...f, what: cat, time: nowStockholm(), amount: '', unit }));
    setPage('add');
  }, [unitMap]);

  if (status === 'loading') return <Loading />;
  if (!session) return <Login />;
  if (session && children.length === 0 && !loading) return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'-apple-system,sans-serif',background:THEME.bg,padding:20,textAlign:'center' }}>
      <div style={{ fontSize:56,marginBottom:16 }}>🍼</div>
      <h1 style={{ fontSize:24,fontWeight:700,letterSpacing:'-0.5px',marginBottom:8,color:THEME.text }}>Välkommen!</h1>
      <p style={{ fontSize:15,color:THEME.textMuted,marginBottom:32 }}>Lägg till ditt första barn för att komma igång.</p>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <AddChildForm onAdded={fetchChild} />
      </div>
    </div>
  );

  const isDog = selectedChild?.type === 'hund';
  const sortedCategories = isDog
    ? [...categories].filter(c => c.name !== 'Amning').sort((a, b) => a.name === 'Promenad' ? -1 : b.name === 'Promenad' ? 1 : 0)
    : categories;
  const catNames = sortedCategories.map(c => c.name);

  const handleCategoryChange = (cat, isEdit = false) => {
    const unit = unitMap[cat] || 'n/a';
    if (isEdit) setEditEntry(e => ({ ...e, what: cat, unit }));
    else setForm(f => ({ ...f, what: cat, unit }));
  };

  const submitEntry = async () => {
    if (!form.what || !form.time) { showToast('Välj kategori och tid'); return; }
    
    let submittedForm = { ...form, time: nowStockholm() };
  
    if (form.what === 'Amning' || activeTimerCats.includes('Amning_L') || activeTimerCats.includes('Amning_R')) {
      const lElapsed = timers['Amning_L']?.elapsed || 0;
      const rElapsed = timers['Amning_R']?.elapsed || 0;
      if (lElapsed > 0) submittedForm.amountL = String(Math.ceil(lElapsed / 60));
      if (rElapsed > 0) submittedForm.amountR = String(Math.ceil(rElapsed / 60));
      submittedForm.what = 'Amning';
      const tsL = parseInt(localStorage.getItem('last_amning_side_ts_L') || '0');
      const tsR = parseInt(localStorage.getItem('last_amning_side_ts_R') || '0');
      submittedForm.lastSide = tsL > 0 || tsR > 0 ? (tsL > tsR ? 'L' : 'R') : (lElapsed > rElapsed ? 'L' : rElapsed > lElapsed ? 'R' : null);
      ['Amning_L', 'Amning_R'].forEach(key => {
        if (timers[key]) { clearInterval(timers[key].interval); localStorage.removeItem('timer_' + key); }
      });
      setTimers(t => { const n = { ...t }; delete n['Amning_L']; delete n['Amning_R']; return n; });
    }
    if (form.what === 'Sömn') {
      const elapsed = timers['Sömn']?.elapsed || 0;
      if (elapsed > 0) submittedForm.amount = String(Math.ceil(elapsed / 60));
      if (timers['Sömn']) { clearInterval(timers['Sömn'].interval); localStorage.removeItem('timer_Sömn'); }
      setTimers(t => { const n = { ...t }; delete n['Sömn']; return n; });
    }
    if (form.what === 'Promenad') {
      const elapsed = timers['Promenad']?.elapsed || 0;
      if (elapsed > 0) submittedForm.amount = String(Math.ceil(elapsed / 60));
      if (timers['Promenad']) { clearInterval(timers['Promenad'].interval); localStorage.removeItem('timer_Promenad'); }
      setTimers(t => { const n = { ...t }; delete n['Promenad']; return n; });
    }
  
    const entryChildId = (form.what === 'Amning'
      ? timers['Amning_L']?.child_id || timers['Amning_R']?.child_id
      : timers[form.what]?.child_id) || selectedChild?.child_id || 'ellie_001';
    setSaving(true);
    const res = await fetch('/api/entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: (() => { const payload = { what: submittedForm.what, time: new Date(submittedForm.time).getTime(), amount: submittedForm.amount, unit: submittedForm.unit, amountL: submittedForm.amountL || null, amountR: submittedForm.amountR || null, lastSide: submittedForm.lastSide || null, child_id: entryChildId }; console.log('Submitting entry payload:', JSON.stringify(payload)); return JSON.stringify(payload); })(),
    });
    if (res.ok) { showToast('Sparad ✓'); await fetchEntries(); setPage('dashboard'); }
    else showToast('Något gick fel');
    setSaving(false);
  };

  const submitSomn = async () => {
    const elapsed = timers['Sömn']?.elapsed || 0;
    if (elapsed === 0) { showToast('Ingen tid registrerad'); return; }
    const mins = Math.ceil(elapsed / 60);
    setSaving(true);
    if (timers['Sömn']) { clearInterval(timers['Sömn'].interval); localStorage.removeItem('timer_Sömn'); }
    setTimers(t => { const n = { ...t }; delete n['Sömn']; return n; });
    const res = await fetch('/api/entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ what: 'Sömn', time: Date.now(), amount: String(mins), unit: 'min', amountL: null, amountR: null, child_id: timers['Sömn']?.child_id || selectedChild?.child_id || 'ellie_001' }),
    });
    if (res.ok) { showToast('Sparad ✓'); await fetchEntries(); }
    else showToast('Något gick fel');
    setSaving(false);
  };

  const submitPromenad = async () => {
    const elapsed = timers['Promenad']?.elapsed || 0;
    if (elapsed === 0) { showToast('Ingen tid registrerad'); return; }
    const mins = Math.ceil(elapsed / 60);
    setSaving(true);
    if (timers['Promenad']) { clearInterval(timers['Promenad'].interval); localStorage.removeItem('timer_Promenad'); }
    setTimers(t => { const n = { ...t }; delete n['Promenad']; return n; });
    const res = await fetch('/api/entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ what: 'Promenad', time: Date.now(), amount: String(mins), unit: 'min', amountL: null, amountR: null, child_id: timers['Promenad']?.child_id || selectedChild?.child_id || 'ellie_001' }),
    });
    if (res.ok) { showToast('Sparad ✓'); await fetchEntries(); }
    else showToast('Något gick fel');
    setSaving(false);
  };

  const saveEdit = async () => {
    setSaving(true);
    const res = await fetch('/api/entries/' + editEntry.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ what: editEntry.what, time: editEntry.time, amount: editEntry.amount, unit: editEntry.unit, child_id: editEntry.child_id || selectedChild?.child_id, amountL: editEntry.amountL || null, amountR: editEntry.amountR || null }),
    });
    if (res.ok) { showToast('Sparad ✓'); await fetchEntries(); setEditEntry(null); }
    else showToast('Något gick fel');
    setSaving(false);
  };

  const deleteEntry = async () => {
    if (!confirm('Radera denna post?')) return;
    setSaving(true);
    const res = await fetch('/api/entries/' + editEntry.id, { method: 'DELETE' });
    if (res.ok) { showToast('Raderad'); await fetchEntries(); setEditEntry(null); }
    else showToast('Något gick fel');
    setSaving(false);
  };

  return (
    <div style={{ ...S.app, background: THEME.bg, color: THEME.text }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px 12px', gap: 8 }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 8 }}>
          {children.map(c => {
            const isActive = selectedChild?.child_id === c.child_id;
            return (
              <button key={c.child_id} onClick={() => { setSelectedChild(c); setBirthTs(c.birthTs); setForm(f => ({ ...f, child_id: c.child_id })); }} style={{
                flexShrink: 0, padding: '8px 16px', borderRadius: 20,
                border: '1px solid ' + (isActive ? THEME.text : THEME.border),
                background: isActive ? THEME.text : THEME.bg2,
                color: isActive ? THEME.bg : THEME.text,
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                transition: 'all 0.15s', whiteSpace: 'nowrap'
              }}>{c.emoji || '👶'} {c.firstName}</button>
            );
          })}
        </div>
        <button onClick={() => { setShowAddChild(true); setPage('settings'); }} style={{
          flexShrink: 0, borderRadius: 20, padding: '8px 16px',
          background: 'none', border: '1px solid ' + THEME.border,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          WebkitTapHighlightColor: 'transparent', marginLeft: 8, whiteSpace: 'nowrap',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={THEME.textFaint} strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          <span style={{ fontSize: 13, fontWeight: 400, color: THEME.textFaint }}>Lägg till familj</span>
        </button>
      </div>
      {page === 'dashboard' && <Dashboard entries={entries} loading={loading} categories={sortedCategories} emojiMap={emojiMap} chartJsLoaded={chartJsLoaded} birthTs={birthTs} child={selectedChild} children={children} selectedChild={selectedChild} onChildSelect={handleChildSelect} darkMode={darkMode} onDarkModeToggle={handleDarkModeToggle} onCategoryClick={handleCategoryClick} />}
      {page === 'log' && <Log entries={entries.filter(e => e.child_id === selectedChild?.child_id)} onEdit={setEditEntry} emojiMap={emojiMap} categories={categories} />}
      {page === 'add' && <AddForm form={form} setForm={setForm} catNames={catNames} emojiMap={emojiMap} unitMap={unitMap} onCategoryChange={handleCategoryChange} onSubmit={submitEntry} saving={saving} formatTimer={formatTimer} timers={timers} onStartTimer={(key) => startTimer(key || form.what, selectedChild?.child_id)} onPauseTimer={(key) => pauseTimer(key || form.what)} onStopTimer={(key) => stopTimer(key || form.what)} onResetTimer={(key) => resetTimer(key || form.what)} timerElapsed={timers[form.what]?.elapsed || 0} timerRunning={timers[form.what]?.running || false} timerCat={form.what} entries={entries} selectedChild={selectedChild} />}
      {page === 'utveckling' && <Utveckling birthTs={birthTs} child={selectedChild} />}
      {page === 'settings' && <Settings categories={categories} setCategories={setCategories} emojiMap={emojiMap} session={session} onSignOut={() => signOut()} fetchChild={fetchChild} children={children} selectedChild={selectedChild} showAddChild={showAddChild} onAddChildClose={() => setShowAddChild(false)} />}

      <nav style={{ ...S.nav, background: 'var(--nav-bg)', borderTop: '1px solid ' + THEME.border, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="navGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fffffa" />
              <stop offset="100%" stopColor="#aaaaaa" />
            </linearGradient>
          </defs>
        </svg>
        {[
          { id: 'dashboard', icon: <GridIcon active={page === 'dashboard'} />, label: 'Översikt' },
          { id: 'log', icon: <LogIcon active={page === 'log'} />, label: 'History' },
          { id: 'add', icon: null, label: '' },
          { id: 'utveckling', icon: <BabyIcon active={page === 'utveckling'} />, label: 'Utveckling' },
          { id: 'settings', icon: <SettingsIcon active={page === 'settings'} />, label: 'Inställningar' },
        ].map(({ id, icon, label }, idx) => id === 'add' ? (
          <button key="add" className="nav-btn" style={S.navAdd} onClick={() => setPage('add')}>
            <div style={{ position: 'relative' }}>
              <div style={{ ...S.addCircle, background: page === 'add' ? THEME.accentDark : THEME.accent }}>
                <PlusIcon />
              </div>
              {timerRunning && (
                <div style={{
                  position: 'absolute', top: 0, right: 0,
                  width: 10, height: 10, borderRadius: '50%',
                  background: THEME.timer, border: '2px solid ' + THEME.bg2,
                }} />
              )}
            </div>
          </button>
        ) : (
          <button key={id} className="nav-btn" style={{ ...S.navBtn, paddingLeft: idx === 0 ? 16 : 4, paddingRight: idx === 4 ? 16 : 4, color: page === id ? 'transparent' : THEME.textFaint }} onClick={() => setPage(id)}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              transition: 'opacity 0.2s ease, filter 0.2s ease',
              opacity: page === id ? 1 : 0.45,
              filter: page === id ? 'hue-rotate(0deg) saturate(1)' : 'none',
              color: page === id ? '#818cf8' : THEME.textFaint,
            }}>
              {icon}
              <span style={{ fontSize: 10, ...(page === id ? { background: 'linear-gradient(135deg, #fffffa, #aaaaaa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' } : {}) }}>{label}</span>
            </div>
          </button>
        ))}
      </nav>

      {editEntry && (
      <div style={S.overlay} onClick={e => e.target === e.currentTarget && setEditEntry(null)}>
        <div style={{ ...S.modal, background: THEME.bg2 }}>
          <div style={{ ...S.handle, background: THEME.borderHover }} />
          <div style={{ ...S.modalTitle, color: THEME.text }}>Redigera post</div>
          <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border }}>
            <FormRow label="Kategori">
              <select style={{ ...S.input, color: THEME.text }} value={editEntry.what} onChange={e => handleCategoryChange(e.target.value, true)}>
                {catNames.map(c => <option key={c} value={c}>{displayCat(c, emojiMap)}</option>)}
              </select>
            </FormRow>
            <FormRow label="Tid">
              <input type="datetime-local" style={{ ...S.input, color: THEME.text }} value={toDatetimeLocal(editEntry.time)} onChange={e => setEditEntry(v => ({ ...v, time: new Date(e.target.value).getTime() }))} />
            </FormRow>
            <FormRow label="Mängd">
              <input type="number" style={{ ...S.input, color: THEME.text }} value={editEntry.amount || ''} onChange={e => setEditEntry(v => ({ ...v, amount: e.target.value }))} inputMode="decimal" />
            </FormRow>
            <FormRow label="Enhet" last>
              <select style={{ ...S.input, color: THEME.text }} value={editEntry.unit} onChange={e => setEditEntry(v => ({ ...v, unit: e.target.value }))}>
                {['n/a','ml','min','gram','cm','st'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </FormRow>
            </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button style={{ ...S.modalBtn, color: THEME.danger }} onClick={deleteEntry}>Radera</button>
            <button style={{ ...S.modalBtn, background: THEME.text, color: THEME.bg, borderColor: THEME.text, opacity: saving ? 0.6 : 1 }} onClick={saveEdit} disabled={saving}>
              {saving ? 'Sparar...' : 'Spara'}
            </button>
          </div>
        </div>
      </div>
      )}
      {(() => {
        const hasAmning = activeTimerCats.includes('Amning_L') || activeTimerCats.includes('Amning_R');
        const showAmningBanner = hasAmning && !(page === 'add' && form.what === 'Amning');
        const otherCats = activeTimerCats.filter(cat => cat !== 'Amning_L' && cat !== 'Amning_R');
        const bannersToShow = [
          ...(showAmningBanner ? ['__amning__'] : []),
          ...otherCats.filter(cat => !(page === 'add' && cat === form.what)),
        ];
        return bannersToShow.map((cat, i) => {
          if (cat === '__amning__') {
            const tL = timers['Amning_L'];
            const tR = timers['Amning_R'];
            return (
              <div key="amning-banner" onClick={() => { handleCategoryChange('Amning'); setPage('add'); }} style={{
                position: 'fixed', bottom: `calc(env(safe-area-inset-bottom) + 96px + ${i * 86}px)`, left: '50%', transform: 'translateX(-50%)',
                width: 'calc(100% - 48px)', maxWidth: 432,
                background: 'rgba(231, 0, 93, 0.15)', border: '1px solid rgba(231, 0, 93, 0.35)',
                borderRadius: 20, padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 10,
                zIndex: 150, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                WebkitTapHighlightColor: 'transparent', cursor: 'pointer',
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22, animation: (timers['Amning_L']?.running || timers['Amning_R']?.running) ? 'amningSway 2s ease-in-out infinite' : 'none' }}>🤱</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: THEME.text }}>Amning {timers['Amning_L']?.child_id || timers['Amning_R']?.child_id ? `(${children.find(c => c.child_id === (timers['Amning_L']?.child_id || timers['Amning_R']?.child_id))?.firstName || ''})` : ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={e => { e.stopPropagation(); if (confirm('Avbryta Amning-timers?')) { resetTimer('Amning_L'); resetTimer('Amning_R'); } }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 20, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: THEME.danger, fontWeight: 500 }}>Avbryt</button>
                  </div>
                </div>
                {/* L/R timer row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[['L', tL], ['R', tR]].map(([side, t]) => {
                    const running = t?.running || false;
                    const elapsed = t?.elapsed || 0;
                    const key = `Amning_${side}`;
                    return (
                      <div key={side} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 11, color: THEME.textMuted, marginBottom: 2, height: 16, display: 'flex', alignItems: 'center' }}>{side === 'L' ? '⬅ Vänster' : 'Höger ➡'}</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: running ? '#f472b6' : THEME.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '1px', lineHeight: 1 }}>{formatTimer(elapsed)}</div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); running ? pauseTimer(key) : startTimer(key); }} style={{
                          width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
                          background: running ? 'linear-gradient(135deg, #E7005D, #f472b6)' : 'rgba(231,0,93,0.25)',
                          color: 'white', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {running ? '⏸' : '▶'}
                        </button>
                      </div>
                    );
                  })}
                  </div>
                  <button onClick={e => { e.stopPropagation(); submitEntry(); }} style={{
                    width: '100%', padding: '10px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'white',
                    WebkitTapHighlightColor: 'transparent',
                  }}>💾 Spara amning</button>
                  <style>{`
                    @keyframes amningSway {
                      0%, 100% { transform: rotate(-8deg); }
                      50% { transform: rotate(8deg); }
                    }
                  `}</style>
                </div>
              );
            }
            return (
              <div key={cat} onClick={() => { handleCategoryChange(cat); setPage('add'); }} style={{
                position: 'fixed', bottom: `calc(env(safe-area-inset-bottom) + 96px + ${i * 86}px)`, left: '50%', transform: 'translateX(-50%)',
                width: 'calc(100% - 48px)', maxWidth: 432,
                background: cat === 'Sömn' ? 'rgba(30, 80, 180, 0.3)' : cat === 'Promenad' ? 'rgba(244, 166, 0, 0.25)' : 'rgba(22, 175, 93, 0.25)',
                border: '1px solid ' + (cat === 'Sömn' ? 'rgba(100, 150, 255, 0.4)' : cat === 'Promenad' ? 'rgba(244, 166, 0, 0.5)' : 'rgba(22, 175, 93, 0.4)'),
                borderRadius: 20, padding: '12px 14px',
                display: 'flex', flexDirection: (cat === 'Sömn' || cat === 'Promenad') ? 'column' : 'row', gap: 10,
                zIndex: 150, boxShadow: (cat === 'Sömn' || cat === 'Promenad') ? '0 4px 24px rgba(0,0,0,0.15)' : '0 4px 20px rgba(0,0,0,0.12)',
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)'
              }}>
                {cat === 'Sömn' || cat === 'Promenad' ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 22, animation: timers[cat]?.running ? 'sleepFloat 4s ease-in-out infinite' : 'none' }}>{emojiMap[cat] || (cat === 'Sömn' ? '😴' : '🐾')}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: cat === 'Promenad' ? 'rgba(255,220,100,0.95)' : 'rgba(180,200,255,0.9)' }}>{cat === 'Sömn' ? 'Sömn' : 'Promenad'} pågår {timers[cat]?.child_id ? `(${children.find(c => c.child_id === timers[cat]?.child_id)?.firstName || ''})` : ''}</span>
                      </div>
                      <button onClick={e => { e.stopPropagation(); if (confirm('Avbryta Sömn-timer?')) resetTimer(cat); }} style={{
                        background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 20,
                        padding: '5px 10px', cursor: 'pointer', fontSize: 12,
                        color: THEME.danger, fontWeight: 500
                      }}>Avbryt</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '8px 12px' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: cat === 'Promenad' ? '#f4c542' : '#a0c0ff', fontVariantNumeric: 'tabular-nums', letterSpacing: '1px' }}>
                        {formatTimer(timers[cat]?.elapsed || 0)}
                      </div>
                      <button onClick={e => { e.stopPropagation(); timers[cat]?.running ? pauseTimer(cat) : startTimer(cat); }} style={{
                      width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
                      background: timers[cat]?.running ? (cat === 'Promenad' ? 'rgba(244,166,0,0.6)' : 'rgba(100,150,255,0.5)') : (cat === 'Promenad' ? 'rgba(244,166,0,0.3)' : 'rgba(100,150,255,0.3)'),
                      color: 'white', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {timers[cat]?.running ? '⏸' : '▶'}
                    </button>
                    </div>
                    <button onClick={e => { e.stopPropagation(); cat === 'Sömn' ? submitSomn() : submitPromenad(); }} style={{
                      width: '100%', padding: '10px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'white',
                      WebkitTapHighlightColor: 'transparent',
                    }}>💾 Spara {cat === 'Sömn' ? 'sömn' : 'promenad'}</button>
                    <style>{`
                      @keyframes sleepFloat {
                        0%, 100% { transform: translateY(0px) rotate(-5deg); opacity: 0.9; }
                        50% { transform: translateY(-6px) rotate(2deg); opacity: 1; }
                      }
                    `}</style>
                  </>
                ) : (
                  <>
                    <div style={{ position: 'relative', width: 14, height: 14, flexShrink: 0 }}>
                      <div className="breathe-ring" style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: THEME.timer, opacity: 0.3 }} />
                      <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: THEME.timer }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: THEME.textMuted }}>{cat} pågår</div>
                      <div style={{ fontSize: 18, fontWeight: 500, color: THEME.timer, letterSpacing: '1px', fontVariantNumeric: 'tabular-nums' }}>{formatTimer(timers[cat]?.elapsed || 0)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 14, color: '#ffffff', fontWeight: 500, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '8px 12px' }}>Återgå →</div>
                      <button onClick={e => { e.stopPropagation(); if (confirm(`Vill du verkligen ta bort ${cat}-timern?`)) resetTimer(cat); }} style={{
                        background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 20,
                        padding: '8px 12px', cursor: 'pointer', fontSize: 14,
                        color: THEME.danger, fontWeight: 500, WebkitTapHighlightColor: 'transparent'
                      }}>Avbryt</button>
                    </div>
                  </>
                )}
              </div>
          );
        });
      })()}
      {toast && <div style={{ ...S.toast, background: THEME.text, color: THEME.bg2 }}>{toast}</div>}
    </div>
  );
}

const Dashboard = memo(function Dashboard({ entries, loading, categories, emojiMap, chartJsLoaded, onCategoryClick, birthTs, child, children, selectedChild, onChildSelect, darkMode, onDarkModeToggle }) {
  const now = new Date();
  const childEntries = useMemo(() => entries.filter(e => !e.child_id || e.child_id === child?.child_id), [entries, child?.child_id]);
  const weightEntries = childEntries.filter(e => e.what === 'Vikt').sort((a,b) => b.time - a.time);
  const lengthEntries = childEntries.filter(e => e.what === 'Längd').sort((a,b) => b.time - a.time);
  const trackCats = categories.filter(c => c.name !== 'Vikt' && c.name !== 'Längd' && c.name !== 'Ersättning');

  function ageString(birthTs) {
    if (!birthTs) return null;
    const diffMs = Date.now() - birthTs;
    const days = Math.floor(diffMs / 86400000);
    const hours = Math.floor((diffMs % 86400000) / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h ${mins}min`;
    if (hours > 0) return `${hours}h ${mins}min`;
    return `${mins}min`;
  }

  function formatBirthDate(ts) {
    return new Date(ts).toLocaleString('sv-SE', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE
    });
  }

  return (
    <div style={S.page}>
      <div style={{ ...S.header, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <h1 style={{ ...S.h1, color: THEME.text }}>{child?.emoji || '👶'} {child ? `${child.firstName} ${child.lastName}` : 'Laddar...'}</h1>
        {children?.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {children.map(c => (
              <button key={c.child_id} onClick={() => onChildSelect(c)} style={{
                width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
                background: selectedChild?.child_id === c.child_id ? THEME.text : THEME.border,
              }} />
            ))}
          </div>
        )}
      </div>
        <p style={{ ...S.sub, color: THEME.textMuted }}>{now.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIMEZONE })}</p>
      </div>
      <button className="pressable" onClick={onDarkModeToggle} style={{ background: 'none', border: '1px solid ' + THEME.border, borderRadius: 20, padding: '6px 10px', cursor: 'pointer', fontSize: 16, marginTop: 4, WebkitTapHighlightColor: 'transparent', transition: 'transform 0.1s, opacity 0.1s' }}>
        {darkMode ? '☀️' : '🌙'}
      </button>
    </div>

      {/* Age card */}
      {birthTs && (
        <div className="fade-up fade-up-1" style={{ background: THEME.bg2, borderRadius: 14, margin: '0 16px 10px', padding: '14px 16px', border: '1px solid ' + THEME.border }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative', width: 24, height: 24, flexShrink: 0 }}>
                <div className="breathe-ring" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: getCat('Amning').base, opacity: 0.4 }} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, paddingTop: 1 }}>❤️</div>
              </div>
              <div style={{ fontSize: 12, color: THEME.text, fontWeight: 'bold' }}>
                <span style={{ position: 'relative', top: 1 }}> Ålder</span>
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: THEME.text, letterSpacing: '-0.5px', marginTop: 0 }}>
              {(() => {
                const diffMs = Date.now() - birthTs;
                const days = Math.floor(diffMs / 86400000);
                const hours = Math.floor((diffMs % 86400000) / 3600000);
                const years = Math.floor(days / 365);
                const remDaysAfterYears = days % 365;
                const weeks = Math.floor(days / 7);
                const remDays = days % 7;
                const remWeeksAfterYears = Math.floor(remDaysAfterYears / 7);
                const remDaysAfterWeeks = remDaysAfterYears % 7;
                if (years > 0) return <>{years} {years === 1 ? 'år' : 'år'} &nbsp;{remWeeksAfterYears} {remWeeksAfterYears === 1 ? 'vecka' : 'veckor'} &nbsp;{remDaysAfterWeeks} {remDaysAfterWeeks === 1 ? 'dag' : 'dagar'}</>;
                if (weeks > 0) return <>{weeks} {weeks === 1 ? 'vecka' : 'veckor'} &nbsp;{remDays} {remDays === 1 ? 'dag' : 'dagar'} &nbsp;{hours} {hours === 1 ? 'timme' : 'timmar'}</>;
                return <>{days} {days === 1 ? 'dag' : 'dagar'} &nbsp; {hours} {hours === 1 ? 'timme' : 'timmar'}</>;
              })()}
            </div>
            <div style={{ fontSize: 12, fontWeight: 400, color: THEME.textMuted, padding: '2px 0' }}>Föddes {formatBirthDate(birthTs)}</div>
          </div>
        </div>
      )}

      {/* Vikt + Längd featured cards */}
      <div className="fade-up fade-up-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 16px 24px', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[{ name: 'Vikt', entries: weightEntries }, { name: 'Längd', entries: lengthEntries }].map(({ name, entries: catEntries }) => {
          const c = getCat(name);
          const last = catEntries[0];
          return (
            <div key={name} className="pressable" onClick={() => onCategoryClick(name)} style={{ ...S.summaryCard, background: THEME.bg2, border: '1px solid ' + THEME.border, cursor: 'pointer' }}>
              <div style={{ fontSize: 12, color: THEME.text, fontWeight: 'bold',  borderBottom: '1px solid var(--border)', marginBottom: 8, paddingBottom: 8 }}>
                <CatLabel cat={name} emojiMap={emojiMap} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1, color: THEME.text }}>
                {last ? <><CountUp value={parseFloat(last.amount)} from={parseFloat(last.amount) - (last.unit === 'gram' ? 50 : 5)} delay={300} /> {last.unit}</> : '—'}
              </div>
              <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 3 }}>
                {last ? timeSince(last.time) : 'Ingen data'}
              </div>
            </div>
          );
        })}
      </div>

      {loading ? <div style={{ ...S.empty, color: THEME.textFaint }}>Laddar...</div> : (
        <div className="fade-up fade-up-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 16px 16px' }}>
          {trackCats.map(({ name }) => {
            const c = getCat(name);
            const catEntries = childEntries.filter(e => e.what === name).sort((a,b) => b.time - a.time);
            const last = catEntries[0];
            const last24 = catEntries.filter(e => Date.now() - e.time < 86400000);
            const total24 = last24.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
            return (
              <div key={name} className="pressable" onClick={() => { if (navigator.vibrate) navigator.vibrate(8); onCategoryClick(name); }} style={{ ...S.summaryCard, background: THEME.bg2, border: '1px solid ' + THEME.border, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', transition: 'transform 0.1s', activeTransform: 'scale(0.97)' }}>
                <div style={{ fontSize: 12, color: THEME.text, fontWeight: 'bold', borderBottom: '1px solid var(--border)', marginBottom: 8, paddingBottom: 8 }}>
                  <CatLabel cat={name} emojiMap={emojiMap} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1, color: THEME.text }}>
                  {last ? (() => {
                    const mins = Math.floor((Date.now() - last.time) / 60000);
                    if (mins < 60) return <><CountUp value={mins} from={Math.max(0, mins - 10)} delay={400} /> min</>;
                    const h = Math.floor(mins / 60), m = mins % 60;
                    if (h < 24) return <>{h}h <CountUp value={m} from={Math.max(0, m - 10)} delay={400} />min</>;
                    const d = Math.floor(h / 24), rh = h % 24;
                    return <>{d}d {rh}h <CountUp value={m} from={Math.max(0, m - 10)} delay={400} />min</>;
                  })() : '—'}
                </div>
                <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 3 }}>sedan senast</div>
                <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 6, paddingTop: 6, borderTop: '1px solid ' + THEME.border, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{last24.length > 0 ? `24h: ${last24.length} st` : 'Inget 24h'}</span>
                  {total24 > 0 && <span>{total24} {last?.unit}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {chartJsLoaded && entries.length > 0 && (
        <>
          <div className="fade-up fade-up-4" style={{ padding: '0 16px 8px' }}>
            <GrowthChart entries={childEntries} birthTs={birthTs} darkMode={darkMode} child={child} />
          </div>
          <div className="fade-up fade-up-5" style={{ padding: '0 16px 8px' }}>
            <div style={{ ...S.sectionTitle, color: THEME.textFaint }}>Trend senaste 7 dagarna</div>
            <TrendChart entries={childEntries} categories={categories} emojiMap={emojiMap} darkMode={darkMode} />
          </div>
          <div className="fade-up fade-up-5" style={{ padding: '0 16px 16px' }}>
            <div style={{ ...S.sectionTitle, color: THEME.textFaint }}>{displayCat('Vikt', emojiMap)}</div>
            <WeightChart entries={childEntries} darkMode={darkMode} />
            <div style={{ ...S.sectionTitle, color: THEME.textFaint, marginTop: 16 }}>{displayCat('Längd', emojiMap)}</div>
            <LengthChart entries={childEntries} darkMode={darkMode} />
          </div>
        </>
      )}
    </div>
  );
});

function Log({ entries, onEdit, emojiMap, categories, selectedChild }) {
  const [selectedCats, setSelectedCats] = useState([]);
  let currentDateStr = '';

  const toggleCat = (cat) => {
    setSelectedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const filteredEntries = selectedCats.length === 0 ? entries : entries.filter(e => selectedCats.includes(e.what));

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={S.header}>
        <h1 style={{ ...S.h1, color: THEME.text }}>History</h1>
        <p style={{ ...S.sub, color: THEME.textMuted }}>{filteredEntries.length} poster</p>
      </div>

      <div className="cat-tabs" style={{ overflowX: 'auto', display: 'flex', gap: 8, padding: '0 16px 16px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <button onClick={() => setSelectedCats([])} style={{
          flexShrink: 0, padding: '8px 16px', borderRadius: 20,
          border: '1px solid ' + (selectedCats.length === 0 ? THEME.text : THEME.border),
          background: selectedCats.length === 0 ? THEME.text : THEME.bg2,
          color: selectedCats.length === 0 ? THEME.bg : THEME.text,
          fontSize: 13, fontWeight: selectedCats.length === 0 ? 600 : 400,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          transition: 'all 0.15s', whiteSpace: 'nowrap'
        }}>Alla</button>
        {categories.map(({ name }) => {
          const isActive = selectedCats.includes(name);
          const c = getCat(name);
          return (
            <button key={name} onClick={() => toggleCat(name)} style={{
              flexShrink: 0, padding: '8px 16px', borderRadius: 20,
              border: '1px solid ' + (isActive ? THEME.text : THEME.border),
              background: isActive ? THEME.text : THEME.bg2,
              color: isActive ? THEME.bg : THEME.text,
              fontSize: 13, fontWeight: isActive ? 600 : 400,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              transition: 'all 0.15s', whiteSpace: 'nowrap'
            }}>
              {emojiMap[name] && <span style={{ marginRight: 4 }}>{emojiMap[name]}</span>}
              {name}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '0 16px' }}>
        {!filteredEntries.length && <div style={{ ...S.empty, color: THEME.textFaint }}>Inga poster.</div>}
        {filteredEntries.map(e => {
          const c = getCat(e.what);
          const dateStr = new Date(e.time).toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
          const showHeader = dateStr !== currentDateStr;
          if (showHeader) currentDateStr = dateStr;
          return (
            <div key={e.id}>
              {showHeader && <div style={{ fontSize: 12, fontWeight: 600, color: THEME.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '16px 0 8px' }}>{formatDate(e.time)}</div>}
              <div style={{ ...S.logItem, background: THEME.bg2, border: '1px solid ' + THEME.border }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.base, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: THEME.text }}>{displayCat(e.what, emojiMap)}</div>
                  <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 2 }}>
                    {e.amountL || e.amountR 
                      ? `L: ${e.amountL || 0} min  R: ${e.amountR || 0} min`
                      : e.amount ? e.amount + ' ' + e.unit : '—'}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: THEME.textFaint }}>{formatTime(e.time)}</div>
                <button style={{ ...S.logBtn, color: THEME.textFaint }} onClick={() => onEdit(e)}><EditIcon /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddForm({ form, setForm, catNames, emojiMap, unitMap, onCategoryChange, onSubmit, saving, timerElapsed, timerRunning, onStartTimer, onPauseTimer, onStopTimer, onResetTimer, formatTimer, timerCat, timers, entries, selectedChild }) {
  const isTimerCategory = form.what === 'Amning' || form.what === 'Sömn';
  const isAmning = form.what === 'Amning';
  const showTimer = isTimerCategory && (!timerRunning || timerCat === form.what);
  const timerL = timers['Amning_L'];
  const timerR = timers['Amning_R'];
  const activeTabRef = useRef(null);
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [form.what]);
  return (
    <div style={S.page}>
      <div style={{ ...S.header, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ ...S.h1, color: THEME.text }}>Lägg till</h1>
          <p style={{ ...S.sub, color: THEME.textMuted }}>{form.what || 'Välj kategori'}</p>
        </div>
        {(form.what || timerRunning) && (
          <button className="pressable" onClick={() => { if (confirm('Vill du verkligen avbryta?')) { 
            if (form.what === 'Amning') { onResetTimer('Amning_L'); onResetTimer('Amning_R'); }
            else onResetTimer(); 
            setForm({ what: '', time: nowStockholm(), amount: '', unit: 'n/a' }); 
          } }} style={{
            background: 'none', border: '1px solid ' + THEME.border, borderRadius: 20,
            padding: '6px 12px', cursor: 'pointer', fontSize: 13,
            color: THEME.danger, borderColor: THEME.danger, marginTop: 4, WebkitTapHighlightColor: 'transparent',
            transition: 'transform 0.1s, opacity 0.1s'
          }}>Avbryt</button>
        )}
      </div>

      {/* Category tabs */}
      <div className="cat-tabs" style={{ overflowX: 'auto', display: 'flex', gap: 8, padding: '0 16px 16px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {catNames.map(cat => {
          const isActive = form.what === cat;
          const c = getCat(cat);
          return (
            <button key={cat} ref={isActive ? activeTabRef : null} onClick={() => onCategoryChange(cat)} style={{
              flexShrink: 0, padding: '8px 16px', borderRadius: 20,
              border: '1px solid ' + (isActive ? THEME.text : THEME.border),
              background: isActive ? THEME.text : THEME.bg2,
              color: isActive ? THEME.bg : THEME.text,
              fontSize: 13, fontWeight: isActive ? 600 : 400,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap'
            }}>
              {emojiMap[cat] && <span style={{ marginRight: 4 }}>{emojiMap[cat]}</span>}
              {cat}
            </button>
          );
        })}
      </div>

      {!form.what ? (
        <div style={{ ...S.empty, color: THEME.textFaint }}>Välj en kategori ovan</div>
      ) : (
        <div style={{ padding: '0 16px' }}>
          <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border }}>
          <FormRow label="Tid" last={form.what === 'Amning'}>
            <input type="datetime-local" style={{ ...S.input, color: THEME.text, flex: 'none', marginLeft: 'auto' }} value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
          </FormRow>
          {form.what !== 'Amning' && (
            <FormRow label="Mängd">
              <input type="number" style={{ ...S.input, color: THEME.text }} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" inputMode="decimal" />
            </FormRow>
          )}
          {form.what !== 'Amning' && (
            <FormRow label="Enhet" last>
              <select style={{ ...S.input, color: THEME.text, direction: 'rtl', textAlignLast: 'right' }} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {['n/a','ml','min','gram','cm','st'].map(u => (
                  <option key={u} value={u}>{u}{form.what && unitMap[form.what] === u ? ' (standard)' : ''}</option>
                ))}
              </select>
            </FormRow>
          )}
          </div>
          {isAmning && (
  <div style={{ background: THEME.bg2, border: '1px solid ' + THEME.border, borderRadius: 14, padding: '20px 16px', marginTop: 12 }}>
  {(() => {
    const amningEntries = (entries || []).filter(e => e.what === 'Amning' && (!selectedChild || e.child_id === selectedChild.child_id)).sort((a,b) => b.time - a.time);
    const last = amningEntries[0];
    if (!last) return null;
    const tsL = parseInt(localStorage.getItem('last_amning_side_ts_L') || '0');
    const tsR = parseInt(localStorage.getItem('last_amning_side_ts_R') || '0');
    const lMins = parseFloat(last.amountL || 0);
    const rMins = parseFloat(last.amountR || 0);
    const lastSide = tsL === 0 && tsR === 0
      ? (lMins > 0 && rMins === 0 ? 'L' : rMins > 0 && lMins === 0 ? 'R' : null)
      : tsL > tsR ? 'L' : 'R';
    const nextSide = lastSide === 'L' ? 'R' : lastSide === 'R' ? 'L' : null;
    if (!lastSide) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '10px 12px', background: 'rgba(231,0,93,0.08)', borderRadius: 10, border: '1px solid rgba(231,0,93,0.2)' }}>
        <div style={{ fontSize: 12, color: THEME.textMuted }}>
          <span>Senast: <strong style={{ color: THEME.text }}>{lastSide === 'L' ? '⬅ Vänster' : 'Höger ➡'}</strong></span>
        </div>
        {nextSide && (
          <div style={{ fontSize: 12, fontWeight: 600, color: '#E7005D' }}>
            Börja {nextSide === 'L' ? '⬅ Vänster' : 'Höger ➡'}
          </div>
        )}
      </div>
    );
  })()}
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {['L', 'R'].map(side => {
        const key = `Amning_${side}`;
        const t = timers[key];
        const running = t?.running || false;
        const elapsed = t?.elapsed || 0;
        return (
          <div key={side} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textMuted, marginBottom: 8, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {side === 'L' ? '⬅ Vänster' : 'Höger ➡'}
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: THEME.text, fontVariantNumeric: 'tabular-nums', marginBottom: 12, letterSpacing: '-1px', lineHeight: 1 }}>
              {formatTimer(elapsed)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ height: 44, display: 'flex', alignItems: 'stretch', width: '100%' }}>
              {!running && elapsed === 0 && (
                <button onClick={() => onStartTimer(key)} style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #E7005D, #f472b6)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  ▶ Starta {side}
                </button>
              )}
              {running && (
                <button onClick={() => onPauseTimer(key)} style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #E7005D, #f472b6)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  ⏸ Pausa {side}
                </button>
              )}
              {!running && elapsed > 0 && (
                <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                  <button onClick={() => onStartTimer(key)} style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #E7005D, #f472b6)', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    ▶
                  </button>
                  <button onClick={() => onStopTimer(key)} style={{ flex: 1, padding: '10px', background: THEME.timerStop, color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    ⏹
                  </button>
                  <button onClick={() => onResetTimer(key)} style={{ padding: '10px 12px', background: 'none', color: THEME.textMuted, border: '1px solid ' + THEME.border, borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>
                    ↺
                  </button>
                </div>
              )}
              </div>
              {elapsed > 0 && (
                <div style={{ fontSize: 11, color: THEME.textMuted }}>
                  {Math.ceil(elapsed / 60) || 1} min
                </div>
              )}
              {side === 'L' && form.amountL && (
                <div style={{ fontSize: 11, color: THEME.timer, fontWeight: 600 }}>✓ {form.amountL} min sparad</div>
              )}
              {side === 'R' && form.amountR && (
                <div style={{ fontSize: 11, color: THEME.timer, fontWeight: 600 }}>✓ {form.amountR} min sparad</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
{isAmning && !timers['Amning_L'] && !timers['Amning_R'] ? (
  <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, marginTop: 8 }}>
    <FormRow label="Mängd L">
      <input type="number" style={{ ...S.input, color: THEME.text }} value={form.amountL || ''} onChange={e => setForm(f => ({ ...f, amountL: e.target.value }))} placeholder="min" inputMode="decimal" />
    </FormRow>
    <FormRow label="Mängd R" last>
      <input type="number" style={{ ...S.input, color: THEME.text }} value={form.amountR || ''} onChange={e => setForm(f => ({ ...f, amountR: e.target.value }))} placeholder="min" inputMode="decimal" />
    </FormRow>
  </div>
) : null}
{form.what === 'Promenad' && (
  <div style={{ background: THEME.bg2, border: '1px solid ' + THEME.border, borderRadius: 14, padding: '20px 16px', marginTop: 12, textAlign: 'center' }}>
    <div style={{ fontSize: 11, color: THEME.textMuted, marginBottom: 8 }}>Promenaden pågår</div>
    <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: '0px', color: timers['Promenad']?.running ? '#F4A600' : THEME.text, fontVariantNumeric: 'tabular-nums', marginBottom: 16 }}>
      {formatTimer(timers['Promenad']?.elapsed || 0)}
    </div>
    {timers['Promenad']?.elapsed > 0 && (
      <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 12 }}>
        {Math.ceil((timers['Promenad']?.elapsed || 0) / 60)} min
      </div>
    )}
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {!timers['Promenad']?.running && !timers['Promenad']?.elapsed && (
        <button onClick={() => onStartTimer('Promenad')} style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #F4A600, #f7c948)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
        ▶ Starta
        </button>
      )}
      {timers['Promenad']?.running && (
        <button onClick={() => onPauseTimer('Promenad')} style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #F4A600, #f7c948)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
          ⏸ Pausa
        </button>
      )}
      {!timers['Promenad']?.running && timers['Promenad']?.elapsed > 0 && (
        <>
          <button onClick={() => onStartTimer('Promenad')} style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #F4A600, #f7c948)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            ▶ Fortsätt
          </button>
          <button onClick={() => onStopTimer('Promenad')} style={{ flex: 1, padding: '12px', background: THEME.timerStop, color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            ⏹ Avsluta
          </button>
          <button onClick={() => onResetTimer('Promenad')} style={{ padding: '12px 14px', background: 'none', color: THEME.textMuted, border: '1px solid ' + THEME.border, borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>
            ↺
          </button>
        </>
      )}
    </div>
  </div>
)}
  {form.what === 'Sömn' && (
  <div style={{ background: THEME.bg2, border: '1px solid ' + THEME.border, borderRadius: 14, padding: '20px 16px', marginTop: 12, textAlign: 'center' }}>
    <div style={{ fontSize: 11, color: THEME.textMuted, marginBottom: 8 }}>Sömnlängd</div>
    <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: '0px', color: timers['Sömn']?.running ? '#0ea5e9' : THEME.text, fontVariantNumeric: 'tabular-nums', marginBottom: 16 }}>      {formatTimer(timers['Sömn']?.elapsed || 0)}
    </div>
    {timers['Sömn']?.elapsed > 0 && (
      <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 12 }}>
        {Math.ceil((timers['Sömn']?.elapsed || 0) / 60)} min
      </div>
    )}
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {!timers['Sömn']?.running && !timers['Sömn']?.elapsed && (
        <button onClick={() => onStartTimer('Sömn')} style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #1e50b4, #0ea5e9)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
        ▶ Starta
        </button>
      )}
      {timers['Sömn']?.running && (
        <button onClick={() => onPauseTimer('Sömn')} style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #1e50b4, #0ea5e9)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
          ⏸ Pausa
        </button>
      )}
      {!timers['Sömn']?.running && timers['Sömn']?.elapsed > 0 && (
        <>
          <button onClick={() => onStartTimer('Sömn')} style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #1e50b4, #0ea5e9)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            ▶ Fortsätt
          </button>
          <button onClick={() => onStopTimer('Sömn')} style={{ flex: 1, padding: '12px', background: THEME.timerStop, color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            ⏹ Avsluta
          </button>
          <button onClick={() => onResetTimer('Sömn')} style={{ padding: '12px 14px', background: 'none', color: THEME.textMuted, border: '1px solid ' + THEME.border, borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>
            ↺
          </button>
        </>
      )}
    </div>
  </div>
)}
          <button data-submit style={{ ...S.submitBtn, background: THEME.bg2, color: THEME.text, border: '1px solid ' + THEME.border, opacity: saving ? 0.6 : 1 }} onClick={onSubmit} disabled={saving}>
            {saving ? 'Sparar...' : 'Spara post'}
          </button>
        </div>
      )}
    </div>
  );
}

function Utveckling({ birthTs }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [usageStats, setUsageStats] = useState(() => 
    JSON.parse(localStorage.getItem('utveckling_usage') || '{"totalCost":0,"totalCalls":0,"totalInput":0,"totalOutput":0}')
  );

  const currentWeek = birthTs ? Math.floor((Date.now() - birthTs) / (7 * 24 * 3600 * 1000)) + 1 : null;

  useEffect(() => {
    if (currentWeek !== null && selectedWeek === null) setSelectedWeek(currentWeek);
  }, [currentWeek]);

  useEffect(() => {
    if (selectedWeek === null) return;
    const cacheKey = `utveckling_v1_week_${selectedWeek}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) { setContent(JSON.parse(cached)); return; }
    fetchContent(selectedWeek);
  }, [selectedWeek]);

  const fetchContent = async (week) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/development', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week })
      });
      const parsed = await res.json();
      if (parsed.error) throw new Error(parsed.error);
      // Track token usage
      if (parsed._usage) {
        const inputTokens = parsed._usage.input_tokens || 0;
        const outputTokens = parsed._usage.output_tokens || 0;
        const cost = (inputTokens / 1_000_000 * 3) + (outputTokens / 1_000_000 * 15);
        const existing = JSON.parse(localStorage.getItem('utveckling_usage') || '{"totalCost":0,"totalCalls":0,"totalInput":0,"totalOutput":0}');
        localStorage.setItem('utveckling_usage', JSON.stringify({
          totalCost: existing.totalCost + cost,
          totalCalls: existing.totalCalls + 1,
          totalInput: existing.totalInput + inputTokens,
          totalOutput: existing.totalOutput + outputTokens,
        }));
        delete parsed._usage;
      }
      localStorage.setItem(`utveckling_v1_week_${week}`, JSON.stringify(parsed));
      setContent(parsed);
    } catch (e) {
      setError('Kunde inte hämta information. Försök igen.');
    }
    setUsageStats(JSON.parse(localStorage.getItem('utveckling_usage') || '{"totalCost":0,"totalCalls":0,"totalInput":0,"totalOutput":0}'));
    setLoading(false);
  };

  const weeks = currentWeek !== null ? Array.from({ length: currentWeek + 1 }, (_, i) => currentWeek + 1 - i).filter(w => w >= 1) : [];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={{ ...S.h1, color: THEME.text }}>👶 Utveckling</h1>
        <p style={{ ...S.sub, color: THEME.textMuted }}>
          {currentWeek !== null ? `Vecka ${currentWeek} just nu` : 'Laddar...'}
        </p>
        {usageStats.totalCalls > 0 && (
          <div style={{ fontSize: 11, color: THEME.textFaint, marginTop: 4 }}>
            {usageStats.totalCalls} anrop · {usageStats.totalInput + usageStats.totalOutput} tokens · ${usageStats.totalCost.toFixed(4)}
          </div>
        )}
      </div>

      {/* Week selector */}
      <div className="cat-tabs" style={{ overflowX: 'auto', display: 'flex', gap: 8, padding: '0 16px 16px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {weeks.map(w => (
          <button key={w} onClick={() => setSelectedWeek(w)} style={{
            flexShrink: 0, padding: '8px 16px', borderRadius: 20,
            border: '1px solid ' + (selectedWeek === w ? THEME.text : THEME.border),
            background: selectedWeek === w ? THEME.text : THEME.bg2,
            color: selectedWeek === w ? THEME.bg : THEME.text,
            fontSize: 13, fontWeight: selectedWeek === w ? 600 : 400,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            transition: 'all 0.15s', whiteSpace: 'nowrap'
          }}>
            {w === currentWeek ? `Vecka ${w} (Nuvarande)` : w === currentWeek + 1 ? `Vecka ${w} (Kommande)` : `Vecka ${w}`}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 16px' }}>
      {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{
              fontSize: 40, marginBottom: 12,
              background: 'linear-gradient(135deg, #0ea5e9, #16AF5D)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              display: 'inline-block',
              animation: 'breathe 2.5s ease-in-out infinite',
            }}>✦</div>
            <div style={{ fontSize: 14, color: THEME.textMuted }}>Hämtar information...</div>
            <style>{`
              @keyframes breathe {
                0%, 100% { transform: scale(1); opacity: 0.5; }
                50% { transform: scale(1.25); opacity: 1; }
              }
            `}</style>
          </div>
        )}
        {error && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: THEME.danger }}>
            <div>{error}</div>
            <button onClick={() => fetchContent(selectedWeek)} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 20, border: '1px solid ' + THEME.border, background: 'none', color: THEME.text, cursor: 'pointer' }}>Försök igen</button>
          </div>
        )}
        {content && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {content.title && (
              <div style={{ fontSize: 18, fontWeight: 700, color: THEME.text, letterSpacing: '-0.3px', lineHeight: 1.3, marginBottom: 4 }}>
                {content.title.replace(/^Utveckling vecka \d+[:\s-]*/i, '').trim()}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={async () => {
                if (!confirm('Hämta ny information från AI för denna vecka?')) return;
                localStorage.removeItem(`utveckling_v1_week_${selectedWeek}`);
                await fetch('/api/development/clear', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ week: selectedWeek })
                });
                setContent(null);
                fetchContent(selectedWeek);
              }} style={{
                background: 'none', border: '1px solid ' + THEME.border, borderRadius: 20,
                padding: '5px 12px', cursor: 'pointer', fontSize: 12,
                color: THEME.textMuted, display: 'flex', alignItems: 'center', gap: 6
              }}>↺ Uppdatera vecka {selectedWeek}</button>
            </div>
            {/* Summary */}
            <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: THEME.textFaint }}>Sammanfattning</div>
                {content.summarySource && <a href={content.summarySource.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: THEME.textMuted, textDecoration: 'none', background: THEME.border, borderRadius: 20, padding: '3px 8px' }}>{content.summarySource.name} →</a>}
              </div>
              <div style={{ fontSize: 15, color: THEME.text, lineHeight: 1.5 }}>{content.summary}</div>
            </div>

            {/* Milestones */}
            <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: THEME.textFaint }}>🌟 Milstolpar</div>
                {content.milestonesSource && <a href={content.milestonesSource.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: THEME.textMuted, textDecoration: 'none', background: THEME.border, borderRadius: 20, padding: '3px 8px' }}>{content.milestonesSource.name} →</a>}
              </div>
              {content.milestones?.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < content.milestones.length - 1 ? 10 : 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: getCat('Amning').base, flexShrink: 0, marginTop: 7 }} />
                  <div style={{ fontSize: 14, color: THEME.text, lineHeight: 1.5 }}>{m}</div>
                </div>
              ))}
            </div>

            {/* Tips */}
            <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: THEME.textFaint }}>💡 Tips för föräldrar</div>
                {content.tipsSource && <a href={content.tipsSource.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: THEME.textMuted, textDecoration: 'none', background: THEME.border, borderRadius: 20, padding: '3px 8px' }}>{content.tipsSource.name} →</a>}
              </div>
              {content.tips?.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < content.tips.length - 1 ? 10 : 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: getCat('Vikt').base, flexShrink: 0, marginTop: 7 }} />
                  <div style={{ fontSize: 14, color: THEME.text, lineHeight: 1.5 }}>{t}</div>
                </div>
              ))}
            </div>

            {/* Watch for */}
            <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, padding: '16px', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: THEME.textFaint }}>👁 Håll koll på</div>
                {content.watchForSource && <a href={content.watchForSource.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: THEME.textMuted, textDecoration: 'none', background: THEME.border, borderRadius: 20, padding: '3px 8px' }}>{content.watchForSource.name} →</a>}
              </div>
              {content.watchFor?.map((w, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < content.watchFor.length - 1 ? 10 : 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: getCat('Kiss').base, flexShrink: 0, marginTop: 7 }} />
                  <div style={{ fontSize: 14, color: THEME.text, lineHeight: 1.5 }}>{w}</div>
                </div>
              ))}
            </div>

{/* Sources */}
{content.sources?.length > 0 && (
  <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, padding: '16px', marginBottom: 24 }}>
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: THEME.textFaint, marginBottom: 12 }}>📚 Källor</div>
    {content.sources.map((s, i) => (
      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 0',
        borderBottom: i < content.sources.length - 1 ? '1px solid ' + THEME.border : 'none',
        textDecoration: 'none',
        color: THEME.text,
      }}>
        <div style={{ fontSize: 14, flex: 1 }}>{s.name}</div>
        <div style={{ fontSize: 12, color: THEME.textMuted }}>→</div>
      </a>
    ))}
  </div>
)}
</div>
)}
</div>
</div>
);
}

function Stats({ entries, categories, emojiMap }) {
  const now = Date.now();
  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={{ ...S.h1, color: THEME.text }}>Statistik</h1>
        <p style={{ ...S.sub, color: THEME.textMuted }}>Senaste 24 timmar</p>
      </div>
      <div style={{ padding: '0 16px' }}>
        {categories.map(({ name }) => {
          const c = getCat(name);
          const last24 = entries.filter(e => e.what === name && now - e.time < 86400000);
          const total = last24.reduce((s,e) => s+(parseFloat(e.amount)||0), 0);
          const lastEntry = entries.filter(e => e.what === name).sort((a,b) => b.time - a.time)[0];
          return (
            <div key={name} style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, marginBottom: 10 }}>
              <div style={{ ...S.formRow, borderBottom: '1px solid ' + THEME.border }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: THEME.text }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.base }} />
                  <CatLabel cat={name} emojiMap={emojiMap} />
                </span>
                <span style={{ fontSize: 14, color: THEME.textMuted }}>{last24.length} st</span>
              </div>
              {total > 0 && <div style={S.formRow}><span style={{ fontSize: 14, color: THEME.textMuted }}>Total</span><span style={{ fontSize: 14, color: THEME.text }}>{total} {lastEntry?.unit}</span></div>}
              <div style={S.formRow}><span style={{ fontSize: 14, color: THEME.textMuted }}>Senast</span><span style={{ fontSize: 14, color: THEME.textMuted }}>{lastEntry ? timeSince(lastEntry.time) + ' sedan' : '—'}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddChildForm({ onAdded, autoOpen, onAutoOpenConsumed }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [type, setType] = useState('barn');
  const [emoji, setEmoji] = useState('👶');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (autoOpen) { setShowForm(true); onAutoOpenConsumed?.(); }
  }, [autoOpen]);

  // Auto-set default emoji based on type
  useEffect(() => {
    if (type === 'barn') setEmoji('👶');
    if (type === 'hund') setEmoji('🐶');
  }, [type]);

  const save = async () => {
    if (!firstName.trim() || !birthDate) return;
    setSaving(true);
    const res = await fetch('/api/child', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthTs: new Date(birthDate).getTime(),
        dueDate: dueDate ? new Date(dueDate).getTime() : null,
        emoji,
        type,
      }),
    });
    if (res.ok) {
      setFirstName(''); setLastName(''); setBirthDate(''); setDueDate('');
      setType('barn'); setEmoji('👶');
      setShowForm(false);
      onAdded();
    }
    setSaving(false);
  };

  if (!showForm) return (
    <button style={{ ...S.submitBtn, background: THEME.border, color: THEME.text, marginBottom: 8 }} onClick={() => setShowForm(true)}>
      + Lägg till familjemedlem
    </button>
  );

  return (
    <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, marginBottom: 8 }}>
      <FormRow label="Typ">
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {[{ value: 'barn', label: '👶 Barn' }, { value: 'hund', label: '🐶 Hund' }].map(t => (
            <button key={t.value} onClick={() => setType(t.value)} style={{
              padding: '6px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: '1px solid ' + (type === t.value ? THEME.text : THEME.border),
              background: type === t.value ? THEME.text : 'none',
              color: type === t.value ? THEME.bg : THEME.text,
            }}>{t.label}</button>
          ))}
        </div>
      </FormRow>
      <FormRow label="Förnamn">
        <input style={{ ...S.input, color: THEME.text }} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Förnamn" />
      </FormRow>
      <FormRow label="Efternamn">
        <input style={{ ...S.input, color: THEME.text }} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Efternamn" />
      </FormRow>
      <FormRow label="Emoji">
        <input style={{ ...S.input, color: THEME.text }} value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="👶" />
      </FormRow>
      <FormRow label="Födelsedag" last={type === 'hund'}>
        <input type="date" style={{ ...S.input, color: THEME.text }} value={birthDate} onChange={e => setBirthDate(e.target.value)} />
      </FormRow>
      {type === 'barn' && (
        <FormRow label="Beräknat datum" last={type === 'barn'}>
          <input type="date" style={{ ...S.input, color: THEME.text }} value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </FormRow>
      )}
      <div style={{ display: 'flex', gap: 10, padding: '12px 16px' }}>
        <button style={{ ...S.modalBtn, color: THEME.textMuted }} onClick={() => setShowForm(false)}>Avbryt</button>
        <button style={{ ...S.modalBtn, background: THEME.text, color: THEME.bg, borderColor: THEME.text, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara'}
        </button>
      </div>
    </div>
  );
}

function ChildAccessList({ children }) {
  if (!children || children.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      {children.map(c => (
        <div key={c.child_id} style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, marginBottom: 8 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid ' + THEME.border, fontSize: 13, fontWeight: 600, color: THEME.text }}>
          {c.emoji || '👶'} {c.firstName} {c.lastName}
          </div>
          {c.parentEmails.map((email, i) => (
            <div key={email} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < c.parentEmails.length - 1 ? '1px solid ' + THEME.border : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: THEME.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: THEME.textMuted, flexShrink: 0 }}>
                {email[0].toUpperCase()}
              </div>
              <div style={{ fontSize: 13, color: THEME.textMuted, flex: 1 }}>{email}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ShareChildForm({ children, selectedChild }) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [childToShare, setChildToShare] = useState(selectedChild?.child_id || '');

  useEffect(() => { if (selectedChild) setChildToShare(selectedChild.child_id); }, [selectedChild]);

  const share = async () => {
    if (!email.trim() || !childToShare) return;
    setSaving(true);
    setMessage('');
    const res = await fetch('/api/child', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_id: childToShare, email: email.trim() }),
    });
    const data = await res.json();
    if (res.ok) { setMessage('✓ Delat!'); setEmail(''); }
    else setMessage('✗ ' + (data.error || 'Något gick fel'));
    setSaving(false);
  };

  return (
    <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, marginBottom: 8 }}>
      {children?.length > 1 && (
        <FormRow label="Barn">
          <select style={{ ...S.input, color: THEME.text }} value={childToShare} onChange={e => setChildToShare(e.target.value)}>
            {children.map(c => <option key={c.child_id} value={c.child_id}>{c.firstName} {c.lastName}</option>)}
          </select>
        </FormRow>
      )}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid ' + THEME.border }}>
        <input
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid ' + THEME.borderHover, background: THEME.bg, color: THEME.text, fontSize: 15, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          value={email} onChange={e => setEmail(e.target.value)} placeholder="namn@exempel.se" type="email"
        />
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '12px 16px', alignItems: 'center' }}>
        {message && <span style={{ fontSize: 12, color: message.startsWith('✓') ? THEME.timer : THEME.danger, flex: 1 }}>{message}</span>}
        <button style={{ ...S.modalBtn, background: 'linear-gradient(135deg, #16AF5D, #0ea5e9)', color: 'white', border: 'none', opacity: saving ? 0.6 : 1 }} onClick={share} disabled={saving}>
          {saving ? 'Delar...' : 'Dela'}
        </button>
      </div>
    </div>
  );
}

function Settings({ categories, setCategories, emojiMap, session, onSignOut, fetchChild, children, selectedChild, showAddChild, onAddChildClose }) {
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newUnit, setNewUnit] = useState('n/a');


  const addCat = async () => {
    if (!newName.trim()) return;
    const updated = [...categories, { name: newName.trim(), emoji: newEmoji.trim(), unit: newUnit }];
    setCategories(updated);
    setNewName('');
    setNewEmoji('');
    setShowAdd(false);
    setNewUnit('n/a');
    await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: updated }),
    });
  };
  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={{ ...S.h1, color: THEME.text }}>Inställningar</h1>
        <p style={{ ...S.sub, color: THEME.textMuted }}>{session.user.email}</p>
      </div>
      <div style={{ padding: '0 16px' }}>
        <div style={{ ...S.sectionTitle, color: THEME.textFaint }}>Lägg till familjemedlem</div>
        <AddChildForm onAdded={() => { fetchChild(); }} autoOpen={showAddChild} onAutoOpenConsumed={onAddChildClose} />
        <div style={{ ...S.sectionTitle, color: THEME.textFaint, marginTop: 24 }}>Åtkomst</div>
        <ChildAccessList children={children} />
        <div style={{ ...S.sectionTitle, color: THEME.textFaint }}>Dela med annan</div>
        <ShareChildForm children={children} selectedChild={selectedChild} />
        <div style={{ ...S.sectionTitle, color: THEME.textFaint, marginTop: 24 }}>Kategorier</div>
        <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border }}>
          {categories.map(({ name, emoji }, i) => {
            const c = getCat(name);
            return (
              <div key={name} style={{ ...S.formRow, borderBottom: i < categories.length-1 ? '1px solid ' + THEME.border : 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: THEME.text }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.base }} />
                  {emoji && <span>{emoji}</span>}
                  {name}
                </span>
                <button 
                  style={{ ...S.logBtn, color: DEFAULT_CATEGORIES.some(d => d.name === name) ? 'var(--border-hover)' : THEME.textFaint }}
                  disabled={DEFAULT_CATEGORIES.some(d => d.name === name)}
                  onClick={async () => {
                    if (DEFAULT_CATEGORIES.some(d => d.name === name)) return;
                    if (!confirm(`Vill du verkligen ta bort "${name}"?`)) return;
                    const updated = categories.filter((_,j) => j !== i);
                    setCategories(updated);
                    await fetch('/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ categories: updated }),
                  });
                }}>✕</button>
              </div>
            );
          })}
        </div>
        {showAdd ? (
          <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, marginTop: 10 }}>
            <FormRow label="Namn">
              <input style={{ ...S.input, color: THEME.text }} value={newName} onChange={e => setNewName(e.target.value)} placeholder="t.ex. Sömn" />
            </FormRow>
            <FormRow label="Emoji">
              <input style={{ ...S.input, color: THEME.text }} value={newEmoji} onChange={e => setNewEmoji(e.target.value)} placeholder="t.ex. 😴" />
            </FormRow>
            <FormRow label="Enhet" last>
              <select style={{ ...S.input, color: THEME.text }} value={newUnit} onChange={e => setNewUnit(e.target.value)}>
              {['n/a','ml','min','gram','cm','kg','st'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </FormRow>
            <div style={{ display: 'flex', gap: 10, padding: '12px 16px' }}>
              <button style={{ ...S.modalBtn, color: THEME.textMuted }} onClick={() => setShowAdd(false)}>Avbryt</button>
              <button style={{ ...S.modalBtn, background: THEME.accent, color: 'white', borderColor: THEME.accent }} onClick={addCat}>Spara</button>
            </div>
          </div>
        ) : (
          <button style={{ ...S.submitBtn, background: THEME.border, color: THEME.text, marginTop: 10 }} onClick={() => setShowAdd(true)}>+ Lägg till kategori</button>
        )}
        <div style={{ marginTop: 24 }}>
          <div style={{ ...S.sectionTitle, color: THEME.textFaint }}>Konto</div>
          <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border }}>
            <div style={S.formRow}>
              <span style={{ fontSize: 14, color: THEME.text }}>{session.user.name}</span>
              <button style={{ ...S.logBtn, color: THEME.danger, fontSize: 13 }} onClick={onSignOut}>Logga ut</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'-apple-system,sans-serif',fontSize:14,color:THEME.textMuted }}>Laddar...</div>;
}

function Login() {
  return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'-apple-system,sans-serif',background:THEME.bg,padding:20,textAlign:'center' }}>
      <div style={{ fontSize:56,marginBottom:16 }}>🍼</div>
      <h1 style={{ fontSize:28,fontWeight:700,letterSpacing:'-0.5px',marginBottom:8,color:THEME.text }}>Babytracker</h1>
      <p style={{ fontSize:15,color:THEME.textMuted,marginBottom:32 }}>Logga in för att fortsätta</p>
      <button onClick={() => signIn('google')} style={{ padding:'14px 28px',background:THEME.accent,color:'white',border:'none',borderRadius:12,fontSize:16,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:10 }}>
        <svg width="20" height="20" viewBox="0 0 24 24"><path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Logga in med Google
      </button>
    </div>
  );
}

function FormRow({ label, children, last }) {
  return (
    <div style={{ ...S.formRow, borderBottom: last ? 'none' : '1px solid ' + THEME.border }}>
      <span style={{ fontSize: 14, fontWeight: 500, minWidth: 90, color: THEME.text }}>{label}</span>
      {children}
    </div>
  );
}

const S = {
  app: { fontFamily: '-apple-system,"Helvetica Neue",sans-serif', minHeight: '100vh', maxWidth: 480, margin: '0 auto' },
  page: { paddingBottom: 90 },
  header: { padding: '36px 20px 16px' },
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', margin: 0 },
  sub: { fontSize: 14, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 },
  nav: { position: 'fixed', bottom: 20, borderRadius: '40px', left: '50%', transform: 'translateX(-50%)', width: '85%', maxWidth: 460, display: 'flex', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)' },
  navBtn: { flex: 0.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '16px 0', border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, letterSpacing: '0.02em' },
  navAdd: { flex: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: '8px 0px' },
  addCircle: { width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  summaryCard: { borderRadius: 14, padding: '14px 16px', WebkitTapHighlightColor: 'transparent' },
  chartCard: { borderRadius: 14, padding: 16, marginBottom: 16, background: THEME.bg2, border: '1px solid var(--border)' },
  formCard: { borderRadius: 14, overflow: 'hidden' },
  formRow: { padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  input: { flex: 1, background: 'none', border: 'none', fontSize: 16, textAlign: 'right', outline: 'none', fontFamily: 'inherit', appearance: 'none' },
  submitBtn: { width: '100%', padding: 16, color: 'white', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 12 },
  logItem: { borderRadius: 8, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 },
  logBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  modal: { borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '20px 16px 36px' },
  handle: { width: 36, height: 4, borderRadius: 2, margin: '0 auto 20px' },
  modalTitle: { fontSize: 17, fontWeight: 700, marginBottom: 16 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 8, border: '1px solid ' + THEME.border, background: 'none', fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  toast: { position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', borderRadius: 20, fontSize: 14, fontWeight: 500, zIndex: 300, whiteSpace: 'nowrap' },
  empty: { textAlign: 'center', padding: '48px 32px', fontSize: 14 },
};

function GridIcon({ active }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'url(#navGrad)' : 'currentColor'} strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function LogIcon({ active }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'url(#navGrad)' : 'currentColor'} strokeWidth="1.8"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>; }
function SettingsIcon({ active }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'url(#navGrad)' : 'currentColor'} strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>; }
function EditIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function PlusIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>; }
function BabyIcon({ active }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'url(#navGrad)' : 'currentColor'} strokeWidth="1.8"><circle cx="12" cy="7" r="3"/><path d="M8 14c0-2.2 1.8-4 4-4s4 1.8 4 4"/><path d="M3 19c0-3.3 4-6 9-6s9 2.7 9 6"/></svg>; }
