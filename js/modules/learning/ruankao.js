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
    { id: 'plan', name: '今日计划' },
    { id: 'checkin', name: '每日监督' },
    { id: 'wrong', name: '错题库' },
    { id: 'essay', name: '论文进度' },
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
  else if (rkTab === 'essay') renderEssay(body);
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
  if (ph && ph.key !== 'exam' && !todayCk) coach += ' 今天还没打卡，记得学完来「每日监督」记一笔。';

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
      <div class="rk-card-head">📊 累计数据（本地）</div>
      <div class="rk-stats">
        <div class="rk-stat"><div class="rk-stat-num">${studyDays}</div><div class="rk-stat-label">累计学习天数</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalHours.toFixed(1)}</div><div class="rk-stat-label">累计学习时间(h)</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${totalQuestions}</div><div class="rk-stat-label">刷题总数</div></div>
        <div class="rk-stat"><div class="rk-stat-num">${essaysDone}/5</div><div class="rk-stat-label">论文完成</div></div>
      </div>
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
}

// ===================== 今日计划生成 =====================
function renderPlan(body) {
  const meta = loadMeta();
  const today = todayStr();
  const ph = getPhase(today);
  const wd = new Date().getDay();
  const wdName = WEEK_DAYS[wd];
  const isWeekend = (wd === 0 || wd === 6);

  let header;
  if (ph && ph.key === 'exam') header = '今天就是考试日，轻装上阵，祝你一次通过！';
  else if (!ph) header = '当前处于备考前（8-10 之前），可先熟悉整体规划与资料，下方为参考模板。';
  else header = `今日处于【${ph.name}】，按阶段重点 + 在职节奏生成。`;

  body.innerHTML = `
    <div class="rk-card">
      <div class="rk-card-head">🗓 今日学习计划生成器</div>
      <div class="rk-plan-hint">${escapeHtml(header)} 点击按钮按角色规则生成「日期 / 目标 / 时长 / 任务 / 刷题 / 论文 / 完成标准 / 复盘」完整计划。</div>
      <button class="btn btn-primary" id="rkGenPlan">⚡ 生成今日学习计划（${wdName}）</button>
      <div id="rkPlanOut" style="margin-top:14px"></div>
    </div>
  `;

  body.querySelector('#rkGenPlan').onclick = () => {
    body.querySelector('#rkPlanOut').innerHTML = buildTodayPlan(today, ph, wd, isWeekend);
    toast('已生成今日计划');
  };
}

function buildTodayPlan(today, ph, wd, isWeekend) {
  const wdName = WEEK_DAYS[wd];
  const evening = { 1: '综合知识学习（IT服务管理 / 项目管理理论）', 2: '综合刷题（20–30 选择题 + 解析）', 3: '案例分析（1 题：问题→分析→理论→措施→总结）', 4: '论文训练（写 / 改 1 篇，约 2500 字）', 5: '错题整理 + 本周薄弱点复盘' };
  const focus = ph ? ph.focus : '先熟悉资料与整体规划。';

  let tasks, studyTime, questions, essayTask, doneStandard;
  if (isWeekend) {
    tasks = [
      ['上午（约 2h）', '学习新知识：按当前阶段重点推进理论（' + (ph ? ph.name.split(' · ')[1] : '基础') + '）'],
      ['下午（约 1.5h）', '真题训练：套题 / 案例分析计时练习'],
      ['晚上（约 0.5h）', '总结复盘：错题归档 + 明日计划'],
    ];
    studyTime = '约 4 小时';
    questions = '40–50 题（套题 / 计时）';
    essayTask = (wd === 0 || wd === 6) ? '写 / 打磨 1 篇论文（约 2500 字）' : '无（按需积累素材）';
    doneStandard = '上午新知 + 下午真题 + 晚上复盘全部完成；错题当天归档。';
  } else {
    tasks = [
      ['上午（30min）', '复习昨日内容：快速回顾 + 温习错题'],
      ['工作碎片（60min）', '刷题 20–30 题 + 看解析 + 整理错题'],
      ['晚上（90min）', evening[wd] || '综合 / 案例混合复盘'],
    ];
    studyTime = '约 2 小时（在职最低线）';
    questions = '20–30 题';
    essayTask = (wd === 4) ? '写 / 改 1 篇论文（约 2500 字）' : '无（周四固定论文日，按需积累）';
    doneStandard = '完成以上 3 段任务；碎片刷题 ≥20 题；晚上模块有产出（笔记 / 1 题案例 / 论文段落 / 错题归档）。';
  }

  const taskHtml = tasks.map(t => `<tr><td class="rk-plan-when">${escapeHtml(t[0])}</td><td>${escapeHtml(t[1])}</td></tr>`).join('');

  return `
    <div class="rk-plan-card">
      <div class="rk-plan-line"><b>日期：</b>${today}（${wdName}）${isWeekend ? ' · 周末' : ' · 工作日'}</div>
      <div class="rk-plan-line"><b>当前阶段：</b>${ph ? escapeHtml(ph.name) : '备考前'}</div>
      <div class="rk-plan-line"><b>今日学习目标：</b>按阶段推进，保证当日产出（综合 / 案例 / 论文至少一项落地）。</div>
      <div class="rk-plan-line"><b>预计学习时间：</b>${escapeHtml(studyTime)}</div>
      <div class="rk-plan-line"><b>学习内容：</b>${escapeHtml(focus)}</div>
      <div class="rk-plan-sub">详细任务</div>
      <table class="rk-plan-table"><tbody>${taskHtml}</tbody></table>
      <div class="rk-plan-line"><b>刷题数量：</b>${escapeHtml(questions)}</div>
      <div class="rk-plan-line"><b>论文任务：</b>${escapeHtml(essayTask)}</div>
      <div class="rk-plan-line"><b>今日完成标准：</b>${escapeHtml(doneStandard)}</div>
      <div class="rk-plan-sub">复盘问题</div>
      <ul class="rk-plan-ul">
        <li>今天具体学了什么？</li>
        <li>哪些知识点还不会 / 不熟？（记到「每日监督 · 不会的知识点」）</li>
        <li>明天优先补哪一块？</li>
        <li>错题是否当天归档到「错题库」？</li>
      </ul>
    </div>`;
}

// ===================== 每日监督 / 打卡 =====================
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
      <div class="rk-card-head">✅ 今日打卡（${today}）</div>
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
        <button class="btn btn-primary" id="ck_save">💾 保存今日打卡</button>
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
function renderEssay(body) {
  const list = loadEssays();
  const done = list.filter(e => e.status === '已完成').length;
  body.innerHTML = `
    <div class="rk-card">
      <div class="rk-card-head">📄 论文进度（目标：考前 ≥5 篇，每篇约 2500 字）</div>
      <div class="rk-essay-bar">
        <div class="rk-essay-bar-fill" style="width:${done / 5 * 100}%"></div>
        <span class="rk-essay-bar-text">${done}/5 完成</span>
      </div>
      <div class="rk-card-desc">统一模板：①项目背景 ②理论介绍 ③项目实践 ④问题与解决 ⑤总结。符合要求即可，不是写文学作品。</div>
    </div>
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
  body.querySelectorAll('.rk-essay-words').forEach(inp => {
    inp.onchange = () => {
      const list2 = loadEssays();
      const it = list2.find(x => x.id === inp.dataset.id);
      it.words = Number(inp.value) || 0;
      saveEssays(list2);
      toast('字数已更新');
    };
  });
  body.querySelectorAll('.rk-essay-status').forEach(btn => {
    btn.onclick = () => {
      const list2 = loadEssays();
      const it = list2.find(x => x.id === btn.dataset.id);
      const order = ['未开始', '草稿', '已完成'];
      it.status = order[(order.indexOf(it.status) + 1) % order.length];
      if (it.status === '已完成' && !it.date) it.date = todayStr();
      if (it.status !== '已完成') it.date = '';
      saveEssays(list2);
      renderEssay(body);
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
