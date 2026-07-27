// learning.js — 杂七杂八的学习：塔罗牌学习 + 雅思备考（资深老师设计）
import { registerSection, registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const TAROT_KEY = 'learning_tarot';

// ===== 雅思备考数据键 =====
const IELTS_WORDS_KEY = 'ielts_words';     // 单词库
const IELTS_SPEAK_KEY = 'ielts_speak';     // 口语练习
const IELTS_PLAN_KEY = 'ielts_plan';       // 备考中心（目标分/笔记）

// SRS：Leitner 盒子，index = box（0=新词，未学过），间隔天数
const BOX_INTERVAL = [0, 1, 2, 4, 7, 15];
const BOX_MAX = 5;

function loadTarot() { return Storage.get(TAROT_KEY, []); }
function saveTarot(d) { Storage.set(TAROT_KEY, d); }
function loadWords() { return Storage.get(IELTS_WORDS_KEY, []); }
function saveWords(d) { Storage.set(IELTS_WORDS_KEY, d); }
function loadSpeak() { return Storage.get(IELTS_SPEAK_KEY, []); }
function saveSpeak(d) { Storage.set(IELTS_SPEAK_KEY, d); }
function loadPlan() { return Storage.get(IELTS_PLAN_KEY, { notes: '' }); }
function savePlan(d) { Storage.set(IELTS_PLAN_KEY, d); }

const TAROT_TABS = [
  { id: 'cards', name: '牌义笔记' },
  { id: 'spreads', name: '牌阵' },
];

let tarotTab = 'cards';
let ieltsTab = 'words';

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
        { id: 'speak', name: '口语练习' },
        { id: 'prep', name: '备考中心' },
      ];
      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">雅思备考 · 跟着老师学</div>
          <div class="page-desc">单词间隔记忆 · 口语话题陪练 · 系统备考规划</div>
        </div>
        <div class="tabs">
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
  else renderPrep(container, el);
}

// ---------- 单词库（SRS 间隔重复） ----------
let reviewQueue = [];
let reviewIndex = 0;
let reviewDone = 0;

function dueWords() {
  const now = Date.now();
  return loadWords().filter(w => w.box >= 1 && (w.nextReview || 0) <= now);
}
function newWords() {
  return loadWords().filter(w => w.box === 0);
}

function renderWords(container, el) {
  const words = loadWords();
  const due = dueWords().length;
  const fresh = newWords().length;
  const mastered = words.filter(w => w.box >= BOX_MAX).length;
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-num">${words.length}</div><div class="stat-label">词汇总量</div></div>
      <div class="stat-item"><div class="stat-num">${due + fresh}</div><div class="stat-label">今日待练</div></div>
      <div class="stat-item"><div class="stat-num">${mastered}</div><div class="stat-label">已掌握</div></div>
    </div>
    <div class="toolbar">
      <div class="search">${Icons.search}<input class="input" id="wSearch" placeholder="搜索单词…"></div>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="practiceBtn">${Icons.fire} 开始练习</button>
      <button class="btn" id="addWordBtn">${Icons.plus} 添加单词</button>
    </div>
    <div id="wordArea"></div>
  `;
  el.querySelector('#addWordBtn').onclick = () => openWordForm(container, null);
  el.querySelector('#practiceBtn').onclick = () => startPractice(container, el);
  el.querySelector('#wSearch').addEventListener('input', () => renderWordList(container, el));
  renderWordList(container, el);
}

function renderWordList(container, el) {
  const q = (el.querySelector('#wSearch')?.value || '').toLowerCase().trim();
  const words = loadWords()
    .filter(w => !q || [w.word, w.meaning, w.example, w.note].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const listEl = el.querySelector('#wordArea');
  if (words.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.grad}</div><div class="empty-title">词库还是空的</div><div class="empty-desc">点「添加单词」录入雅思核心词，再开始间隔复习</div></div>`;
    return;
  }
  const now = Date.now();
  listEl.innerHTML = `<div class="list">${words.map(w => {
    const isDue = w.box >= 1 && (w.nextReview || 0) <= now;
    const boxLabel = w.box === 0 ? '未学' : `L${w.box}`;
    const boxCls = w.box === 0 ? 'badge-gray' : (w.box >= BOX_MAX ? 'badge-green' : 'badge-blue');
    return `
      <div class="list-item" data-id="${w.id}">
        <div class="list-item-head">
          <div style="flex:1;min-width:0">
            <div class="flex items-center gap-8 mb-8">
              <span class="badge ${boxCls}">${boxLabel}</span>
              ${isDue ? '<span class="badge badge-amber">待复习</span>' : ''}
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
        <div class="list-item-meta"><span>${fmtDate(w.createdAt)}</span>${w.reviewedAt ? `<span>上次复习 ${fmtDate(w.reviewedAt)}</span>` : ''}</div>
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
      list.push({ id: Storage.uid(), createdAt: Date.now(), box: 0, nextReview: 0, reviewedAt: 0, ...payload });
    }
    saveWords(list);
    closeModal();
    const el = container.querySelector('#ieltsContent');
    renderWords(container, el);
    toast(isEdit ? '已保存' : '已添加');
  };
}

// 练习流程：待复习 + 新词，组成队列，翻转卡片逐张评级
function startPractice(container, el) {
  const due = dueWords();
  const fresh = newWords();
  reviewQueue = [...due, ...fresh].slice(0, 30);
  reviewIndex = 0;
  reviewDone = 0;
  if (reviewQueue.length === 0) {
    el.querySelector('#wordArea').innerHTML = `<div class="empty"><div class="empty-icon">${Icons.fire}</div><div class="empty-title">今天没有要练的单词 🎉</div><div class="empty-desc">去「添加单词」补充词库，或明天再来复习</div></div>`;
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
        <div class="practice-done-sub">共复习 ${reviewDone} 个单词，坚持就是高分！</div>
        <button class="btn btn-primary" id="backListBtn">返回词库</button>
      </div>`;
    area.querySelector('#backListBtn').onclick = () => renderWords(container, el);
    return;
  }
  const w = reviewQueue[reviewIndex];
  const remain = reviewQueue.length - reviewIndex;
  area.innerHTML = `
    <div class="ielts-practice">
      <div class="practice-progress">剩余 ${remain} 个</div>
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
      const rate = Number(btn.dataset.rate);
      rateWord(w, rate);
      reviewIndex++;
      reviewDone++;
      renderPracticeCard(container, el);
    };
  });
}

function rateWord(w, rate) {
  const list = loadWords();
  const i = list.findIndex(x => x.id === w.id);
  if (i < 0) return;
  const now = Date.now();
  const DAY = 86400000;
  if (rate === 2) {
    // 认识：升级盒子，拉长安隔
    const box = Math.min((list[i].box || 0) + 1, BOX_MAX);
    list[i].box = box;
    list[i].nextReview = now + BOX_INTERVAL[box] * DAY;
  } else if (rate === 1) {
    // 模糊：盒子不变，明天再复习
    list[i].box = list[i].box || 1;
    list[i].nextReview = now + 1 * DAY;
  } else {
    // 不认识：重置到 L1，明天再学
    list[i].box = list[i].box === 0 ? 0 : 1;
    list[i].nextReview = now + 1 * DAY;
  }
  list[i].reviewedAt = now;
  saveWords(list);
}

// ---------- 口语练习（Part 1/2/3 话题卡 + 陪练） ----------
const SPEAK_PARTS = [
  { id: 'p1', name: 'Part 1 · 日常' },
  { id: 'p2', name: 'Part 2 · 独白' },
  { id: 'p3', name: 'Part 3 · 讨论' },
];
let speakPart = 'p1';

// 老师精选话题（含高分支招）
const PRESET_SPEAK = [
  { part: 'p1', topic: 'Hometown / 家乡', question: 'Where is your hometown? What do you like most about it?',
    tips: '用 2-3 句话结构：位置 + 一个亮点 + 一句感受。避免只说 "It\'s nice"。准备 3 个万能形容词（peaceful / convenient / vibrant）。' },
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
      list.push({ id: Storage.uid(), preset: true, practiced: false, answer: '', practicedAt: 0, createdAt: Date.now(), ...p });
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
    <div class="tabs" style="margin-bottom:12px">
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
          <div class="speak-topic">${escapeHtml(s.topic)} ${s.practiced ? '<span class="badge badge-green">已练</span>' : ''}</div>
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
      list2.push({ id: Storage.uid(), preset: false, practiced: false, answer: '', practicedAt: 0, createdAt: Date.now(), ...payload });
    }
    saveSpeak(list2);
    closeModal();
    const el = container.querySelector('#ieltsContent');
    renderSpeak(container, el);
    toast(isEdit ? '已保存' : '已添加');
  };
}

// 练习弹窗：录音陪练 + 文本答案 + 标记已练
let recorder = null, recChunks = [], recUrl = null, recStream = null;
function openPracticeModal(container, id) {
  const list = loadSpeak();
  const s = list.find(x => x.id === id);
  if (!s) return;
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
          <button class="btn" id="playBtn" disabled>${Icons.play} 回放</button>
          <span class="rec-status" id="recStatus">录音仅在本次会话内可回放，不会上传</span>
        </div>
        <audio id="recAudio" style="display:none;width:100%;margin-top:8px"></audio>
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

  recBtn.onclick = async () => {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      recStatus.textContent = '当前环境不支持录音（需 HTTPS/localhost 且授权麦克风）';
      return;
    }
    try {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recChunks = [];
      recorder = new MediaRecorder(recStream);
      recorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recChunks, { type: 'audio/webm' });
        if (recUrl) URL.revokeObjectURL(recUrl);
        recUrl = URL.createObjectURL(blob);
        audio.src = recUrl;
        audio.style.display = 'block';
        playBtn.disabled = false;
        recStatus.textContent = '录音完成，可回放对比；刷新页面后录音会丢失';
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
  playBtn.onclick = () => { audio.play(); };

  document.getElementById('sp_save').onclick = () => {
    const list2 = loadSpeak();
    const i = list2.findIndex(x => x.id === id);
    if (i >= 0) {
      list2[i].answer = document.getElementById('s_answer').value.trim();
      list2[i].practiced = document.getElementById('s_practiced').checked;
      if (list2[i].practiced) list2[i].practicedAt = Date.now();
    }
    saveSpeak(list2);
    closeModal();
    const el = container.querySelector('#ieltsContent');
    renderSpeak(container, el);
    toast('已保存');
  };
}

// ---------- 备考中心 ----------
function renderPrep(container, el) {
  const plan = loadPlan();
  const words = loadWords().length;
  const speakDone = loadSpeak().filter(s => s.practiced).length;
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
          <button class="btn btn-primary" id="savePlanBtn">保存目标</button>
        </div>
      </div>

      <div class="prep-card">
        <div class="prep-card-title">📈 学习进度</div>
        <div class="stats-grid" style="margin-top:8px">
          <div class="stat-item"><div class="stat-num">${words}</div><div class="stat-label">已录入单词</div></div>
          <div class="stat-item"><div class="stat-num">${speakDone}</div><div class="stat-label">口语已练</div></div>
          <div class="stat-item"><div class="stat-num">${plan.examDate ? daysTo(plan.examDate) : '—'}</div><div class="stat-label">距考试(天)</div></div>
        </div>
        <div class="prep-tip">每天 20 个新词 + 复习到期词，口语每周覆盖 3 个 Part 2 话题，写作每周精练 2 篇，是稳 7 的节奏。</div>
      </div>
    </div>

    <div class="prep-card" style="margin-top:12px">
      <div class="prep-card-title">👩‍🏫 老师备考规划（建议）</div>
      <div class="prep-plan">
        <div class="prep-plan-item"><strong>听力：</strong>精听 + 泛听结合，重点练 Section 3/4 学术场景，错题归类（拼写/同义替换/漏听）。</div>
        <div class="prep-plan-item"><strong>阅读：</strong>掌握平行阅读法，先题后文；积累同义替换词库，控制每篇 20 分钟内。</div>
        <div class="prep-plan-item"><strong>写作：</strong>Task 2 用 "观点-论证-反驳-结论" 四段式；Task 1 背熟趋势/比较句型；每周找人批改。</div>
        <div class="prep-plan-item"><strong>口语：</strong>Part 2 准备 20 个万能素材可串多个话题；录音自查流利度与语法错误。</div>
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

function daysTo(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d - new Date()) / 86400000);
  return diff >= 0 ? diff : 0;
}

// ===================== 工具 =====================
function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
