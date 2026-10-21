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

export async function load() {
  const data = await db.loadAll();
  state.settings = { ...defaultSettings(), ...(data.settings || {}) };
  for (const name of Object.keys(COLLECTIONS)) state[name] = data[name] || [];
  sortCollections();
  changed();
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
  changed();
}

export function hasAnyData() {
  return state.foodLogs.length + state.weights.length + state.exerciseLogs.length + state.bodyComps.length > 0;
}
