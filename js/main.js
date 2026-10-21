import * as store from './store.js';
import { state } from './store.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { html, setHTML } from './util.js';
import { openAddMenu } from './views/add.js';
import { renderBody } from './views/body.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderSettings } from './views/settings.js';
import { currentDate, renderToday } from './views/today.js';
import { renderTrends } from './views/trends.js';

const TABS = {
  today: { label: '今天', icon: 'today', render: renderToday },
  trends: { label: '趨勢', icon: 'trends', render: renderTrends },
  body: { label: '身體', icon: 'body', render: renderBody },
  settings: { label: '設定', icon: 'settings', render: renderSettings },
};

const appEl = document.getElementById('app');
const onbEl = document.getElementById('onb');
const viewEl = document.getElementById('view');
const bannerEl = document.getElementById('top-banner');
const tabbarEl = document.getElementById('tabbar');

let waitingWorker = null;

function currentTab() {
  const t = location.hash.slice(1);
  return TABS[t] ? t : 'today';
}

function renderTabbar() {
  const cur = currentTab();
  const tab = (k) =>
    html`<button type="button" class="tab" data-tab="${k}" ${k === cur ? 'aria-current="page"' : ''}>${icon(TABS[k].icon)}<span>${TABS[k].label}</span></button>`;
  setHTML(
    tabbarEl,
    html`${tab('today')}${tab('trends')}
      <div class="tab-add"><button type="button" data-add aria-label="新增紀錄">${icon('plus')}</button></div>
      ${tab('body')}${tab('settings')}`,
  );
}

function renderBanner() {
  setHTML(
    bannerEl,
    waitingWorker
      ? html`<div class="banner" role="status">
          <div class="grow"><div>有新版本</div><div class="note">更新只會換掉程式，你的資料不會受影響。</div></div>
          <button type="button" class="link strong" data-update>更新</button>
        </div>`
      : html``,
  );
}

function render() {
  if (!state.settings.onboarded) {
    appEl.hidden = true;
    onbEl.hidden = false;
    renderOnboarding(onbEl);
    return;
  }
  onbEl.hidden = true;
  onbEl.innerHTML = '';
  appEl.hidden = false;
  renderTabbar();
  renderBanner();
  TABS[currentTab()].render(viewEl);
}

let pending = false;
function scheduleRender() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    render();
  });
}

tabbarEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-add]')) {
    openAddMenu(currentTab() === 'today' ? currentDate() : undefined);
    return;
  }
  const t = e.target.closest('[data-tab]')?.dataset.tab;
  if (!t) return;
  if (t === currentTab()) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  location.hash = t;
});

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});

bannerEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-update]') && waitingWorker) {
    updateRequested = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }
});

// 圖表依寬度繪製：轉向或視窗大小改變時重畫
let resizeTimer = null;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return; // 鍵盤彈出只改變高度，不需要重畫
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => currentTab() === 'trends' && render(), 200);
});

// ---------- 新版本偵測 ----------
let updateRequested = false;
let registration = null;

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    registration = await navigator.serviceWorker.register('sw.js');
  } catch (err) {
    console.warn('Service worker 註冊失敗', err);
    return;
  }
  const onWaiting = (w) => {
    waitingWorker = w;
    if (state.settings.onboarded) renderBanner();
  };
  if (registration.waiting && navigator.serviceWorker.controller) onWaiting(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const nw = registration.installing;
    nw?.addEventListener('statechange', () => {
      if (nw.state === 'installed' && navigator.serviceWorker.controller) onWaiting(nw);
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  registration?.update().catch(() => {});
  // 隔夜打開時，「今天」要換成新的日期
  if (state.settings.onboarded && currentTab() === 'today') scheduleRender();
});

// ---------- 啟動 ----------
async function boot() {
  try {
    await store.load();
  } catch (err) {
    console.error(err);
    onbEl.hidden = false;
    appEl.hidden = true;
    setHTML(
      onbEl,
      html`<div class="onb"><h1>無法開啟資料</h1>
        <p>這個瀏覽器無法儲存資料（可能是無痕模式，或儲存空間不足）。請用一般模式的 Safari 開啟，或從主畫面的 App 開啟。</p>
        <p class="note">錯誤訊息：${err?.message || String(err)}</p></div>`,
    );
    return;
  }
  store.onChange(scheduleRender);
  store.onError((msg) => toast(msg));
  render();
  // 請求「持續保存」，降低資料被系統清除的機會
  navigator.storage?.persist?.().catch(() => {});
  registerSW();
}

boot();
