import * as db from './db.js';
import { COLLECTIONS } from './db.js';

export const DEFAULT_MEALS = [
  { id: 'breakfast', name: '早餐' },
  { id: 'lunch', name: '午餐' },
  { id: 'dinner', name: '晚餐' },
  { id: 'snack', name: '點心' },
];

export function defaultSettings() {
  return {
    profile: null, // { sex: 'male'|'female', birthDate, heightCm }
    bmrMode: 'auto', // auto | mifflin | katch | manual
    manualBmr: null,
    meals: DEFAULT_MEALS.map((m) => ({ ...m, archived: false })),
    lastMealId: null,
    lastBackupAt: null,
    onboarded: false,
    createdAt: new Date().toISOString(),
  };
}

export const state = {
  settings: defaultSettings(),
  phases: [],
  foodLogs: [],
  favorites: [],
  exerciseLogs: [],
  weights: [],
  bodyComps: [],
  dayMarks: [],
  rev: 0,
};

const bus = new EventTarget();

export function onChange(fn) {
  bus.addEventListener('change', fn);
}

export function onError(fn) {
  bus.addEventListener('error', (e) => fn(e.detail));
}

function changed() {
  state.rev++;
  bus.dispatchEvent(new Event('change'));
}

function persist(p) {
  p.catch((err) => {
    console.error(err);
    bus.dispatchEvent(new CustomEvent('error', { detail: '儲存失敗：' + (err?.message || err) }));
  });
}

function sortCollections() {
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  state.weights.sort(byDate);
  state.bodyComps.sort(byDate);
  state.phases.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  state.foodLogs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  state.exerciseLogs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

// 計算版本 2：活動係數改成「不含運動」，運動另外加進每日消耗。
// 舊資料（或舊備份）裡的係數是含運動的，一律改成 1.2（久坐），避免和運動重複計算。
const TDEE_MODEL = 2;
const MIGRATED_FACTOR = 1.2;

function migrate() {
  if (state.settings.tdeeModel === TDEE_MODEL) return false;
  const hadPhases = state.phases.length > 0;
  for (const ph of state.phases) {
    if (ph.activityFactor !== MIGRATED_FACTOR) {
      ph.activityFactor = MIGRATED_FACTOR;
      persist(db.putRecord('phases', ph));
    }
  }
  state.settings = { ...state.settings, tdeeModel: TDEE_MODEL };
  persist(db.putSettings(state.settings));
  return hadPhases;
}

/** 回傳 { migrated }：是否把舊的活動係數改成了 1.2 */
export async function load() {
  const data = await db.loadAll();
  state.settings = { ...defaultSettings(), ...(data.settings || {}) };
  for (const name of Object.keys(COLLECTIONS)) state[name] = data[name] || [];
  sortCollections();
  const migrated = migrate();
  changed();
  return { migrated };
}

export function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist(db.putSettings(state.settings));
  changed();
}

/** 新增或更新一筆（依 COLLECTIONS 指定的主鍵判斷） */
export function put(collection, record) {
  const key = COLLECTIONS[collection];
  const list = state[collection];
  const i = list.findIndex((r) => r[key] === record[key]);
  if (i >= 0) list[i] = record;
  else list.push(record);
  sortCollections();
  persist(db.putRecord(collection, record));
  changed();
  return record;
}

export function remove(collection, keyValue) {
  const key = COLLECTIONS[collection];
  const list = state[collection];
  const i = list.findIndex((r) => r[key] === keyValue);
  if (i < 0) return null;
  const [removed] = list.splice(i, 1);
  persist(db.deleteRecord(collection, keyValue));
  changed();
  return removed;
}

export function snapshot() {
  const out = { settings: state.settings };
  for (const name of Object.keys(COLLECTIONS)) out[name] = state[name];
  return out;
}

/** 整包取代。先寫入資料庫，成功後才更新畫面上的資料。 */
export async function replaceAll(data) {
  await db.replaceAll(data);
  state.settings = { ...defaultSettings(), ...(data.settings || {}) };
  for (const name of Object.keys(COLLECTIONS)) state[name] = [...(data[name] || [])];
  sortCollections();
  migrate(); // 還原舊版備份檔時也要轉換
  changed();
}

export function hasAnyData() {
  return state.foodLogs.length + state.weights.length + state.exerciseLogs.length + state.bodyComps.length > 0;
}
