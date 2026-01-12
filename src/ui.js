import { getRecord, upsertRecord, getAllRecords } from './db.js';
import Chart from 'chart.js/auto';


/**
 * UI controller for 体重ログ
 * - index_fixed.html のIDに完全準拠
 * - グラフ0件時は graphEmptyNote を表示し canvas を隠す
 * - Chart.js はグローバル Chart を前提（Vite/依存関係側で読み込み）
 */

// -----------------------------
// State
// -----------------------------
const state = {
  mode: 'morning', // 'morning' | 'night'
  currentDate: null, // 'YYYY-MM-DD'
  currentRecord: null,
};

const graphState = {
  metric: 'weight', // 'weight' | 'calorie'
  chart: null,
};

// -----------------------------
// Helpers
// -----------------------------
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function clampDateRange(start, end) {
  const s = parseISODate(start);
  const e = parseISODate(end);
  if (!s || !e) return null;
  if (s.getTime() > e.getTime()) return null;
  return { start: s, end: e };
}

function show(el) {
  if (!el) return;
  el.classList.remove('hidden');
}

function hide(el) {
  if (!el) return;
  el.classList.add('hidden');
}

function setBodyMode(mode) {
  document.body.classList.toggle('mode-morning', mode === 'morning');
  document.body.classList.toggle('mode-night', mode === 'night');
  const theme = mode === 'morning' ? '#e0f7fa' : '#10131a';
  if (UI.themeMeta) UI.themeMeta.setAttribute('content', theme);
}

function destroyGraphChart() {
  try {
    if (graphState.chart) {
      graphState.chart.destroy();
      graphState.chart = null;
    }
  } catch {
    graphState.chart = null;
  }
}

function safeNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// -----------------------------
// UI references (index_fixed.html準拠)
// -----------------------------
const UI = {
  // main
  mainView: document.getElementById('app'),
  dateInput: document.getElementById('date-input'),
  btnMorning: document.getElementById('btn-mode-morning'),
  btnNight: document.getElementById('btn-mode-night'),
  weightGroup: document.getElementById('weight-group'),
  calorieGroup: document.getElementById('calorie-group'),
  weightInput: document.getElementById('weight-input'),
  calorieInput: document.getElementById('calorie-input'),
  actionBtn: document.getElementById('action-btn'),
  appTitle: document.getElementById('app-title'),
  themeMeta: document.getElementById('theme-color-meta'),
  exportBtn: document.getElementById('export-btn'),
  reportLinkBtn: document.getElementById('report-link-btn'),
  graphBtn: document.getElementById('graph-btn'),

  // report overlay
  reportView: document.getElementById('report-view'),
  reportStart: document.getElementById('report-start-date'),
  reportEnd: document.getElementById('report-end-date'),
  reportUpdateBtn: document.getElementById('report-update-btn'),
  reportBackBtn: document.getElementById('report-back-btn'),
  reportTableBody: document.getElementById('report-table-body'),
  reportQ1w: document.getElementById('report-q-1w'),
  reportQ1m: document.getElementById('report-q-1m'),
  reportQ3m: document.getElementById('report-q-3m'),
  reportQ1y: document.getElementById('report-q-1y'),
  summaryWeight: document.getElementById('summary-weight'),
  summaryCalorie: document.getElementById('summary-calorie'),

  // graph overlay
  graphView: document.getElementById('graph-view'),
  graphStartDate: document.getElementById('graph-start'),
  graphEndDate: document.getElementById('graph-end'),
  graphUpdateBtn: document.getElementById('graph-update-btn'),
  graphBackBtn: document.getElementById('graph-back-btn'),
  graphCanvas: document.getElementById('graphCanvas'),
  graphEmptyNote: document.getElementById('graphEmptyNote'),
  metricWeightBtn: document.getElementById('metric-weight'),
  metricCalorieBtn: document.getElementById('metric-calorie'),
};

// -----------------------------
// Main actions
// -----------------------------
async function loadRecordForDate(dateISO) {
  state.currentDate = dateISO;
  const rec = await getRecord(dateISO);
  state.currentRecord = rec || null;

  // reflect UI
  UI.dateInput && (UI.dateInput.value = dateISO);

  const w = rec?.weight ?? '';
  const c = rec?.total_calorie ?? '';
  if (UI.weightInput) UI.weightInput.value = (w === null || w === undefined) ? '' : String(w);
  if (UI.calorieInput) UI.calorieInput.value = (c === null || c === undefined) ? '' : String(c);

  // button label
  if (UI.actionBtn) {
    UI.actionBtn.textContent = state.mode === 'morning' ? '体重を記録' : 'カロリーを記録';
  }
}

async function saveCurrent() {
  const dateISO = UI.dateInput?.value || state.currentDate;
  if (!dateISO) return;

  const weightVal = safeNumber(UI.weightInput?.value);
  const calVal = safeNumber(UI.calorieInput?.value);

  // validate (modeに応じて最低限)
  if (state.mode === 'morning') {
    if (weightVal === null || weightVal <= 0) {
      alert('正しい体重を入力してください');
      return;
    }
  } else {
    if (calVal === null || calVal <= 0) {
      alert('正しいカロリーを入力してください');
      return;
    }
  }

  // merge: 片方の値を保存しても、もう片方は既存を残す
  const base = (await getRecord(dateISO)) || { date: dateISO, weight: null, total_calorie: null };
  const next = {
    ...base,
    date: dateISO,
    weight: (state.mode === 'morning') ? weightVal : (base.weight ?? null),
    total_calorie: (state.mode === 'night') ? calVal : (base.total_calorie ?? null),
  };

  await upsertRecord(next);
  await loadRecordForDate(dateISO);
}

function switchMode(mode) {
  state.mode = mode;

  // active button styles
  UI.btnMorning?.classList.toggle('active', mode === 'morning');
  UI.btnNight?.classList.toggle('active', mode === 'night');

  // show/hide groups
  UI.weightGroup?.classList.toggle('hidden', mode !== 'morning');
  UI.calorieGroup?.classList.toggle('hidden', mode !== 'night');

  // title
  if (UI.appTitle) UI.appTitle.textContent = (mode === 'morning') ? '朝の記録' : '夜の記録';

  // button label
  if (UI.actionBtn) UI.actionBtn.textContent = (mode === 'morning') ? '体重を記録' : 'カロリーを記録';

  setBodyMode(mode);
}

// -----------------------------
// CSV export
// -----------------------------
async function exportCSV() {
  const records = await getAllRecords();
  const header = ['date', 'weight', 'total_calorie'];
  const lines = [header.join(',')];

  // date asc
  records
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .forEach(r => {
      const row = [
        r.date ?? '',
        (r.weight ?? '') === null ? '' : (r.weight ?? ''),
        (r.total_calorie ?? '') === null ? '' : (r.total_calorie ?? ''),
      ];
      lines.push(row.join(','));
    });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weight_log_${toISODate(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// -----------------------------
// Report View
// -----------------------------
function openReport() {
  hide(UI.mainView);
  show(UI.reportView);

  // default: last 30 days
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);

  UI.reportStart && (UI.reportStart.value = toISODate(start));
  UI.reportEnd && (UI.reportEnd.value = toISODate(end));

  updateReport();
}

function closeReport() {
  hide(UI.reportView);
  show(UI.mainView);
}

function applyQuickReport(days) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  UI.reportStart && (UI.reportStart.value = toISODate(start));
  UI.reportEnd && (UI.reportEnd.value = toISODate(end));
  updateReport();
}

async function updateReport() {
  const range = clampDateRange(UI.reportStart?.value, UI.reportEnd?.value);
  if (!range) {
    alert('開始日・終了日を正しく入力してください');
    return;
  }
  const { start, end } = range;

  const all = await getAllRecords();
  const filtered = all
    .filter(r => {
      const d = parseISODate(r.date);
      if (!d) return false;
      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // table
  if (UI.reportTableBody) UI.reportTableBody.innerHTML = '';

  let prevWeight = null;
  filtered.forEach(r => {
    const w = safeNumber(r.weight);
    const diff = (w !== null && prevWeight !== null) ? (w - prevWeight) : null;
    if (w !== null) prevWeight = w;

    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.style.padding = '10px';
    tdDate.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
    tdDate.textContent = r.date ?? '';

    const tdW = document.createElement('td');
    tdW.style.padding = '10px';
    tdW.style.textAlign = 'right';
    tdW.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
    tdW.textContent = w === null ? '-' : w.toFixed(1);

    const tdDiff = document.createElement('td');
    tdDiff.style.padding = '10px';
    tdDiff.style.textAlign = 'right';
    tdDiff.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
    tdDiff.textContent = diff === null ? '-' : (diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1));

    tr.appendChild(tdDate);
    tr.appendChild(tdW);
    tr.appendChild(tdDiff);
    UI.reportTableBody?.appendChild(tr);
  });

  // summary
  const weights = filtered.map(r => safeNumber(r.weight)).filter(v => v !== null);
  const cals = filtered.map(r => safeNumber(r.total_calorie)).filter(v => v !== null);

  if (UI.summaryWeight) {
    if (weights.length === 0) UI.summaryWeight.textContent = '-';
    else {
      const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
      UI.summaryWeight.textContent = `平均 ${avg.toFixed(1)} / 件数 ${weights.length}`;
    }
  }

  if (UI.summaryCalorie) {
    if (cals.length === 0) UI.summaryCalorie.textContent = '-';
    else {
      const avg = cals.reduce((a, b) => a + b, 0) / cals.length;
      UI.summaryCalorie.textContent = `平均 ${Math.round(avg)} / 件数 ${cals.length}`;
    }
  }
}

// -----------------------------
// Graph View
// -----------------------------
function setGraphTab(metric) {
  graphState.metric = metric;

  UI.metricWeightBtn?.classList.toggle('is-active', metric === 'weight');
  UI.metricCalorieBtn?.classList.toggle('is-active', metric === 'calorie');
}

function openGraph() {
  hide(UI.mainView);
  show(UI.graphView);

  // default: last 7 days
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  UI.graphStartDate && (UI.graphStartDate.value = toISODate(start));
  UI.graphEndDate && (UI.graphEndDate.value = toISODate(end));

  setGraphTab('weight');
  updateGraph();

  // quick button active styling
  const quickBtns = Array.from(document.querySelectorAll('#graph-view .quick-btn'));
  quickBtns.forEach(b => b.classList.remove('active'));
  const active = quickBtns.find(b => String(b.dataset.range) === '7');
  active?.classList.add('active');
}

function closeGraph() {
  hide(UI.graphView);
  show(UI.mainView);
  destroyGraphChart();
}

function applyQuickRangeDays(days) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(0, days - 1));

  UI.graphStartDate && (UI.graphStartDate.value = toISODate(start));
  UI.graphEndDate && (UI.graphEndDate.value = toISODate(end));

  // active styles
  const buttons = Array.from(document.querySelectorAll('#graph-view .quick-btn'));
  buttons.forEach(btn => btn.classList.remove('active'));
  const active = buttons.find(btn => String(btn.dataset.range) === String(days));
  active?.classList.add('active');

  updateGraph();
}

async function updateGraph() {
  const range = clampDateRange(UI.graphStartDate?.value, UI.graphEndDate?.value);
  if (!range) {
    alert('開始日・終了日を正しく入力してください');
    return;
  }
  const { start, end } = range;

  const all = await getAllRecords();
  const records = all
    .filter(r => {
      const d = parseISODate(r.date);
      if (!d) return false;
      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  renderGraph(records);
}

function renderGraph(records) {
  destroyGraphChart();

  // データが無い or 指標が全てnullなら empty を出す
  const isWeight = graphState.metric === 'weight';
  const values = records.map(r => safeNumber(isWeight ? r.weight : r.total_calorie));
  const hasAny = values.some(v => v !== null);

  if (!UI.graphCanvas) return;

  if (!hasAny) {
    // hide canvas, show note
    UI.graphCanvas.style.display = 'none';
    show(UI.graphEmptyNote);
    return;
  }

  // show canvas, hide note
  UI.graphCanvas.style.display = 'block';
  hide(UI.graphEmptyNote);

  // labels and data
  const labels = records.map(r => {
    const d = parseISODate(r.date) || new Date(r.date);
    const mm = d.getMonth() + 1;
    const dd = d.getDate();
    return `${mm}/${dd}`;
  });

  const dataset = {
    label: isWeight ? '体重 (kg)' : 'カロリー (kcal)',
    data: values,
    spanGaps: true,
    tension: 0.25,
    pointRadius: 3,
    pointHoverRadius: 5,
  };

  const ctx = UI.graphCanvas.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') {
    console.warn('Chart.js が読み込まれていません');
    return;
  }

  graphState.chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [dataset] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true },
      },
      scales: {
        y: { beginAtZero: false },
      },
    },
  });
}

// -----------------------------
// Init
// -----------------------------
export async function init() {
  // default date: today
  const today = toISODate(new Date());
  if (UI.dateInput && !UI.dateInput.value) UI.dateInput.value = today;

  switchMode('morning');
  await loadRecordForDate(UI.dateInput?.value || today);

  // main listeners
  UI.dateInput?.addEventListener('change', async () => {
    const dateISO = UI.dateInput.value;
    await loadRecordForDate(dateISO);
  });

  UI.btnMorning?.addEventListener('click', async () => {
    switchMode('morning');
    await loadRecordForDate(UI.dateInput?.value || today);
  });

  UI.btnNight?.addEventListener('click', async () => {
    switchMode('night');
    await loadRecordForDate(UI.dateInput?.value || today);
  });

  UI.actionBtn?.addEventListener('click', saveCurrent);
  UI.exportBtn?.addEventListener('click', exportCSV);

  UI.reportLinkBtn?.addEventListener('click', openReport);
  UI.graphBtn?.addEventListener('click', openGraph);

  // report listeners
  UI.reportUpdateBtn?.addEventListener('click', updateReport);
  UI.reportBackBtn?.addEventListener('click', closeReport);
  UI.reportQ1w?.addEventListener('click', () => applyQuickReport(7));
  UI.reportQ1m?.addEventListener('click', () => applyQuickReport(30));
  UI.reportQ3m?.addEventListener('click', () => applyQuickReport(90));
  UI.reportQ1y?.addEventListener('click', () => applyQuickReport(365));

  // graph listeners
  UI.graphBackBtn?.addEventListener('click', closeGraph);
  UI.graphUpdateBtn?.addEventListener('click', updateGraph);

  // quick buttons inside graph-view
  document.querySelectorAll('#graph-view .quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = Number(btn.dataset.range);
      if (!Number.isFinite(days) || days <= 0) return;
      applyQuickRangeDays(days);
    });
  });

  UI.metricWeightBtn?.addEventListener('click', () => {
    setGraphTab('weight');
    updateGraph();
  });

  UI.metricCalorieBtn?.addEventListener('click', () => {
    setGraphTab('calorie');
    updateGraph();
  });
}
