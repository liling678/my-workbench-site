// ruankao.js — 杂七杂八的学习 · 软考学习（系统规划与管理师 一次通过备考教练）
import { registerModule } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const META_KEY = 'ruankao_meta';
const CHECKIN_KEY = 'ruankao_checkins';      // { 'YYYY-MM-DD': { hours, questions, essays, content, weak } }
const WRONG_KEY = 'ruankao_wrong';           // [ {id, subject, question, point, myWrong, correct, createdAt} ]
const ESSAY_KEY = 'ruankao_essays';          // [ {id, topic, status, words, date} ]
const REVIEW_KEY = 'ruankao_reviews';        // { 'YYYY-MM-DD'(weekStart): { mastery, weak, nextPlan, stats, createdAt } }
const CHAPTERS_KEY = 'ruankao_chapters';     // 完成章节（自由文本）
const POINTS_DONE_KEY = 'ruankao_points_done'; // { '知识点名': true } 已掌握
const BOOKS_DONE_KEY = 'ruankao_books_done';   // { '书名': true } 已读完

const EXAM_DEFAULT = '2026-10-24';
const TARGETS_DEFAULT = { comp: 55, caseS: 50, essay: 50 };

// 三阶段规划（按角色定义）
const PHASES = [
  {
    key: 'base', name: '第一阶段 · 基础建立期', start: '2026-08-10', end: '2026-08-31',
    focus: '建立第一轮知识体系：IT服务管理（ITSS / 服务生命周期 / 战略·设计·转换·运营）、项目管理体系；完成 2019–2025 真题第一轮，建立错题库与第一篇论文框架。',
  },
  {
    key: 'strong', name: '第二阶段 · 强化训练期', start: '2026-09-01', end: '2026-09-30',
    focus: '进入考试输出：综合知识每天 20–30 选择题（错题必记）；案例分析每周 ≥2 题（问题→分析→理论→措施→总结）；完成 5 篇论文（每篇约 2500 字）。',
  },
  {
    key: 'sprint', name: '第三阶段 · 冲刺阶段', start: '2026-10-01', end: '2026-10-23',
    focus: '全真模拟：每周 ≥2 次完整模拟（上午 75 题 + 下午案例 + 论文）。考前 7 天（10.17 起）禁学新知，只复盘错题 / 背高频 / 背论文模板。',
  },
];

const ESSAY_TOPICS = ['IT服务管理', '项目管理', '风险管理', '质量管理', '运维管理'];
const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 知识点图谱（按模块归类，标注重要星级 ★ 与建议学习阶段）
// phase: base=基础建立期 / strong=强化训练期 / sprint=冲刺阶段
const KNOWLEDGE = [
  { module: '一、信息系统与信息技术基础', points: [
    { name: '信息系统概念与生命周期', star: 4, phase: 'base' },
    { name: '信息系统开发方法与建模', star: 3, phase: 'base' },
    { name: '新一代信息技术（云/大数据/物联网/AI）', star: 4, phase: 'base' },
    { name: '网络、数据库与中间件基础', star: 3, phase: 'base' },
  ] },
  { module: '二、IT服务管理与ITSS（核心）', points: [
    { name: 'IT服务与ITSS标准体系', star: 5, phase: 'base' },
    { name: 'IT服务生命周期：战略', star: 5, phase: 'base' },
    { name: 'IT服务生命周期：设计', star: 5, phase: 'base' },
    { name: 'IT服务生命周期：转换', star: 5, phase: 'base' },
    { name: 'IT服务生命周期：运营', star: 5, phase: 'base' },
    { name: 'IT服务生命周期：持续改进', star: 5, phase: 'base' },
    { name: 'IT服务质量评价与营销', star: 4, phase: 'strong' },
    { name: 'IT服务团队、人员与沟通', star: 4, phase: 'strong' },
    { name: 'IT服务安全与风险管理', star: 5, phase: 'strong' },
  ] },
  { module: '三、项目管理知识体系', points: [
    { name: '项目整体管理', star: 5, phase: 'base' },
    { name: '范围 / 进度 / 成本管理', star: 5, phase: 'base' },
    { name: '质量管理', star: 4, phase: 'base' },
    { name: '风险管理（重点）', star: 5, phase: 'strong' },
    { name: '沟通与干系人管理', star: 4, phase: 'strong' },
    { name: '采购与合同管理', star: 3, phase: 'base' },
  ] },
  { module: '四、系统规划', points: [
    { name: 'IT战略规划', star: 4, phase: 'base' },
    { name: '信息系统规划与信息资源规划', star: 4, phase: 'base' },
    { name: '企业架构（TOGAF等）', star: 3, phase: 'base' },
  ] },
  { module: '五、系统运维与安全管理', points: [
    { name: 'IT运维管理体系', star: 4, phase: 'base' },
    { name: '运维工具与自动化', star: 3, phase: 'base' },
    { name: '信息安全与业务连续性 / 灾备', star: 4, phase: 'strong' },
  ] },
  { module: '六、数学 · 经济 · 法规 · 英语', points: [
    { name: '运筹与概率基础', star: 3, phase: 'base' },
    { name: '财务与经济分析', star: 2, phase: 'base' },
    { name: '招投标 / 合同 / 知识产权法规', star: 4, phase: 'strong' },
    { name: '标准规范（ITSS / ISO / IEC等）', star: 4, phase: 'base' },
    { name: '专业英语', star: 2, phase: 'strong' },
  ] },
];

// 阅读书单（按阶段规划）
const BOOKS = [
  { name: '《系统规划与管理师教程》（官方教材）', phase: 'base', note: '通读建立体系，配思维导图' },
  { name: 'ITSS 系列国家标准（GB/T 28827 等）', phase: 'base', note: '精读服务生命周期相关国标' },
  { name: '《信息系统项目管理师教程》项目部分', phase: 'base', note: '补足十大领域理论' },
  { name: '历年真题解析（2019–2025）', phase: 'strong', note: '每天 20–30 题，错题归档' },
  { name: '案例分析专项训练', phase: 'strong', note: '每周 ≥2 题，套用答题模板' },
  { name: '论文范文与模板集（5 方向）', phase: 'strong', note: '各背 1 篇，提炼通用框架' },
  { name: '高频考点速记手册', phase: 'sprint', note: '考前 7 天只背不学新' },
];

const PHASE_TAG = { base: '基础期', strong: '强化期', sprint: '冲刺期' };

// ===================== 数据读写 =====================
function loadMeta() {
  return Storage.get(META_KEY, { startDate: todayStr(), examDate: EXAM_DEFAULT, targets: { ...TARGETS_DEFAULT } });
}
function saveMeta(d) { Storage.set(META_KEY, d); }
function loadCheckins() { return Storage.get(CHECKIN_KEY, {}); }
function saveCheckins(d) { Storage.set(CHECKIN_KEY, d); }
function loadWrong() { return Storage.get(WRONG_KEY, []); }
function saveWrong(d) { Storage.set(WRONG_KEY, d); }
function loadEssays() {
  let list = Storage.get(ESSAY_KEY, []);
  if (list.length === 0) {
    list = ESSAY_TOPICS.map(t => ({ id: Storage.uid(), topic: t, status: '未开始', words: 0, date: '' }));
    Storage.set(ESSAY_KEY, list);
  }
  return list;
}
function saveEssays(d) { Storage.set(ESSAY_KEY, d); }
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
  if (dateStr >= '2026-10-24') return { key: 'exam', name: '考试日 / 已考', start: '2026-10-24', end: '2026-10-24', focus: '决战日或考后复盘。' };
  return null;
}
function weekMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const off = (d.getDay() + 6) % 7; // 周一=0
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

// ===================== 注册 =====================
export function initRuankao() {
  registerModule('learning-ruankao', {
    section: 'learning',
    title: '软考学习',
    icon: '🎓',
    render(container) { renderRuankao(container); }
  });
}

let rkTab = 'board';

function renderRuankao(container) {
  const TABS = [
    { id: 'board', name: '备考看板' },
    { id: 'plan', name: '计划目标' },
    { id: 'checkin', name: '每日复盘' },
    { id: 'wrong', name: '错题库' },
    { id: 'review', name: '复盘·通过率' },
  ];
  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">软考学习 · 系统规划与管理师</div>
      <div class="page-desc">2026-10-24 一次通过备考教练：规划 / 监督 / 真题 / 案例 / 论文</div>
    </div>
    <div class="tabs">
      ${TABS.map(t => `<div class="tab ${t.id === rkTab ? 'active' : ''}" data-tab="${t.id}">${t.name}</div>`).join('')}
    </div>
    <div id="rkBody"></div>
  `;
  container.querySelectorAll('.tab').forEach(el => {
    el.onclick = () => {
      rkTab = el.dataset.tab;
      container.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === rkTab));
      renderBody(container);
    };
  });
  renderBody(container);
}

function renderBody(container) {
  const body = container.querySelector('#rkBody');
  if (rkTab === 'board') renderBoard(body);
  else if (rkTab === 'plan') renderPlan(body);
  else if (rkTab === 'checkin') renderCheckin(body);
  else if (rkTab === 'wrong') renderWrong(body);
  else renderReview(body);
}

// ===================== 备考看板 =====================
function renderBoard(body) {
  const meta = loadMeta();
  const today = todayStr();
  const toExam = daysBetween(today, meta.examDate);
  const fromStart = daysBetween(meta.startDate, today);
  const ph = getPhase(today);
  const pass = computePass();

  // 累计统计
  const ck = loadCheckins();
  let studyDays = 0, totalHours = 0, totalQuestions = 0, totalEssays = 0;
  Object.values(ck).forEach(c => {
    if (c && (c.hours > 0 || c.questions > 0 || c.essays > 0 || c.content)) {
      studyDays++;
      totalHours += Number(c.hours) || 0;
      totalQuestions += Number(c.questions) || 0;
      totalEssays += Number(c.essays) || 0;
    }
  });
  const essaysDone = loadEssays().filter(e => e.status === '已完成').length;

  // 教练今日提醒
  const wd = new Date().getDay();
  const wdName = WEEK_DAYS[wd];
  const evening = { 1: '综合知识学习', 2: '综合刷题', 3: '案例分析', 4: '论文训练', 5: '错题整理' };
  let coach = '';
  if (ph && ph.key !== 'exam') {
    const focus = (wd === 0 || wd === 6) ? '上午学新知 / 下午真题 / 晚上复盘' : `上午复习 · 碎片刷题 · 晚上【${evening[wd] || '综合复盘'}】`;
    coach = `教练提醒：今天是${wdName}，${ph.name.split(' · ')[1] || ph.name}。今日重点 → ${focus}。`;
  } else if (ph && ph.key === 'exam') {
    coach = '教练提醒：已到考试日，调整状态、轻装应考，祝你一次通过！';
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

  body.innerHTML = `
    <div class="rk-countdown ${toExam !== null && toExam <= 30 ? 'rk-countdown-near' : ''}">
      <div class="rk-countdown-num">${toExam !== null ? (toExam >= 0 ? toExam : '已过') : '—'}</div>
      <div class="rk-countdown-label">距 2026-10-24 考试（天）</div>
    </div>

    <div class="rk-coach">🤖 ${escapeHtml(coach)}</div>

    <div class="rk-targets">
      <div class="rk-target"><div class="rk-target-num">≥${meta.targets.comp}</div><div class="rk-target-label">综合知识</div></div>
      <div class="rk-target"><div class="rk-target-num">≥${meta.targets.caseS}</div><div class="rk-target-label">案例分析</div></div>
      <div class="rk-target"><div class="rk-target-num">≥${meta.targets.essay}</div><div class="rk-target-label">论文</div></div>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">📍 当前阶段</div>
      <div class="rk-phases">${phaseSteps}</div>
      <div class="rk-phase-focus">${ph ? escapeHtml(ph.focus) : '备考尚未开始。'}</div>
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
      <div class="rk-card-desc">结合知识点图谱，按阶段安排教材 / 真题 / 论文资料。</div>
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
        </label>`).join('') + (hiddenCount ? `<div class="rk-kmap-more">…还有 ${hiddenCount} 个未掌握知识点，见上方「总体计划」</div>` : '') : `<div class="rk-empty">当前阶段的知识点已全部标记完成 🎉，去刷真题 / 写论文巩固吧。</div>`}
      <button class="btn btn-primary" id="rkBoardPlan" style="margin-top:10px">📋 制定计划目标</button>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">📊 累计数据（本地）</div>
      <div class="rk-stats">
        <div class="rk-stat"><div class="rk-stat-num">${studyDays}</div><div class="rk-stat-label">累计学习天数</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalHours.toFixed(1)}</div><div class="rk-stat-label">累计学习时间(h)</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalQuestions}</div><div class="rk-stat-label">刷题总数</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${essaysDone}/5</div><div class="rk-stat-label">论文完成</div></div>
      </div>
    </div>

    <div class="rk-card">
      <div id="rkEssayHost"></div>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">⏱ 考试日期 / 开始日期</div>
      <div class="rk-meta-row">
        <label class="rk-meta-field">开始日期<input type="date" class="input" id="rk_start" value="${escapeAttr(meta.startDate)}"></label>
        <label class="rk-meta-field">考试日期<input type="date" class="input" id="rk_exam" value="${escapeAttr(meta.examDate)}"></label>
      </div>
      ${fromStart !== null ? `<div class="rk-meta-hint">已备考 ${Math.max(fromStart, 0)} 天${toExam !== null && toExam >= 0 ? `，剩余 ${toExam} 天` : ''}。</div>` : ''}
    </div>

    <details class="rk-coach-desc">
      <summary>📖 教练说明（点击展开）</summary>
      <div class="rk-coach-desc-body">
        你是「系统规划与管理师（软考高级）一次通过备考教练」。一切以<b>提高通过概率</b>为目标，优先级：<b>论文 ＞ 案例分析 ＞ 综合高频 ＞ 冷门</b>。
        采用真题驱动：分析真题→提炼高频→学理论→练巩固。在职备考，计划现实可执行，不制造焦虑。
        每天推动你完成任务，最终 2026-10-24 一次通过。
      </div>
    </details>
  `;

  body.querySelector('#rk_start').onchange = (e) => { const m = loadMeta(); m.startDate = e.target.value; saveMeta(m); renderBoard(body); };
  body.querySelector('#rk_exam').onchange = (e) => { const m = loadMeta(); m.examDate = e.target.value; saveMeta(m); renderBoard(body); };

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
  const boardPlanBtn = body.querySelector('#rkBoardPlan');
  if (boardPlanBtn) boardPlanBtn.onclick = () => {
    rkTab = 'plan';
    const ctn = body.parentElement;
    ctn.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === rkTab));
    renderBody(ctn);
  };

  const essayHost = body.querySelector('#rkEssayHost');
  if (essayHost) renderEssayInto(essayHost);
}

// ===================== 计划目标（总体/月度/周/每日，智能+手动） =====================
function loadPlan() { return Storage.get('ruankao_plan', { overall: '', monthly: {}, weekly: {}, daily: {}, budget: 2 }); }
function savePlan(d) { Storage.set('ruankao_plan', d); }

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
    if (c && (c.hours > 0 || c.questions > 0 || c.essays > 0 || c.content)) {
      studyDays++; totalHours += Number(c.hours) || 0; totalQuestions += Number(c.questions) || 0;
    }
  });
  const essaysDone = loadEssays().filter(e => e.status === '已完成').length;
  const daysToExam = daysBetween(today, meta.examDate);
  return { meta, ph, allP, done, undone, weakList, studyDays, totalHours, totalQuestions, essaysDone, daysToExam, today };
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
  L.push(`【总体目标】${ctx.meta.examDate} 系统规划与管理师一次通过。`);
  L.push(`· 综合知识 ≥${t.comp} · 案例分析 ≥${t.caseS} · 论文 ≥${t.essay}。`);
  L.push(`· 掌握全部 ${tot} 个知识点（已 ${doneN} / ${tot}）。`);
  L.push(`· 刷题累计 ≥800 题（已 ${ctx.totalQuestions}）。`);
  L.push(`· 考前完成 5 篇论文（已 ${ctx.essaysDone}）。`);
  L.push(`· 每周保持 5–6 天学习，日均约 2h，周末适当加量。`);
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
  else L.push(`· 本月以刷真题 + 写论文为主，巩固已掌握模块。`);
  L.push(`· 配套完成本阶段书单（教材 / 真题 / 论文资料）。`);
  L.push(`· 周四固定论文日，月底复盘并完成本周薄弱专项。`);
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
  else L.push(`· 考点已全部掌握，本周转刷真题 / 写论文巩固。`);
  if (ctx.weakList.length) L.push(`· 薄弱专项：${ctx.weakList.slice(0, 3).join('；')}（优先补）。`);
  L.push(`· 刷题 ≥120 题；${fk === 'sprint' ? '模考 1 套 + ' : ''}周四论文日写/改 1 篇。`);
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
  blocks.push(`${ctx.weakList.length ? '③' : '②'} ${brushLabel}：综合/案例轮换，错题当天归档（累计 ${ctx.totalQuestions} 题）`);
  if (ph && ph.key === 'sprint') blocks.push(`+ 冲刺：计时模考 1 套或论文 1 篇（计入进度）`);
  blocks.push(`末 ${revMin}min：写今日复盘（记到「每日复盘」），规划明天。`);
  const L = [];
  L.push(`【今日计划 · ${b}h · ${phaseNameOf(ph)}】${isWeekend ? ' 周末' : ' 工作日'}`);
  L.push(...blocks);
  const fromStart = daysBetween(ctx.meta.startDate, today);
  if (ctx.daysToExam > 0 && ctx.studyDays < Math.max(1, fromStart * 0.5)) L.push(`⚠️ 学习天数偏少（${ctx.studyDays} 天 / 已备考 ${Math.max(0, fromStart)} 天），建议加量或利用周末补进度。`);
  if (!pts.length) L.push(`✅ 当前阶段考点已掌握，今天以刷真题 / 写论文为主。`);
  return L.join('\n');
}

// ===================== 每日复盘 / 打卡 =====================
function renderCheckin(body) {
  const today = todayStr();
  const ck = loadCheckins();
  const todayCk = ck[today] || { hours: '', questions: '', essays: '', content: '', weak: '' };
  const chapters = loadChapters();

  // 历史（最近 12 条，倒序）
  const history = Object.keys(ck).sort().reverse().slice(0, 12);
  const histHtml = history.length === 0
    ? `<div class="rk-empty">还没有打卡记录，今天学完来记一笔吧。</div>`
    : history.map(d => {
        const c = ck[d];
        return `<div class="rk-hist-item">
          <div class="rk-hist-date">${d}</div>
          <div class="rk-hist-meta">⏱${c.hours || 0}h · 📝${c.questions || 0}题 · 📄${c.essays || 0}篇</div>
          ${c.content ? `<div class="rk-hist-content">${escapeHtml(c.content)}</div>` : ''}
          ${c.weak ? `<div class="rk-hist-weak">❓ 不会：${escapeHtml(c.weak)}</div>` : ''}
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
          <label class="rk-form-field">论文完成(篇)
            <input class="input" id="ck_e" type="number" min="0" step="1" value="${escapeAttr(todayCk.essays)}" placeholder="0/1"></label>
        </div>
        <label class="rk-form-field">完成内容
          <textarea class="textarea" id="ck_content" style="min-height:70px" placeholder="今天学了什么、做了哪套题 / 案例 / 论文…">${escapeHtml(todayCk.content)}</textarea></label>
        <label class="rk-form-field">不会的知识点
          <textarea class="textarea" id="ck_weak" style="min-height:60px" placeholder="卡住的地方，周末 / 复盘时集中攻破">${escapeHtml(todayCk.weak)}</textarea></label>
        <label class="rk-form-field">今日复盘小结
          <textarea class="textarea" id="ck_review" style="min-height:60px" placeholder="今天最大的收获 / 卡点 / 明天怎么调整">${escapeHtml(todayCk.review || '')}</textarea></label>
        <button class="btn btn-primary" id="ck_save">💾 保存今日复盘</button>
      </div>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">📚 已完成章节（自由记录）</div>
      <textarea class="textarea" id="ck_chapters" style="min-height:80px" placeholder="如：ITSS 基础 / 服务生命周期 / 项目风险管理…">${escapeHtml(chapters)}</textarea>
      <button class="btn" id="ck_chapters_save" style="margin-top:8px">保存章节记录</button>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">🕘 打卡历史</div>
      <div class="rk-hist-list">${histHtml}</div>
    </div>
  `;

  body.querySelector('#ck_save').onclick = () => {
    const d = today;
    const obj = {
      hours: body.querySelector('#ck_hours').value,
      questions: body.querySelector('#ck_q').value,
      essays: body.querySelector('#ck_e').value,
      content: body.querySelector('#ck_content').value.trim(),
      weak: body.querySelector('#ck_weak').value.trim(),
      review: body.querySelector('#ck_review').value.trim(),
    };
    const all = loadCheckins();
    all[d] = obj;
    saveCheckins(all);
    toast('今日打卡已保存');
    renderBody(document.getElementById('content'));
  };
  body.querySelector('#ck_chapters_save').onclick = () => {
    saveChapters(body.querySelector('#ck_chapters').value.trim());
    toast('章节记录已保存');
  };
}

// ===================== 错题库 =====================
function renderWrong(body) {
  const list = loadWrong().sort((a, b) => b.createdAt - a.createdAt);
  body.innerHTML = `
    <div class="rk-card">
      <div class="rk-card-head">📕 错题库（真题驱动：记错→归类→复盘）</div>
      <div class="rk-card-desc">记录做错的题，标注高频等级，考前集中复习。</div>
      <button class="btn btn-primary" id="wk_add">＋ 添加错题</button>
    </div>
    <div class="list" id="wkList">
      ${list.length === 0 ? `<div class="rk-empty">还没有错题，刷题时遇到卡壳的题就记下来。</div>` :
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
              <button class="icon-btn btn-sm wk-del">${'🗑'}</button>
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
          ${['综合知识', '案例分析', '论文'].map(s => `<option value="${s}" ${w.subject === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
      <div class="field"><label class="field-label">考点</label>
        <input class="input" id="wk_point" value="${escapeAttr(w.point)}" placeholder="如：ITSS 服务生命周期"></div>
      <div class="field"><label class="field-label">题目 / 情境</label>
        <textarea class="textarea" id="wk_question" style="min-height:70px" placeholder="题干或案例摘要">${escapeHtml(w.question)}</textarea></div>
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

// ===================== 论文进度 =====================
function renderEssayInto(host) {
  const list = loadEssays();
  const done = list.filter(e => e.status === '已完成').length;
  host.innerHTML = `
      <div class="rk-card-head">📄 论文进度（目标：考前 ≥5 篇，每篇约 2500 字）</div>
      <div class="rk-essay-bar">
        <div class="rk-essay-bar-fill" style="width:${done / 5 * 100}%"></div>
        <span class="rk-essay-bar-text">${done}/5 完成</span>
      </div>
      <div class="rk-card-desc">统一模板：①项目背景 ②理论介绍 ③项目实践 ④问题与解决 ⑤总结。符合要求即可，不是写文学作品。</div>
    <div class="rk-essay-list">
      ${list.map(e => `
        <div class="rk-essay-item" data-id="${e.id}">
          <div class="rk-essay-top">
            <div class="rk-essay-topic">${escapeHtml(e.topic)}</div>
            <span class="badge ${e.status === '已完成' ? 'badge-green' : e.status === '草稿' ? 'badge-amber' : 'badge-gray'}">${e.status}</span>
          </div>
          <div class="rk-essay-row">
            <label class="rk-form-field">字数
              <input class="input rk-essay-words" type="number" min="0" data-id="${e.id}" value="${escapeAttr(e.words)}" placeholder="0"></label>
            <button class="btn btn-sm rk-essay-status" data-id="${e.id}">切换状态</button>
            ${e.date ? `<span class="rk-essay-date">✓ ${e.date}</span>` : ''}
          </div>
        </div>`).join('')}
    </div>
  `;
  host.querySelectorAll('.rk-essay-words').forEach(inp => {
    inp.onchange = () => {
      const list2 = loadEssays();
      const it = list2.find(x => x.id === inp.dataset.id);
      it.words = Number(inp.value) || 0;
      saveEssays(list2);
      toast('字数已更新');
    };
  });
  host.querySelectorAll('.rk-essay-status').forEach(btn => {
    btn.onclick = () => {
      const list2 = loadEssays();
      const it = list2.find(x => x.id === btn.dataset.id);
      const order = ['未开始', '草稿', '已完成'];
      it.status = order[(order.indexOf(it.status) + 1) % order.length];
      if (it.status === '已完成' && !it.date) it.date = todayStr();
      if (it.status !== '已完成') it.date = '';
      saveEssays(list2);
      renderEssayInto(host);
    };
  });
}

// ===================== 每周复盘 + 通过率 =====================
function renderReview(body) {
  const today = todayStr();
  const wkStart = weekMonday(today);
  const pass = computePass();
  const reviews = loadReviews();
  const saved = reviews[wkStart];

  // 本周数据聚合
  const ck = loadCheckins();
  let studyDays = 0, totalHours = 0, totalQuestions = 0, totalEssays = 0, weakList = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(wkStart, i);
    if (d > today) break;
    const c = ck[d];
    if (c && (c.hours > 0 || c.questions > 0 || c.essays > 0 || c.content)) {
      studyDays++;
      totalHours += Number(c.hours) || 0;
      totalQuestions += Number(c.questions) || 0;
      totalEssays += Number(c.essays) || 0;
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
      <div class="rk-card-desc">综合：学习出勤 40% + 论文完成 30% + 刷题量 15% + 阶段进度 15%。</div>
    </div>

    <div class="rk-card">
      <div class="rk-card-head">📝 本周备考总结（${wkStart.slice(5)} 起本周）</div>
      <div class="rk-week-stats">
        <div class="rk-stat"><div class="rk-stat-num">${studyDays}</div><div class="rk-stat-label">学习天数</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalHours.toFixed(1)}</div><div class="rk-stat-label">学习时长(h)</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalQuestions}</div><div class="rk-stat-label">刷题(题)</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalEssays}</div><div class="rk-stat-label">论文(篇)</div></div>
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
      stats: { studyDays, totalHours, totalQuestions, totalEssays },
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
    if (c && (c.hours > 0 || c.questions > 0 || c.essays > 0 || c.content)) studyDays++;
  });
  const studyRate = fromStart > 0 ? Math.min(studyDays / fromStart, 1) : (studyDays > 0 ? 1 : 0);
  const essays = loadEssays().filter(e => e.status === '已完成').length;
  const essayRate = Math.min(essays / 5, 1);
  let totalQ = 0;
  Object.values(ck).forEach(c => totalQ += Number(c.questions) || 0);
  const qRate = Math.min(totalQ / 800, 1);
  const ph = getPhase(today);
  const phaseProgress = ph ? (ph.key === 'base' ? 0.33 : ph.key === 'strong' ? 0.66 : ph.key === 'sprint' ? 0.9 : 1) : 0;
  const score = studyRate * 0.4 + essayRate * 0.3 + qRate * 0.15 + phaseProgress * 0.15;
  return Math.max(0, Math.min(1, score));
}

function passInfoOf(score) {
  if (score >= 0.9) return { band: '通过概率高 ✅', cls: 'pass-high' };
  if (score >= 0.7) return { band: '需要保持 🟡', cls: 'pass-mid' };
  if (score >= 0.5) return { band: '需要加强 🟠', cls: 'pass-low' };
  return { band: '需要重新调整 🔴', cls: 'pass-bad' };
}
