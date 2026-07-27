// learning.js — 杂七杂八的学习：塔罗牌学习 + 雅思备考（资深老师设计）
import { registerSection, registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const TAROT_KEY = 'learning_tarot';

// ===== 雅思备考数据键 =====
const IELTS_WORDS_KEY = 'ielts_words';     // 单词库（艾宾浩斯）
const IELTS_SPEAK_KEY = 'ielts_speak';     // 口语练习
const IELTS_LISTEN_KEY = 'ielts_listen';   // 听力素材
const IELTS_SYN_KEY = 'ielts_syn';         // 阅读同义替换词库
const IELTS_ERR_KEY = 'ielts_err';         // 通用错题本
const IELTS_WRITE_KEY = 'ielts_write';     // 写作语料 + 练习
const IELTS_PLAN_KEY = 'ielts_plan';       // 备考中心（目标分/笔记/每日新词）

// 艾宾浩斯遗忘曲线复习间隔（天）：学完第1/2/4/7/15/30天各复习一次
const EBB = [1, 2, 4, 7, 15, 30];
const STAGE_MAX = 6; // 完成全部 6 次复习即掌握

function loadTarot() { return Storage.get(TAROT_KEY, []); }
function saveTarot(d) { Storage.set(TAROT_KEY, d); }
function loadWords() { return Storage.get(IELTS_WORDS_KEY, []); }
function saveWords(d) { Storage.set(IELTS_WORDS_KEY, d); }
function loadSpeak() { return Storage.get(IELTS_SPEAK_KEY, []); }
function saveSpeak(d) { Storage.set(IELTS_SPEAK_KEY, d); }
function loadListen() { return Storage.get(IELTS_LISTEN_KEY, []); }
function saveListen(d) { Storage.set(IELTS_LISTEN_KEY, d); }
function loadSyn() { return Storage.get(IELTS_SYN_KEY, []); }
function saveSyn(d) { Storage.set(IELTS_SYN_KEY, d); }
function loadErr() { return Storage.get(IELTS_ERR_KEY, []); }
function saveErr(d) { Storage.set(IELTS_ERR_KEY, d); }
function loadWrite() { return Storage.get(IELTS_WRITE_KEY, []); }
function saveWrite(d) { Storage.set(IELTS_WRITE_KEY, d); }
function loadPlan() { return Storage.get(IELTS_PLAN_KEY, { notes: '', dailyNew: 20 }); }
function savePlan(d) { Storage.set(IELTS_PLAN_KEY, d); }

const TAROT_TABS = [
  { id: 'cards', name: '牌义笔记' },
  { id: 'spreads', name: '牌阵' },
];

let tarotTab = 'cards';
let ieltsTab = 'words';
let readSub = 'syn';
let writingSub = 'corpus';

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

  // 雅思备考
  registerModule('learning-ielts', {
    section: 'learning',
    title: '雅思备考',
    icon: Icons.grad,
    render(container) {
      const tabs = [
        { id: 'words', name: '单词库' },
        { id: 'speak', name: '口语' },
        { id: 'listen', name: '听力' },
        { id: 'read', name: '阅读' },
        { id: 'writing', name: '写作' },
        { id: 'prep', name: '备考' },
      ];
      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">雅思备考 · 跟着老师学</div>
          <div class="page-desc">艾宾浩斯每日背词 · 听说读写分项突破</div>
        </div>
        <div class="tabs tabs-scroll">
          ${tabs.map(t => `<div class="tab ${t.id===ieltsTab?'active':''}" data-tab="${t.id}">${t.name}</div>`).join('')}
        </div>
        <div id="ieltsContent"></div>
      `;
      container.querySelectorAll('.tab').forEach(el => {
        el.onclick = () => {
          ieltsTab = el.dataset.tab;
          container.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === ieltsTab));
          renderIeltsTab(container);
        };
      });
      renderIeltsTab(container);
    }
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

// ===================== 雅思备考 =====================
function renderIeltsTab(container) {
  const el = container.querySelector('#ieltsContent');
  if (ieltsTab === 'words') renderWords(container, el);
  else if (ieltsTab === 'speak') renderSpeak(container, el);
  else if (ieltsTab === 'listen') renderListen(container, el);
  else if (ieltsTab === 'read') renderRead(container, el);
  else if (ieltsTab === 'writing') renderWriting(container, el);
  else renderPrep(container, el);
}

function endOfToday() {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime();
}
function dayKey(ts) {
  const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
// 今天是否应复习（已学过的词，stage 未毕业，nextReview 落在今天或之前）
function isDueToday(w) {
  return w.learnedDate && (w.stage || 0) < STAGE_MAX && (w.nextReview || 0) <= endOfToday();
}
function isMastered(w) { return (w.stage || 0) >= STAGE_MAX; }

// ---------- 单词库（艾宾浩斯间隔重复） ----------
let reviewQueue = [];
let reviewIndex = 0;
let reviewDone = 0;

function newWordsAvailable() { return loadWords().filter(w => !w.learnedDate); }
function dueTodayWords() { return loadWords().filter(isDueToday); }

function dailyPlan() {
  const plan = loadPlan();
  const dailyNew = plan.dailyNew || 20;
  const avail = newWordsAvailable().length;
  const due = dueTodayWords().length;
  return { dailyNew, newCount: Math.min(dailyNew, avail), dueCount: due, avail };
}

function renderWords(container, el) {
  const words = loadWords();
  const plan = dailyPlan();
  const mastered = words.filter(isMastered).length;
  const todayTotal = plan.newCount + plan.dueCount;
  el.innerHTML = `
    <div class="daily-plan">
      <div class="daily-plan-left">
        <div class="daily-plan-title">📅 今日计划</div>
        <div class="daily-plan-sub">新学 <b>${plan.newCount}</b> 词 · 复习 <b>${plan.dueCount}</b> 词</div>
      </div>
      <button class="btn btn-primary daily-plan-btn" id="practiceBtn">${Icons.fire} 开始今日学习</button>
    </div>
    <div class="daily-ebb">记忆周期：第 1 / 2 / 4 / 7 / 15 / 30 天自动复习（艾宾浩斯）</div>

    <div class="stats-grid">
      <div class="stat-item"><div class="stat-num">${words.length}</div><div class="stat-label">词汇总量</div></div>
      <div class="stat-item"><div class="stat-num">${todayTotal}</div><div class="stat-label">今日待练</div></div>
      <div class="stat-item"><div class="stat-num">${mastered}</div><div class="stat-label">已掌握</div></div>
    </div>
    <div class="toolbar">
      <div class="search">${Icons.search}<input class="input" id="wSearch" placeholder="搜索单词…"></div>
      <div class="spacer"></div>
      <button class="btn" id="importBtn">${Icons.download} 导入</button>
      <button class="btn btn-primary" id="addWordBtn">${Icons.plus} 添加</button>
    </div>
    <div id="wordArea"></div>
  `;
  el.querySelector('#addWordBtn').onclick = () => openWordForm(container, null);
  el.querySelector('#practiceBtn').onclick = () => startPractice(container, el);
  el.querySelector('#importBtn').onclick = () => openImportModal(container, el);
  el.querySelector('#wSearch').addEventListener('input', () => renderWordList(container, el));
  renderWordList(container, el);
}

function renderWordList(container, el) {
  const q = (el.querySelector('#wSearch')?.value || '').toLowerCase().trim();
  const words = loadWords()
    .filter(w => !q || [w.word, w.meaning, w.example, w.note].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.learnedDate || 0) - (a.learnedDate || 0) || b.createdAt - a.createdAt);
  const listEl = el.querySelector('#wordArea');
  if (words.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.grad}</div><div class="empty-title">词库还是空的</div><div class="empty-desc">点「导入」一键载入雅思核心词，或手动添加</div></div>`;
    return;
  }
  listEl.innerHTML = `<div class="list">${words.map(w => {
    let stageLabel, stageCls;
    if (!w.learnedDate) { stageLabel = '未学'; stageCls = 'badge-gray'; }
    else if (isMastered(w)) { stageLabel = '已掌握'; stageCls = 'badge-green'; }
    else { stageLabel = '第' + (w.stage || 0) + '阶'; stageCls = 'badge-blue'; }
    const due = isDueToday(w);
    return `
      <div class="list-item" data-id="${w.id}">
        <div class="list-item-head">
          <div style="flex:1;min-width:0">
            <div class="flex items-center gap-8 mb-8">
              <span class="badge ${stageCls}">${stageLabel}</span>
              ${due ? '<span class="badge badge-amber">待复习</span>' : ''}
              ${w.pos ? `<span class="badge badge-purple">${escapeHtml(w.pos)}</span>` : ''}
            </div>
            <div class="list-item-title">${escapeHtml(w.word)} ${w.phonetic ? `<span style="color:var(--text-muted);font-weight:400;font-size:13px">/${escapeHtml(w.phonetic)}/</span>` : ''}</div>
            ${w.meaning ? `<div class="list-item-body" style="margin-top:6px">${escapeHtml(w.meaning)}</div>` : ''}
            ${w.example ? `<div class="list-item-body" style="font-style:italic;color:var(--text-muted)">${escapeHtml(w.example)}</div>` : ''}
            ${w.note ? `<div class="list-item-body">💡 ${escapeHtml(w.note)}</div>` : ''}
          </div>
          <div class="list-item-actions">
            <button class="icon-btn btn-sm w-edit">${Icons.edit}</button>
            <button class="icon-btn btn-sm w-del">${Icons.trash}</button>
          </div>
        </div>
        <div class="list-item-meta">
          <span>${w.learnedDate ? '学过 ' + fmtDate(w.learnedDate) : '未开始'}</span>
          ${w.reviewedAt ? `<span>上次 ${fmtDate(w.reviewedAt)}</span>` : ''}
        </div>
      </div>`;
  }).join('')}</div>`;
  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.w-edit').onclick = () => openWordForm(container, id);
    item.querySelector('.w-del').onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '确定删除这个单词吗？', confirmText: '删除', danger: true })) {
        saveWords(loadWords().filter(w => w.id !== id));
        renderWords(container, el);
        toast('已删除');
      }
    };
  });
}

function openWordForm(container, id) {
  const words = loadWords();
  const w = id ? words.find(x => x.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑单词' : '添加单词',
    size: 'lg',
    body: `
      <div class="form-row">
        <div class="field"><label class="field-label">单词/短语 <span class="req">*</span></label>
          <input class="input" id="w_word" value="${escapeAttr(w.word)}" placeholder="如：ubiquitous" autofocus></div>
        <div class="field"><label class="field-label">音标</label>
          <input class="input" id="w_ph" value="${escapeAttr(w.phonetic)}" placeholder="juːˈbɪkwɪtəs"></div>
      </div>
      <div class="form-row">
        <div class="field"><label class="field-label">词性</label>
          <select class="select" id="w_pos">
            ${['adj.','adv.','n.','v.','prep.','短语'].map(p=>`<option value="${p}" ${w.pos===p?'selected':''}>${p}</option>`).join('')}
          </select></div>
        <div class="field"><label class="field-label">释义 <span class="req">*</span></label>
          <input class="input" id="w_mean" value="${escapeAttr(w.meaning)}" placeholder="中文释义"></div>
      </div>
      <div class="field"><label class="field-label">例句</label>
        <textarea class="textarea" id="w_example" style="min-height:60px" placeholder="英文例句（尽量贴合雅思语境）">${escapeHtml(w.example)}</textarea></div>
      <div class="field"><label class="field-label">记忆技巧 / 搭配</label>
        <textarea class="textarea" id="w_note" placeholder="词根、近义词、写作搭配…">${escapeHtml(w.note)}</textarea></div>`,
    foot: `<button class="btn" id="w_cancel">取消</button><button class="btn btn-primary" id="w_save">保存</button>`
  });
  document.getElementById('w_cancel').onclick = closeModal;
  document.getElementById('w_save').onclick = () => {
    const word = document.getElementById('w_word').value.trim();
    const meaning = document.getElementById('w_mean').value.trim();
    if (!word || !meaning) { toast('请填写单词和释义'); return; }
    const payload = {
      word,
      phonetic: document.getElementById('w_ph').value.trim(),
      pos: document.getElementById('w_pos').value,
      meaning,
      example: document.getElementById('w_example').value.trim(),
      note: document.getElementById('w_note').value.trim(),
    };
    const list = loadWords();
    if (isEdit) {
      const i = list.findIndex(x => x.id === id);
      list[i] = { ...list[i], ...payload };
    } else {
      list.push({ id: Storage.uid(), createdAt: Date.now(), learnedDate: 0, stage: 0, nextReview: 0, reviewedAt: 0, ...payload });
    }
    saveWords(list);
    closeModal();
    const el = container.querySelector('#ieltsContent');
    renderWords(container, el);
    toast(isEdit ? '已保存' : '已添加');
  };
}

// 开始今日学习：新词(上限 dailyNew) + 今日待复习，组成队列，翻转卡片逐张评级
function startPractice(container, el) {
  const plan = dailyPlan();
  const due = dueTodayWords();
  const fresh = newWordsAvailable().slice(0, plan.newCount);
  reviewQueue = [...due, ...fresh].slice(0, 50);
  reviewIndex = 0;
  reviewDone = 0;
  if (reviewQueue.length === 0) {
    el.querySelector('#wordArea').innerHTML = `<div class="empty"><div class="empty-icon">${Icons.fire}</div><div class="empty-title">今天没有要练的单词 🎉</div><div class="empty-desc">去「导入」补充词库，或明天再来复习</div></div>`;
    return;
  }
  renderPracticeCard(container, el);
}

function renderPracticeCard(container, el) {
  const area = el.querySelector('#wordArea');
  if (reviewIndex >= reviewQueue.length) {
    area.innerHTML = `
      <div class="ielts-practice done">
        <div class="practice-emoji">🎉</div>
        <div class="practice-done-title">本轮练习完成</div>
        <div class="practice-done-sub">今日共练 ${reviewDone} 个单词，坚持就是高分！</div>
        <button class="btn btn-primary" id="backListBtn">返回词库</button>
      </div>`;
    area.querySelector('#backListBtn').onclick = () => renderWords(container, el);
    return;
  }
  const w = reviewQueue[reviewIndex];
  const remain = reviewQueue.length - reviewIndex;
  const isNew = !w.learnedDate;
  area.innerHTML = `
    <div class="ielts-practice">
      <div class="practice-progress">剩余 ${remain} 个 · ${isNew ? '新词' : '复习'}</div>
      <div class="flip-card" id="flipCard">
        <div class="flip-word">${escapeHtml(w.word)}</div>
        ${w.phonetic ? `<div class="flip-phonetic">/${escapeHtml(w.phonetic)}/</div>` : ''}
        <div class="flip-hint" id="flipHint">点击卡片看释义</div>
        <div class="flip-detail" id="flipDetail" style="display:none">
          ${w.pos ? `<div class="flip-pos">${escapeHtml(w.pos)}</div>` : ''}
          ${w.meaning ? `<div class="flip-meaning">${escapeHtml(w.meaning)}</div>` : ''}
          ${w.example ? `<div class="flip-example">${escapeHtml(w.example)}</div>` : ''}
          ${w.note ? `<div class="flip-note">💡 ${escapeHtml(w.note)}</div>` : ''}
        </div>
      </div>
      <div class="flip-actions" id="flipActions" style="display:none">
        <button class="rate-btn rate-unknow" data-rate="0">😣 不认识</button>
        <button class="rate-btn rate-fuzzy" data-rate="1">🤔 模糊</button>
        <button class="rate-btn rate-know" data-rate="2">😎 认识</button>
      </div>
    </div>`;
  const card = area.querySelector('#flipCard');
  const detail = area.querySelector('#flipDetail');
  const hint = area.querySelector('#flipHint');
  const actions = area.querySelector('#flipActions');
  card.onclick = () => {
    detail.style.display = 'block';
    hint.style.display = 'none';
    actions.style.display = 'flex';
  };
  actions.querySelectorAll('.rate-btn').forEach(btn => {
    btn.onclick = () => {
      rateWord(w, Number(btn.dataset.rate));
      reviewIndex++;
      reviewDone++;
      renderPracticeCard(container, el);
    };
  });
}

// 艾宾浩斯评级：认识→升阶拉长安隔；模糊→明天再加练；不认识→打回第0阶
function rateWord(w, rate) {
  const list = loadWords();
  const i = list.findIndex(x => x.id === w.id);
  if (i < 0) return;
  const now = Date.now();
  const DAY = 86400000;
  if (!list[i].learnedDate) list[i].learnedDate = now; // 首次学习记为今天
  if (rate === 2) {
    const stage = Math.min((list[i].stage || 0) + 1, STAGE_MAX);
    list[i].stage = stage;
    list[i].nextReview = list[i].learnedDate + (EBB[stage - 1] || 60) * DAY;
  } else if (rate === 1) {
    list[i].nextReview = now + 1 * DAY; // 明天再练一次，阶数不变
  } else {
    list[i].stage = 0;
    list[i].nextReview = list[i].learnedDate + EBB[0] * DAY; // 打回，明天重学
  }
  list[i].reviewedAt = now;
  saveWords(list);
}

// ---------- 单词导入 ----------
// 内置雅思核心词（老师精选高频词，一键导入后进入每日计划）
const IELTS_CORE_WORDS = [
  ['ubiquitous','juːˈbɪkwɪtəs','adj.','无处不在的','Smartphones are ubiquitous in modern life.'],
  ['alleviate','əˈliːvieɪt','v.','减轻，缓解','New policies aim to alleviate poverty.'],
  ['conventional','kənˈvenʃənl','adj.','传统的，常规的','Conventional methods are not always effective.'],
  ['diminish','dɪˈmɪnɪʃ','v.','减少，削弱','The risk of infection diminished over time.'],
  ['facilitate','fəˈsɪlɪteɪt','v.','促进，使便利','Technology facilitates communication across borders.'],
  ['implement','ˈɪmplɪment','v.','实施，执行','The government implemented strict rules.'],
  ['phenomenon','fəˈnɒmɪnən','n.','现象','Global warming is a worrying phenomenon.'],
  ['sustainable','səˈsteɪnəbl','adj.','可持续的','Sustainable development benefits future generations.'],
  ['unprecedented','ʌnˈpresɪdentɪd','adj.','前所未有的','The pandemic caused unprecedented disruption.'],
  ['controversial','ˌkɒntrəˈvɜːʃl','adj.','有争议的','The policy remains highly controversial.'],
  ['deteriorate','dɪˈtɪəriəreɪt','v.','恶化，变坏','Air quality continued to deteriorate.'],
  ['fundamental','ˌfʌndəˈmentl','adj.','基本的，根本的','Education is fundamental to social mobility.'],
  ['allocate','ˈæləkeɪt','v.','分配，拨出','More funds were allocated to healthcare.'],
  ['compromise','ˈkɒmprəmaɪz','n./v.','妥协，折中','Both sides reached a compromise.'],
  ['evaluate','ɪˈvæljueɪt','v.','评估，评价','We need to evaluate the results carefully.'],
  ['hierarchy','ˈhaɪərɑːki','n.','等级制度','There is a clear hierarchy within the company.'],
  ['inherent','ɪnˈhɪərənt','adj.','固有的，内在的','Every system has inherent risks.'],
  ['manipulate','məˈnɪpjuleɪt','v.','操纵，操作','It is easy to manipulate the data.'],
  ['predominant','prɪˈdɒmɪnənt','adj.','主导的，主要的','The predominant view is that change is needed.'],
  ['subsequently','ˈsʌbsɪkwəntli','adv.','随后，后来','He left and subsequently started his own firm.'],
  ['threshold','ˈθreʃhəʊld','n.','门槛，临界值','We are near the threshold of a breakthrough.'],
  ['undergo','ˌʌndəˈɡəʊ','v.','经历，承受','Patients underwent a series of tests.'],
  ['utilise','ˈjuːtəlaɪz','v.','利用，使用','We should utilise resources more efficiently.'],
  ['coherent','kəʊˈhɪərənt','adj.','连贯的，有条理的','She gave a clear and coherent argument.'],
  ['cumulative','ˈkjuːmjələtɪv','adj.','累积的','The cumulative effect is significant.'],
  ['discrete','dɪˈskriːt','adj.','离散的，独立的','The problem can be divided into discrete parts.'],
  ['empirical','ɪmˈpɪrɪkl','adj.','经验主义的','There is little empirical evidence.'],
  ['fluctuate','ˈflʌktʃueɪt','v.','波动，起伏','Prices fluctuate with the market.'],
  ['invoke','ɪnˈvəʊk','v.','援引，唤起','The law invokes the right to privacy.'],
  ['mitigate','ˈmɪtɪɡeɪt','v.','缓解，减轻','Measures were taken to mitigate the impact.'],
  ['obligatory','əˈblɪɡətri','adj.','义务的，强制的','Uniforms are obligatory at school.'],
  ['pervasive','pəˈveɪsɪv','adj.','普遍的，弥漫的','Technology is pervasive in daily life.'],
  ['prone','prəʊn','adj.','易于…的','Children are prone to infections.'],
  ['rigorous','ˈrɪɡərəs','adj.','严格的，严谨的','The study used a rigorous method.'],
  ['simultaneously','ˌsɪmlˈteɪniəsli','adv.','同时地','Tasks cannot be done simultaneously.'],
  ['terminate','ˈtɜːmɪneɪt','v.','终止，结束','The contract was terminated early.'],
  ['viable','ˈvaɪəbl','adj.','可行的，能存活的','This is a viable solution.'],
  ['yield','jiːld','v.','产生，屈服','The investment yielded high returns.'],
  ['advocate','ˈædvəkeɪt','v.','提倡，主张','Many experts advocate early education.'],
  ['constrain','kənˈstreɪn','v.','限制，约束','Budget constraints limited the project.'],
];

function openImportModal(container, el) {
  const existing = new Set(loadWords().map(w => w.word.toLowerCase()));
  openModal({
    title: '导入单词',
    size: 'lg',
    body: `
      <div class="import-block">
        <button class="btn btn-primary" id="coreImportBtn" style="width:100%;margin-bottom:6px">${Icons.grad} 一键导入雅思核心词（${IELTS_CORE_WORDS.length} 个）</button>
        <div class="import-hint">已自动过滤重复词（当前词库 ${existing.size} 个）。导入后单词进入「每日计划」，按艾宾浩斯曲线安排复习。</div>
      </div>
      <div class="field" style="margin-top:14px">
        <label class="field-label">或批量粘贴导入（每行一个）</label>
        <textarea class="textarea" id="bulkText" style="min-height:140px" placeholder="支持格式（任选分隔符 / 、| 、逗号、空格、Tab）：&#10;ubiquitous /juːˈbɪkwɪtəs/ adj. 无处不在的&#10;alleviate|减轻|v.&#10;facilitate 促进 动词"></textarea>
        <div class="import-hint">格式：单词 [音标] [词性] 释义（顺序随意，程序按分隔符切分，第一项为单词，最后一项为释义）。</div>
      </div>`,
    foot: `<button class="btn" id="imp_cancel">关闭</button><button class="btn btn-primary" id="imp_bulk">导入粘贴内容</button>`
  });
  document.getElementById('imp_cancel').onclick = closeModal;
  document.getElementById('coreImportBtn').onclick = () => {
    let added = 0;
    const list = loadWords();
    const have = new Set(list.map(w => w.word.toLowerCase()));
    IELTS_CORE_WORDS.forEach(([word, phonetic, pos, meaning, example]) => {
      if (have.has(word.toLowerCase())) return;
      list.push({ id: Storage.uid(), createdAt: Date.now(), learnedDate: 0, stage: 0, nextReview: 0, reviewedAt: 0,
        word, phonetic, pos, meaning, example, note: '' });
      added++;
    });
    saveWords(list);
    closeModal();
    renderWords(container, el);
    toast(added > 0 ? `已导入 ${added} 个核心词` : '核心词已全部在词库中');
  };
  document.getElementById('imp_bulk').onclick = () => {
    const text = document.getElementById('bulkText').value;
    const res = parseBulkWords(text);
    if (res.length === 0) { toast('没有解析到单词，检查格式'); return; }
    const list = loadWords();
    const have = new Set(list.map(w => w.word.toLowerCase()));
    let added = 0, skip = 0;
    res.forEach(r => {
      if (have.has(r.word.toLowerCase())) { skip++; return; }
      list.push({ id: Storage.uid(), createdAt: Date.now(), learnedDate: 0, stage: 0, nextReview: 0, reviewedAt: 0, ...r });
      added++;
    });
    saveWords(list);
    closeModal();
    renderWords(container, el);
    toast(`已导入 ${added} 个${skip ? '，跳过重复 ' + skip + ' 个' : ''}`);
  };
}

function parseBulkWords(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    let phonetic = '', rest = line;
    const pm = line.match(/^\/(.+?)\/\s*(.*)$/);
    if (pm) { phonetic = pm[1].trim(); rest = pm[2]; }
    // 按分隔符切分：优先 | ，再 / ，再逗号，再多个空格/Tab
    let parts;
    if (rest.includes('|')) parts = rest.split('|');
    else if (rest.includes('、')) parts = rest.split('、');
    else if (rest.includes(',')) parts = rest.split(',');
    else parts = rest.split(/\s+/);
    parts = parts.map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    const word = parts[0];
    const meaning = parts[parts.length - 1];
    // 中间项可能是词性（含 . 或 是 动词/名词 等中文）
    let pos = '', note = '';
    for (let k = 1; k < parts.length - 1; k++) {
      const p = parts[k];
      if (/^(adj|n|v|adv|prep|pron|conj|短语|\.|动词|名词|形容词|副词|介词)$/.test(p)) pos = p;
      else note += (note ? ' ' : '') + p;
    }
    out.push({ word, phonetic, pos, meaning, example: '', note });
  }
  return out;
}

// ---------- 口语练习（Part 1/2/3 话题卡 + 陪练） ----------
const SPEAK_PARTS = [
  { id: 'p1', name: 'Part 1 · 日常' },
  { id: 'p2', name: 'Part 2 · 独白' },
  { id: 'p3', name: 'Part 3 · 讨论' },
];
let speakPart = 'p1';

const PRESET_SPEAK = [
  { part: 'p1', topic: 'Hometown / 家乡', question: 'Where is your hometown? What do you like most about it?',
    tips: '用 2-3 句话结构：位置 + 一个亮点 + 一句感受。避免只说 "It is nice"。准备 3 个万能形容词（peaceful / convenient / vibrant）。' },
  { part: 'p1', topic: 'Work or Study / 工作学习', question: 'Do you work or study? What is your typical day like?',
    tips: 'Part 1 重流利度，回答 3-4 句即可，别背长稿。用 "Actually / To be honest / Well" 自然开头。' },
  { part: 'p1', topic: 'Hobbies / 爱好', question: 'What do you usually do in your free time?',
    tips: '把爱好和"为什么"结合，如 "I find it really relaxing because..."。准备 5 个爱好相关词汇。' },
  { part: 'p2', topic: 'Describe a person who inspired you', question: 'Describe someone who has inspired you. You should say: who they are, how you know them, what they did, and explain why they inspired you.',
    tips: '独白要撑满 2 分钟：用 "First / Then / What impressed me most is..." 串结构。先想 4 个要点再开口，避免沉默。' },
  { part: 'p2', topic: 'Describe a book you enjoyed', question: 'Describe a book that you enjoyed reading. You should say: what it was, when you read it, what it was about, and explain why you enjoyed it.',
    tips: '用 "The story revolves around..." "What struck me was..." 体现词汇量。结尾升华到个人成长，分数更高。' },
  { part: 'p2', topic: 'Describe a skill you want to learn', question: 'Describe a skill you would like to learn in the future. You should say: what it is, why you want to learn it, how you would learn it, and explain how it may help you.',
    tips: 'Part 2 不一定真会，可说"想学但还没学"，重点在表达。用将来时和条件句展示语法多样性。' },
  { part: 'p3', topic: 'Technology in education', question: 'Do you think technology has made learning easier or more difficult? Why?',
    tips: 'Part 3 要给出观点+理由+例子。用 "On the one hand... on the other hand..." 展现辩证思维，避免绝对化。' },
  { part: 'p3', topic: 'Environmental protection', question: 'What can ordinary people do to protect the environment?',
    tips: '用 "Individuals can..." "A case in point is..." 提升学术感。把话题和个人经历结合更有说服力。' },
];

function ensurePresetSpeak() {
  const list = loadSpeak();
  const existing = new Set(list.filter(s => s.preset).map(s => s.topic));
  let changed = false;
  PRESET_SPEAK.forEach(p => {
    if (!existing.has(p.topic)) {
      list.push({ id: Storage.uid(), preset: true, practiced: false, answer: '', recB64: '', practicedAt: 0, createdAt: Date.now(), ...p });
      changed = true;
    }
  });
  if (changed) saveSpeak(list);
}

function renderSpeak(container, el) {
  ensurePresetSpeak();
  const list = loadSpeak();
  const p1 = list.filter(s => s.part === 'p1').length;
  const p2 = list.filter(s => s.part === 'p2').length;
  const p3 = list.filter(s => s.part === 'p3').length;
  const done = list.filter(s => s.practiced).length;
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-num">${p1 + p2 + p3}</div><div class="stat-label">话题总数</div></div>
      <div class="stat-item"><div class="stat-num">${done}</div><div class="stat-label">已练习</div></div>
      <div class="stat-item"><div class="stat-num">${list.length ? Math.round(done / list.length * 100) : 0}%</div><div class="stat-label">完成度</div></div>
    </div>
    <div class="tabs tabs-scroll" style="margin-bottom:12px">
      ${SPEAK_PARTS.map(p => `<div class="tab ${p.id===speakPart?'active':''}" data-part="${p.id}">${p.name} (${p.id==='p1'?p1:p.id==='p2'?p2:p3})</div>`).join('')}
    </div>
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn" id="addSpeakBtn">${Icons.plus} 添加我的话题</button>
    </div>
    <div class="list" id="speakList"></div>
  `;
  el.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => { speakPart = t.dataset.part; renderSpeak(container, el); };
  });
  el.querySelector('#addSpeakBtn').onclick = () => openSpeakForm(container, null);
  const listEl = el.querySelector('#speakList');
  const items = loadSpeak().filter(s => s.part === speakPart).sort((a, b) => (a.practiced?1:0) - (b.practiced?1:0) || b.createdAt - a.createdAt);
  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.chat}</div><div class="empty-title">这个 Part 还没有话题</div><div class="empty-desc">点「添加我的话题」补充自己的练习材料</div></div>`;
  } else {
    listEl.innerHTML = items.map(s => `
      <div class="speak-card" data-id="${s.id}">
        <div class="speak-card-head">
          <div class="speak-topic">${escapeHtml(s.topic)} ${s.practiced ? '<span class="badge badge-green">已练</span>' : ''} ${s.recB64 ? '<span class="badge badge-blue">🎙有录音</span>' : ''}</div>
          <button class="btn btn-primary speak-practice">${Icons.mic} 练习</button>
        </div>
        <div class="speak-question">${escapeHtml(s.question)}</div>
        <div class="speak-tips"><strong>老师支招：</strong>${escapeHtml(s.tips)}</div>
        ${s.answer ? `<div class="speak-answer"><strong>我的答案：</strong>${escapeHtml(s.answer)}</div>` : ''}
      </div>
    `).join('');
    listEl.querySelectorAll('.speak-card').forEach(card => {
      const id = card.dataset.id;
      card.querySelector('.speak-practice').onclick = () => openPracticeModal(container, id);
    });
  }
}

function openSpeakForm(container, id) {
  const list = loadSpeak();
  const s = id ? list.find(x => x.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑话题' : '添加我的话题',
    size: 'lg',
    body: `
      <div class="form-row">
        <div class="field"><label class="field-label">所属 Part</label>
          <select class="select" id="s_part">
            ${SPEAK_PARTS.map(p=>`<option value="${p.id}" ${s.part===p.id?'selected':''}>${p.name}</option>`).join('')}
          </select></div>
        <div class="field"><label class="field-label">话题 <span class="req">*</span></label>
          <input class="input" id="s_topic" value="${escapeAttr(s.topic)}" placeholder="如：Describe a memorable trip" autofocus></div>
      </div>
      <div class="field"><label class="field-label">题目 / 提示卡</label>
        <textarea class="textarea" id="s_q" style="min-height:70px" placeholder="题目或 cue card 内容">${escapeHtml(s.question)}</textarea></div>
      <div class="field"><label class="field-label">老师支招 / 思路</label>
        <textarea class="textarea" id="s_tips" placeholder="答题思路、高分表达、结构建议…">${escapeHtml(s.tips)}</textarea></div>`,
    foot: `<button class="btn" id="s_cancel">取消</button><button class="btn btn-primary" id="s_save">保存</button>`
  });
  document.getElementById('s_cancel').onclick = closeModal;
  document.getElementById('s_save').onclick = () => {
    const topic = document.getElementById('s_topic').value.trim();
    if (!topic) { toast('请填写话题'); return; }
    const payload = {
      part: document.getElementById('s_part').value,
      topic,
      question: document.getElementById('s_q').value.trim(),
      tips: document.getElementById('s_tips').value.trim(),
    };
    const list2 = loadSpeak();
    if (isEdit) {
      const i = list2.findIndex(x => x.id === id);
      list2[i] = { ...list2[i], ...payload };
    } else {
      list2.push({ id: Storage.uid(), preset: false, practiced: false, answer: '', recB64: '', practicedAt: 0, createdAt: Date.now(), ...payload });
    }
    saveSpeak(list2);
    closeModal();
    const el = container.querySelector('#ieltsContent');
    renderSpeak(container, el);
    toast(isEdit ? '已保存' : '已添加');
  };
}

// 练习弹窗：录音陪练（持久化 base64）+ 文本答案 + 标记已练
let recorder = null, recChunks = [], recStream = null, pendingRecB64 = null;
function openPracticeModal(container, id) {
  const list = loadSpeak();
  const s = list.find(x => x.id === id);
  if (!s) return;
  pendingRecB64 = s.recB64 || null;
  openModal({
    title: '口语陪练 · ' + s.topic,
    size: 'lg',
    body: `
      <div class="speak-practice-head">
        <span class="badge badge-blue">${SPEAK_PARTS.find(p=>p.id===s.part)?.name || s.part}</span>
      </div>
      <div class="speak-question" style="margin:10px 0;font-size:14px">${escapeHtml(s.question)}</div>
      <div class="speak-tips" style="margin-bottom:12px"><strong>老师支招：</strong>${escapeHtml(s.tips)}</div>
      <div class="rec-box">
        <div class="rec-row">
          <button class="btn" id="recBtn">${Icons.mic} 开始录音</button>
          <button class="btn" id="playBtn">${Icons.play} 回放</button>
          <span class="rec-status" id="recStatus">${pendingRecB64 ? '已有录音，可回放或重新录制' : '录音将保存在本机，刷新后仍可回放'}</span>
        </div>
        <audio id="recAudio" controls style="display:${pendingRecB64?'block':'none'};width:100%;margin-top:8px"></audio>
      </div>
      <div class="field" style="margin-top:12px"><label class="field-label">我的答案（可写下要点 / 全文）</label>
        <textarea class="textarea" id="s_answer" style="min-height:90px" placeholder="先列要点，再尝试脱稿说 1-2 分钟…">${escapeHtml(s.answer)}</textarea></div>
      <label class="flex items-center gap-8" style="margin-top:6px;font-size:13px;color:var(--text-muted)">
        <input type="checkbox" id="s_practiced" ${s.practiced?'checked':''}> 标记为已练习
      </label>`,
    foot: `<button class="btn" id="sp_cancel">关闭</button><button class="btn btn-primary" id="sp_save">保存</button>`
  });
  document.getElementById('sp_cancel').onclick = closeModal;

  const recBtn = document.getElementById('recBtn');
  const playBtn = document.getElementById('playBtn');
  const recStatus = document.getElementById('recStatus');
  const audio = document.getElementById('recAudio');
  if (pendingRecB64) audio.src = pendingRecB64;

  recBtn.onclick = async () => {
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      recStatus.textContent = '当前环境不支持录音（需 HTTPS/localhost 且授权麦克风）';
      return;
    }
    try {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recChunks = [];
      recorder = new MediaRecorder(recStream);
      recorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(recChunks, { type: 'audio/webm' });
        try {
          pendingRecB64 = await blobToBase64(blob);
          if (pendingRecB64.length > 2500000) {
            recStatus.textContent = '录音较大(>2MB)未保存，建议说短一点；本次仅回放';
            pendingRecB64 = null;
          } else {
            recStatus.textContent = '录音已保存，刷新后仍可回放';
          }
        } catch (e) { recStatus.textContent = '录音保存失败'; }
        audio.src = URL.createObjectURL(blob);
        audio.style.display = 'block';
        playBtn.disabled = false;
        recBtn.innerHTML = Icons.mic + ' 开始录音';
        recStream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      recBtn.innerHTML = '⏹ 停止录音';
      recStatus.textContent = '录音中…说完点停止';
    } catch (e) {
      recStatus.textContent = '无法访问麦克风，请检查浏览器权限';
    }
  };
  playBtn.onclick = () => {
    if (pendingRecB64 && !audio.src.startsWith('blob:')) audio.src = pendingRecB64;
    audio.play();
  };

  document.getElementById('sp_save').onclick = () => {
    const list2 = loadSpeak();
    const i = list2.findIndex(x => x.id === id);
    if (i >= 0) {
      list2[i].answer = document.getElementById('s_answer').value.trim();
      list2[i].practiced = document.getElementById('s_practiced').checked;
      list2[i].recB64 = pendingRecB64 || '';
      if (list2[i].practiced) list2[i].practicedAt = Date.now();
    }
    saveSpeak(list2);
    closeModal();
    const el = container.querySelector('#ieltsContent');
    renderSpeak(container, el);
    toast('已保存');
  };
}

// ---------- 听力 ----------
function renderListen(container, el) {
  const list = loadListen().sort((a, b) => b.createdAt - a.createdAt);
  const practiced = list.filter(s => s.practiced).length;
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-num">${list.length}</div><div class="stat-label">素材数</div></div>
      <div class="stat-item"><div class="stat-num">${practiced}</div><div class="stat-label">已精听</div></div>
      <div class="stat-item"><div class="stat-num">${list.length?Math.round(practiced/list.length*100):0}%</div><div class="stat-label">完成度</div></div>
    </div>
    <div class="toolbar">
      <div class="search">${Icons.search}<input class="input" id="lSearch" placeholder="搜索素材…"></div>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="addListenBtn">${Icons.plus} 添加素材</button>
    </div>
    <div class="list" id="listenList"></div>
  `;
  el.querySelector('#addListenBtn').onclick = () => openListenForm(container, null);
  el.querySelector('#lSearch').addEventListener('input', () => renderListenList(container, el));
  renderListenList(container, el);
}

function renderListenList(container, el) {
  const q = (el.querySelector('#lSearch')?.value || '').toLowerCase().trim();
  const list = loadListen().filter(s => !q || [s.title, s.section, s.note].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const listEl = el.querySelector('#listenList');
  if (list.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.play}</div><div class="empty-title">还没有听力素材</div><div class="empty-desc">添加 Section 1-4 的练习材料，记录精听/听写心得</div></div>`;
    return;
  }
  listEl.innerHTML = list.map(s => `
    <div class="list-item" data-id="${s.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="flex items-center gap-8 mb-8">
            <span class="badge badge-blue">${escapeHtml(s.section || 'Section')}</span>
            ${s.practiced ? '<span class="badge badge-green">已精听</span>' : '<span class="badge badge-amber">待练</span>'}
          </div>
          <div class="list-item-title">${escapeHtml(s.title)}</div>
          ${s.link ? `<div class="list-item-body" style="margin-top:4px"><a href="${escapeAttr(s.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 音频/视频链接</a></div>` : ''}
          ${s.transcript ? `<div class="list-item-body" style="font-style:italic;color:var(--text-muted);margin-top:4px">📝 ${escapeHtml(s.transcript.slice(0,80))}${s.transcript.length>80?'…':''}</div>` : ''}
          ${s.note ? `<div class="list-item-body">💡 ${escapeHtml(s.note)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm l-edit">${Icons.edit}</button>
          <button class="icon-btn btn-sm l-del">${Icons.trash}</button>
        </div>
      </div>
      <div class="list-item-meta"><span>${fmtDate(s.createdAt)}</span></div>
    </div>
  `).join('');
  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.l-edit').onclick = () => openListenForm(container, id);
    item.querySelector('.l-del').onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '确定删除这个素材吗？', confirmText: '删除', danger: true })) {
        saveListen(loadListen().filter(s => s.id !== id));
        renderListen(container, el);
        toast('已删除');
      }
    };
  });
}

function openListenForm(container, id) {
  const list = loadListen();
  const s = id ? list.find(x => x.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑听力素材' : '添加听力素材',
    size: 'lg',
    body: `
      <div class="form-row">
        <div class="field"><label class="field-label">标题 <span class="req">*</span></label>
          <input class="input" id="l_title" value="${escapeAttr(s.title)}" placeholder="如：C11T1S3 学术讨论" autofocus></div>
        <div class="field"><label class="field-label">Section</label>
          <select class="select" id="l_section">
            ${['Section 1','Section 2','Section 3','Section 4','其他'].map(v=>`<option value="${v}" ${s.section===v?'selected':''}>${v}</option>`).join('')}
          </select></div>
      </div>
      <div class="field"><label class="field-label">音频/视频链接</label>
        <input class="input" id="l_link" value="${escapeAttr(s.link)}" placeholder="YouTube / 网盘 / 音频地址"></div>
      <div class="field"><label class="field-label">原文 / 听写稿</label>
        <textarea class="textarea" id="l_transcript" style="min-height:80px" placeholder="贴入听力原文，方便对照听写">${escapeHtml(s.transcript)}</textarea></div>
      <div class="field"><label class="field-label">精听笔记 / 错题</label>
        <textarea class="textarea" id="l_note" placeholder="连读弱读、同义替换、听写错误…">${escapeHtml(s.note)}</textarea></div>
      <label class="flex items-center gap-8" style="font-size:13px;color:var(--text-muted)">
        <input type="checkbox" id="l_practiced" ${s.practiced?'checked':''}> 标记为已精听
      </label>`,
    foot: `<button class="btn" id="l_cancel">取消</button><button class="btn btn-primary" id="l_save">保存</button>`
  });
  document.getElementById('l_cancel').onclick = closeModal;
  document.getElementById('l_save').onclick = () => {
    const title = document.getElementById('l_title').value.trim();
    if (!title) { toast('请填写标题'); return; }
    const payload = {
      title,
      section: document.getElementById('l_section').value,
      link: document.getElementById('l_link').value.trim(),
      transcript: document.getElementById('l_transcript').value.trim(),
      note: document.getElementById('l_note').value.trim(),
      practiced: document.getElementById('l_practiced').checked,
    };
    const list2 = loadListen();
    if (isEdit) {
      const i = list2.findIndex(x => x.id === id);
      list2[i] = { ...list2[i], ...payload };
    } else {
      list2.push({ id: Storage.uid(), createdAt: Date.now(), ...payload });
    }
    saveListen(list2);
    closeModal();
    renderListen(container, el);
    toast(isEdit ? '已保存' : '已添加');
  };
}

// ---------- 阅读（同义替换 + 通用错题本） ----------
function renderRead(container, el) {
  el.innerHTML = `
    <div class="tabs tabs-scroll" style="margin-bottom:12px">
      <div class="tab ${readSub==='syn'?'active':''}" data-sub="syn">同义替换</div>
      <div class="tab ${readSub==='err'?'active':''}" data-sub="err">错题本</div>
    </div>
    <div id="readSubContent"></div>
  `;
  el.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => { readSub = t.dataset.sub; renderRead(container, el); };
  });
  const sub = el.querySelector('#readSubContent');
  if (readSub === 'syn') renderSyn(container, sub);
  else renderErr(container, sub);
}

function renderSyn(container, el) {
  const list = loadSyn().sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn" id="synPracticeBtn">${Icons.fire} 闪卡练习</button>
      <button class="btn btn-primary" id="addSynBtn">${Icons.plus} 添加</button>
    </div>
    <div class="list" id="synList"></div>
  `;
  el.querySelector('#addSynBtn').onclick = () => openSynForm(container, null);
  el.querySelector('#synPracticeBtn').onclick = () => startSynPractice(container, el);
  const listEl = el.querySelector('#synList');
  if (list.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.book}</div><div class="empty-title">还没有同义替换积累</div><div class="empty-desc">阅读提分关键就是同义替换，遇到就记下来</div></div>`;
    return;
  }
  listEl.innerHTML = list.map(s => `
    <div class="list-item" data-id="${s.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="list-item-title">${escapeHtml(s.k)} <span style="color:var(--primary)">⇌</span> ${escapeHtml(s.v)}</div>
          ${s.note ? `<div class="list-item-body" style="margin-top:4px">💡 ${escapeHtml(s.note)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm syn-edit">${Icons.edit}</button>
          <button class="icon-btn btn-sm syn-del">${Icons.trash}</button>
        </div>
      </div>
      <div class="list-item-meta"><span>${fmtDate(s.createdAt)}</span></div>
    </div>
  `).join('');
  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.syn-edit').onclick = () => openSynForm(container, id);
    item.querySelector('.syn-del').onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '确定删除这条吗？', confirmText: '删除', danger: true })) {
        saveSyn(loadSyn().filter(s => s.id !== id));
        renderSyn(container, el);
        toast('已删除');
      }
    };
  });
}

function openSynForm(container, id) {
  const list = loadSyn();
  const s = id ? list.find(x => x.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑同义替换' : '添加同义替换',
    body: `
      <div class="form-row">
        <div class="field"><label class="field-label">原文词 / 题干词 <span class="req">*</span></label>
          <input class="input" id="syn_k" value="${escapeAttr(s.k)}" placeholder="如：important" autofocus></div>
        <div class="field"><label class="field-label">替换表达 <span class="req">*</span></label>
          <input class="input" id="syn_v" value="${escapeAttr(s.v)}" placeholder="如：crucial / significant"></div>
      </div>
      <div class="field"><label class="field-label">备注 / 例句</label>
        <textarea class="textarea" id="syn_note" placeholder="出处、搭配、易混点…">${escapeHtml(s.note)}</textarea></div>`,
    foot: `<button class="btn" id="syn_cancel">取消</button><button class="btn btn-primary" id="syn_save">保存</button>`
  });
  document.getElementById('syn_cancel').onclick = closeModal;
  document.getElementById('syn_save').onclick = () => {
    const k = document.getElementById('syn_k').value.trim();
    const v = document.getElementById('syn_v').value.trim();
    if (!k || !v) { toast('请填写两项'); return; }
    const payload = { k, v, note: document.getElementById('syn_note').value.trim() };
    const list2 = loadSyn();
    if (isEdit) {
      const i = list2.findIndex(x => x.id === id);
      list2[i] = { ...list2[i], ...payload };
    } else {
      list2.push({ id: Storage.uid(), createdAt: Date.now(), ...payload });
    }
    saveSyn(list2);
    closeModal();
    const el = container.querySelector('#readSubContent');
    renderSyn(container, el);
    toast(isEdit ? '已保存' : '已添加');
  };
}

let synQueue = [], synIdx = 0;
function startSynPractice(container, el) {
  const list = loadSyn();
  if (list.length === 0) { toast('先添加一些同义替换'); return; }
  synQueue = [...list].sort(() => Math.random() - 0.5).slice(0, 30);
  synIdx = 0;
  renderSynCard(container, el);
}
function renderSynCard(container, el) {
  const listEl = el.querySelector('#synList');
  if (synIdx >= synQueue.length) {
    listEl.innerHTML = `<div class="ielts-practice done"><div class="practice-emoji">🎉</div><div class="practice-done-title">练习完成</div><div class="practice-done-sub">共过 ${synQueue.length} 组同义替换</div><button class="btn btn-primary" id="synBack">返回</button></div>`;
    listEl.querySelector('#synBack').onclick = () => renderSyn(container, el);
    return;
  }
  const s = synQueue[synIdx];
  listEl.innerHTML = `
    <div class="ielts-practice">
      <div class="practice-progress">剩余 ${synQueue.length - synIdx} 组</div>
      <div class="flip-card" id="synCard">
        <div class="flip-word" style="font-size:22px">${escapeHtml(s.k)}</div>
        <div class="flip-hint" id="synHint">点击看替换表达</div>
        <div class="flip-detail" id="synDetail" style="display:none"><div class="flip-meaning">${escapeHtml(s.v)}</div>${s.note?`<div class="flip-note">💡 ${escapeHtml(s.note)}</div>`:''}</div>
      </div>
      <div class="flip-actions" id="synNext" style="display:none">
        <button class="rate-btn rate-know" id="synGot">记住了 →</button>
      </div>
    </div>`;
  const card = listEl.querySelector('#synCard');
  const detail = listEl.querySelector('#synDetail');
  const hint = listEl.querySelector('#synHint');
  const next = listEl.querySelector('#synNext');
  card.onclick = () => { detail.style.display='block'; hint.style.display='none'; next.style.display='flex'; };
  listEl.querySelector('#synGot').onclick = () => { synIdx++; renderSynCard(container, el); };
}

function renderErr(container, el) {
  const list = loadErr().sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn-primary" id="addErrBtn">${Icons.plus} 记一笔错题</button>
    </div>
    <div class="list" id="errList"></div>
  `;
  el.querySelector('#addErrBtn').onclick = () => openErrForm(container, null);
  const listEl = el.querySelector('#errList');
  if (list.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.target}</div><div class="empty-title">错题本还是空的</div><div class="empty-desc">听力/阅读/写作/口语的错题都可记在这里</div></div>`;
    return;
  }
  listEl.innerHTML = list.map(s => `
    <div class="list-item" data-id="${s.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="flex items-center gap-8 mb-8">
            <span class="badge badge-purple">${escapeHtml(s.subject)}</span>
            ${s.qtype ? `<span class="badge badge-blue">${escapeHtml(s.qtype)}</span>` : ''}
          </div>
          <div class="list-item-title">${escapeHtml(s.q)}</div>
          ${s.myAns ? `<div class="list-item-body" style="margin-top:4px;color:var(--red)">我的： ${escapeHtml(s.myAns)}</div>` : ''}
          ${s.correct ? `<div class="list-item-body" style="color:var(--primary)">正确： ${escapeHtml(s.correct)}</div>` : ''}
          ${s.reason ? `<div class="list-item-body">💡 ${escapeHtml(s.reason)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm err-edit">${Icons.edit}</button>
          <button class="icon-btn btn-sm err-del">${Icons.trash}</button>
        </div>
      </div>
      <div class="list-item-meta"><span>${fmtDate(s.createdAt)}</span></div>
    </div>
  `).join('');
  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.err-edit').onclick = () => openErrForm(container, id);
    item.querySelector('.err-del').onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '确定删除这条错题吗？', confirmText: '删除', danger: true })) {
        saveErr(loadErr().filter(s => s.id !== id));
        renderErr(container, el);
        toast('已删除');
      }
    };
  });
}

function openErrForm(container, id) {
  const list = loadErr();
  const s = id ? list.find(x => x.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑错题' : '记一笔错题',
    size: 'lg',
    body: `
      <div class="form-row">
        <div class="field"><label class="field-label">科目</label>
          <select class="select" id="e_subject">
            ${['听力','阅读','写作','口语','其他'].map(v=>`<option value="${v}" ${s.subject===v?'selected':''}>${v}</option>`).join('')}
          </select></div>
        <div class="field"><label class="field-label">题型</label>
          <input class="input" id="e_qtype" value="${escapeAttr(s.qtype)}" placeholder="如：Matching / T/F/NG / 地图题"></div>
      </div>
      <div class="field"><label class="field-label">题目 / 错在哪 <span class="req">*</span></label>
        <textarea class="textarea" id="e_q" style="min-height:60px" placeholder="题干或错误描述">${escapeHtml(s.q)}</textarea></div>
      <div class="form-row">
        <div class="field"><label class="field-label">我的答案</label>
          <input class="input" id="e_my" value="${escapeAttr(s.myAns)}" placeholder="我选的/写的"></div>
        <div class="field"><label class="field-label">正确答案</label>
          <input class="input" id="e_correct" value="${escapeAttr(s.correct)}" placeholder="正确答"></div>
      </div>
      <div class="field"><label class="field-label">原因 / 反思</label>
        <textarea class="textarea" id="e_reason" placeholder="为什么错？知识点？">${escapeHtml(s.reason)}</textarea></div>`,
    foot: `<button class="btn" id="e_cancel">取消</button><button class="btn btn-primary" id="e_save">保存</button>`
  });
  document.getElementById('e_cancel').onclick = closeModal;
  document.getElementById('e_save').onclick = () => {
    const q = document.getElementById('e_q').value.trim();
    if (!q) { toast('请填写题目'); return; }
    const payload = {
      subject: document.getElementById('e_subject').value,
      qtype: document.getElementById('e_qtype').value.trim(),
      q,
      myAns: document.getElementById('e_my').value.trim(),
      correct: document.getElementById('e_correct').value.trim(),
      reason: document.getElementById('e_reason').value.trim(),
    };
    const list2 = loadErr();
    if (isEdit) {
      const i = list2.findIndex(x => x.id === id);
      list2[i] = { ...list2[i], ...payload };
    } else {
      list2.push({ id: Storage.uid(), createdAt: Date.now(), ...payload });
    }
    saveErr(list2);
    closeModal();
    const el = container.querySelector('#readSubContent');
    renderErr(container, el);
    toast(isEdit ? '已保存' : '已添加');
  };
}

// ---------- 写作（语料库 + 练习） ----------
function renderWriting(container, el) {
  el.innerHTML = `
    <div class="tabs tabs-scroll" style="margin-bottom:12px">
      <div class="tab ${writingSub==='corpus'?'active':''}" data-sub="corpus">写作语料</div>
      <div class="tab ${writingSub==='practice'?'active':''}" data-sub="practice">我的练习</div>
    </div>
    <div id="writeSubContent"></div>
  `;
  el.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => { writingSub = t.dataset.sub; renderWriting(container, el); };
  });
  const sub = el.querySelector('#writeSubContent');
  if (writingSub === 'corpus') renderWriteCorpus(container, sub);
  else renderWritePractice(container, sub);
}

function renderWriteCorpus(container, el) {
  const list = loadWrite().filter(s => s.type === 'corpus').sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn-primary" id="addCorpusBtn">${Icons.plus} 添加语料</button>
    </div>
    <div class="list" id="corpusList"></div>
  `;
  el.querySelector('#addCorpusBtn').onclick = () => openWriteForm(container, null, 'corpus');
  const listEl = el.querySelector('#corpusList');
  if (list.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.book}</div><div class="empty-title">还没有写作语料</div><div class="empty-desc">积累 Task1/Task2 句型、话题词汇、连接词</div></div>`;
    return;
  }
  listEl.innerHTML = list.map(s => `
    <div class="list-item" data-id="${s.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="flex items-center gap-8 mb-8">
            <span class="badge badge-blue">${escapeHtml(s.cat || '通用')}</span>
            ${s.task ? `<span class="badge badge-purple">${escapeHtml(s.task)}</span>` : ''}
          </div>
          <div class="list-item-title" style="font-weight:500">${escapeHtml(s.content)}</div>
          ${s.note ? `<div class="list-item-body" style="margin-top:4px">💡 ${escapeHtml(s.note)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm wc-edit">${Icons.edit}</button>
          <button class="icon-btn btn-sm wc-del">${Icons.trash}</button>
        </div>
      </div>
    </div>
  `).join('');
  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.wc-edit').onclick = () => openWriteForm(container, id, 'corpus');
    item.querySelector('.wc-del').onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '确定删除这条语料吗？', confirmText: '删除', danger: true })) {
        saveWrite(loadWrite().filter(s => s.id !== id));
        renderWriteCorpus(container, el);
        toast('已删除');
      }
    };
  });
}

function renderWritePractice(container, el) {
  const list = loadWrite().filter(s => s.type === 'practice').sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn-primary" id="addPracBtn">${Icons.plus} 添加练习</button>
    </div>
    <div class="list" id="pracList"></div>
  `;
  el.querySelector('#addPracBtn').onclick = () => openWriteForm(container, null, 'practice');
  const listEl = el.querySelector('#pracList');
  if (list.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.grad}</div><div class="empty-title">还没有写作练习</div><div class="empty-desc">每周精练 2 篇，记录题目、正文、自评分与反馈</div></div>`;
    return;
  }
  listEl.innerHTML = list.map(s => `
    <div class="list-item" data-id="${s.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="flex items-center gap-8 mb-8">
            ${s.task ? `<span class="badge badge-purple">${escapeHtml(s.task)}</span>` : ''}
            ${s.band ? `<span class="badge badge-green">估分 ${escapeHtml(s.band)}</span>` : ''}
          </div>
          <div class="list-item-title">${escapeHtml(s.topic)}</div>
          ${s.text ? `<div class="list-item-body" style="font-style:italic;color:var(--text-muted);margin-top:4px">${escapeHtml(s.text.slice(0,90))}${s.text.length>90?'…':''}</div>` : ''}
          ${s.feedback ? `<div class="list-item-body">💡 ${escapeHtml(s.feedback)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm wp-edit">${Icons.edit}</button>
          <button class="icon-btn btn-sm wp-del">${Icons.trash}</button>
        </div>
      </div>
      <div class="list-item-meta"><span>${fmtDate(s.createdAt)}</span></div>
    </div>
  `).join('');
  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.wp-edit').onclick = () => openWriteForm(container, id, 'practice');
    item.querySelector('.wp-del').onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '确定删除这条练习吗？', confirmText: '删除', danger: true })) {
        saveWrite(loadWrite().filter(s => s.id !== id));
        renderWritePractice(container, el);
        toast('已删除');
      }
    };
  });
}

function openWriteForm(container, id, type) {
  const list = loadWrite();
  const s = id ? list.find(x => x.id === id) : {};
  const isEdit = !!id;
  if (type === 'corpus') {
    openModal({
      title: isEdit ? '编辑语料' : '添加写作语料',
      size: 'lg',
      body: `
        <div class="form-row">
          <div class="field"><label class="field-label">分类</label>
            <input class="input" id="w_cat" value="${escapeAttr(s.cat)}" placeholder="如：开头句型 / 结尾 / 连接词 / 环境类"></div>
          <div class="field"><label class="field-label">适用</label>
            <select class="select" id="w_task">
              ${['Task 1','Task 2','通用'].map(v=>`<option value="${v}" ${s.task===v?'selected':''}>${v}</option>`).join('')}
            </select></div>
        </div>
        <div class="field"><label class="field-label">内容 / 句型 <span class="req">*</span></label>
          <textarea class="textarea" id="w_content" style="min-height:80px" placeholder="一句可用句型或话题词汇">${escapeHtml(s.content)}</textarea></div>
        <div class="field"><label class="field-label">备注</label>
          <textarea class="textarea" id="w_note" placeholder="用法、注意点…">${escapeHtml(s.note)}</textarea></div>`,
      foot: `<button class="btn" id="w_cancel">取消</button><button class="btn btn-primary" id="w_save">保存</button>`
    });
    document.getElementById('w_cancel').onclick = closeModal;
    document.getElementById('w_save').onclick = () => {
      const content = document.getElementById('w_content').value.trim();
      if (!content) { toast('请填写内容'); return; }
      const payload = { type: 'corpus', cat: document.getElementById('w_cat').value.trim(), task: document.getElementById('w_task').value, content, note: document.getElementById('w_note').value.trim() };
      saveWriteEntry(list, id, isEdit, payload, container, 'corpus');
    };
  } else {
    openModal({
      title: isEdit ? '编辑练习' : '添加写作练习',
      size: 'lg',
      body: `
        <div class="form-row">
          <div class="field"><label class="field-label">题目 <span class="req">*</span></label>
            <input class="input" id="w_topic" value="${escapeAttr(s.topic)}" placeholder="作文题目" autofocus></div>
          <div class="field"><label class="field-label">类型</label>
            <select class="select" id="w_task2">
              ${['Task 1','Task 2'].map(v=>`<option value="${v}" ${s.task===v?'selected':''}>${v}</option>`).join('')}
            </select></div>
        </div>
        <div class="field"><label class="field-label">我的作文</label>
          <textarea class="textarea" id="w_text" style="min-height:120px" placeholder="粘贴/写下你的作文">${escapeHtml(s.text)}</textarea></div>
        <div class="form-row">
          <div class="field"><label class="field-label">自估分</label>
            <input class="input" id="w_band" value="${escapeAttr(s.band)}" placeholder="如 6.5"></div>
          <div class="field"><label class="field-label">用时(分钟)</label>
            <input class="input" id="w_time" value="${escapeAttr(s.time)}" placeholder="如 35"></div>
        </div>
        <div class="field"><label class="field-label">反馈 / 反思</label>
          <textarea class="textarea" id="w_feedback" placeholder="语法、逻辑、词汇问题…">${escapeHtml(s.feedback)}</textarea></div>`,
      foot: `<button class="btn" id="w_cancel">取消</button><button class="btn btn-primary" id="w_save">保存</button>`
    });
    document.getElementById('w_cancel').onclick = closeModal;
    document.getElementById('w_save').onclick = () => {
      const topic = document.getElementById('w_topic').value.trim();
      if (!topic) { toast('请填写题目'); return; }
      const payload = {
        type: 'practice', topic, task: document.getElementById('w_task2').value,
        text: document.getElementById('w_text').value.trim(),
        band: document.getElementById('w_band').value.trim(),
        time: document.getElementById('w_time').value.trim(),
        feedback: document.getElementById('w_feedback').value.trim(),
      };
      saveWriteEntry(list, id, isEdit, payload, container, 'practice');
    };
  }
}

function saveWriteEntry(list, id, isEdit, payload, container, sub) {
  if (isEdit) {
    const i = list.findIndex(x => x.id === id);
    list[i] = { ...list[i], ...payload };
  } else {
    list.push({ id: Storage.uid(), createdAt: Date.now(), ...payload });
  }
  saveWrite(list);
  closeModal();
  const el = container.querySelector('#writeSubContent');
  if (sub === 'corpus') renderWriteCorpus(container, el);
  else renderWritePractice(container, el);
  toast(isEdit ? '已保存' : '已添加');
}

// ---------- 备考中心 ----------
function renderPrep(container, el) {
  const plan = loadPlan();
  const words = loadWords().length;
  const speakDone = loadSpeak().filter(s => s.practiced).length;
  const listenDone = loadListen().filter(s => s.practiced).length;
  const errCount = loadErr().length;
  const writeCount = loadWrite().filter(s => s.type === 'practice').length;
  el.innerHTML = `
    <div class="prep-grid">
      <div class="prep-card">
        <div class="prep-card-title">🎯 我的目标</div>
        <div class="prep-form">
          <div class="form-row">
            <div class="field"><label class="field-label">目标总分</label>
              <select class="select" id="p_overall">
                ${['6.0','6.5','7.0','7.5','8.0','8.5'].map(v=>`<option value="${v}" ${plan.targetOverall==v?'selected':''}>${v}</option>`).join('')}
              </select></div>
            <div class="field"><label class="field-label">听力</label>
              <select class="select" id="p_l">${['5.5','6.0','6.5','7.0','7.5','8.0'].map(v=>`<option value="${v}" ${plan.targetL==v?'selected':''}>${v}</option>`).join('')}</select></div>
          </div>
          <div class="form-row">
            <div class="field"><label class="field-label">阅读</label>
              <select class="select" id="p_r">${['5.5','6.0','6.5','7.0','7.5','8.0'].map(v=>`<option value="${v}" ${plan.targetR==v?'selected':''}>${v}</option>`).join('')}</select></div>
            <div class="field"><label class="field-label">写作</label>
              <select class="select" id="p_w">${['5.5','6.0','6.5','7.0','7.5','8.0'].map(v=>`<option value="${v}" ${plan.targetW==v?'selected':''}>${v}</option>`).join('')}</select></div>
          </div>
          <div class="form-row">
            <div class="field"><label class="field-label">口语</label>
              <select class="select" id="p_s">${['5.5','6.0','6.5','7.0','7.5','8.0'].map(v=>`<option value="${v}" ${plan.targetS==v?'selected':''}>${v}</option>`).join('')}</select></div>
            <div class="field"><label class="field-label">考试日期</label>
              <input class="input" type="date" id="p_date" value="${escapeAttr(plan.examDate)}"></div>
          </div>
          <div class="field"><label class="field-label">每日新词目标</label>
            <input class="input" type="number" min="1" max="100" id="p_daily" value="${plan.dailyNew || 20}"></div>
          <button class="btn btn-primary" id="savePlanBtn">保存目标</button>
        </div>
      </div>

      <div class="prep-card">
        <div class="prep-card-title">📈 学习进度</div>
        <div class="stats-grid" style="margin-top:8px">
          <div class="stat-item"><div class="stat-num">${words}</div><div class="stat-label">已录入单词</div></div>
          <div class="stat-item"><div class="stat-num">${speakDone}</div><div class="stat-label">口语已练</div></div>
          <div class="stat-item"><div class="stat-num">${listenDone}</div><div class="stat-label">听力精听</div></div>
          <div class="stat-item"><div class="stat-num">${writeCount}</div><div class="stat-label">写作练习</div></div>
          <div class="stat-item"><div class="stat-num">${errCount}</div><div class="stat-label">错题</div></div>
          <div class="stat-item"><div class="stat-num">${plan.examDate ? daysTo(plan.examDate) : '—'}</div><div class="stat-label">距考试(天)</div></div>
        </div>
        <div class="prep-tip">每天背完当日新词 + 复习到期词，口语每周覆盖 3 个 Part 2 话题，写作每周精练 2 篇，听力精听 3 篇——这是稳 7 的节奏。</div>
      </div>
    </div>

    <div class="prep-card" style="margin-top:12px">
      <div class="prep-card-title">👩‍🏫 老师备考规划（建议）</div>
      <div class="prep-plan">
        <div class="prep-plan-item"><strong>听力：</strong>精听 + 泛听结合，重点练 Section 3/4 学术场景，错题归入「错题本」（同义替换/漏听/拼写）。</div>
        <div class="prep-plan-item"><strong>阅读：</strong>掌握平行阅读法，先题后文；把遇到的同义替换记进「同义替换」库，控制每篇 20 分钟内。</div>
        <div class="prep-plan-item"><strong>写作：</strong>Task 2 用"观点-论证-反驳-结论"四段式；Task 1 背熟趋势/比较句型；每篇写后自评分并记反馈。</div>
        <div class="prep-plan-item"><strong>口语：</strong>Part 2 准备 20 个万能素材可串多个话题；录音自查流利度与语法错误（录音会保存在本机）。</div>
        <div class="prep-plan-item"><strong>每周节奏：</strong>词汇每日打卡，周末模考一套完整卷，查漏补缺。</div>
      </div>
    </div>

    <div class="prep-card" style="margin-top:12px">
      <div class="prep-card-title">📝 我的备考笔记</div>
      <textarea class="textarea" id="prepNotes" style="min-height:120px;margin-top:8px" placeholder="记录错题、模考分数、心得…">${escapeHtml(plan.notes)}</textarea>
      <button class="btn btn-primary" id="saveNotesBtn" style="margin-top:8px">保存笔记</button>
    </div>
  `;
  el.querySelector('#savePlanBtn').onclick = () => {
    const p = loadPlan();
    p.targetOverall = document.getElementById('p_overall').value;
    p.targetL = document.getElementById('p_l').value;
    p.targetR = document.getElementById('p_r').value;
    p.targetW = document.getElementById('p_w').value;
    p.targetS = document.getElementById('p_s').value;
    p.examDate = document.getElementById('p_date').value;
    p.dailyNew = Math.max(1, parseInt(document.getElementById('p_daily').value) || 20);
    savePlan(p);
    toast('目标已保存');
    renderPrep(container, el);
  };
  el.querySelector('#saveNotesBtn').onclick = () => {
    const p = loadPlan();
    p.notes = document.getElementById('prepNotes').value;
    savePlan(p);
    toast('笔记已保存');
  };
}

// ===================== 工具 =====================
function daysTo(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d - new Date()) / 86400000);
  return diff >= 0 ? diff : 0;
}
function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
