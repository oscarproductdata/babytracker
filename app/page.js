"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";

const CATEGORY_COLORS = {
  'Ersättning': '#2d6a4f', 'Amning': '#9d174d', 'Vikt': '#1d4ed8',
  'Bajs': '#b45309', 'Kiss': '#6d28d9',
};
const CATEGORY_UNITS = {
  'Ersättning': 'ml', 'Amning': 'min', 'Vikt': 'gram', 'Bajs': 'n/a', 'Kiss': 'n/a',
};
const DEFAULT_CATEGORIES = ['Ersättning', 'Amning', 'Vikt', 'Bajs', 'Kiss'];

function getColor(cat) { return CATEGORY_COLORS[cat] || '#6b6860'; }

function timeSince(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h + 'h ' + (m > 0 ? m + 'min' : '');
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('sv-SE', { weekday: 'long', month: 'long', day: 'numeric' });
}

function pad(n) { return String(n).padStart(2, '0'); }

function toDatetimeLocal(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
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

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/entries');
      if (res.ok) { const data = await res.json(); setEntries(data); }
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { if (session) fetchEntries(); }, [session, fetchEntries]);

  useEffect(() => {
    if (page === 'add') {
      const now = new Date();
      setForm({ what: '', time: toDatetimeLocal(now), amount: '', unit: 'n/a' });
    }
  }, [page]);

  if (status === 'loading') return <Loading />;
  if (!session) return <Login />;

  const handleCategoryChange = (cat, isEdit = false) => {
    const unit = CATEGORY_UNITS[cat] || 'n/a';
    if (isEdit) setEditEntry(e => ({ ...e, what: cat, unit }));
    else setForm(f => ({ ...f, what: cat, unit }));
  };

  const submitEntry = async () => {
    if (!form.what || !form.time) { showToast('Välj kategori och tid'); return; }
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ what: form.what, time: new Date(form.time).getTime(), amount: form.amount, unit: form.unit }),
    });
    if (res.ok) { showToast('Sparad ✓'); fetchEntries(); setPage('dashboard'); }
    else showToast('Något gick fel');
  };

  const saveEdit = async () => {
    const res = await fetch('/api/entries/' + editEntry.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ what: editEntry.what, time: editEntry.time, amount: editEntry.amount, unit: editEntry.unit }),
    });
    if (res.ok) { showToast('Sparad ✓'); fetchEntries(); setEditEntry(null); }
    else showToast('Något gick fel');
  };

  const deleteEntry = async () => {
    if (!confirm('Radera denna post?')) return;
    const res = await fetch('/api/entries/' + editEntry.id, { method: 'DELETE' });
    if (res.ok) { showToast('Raderad'); fetchEntries(); setEditEntry(null); }
    else showToast('Något gick fel');
  };

  return (
    <div style={S.app}>
      {page === 'dashboard' && <Dashboard entries={entries} loading={loading} categories={categories} />}
      {page === 'log' && <Log entries={entries} onEdit={setEditEntry} />}
      {page === 'add' && <AddForm form={form} setForm={setForm} categories={categories} onCategoryChange={handleCategoryChange} onSubmit={submitEntry} />}
      {page === 'stats' && <Stats entries={entries} categories={categories} />}
      {page === 'settings' && <Settings categories={categories} setCategories={setCategories} session={session} onSignOut={() => signOut()} />}

      <nav style={S.nav}>
        {[
          { id: 'dashboard', icon: <GridIcon />, label: 'Översikt' },
          { id: 'log', icon: <LogIcon />, label: 'Logg' },
          { id: 'add', icon: null, label: '' },
          { id: 'stats', icon: <StatsIcon />, label: 'Statistik' },
          { id: 'settings', icon: <SettingsIcon />, label: 'Inställningar' },
        ].map(({ id, icon, label }) => id === 'add' ? (
          <button key="add" style={S.navAdd} onClick={() => setPage('add')}>
            <div style={{ ...S.addCircle, background: page === 'add' ? '#1b4332' : '#2d6a4f' }}>
              <PlusIcon />
            </div>
          </button>
        ) : (
          <button key={id} style={{ ...S.navBtn, color: page === id ? '#2d6a4f' : '#9e9b95' }} onClick={() => setPage(id)}>
            {icon}
            <span style={{ fontSize: 10 }}>{label}</span>
          </button>
        ))}
      </nav>

      {editEntry && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setEditEntry(null)}>
          <div style={S.modal}>
            <div style={S.handle} />
            <div style={S.modalTitle}>Redigera post</div>
            <div style={S.formCard}>
              <FormRow label="Kategori">
                <select style={S.input} value={editEntry.what} onChange={e => handleCategoryChange(e.target.value, true)}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormRow>
              <FormRow label="Tid">
                <input type="datetime-local" style={S.input} value={toDatetimeLocal(editEntry.time)} onChange={e => setEditEntry(v => ({ ...v, time: new Date(e.target.value).getTime() }))} />
              </FormRow>
              <FormRow label="Mängd">
                <input type="number" style={S.input} value={editEntry.amount || ''} onChange={e => setEditEntry(v => ({ ...v, amount: e.target.value }))} inputMode="decimal" />
              </FormRow>
              <FormRow label="Enhet" last>
                <select style={S.input} value={editEntry.unit} onChange={e => setEditEntry(v => ({ ...v, unit: e.target.value }))}>
                  {['n/a','ml','min','gram'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </FormRow>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={{ ...S.modalBtn, color: '#c0392b' }} onClick={deleteEntry}>Radera</button>
              <button style={{ ...S.modalBtn, background: '#2d6a4f', color: 'white', borderColor: '#2d6a4f' }} onClick={saveEdit}>Spara</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

function Dashboard({ entries, loading, categories }) {
  const now = new Date();
  const weightEntries = entries.filter(e => e.what === 'Vikt').sort((a,b) => b.time - a.time);
  const trackCats = categories.filter(c => c !== 'Vikt');

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.h1}>Översikt</h1>
        <p style={S.sub}>{now.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {weightEntries.length > 0 && (
        <div style={{ background: '#eff6ff', borderRadius: 14, margin: '0 16px 16px', padding: '14px 16px', border: '1px solid rgba(29,78,216,0.15)' }}>
          <div style={{ fontSize: 11, color: '#9e9b95', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Senaste vikt</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1d4ed8', letterSpacing: '-0.5px', marginTop: 2 }}>{weightEntries[0].amount} gram</div>
          <div style={{ fontSize: 12, color: '#6b6860', marginTop: 2 }}>Uppmätt {timeSince(weightEntries[0].time)} sedan</div>
        </div>
      )}

      {loading ? <div style={S.empty}>Laddar...</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 16px 16px' }}>
          {trackCats.map(cat => {
            const catEntries = entries.filter(e => e.what === cat).sort((a,b) => b.time - a.time);
            const last = catEntries[0];
            const last24 = catEntries.filter(e => Date.now() - e.time < 86400000);
            const total24 = last24.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
            return (
              <div key={cat} style={S.summaryCard}>
                <div style={{ fontSize: 11, color: '#9e9b95', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: getColor(cat), flexShrink: 0 }} />
                  {cat}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1 }}>{last ? timeSince(last.time) : '—'}</div>
                <div style={{ fontSize: 12, color: '#6b6860', marginTop: 3 }}>sedan senast</div>
                <div style={{ fontSize: 12, color: '#6b6860', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  {total24 > 0 ? `24h: ${total24} ${last?.unit}` : 'Inget senaste 24h'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Log({ entries, onEdit }) {
  let currentDate = '';
  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.h1}>Logg</h1>
        <p style={S.sub}>{entries.length} poster</p>
      </div>
      <div style={{ padding: '0 16px' }}>
        {!entries.length && <div style={S.empty}>Inga poster ännu.</div>}
        {entries.map(e => {
          const dateStr = new Date(e.time).toDateString();
          const showHeader = dateStr !== currentDate;
          if (showHeader) currentDate = dateStr;
          return (
            <div key={e.id}>
              {showHeader && <div style={{ fontSize: 12, fontWeight: 600, color: '#9e9b95', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '16px 0 8px' }}>{formatDate(e.time)}</div>}
              <div style={S.logItem}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: getColor(e.what), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{e.what}</div>
                  <div style={{ fontSize: 12, color: '#6b6860', marginTop: 2 }}>{e.amount ? e.amount + ' ' + e.unit : '—'}</div>
                </div>
                <div style={{ fontSize: 12, color: '#9e9b95' }}>{formatTime(e.time)}</div>
                <button style={S.logBtn} onClick={() => onEdit(e)}>
                  <EditIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddForm({ form, setForm, categories, onCategoryChange, onSubmit }) {
  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.h1}>Lägg till</h1>
        <p style={S.sub}>Ny post</p>
      </div>
      <div style={{ padding: '0 16px' }}>
        <div style={S.formCard}>
          <FormRow label="Kategori">
            <select style={S.input} value={form.what} onChange={e => onCategoryChange(e.target.value)}>
              <option value="">Välj...</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormRow>
          <FormRow label="Tid">
            <input type="datetime-local" style={S.input} value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
          </FormRow>
          <FormRow label="Mängd">
            <input type="number" style={S.input} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" inputMode="decimal" />
          </FormRow>
          <FormRow label="Enhet" last>
            <select style={S.input} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {['n/a','ml','min','gram'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </FormRow>
        </div>
        <button style={S.submitBtn} onClick={onSubmit}>Spara post</button>
      </div>
    </div>
  );
}

function Stats({ entries, categories }) {
  const now = Date.now();
  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.h1}>Statistik</h1>
        <p style={S.sub}>Senaste 24 timmar</p>
      </div>
      <div style={{ padding: '0 16px' }}>
        {categories.map(cat => {
          const last24 = entries.filter(e => e.what === cat && now - e.time < 86400000);
          const total = last24.reduce((s,e) => s+(parseFloat(e.amount)||0), 0);
          const lastEntry = entries.filter(e => e.what === cat).sort((a,b) => b.time - a.time)[0];
          return (
            <div key={cat} style={{ ...S.formCard, marginBottom: 10 }}>
              <div style={{ ...S.formRow, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: getColor(cat) }} />
                  {cat}
                </span>
                <span style={{ fontSize: 14, color: '#6b6860' }}>{last24.length} st</span>
              </div>
              {total > 0 && <div style={S.formRow}><span style={{ fontSize: 14, color: '#6b6860' }}>Total</span><span style={{ fontSize: 14 }}>{total} {lastEntry?.unit}</span></div>}
              <div style={S.formRow}><span style={{ fontSize: 14, color: '#6b6860' }}>Senast</span><span style={{ fontSize: 14, color: '#6b6860' }}>{lastEntry ? timeSince(lastEntry.time) + ' sedan' : '—'}</span></div>
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
        <h1 style={S.h1}>Inställningar</h1>
        <p style={S.sub}>{session.user.email}</p>
      </div>
      <div style={{ padding: '0 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#9e9b95', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Kategorier</div>
        <div style={S.formCard}>
          {categories.map((cat, i) => (
            <div key={cat} style={{ ...S.formRow, borderBottom: i < categories.length-1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: getColor(cat) }} />
                {cat}
              </span>
              <button style={S.logBtn} onClick={() => setCategories(c => c.filter((_,j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
        <button style={{ ...S.submitBtn, background: 'rgba(0,0,0,0.05)', color: '#1a1916', marginTop: 10 }} onClick={addCat}>+ Lägg till kategori</button>
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#9e9b95', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Konto</div>
          <div style={S.formCard}>
            <div style={S.formRow}>
              <span style={{ fontSize: 14 }}>{session.user.name}</span>
              <button style={{ ...S.logBtn, color: '#c0392b', fontSize: 13 }} onClick={onSignOut}>Logga ut</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'-apple-system,sans-serif',fontSize:14,color:'#6b6860' }}>Laddar...</div>;
}

function Login() {
  return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'-apple-system,sans-serif',background:'#f8f7f4',padding:20,textAlign:'center' }}>
      <div style={{ fontSize:56,marginBottom:16 }}>🍼</div>
      <h1 style={{ fontSize:28,fontWeight:700,letterSpacing:'-0.5px',marginBottom:8,color:'#1a1916' }}>Babytracker</h1>
      <p style={{ fontSize:15,color:'#6b6860',marginBottom:32 }}>Logga in för att fortsätta</p>
      <button onClick={() => signIn('google')} style={{ padding:'14px 28px',background:'#2d6a4f',color:'white',border:'none',borderRadius:12,fontSize:16,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:10 }}>
        <svg width="20" height="20" viewBox="0 0 24 24"><path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.09 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Logga in med Google
      </button>
    </div>
  );
}

function FormRow({ label, children, last }) {
  return (
    <div style={{ ...S.formRow, borderBottom: last ? 'none' : '1px solid rgba(0,0,0,0.06)' }}>
      <span style={{ fontSize: 14, fontWeight: 500, minWidth: 90 }}>{label}</span>
      {children}
    </div>
  );
}

const S = {
  app: { fontFamily: '-apple-system,"Helvetica Neue",sans-serif', background: '#f8f7f4', minHeight: '100vh', maxWidth: 480, margin: '0 auto', color: '#1a1916' },
  page: { paddingBottom: 90 },
  header: { padding: '56px 20px 16px' },
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', margin: 0 },
  sub: { fontSize: 14, color: '#6b6860', marginTop: 2 },
  nav: { position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: 'white', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)' },
  navBtn: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 4px 8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, letterSpacing: '0.02em', transition: 'color 0.15s' },
  navAdd: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: '8px 4px' },
  addCircle: { width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  summaryCard: { background: 'white', borderRadius: 14, padding: '14px 16px', border: '1px solid rgba(0,0,0,0.08)' },
  formCard: { background: 'white', borderRadius: 14, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' },
  formRow: { padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  input: { flex: 1, background: 'none', border: 'none', fontSize: 14, color: '#1a1916', textAlign: 'right', outline: 'none', fontFamily: 'inherit', appearance: 'none' },
  submitBtn: { width: '100%', padding: 16, background: '#2d6a4f', color: 'white', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 12 },
  logItem: { background: 'white', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(0,0,0,0.08)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 },
  logBtn: { background: 'none', border: 'none', color: '#9e9b95', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  modal: { background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '20px 16px 36px' },
  handle: { width: 36, height: 4, background: 'rgba(0,0,0,0.14)', borderRadius: 2, margin: '0 auto 20px' },
  modalTitle: { fontSize: 17, fontWeight: 700, marginBottom: 16 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 8, border: '1px solid rgba(0,0,0,0.14)', background: 'none', fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  toast: { position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#1a1916', color: 'white', padding: '10px 20px', borderRadius: 20, fontSize: 14, fontWeight: 500, zIndex: 300, whiteSpace: 'nowrap' },
  empty: { textAlign: 'center', padding: '48px 32px', color: '#9e9b95', fontSize: 14 },
};

function GridIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function LogIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>; }
function PlusIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>; }
function StatsIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>; }
function SettingsIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>; }
function EditIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
