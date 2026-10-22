import * as store from '../store.js';
import { katch, mifflin } from '../calc.js';
import { APP_NAME } from '../config.js';
import { pickBackupFile } from '../backup.js';
import { icon } from '../icons.js';
import { confirmWarnings, fieldError } from '../ui.js';
import { ageOn, fmt, fmtSigned, html, parseNum, round1, setHTML, todayStr, uid } from '../util.js';
import * as V from '../validate.js';
import { bindProfileFields, profileFields, readProfile } from './body.js';
import { activityFields, bindActivity, bindGoal, goalFields, readActivity, readGoal, suggestTargets } from './settings.js';

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

const TOTAL = 4;
let ob = null;

function reset() {
  ob = { step: 0, profile: null, kg: null, bodyFatPct: null, factor: 1.2, goal: null };
}

function bmrOf() {
  const age = ageOn(ob.profile.birthDate, todayStr());
  return ob.bodyFatPct ? katch({ kg: ob.kg, bodyFatPct: ob.bodyFatPct }) : mifflin({ sex: ob.profile.sex, kg: ob.kg, cm: ob.profile.heightCm, age });
}

function head(n, title, text) {
  return html`<div class="onb-step">第 ${n} 步，共 ${TOTAL} 步</div><h1>${title}</h1>${text ? html`<p>${text}</p>` : ''}`;
}

function nav(primary = '下一步') {
  return html`<div class="grow"></div><div class="actions">
    <button type="button" class="btn-primary" data-next>${primary}</button>
    <button type="button" class="btn-secondary" data-back>上一步</button>
  </div>`;
}

function welcome() {
  const needInstall = isIOS() && !isStandalone();
  return html`<h1>歡迎使用${APP_NAME}</h1>
    <p>記錄每天吃了多少、體重和身體組成，算出你的熱量赤字或盈餘。所有資料只存在這支手機上。</p>
    ${needInstall
      ? html`<div class="card">
          <div style="font-weight:600; margin-bottom: var(--s2)">建議先加入主畫面</div>
          <ol class="steps-list">
            <li>點 Safari 下方的「分享」按鈕 ${icon('share')}</li>
            <li>往下滑，選「加入主畫面」${icon('addHome')}</li>
            <li>從主畫面打開「${APP_NAME}」，再開始設定</li>
          </ol>
          <p class="note" style="margin: var(--s3) 0 0">Safari 分頁和主畫面 App 的資料是分開的，請在主畫面 App 裡記錄，才不會分成兩份。</p>
        </div>`
      : ''}
    <div class="grow"></div>
    <div class="actions">
      <button type="button" class="btn-primary" data-next>${needInstall ? '仍要在這裡開始設定' : '開始設定'}</button>
      <button type="button" class="btn-secondary" data-restore>從備份檔還原</button>
    </div>`;
}

function stepProfile() {
  return html`${head(1, '基本資料', '用來估算基礎代謝（躺著不動一整天會消耗的熱量）。')}
    ${profileFields(ob.profile || {})}
    ${nav()}`;
}

function stepBody() {
  return html`${head(2, '目前的身體數據')}
    <div class="form">
      <div class="field"><label for="f-kg">體重</label><input id="f-kg" name="kg" type="text" inputmode="decimal" value="${ob.kg ?? ''}" placeholder="0.0" autocomplete="off"><span class="unit">kg</span></div>
      <div class="field"><label for="f-bf">體脂率（選填）</label><input id="f-bf" name="bodyFatPct" type="text" inputmode="decimal" value="${ob.bodyFatPct ?? ''}" placeholder="—" autocomplete="off"><span class="unit">%</span></div>
    </div>
    <p class="field-note">有體脂率時會用較準的瘦體重公式。沒有也沒關係，之後量到再到「身體」分頁補上。</p>
    ${nav()}`;
}

function stepActivity() {
  return html`${head(3, '日常活動量', '選最接近你平常工作與生活的狀況，不含運動。運動之後另外記錄，會自動加進當天的消耗。')}
    ${activityFields(ob.factor)}
    ${nav()}`;
}

function stepGoal() {
  const tdee = bmrOf() * ob.factor;
  let g = ob.goal;
  if (!g) {
    const offset = 300;
    g = { type: 'bulk', kcalOffset: offset, ...suggestTargets('bulk', ob.kg, tdee + offset) };
  }
  return html`${head(4, '目標', '之後隨時可以在「設定」調整，或換成新的階段（例如增肌改減脂）。')}
    ${goalFields(g)}
    ${nav('完成')}`;
}

function done() {
  const bmr = bmrOf();
  const tdee = bmr * ob.factor;
  const g = ob.goal;
  return html`<h1>設定完成</h1>
    <p>以下數字之後會隨體重、體脂紀錄自動更新。</p>
    <div class="result-grid">
      <div class="two" style="margin:0">
        <div class="card"><div class="card-label">基礎代謝</div><div class="mid">${fmt(bmr)}<small>大卡</small></div></div>
        <div class="card"><div class="card-label">日常消耗</div><div class="mid">${fmt(tdee)}<small>大卡</small></div></div>
      </div>
      <div class="card">
        <div class="card-label">每日熱量目標</div>
        <div class="mid">${fmt(tdee + g.kcalOffset)}<small>大卡</small></div>
        <div class="sub">日常消耗 ${fmt(tdee)} ${g.kcalOffset ? fmtSigned(g.kcalOffset) : '±0'}，有運動的日子會再加上運動消耗</div>
        <div class="sub">蛋白質 ${fmt(g.proteinG)} g · 碳水 ${fmt(g.carbG)} g</div>
      </div>
    </div>
    <p class="field-note">基礎代謝使用${ob.bodyFatPct ? '瘦體重公式（Katch-McArdle）' : '身高體重公式（Mifflin-St Jeor）'}。</p>
    <div class="grow"></div>
    <div class="actions">
      <button type="button" class="btn-primary" data-finish>開始使用</button>
      <button type="button" class="btn-secondary" data-back>上一步</button>
    </div>`;
}

function finish() {
  const today = todayStr();
  store.put('weights', { date: today, kg: ob.kg, updatedAt: new Date().toISOString() });
  if (ob.bodyFatPct) store.put('bodyComps', { date: today, bodyFatPct: ob.bodyFatPct, muscleKg: null, updatedAt: new Date().toISOString() });
  store.put('phases', { id: uid(), startDate: today, ...ob.goal, activityFactor: ob.factor });
  store.saveSettings({ profile: ob.profile, onboarded: true });
}

export function renderOnboarding(root) {
  if (!ob) reset();
  const screens = [welcome, stepProfile, stepBody, stepActivity, stepGoal, done];
  setHTML(root, html`<div class="onb">${screens[ob.step]()}</div>`);
  window.scrollTo(0, 0);
  const go = (d) => {
    ob.step += d;
    renderOnboarding(root);
  };

  if (ob.step === 1) bindProfileFields(root);
  if (ob.step === 3) bindActivity(root);
  if (ob.step === 4) bindGoal(root, () => ({ kg: ob.kg, tdee: bmrOf() * ob.factor }));

  root.querySelector('[data-back]')?.addEventListener('click', () => go(-1));
  root.querySelector('[data-restore]')?.addEventListener('click', () => pickBackupFile());
  root.querySelector('[data-finish]')?.addEventListener('click', () => {
    finish();
    ob = null;
  });
  root.querySelector('[data-next]')?.addEventListener('click', async () => {
    if (ob.step === 1) {
      const { profile, check } = readProfile(root);
      if (!check.ok() || !(await confirmWarnings(check.warnings))) return;
      ob.profile = profile;
    }
    if (ob.step === 2) {
      const kg = parseNum(root.querySelector('[name=kg]').value);
      const bf = parseNum(root.querySelector('[name=bodyFatPct]').value);
      const r = V.checkWeight(kg);
      const rb = bf != null ? V.checkBodyComp({ bodyFatPct: bf, muscleKg: null }, kg) : { errors: {}, warnings: [], ok: () => true };
      fieldError(root.querySelector('[name=kg]'), r.errors.kg);
      fieldError(root.querySelector('[name=bodyFatPct]'), rb.errors.bodyFatPct);
      if (!r.ok() || !rb.ok() || !(await confirmWarnings([...r.warnings, ...rb.warnings]))) return;
      ob.kg = Math.round(kg * 100) / 100;
      ob.bodyFatPct = bf;
    }
    if (ob.step === 3) {
      const f = readActivity(root);
      const custom = root.querySelector('[name=customFactor]');
      if (f == null || Number.isNaN(f) || f < 1 || f > 2.5) {
        fieldError(custom, '請選擇活動量，自訂係數要在 1.0～2.5 之間');
        return;
      }
      fieldError(custom, null);
      ob.factor = f;
    }
    if (ob.step === 4) {
      const { goal, check } = readGoal(root, ob.kg, ob.factor);
      if (!check.ok() || !(await confirmWarnings(check.warnings))) return;
      ob.goal = { ...goal, proteinG: round1(goal.proteinG), carbG: round1(goal.carbG) };
      delete ob.goal.activityFactor;
    }
    go(1);
  });
}
