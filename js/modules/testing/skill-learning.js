// 测试技能学习 — 学习计划 / 笔记 / 资源收藏
import { registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const KEY = 'skilllearning';
const TABS = [
  { id: 'notes', name: '笔记' },
  { id: 'plans', name: '学习计划' },
  { id: 'resources', name: '资源收藏' },
];

function load() {
  return Storage.get(KEY, { plans: [], notes: [], resources: [] });
}
function save(data) { Storage.set(KEY, data); }

let activeTab = 'notes'; // 默认显示笔记，强调记录

export function initSkillLearning() {
  registerModule('skill-learning', {
    section: 'testing',
    title: '测试技能学习',
    icon: Icons.skill,
    description: '计划 · 笔记 · 资源',
    render(container) {
      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">测试技能学习</div>
          <div class="page-desc">记录测试学习笔记、学习计划和资源，持续提升技能</div>
        </div>
        <div id="statsArea"></div>
        <div class="tabs">
          ${TABS.map(t => `<div class="tab ${t.id===activeTab?'active':''}" data-tab="${t.id}">${t.name}</div>`).join('')}
        </div>
        <div id="tabContent"></div>
      `;
      container.querySelectorAll('.tab').forEach(el => {
        el.onclick = () => {
          activeTab = el.dataset.tab;
          container.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
          renderTab(container);
        };
      });
      renderStats(container);
      renderTab(container);
    }
  });
}

function renderStats(container) {
  const d = load();
  const planCount = d.plans.length;
  const avgProgress = planCount ? Math.round(d.plans.reduce((s, p) => s + (p.progress || 0), 0) / planCount) : 0;
  container.querySelector('#statsArea').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">学习计划</div><div class="stat-value">${planCount}</div></div>
      <div class="stat-card"><div class="stat-label">平均进度</div><div class="stat-value" style="color:var(--blue)">${avgProgress}%</div></div>
      <div class="stat-card"><div class="stat-label">笔记</div><div class="stat-value">${d.notes.length}</div></div>
      <div class="stat-card"><div class="stat-label">收藏资源</div><div class="stat-value">${d.resources.length}</div></div>
    </div>`;
}

function renderTab(container) {
  const el = container.querySelector('#tabContent');
  if (activeTab === 'plans') renderPlans(container, el);
  else if (activeTab === 'notes') renderNotes(container, el);
  else renderResources(container, el);
}

// —— 学习计划 ——
function renderPlans(container, el) {
  const d = load();
  el.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn-primary" id="addPlanBtn">${Icons.plus} 新建计划</button>
    </div>
    <div class="list" id="planList"></div>`;
  el.querySelector('#addPlanBtn').onclick = () => openPlanForm(container, null);
  renderPlanList(container, el);
}

function renderPlanList(container, el) {
  const d = load();
  const listEl = el.querySelector('#planList');
  if (d.plans.length === 0) {
    listEl.innerHTML = emptyState(Icons.skill, '还没有学习计划', '新建一个计划，开始系统化学习');
    return;
  }
  listEl.innerHTML = d.plans.map(p => {
    const overdue = p.deadline && new Date(p.deadline) < new Date() && p.progress < 100;
    return `<div class="list-item" data-id="${p.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="list-item-title">${escapeHtml(p.topic)}</div>
          ${p.goal ? `<div class="list-item-body" style="margin-top:6px">${escapeHtml(p.goal)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm plan-edit">${Icons.edit}</button>
          <button class="icon-btn btn-sm plan-del">${Icons.trash}</button>
        </div>
      </div>
      <div class="mt-12">
        <div class="flex items-center justify-between mb-8">
          <span class="text-sm text-muted">进度</span>
          <span class="text-sm font-600">${p.progress || 0}%</span>
        </div>
        <div class="progress"><div class="progress-bar" style="width:${p.progress||0}%"></div></div>
      </div>
      <div class="list-item-meta">
        ${p.deadline ? `<span style="${overdue?'color:var(--red)':''}">${Icons.clock}<span style="margin-left:2px">截止 ${p.deadline}</span></span>` : ''}
        <span>${fmtDate(p.createdAt)}</span>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.plan-edit').onclick = () => openPlanForm(container, id);
    item.querySelector('.plan-del').onclick = async () => {
      if (await confirmDialog({ title: '删除计划', message: '确定删除这个学习计划吗？', confirmText: '删除', danger: true })) {
        const d = load(); d.plans = d.plans.filter(p => p.id !== id); save(d);
        renderStats(container); renderPlanList(container, el); toast('已删除');
      }
    };
  });
}

function openPlanForm(container, id) {
  const d = load();
  const p = id ? d.plans.find(x => x.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑计划' : '新建学习计划',
    body: `
      <div class="field"><label class="field-label">学习主题 <span class="req">*</span></label>
        <input class="input" id="p_topic" value="${escapeAttr(p.topic)}" placeholder="如：接口自动化测试"></div>
      <div class="field"><label class="field-label">学习目标</label>
        <textarea class="textarea" id="p_goal" placeholder="想达到什么程度？">${escapeHtml(p.goal)}</textarea></div>
      <div class="form-row">
        <div class="field"><label class="field-label">进度 (%)</label>
          <input class="input" id="p_progress" type="number" min="0" max="100" value="${p.progress||0}"></div>
        <div class="field"><label class="field-label">截止日期</label>
          <input class="input" id="p_deadline" type="date" value="${p.deadline||''}"></div>
      </div>`,
    foot: `<button class="btn" id="p_cancel">取消</button><button class="btn btn-primary" id="p_save">保存</button>`
  });
  document.getElementById('p_cancel').onclick = closeModal;
  document.getElementById('p_save').onclick = () => {
    const topic = document.getElementById('p_topic').value.trim();
    if (!topic) { toast('请填写学习主题'); return; }
    const payload = {
      topic,
      goal: document.getElementById('p_goal').value.trim(),
      progress: Math.max(0, Math.min(100, +document.getElementById('p_progress').value || 0)),
      deadline: document.getElementById('p_deadline').value,
    };
    const list = load();
    if (isEdit) {
      const i = list.plans.findIndex(x => x.id === id);
      list.plans[i] = { ...list.plans[i], ...payload };
    } else {
      list.plans.push({ id: Storage.uid(), createdAt: Date.now(), ...payload });
    }
    save(list);
    closeModal();
    renderStats(container); renderTab(container); toast(isEdit ? '已保存' : '已创建');
  };
}

// —— 笔记 ——
function renderNotes(container, el) {
  const d = load();
  el.innerHTML = `
    <div class="toolbar">
      <div class="search">${Icons.search}<input class="input" id="noteSearch" placeholder="搜索笔记…"></div>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="addNoteBtn">${Icons.plus} 写笔记</button>
    </div>
    <div class="list" id="noteList"></div>`;
  el.querySelector('#addNoteBtn').onclick = () => openNoteForm(container, null);
  el.querySelector('#noteSearch').addEventListener('input', () => renderNoteList(container, el));
  renderNoteList(container, el);
}

function renderNoteList(container, el) {
  const d = load();
  const q = el.querySelector('#noteSearch').value.toLowerCase().trim();
  const notes = d.notes.filter(n => !q || [n.title, n.content, (n.tags||[]).join(' ')].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const listEl = el.querySelector('#noteList');
  if (notes.length === 0) {
    listEl.innerHTML = emptyState(Icons.notes, d.notes.length === 0 ? '还没有笔记' : '没有匹配的笔记', d.notes.length === 0 ? '记录学习过程中的知识点和心得' : '');
    return;
  }
  listEl.innerHTML = notes.map(n => `
    <div class="list-item" data-id="${n.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="list-item-title">${escapeHtml(n.title)}</div>
          ${n.content ? `<div class="list-item-body" style="margin-top:6px">${escapeHtml(n.content.slice(0,160))}${n.content.length>160?'…':''}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm note-edit">${Icons.edit}</button>
          <button class="icon-btn btn-sm note-del">${Icons.trash}</button>
        </div>
      </div>
      <div class="list-item-meta">
        ${(n.tags||[]).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}
        <span>${fmtDate(n.createdAt)}</span>
      </div>
    </div>`).join('');
  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.note-edit').onclick = () => openNoteForm(container, id);
    item.querySelector('.note-del').onclick = async () => {
      if (await confirmDialog({ title: '删除笔记', message: '确定删除这条笔记吗？', confirmText: '删除', danger: true })) {
        const d = load(); d.notes = d.notes.filter(n => n.id !== id); save(d);
        renderStats(container); renderNoteList(container, el); toast('已删除');
      }
    };
  });
}

function openNoteForm(container, id) {
  const d = load();
  const n = id ? d.notes.find(x => x.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑笔记' : '写笔记',
    body: `
      <div class="field"><label class="field-label">标题 <span class="req">*</span></label>
        <input class="input" id="n_title" value="${escapeAttr(n.title)}" placeholder="笔记标题"></div>
      <div class="field"><label class="field-label">内容</label>
        <textarea class="textarea" id="n_content" style="min-height:180px" placeholder="知识点、心得、代码片段…">${escapeHtml(n.content)}</textarea></div>
      <div class="field"><label class="field-label">标签</label>
        <input class="input" id="n_tags" value="${escapeAttr((n.tags||[]).join(', '))}" placeholder="逗号分隔"></div>`,
    foot: `<button class="btn" id="n_cancel">取消</button><button class="btn btn-primary" id="n_save">保存</button>`
  });
  document.getElementById('n_cancel').onclick = closeModal;
  document.getElementById('n_save').onclick = () => {
    const title = document.getElementById('n_title').value.trim();
    if (!title) { toast('请填写标题'); return; }
    const tags = document.getElementById('n_tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const payload = { title, content: document.getElementById('n_content').value.trim(), tags };
    const list = load();
    if (isEdit) { const i = list.notes.findIndex(x => x.id === id); list.notes[i] = { ...list.notes[i], ...payload }; }
    else { list.notes.push({ id: Storage.uid(), createdAt: Date.now(), ...payload }); }
    save(list);
    closeModal(); renderStats(container); renderTab(container); toast(isEdit ? '已保存' : '已保存');
  };
}

// —— 资源收藏 ——
function renderResources(container, el) {
  const d = load();
  el.innerHTML = `
    <div class="toolbar">
      <div class="search">${Icons.search}<input class="input" id="resSearch" placeholder="搜索资源…"></div>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="addResBtn">${Icons.plus} 收藏资源</button>
    </div>
    <div class="list" id="resList"></div>`;
  el.querySelector('#addResBtn').onclick = () => openResForm(container, null);
  el.querySelector('#resSearch').addEventListener('input', () => renderResList(container, el));
  renderResList(container, el);
}

function renderResList(container, el) {
  const d = load();
  const q = el.querySelector('#resSearch').value.toLowerCase().trim();
  const res = d.resources.filter(r => !q || [r.title, r.url, r.note].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const listEl = el.querySelector('#resList');
  if (res.length === 0) {
    listEl.innerHTML = emptyState(Icons.link, d.resources.length === 0 ? '还没有收藏资源' : '没有匹配的资源', d.resources.length === 0 ? '收藏文章、教程、工具链接' : '');
    return;
  }
  listEl.innerHTML = res.map(r => `
    <div class="list-item" data-id="${r.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="list-item-title">${escapeHtml(r.title)}</div>
          ${r.url ? `<div class="list-item-meta" style="margin-top:6px"><a href="${escapeAttr(r.url)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px">${Icons.link}${escapeHtml(r.url)}</a></div>` : ''}
          ${r.note ? `<div class="list-item-body" style="margin-top:6px">${escapeHtml(r.note)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm res-edit">${Icons.edit}</button>
          <button class="icon-btn btn-sm res-del">${Icons.trash}</button>
        </div>
      </div>
    </div>`).join('');
  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.res-edit').onclick = () => openResForm(container, id);
    item.querySelector('.res-del').onclick = async () => {
      if (await confirmDialog({ title: '删除资源', message: '确定删除这个收藏吗？', confirmText: '删除', danger: true })) {
        const d = load(); d.resources = d.resources.filter(r => r.id !== id); save(d);
        renderStats(container); renderResList(container, el); toast('已删除');
      }
    };
  });
}

function openResForm(container, id) {
  const d = load();
  const r = id ? d.resources.find(x => x.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑资源' : '收藏资源',
    body: `
      <div class="field"><label class="field-label">标题 <span class="req">*</span></label>
        <input class="input" id="r_title" value="${escapeAttr(r.title)}" placeholder="资源名称"></div>
      <div class="field"><label class="field-label">链接</label>
        <input class="input" id="r_url" value="${escapeAttr(r.url)}" placeholder="https://…"></div>
      <div class="field"><label class="field-label">备注</label>
        <textarea class="textarea" id="r_note" placeholder="为什么收藏 / 关键点">${escapeHtml(r.note)}</textarea></div>`,
    foot: `<button class="btn" id="r_cancel">取消</button><button class="btn btn-primary" id="r_save">保存</button>`
  });
  document.getElementById('r_cancel').onclick = closeModal;
  document.getElementById('r_save').onclick = () => {
    const title = document.getElementById('r_title').value.trim();
    if (!title) { toast('请填写标题'); return; }
    const payload = { title, url: document.getElementById('r_url').value.trim(), note: document.getElementById('r_note').value.trim() };
    const list = load();
    if (isEdit) { const i = list.resources.findIndex(x => x.id === id); list.resources[i] = { ...list.resources[i], ...payload }; }
    else { list.resources.push({ id: Storage.uid(), createdAt: Date.now(), ...payload }); }
    save(list);
    closeModal(); renderStats(container); renderTab(container); toast('已保存');
  };
}

function emptyState(icon, title, desc) {
  return `<div class="empty"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-desc">${desc||''}</div></div>`;
}
function escapeAttr(s){ if(s==null)return''; return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
