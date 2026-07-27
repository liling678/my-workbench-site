// better-me.js — Better Me：不开心反思 + 开心的点 + 心灵按摩
import { registerStandalone, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';

const REFLECT_KEY = 'better_me_records';
const HAPPY_KEY = 'better_me_happy';
const SOUL_KEY = 'soul_massage_quotes';

function loadData() { return Storage.get(REFLECT_KEY, []); }
function saveData(data) { Storage.set(REFLECT_KEY, data); }
function loadHappy() { return Storage.get(HAPPY_KEY, []); }
function saveHappy(data) { Storage.set(HAPPY_KEY, data); }
function loadSoul() { return Storage.get(SOUL_KEY, []); }
function saveSoul(data) { Storage.set(SOUL_KEY, data); }

const SUGGESTIONS = [
  '试着换个角度看这件事——它是否也带来了某种成长？',
  '把注意力放在你能控制的部分，放下你控制不了的。',
  '给自己一点时间消化情绪，不需要立刻解决所有问题。',
  '和朋友聊聊，有时候说出来本身就是一种疗愈。',
  '记录下此刻的感受，过段时间回头看，可能就没那么重了。',
  '今天对自己温柔一点，你已经做得很好了。',
  '把大问题拆成小步骤，先做一件最小的事。',
  '允许自己不开心，情绪没有对错，重要的是你怎么回应它。',
];

function getRandomSuggestion() {
  return SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
}

const TABS = [
  { id: 'reflect', name: '不开心反思' },
  { id: 'happy', name: '开心的点' },
  { id: 'soul', name: '心灵按摩' },
];

let activeTab = 'reflect';

export function initBetterMe() {
  registerStandalone('better-me', {
    title: 'Better Me',
    icon: Icons.betterMe,
    render(container) {
      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">Better Me</div>
          <div class="page-desc">记录不开心、收藏开心、积累治愈好句，成为更好的自己</div>
        </div>
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
      renderTab(container);
    }
  });
}

function renderTab(container) {
  const el = container.querySelector('#tabContent');
  if (activeTab === 'reflect') renderReflect(container, el);
  else if (activeTab === 'happy') renderHappy(container, el);
  else renderSoul(container, el);
}

// —— 不开心反思 ——
function renderReflect(container, el) {
  const data = loadData().sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = `
    <div class="card card-pad mb-16" style="text-align:center">
      <div style="font-size:32px;margin-bottom:8px">\uD83C\uDF1F</div>
      <div style="font-size:14px;font-weight:500;color:var(--text-title);margin-bottom:6px">每一次反思都是成长的契机</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">记录让你不开心的事，我会帮你分析并给出建议</div>
      <button class="btn btn-primary" id="newReflectionBtn">${Icons.plus} 写下不开心的事</button>
    </div>
    <div class="section-title">反思记录 <span class="cat-count">${data.length}</span></div>
    <div id="reflectionList"></div>
  `;
  renderReflectList(container);
  container.querySelector('#newReflectionBtn').onclick = () => openReflectionModal(container);
}

function renderReflectList(container) {
  const data = loadData().sort((a, b) => b.createdAt - a.createdAt);
  const el = container.querySelector('#reflectionList');
  if (data.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">\uD83C\uDF1F</div><div class="empty-title">还没有反思记录</div><div class="empty-desc">不开心的时候写下来，我们一起面对</div></div>`;
    return;
  }
  el.innerHTML = data.map(r => `
    <div class="note-card">
      <div class="note-card-head">
        <div class="note-card-title">${escapeHtml(r.title)}</div>
        <div class="task-actions">
          <button class="task-action-btn" data-ref-dialog="${r.id}" title="对话">${Icons.chat}</button>
          <button class="task-action-btn" data-ref-del="${r.id}">${Icons.trash}</button>
        </div>
      </div>
      <div class="note-card-body">${escapeHtml(r.content)}</div>
      ${r.suggestion ? `
        <div style="background:var(--primary-bg);border-radius:8px;padding:10px 12px;margin-top:8px;border-left:3px solid var(--primary)">
          <div style="font-size:11px;color:var(--primary);margin-bottom:3px">\uD83D\uDCA1 建议</div>
          <div style="font-size:13px;color:var(--text-body);line-height:1.6">${escapeHtml(r.suggestion)}</div>
        </div>
      ` : ''}
      ${r.dialog && r.dialog.length > 0 ? `
        <div style="margin-top:8px;padding-top:8px;border-top:0.5px solid var(--border-light)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">\uD83D\uDCAC 对话记录 (${r.dialog.length})</div>
          ${r.dialog.slice(-2).map(d => `
            <div style="margin-bottom:6px">
              <div style="font-size:11px;color:var(--primary);font-weight:500">${d.role === 'user' ? '\u4F60' : 'Better Me'}</div>
              <div style="font-size:12px;color:var(--text-body)">${escapeHtml(d.text)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="bug-card-section">${fmtDate(r.createdAt)}</div>
    </div>
  `).join('');

  el.querySelectorAll('[data-ref-dialog]').forEach(btn => {
    btn.onclick = () => openDialogModal(btn.dataset.refDialog, container);
  });
  el.querySelectorAll('[data-ref-del]').forEach(btn => {
    btn.onclick = () => {
      const data = loadData().filter(r => r.id !== btn.dataset.refDel);
      saveData(data);
      toast('已删除');
      renderReflectList(container);
    };
  });
}

function openReflectionModal(container) {
  openModal({
    title: '写下不开心的事',
    body: `
      <div class="field">
        <label class="field-label">标题</label>
        <input class="input" id="refTitle" placeholder="一句话概括" autofocus>
      </div>
      <div class="field">
        <label class="field-label">详细描述</label>
        <textarea class="textarea" id="refContent" style="min-height:120px" placeholder="发生了什么？你的感受是什么？为什么让你不开心？"></textarea>
      </div>`,
    foot: `<button class="btn" id="refCancel">取消</button><button class="btn btn-primary" id="refSave">记录并分析</button>`
  });
  document.getElementById('refCancel').onclick = closeModal;
  document.getElementById('refSave').onclick = () => {
    const title = document.getElementById('refTitle').value.trim();
    const content = document.getElementById('refContent').value.trim();
    if (!title) { toast('请输入标题'); return; }
    const data = loadData();
    data.push({
      id: Storage.uid(), title, content,
      suggestion: getRandomSuggestion(),
      dialog: [], createdAt: Date.now(),
    });
    saveData(data);
    closeModal();
    toast('已记录，看看下面的建议');
    renderReflectList(container);
  };
}

function openDialogModal(recordId, container) {
  const data = loadData();
  const record = data.find(r => r.id === recordId);
  if (!record) return;
  if (!record.dialog) record.dialog = [];

  openModal({
    title: `\uD83D\uDCAC ${record.title}`,
    size: 'lg',
    body: `
      <div style="margin-bottom:12px;padding:10px;background:var(--bg-input);border-radius:8px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">原始记录</div>
        <div style="font-size:13px;color:var(--text-body);line-height:1.6">${escapeHtml(record.content)}</div>
      </div>
      ${record.suggestion ? `
        <div style="background:var(--primary-bg);border-radius:8px;padding:10px 12px;margin-bottom:12px;border-left:3px solid var(--primary)">
          <div style="font-size:11px;color:var(--primary);margin-bottom:3px">\uD83D\uDCA1 建议</div>
          <div style="font-size:13px;color:var(--text-body);line-height:1.6">${escapeHtml(record.suggestion)}</div>
        </div>
      ` : ''}
      <div id="dialogArea" style="max-height:300px;overflow-y:auto;margin-bottom:12px">
        ${record.dialog.map(d => `
          <div style="margin-bottom:10px">
            <div style="font-size:11px;font-weight:500;color:${d.role === 'user' ? 'var(--primary)' : 'var(--text-muted)'}">${d.role === 'user' ? '\u4F60' : 'Better Me'}</div>
            <div style="font-size:13px;color:var(--text-body);line-height:1.6;padding:6px 10px;background:${d.role === 'user' ? 'var(--primary-bg)' : 'var(--bg-input)'};border-radius:8px;margin-top:2px">${escapeHtml(d.text)}</div>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:6px">
        <input class="input" id="dialogInput" placeholder="说点什么..." autofocus>
        <button class="btn btn-primary" id="dialogSend">发送</button>
      </div>`,
    foot: `<button class="btn" id="dialogClose">关闭</button>`
  });

  document.getElementById('dialogClose').onclick = closeModal;
  const dialogArea = document.getElementById('dialogArea');
  dialogArea.scrollTop = dialogArea.scrollHeight;

  document.getElementById('dialogSend').onclick = () => {
    const text = document.getElementById('dialogInput').value.trim();
    if (!text) return;
    record.dialog.push({ role: 'user', text });
    const reply = generateReply(text, record);
    record.dialog.push({ role: 'bot', text: reply });
    saveData(data);
    dialogArea.innerHTML += `
      <div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:500;color:var(--primary)">你</div>
        <div style="font-size:13px;color:var(--text-body);line-height:1.6;padding:6px 10px;background:var(--primary-bg);border-radius:8px;margin-top:2px">${escapeHtml(text)}</div>
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:500;color:var(--text-muted)">Better Me</div>
        <div style="font-size:13px;color:var(--text-body);line-height:1.6;padding:6px 10px;background:var(--bg-input);border-radius:8px;margin-top:2px">${escapeHtml(reply)}</div>
      </div>
    `;
    dialogArea.scrollTop = dialogArea.scrollHeight;
    document.getElementById('dialogInput').value = '';
  };
  document.getElementById('dialogInput').onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('dialogSend').click();
  };
}

function generateReply(userText, record) {
  const replies = [
    `我理解你的感受。关于"${userText.slice(0, 20)}..."，试着问问自己：这件事一年后还重要吗？`,
    `谢谢你愿意分享。很多时候，我们不开心的根源不是事件本身，而是我们对事件的解读。你能换个角度看这件事吗？`,
    `听到你了。这确实不容易。但记住，能够意识到并表达出来，本身就需要勇气。你已经在成长的路上了。`,
    `我明白。这种情况确实让人沮丧。你觉得有什么是你能改变的部分吗？先从那里开始。`,
    `嗯，这种感觉我理解。给自己一些时间和空间，不必急着解决。有时候，接受情绪的存在就是最好的开始。`,
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

// —— 开心的点 ——
function renderHappy(container, el) {
  const data = loadHappy().sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = `
    <div class="card card-pad mb-16" style="text-align:center">
      <div style="font-size:32px;margin-bottom:8px">\uD83D\uDE0A</div>
      <div style="font-size:14px;font-weight:500;color:var(--text-title);margin-bottom:6px">记录每一件让你开心的小事</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">开心的瞬间值得被记住，难过的时候翻来看看</div>
      <button class="btn btn-primary" id="newHappyBtn">${Icons.plus} 记录开心的事</button>
    </div>
    <div class="section-title">开心记录 <span class="cat-count">${data.length}</span></div>
    <div id="happyList"></div>
  `;
  renderHappyList(container);
  container.querySelector('#newHappyBtn').onclick = () => openHappyModal(container);
}

function renderHappyList(container) {
  const data = loadHappy().sort((a, b) => b.createdAt - a.createdAt);
  const el = container.querySelector('#happyList');
  if (data.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">\uD83D\uDE0A</div><div class="empty-title">还没有开心记录</div><div class="empty-desc">今天有什么开心的事吗？写下来吧</div></div>`;
    return;
  }
  el.innerHTML = data.map(r => `
    <div class="note-card">
      <div class="note-card-head">
        <div class="note-card-title">${escapeHtml(r.title)}</div>
        <div class="task-actions">
          <button class="task-action-btn" data-happy-del="${r.id}">${Icons.trash}</button>
        </div>
      </div>
      ${r.content ? `<div class="note-card-body">${escapeHtml(r.content)}</div>` : ''}
      <div class="bug-card-section">${fmtDate(r.createdAt)}</div>
    </div>
  `).join('');
  el.querySelectorAll('[data-happy-del]').forEach(btn => {
    btn.onclick = () => {
      saveHappy(loadHappy().filter(r => r.id !== btn.dataset.happyDel));
      toast('已删除');
      renderHappyList(container);
    };
  });
}

function openHappyModal(container) {
  openModal({
    title: '记录开心的事',
    body: `
      <div class="field">
        <label class="field-label">标题 <span class="req">*</span></label>
        <input class="input" id="happyTitle" placeholder="一句话概括" autofocus>
      </div>
      <div class="field">
        <label class="field-label">详细描述</label>
        <textarea class="textarea" id="happyContent" style="min-height:120px" placeholder="发生了什么？为什么开心？记录下这份美好"></textarea>
      </div>`,
    foot: `<button class="btn" id="happyCancel">取消</button><button class="btn btn-primary" id="happySave">记录</button>`
  });
  document.getElementById('happyCancel').onclick = closeModal;
  document.getElementById('happySave').onclick = () => {
    const title = document.getElementById('happyTitle').value.trim();
    if (!title) { toast('请输入标题'); return; }
    const content = document.getElementById('happyContent').value.trim();
    saveHappy([...loadHappy(), { id: Storage.uid(), title, content, createdAt: Date.now() }]);
    closeModal();
    toast('已记录 \uD83D\uDE0A');
    renderHappyList(container);
  };
}

// —— 心灵按摩 ——
function renderSoul(container, el) {
  const data = loadSoul().sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = `
    <div class="card card-pad mb-16" style="text-align:center">
      <div style="font-size:32px;margin-bottom:8px">\uD83D\uDC95</div>
      <div style="font-size:14px;font-weight:500;color:var(--text-title);margin-bottom:6px">收藏你喜欢的句子</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">写下让你心动的句子，首页每日好句会从这里随机选取</div>
      <button class="btn btn-primary" id="newSoulBtn">${Icons.plus} 添加句子</button>
    </div>
    <div class="section-title">心灵按摩 <span class="cat-count">${data.length}</span></div>
    <div id="soulList"></div>
  `;
  renderSoulList(container);
  container.querySelector('#newSoulBtn').onclick = () => openSoulModal(container);
}

function renderSoulList(container) {
  const data = loadSoul().sort((a, b) => b.createdAt - a.createdAt);
  const el = container.querySelector('#soulList');
  if (data.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">\uD83D\uDC95</div><div class="empty-title">还没有收藏句子</div><div class="empty-desc">添加你喜欢的句子，首页每日好句会从这里随机取</div></div>`;
    return;
  }
  el.innerHTML = data.map(r => `
    <div class="note-card">
      <div class="note-card-head">
        <div class="note-card-title" style="font-style:italic">"${escapeHtml(r.text)}"</div>
        <div class="task-actions">
          <button class="task-action-btn" data-soul-del="${r.id}">${Icons.trash}</button>
        </div>
      </div>
      ${r.source ? `<div class="bug-card-section">\u2014 ${escapeHtml(r.source)}</div>` : ''}
      <div class="bug-card-section">${fmtDate(r.createdAt)}</div>
    </div>
  `).join('');
  el.querySelectorAll('[data-soul-del]').forEach(btn => {
    btn.onclick = () => {
      saveSoul(loadSoul().filter(r => r.id !== btn.dataset.soulDel));
      toast('已删除');
      renderSoulList(container);
    };
  });
}

function openSoulModal(container) {
  openModal({
    title: '添加句子',
    body: `
      <div class="field">
        <label class="field-label">句子内容 <span class="req">*</span></label>
        <textarea class="textarea" id="soulText" style="min-height:80px" placeholder="写下你喜欢的句子…" autofocus></textarea>
      </div>
      <div class="field">
        <label class="field-label">出处（可选）</label>
        <input class="input" id="soulSource" placeholder="如：某本书、某部电影、某个人说的">
      </div>`,
    foot: `<button class="btn" id="soulCancel">取消</button><button class="btn btn-primary" id="soulSave">添加</button>`
  });
  document.getElementById('soulCancel').onclick = closeModal;
  document.getElementById('soulSave').onclick = () => {
    const text = document.getElementById('soulText').value.trim();
    if (!text) { toast('请输入句子内容'); return; }
    const source = document.getElementById('soulSource').value.trim();
    saveSoul([...loadSoul(), { id: Storage.uid(), text, source, createdAt: Date.now() }]);
    closeModal();
    toast('已添加 \uD83D\uDC95');
    renderSoulList(container);
  };
}
