// app-plan.js — APP发财计划：苹果 App 开发规划
import { registerStandalone, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const KEY = 'app_ideas';

function loadData() {
  return Storage.get(KEY, []);
}
function saveData(data) {
  Storage.set(KEY, data);
}

const STATUSES = [
  { id: 'idea', name: '点子', color: 'badge-blue' },
  { id: 'planning', name: '规划中', color: 'badge-amber' },
  { id: 'developing', name: '开发中', color: 'badge-green' },
  { id: 'testing', name: '测试中', color: 'badge-purple' },
  { id: 'published', name: '已上架', color: 'badge-gray' },
];

export function initAppPlan() {
  registerStandalone('app-plan', {
    title: 'APP发财计划',
    icon: Icons.appPlan,
    render(container) {
      const data = loadData().sort((a, b) => b.createdAt - a.createdAt);

      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">APP发财计划</div>
          <div class="page-desc">苹果 App 开发规划，从点子到上架</div>
        </div>

        <div class="stats-grid">
          ${STATUSES.map(s => {
            const count = data.filter(d => d.status === s.id).length;
            return `<div class="stat-item"><div class="stat-num">${count}</div><div class="stat-label">${s.name}</div></div>`;
          }).join('')}
        </div>

        <div class="flex gap-8 mb-16">
          <button class="btn btn-primary" id="addAppBtn">${Icons.plus} 新增 App 点子</button>
        </div>

        <div class="section-title">App 列表 <span class="cat-count">${data.length}</span></div>
        <div id="appList"></div>
      `;

      renderList(container);
      container.querySelector('#addAppBtn').onclick = () => openAddModal(container);
    }
  });
}

function renderList(container) {
  const data = loadData().sort((a, b) => b.createdAt - a.createdAt);
  const el = container.querySelector('#appList');
  if (data.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">\uD83D\uDCF1</div><div class="empty-title">还没有 App 点子</div><div class="empty-desc">想到了什么好点子？记下来开始你的发财之旅</div></div>`;
    return;
  }
  el.innerHTML = data.map(r => {
    const status = STATUSES.find(s => s.id === r.status) || STATUSES[0];
    return `
      <div class="note-card">
        <div class="note-card-head">
          <div class="note-card-title">${escapeHtml(r.name)}</div>
          <div class="task-actions">
            <button class="task-action-btn" data-app-edit="${r.id}">${Icons.edit}</button>
            <button class="task-action-btn" data-app-del="${r.id}">${Icons.trash}</button>
          </div>
        </div>
        <div class="bug-card-meta">
          <span class="badge ${status.color}">${status.name}</span>
          ${r.category ? `<span class="badge badge-gray">${escapeHtml(r.category)}</span>` : ''}
        </div>
        ${r.description ? `<div class="note-card-body">${escapeHtml(r.description)}</div>` : ''}
        ${r.targetUsers ? `<div class="bug-card-section">目标用户：<strong>${escapeHtml(r.targetUsers)}</strong></div>` : ''}
        ${r.monetization ? `<div class="bug-card-section">变现方式：<strong>${escapeHtml(r.monetization)}</strong></div>` : ''}
        ${r.progress ? `<div class="bug-card-section">当前进度：<strong>${escapeHtml(r.progress)}</strong></div>` : ''}
        <div class="bug-card-section">${fmtDate(r.createdAt)}</div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('[data-app-edit]').forEach(btn => {
    btn.onclick = () => openAddModal(container, btn.dataset.appEdit);
  });
  el.querySelectorAll('[data-app-del]').forEach(btn => {
    btn.onclick = async () => {
      if (!await confirmDialog({ title: '删除', message: '确定删除这个 App 计划吗？', confirmText: '删除', danger: true })) return;
      const data = loadData().filter(r => r.id !== btn.dataset.appDel);
      saveData(data);
      toast('已删除');
      renderList(container);
    };
  });
}

function openAddModal(container, editId) {
  const editing = editId ? loadData().find(d => d.id === editId) : null;
  openModal({
    title: editing ? '编辑 App' : '新增 App 点子',
    size: 'lg',
    body: `
      <div class="field">
        <label class="field-label">App 名称</label>
        <input class="input" id="appName" value="${editing ? escapeHtml(editing.name) : ''}" placeholder="如：习惯打卡宝" autofocus>
      </div>
      <div class="field">
        <label class="field-label">分类</label>
        <input class="input" id="appCategory" value="${editing ? escapeHtml(editing.category || '') : ''}" placeholder="如：效率、健康、社交、工具">
      </div>
      <div class="field">
        <label class="field-label">状态</label>
        <select class="select" id="appStatus">
          ${STATUSES.map(s => `<option value="${s.id}" ${editing && editing.status === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">描述</label>
        <textarea class="textarea" id="appDesc" placeholder="这个 App 做什么？解决什么问题？">${editing ? escapeHtml(editing.description || '') : ''}</textarea>
      </div>
      <div class="field">
        <label class="field-label">目标用户</label>
        <input class="input" id="appUsers" value="${editing ? escapeHtml(editing.targetUsers || '') : ''}" placeholder="如：大学生、上班族">
      </div>
      <div class="field">
        <label class="field-label">变现方式</label>
        <input class="input" id="appMoney" value="${editing ? escapeHtml(editing.monetization || '') : ''}" placeholder="如：内购、订阅、广告">
      </div>
      <div class="field">
        <label class="field-label">当前进度</label>
        <textarea class="textarea" id="appProgress" placeholder="做到哪一步了？下一步计划？">${editing ? escapeHtml(editing.progress || '') : ''}</textarea>
      </div>`,
    foot: `<button class="btn" id="appCancel">取消</button><button class="btn btn-primary" id="appSave">保存</button>`
  });
  document.getElementById('appCancel').onclick = closeModal;
  document.getElementById('appSave').onclick = () => {
    const name = document.getElementById('appName').value.trim();
    if (!name) { toast('请输入 App 名称'); return; }
    const item = {
      name,
      category: document.getElementById('appCategory').value.trim(),
      status: document.getElementById('appStatus').value,
      description: document.getElementById('appDesc').value.trim(),
      targetUsers: document.getElementById('appUsers').value.trim(),
      monetization: document.getElementById('appMoney').value.trim(),
      progress: document.getElementById('appProgress').value.trim(),
    };
    if (editing) {
      const data = loadData();
      const idx = data.findIndex(d => d.id === editId);
      data[idx] = { ...editing, ...item };
      saveData(data);
    } else {
      const data = loadData();
      data.push({ id: Storage.uid(), ...item, createdAt: Date.now() });
      saveData(data);
    }
    closeModal();
    toast('已保存');
    renderList(container);
    // 刷新统计
    const stats = container.querySelectorAll('.stat-num');
    if (stats.length > 0) {
      const allData = loadData();
      STATUSES.forEach((s, i) => {
        if (stats[i]) stats[i].textContent = allData.filter(d => d.status === s.id).length;
      });
    }
  };
}
