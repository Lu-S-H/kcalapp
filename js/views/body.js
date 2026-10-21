import * as store from '../store.js';
import { state } from '../store.js';
import { activityLabel, BMR_METHOD_NAMES, tdeeFor } from '../calc.js';
import { icon } from '../icons.js';
import { bindSegmented, confirmWarnings, fieldError, openSheet, toast } from '../ui.js';
import { ageOn, fmt, fmt1, fmtSigned, formatDateLong, html, parseNum, setHTML, todayStr } from '../util.js';
import * as V from '../validate.js';
import { openBodyCompSheet, openWeightSheet } from './add.js';

let showAllWeights = false;

// ---------- 個人資料（第一次使用與編輯共用） ----------
export function profileFields(p = {}) {
  const sex = p.sex || 'male';
  return html`<div class="form">
      <div class="field"><span class="label">性別</span>
        <div class="seg" data-seg="sex" role="group" aria-label="性別" style="flex: 0 0 150px">
          <button type="button" data-v="male" class="${sex === 'male' ? 'on' : ''}" aria-pressed="${sex === 'male'}">男</button>
          <button type="button" data-v="female" class="${sex === 'female' ? 'on' : ''}" aria-pressed="${sex === 'female'}">女</button>
        </div>
      </div>
      <div class="field"><label for="f-birth">生日</label><input id="f-birth" name="birthDate" type="date" value="${p.birthDate || ''}" max="${todayStr()}"></div>
      <div class="field"><label for="f-height">身高</label><input id="f-height" name="heightCm" type="text" inputmode="decimal" value="${p.heightCm || ''}" placeholder="0" autocomplete="off"><span class="unit">cm</span></div>
    </div>`;
}

export function bindProfileFields(root) {
  bindSegmented(root, () => {});
}

/** 回傳 { profile, check } */
export function readProfile(root) {
  const sex = root.querySelector('[data-seg="sex"] button.on')?.dataset.v || 'male';
  const birthDate = root.querySelector('[name=birthDate]').value;
  const heightCm = parseNum(root.querySelector('[name=heightCm]').value);
  const today = todayStr();
  const check = V.checkProfile({
    heightCm,
    age: birthDate ? ageOn(birthDate, today) : null,
    futureBirth: birthDate > today,
  });
  for (const f of ['birthDate', 'heightCm']) fieldError(root.querySelector(`[name=${f}]`), check.errors[f]);
  return { profile: { sex, birthDate, heightCm }, check };
}

function openProfileSheet() {
  openSheet({
    title: '個人資料',
    render(body, sh) {
      const save = async () => {
        const { profile, check } = readProfile(body);
        if (!check.ok()) return;
        if (!(await confirmWarnings(check.warnings))) return;
        store.saveSettings({ profile });
        toast('已儲存');
        sh.close();
      };
      sh.setHeader({ title: '個人資料', left: { label: '取消', onClick: () => sh.close() }, right: { label: '儲存', strong: true, onClick: save } });
      setHTML(body, html`${profileFields(state.settings.profile || {})}
        <p class="field-note">性別、年齡、身高用來估算基礎代謝。</p>
        <div class="actions"><button type="button" class="btn-primary" data-save>儲存</button></div>`);
      bindProfileFields(body);
      body.querySelector('[data-save]').addEventListener('click', save);
    },
  });
}

// ---------- 畫面 ----------
function metabolismCard(today) {
  const t = tdeeFor(state, today);
  if (!t) return html`<div class="card"><p class="note" style="margin:0">需要個人資料與體重紀錄才能計算。</p></div>`;
  let how = '';
  if (t.method === 'katch') how = `使用 ${formatDateLong(t.bodyFat.date)} 的體脂 ${fmt(t.bodyFat.bodyFatPct, 1)}%、體重 ${fmt(t.kg, 1)} kg`;
  if (t.method === 'mifflin') how = `身高 ${fmt1(state.settings.profile.heightCm)} cm、體重 ${fmt(t.kg, 1)} kg、${t.age} 歲`;
  if (t.method === 'manual') how = '在「設定」手動輸入的數值';
  return html`<div class="two">
      <div class="card"><div class="card-label">基礎代謝</div><div class="mid">${fmt(t.bmr)}<small>大卡</small></div></div>
      <div class="card"><div class="card-label">每日消耗</div><div class="mid">${fmt(t.value)}<small>大卡</small></div></div>
    </div>
    <p class="field-note" style="margin-top:0">基礎代謝公式：${BMR_METHOD_NAMES[t.method]}，${how}。${t.fallback ? '（沒有近 90 天的體脂紀錄，暫時改用身高體重公式）' : ''}<br>
    每日消耗 = 基礎代謝 × ${activityLabel(t.factor)}，已包含運動。</p>`;
}

function weightList() {
  const ws = [...state.weights].reverse();
  if (!ws.length) {
    return html`<div class="list"><button type="button" class="row add" data-act="add-weight">${icon('plus')}<span class="grow">記錄第一筆體重</span></button></div>`;
  }
  const shown = showAllWeights ? ws : ws.slice(0, 10);
  return html`<ul class="list">
      ${shown.map((w, i) => {
        const prev = ws[i + 1]; // shown 是 ws 的前段，所以下一筆就是上一次的紀錄
        return html`<li><button type="button" class="row" data-weight="${w.date}">
          <div class="grow"><div class="title">${formatDateLong(w.date)}</div>${prev ? html`<div class="detail">比上次 ${fmtSigned(w.kg - prev.kg, 1)} kg</div>` : ''}</div>
          <span class="value strong">${fmt(w.kg, 1)} kg</span>
        </button></li>`;
      })}
      ${ws.length > 10 ? html`<li><button type="button" class="row center" data-act="toggle-weights">${showAllWeights ? '只顯示最近 10 筆' : `顯示全部 ${ws.length} 筆`}</button></li>` : ''}
    </ul>`;
}

function bodyCompList() {
  const list = [...state.bodyComps].reverse();
  if (!list.length) {
    return html`<div class="list"><button type="button" class="row add" data-act="add-bodycomp">${icon('plus')}<span class="grow">記錄體脂率、肌肉量</span></button></div>
      <p class="sec-foot">建議每月用同一台體脂計、在相同時段量一次。</p>`;
  }
  return html`<ul class="list">
    ${list.map(
      (b) => html`<li><button type="button" class="row" data-bodycomp="${b.date}">
        <div class="grow"><div class="title">${formatDateLong(b.date)}</div></div>
        <span class="value strong">${[b.bodyFatPct != null ? `體脂 ${fmt(b.bodyFatPct, 1)}%` : '', b.muscleKg != null ? `肌肉 ${fmt(b.muscleKg, 1)} kg` : ''].filter(Boolean).join(' · ')}</span>
      </button></li>`,
    )}
  </ul>`;
}

export function renderBody(main) {
  const today = todayStr();
  const p = state.settings.profile;
  setHTML(
    main,
    html`<div class="page-head"><h1 class="page-title">身體</h1></div>
      <div class="sec-h" style="margin-top:0">個人資料</div>
      <ul class="list">
        <li><button type="button" class="row" data-act="profile"><span class="grow">性別</span><span class="value">${p ? (p.sex === 'female' ? '女' : '男') : '未設定'}</span>${icon('chevronRight', 'chev')}</button></li>
        <li><button type="button" class="row" data-act="profile"><span class="grow">年齡</span><span class="value">${p?.birthDate ? `${ageOn(p.birthDate, today)} 歲` : '未設定'}</span>${icon('chevronRight', 'chev')}</button></li>
        <li><button type="button" class="row" data-act="profile"><span class="grow">身高</span><span class="value">${p?.heightCm ? `${fmt1(p.heightCm)} cm` : '未設定'}</span>${icon('chevronRight', 'chev')}</button></li>
      </ul>
      <div class="sec-h">代謝（今天）</div>
      ${metabolismCard(today)}
      <div class="sec-h">體重紀錄<button type="button" class="link strong" data-act="add-weight">＋ 新增</button></div>
      ${weightList()}
      <div class="sec-h">體脂率・肌肉量<button type="button" class="link strong" data-act="add-bodycomp">＋ 新增</button></div>
      ${bodyCompList()}`,
  );

  main.onclick = (e) => {
    const t = e.target.closest('[data-act],[data-weight],[data-bodycomp]');
    if (!t) return;
    if (t.dataset.weight) return openWeightSheet({ date: t.dataset.weight });
    if (t.dataset.bodycomp) return openBodyCompSheet({ date: t.dataset.bodycomp });
    switch (t.dataset.act) {
      case 'profile': return openProfileSheet();
      case 'add-weight': return openWeightSheet({ date: today });
      case 'add-bodycomp': return openBodyCompSheet({ date: today });
      case 'toggle-weights':
        showAllWeights = !showAllWeights;
        return renderBody(main);
    }
  };
  main.onchange = null;
}
