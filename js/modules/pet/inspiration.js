// inspiration.js — 宠物bot / 灵感库：自动搜集爆款宠物视频总结 + 手动记录灵感/对标账号 + 链接一键解析
import { registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';
import { fetchArticle } from '../wechat/benchmark-articles.js';
import { hasAiConfig, aiChatStream } from '../../ai-service.js';

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

        <div class="card card-pad mb-16">
          <div style="font-size:13px;font-weight:600;margin-bottom:10px">⚡ 快速添加：粘贴链接自动解析</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input class="input" id="petQuickLink" placeholder="粘贴视频/文章链接，回车或点确定自动解析…" style="flex:1;min-width:200px">
            <button class="btn btn-primary" id="petQuickBtn">${Icons.sparkles} 确定</button>
          </div>
          <div id="petQuickStatus" style="font-size:12px;color:var(--text-muted);margin-top:8px"></div>
        </div>

        <div class="flex gap-8 mb-16" style="flex-wrap:wrap">
          <button class="btn btn-primary" id="addInspirationBtn">${Icons.plus} 添加灵感</button>
          <button class="btn" id="addAccountBtn">${Icons.plus} 添加对标账号</button>
        </div>

        <div class="section-title">对标账号 <span class="cat-count">${accounts.length}</span></div>
        <div id="accountList" style="margin-bottom:20px"></div>

        <div class="section-title">灵感列表 <span class="cat-count" id="inspCount">${data.length}</span></div>
        <div id="inspirationList"></div>
      `;

      renderAccounts(container);
      renderList(container);

      container.querySelector('#addInspirationBtn').onclick = () => openAddModal(container);
      container.querySelector('#addAccountBtn').onclick = () => openAccountModal(container);
      container.querySelector('#petQuickBtn').onclick = () => quickParseLink(container);
      container.querySelector('#petQuickLink').addEventListener('keydown', e => {
        if (e.key === 'Enter') quickParseLink(container);
      });
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
    btn.onclick = async () => {
      if (await confirmDialog({ title: '删除对标账号', message: '确定删除这个对标账号吗？', confirmText: '删除', danger: true })) {
        saveAccounts(loadAccounts().filter(a => a.id !== btn.dataset.acctDel));
        toast('已删除');
        renderAccounts(container);
      }
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
    btn.onclick = async () => {
      if (await confirmDialog({ title: '删除灵感', message: '确定删除这条灵感吗？', confirmText: '删除', danger: true })) {
        saveData(loadData().filter(d => d.id !== btn.dataset.inspDel));
        toast('已删除');
        renderList(container);
        const countEl = container.querySelector('#inspCount');
        if (countEl) countEl.textContent = loadData().length;
      }
    };
  });
}

// —— 链接一键解析：粘贴链接 → 自动抓取 → AI 总结 → 直接入库 ——
function extractJsonObj(text) {
  if (!text) return null;
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch (e) { return null; }
}

async function quickParseLink(container) {
  const linkEl = container.querySelector('#petQuickLink');
  const btn = container.querySelector('#petQuickBtn');
  const statusEl = container.querySelector('#petQuickStatus');
  const url = (linkEl.value || '').trim();
  if (!url) { toast('请先粘贴链接'); return; }
  if (!/^https?:\/\//i.test(url)) { toast('链接格式不对，需要以 http(s):// 开头'); return; }
  if (loadData().some(d => d.reference === url)) { toast('这个链接已经收集过了'); return; }

  btn.disabled = true;
  const setStatus = (s) => { if (statusEl) statusEl.textContent = s; };

  try {
    // ① 抓取页面内容（多通道兜底）
    const fetched = await fetchArticle(url, setStatus);
    if (!fetched || !fetched.text) {
      setStatus('');
      btn.disabled = false;
      toast('自动抓取失败（抖音/小红书等App内页面通常抓不到），已打开表单请手动填写');
      openAddModal(container, null, { reference: url });
      return;
    }

    // ② AI 总结（没配 AI 就存原始内容）
    let parsed = null;
    if (hasAiConfig()) {
      setStatus('✅ 抓取成功，AI 正在总结…');
      try {
        const full = await aiChatStream([
          { role: 'system', content: '你是宠物短视频/内容运营分析师。只输出 JSON，不要任何其他文字。' },
          { role: 'user', content: `分析下面这个宠物相关内容，输出 JSON（都是字符串）：
{"title":"内容标题（简洁概括）","type":"从这些里选一个：视频灵感、爆款总结、脚本创意、账号定位、其他","content":"这个内容讲了什么、创意点在哪、为什么可能火、可以借鉴的点（150字内）"}

页面标题：${fetched.title || '（未知）'}
页面内容：
${fetched.text.slice(0, 5000)}` },
        ], { temperature: 0.4 });
        parsed = extractJsonObj(full);
      } catch (e) { /* 兜底 */ }
    }

    const item = {
      id: Storage.uid(),
      title: (parsed?.title || fetched.title || '未命名灵感').slice(0, 80),
      type: parsed?.type || '视频灵感',
      content: parsed?.content || fetched.text.slice(0, 300),
      reference: url,
      createdAt: Date.now(),
    };
    const data = loadData();
    data.unshift(item);
    saveData(data);
    setStatus('');
    linkEl.value = '';
    btn.disabled = false;
    toast(parsed ? '已解析并添加到灵感库 ✅' : '已抓取添加（未配置 AI，内容为原文摘录）');
    renderList(container);
    const countEl = container.querySelector('#inspCount');
    if (countEl) countEl.textContent = loadData().length;
  } catch (e) {
    setStatus('');
    btn.disabled = false;
    toast('解析失败：' + (e.message || '未知错误'));
  }
}

function openAddModal(container, editId, preset = {}) {
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
        <input class="input" id="inspRef" value="${editing ? escapeHtml(editing.reference || '') : escapeHtml(preset.reference || '')}" placeholder="视频链接或账号名">
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
    const countEl = container.querySelector('#inspCount');
    if (countEl) countEl.textContent = loadData().length;
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
