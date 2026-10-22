// 新增／編輯紀錄的面板：食物、運動、體重、體組成
import * as store from '../store.js';
import { state } from '../store.js';
import { weightFor } from '../calc.js';
import { EXERCISE_GROUPS, estimateKcal, exerciseType } from '../exercises.js';
import { loadFoods, foodsReady, scale, searchFoods } from '../foods.js';
import { icon } from '../icons.js';
import { bindSegmented, confirmWarnings, fieldError, openSheet, toast } from '../ui.js';
import { fmt, fmt1, formatDateLong, html, parseNum, round1, setHTML, todayStr, uid } from '../util.js';
import * as V from '../validate.js';

// ---------- 共用 ----------
export function activeMeals() {
  return state.settings.meals.filter((m) => !m.archived);
}

export function mealName(id) {
  return state.settings.meals.find((m) => m.id === id)?.name || '其他';
}

/** 預設餐次：預設名稱依時間判斷，否則用上次選的 */
function guessMeal() {
  const meals = activeMeals();
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const byName = (n) => meals.find((m) => m.name === n)?.id;
  const guess = h < 10.5 ? byName('早餐') : h < 14.5 ? byName('午餐') : h < 17 ? byName('點心') : h < 21 ? byName('晚餐') : byName('點心');
  return guess || (meals.some((m) => m.id === state.settings.lastMealId) ? state.settings.lastMealId : meals[0]?.id);
}

function mealChips(selected) {
  return html`<div class="chips" data-seg="meal" role="group" aria-label="餐次">
    ${activeMeals().map(
      (m) => html`<button type="button" data-v="${m.id}" class="${m.id === selected ? 'on' : ''}" aria-pressed="${m.id === selected}">${m.name}</button>`,
    )}
  </div>`;
}

function macroLine(x) {
  return `蛋白質 ${fmt1(x.protein)} g · 碳水 ${fmt1(x.carb)} g`;
}

function readNum(root, name) {
  return parseNum(root.querySelector(`[name="${name}"]`)?.value);
}

function showErrors(root, errors, fields) {
  for (const f of fields) {
    const input = root.querySelector(`[name="${f}"]`);
    if (input) fieldError(input, errors[f]);
  }
  const first = fields.find((f) => errors[f]);
  if (first) root.querySelector(`[name="${first}"]`)?.focus();
}

function dateField(date) {
  return html`<div class="field">
    <label for="f-date">日期</label>
    <input id="f-date" name="date" type="date" value="${date}" max="${todayStr()}" required>
  </div>`;
}

// ---------- 新增選單（中間的 ＋） ----------
export function openAddMenu(date) {
  const items = [
    { key: 'food', label: '食物', icon: 'food' },
    { key: 'exercise', label: '運動', icon: 'exercise' },
    { key: 'weight', label: '體重', icon: 'weight' },
    { key: 'bodycomp', label: '體脂／肌肉量', icon: 'bodycomp' },
  ];
  const sheet = openSheet({
    title: date === todayStr() ? '新增紀錄' : `新增到 ${formatDateLong(date)}`,
    compact: true,
    render(body) {
      setHTML(
        body,
        html`<div class="list">
          ${items.map((it) => html`<button type="button" class="row" data-k="${it.key}">${icon(it.icon, 'accent')}<span class="grow">${it.label}</span>${icon('chevronRight', 'chev')}</button>`)}
        </div>`,
      );
      body.addEventListener('click', (e) => {
        const k = e.target.closest('[data-k]')?.dataset.k;
        if (!k) return;
        sheet.close();
        if (k === 'food') openFoodSheet({ date });
        if (k === 'exercise') openExerciseSheet({ date });
        if (k === 'weight') openWeightSheet({ date });
        if (k === 'bodycomp') openBodyCompSheet({ date });
      });
    },
  });
  sheet.el.classList.add('compact');
}

// ---------- 食物 ----------
function favoriteFor(name, per100) {
  return state.favorites.find(
    (f) => f.name === name && (per100 ? f.per100 && f.per100.kcal === per100.kcal && f.per100.protein === per100.protein : !f.per100),
  );
}

function recentFoods(limit = 15) {
  const seen = new Set();
  const out = [];
  const logs = [...state.foodLogs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  for (const l of logs) {
    const key = `${l.name}|${l.kcal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (favoriteFor(l.name, l.per100)) continue;
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}

function amountText(x) {
  if (x.grams) return `${fmt1(x.grams)} g`;
  if (x.servings && x.servings !== 1) return `${fmt1(x.servings)} 份`;
  return '1 份';
}

function addFoodLog({ date, mealId, item }) {
  const log = {
    id: uid(),
    date,
    mealId,
    name: item.name,
    grams: item.grams ?? null,
    servings: item.servings ?? null,
    kcal: item.kcal,
    protein: item.protein,
    carb: item.carb,
    per100: item.per100 || null,
    base: item.base || null, // 以「份」為單位的常吃食物：每份的營養素
    createdAt: new Date().toISOString(),
  };
  store.put('foodLogs', log);
  store.saveSettings({ lastMealId: mealId });
  return log;
}

function undoableAdded(log) {
  toast(`已加入${mealName(log.mealId)}：${log.name}`, {
    label: '復原',
    onClick: () => store.remove('foodLogs', log.id),
  });
}

export function openFoodSheet({ date, mealId }) {
  const ctx = { date, mealId: mealId || guessMeal(), query: '', added: 0 };
  const sheet = openSheet({ title: '新增食物', render: (body, sh) => searchScreen(body, sh, ctx) });
  return sheet;
}

function setSearchHeader(sh, ctx) {
  sh.setHeader({
    title: '新增食物',
    left: { label: ctx.added ? '完成' : '取消', strong: !!ctx.added, onClick: () => sh.close() },
  });
}

function searchScreen(body, sh, ctx) {
  setSearchHeader(sh, ctx);
  setHTML(
    body,
    html`${mealChips(ctx.mealId)}
      <div class="search">${icon('search')}<input type="search" name="q" placeholder="搜尋食物，例如：白飯、雞蛋" value="${ctx.query}" enterkeyhint="search" autocomplete="off" aria-label="搜尋食物"></div>
      <div data-results></div>`,
  );
  bindSegmented(body, (seg, v) => {
    if (seg === 'meal') ctx.mealId = v;
  });
  const input = body.querySelector('[name=q]');
  const results = body.querySelector('[data-results]');
  const update = () => {
    ctx.query = input.value;
    renderResults(results, sh, ctx);
  };
  input.addEventListener('input', update);
  update();
  if (!foodsReady()) loadFoods().then(update, update);
}

function foodRow(x, kind, i) {
  const per = x.per100 ? `${amountText(x)} · ` : x.servings ? `${amountText(x)} · ` : x.grams ? `${fmt1(x.grams)} g · ` : '';
  return html`<li><div class="row tap" data-pick="${kind}" data-i="${i}" role="button" tabindex="0">
    <div class="grow"><div class="title">${x.name}</div><div class="detail">${per}${macroLine(x)}</div></div>
    <span class="value strong">${fmt(x.kcal)}</span>
    <button type="button" class="icon-btn" data-quick="${kind}" data-i="${i}" aria-label="直接加入 ${x.name}">${icon('plusCircle')}</button>
  </div></li>`;
}

function dbRow(f, i) {
  return html`<li><button type="button" class="row" data-pick="db" data-i="${i}">
    <div class="grow"><div class="title">${f.name}</div><div class="detail">每 100 g · ${fmt(f.per100.kcal)} 大卡 · ${macroLine(f.per100)}</div></div>
    ${icon('chevronRight', 'chev')}
  </button></li>`;
}

function renderResults(root, sh, ctx) {
  const q = ctx.query.trim();
  let favs;
  let recents = [];
  let db = [];
  if (!q) {
    favs = [...state.favorites].sort((a, b) => ((a.lastUsedAt || '') < (b.lastUsedAt || '') ? 1 : -1));
    recents = recentFoods();
  } else {
    favs = state.favorites.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));
    db = searchFoods(q);
  }
  ctx.lists = { fav: favs, recent: recents, db };

  let dbPart = '';
  if (q) {
    if (!foodsReady()) dbPart = html`<p class="note" style="padding: 0 var(--s4)">載入食物資料庫中…</p>`;
    else if (!db.length && !favs.length) dbPart = html`<p class="note" style="padding: 0 var(--s4)">找不到相符的食物。</p>`;
    else if (db.length) dbPart = html`<div class="sec-h">食物資料庫</div><ul class="list">${db.map((f, i) => dbRow(f, i))}</ul>`;
  }

  setHTML(
    root,
    html`${favs.length ? html`<div class="sec-h">常吃</div><ul class="list">${favs.map((f, i) => foodRow(f, 'fav', i))}</ul>` : ''}
      ${recents.length ? html`<div class="sec-h">最近吃過</div><ul class="list">${recents.map((f, i) => foodRow(f, 'recent', i))}</ul>` : ''}
      ${!q && !favs.length && !recents.length ? html`<p class="field-note">搜尋食物，或手動輸入營養標示上的數字。在份量畫面打開「加入常吃」，下次就能一鍵記錄。</p>` : ''}
      ${dbPart}
      <div class="sec-h"></div>
      <div class="list"><button type="button" class="row add" data-manual>${icon('plus')}<span class="grow">手動輸入</span></button></div>`,
  );

  root.onclick = (e) => {
    const quick = e.target.closest('[data-quick]');
    if (quick) {
      e.stopPropagation();
      const item = ctx.lists[quick.dataset.quick][Number(quick.dataset.i)];
      quickAdd(item, ctx, sh);
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const item = ctx.lists[pick.dataset.pick][Number(pick.dataset.i)];
      if (pick.dataset.pick === 'db') {
        const grams = item.unitGrams || 100;
        sh.render((b) => amountScreen(b, sh, ctx, { name: item.name, per100: item.per100, unitGrams: item.unitGrams, grams }));
      } else {
        sh.render((b) => amountScreen(b, sh, ctx, fromSaved(item)));
      }
      return;
    }
    if (e.target.closest('[data-manual]')) sh.render((b) => manualScreen(b, sh, ctx, {}));
  };
  root.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-pick]')) e.target.click();
  };
}

/** 常吃／最近吃過 → 份量畫面的資料 */
function fromSaved(item) {
  if (item.per100) return { name: item.name, per100: item.per100, grams: item.grams || 100 };
  const base = item.base || {
    kcal: item.kcal / (item.servings || 1),
    protein: item.protein / (item.servings || 1),
    carb: item.carb / (item.servings || 1),
  };
  return { name: item.name, base, servings: item.servings || 1, baseGrams: item.grams && !item.servings ? item.grams : null };
}

function quickAdd(item, ctx, sh) {
  const a = fromSaved(item);
  const n = a.per100 ? scale(a.per100, a.grams) : computeServings(a.base, a.servings);
  const log = addFoodLog({
    date: ctx.date,
    mealId: ctx.mealId,
    item: { name: a.name, per100: a.per100, grams: a.per100 ? a.grams : a.baseGrams, servings: a.per100 ? null : a.servings, base: a.base || null, ...n },
  });
  const fav = state.favorites.find((f) => f.id === item.id);
  if (fav) store.put('favorites', { ...fav, lastUsedAt: new Date().toISOString() });
  ctx.added++;
  setSearchHeader(sh, ctx);
  undoableAdded(log);
}

function computeServings(base, servings) {
  return {
    kcal: Math.round(base.kcal * servings),
    protein: round1(base.protein * servings),
    carb: round1(base.carb * servings),
  };
}

/** 份量畫面：資料庫食物（克數）或以份計的常吃食物（份數） */
function amountScreen(body, sh, ctx, a, editing) {
  const byGrams = !!a.per100;
  const value = byGrams ? a.grams : a.servings;
  const chips = byGrams
    ? [
        ...(a.unitGrams ? [[a.unitGrams, `1 份（${fmt(a.unitGrams)} g）`], [a.unitGrams * 2, `2 份`]] : []),
        [100, '100 g'],
        [200, '200 g'],
      ]
    : [[0.5, '半份'], [1, '1 份'], [1.5, '1.5 份'], [2, '2 份']];
  const fav = favoriteFor(a.name, a.per100);

  const back = () => sh.render((b) => searchScreen(b, sh, ctx));
  const save = async () => {
    const amount = readNum(body, 'amount');
    const r = V.checkGrams(amount);
    if (!byGrams && r.errors.grams) r.errors.grams = r.errors.grams.replace('份量', '份數');
    showErrors(body, { amount: r.errors.grams }, ['amount']);
    if (!r.ok()) return;
    if (!(await confirmWarnings(r.warnings))) return;
    const n = byGrams ? scale(a.per100, amount) : computeServings(a.base, amount);
    const item = {
      name: a.name,
      per100: a.per100 || null,
      base: a.base || null,
      grams: byGrams ? amount : a.baseGrams ? round1(a.baseGrams * amount) : null,
      servings: byGrams ? null : amount,
      ...n,
    };
    const wantFav = body.querySelector('[name=fav]')?.checked;
    syncFavorite(item, wantFav, byGrams ? amount : null);
    if (editing) {
      store.put('foodLogs', { ...editing, ...item, mealId: ctx.mealId });
      toast('已儲存');
      sh.close();
      return;
    }
    const log = addFoodLog({ date: ctx.date, mealId: ctx.mealId, item });
    ctx.added++;
    ctx.query = '';
    undoableAdded(log);
    back();
  };

  sh.setHeader({
    title: editing ? '編輯' : '份量',
    left: editing ? { label: '取消', onClick: () => sh.close() } : { label: '‹ 返回', onClick: back },
    right: { label: editing ? '儲存' : '加入', strong: true, onClick: save },
  });

  setHTML(
    body,
    html`${mealChips(ctx.mealId)}
      <div class="card">
        <div class="title" style="font-weight:600">${a.name}</div>
        <div class="note">${byGrams ? `每 100 g：${fmt(a.per100.kcal)} 大卡 · ${macroLine(a.per100)}` : `每份：${fmt(a.base.kcal)} 大卡 · ${macroLine(a.base)}`}</div>
      </div>
      <div class="form">
        <div class="field">
          <label for="f-amount">${byGrams ? '份量' : '份數'}</label>
          <input id="f-amount" name="amount" type="text" inputmode="decimal" value="${fmt1(value)}" autocomplete="off" data-autofocus>
          <span class="unit">${byGrams ? 'g' : '份'}</span>
        </div>
      </div>
      <div class="chips" data-amount-chips>${chips.map(([v, l]) => html`<button type="button" data-v="${v}">${l}</button>`)}</div>
      <div class="card">
        <div class="card-label">這次吃的</div>
        <div class="mid" data-out-kcal></div>
        <div class="sub" data-out-macro></div>
      </div>
      <div class="form">
        <div class="field">
          <label for="f-fav">加入常吃</label>
          <label class="switch"><input id="f-fav" type="checkbox" name="fav" ${fav ? 'checked' : ''}><span></span></label>
        </div>
      </div>
      ${editing ? deleteRow() : ''}
      <div class="actions"><button type="button" class="btn-primary" data-save>${editing ? '儲存' : '加入'}</button></div>`,
  );

  const input = body.querySelector('[name=amount]');
  const update = () => {
    const v = parseNum(input.value);
    const ok = v != null && !Number.isNaN(v) && v > 0;
    const n = ok ? (byGrams ? scale(a.per100, v) : computeServings(a.base, v)) : null;
    body.querySelector('[data-out-kcal]').innerHTML = n ? `${fmt(n.kcal)}<small>大卡</small>` : '—';
    body.querySelector('[data-out-macro]').textContent = n ? macroLine(n) : '請輸入份量';
  };
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  body.querySelector('[data-amount-chips]').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    input.value = fmt1(Number(b.dataset.v)).replace(/,/g, '');
    update();
  });
  bindSegmented(body, (seg, v) => seg === 'meal' && (ctx.mealId = v));
  body.querySelector('[data-save]').addEventListener('click', save);
  if (editing) bindDelete(body, sh, editing);
  update();
}

function syncFavorite(item, want, grams) {
  const existing = favoriteFor(item.name, item.per100);
  if (want && !existing) {
    store.put('favorites', {
      id: uid(),
      name: item.name,
      per100: item.per100 || null,
      grams: item.per100 ? grams : item.grams ?? null,
      servings: item.per100 ? null : 1,
      base: item.per100 ? null : item.base || { kcal: item.kcal / (item.servings || 1), protein: item.protein / (item.servings || 1), carb: item.carb / (item.servings || 1) },
      kcal: item.per100 ? item.kcal : Math.round((item.base?.kcal ?? item.kcal / (item.servings || 1))),
      protein: item.per100 ? item.protein : round1(item.base?.protein ?? item.protein / (item.servings || 1)),
      carb: item.per100 ? item.carb : round1(item.base?.carb ?? item.carb / (item.servings || 1)),
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    });
  } else if (want && existing && item.per100 && grams) {
    store.put('favorites', { ...existing, grams, ...scale(item.per100, grams), lastUsedAt: new Date().toISOString() });
  } else if (!want && existing) {
    store.remove('favorites', existing.id);
  }
}

/** 手動輸入（也用來編輯手動輸入的紀錄） */
function manualScreen(body, sh, ctx, init, editing) {
  const back = () => sh.render((b) => searchScreen(b, sh, ctx));
  const fav = init.name ? favoriteFor(init.name, null) : null;
  const save = async () => {
    const name = body.querySelector('[name=name]').value.trim();
    const n = { kcal: readNum(body, 'kcal'), protein: readNum(body, 'protein') ?? 0, carb: readNum(body, 'carb') ?? 0 };
    const grams = readNum(body, 'grams');
    const r = V.checkNutrients(n);
    if (!name) r.errors.name = '請輸入名稱';
    if (grams != null && (Number.isNaN(grams) || grams <= 0)) r.errors.grams = '份量要是大於 0 的數字（也可以空白）';
    showErrors(body, r.errors, ['name', 'kcal', 'protein', 'carb', 'grams']);
    if (!r.ok()) return;
    if (!(await confirmWarnings(r.warnings))) return;
    const item = { name, grams: grams ?? null, servings: null, kcal: Math.round(n.kcal), protein: round1(n.protein), carb: round1(n.carb), per100: null, base: null };
    syncFavorite({ ...item, base: { kcal: item.kcal, protein: item.protein, carb: item.carb } }, body.querySelector('[name=fav]').checked);
    if (editing) {
      store.put('foodLogs', { ...editing, ...item, mealId: ctx.mealId });
      toast('已儲存');
      sh.close();
      return;
    }
    const log = addFoodLog({ date: ctx.date, mealId: ctx.mealId, item });
    ctx.added++;
    ctx.query = '';
    undoableAdded(log);
    back();
  };

  sh.setHeader({
    title: editing ? '編輯' : '手動輸入',
    left: editing ? { label: '取消', onClick: () => sh.close() } : { label: '‹ 返回', onClick: back },
    right: { label: editing ? '儲存' : '加入', strong: true, onClick: save },
  });

  const v = (x) => (x == null ? '' : fmt1(x).replace(/,/g, ''));
  setHTML(
    body,
    html`${mealChips(ctx.mealId)}
      <div class="form">
        <div class="field"><input class="wide" name="name" type="text" placeholder="名稱，例如：超商雞胸肉" value="${init.name || ''}" autocomplete="off" aria-label="名稱" data-autofocus></div>
        <div class="field"><label for="f-kcal">熱量</label><input id="f-kcal" name="kcal" type="text" inputmode="decimal" value="${v(init.kcal)}" placeholder="0" autocomplete="off"><span class="unit">大卡</span></div>
        <div class="field"><label for="f-p">蛋白質</label><input id="f-p" name="protein" type="text" inputmode="decimal" value="${v(init.protein)}" placeholder="0" autocomplete="off"><span class="unit">g</span></div>
        <div class="field"><label for="f-c">碳水</label><input id="f-c" name="carb" type="text" inputmode="decimal" value="${v(init.carb)}" placeholder="0" autocomplete="off"><span class="unit">g</span></div>
        <div class="field"><label for="f-g">份量（選填）</label><input id="f-g" name="grams" type="text" inputmode="decimal" value="${v(init.grams)}" placeholder="—" autocomplete="off"><span class="unit">g</span></div>
      </div>
      <p class="field-note">照包裝營養標示填「這次吃的總量」。蛋白質、碳水沒有可以留空。</p>
      <div class="sec-h"></div>
      <div class="form">
        <div class="field">
          <label for="f-fav">存成常吃</label>
          <label class="switch"><input id="f-fav" type="checkbox" name="fav" ${fav ? 'checked' : ''}><span></span></label>
        </div>
      </div>
      ${editing ? deleteRow() : ''}
      <div class="actions"><button type="button" class="btn-primary" data-save>${editing ? '儲存' : '加入'}</button></div>`,
  );
  bindSegmented(body, (seg, val) => seg === 'meal' && (ctx.mealId = val));
  body.querySelector('[data-save]').addEventListener('click', save);
  if (editing) bindDelete(body, sh, editing);
}

function deleteRow() {
  return html`<div class="sec-h"></div><div class="list"><button type="button" class="row danger" data-delete>刪除這筆紀錄</button></div>`;
}

function bindDelete(body, sh, rec, collection = 'foodLogs') {
  body.querySelector('[data-delete]').addEventListener('click', () => {
    const removed = store.remove(collection, rec.id);
    sh.close();
    toast('已刪除', { label: '復原', onClick: () => removed && store.put(collection, removed) });
  });
}

export function openFoodEdit(log) {
  const ctx = { date: log.date, mealId: log.mealId, query: '', added: 0 };
  return openSheet({
    title: '編輯',
    render(body, sh) {
      if (log.per100) amountScreen(body, sh, ctx, { name: log.name, per100: log.per100, grams: log.grams || 100 }, log);
      else if (log.base) amountScreen(body, sh, ctx, { name: log.name, base: log.base, servings: log.servings || 1, baseGrams: log.servings ? log.grams / log.servings : null }, log);
      else manualScreen(body, sh, ctx, log, log);
    },
  });
}

// ---------- 運動 ----------
export function openExerciseSheet({ date, edit }) {
  const ctx = { date: edit?.date || date };
  return openSheet({
    title: edit ? '編輯運動' : '新增運動',
    render(body, sh) {
      if (edit) exerciseForm(body, sh, ctx, exerciseType(edit.typeId) || { id: edit.typeId, name: edit.name, met: null }, edit);
      else exercisePicker(body, sh, ctx);
    },
  });
}

function exercisePicker(body, sh, ctx) {
  sh.setHeader({ title: '選擇運動', left: { label: '取消', onClick: () => sh.close() } });
  const recentIds = [];
  for (const e of [...state.exerciseLogs].reverse()) {
    if (!recentIds.includes(e.typeId) && exerciseType(e.typeId)) recentIds.push(e.typeId);
    if (recentIds.length >= 4) break;
  }
  const groups = [...(recentIds.length ? [{ name: '最近', items: recentIds.map(exerciseType) }] : []), ...EXERCISE_GROUPS];
  setHTML(
    body,
    html`${groups.map(
      (g) => html`<div class="sec-h">${g.name}</div><div class="list">
        ${g.items.map((it) => html`<button type="button" class="row" data-type="${it.id}"><span class="grow">${it.name}</span>${icon('chevronRight', 'chev')}</button>`)}
      </div>`,
    )}`,
  );
  body.onclick = (e) => {
    const id = e.target.closest('[data-type]')?.dataset.type;
    if (id) sh.render((b) => exerciseForm(b, sh, ctx, exerciseType(id)));
  };
}

function exerciseForm(body, sh, ctx, type, editing) {
  const kg = weightFor(state, ctx.date);
  const isOther = !type.met;
  let edited = editing ? !!editing.kcalEdited : false;

  const save = async () => {
    const minutes = readNum(body, 'minutes');
    const kcal = readNum(body, 'kcal');
    const name = isOther ? body.querySelector('[name=name]').value.trim() : type.name;
    const r = V.checkExercise({ minutes, kcal });
    if (isOther && !name) r.errors.name = '請輸入運動名稱';
    showErrors(body, r.errors, ['name', 'minutes', 'kcal']);
    if (!r.ok()) return;
    if (!(await confirmWarnings(r.warnings))) return;
    const rec = {
      id: editing?.id || uid(),
      date: body.querySelector('[name=date]').value || ctx.date,
      typeId: type.id,
      name,
      minutes,
      kcal: Math.round(kcal),
      kcalEdited: isOther || edited,
      note: body.querySelector('[name=note]').value.trim(),
      createdAt: editing?.createdAt || new Date().toISOString(),
    };
    store.put('exerciseLogs', rec);
    toast(editing ? '已儲存' : `已記錄：${name}`);
    sh.close();
  };

  sh.setHeader({
    title: editing ? '編輯運動' : '運動',
    left: editing ? { label: '取消', onClick: () => sh.close() } : { label: '‹ 返回', onClick: () => sh.render((b) => exercisePicker(b, sh, ctx)) },
    right: { label: '儲存', strong: true, onClick: save },
  });

  setHTML(
    body,
    html`<div class="form">
        ${isOther
          ? html`<div class="field"><input class="wide" name="name" type="text" placeholder="運動名稱" value="${editing?.name || ''}" aria-label="運動名稱" autocomplete="off"></div>`
          : html`<div class="field"><span class="label">運動</span><span class="value">${type.name}</span></div>`}
        ${dateField(ctx.date)}
        <div class="field"><label for="f-min">時間</label><input id="f-min" name="minutes" type="text" inputmode="decimal" value="${editing ? editing.minutes : ''}" placeholder="0" autocomplete="off" ${isOther ? '' : 'data-autofocus'}><span class="unit">分鐘</span></div>
        <div class="field"><label for="f-kcal">消耗熱量</label><input id="f-kcal" name="kcal" type="text" inputmode="decimal" value="${editing ? editing.kcal : ''}" placeholder="${isOther ? '0' : '自動估算'}" autocomplete="off"><span class="unit">大卡</span></div>
        <div class="field"><input class="wide" name="note" type="text" placeholder="備註（選填），例如：胸＋三頭" value="${editing?.note || ''}" aria-label="備註" autocomplete="off"></div>
      </div>
      <p class="field-note" data-est></p>
      <p class="field-note">會扣掉這段時間本來就會消耗的基礎代謝，再加進當天的每日消耗與熱量目標。</p>
      ${editing ? html`<div class="sec-h"></div><div class="list"><button type="button" class="row danger" data-delete>刪除這筆紀錄</button></div>` : ''}
      <div class="actions"><button type="button" class="btn-primary" data-save>儲存</button></div>`,
  );

  const minInput = body.querySelector('[name=minutes]');
  const kcalInput = body.querySelector('[name=kcal]');
  const est = body.querySelector('[data-est]');
  const update = () => {
    if (isOther) {
      est.textContent = '請自己填消耗熱量（例如手錶上的數字）。';
      return;
    }
    const m = parseNum(minInput.value);
    const v = estimateKcal(type.met, kg, m);
    if (!edited) kcalInput.value = v ?? '';
    est.innerHTML = '';
    est.append(kg ? `依體重 ${fmt(kg, 1)} kg 估算${v != null ? `約 ${fmt(v)} 大卡` : ''}。` : '還沒有體重紀錄，無法自動估算，請自己填。');
    if (edited && v != null) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'link';
      reset.style.padding = '0';
      reset.textContent = '改回估算值';
      reset.onclick = () => {
        edited = false;
        update();
      };
      est.append(' ', reset);
    }
  };
  minInput.addEventListener('input', update);
  kcalInput.addEventListener('input', () => {
    edited = kcalInput.value.trim() !== '';
    if (!edited) update();
  });
  body.querySelector('[data-save]').addEventListener('click', save);
  if (editing) bindDelete(body, sh, editing, 'exerciseLogs');
  update();
}

// ---------- 體重 ----------
export function openWeightSheet({ date }) {
  return openSheet({
    title: '體重',
    render(body, sh) {
      let current = date;
      const draw = () => {
        const existing = state.weights.find((w) => w.date === current);
        const prev = [...state.weights].reverse().find((w) => w.date < current);
        const save = async () => {
          const d = body.querySelector('[name=date]').value || current;
          const kg = readNum(body, 'kg');
          const prevForD = [...state.weights].reverse().find((w) => w.date < d);
          const r = V.checkWeight(kg, prevForD?.kg);
          showErrors(body, r.errors, ['kg']);
          if (!r.ok()) return;
          if (!(await confirmWarnings(r.warnings))) return;
          store.put('weights', { date: d, kg: Math.round(kg * 100) / 100, updatedAt: new Date().toISOString() });
          toast(`已記錄體重 ${fmt(kg, 1)} kg`);
          sh.close();
        };
        sh.setHeader({ title: '體重', left: { label: '取消', onClick: () => sh.close() }, right: { label: '儲存', strong: true, onClick: save } });
        setHTML(
          body,
          html`<div class="form">
              ${dateField(current)}
              <div class="field"><label for="f-kg">體重</label><input id="f-kg" name="kg" type="text" inputmode="decimal" value="${existing ? existing.kg : ''}" placeholder="${prev ? prev.kg : '0.0'}" autocomplete="off" data-autofocus><span class="unit">kg</span></div>
            </div>
            <p class="field-note">${existing ? '這天已經有紀錄，儲存會覆蓋。' : prev ? `上一次：${formatDateLong(prev.date)} ${fmt(prev.kg, 1)} kg` : '建議每天早上起床、上完廁所後量。'}</p>
            ${existing ? html`<div class="sec-h"></div><div class="list"><button type="button" class="row danger" data-delete>刪除這天的體重</button></div>` : ''}
            <div class="actions"><button type="button" class="btn-primary" data-save>儲存</button></div>`,
        );
        body.querySelector('[name=date]').addEventListener('change', (e) => {
          if (e.target.value) {
            current = e.target.value;
            draw();
          }
        });
        body.querySelector('[name=kg]').addEventListener('keydown', (e) => e.key === 'Enter' && save());
        body.querySelector('[data-save]').addEventListener('click', save);
        body.querySelector('[data-delete]')?.addEventListener('click', () => {
          const removed = store.remove('weights', current);
          sh.close();
          toast('已刪除', { label: '復原', onClick: () => removed && store.put('weights', removed) });
        });
      };
      draw();
    },
  });
}

// ---------- 體脂／肌肉量 ----------
export function openBodyCompSheet({ date }) {
  return openSheet({
    title: '體脂／肌肉量',
    render(body, sh) {
      let current = date;
      const draw = () => {
        const existing = state.bodyComps.find((b) => b.date === current);
        const save = async () => {
          const d = body.querySelector('[name=date]').value || current;
          const rec = { bodyFatPct: readNum(body, 'bodyFatPct'), muscleKg: readNum(body, 'muscleKg') };
          const r = V.checkBodyComp(rec, weightFor(state, d));
          showErrors(body, r.errors, ['bodyFatPct', 'muscleKg']);
          if (!r.ok()) return;
          if (!(await confirmWarnings(r.warnings))) return;
          store.put('bodyComps', { date: d, ...rec, updatedAt: new Date().toISOString() });
          toast('已記錄');
          sh.close();
        };
        sh.setHeader({ title: '體脂／肌肉量', left: { label: '取消', onClick: () => sh.close() }, right: { label: '儲存', strong: true, onClick: save } });
        const v = (x) => (x == null ? '' : x);
        setHTML(
          body,
          html`<div class="form">
              ${dateField(current)}
              <div class="field"><label for="f-bf">體脂率</label><input id="f-bf" name="bodyFatPct" type="text" inputmode="decimal" value="${v(existing?.bodyFatPct)}" placeholder="—" autocomplete="off" data-autofocus><span class="unit">%</span></div>
              <div class="field"><label for="f-mm">肌肉量</label><input id="f-mm" name="muscleKg" type="text" inputmode="decimal" value="${v(existing?.muscleKg)}" placeholder="—" autocomplete="off"><span class="unit">kg</span></div>
            </div>
            <p class="field-note">${existing ? '這天已經有紀錄，儲存會覆蓋。' : '可以只填其中一項。有體脂率時，基礎代謝會改用較準的瘦體重公式。'}</p>
            ${existing ? html`<div class="sec-h"></div><div class="list"><button type="button" class="row danger" data-delete>刪除這筆紀錄</button></div>` : ''}
            <div class="actions"><button type="button" class="btn-primary" data-save>儲存</button></div>`,
        );
        body.querySelector('[name=date]').addEventListener('change', (e) => {
          if (e.target.value) {
            current = e.target.value;
            draw();
          }
        });
        body.querySelector('[data-save]').addEventListener('click', save);
        body.querySelector('[data-delete]')?.addEventListener('click', () => {
          const removed = store.remove('bodyComps', current);
          sh.close();
          toast('已刪除', { label: '復原', onClick: () => removed && store.put('bodyComps', removed) });
        });
      };
      draw();
    },
  });
}
