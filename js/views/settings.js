import * as store from '../store.js';
import { defaultSettings, state } from '../store.js';
import { ACTIVITY_LEVELS, activityLabel, BMR_MODES, PHASE_TYPES, bmrFor, phaseFor, weightFor } from '../calc.js';
import { APP_NAME, VERSION } from '../config.js';
import { exportBackup, exportCSV, lastBackupText, pickBackupFile } from '../backup.js';
import { icon } from '../icons.js';
import { alertMsg, bindSegmented, confirmWarnings, dialog, fieldError, openSheet, toast } from '../ui.js';
import { fmt, fmt1, fmtSigned, formatDateLong, html, parseNum, round1, setHTML, todayStr, uid } from '../util.js';
import * as V from '../validate.js';

// ---------- 目標欄位（第一次使用與編輯共用） ----------
const PROTEIN_HINT = { bulk: [1.6, 2.2], cut: [1.8, 2.4], maintain: [1.4, 2.0] };

export function suggestTargets(type, kg, targetKcal) {
  const mid = { bulk: 2.0, cut: 2.2, maintain: 1.6 }[type];
  return {
    proteinG: kg ? Math.round((kg * mid) / 5) * 5 : null,
    carbG: targetKcal ? Math.round((targetKcal * 0.5) / 4 / 5) * 5 : null,
  };
}

function activityChoices(factor) {
  const isCustom = !ACTIVITY_LEVELS.some((l) => Math.abs(l.value - factor) < 0.001);
  return html`<div class="list" role="radiogroup" aria-label="活動量">
      ${ACTIVITY_LEVELS.map(
        (l) => html`<button type="button" class="row choice" role="radio" data-factor="${l.value}" aria-checked="${!isCustom && Math.abs(l.value - factor) < 0.001}">
          ${icon('check', 'check')}<div class="grow"><div>${l.label}<span class="muted">（× ${l.value}）</span></div><div class="detail">${l.desc}</div></div>
        </button>`,
      )}
      <div class="row choice" role="radio" data-factor="custom" aria-checked="${isCustom}" tabindex="-1">
        ${icon('check', 'check')}<label class="grow" for="f-factor">自訂係數</label>
        <input id="f-factor" name="customFactor" type="text" inputmode="decimal" value="${isCustom ? factor : ''}" placeholder="例如 1.45" autocomplete="off" style="width: 90px; border: 0; background: none; text-align: right; font-size: var(--fs-body)">
      </div>
    </div>
    <p class="field-note">這個係數已經包含你的運動量，所以記錄的運動不會再另外加進每日消耗。</p>`;
}

export function bindActivity(root, onChange) {
  const pick = (row) => {
    root.querySelectorAll('[data-factor]').forEach((r) => r.setAttribute('aria-checked', r === row ? 'true' : 'false'));
    onChange?.();
  };
  root.querySelectorAll('[data-factor]').forEach((row) => {
    row.addEventListener('click', () => {
      pick(row);
      if (row.dataset.factor === 'custom') row.querySelector('input').focus();
    });
  });
  root.querySelector('[name=customFactor]')?.addEventListener('input', () => {
    pick(root.querySelector('[data-factor=custom]'));
  });
}

export function readActivity(root) {
  const row = root.querySelector('[data-factor][aria-checked=true]');
  if (!row) return null;
  if (row.dataset.factor === 'custom') return parseNum(root.querySelector('[name=customFactor]').value);
  return Number(row.dataset.factor);
}

export function activityFields(factor) {
  return activityChoices(factor);
}

/** 目標：類型、熱量增減、蛋白質、碳水 */
export function goalFields(ph) {
  const type = ph.type || 'bulk';
  const mag = Math.abs(ph.kcalOffset ?? PHASE_TYPES[type].offset);
  return html`<div class="seg-wrap"><div class="seg" data-seg="ptype" role="group" aria-label="目標">
      ${Object.entries(PHASE_TYPES).map(([k, t]) => html`<button type="button" data-v="${k}" class="${k === type ? 'on' : ''}" aria-pressed="${k === type}">${t.label}</button>`)}
    </div></div>
    <div class="form">
      <div class="field" data-mag-row ${type === 'maintain' ? 'hidden' : ''}>
        <label for="f-mag" data-mag-label>${type === 'cut' ? '每天少吃' : '每天多吃'}</label>
        <input id="f-mag" name="kcalMag" type="text" inputmode="numeric" value="${mag}" autocomplete="off"><span class="unit">大卡</span>
      </div>
      <div class="field"><label for="f-pg">蛋白質目標</label><input id="f-pg" name="proteinG" type="text" inputmode="decimal" value="${ph.proteinG ?? ''}" placeholder="0" autocomplete="off"><span class="unit">g</span></div>
      <div class="field"><label for="f-cg">碳水目標</label><input id="f-cg" name="carbG" type="text" inputmode="decimal" value="${ph.carbG ?? ''}" placeholder="0" autocomplete="off"><span class="unit">g</span></div>
    </div>
    <p class="field-note" data-goal-hint></p>
    <div class="card" style="margin-top: var(--s3)" data-goal-preview></div>`;
}

const MAG_DEFAULTS = { bulk: 300, cut: 400, maintain: 0 };

export function bindGoal(root, getContext) {
  let type = root.querySelector('[data-seg=ptype] button.on')?.dataset.v || 'bulk';
  const magInput = root.querySelector('[name=kcalMag]');
  const update = () => {
    const { tdee, kg } = getContext();
    const mag = parseNum(magInput.value) || 0;
    const offset = type === 'cut' ? -mag : type === 'maintain' ? 0 : mag;
    const [lo, hi] = PROTEIN_HINT[type];
    const target = tdee ? tdee + offset : null;
    const hint = root.querySelector('[data-goal-hint]');
    hint.textContent =
      `${PHASE_TYPES[type].label}時蛋白質常見建議為每公斤體重 ${lo}～${hi} g` +
      (kg ? `（你約 ${fmt(kg * lo)}～${fmt(kg * hi)} g）` : '') +
      `。碳水可抓熱量目標的 45～55%` +
      (target ? `（約 ${fmt((target * 0.45) / 4)}～${fmt((target * 0.55) / 4)} g）` : '') +
      '。';
    root.querySelector('[data-goal-preview]').innerHTML = tdee
      ? html`<div class="card-label">每日熱量目標</div><div class="mid">${fmt(target)}<small>大卡</small></div>
          <div class="sub">每日消耗 ${fmt(tdee)} ${offset ? fmtSigned(offset) : '±0'}</div>`.__html
      : '<p class="note" style="margin:0">有體重資料後會顯示每日熱量目標。</p>';
  };
  bindSegmented(root, (seg, v) => {
    if (seg !== 'ptype') return;
    const prevDefault = MAG_DEFAULTS[type];
    type = v;
    root.querySelector('[data-mag-row]').hidden = type === 'maintain';
    root.querySelector('[data-mag-label]').textContent = type === 'cut' ? '每天少吃' : '每天多吃';
    if (!magInput.value || parseNum(magInput.value) === prevDefault) magInput.value = MAG_DEFAULTS[type];
    update();
  });
  root.querySelectorAll('input').forEach((i) => i.addEventListener('input', update));
  update();
  return { update, getType: () => type };
}

/** 讀取目標欄位，回傳 { goal, check } */
export function readGoal(root, kg, activityFactor) {
  const type = root.querySelector('[data-seg=ptype] button.on')?.dataset.v || 'bulk';
  const mag = type === 'maintain' ? 0 : parseNum(root.querySelector('[name=kcalMag]').value);
  const kcalOffset = mag == null || Number.isNaN(mag) ? mag : type === 'cut' ? -Math.abs(mag) : Math.abs(mag);
  const goal = {
    type,
    kcalOffset,
    proteinG: parseNum(root.querySelector('[name=proteinG]').value),
    carbG: parseNum(root.querySelector('[name=carbG]').value),
    activityFactor,
  };
  const check = V.checkTargets(goal, kg);
  const map = { kcalOffset: 'kcalMag', proteinG: 'proteinG', carbG: 'carbG', activityFactor: 'customFactor' };
  for (const [k, name] of Object.entries(map)) {
    const el = root.querySelector(`[name=${name}]`);
    if (el) fieldError(el, check.errors[k]);
  }
  return { goal, check };
}

// ---------- 目標編輯面板 ----------
function openPhaseSheet({ isNew }) {
  const today = todayStr();
  const cur = phaseFor(state, today);
  openSheet({
    title: isNew ? '開始新階段' : '調整目前目標',
    render(body, sh) {
      const kg = weightFor(state, today);
      const ctx = () => {
        const f = readActivity(body);
        const bmr = bmrFor(state, today);
        return { kg, tdee: bmr && f && !Number.isNaN(f) ? bmr.value * f : null };
      };
      const save = async () => {
        const factor = readActivity(body);
        const { goal, check } = readGoal(body, kg, factor);
        let startDate = cur.startDate;
        if (isNew) {
          startDate = body.querySelector('[name=startDate]').value || today;
          if (state.phases.some((p) => p.startDate === startDate)) {
            await alertMsg('這天已經有一個階段', '請換一個開始日期，或改用「調整目前目標」。');
            return;
          }
        }
        if (!check.ok()) return;
        if (!(await confirmWarnings(check.warnings))) return;
        store.put('phases', { id: isNew ? uid() : cur.id, startDate, ...goal, proteinG: round1(goal.proteinG), carbG: round1(goal.carbG) });
        toast('已儲存目標');
        sh.close();
      };
      sh.setHeader({ title: isNew ? '開始新階段' : '調整目前目標', left: { label: '取消', onClick: () => sh.close() }, right: { label: '儲存', strong: true, onClick: save } });
      setHTML(
        body,
        html`${isNew
            ? html`<div class="form"><div class="field"><label for="f-start">開始日期</label><input id="f-start" name="startDate" type="date" value="${today}"></div></div>
              <p class="field-note">從這天起套用新目標，之前的日子維持原本的目標，統計不會被改寫。</p><div class="sec-h">目標</div>`
            : html`<p class="field-note" style="margin-top:0">會套用到這個階段（${formatDateLong(cur.startDate)} 起）的所有日子。想保留之前的紀錄不變，請改用「開始新階段」。</p><div class="sec-h">目標</div>`}
          ${goalFields(cur)}
          <div class="sec-h">活動量</div>
          ${activityFields(cur.activityFactor)}
          <div class="actions"><button type="button" class="btn-primary" data-save>儲存</button></div>`,
      );
      const g = bindGoal(body, ctx);
      bindActivity(body, g.update);
      body.querySelector('[data-save]').addEventListener('click', save);
    },
  });
}

// ---------- 基礎代謝算法 ----------
const BMR_DESC = {
  auto: '有近 90 天內的體脂紀錄時用瘦體重公式（較準），沒有時用身高體重公式。',
  mifflin: '只用身高、體重、年齡、性別估算（Mifflin-St Jeor）。',
  katch: '用體脂率算出的瘦體重估算（Katch-McArdle）。沒有近 90 天的體脂紀錄時，暫時改用身高體重公式。',
  manual: '直接填 InBody 等報告上的基礎代謝。',
};

function openBmrSheet() {
  openSheet({
    title: '基礎代謝算法',
    render(body, sh) {
      let mode = state.settings.bmrMode;
      const save = () => {
        const v = parseNum(body.querySelector('[name=manualBmr]').value);
        if (mode === 'manual') {
          const input = body.querySelector('[name=manualBmr]');
          if (v == null || Number.isNaN(v) || v < 500 || v > 4000) {
            fieldError(input, '請輸入 500～4000 之間的數字');
            return;
          }
        }
        store.saveSettings({ bmrMode: mode, manualBmr: mode === 'manual' ? Math.round(v) : state.settings.manualBmr });
        toast('已儲存');
        sh.close();
      };
      sh.setHeader({ title: '基礎代謝算法', left: { label: '取消', onClick: () => sh.close() }, right: { label: '儲存', strong: true, onClick: save } });
      setHTML(
        body,
        html`<div class="list" role="radiogroup" aria-label="基礎代謝算法">
            ${Object.entries(BMR_MODES).map(
              ([k, label]) => html`<button type="button" class="row choice" role="radio" data-mode="${k}" aria-checked="${k === mode}">
                ${icon('check', 'check')}<div class="grow"><div>${label}</div><div class="detail" style="white-space: normal">${BMR_DESC[k]}</div></div>
              </button>`,
            )}
          </div>
          <div class="sec-h"></div>
          <div class="form" data-manual ${mode === 'manual' ? '' : 'hidden'}>
            <div class="field"><label for="f-bmr">基礎代謝</label><input id="f-bmr" name="manualBmr" type="text" inputmode="numeric" value="${state.settings.manualBmr ?? ''}" placeholder="例如 1650" autocomplete="off"><span class="unit">大卡</span></div>
          </div>
          <p class="field-note">改變算法會影響所有日子的每日消耗計算。</p>
          <div class="actions"><button type="button" class="btn-primary" data-save>儲存</button></div>`,
      );
      body.querySelectorAll('[data-mode]').forEach((row) =>
        row.addEventListener('click', () => {
          mode = row.dataset.mode;
          body.querySelectorAll('[data-mode]').forEach((r) => r.setAttribute('aria-checked', r === row ? 'true' : 'false'));
          body.querySelector('[data-manual]').hidden = mode !== 'manual';
          if (mode === 'manual') body.querySelector('[name=manualBmr]').focus();
        }),
      );
      body.querySelector('[data-save]').addEventListener('click', save);
    },
  });
}

// ---------- 餐次 ----------
function openMealsSheet() {
  openSheet({
    title: '餐次',
    render(body, sh) {
      let meals = state.settings.meals.filter((m) => !m.archived).map((m) => ({ ...m }));
      const archived = state.settings.meals.filter((m) => m.archived);
      const draw = () => {
        setHTML(
          body,
          html`<ul class="list">
              ${meals.map(
                (m, i) => html`<li><div class="row">
                  <input name="meal" data-i="${i}" type="text" value="${m.name}" aria-label="餐次名稱" style="flex:1; min-width:0; border:0; background:none; font-size: var(--fs-body); min-height: 36px">
                  <button type="button" class="icon-btn" data-up="${i}" aria-label="往上移" ${i === 0 ? 'disabled' : ''}>${icon('arrowUp')}</button>
                  <button type="button" class="icon-btn" data-down="${i}" aria-label="往下移" ${i === meals.length - 1 ? 'disabled' : ''}>${icon('arrowDown')}</button>
                  <button type="button" class="link" data-del="${i}" style="color: var(--error)" ${meals.length <= 1 ? 'disabled' : ''}>刪除</button>
                </div></li>`,
              )}
              <li><button type="button" class="row add" data-add>${icon('plus')}<span class="grow">新增餐次</span></button></li>
            </ul>
            <p class="field-note">例如「訓練前」、「訓練後」、「宵夜」。刪除餐次不會刪掉以前的紀錄。</p>
            <div class="actions"><button type="button" class="btn-primary" data-save>儲存</button></div>`,
        );
      };
      const sync = () => body.querySelectorAll('[name=meal]').forEach((inp) => (meals[Number(inp.dataset.i)].name = inp.value));
      const save = () => {
        sync();
        const bad = meals.findIndex((m) => !m.name.trim());
        if (bad >= 0) {
          fieldError(body.querySelectorAll('[name=meal]')[bad], '名稱不能空白');
          return;
        }
        store.saveSettings({ meals: [...meals.map((m) => ({ ...m, name: m.name.trim() })), ...archived] });
        toast('已儲存');
        sh.close();
      };
      sh.setHeader({ title: '餐次', left: { label: '取消', onClick: () => sh.close() }, right: { label: '儲存', strong: true, onClick: save } });
      body.onclick = (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        sync();
        if (t.dataset.up) {
          const i = Number(t.dataset.up);
          [meals[i - 1], meals[i]] = [meals[i], meals[i - 1]];
        } else if (t.dataset.down) {
          const i = Number(t.dataset.down);
          [meals[i + 1], meals[i]] = [meals[i], meals[i + 1]];
        } else if (t.dataset.del) {
          const [m] = meals.splice(Number(t.dataset.del), 1);
          archived.push({ ...m, archived: true });
        } else if (t.hasAttribute('data-add')) {
          meals.push({ id: uid(), name: '', archived: false });
          draw();
          const inputs = body.querySelectorAll('[name=meal]');
          inputs[inputs.length - 1].focus();
          return;
        } else if (t.hasAttribute('data-save')) {
          return save();
        } else return;
        draw();
      };
      draw();
    },
  });
}

// ---------- 常吃食物 ----------
function openFavoritesSheet() {
  const sheet = openSheet({
    title: '常吃食物',
    render(body, sh) {
      const draw = () => {
        sh.setHeader({ title: '常吃食物', left: { label: '完成', strong: true, onClick: () => sh.close() } });
        const favs = [...state.favorites].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
        setHTML(
          body,
          favs.length
            ? html`<ul class="list">${favs.map(
                (f) => html`<li><button type="button" class="row" data-fav="${f.id}">
                  <div class="grow"><div class="title">${f.name}</div><div class="detail">${f.per100 ? `${fmt1(f.grams)} g` : f.grams ? `1 份（${fmt1(f.grams)} g）` : '1 份'} · 蛋白質 ${fmt1(f.protein)} · 碳水 ${fmt1(f.carb)}</div></div>
                  <span class="value strong">${fmt(f.kcal)}</span>${icon('chevronRight', 'chev')}
                </button></li>`,
              )}</ul>`
            : html`<p class="field-note">還沒有常吃食物。新增食物時打開「加入常吃」，就會出現在這裡。</p>`,
        );
        body.onclick = (e) => {
          const id = e.target.closest('[data-fav]')?.dataset.fav;
          if (id) sh.render((b) => editFavorite(b, sh, state.favorites.find((f) => f.id === id), draw));
        };
      };
      draw();
    },
  });
  return sheet;
}

function editFavorite(body, sh, fav, back) {
  const byGrams = !!fav.per100;
  const save = async () => {
    const name = body.querySelector('[name=name]').value.trim();
    if (!name) return fieldError(body.querySelector('[name=name]'), '請輸入名稱');
    let next;
    if (byGrams) {
      const grams = parseNum(body.querySelector('[name=grams]').value);
      const r = V.checkGrams(grams);
      fieldError(body.querySelector('[name=grams]'), r.errors.grams);
      if (!r.ok() || !(await confirmWarnings(r.warnings))) return;
      const k = grams / 100;
      next = { ...fav, name, grams, kcal: Math.round(fav.per100.kcal * k), protein: round1(fav.per100.protein * k), carb: round1(fav.per100.carb * k) };
    } else {
      const n = { kcal: parseNum(body.querySelector('[name=kcal]').value), protein: parseNum(body.querySelector('[name=protein]').value) ?? 0, carb: parseNum(body.querySelector('[name=carb]').value) ?? 0 };
      const r = V.checkNutrients(n);
      for (const f of ['kcal', 'protein', 'carb']) fieldError(body.querySelector(`[name=${f}]`), r.errors[f]);
      if (!r.ok() || !(await confirmWarnings(r.warnings))) return;
      const base = { kcal: Math.round(n.kcal), protein: round1(n.protein), carb: round1(n.carb) };
      next = { ...fav, name, base, ...base };
    }
    store.put('favorites', next);
    toast('已儲存');
    back();
  };
  sh.setHeader({ title: '編輯常吃', left: { label: '‹ 返回', onClick: back }, right: { label: '儲存', strong: true, onClick: save } });
  setHTML(
    body,
    html`<div class="form">
        <div class="field"><input class="wide" name="name" type="text" value="${fav.name}" aria-label="名稱" autocomplete="off"></div>
        ${byGrams
          ? html`<div class="field"><label for="f-g">預設份量</label><input id="f-g" name="grams" type="text" inputmode="decimal" value="${fav.grams}" autocomplete="off"><span class="unit">g</span></div>`
          : html`<div class="field"><label for="f-k">每份熱量</label><input id="f-k" name="kcal" type="text" inputmode="decimal" value="${fav.kcal}" autocomplete="off"><span class="unit">大卡</span></div>
            <div class="field"><label for="f-p">每份蛋白質</label><input id="f-p" name="protein" type="text" inputmode="decimal" value="${fav.protein}" autocomplete="off"><span class="unit">g</span></div>
            <div class="field"><label for="f-c">每份碳水</label><input id="f-c" name="carb" type="text" inputmode="decimal" value="${fav.carb}" autocomplete="off"><span class="unit">g</span></div>`}
      </div>
      ${byGrams ? html`<p class="field-note">每 100 g：${fmt(fav.per100.kcal)} 大卡 · 蛋白質 ${fmt1(fav.per100.protein)} g · 碳水 ${fmt1(fav.per100.carb)} g</p>` : ''}
      <p class="field-note">修改常吃食物不會改到以前已經記錄的內容。</p>
      <div class="sec-h"></div>
      <div class="list"><button type="button" class="row danger" data-del>從常吃移除</button></div>
      <div class="actions"><button type="button" class="btn-primary" data-save>儲存</button></div>`,
  );
  body.onclick = (e) => {
    if (e.target.closest('[data-save]')) save();
    if (e.target.closest('[data-del]')) {
      const removed = store.remove('favorites', fav.id);
      toast('已移除', { label: '復原', onClick: () => removed && store.put('favorites', removed) });
      back();
    }
  };
}

// ---------- 說明 ----------
function openAboutSheet() {
  openSheet({
    title: '計算方式說明',
    render(body, sh) {
      sh.setHeader({ title: '計算方式說明', left: { label: '完成', strong: true, onClick: () => sh.close() } });
      setHTML(
        body,
        html`<div class="card">
            <p style="margin-top:0"><b>基礎代謝（BMR）</b>：躺著不動一整天會消耗的熱量。</p>
            <p class="note">身高體重公式（Mifflin-St Jeor）：10 × 體重 + 6.25 × 身高 − 5 × 年齡，男性 +5、女性 −161。</p>
            <p class="note">瘦體重公式（Katch-McArdle）：370 + 21.6 × 體重 × (1 − 體脂率)。有體脂資料時通常較準。</p>
          </div>
          <div class="card">
            <p style="margin-top:0"><b>每日消耗（TDEE）</b> = 基礎代謝 × 活動係數。</p>
            <p class="note">活動係數已經包含你平常的運動量，所以記錄的運動只當作日誌，不另外加進每日消耗，避免重複計算。</p>
            <p class="note">每一天都用「當天或之前最近一次」的體重與體脂計算，之後量到新數字也不會改寫以前的結果。</p>
          </div>
          <div class="card">
            <p style="margin-top:0"><b>赤字／盈餘</b> = 當天攝取 − 每日消耗。負數是赤字，正數是盈餘。</p>
            <p class="note">完全沒有飲食紀錄、或標記「只記了一部分」的日子，不列入每週平均與圖表統計。</p>
            <p class="note">理論體重變化以每公斤約 7,700 大卡換算。</p>
          </div>
          <div class="card">
            <p style="margin-top:0"><b>運動消耗</b> = MET 值 × 體重(kg) × 時間(小時)，MET 參考 Compendium of Physical Activities。</p>
          </div>
          <div class="card">
            <p style="margin-top:0"><b>食物資料來源</b></p>
            <p class="note">衛生福利部食品藥物管理署「食品營養成分資料集」，依政府資料開放授權條款使用。熱量採用「修正熱量」，數值為每 100 公克可食部分。</p>
          </div>`,
      );
    },
  });
}

async function clearAll() {
  const choice = await dialog({
    title: '清除所有資料？',
    message: '飲食、運動、體重、目標等所有紀錄都會從這支手機刪除，而且無法復原。建議先匯出備份檔。',
    buttons: [
      { label: '先匯出備份', value: 'backup' },
      { label: '清除所有資料', value: 'clear', role: 'destructive' },
      { label: '取消', value: null, role: 'cancel' },
    ],
  });
  if (choice === 'backup') return exportBackup();
  if (choice !== 'clear') return;
  await store.replaceAll({ settings: defaultSettings() });
  toast('已清除所有資料');
}

// ---------- 畫面 ----------
export function renderSettings(main) {
  const today = todayStr();
  const ph = phaseFor(state, today);
  const past = [...state.phases].reverse();
  const activeMealCount = state.settings.meals.filter((m) => !m.archived).length;

  setHTML(
    main,
    html`<div class="page-head"><h1 class="page-title">設定</h1></div>
      <div class="sec-h" style="margin-top:0">目前目標</div>
      ${ph
        ? html`<div class="card">
            <div class="mid">${PHASE_TYPES[ph.type]?.label || '自訂'}<small>每日 ${ph.kcalOffset ? fmtSigned(ph.kcalOffset) : '±0'} 大卡</small></div>
            <div class="sub">蛋白質 ${fmt(ph.proteinG)} g · 碳水 ${fmt(ph.carbG)} g</div>
            <div class="sub">活動量：${activityLabel(ph.activityFactor)}</div>
            <div class="sub">${formatDateLong(ph.startDate)} 開始</div>
          </div>`
        : ''}
      <ul class="list">
        <li><button type="button" class="row" data-act="edit-phase"><span class="grow">調整目前目標</span>${icon('chevronRight', 'chev')}</button></li>
        <li><button type="button" class="row" data-act="new-phase"><span class="grow">開始新階段</span>${icon('chevronRight', 'chev')}</button></li>
      </ul>
      <p class="sec-foot">換目標時（例如增肌改減脂）用「開始新階段」，以前的日子會保留原本的目標。</p>
      ${past.length > 1
        ? html`<div class="sec-h">階段紀錄</div><ul class="list">
            ${past.map((p) => html`<li><div class="row"><span class="grow">${formatDateLong(p.startDate)} 起</span><span class="value">${PHASE_TYPES[p.type]?.label} ${p.kcalOffset ? fmtSigned(p.kcalOffset) : '±0'} · 蛋白質 ${fmt(p.proteinG)} g</span></div></li>`)}
          </ul>`
        : ''}
      <div class="sec-h">計算與記錄</div>
      <ul class="list">
        <li><button type="button" class="row" data-act="bmr"><span class="grow">基礎代謝算法</span><span class="value">${BMR_MODES[state.settings.bmrMode]}</span>${icon('chevronRight', 'chev')}</button></li>
        <li><button type="button" class="row" data-act="meals"><span class="grow">餐次</span><span class="value">${activeMealCount} 個</span>${icon('chevronRight', 'chev')}</button></li>
        <li><button type="button" class="row" data-act="favorites"><span class="grow">常吃食物</span><span class="value">${state.favorites.length} 項</span>${icon('chevronRight', 'chev')}</button></li>
      </ul>
      <div class="sec-h">資料備份</div>
      <ul class="list">
        <li><button type="button" class="row" data-act="backup">${icon('share', 'accent')}<div class="grow"><div>匯出備份檔</div><div class="detail">上次備份：${lastBackupText()}</div></div></button></li>
        <li><button type="button" class="row" data-act="csv">${icon('share', 'accent')}<div class="grow"><div>匯出 CSV</div><div class="detail">可以用 Excel 開啟，但不能用來還原</div></div></button></li>
        <li><button type="button" class="row" data-act="restore"><span class="grow">從備份檔還原</span>${icon('chevronRight', 'chev')}</button></li>
      </ul>
      <p class="sec-foot">資料只存在這支手機上。備份檔請存到「檔案」App 的 iCloud 雲碟，換手機時可以還原。</p>
      <div class="sec-h">關於</div>
      <ul class="list">
        <li><button type="button" class="row" data-act="about"><span class="grow">計算方式與資料來源</span>${icon('chevronRight', 'chev')}</button></li>
        <li><div class="row"><span class="grow">版本</span><span class="value">${APP_NAME} ${VERSION}</span></div></li>
      </ul>
      <div class="sec-h"></div>
      <div class="list"><button type="button" class="row danger" data-act="clear">清除所有資料</button></div>`,
  );

  main.onclick = (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    switch (t.dataset.act) {
      case 'edit-phase': return openPhaseSheet({ isNew: false });
      case 'new-phase': return openPhaseSheet({ isNew: true });
      case 'bmr': return openBmrSheet();
      case 'meals': return openMealsSheet();
      case 'favorites': return openFavoritesSheet();
      case 'backup': return exportBackup();
      case 'csv': return exportCSV();
      case 'restore': return pickBackupFile();
      case 'about': return openAboutSheet();
      case 'clear': return clearAll();
    }
  };
  main.onchange = null;
}
