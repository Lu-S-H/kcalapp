// SVG 圖表：長條圖（含正負）與折線圖。
// 規格：線寬 2px、長條最寬 24px 且間隔 2px、資料端 4px 圓角、格線為實線細線、文字不使用資料顏色。
import { esc, fmt, html, parseDate, raw } from './util.js';

const PAD = { left: 44, right: 8, top: 10, bottom: 24 };

function niceStep(span, count) {
  const raw0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw0)));
  const n = raw0 / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

function niceDomain(min, max, count = 4) {
  if (min === max) {
    const d = Math.abs(min) * 0.05 || 1;
    min -= d;
    max += d;
  }
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks, step };
}

function barPath(x, w, y0, y1) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const r = Math.min(4, w / 2, h);
  if (y1 < y0) {
    // 往上：上方圓角，底部（基準線）直角
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

function yAxis(dom, y, width, fmtTick) {
  return dom.ticks
    .map((t) => {
      const yy = y(t);
      return `<line class="grid" x1="${PAD.left}" x2="${width - PAD.right}" y1="${yy}" y2="${yy}"/>
        <text x="${PAD.left - 6}" y="${yy}" text-anchor="end" dominant-baseline="middle">${esc(fmtTick(t))}</text>`;
    })
    .join('');
}

function xLabels(labels, xAt, height) {
  // 只標頭、中、尾，避免擠在一起
  if (!labels.length) return '';
  const idx = labels.length <= 3 ? labels.map((_, i) => i) : [0, Math.floor((labels.length - 1) / 2), labels.length - 1];
  return [...new Set(idx)]
    .map((i, k, arr) => {
      const anchor = arr.length > 1 && k === 0 ? 'start' : arr.length > 1 && k === arr.length - 1 ? 'end' : 'middle';
      return `<text x="${xAt(i, anchor)}" y="${height - 6}" text-anchor="${anchor}">${esc(labels[i])}</text>`;
    })
    .join('');
}

/** 點選／拖曳圖表時，在下方顯示該點的數字；也支援鍵盤左右鍵 */
function interact(el, svg, count, indexAt, onSelect, initial) {
  const readout = el.querySelector('.chart-readout');
  let current = -1;
  const select = (i) => {
    if (i < 0 || i >= count) return;
    current = i;
    const tip = onSelect(i);
    readout.innerHTML = tip;
  };
  const fromEvent = (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * svg.viewBox.baseVal.width;
    return indexAt(px);
  };
  svg.addEventListener('pointerdown', (e) => select(fromEvent(e)));
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons) select(fromEvent(e));
  });
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') select(Math.max(0, (current < 0 ? count : current) - 1));
    else if (e.key === 'ArrowRight') select(Math.min(count - 1, current + 1));
    else return;
    e.preventDefault();
  });
  if (initial != null) select(initial);
}

function shell(el, svgMarkup, ariaLabel, table, legend) {
  el.innerHTML = `${svgMarkup.replace('<svg ', `<svg role="img" tabindex="0" aria-label="${esc(ariaLabel)}" `)}
    <div class="chart-readout" aria-live="polite"></div>
    ${legend || ''}
    ${table}`;
  return el.querySelector('svg');
}

export function legendHTML(items) {
  return html`<div class="legend">${items.map(([kind, cls, label]) => html`<span><i class="${kind}" style="${raw(cls)}"></i>${label}</span>`)}</div>`.__html;
}

/**
 * 長條圖
 * items: [{ label, value (null = 沒資料), target (可省略), tip }]
 * mode: 'main'（單色）或 'diverging'（正值盈餘色往上、負值赤字色往下）
 */
export function barChart(el, { items, mode = 'main', height = 150, fmtTick = (v) => fmt(v), aria, table, legend, initial }) {
  const width = Math.max(240, Math.round(el.clientWidth));
  const vals = items.flatMap((it) => [it.value, it.target]).filter((v) => v != null);
  if (!items.some((it) => it.value != null)) {
    el.innerHTML = '<div class="chart-empty">這段期間沒有資料</div>';
    return;
  }
  const dom = niceDomain(Math.min(0, ...vals), Math.max(0, ...vals));
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const y = (v) => PAD.top + plotH - ((v - dom.lo) / (dom.hi - dom.lo)) * plotH;
  const slot = plotW / items.length;
  const gap = 2;
  const bw = Math.min(24, Math.max(1, slot - gap));
  const xOf = (i) => PAD.left + i * slot + (slot - bw) / 2;
  const y0 = y(0);

  let bars = '';
  items.forEach((it, i) => {
    if (it.value == null) return;
    const cls = mode === 'diverging' ? (it.value >= 0 ? 'bar-pos' : 'bar-neg') : 'bar-main';
    bars += `<path class="${cls}" d="${barPath(xOf(i), bw, y0, y(it.value))}"/>`;
  });

  // 目標：階梯虛線（目標本身就是門檻，所以用虛線）
  let target = '';
  let pen = false;
  items.forEach((it, i) => {
    if (it.target == null) {
      pen = false;
      return;
    }
    const x0 = PAD.left + i * slot;
    const yt = y(it.target);
    target += pen ? `V${yt}H${x0 + slot}` : `M${x0},${yt}H${x0 + slot}`;
    pen = true;
  });

  const xAt = (i, anchor) => (anchor === 'start' ? PAD.left : anchor === 'end' ? width - PAD.right : PAD.left + i * slot + slot / 2);
  const svgMarkup = `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    ${yAxis(dom, y, width, fmtTick)}
    <line class="zero" x1="${PAD.left}" x2="${width - PAD.right}" y1="${y0}" y2="${y0}"/>
    ${bars}
    ${target ? `<path class="target" d="${target}"/>` : ''}
    <line class="cursor" x1="0" x2="0" y1="${PAD.top}" y2="${PAD.top + plotH}" visibility="hidden"/>
    ${xLabels(items.map((it) => it.label), xAt, height)}
  </svg>`;
  const svg = shell(el, svgMarkup, aria, table || '', legend);
  const cursor = svg.querySelector('.cursor');
  interact(
    el,
    svg,
    items.length,
    (px) => Math.max(0, Math.min(items.length - 1, Math.floor((px - PAD.left) / slot))),
    (i) => {
      const cx = PAD.left + i * slot + slot / 2;
      cursor.setAttribute('x1', cx);
      cursor.setAttribute('x2', cx);
      cursor.setAttribute('visibility', 'visible');
      return items[i].tip;
    },
    initial,
  );
}

/**
 * 折線圖（時間軸）
 * points: [{ date, value, line (折線用的值，可省略則用 value), tip }]
 * dots: 是否畫每個點；line: 是否畫線
 */
export function lineChart(el, { points, from, to, height = 160, dots = true, line = true, dotClass = 'dot', aria, table, legend, initial }) {
  const width = Math.max(240, Math.round(el.clientWidth));
  if (!points.length) {
    el.innerHTML = '<div class="chart-empty">這段期間沒有資料</div>';
    return;
  }
  const vals = points.flatMap((p) => [p.value, p.line]).filter((v) => v != null);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const padV = Math.max((maxV - minV) * 0.15, 0.3);
  const dom = niceDomain(minV - padV, maxV + padV, 3);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const t0 = parseDate(from).getTime();
  const t1 = parseDate(to).getTime();
  const span = Math.max(1, t1 - t0);
  const x = (d) => PAD.left + ((parseDate(d).getTime() - t0) / span) * plotW;
  const y = (v) => PAD.top + plotH - ((v - dom.lo) / (dom.hi - dom.lo)) * plotH;

  const linePts = points.filter((p) => (p.line ?? p.value) != null);
  const path = line && linePts.length > 1 ? `<path class="line" d="M${linePts.map((p) => `${x(p.date).toFixed(1)},${y(p.line ?? p.value).toFixed(1)}`).join('L')}"/>` : '';
  const dotMarks = dots
    ? points.map((p) => `<circle class="${dotClass}" cx="${x(p.date).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4" stroke="var(--card)" stroke-width="2"/>`).join('')
    : '';

  const fmtTick = (v) => fmt(v, dom.step < 1 ? 1 : 0);
  const labelDates = [from, to];
  const fmtD = (d) => {
    const dt = parseDate(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };
  const svgMarkup = `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    ${yAxis(dom, y, width, fmtTick)}
    ${path}
    ${dotMarks}
    <line class="cursor" x1="0" x2="0" y1="${PAD.top}" y2="${PAD.top + plotH}" visibility="hidden"/>
    <circle class="sel" r="5" fill="var(--primary)" stroke="var(--card)" stroke-width="2" visibility="hidden"/>
    <text x="${PAD.left}" y="${height - 6}" text-anchor="start">${fmtD(labelDates[0])}</text>
    <text x="${width - PAD.right}" y="${height - 6}" text-anchor="end">${fmtD(labelDates[1])}</text>
  </svg>`;
  const svg = shell(el, svgMarkup, aria, table || '', legend);
  const cursor = svg.querySelector('.cursor');
  const sel = svg.querySelector('.sel');
  const xs = points.map((p) => x(p.date));
  interact(
    el,
    svg,
    points.length,
    (px) => {
      let best = 0;
      for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i;
      return best;
    },
    (i) => {
      const p = points[i];
      cursor.setAttribute('x1', xs[i]);
      cursor.setAttribute('x2', xs[i]);
      cursor.setAttribute('visibility', 'visible');
      sel.setAttribute('cx', xs[i]);
      sel.setAttribute('cy', y(p.line ?? p.value));
      sel.setAttribute('visibility', 'visible');
      return p.tip;
    },
    initial,
  );
}
