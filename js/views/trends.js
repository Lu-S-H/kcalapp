import { state } from '../store.js';
import { countsForStats, dailySeries, recentWeeks, weightSeries } from '../calc.js';
import { barChart, legendHTML, lineChart } from '../charts.js';
import { KCAL_PER_KG } from '../config.js';
import { addDays, fmt, fmtSigned, formatShortDate, html, setHTML, todayStr, weekStart } from '../util.js';
import { bindSegmented } from '../ui.js';

const RANGES = {
  '1m': { label: '1 個月', days: 30, group: 'day', groupLabel: '每日' },
  '3m': { label: '3 個月', days: 91, group: 'week', groupLabel: '每週平均' },
  '1y': { label: '1 年', days: 365, group: 'month', groupLabel: '每月平均' },
};
let range = '1m';

/** 把每日資料依範圍分組（1 個月 = 每天、3 個月 = 每週、1 年 = 每月），只用列入統計的日子 */
function groups(days, mode) {
  const out = new Map();
  for (const d of days) {
    const key = mode === 'day' ? d.date : mode === 'week' ? weekStart(d.date) : d.date.slice(0, 7);
    if (!out.has(key)) out.set(key, { key, days: [] });
    out.get(key).days.push(d);
  }
  return [...out.values()].map((g) => {
    const counted = g.days.filter((d) => countsForStats(d));
    const avg = (f) => (counted.length ? counted.reduce((s, d) => s + f(d), 0) / counted.length : null);
    const label = mode === 'day' ? formatShortDate(g.key) : mode === 'week' ? formatShortDate(g.key) : `${Number(g.key.slice(5))}月`;
    const span = mode === 'day' ? formatShortDate(g.key) : mode === 'week' ? `${formatShortDate(g.key)} 那週` : `${g.key.slice(0, 4)}年${Number(g.key.slice(5))}月`;
    return {
      label,
      span,
      n: counted.length,
      total: g.days.length,
      balance: avg((d) => d.balance),
      offset: avg((d) => d.phase.kcalOffset),
      intake: avg((d) => d.intake.kcal),
      target: avg((d) => d.targetKcal),
      protein: avg((d) => d.intake.protein),
      proteinT: avg((d) => d.phase.proteinG),
      carb: avg((d) => d.intake.carb),
      carbT: avg((d) => d.phase.carbG),
      status: mode === 'day' ? g.days[0].status : null,
    };
  });
}

function tipHead(g, mode) {
  if (mode === 'day') return html`<b>${g.span}</b>`;
  return html`<b>${g.span}</b> · 記錄 ${g.n} 天`;
}

function missing(g, mode) {
  if (mode !== 'day') return html`${tipHead(g, mode)} · 沒有列入統計的日子`;
  const why = g.status === 'partial' ? '只記了一部分，不列入' : '未記錄';
  return html`${tipHead(g, mode)} · ${why}`;
}

const perDay = (mode) => (mode === 'day' ? '' : '／天');

function weightCard(from, to) {
  const pts = weightSeries(state, from, to);
  const last = pts[pts.length - 1];
  const first = pts[0];
  const change = last && first && last.date !== first.date ? last.avg7 - first.avg7 : null;
  return html`<div class="card chart-card">
    <div class="chart-head"><div class="card-label">體重（7 日平均）</div>${change != null ? html`<span class="note">期間變化 ${fmtSigned(change, 1)} kg</span>` : ''}</div>
    ${last ? html`<div class="mid">${fmt(last.avg7, 1)}<small>kg</small></div>` : ''}
    <div data-chart="weight"></div>
  </div>`;
}

function drawWeight(el, from, to) {
  const pts = weightSeries(state, from, to);
  const dense = range === '1y';
  lineChart(el, {
    points: pts.map((p) => ({
      date: p.date,
      value: p.kg,
      line: p.avg7,
      tip: html`<b>${formatShortDate(p.date)}</b> · 體重 ${fmt(p.kg, 1)} kg · 7 日平均 <b>${fmt(p.avg7, 1)}</b> kg`.__html,
    })),
    from,
    to,
    dots: !dense,
    aria: '體重趨勢圖',
    legend: legendHTML([
      ...(dense ? [] : [['', 'background:var(--muted);border-radius:50%', '每次量測']]),
      ['line', 'background:var(--primary)', '7 日平均'],
    ]),
    table: tableFor(['日期', '體重', '7 日平均'], [...pts].reverse().map((p) => [formatShortDate(p.date), fmt(p.kg, 1), fmt(p.avg7, 1)])),
    initial: pts.length - 1,
  });
}

function tableFor(head, rows) {
  if (!rows.length) return '';
  return html`<details class="chart-table"><summary>查看數字</summary>
    <table><thead><tr>${head.map((h) => html`<th>${h}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${r.map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody></table>
  </details>`.__html;
}

function avgOf(gs, f) {
  const vals = gs.filter((g) => f(g) != null);
  const w = vals.reduce((s, g) => s + g.n, 0);
  return w ? vals.reduce((s, g) => s + f(g) * g.n, 0) / w : null;
}

function balanceCard(gs, mode) {
  const avg = avgOf(gs, (g) => g.balance);
  return html`<div class="card chart-card">
    <div class="chart-head"><div class="card-label">赤字／盈餘（${RANGES[range].groupLabel}）</div></div>
    ${avg != null ? html`<div class="mid">${fmtSigned(avg)}<small>大卡／天</small></div><div class="sub">期間平均</div>` : ''}
    <div data-chart="balance"></div>
  </div>`;
}

function drawBalance(el, gs, mode) {
  barChart(el, {
    mode: 'diverging',
    items: gs.map((g) => ({
      label: g.label,
      value: g.balance,
      target: g.balance != null ? g.offset : null,
      tip: g.balance == null ? missing(g, mode).__html : html`${tipHead(g, mode)} · ${g.balance >= 0 ? '盈餘' : '赤字'} <b>${fmtSigned(g.balance)}</b> 大卡${perDay(mode)} · 目標 ${fmtSigned(g.offset)}`.__html,
    })),
    fmtTick: (v) => fmtSigned(v),
    aria: '赤字盈餘長條圖',
    legend: legendHTML([
      ['', 'background:var(--surplus)', '盈餘（往上）'],
      ['', 'background:var(--deficit)', '赤字（往下）'],
      ['dash', '', '目標'],
    ]),
    table: tableFor(['日期', '赤字／盈餘', '目標'], [...gs].reverse().map((g) => [g.span, g.balance == null ? '—' : fmtSigned(g.balance), g.balance == null ? '—' : fmtSigned(g.offset)])),
    initial: lastIndex(gs, (g) => g.balance),
  });
}

function lastIndex(gs, f) {
  for (let i = gs.length - 1; i >= 0; i--) if (f(gs[i]) != null) return i;
  return null;
}

function metricCard(key, title, unit, gs) {
  const avg = avgOf(gs, (g) => g[key]);
  return html`<div class="card chart-card">
    <div class="chart-head"><div class="card-label">${title}（${RANGES[range].groupLabel}）</div></div>
    ${avg != null ? html`<div class="mid">${fmt(avg)}<small>${unit}${range === '1m' ? '' : '／天'}</small></div><div class="sub">期間平均</div>` : ''}
    <div data-chart="${key}"></div>
  </div>`;
}

function drawMetric(el, key, tKey, name, unit, gs, mode) {
  barChart(el, {
    items: gs.map((g) => ({
      label: g.label,
      value: g[key],
      target: g[key] != null ? g[tKey] : null,
      tip: g[key] == null ? missing(g, mode).__html : html`${tipHead(g, mode)} · ${name} <b>${fmt(g[key])}</b> ${unit}${perDay(mode)} · 目標 ${fmt(g[tKey])}`.__html,
    })),
    aria: `${name}長條圖`,
    legend: legendHTML([
      ['', 'background:var(--primary)', name],
      ['dash', '', '目標'],
    ]),
    table: tableFor(['日期', name, '目標'], [...gs].reverse().map((g) => [g.span, g[key] == null ? '—' : fmt(g[key]), g[key] == null ? '—' : fmt(g[tKey])])),
    initial: lastIndex(gs, (g) => g[key]),
  });
}

function weekCards() {
  const weeks = recentWeeks(state, 8).filter((w) => w.loggedDays > 0 || w.meanWeight != null);
  if (!weeks.length) return html`<div class="card"><p class="note" style="margin:0">記錄滿一週後，這裡會顯示每週總結。</p></div>`;
  const sw = (v) => (v == null ? '' : html`<i style="background:var(${v >= 0 ? '--surplus' : '--deficit'})"></i>`);
  return weeks.map(
    (w) => html`<div class="card week-card">
      <div class="wk-head"><b>${formatShortDate(w.monday)} – ${formatShortDate(w.sunday)}</b>
        <span class="note">${w.includesToday ? '本週・不含今天' : ''} 列入統計 ${w.n} 天</span></div>
      <div class="wk-grid">
        <div><span class="note">平均攝取</span><b>${w.avgIntake != null ? `${fmt(w.avgIntake)} 大卡` : '—'}</b></div>
        <div><span class="note">平均赤字／盈餘</span><b>${sw(w.avgBalance)}${w.avgBalance != null ? `${fmtSigned(w.avgBalance)} 大卡` : '—'}</b></div>
        <div><span class="note">理論體重變化</span><b>${w.theoreticalKg != null ? `${fmtSigned(w.theoreticalKg, 2)} kg` : '—'}</b></div>
        <div><span class="note">實際體重變化</span><b>${w.actualKg != null ? `${fmtSigned(w.actualKg, 2)} kg` : '—'}</b></div>
        <div><span class="note">平均蛋白質</span><b>${w.avgProtein != null ? `${fmt(w.avgProtein)} g` : '—'}</b></div>
        <div><span class="note">平均碳水</span><b>${w.avgCarb != null ? `${fmt(w.avgCarb)} g` : '—'}</b></div>
      </div>
    </div>`,
  );
}

function bodyCompCards() {
  const fat = state.bodyComps.filter((b) => b.bodyFatPct != null);
  const muscle = state.bodyComps.filter((b) => b.muscleKg != null);
  if (!fat.length && !muscle.length) {
    return html`<div class="card"><p class="note" style="margin:0">還沒有體脂、肌肉量紀錄。到「身體」分頁新增。</p></div>`;
  }
  const card = (key, title, list, unit) =>
    list.length
      ? html`<div class="card chart-card">
          <div class="chart-head"><div class="card-label">${title}</div>${list.length > 1 ? html`<span class="note">比第一次 ${fmtSigned(list[list.length - 1][key] - list[0][key], 1)} ${unit}</span>` : ''}</div>
          <div class="mid">${fmt(list[list.length - 1][key], 1)}<small>${unit}</small></div>
          <div data-chart="${key}"></div>
        </div>`
      : '';
  return html`${card('bodyFatPct', '體脂率', fat, '%')}${card('muscleKg', '肌肉量', muscle, 'kg')}`;
}

function drawBodyComp(el, key, name, unit) {
  const list = state.bodyComps.filter((b) => b[key] != null);
  const from = list[0].date;
  const to = list.length > 1 ? list[list.length - 1].date : addDays(from, 30);
  lineChart(el, {
    points: list.map((b) => ({ date: b.date, value: b[key], tip: html`<b>${b.date}</b> · ${name} <b>${fmt(b[key], 1)}</b> ${unit}`.__html })),
    from,
    to,
    dotClass: 'dot-main',
    aria: `${name}趨勢圖`,
    table: tableFor(['日期', name], [...list].reverse().map((b) => [b.date, `${fmt(b[key], 1)} ${unit}`])),
    initial: list.length - 1,
  });
}

export function renderTrends(main) {
  const today = todayStr();
  const to = addDays(today, -1); // 今天還沒結束，不列入
  const from = addDays(today, -RANGES[range].days);
  const mode = RANGES[range].group;
  const gs = groups(dailySeries(state, from, to), mode);

  setHTML(
    main,
    html`<div class="page-head"><h1 class="page-title">趨勢</h1></div>
      <div class="seg-wrap"><div class="seg" data-seg="range" role="group" aria-label="期間">
        ${Object.entries(RANGES).map(([k, r]) => html`<button type="button" data-v="${k}" class="${k === range ? 'on' : ''}" aria-pressed="${k === range}">${r.label}</button>`)}
      </div></div>
      <p class="note" style="margin: 0 var(--s4) var(--s3)">只統計有完整記錄飲食的日子；今天還沒結束，不列入。點圖表可查看每個點的數字。</p>
      ${weightCard(from, today)}
      ${balanceCard(gs, mode)}
      ${metricCard('intake', '熱量攝取', '大卡', gs)}
      ${metricCard('protein', '蛋白質', 'g', gs)}
      ${metricCard('carb', '碳水', 'g', gs)}
      <div class="sec-h">每週總結</div>
      ${weekCards()}
      <p class="sec-foot">理論體重變化 = 平均每日赤字／盈餘 × 7 ÷ ${fmt(KCAL_PER_KG)}。實際體重變化 = 本週平均體重 − 上週平均體重。兩者差很多時，可能是水分變化或紀錄有遺漏。</p>
      <div class="sec-h">體組成（全部紀錄）</div>
      ${bodyCompCards()}`,
  );

  // 圖表需要知道實際寬度，所以在版面完成後才畫
  const q = (k) => main.querySelector(`[data-chart="${k}"]`);
  drawWeight(q('weight'), from, today);
  drawBalance(q('balance'), gs, mode);
  drawMetric(q('intake'), 'intake', 'target', '熱量', '大卡', gs, mode);
  drawMetric(q('protein'), 'protein', 'proteinT', '蛋白質', 'g', gs, mode);
  drawMetric(q('carb'), 'carb', 'carbT', '碳水', 'g', gs, mode);
  if (q('bodyFatPct')) drawBodyComp(q('bodyFatPct'), 'bodyFatPct', '體脂率', '%');
  if (q('muscleKg')) drawBodyComp(q('muscleKg'), 'muscleKg', '肌肉量', 'kg');

  bindSegmented(main, (seg, v) => {
    if (seg === 'range') {
      range = v;
      renderTrends(main);
    }
  });
  main.onclick = null;
  main.onchange = null;
}
