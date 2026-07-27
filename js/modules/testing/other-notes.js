// 其他总结 — 通用笔记，标签分类
import { registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const KEY = 'othernotes';

function load() { return Storage.get(KEY, []); }
function save(data) { Storage.set(KEY, data); }

let activeTag = '';

export function initOtherNotes() {
  registerModule('other-notes', {
    section: 'testing',
    title: '其他总结',
    icon: Icons.notes,
    description: '通用笔记 · 标签',
    render(container) {
      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">其他总结</div>
          <div class="page-desc">自由记录工作中的各类总结、灵感与备忘，用标签分类管理</div>
        </div>
        <div class="toolbar">
          <div class="search">${Icons.search}<input class="input" id="onSearch" placeholder="搜索标题、内容、标签…"></div>
          <div class="spacer"></div>
          <button class="btn btn-primary" id="addBtn">${Icons.plus} 写总结</button>
        </div>
        <div id="tagBar" class="mb-16"></div>
        <div class="list" id="onList"></div>
      `;
      container.querySelector('#addBtn').onclick = () => openForm(container, null);
      container.querySelector('#onSearch').addEventListener('input', () => renderList(container));
      activeTag = '';
      renderList(container);
    }
  });
}

function getAllTags() {
  const tags = {};
  load().forEach(n => (n.tags || []).forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
  return Object.entries(tags).sort((a, b) => b[1] - a[1]);
}

function renderList(container) {
  const notes = load();
  const q = container.querySelector('#onSearch').value.toLowerCase().trim();

  // 标签栏
  const allTags = getAllTags();
  const tagBar = container.querySelector('#tagBar');
  if (allTags.length > 0) {
    tagBar.innerHTML = `<div class="flex gap-8" style="flex-wrap:wrap">
      <span class="tag" data-tag="" style="cursor:pointer;${activeTag===''?'background:var(--blue-bg);color:var(--blue);border-color:var(--blue-border)':''}">全部 ${notes.length}</span>
      ${allTags.map(([t, c]) => `<span class="tag" data-tag="${escapeAttr(t)}" style="cursor:pointer;${activeTag===t?'background:var(--blue-bg);color:var(--blue);border-color:var(--blue-border)':''}">#${escapeHtml(t)} ${c}</span>`).join('')}
    </div>`;
    tagBar.querySelectorAll('.tag').forEach(el => {
      el.onclick = () => { activeTag = el.dataset.tag; renderList(container); };
    });
  } else {
    tagBar.innerHTML = '';
  }

  // 列表
  const filtered = notes.filter(n => {
    if (activeTag && !(n.tags || []).includes(activeTag)) return false;
    if (q && ![n.title, n.content, (n.tags || []).join(' ')].join(' ').toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

  const listEl = container.querySelector('#onList');
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty">
      <div class="empty-icon">${Icons.notes}</div>
      <div class="empty-title">${notes.length === 0 ? '还没有总结' : '没有匹配的内容'}</div>
      <div class="empty-desc">${notes.length === 0 ? '点击「写总结」记录你的想法' : '试试其他关键词或标签'}</div>
    </div>`;
    return;
  }

  listEl.innerHTML = filtered.map(n => `
    <div class="list-item" data-id="${n.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="list-item-title">${escapeHtml(n.title)}</div>
          ${n.content ? `<div class="list-item-body" style="margin-top:6px;white-space:pre-wrap">${escapeHtml(n.content.slice(0,240))}${n.content.length>240?'…':''}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm on-edit">${Icons.edit}</button>
          <button class="icon-btn btn-sm on-del">${Icons.trash}</button>
        </div>
      </div>
      <div class="list-item-meta">
        ${(n.tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}
        <span>${fmtDate(n.updatedAt || n.createdAt)}</span>
      </div>
    </div>`).join('');

  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.on-edit').onclick = () => openForm(container, id);
    item.querySelector('.on-del').onclick = async () => {
      if (await confirmDialog({ title: '删除总结', message: '确定删除这条总结吗？此操作不可恢复。', confirmText: '删除', danger: true })) {
        save(load().filter(n => n.id !== id));
        renderList(container);
        toast('已删除');
      }
    };
  });
}

function openForm(container, id) {
  const notes = load();
  const n = id ? notes.find(x => x.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑总结' : '写总结',
    body: `
      <div class="field"><label class="field-label">标题 <span class="req">*</span></label>
        <input class="input" id="o_title" value="${escapeAttr(n.title)}" placeholder="总结标题"></div>
      <div class="field"><label class="field-label">内容</label>
        <textarea class="textarea" id="o_content" style="min-height:200px" placeholder="自由记录…">${escapeHtml(n.content)}</textarea></div>
      <div class="field"><label class="field-label">标签</label>
        <input class="input" id="o_tags" value="${escapeAttr((n.tags||[]).join(', '))}" placeholder="逗号分隔，如：复盘, 灵感"></div>`,
    foot: `<button class="btn" id="o_cancel">取消</button><button class="btn btn-primary" id="o_save">保存</button>`
  });
  document.getElementById('o_cancel').onclick = closeModal;
  document.getElementById('o_save').onclick = () => {
    const title = document.getElementById('o_title').value.trim();
    if (!title) { toast('请填写标题'); return; }
    const now = Date.now();
    const tags = document.getElementById('o_tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const payload = {
      title,
      content: document.getElementById('o_content').value.trim(),
      tags,
      updatedAt: now,
    };
    const list = load();
    if (isEdit) {
      const i = list.findIndex(x => x.id === id);
      list[i] = { ...list[i], ...payload };
    } else {
      list.push({ id: Storage.uid(), createdAt: now, ...payload });
    }
    save(list);
    closeModal();
    renderList(container);
    toast(isEdit ? '已保存' : '已保存');
  };
}

function escapeAttr(s){ if(s==null)return''; return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
