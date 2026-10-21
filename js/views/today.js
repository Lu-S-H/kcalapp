import * as store from '../store.js';
import { state } from '../store.js';
import { daySummary, exercisesOn, foodsOn, PHASE_TYPES } from '../calc.js';
import { backupReminder, exportBackup, snoozeBackupReminder } from '../backup.js';
import { icon } from '../icons.js';
import { addDays, dayTitle, fmt, fmt1, fmtSigned, formatDateLong, html, setHTML, todayStr } from '../util.js';
import { activeMeals, mealName, openExerciseSheet, openFoodEdit, openFoodSheet, openWeightSheet } from './add.js';

let viewDate = todayStr();
let followToday = true; // 停在「今天」時，跨日後自動跟著換到新的今天

export function currentDate() {
  if (followToday) viewDate = todayStr();
  return viewDate;
}

function setDate(d) {
  const today = todayStr();
  viewDate = d > today ? today : d;
  followToday = viewDate === today;
}

function pct(v, target) {
  if (!target) return 0;
  return Math.max(0, Math.min(100, (v / target) * 100));
}

function balanceCard(s, isToday) {
  if (!s.tdee) {
    return html`<div class="card">
      <div class="card-label">赤字／盈餘</div>
      <p style="margin: var(--s2) 0 0">需要體重資料才能計算每日消耗。</p>
      <button type="button" class="link strong" style="padding:0" data-act="weight">記錄體重</button>
    </div>`;
  }
  const target = s.targetKcal;
  const phase = s.phase;
  const offsetText = phase.kcalOffset ? fmtSigned(phase.kcalOffset) : '±0';
  const remain = target - s.intake.kcal;
  const head =
    s.status === 'none'
      ? html`<div class="card-label">${isToday ? '今天還沒有飲食紀錄' : '這天沒有飲食紀錄'}</div>
          <div class="hero empty">${isToday ? '按下方 ＋ 開始記錄' : '未記錄'}</div>
          <div class="sub">${isToday ? `今日熱量目標 ${fmt(target)} 大卡` : '不列入每週平均與圖表統計'}</div>`
      : html`<div class="card-label">${s.balance >= 0 ? '盈餘' : '赤字'}</div>
          <div class="hero ${s.balance >= 0 ? 'surplus' : 'deficit'}">${fmtSigned(s.balance)}<small>大卡</small></div>
          <div class="sub">攝取 ${fmt(s.intake.kcal)} − 每日消耗 ${fmt(s.tdee.value)}</div>`;
  return html`<div class="card">
    ${head}
    <div class="target-line">
      <span>目標：${PHASE_TYPES[phase.type]?.label || '自訂'} ${offsetText}</span>
      <span>${s.status === 'none' ? html`每日消耗 <b>${fmt(s.tdee.value)}</b>` : remain >= 0 ? html`還可以吃 <b>${fmt(remain)}</b> 大卡` : html`超過目標 <b>${fmt(-remain)}</b> 大卡`}</span>
    </div>
    <div class="macro">
      <div class="macro-head"><b>蛋白質</b><span>${fmt(s.intake.protein)} / ${fmt(phase.proteinG)} g</span></div>
      <div class="bar" role="progressbar" aria-label="蛋白質" aria-valuenow="${Math.round(s.intake.protein)}" aria-valuemax="${phase.proteinG}"><i style="width:${pct(s.intake.protein, phase.proteinG)}%"></i></div>
    </div>
    <div class="macro">
      <div class="macro-head"><b>碳水</b><span>${fmt(s.intake.carb)} / ${fmt(phase.carbG)} g</span></div>
      <div class="bar" role="progressbar" aria-label="碳水" aria-valuenow="${Math.round(s.intake.carb)}" aria-valuemax="${phase.carbG}"><i style="width:${pct(s.intake.carb, phase.carbG)}%"></i></div>
    </div>
    ${s.status === 'partial' ? html`<p class="note" style="margin: var(--s3) 0 0">已標記「只記了一部分」，這天不列入統計。</p>` : ''}
  </div>`;
}

function miniCards(s) {
  return html`<div class="two">
    <button type="button" class="card mini" data-act="weight">
      <div class="card-label">${icon('weight')}體重</div>
      ${s.weighIn ? html`<div class="mid">${fmt(s.weighIn.kg, 1)}<small>kg</small></div>` : html`<div class="mid placeholder">＋ 記錄體重</div>`}
    </button>
    <button type="button" class="card mini" data-act="exercise">
      <div class="card-label">${icon('exercise')}運動</div>
      ${s.exercise.count
        ? html`<div class="mid">${fmt(s.exercise.kcal)}<small>大卡</small></div><div class="sub">${fmt(s.exercise.minutes)} 分鐘</div>`
        : html`<div class="mid placeholder">＋ 記錄運動</div>`}
    </button>
  </div>`;
}

function mealSections(date) {
  const foods = foodsOn(state, date);
  const meals = [...activeMeals()];
  // 已刪除的餐次若這天有紀錄，也要顯示
  for (const f of foods) if (!meals.some((m) => m.id === f.mealId)) meals.push({ id: f.mealId, name: mealName(f.mealId) });
  return meals.map((m) => {
    const items = foods.filter((f) => f.mealId === m.id);
    const total = items.reduce((t, f) => t + f.kcal, 0);
    return html`<div class="meal-h"><h3>${m.name}</h3>${items.length ? html`<span class="num">${fmt(total)} 大卡</span>` : ''}</div>
      <ul class="list">
        ${items.map(
          (f) => html`<li><button type="button" class="row" data-food="${f.id}">
            <div class="grow"><div class="title">${f.name}</div><div class="detail">${f.grams ? `${fmt1(f.grams)} g · ` : f.servings && f.servings !== 1 ? `${fmt1(f.servings)} 份 · ` : ''}蛋白質 ${fmt1(f.protein)} · 碳水 ${fmt1(f.carb)}</div></div>
            <span class="value strong">${fmt(f.kcal)}</span>
          </button></li>`,
        )}
        <li><button type="button" class="row add" data-add-meal="${m.id}">${icon('plus')}<span class="grow">新增到${m.name}</span></button></li>
      </ul>`;
  });
}

function exerciseSection(date) {
  const list = exercisesOn(state, date);
  if (!list.length) return '';
  return html`<div class="meal-h"><h3>運動</h3><span class="num">${fmt(list.reduce((t, e) => t + e.kcal, 0))} 大卡</span></div>
    <ul class="list">
      ${list.map(
        (e) => html`<li><button type="button" class="row" data-ex="${e.id}">
          <div class="grow"><div class="title">${e.name}</div><div class="detail">${fmt(e.minutes)} 分鐘${e.note ? ` · ${e.note}` : ''}</div></div>
          <span class="value strong">${fmt(e.kcal)}</span>
        </button></li>`,
      )}
    </ul>
    <p class="sec-foot">運動消耗只當作紀錄，不加進每日消耗。</p>`;
}

function firstTimeGuide() {
  if (state.foodLogs.length || state.exerciseLogs.length) return '';
  return html`<div class="sec-h">開始使用</div>
    <div class="card">
      <ol class="steps-list">
        <li>吃完東西，按下方的 ${icon('plus')} 選「食物」，搜尋或手動輸入。</li>
        <li>常吃的食物打開「加入常吃」，下次一鍵記錄。</li>
        <li>每天早上量體重，按「體重」卡片記錄。</li>
        <li>每月量一次體脂、肌肉量，在「身體」分頁記錄。</li>
      </ol>
    </div>`;
}

function backupBanner() {
  const r = backupReminder();
  if (!r) return '';
  return html`<div class="banner" role="status">
    <div class="grow"><div>${r.never ? '還沒有備份過資料' : `已經 ${r.days} 天沒有備份`}</div>
      <div class="note">資料只存在這支手機上，建議存一份到「檔案」或 iCloud。</div></div>
    <button type="button" class="link strong" data-act="backup">備份</button>
    <button type="button" class="link" data-act="snooze" aria-label="明天再提醒">稍後</button>
  </div>`;
}

export function renderToday(main) {
  const date = currentDate();
  const today = todayStr();
  const isToday = date === today;
  const s = daySummary(state, date);

  setHTML(
    main,
    html`${isToday ? backupBanner() : ''}
      <div class="date-nav">
        <button type="button" class="icon-btn" data-act="prev" aria-label="前一天">${icon('chevronLeft')}</button>
        <label class="date-pick">${formatDateLong(date)}<input type="date" value="${date}" max="${today}" data-act-change="pick" aria-label="選擇日期"></label>
        <button type="button" class="icon-btn" data-act="next" aria-label="後一天" ${isToday ? 'disabled' : ''}>${icon('chevronRight')}</button>
      </div>
      <div class="page-head" style="margin-top:0">
        <h1 class="page-title">${dayTitle(date)}</h1>
        ${isToday ? '' : html`<button type="button" class="link" data-act="today">回到今天</button>`}
      </div>
      ${balanceCard(s, isToday)}
      ${miniCards(s)}
      ${firstTimeGuide()}
      ${mealSections(date)}
      ${exerciseSection(date)}
      ${s.status !== 'none'
        ? html`<div class="sec-h"></div>
          <div class="form"><div class="field">
            <label for="f-partial">這天只記了一部分</label>
            <label class="switch"><input id="f-partial" type="checkbox" data-act-change="partial" ${s.status === 'partial' ? 'checked' : ''}><span></span></label>
          </div></div>
          <p class="sec-foot">有漏記的日子打開這個，就不會拉低每週平均。完全沒記飲食的日子會自動排除。</p>`
        : ''}`,
  );

  main.onclick = (e) => {
    const t = e.target.closest('[data-act],[data-food],[data-ex],[data-add-meal]');
    if (!t) return;
    if (t.dataset.food) return openFoodEdit(state.foodLogs.find((f) => f.id === t.dataset.food));
    if (t.dataset.ex) return openExerciseSheet({ edit: state.exerciseLogs.find((x) => x.id === t.dataset.ex) });
    if (t.dataset.addMeal) return openFoodSheet({ date, mealId: t.dataset.addMeal });
    switch (t.dataset.act) {
      case 'prev': setDate(addDays(date, -1)); return renderToday(main);
      case 'next': setDate(addDays(date, 1)); return renderToday(main);
      case 'today': setDate(today); return renderToday(main);
      case 'weight': return openWeightSheet({ date });
      case 'exercise': return openExerciseSheet({ date });
      case 'backup': return exportBackup();
      case 'snooze': return snoozeBackupReminder();
    }
  };
  main.onchange = (e) => {
    const act = e.target.dataset.actChange;
    if (act === 'pick' && e.target.value) {
      setDate(e.target.value);
      renderToday(main);
    }
    if (act === 'partial') {
      if (e.target.checked) store.put('dayMarks', { date, partial: true });
      else store.remove('dayMarks', date);
    }
  };
}
