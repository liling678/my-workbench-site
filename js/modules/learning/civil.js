// civil.js — 杂七杂八的学习 · 为人民服务（在职考公 备考教练）
import { registerModule } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const META_KEY = 'civil_meta';
const CHECKIN_KEY = 'civil_checkins';      // { 'YYYY-MM-DD': { hours, questions, mocks, content, weak } }
const WRONG_KEY = 'civil_wrong';           // [ {id, subject, point, question, myWrong, correct, createdAt} ]
const MOCK_KEY = 'civil_mocks';            // [ {id, type, score, full, date, note} ]
const REVIEW_KEY = 'civil_reviews';        // { 'YYYY-MM-DD'(weekStart): { mastery, weak, nextPlan, stats, createdAt } }
const CHAPTERS_KEY = 'civil_chapters';     // 完成章节（自由文本）
const POINTS_DONE_KEY = 'civil_points_done'; // { '知识点名': true } 已掌握
const BOOKS_DONE_KEY = 'civil_books_done';   // { '书名': true } 已读完

const EXAM_DEFAULT = '2026-11-29';          // 主目标：国考
// 关键考试节点（倒计时显示最近的未过期节点）
const DEFAULT_NODES = [
  { name: '宜宾事业编', date: '2026-11-22' },
  { name: '国考', date: '2026-11-29' },
  { name: '四川省考', date: '2026-12-06' },
];
const TARGETS_DEFAULT = { line: 70, apply: 70 }; // 行测 / 申论 目标分（百分制）

// 三阶段规划（在职 12 周）
const PHASES = [
  {
    key: 'base', name: '第一阶段 · 基础建体系', start: '2026-08-10', end: '2026-09-13',
    focus: '行测系统学言语、判断、资料三大提分模块（数量/常识先打底）；申论学归纳概括、综合分析、提出对策答题结构，每周精改 2 道小题。工作日约 2h、周末约 3–4h。',
  },
  {
    key: 'strong', name: '第二阶段 · 专项提速', start: '2026-09-14', end: '2026-10-31',
    focus: '行测按模块计时刷题并建立取舍顺序；每日整理错因（知识盲点/审题/速度/计算）；申论每周 1 套小题 + 1 篇大作文，练材料提炼与规范表达。每周日复盘并向短板倾斜。',
  },
  {
    key: 'sprint', name: '第三阶段 · 套卷冲刺', start: '2026-11-01', end: '2026-11-28',
    focus: '每周 ≥2 套行测 + 1 套申论，严格按真实考试时间；行测形成固定做题顺序与放弃策略；申论沉淀 5–8 个高质量主题素材与自己的开头/过渡/结尾。考前一周回归错题与时政。',
  },
];

const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 知识点图谱（行测 / 申论 / 时政，标注重要星级 ★ 与建议阶段）
// phase: base=基础期 / strong=强化期 / sprint=冲刺期
const KNOWLEDGE = [
  { module: '一、行测 · 言语理解与表达', points: [
    { name: '逻辑填空（实词 / 成语辨析）', star: 5, phase: 'base' },
    { name: '片段阅读（主旨 / 意图 / 细节）', star: 5, phase: 'base' },
    { name: '语句表达（排序 / 衔接 / 病句）', star: 4, phase: 'base' },
  ] },
  { module: '二、行测 · 判断推理', points: [
    { name: '图形推理（规律识别）', star: 5, phase: 'base' },
    { name: '定义判断（要件匹配）', star: 5, phase: 'base' },
    { name: '类比推理（逻辑关系）', star: 4, phase: 'base' },
    { name: '逻辑判断（翻译 / 削弱加强）', star: 5, phase: 'strong' },
  ] },
  { module: '三、行测 · 资料分析', points: [
    { name: '速算技巧（截位 / 直除 / 差分）', star: 5, phase: 'base' },
    { name: '增长率 / 比重 / 倍数', star: 5, phase: 'base' },
    { name: '平均数与综合判断题', star: 4, phase: 'strong' },
  ] },
  { module: '四、行测 · 数量关系', points: [
    { name: '高频题型（工程 / 行程 / 概率 / 容斥）', star: 4, phase: 'base' },
    { name: '代入排除与赋值法', star: 3, phase: 'strong' },
  ] },
  { module: '五、行测 · 常识判断 + 时政', points: [
    { name: '法律基础（宪法 / 民法 / 行政）', star: 4, phase: 'base' },
    { name: '时政与国情热点', star: 5, phase: 'strong' },
    { name: '经济 / 科技 / 文史常识', star: 3, phase: 'base' },
  ] },
  { module: '六、申论', points: [
    { name: '归纳概括题', star: 5, phase: 'base' },
    { name: '综合分析题', star: 5, phase: 'strong' },
    { name: '提出对策题', star: 5, phase: 'strong' },
    { name: '应用文写作（公文 / 讲话稿）', star: 5, phase: 'strong' },
    { name: '大作文（议论文立意与结构）', star: 5, phase: 'strong' },
  ] },
];

// 阅读书单（按阶段规划）
const BOOKS = [
  { name: '《行测教材》（言语 / 判断 / 资料 / 数量分册）', phase: 'base', note: '通读建立题型体系，配思维导图' },
  { name: '《申论教材 + 范文精析》', phase: 'base', note: '学答题结构，每周精改 2 小题' },
  { name: '历年真题详解（国考 / 省考 / 事业编）', phase: 'strong', note: '计时刷题，错题归档' },
  { name: '行测模考卷 / 预测卷', phase: 'strong', note: '每周 ≥2 套，严格限时' },
  { name: '申论热点范文与规范表达', phase: 'strong', note: '沉淀 5–8 个主题素材' },
  { name: '时政热点手册 + 常识积累本', phase: 'sprint', note: '考前一周每天翻，只背不学新' },
  { name: '自己的错题本（随时）', phase: 'base', note: '当天错当天清，周末二刷' },
];

const PHASE_TAG = { base: '基础期', strong: '强化期', sprint: '冲刺期' };

// ===================== 数据读写 =====================
function loadMeta() {
  const d = Storage.get(META_KEY, { startDate: todayStr(), examDate: EXAM_DEFAULT, nodes: DEFAULT_NODES, targets: { ...TARGETS_DEFAULT } });
  if (!d.nodes || !d.nodes.length) d.nodes = DEFAULT_NODES;
  if (!d.targets) d.targets = { ...TARGETS_DEFAULT };
  return d;
}
function saveMeta(d) { Storage.set(META_KEY, d); }
function loadCheckins() { return Storage.get(CHECKIN_KEY, {}); }
function saveCheckins(d) { Storage.set(CHECKIN_KEY, d); }
function loadWrong() { return Storage.get(WRONG_KEY, []); }
function saveWrong(d) { Storage.set(WRONG_KEY, d); }
function loadMocks() { return Storage.get(MOCK_KEY, []); }
function saveMocks(d) { Storage.set(MOCK_KEY, d); }
function loadReviews() { return Storage.get(REVIEW_KEY, {}); }
function saveReviews(d) { Storage.set(REVIEW_KEY, d); }
function loadChapters() { return Storage.get(CHAPTERS_KEY, ''); }
function saveChapters(s) { Storage.set(CHAPTERS_KEY, s); }
function loadPointsDone() { return Storage.get(POINTS_DONE_KEY, {}); }
function savePointsDone(d) { Storage.set(POINTS_DONE_KEY, d); }
function loadBooksDone() { return Storage.get(BOOKS_DONE_KEY, {}); }
function saveBooksDone(d) { Storage.set(BOOKS_DONE_KEY, d); }
function starStr(n) {
  n = Math.max(0, Math.min(5, Number(n) || 0));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
}
function allPoints() {
  const arr = [];
  KNOWLEDGE.forEach(m => m.points.forEach(p => arr.push(p)));
  return arr;
}

// ===================== 工具 =====================
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function daysBetween(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00');
  return Math.round(ms / 86400000);
}
function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function getPhase(dateStr) {
  if (!dateStr || dateStr < PHASES[0].start) return null;
  for (const p of PHASES) if (dateStr >= p.start && dateStr <= p.end) return p;
  if (dateStr <= loadMeta().examDate) return { key: 'exam', name: '冲刺 / 考试期', start: PHASES[PHASES.length - 1].end, end: loadMeta().examDate, focus: '决战期或考后复盘。' };
  return { key: 'exam', name: '考试期已过', start: '', end: '', focus: '考后复盘与下一场准备。' };
}
function weekMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const off = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - off);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
// 倒计时到最近的关键节点（nodes 中第一个 >= 今天的）；否则用主考试日
function nextNode(meta, today) {
  const list = (meta.nodes || []).filter(n => n.date >= today).sort((a, b) => a.date < b.date ? -1 : 1);
  if (list.length) return list[0];
  return { name: '主考试日', date: meta.examDate };
}

// ===================== 注册 =====================
export function initCivil() {
  registerModule('learning-civil-service', {
    section: 'learning',
    title: '为人民服务',
    icon: '🏛',
    render(container) { renderCivil(container); }
  });
}

let cvTab = 'board';

function renderCivil(container) {
  const TABS = [
    { id: 'board', name: '备考看板' },
    { id: 'plan', name: '计划目标' },
    { id: 'checkin', name: '每日复盘' },
    { id: 'wrong', name: '错题库' },
    { id: 'review', name: '复盘·通过率' },
  ];
  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">为人民服务 · 在职考公</div>
      <div class="page-desc">国考 / 省考 / 事业编 多线备考教练：规划 / 监督 / 模考 / 申论 / 复盘</div>
    </div>
    <div class="tabs">
      ${TABS.map(t => `<div class="tab ${t.id === cvTab ? 'active' : ''}" data-tab="${t.id}">${t.name}</div>`).join('')}
    </div>
    <div id="cvBody"></div>
  `;
  container.querySelectorAll('.tab').forEach(el => {
    el.onclick = () => {
      cvTab = el.dataset.tab;
      container.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === cvTab));
      renderBody(container);
    };
  });
  renderBody(container);
}

function renderBody(container) {
  const body = container.querySelector('#cvBody');
  if (cvTab === 'board') renderBoard(body);
  else if (cvTab === 'plan') renderPlan(body);
  else if (cvTab === 'checkin') renderCheckin(body);
  else if (cvTab === 'wrong') renderWrong(body);
  else renderReview(body);
}

// ===================== 备考看板 =====================
function renderBoard(body) {
  const meta = loadMeta();
  const today = todayStr();
  const node = nextNode(meta, today);
  const toExam = daysBetween(today, node.date);
  const fromStart = daysBetween(meta.startDate, today);
  const ph = getPhase(today);
  const pass = computePass();

  // 累计统计
  const ck = loadCheckins();
  let studyDays = 0, totalHours = 0, totalQuestions = 0, totalMocks = 0;
  Object.values(ck).forEach(c => {
    if (c && (c.hours > 0 || c.questions > 0 || c.mocks > 0 || c.content)) {
      studyDays++;
      totalHours += Number(c.hours) || 0;
      totalQuestions += Number(c.questions) || 0;
      totalMocks += Number(c.mocks) || 0;
    }
  });
  const mocksDone = loadMocks().length;

  // 教练今日提醒
  const wd = new Date().getDay();
  const wdName = WEEK_DAYS[wd];
  const evening = { 1: '言语 / 判断专项', 2: '资料分析速算', 3: '申论小题精改', 4: '判断 + 数量混合', 5: '错题整理 + 时政' };
  let coach = '';
  if (ph && ph.key !== 'exam') {
    const focus = (wd === 0 || wd === 6) ? '上午学新知 / 下午套题 / 晚上复盘' : `上午复习 · 碎片刷题 · 晚上【${evening[wd] || '综合复盘'}】`;
    coach = `教练提醒：今天是${wdName}，${ph.name.split(' · ')[1] || ph.name}。今日重点 → ${focus}。`;
  } else if (ph && ph.key === 'exam') {
    coach = '教练提醒：进入考试期，按节点模考 + 回归错题，调整状态轻装应考！';
  } else {
    coach = '教练提醒：备考尚未开始（8-10 起），先把整体规划过一遍，准备好资料。';
  }
  const todayCk = ck[today];
  if (ph && ph.key !== 'exam' && !todayCk) coach += ' 今天还没打卡，记得学完来「每日复盘」记一笔。';

  // 知识点完成态 / 阶段统计 / 今日聚焦
  const done = loadPointsDone();
  const bdone = loadBooksDone();
  const allP = allPoints();
  const phaseCount = { base: 0, strong: 0, sprint: 0 };
  allP.forEach(p => { if (phaseCount[p.phase] !== undefined) phaseCount[p.phase]++; });
  const doneCount = allP.filter(p => done[p.name]).length;
  const focusKey = ph ? (ph.key === 'exam' ? 'sprint' : ph.key) : 'base';
  let todayPoints = allP.filter(p => p.phase === focusKey && !done[p.name]);
  const hiddenCount = Math.max(0, todayPoints.length - 8);
  todayPoints = todayPoints.slice(0, 8);

  const phaseSteps = PHASES.map(p => {
    const state = ph && (p.key === ph.key) ? 'on' : (today > p.end ? 'done' : '');
    return `<div class="rk-phase ${state}">
      <div class="rk-phase-dot"></div>
      <div class="rk-phase-name">${escapeHtml(p.name)}</div>
      <div class="rk-phase-date">${p.start.slice(5)} ~ ${p.end.slice(5)}</div>
    </div>`;
  }).join('');

  const nodeList = (meta.nodes || []).map(n => {
    const d = daysBetween(today, n.date);
    const cls = d !== null && d <= 30 ? 'near' : '';
    return `<div class="rk-node ${cls}"><span class="rk-node-name">${escapeHtml(n.name)}</span><span class="rk-node-date">${n.date.slice(5)}</span><span class="rk-node-dd">${d !== null ? (d >= 0 ? d + '天' : '已过') : '—'}</span></div>`;
  }).join('');

  body.innerHTML = `
    <div class="rk-countdown ${toExam !== null && toExam <= 30 ? 'rk-countdown-near' : ''}">
      <div class="rk-countdown-num">${toExam !== null ? (toExam >= 0 ? toExam : '已过') : '—'}</div>
      <div class="rk-countdown-label">距 ${escapeHtml(node.name)} · ${node.date}（天）</div>
    </div>

    <div class="rk-coach">🤖 ${escapeHtml(coach)}</div>

    <div class="rk-targets">
      <div class="rk-target"><div class="rk-target-num">≥${meta.targets.line}</div><div class="rk-target-label">行测目标</div></div>
      <div class="rk-target"><div class="rk-target-num">≥${meta.targets.apply}</div><div class="rk-target-label">申论目标</div></div>
      <div class="rk-target"><div class="rk-target-num">${mocksDone}</div><div class="rk-target-label">模考次数</div></div>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">📍 当前阶段</div>
      <div class="rk-phases">${phaseSteps}</div>
      <div class="rk-phase-focus">${ph ? escapeHtml(ph.focus) : '备考尚未开始。'}</div>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">🗓 关键考试节点</div>
      <div class="rk-nodes">${nodeList}</div>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">📚 总体计划 · 知识点图谱（按阶段规划）</div>
      <div class="rk-kmap-summary">
        <span>基础期 <b>${phaseCount.base}</b></span>
        <span>强化期 <b>${phaseCount.strong}</b></span>
        <span>冲刺期 <b>${phaseCount.sprint}</b></span>
        <span>已掌握 <b>${doneCount}/${allP.length}</b></span>
      </div>
      ${KNOWLEDGE.map(mod => `
        <div class="rk-kmap-module">${escapeHtml(mod.module)}</div>
        ${mod.points.map(p => `
          <label class="rk-kpoint ${done[p.name] ? 'done' : ''}">
            <input type="checkbox" class="rk-kcb" data-k="${escapeAttr(p.name)}" ${done[p.name] ? 'checked' : ''}>
            <span class="rk-kname">${escapeHtml(p.name)}</span>
            <span class="rk-star" title="重要度">${starStr(p.star)}</span>
            <span class="rk-phase-tag rk-pt-${p.phase}">${PHASE_TAG[p.phase]}</span>
          </label>`).join('')}
      `).join('')}
    </div>

    <div class="rk-card">
      <div class="rk-card-head">📖 阅读计划（按阶段）</div>
      <div class="rk-card-desc">结合知识点图谱，按阶段安排教材 / 真题 / 模考 / 时政资料。</div>
      <div class="rk-book-list">
        ${BOOKS.map(b => `
          <label class="rk-book ${bdone[b.name] ? 'done' : ''}">
            <input type="checkbox" class="rk-bcb" data-b="${escapeAttr(b.name)}" ${bdone[b.name] ? 'checked' : ''}>
            <div class="rk-book-main">
              <div class="rk-book-name">${escapeHtml(b.name)}</div>
              <div class="rk-book-note">${escapeHtml(b.note)}</div>
            </div>
            <span class="rk-phase-tag rk-pt-${b.phase}">${PHASE_TAG[b.phase]}</span>
          </label>`).join('')}
      </div>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">🎯 每日计划 · 今日知识点聚焦</div>
      <div class="rk-card-desc">基于当前阶段，从「总体计划」自动挑选尚未掌握的知识点作为今天主攻；点 ✅ 即标记已攻克。</div>
      ${todayPoints.length ? todayPoints.map(p => `
        <label class="rk-kpoint ${done[p.name] ? 'done' : ''}">
          <input type="checkbox" class="rk-kcb" data-k="${escapeAttr(p.name)}" ${done[p.name] ? 'checked' : ''}>
          <span class="rk-kname">${escapeHtml(p.name)}</span>
          <span class="rk-star">${starStr(p.star)}</span>
        </label>`).join('') + (hiddenCount ? `<div class="rk-kmap-more">…还有 ${hiddenCount} 个未掌握知识点，见上方「总体计划」</div>` : '') : `<div class="rk-empty">当前阶段的知识点已全部标记完成 🎉，去刷真题 / 模考巩固吧。</div>`}
      <button class="btn btn-primary" id="cvBoardPlan" style="margin-top:10px">📋 制定计划目标</button>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">📊 累计数据（本地）</div>
      <div class="rk-stats">
        <div class="rk-stat"><div class="rk-stat-num">${studyDays}</div><div class="rk-stat-label">累计学习天数</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalHours.toFixed(1)}</div><div class="rk-stat-label">累计时长(h)</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalQuestions}</div><div class="rk-stat-label">刷题总数</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalMocks}</div><div class="rk-stat-label">模考套数</div></div>
      </div>
    </div>

    <div class="rk-card">
      <div id="cvMockHost"></div>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">⏱ 考试日期 / 开始日期</div>
      <div class="rk-meta-row">
        <label class="rk-meta-field">开始日期<input type="date" class="input" id="cv_start" value="${escapeAttr(meta.startDate)}"></label>
        <label class="rk-meta-field">主考试日<input type="date" class="input" id="cv_exam" value="${escapeAttr(meta.examDate)}"></label>
      </div>
      <div class="rk-meta-hint">关键节点（事业编 / 国考 / 省考）可在下方「🗓 关键考试节点」卡片调整；已备考 ${fromStart !== null ? Math.max(fromStart, 0) : 0} 天${toExam !== null && toExam >= 0 ? `，距最近节点 ${toExam} 天` : ''}。</div>
      <div class="rk-form" style="margin-top:10px">
        <label class="rk-form-field">编辑关键节点（每行：名称,日期 YYYY-MM-DD）
          <textarea class="textarea" id="cv_nodes" style="min-height:80px" placeholder="宜宾事业编,2026-11-22&#10;国考,2026-11-29&#10;四川省考,2026-12-06">${(meta.nodes || []).map(n => `${n.name},${n.date}`).join('\n')}</textarea></label>
        <button class="btn" id="cv_nodes_save">保存节点</button>
      </div>
    </div>

    <details class="rk-coach-desc">
      <summary>📖 教练说明（点击展开）</summary>
      <div class="rk-coach-desc-body">
        你是「在职考公（国考 / 省考 / 事业编）备考教练」。一切以<b>提高上岸概率</b>为目标，优先级：<b>行测三大模块（言语 / 判断 / 资料）＞ 申论小题 ＞ 数量 / 常识 ＞ 冷门</b>。
        采用真题与模考驱动：学理论 → 计时刷题 → 当天归档错题 → 周末二刷。在职备考，计划现实可执行，先正确再提速，每周保留半天休息。
        每天推动你完成任务，最终多线通关。
      </div>
    </details>
  `;

  body.querySelector('#cv_start').onchange = (e) => { const m = loadMeta(); m.startDate = e.target.value; saveMeta(m); renderBoard(body); };
  body.querySelector('#cv_exam').onchange = (e) => { const m = loadMeta(); m.examDate = e.target.value; saveMeta(m); renderBoard(body); };
  body.querySelector('#cv_nodes_save').onclick = () => {
    const raw = body.querySelector('#cv_nodes').value.trim();
    const nodes = raw.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
      const [name, date] = line.split(',').map(x => x.trim());
      return { name: name || '考试', date: date || '' };
    }).filter(n => n.date);
    const m = loadMeta(); m.nodes = nodes; saveMeta(m);
    toast('关键节点已保存'); renderBoard(body);
  };

  body.querySelectorAll('.rk-kcb').forEach(cb => {
    cb.onchange = () => {
      const d = loadPointsDone();
      if (cb.checked) d[cb.dataset.k] = true; else delete d[cb.dataset.k];
      savePointsDone(d);
      renderBoard(body);
    };
  });
  body.querySelectorAll('.rk-bcb').forEach(cb => {
    cb.onchange = () => {
      const d = loadBooksDone();
      if (cb.checked) d[cb.dataset.b] = true; else delete d[cb.dataset.b];
      saveBooksDone(d);
      renderBoard(body);
    };
  });
  const boardPlanBtn = body.querySelector('#cvBoardPlan');
  if (boardPlanBtn) boardPlanBtn.onclick = () => {
    cvTab = 'plan';
    const ctn = body.parentElement;
    ctn.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === cvTab));
    renderBody(ctn);
  };

  const mockHost = body.querySelector('#cvMockHost');
  if (mockHost) renderMockInto(mockHost);
}

// ===================== 今日计划生成 =====================
// ===================== 计划目标（总体/月度/周/每日，智能+手动） =====================
function loadPlan() { return Storage.get('civil_plan', { overall: '', monthly: {}, weekly: {}, daily: {}, budget: 2 }); }
function savePlan(d) { Storage.set('civil_plan', d); }

function buildPlanCtx() {
  const meta = loadMeta();
  const today = todayStr();
  const ph = getPhase(today);
  const done = loadPointsDone();
  const allP = allPoints();
  const undone = allP.filter(p => !done[p.name]);
  const ck = loadCheckins();
  const weakList = [];
  Object.keys(ck).sort().reverse().slice(0, 14).forEach(d => { if (ck[d] && ck[d].weak) weakList.push(ck[d].weak); });
  let studyDays = 0, totalHours = 0, totalQuestions = 0;
  Object.values(ck).forEach(c => {
    if (c && (c.hours > 0 || c.questions > 0 || c.mocks > 0 || c.content)) {
      studyDays++; totalHours += Number(c.hours) || 0; totalQuestions += Number(c.questions) || 0;
    }
  });
  const mocksDone = loadMocks().length;
  const daysToExam = daysBetween(today, meta.examDate);
  return { meta, ph, allP, done, undone, weakList, studyDays, totalHours, totalQuestions, mocksDone, daysToExam, today };
}

function phaseNameOf(ph) { return ph ? (ph.name.split(' · ')[1] || ph.name) : '备考前'; }

function renderPlan(body) {
  const today = todayStr();
  const plan = loadPlan();
  const ym = today.slice(0, 7);
  const wkStart = weekMonday(today);
  const ctx = buildPlanCtx();

  body.innerHTML = `
    <div class="rk-card">
      <div class="rk-card-head">🎯 总体目标（可编辑）</div>
      <div class="rk-card-desc">整个备考季的大目标。点「🤖 生成」按当前数据起草，再手动微调。</div>
      <textarea class="textarea" id="pl_overall" style="min-height:104px" placeholder="点🤖生成或自行填写">${escapeHtml(plan.overall || '')}</textarea>
      <button class="btn btn-primary" id="pl_gen_overall" style="margin-top:6px">🤖 智能生成</button>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">🗓 月度目标 · ${ym}（可编辑）</div>
      <div class="rk-card-desc">本月主攻方向与阶段任务。</div>
      <textarea class="textarea" id="pl_monthly" style="min-height:88px" placeholder="点🤖生成或自行填写">${escapeHtml((plan.monthly && plan.monthly[ym]) || '')}</textarea>
      <button class="btn" id="pl_gen_monthly" style="margin-top:6px">🤖 智能生成</button>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">📅 周目标 · ${wkStart} 起本周（可编辑）</div>
      <div class="rk-card-desc">本周要攻克的考点与产出。</div>
      <textarea class="textarea" id="pl_weekly" style="min-height:88px" placeholder="点🤖生成或自行填写">${escapeHtml((plan.weekly && plan.weekly[wkStart]) || '')}</textarea>
      <button class="btn" id="pl_gen_weekly" style="margin-top:6px">🤖 智能生成</button>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">⚡ 每日目标 · ${today}（可编辑）</div>
      <div class="rk-card-desc">按你的掌握度 / 薄弱点 / 阶段 / 剩余天数智能生成，默认 ${plan.budget || 2}h，可改时长后重新生成。</div>
      <div class="rk-form-row">
        <label class="rk-form-field">每日学习时长(h)
          <input class="input" id="pl_budget" type="number" min="0.5" step="0.5" value="${escapeAttr(plan.budget || 2)}"></label>
      </div>
      <textarea class="textarea" id="pl_daily" style="min-height:154px" placeholder="点🤖生成或自行填写">${escapeHtml((plan.daily && plan.daily[today] && plan.daily[today].text) || '')}</textarea>
      <button class="btn btn-primary" id="pl_gen_daily" style="margin-top:6px">🤖 智能生成（按学习情况）</button>
    </div>

    <div class="rk-card rk-plan-tip">
      💡 所有目标都可直接在文本框里改，改完自动保存（无需点按钮）；「🤖 智能生成」会依据掌握进度 / 薄弱点 / 阶段 / 距考试天数给出建议，生成后仍可手动微调。
    </div>
  `;

  const bind = (id, apply) => {
    const el = body.querySelector('#' + id);
    if (el) el.oninput = () => { const p = loadPlan(); apply(p, el.value); savePlan(p); };
  };
  bind('pl_overall', (p, v) => p.overall = v);
  bind('pl_monthly', (p, v) => { p.monthly = p.monthly || {}; p.monthly[ym] = v; });
  bind('pl_weekly', (p, v) => { p.weekly = p.weekly || {}; p.weekly[wkStart] = v; });
  bind('pl_daily', (p, v) => { p.daily = p.daily || {}; p.daily[today] = p.daily[today] || {}; p.daily[today].text = v; });
  const bud = body.querySelector('#pl_budget');
  if (bud) bud.oninput = () => { const p = loadPlan(); p.budget = Number(bud.value) || 2; savePlan(p); };

  body.querySelector('#pl_gen_overall').onclick = () => { const p = loadPlan(); const t = suggestOverall(ctx); p.overall = t; savePlan(p); body.querySelector('#pl_overall').value = t; toast('已生成总体目标'); };
  body.querySelector('#pl_gen_monthly').onclick = () => { const p = loadPlan(); const t = suggestMonthly(ctx, ym); p.monthly = p.monthly || {}; p.monthly[ym] = t; savePlan(p); body.querySelector('#pl_monthly').value = t; toast('已生成月度目标'); };
  body.querySelector('#pl_gen_weekly').onclick = () => { const p = loadPlan(); const t = suggestWeekly(ctx, wkStart); p.weekly = p.weekly || {}; p.weekly[wkStart] = t; savePlan(p); body.querySelector('#pl_weekly').value = t; toast('已生成周目标'); };
  body.querySelector('#pl_gen_daily').onclick = () => { const p = loadPlan(); const b = p.budget || 2; const t = suggestDaily(ctx, today, b); p.daily = p.daily || {}; p.daily[today] = p.daily[today] || {}; p.daily[today].text = t; p.daily[today].time = b; savePlan(p); body.querySelector('#pl_daily').value = t; toast('已生成每日目标'); };
}

function suggestOverall(ctx) {
  const t = ctx.meta.targets;
  const tot = ctx.allP.length, doneN = tot - ctx.undone.length;
  const L = [];
  L.push(`【总体目标】${ctx.meta.examDate}（国考）多线一次上岸，日均约 2h。`);
  L.push(`· 行测 ≥${t.line} · 申论 ≥${t.apply}（百分制）。`);
  L.push(`· 掌握全部 ${tot} 个知识点（已 ${doneN} / ${tot}）。`);
  L.push(`· 刷题累计 ≥800 题（已 ${ctx.totalQuestions}）。`);
  L.push(`· 考前完成 ≥8 套模考（已 ${ctx.mocksDone}）。`);
  L.push(`· 每周保持 5–6 天，工作日 2h、周末 3–4h，每周留半天休息。`);
  return L.join('\n');
}

function suggestMonthly(ctx, ym) {
  const rep = ym + '-15';
  const ph = getPhase(rep);
  const phName = phaseNameOf(ph);
  let pts = ph ? ctx.undone.filter(p => p.phase === ph.key) : ctx.undone;
  const names = [...new Set(pts.map(p => p.name))];
  const tot = ctx.allP.length, doneN = tot - ctx.undone.length;
  const L = [];
  L.push(`【${ym} 月度目标 · ${phName}】`);
  L.push(`· 阶段进度：知识点已掌握 ${doneN}/${tot}，本月继续推进未掌握项。`);
  if (names.length) L.push(`· 本月光攻：${names.slice(0, 8).join('、')}${names.length > 8 ? ' 等' : ''}。`);
  else L.push(`· 本月以刷真题 / 模考为主，巩固已掌握模块。`);
  L.push(`· 配套完成本阶段书单（教材 / 真题 / 模考 / 时政）。`);
  L.push(`· 每周 ≥2 套模考（严格计时），申论每周 1 套小题 + 1 篇大作文。`);
  return L.join('\n');
}

function suggestWeekly(ctx, wkStart) {
  const ph = getPhase(wkStart);
  const phName = phaseNameOf(ph);
  const fk = ph ? (ph.key === 'exam' ? 'sprint' : ph.key) : 'base';
  let pts = ctx.undone.filter(p => p.phase === fk).slice(0, 5);
  if (pts.length < 5) pts = ctx.undone.slice(0, 5);
  const L = [];
  L.push(`【本周目标 · ${wkStart} 起 · ${phName}】`);
  if (pts.length) L.push(`· 攻克考点：${pts.map(p => p.name).join('、')}。`);
  else L.push(`· 考点已全部掌握，本周转刷真题 / 模考巩固。`);
  if (ctx.weakList.length) L.push(`· 薄弱专项：${ctx.weakList.slice(0, 3).join('；')}（优先补）。`);
  L.push(`· 刷题 ≥120 题；${fk === 'sprint' ? '模考 1 套 + ' : ''}申论每周 1 套小题 + 1 篇大作文。`);
  L.push(`· 周末：错题二刷 + 周复盘（存「复盘·通过率」）。`);
  return L.join('\n');
}

function suggestDaily(ctx, today, budget) {
  const ph = ctx.ph;
  const wd = new Date().getDay();
  const isWeekend = (wd === 0 || wd === 6);
  const fk = ph ? (ph.key === 'exam' ? 'sprint' : ph.key) : 'base';
  let pts = ctx.undone.filter(p => p.phase === fk).slice(0, 2);
  if (pts.length < 2) pts = ctx.undone.slice(0, 2);
  const b = Number(budget) || 2;
  const learnMin = Math.max(20, Math.round(b * 0.5 * 60));
  const brushMin = Math.max(15, Math.round(b * 0.35 * 60));
  const revMin = Math.max(10, b * 60 - learnMin - brushMin);
  const blocks = [];
  blocks.push(`① 新知/专项 ${learnMin}min：${pts.length ? pts.map(p => p.name).join('、') : '复习已掌握模块，查漏补缺'}`);
  if (ctx.weakList.length) blocks.push(`② 薄弱攻坚 ${Math.round(brushMin * 0.5)}min：回顾「不会的知识点」→ ${ctx.weakList.slice(0, 2).join('；')}`);
  const brushLabel = ctx.weakList.length ? `刷题 ${Math.round(brushMin * 0.5)}min` : `刷题 ${brushMin}min`;
  blocks.push(`${ctx.weakList.length ? '③' : '②'} ${brushLabel}：行测/申论轮换，错题当天归档（累计 ${ctx.totalQuestions} 题）`);
  if (ph && ph.key === 'sprint') blocks.push(`+ 冲刺：计时模考 1 套（行测 + 申论）。`);
  blocks.push(`末 ${revMin}min：写今日复盘（记到「每日复盘」），规划明天。`);
  const L = [];
  L.push(`【今日计划 · ${b}h · ${phaseNameOf(ph)}】${isWeekend ? ' 周末' : ' 工作日'}`);
  L.push(...blocks);
  const fromStart = daysBetween(ctx.meta.startDate, today);
  if (ctx.daysToExam > 0 && ctx.studyDays < Math.max(1, fromStart * 0.5)) L.push(`⚠️ 学习天数偏少（${ctx.studyDays} 天 / 已备考 ${Math.max(0, fromStart)} 天），建议加量或利用周末补进度。`);
  if (!pts.length) L.push(`✅ 当前阶段考点已掌握，今天以刷真题 / 模考为主。`);
  return L.join('\n');
}

// ===================== 每日复盘 / 打卡 =====================
function renderCheckin(body) {
  const today = todayStr();
  const ck = loadCheckins();
  const todayCk = ck[today] || { hours: '', questions: '', mocks: '', content: '', weak: '' };
  const chapters = loadChapters();

  const history = Object.keys(ck).sort().reverse().slice(0, 12);
  const histHtml = history.length === 0
    ? `<div class="rk-empty">还没有打卡记录，今天学完来记一笔吧。</div>`
    : history.map(d => {
        const c = ck[d];
        return `<div class="rk-hist-item">
          <div class="rk-hist-date">${d}</div>
          <div class="rk-hist-meta">⏱${c.hours || 0}h · 📝${c.questions || 0}题 · 📄${c.mocks || 0}套</div>
          ${c.content ? `<div class="rk-hist-content">${escapeHtml(c.content)}</div>` : ''}
          ${c.weak ? `<div class="rk-hist-weak">❓ 薄弱：${escapeHtml(c.weak)}</div>` : ''}
        </div>`;
      }).join('');

  body.innerHTML = `
    <div class="rk-card">
      <div class="rk-card-head">📝 每日复盘（${today}）</div>
      <div class="rk-form">
        <div class="rk-form-row">
          <label class="rk-form-field">学习时长(h)
            <input class="input" id="ck_hours" type="number" min="0" step="0.5" value="${escapeAttr(todayCk.hours)}" placeholder="如 2"></label>
          <label class="rk-form-field">刷题数量(题)
            <input class="input" id="ck_q" type="number" min="0" step="1" value="${escapeAttr(todayCk.questions)}" placeholder="如 25"></label>
          <label class="rk-form-field">模考套数
            <input class="input" id="ck_m" type="number" min="0" step="1" value="${escapeAttr(todayCk.mocks)}" placeholder="0/1"></label>
        </div>
        <label class="rk-form-field">完成内容
          <textarea class="textarea" id="ck_content" style="min-height:70px" placeholder="今天学了什么、做了哪套题 / 申论小题…">${escapeHtml(todayCk.content)}</textarea></label>
        <label class="rk-form-field">薄弱模块 / 不会的点
          <textarea class="textarea" id="ck_weak" style="min-height:60px" placeholder="卡住的地方，周末 / 复盘时集中攻破">${escapeHtml(todayCk.weak)}</textarea></label>
        <label class="rk-form-field">今日复盘小结
          <textarea class="textarea" id="ck_review" style="min-height:60px" placeholder="今天最大的收获 / 卡点 / 明天怎么调整">${escapeHtml(todayCk.review || '')}</textarea></label>
        <button class="btn btn-primary" id="ck_save">💾 保存今日复盘</button>
      </div>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">📚 已完成章节（自由记录）</div>
      <textarea class="textarea" id="ck_chapters" style="min-height:80px" placeholder="如：资料分析速算 / 申论归纳概括 / 判断推理…">${escapeHtml(chapters)}</textarea>
      <button class="btn" id="ck_chapters_save" style="margin-top:8px">保存章节记录</button>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">🕘 打卡历史</div>
      <div class="rk-hist-list">${histHtml}</div>
    </div>
  `;

  const saveHere = () => {
    const d = today;
    const obj = {
      hours: body.querySelector('#ck_hours').value,
      questions: body.querySelector('#ck_q').value,
      mocks: body.querySelector('#ck_m').value,
      content: body.querySelector('#ck_content').value.trim(),
      weak: body.querySelector('#ck_weak').value.trim(),
      review: body.querySelector('#ck_review').value.trim(),
    };
    const all = loadCheckins();
    all[d] = obj;
    saveCheckins(all);
    toast('今日打卡已保存');
    const ctn = body.parentElement;
    renderBody(ctn);
  };
  body.querySelector('#ck_save').onclick = saveHere;
  body.querySelector('#ck_chapters_save').onclick = () => {
    saveChapters(body.querySelector('#ck_chapters').value.trim());
    toast('章节记录已保存');
  };
}

// ===================== 错题库 / 薄弱点 =====================
function renderWrong(body) {
  const list = loadWrong().sort((a, b) => b.createdAt - a.createdAt);
  body.innerHTML = `
    <div class="rk-card">
      <div class="rk-card-head">📕 错题库（真题 / 模考驱动：记错→归类→复盘）</div>
      <div class="rk-card-desc">记录做错的题，标注科目与考点，考前集中复习。</div>
      <button class="btn btn-primary" id="wk_add">＋ 添加错题</button>
    </div>
    <div class="list" id="wkList">
      ${list.length === 0 ? `<div class="rk-empty">还没有错题，刷题 / 模考时遇到卡壳的题就记下来。</div>` :
        list.map(w => `
        <div class="list-item" data-id="${w.id}">
          <div class="list-item-head">
            <div style="flex:1;min-width:0">
              <div class="flex items-center gap-8 mb-8">
                <span class="badge badge-blue">${escapeHtml(w.subject)}</span>
                ${w.point ? `<span class="badge badge-purple">${escapeHtml(w.point)}</span>` : ''}
              </div>
              ${w.question ? `<div class="list-item-title">${escapeHtml(w.question)}</div>` : ''}
              ${w.myWrong ? `<div class="list-item-body">❌ 我的错误：${escapeHtml(w.myWrong)}</div>` : ''}
              ${w.correct ? `<div class="list-item-body">✅ 正确思路：${escapeHtml(w.correct)}</div>` : ''}
            </div>
            <div class="list-item-actions">
              <button class="icon-btn btn-sm wk-del">🗑</button>
            </div>
          </div>
          <div class="list-item-meta"><span>${fmtDate(w.createdAt)}</span></div>
        </div>`).join('')}
    </div>
  `;
  body.querySelector('#wk_add').onclick = () => openWrongForm(body, null);
  body.querySelectorAll('.wk-del').forEach(btn => {
    btn.onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '删除这条错题吗？', confirmText: '删除', danger: true })) {
        saveWrong(loadWrong().filter(w => w.id !== btn.closest('.list-item').dataset.id));
        renderWrong(body);
        toast('已删除');
      }
    };
  });
}

function openWrongForm(body, id) {
  const list = loadWrong();
  const w = id ? list.find(x => x.id === id) : {};
  openModal({
    title: id ? '编辑错题' : '添加错题',
    body: `
      <div class="field"><label class="field-label">科目</label>
        <select class="select" id="wk_subject">
          ${['行测', '申论', '常识'].map(s => `<option value="${s}" ${w.subject === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
      <div class="field"><label class="field-label">考点</label>
        <input class="input" id="wk_point" value="${escapeAttr(w.point)}" placeholder="如：资料分析·增长率"></div>
      <div class="field"><label class="field-label">题目 / 情境</label>
        <textarea class="textarea" id="wk_question" style="min-height:70px" placeholder="题干或情境摘要">${escapeHtml(w.question)}</textarea></div>
      <div class="field"><label class="field-label">我的错误</label>
        <textarea class="textarea" id="wk_mywrong" style="min-height:60px" placeholder="当时为什么错">${escapeHtml(w.myWrong)}</textarea></div>
      <div class="field"><label class="field-label">正确思路 / 答案</label>
        <textarea class="textarea" id="wk_correct" style="min-height:70px" placeholder="正确解法与依据">${escapeHtml(w.correct)}</textarea></div>`,
    foot: `<button class="btn" id="wk_cancel">取消</button><button class="btn btn-primary" id="wk_save">保存</button>`
  });
  document.getElementById('wk_cancel').onclick = closeModal;
  document.getElementById('wk_save').onclick = () => {
    const payload = {
      subject: document.getElementById('wk_subject').value,
      point: document.getElementById('wk_point').value.trim(),
      question: document.getElementById('wk_question').value.trim(),
      myWrong: document.getElementById('wk_mywrong').value.trim(),
      correct: document.getElementById('wk_correct').value.trim(),
    };
    if (!payload.question && !payload.myWrong && !payload.correct) { toast('至少填一项'); return; }
    if (id) { const i = list.findIndex(x => x.id === id); list[i] = { ...list[i], ...payload }; }
    else list.push({ id: Storage.uid(), createdAt: Date.now(), ...payload });
    saveWrong(list);
    closeModal();
    renderWrong(body);
    toast('已保存');
  };
}

// ===================== 模考进度 =====================
function renderMockInto(host) {
  const list = loadMocks().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const target = 8; // 目标模考套数
  const done = list.length;
  const lineMocks = list.filter(m => m.type === '行测');
  const applyMocks = list.filter(m => m.type === '申论');
  const lastLine = lineMocks[0];
  const lastApply = applyMocks[0];
  host.innerHTML = `
      <div class="rk-card-head">📝 模考进度（目标：考前 ≥${target} 套）</div>
      <div class="rk-essay-bar">
        <div class="rk-essay-bar-fill" style="width:${Math.min(done / target * 100, 100)}%"></div>
        <span class="rk-essay-bar-text">${done}/${target} 套</span>
      </div>
      <div class="rk-card-desc">
        最近行测：${lastLine ? `${lastLine.score}/${lastLine.full}（${lastLine.date}）` : '—'} ｜
        最近申论：${lastApply ? `${lastApply.score}/${lastApply.full}（${lastApply.date}）` : '—'}
      </div>
      <button class="btn btn-primary" id="mk_add" style="margin-top:6px">＋ 记录一次模考</button>
    <div class="rk-essay-list">
      ${list.length === 0 ? `<div class="rk-empty">还没有模考记录，进入强化 / 冲刺期后每周安排模考并记下来。</div>` :
        list.map(m => `
        <div class="rk-essay-item" data-id="${m.id}">
          <div class="rk-essay-top">
            <div class="rk-essay-topic">${escapeHtml(m.type)} · ${m.score}/${m.full}</div>
            <span class="badge ${m.type === '行测' ? 'badge-blue' : 'badge-green'}">${m.date || ''}</span>
          </div>
          ${m.note ? `<div class="rk-hist-content" style="margin-top:6px">${escapeHtml(m.note)}</div>` : ''}
          <div style="margin-top:6px"><button class="btn btn-sm mk-del" data-id="${m.id}">删除</button></div>
        </div>`).join('')}
    </div>
  `;
  host.querySelector('#mk_add').onclick = () => openMockForm(host, null);
  host.querySelectorAll('.mk-del').forEach(btn => {
    btn.onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '删除这条模考记录吗？', confirmText: '删除', danger: true })) {
        saveMocks(loadMocks().filter(m => m.id !== btn.dataset.id));
        renderMockInto(host);
        toast('已删除');
      }
    };
  });
}

function openMockForm(body, id) {
  const list = loadMocks();
  const m = id ? list.find(x => x.id === id) : { type: '行测', full: 100, date: todayStr() };
  openModal({
    title: id ? '编辑模考' : '记录模考',
    body: `
      <div class="form-row">
        <div class="field"><label class="field-label">类型</label>
          <select class="select" id="mk_type">
            ${['行测', '申论'].map(s => `<option value="${s}" ${m.type === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select></div>
        <div class="field"><label class="field-label">满分</label>
          <input class="input" id="mk_full" type="number" value="${escapeAttr(m.full)}" placeholder="100"></div>
      </div>
      <div class="form-row">
        <div class="field"><label class="field-label">得分</label>
          <input class="input" id="mk_score" type="number" value="${escapeAttr(m.score)}" placeholder="如 68"></div>
        <div class="field"><label class="field-label">日期</label>
          <input class="input" id="mk_date" type="date" value="${escapeAttr(m.date)}"></div>
      </div>
      <div class="field"><label class="field-label">备注（薄弱模块等）</label>
        <textarea class="textarea" id="mk_note" style="min-height:60px" placeholder="如：资料分析超时，判断推理错 5 题">${escapeHtml(m.note)}</textarea></div>`,
    foot: `<button class="btn" id="mk_cancel">取消</button><button class="btn btn-primary" id="mk_save">保存</button>`
  });
  document.getElementById('mk_cancel').onclick = closeModal;
  document.getElementById('mk_save').onclick = () => {
    const payload = {
      type: document.getElementById('mk_type').value,
      full: Number(document.getElementById('mk_full').value) || 100,
      score: Number(document.getElementById('mk_score').value) || 0,
      date: document.getElementById('mk_date').value || todayStr(),
      note: document.getElementById('mk_note').value.trim(),
    };
    if (id) { const i = list.findIndex(x => x.id === id); list[i] = { ...list[i], ...payload }; }
    else list.push({ id: Storage.uid(), ...payload });
    saveMocks(list);
    closeModal();
    renderMockInto(body);
    toast('已保存');
  };
}

// ===================== 每周复盘 + 通过率 =====================
function renderReview(body) {
  const today = todayStr();
  const wkStart = weekMonday(today);
  const pass = computePass();
  const reviews = loadReviews();
  const saved = reviews[wkStart];

  const ck = loadCheckins();
  let studyDays = 0, totalHours = 0, totalQuestions = 0, totalMocks = 0, weakList = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(wkStart, i);
    if (d > today) break;
    const c = ck[d];
    if (c && (c.hours > 0 || c.questions > 0 || c.mocks > 0 || c.content)) {
      studyDays++;
      totalHours += Number(c.hours) || 0;
      totalQuestions += Number(c.questions) || 0;
      totalMocks += Number(c.mocks) || 0;
    }
    if (c && c.weak) weakList.push(`（${d.slice(5)}）${c.weak}`);
  }
  const passInfo = passInfoOf(pass);

  body.innerHTML = `
    <div class="rk-card">
      <div class="rk-card-head">🎯 通过率评估（实时）</div>
      <div class="rk-pass-num">${Math.round(pass * 100)}<span>%</span></div>
      <div class="rk-pass-bar"><div class="rk-pass-fill" style="width:${pass * 100}%"></div></div>
      <div class="rk-pass-band ${passInfo.cls}">${passInfo.band}</div>
      <div class="rk-card-desc">综合：学习出勤 40% + 模考分数 30% + 刷题量 15% + 阶段进度 15%。</div>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">📝 本周备考总结（${wkStart.slice(5)} 起本周）</div>
      <div class="rk-week-stats">
        <div class="rk-stat"><div class="rk-stat-num">${studyDays}</div><div class="rk-stat-label">学习天数</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalHours.toFixed(1)}</div><div class="rk-stat-label">时长(h)</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalQuestions}</div><div class="rk-stat-label">刷题(题)</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalMocks}</div><div class="rk-stat-label">模考(套)</div></div>
      </div>
      <div class="rk-form">
        <label class="rk-form-field">掌握知识
          <textarea class="textarea" id="rv_mastery" style="min-height:70px" placeholder="本周吃透的考点…">${escapeHtml(saved ? saved.mastery : '')}</textarea></label>
        <label class="rk-form-field">薄弱部分
          <textarea class="textarea" id="rv_weak" style="min-height:70px" placeholder="仍需攻破的点…">${escapeHtml(saved ? saved.weak : weakList.join('；'))}</textarea></label>
        <label class="rk-form-field">下周计划
          <textarea class="textarea" id="rv_next" style="min-height:70px" placeholder="下周重点与调整…">${escapeHtml(saved ? saved.nextPlan : '')}</textarea></label>
        <button class="btn btn-primary" id="rv_save">💾 保存本周复盘</button>
      </div>
      ${saved ? `<div class="rk-card-desc" style="margin-top:8px">已于 ${saved.createdAt ? fmtDate(saved.createdAt) : ''} 保存。</div>` : ''}
    </div>
  `;

  body.querySelector('#rv_save').onclick = () => {
    const reviews2 = loadReviews();
    reviews2[wkStart] = {
      mastery: body.querySelector('#rv_mastery').value.trim(),
      weak: body.querySelector('#rv_weak').value.trim(),
      nextPlan: body.querySelector('#rv_next').value.trim(),
      stats: { studyDays, totalHours, totalQuestions, totalMocks },
      createdAt: Date.now(),
    };
    saveReviews(reviews2);
    toast('本周复盘已保存');
  };
}

function computePass() {
  const meta = loadMeta();
  const today = todayStr();
  const ck = loadCheckins();
  const fromStart = daysBetween(meta.startDate, today);
  let studyDays = 0;
  Object.keys(ck).forEach(d => {
    if (d < meta.startDate) return;
    const c = ck[d];
    if (c && (c.hours > 0 || c.questions > 0 || c.mocks > 0 || c.content)) studyDays++;
  });
  const studyRate = fromStart > 0 ? Math.min(studyDays / fromStart, 1) : (studyDays > 0 ? 1 : 0);
  // 模考分数：取最近一次行测 + 申论得分率均值
  const mocks = loadMocks();
  const lastLine = mocks.filter(m => m.type === '行测').sort((a, b) => (b.date || '').localeCompare(a.date || '')).find(() => true);
  const lastApply = mocks.filter(m => m.type === '申论').sort((a, b) => (b.date || '').localeCompare(a.date || '')).find(() => true);
  let mockRate = 0, n = 0;
  if (lastLine) { mockRate += Math.min((lastLine.score || 0) / (lastLine.full || 100), 1); n++; }
  if (lastApply) { mockRate += Math.min((lastApply.score || 0) / (lastApply.full || 100), 1); n++; }
  mockRate = n ? mockRate / n : 0;
  let totalQ = 0;
  Object.values(ck).forEach(c => totalQ += Number(c.questions) || 0);
  const qRate = Math.min(totalQ / 1500, 1);
  const ph = getPhase(today);
  const phaseProgress = ph ? (ph.key === 'base' ? 0.33 : ph.key === 'strong' ? 0.66 : 0.9) : 0;
  const score = studyRate * 0.4 + mockRate * 0.3 + qRate * 0.15 + phaseProgress * 0.15;
  return Math.max(0, Math.min(1, score));
}

function passInfoOf(score) {
  if (score >= 0.9) return { band: '上岸概率高 ✅', cls: 'pass-high' };
  if (score >= 0.7) return { band: '需要保持 🟡', cls: 'pass-mid' };
  if (score >= 0.5) return { band: '需要加强 🟠', cls: 'pass-low' };
  return { band: '需要重新调整 🔴', cls: 'pass-bad' };
}
