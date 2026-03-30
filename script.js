// ─── Konfiguracija ───────────────────────────────────────────────────────────
const POLL_MS       = 2000;   // interval fetchovanja
const DIST_MAX_MM   = 2000;   // za progress bar
const MAX_HISTORY   = 60;     // tacaka na grafu

// ─── State ───────────────────────────────────────────────────────────────────
let allLog      = [];   // { time, count, dist } — cuva se u memoriji browsera
let logPage     = 1;
let distHistory = [];
let prevCount   = null;
let pollTimer   = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
window.onload = () => {
  updateClock();
  setInterval(updateClock, 1000);
  setDefaultDates();
  loadLogFromStorage();
  renderLog();
  startPolling();
};

function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('sr-RS');
}

function fmtDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

function fmtDateSr(d) {
  return String(d.getDate()).padStart(2,'0') + '.' +
    String(d.getMonth()+1).padStart(2,'0') + '.' +
    d.getFullYear();
}

function fmtTimeSr(d) {
  return String(d.getHours()).padStart(2,'0') + ':' +
    String(d.getMinutes()).padStart(2,'0') + ':' +
    String(d.getSeconds()).padStart(2,'0');
}

function setDefaultDates() {
  const today = new Date(), ts = fmtDate(today);
  const weekAgo = fmtDate(new Date(today - 7*86400000));
  ['rFrom','logFrom'].forEach(id => document.getElementById(id).value = weekAgo);
  ['rTo','logTo'].forEach(id => document.getElementById(id).value = ts);
}

// ─── LocalStorage log ─────────────────────────────────────────────────────────
// Log se čuva u sessionStorage dok je tab otvoren.
// Korisnik može da klikne "Obriši log" da ga resetuje.
function loadLogFromStorage() {
  try {
    const raw = sessionStorage.getItem('brod_log');
    allLog = raw ? JSON.parse(raw) : [];
  } catch { allLog = []; }
}

function saveLogToStorage() {
  try { sessionStorage.setItem('brod_log', JSON.stringify(allLog)); } catch {}
}

function addLogEntry(count, dist) {
  const now = new Date();
  allLog.unshift({
    time:  fmtDateSr(now) + ' ' + fmtTimeSr(now),
    count: count,
    dist:  dist,
    ts:    now.getTime()
  });
  if (allLog.length > 2000) allLog = allLog.slice(0, 2000);
  saveLogToStorage();
}

// ─── Polling ──────────────────────────────────────────────────────────────────
function startPolling() {
  fetchData();
  pollTimer = setInterval(fetchData, POLL_MS);
}

async function fetchData() {
  try {
    const res  = await fetch('/api/data', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    setOnline(true);
    updateLive(data);

    // Novi count -> dodaj u log
    if (prevCount !== null && data.brojac > prevCount) {
      addLogEntry(data.brojac, data.udaljenost);
      renderLog();
    }
    prevCount = data.brojac;

  } catch {
    setOnline(false);
  }
}

// ─── Live prikaz ──────────────────────────────────────────────────────────────
function updateLive(data) {
  const dist  = parseInt(data.udaljenost) || 0;
  const count = parseInt(data.brojac)     ?? 0;
  const blok  = data.blokirano === true || data.blokirano === 'true';
  const preMs = parseInt(data.preostaloMs) || 0;

  // Rastojanje
  document.getElementById('distVal').textContent = dist > 0 ? dist : '—';
  const bar = document.getElementById('distBar');
  bar.style.width   = Math.min(100, (dist / DIST_MAX_MM) * 100) + '%';
  bar.style.background = dist < 200 ? 'var(--red)' : dist < 600 ? 'var(--amber)' : 'var(--accent)';

  // Brojac
  document.getElementById('countVal').textContent = count;

  // Last detection badge
  if (allLog.length > 0) {
    document.getElementById('lastDetBadge').innerHTML =
      `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>${allLog[0].time}`;
  }

  // Status senzora
  const isNear = dist > 0 && dist < 1500;
  const sv = document.getElementById('statusVal');
  const ss = document.getElementById('statusSub');
  const orb = document.getElementById('sensorOrb');
  const icon = document.getElementById('sensorIcon');
  const lbl = document.getElementById('sensorLabel');
  const inf = document.getElementById('sensorInfo');

  if (isNear) {
    sv.textContent = 'Detektovan'; sv.style.color = 'var(--red)';
    ss.textContent = 'Objekat u zoni';
    orb.className = 's-orb near'; icon.textContent = '●';
    lbl.textContent = 'Objekat detektovan'; lbl.className = 's-lbl near';
    inf.textContent = 'Senzor je aktiviran — objekat ispred';
  } else {
    sv.textContent = 'Slobodno'; sv.style.color = 'var(--green)';
    ss.textContent = 'Zona slobodna';
    orb.className = 's-orb clear'; icon.textContent = '○';
    lbl.textContent = 'Zona slobodna'; lbl.className = 's-lbl clear';
    inf.textContent = 'Nema objekta ispred senzora';
  }

  // Blokada
  const bv = document.getElementById('blokadaVal');
  const bs = document.getElementById('blokadaSub');
  if (blok) {
    const sek = Math.ceil(preMs / 1000);
    bv.textContent = sek + 's'; bv.style.color = 'var(--red)';
    bs.textContent = 'blokada aktivna';
  } else {
    bv.textContent = 'Spreman'; bv.style.color = 'var(--green)';
    bs.textContent = 'čeka novu detekciju';
  }

  // Graf
  distHistory.push(dist);
  if (distHistory.length > MAX_HISTORY) distHistory.shift();
  drawChart();
}

// ─── Canvas graf ─────────────────────────────────────────────────────────────
function drawChart() {
  const canvas = document.getElementById('distChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (distHistory.length < 2) return;

  const max = Math.max(...distHistory, 100);
  const pts = distHistory.map((v, i) => ({
    x: (i / (distHistory.length - 1)) * W,
    y: H - (v / max) * (H - 14) - 7
  }));

  const dark = window.matchMedia('(prefers-color-scheme:dark)').matches;
  const ac = dark ? '224,90,32' : '200,65,10';

  // Fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgba(${ac},.18)`);
  grad.addColorStop(1, `rgba(${ac},0)`);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, H);
  pts.forEach((p, i) => {
    if (i === 0) { ctx.lineTo(p.x, p.y); return; }
    const c = pts[i-1];
    ctx.bezierCurveTo((c.x+p.x)/2, c.y, (c.x+p.x)/2, p.y, p.x, p.y);
  });
  ctx.lineTo(pts[pts.length-1].x, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = `rgba(${ac},.9)`;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  pts.forEach((p, i) => {
    if (i === 0) { ctx.moveTo(p.x, p.y); return; }
    const c = pts[i-1];
    ctx.bezierCurveTo((c.x+p.x)/2, c.y, (c.x+p.x)/2, p.y, p.x, p.y);
  });
  ctx.stroke();

  // Threshold linija (1500mm)
  const ty = H - (1500/max) * (H-14) - 7;
  if (ty > 0 && ty < H) {
    ctx.beginPath();
    ctx.strokeStyle = dark ? 'rgba(248,113,113,.4)' : 'rgba(220,38,38,.35)';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.moveTo(0, ty); ctx.lineTo(W, ty);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ─── Log ──────────────────────────────────────────────────────────────────────
function parseDateTime(s) {
  if (!s) return 0;
  const [d, t] = s.split(' ');
  if (!d || !t) return 0;
  const [dd, mm, yyyy] = d.split('.');
  const [hh, mi, ss]   = t.split(':');
  return new Date(+yyyy, +mm-1, +dd, +hh, +mi, +(ss||0)).getTime();
}

function tsToDateStr(ts) { return fmtDate(new Date(ts)); }
function tsToTimeStr(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function filterLog(f1, f2, f3, f4) {
  const from = document.getElementById(f1).value;
  const to   = document.getElementById(f2).value;
  const tf   = document.getElementById(f3)?.value || '00:00';
  const tt   = document.getElementById(f4)?.value || '23:59';
  return allLog.filter(e => {
    const ts = e.ts || parseDateTime(e.time);
    if (!ts) return false;
    const ds = tsToDateStr(ts), tm = tsToTimeStr(ts);
    if (from && ds < from) return false;
    if (to   && ds > to)   return false;
    if (tm < tf || tm > tt) return false;
    return true;
  });
}

function renderLog() {
  const search = (document.getElementById('logSearch')?.value || '').toLowerCase();
  const pp     = parseInt(document.getElementById('logPerPage')?.value) || 15;
  let filtered = filterLog('logFrom','logTo','logTimeFrom','logTimeTo');
  if (search) filtered = filtered.filter(e => e.time?.toLowerCase().includes(search));

  const body   = document.getElementById('logBody');
  const empty  = document.getElementById('logEmpty');
  const pages  = Math.ceil(filtered.length / pp) || 1;
  if (logPage > pages) logPage = 1;

  if (filtered.length === 0) {
    body.innerHTML = '';
    document.getElementById('logEmptyMsg').textContent =
      allLog.length === 0 ? 'Nema zabeleženih detekcija u ovoj sesiji' : 'Nema zapisa za ovaj filter';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    const slice = filtered.slice((logPage-1)*pp, logPage*pp);
    body.innerHTML = slice.map((e, i) => `
      <tr>
        <td style="color:var(--text3)">${(logPage-1)*pp+i+1}</td>
        <td>${e.time || '—'}</td>
        <td><span class="bdg bdg-b">#${e.count ?? '—'}</span></td>
        <td style="color:var(--text2)">${e.dist ?? '—'} mm</td>
        <td><span class="bdg bdg-g">Detektovano</span></td>
      </tr>`).join('');
  }

  const pg = document.getElementById('pagination');
  if (pages <= 1) { pg.innerHTML = ''; return; }
  pg.innerHTML = Array.from({length: pages}, (_, i) =>
    `<button class="pgb${i+1===logPage?' on':''}" onclick="logPage=${i+1};renderLog()">${i+1}</button>`
  ).join('');
}

function clearLog() {
  if (!confirm('Obrisati ceo log detekcija?\nBrojač na ESP32 ostaje nepromenjen.')) return;
  allLog = [];
  prevCount = null;
  saveLogToStorage();
  renderLog();
  toast('Log obrisan');
}

// ─── Izveštaji ────────────────────────────────────────────────────────────────
function generateReport() {
  const filtered = filterLog('rFrom','rTo','rTimeFrom','rTimeTo');
  const group    = document.getElementById('rGroup').value;
  const groups   = {};

  filtered.forEach(e => {
    const d   = new Date(e.ts || parseDateTime(e.time));
    let key;
    if (group === 'hour') {
      key = fmtDate(d) + ' ' + String(d.getHours()).padStart(2,'0') + ':00';
    } else if (group === 'week') {
      const dy = d.getDay() || 7;
      const mon = new Date(d); mon.setDate(d.getDate() - dy + 1);
      key = 'Sed. od ' + fmtDateSr(mon);
    } else {
      key = fmtDateSr(d);
    }
    groups[key] = (groups[key] || 0) + 1;
  });

  const entries = Object.entries(groups).sort((a,b) => a[0] > b[0] ? 1 : -1);
  const total   = filtered.length;
  const vals    = entries.map(e => e[1]);
  const maxV    = vals.length ? Math.max(...vals) : 0;
  const avgV    = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : 0;

  document.getElementById('reportSummary').classList.add('on');
  document.getElementById('rTotal').textContent   = total;
  document.getElementById('rMax').textContent     = maxV;
  document.getElementById('rAvg').textContent     = avgV;
  document.getElementById('rPeriods').textContent = entries.length;

  const wrap = document.getElementById('reportTableWrap');
  if (!entries.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-i">📊</div><p>${
      allLog.length === 0 ? 'Nema podataka u ovoj sesiji' : 'Nema podataka za ovaj period'
    }</p></div>`;
    return;
  }

  const mb = maxV || 1;
  wrap.innerHTML = `<table>
    <thead><tr><th>Period</th><th>Detekcija</th><th>Udeo</th><th style="min-width:120px">Distribucija</th></tr></thead>
    <tbody>${entries.map(([k,v]) => `<tr>
      <td>${k}</td>
      <td><span class="bdg bdg-b">${v}</span></td>
      <td style="color:var(--text3)">${total ? ((v/total)*100).toFixed(1) : 0}%</td>
      <td><div class="rbt"><div class="rbf" style="width:${Math.round((v/mb)*100)}%"></div></div></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV() {
  const filtered = filterLog('logFrom','logTo','logTimeFrom','logTimeTo');
  const rows = [['#','Vreme','Redni broj','Rastojanje mm']];
  filtered.forEach((e,i) => rows.push([i+1, e.time||'', e.count||'', e.dist||'']));
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.map(r=>r.join(',')).join('\n'));
  a.download = 'detekcije_' + fmtDate(new Date()) + '.csv';
  a.click();
  toast('CSV preuzet');
}

// ─── Reset brojača ────────────────────────────────────────────────────────────
// Šalje POST /api/reset na ESP32.
// U firmware dodaj handler koji resetuje brojacKorpi=0.
async function resetCount() {
  if (!confirm('Resetovati brojač na 0?\nLog u browseru ostaje sačuvan.')) return;
  try {
    await fetch('/api/reset', { method: 'POST', signal: AbortSignal.timeout(3000) });
    prevCount = 0;
    toast('Brojač resetovan');
  } catch {
    toast('Greška: ESP32 nije odgovorio');
  }
}

// ─── Tab switch ───────────────────────────────────────────────────────────────
function switchTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
  if (id === 'reports') generateReport();
}

// ─── Online/offline ───────────────────────────────────────────────────────────
function setOnline(on) {
  const p = document.getElementById('connStatus');
  const l = document.getElementById('connLabel');
  p.className = 'pill ' + (on ? 'online' : 'offline');
  l.textContent = on ? 'Živo' : 'Offline';
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
