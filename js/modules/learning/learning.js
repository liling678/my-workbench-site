// learning.js — 杂七杂八的学习：塔罗牌学习 + 英语学习每日计划
import { registerSection, registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const TAROT_KEY = 'learning_tarot';
const EN_PLAN_KEY = 'english_study_plan';     // 每周学习计划（按星期几安排）
const EN_META_KEY = 'english_plan_meta';       // { startDate, examDate, roadmap }

function loadTarot() { return Storage.get(TAROT_KEY, []); }
function saveTarot(d) { Storage.set(TAROT_KEY, d); }
function loadPlan() { return Storage.get(EN_PLAN_KEY, []); }
function savePlan(d) { Storage.set(EN_PLAN_KEY, d); }
function loadMeta() {
  return Storage.get(EN_META_KEY, { startDate: todayStr(), examDate: '', roadmap: DEFAULT_ROADMAP });
}
function saveMeta(d) { Storage.set(EN_META_KEY, d); }

const TAROT_TABS = [
  { id: 'cards', name: '牌义笔记' },
  { id: 'spreads', name: '牌阵' },
];
const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 老师预填的整体备考路线（可编辑）
const DEFAULT_ROADMAP = `【整体备考规划】（以 12 周为例，按你的考试日期自行调整）
阶段一 · 基础打底（第 1–3 周）
· 每天 30 个核心词，建立词汇底；顺手梳理语法薄弱点
· 听力先适应语速，阅读练扫读/略读，暂时不追求正确率
· 每日约 1.5 小时

阶段二 · 分项突破（第 4–8 周）
· 听力：Section 精听 + 笔记；阅读：同义替换专项
· 写作：Task1 / Task2 轮流各练；口语：Part1/2 每日 1 题
· 每日约 2–2.5 小时

阶段三 · 套题冲刺（第 9–12 周）
· 每周 2 套完整模考（严格计时），当天错题清零
· 口语 Part3 辩证表达、写作打磨个人模板
· 每日约 3 小时

每周节奏：周一~周五分项训练，周六模考，周日复盘+休息。
通用原则：固定时段形成习惯；输入(听/读)与输出(说/写)交替；当天错当天清。`;

// 老师预填的每日训练模板（纯清单，具体练习用你自己的 App）
const SEED_WEEK = [
  ['听力 Section 2 精听 30min', '阅读 Passage1 同义替换 20min', '核心词 30 个'],
  ['口语 Part1 题库 5 题（自录练习）', '写作 Task1 图表作文 1 篇', '核心词 30 个'],
  ['阅读 Passage2/3 长难句拆解', '听力 Section3 学术对话笔记', '核心词 30 个'],
  ['口语 Part2 话题卡 1 个（说满 2 分钟）', '写作 Task2 议论文 1 篇', '核心词 30 个'],
  ['听力 Section4 填空专项', '阅读套题 1 篇（计时）', '核心词 30 个'],
  ['完整模考 1 套（严格计时）', '错题复盘 + 生词整理'],
  ['周复盘 + 口语 Part3 辩证表达', '休息调整'],
];

let tarotTab = 'cards';

function todayIdx() { return (new Date().getDay() + 6) % 7; } // 周一=0 … 周日=6
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function daysBetween(a, b) { // a、b 为 YYYY-MM-DD，返回 b-a 的天数
  if (!a || !b) return null;
  const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00');
  return Math.round(ms / 86400000);
}

// 首次打开自动种入老师排好的计划（仅当为空，不覆盖用户已改的内容）
function ensureSeed() {
  if (loadPlan().length === 0) {
    const list = [];
    SEED_WEEK.forEach((arr, day) => arr.forEach(text => {
      list.push({ id: Storage.uid(), day, text, doneDates: [] });
    }));
    savePlan(list);
  }
  const meta = loadMeta();
  if (!meta.roadmap) { meta.roadmap = DEFAULT_ROADMAP; saveMeta(meta); }
  if (!meta.startDate) { meta.startDate = todayStr(); saveMeta(meta); }
}

export function initLearning() {
  registerSection('learning', '杂七杂八的学习', { icon: Icons.book });

  // 塔罗牌学习
  registerModule('learning-tarot', {
    section: 'learning',
    title: '塔罗牌学习',
    icon: Icons.tarot,
    render(container) {
      const cards = loadTarot().filter(r => r.type === 'card');
      const spreads = loadTarot().filter(r => r.type === 'spread');
      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">塔罗牌学习</div>
          <div class="page-desc">记录牌义、牌阵、解读心得</div>
        </div>
        <div class="tabs">
          ${TAROT_TABS.map(t => `<div class="tab ${t.id===tarotTab?'active':''}" data-tab="${t.id}">${t.name} (${t.id==='cards'?cards.length:spreads.length})</div>`).join('')}
        </div>
        <div id="tarotContent"></div>
      `;
      container.querySelectorAll('.tab').forEach(el => {
        el.onclick = () => {
          tarotTab = el.dataset.tab;
          container.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tarotTab));
          renderTarotTab(container);
        };
      });
      renderTarotTab(container);
    }
  });

  // 英语学习 · 每日计划（老师排好，可手动调整，每天自动更新）
  registerModule('learning-enplan', {
    section: 'learning',
    title: '英语学习',
    icon: Icons.grad,
    render(container) { ensureSeed(); renderEnPlan(container); }
  });
}

// ===================== 塔罗牌（保持不变） =====================
function renderTarotTab(container) {
  const contentEl = container.querySelector('#tarotContent');
  if (tarotTab === 'cards') renderTarotCards(container, contentEl);
  else renderTarotSpreads(container, contentEl);
}

function renderTarotCards(container, el) {
  const cards = loadTarot().filter(r => r.type === 'card').sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn-primary" id="addCardBtn">${Icons.plus} 添加牌义</button>
    </div>
    <div class="list" id="cardList"></div>
  `;
  const listEl = el.querySelector('#cardList');
  if (cards.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.tarot}</div><div class="empty-title">还没有牌义笔记</div><div class="empty-desc">记录每张牌的含义、正逆位、关键词</div></div>`;
  } else {
    listEl.innerHTML = cards.map(c => `
      <div class="list-item" data-id="${c.id}">
        <div class="list-item-head">
          <div style="flex:1;min-width:0">
            <div class="flex items-center gap-8 mb-8">
              ${c.arcana === 'major' ? '<span class="badge badge-purple">大阿卡纳</span>' : '<span class="badge badge-blue">小阿卡纳</span>'}
              ${c.upright ? '<span class="badge badge-green">正位</span>' : '<span class="badge badge-amber">逆位</span>'}
            </div>
            <div class="list-item-title">${escapeHtml(c.name)}</div>
            ${c.keywords ? `<div class="list-item-body" style="margin-top:6px"><strong>关键词：</strong>${escapeHtml(c.keywords)}</div>` : ''}
            ${c.meaning ? `<div class="list-item-body">${escapeHtml(c.meaning)}</div>` : ''}
          </div>
          <div class="list-item-actions">
            <button class="icon-btn btn-sm card-edit">${Icons.edit}</button>
            <button class="icon-btn btn-sm card-del">${Icons.trash}</button>
          </div>
        </div>
        <div class="list-item-meta"><span>${fmtDate(c.createdAt)}</span></div>
      </div>
    `).join('');
    listEl.querySelectorAll('.list-item').forEach(item => {
      const id = item.dataset.id;
      item.querySelector('.card-edit').onclick = () => openCardForm(container, id);
      item.querySelector('.card-del').onclick = async () => {
        if (await confirmDialog({ title: '删除', message: '确定删除这条牌义笔记吗？', confirmText: '删除', danger: true })) {
          saveTarot(loadTarot().filter(r => r.id !== id));
          renderTarotTab(container);
          toast('已删除');
        }
      };
    });
  }
  el.querySelector('#addCardBtn').onclick = () => openCardForm(container, null);
}

function openCardForm(container, id) {
  const data = loadTarot();
  const card = id ? data.find(r => r.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑牌义' : '添加牌义',
    body: `
      <div class="field"><label class="field-label">牌名 <span class="req">*</span></label>
        <input class="input" id="t_name" value="${escapeAttr(card.name)}" placeholder="如：愚者 The Fool" autofocus></div>
      <div class="form-row">
        <div class="field"><label class="field-label">分类</label>
          <select class="select" id="t_arcana">
            <option value="major" ${card.arcana==='major'?'selected':''}>大阿卡纳</option>
            <option value="minor" ${card.arcana==='minor'?'selected':''}>小阿卡纳</option>
          </select></div>
        <div class="field"><label class="field-label">正逆位</label>
          <select class="select" id="t_upright">
            <option value="1" ${card.upright!==false?'selected':''}>正位</option>
            <option value="0" ${card.upright===false?'selected':''}>逆位</option>
          </select></div>
      </div>
      <div class="field"><label class="field-label">关键词</label>
        <input class="input" id="t_keywords" value="${escapeAttr(card.keywords)}" placeholder="如：新的开始、冒险、直觉"></div>
      <div class="field"><label class="field-label">牌义解读</label>
        <textarea class="textarea" id="t_meaning" style="min-height:120px" placeholder="详细解读…">${escapeHtml(card.meaning)}</textarea></div>`,
    foot: `<button class="btn" id="t_cancel">取消</button><button class="btn btn-primary" id="t_save">保存</button>`
  });
  document.getElementById('t_cancel').onclick = closeModal;
  document.getElementById('t_save').onclick = () => {
    const name = document.getElementById('t_name').value.trim();
    if (!name) { toast('请填写牌名'); return; }
    const payload = {
      type: 'card', name,
      arcana: document.getElementById('t_arcana').value,
      upright: document.getElementById('t_upright').value === '1',
      keywords: document.getElementById('t_keywords').value.trim(),
      meaning: document.getElementById('t_meaning').value.trim(),
    };
    const list = loadTarot();
    if (isEdit) {
      const i = list.findIndex(r => r.id === id);
      list[i] = { ...list[i], ...payload };
    } else {
      list.push({ id: Storage.uid(), createdAt: Date.now(), ...payload });
    }
    saveTarot(list);
    closeModal();
    renderTarotTab(container);
    toast(isEdit ? '已保存' : '已添加');
  };
}

function renderTarotSpreads(container, el) {
  const spreads = loadTarot().filter(r => r.type === 'spread').sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn-primary" id="addSpreadBtn">${Icons.plus} 添加牌阵</button>
    </div>
    <div class="list" id="spreadList"></div>
  `;
  const listEl = el.querySelector('#spreadList');
  if (spreads.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.tarot}</div><div class="empty-title">还没有牌阵记录</div><div class="empty-desc">记录牌阵结构、位置含义、解读</div></div>`;
  } else {
    listEl.innerHTML = spreads.map(s => `
      <div class="list-item" data-id="${s.id}">
        <div class="list-item-head">
          <div style="flex:1;min-width:0">
            <div class="list-item-title">${escapeHtml(s.name)}</div>
            ${s.positions ? `<div class="list-item-body" style="margin-top:6px"><strong>位置：</strong>${escapeHtml(s.positions)}</div>` : ''}
            ${s.interpretation ? `<div class="list-item-body">${escapeHtml(s.interpretation)}</div>` : ''}
          </div>
          <div class="list-item-actions">
            <button class="icon-btn btn-sm spread-edit">${Icons.edit}</button>
            <button class="icon-btn btn-sm spread-del">${Icons.trash}</button>
          </div>
        </div>
        <div class="list-item-meta"><span>${fmtDate(s.createdAt)}</span></div>
      </div>
    `).join('');
    listEl.querySelectorAll('.list-item').forEach(item => {
      const id = item.dataset.id;
      item.querySelector('.spread-edit').onclick = () => openSpreadForm(container, id);
      item.querySelector('.spread-del').onclick = async () => {
        if (await confirmDialog({ title: '删除', message: '确定删除这个牌阵吗？', confirmText: '删除', danger: true })) {
          saveTarot(loadTarot().filter(r => r.id !== id));
          renderTarotTab(container);
          toast('已删除');
        }
      };
    });
  }
  el.querySelector('#addSpreadBtn').onclick = () => openSpreadForm(container, null);
}

function openSpreadForm(container, id) {
  const data = loadTarot();
  const spread = id ? data.find(r => r.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑牌阵' : '添加牌阵',
    body: `
      <div class="field"><label class="field-label">牌阵名称 <span class="req">*</span></label>
        <input class="input" id="s_name" value="${escapeAttr(spread.name)}" placeholder="如：凯尔特十字阵" autofocus></div>
      <div class="field"><label class="field-label">位置说明</label>
        <textarea class="textarea" id="s_positions" style="min-height:80px" placeholder="每个位置的含义，如：1.过去 2.现在 3.未来…">${escapeHtml(spread.positions)}</textarea></div>
      <div class="field"><label class="field-label">解读笔记</label>
        <textarea class="textarea" id="s_interp" style="min-height:100px" placeholder="解读心得…">${escapeHtml(spread.interpretation)}</textarea></div>`,
    foot: `<button class="btn" id="s_cancel">取消</button><button class="btn btn-primary" id="s_save">保存</button>`
  });
  document.getElementById('s_cancel').onclick = closeModal;
  document.getElementById('s_save').onclick = () => {
    const name = document.getElementById('s_name').value.trim();
    if (!name) { toast('请填写牌阵名称'); return; }
    const payload = {
      type: 'spread', name,
      positions: document.getElementById('s_positions').value.trim(),
      interpretation: document.getElementById('s_interp').value.trim(),
    };
    const list = loadTarot();
    if (isEdit) {
      const i = list.findIndex(r => r.id === id);
      list[i] = { ...list[i], ...payload };
    } else {
      list.push({ id: Storage.uid(), createdAt: Date.now(), ...payload });
    }
    saveTarot(list);
    closeModal();
    renderTarotTab(container);
    toast(isEdit ? '已保存' : '已添加');
  };
}

// ===================== 英语学习 · 每日计划（老师排好 + 自动更新） =====================
function renderEnPlan(container) {
  const items = loadPlan();
  const meta = loadMeta();
  const tIdx = todayIdx();
  const tStr = todayStr();
  const todayItems = items.filter(i => i.day === tIdx);
  const doneCount = todayItems.filter(i => (i.doneDates || []).includes(tStr)).length;

  // 日期进度
  let progressBits = [`📅 今日（${WEEK_DAYS[tIdx]}）`];
  const dayFromStart = daysBetween(meta.startDate, tStr);
  if (dayFromStart !== null) {
    if (dayFromStart >= 0) {
      const week = Math.floor(dayFromStart / 7) + 1;
      progressBits.push(`备考第 ${dayFromStart + 1} 天`);
      progressBits.push(`第 ${week} 周`);
    } else {
      progressBits.push(`还有 ${-dayFromStart} 天开始`);
    }
  }
  const toExam = daysBetween(tStr, meta.examDate);
  if (toExam !== null) progressBits.push(toExam >= 0 ? `距考试 ${toExam} 天` : '考试已过期');

  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">英语学习 · 每日计划</div>
      <div class="page-desc">老师帮你排好了整体路线和每日清单，可手动调整，每天自动更新</div>
    </div>

    <div class="plan-progress">${progressBits.join(' · ')}</div>

    <div class="plan-meta">
      <label class="plan-meta-field">开始日期
        <input type="date" class="input" id="m_start" value="${escapeAttr(meta.startDate)}">
      </label>
      <label class="plan-meta-field">考试日期
        <input type="date" class="input" id="m_exam" value="${escapeAttr(meta.examDate)}">
      </label>
      <button class="btn plan-meta-edit" id="roadmapEditBtn">${Icons.edit} 编辑整体规划</button>
    </div>

    <div class="plan-overview">
      <div class="plan-overview-head">📘 整体备考规划</div>
      <div class="plan-overview-body">${escapeHtml(meta.roadmap)}</div>
    </div>

    <div class="plan-today">
      <div class="plan-today-head">
        <span class="plan-today-badge">今日任务</span>
        <span class="plan-today-prog">${doneCount}/${todayItems.length} 已完成</span>
      </div>
      ${todayItems.length === 0
        ? `<div class="plan-today-empty">今天还没安排，去下方给「${WEEK_DAYS[tIdx]}」加几条计划吧</div>`
        : todayItems.map(i => `
          <label class="plan-check ${(i.doneDates || []).includes(tStr) ? 'on' : ''}">
            <input type="checkbox" data-id="${i.id}" ${(i.doneDates || []).includes(tStr) ? 'checked' : ''}>
            <span>${escapeHtml(i.text)}</span>
          </label>`).join('')}
    </div>

    <div class="plan-week">
      ${WEEK_DAYS.map((name, idx) => {
        const dayItems = items.filter(i => i.day === idx);
        return `
        <div class="plan-day ${idx === tIdx ? 'is-today' : ''}">
          <div class="plan-day-head">
            <span class="plan-day-name">${name}</span>
            ${idx === tIdx ? '<span class="plan-day-tag">今天</span>' : ''}
            <button class="icon-btn btn-sm plan-day-add" data-day="${idx}" title="添加">${Icons.plus}</button>
          </div>
          <div class="plan-day-list">
            ${dayItems.length === 0
              ? '<div class="plan-day-none">—</div>'
              : dayItems.map(i => `
                <div class="plan-day-item">
                  <span>${escapeHtml(i.text)}</span>
                  <button class="plan-day-del" data-id="${i.id}" title="删除">${Icons.trash}</button>
                </div>`).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>
  `;

  // 日期变更
  container.querySelector('#m_start').onchange = (e) => {
    const m = loadMeta(); m.startDate = e.target.value; saveMeta(m); renderEnPlan(container);
  };
  container.querySelector('#m_exam').onchange = (e) => {
    const m = loadMeta(); m.examDate = e.target.value; saveMeta(m); renderEnPlan(container);
  };
  container.querySelector('#roadmapEditBtn').onclick = () => openRoadmapEdit(container);

  // 今日勾选（按日期记录，跨天自动重置）
  container.querySelectorAll('.plan-check input').forEach(cb => {
    cb.onchange = () => {
      const list = loadPlan();
      const it = list.find(x => x.id === cb.dataset.id);
      if (!it) return;
      it.doneDates = it.doneDates || [];
      if (cb.checked) { if (!it.doneDates.includes(tStr)) it.doneDates.push(tStr); }
      else { it.doneDates = it.doneDates.filter(d => d !== tStr); }
      savePlan(list);
      renderEnPlan(container);
    };
  });

  // 删除某条计划
  container.querySelectorAll('.plan-day-del').forEach(btn => {
    btn.onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '删除这条每日计划吗？', confirmText: '删除', danger: true })) {
        savePlan(loadPlan().filter(x => x.id !== btn.dataset.id));
        renderEnPlan(container);
        toast('已删除');
      }
    };
  });

  // 给某天添加计划
  container.querySelectorAll('.plan-day-add').forEach(btn => {
    btn.onclick = () => openPlanAdd(container, Number(btn.dataset.day));
  });
}

function openRoadmapEdit(container) {
  const meta = loadMeta();
  openModal({
    title: '编辑整体备考规划',
    body: `
      <div class="field"><label class="field-label">整体路线（可自由改写）</label>
        <textarea class="textarea" id="r_text" style="min-height:300px" placeholder="写下你的整体备考规划…">${escapeHtml(meta.roadmap)}</textarea></div>
      <div class="form-hint">支持多阶段、目标分、周节奏等；换行即分段。具体练习仍用你常用的学习 App。</div>`,
    foot: `<button class="btn" id="r_cancel">取消</button><button class="btn btn-primary" id="r_save">保存</button>`
  });
  document.getElementById('r_cancel').onclick = closeModal;
  document.getElementById('r_save').onclick = () => {
    const text = document.getElementById('r_text').value;
    const m = loadMeta(); m.roadmap = text; saveMeta(m);
    closeModal();
    renderEnPlan(container);
    toast('已保存');
  };
}

function openPlanAdd(container, day) {
  openModal({
    title: `添加计划 · ${WEEK_DAYS[day]}`,
    body: `
      <div class="field"><label class="field-label">要学什么 <span class="req">*</span></label>
        <textarea class="textarea" id="p_text" style="min-height:90px" placeholder="如：背 20 个核心词 / 精听 1 篇 Section 3 / 写 1 篇大作文" autofocus></textarea></div>
      <div class="form-hint">每行一条；这里是「计划清单」，真正练习用你常用的学习 App。</div>`,
    foot: `<button class="btn" id="p_cancel">取消</button><button class="btn btn-primary" id="p_save">添加</button>`
  });
  document.getElementById('p_cancel').onclick = closeModal;
  document.getElementById('p_save').onclick = () => {
    const raw = document.getElementById('p_text').value.trim();
    if (!raw) { toast('请填写内容'); return; }
    const list = loadPlan();
    raw.split('\n').map(s => s.trim()).filter(Boolean).forEach(t => {
      list.push({ id: Storage.uid(), day, text: t, doneDates: [] });
    });
    savePlan(list);
    closeModal();
    renderEnPlan(container);
    toast('已添加');
  };
}

// ===================== 工具 =====================
function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
