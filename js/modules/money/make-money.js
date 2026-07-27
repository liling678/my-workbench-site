// make-money.js — Make Money：记录赚钱点子
import { registerStandalone, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const KEY = 'make_money_ideas';

const STATUS = [
  { id: 'idea', name: '点子', cls: 'badge-blue' },
  { id: 'research', name: '调研中', cls: 'badge-amber' },
  { id: 'doing', name: '进行中', cls: 'badge-green' },
  { id: 'paused', name: '暂停', cls: 'badge-gray' },
  { id: 'done', name: '已完成', cls: 'badge-gray' },
];

const POTENTIAL = [
  { id: 'low', name: '小赚', cls: 'badge-gray' },
  { id: 'medium', name: '中等', cls: 'badge-blue' },
  { id: 'high', name: '大赚', cls: 'badge-green' },
];

function load() { return Storage.get(KEY, []); }
function save(data) { Storage.set(KEY, data); }

export function initMakeMoney() {
  registerStandalone('make-money', {
    title: 'Make Money',
    icon: Icons.money,
    render(container) {
      const data = load().sort((a, b) => b.createdAt - a.createdAt);
      const doing = data.filter(d => d.status === 'doing' || d.status === 'research').length;

      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">Make Money</div>
          <div class="page-desc">记录赚钱点子，评估可行性，跟踪执行 \uD83D\uDCB0</div>
        </div>
        <div id="statsArea"></div>
        <div class="toolbar">
          <div class="search">${Icons.search}<input class="input" id="moneySearch" placeholder="搜索点子…"></div>
          <div class="spacer"></div>
          <button class="btn btn-primary" id="addIdeaBtn">${Icons.plus} 新点子</button>
        </div>
        <div class="list" id="ideaList"></div>
      `;

      renderStats(container);
      renderList(container);
      container.querySelector('#addIdeaBtn').onclick = () => openForm(container, null);
      container.querySelector('#moneySearch').addEventListener('input', () => renderList(container));
    }
  });
}

function renderStats(container) {
  const data = load();
  const doing = data.filter(d => d.status === 'doing' || d.status === 'research').length;
  const done = data.filter(d => d.status === 'done').length;
  const highPotential = data.filter(d => d.potential === 'high').length;
  container.querySelector('#statsArea').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">点子总数</div><div class="stat-value">${data.length}</div></div>
      <div class="stat-card"><div class="stat-label">进行中</div><div class="stat-value" style="color:var(--primary)">${doing}</div></div>
      <div class="stat-card"><div class="stat-label">已完成</div><div class="stat-value" style="color:var(--green)">${done}</div></div>
      <div class="stat-card"><div class="stat-label">高潜力</div><div class="stat-value" style="color:var(--primary)">${highPotential}</div></div>
    </div>`;
}

function renderList(container) {
  const data = load();
  const q = container.querySelector('#moneySearch').value.toLowerCase().trim();
  const filtered = data.filter(d => !q || [d.title, d.desc, d.monetization, (d.tags||[]).join(' ')].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const listEl = container.querySelector('#ideaList');
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.money}</div><div class="empty-title">${data.length === 0 ? '还没有赚钱点子' : '没有匹配的点子'}</div><div class="empty-desc">${data.length === 0 ? '想到什么赚钱的路子？记下来！' : ''}</div></div>`;
    return;
  }
  listEl.innerHTML = filtered.map(d => {
    const st = STATUS.find(s => s.id === d.status) || STATUS[0];
    const pot = POTENTIAL.find(p => p.id === d.potential) || POTENTIAL[0];
    return `<div class="list-item" data-id="${d.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="flex items-center gap-8 mb-8" style="flex-wrap:wrap">
            <span class="badge ${st.cls}">${st.name}</span>
            <span class="badge ${pot.cls}">${pot.name}</span>
          </div>
          <div class="list-item-title">${escapeHtml(d.title)}</div>
          ${d.desc ? `<div class="list-item-body" style="margin-top:6px">${escapeHtml(d.desc)}</div>` : ''}
          ${d.monetization ? `<div class="list-item-body"><strong>变现方式：</strong>${escapeHtml(d.monetization)}</div>` : ''}
          ${d.feasibility ? `<div class="list-item-body"><strong>可行性：</strong>${escapeHtml(d.feasibility)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm idea-edit">${Icons.edit}</button>
          <button class="icon-btn btn-sm idea-del">${Icons.trash}</button>
        </div>
      </div>
      <div class="list-item-meta">
        ${(d.tags||[]).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}
        <span>${fmtDate(d.createdAt)}</span>
      </div>
    </div>`;
  }).join('');
  listEl.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('.idea-edit').onclick = () => openForm(container, id);
    item.querySelector('.idea-del').onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '确定删除这个点子吗？', confirmText: '删除', danger: true })) {
        save(load().filter(r => r.id !== id));
        renderStats(container); renderList(container);
        toast('已删除');
      }
    };
  });
}

function openForm(container, id) {
  const data = load();
  const d = id ? data.find(r => r.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑点子' : '新点子',
    body: `
      <div class="field"><label class="field-label">点子标题 <span class="req">*</span></label>
        <input class="input" id="m_title" value="${escapeAttr(d.title)}" placeholder="如：做一个 XX 工具/小程序" autofocus></div>
      <div class="form-row">
        <div class="field"><label class="field-label">状态</label>
          <select class="select" id="m_status">
            ${STATUS.map(s => `<option value="${s.id}" ${d.status===s.id?'selected':''}>${s.name}</option>`).join('')}
          </select></div>
        <div class="field"><label class="field-label">潜力评估</label>
          <select class="select" id="m_potential">
            ${POTENTIAL.map(p => `<option value="${p.id}" ${d.potential===p.id?'selected':''}>${p.name}</option>`).join('')}
          </select></div>
      </div>
      <div class="field"><label class="field-label">详细描述</label>
        <textarea class="textarea" id="m_desc" style="min-height:80px" placeholder="点子内容、目标用户、解决什么问题…">${escapeHtml(d.desc)}</textarea></div>
      <div class="field"><label class="field-label">变现方式</label>
        <textarea class="textarea" id="m_mon" placeholder="怎么赚钱？如：付费下载、订阅、广告、电商…">${escapeHtml(d.monetization)}</textarea></div>
      <div class="field"><label class="field-label">可行性分析</label>
        <textarea class="textarea" id="m_feas" placeholder="优势、劣势、需要的资源、时间成本…">${escapeHtml(d.feasibility)}</textarea></div>
      <div class="field"><label class="field-label">标签</label>
        <input class="input" id="m_tags" value="${escapeAttr((d.tags||[]).join(', '))}" placeholder="逗号分隔"></div>`,
    foot: `<button class="btn" id="m_cancel">取消</button><button class="btn btn-primary" id="m_save">${isEdit ? '保存' : '记录'}</button>`
  });
  document.getElementById('m_cancel').onclick = closeModal;
  document.getElementById('m_save').onclick = () => {
    const title = document.getElementById('m_title').value.trim();
    if (!title) { toast('请填写标题'); return; }
    const tags = document.getElementById('m_tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const payload = {
      title,
      status: document.getElementById('m_status').value,
      potential: document.getElementById('m_potential').value,
      desc: document.getElementById('m_desc').value.trim(),
      monetization: document.getElementById('m_mon').value.trim(),
      feasibility: document.getElementById('m_feas').value.trim(),
      tags,
    };
    const list = load();
    if (isEdit) {
      const i = list.findIndex(r => r.id === id);
      list[i] = { ...list[i], ...payload, updatedAt: Date.now() };
    } else {
      list.push({ id: Storage.uid(), createdAt: Date.now(), ...payload });
    }
    save(list);
    closeModal();
    renderStats(container); renderList(container);
    toast(isEdit ? '已保存' : '已记录');
  };
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
