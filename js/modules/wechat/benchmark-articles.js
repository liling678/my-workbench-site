// benchmark-articles.js — 对标文章（独立菜单）
// 核心能力：粘贴文章链接 → 自动抓取文章内容 → AI 解析并自动填充标题/公众号/摘要/标签
// 抓取策略：多通道兜底（r.jina.ai 文本代理 → allorigins → codetabs → 直连），全部失败则引导粘贴全文
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, escapeHtml } from '../../ui.js';
import { Icons } from '../../registry.js';
import { hasAiConfig, aiChatStream, openAiConfigModal } from '../../ai-service.js';

const INSPO_KEY = 'wechat_inspiration_articles';

function loadInspo() { return Storage.get(INSPO_KEY, []); }
function saveInspo(data) { Storage.set(INSPO_KEY, data); }

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== 链接抓取（多通道兜底） =====
async function tryFetchText(url, timeout = 15000) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return await resp.text();
}

// 从 HTML 中抽取标题/公众号/正文
function extractFromHtml(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // 微信文章特征
    const title = doc.querySelector('#activity-name, .rich_media_title')?.textContent?.trim()
      || doc.querySelector('meta[property="og:title"]')?.content?.trim()
      || doc.querySelector('title')?.textContent?.trim() || '';
    const account = doc.querySelector('#js_name, .profile_nickname')?.textContent?.trim()
      || doc.querySelector('meta[name="author"]')?.content?.trim() || '';
    const bodyEl = doc.querySelector('#js_content, .rich_media_content, article') || doc.body;
    // 去掉脚本样式
    bodyEl?.querySelectorAll('script,style,noscript').forEach(n => n.remove());
    const text = (bodyEl?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return { title, account, text };
  } catch (e) {
    return { title: '', account: '', text: '' };
  }
}

// 从 jina 返回的 markdown 中抽取
function extractFromJina(md) {
  let title = '';
  const m = md.match(/^Title:\s*(.+)$/m);
  if (m) title = m[1].trim();
  // 去掉头部元信息（Title/URL Source/Markdown Content 行）
  const idx = md.indexOf('Markdown Content:');
  const body = idx >= 0 ? md.slice(idx + 17) : md;
  return { title, account: '', text: body.trim() };
}

// 依次尝试多个通道抓取文章（导出给其他模块复用，如宠物灵感库）
export async function fetchArticle(url, onStatus) {
  const channels = [
    {
      name: '文本代理(jina)',
      run: async () => {
        const md = await tryFetchText('https://r.jina.ai/' + url);
        if (!md || md.length < 200) throw new Error('内容太短');
        return extractFromJina(md);
      },
    },
    {
      name: '代理(allorigins)',
      run: async () => {
        const html = await tryFetchText('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
        if (!html || html.length < 500) throw new Error('内容太短');
        return extractFromHtml(html);
      },
    },
    {
      name: '代理(codetabs)',
      run: async () => {
        const html = await tryFetchText('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url));
        if (!html || html.length < 500) throw new Error('内容太短');
        return extractFromHtml(html);
      },
    },
    {
      name: '直连',
      run: async () => {
        const html = await tryFetchText(url, 8000);
        if (!html || html.length < 500) throw new Error('内容太短');
        return extractFromHtml(html);
      },
    },
  ];
  for (const ch of channels) {
    try {
      onStatus && onStatus(`正在通过「${ch.name}」抓取…`);
      const r = await ch.run();
      if (r.text && r.text.length > 100) return r;
    } catch (e) { /* 下一个通道 */ }
  }
  return null;
}

// ===== AI 解析 =====
function extractJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch (e) { return null; }
}

async function aiAnalyzeArticle(rawTitle, rawAccount, text) {
  const full = await aiChatStream([
    { role: 'system', content: '你是资深公众号运营分析师，擅长拆解爆款文章。只输出 JSON，不输出任何其他文字。' },
    {
      role: 'user', content: `请分析下面这篇公众号文章，输出 JSON（所有字段都是字符串）：
{"title":"文章标题（如果我提供的标题可信就用它，否则从正文推断）","account":"公众号名称（推断不出就留空）","tags":"3-5个标签，顿号分隔（如：女性成长、读书、亲情）","summary":"这篇文章的分析总结：主题是什么、结构怎么展开、为什么可能火、有什么值得学习的写法（150字以内）"}

已知标题：${rawTitle || '（未知）'}
已知公众号：${rawAccount || '（未知）'}

文章内容：
${text.slice(0, 6000)}`,
    },
  ], { temperature: 0.4 });
  return extractJson(full);
}

// ===== 页面渲染 =====
export function renderBenchmark(container) {
  const inspos = loadInspo().sort((a, b) => b.createdAt - a.createdAt);

  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">对标文章</div>
      <div class="page-desc">收集值得学习的爆款文章 · 粘贴链接自动解析标题和内容</div>
    </div>

    <div class="card card-pad mb-16">
      <div class="hot-section-title" style="margin-bottom:10px">⚡ 快速添加：粘贴链接自动解析</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input class="input" id="bmQuickLink" placeholder="粘贴公众号文章链接，如 https://mp.weixin.qq.com/s/…" style="flex:1;min-width:220px">
        <button class="btn btn-primary" id="bmQuickBtn">${Icons.sparkles} 自动解析</button>
      </div>
      <div id="bmQuickStatus" style="font-size:12px;color:var(--text-muted);margin-top:8px"></div>
    </div>

    <div class="section-title">
      <span>已收集</span>
      <span class="cat-count">${inspos.length}</span>
      <button class="btn btn-ghost btn-sm" id="bmManualBtn" style="margin-left:auto">${Icons.plus} 手动添加</button>
    </div>
    <div class="list" id="bmList"></div>
  `;

  renderList(container);

  container.querySelector('#bmManualBtn').onclick = () => openForm(container, null);

  // 快速添加：链接自动解析
  container.querySelector('#bmQuickBtn').onclick = () => quickAddByLink(container);
  container.querySelector('#bmQuickLink').addEventListener('keydown', e => {
    if (e.key === 'Enter') quickAddByLink(container);
  });
}

async function quickAddByLink(container) {
  const linkEl = container.querySelector('#bmQuickLink');
  const statusEl = container.querySelector('#bmQuickStatus');
  const btn = container.querySelector('#bmQuickBtn');
  const url = (linkEl.value || '').trim();
  if (!url) { toast('请先粘贴文章链接'); return; }
  if (!/^https?:\/\//i.test(url)) { toast('链接格式不对，需要以 http(s):// 开头'); return; }
  if (loadInspo().some(a => a.link === url)) { toast('这个链接已经收集过了'); return; }

  btn.disabled = true;
  const setStatus = (s) => { if (statusEl) statusEl.textContent = s; };

  try {
    // ① 抓取文章内容
    const fetched = await fetchArticle(url, setStatus);
    if (!fetched) {
      setStatus('');
      btn.disabled = false;
      // 抓取失败 → 打开表单让用户粘贴全文（链接已带入）
      openForm(container, null, { link: url, needPaste: true });
      return;
    }

    // ② AI 解析（没配 AI 就直接用抓到的标题）
    let parsed = null;
    if (hasAiConfig()) {
      setStatus('✅ 抓取成功，AI 正在解析…');
      try { parsed = await aiAnalyzeArticle(fetched.title, fetched.account, fetched.text); } catch (e) { /* 用兜底 */ }
    }

    const item = {
      id: Storage.uid(),
      link: url,
      title: (parsed?.title || fetched.title || '未命名文章').slice(0, 100),
      account: parsed?.account || fetched.account || '',
      tags: parsed?.tags || '',
      summary: parsed?.summary || '',
      fullText: fetched.text.slice(0, 20000),
      reads: '', likes: '',
      source: '链接解析',
      createdAt: Date.now(),
    };
    const list = loadInspo();
    list.unshift(item);
    saveInspo(list);
    setStatus('');
    linkEl.value = '';
    btn.disabled = false;
    toast(parsed ? '已解析并添加 ✅' : '已抓取添加（未配置 AI，摘要留空）');
    renderBenchmark(container);
  } catch (e) {
    setStatus('');
    btn.disabled = false;
    toast('解析失败：' + (e.message || '未知错误'));
  }
}

function renderList(container) {
  const el = container.querySelector('#bmList');
  if (!el) return;
  const inspos = loadInspo().sort((a, b) => b.createdAt - a.createdAt);
  const countEl = container.querySelector('.cat-count');
  if (countEl) countEl.textContent = inspos.length;

  if (inspos.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">${Icons.target}</div><div class="empty-title">还没有对标文章</div><div class="empty-desc">粘贴文章链接自动解析，或在「热点·爆款」中保存热点选题</div></div>`;
    return;
  }
  el.innerHTML = inspos.map(a => `
    <div class="list-item" data-id="${a.id}">
      <div class="list-item-head">
        <div style="flex:1;min-width:0">
          <div class="list-item-title">${escapeHtml(a.title || '未填写标题')}</div>
          ${a.summary ? `<div class="list-item-body" style="margin-top:4px">${escapeHtml(a.summary)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          ${a.fullText ? `<button class="icon-btn btn-sm bm-view" title="查看全文">${Icons.book}</button>` : ''}
          ${a.link ? `<a href="${escapeAttr(a.link)}" target="_blank" class="icon-btn btn-sm" title="打开原文链接">${Icons.link}</a>` : ''}
          <button class="icon-btn btn-sm bm-edit" title="编辑">${Icons.edit}</button>
          <button class="icon-btn btn-sm bm-del" title="删除">${Icons.trash}</button>
        </div>
      </div>
      <div class="list-item-meta">
        ${a.account ? `<span>📢 ${escapeHtml(a.account)}</span>` : ''}
        ${a.reads ? `<span>👁 ${escapeHtml(a.reads)}</span>` : ''}
        ${a.likes ? `<span>👍 ${escapeHtml(a.likes)}</span>` : ''}
        ${a.tags ? `<span class="badge badge-gray">${escapeHtml(a.tags)}</span>` : ''}
        ${a.source ? `<span class="badge badge-green">${escapeHtml(a.source)}</span>` : ''}
        <span>${fmtDate(a.createdAt)}</span>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    const data = inspos.find(a => a.id === id);
    item.querySelector('.bm-edit').onclick = () => openForm(container, id);
    const viewBtn = item.querySelector('.bm-view');
    if (viewBtn) viewBtn.onclick = () => openViewModal(data);
    item.querySelector('.bm-del').onclick = async () => {
      if (await confirmDialog({ title: '删除', message: '确定删除这篇对标文章吗？', confirmText: '删除', danger: true })) {
        saveInspo(loadInspo().filter(a => a.id !== id));
        toast('已删除');
        renderList(container);
      }
    };
  });
}

// 查看全文弹窗
function openViewModal(a) {
  if (!a) return;
  openModal({
    title: a.title || '对标文章',
    size: 'lg',
    body: `
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">
        ${a.account ? '📢 ' + escapeHtml(a.account) + ' · ' : ''}${fmtDate(a.createdAt)}${a.link ? ` · <a href="${escapeAttr(a.link)}" target="_blank" style="color:var(--primary)">打开原文</a>` : ''}
      </div>
      ${a.summary ? `<div style="background:var(--primary-bg,#eef7f3);padding:12px;border-radius:8px;font-size:13px;line-height:1.7;margin-bottom:12px"><b>📋 分析总结：</b>${escapeHtml(a.summary)}</div>` : ''}
      <div style="background:var(--bg-input);padding:14px;border-radius:8px;font-size:14px;line-height:1.8;max-height:480px;overflow-y:auto;white-space:pre-wrap">${escapeHtml(a.fullText || '(没有保存全文)')}</div>
    `,
    foot: `<button class="btn" id="bm_view_close">关闭</button><button class="btn btn-primary" id="bm_view_copy">${Icons.copy} 复制全文</button>`,
  });
  document.getElementById('bm_view_close').onclick = closeModal;
  document.getElementById('bm_view_copy').onclick = () => {
    navigator.clipboard.writeText(a.fullText || '').then(() => toast('已复制全文'));
  };
}

// 添加/编辑表单（needPaste=true 时展开粘贴全文区并提示）
function openForm(container, id, preset = {}) {
  const list = loadInspo();
  const item = id ? list.find(a => a.id === id) : { link: preset.link || '' };
  const isEdit = !!id;

  openModal({
    title: isEdit ? '编辑对标文章' : '添加对标文章',
    size: 'lg',
    body: `
      ${preset.needPaste ? `<div style="background:#fff7e6;border:1px solid #ffd591;color:#ad6800;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:12px">⚠️ 自动抓取失败（微信文章有时会拦截代理）。请打开原文，全选复制正文粘贴到下面的「文章全文」框，再点「🤖 AI 解析填充」，标题等信息会自动填好。</div>` : ''}
      <div class="field">
        <label class="field-label">文章链接</label>
        <input class="input" id="bm_link" value="${escapeAttr(item.link)}" placeholder="公众号文章链接（可选）">
      </div>
      <div class="field">
        <label class="field-label">文章全文 ${preset.needPaste ? '<span class="req">*</span>' : '（粘贴后可 AI 解析填充下方信息）'}</label>
        <textarea class="textarea" id="bm_fulltext" style="min-height:${preset.needPaste ? 160 : 90}px" placeholder="把文章正文粘贴到这里…">${escapeHtml(item.fullText || '')}</textarea>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm btn-primary" id="bm_ai_parse">🤖 AI 解析填充</button>
          <span id="bm_parse_status" style="font-size:12px;color:var(--text-muted)"></span>
        </div>
      </div>
      <div class="field">
        <label class="field-label">文章标题 <span class="req">*</span></label>
        <input class="input" id="bm_title" value="${escapeAttr(item.title)}" placeholder="文章标题">
      </div>
      <div class="field">
        <label class="field-label">公众号名称</label>
        <input class="input" id="bm_account" value="${escapeAttr(item.account)}" placeholder="如：树予我说">
      </div>
      <div style="display:flex;gap:12px">
        <div class="field" style="flex:1">
          <label class="field-label">阅读量</label>
          <input class="input" id="bm_reads" value="${escapeAttr(item.reads)}" placeholder="如 10万+">
        </div>
        <div class="field" style="flex:1">
          <label class="field-label">点赞量</label>
          <input class="input" id="bm_likes" value="${escapeAttr(item.likes)}" placeholder="如 500">
        </div>
      </div>
      <div class="field">
        <label class="field-label">标签/分类</label>
        <input class="input" id="bm_tags" value="${escapeAttr(item.tags)}" placeholder="如：女性成长、爆款标题">
      </div>
      <div class="field">
        <label class="field-label">分析总结</label>
        <textarea class="textarea" id="bm_summary" style="min-height:90px" placeholder="这篇文章为什么火？有什么值得学习的？">${escapeHtml(item.summary)}</textarea>
      </div>`,
    foot: `<button class="btn" id="bm_cancel">取消</button><button class="btn btn-primary" id="bm_save">${isEdit ? '保存' : '添加'}</button>`,
  });

  document.getElementById('bm_cancel').onclick = closeModal;

  // AI 解析填充（基于粘贴的全文）
  document.getElementById('bm_ai_parse').onclick = async () => {
    const text = document.getElementById('bm_fulltext').value.trim();
    if (!text || text.length < 50) { toast('请先粘贴文章全文（至少50字）'); return; }
    if (!hasAiConfig()) { openAiConfigModal(); return; }
    const st = document.getElementById('bm_parse_status');
    const pb = document.getElementById('bm_ai_parse');
    pb.disabled = true;
    st.textContent = 'AI 正在解析…';
    try {
      const parsed = await aiAnalyzeArticle(document.getElementById('bm_title').value.trim(), document.getElementById('bm_account').value.trim(), text);
      if (parsed) {
        if (parsed.title && !document.getElementById('bm_title').value.trim()) document.getElementById('bm_title').value = parsed.title;
        else if (parsed.title) document.getElementById('bm_title').value = parsed.title;
        if (parsed.account) document.getElementById('bm_account').value = parsed.account;
        if (parsed.tags) document.getElementById('bm_tags').value = parsed.tags;
        if (parsed.summary) document.getElementById('bm_summary').value = parsed.summary;
        st.textContent = '✅ 已自动填充，确认后点「添加/保存」';
      } else {
        st.textContent = '⚠️ AI 输出解析失败，请手动填写';
      }
    } catch (e) {
      st.textContent = '⚠️ 解析出错：' + (e.message || '未知错误');
    }
    pb.disabled = false;
  };

  document.getElementById('bm_save').onclick = () => {
    const title = document.getElementById('bm_title').value.trim();
    if (!title) { toast('请填写文章标题'); return; }
    const data = {
      link: document.getElementById('bm_link').value.trim(),
      title,
      account: document.getElementById('bm_account').value.trim(),
      reads: document.getElementById('bm_reads').value.trim(),
      likes: document.getElementById('bm_likes').value.trim(),
      tags: document.getElementById('bm_tags').value.trim(),
      summary: document.getElementById('bm_summary').value.trim(),
      fullText: document.getElementById('bm_fulltext').value.trim().slice(0, 20000),
    };
    if (isEdit) {
      const i = list.findIndex(a => a.id === id);
      list[i] = { ...list[i], ...data };
    } else {
      list.unshift({ id: Storage.uid(), ...data, source: '手动添加', createdAt: Date.now() });
    }
    saveInspo(list);
    closeModal();
    toast(isEdit ? '已保存' : '已添加');
    renderList(container);
  };
}
