"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";

const TIMEZONE = "Europe/Stockholm";

// ============================================================
// THEME — edit here to change colors across the whole app
// ============================================================
const THEME = {
  bg:          '#f8f7f4',
  bg2:         '#ffffff',
  border:      'rgba(0,0,0,0.08)',
  borderHover: 'rgba(0,0,0,0.14)',
  text:        '#1a1916',
  textMuted:   '#6b6860',
  textFaint:   '#9e9b95',
  accent:      '#121212',
  accentDark:  '#1b4332',
  danger:      '#c0392b',
  chartGrid:   'rgba(0,0,0,0.05)',
  chartTick:   '#9e9b95',
  categories: {
    'Ersättning': { base: '#009855', chart: 'rgba(0,152,85,0.25)',   card: '#e8f4ee', text: '#1b4332' },
    'Amning':     { base: '#E7005D', chart: 'rgba(231,0,93,0.25)',   card: '#fdf2f8', text: '#6b0f35' },
    'Vikt':       { base: '#0C79DE', chart: 'rgba(12,121,222,0.25)', card: '#E6F3FF', text: '#0068C8' },
    'Bajs':       { base: '#713F12', chart: 'rgba(116,50,0,0.25)',   card: '#fef3c7', text: '#78350f' },
    'Kiss':       { base: '#F4A600', chart: 'rgba(244,166,0,0.25)',  card: '#fefce8', text: '#713f12' },
  },
  categoryDefault: { base: '#6b6860', chart: 'rgba(107,104,96,0.25)', card: '#f1efe8', text: '#44403c' },
  categoryEmoji: {
    'Ersättning': '🍼',
    'Amning':     '🤱',
    'Vikt':       '⚖️',
    'Bajs':       '💩',
    'Kiss':       '💧',
  },
};

function getCat(cat) { return THEME.categories[cat] || THEME.categoryDefault; }
function getEmoji(cat) { return THEME.categoryEmoji[cat] ? `${THEME.categoryEmoji[cat]} ` : ''; }
function displayCat(cat) { return `${getEmoji(cat)}${cat}`; }

const CATEGORY_UNITS = {
  'Ersättning': 'ml', 'Amning': 'min', 'Vikt': 'gram', 'Bajs': 'n/a', 'Kiss': 'n/a',
};
const DEFAULT_CATEGORIES = ['Amning', 'Vikt', 'Bajs', 'Kiss', 'Ersättning'];

function timeSince(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h + 'h ' + (m > 0 ? m + 'min' : '');
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

function TrendChart({ entries, categories }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const chartCats = categories.filter(c => c !== 'Vikt');
  const [activeCat, setActiveCat] = useState(chartCats[0] || 'Ersättning');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.Chart || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const days = 7;
    const labels = [];
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('sv-SE', { weekday: 'short', timeZone: TIMEZONE }));
      const start = new Date(d.toLocaleDateString('sv-SE', { timeZone: TIMEZONE })).getTime();
      const end = start + 86400000;
      const dayEntries = entries.filter(e => e.what === activeCat && e.time >= start && e.time < end);
      const total = dayEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      data.push(total || dayEntries.length);
    }
    const cat = getCat(activeCat);
    chartRef.current = new window.Chart(canvasRef.current, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: cat.chart, borderColor: cat.base, borderWidth: 1.5, borderRadius: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: THEME.chartTick, font: { size: 11 } }, grid: { color: THEME.chartGrid } },
          y: { ticks: { color: THEME.chartTick, font: { size: 11 } }, grid: { color: THEME.chartGrid }, beginAtZero: true }
        }
      }
    });
  }, [activeCat, entries]);

  return (
    <div style={S.chartCard}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {chartCats.map(cat => {
          const c = getCat(cat);
          const isActive = activeCat === cat;
          return (
            <button key={cat} onClick={() => setActiveCat(cat)} style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 20,
              border: '1px solid ' + (isActive ? c.base : THEME.borderHover),
              background: isActive ? c.base : 'none',
              color: isActive ? 'white' : THEME.textMuted,
              cursor: 'pointer',
            }}>{displayCat(cat)}</button>
          );
        })}
      </div>
      <div style={{ position: 'relative', height: 180 }}>
        <canvas ref={canvasRef} role="img" aria-label="Trendgraf" />
      </div>
    </div>
  );
}

function WeightChart({ entries }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const cat = getCat('Vikt');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.Chart || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
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
          x: { ticks: { color: THEME.chartTick, font: { size: 11 }, maxRotation: 45 }, grid: { color: THEME.chartGrid } },
          y: { ticks: { color: THEME.chartTick, font: { size: 11 } }, grid: { color: THEME.chartGrid } }
        }
      }
    });
  }, [entries]);

  return (
    <div style={S.chartCard}>
      <div style={{ position: 'relative', height: 180 }}>
        <canvas ref={canvasRef} role="img" aria-label="Viktutveckling" />
      </div>
    </div>
  );
}

export default function App() {
  const { data: session, status } = useSession();
  const [page, setPage] = useState('dashboard');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [toast, setToast] = useState('');
  const [editEntry, setEditEntry] = useState(null);
  const [form, setForm] = useState({ what: '', time: '', amount: '', unit: 'n/a' });
  const [chartJsLoaded, setChartJsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/entries');
      if (res.ok) { const data = await res.json(); setEntries(data); }
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { if (session) fetchEntries(); }, [session, fetchEntries]);
  useEffect(() => { if (page === 'add') setForm({ what: '', time: nowStockholm(), amount: '', unit: 'n/a' }); }, [page]);

  if (status === 'loading') return <Loading />;
  if (!session) return <Login />;

  const handleCategoryChange = (cat, isEdit = false) => {
    const unit = CATEGORY_UNITS[cat] || 'n/a';
    if (isEdit) setEditEntry(e => ({ ...e, what: cat, unit }));
    else setForm(f => ({ ...f, what: cat, unit }));
  };

  const submitEntry = async () => {
    if (!form.what || !form.time) { showToast('Välj kategori och tid'); return; }
    setSaving(true);
    const res = await fetch('/api/entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ what: form.what, time: new Date(form.time).getTime(), amount: form.amount, unit: form.unit }),
    });
    if (res.ok) { showToast('Sparad ✓'); await fetchEntries(); setPage('dashboard'); }
    else showToast('Något gick fel');
    setSaving(false);
  };

  const saveEdit = async () => {
    setSaving(true);
    const res = await fetch('/api/entries/' + editEntry.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ what: editEntry.what, time: editEntry.time, amount: editEntry.amount, unit: editEntry.unit }),
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
      {page === 'dashboard' && <Dashboard entries={entries} loading={loading} categories={categories} chartJsLoaded={chartJsLoaded} />}
      {page === 'log' && <Log entries={entries} onEdit={setEditEntry} />}
      {page === 'add' && <AddForm form={form} setForm={setForm} categories={categories} onCategoryChange={handleCategoryChange} onSubmit={submitEntry} saving={saving} />}
      {page === 'stats' && <Stats entries={entries} categories={categories} />}
      {page === 'settings' && <Settings categories={categories} setCategories={setCategories} session={session} onSignOut={() => signOut()} />}

      <nav style={{ ...S.nav, background: THEME.bg2, borderTop: '1px solid ' + THEME.border }}>
        {[
          { id: 'dashboard', icon: <GridIcon />, label: 'Översikt' },
          { id: 'log', icon: <LogIcon />, label: 'Logg' },
          { id: 'add', icon: null, label: '' },
          { id: 'stats', icon: <StatsIcon />, label: 'Statistik' },
          { id: 'settings', icon: <SettingsIcon />, label: 'Inställningar' },
        ].map(({ id, icon, label }) => id === 'add' ? (
          <button key="add" style={S.navAdd} onClick={() => setPage('add')}>
            <div style={{ ...S.addCircle, background: page === 'add' ? THEME.accentDark : THEME.accent }}>
              <PlusIcon />
            </div>
          </button>
        ) : (
          <button key={id} style={{ ...S.navBtn, color: page === id ? THEME.accent : THEME.textFaint }} onClick={() => setPage(id)}>
            {icon}
            <span style={{ fontSize: 10 }}>{label}</span>
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
                  {categories.map(c => <option key={c} value={c}>{displayCat(c)}</option>)}
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
                  {['n/a','ml','min','gram'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </FormRow>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={{ ...S.modalBtn, color: THEME.danger }} onClick={deleteEntry}>Radera</button>
              <button style={{ ...S.modalBtn, background: THEME.accent, color: 'white', borderColor: THEME.accent, opacity: saving ? 0.6 : 1 }} onClick={saveEdit} disabled={saving}>
                {saving ? 'Sparar...' : 'Spara'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ ...S.toast, background: THEME.text, color: THEME.bg2 }}>{toast}</div>}
    </div>
  );
}

function Dashboard({ entries, loading, categories, chartJsLoaded }) {
  const now = new Date();
  const weightEntries = entries.filter(e => e.what === 'Vikt').sort((a,b) => b.time - a.time);
  const trackCats = categories.filter(c => c !== 'Vikt');
  const viktCat = getCat('Vikt');

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={{ ...S.h1, color: THEME.text }}>Översikt</h1>
        <p style={{ ...S.sub, color: THEME.textMuted }}>{now.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIMEZONE })}</p>
      </div>

      {weightEntries.length > 0 && (
        <div style={{ background: THEME.bg2, borderRadius: 14, margin: '0 16px 16px', padding: '14px 16px', border: '1px solid ' + THEME.border }}>
          <div style={{ fontSize: 11, color: THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{displayCat('Vikt')}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: THEME.text, letterSpacing: '-0.5px', marginTop: 2 }}>{weightEntries[0].amount} gram</div>
          <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 2 }}>Uppmätt {timeSince(weightEntries[0].time)} sedan</div>
        </div>
      )}

      {loading ? <div style={{ ...S.empty, color: THEME.textFaint }}>Laddar...</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 16px 16px' }}>
          {trackCats.map(cat => {
            const c = getCat(cat);
            const catEntries = entries.filter(e => e.what === cat).sort((a,b) => b.time - a.time);
            const last = catEntries[0];
            const last24 = catEntries.filter(e => Date.now() - e.time < 86400000);
            const total24 = last24.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
            return (
              <div key={cat} style={{ ...S.summaryCard, background: THEME.bg2, border: '1px solid ' + THEME.border }}>
                <div style={{ fontSize: 11, color: THEME.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/*<span style={{ width: 7, height: 7, borderRadius: '50%', background: c.base, flexShrink: 0 }} /> */}
                  {displayCat(cat)}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1, color: THEME.text }}>{last ? timeSince(last.time) : '—'}</div>
                <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 3 }}>sedan senast</div>
                <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 6, paddingTop: 6, borderTop: '1px solid ' + THEME.border }}>
                {cat === 'Bajs' || cat === 'Kiss'
                  ? (last24.length > 0 ? `24h: ${last24.length} st` : 'Inget senaste 24h')
                  : (total24 > 0 ? `24h: ${total24} ${last?.unit}` : 'Inget senaste 24h')
                }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {chartJsLoaded && entries.length > 0 && (
        <>
          <div style={{ padding: '0 16px 8px' }}>
            <div style={{ ...S.sectionTitle, color: THEME.textFaint }}>Trend senaste 7 dagarna</div>
            <TrendChart entries={entries} categories={categories} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ ...S.sectionTitle, color: THEME.textFaint }}>{displayCat('Vikt')}</div>
            <WeightChart entries={entries} />
          </div>
        </>
      )}
    </div>
  );
}

function Log({ entries, onEdit }) {
  let currentDate = '';
  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={{ ...S.h1, color: THEME.text }}>Logg</h1>
        <p style={{ ...S.sub, color: THEME.textMuted }}>{entries.length} poster</p>
      </div>
      <div style={{ padding: '0 16px' }}>
        {!entries.length && <div style={{ ...S.empty, color: THEME.textFaint }}>Inga poster ännu.</div>}
        {entries.map(e => {
          const c = getCat(e.what);
          const dateStr = new Date(e.time).toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
          const showHeader = dateStr !== currentDate;
          if (showHeader) currentDate = dateStr;
          return (
            <div key={e.id}>
              {showHeader && <div style={{ fontSize: 12, fontWeight: 600, color: THEME.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '16px 0 8px' }}>{formatDate(e.time)}</div>}
              <div style={{ ...S.logItem, background: THEME.bg2, border: '1px solid ' + THEME.border }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.base, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: THEME.text }}>{displayCat(e.what)}</div>
                  <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 2 }}>{e.amount ? e.amount + ' ' + e.unit : '—'}</div>
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

function AddForm({ form, setForm, categories, onCategoryChange, onSubmit, saving }) {
  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={{ ...S.h1, color: THEME.text }}>Lägg till</h1>
        <p style={{ ...S.sub, color: THEME.textMuted }}>Ny post</p>
      </div>
      <div style={{ padding: '0 16px' }}>
        <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border }}>
          <FormRow label="Kategori">
            <select style={{ ...S.input, color: THEME.text }} value={form.what} onChange={e => onCategoryChange(e.target.value)}>
              <option value="">Välj...</option>
              {categories.map(c => <option key={c} value={c}>{displayCat(c)}</option>)}
            </select>
          </FormRow>
          <FormRow label="Tid">
            <input type="datetime-local" style={{ ...S.input, color: THEME.text }} value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
          </FormRow>
          <FormRow label="Mängd">
            <input type="number" style={{ ...S.input, color: THEME.text }} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" inputMode="decimal" />
          </FormRow>
          <FormRow label="Enhet" last>
            <select style={{ ...S.input, color: THEME.text }} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {['n/a','ml','min','gram'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </FormRow>
        </div>
        <button style={{ ...S.submitBtn, background: THEME.accent, opacity: saving ? 0.6 : 1 }} onClick={onSubmit} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara post'}
        </button>
      </div>
    </div>
  );
}

function Stats({ entries, categories }) {
  const now = Date.now();
  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={{ ...S.h1, color: THEME.text }}>Statistik</h1>
        <p style={{ ...S.sub, color: THEME.textMuted }}>Senaste 24 timmar</p>
      </div>
      <div style={{ padding: '0 16px' }}>
        {categories.map(cat => {
          const c = getCat(cat);
          const last24 = entries.filter(e => e.what === cat && now - e.time < 86400000);
          const total = last24.reduce((s,e) => s+(parseFloat(e.amount)||0), 0);
          const lastEntry = entries.filter(e => e.what === cat).sort((a,b) => b.time - a.time)[0];
          return (
            <div key={cat} style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border, marginBottom: 10 }}>
              <div style={{ ...S.formRow, borderBottom: '1px solid ' + THEME.border }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: THEME.text }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.base }} />
                  {displayCat(cat)}
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

function Settings({ categories, setCategories, session, onSignOut }) {
  const addCat = () => {
    const name = prompt('Namn på ny kategori:');
    if (!name?.trim()) return;
    setCategories(c => [...c, name.trim()]);
  };
  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={{ ...S.h1, color: THEME.text }}>Inställningar</h1>
        <p style={{ ...S.sub, color: THEME.textMuted }}>{session.user.email}</p>
      </div>
      <div style={{ padding: '0 16px' }}>
        <div style={{ ...S.sectionTitle, color: THEME.textFaint }}>Kategorier</div>
        <div style={{ ...S.formCard, background: THEME.bg2, border: '1px solid ' + THEME.border }}>
          {categories.map((cat, i) => {
            const c = getCat(cat);
            return (
              <div key={cat} style={{ ...S.formRow, borderBottom: i < categories.length-1 ? '1px solid ' + THEME.border : 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: THEME.text }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.base }} />
                  {displayCat(cat)}
                </span>
                <button style={{ ...S.logBtn, color: THEME.textFaint }} onClick={() => setCategories(c => c.filter((_,j) => j !== i))}>✕</button>
              </div>
            );
          })}
        </div>
        <button style={{ ...S.submitBtn, background: THEME.border, color: THEME.text, marginTop: 10 }} onClick={addCat}>+ Lägg till kategori</button>
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
  header: { padding: '56px 20px 16px' },
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', margin: 0 },
  sub: { fontSize: 14, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 },
  nav: { position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, display: 'flex', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)' },
  navBtn: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 4px 8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, letterSpacing: '0.02em' },
  navAdd: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: '8px 4px' },
  addCircle: { width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  summaryCard: { borderRadius: 14, padding: '14px 16px' },
  chartCard: { borderRadius: 14, padding: 16, marginBottom: 16, background: THEME.bg2, border: '1px solid rgba(0,0,0,0.08)' },
  formCard: { borderRadius: 14, overflow: 'hidden' },
  formRow: { padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  input: { flex: 1, background: 'none', border: 'none', fontSize: 14, textAlign: 'right', outline: 'none', fontFamily: 'inherit', appearance: 'none' },
  submitBtn: { width: '100%', padding: 16, color: 'white', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 12 },
  logItem: { borderRadius: 8, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 },
  logBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  modal: { borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '20px 16px 36px' },
  handle: { width: 36, height: 4, borderRadius: 2, margin: '0 auto 20px' },
  modalTitle: { fontSize: 17, fontWeight: 700, marginBottom: 16 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 8, border: '1px solid rgba(0,0,0,0.14)', background: 'none', fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  toast: { position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', borderRadius: 20, fontSize: 14, fontWeight: 500, zIndex: 300, whiteSpace: 'nowrap' },
  empty: { textAlign: 'center', padding: '48px 32px', fontSize: 14 },
};

function GridIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function LogIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>; }
function PlusIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>; }
function StatsIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>; }
function SettingsIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>; }
function EditIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
