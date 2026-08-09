// monthly-checkin.js — 月度每日打卡表（独立菜单）
// 包含：总览目标(总体+年度) / 月度目标(含月度总结) / 阅读目标 / 每日打卡(本周) / 打卡总览(整月) / 统计
import { registerStandalone } from '../../registry.js';
import { Storage } from '../../storage.js';
import { toast, escapeHtml, confirmDialog } from '../../ui.js';

// 打卡清单图标
const checkinIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>';

// 默认打卡项目（按序号，含执行规则）—— 用户可在「每日打卡」中编辑
const DEFAULT_ITEMS = [
  { n: 1, name: '晚间备考学习≥2h', rule: '工作日固定学习；10.11-10.24 软考冲刺期拆分为 1h 公考 + 1h 软考；周四加班可豁免当日此项' },
  { n: 2, name: '上班碎片学软考', rule: '仅工作日工位碎片化完成，晚间不占用备考时间' },
  { n: 3, name: '运动燃脂≥30min', rule: '工作日居家低强度有氧，周末可延长时长减脂' },
  { n: 4, name: '泡脚', rule: '每周至少 3 次，消水肿改善睡眠' },
  { n: 5, name: '早睡23:00前', rule: '23:00 前放下手机入睡，硬性作息要求' },
  { n: 6, name: '日行步数≥5000', rule: '通勤日常累积即可' },
  { n: 7, name: '晚间护肤', rule: '基础护肤外形打理' },
  { n: 8, name: '穿搭/化妆练习', rule: '每周至少 2 次，不限周末工作日' },
  { n: 9, name: '副业打理≤30min', rule: '闲鱼运营、自媒体素材整理，超时停止；软考冲刺期仅回复私信、停内容创作' },
  { n: 10, name: '饮食控糖减脂', rule: '戒掉奶茶、夜宵、重油晚餐' },
  { n: 11, name: '公考错题复盘', rule: '当日学习同步整理错题，周末集中复盘' },
  { n: 12, name: '一句话心情日记', rule: '简短记录情绪状态，缓解内耗' },
  { n: 13, name: '运动后拉伸', rule: '配套运动完成，优化体态' },
  { n: 14, name: '留白自由项', rule: '可记录社交、休闲放松等随缘事项' },
];

const PHASES = [
  { tag: '阶段①', date: '即日起 - 10.10', text: '正常全项打卡，软考仅上班碎片化学习' },
  { tag: '阶段②', date: '10.11 - 10.24', text: '备考时长拆分（公考+软考各 1h），副业缩减投入' },
  { tag: '阶段③', date: '10.25 - 12.06', text: '取消软考打卡项，全力公考冲刺' },
];

const SPECIAL = [
  '周四加班当日可豁免「备考学习、运动」两项打卡，保留泡脚 + 早睡',
  '每周可设置 2 天宽松豁免日，避免焦虑摆烂',
  '补卡规则：仅今日与昨日可打卡，更早的日期已锁定（灰色），避免拖延补卡',
];

// —— 三态：空 → 完成 → 部分完成 → 未完成 → 空 ——
const STATE_CYCLE = [null, 'done', 'partial', 'undone'];
const STATE_ICON = { done: '✓', partial: '◑', undone: '✕' };

const GOAL_KEY = 'checkin_goals';
function defaultGoals() {
  return {
    overall: '2026下半年每日打卡表',
    annual: '【备考主线】宜宾事业编 + 国考 + 四川省考备考｜辅助：减脂塑形 + 副业试水\n【关键考试节点】10.24 软考、11 月下旬事业编、11.29 国考、12.06 省考\n\n【年度成果预期】\n上岸：事业编 / 国考 / 省考至少其一录用；\n体态：体脂率降至健康区间，养成运动习惯；\n副业：自媒体跑通最小盈利闭环。',
    reading: '每月精读 2 本成长 / 专业类书籍，输出读书笔记；碎片时间用听书补足。',
  };
}
function loadGoals() {
  const g = Storage.get(GOAL_KEY, defaultGoals());
  // 迁移：旧版把「主线/关键节点」放在了 overall，统一挪到 annual
  if (g.overall && g.overall.includes('主线：') && g.overall.includes('关键考试节点：')) {
    const lines = g.overall.split('\n');
    const rest = [], moved = [];
    lines.forEach(l => {
      if (l.startsWith('主线：') || l.startsWith('关键考试节点：')) moved.push(l);
      else rest.push(l);
    });
    g.overall = (rest.join('\n').trim()) || defaultGoals().overall;
    const block = '【备考主线与关键节点】\n' + moved.join('\n') + '\n\n';
    if (!g.annual || g.annual.indexOf('备考主线') === -1) g.annual = block + (g.annual || '');
    saveGoals(g);
  }
  return g;
}
function saveGoals(g) { Storage.set(GOAL_KEY, g); }

const ITEMS_KEY = 'checkin_items';
function loadItems() {
  const v = Storage.get(ITEMS_KEY, null);
  return (Array.isArray(v) && v.length) ? v : DEFAULT_ITEMS.map(x => ({ ...x }));
}
function saveItems(arr) { Storage.set(ITEMS_KEY, arr); }

const MONTHLY_KEY = 'checkin_monthly';
// 按月份自动规划月度目标（未手动保存过时作为默认值回填）；按月 key 存储天然保留每月历史
function defaultMonthly(ym) {
  const plans = {
    '2026-08': '【8月 · 启动奠基期】\n· 建立全项打卡习惯，固定工作日学习节奏，周末补弱；\n· 软考：上班碎片化过一遍基础，晚间不占用备考主时间；\n· 公考：完成基础课第一轮，建立错题本框架；\n· 减脂：启动饮食控糖 + 每周≥3次运动，记录初始体重；\n· 副业：闲鱼/自媒体维持最低运营，不超时。',
    '2026-09': '【9月 · 强化提升期】\n· 公考进入刷题阶段，每日错题复盘常态化；\n· 软考重点章节突破，周末集中学；\n· 减脂进入平台期管理，体脂率稳步下降；\n· 穿搭/化妆每周≥2次练习，提升外形状态；\n· 保持运动 + 泡脚 + 早睡作息稳定。',
    '2026-10': '【10月 · 软考冲刺 + 转段】\n· 阶段②（10.11-10.24）备考时长拆分（公考+软考各1h），副业缩减；\n· 10.24 软考考试，考前模拟 + 调整状态；\n· 10.25 起转入阶段③，取消软考项，全力公考；\n· 减脂维持，避免考前焦虑暴食。',
    '2026-11': '【11月 · 公考冲刺】\n· 阶段③全力公考：全真模拟 + 错题集中复盘；\n· 11月下旬 事业编考试；11.29 国考；\n· 每周2天宽松豁免日缓解压力；\n· 作息与运动保持，确保考试状态。',
    '2026-12': '【12月 · 收官复盘】\n· 12.06 四川省考，考后即时复盘；\n· 等待成绩期间保持打卡纪律，不摆烂；\n· 总结全年备考，规划明年方向与副业放大；\n· 减脂成果巩固，体态目标验收。',
  };
  const goal = plans[ym] || '【本月目标】\n· 推进公考/软考备考主线，保持全项打卡；\n· 减脂塑形与作息管理持续执行；\n· 副业维持最低运营，不超时；\n· 月末复盘达成情况与下月调整。';
  return { goal, summary: '' };
}
function loadMonthlyAll() { return Storage.get(MONTHLY_KEY, {}); }
function loadMonthly(ym) { const all = loadMonthlyAll(); return all[ym] || defaultMonthly(ym); }
function saveMonthly(ym, data) { const all = loadMonthlyAll(); all[ym] = data; Storage.set(MONTHLY_KEY, all); }

function gridKey(ym) { return 'checkin_grid_' + ym; }
function loadGrid(ym) { return Storage.get(gridKey(ym), {}); }

const NOTE_KEY = 'checkin_daynote';
function noteKey(ym) { return NOTE_KEY + '_' + ym; }
function loadNotes(ym) { return Storage.get(noteKey(ym), {}); }

const WK = ['日', '一', '二', '三', '四', '五', '六'];

function pad(n) { return String(n).padStart(2, '0'); }
function ymOf(y, m) { return y + '-' + pad(m); }
function ymdOf(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

// 某日期相对今天的状态：today / yesterday / past / future
function dayRelation(y, m, d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dt = new Date(y, m - 1, d); dt.setHours(0, 0, 0, 0);
  const diff = Math.round((today - dt) / 86400000);
  if (diff < 0) return 'future';
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return 'past';
}
// 仅今日与昨日可补卡
function isEditableDay(y, m, d) { const r = dayRelation(y, m, d); return r === 'today' || r === 'yesterday'; }

// 把当月按"周一起始"切分为若干周，用于每周统计
function getWeeks(y, m) {
  const days = new Date(y, m, 0).getDate();
  const map = {};
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, m - 1, d);
    const dow = date.getDay();
    const diff = (dow === 0) ? -6 : (1 - dow);
    const mon = new Date(y, m - 1, d + diff);
    const key = ymOf(mon.getFullYear(), mon.getMonth() + 1) + '-' + pad(mon.getDate());
    if (!map[key]) map[key] = { start: mon, end: mon, days: [] };
    map[key].days.push(d);
    map[key].end = date;
  }
  return Object.keys(map).sort().map((k, i) => ({ label: '第' + (i + 1) + '周', start: map[k].start, end: map[k].end, days: map[k].days }));
}

// 读取某 item 在某个月份的三态计数
function countItemInMonth(itemN, ym) {
  const g = (loadGrid(ym)[itemN]) || {};
  let done = 0, partial = 0, undone = 0;
  for (const k in g) {
    if (g[k] === 'done') done++;
    else if (g[k] === 'partial') partial++;
    else if (g[k] === 'undone') undone++;
  }
  return { done, partial, undone };
}

// 通用：渲染一个打卡表格
// dates: [{y,m,d,dateStr,wkend,editable,locked}]
// countYM: 用于「当月完成」统计的月份
// opts.showCount: 是否显示「当月完成」列（每日打卡周视图关闭，打卡总览保留）
function buildTable(items, dates, countYM, opts) {
  const showCount = !opts || opts.showCount !== false;
  let headDays = '';
  dates.forEach(dt => {
    const cls = 'ck-th ck-day' + (dt.wkend ? ' ck-wkend' : '') + (dt.locked ? ' ck-locked' : '');
    headDays += `<th class="${cls}"><div class="ck-d">${dt.d}</div><div class="ck-w">${WK[dt.wd]}</div></th>`;
  });

  let rows = '';
  items.forEach(it => {
    const c = countItemInMonth(it.n, countYM);
    let cells = '';
    dates.forEach(dt => {
      const g = (loadGrid(ymOf(dt.y, dt.m))[it.n]) || {};
      const st = g[dt.dateStr] || null;
      const cellCls = 'ck-cell' + (st ? ' ck-' + st : '') + (dt.locked ? ' ck-locked' : '');
      cells += `<td class="ck-td${(dt.wkend ? ' ck-wkend' : '') + (dt.locked ? ' ck-locked' : '')}"><button class="${cellCls}" data-item="${it.n}" data-date="${dt.dateStr}" ${dt.locked ? 'disabled' : ''} title="${escapeHtml(it.name)}">${st ? STATE_ICON[st] : ''}</button></td>`;
    });
    const countHtml = `<span class="ck-done-n">${c.done}</span>${c.partial ? `<span class="ck-part-n"> ◑${c.partial}</span>` : ''}`;
    rows += `<tr>
      <td class="ck-td ck-idx">${it.n}</td>
      <td class="ck-td ck-item" title="${escapeHtml(it.rule)}">${escapeHtml(it.name)}</td>
      ${cells}
      ${showCount ? `<td class="ck-td ck-count">${countHtml}</td>` : ''}
    </tr>`;
  });

  // 每日完成合计（done+partial 计为 1）
  let sumCells = '';
  const perDay = {};
  items.forEach(it => {
    dates.forEach(dt => {
      const g = (loadGrid(ymOf(dt.y, dt.m))[it.n]) || {};
      const st = g[dt.dateStr];
      if (st === 'done' || st === 'partial') perDay[dt.dateStr] = (perDay[dt.dateStr] || 0) + 1;
    });
  });
  dates.forEach(dt => {
    sumCells += `<td class="ck-td ck-sumday${(dt.wkend ? ' ck-wkend' : '') + (dt.locked ? ' ck-locked' : '')}" data-date="${dt.dateStr}">${perDay[dt.dateStr] || ''}</td>`;
  });

  return `
    <div class="ck-table-wrap">
      <table class="ck-table">
        <thead><tr><th class="ck-th ck-idx">序号</th><th class="ck-th ck-item">打卡目标</th>${headDays}${showCount ? '<th class="ck-th ck-count">当月完成</th>' : ''}</tr></thead>
        <tbody>${rows}
          <tr class="ck-sumrow"><td class="ck-td ck-idx" colspan="2">每日完成合计</td>${sumCells}${showCount ? '<td class="ck-td ck-count"></td>' : ''}</tr>
        </tbody>
      </table>
    </div>`;
}

// ====== 共用：在指定容器渲染「本周每日打卡表 + 今日记录」======
// 首页与月度打卡表的「每日打卡」共用同一份渲染与交互（就地更新，不整表重渲）
export function renderWeeklyCheckin(host) {
  if (!host) return;
  const items = loadItems();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const monOffset = (dow === 0) ? -6 : (1 - dow);
  const mon = new Date(today); mon.setDate(today.getDate() + monOffset);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(mon); dt.setDate(mon.getDate() + i);
    const y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
    const rel = dayRelation(y, m, d);
    dates.push({ y, m, d, dateStr: ymdOf(y, m, d), wd: dt.getDay(), wkend: (dt.getDay() === 0 || dt.getDay() === 6), editable: isEditableDay(y, m, d), locked: (rel === 'past' || rel === 'future') });
  }
  const countYM = ymOf(today.getFullYear(), today.getMonth() + 1);
  const sun = dates[6];
  const weekTitle = `本周 ${mon.getMonth() + 1}.${mon.getDate()} - ${sun.m}.${sun.d}`;
  const tY = today.getFullYear(), tM = today.getMonth() + 1, tD = today.getDate();
  const tNote = (loadNotes(ymOf(tY, tM))[ymdOf(tY, tM, tD)]) || '';

  host.innerHTML = `
    <div class="ck-card">
      <div class="ck-card-head"><div class="ck-card-title">✅ 每日打卡表 · ${weekTitle}</div>
        <div class="ck-legend"><span class="ck-lg ck-lg-done">✓完成</span><span class="ck-lg ck-lg-part">◑部分</span><span class="ck-lg ck-lg-undone">✕未完成</span></div>
      </div>
      <div class="ck-hint">点格子循环切换：空→完成→部分→未完成。仅<b>今日与昨日</b>可打卡，更早日期已锁定（灰色）。每周一自动切换到当周。</div>
      ${buildTable(items, dates, countYM, { showCount: false })}
    </div>
    <div class="ck-card">
      <div class="ck-card-head"><div class="ck-card-title">📝 今日记录（${tM}月${tD}日）</div><button class="btn btn-primary btn-sm" id="ckSaveNote">💾 保存记录</button></div>
      <div class="ck-card-desc">记录今天的完成情况、学习状态、未达成原因等</div>
      <textarea class="ck-note-text" id="ckNote" placeholder="例如：今日备考 2h，软考碎片 30min；运动未完成（加班太累）；明日补上…">${escapeHtml(tNote)}</textarea>
    </div>`;

  // 绑定格子（就地更新）
  host.querySelectorAll('.ck-cell:not([disabled])').forEach(cell => {
    cell.onclick = () => {
      const item = Number(cell.dataset.item);
      const dateStr = cell.dataset.date;
      const [yy, mm, dd] = dateStr.split('-').map(Number);
      if (!isEditableDay(yy, mm, dd)) { toast('该日期已锁定，仅今日与昨日可打卡'); return; }
      const ym = ymOf(yy, mm);
      const grid = loadGrid(ym);
      if (!grid[item]) grid[item] = {};
      const cur = grid[item][dateStr] || null;
      const idx = STATE_CYCLE.indexOf(cur);
      const next = STATE_CYCLE[(idx + 1) % STATE_CYCLE.length];
      if (next === null) delete grid[item][dateStr];
      else grid[item][dateStr] = next;
      Storage.set(gridKey(ym), grid);
      cell.className = 'ck-cell' + (next ? ' ck-' + next : '');
      cell.textContent = next ? STATE_ICON[next] : '';
      const sumCell = host.querySelector('.ck-sumday[data-date="' + dateStr + '"]');
      if (sumCell) {
        let perDay = 0;
        items.forEach(it => {
          const g = (loadGrid(ym)[it.n]) || {};
          const st = g[dateStr];
          if (st === 'done' || st === 'partial') perDay++;
        });
        sumCell.textContent = perDay || '';
      }
      const rowCount = cell.closest('tr').querySelector('.ck-count');
      if (rowCount) {
        const c = countItemInMonth(item, ym);
        rowCount.innerHTML = `<span class="ck-done-n">${c.done}</span>${c.partial ? `<span class="ck-part-n"> ◑${c.partial}</span>` : ''}`;
      }
    };
  });

  // 绑定今日记录保存
  const saveBtn = host.querySelector('#ckSaveNote');
  if (saveBtn) saveBtn.onclick = () => {
    const ta = host.querySelector('#ckNote');
    if (!ta) return;
    const ym = ymOf(tY, tM);
    const ds = ymdOf(tY, tM, tD);
    const notes = loadNotes(ym);
    notes[ds] = ta.value;
    Storage.set(noteKey(ym), notes);
    toast('已保存今日记录');
  };
}

// 今日打卡汇总（供首页统计卡片使用）
export function getTodayCheckinSummary() {
  const items = loadItems();
  const today = new Date();
  const ds = ymdOf(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const ym = ymOf(today.getFullYear(), today.getMonth() + 1);
  const g = loadGrid(ym);
  let done = 0, partial = 0, undone = 0;
  items.forEach(it => {
    const st = (g[it.n] || {})[ds];
    if (st === 'done') done++;
    else if (st === 'partial') partial++;
    else if (st === 'undone') undone++;
  });
  return { done, partial, undone, total: items.length, checked: done + partial + undone };
}

export function initMonthlyCheckin() {
  registerStandalone('monthly-checkin', {
    title: '月度打卡表',
    icon: checkinIcon,
    render(container) {
      let tab = 'today';
      let curYM = (() => { const d = new Date(); return ymOf(d.getFullYear(), d.getMonth() + 1); })();
      let itemsEditMode = false;

      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">月度打卡表</div>
          <div class="page-desc">总览目标 · 月度目标 · 阅读目标 · 每日打卡 · 打卡总览 · 统计</div>
        </div>
        <div class="ck-tabs">
          <button class="ck-tab" data-tab="overview">总览目标</button>
          <button class="ck-tab" data-tab="monthly">月度目标</button>
          <button class="ck-tab" data-tab="reading">阅读目标</button>
          <button class="ck-tab active" data-tab="today">每日打卡</button>
          <button class="ck-tab" data-tab="monthedit">打卡总览</button>
          <button class="ck-tab" data-tab="stats">统计</button>
        </div>
        <div id="ckTabBody"></div>
      `;

      const body = container.querySelector('#ckTabBody');

      function monthNavHtml() {
        const [y, m] = curYM.split('-').map(Number);
        return `<div class="ck-card"><div class="ck-table-nav">
          <button class="btn btn-ghost btn-sm" id="ckPrev">‹ 上月</button>
          <div class="ck-ym">${y} 年 ${m} 月</div>
          <button class="btn btn-ghost btn-sm" id="ckNext">下月 ›</button>
        </div></div>`;
      }

      function renderTab() {
        if (tab === 'overview') body.innerHTML = renderOverview();
        else if (tab === 'monthly') body.innerHTML = renderMonthly();
        else if (tab === 'reading') body.innerHTML = renderReading();
        else if (tab === 'today') body.innerHTML = renderToday();
        else if (tab === 'monthedit') body.innerHTML = renderMonthEdit();
        else body.innerHTML = renderStats();
        // 本周打卡表 + 今日记录（首页与月度打卡表共用同一渲染）
        if (tab === 'today') renderWeeklyCheckin(body.querySelector('#ckWeekHost'));
        bindTab();
      }

      // —— 总览目标：总体目标 + 年度目标 合并一页 ——
      function renderOverview() {
        const g = loadGoals();
        return `
          <div class="ck-card">
            <div class="ck-card-head"><div class="ck-card-title">总体目标</div><button class="ck-edit-btn" id="ckEditOverall">✏️ 编辑</button></div>
            <div class="ck-card-desc">一句话总览（备考主线与关键节点见下方「年度目标」）</div>
            <textarea class="ck-goal-text ck-goal-text-sm" id="ckOverall" disabled>${escapeHtml(g.overall)}</textarea>
          </div>
          <div class="ck-card">
            <div class="ck-card-head"><div class="ck-card-title">年度目标</div><button class="ck-edit-btn" id="ckEditAnnual">✏️ 编辑</button></div>
            <div class="ck-card-desc">备考主线 · 关键节点 · 本年度核心成果预期</div>
            <textarea class="ck-goal-text ck-goal-text-lg" id="ckAnnual" disabled>${escapeHtml(g.annual)}</textarea>
          </div>`;
      }

      function renderReading() {
        const g = loadGoals();
        return `<div class="ck-card">
          <div class="ck-card-head"><div class="ck-card-title">阅读目标</div><button class="ck-edit-btn" id="ckEditReading">✏️ 编辑</button></div>
          <div class="ck-card-desc">每月读书计划与输出要求</div>
          <textarea class="ck-goal-text" id="ckReading" disabled>${escapeHtml(g.reading)}</textarea>
        </div>`;
      }

      function renderMonthly() {
        const mm = loadMonthly(curYM);
        return `
          ${monthNavHtml()}
          <div class="ck-card">
            <div class="ck-card-head"><div class="ck-card-title">月度目标（${curYM}）</div><button class="ck-edit-btn" id="ckEditMGoal">✏️ 编辑</button></div>
            <div class="ck-card-desc">本月重点发力方向与拆解</div>
            <textarea class="ck-goal-text" id="ckMGoal" disabled placeholder="输入本月目标…">${escapeHtml(mm.goal)}</textarea>
          </div>
          <div class="ck-card">
            <div class="ck-card-head"><div class="ck-card-title">月度总结（${curYM}）</div><button class="ck-edit-btn" id="ckEditMSum">✏️ 编辑</button></div>
            <div class="ck-card-desc">月末复盘：达成情况 / 偏差 / 下月调整</div>
            <textarea class="ck-goal-text" id="ckMSum" disabled placeholder="输入本月总结…">${escapeHtml(mm.summary)}</textarea>
          </div>`;
      }

      // —— 每日打卡：本周 7 天视图 + 今日记录 ——
      function renderToday() {
        const items = loadItems();
        // 本周一 ~ 周日
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const dow = today.getDay();
        const monOffset = (dow === 0) ? -6 : (1 - dow);
        const mon = new Date(today); mon.setDate(today.getDate() + monOffset);
        const dates = [];
        for (let i = 0; i < 7; i++) {
          const dt = new Date(mon); dt.setDate(mon.getDate() + i);
          const y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
          const rel = dayRelation(y, m, d);
          dates.push({ y, m, d, dateStr: ymdOf(y, m, d), wd: dt.getDay(), wkend: (dt.getDay() === 0 || dt.getDay() === 6), editable: isEditableDay(y, m, d), locked: (rel === 'past' || rel === 'future') });
        }
        const countYM = ymOf(today.getFullYear(), today.getMonth() + 1);
        const sun = dates[6];
        const weekTitle = `本周 ${mon.getMonth() + 1}.${mon.getDate()} - ${sun.m}.${sun.d}`;

        // 今日记录
        const tY = today.getFullYear(), tM = today.getMonth() + 1, tD = today.getDate();
        const tNote = (loadNotes(ymOf(tY, tM))[ymdOf(tY, tM, tD)]) || '';

        // 项目管理
        let rulesHtml;
        if (itemsEditMode) {
          rulesHtml = `<div class="ck-card">
            <div class="ck-card-head"><div class="ck-card-title">📌 管理打卡项目</div><button class="btn btn-primary btn-sm" id="ckSaveItems">💾 保存项目</button></div>
            <div class="ck-items-edit">
              ${items.map((it, idx) => `<div class="ck-item-edit">
                <div class="ck-item-edit-head"><span>#${it.n}</span><button class="ck-del-item" data-idx="${idx}">删除</button></div>
                <input class="ck-item-name" data-idx="${idx}" value="${escapeHtml(it.name)}" placeholder="打卡目标名">
                <input class="ck-item-rule" data-idx="${idx}" value="${escapeHtml(it.rule)}" placeholder="执行规则">
              </div>`).join('')}
            </div>
            <button class="btn btn-ghost btn-sm" id="ckAddItem" style="margin-top:8px">＋ 添加打卡项</button>
          </div>`;
        } else {
          rulesHtml = `<div class="ck-card">
            <div class="ck-card-head"><div class="ck-card-title">📌 打卡项目与执行规则</div><button class="ck-edit-btn" id="ckMngItems">✏️ 管理</button></div>
            <div class="ck-rules">${items.map(it => `<div class="ck-rule"><b>${it.n}. ${escapeHtml(it.name)}</b><span>${escapeHtml(it.rule)}</span></div>`).join('')}</div>
          </div>`;
        }

        return `
          ${rulesHtml}
          <div class="ck-card">
            <div class="ck-card-title">🗓 分阶段备注</div>
            <div class="ck-phases">${PHASES.map(p => `<div class="ck-phase"><b>${p.tag}</b> <span class="ck-phase-date">${p.date}</span><div>${escapeHtml(p.text)}</div></div>`).join('')}</div>
            <div class="ck-special">${SPECIAL.map(s => '· ' + escapeHtml(s)).join('<br>')}</div>
          </div>
          <div id="ckWeekHost"></div>`;
      }

      // —— 打卡总览：整月完整表格，实时更新 ——
      function renderMonthEdit() {
        const items = loadItems();
        const [y, m] = curYM.split('-').map(Number);
        const days = new Date(y, m, 0).getDate();
        const dates = [];
        for (let d = 1; d <= days; d++) {
          const rel = dayRelation(y, m, d);
          dates.push({ y, m, d, dateStr: ymdOf(y, m, d), wd: new Date(y, m - 1, d).getDay(), wkend: (new Date(y, m - 1, d).getDay() === 0 || new Date(y, m - 1, d).getDay() === 6), editable: isEditableDay(y, m, d), locked: (rel === 'past' || rel === 'future') });
        }

        return `
          ${monthNavHtml()}
          <div class="ck-card">
            <div class="ck-card-head"><div class="ck-card-title">📋 ${y}年${m}月 完整打卡总览</div>
              <div class="ck-legend"><span class="ck-lg ck-lg-done">✓完成</span><span class="ck-lg ck-lg-part">◑部分</span><span class="ck-lg ck-lg-undone">✕未完成</span></div>
            </div>
            <div class="ck-hint">整月实时视图：灰色锁定日期（早于昨日的过往日 / 未来日）不可打卡；仅今日与昨日可补卡。底部「每日完成合计」随打卡实时更新。</div>
            ${buildTable(items, dates, curYM)}
          </div>`;
      }

      // —— 统计：自动汇总当月 / 每周打卡情况 ——
      function renderStats() {
        const items = loadItems();
        const [y, m] = curYM.split('-').map(Number);
        const days = new Date(y, m, 0).getDate();
        const weeks = getWeeks(y, m);
        const todayDate = (new Date().getFullYear() === y && (new Date().getMonth() + 1) === m) ? new Date().getDate() : days;
        const elapsed = (new Date().getFullYear() === y && (new Date().getMonth() + 1) === m) ? todayDate : days;

        let doneTotal = 0, partTotal = 0, undoneTotal = 0;
        const perItem = {};
        items.forEach(it => {
          const g = (loadGrid(curYM)[it.n]) || {};
          let d = 0, p = 0, u = 0;
          for (const k in g) { if (g[k] === 'done') d++; else if (g[k] === 'partial') p++; else if (g[k] === 'undone') u++; }
          perItem[it.n] = { done: d, partial: p, undone: u };
          doneTotal += d; partTotal += p; undoneTotal += u;
        });

        const weighted = doneTotal + partTotal * 0.5;
        const coverage = (items.length * days) ? Math.round(weighted / (items.length * days) * 100) : 0;
        const avg = elapsed ? (weighted / elapsed).toFixed(1) : '0';

        const weekRows = weeks.map(w => {
          let wt = 0, wp = 0;
          items.forEach(it => { const g = (loadGrid(curYM)[it.n]) || {}; w.days.forEach(d => { const s = g[ymdOf(y, m, d)]; if (s === 'done') wt++; else if (s === 'partial') wp++; }); });
          const wavg = w.days.length ? ((wt + wp * 0.5) / w.days.length).toFixed(1) : '0';
          const sM = w.start.getMonth() + 1, sD = w.start.getDate(), eM = w.end.getMonth() + 1, eD = w.end.getDate();
          return `<tr><td class="ck-td">${w.label}</td><td class="ck-td">${sM}.${sD} - ${eM}.${eD}</td><td class="ck-td">${wt}</td><td class="ck-td">${wp}</td><td class="ck-td">${wavg}</td></tr>`;
        }).join('');

        const itemRows = items.map(it => {
          const c = perItem[it.n];
          return `<tr><td class="ck-td ck-idx">${it.n}</td><td class="ck-td ck-item">${escapeHtml(it.name)}</td><td class="ck-td">${c.done}</td><td class="ck-td">${c.partial}</td><td class="ck-td">${c.undone}</td><td class="ck-td">${days ? Math.round((c.done + c.partial * 0.5) / days * 100) : 0}%</td></tr>`;
        }).join('');

        return `
          ${monthNavHtml()}
          <div class="ck-stats-cards">
            <div class="ck-stat"><div class="ck-stat-num">${doneTotal}</div><div class="ck-stat-label">完成次数</div></div>
            <div class="ck-stat"><div class="ck-stat-num">${partTotal}</div><div class="ck-stat-label">部分次数</div></div>
            <div class="ck-stat"><div class="ck-stat-num">${coverage}%</div><div class="ck-stat-label">打卡覆盖率</div></div>
            <div class="ck-stat"><div class="ck-stat-num">${avg}</div><div class="ck-stat-label">日均完成项</div></div>
          </div>
          <div class="ck-card">
            <div class="ck-card-title">📊 每周打卡统计（${curYM}）</div>
            <div class="ck-table-wrap"><table class="ck-table ck-stat-table">
              <thead><tr><th class="ck-th">周次</th><th class="ck-th">日期范围</th><th class="ck-th">完成</th><th class="ck-th">部分</th><th class="ck-th">日均</th></tr></thead>
              <tbody>${weekRows}</tbody>
            </table></div>
          </div>
          <div class="ck-card">
            <div class="ck-card-title">📈 各项目月度完成（${curYM}）</div>
            <div class="ck-table-wrap"><table class="ck-table ck-stat-table">
              <thead><tr><th class="ck-th ck-idx">序号</th><th class="ck-th ck-item">打卡目标</th><th class="ck-th">完成</th><th class="ck-th">部分</th><th class="ck-th">未完成</th><th class="ck-th">完成率</th></tr></thead>
              <tbody>${itemRows}</tbody>
            </table></div>
          </div>
          <div class="ck-hint">统计基于「每日打卡」中已勾选（含部分完成）的记录自动计算，切换月份可查看不同月份数据。</div>`;
      }

      function bindTab() {
        container.querySelectorAll('.ck-tab').forEach(b => {
          b.onclick = () => {
            container.querySelectorAll('.ck-tab').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            tab = b.dataset.tab;
            itemsEditMode = false;
            // 统计默认展示当月（仍可用月份导航查看历史月）
            if (tab === 'stats' || tab === 'monthly' || tab === 'monthedit') {
              const d = new Date();
              curYM = ymOf(d.getFullYear(), d.getMonth() + 1);
            }
            renderTab();
          };
        });
        bindMonthNav();

        bindEditable('#ckOverall', '#ckEditOverall', v => { const g = loadGoals(); g.overall = v; saveGoals(g); }, '总体目标');
        bindEditable('#ckAnnual', '#ckEditAnnual', v => { const g = loadGoals(); g.annual = v; saveGoals(g); }, '年度目标');
        bindEditable('#ckReading', '#ckEditReading', v => { const g = loadGoals(); g.reading = v; saveGoals(g); }, '阅读目标');
        bindEditable('#ckMGoal', '#ckEditMGoal', v => { const mm = loadMonthly(curYM); mm.goal = v; saveMonthly(curYM, mm); }, '月度目标');
        bindEditable('#ckMSum', '#ckEditMSum', v => { const mm = loadMonthly(curYM); mm.summary = v; saveMonthly(curYM, mm); }, '月度总结');

        if (tab === 'today') bindToday();
        if (tab === 'monthedit') bindTable();
      }

      function bindEditable(selTa, selBtn, onSave, label) {
        const ta = body.querySelector(selTa);
        const btn = body.querySelector(selBtn);
        if (!ta || !btn) return;
        btn.onclick = () => {
          if (btn.dataset.editing === '1') {
            onSave(ta.value);
            ta.disabled = true;
            btn.dataset.editing = '0';
            btn.textContent = '✏️ 编辑';
            ta.classList.remove('editing');
            toast('已保存' + label);
          } else {
            ta.disabled = false;
            btn.dataset.editing = '1';
            btn.textContent = '💾 保存';
            ta.classList.add('editing');
            ta.focus();
          }
        };
      }

      function bindMonthNav() {
        const prev = body.querySelector('#ckPrev');
        const next = body.querySelector('#ckNext');
        const shift = (delta) => {
          const [y, m] = curYM.split('-').map(Number);
          const d = new Date(y, m - 1 + delta, 1);
          curYM = ymOf(d.getFullYear(), d.getMonth() + 1);
          renderTab();
        };
        if (prev) prev.onclick = () => shift(-1);
        if (next) next.onclick = () => shift(1);
      }

      // 通用：表格格子三态切换（今日/昨日可编辑）—— 就地更新，不整表重渲
      function bindTable() {
        body.querySelectorAll('.ck-cell:not([disabled])').forEach(cell => {
          cell.onclick = () => {
            const item = Number(cell.dataset.item);
            const dateStr = cell.dataset.date;
            const [yy, mm, dd] = dateStr.split('-').map(Number);
            if (!isEditableDay(yy, mm, dd)) { toast('该日期已锁定，仅今日与昨日可打卡'); return; }
            const ym = ymOf(yy, mm);
            const grid = loadGrid(ym);
            if (!grid[item]) grid[item] = {};
            const cur = grid[item][dateStr] || null;
            const idx = STATE_CYCLE.indexOf(cur);
            const next = STATE_CYCLE[(idx + 1) % STATE_CYCLE.length];
            if (next === null) delete grid[item][dateStr];
            else grid[item][dateStr] = next;
            Storage.set(gridKey(ym), grid);
            // 就地更新该格 + 当日合计 + 行计数，避免整表重渲导致滚动跳回顶部（点周日格后又要滑回）
            cell.className = 'ck-cell' + (next ? ' ck-' + next : '');
            cell.textContent = next ? STATE_ICON[next] : '';
            const sumCell = body.querySelector('.ck-sumday[data-date="' + dateStr + '"]');
            if (sumCell) {
              let perDay = 0;
              loadItems().forEach(it => {
                const g = (loadGrid(ym)[it.n]) || {};
                const st = g[dateStr];
                if (st === 'done' || st === 'partial') perDay++;
              });
              sumCell.textContent = perDay || '';
            }
            const rowCount = cell.closest('tr').querySelector('.ck-count');
            if (rowCount) {
              const c = countItemInMonth(item, ym);
              rowCount.innerHTML = `<span class="ck-done-n">${c.done}</span>${c.partial ? `<span class="ck-part-n"> ◑${c.partial}</span>` : ''}`;
            }
          };
        });
      }

      function bindNote() {
        const saveBtn = body.querySelector('#ckSaveNote');
        if (saveBtn) saveBtn.onclick = () => {
          const ta = body.querySelector('#ckNote');
          if (!ta) return;
          const today = new Date();
          const ym = ymOf(today.getFullYear(), today.getMonth() + 1);
          const ds = ymdOf(today.getFullYear(), today.getMonth() + 1, today.getDate());
          const notes = loadNotes(ym);
          notes[ds] = ta.value;
          Storage.set(noteKey(ym), notes);
          toast('已保存今日记录');
        };
      }

      function bindToday() {
        const mng = body.querySelector('#ckMngItems');
        if (mng) mng.onclick = () => { itemsEditMode = true; renderTab(); };

        const saveItemsBtn = body.querySelector('#ckSaveItems');
        if (saveItemsBtn) saveItemsBtn.onclick = () => {
          const items = loadItems();
          body.querySelectorAll('.ck-item-name').forEach(inp => { const i = Number(inp.dataset.idx); if (items[i]) items[i].name = inp.value.trim() || items[i].name; });
          body.querySelectorAll('.ck-item-rule').forEach(inp => { const i = Number(inp.dataset.idx); if (items[i]) items[i].rule = inp.value.trim(); });
          saveItems(items);
          itemsEditMode = false;
          toast('已保存打卡项目');
          renderTab();
        };

        const addBtn = body.querySelector('#ckAddItem');
        if (addBtn) addBtn.onclick = () => {
          const items = loadItems();
          const maxN = items.reduce((a, b) => Math.max(a, b.n), 0);
          items.push({ n: maxN + 1, name: '新打卡项', rule: '自定义规则' });
          saveItems(items);
          renderTab();
        };

        body.querySelectorAll('.ck-del-item').forEach(btn => {
          btn.onclick = async () => {
            if (!await confirmDialog({ title: '删除打卡项', message: '确定删除该项？已勾选的打卡记录会一并清除', confirmText: '删除', danger: true })) return;
            const idx = Number(btn.dataset.idx);
            const items = loadItems();
            const it = items[idx];
            items.splice(idx, 1);
            saveItems(items);
            if (it) {
              // 清理所有月份的该项打卡记录
              const allYm = new Set([ymOf(new Date().getFullYear(), new Date().getMonth() + 1)]);
              allYm.add(curYM);
              allYm.forEach(ym => { const grid = loadGrid(ym); if (grid[it.n]) { delete grid[it.n]; Storage.set(gridKey(ym), grid); } });
            }
            renderTab();
          };
        });
      }

      renderTab();
    },
  });
}
