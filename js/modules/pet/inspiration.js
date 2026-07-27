// inspiration.js — 宠物bot / 灵感库：自动搜集爆款宠物视频总结 + 手动记录灵感/对标账号 + 链接解析
import { registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, toast, fmtDate, escapeHtml, copyText } from '../../ui.js';

const KEY = 'pet_inspirations';
const ACCOUNTS_KEY = 'pet_benchmark_accounts';

function loadData() {
  return Storage.get(KEY, []);
}
function saveData(data) {
  Storage.set(KEY, data);
}
function loadAccounts() {
  return Storage.get(ACCOUNTS_KEY, []);
}
function saveAccounts(data) {
  Storage.set(ACCOUNTS_KEY, data);
}

export function initInspiration() {
  registerModule('pet-inspiration', {
    section: 'pet',
    title: '灵感库',
    icon: Icons.sparkles,
    render(container) {
      const data = loadData();
      const accounts = loadAccounts();

      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">灵感库</div>
          <div class="page-desc">记录宠物视频灵感、对标账号、爆款视频总结</div>
        </div>

        <div class="flex gap-8 mb-16" style="flex-wrap:wrap">
          <button class="btn btn-primary" id="addInspirationBtn">${Icons.plus} 添加灵感</button>
          <button class="btn" id="addAccountBtn">${Icons.plus} 添加对标账号</button>
          <button class="btn" id="parseLinkBtn">${Icons.link} 通过链接解析</button>
        </div>

        <div class="section-title">对标账号 <span class="cat-count">${accounts.length}</span></div>
        <div id="accountList" style="margin-bottom:20px"></div>

        <div class="section-title">灵感列表 <span class="cat-count">${data.length}</span></div>
        <div id="inspirationList"></div>
      `;

      renderAccounts(container);
      renderList(container);

      container.querySelector('#addInspirationBtn').onclick = () => openAddModal(container);
      container.querySelector('#addAccountBtn').onclick = () => openAccountModal(container);
      container.querySelector('#parseLinkBtn').onclick = () => openParseLinkModal(container);
    }
  });
}

function renderAccounts(container) {
  const accounts = loadAccounts();
  const el = container.querySelector('#accountList');
  if (accounts.length === 0) {
    el.innerHTML = `<div class="empty" style="padding:20px"><div class="empty-desc">还没有对标账号</div></div>`;
    return;
  }
  el.innerHTML = accounts.map(a => `
    <div class="note-card">
      <div class="note-card-head">
        <div class="note-card-title">${escapeHtml(a.name)}</div>
        <div class="task-actions">
          <button class="task-action-btn" data-acct-edit="${a.id}">${Icons.edit}</button>
          <button class="task-action-btn" data-acct-del="${a.id}">${Icons.trash}</button>
        </div>
      </div>
      ${a.platform ? `<div class="bug-card-section">平台：<strong>${escapeHtml(a.platform)}</strong></div>` : ''}
      ${a.followers ? `<div class="bug-card-section">粉丝：<strong>${escapeHtml(a.followers)}</strong></div>` : ''}
      ${a.note ? `<div class="note-card-body">${escapeHtml(a.note)}</div>` : ''}
    </div>
  `).join('');

  el.querySelectorAll('[data-acct-edit]').forEach(btn => {
    btn.onclick = () => openAccountModal(container, btn.dataset.acctEdit);
  });
  el.querySelectorAll('[data-acct-del]').forEach(btn => {
    btn.onclick = () => {
      const accounts = loadAccounts().filter(a => a.id !== btn.dataset.acctDel);
      saveAccounts(accounts);
      toast('已删除');
      renderAccounts(container);
    };
  });
}

function renderList(container) {
  const data = loadData();
  const el = container.querySelector('#inspirationList');
  if (data.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.sparkles}</div><div class="empty-title">还没有灵感</div><div class="empty-desc">看到一个好的宠物视频想法？记下来</div></div>`;
    return;
  }
  el.innerHTML = data.map(it => `
    <div class="note-card">
      <div class="note-card-head">
        <div class="note-card-title">${escapeHtml(it.title)}</div>
        <div class="task-actions">
          <button class="task-action-btn" data-insp-edit="${it.id}">${Icons.edit}</button>
          <button class="task-action-btn" data-insp-del="${it.id}">${Icons.trash}</button>
        </div>
      </div>
      ${it.type ? `<div class="bug-card-meta"><span class="badge badge-green">${escapeHtml(it.type)}</span></div>` : ''}
      <div class="note-card-body">${escapeHtml(it.content)}</div>
      ${it.reference ? `<div class="bug-card-section">参考来源：<strong>${escapeHtml(it.reference)}</strong></div>` : ''}
      <div class="bug-card-section">${fmtDate(it.createdAt)}</div>
    </div>
  `).join('');

  el.querySelectorAll('[data-insp-edit]').forEach(btn => {
    btn.onclick = () => openAddModal(container, btn.dataset.inspEdit);
  });
  el.querySelectorAll('[data-insp-del]').forEach(btn => {
    btn.onclick = () => {
      const data = loadData().filter(d => d.id !== btn.dataset.inspDel);
      saveData(data);
      toast('已删除');
      renderList(container);
    };
  });
}

// —— 通过链接解析灵感 ——
function openParseLinkModal(container) {
  openModal({
    title: '通过链接解析灵感',
    body: `
      <div class="field">
        <label class="field-label">第一步：粘贴视频/文章链接</label>
        <input class="input" id="parseLinkInput" placeholder="如：https://www.douyin.com/video/xxx">
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <button class="btn btn-primary btn-sm" id="genPromptBtn">${Icons.copy} 生成解析Prompt</button>
        <span style="font-size:11px;color:var(--text-muted)">复制后发给AI，AI会返回JSON</span>
      </div>
      <div class="prompt-box" id="promptPreview" style="display:none;margin-bottom:12px;font-size:12px"></div>

      <div class="field">
        <label class="field-label">第二步：粘贴AI返回的JSON结果</label>
        <textarea class="textarea" id="parseResultInput" style="min-height:120px" placeholder='粘贴AI返回的JSON，如：{"title":"...","type":"...","content":"...","reference":"..."}'></textarea>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn btn-primary btn-sm" id="parseAndFillBtn">解析并填入</button>
      </div>
      <div id="parsePreviewArea" style="display:none"></div>`,
    foot: `<button class="btn" id="parseCancel">取消</button><button class="btn btn-primary" id="parseSave" disabled>保存到灵感库</button>`
  });

  let parsedData = null;

  document.getElementById('parseCancel').onclick = closeModal;

  // 生成 Prompt
  document.getElementById('genPromptBtn').onclick = () => {
    const link = document.getElementById('parseLinkInput').value.trim();
    if (!link) { toast('请先粘贴链接'); return; }
    const prompt = `请分析这个宠物视频/文章链接，提取以下信息并以JSON格式返回：
链接：${link}

请返回如下JSON格式（不要包含其他文字）：
{
  "title": "视频/文章标题",
  "type": "视频灵感",
  "content": "详细描述这个视频的内容、创意点、为什么火、可以学习的点",
  "reference": "来源链接或账号名"
}

注意：type只能从以下选项中选择：视频灵感、爆款总结、脚本创意、账号定位、其他`;

    document.getElementById('promptPreview').style.display = 'block';
    document.getElementById('promptPreview').textContent = prompt;
    copyText(prompt);
  };

  // 解析 JSON 并填入预览
  document.getElementById('parseAndFillBtn').onclick = () => {
    const text = document.getElementById('parseResultInput').value.trim();
    if (!text) { toast('请先粘贴AI返回的结果'); return; }
    try {
      let jsonStr = text;
      const m = text.match(/\{[\s\S]*\}/);
      if (m) jsonStr = m[0];
      const data = JSON.parse(jsonStr);

      // 兼容多种格式
      const item = Array.isArray(data) ? data[0] : data;
      if (!item.title) { toast('未找到标题字段，请检查JSON格式'); return; }

      parsedData = {
        title: item.title || '',
        type: item.type || '视频灵感',
        content: item.content || item.description || '',
        reference: item.reference || item.link || document.getElementById('parseLinkInput').value.trim(),
      };

      // 显示预览
      const previewEl = document.getElementById('parsePreviewArea');
      previewEl.style.display = 'block';
      previewEl.innerHTML = `
        <div class="card" style="background:var(--primary-bg);border:0.5px solid var(--primary-light)">
          <div style="font-size:13px;font-weight:600;color:var(--primary);margin-bottom:8px">解析结果预览</div>
          <div style="font-size:13px;margin-bottom:4px"><strong>标题：</strong>${escapeHtml(parsedData.title)}</div>
          <div style="font-size:13px;margin-bottom:4px"><strong>类型：</strong>${escapeHtml(parsedData.type)}</div>
          <div style="font-size:13px;margin-bottom:4px"><strong>内容：</strong>${escapeHtml(parsedData.content.slice(0, 100))}${parsedData.content.length > 100 ? '...' : ''}</div>
          <div style="font-size:13px"><strong>来源：</strong>${escapeHtml(parsedData.reference)}</div>
        </div>`;
      document.getElementById('parseSave').disabled = false;
      toast('解析成功，请确认后保存');
    } catch (err) {
      toast('解析失败，请检查JSON格式是否正确');
    }
  };

  // 保存
  document.getElementById('parseSave').onclick = () => {
    if (!parsedData) { toast('请先解析'); return; }
    const data = loadData();
    data.unshift({ id: Storage.uid(), ...parsedData, createdAt: Date.now() });
    saveData(data);
    closeModal();
    toast('已保存到灵感库');
    renderList(container);
  };
}

function openAddModal(container, editId) {
  const editing = editId ? loadData().find(d => d.id === editId) : null;
  openModal({
    title: editing ? '编辑灵感' : '添加灵感',
    body: `
      <div class="field">
        <label class="field-label">标题</label>
        <input class="input" id="inspTitle" value="${editing ? escapeHtml(editing.title) : ''}" placeholder="如：猫咪偷吃搞笑系列">
      </div>
      <div class="field">
        <label class="field-label">类型</label>
        <select class="select" id="inspType">
          ${['视频灵感', '爆款总结', '脚本创意', '账号定位', '其他'].map(t =>
            `<option value="${t}" ${editing && editing.type === t ? 'selected' : ''}>${t}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">内容描述</label>
        <textarea class="textarea" id="inspContent" placeholder="详细描述灵感内容...">${editing ? escapeHtml(editing.content) : ''}</textarea>
      </div>
      <div class="field">
        <label class="field-label">参考来源（选填）</label>
        <input class="input" id="inspRef" value="${editing ? escapeHtml(editing.reference || '') : ''}" placeholder="视频链接或账号名">
      </div>`,
    foot: `<button class="btn" id="inspCancel">取消</button><button class="btn btn-primary" id="inspSave">保存</button>`
  });
  document.getElementById('inspCancel').onclick = closeModal;
  document.getElementById('inspSave').onclick = () => {
    const title = document.getElementById('inspTitle').value.trim();
    if (!title) { toast('请输入标题'); return; }
    const item = {
      title,
      type: document.getElementById('inspType').value,
      content: document.getElementById('inspContent').value.trim(),
      reference: document.getElementById('inspRef').value.trim(),
    };
    if (editing) {
      const data = loadData();
      const idx = data.findIndex(d => d.id === editId);
      data[idx] = { ...editing, ...item };
      saveData(data);
    } else {
      const data = loadData();
      data.unshift({ id: Storage.uid(), ...item, createdAt: Date.now() });
      saveData(data);
    }
    closeModal();
    toast('已保存');
    renderList(container);
  };
}

function openAccountModal(container, editId) {
  const editing = editId ? loadAccounts().find(a => a.id === editId) : null;
  openModal({
    title: editing ? '编辑对标账号' : '添加对标账号',
    body: `
      <div class="field">
        <label class="field-label">账号名称</label>
        <input class="input" id="acctName" value="${editing ? escapeHtml(editing.name) : ''}" placeholder="如：大胖橘的日常">
      </div>
      <div class="field">
        <label class="field-label">平台</label>
        <select class="select" id="acctPlatform">
          ${['抖音', '小红书', 'B站', '快手', '视频号', '其他'].map(p =>
            `<option value="${p}" ${editing && editing.platform === p ? 'selected' : ''}>${p}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">粉丝量（选填）</label>
        <input class="input" id="acctFollowers" value="${editing ? escapeHtml(editing.followers || '') : ''}" placeholder="如 50万">
      </div>
      <div class="field">
        <label class="field-label">备注</label>
        <textarea class="textarea" id="acctNote" placeholder="内容风格、更新频率、值得学习的点...">${editing ? escapeHtml(editing.note || '') : ''}</textarea>
      </div>`,
    foot: `<button class="btn" id="acctCancel">取消</button><button class="btn btn-primary" id="acctSave">保存</button>`
  });
  document.getElementById('acctCancel').onclick = closeModal;
  document.getElementById('acctSave').onclick = () => {
    const name = document.getElementById('acctName').value.trim();
    if (!name) { toast('请输入账号名称'); return; }
    const item = {
      name,
      platform: document.getElementById('acctPlatform').value,
      followers: document.getElementById('acctFollowers').value.trim(),
      note: document.getElementById('acctNote').value.trim(),
    };
    if (editing) {
      const accounts = loadAccounts();
      const idx = accounts.findIndex(a => a.id === editId);
      accounts[idx] = { ...editing, ...item };
      saveAccounts(accounts);
    } else {
      const accounts = loadAccounts();
      accounts.push({ id: Storage.uid(), ...item });
      saveAccounts(accounts);
    }
    closeModal();
    toast('已保存');
    renderAccounts(container);
  };
}
