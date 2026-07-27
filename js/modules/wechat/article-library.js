// wechat-library.js — 文章库：浏览所有保存过的公众号文章（content-gen 完成时自动入库）
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, escapeHtml } from '../../ui.js';
import { Icons } from '../../registry.js';

const LIB_KEY = 'wechat_drafts';

function loadLibrary() {
  return Storage.get(LIB_KEY, []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function renderArticleLibrary(container) {
  const articles = loadLibrary();

  // 统计
  const totalChars = articles.reduce((s, a) => s + (a.content || '').length, 0);
  const totalCovers = articles.reduce((s, a) => s + ((a.covers || []).filter(c => c.image).length), 0);

  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">文章库</div>
      <div class="page-desc">每次「完成」的文章都会自动入库，可在这里浏览、复制、复用</div>
    </div>

    <div class="stats-grid mb-16">
      <div class="stat-item">
        <div class="stat-num">${articles.length}</div>
        <div class="stat-label">文章数</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">${formatNum(totalChars)}</div>
        <div class="stat-label">总字数</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">${totalCovers}</div>
        <div class="stat-label">已生成配图</div>
      </div>
    </div>

    <div class="card card-pad mb-16">
      <div style="font-size:13px;color:var(--text-body);line-height:1.6">
        💡 <strong>使用提示</strong>：文章自动来自「内容生成」流程的最后一步「完成保存」按钮。如果想新增文章，去 <strong>内容生成</strong> 模块写完后保存即可。
      </div>
    </div>

    <div class="section-title">全部文章 <span class="cat-count">${articles.length}</span></div>
    <div class="list" id="articleList"></div>
  `;

  renderList(container, articles);
}

function renderList(container, articles) {
  const el = container.querySelector('#articleList');
  if (articles.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📖</div><div class="empty-title">文章库还是空的</div><div class="empty-desc">去「内容生成」写一篇文章，结尾「完成保存」就会自动入库</div></div>`;
    return;
  }

  el.innerHTML = articles.map(a => {
    const chars = (a.content || '').length;
    const cover = (a.covers || []).find(c => c.image);
    return `
      <div class="list-item" data-id="${a.id}">
        <div class="list-item-head">
          <div style="flex:1;min-width:0">
            <div class="list-item-title">${escapeHtml(a.title || '未命名文章')}</div>
            <div class="list-item-meta" style="margin-top:4px">
              <span>📅 ${new Date(a.createdAt).toLocaleDateString()}</span>
              <span>📝 ${chars} 字</span>
              ${cover ? `<span>🖼 ${(a.covers || []).filter(c => c.image).length} 张配图</span>` : ''}
            </div>
          </div>
          ${cover ? `<img src="${escapeAttr(cover.image)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;margin-left:8px">` : ''}
        </div>
        ${a.summary ? `<div class="list-item-body" style="margin-top:6px">${escapeHtml(a.summary)}</div>` : ''}
        <div class="list-item-actions" style="margin-top:8px">
          <button class="btn btn-sm lib-view">👁 查看全文</button>
          <button class="btn btn-sm lib-copy">${Icons.copy} 复制全文</button>
          <button class="btn btn-sm lib-load">${Icons.edit} 载入到生成器</button>
          <button class="btn btn-sm lib-del">${Icons.trash}</button>
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;
    const article = loadLibrary().find(a => a.id === id);

    item.querySelector('.lib-view').onclick = () => openViewModal(article);
    item.querySelector('.lib-copy').onclick = () => {
      navigator.clipboard.writeText(article.content || '')
        .then(() => toast(`已复制 ${(article.content || '').length} 字`));
    };
    item.querySelector('.lib-load').onclick = () => loadIntoGenerator(article);
    item.querySelector('.lib-del').onclick = async () => {
      if (await confirmDialog({ title: '删除', message: `确定从文章库删除《${article.title || '未命名'}》吗？`, confirmText: '删除', danger: true })) {
        const next = loadLibrary().filter(a => a.id !== id);
        Storage.set(LIB_KEY, next);
        toast('已删除');
        renderArticleLibrary(container);
      }
    };
  });
}

function openViewModal(a) {
  const covers = (a.covers || []).filter(c => c.image);
  openModal({
    title: a.title || '未命名文章',
    size: 'lg',
    body: `
      ${covers.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:14px">
          ${covers.map(c => `<img src="${escapeAttr(c.image)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px">`).join('')}
        </div>
      ` : ''}
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${new Date(a.createdAt).toLocaleString()} · ${(a.content || '').length} 字</div>
      <div style="background:var(--bg-input);padding:14px;border-radius:8px;font-size:14px;line-height:1.8;max-height:500px;overflow-y:auto;white-space:pre-wrap">${escapeHtml(a.content || '(空)')}</div>
    `,
    foot: `<button class="btn" id="lib_copy_modal">${Icons.copy} 复制全文</button><button class="btn btn-primary" id="lib_close_modal">关闭</button>`
  });
  document.getElementById('lib_close_modal').onclick = closeModal;
  document.getElementById('lib_copy_modal').onclick = () => {
    navigator.clipboard.writeText(a.content || '').then(() => toast('已复制全文'));
  };
}

function loadIntoGenerator(a) {
  // 把文章载入到内容生成器的当前编辑区
  Storage.set('wechat_current_topic', a.topic || null);
  Storage.set('wechat_current_article', a.content || '');
  Storage.set('wechat_current_title', a.title || '');
  Storage.set('wechat_current_covers', a.covers || []);
  toast('已载入，去「内容生成」继续编辑');
  if (window.__wbNavigate) window.__wbNavigate('wechat-gen');
}

function formatNum(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toString();
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}