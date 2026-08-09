// monthly-checkin.js — 月度每日打卡表（独立菜单）
// 包含：总体目标 / 阅读目标 / 年度目标 / 每日打卡（可勾选的月度表格，按月份复用）
import { registerStandalone } from '../../registry.js';
import { Storage } from '../../storage.js';
import { toast, escapeHtml } from '../../ui.js';

// 打卡清单图标
const checkinIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>';

// 固定打卡项目（按序号，含执行规则）—— 长期固定，不做可编辑
const ITEMS = [
  { n: 1, name: '晚间备考学习≥2h', rule: '工作日固定学习；10.11-10.24 软考冲刺期拆分为 1h 公考 + 1h 软考；周四加班可豁免当日此项' },
  { n: 2, name: '上班碎片学软考', rule: '仅工作日工位碎片化完成，晚间不占用备考时间' },
  { n: 3, name: '运动燃脂≥30min', rule: '工作日居家低强度有氧，周末可延长时长减脂' },
  { n: 4, name: '泡脚', rule: '每日必做，消水肿改善睡眠' },
  { n: 5, name: '早睡23:20前放下手机入睡', rule: '硬性作息要求' },
  { n: 6, name: '日行步数≥5000', rule: '通勤日常累积即可' },
  { n: 7, name: '晚间护肤', rule: '基础护肤外形打理' },
  { n: 8, name: '穿搭/化妆练习', rule: '仅周末打卡，工作日不强制' },
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
    reading: '每月精读 2 本成长 / 专业类书籍，输出读书笔记；碎片时间用听书补足。',
    annual: '上岸：事业编 / 国考 / 省考至少其一录用；\n体态：体脂率降至健康区间，养成运动习惯；\n副业：自媒体跑通最小盈利闭环。',
  });
}
function saveGoals(g) { Storage.set(GOAL_KEY, g); }

function gridKey(ym) { return 'checkin_grid_' + ym; }
function notesKey(ym) { return 'checkin_notes_' + ym; }
function loadGrid(ym) { return Storage.get(gridKey(ym), {}); }
function loadNotes(ym) { return Storage.get(notesKey(ym), {}); }

const WK = ['日', '一', '二', '三', '四', '五', '六'];

export function initMonthlyCheckin() {
  registerStandalone('monthly-checkin', {
    title: '月度打卡表',
    icon: checkinIcon,
    render(container) {
      let tab = 'overall';
      let curYM = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();

      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">月度打卡表</div>
          <div class="page-desc">总体目标 · 阅读目标 · 年度目标 · 每日打卡</div>
        </div>
        <div class="ck-tabs">
          <button class="ck-tab active" data-tab="overall">总体目标</button>
          <button class="ck-tab" data-tab="reading">阅读目标</button>
          <button class="ck-tab" data-tab="annual">年度目标</button>
          <button class="ck-tab" data-tab="table">每日打卡</button>
        </div>
        <div id="ckTabBody"></div>
      `;

      const body = container.querySelector('#ckTabBody');

      function renderTab() {
        if (tab === 'overall') body.innerHTML = renderGoals('overall', '总体目标', '备考主线与关键节点（长期目标总览）');
        else if (tab === 'reading') body.innerHTML = renderGoals('reading', '阅读目标', '每月读书计划与输出要求');
        else if (tab === 'annual') body.innerHTML = renderGoals('annual', '年度目标', '本年度核心成果预期');
        else body.innerHTML = renderTableTab();
        bindTab();
      }

      function renderGoals(key, title, desc) {
        const g = loadGoals();
        return `
          <div class="ck-card">
            <div class="ck-card-title">${title}</div>
            <div class="ck-card-desc">${desc}</div>
            <textarea class="ck-goal-text" id="ckGoalText" placeholder="输入内容…">${escapeHtml(g[key])}</textarea>
            <div style="margin-top:10px;text-align:right">
              <button class="btn btn-primary btn-sm" id="ckGoalSave">保存</button>
            </div>
          </div>`;
      }

      function renderTableTab() {
        const [y, m] = curYM.split('-').map(Number);
        const days = new Date(y, m, 0).getDate();
        const grid = loadGrid(curYM);
        const notes = loadNotes(curYM);

        // 表头日期列（含星期，周末浅绿）
        let headDays = '';
        for (let d = 1; d <= days; d++) {
          const wd = new Date(y, m - 1, d).getDay();
          const wkend = (wd === 0 || wd === 6) ? ' ck-wkend' : '';
          headDays += `<th class="ck-th ck-day${wkend}"><div class="ck-d">${d}</div><div class="ck-w">${WK[wd]}</div></th>`;
        }

        // 数据行
        let rows = '';
        ITEMS.forEach(it => {
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
          rows += `
            <tr>
              <td class="ck-td ck-idx">${it.n}</td>
              <td class="ck-td ck-item" title="${escapeHtml(it.rule)}">${escapeHtml(it.name)}</td>
              ${cells}
              <td class="ck-td ck-count">${doneCount}</td>
              <td class="ck-td ck-sum"><input class="ck-sum-input" data-item="${it.n}" value="${escapeHtml(notes[it.n] || '')}" placeholder="…"></td>
            </tr>`;
        });

        // 底部「每日完成合计」行：每天完成的项数
        let sumCells = '';
        const perDay = {};
        ITEMS.forEach(it => { const ig = grid[it.n] || {}; for (const k in ig) perDay[k] = (perDay[k] || 0) + 1; });
        for (let d = 1; d <= days; d++) {
          const wd = new Date(y, m - 1, d).getDay();
          const wkend = (wd === 0 || wd === 6) ? ' ck-wkend' : '';
          sumCells += `<td class="ck-td ck-sumday${wkend}">${perDay[d] || ''}</td>`;
        }

        return `
          <div class="ck-card">
            <div class="ck-table-nav">
              <button class="btn btn-ghost btn-sm" id="ckPrev">‹ 上月</button>
              <div class="ck-ym">${y} 年 ${m} 月</div>
              <button class="btn btn-ghost btn-sm" id="ckNext">下月 ›</button>
            </div>
          </div>

          <div class="ck-card">
            <div class="ck-card-title">📌 打卡项目与执行规则</div>
            <div class="ck-rules">
              ${ITEMS.map(it => `<div class="ck-rule"><b>${it.n}. ${escapeHtml(it.name)}</b><span>${escapeHtml(it.rule)}</span></div>`).join('')}
            </div>
          </div>

          <div class="ck-card">
            <div class="ck-card-title">🗓 分阶段备注</div>
            <div class="ck-phases">
              ${PHASES.map(p => `<div class="ck-phase"><b>${p.tag}</b> <span class="ck-phase-date">${p.date}</span><div>${escapeHtml(p.text)}</div></div>`).join('')}
            </div>
            <div class="ck-special">
              ${SPECIAL.map(s => `· ${escapeHtml(s)}`).join('<br>')}
            </div>
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
                    <th class="ck-th ck-count">当月<br>完成</th>
                    <th class="ck-th ck-sum">月度总结</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                  <tr class="ck-sumrow">
                    <td class="ck-td ck-idx" colspan="2">每日完成合计</td>
                    ${sumCells}
                    <td class="ck-td ck-count"></td>
                    <td class="ck-td ck-sum"></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="ck-hint">周末列已用浅绿标注；灰色底格子点一下即打勾，数据按月独立保存，可长期复用。月度总结栏可填当月复盘。</div>
          </div>
        `;
      }

      function bindTab() {
        container.querySelectorAll('.ck-tab').forEach(b => {
          b.onclick = () => {
            container.querySelectorAll('.ck-tab').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            tab = b.dataset.tab;
            renderTab();
          };
        });

        if (tab === 'overall' || tab === 'reading' || tab === 'annual') {
          const saveBtn = body.querySelector('#ckGoalSave');
          if (saveBtn) {
            saveBtn.onclick = () => {
              const g = loadGoals();
              g[tab] = body.querySelector('#ckGoalText').value;
              saveGoals(g);
              toast('已保存' + ({ overall: '总体目标', reading: '阅读目标', annual: '年度目标' }[tab]));
            };
          }
        } else {
          bindTable();
        }
      }

      function bindTable() {
        const prev = body.querySelector('#ckPrev');
        const next = body.querySelector('#ckNext');
        if (prev) prev.onclick = () => { shiftMonth(-1); };
        if (next) next.onclick = () => { shiftMonth(1); };

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

        body.querySelectorAll('.ck-sum-input').forEach(inp => {
          inp.oninput = () => {
            const item = Number(inp.dataset.item);
            const notes = loadNotes(curYM);
            notes[item] = inp.value;
            Storage.set(notesKey(curYM), notes);
          };
        });
      }

      function shiftMonth(delta) {
        const [y, m] = curYM.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        curYM = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        renderTab();
      }

      renderTab();
    },
  });
}
