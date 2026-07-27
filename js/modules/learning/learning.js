// learning.js — 杂七杂八的学习：塔罗牌学习 + 英语学习
import { registerSection, registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const TAROT_KEY = 'learning_tarot';
const ENGLISH_KEY = 'learning_english';

function loadTarot() { return Storage.get(TAROT_KEY, []); }
function saveTarot(d) { Storage.set(TAROT_KEY, d); }
function loadEnglish() { return Storage.get(ENGLISH_KEY, []); }
function saveEnglish(d) { Storage.set(ENGLISH_KEY, d); }

const TAROT_TABS = [
  { id: 'cards', name: '牌义笔记' },
  { id: 'spreads', name: '牌阵' },
];

let tarotTab = 'cards';

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

  // 英语学习
  registerModule('learning-english', {
    section: 'learning',
    title: '英语学习',
    icon: Icons.book,
    render(container) {
      const data = loadEnglish().sort((a, b) => b.createdAt - a.createdAt);
      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">英语学习</div>
          <div class="page-desc">记录单词、句子、语法笔记</div>
        </div>
        <div class="toolbar">
          <div class="search">${Icons.search}<input class="input" id="engSearch" placeholder="搜索单词、句子…"></div>
          <div class="spacer"></div>
          <button class="btn btn-primary" id="addEngBtn">${Icons.plus} 添加</button>
        </div>
        <div class="list" id="engList"></div>
      `;
      container.querySelector('#addEngBtn').onclick = () => openEngForm(container, null);
      container.querySelector('#engSearch').addEventListener('input', () => renderEngList(container));
      renderEngList(container);
    }
  });
}

// —— 塔罗牌 ——
function renderTarotTab(container) {
  const el = container.querySelector('#tarotContent');
  if (tarotTab === 'cards') renderTarotCards(container, el);
  else renderTarotSpreads(container, el);
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

// —— 英语学习 ——
function renderEngList(container) {
  const q = container.querySelector('#engSearch').value.toLowerCase().trim();
  const data = loadEnglish().filter(r => !q || [r.word, r.translation, r.example, r.note].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const listEl = container.querySelector('#engList');
  if (data.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.book}</div><div class="empty-title">还没有记录</div><div class="empty-desc">添加单词、句子、语法笔记</div></div>`;
    return;
  }
  listEl.innerHTML = data.map(r => `
    <div class="list-item" data-id="${r.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="list-item-title">${escapeHtml(r.word)}</div>
          ${r.translation ? `<div class="list-item-body" style="margin-top:6px">${escapeHtml(r.translation)}</div>` : ''}
          ${r.example ? `<div class="list-item-body" style="font-style:italic;color:var(--text-muted)">${escapeHtml(r.example)}</div>` : ''}
          ${r.note ? `<div class="list-item-body">${escapeHtml(r.note)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm eng-edit">${Icons.edit}</button>
          <button class="icon-btn btn-sm eng-del">${Icons.trash}</button>
        </div>
      </div>
      <div class="list-item-meta">
        ${r.type ? `<span class="tag">#${escapeHtml(r.type)}</span>` : ''}
        <span>${fmtDate(r.createdAt)}</span>
      </div>
    </div>
  `).join('');
  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.eng-edit').onclick = () => openEngForm(container, id);
    item.querySelector('.eng-del').onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '确定删除这条记录吗？', confirmText: '删除', danger: true })) {
        saveEnglish(loadEnglish().filter(r => r.id !== id));
        renderEngList(container);
        toast('已删除');
      }
    };
  });
}

function openEngForm(container, id) {
  const data = loadEnglish();
  const r = id ? data.find(x => x.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑' : '添加英语记录',
    body: `
      <div class="form-row">
        <div class="field"><label class="field-label">单词/短语 <span class="req">*</span></label>
          <input class="input" id="e_word" value="${escapeAttr(r.word)}" placeholder="如：serendipity" autofocus></div>
        <div class="field"><label class="field-label">类型</label>
          <select class="select" id="e_type">
            <option value="word" ${r.type==='word'?'selected':''}>单词</option>
            <option value="phrase" ${r.type==='phrase'?'selected':''}>短语</option>
            <option value="sentence" ${r.type==='sentence'?'selected':''}>句子</option>
            <option value="grammar" ${r.type==='grammar'?'selected':''}>语法</option>
          </select></div>
      </div>
      <div class="field"><label class="field-label">释义</label>
        <input class="input" id="e_trans" value="${escapeAttr(r.translation)}" placeholder="中文释义"></div>
      <div class="field"><label class="field-label">例句</label>
        <textarea class="textarea" id="e_example" style="min-height:60px" placeholder="例句">${escapeHtml(r.example)}</textarea></div>
      <div class="field"><label class="field-label">笔记</label>
        <textarea class="textarea" id="e_note" placeholder="用法、搭配、记忆技巧…">${escapeHtml(r.note)}</textarea></div>`,
    foot: `<button class="btn" id="e_cancel">取消</button><button class="btn btn-primary" id="e_save">保存</button>`
  });
  document.getElementById('e_cancel').onclick = closeModal;
  document.getElementById('e_save').onclick = () => {
    const word = document.getElementById('e_word').value.trim();
    if (!word) { toast('请填写单词或短语'); return; }
    const payload = {
      word,
      type: document.getElementById('e_type').value,
      translation: document.getElementById('e_trans').value.trim(),
      example: document.getElementById('e_example').value.trim(),
      note: document.getElementById('e_note').value.trim(),
    };
    const list = loadEnglish();
    if (isEdit) {
      const i = list.findIndex(x => x.id === id);
      list[i] = { ...list[i], ...payload };
    } else {
      list.push({ id: Storage.uid(), createdAt: Date.now(), ...payload });
    }
    saveEnglish(list);
    closeModal();
    renderEngList(container);
    toast(isEdit ? '已保存' : '已添加');
  };
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
