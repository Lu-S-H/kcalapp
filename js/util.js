// ---------- 日期（一律用本地時間的 YYYY-MM-DD 字串） ----------
const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function diffDays(a, b) {
  // b - a，以天為單位
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toDateStr(parseDate(s)) === s;
}

/** 該日所在週的星期一 */
export function weekStart(s) {
  const d = parseDate(s);
  const dow = (d.getDay() + 6) % 7; // 星期一 = 0
  d.setDate(d.getDate() - dow);
  return toDateStr(d);
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayName(s) {
  return WEEKDAYS[parseDate(s).getDay()];
}

export function formatMonthDay(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatDateLong(s) {
  const d = parseDate(s);
  const y = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}年` : '';
  return `${y}${formatMonthDay(s)} 星期${weekdayName(s)}`;
}

export function formatShortDate(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function dayTitle(s) {
  const n = diffDays(s, todayStr());
  if (n === 0) return '今天';
  if (n === 1) return '昨天';
  if (n === -1) return '明天';
  return formatMonthDay(s);
}

export function ageOn(birthDate, date) {
  const b = parseDate(birthDate);
  const d = parseDate(date);
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
  return age;
}

// ---------- 數字 ----------
export function fmt(n, digits = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 帶正負號：+280 / −350 / 0 */
export function fmtSigned(n, digits = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  const r = Number(n.toFixed(digits));
  if (r === 0) return fmt(0, digits);
  return (r > 0 ? '+' : '−') + fmt(Math.abs(r), digits);
}

/** 1 位小數，但整數時不顯示 .0 */
export function fmt1(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Number.isInteger(Math.round(n * 10) / 10) ? fmt(n, 0) : fmt(n, 1);
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/,/g, '').replace('，', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- HTML 樣板（自動跳脫，避免匯入的資料插入程式碼） ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

export function raw(s) {
  return { __html: s };
}

function part(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (typeof v === 'object' && '__html' in v) return v.__html;
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return raw(out);
}

export function setHTML(el, tpl) {
  el.innerHTML = tpl.__html;
}
