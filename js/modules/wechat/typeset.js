// typeset.js — 公众号排版：给文章+配图自动排版，生成可复制到公众号/秀米的内联样式 HTML
import { registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, escapeHtml } from '../../ui.js';

const LAST_KEY = 'wechat_typeset_last';
const PRESET_KEY = 'wechat_typeset_presets';
const LIB_KEY = 'wechat_image_library';
const DRAFT_KEY = 'wechat_drafts';

// 排版主题（背景 / 正文 / 次要 / 主色 / 引用底 / 分割线）
const THEMES = {
  green: { name: '文艺绿', bg: '#ffffff', text: '#3f3f3f', sub: '#9a9a9a', accent: '#0F6E56', quoteBg: '#f2f8f5', line: '#e6e6e6' },
  cream: { name: '米白', bg: '#fdfbf7', text: '#4a4a44', sub: '#a59c8b', accent: '#b0894f', quoteBg: '#f6f1e7', line: '#ebe4d6' },
  navy: { name: '深夜蓝', bg: '#1f2530', text: '#d8dde6', sub: '#8b94a3', accent: '#5b8def', quoteBg: '#2a323f', line: '#333b48' },
  pink: { name: '治愈粉', bg: '#fff7f8', text: '#5a4a4d', sub: '#bd9ea2', accent: '#e0798f', quoteBg: '#fdeef1', line: '#f3dde1' },
};

let state = null;
let containerRef = null;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function defaultState() {
  return {
    sourceId: '', title: '', author: '树予予', date: todayStr(),
    body: '', images: [], signature: '本文来自公众号「树予我说」\n如果喜欢，欢迎点赞、在看、分享给更多人', theme: 'green'
  };
}
function esc(s) { return escapeHtml(s == null ? '' : s); }
function escAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== 正文解析：把带标记的文本拆成块 =====
function parseBlocks(text) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let i = 0;
  const imgRe = /^\s*(?:【?图】?|\[\[?图\]?\])\s*(.*)$/;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) { blocks.push({ type: 'divider' }); i++; continue; }
    if (/^\s*#\s+(.*)$/.test(line)) { blocks.push({ type: 'h', text: line.replace(/^\s*#\s+/, '') }); i++; continue; }
    if (/^\s*>\s?/.test(line)) {
      let q = '';
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q += (q ? '\n' : '') + lines[i].replace(/^\s*>\s?/, ''); i++; }
      blocks.push({ type: 'quote', text: q }); continue;
    }
    if (imgRe.test(line)) { blocks.push({ type: 'img', caption: (line.match(imgRe)[1] || '').trim() }); i++; continue; }
    // 普通段落：遇到空行/特殊行即止
    let p = '';
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*(?:---|\*\*\*|___)\s*$/.test(lines[i]) &&
      !/^\s*#\s+/.test(lines[i]) && !/^\s*>\s?/.test(lines[i]) && !imgRe.test(lines[i])) {
      p += (p ? '\n' : '') + lines[i]; i++;
    }
    blocks.push({ type: 'p', text: p });
  }
  return blocks;
}

// 解析后按序把配图塞进【图】标记；剩余配图追加到末尾
function resolveBlocks(blocks, images) {
  let ptr = 0;
  const out = [];
  for (const b of blocks) {
    if (b.type === 'img') {
      const img = images[ptr++];
      if (img) out.push({ type: 'img', src: img.src, caption: b.caption || img.caption || '' });
      else out.push({ type: 'img_missing' });
    } else out.push(b);
  }
  while (ptr < images.length) {
    const img = images[ptr++];
    out.push({ type: 'img', src: img.src, caption: img.caption || '' });
  }
  return out;
}

// ===== 生成内联样式 HTML（预览与导出共用） =====
function buildBlocksHTML(blocks, theme, withWrapper) {
  const t = THEMES[theme];
  let html = '';
  for (const b of blocks) {
    if (b.type === 'divider') html += `<div style="text-align:center;color:${t.sub};margin:24px 0;letter-spacing:8px;font-size:13px">· · ·</div>`;
    else if (b.type === 'h') html += `<p style="font-size:17px;font-weight:700;color:${t.accent};margin:24px 0 12px;padding-left:10px;border-left:4px solid ${t.accent};line-height:1.5">${esc(b.text)}</p>`;
    else if (b.type === 'quote') html += `<div style="background:${t.quoteBg};border-left:4px solid ${t.accent};padding:12px 14px;border-radius:6px;margin:0 0 1.2em;font-size:15px;line-height:1.8;color:${t.text};white-space:pre-wrap">${esc(b.text)}</div>`;
    else if (b.type === 'img') html += `<figure style="margin:0 0 1.4em"><img src="${escAttr(b.src)}" style="width:100%;display:block;border-radius:6px"><figcaption style="font-size:12px;color:${t.sub};text-align:center;margin-top:6px;line-height:1.5">${esc(b.caption || '')}</figcaption></figure>`;
    else if (b.type === 'img_missing') html += `<div style="margin:0 0 1.4em;padding:20px;background:${t.quoteBg};border:1px dashed ${t.sub};border-radius:6px;text-align:center;font-size:13px;color:${t.sub}">〔此处需配图：配图数量不足〕</div>`;
    else html += `<p style="font-size:16px;line-height:1.8;color:${t.text};margin:0 0 1.2em;letter-spacing:.3px;text-align:justify">${esc(b.text).replace(/\n/g, '<br>')}</p>`;
  }
  if (state.signature && state.signature.trim()) {
    html += `<div style="margin-top:30px;padding-top:16px;border-top:1px solid ${t.line};font-size:13px;color:${t.sub};text-align:center;line-height:1.8;white-space:pre-wrap">${esc(state.signature)}</div>`;
  }
  if (withWrapper) {
    html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;max-width:680px;margin:0 auto;background:${t.bg};padding:20px;color:${t.text}">${html}</div>`;
  }
  return html;
}

function headHTML(t) {
  let h = `<p style="font-size:20px;font-weight:700;color:${t.text};line-height:1.4;margin:0 0 10px;text-align:center;letter-spacing:1px">${esc(state.title || '（未填标题）')}</p>`;
  if (state.author || state.date) h += `<p style="font-size:13px;color:${t.sub};text-align:center;margin:0 0 22px">${[state.author, state.date].filter(Boolean).join(' · ')}</p>`;
  return h;
}

function exportHTML() {
  const blocks = resolveBlocks(parseBlocks(state.body), state.images);
  const t = THEMES[state.theme];
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;max-width:680px;margin:0 auto;background:${t.bg};padding:20px;color:${t.text}">${headHTML(t)}${buildBlocksHTML(blocks, state.theme, false)}</div>`;
}

function saveLast() { Storage.set(LAST_KEY, state); }
function loadLast() { state = Storage.get(LAST_KEY, null) || defaultState(); }

// ===================== 主渲染 =====================
export function renderTypeset(container) {
  containerRef = container;
  if (!state) loadLast();
  const drafts = Storage.get(DRAFT_KEY, []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">公众号排版</div>
      <div class="page-desc">贴文章+配图，自动排成手机阅读样式，一键复制可贴进公众号/秀米</div>
    </div>

    <div class="typeset-wrap">
      <div class="typeset-editor">
        <div class="card card-pad mb-12">
          <div class="field" style="margin-bottom:8px"><label class="field-label">文章来源</label>
            <div style="display:flex;gap:8px">
              <select class="select" id="ts_source" style="flex:1">
                <option value="">— 空白新建（自己粘贴）—</option>
                ${drafts.map(d => `<option value="${d.id}">${esc(d.title || '未命名')} · ${esc((d.content || '').length)}字</option>`).join('')}
              </select>
              <button class="btn" id="ts_loadsrc">载入</button>
            </div>
          </div>
          <div class="form-hint">可从「文章库」选择已写好的文章（含其配图），或空白新建后粘贴正文。</div>
        </div>

        <div class="card card-pad mb-12">
          <div class="form-row">
            <div class="field"><label class="field-label">标题</label><input class="input" id="ts_title" value="${escAttr(state.title)}" placeholder="文章标题"></div>
          </div>
          <div class="form-row">
            <div class="field"><label class="field-label">作者</label><input class="input" id="ts_author" value="${escAttr(state.author)}"></div>
            <div class="field"><label class="field-label">日期</label><input type="date" class="input" id="ts_date" value="${escAttr(state.date)}"></div>
          </div>
          <div class="field"><label class="field-label">正文</label>
            <textarea class="textarea" id="ts_body" style="min-height:260px" placeholder="空行分段；# 小标题；&gt; 引用；--- 分隔；【图】在此插入配图（图注可写在同一行）">${esc(state.body)}</textarea>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button class="btn btn-sm" id="ts_autoimg">智能穿插配图</button>
            <button class="btn btn-sm" id="ts_clrmark">清除配图标记</button>
          </div>
          <div class="form-hint">标记说明：<code># 小标题</code> 二级标题；<code>&gt; 引用内容</code> 引用块；<code>---</code> 分隔线；<code>【图】图注文字</code> 在此处放一张配图。</div>
        </div>

        <div class="card card-pad mb-12">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div class="section-title" style="margin:0">配图（<span id="ts_imgcount">${state.images.length}</span>）</div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" id="ts_fromlib">${Icons.camera} 从图片库选</button>
              <button class="btn btn-sm" id="ts_upload">上传</button>
              <button class="btn btn-sm" id="ts_url">网址</button>
            </div>
          </div>
          <div id="ts_imglist" class="ts-imglist"></div>
          <input type="file" id="ts_file" accept="image/*" hidden>
        </div>

        <div class="card card-pad">
          <div class="field"><label class="field-label">结尾签名 / 引导关注</label>
            <textarea class="textarea" id="ts_sign" style="min-height:60px">${esc(state.signature)}</textarea>
          </div>
          <div class="field"><label class="field-label">排版主题</label>
            <div id="ts_themes" class="ts-themes"></div>
          </div>
        </div>
      </div>

      <div class="typeset-preview">
        <div class="ts-phone">
          <div id="ts_preview" class="ts-phone-screen"></div>
        </div>
        <div class="ts-export">
          <button class="btn btn-primary" id="ts_copy" style="width:100%">${Icons.copy} 复制排版 HTML（贴到公众号/秀米）</button>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn" id="ts_save" style="flex:1">保存排版</button>
            <button class="btn" id="ts_loadpreset" style="flex:1">载入已存</button>
          </div>
          <div id="ts_msg" class="form-hint"></div>
          <div class="form-hint" style="margin-top:8px">提示：图片若为网址可直接粘贴；若为本地/AI生成的 base64，建议先到公众号后台「图片」上传，或粘贴进秀米/壹伴后再发，避免个别编辑器不识别内嵌图。</div>
        </div>
      </div>
    </div>
  `;

  // 来源载入
  container.querySelector('#ts_loadsrc').onclick = () => {
    const id = container.querySelector('#ts_source').value;
    if (!id) { toast('请先选择一篇文章'); return; }
    const d = drafts.find(x => x.id === id);
    if (!d) return;
    state.sourceId = id;
    state.title = d.title || '';
    state.body = d.content || '';
    const covers = (d.covers || []).filter(c => c.image).map(c => ({ src: c.image, caption: c.position || c.prompt || '' }));
    state.images = covers;
    saveLast();
    renderTypeset(container);
    toast('已载入文章与配图');
  };

  // 基础字段
  const bind = (sel, key, transform) => {
    const el = container.querySelector(sel);
    el.oninput = () => { state[key] = transform ? transform(el.value) : el.value; saveLast(); renderPreview(); };
  };
  bind('#ts_title', 'title');
  bind('#ts_author', 'author');
  bind('#ts_date', 'date');
  bind('#ts_sign', 'signature');
  container.querySelector('#ts_body').oninput = (e) => {
    // 大文本输入时只更新数据+预览，不整体重渲染（避免光标跳动）
    state.body = e.target.value; saveLast(); renderPreview();
  };

  // 配图快捷按钮
  container.querySelector('#ts_autoimg').onclick = () => {
    const paras = state.body.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (paras.length === 0) { toast('先写点正文'); return; }
    const maxImgs = state.images.length || 1;
    let out = [], placed = 0;
    paras.forEach((p, idx) => {
      out.push(p);
      if ((idx + 1) % 2 === 0 && placed < maxImgs) { out.push('【图】'); placed++; }
    });
    state.body = out.join('\n\n');
    container.querySelector('#ts_body').value = state.body;
    saveLast(); renderPreview();
    toast(`已在 ${placed} 处插入配图标记`);
  };
  container.querySelector('#ts_clrmark').onclick = () => {
    state.body = state.body.replace(/^\s*(?:【?图】?|\[\[?图\]?\])\s*.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    container.querySelector('#ts_body').value = state.body;
    saveLast(); renderPreview();
  };

  // 配图来源
  container.querySelector('#ts_fromlib').onclick = () => openLibPicker(container);
  container.querySelector('#ts_upload').onclick = () => container.querySelector('#ts_file').click();
  container.querySelector('#ts_file').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { state.images.push({ src: reader.result, caption: '' }); saveLast(); renderImgList(container); renderPreview(); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  container.querySelector('#ts_url').onclick = () => {
    openModal({
      title: '添加图片网址',
      body: `<div class="field"><label class="field-label">图片 URL</label><input class="input" id="ts_url_in" placeholder="https://..."></div>
             <div class="field"><label class="field-label">图注（可选）</label><input class="input" id="ts_url_cap" placeholder="如：清晨的窗台"></div>`,
      foot: `<button class="btn" id="ts_url_cancel">取消</button><button class="btn btn-primary" id="ts_url_ok">添加</button>`
    });
    document.getElementById('ts_url_cancel').onclick = closeModal;
    document.getElementById('ts_url_ok').onclick = () => {
      const u = document.getElementById('ts_url_in').value.trim();
      if (!u) { toast('请填写网址'); return; }
      state.images.push({ src: u, caption: document.getElementById('ts_url_cap').value.trim() });
      saveLast(); closeModal(); renderImgList(container); renderPreview();
    };
  };

  // 主题
  renderThemes(container);

  // 导出
  container.querySelector('#ts_copy').onclick = async () => {
    const html = exportHTML();
    try {
      await navigator.clipboard.writeText(html);
      msg(container, '✅ 已复制排版 HTML，去公众号/秀米编辑器 Ctrl+V 粘贴即可');
    } catch (e) {
      // 降级：弹出可手动复制的文本框
      openModal({
        title: '复制排版 HTML', size: 'lg',
        body: `<textarea class="textarea" id="ts_export_box" style="min-height:320px">${esc(html)}</textarea>
               <div class="form-hint">当前环境无法自动复制，请手动全选复制。</div>`,
        foot: `<button class="btn btn-primary" id="ts_export_close">关闭</button>`
      });
      document.getElementById('ts_export_box').select();
      document.getElementById('ts_export_close').onclick = closeModal;
    }
  };
  container.querySelector('#ts_save').onclick = () => {
    openModal({
      title: '保存此排版',
      body: `<div class="field"><label class="field-label">命名（便于以后载入）</label><input class="input" id="ts_preset_name" placeholder="如：读书推文-绿"></div>`,
      foot: `<button class="btn" id="ts_preset_cancel">取消</button><button class="btn btn-primary" id="ts_preset_ok">保存</button>`
    });
    document.getElementById('ts_preset_cancel').onclick = closeModal;
    document.getElementById('ts_preset_ok').onclick = () => {
      const name = document.getElementById('ts_preset_name').value.trim() || ('排版 ' + new Date().toLocaleDateString());
      const presets = Storage.get(PRESET_KEY, []);
      presets.push({ id: Storage.uid(), name, state: JSON.parse(JSON.stringify(state)), createdAt: Date.now() });
      Storage.set(PRESET_KEY, presets);
      closeModal(); toast('已保存排版：' + name);
    };
  };
  container.querySelector('#ts_loadpreset').onclick = () => openPresetList(container);

  renderImgList(container);
  renderPreview();
}

function msg(container, text) {
  const el = container.querySelector('#ts_msg');
  if (el) el.textContent = text;
}

function renderPreview() {
  if (!containerRef) return;
  const blocks = resolveBlocks(parseBlocks(state.body), state.images);
  const t = THEMES[state.theme];
  const screen = containerRef.querySelector('#ts_preview');
  if (!screen) return;
  screen.style.background = t.bg;
  screen.innerHTML = headHTML(t) + buildBlocksHTML(blocks, state.theme, false);
}

function renderThemes(container) {
  const el = container.querySelector('#ts_themes');
  el.innerHTML = Object.entries(THEMES).map(([k, v]) => `
    <button class="ts-theme ${k === state.theme ? 'on' : ''}" data-theme="${k}" title="${v.name}" style="background:${v.bg};border-color:${k === state.theme ? v.accent : '#ddd'}">
      <span style="background:${v.accent}"></span>${v.name}
    </button>`).join('');
  el.querySelectorAll('.ts-theme').forEach(b => {
    b.onclick = () => { state.theme = b.dataset.theme; saveLast(); renderThemes(container); renderPreview(); };
  });
}

function renderImgList(container) {
  const el = container.querySelector('#ts_imglist');
  const count = container.querySelector('#ts_imgcount');
  if (count) count.textContent = state.images.length;
  if (state.images.length === 0) {
    el.innerHTML = `<div class="ts-img-empty">还没有配图，点上方「从图片库选 / 上传 / 网址」添加</div>`;
    return;
  }
  el.innerHTML = state.images.map((img, i) => `
    <div class="ts-img-item" data-i="${i}">
      <img src="${escAttr(img.src)}" class="ts-img-thumb">
      <div class="ts-img-meta">
        <input class="input ts-img-cap" data-i="${i}" value="${escAttr(img.caption)}" placeholder="图注（可选）">
        <div class="ts-img-btns">
          <button class="btn btn-sm ts-img-up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm ts-img-down" data-i="${i}" ${i === state.images.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm ts-img-del" data-i="${i}">${Icons.trash}</button>
        </div>
      </div>
    </div>`).join('');
  el.querySelectorAll('.ts-img-cap').forEach(inp => {
    inp.oninput = () => { state.images[Number(inp.dataset.i)].caption = inp.value; saveLast(); renderPreview(); };
  });
  el.querySelectorAll('.ts-img-up').forEach(b => b.onclick = () => moveImg(Number(b.dataset.i), -1, container));
  el.querySelectorAll('.ts-img-down').forEach(b => b.onclick = () => moveImg(Number(b.dataset.i), 1, container));
  el.querySelectorAll('.ts-img-del').forEach(b => b.onclick = () => {
    state.images.splice(Number(b.dataset.i), 1); saveLast(); renderImgList(container); renderPreview();
  });
}

function moveImg(i, dir, container) {
  const j = i + dir;
  if (j < 0 || j >= state.images.length) return;
  const tmp = state.images[i]; state.images[i] = state.images[j]; state.images[j] = tmp;
  saveLast(); renderImgList(container); renderPreview();
}

function openLibPicker(container) {
  const imgs = Storage.get(LIB_KEY, []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  openModal({
    title: '从图片库选择', size: 'lg',
    body: imgs.length === 0
      ? `<div class="empty"><div class="empty-icon">🖼️</div><div class="empty-title">图片库是空的</div><div class="empty-desc">去「图片库」或「内容生成」生成配图</div></div>`
      : `<div class="img-grid">${imgs.map(img => `
          <div class="img-card ts-lib-card" data-src="${escAttr(img.image)}" style="cursor:pointer;background:var(--bg-card);border-radius:8px;overflow:hidden;border:1px solid var(--border)">
            <div style="aspect-ratio:1;background:var(--bg-input)"><img src="${escAttr(img.image)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></div>
            <div style="padding:6px;font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(img.prompt || img.position || '(无描述)')}</div>
          </div>`).join('')}</div>`,
    foot: `<button class="btn btn-primary" id="ts_lib_close">关闭</button>`
  });
  document.getElementById('ts_lib_close').onclick = closeModal;
  document.querySelectorAll('.ts-lib-card').forEach(card => {
    card.onclick = () => {
      const src = card.dataset.src;
      const img = imgs.find(x => x.image === src);
      state.images.push({ src, caption: img ? (img.position || img.prompt || '') : '' });
      saveLast(); renderImgList(container); renderPreview();
      toast('已添加 1 张配图');
    };
  });
}

function openPresetList(container) {
  const presets = Storage.get(PRESET_KEY, []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  openModal({
    title: '载入已存排版', size: 'lg',
    body: presets.length === 0
      ? `<div class="empty"><div class="empty-icon">📐</div><div class="empty-title">还没有保存的排版</div><div class="empty-desc">在排版页点「保存排版」即可存为模板</div></div>`
      : `<div class="list">${presets.map(p => `
          <div class="list-item" data-id="${p.id}">
            <div class="list-item-head">
              <div style="flex:1;min-width:0">
                <div class="list-item-title">${esc(p.name)}</div>
                <div class="list-item-meta"><span>${new Date(p.createdAt).toLocaleDateString()}</span><span>${esc((p.state.title || '无标题'))}</span></div>
              </div>
              <div class="list-item-actions">
                <button class="btn btn-sm ts-pre-load">载入</button>
                <button class="btn btn-sm ts-pre-del">${Icons.trash}</button>
              </div>
            </div>
          </div>`).join('')}</div>`,
    foot: `<button class="btn btn-primary" id="ts_pre_close">关闭</button>`
  });
  document.getElementById('ts_pre_close').onclick = closeModal;
  document.querySelectorAll('.ts-pre-load').forEach(b => b.onclick = () => {
    const p = presets.find(x => x.id === b.closest('.list-item').dataset.id);
    if (!p) return;
    state = JSON.parse(JSON.stringify(p.state));
    saveLast(); closeModal(); renderTypeset(container);
    toast('已载入排版：' + p.name);
  });
  document.querySelectorAll('.ts-pre-del').forEach(b => b.onclick = async () => {
    const id = b.closest('.list-item').dataset.id;
    if (await confirmDialog({ title: '删除', message: '删除这个保存的排版吗？', confirmText: '删除', danger: true })) {
      Storage.set(PRESET_KEY, presets.filter(x => x.id !== id));
      openPresetList(container);
    }
  });
}

export function initTypeset() {
  registerModule('wechat-typeset', {
    section: 'wechat',
    title: '公众号排版',
    icon: Icons.layout,
    render: renderTypeset
  });
}
