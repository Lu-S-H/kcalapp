import { esc, html, setHTML } from './util.js';

const layer = () => document.getElementById('overlay');

// ---------- 鍵盤彈出時，讓面板維持在可見範圍內 ----------
function trackViewport() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  const update = () => {
    root.style.setProperty('--vvh', `${vv ? vv.height : window.innerHeight}px`);
    root.style.setProperty('--vv-top', `${vv ? vv.offsetTop : 0}px`);
  };
  update();
  if (vv) {
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
  }
  window.addEventListener('resize', update);
}
trackViewport();

let openCount = 0;
function lockScroll(on) {
  openCount += on ? 1 : -1;
  document.documentElement.classList.toggle('locked', openCount > 0);
  document.getElementById('app')?.toggleAttribute('inert', openCount > 0);
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animateOut(el, cls, done) {
  if (reduceMotion()) return done();
  el.classList.add(cls);
  let finished = false;
  const end = () => {
    if (finished) return;
    finished = true;
    done();
  };
  el.addEventListener('animationend', end, { once: true });
  setTimeout(end, 400);
}

// ---------- 底部滑出面板 ----------
/**
 * openSheet({ title, left, right, render })
 * render(body, sheet) 負責畫內容；sheet.setHeader({...}) 可切換標題與按鈕（例如進入下一層）。
 */
export function openSheet(opts) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-layer';
  wrap.innerHTML = `<div class="backdrop"></div>
    <section class="sheet" role="dialog" aria-modal="true">
      <header class="sheet-head"><div class="sh-left"></div><h2 class="sh-title"></h2><div class="sh-right"></div></header>
      <div class="sheet-body"></div>
    </section>`;
  layer().appendChild(wrap);
  lockScroll(true);

  const sheetEl = wrap.querySelector('.sheet');
  const body = wrap.querySelector('.sheet-body');
  let closed = false;

  const sheet = {
    el: sheetEl,
    body,
    close() {
      if (closed) return;
      closed = true;
      opts.onClose?.();
      animateOut(wrap, 'leaving', () => {
        wrap.remove();
        lockScroll(false);
      });
    },
    setHeader({ title, left, right }) {
      wrap.querySelector('.sh-title').textContent = title || '';
      const mk = (b, side) => {
        const box = wrap.querySelector(side);
        box.innerHTML = '';
        if (!b) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'link' + (b.strong ? ' strong' : '');
        btn.textContent = b.label;
        btn.disabled = !!b.disabled;
        btn.addEventListener('click', b.onClick);
        box.appendChild(btn);
        if (b.ref) b.ref(btn);
      };
      mk(left, '.sh-left');
      mk(right, '.sh-right');
    },
    render(fn) {
      body.scrollTop = 0;
      fn(body, sheet);
    },
  };

  wrap.querySelector('.backdrop').addEventListener('click', () => sheet.close());
  sheet.setHeader({
    title: opts.title,
    left: opts.left === null ? null : opts.left || { label: '取消', onClick: () => sheet.close() },
    right: opts.right,
  });
  opts.render(body, sheet);
  const auto = body.querySelector('[data-autofocus]');
  if (auto) auto.focus();
  return sheet;
}

// ---------- 對話框（iOS alert 樣式） ----------
/** buttons: [{ label, value, role: 'cancel' | 'destructive' | 'default' }] → Promise<value> */
export function dialog({ title, message, buttons }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-layer';
    const msg = Array.isArray(message)
      ? html`<ul class="dlg-list">${message.map((m) => html`<li>${m}</li>`)}</ul>`
      : message
        ? html`<p>${message}</p>`
        : '';
    setHTML(
      wrap,
      html`<div class="backdrop"></div>
        <div class="dialog" role="alertdialog" aria-modal="true">
          <div class="dlg-text"><h2>${title}</h2>${msg}</div>
          <div class="dlg-buttons ${buttons.length > 2 ? 'stack' : ''}">
            ${buttons.map((b, i) => html`<button type="button" class="dlg-btn ${b.role || ''}" data-i="${i}">${b.label}</button>`)}
          </div>
        </div>`,
    );
    layer().appendChild(wrap);
    lockScroll(true);
    const finish = (value) => {
      wrap.remove();
      lockScroll(false);
      resolve(value);
    };
    wrap.querySelectorAll('.dlg-btn').forEach((btn) =>
      btn.addEventListener('click', () => finish(buttons[Number(btn.dataset.i)].value)),
    );
    wrap.querySelector('.dlg-btn:not(.cancel)')?.focus();
  });
}

export function alertMsg(title, message) {
  return dialog({ title, message, buttons: [{ label: '好', value: true }] });
}

export function confirmDanger(title, message, label = '刪除') {
  return dialog({
    title,
    message,
    buttons: [
      { label: '取消', value: false, role: 'cancel' },
      { label, value: true, role: 'destructive' },
    ],
  });
}

/** 不合理數字提醒：有警告時詢問是否仍要儲存 */
export async function confirmWarnings(warnings) {
  if (!warnings.length) return true;
  return dialog({
    title: '請確認數字是否正確',
    message: warnings,
    buttons: [
      { label: '返回修改', value: false, role: 'cancel' },
      { label: '仍要儲存', value: true },
    ],
  });
}

// ---------- 提示訊息 ----------
let toastTimer = null;
export function toast(message, action) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      el.remove();
      action.onClick();
    });
    el.appendChild(btn);
  }
  document.body.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), action ? 5000 : 2500);
}

// ---------- 表單小工具 ----------
export function fieldError(input, message) {
  const row = input.closest('.field') || input.parentElement;
  let el = row.querySelector('.field-error');
  if (!message) {
    el?.remove();
    input.removeAttribute('aria-invalid');
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.className = 'field-error';
    row.appendChild(el);
  }
  el.textContent = message;
  input.setAttribute('aria-invalid', 'true');
}

/** 綁定分段選擇器：點選後切換 .on 並回呼 */
export function bindSegmented(root, onPick) {
  root.querySelectorAll('[data-seg]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-v]');
      if (!btn) return;
      seg.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', b === btn);
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      onPick(seg.dataset.seg, btn.dataset.v);
    });
  });
}
