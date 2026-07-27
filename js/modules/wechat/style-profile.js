// style-profile.js — 风格画像：展示AI分析结果 + 生成规则，全部可手动调整
import { Storage } from '../../storage.js';
import { openModal, closeModal, toast, escapeHtml } from '../../ui.js';
import { Icons } from '../../registry.js';

const PROFILE_KEY = 'wechat_style_profile';

const DEFAULT_PROFILE = {
  publicAccount: '\u6811\u4E88\u6211\u8BF4',
  author: '\u6811\u4E88\u4E88',
  slogan: '\u4E00\u6811\u4E66\u9999\uFF0C\u4E88\u6211\u6240\u60F3\uFF0C\u4E0E\u4F60\u6162\u6162\u8BF4',
  positioning: '\u5973\u6027\u6210\u957F\u966A\u4F34\u578B\u8BFB\u4E66\u53F7',
  fingerprint: '\u8BFB\u4E66\u5206\u4EAB\u5916\u58F3 + \u60C5\u611F\u5171\u9E23\u5185\u6838\u3002\u4EE5\u4E00\u672C\u4E66\u5207\u5165\uFF0C\u4F46\u771F\u6B63\u5199\u7684\u662F\u8BFB\u8005\u7684\u60C5\u611F\u75DB\u70B9\u3002\u6E29\u67D4\u4E0D\u8BF4\u6559\uFF0C\u201C\u4F60\u201D\u548C\u201C\u6211\u201D\u7684\u5BF9\u8BDD\u611F\uFF0C\u77ED\u53E5\u788E\u7247\u5316\u6392\u7248\uFF0C\u6392\u6BD4\u53E5\u5F3A\u5316\u60C5\u7EEA\uFF0C\u795D\u798F\u5F0F\u91D1\u53E5\u6536\u5C3E\u3002',
  analyzedAt: '2026-07-25',
  articleCount: 4,
  totalWords: '~12000',
  dimensions: [
    { key: 'topic', label: '\u9009\u9898\u65B9\u5411', icon: '\uD83C\uDFAF', content: '\u4E24\u5927\u7C7B\u578B\u4EA4\u66FF\uFF1A\u2460\u5355\u672C\u4E66\u6DF1\u5EA6\u89E3\u8BFB\uFF08\u60C5\u611F\u5411\uFF0C\u5982\u300A\u4EBA\u751F\u6D77\u6D77\u300B\u300A\u514B\u6797\u7D22\u5C14\u300B\uFF09\u2461\u4E3B\u9898\u5408\u96C6\u65B9\u6CD5\u8BBA\uFF08\u5B9E\u7528\u5411\uFF0C\u5982\u804C\u573A\u52C7\u6C14\u3001\u4E66\u5355\u63A8\u8350\uFF09\u3002\u6C38\u8FDC\u4ECE\u751F\u6D3B\u75DB\u70B9\u51FA\u53D1\uFF0C\u4E66\u662F\u5165\u53E3\u4E0D\u662F\u7EC8\u70B9\u3002' },
    { key: 'title', label: '\u6807\u9898\u5957\u8DEF', icon: '\uD83D\uDCDD', content: '\u201C\u8BFB\u5B8C\u300AXXX\u300B\uFF0C\u6211\u7EC8\u4E8E\u2026\u201D\u53E5\u5F0F\u4E3A\u4E3B\uFF0C\u5076\u5C14\u7528\u53D1\u95EE\u5F0F\u6216\u6E05\u5355\u5F0F\u3002\u6807\u9898\u627F\u8BFA\u4E00\u4E2A\u60C5\u611F\u7B54\u6848\u6216\u6210\u957F\u6536\u83B7\uFF0C\u4E0D\u6807\u9898\u515A\u3002' },
    { key: 'opening', label: '\u5F00\u5934\u65B9\u5F0F', icon: '\uD83D\uDEAA', content: '4\u79CD\u53D8\u4F53\u8F6E\u6362\uFF1A\u2460\u53D1\u95EE\u5F0F\u201C\u4F60\u6709\u6CA1\u6709\u8FC7\u8FD9\u6837\u7684\u65F6\u523B\u201D\u2461\u6545\u4E8B\u5F0F\u201C\u670B\u53CB\u5C0FX\u8BF4\u201D\u2462\u65F6\u95F4\u56DE\u987E\u5F0F\u201C\u8FD9\u4E00\u5E74\u201D\u2463\u611F\u53D7\u76F4\u8FF0\u5F0F\u3002\u5185\u6838\u4E00\u81F4\uFF1A\u5148\u5171\u9E23\u518D\u5F15\u4E66\uFF0C\u4ECE\u4E0D\u76F4\u63A5\u4ECB\u7ECD\u4E66\u3002' },
    { key: 'tone', label: '\u60C5\u611F\u57FA\u8C03', icon: '\uD83D\uDC97', content: '\u6E29\u6696\u6CBB\u6108\u3001\u4E0D\u8BF4\u6559\u3001\u50CF\u670B\u53CB\u804A\u5929\u3002\u7528\u201C\u4F60\u201D\u548C\u201C\u6211\u201D\u62C9\u8FD1\u8DDD\u79BB\uFF0C\u5076\u5C14\u81EA\u5632\uFF0C\u4ECE\u4E0D\u5C45\u9AD8\u4E34\u4E0B\u3002\u60C5\u7EEA\u9012\u8FDB\uFF1A\u5171\u9E23\u2192\u5206\u6790\u2192\u9F13\u52B1\u2192\u795D\u798F\u3002' },
    { key: 'language', label: '\u8BED\u8A00\u7279\u70B9', icon: '\u270D\uFE0F', content: '\u77ED\u53E5\u4E3A\u4E3B\uFF0C\u4E00\u53E5\u4E00\u6BB5\uFF0C\u788E\u7247\u5316\u6392\u7248\u3002\u6392\u6BD4\u53E5\u5BC6\u96C6\u4F7F\u7528\uFF083-4\u4E2A\u6392\u6BD4\u4E3A\u4E00\u7EC4\uFF09\u3002\u53E3\u8BED\u5316\u8868\u8FBE\uFF0C\u51E0\u4E4E\u4E0D\u7528\u5B66\u672F\u8BCD\u6C47\u3002\u6BCF\u7BC7\u5FC5\u5F15\u4E66\u4E2D\u91D1\u53E5\u3002' },
    { key: 'structure', label: '\u6587\u7AE0\u7ED3\u6784', icon: '\uD83C\uDFD7\uFE0F', content: '\u56FA\u5B9A\u6A21\u677F\uFF1A\u53D1\u95EE/\u6545\u4E8B\u5F15\u5165 \u2192 5\u6BB5\u7F16\u53F7\u5C0F\u6807\u9898\uFF08\u91D1\u53E5\u5F0F\u6807\u9898\uFF09\u2192 \u201C\u5199\u5728\u6700\u540E\u201D\u603B\u7ED3\u5347\u534E\u3002\u5C0F\u6807\u9898\u7528\u4E00\u53E5\u8BDD\u6982\u62EC\u800C\u975E\u5173\u952E\u8BCD\u3002' },
    { key: 'signature', label: '\u6807\u5FD7\u6027\u53E5\u5F0F', icon: '\u2728', content: '\u201C\u4F60\u6709\u6CA1\u6709\u8FC7\u8FD9\u6837\u7684\u65F6\u523B\u2026\u201D\u201C\u670B\u53CB\u5C0FX\u2026\u201D\u201C\u613F\u6211\u4EEC\u2026\u201D\u201C\u5176\u5B9E\uFF0C\u2026\u201D\u3002\u6BCF\u7BC7\u5FC5\u4EE5\u201C\u613F\u6211\u4EEC\u201D\u795D\u798F\u5F0F\u91D1\u53E5\u6536\u5C3E\u3002\u6392\u6BD4\u53E5\u6A21\u677F\uFF1A\u201C\u4E0D\u662F\u2026\u800C\u662F\u2026\u201D\u201C\u6709\u65F6\u5019\u2026\u6709\u65F6\u5019\u2026\u6709\u65F6\u5019\u2026\u201D\u3002' },
    { key: 'variation', label: '\u98CE\u683C\u4E00\u81F4\u6027', icon: '\uD83D\uDCCA', content: '\u56DB\u7BC7\u4E00\u81F4\u6027\u6781\u9AD8\u3002\u6838\u5FC3\u98CE\u683C\uFF08\u77ED\u53E5\u6392\u7248\u3001\u6392\u6BD4\u53E5\u3001\u795D\u798F\u6536\u5C3E\u3001\u7B2C\u4E8C\u4EBA\u79F0\uFF09100%\u4FDD\u6301\u3002\u53D8\u5316\u4EC5\u5728\u5F00\u5934\u65B9\u5F0F\u548C\u6587\u7AE0\u7C7B\u578B\uFF08\u5355\u672Cvs\u5408\u96C6\uFF09\u4E0A\u5207\u6362\u3002' },
  ],
  rules: [
    '\u5F00\u5934\u5FC5\u987B\u4ECE\u751F\u6D3B\u611F\u53D7\u5207\u5165\uFF0C\u5148\u5171\u9E23\u518D\u5F15\u51FA\u4E66\uFF0C\u7EDD\u4E0D\u76F4\u63A5\u4ECB\u7ECD\u4E66',
    '\u4F7F\u7528\u7B2C\u4E8C\u4EBA\u79F0\u201C\u4F60\u201D\u548C\u7B2C\u4E00\u4EBA\u79F0\u201C\u6211\u201D\uFF0C\u4FDD\u6301\u5BF9\u8BDD\u611F',
    '\u77ED\u53E5\u4E3A\u4E3B\uFF0C\u4E00\u53E5\u4E00\u6BB5\uFF0C\u788E\u7247\u5316\u6392\u7248',
    '\u6BCF\u6BB5\u5C0F\u6807\u9898\u7528\u91D1\u53E5\u5F0F\u6807\u9898\uFF08\u4E00\u53E5\u8BDD\u6982\u62EC\uFF09\uFF0C\u4E0D\u7528\u5173\u952E\u8BCD',
    '\u6BCF\u7BC7\u81F3\u5C11\u4F7F\u75282\u7EC4\u6392\u6BD4\u53E5\uFF083-4\u4E2A\u4E3A\u4E00\u7EC4\uFF09',
    '\u6BCF\u7BC7\u5FC5\u987B\u5F15\u7528\u81F3\u5C111\u53E5\u4E66\u4E2D\u91D1\u53E5',
    '\u7ED3\u5C3E\u5FC5\u987B\u7528\u201C\u613F\u6211\u4EEC\u2026\u201D\u795D\u798F\u5F0F\u91D1\u53E5\u6536\u5C3E',
    '\u5168\u6587\u6E29\u6696\u6CBB\u6108\u57FA\u8C03\uFF0C\u7EDD\u4E0D\u5C45\u9AD8\u4E34\u4E0B\u8BF4\u6559',
    '\u6587\u7AE0\u7ED3\u6784\uFF1A\u5F15\u5165 \u2192 5\u6BB5\u7F16\u53F7\u5C0F\u6807\u9898 \u2192 \u201C\u5199\u5728\u6700\u540E\u201D\u5347\u534E',
    '\u5B57\u6570\u63A7\u5236\u57281500-2500\u5B57\u4E4B\u95F4',
  ],
  templates: {
    singleBook: '\u53D1\u95EE/\u6545\u4E8B\u5F15\u5165 \u2192 \u7F16\u53F7\u5C0F\u6807\u9898(5\u6BB5\uFF0C\u91D1\u53E5\u5F0F) \u2192 \u4E66\u4E2D\u91D1\u53E5\u7A7F\u63D2 \u2192 \u201C\u5199\u5728\u6700\u540E\u201D\u795D\u798F\u6536\u5C3E',
    collection: '\u4E3B\u9898\u53D1\u95EE \u2192 \u7F16\u53F7\u63A8\u8350(\u6BCF\u672C\uFF1A\u4E66\u540D+\u4E00\u53E5\u8BDD\u63A8\u8350\u7406\u7531) \u2192 \u603B\u7ED3\u9F13\u52B1 \u2192 \u201C\u613F\u6211\u4EEC\u201D\u6536\u5C3E',
  }
};

export function loadProfile() {
  const stored = Storage.get(PROFILE_KEY, null);
  if (!stored) return null;
  // Merge with defaults to ensure all fields exist (migration)
  return {
    ...DEFAULT_PROFILE,
    ...stored,
    dimensions: (stored.dimensions && stored.dimensions.length > 0) ? stored.dimensions : DEFAULT_PROFILE.dimensions,
    rules: (stored.rules && stored.rules.length > 0) ? stored.rules : DEFAULT_PROFILE.rules,
    templates: { ...DEFAULT_PROFILE.templates, ...(stored.templates || {}) },
  };
}

function saveProfile(data) {
  Storage.set(PROFILE_KEY, data);
}

function ensureProfile() {
  const profile = loadProfile();
  if (!profile) saveProfile(DEFAULT_PROFILE);
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderBody(container, profile) {
  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">\u98CE\u683C\u753B\u50CF</div>
      <div class="page-desc">AI \u5DF2\u5206\u6790 ${profile.articleCount} \u7BC7\u4EE3\u8868\u4F5C\u3002\u6240\u6709\u5185\u5BB9\u5747\u53EF\u70B9\u51FB\u7F16\u8F91\uFF0C\u8C03\u6574\u540E\u540E\u7EED\u5185\u5BB9\u751F\u6210\u5C06\u4EE5\u6B64\u4E3A\u51C6\u3002</div>
    </div>

    <div class="card card-pad mb-16" style="background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:20px">\u2728</span>
        <span style="font-size:15px;font-weight:600">\u5199\u4F5C\u98CE\u683C\u6307\u7EB9</span>
        <span class="badge" style="background:rgba(255,255,255,0.2);color:#fff;margin-left:auto">\u5DF2\u751F\u6548</span>
        <button class="icon-btn btn-sm" id="editFingerprintBtn" style="color:#fff;opacity:0.8">${Icons.edit}</button>
      </div>
      <div style="font-size:13px;line-height:1.7;opacity:0.95">${escapeHtml(profile.fingerprint)}</div>
      <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap">
        <span style="font-size:12px;opacity:0.8">${escapeHtml(profile.publicAccount)} \u00B7 ${escapeHtml(profile.author)}</span>
        <span style="font-size:12px;opacity:0.8">${profile.articleCount} \u7BC7 \u00B7 ${escapeHtml(profile.totalWords || '')}</span>
        <span style="font-size:12px;opacity:0.8">${escapeHtml(profile.analyzedAt || '')}</span>
      </div>
    </div>

    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:16px">\uD83D\uDCE2</span>
        <span style="font-size:14px;font-weight:600;color:var(--text-title)">\u516C\u4F17\u53F7\u4FE1\u606F</span>
        <button class="icon-btn btn-sm" id="editInfoBtn" style="margin-left:auto">${Icons.edit}</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:13px">
        <div><span style="color:var(--text-muted)">\u516C\u4F17\u53F7\uFF1A</span>${escapeHtml(profile.publicAccount)}</div>
        <div><span style="color:var(--text-muted)">\u4F5C\u8005\uFF1A</span>${escapeHtml(profile.author)}</div>
        <div style="grid-column:span 2"><span style="color:var(--text-muted)">Slogan\uFF1A</span>${escapeHtml(profile.slogan)}</div>
        <div style="grid-column:span 2"><span style="color:var(--text-muted)">\u5B9A\u4F4D\uFF1A</span>${escapeHtml(profile.positioning)}</div>
      </div>
    </div>

    <div class="section-title">\u98CE\u683C\u7EF4\u5EA6\u5206\u6790 <span class="cat-count">${profile.dimensions.length}</span></div>
    <div class="list mb-16" id="dimensionList">
      ${profile.dimensions.map((d, i) => `
        <div class="list-item" style="display:block;padding:14px 16px" data-dim-idx="${i}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:16px">${escapeHtml(d.icon || '')}</span>
            <span style="font-size:14px;font-weight:600;color:var(--text-title)">${escapeHtml(d.label || '')}</span>
            <button class="icon-btn btn-sm dim-edit" data-dim-idx="${i}" style="margin-left:auto">${Icons.edit}</button>
          </div>
          <div style="font-size:13px;line-height:1.6;color:var(--text-body)">${escapeHtml(d.content || '')}</div>
        </div>
      `).join('')}
    </div>

    <div class="section-title">\u6587\u7AE0\u751F\u6210\u89C4\u5219 <span class="cat-count">${profile.rules.length}</span></div>
    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:16px">\uD83D\uDCCB</span>
        <span style="font-size:14px;font-weight:600;color:var(--text-title)">\u751F\u6210\u6587\u7AE0\u65F6\u9075\u5FAA\u7684\u89C4\u5219</span>
        <button class="icon-btn btn-sm" id="editRulesBtn" style="margin-left:auto">${Icons.edit}</button>
      </div>
      <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;color:var(--text-body)">
        ${profile.rules.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
      </ol>
    </div>

    <div class="section-title">\u6587\u7AE0\u6A21\u677F</div>
    <div class="card card-pad mb-16">
      <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border-light)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:13px;font-weight:600;color:var(--text-title)">\uD83D\uDCD6 \u5355\u672C\u4E66\u6DF1\u5EA6\u89E3\u8BFB</span>
          <button class="icon-btn btn-sm" id="editTemplateSingle" style="margin-left:auto">${Icons.edit}</button>
        </div>
        <div style="font-size:12px;color:var(--text-muted);line-height:1.5">${escapeHtml(profile.templates.singleBook || '')}</div>
      </div>
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:13px;font-weight:600;color:var(--text-title)">\uD83D\uDCDA \u4E3B\u9898\u5408\u96C6\u63A8\u8350</span>
          <button class="icon-btn btn-sm" id="editTemplateCollection" style="margin-left:auto">${Icons.edit}</button>
        </div>
        <div style="font-size:12px;color:var(--text-muted);line-height:1.5">${escapeHtml(profile.templates.collection || '')}</div>
      </div>
    </div>
  `;

  const rerender = () => {
    const p = loadProfile();
    renderBody(container, p);
    bindEvents(container, p);
  };

  bindEvents(container, profile, rerender);
}

function bindEvents(container, profile, rerender) {
  container.querySelector('#editFingerprintBtn').onclick = () => {
    openModal({
      title: '\u7F16\u8F91\u98CE\u683C\u6307\u7EB9',
      body: `<div class="field"><textarea class="textarea" id="edit_text" style="min-height:160px">${escapeHtml(profile.fingerprint)}</textarea></div>`,
      foot: `<button class="btn" id="et_cancel">\u53D6\u6D88</button><button class="btn btn-primary" id="et_save">\u4FDD\u5B58</button>`
    });
    document.getElementById('et_cancel').onclick = closeModal;
    document.getElementById('et_save').onclick = () => {
      const val = document.getElementById('edit_text').value.trim();
      if (!val) { toast('\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A'); return; }
      profile.fingerprint = val;
      saveProfile(profile);
      closeModal();
      toast('\u5DF2\u66F4\u65B0');
      rerender();
    };
  };

  container.querySelector('#editInfoBtn').onclick = () => {
    openModal({
      title: '\u7F16\u8F91\u516C\u4F17\u53F7\u4FE1\u606F',
      body: `
        <div class="field"><label class="field-label">\u516C\u4F17\u53F7\u540D\u79F0</label>
          <input class="input" id="p_account" value="${escapeAttr(profile.publicAccount)}"></div>
        <div class="field"><label class="field-label">\u4F5C\u8005</label>
          <input class="input" id="p_author" value="${escapeAttr(profile.author)}"></div>
        <div class="field"><label class="field-label">Slogan</label>
          <input class="input" id="p_slogan" value="${escapeAttr(profile.slogan)}"></div>
        <div class="field"><label class="field-label">\u5B9A\u4F4D</label>
          <input class="input" id="p_positioning" value="${escapeAttr(profile.positioning)}"></div>`,
      foot: `<button class="btn" id="p_cancel">\u53D6\u6D88</button><button class="btn btn-primary" id="p_save">\u4FDD\u5B58</button>`
    });
    document.getElementById('p_cancel').onclick = closeModal;
    document.getElementById('p_save').onclick = () => {
      profile.publicAccount = document.getElementById('p_account').value.trim();
      profile.author = document.getElementById('p_author').value.trim();
      profile.slogan = document.getElementById('p_slogan').value.trim();
      profile.positioning = document.getElementById('p_positioning').value.trim();
      saveProfile(profile);
      closeModal();
      toast('\u5DF2\u66F4\u65B0');
      rerender();
    };
  };

  container.querySelectorAll('.dim-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.dimIdx);
      const dim = profile.dimensions[idx];
      if (!dim) return;
      openModal({
        title: `\u7F16\u8F91 - ${dim.label || ''}`,
        body: `
          <div class="field"><label class="field-label">\u56FE\u6807</label>
            <input class="input" id="dim_icon" value="${escapeAttr(dim.icon || '')}" style="width:60px;text-align:center"></div>
          <div class="field"><label class="field-label">\u7EF4\u5EA6\u540D\u79F0</label>
            <input class="input" id="dim_label" value="${escapeAttr(dim.label || '')}"></div>
          <div class="field"><label class="field-label">\u5206\u6790\u5185\u5BB9</label>
            <textarea class="textarea" id="dim_content" style="min-height:160px">${escapeHtml(dim.content || '')}</textarea></div>`,
        foot: `<button class="btn" id="dim_cancel">\u53D6\u6D88</button><button class="btn btn-primary" id="dim_save">\u4FDD\u5B58</button>`
      });
      document.getElementById('dim_cancel').onclick = closeModal;
      document.getElementById('dim_save').onclick = () => {
        dim.icon = document.getElementById('dim_icon').value.trim() || dim.icon;
        dim.label = document.getElementById('dim_label').value.trim();
        dim.content = document.getElementById('dim_content').value.trim();
        saveProfile(profile);
        closeModal();
        toast('\u5DF2\u66F4\u65B0');
        rerender();
      };
    };
  });

  container.querySelector('#editRulesBtn').onclick = () => {
    openModal({
      title: '\u7F16\u8F91\u751F\u6210\u89C4\u5219',
      body: `<div class="field"><label class="field-label">\u6BCF\u884C\u4E00\u6761\u89C4\u5219</label>
        <textarea class="textarea" id="rules_text" style="min-height:320px">${profile.rules.map(r => escapeHtml(r)).join('\n')}</textarea></div>`,
      foot: `<button class="btn" id="r_cancel">\u53D6\u6D88</button><button class="btn btn-primary" id="r_save">\u4FDD\u5B58</button>`
    });
    document.getElementById('r_cancel').onclick = closeModal;
    document.getElementById('r_save').onclick = () => {
      const text = document.getElementById('rules_text').value.trim();
      profile.rules = text.split('\n').map(s => s.trim()).filter(s => s);
      saveProfile(profile);
      closeModal();
      toast('\u5DF2\u66F4\u65B0');
      rerender();
    };
  };

  const editTemplate = (key, title, value) => {
    openModal({
      title,
      body: `<div class="field"><textarea class="textarea" id="edit_text" style="min-height:120px">${escapeHtml(value)}</textarea></div>`,
      foot: `<button class="btn" id="et_cancel">\u53D6\u6D88</button><button class="btn btn-primary" id="et_save">\u4FDD\u5B58</button>`
    });
    document.getElementById('et_cancel').onclick = closeModal;
    document.getElementById('et_save').onclick = () => {
      const val = document.getElementById('edit_text').value.trim();
      if (!val) { toast('\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A'); return; }
      profile.templates[key] = val;
      saveProfile(profile);
      closeModal();
      toast('\u5DF2\u66F4\u65B0');
      rerender();
    };
  };

  container.querySelector('#editTemplateSingle').onclick = () => {
    editTemplate('singleBook', '\u7F16\u8F91\u5355\u672C\u4E66\u6A21\u677F', profile.templates.singleBook || '');
  };
  container.querySelector('#editTemplateCollection').onclick = () => {
    editTemplate('collection', '\u7F16\u8F91\u5408\u96C6\u6A21\u677F', profile.templates.collection || '');
  };
}

export function renderStyleModule(container) {
  ensureProfile();
  const profile = loadProfile();
  renderBody(container, profile);
}
