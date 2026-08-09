// monthly-checkin.js — 月度每日打卡表（独立菜单）
// 包含：总览目标(总体+年度) / 月度目标(含月度总结) / 阅读目标 / 每日打卡 / 统计
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
];

const GOAL_KEY = 'checkin_goals';
function loadGoals() {
  return Storage.get(GOAL_KEY, {
    overall: '2026下半年每日打卡表\n主线：宜宾事业编 + 国考 + 四川省考备考｜辅助：减脂塑形 + 副业试水\n关键考试节点：10.24 软考、11 月下旬事业编、11.29 国考、12.06 省考',
    annual: '上岸：事业编 / 国考 / 省考至少其一录用；\n体态：体脂率降至健康区间，养成运动习惯；\n副业：自媒体跑通最小盈利闭环。',
    reading: '每月精读 2 本成长 / 专业类书籍，输出读书笔记；碎片时间用听书补足。',
  });
}
function saveGoals(g) { Storage.set(GOAL_KEY, g); }

const ITEMS_KEY = 'checkin_items';
function loadItems() {
  const v = Storage.get(ITEMS_KEY, null);
  return (Array.isArray(v) && v.length) ? v : DEFAULT_ITEMS.map(x => ({ ...x }));
}
function saveItems(arr) { Storage.set(ITEMS_KEY, arr); }

const MONTHLY_KEY = 'checkin_monthly';
function loadMonthlyAll() { return Storage.get(MONTHLY_KEY, {}); }
function loadMonthly(ym) { const all = loadMonthlyAll(); return all[ym] || { goal: '', summary: '' }; }
function saveMonthly(ym, data) { const all = loadMonthlyAll(); all[ym] = data; Storage.set(MONTHLY_KEY, all); }

function gridKey(ym) { return 'checkin_grid_' + ym; }
function loadGrid(ym) { return Storage.get(gridKey(ym), {}); }

const WK = ['日', '一', '二', '三', '四', '五', '六'];

// 把当月按"周一起始"切分为若干周，用于每周统计
function getWeeks(y, m) {
  const days = new Date(y, m, 0).getDate();
  const map = {};
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, m - 1, d);
    const dow = date.getDay(); // 0 周日 .. 6 周六
    const diff = (dow === 0) ? -6 : (1 - dow); // 回到本周一
    const mon = new Date(y, m - 1, d + diff);
    const key = mon.getFullYear() + '-' + (mon.getMonth() + 1) + '-' + mon.getDate();
    if (!map[key]) map[key] = { start: mon, end: mon, days: [] };
    map[key].days.push(d);
    map[key].end = date;
  }
  return Object.keys(map).sort().map((k, i) => ({ label: '第' + (i + 1) + '周', start: map[k].start, end: map[k].end, days: map[k].days }));
}

export function initMonthlyCheckin() {
  registerStandalone('monthly-checkin', {
    title: '月度打卡表',
    icon: checkinIcon,
    render(container) {
      let tab = 'overview';
      let curYM = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
      let itemsEditMode = false;

      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">月度打卡表</div>
          <div class="page-desc">总览目标 · 月度目标 · 阅读目标 · 每日打卡 · 统计</div>
        </div>
        <div class="ck-tabs">
          <button class="ck-tab active" data-tab="overview">总览目标</button>
          <button class="ck-tab" data-tab="monthly">月度目标</button>
          <button class="ck-tab" data-tab="reading">阅读目标</button>
          <button class="ck-tab" data-tab="table">每日打卡</button>
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
        else if (tab === 'table') body.innerHTML = renderTableTab();
        else body.innerHTML = renderStats();
        bindTab();
      }

      // —— 总览目标：总体目标 + 年度目标 合并一页，各自独立编辑 ——
      function renderOverview() {
        const g = loadGoals();
        return `
          <div class="ck-card">
            <div class="ck-card-head"><div class="ck-card-title">总体目标</div><button class="ck-edit-btn" id="ckEditOverall">✏️ 编辑</button></div>
            <div class="ck-card-desc">备考主线与关键节点（长期目标总览）</div>
            <textarea class="ck-goal-text" id="ckOverall" disabled>${escapeHtml(g.overall)}</textarea>
          </div>
          <div class="ck-card">
            <div class="ck-card-head"><div class="ck-card-title">年度目标</div><button class="ck-edit-btn" id="ckEditAnnual">✏️ 编辑</button></div>
            <div class="ck-card-desc">本年度核心成果预期</div>
            <textarea class="ck-goal-text" id="ckAnnual" disabled>${escapeHtml(g.annual)}</textarea>
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

      // —— 月度目标：月度目标 + 月度总结（按月存储，原表格的月度总结列移到这里）——
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

      // —— 每日打卡：可勾选表格（已移除月度总结列）——
      function renderTableTab() {
        const items = loadItems();
        const [y, m] = curYM.split('-').map(Number);
        const days = new Date(y, m, 0).getDate();
        const grid = loadGrid(curYM);

        let headDays = '';
        for (let d = 1; d <= days; d++) {
          const wd = new Date(y, m - 1, d).getDay();
          const wkend = (wd === 0 || wd === 6) ? ' ck-wkend' : '';
          headDays += `<th class="ck-th ck-day${wkend}"><div class="ck-d">${d}</div><div class="ck-w">${WK[wd]}</div></th>`;
        }

        let rows = '';
        items.forEach(it => {
          const itemGrid = grid[it.n] || {};
          let cells = '';
          let doneCount = 0;
          for (let d = 1; d <= days; d++) {
            const wd = new Date(y, m - 1, d).getDay();
            const wkend = (wd === 0 || wd === 6) ? ' ck-wkend' : '';
            const on = itemGrid[d] ? ' on' : '';
            cells += `<td class="ck-td${wkend}"><button class="ck-cell${on}" data-item="${it.n}" data-day="${d}" title="${escapeHtml(it.name)}"></button></td>`;
            if (itemGrid[d]) doneCount++;
          }
          rows += `<tr>
            <td class="ck-td ck-idx">${it.n}</td>
            <td class="ck-td ck-item" title="${escapeHtml(it.rule)}">${escapeHtml(it.name)}</td>
            ${cells}
            <td class="ck-td ck-count">${doneCount}</td>
          </tr>`;
        });

        let sumCells = '';
        const perDay = {};
        items.forEach(it => { const ig = grid[it.n] || {}; for (const k in ig) perDay[k] = (perDay[k] || 0) + 1; });
        for (let d = 1; d <= days; d++) {
          const wd = new Date(y, m - 1, d).getDay();
          const wkend = (wd === 0 || wd === 6) ? ' ck-wkend' : '';
          sumCells += `<td class="ck-td ck-sumday${wkend}">${perDay[d] || ''}</td>`;
        }

        // 打卡项目管理（可编辑）
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
          ${monthNavHtml()}
          ${rulesHtml}
          <div class="ck-card">
            <div class="ck-card-title">🗓 分阶段备注</div>
            <div class="ck-phases">${PHASES.map(p => `<div class="ck-phase"><b>${p.tag}</b> <span class="ck-phase-date">${p.date}</span><div>${escapeHtml(p.text)}</div></div>`).join('')}</div>
            <div class="ck-special">${SPECIAL.map(s => '· ' + escapeHtml(s)).join('<br>')}</div>
          </div>
          <div class="ck-card">
            <div class="ck-card-title">✅ 每日打卡表（点格子打勾）</div>
            <div class="ck-table-wrap">
              <table class="ck-table">
                <thead>
                  <tr>
                    <th class="ck-th ck-idx">序号</th>
                    <th class="ck-th ck-item">打卡目标</th>
                    ${headDays}
                    <th class="ck-th ck-count">当月完成</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                  <tr class="ck-sumrow">
                    <td class="ck-td ck-idx" colspan="2">每日完成合计</td>
                    ${sumCells}
                    <td class="ck-td ck-count"></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="ck-hint">周末列已用浅绿标注；点格子即打勾，数据按月独立保存，可长期复用。月度总结已移至「月度目标」页。</div>
          </div>`;
      }

      // —— 统计：自动汇总当月 / 每周打卡情况 ——
      function renderStats() {
        const items = loadItems();
        const [y, m] = curYM.split('-').map(Number);
        const days = new Date(y, m, 0).getDate();
        const grid = loadGrid(curYM);
        const weeks = getWeeks(y, m);

        let total = 0;
        const perItem = {};
        items.forEach(it => {
          const ig = grid[it.n] || {};
          let c = 0; for (const k in ig) { c++; total++; }
          perItem[it.n] = c;
        });

        const avg = days ? (total / days).toFixed(1) : '0';
        const coverage = (items.length * days) ? Math.round(total / (items.length * days) * 100) : 0;

        const weekRows = weeks.map(w => {
          let wt = 0;
          items.forEach(it => { const ig = grid[it.n] || {}; w.days.forEach(d => { if (ig[d]) wt++; }); });
          const wavg = w.days.length ? (wt / w.days.length).toFixed(1) : '0';
          const sM = w.start.getMonth() + 1, sD = w.start.getDate(), eM = w.end.getMonth() + 1, eD = w.end.getDate();
          return `<tr><td class="ck-td">${w.label}</td><td class="ck-td">${sM}.${sD} - ${eM}.${eD}</td><td class="ck-td">${wt}</td><td class="ck-td">${wavg}</td></tr>`;
        }).join('');

        const itemRows = items.map(it => `<tr><td class="ck-td ck-idx">${it.n}</td><td class="ck-td ck-item">${escapeHtml(it.name)}</td><td class="ck-td">${perItem[it.n] || 0}</td><td class="ck-td">${days ? Math.round((perItem[it.n] || 0) / days * 100) : 0}%</td></tr>`).join('');

        return `
          ${monthNavHtml()}
          <div class="ck-stats-cards">
            <div class="ck-stat"><div class="ck-stat-num">${total}</div><div class="ck-stat-label">当月总打卡</div></div>
            <div class="ck-stat"><div class="ck-stat-num">${avg}</div><div class="ck-stat-label">日均完成项</div></div>
            <div class="ck-stat"><div class="ck-stat-num">${coverage}%</div><div class="ck-stat-label">打卡覆盖率</div></div>
          </div>
          <div class="ck-card">
            <div class="ck-card-title">📊 每周打卡统计（${curYM}）</div>
            <div class="ck-table-wrap"><table class="ck-table ck-stat-table">
              <thead><tr><th class="ck-th">周次</th><th class="ck-th">日期范围</th><th class="ck-th">完成项</th><th class="ck-th">日均</th></tr></thead>
              <tbody>${weekRows}</tbody>
            </table></div>
          </div>
          <div class="ck-card">
            <div class="ck-card-title">📈 各项目月度完成（${curYM}）</div>
            <div class="ck-table-wrap"><table class="ck-table ck-stat-table">
              <thead><tr><th class="ck-th ck-idx">序号</th><th class="ck-th ck-item">打卡目标</th><th class="ck-th">当月完成(天)</th><th class="ck-th">完成率</th></tr></thead>
              <tbody>${itemRows}</tbody>
            </table></div>
          </div>
          <div class="ck-hint">统计基于「每日打卡」中已勾选的记录自动计算，切换月份可查看不同月份数据。</div>`;
      }

      function bindTab() {
        container.querySelectorAll('.ck-tab').forEach(b => {
          b.onclick = () => {
            container.querySelectorAll('.ck-tab').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            tab = b.dataset.tab;
            itemsEditMode = false;
            renderTab();
          };
        });
        bindMonthNav();

        // 各目标输入框：默认置灰，点「编辑」可改、点「保存」重新置灰
        bindEditable('#ckOverall', '#ckEditOverall', v => { const g = loadGoals(); g.overall = v; saveGoals(g); }, '总体目标');
        bindEditable('#ckAnnual', '#ckEditAnnual', v => { const g = loadGoals(); g.annual = v; saveGoals(g); }, '年度目标');
        bindEditable('#ckReading', '#ckEditReading', v => { const g = loadGoals(); g.reading = v; saveGoals(g); }, '阅读目标');
        bindEditable('#ckMGoal', '#ckEditMGoal', v => { const mm = loadMonthly(curYM); mm.goal = v; saveMonthly(curYM, mm); }, '月度目标');
        bindEditable('#ckMSum', '#ckEditMSum', v => { const mm = loadMonthly(curYM); mm.summary = v; saveMonthly(curYM, mm); }, '月度总结');

        if (tab === 'table') bindTable();
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
          curYM = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          renderTab();
        };
        if (prev) prev.onclick = () => shift(-1);
        if (next) next.onclick = () => shift(1);
      }

      function bindTable() {
        body.querySelectorAll('.ck-cell').forEach(cell => {
          cell.onclick = () => {
            const item = Number(cell.dataset.item);
            const day = Number(cell.dataset.day);
            const grid = loadGrid(curYM);
            if (!grid[item]) grid[item] = {};
            if (grid[item][day]) delete grid[item][day];
            else grid[item][day] = 1;
            Storage.set(gridKey(curYM), grid);
            renderTab();
          };
        });

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
            const grid = loadGrid(curYM);
            if (it && grid[it.n]) { delete grid[it.n]; Storage.set(gridKey(curYM), grid); }
            renderTab();
          };
        });
      }

      renderTab();
    },
  });
}
