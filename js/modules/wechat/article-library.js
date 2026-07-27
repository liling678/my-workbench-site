// wechat-library.js — 文章库：浏览所有保存过的公众号文章（content-gen 完成时自动入库）
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, escapeHtml } from '../../ui.js';
import { Icons } from '../../registry.js';
import { stripWatermark } from '../../ai-service.js';

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
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:6px">
          ${covers.map((c, i) => `<img src="${escapeAttr(c.image)}" class="lib-cover-img" data-ci="${i}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:zoom-in">`).join('')}
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">点图片可放大查看 / 保存（放大时自动去除AI水印）</div>
      ` : ''}
      ${a.summary ? `<div style="background:rgba(15,110,86,0.06);border-left:3px solid var(--primary);padding:10px 12px;border-radius:6px;font-size:13px;line-height:1.7;margin-bottom:14px;white-space:pre-wrap">${escapeHtml(a.summary)}</div>` : ''}
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${new Date(a.createdAt).toLocaleString()} · ${(a.content || '').length} 字</div>
      <div style="background:var(--bg-input);padding:14px;border-radius:8px;font-size:14px;line-height:1.8;max-height:500px;overflow-y:auto;white-space:pre-wrap">${escapeHtml(a.content || '(空)')}</div>
      ${a.imgIdeas ? `<div style="margin-top:14px"><div style="font-size:13px;font-weight:600;color:var(--text-title);margin-bottom:6px">封面 / 配图建议</div><div style="background:var(--bg-input);padding:10px 12px;border-radius:8px;font-size:13px;line-height:1.7;white-space:pre-wrap">${escapeHtml(a.imgIdeas)}</div></div>` : ''}
    `,
    foot: `<button class="btn" id="lib_copy_modal">${Icons.copy} 复制全文</button><button class="btn btn-primary" id="lib_close_modal">关闭</button>`
  });
  document.getElementById('lib_close_modal').onclick = closeModal;
  document.getElementById('lib_copy_modal').onclick = () => {
    navigator.clipboard.writeText(a.content || '').then(() => toast('已复制全文'));
  };
  // 点击图片 → 灯箱放大（叠加在弹窗之上，不关闭弹窗）
  document.querySelectorAll('.lib-cover-img').forEach(imgEl => {
    imgEl.onclick = () => openLightbox(a, parseInt(imgEl.dataset.ci), imgEl);
  });
}

// ===== 图片灯箱：放大查看 + 自动去水印 + 保存 =====
function openLightbox(article, coverIdx, thumbEl) {
  const covers = (article.covers || []).filter(c => c.image);
  const cover = covers[coverIdx];
  if (!cover) return;

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;cursor:zoom-out';
  box.innerHTML = `
    <img id="lb_img" src="${escapeAttr(cover.image)}" style="max-width:94vw;max-height:78vh;object-fit:contain;border-radius:8px;cursor:default;box-shadow:0 8px 40px rgba(0,0,0,.5)">
    <div id="lb_status" style="color:rgba(255,255,255,.7);font-size:12px;margin-top:10px;min-height:18px"></div>
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn" id="lb_save" style="background:#fff;cursor:pointer">${Icons.download} 保存图片</button>
      <button class="btn" id="lb_close" style="background:rgba(255,255,255,.15);color:#fff;border-color:transparent;cursor:pointer">关闭</button>
    </div>
  `;
  document.body.appendChild(box);
  const imgEl = box.querySelector('#lb_img');
  const statusEl = box.querySelector('#lb_status');
  const destroy = () => box.remove();
  box.onclick = (e) => { if (e.target === box) destroy(); };
  box.querySelector('#lb_close').onclick = destroy;

  // 有水印的图（raw 或远程链接）→ 自动尝试去水印，成功后回存到文章库
  let currentSrc = cover.image;
  const needClean = cover.raw || /^https?:/.test(cover.image);
  if (needClean) {
    statusEl.textContent = '正在去除AI水印…';
    stripWatermark(cover.image).then(clean => {
      currentSrc = clean;
      imgEl.src = clean;
      if (thumbEl) thumbEl.src = clean;
      statusEl.textContent = '✅ 已去除水印';
      // 回存干净版到文章库（找到原 draft 中对应的 cover）
      const drafts = Storage.get(LIB_KEY, []);
      const d = drafts.find(x => x.id === article.id);
      if (d) {
        const target = (d.covers || []).find(c => c.image === cover.image);
        if (target) { target.image = clean; target.raw = false; Storage.set(LIB_KEY, drafts); cover.image = clean; cover.raw = false; }
      }
    }).catch(() => {
      statusEl.textContent = '水印去除失败（网络受限），显示原图';
    });
  }

  box.querySelector('#lb_save').onclick = async (e) => {
    e.stopPropagation();
    try {
      const resp = await fetch(currentSrc);
      const blob = await resp.blob();
      const aEl = document.createElement('a');
      aEl.href = URL.createObjectURL(blob);
      aEl.download = `配图_${cover.position || coverIdx + 1}_${Date.now()}.${currentSrc.startsWith('data:image/png') ? 'png' : 'jpg'}`;
      document.body.appendChild(aEl);
      aEl.click();
      aEl.remove();
      setTimeout(() => URL.revokeObjectURL(aEl.href), 5000);
      toast('图片已保存');
    } catch (err) {
      window.open(currentSrc, '_blank');
    }
  };
}

function loadIntoGenerator(a) {
  // 把文章载入到内容生成器的当前编辑区
  Storage.set('wechat_current_topic', a.topic || null);
  Storage.set('wechat_current_article', a.content || '');
  Storage.set('wechat_current_title', a.title || '');
  Storage.set('wechat_current_summary', a.summary || '');
  Storage.set('wechat_current_imgideas', a.imgIdeas || '');
  Storage.set('wechat_current_covers', a.covers || []);
  Storage.set('wechat_jump_step', 2); // 直接进「写文章」步骤编辑
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