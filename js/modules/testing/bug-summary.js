// Bug 总结 — 记录、归因、统计
import { registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const KEY = 'bugs';
const SEVERITY = [
  { id: 'critical', name: '严重', cls: 'badge-red' },
  { id: 'major', name: '主要', cls: 'badge-amber' },
  { id: 'minor', name: '次要', cls: 'badge-blue' },
  { id: 'trivial', name: '提示', cls: 'badge-gray' },
];
const STATUS = [
  { id: 'open', name: '待修复', cls: 'badge-red' },
  { id: 'fixing', name: '修复中', cls: 'badge-amber' },
  { id: 'fixed', name: '已修复', cls: 'badge-green' },
  { id: 'closed', name: '已关闭', cls: 'badge-gray' },
];

function load() { return Storage.get(KEY, []); }
function save(data) { Storage.set(KEY, data); }

export function initBugSummary() {
  registerModule('bug-summary', {
    section: 'testing',
    title: 'Bug 总结',
    icon: Icons.bug,
    description: '记录 · 归因 · 统计',
    render(container) {
      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">Bug 总结</div>
          <div class="page-desc">记录工作中遇到的 Bug，追踪根因与解决方案，沉淀经验</div>
        </div>
        <div class="toolbar">
          <div class="search">
            ${Icons.search}
            <input class="input" id="bugSearch" placeholder="搜索标题、描述、根因…">
          </div>
          <select class="select" id="filterStatus" style="width:auto">
            <option value="">全部状态</option>
            ${STATUS.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
          <select class="select" id="filterSev" style="width:auto">
            <option value="">全部级别</option>
            ${SEVERITY.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
          <div class="spacer"></div>
          <button class="btn" id="importZentaoBtn">${Icons.link} 禅道导入</button>
          <button class="btn btn-primary" id="addBugBtn">${Icons.plus} 记录 Bug</button>
        </div>
        <div class="list" id="bugList"></div>
      `;

      const rerender = () => { renderList(container); };
      container.querySelector('#addBugBtn').onclick = () => openForm(container, null, rerender);
      container.querySelector('#importZentaoBtn').onclick = () => openZentaoImport(container, rerender);
      container.querySelector('#bugSearch').addEventListener('input', () => renderList(container));
      container.querySelector('#filterStatus').addEventListener('change', () => renderList(container));
      container.querySelector('#filterSev').addEventListener('change', () => renderList(container));

      rerender();
    }
  });
}

function getFilters(container) {
  return {
    q: container.querySelector('#bugSearch').value.toLowerCase().trim(),
    status: container.querySelector('#filterStatus').value,
    sev: container.querySelector('#filterSev').value,
  };
}

function renderStats(container) {
  const bugs = load();
  const open = bugs.filter(b => b.status === 'open').length;
  const fixed = bugs.filter(b => b.status === 'fixed').length;
  const critical = bugs.filter(b => b.severity === 'critical').length;
  container.querySelector('#statsArea').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Bug 总数</div><div class="stat-value">${bugs.length}</div></div>
      <div class="stat-card"><div class="stat-label">待修复</div><div class="stat-value" style="color:var(--red)">${open}</div></div>
      <div class="stat-card"><div class="stat-label">已修复</div><div class="stat-value" style="color:var(--green)">${fixed}</div></div>
      <div class="stat-card"><div class="stat-label">严重 Bug</div><div class="stat-value" style="color:var(--red)">${critical}</div></div>
    </div>`;
}

function renderList(container) {
  const bugs = load();
  const f = getFilters(container);
  const filtered = bugs.filter(b => {
    if (f.status && b.status !== f.status) return false;
    if (f.sev && b.severity !== f.sev) return false;
    if (f.q) {
      const hay = [b.title, b.description, b.rootCause, b.solution, b.module, (b.tags||[]).join(' ')].join(' ').toLowerCase();
      if (!hay.includes(f.q)) return false;
    }
    return true;
  }).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

  const listEl = container.querySelector('#bugList');
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty">
      <div class="empty-icon">${Icons.bug}</div>
      <div class="empty-title">${bugs.length === 0 ? '还没有 Bug 记录' : '没有匹配的 Bug'}</div>
      <div class="empty-desc">${bugs.length === 0 ? '点击「记录 Bug」开始沉淀经验' : '试试调整筛选条件'}</div>
    </div>`;
    return;
  }

  listEl.innerHTML = filtered.map(b => {
    const sev = SEVERITY.find(s => s.id === b.severity) || SEVERITY[1];
    const st = STATUS.find(s => s.id === b.status) || STATUS[0];
    const tags = (b.tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('');
    return `<div class="list-item" data-id="${b.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="flex items-center gap-8 mb-8" style="flex-wrap:wrap">
            <span class="badge ${sev.cls}">${sev.name}</span>
            <span class="badge ${st.cls}">${st.name}</span>
            ${b.module ? `<span class="text-xs text-muted">${escapeHtml(b.module)}</span>` : ''}
          </div>
          <div class="list-item-title">${escapeHtml(b.title)}</div>
        </div>
        <div class="list-item-actions">
          <button class="icon-btn btn-sm bug-edit" title="编辑">${Icons.edit}</button>
          <button class="icon-btn btn-sm bug-del" title="删除">${Icons.trash}</button>
        </div>
      </div>
      ${b.description ? `<div class="list-item-body"><strong>描述：</strong>${escapeHtml(b.description)}</div>` : ''}
      ${b.rootCause ? `<div class="list-item-body"><strong>根因：</strong>${escapeHtml(b.rootCause)}</div>` : ''}
      ${b.solution ? `<div class="list-item-body"><strong>解决方案：</strong>${escapeHtml(b.solution)}</div>` : ''}
      ${b.zentaoUrl ? `<div class="list-item-body"><strong>禅道链接：</strong><a href="${escapeAttr(b.zentaoUrl)}" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline">${escapeHtml(b.zentaoUrl)}</a></div>` : ''}
      <div class="list-item-meta">
        ${tags}
        <span>${fmtDate(b.updatedAt || b.createdAt)}</span>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.list-item').forEach(el => {
    const id = el.dataset.id;
    el.querySelector('.bug-edit').onclick = () => openForm(container, id, () => { renderList(container); });
    el.querySelector('.bug-del').onclick = async () => {
      if (await confirmDialog({ title: '删除 Bug', message: '确定删除这条 Bug 记录吗？此操作不可恢复。', confirmText: '删除', danger: true })) {
        save(load().filter(b => b.id !== id));
        renderList(container);
        toast('已删除');
      }
    };
  });
}

function openForm(container, id, onSave) {
  const bugs = load();
  const bug = id ? bugs.find(b => b.id === id) : {};
  const isEdit = !!id;
  openModal({
    title: isEdit ? '编辑 Bug' : '记录 Bug',
    body: `
      <div class="field">
        <label class="field-label">标题 <span class="req">*</span></label>
        <input class="input" id="f_title" value="${escapeAttr(bug.title)}" placeholder="简要描述 Bug">
      </div>
      <div class="form-row">
        <div class="field">
          <label class="field-label">所属模块</label>
          <input class="input" id="f_module" value="${escapeAttr(bug.module)}" placeholder="如：登录模块">
        </div>
        <div class="field">
          <label class="field-label">标签</label>
          <input class="input" id="f_tags" value="${escapeAttr((bug.tags||[]).join(', '))}" placeholder="逗号分隔，如：前端, 偶现">
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label class="field-label">严重程度</label>
          <select class="select" id="f_severity">
            ${SEVERITY.map(s => `<option value="${s.id}" ${bug.severity===s.id?'selected':''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label">状态</label>
          <select class="select" id="f_status">
            ${STATUS.map(s => `<option value="${s.id}" ${bug.status===s.id?'selected':''}>${s.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">Bug 描述</label>
        <textarea class="textarea" id="f_desc" placeholder="复现步骤、现象…">${escapeHtml(bug.description)}</textarea>
      </div>
      <div class="field">
        <label class="field-label">根因分析</label>
        <textarea class="textarea" id="f_root" placeholder="为什么会出这个 Bug">${escapeHtml(bug.rootCause)}</textarea>
      </div>
      <div class="field">
        <label class="field-label">解决方案</label>
        <textarea class="textarea" id="f_sol" placeholder="如何修复的 / 经验总结">${escapeHtml(bug.solution)}</textarea>
      </div>`,
    foot: `<button class="btn" id="f_cancel">取消</button><button class="btn btn-primary" id="f_save">${isEdit ? '保存' : '记录'}</button>`
  });
  document.getElementById('f_cancel').onclick = closeModal;
  document.getElementById('f_save').onclick = () => {
    const title = document.getElementById('f_title').value.trim();
    if (!title) { toast('请填写标题'); return; }
    const now = Date.now();
    const tags = document.getElementById('f_tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const payload = {
      title,
      module: document.getElementById('f_module').value.trim(),
      tags,
      severity: document.getElementById('f_severity').value,
      status: document.getElementById('f_status').value,
      description: document.getElementById('f_desc').value.trim(),
      rootCause: document.getElementById('f_root').value.trim(),
      solution: document.getElementById('f_sol').value.trim(),
      updatedAt: now,
    };
    const list = load();
    if (isEdit) {
      const i = list.findIndex(b => b.id === id);
      list[i] = { ...list[i], ...payload };
    } else {
      list.push({ id: Storage.uid(), createdAt: now, ...payload });
    }
    save(list);
    closeModal();
    onSave();
    toast(isEdit ? '已保存' : '已记录');
  };
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 从禅道链接导入 Bug
function openZentaoImport(container, onSave) {
  openModal({
    title: '从禅道链接导入',
    body: `
      <div class="field">
        <label class="field-label">禅道 Bug 链接 <span class="req">*</span></label>
        <textarea class="textarea" id="zentaoUrl" style="min-height:80px" placeholder="粘贴禅道 Bug 链接，支持多条（每行一条）&#10;如：https://zentao.example.com/bug-view-12345.html"></textarea>
      </div>
      <div class="field">
        <label class="field-label">自动填充说明</label>
        <div style="font-size:12px;color:var(--text-muted);line-height:1.7;background:var(--bg-input);padding:10px;border-radius:8px">
          \u2022 系统会从链接中提取 Bug ID，自动创建记录<br>
          \u2022 链接会保存在 Bug 记录中，方便随时跳转查看<br>
          \u2022 导入后可点击编辑补充描述、根因、解决方案等<br>
          \u2022 支持一次粘贴多条链接，批量导入
        </div>
      </div>`,
    foot: `<button class="btn" id="z_cancel">取消</button><button class="btn btn-primary" id="z_import">导入</button>`
  });
  document.getElementById('z_cancel').onclick = closeModal;
  document.getElementById('z_import').onclick = () => {
    const raw = document.getElementById('zentaoUrl').value.trim();
    if (!raw) { toast('请粘贴禅道链接'); return; }
    const urls = raw.split('\n').map(s => s.trim()).filter(Boolean);
    const bugs = load();
    let imported = 0;
    urls.forEach(url => {
      // 从禅道 URL 提取 Bug ID
      // 常见格式：bug-view-12345.html, bug/view/12345, bug-12345
      const match = url.match(/bug[-/]?(?:view[-/]?)?(\d+)/i);
      const bugId = match ? match[1] : '';
      // 检查是否已导入过
      const exists = bugs.some(b => b.zentaoUrl === url || (bugId && b.zentaoId === bugId));
      if (exists) return;
      bugs.push({
        id: Storage.uid(),
        title: bugId ? `禅道Bug #${bugId}` : `禅道Bug（链接导入）`,
        module: '',
        tags: ['禅道'],
        severity: 'major',
        status: 'open',
        description: '',
        rootCause: '',
        solution: '',
        zentaoUrl: url,
        zentaoId: bugId || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      imported++;
    });
    save(bugs);
    closeModal();
    if (imported > 0) {
      toast(`成功导入 ${imported} 条 Bug`);
      onSave();
    } else {
      toast('这些链接已导入过，无新增');
    }
  };
}
