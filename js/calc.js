// 所有計算都是純函式：輸入 state 與日期，輸出數字。
import { BODYFAT_MAX_AGE_DAYS, KCAL_PER_KG } from './config.js';
import { addDays, ageOn, diffDays, todayStr, weekStart } from './util.js';

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: '幾乎不運動', desc: '久坐上班，沒有固定運動' },
  { value: 1.375, label: '輕度活動', desc: '每週運動 1～3 天' },
  { value: 1.55, label: '中度活動', desc: '每週運動 3～5 天' },
  { value: 1.725, label: '高度活動', desc: '每週運動 6～7 天' },
  { value: 1.9, label: '非常高', desc: '體力勞動工作，或每天高強度訓練' },
];

export function activityLabel(factor) {
  const lv = ACTIVITY_LEVELS.find((l) => Math.abs(l.value - factor) < 0.001);
  return lv ? `${lv.label}（× ${factor}）` : `自訂（× ${factor}）`;
}

export const PHASE_TYPES = {
  bulk: { label: '增肌', offset: 300 },
  cut: { label: '減脂', offset: -400 },
  maintain: { label: '維持', offset: 0 },
};

export const BMR_MODES = {
  auto: '自動選擇',
  mifflin: '身高體重公式',
  katch: '瘦體重公式',
  manual: '手動輸入',
};

export const BMR_METHOD_NAMES = {
  mifflin: 'Mifflin-St Jeor（身高、體重、年齡、性別）',
  katch: 'Katch-McArdle（瘦體重）',
  manual: '手動輸入',
};

// ---------- 依日期建立索引（資料有變動才重建） ----------
let cacheRev = -1;
let idx = null;

function index(state) {
  if (cacheRev === state.rev && idx) return idx;
  const foodByDate = new Map();
  for (const f of state.foodLogs) {
    if (!foodByDate.has(f.date)) foodByDate.set(f.date, []);
    foodByDate.get(f.date).push(f);
  }
  const exByDate = new Map();
  for (const e of state.exerciseLogs) {
    if (!exByDate.has(e.date)) exByDate.set(e.date, []);
    exByDate.get(e.date).push(e);
  }
  idx = {
    foodByDate,
    exByDate,
    weightByDate: new Map(state.weights.map((w) => [w.date, w])),
    marks: new Set(state.dayMarks.filter((m) => m.partial).map((m) => m.date)),
  };
  cacheRev = state.rev;
  return idx;
}

/** 在已排序陣列中找出 date 當天或之前最近的一筆 */
function latestOnOrBefore(list, date, pred = () => true) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].date <= date && pred(list[i])) return list[i];
  }
  return null;
}

export function foodsOn(state, date) {
  return index(state).foodByDate.get(date) || [];
}

export function exercisesOn(state, date) {
  return index(state).exByDate.get(date) || [];
}

export function weighInOn(state, date) {
  return index(state).weightByDate.get(date) || null;
}

export function isMarkedPartial(state, date) {
  return index(state).marks.has(date);
}

/** 計算用的體重：當天或之前最近一次；若之前都沒有，用最早的一筆 */
export function weightFor(state, date) {
  const w = latestOnOrBefore(state.weights, date) || state.weights[0];
  return w ? w.kg : null;
}

export function bodyFatFor(state, date) {
  const b = latestOnOrBefore(state.bodyComps, date, (r) => r.bodyFatPct != null);
  if (!b || diffDays(b.date, date) > BODYFAT_MAX_AGE_DAYS) return null;
  return b;
}

export function phaseFor(state, date) {
  for (let i = state.phases.length - 1; i >= 0; i--) {
    if (state.phases[i].startDate <= date) return state.phases[i];
  }
  return state.phases[0] || null;
}

export function mifflin({ sex, kg, cm, age }) {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'female' ? -161 : 5);
}

export function katch({ kg, bodyFatPct }) {
  return 370 + 21.6 * kg * (1 - bodyFatPct / 100);
}

/** 基礎代謝：回傳數值與使用的公式 */
export function bmrFor(state, date) {
  const s = state.settings;
  if (s.bmrMode === 'manual' && s.manualBmr) return { value: s.manualBmr, method: 'manual' };
  const kg = weightFor(state, date);
  const p = s.profile;
  if (!kg || !p) return null;
  const bf = bodyFatFor(state, date);
  if ((s.bmrMode === 'auto' || s.bmrMode === 'katch') && bf) {
    return { value: katch({ kg, bodyFatPct: bf.bodyFatPct }), method: 'katch', kg, bodyFat: bf };
  }
  const age = ageOn(p.birthDate, date);
  return {
    value: mifflin({ sex: p.sex, kg, cm: p.heightCm, age }),
    method: 'mifflin',
    kg,
    age,
    // 選了瘦體重公式但沒有近期體脂資料時，退回身高體重公式並提示
    fallback: s.bmrMode === 'katch',
  };
}

/** 每日總消耗 = 基礎代謝 × 活動係數（係數已含運動，運動紀錄不另外加） */
export function tdeeFor(state, date) {
  const bmr = bmrFor(state, date);
  const phase = phaseFor(state, date);
  if (!bmr || !phase) return null;
  return { ...bmr, bmr: bmr.value, factor: phase.activityFactor, value: bmr.value * phase.activityFactor };
}

export function intakeOn(state, date) {
  const t = { kcal: 0, protein: 0, carb: 0, count: 0 };
  for (const f of foodsOn(state, date)) {
    t.kcal += f.kcal;
    t.protein += f.protein;
    t.carb += f.carb;
    t.count++;
  }
  return t;
}

export function exerciseTotalOn(state, date) {
  const t = { kcal: 0, minutes: 0, count: 0 };
  for (const e of exercisesOn(state, date)) {
    t.kcal += e.kcal;
    t.minutes += e.minutes;
    t.count++;
  }
  return t;
}

/** none = 沒有飲食紀錄；partial = 使用者標記只記了一部分；complete = 列入統計 */
export function dayStatus(state, date) {
  if (foodsOn(state, date).length === 0) return 'none';
  if (isMarkedPartial(state, date)) return 'partial';
  return 'complete';
}

export function daySummary(state, date) {
  const intake = intakeOn(state, date);
  const tdee = tdeeFor(state, date);
  const phase = phaseFor(state, date);
  const status = dayStatus(state, date);
  const balance = status !== 'none' && tdee ? intake.kcal - tdee.value : null;
  return {
    date,
    intake,
    tdee,
    phase,
    status,
    balance,
    targetKcal: tdee && phase ? tdee.value + phase.kcalOffset : null,
    weighIn: weighInOn(state, date),
    exercise: exerciseTotalOn(state, date),
  };
}

/** 是否列入統計：已結束的日子（今天以前）且狀態為 complete */
export function countsForStats(summary, today = todayStr()) {
  return summary.status === 'complete' && summary.date < today && summary.balance != null;
}

export function dailySeries(state, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(daySummary(state, d));
  return out;
}

/** 體重與 7 日平均（平均只用該日往前 7 天內實際量到的數值） */
export function weightSeries(state, from, to) {
  const ws = state.weights;
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (w.date < from || w.date > to) continue;
    const start = addDays(w.date, -6);
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && ws[j].date >= start; j--) {
      sum += ws[j].kg;
      n++;
    }
    out.push({ date: w.date, kg: w.kg, avg7: sum / n, avgN: n });
  }
  return out;
}

function meanWeight(state, from, to) {
  const ws = state.weights.filter((w) => w.date >= from && w.date <= to);
  if (!ws.length) return null;
  return ws.reduce((s, w) => s + w.kg, 0) / ws.length;
}

/** 每週總結（星期一開始）。今天還沒結束，不列入平均。 */
export function weekSummary(state, monday, today = todayStr()) {
  const sunday = addDays(monday, 6);
  const days = dailySeries(state, monday, sunday);
  const counted = days.filter((d) => countsForStats(d, today));
  const n = counted.length;
  const sum = (f) => counted.reduce((s, d) => s + f(d), 0);
  const avgBalance = n ? sum((d) => d.balance) / n : null;
  const thisMean = meanWeight(state, monday, sunday);
  const prevMean = meanWeight(state, addDays(monday, -7), addDays(monday, -1));
  return {
    monday,
    sunday,
    days,
    n,
    loggedDays: days.filter((d) => d.status !== 'none').length,
    includesToday: today >= monday && today <= sunday,
    avgIntake: n ? sum((d) => d.intake.kcal) / n : null,
    avgTdee: n ? sum((d) => d.tdee.value) / n : null,
    avgProtein: n ? sum((d) => d.intake.protein) / n : null,
    avgCarb: n ? sum((d) => d.intake.carb) / n : null,
    avgBalance,
    // 以有記錄日子的平均推算整週
    theoreticalKg: avgBalance != null ? (avgBalance * 7) / KCAL_PER_KG : null,
    meanWeight: thisMean,
    actualKg: thisMean != null && prevMean != null ? thisMean - prevMean : null,
  };
}

export function recentWeeks(state, count, today = todayStr()) {
  const out = [];
  let monday = weekStart(today);
  for (let i = 0; i < count; i++) {
    out.push(weekSummary(state, monday, today));
    monday = addDays(monday, -7);
  }
  return out;
}

export function firstDataDate(state) {
  let min = null;
  for (const name of ['foodLogs', 'weights', 'exerciseLogs', 'bodyComps']) {
    for (const r of state[name]) if (!min || r.date < min) min = r.date;
  }
  return min;
}
