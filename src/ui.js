import { getRecord, upsertRecord, getAllRecords } from './db.js';

const STATE = {
    currentDate: new Date().toISOString().split('T')[0],
    mode: 'morning', // 'morning' | 'night'
    currentRecord: null
};

const UI = {
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
    exportBtn: document.getElementById('export-btn')
};

export async function init() {
    // Initialize Date Input
    UI.dateInput.value = STATE.currentDate;

    // Event Listeners
    UI.dateInput.addEventListener('change', handleDateChange);
    UI.btnMorning.addEventListener('click', () => switchMode('morning'));
    UI.btnNight.addEventListener('click', () => switchMode('night'));
    UI.actionBtn.addEventListener('click', handleSave);
    UI.exportBtn.addEventListener('click', handleExport);

    // Initial Load
    await loadDataForDate(STATE.currentDate);
    updateUI();
}

async function handleDateChange(e) {
    STATE.currentDate = e.target.value;
    await loadDataForDate(STATE.currentDate);
}

async function loadDataForDate(date) {
    try {
        const record = await getRecord(date);
        STATE.currentRecord = record || { date, weight: null, total_calorie: null };
        STATE.isExistingRecord = !!record;

        // Populate Inputs
        // Populate Inputs
        UI.weightInput.value = STATE.currentRecord.weight !== null && STATE.currentRecord.weight !== undefined
            ? Number(STATE.currentRecord.weight).toFixed(1)
            : '';
        UI.calorieInput.value = STATE.currentRecord.total_calorie || '';

        // Special logic: If in morning mode and weight exists, maybe focus logic?
        // If in night mode, we show weight but disable it (via UI update)
    } catch (err) {
        console.error('Failed to load data', err);
        alert('データの読み込みに失敗しました。');
    }
}

function switchMode(mode) {
    STATE.mode = mode;
    updateUI();
}

function updateUI() {
    const isMorning = STATE.mode === 'morning';

    // 1. Theme Configuration
    document.body.className = isMorning ? 'mode-morning' : 'mode-night';
    UI.themeMeta.content = isMorning ? '#e0f7fa' : '#1a237e';

    // 2. Mode Buttons
    UI.btnMorning.classList.toggle('active', isMorning);
    UI.btnNight.classList.toggle('active', !isMorning);

    // 3. Title & Inputs
    if (isMorning) {
        UI.appTitle.textContent = '朝の記録';

        // Default Morning State
        UI.calorieGroup.classList.add('hidden');
        UI.weightInput.disabled = false;
        UI.weightInput.parentElement.style.opacity = '1';

        UI.actionBtn.textContent = '体重を記録';
        UI.actionBtn.disabled = false;
    } else {
        UI.appTitle.textContent = '夜の記録';

        // Default Night State
        UI.calorieGroup.classList.remove('hidden');

        // Weight is read-only in Night Mode
        UI.weightInput.disabled = true;
        UI.weightInput.parentElement.style.opacity = '0.7'; // Dim weight input

        UI.actionBtn.textContent = '1日の記録を確定';
        UI.actionBtn.disabled = false;
    }
}

async function handleSave() {
    const isMorning = STATE.mode === 'morning';
    const weightVal = parseFloat(UI.weightInput.value);
    const calorieVal = parseInt(UI.calorieInput.value, 10);

    if (isMorning) {
        // Validate Weight
        if (isNaN(weightVal) || weightVal <= 0) {
            alert('正しい体重を入力してください。');
            return;
        }
        STATE.currentRecord.weight = weightVal.toFixed(1); // Ensure 1 decimal place format if needed, but storage handles number
    } else {
        // Validate Calories
        if (isNaN(calorieVal) || calorieVal < 0) {
            alert('正しい総カロリーを入力してください。');
            return;
        }
        // In Night mode, we also update calories. Weight is preserved from state (loaded or entered)
        STATE.currentRecord.total_calorie = calorieVal;
    }

    // Save to DB
    try {
        // Create payload. Note: Date is already in currentRecord.
        // Create payload. Note: Date is already in currentRecord.

        let weightToSave = null;
        if (UI.weightInput.value) {
            // Round to 1 decimal place: 75.26 -> 75.3
            const val = parseFloat(UI.weightInput.value);
            weightToSave = Math.round(val * 10) / 10;
            // Update input to reflect rounded value
            UI.weightInput.value = weightToSave.toFixed(1);
        }

        const recordToSave = {
            date: STATE.currentDate,
            weight: weightToSave,
            total_calorie: UI.calorieInput.value ? parseInt(UI.calorieInput.value, 10) : null
        };

        // If Morning mode, we primarily care about weight. 
        // If record existed with calories (e.g. came back to edit weight), we preserve calories (fetched in loadData)
        // Actually, UI inputs are the source of truth now.

        await upsertRecord(recordToSave);
        STATE.currentRecord = recordToSave;

        // Visual Feedback
        const originalText = UI.actionBtn.textContent;

        // Determine message
        // If we are in morning, and we just saved weight.
        // If we are in night, and we just saved calories.
        // The user requested:
        // - Weight save -> "体重を保存しました"
        // - Calorie save -> "1日の総カロリーを保存しました"
        // - Update -> "同じ日付の記録を更新しました"

        // Simple logic:
        // If we are updating an existing entry (date exists in DB), use update message?
        // But "Morning" save might be the FIRST save of the day -> Insert.
        // "Night" save might be the SECOND save -> Update.
        // Or "Morning" save might be re-save -> Update.

        // Let's try to pass 'isUpdate' from upsertRecord? 
        // No, upsertRecord returns key.
        // We can rely on STATE.currentRecord BEFORE the save.
        // If STATE.currentRecord.weight was present (and we are saving weight), it's an update.
        // If STATE.currentRecord.total_calorie was present (and we are saving calorie), it's an update.
        // BUT be careful: if we load a day with NO record, STATE.currentRecord is a shell object {date, weight: null...}.
        // So we check if the relevant field was non-null.

        // However, the "record" itself might exist or not.
        // Let's use a simpler approach based on user flow implies:
        // If Morning -> "体重を保存しました"
        // If Night -> "1日の総カロリーを保存しました"
        // If re-saving (e.g. clicking button again)?

        // I will implement the specific "Update" message if the record ALREADY had data for that field?
        // No, "Update" usually means "Overwriting".
        // "Same date update" -> "同じ日付の記録を更新しました"

        // Let's stick to specific messages for clarity unless it's a re-edit.
        // Actually, "Same date update" might specifically mean "You are changing existing data".
        // I will implement a check:
        // But I don't have the 'previous' state easily since I overwrite recordToSave.

        // Let's just use the safe morning/night messages for now to ensure we don't show English.
        // Showing "体重を保存しました" is always correct if we saved weight.

        // Determine message
        let message = '';
        if (STATE.isExistingRecord) {
            message = '同じ日付の記録を更新しました';
        } else {
            message = isMorning ? '体重を保存しました' : '1日の総カロリーを保存しました';
        }

        UI.actionBtn.textContent = message;
        UI.actionBtn.style.backgroundColor = '#4caf50'; // Green for success

        // Update local state to reflect it now exists
        STATE.isExistingRecord = true;

        setTimeout(() => {
            UI.actionBtn.textContent = originalText;
            UI.actionBtn.style.backgroundColor = ''; // Reset
        }, 1500);

    } catch (err) {
        console.error('Save failed', err);
        alert('保存に失敗しました。');
    }
}

async function handleExport() {
    try {
        const records = await getAllRecords();
        if (!records || records.length === 0) {
            alert('エクスポートするデータがありません。');
            return;
        }

        // Sort by date
        records.sort((a, b) => a.date.localeCompare(b.date));

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Date,Weight,TotalCalorie\n";

        records.forEach(r => {
            const w = r.weight !== null ? r.weight : '';
            const c = r.total_calorie !== null ? r.total_calorie : '';
            csvContent += `${r.date},${w},${c}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `weight_calorie_export_${STATE.currentDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error('Export failed', err);
        alert('エクスポートに失敗しました。');
    }
}
// Report UI References
UI.reportLinkBtn = document.getElementById('report-link-btn');
UI.reportView = document.getElementById('report-view');
UI.reportBackBtn = document.getElementById('report-back-btn');
UI.reportStartDate = document.getElementById('report-start-date');
UI.reportEndDate = document.getElementById('report-end-date');
UI.reportUpdateBtn = document.getElementById('report-update-btn');
UI.reportTableBody = document.getElementById('report-table-body');
UI.summaryWeight = document.getElementById('summary-weight');
UI.summaryCalorie = document.getElementById('summary-calorie');

// Init Report Listeners
if (UI.reportLinkBtn) {
    UI.reportLinkBtn.addEventListener('click', openReport);
    UI.reportBackBtn.addEventListener('click', closeReport);
    UI.reportUpdateBtn.addEventListener('click', updateReport);
}

function openReport() {
    // Set default dates: Today and 7 days ago
    const today = new Date();
    const ago7 = new Date();
    ago7.setDate(today.getDate() - 6); // 7 days inclusive: today, -1, -2... -6

    UI.reportEndDate.value = formatDate(today);
    UI.reportStartDate.value = formatDate(ago7);

    UI.reportView.classList.remove('hidden');
    updateReport();
}

function closeReport() {
    UI.reportView.classList.add('hidden');
}

function formatDate(d) {
    // YYYY-MM-DD
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function updateReport() {
    const start = UI.reportStartDate.value;
    const end = UI.reportEndDate.value;

    if (!start || !end) return;

    try {
        const allRecords = await getAllRecords();
        // Filter
        const filtered = allRecords.filter(r => r.date >= start && r.date <= end);
        // Sort
        filtered.sort((a, b) => a.date.localeCompare(b.date));

        renderReportTable(filtered);
        renderSummary(filtered);
    } catch (err) {
        console.error('Report error', err);
        alert('レポートの表示に失敗しました');
    }
}

function renderReportTable(records) {
    UI.reportTableBody.innerHTML = '';

    let prevWeight = null;

    records.forEach(r => {
        // Skip if weight is null, unless user wants to see caloric records too?
        // User requirements said for report: "期間内の体重推移を一覧表示".
        // "体重が未入力の日付は行を表示しない" is requested.
        const w = r.weight !== null && r.weight !== undefined ? parseFloat(r.weight) : null;

        if (w === null) return; // Skip if no weight

        const row = document.createElement('tr');

        // Date col
        const dDate = new Date(r.date);
        const dateStr = `${dDate.getMonth() + 1}/${dDate.getDate()}`; // M/D format

        // Diff
        let diffStr = '-';
        let diffColor = 'inherit';
        if (prevWeight !== null) {
            const diff = w - prevWeight;
            const sign = diff > 0 ? '+' : '';
            diffStr = `${sign}${diff.toFixed(1)}`;
            // Color logic: Gain = Red/Warn, Loss = Blue/Info?
            // Usually diet app: Loss is Good (Blue/Green), Gain is Bad (Red).
            if (diff > 0) diffColor = '#e53935'; // Red
            if (diff < 0) diffColor = '#1e88e5'; // Blue
            if (diff === 0) diffStr = '±0';
        }

        // HTML construction
        row.innerHTML = `
            <td style="text-align: left; padding: 12px; border-bottom: 1px solid rgba(0,0,0,0.05);">${dateStr}</td>
            <td style="text-align: right; padding: 12px; border-bottom: 1px solid rgba(0,0,0,0.05); font-weight:bold;">${w.toFixed(1)}</td>
            <td style="text-align: right; padding: 12px; border-bottom: 1px solid rgba(0,0,0,0.05); color: ${diffColor}; opacity: 0.8; font-size: 0.85rem;">${diffStr}</td>
        `;

        UI.reportTableBody.appendChild(row);
        prevWeight = w;
    });

    // Empty state
    if (UI.reportTableBody.children.length === 0) {
        UI.reportTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; opacity: 0.6;">データがありません</td></tr>';
    }
}

function renderSummary(records) {
    // Weight Stats
    const weights = records
        .map(r => r.weight !== null && r.weight !== undefined ? parseFloat(r.weight) : null)
        .filter(w => w !== null && w > 0); // Exclude 0 or null

    let weightHtml = '-';
    if (weights.length > 0) {
        const sumW = weights.reduce((a, b) => a + b, 0);
        const avgW = (sumW / weights.length).toFixed(1);
        const minW = Math.min(...weights).toFixed(1);
        const maxW = Math.max(...weights).toFixed(1);
        weightHtml = `
            <div style="font-size: 1.1rem; font-weight:bold;">平均 ${avgW} <span style="font-size:0.7rem; font-weight:normal;">(n=${weights.length})</span></div>
            <div style="font-size: 0.8rem; margin-top:4px;">Min ${minW} / Max ${maxW}</div>
        `;
    }
    UI.summaryWeight.innerHTML = weightHtml;

    // Calorie Stats
    const calories = records
        .map(r => r.total_calorie !== null && r.total_calorie !== undefined ? parseInt(r.total_calorie, 10) : null)
        .filter(c => c !== null && c > 0);

    let calHtml = '-';
    if (calories.length > 0) {
        const sumC = calories.reduce((a, b) => a + b, 0);
        const avgC = Math.round(sumC / calories.length);
        calHtml = `
            <div style="font-size: 1.1rem; font-weight:bold;">平均 ${avgC} <span style="font-size:0.7rem; font-weight:normal;">(n=${calories.length})</span></div>
        `;
    }
    UI.summaryCalorie.innerHTML = calHtml;
}
