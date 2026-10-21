// 匯出／匯入備份
import { APP_NAME, BACKUP_REMIND_DAYS } from './config.js';
import { dailySeries, firstDataDate } from './calc.js';
import { COLLECTIONS } from './db.js';
import * as store from './store.js';
import { state } from './store.js';
import { alertMsg, dialog, toast } from './ui.js';
import { diffDays, fmt, isValidDateStr, toDateStr, todayStr } from './util.js';

const FORMAT = 1;

/** ISO 時間轉成本地日期（避免 UTC 與台灣時間差 8 小時造成日期錯一天） */
const localDate = (iso) => toDateStr(new Date(iso));

// ---------- 備份提醒 ----------
/** 需要提醒時回傳 { days, never }，否則回傳 null */
export function backupReminder() {
  if (!store.hasAnyData()) return null;
  const s = state.settings;
  const today = todayStr();
  if (s.backupSnoozeUntil && today < s.backupSnoozeUntil) return null;
  if (!s.lastBackupAt) {
    const first = firstDataDate(state);
    const days = first ? diffDays(first, today) : 0;
    return days >= 3 ? { days, never: true } : null;
  }
  const days = diffDays(localDate(s.lastBackupAt), today);
  return days >= BACKUP_REMIND_DAYS ? { days, never: false } : null;
}

export function snoozeBackupReminder() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  store.saveSettings({ backupSnoozeUntil: toDateStr(d) });
}

export function lastBackupText() {
  const last = state.settings.lastBackupAt;
  if (!last) return '還沒有備份過';
  const days = diffDays(localDate(last), todayStr());
  return days === 0 ? '今天' : `${days} 天前`;
}

// ---------- 分享／下載檔案 ----------
async function deliverFiles(files) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false; // 使用者取消
      // 其他錯誤改用下載
    }
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  return true;
}

export async function exportBackup() {
  const payload = { app: 'kcalapp', format: FORMAT, appName: APP_NAME, exportedAt: new Date().toISOString(), data: store.snapshot() };
  const name = `${APP_NAME}備份-${todayStr()}.json`;
  const file = new File([JSON.stringify(payload)], name, { type: 'application/json' });
  const ok = await deliverFiles([file]);
  if (ok) {
    store.saveSettings({ lastBackupAt: new Date().toISOString(), backupSnoozeUntil: null });
    toast('已匯出備份檔');
  }
  return ok;
}

// ---------- CSV（可以用 Excel 開，不能用來還原） ----------
function csv(rows) {
  const cell = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export async function exportCSV() {
  const first = firstDataDate(state);
  if (!first) {
    await alertMsg('還沒有資料', '先記錄一些飲食或體重，再來匯出。');
    return;
  }
  const mealName = (id) => state.settings.meals.find((m) => m.id === id)?.name || '';
  const r1 = (n) => (n == null ? '' : Math.round(n * 10) / 10);
  const statusName = { complete: '完整', partial: '只記一部分', none: '未記錄' };
  const days = dailySeries(state, first, todayStr());
  const files = [
    ['每日總結', [
      ['日期', '狀態', '攝取熱量', '蛋白質(g)', '碳水(g)', '每日消耗', '赤字(-)/盈餘(+)', '熱量目標', '體重(kg)', '運動消耗'],
      ...days.map((d) => [d.date, statusName[d.status], Math.round(d.intake.kcal), r1(d.intake.protein), r1(d.intake.carb),
        d.tdee ? Math.round(d.tdee.value) : '', d.balance != null ? Math.round(d.balance) : '', d.targetKcal ? Math.round(d.targetKcal) : '',
        d.weighIn ? d.weighIn.kg : '', d.exercise.count ? Math.round(d.exercise.kcal) : '']),
    ]],
    ['飲食紀錄', [
      ['日期', '餐次', '名稱', '份量(g)', '份數', '熱量', '蛋白質(g)', '碳水(g)'],
      ...[...state.foodLogs].sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? -1 : 1))
        .map((f) => [f.date, mealName(f.mealId), f.name, f.grams ?? '', f.servings ?? '', f.kcal, f.protein, f.carb]),
    ]],
    ['運動紀錄', [
      ['日期', '運動', '時間(分鐘)', '消耗熱量', '備註'],
      ...[...state.exerciseLogs].sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => [e.date, e.name, e.minutes, e.kcal, e.note || '']),
    ]],
    ['體重', [['日期', '體重(kg)'], ...state.weights.map((w) => [w.date, w.kg])]],
    ['體組成', [['日期', '體脂率(%)', '肌肉量(kg)'], ...state.bodyComps.map((b) => [b.date, b.bodyFatPct ?? '', b.muscleKg ?? ''])]],
  ];
  await deliverFiles(files.map(([name, rows]) => new File([csv(rows)], `${APP_NAME}-${name}-${todayStr()}.csv`, { type: 'text/csv' })));
}

// ---------- 匯入 ----------
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v) => v == null || isNum(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;

const RULES = {
  foodLogs: ['飲食紀錄', { id: isStr, date: isValidDateStr, mealId: isStr, name: isStr, kcal: isNum, protein: isNum, carb: isNum }],
  exerciseLogs: ['運動紀錄', { id: isStr, date: isValidDateStr, name: isStr, minutes: isNum, kcal: isNum }],
  weights: ['體重紀錄', { date: isValidDateStr, kg: (v) => isNum(v) && v > 0 }],
  bodyComps: ['體組成紀錄', { date: isValidDateStr, bodyFatPct: isNumOrNull, muscleKg: isNumOrNull }],
  phases: ['目標階段', { id: isStr, startDate: isValidDateStr, kcalOffset: isNum, proteinG: isNum, carbG: isNum, activityFactor: isNum }],
  favorites: ['常吃食物', { id: isStr, name: isStr, kcal: isNum, protein: isNum, carb: isNum }],
  dayMarks: ['日期標記', { date: isValidDateStr }],
};
const FIELD_NAMES = {
  id: '編號', date: '日期', startDate: '開始日期', mealId: '餐次', name: '名稱', kcal: '熱量', protein: '蛋白質', carb: '碳水',
  minutes: '時間', kg: '體重', bodyFatPct: '體脂率', muscleKg: '肌肉量', kcalOffset: '熱量增減', proteinG: '蛋白質目標',
  carbG: '碳水目標', activityFactor: '活動係數',
};

/** 回傳 { data, info } 或 { error: '白話的錯誤說明' } */
export function validateBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { error: '檔案內容無法讀取，可能不是備份檔，或檔案已損壞。' };
  }
  if (!obj || typeof obj !== 'object' || obj.app !== 'kcalapp' || !obj.data) {
    return { error: `這不是「${APP_NAME}」匯出的備份檔。請選擇檔名像「${APP_NAME}備份-日期.json」的檔案。` };
  }
  if (obj.format > FORMAT) return { error: '這個備份檔來自較新版本的 App，請先更新 App 再匯入。' };
  const data = obj.data;
  if (!data.settings || typeof data.settings !== 'object' || !Array.isArray(data.settings.meals)) {
    return { error: '備份檔缺少設定資料，可能已損壞。' };
  }
  const problems = [];
  for (const [name, [label, rules]] of Object.entries(RULES)) {
    const list = data[name] ?? [];
    if (!Array.isArray(list)) {
      problems.push(`「${label}」的格式不正確`);
      continue;
    }
    list.forEach((rec, i) => {
      if (!rec || typeof rec !== 'object') {
        problems.push(`第 ${i + 1} 筆${label}是空的`);
        return;
      }
      for (const [field, ok] of Object.entries(rules)) {
        if (!ok(rec[field])) problems.push(`第 ${i + 1} 筆${label}的「${FIELD_NAMES[field] || field}」不正確`);
      }
    });
    const key = COLLECTIONS[name];
    const keys = new Set(list.map((r) => r?.[key]));
    if (keys.size !== list.length) problems.push(`「${label}」有重複的資料`);
  }
  if (problems.length) {
    const more = problems.length > 4 ? `……等共 ${problems.length} 個問題` : '';
    return { error: `備份檔裡有資料不正確：${problems.slice(0, 4).join('、')}${more}。` };
  }
  const clean = { settings: data.settings };
  for (const name of Object.keys(COLLECTIONS)) clean[name] = data[name] ?? [];
  return { data: clean, info: { exportedAt: obj.exportedAt } };
}

export async function importBackupFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    await alertMsg('無法讀取檔案', '請確認檔案沒有損壞後再試一次。手機上的資料沒有任何變動。');
    return;
  }
  const res = validateBackup(text);
  if (res.error) {
    await alertMsg('無法匯入', [res.error, '手機上的資料沒有任何變動。']);
    return;
  }
  const d = res.data;
  const days = new Set(d.foodLogs.map((f) => f.date)).size;
  const when = res.info.exportedAt ? new Date(res.info.exportedAt).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }) : '不明';
  const ok = await dialog({
    title: '從備份檔還原？',
    message: [
      `備份時間：${when}`,
      `包含 ${fmt(days)} 天的飲食紀錄、${fmt(d.weights.length)} 筆體重、${fmt(d.exerciseLogs.length)} 筆運動、${fmt(d.bodyComps.length)} 筆體組成。`,
      '還原後，手機上目前的資料會被這個備份「完全取代」。',
    ],
    buttons: [
      { label: '取消', value: false, role: 'cancel' },
      { label: '還原', value: true, role: 'destructive' },
    ],
  });
  if (!ok) return;
  try {
    // 備份檔本身就代表已備份到這個時間點
    d.settings = { ...d.settings, lastBackupAt: res.info.exportedAt || d.settings.lastBackupAt || null };
    await store.replaceAll(d);
    toast('已從備份檔還原');
  } catch (err) {
    await alertMsg('還原失敗', [`原因：${err?.message || err}`, '手機上的資料沒有任何變動。']);
  }
}

export function pickBackupFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) importBackupFile(f);
  });
  input.click();
}
