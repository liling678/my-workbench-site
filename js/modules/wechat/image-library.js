// image-library.js — 图片库：浏览所有生成过的图片（自动入库来自 content-gen）
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, escapeHtml } from '../../ui.js';
import { Icons } from '../../registry.js';

const LIB_KEY = 'wechat_image_library';

function loadImages() {
  return Storage.get(LIB_KEY, []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function renderImageLibrary(container) {
  const images = loadImages();

  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">图片库</div>
      <div class="page-desc">每次在「内容生成」生成的配图都会自动入库，可浏览、复用、复制</div>
    </div>

    <div class="stats-grid mb-16">
      <div class="stat-item">
        <div class="stat-num">${images.length}</div>
        <div class="stat-label">图片总数</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">${new Set(images.map(i => i.position)).size}</div>
        <div class="stat-label">用途数</div>
      </div>
    </div>

    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <input class="input" id="img_search" placeholder="🔍 按 prompt 描述搜索…" style="flex:1;min-width:160px">
        <button class="btn" id="img_clear">${Icons.trash} 清空图片库</button>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:8px">
        💡 图片库最多保留 200 张（超出自动删旧的）。点图片可看大图、复制、删除。
      </div>
    </div>

    <div id="img_grid" class="img-grid"></div>
  `;

  const grid = container.querySelector('#img_grid');
  const search = container.querySelector('#img_search');
  const clearBtn = container.querySelector('#img_clear');

  function paint(filter = '') {
    const all = loadImages();
    const q = filter.trim().toLowerCase();
    const list = q ? all.filter(i => (i.prompt || '').toLowerCase().includes(q) || (i.sourceTitle || '').toLowerCase().includes(q)) : all;
    if (list.length === 0) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🖼️</div><div class="empty-title">${q ? '没有匹配的图片' : '图片库还是空的'}</div><div class="empty-desc">${q ? '试试其他关键词' : '去「内容生成」生成配图，会自动入库'}</div></div>`;
      return;
    }
    grid.innerHTML = list.map(img => `
      <div class="img-card" data-id="${img.id}" style="cursor:pointer;background:var(--bg-card);border-radius:8px;overflow:hidden;border:1px solid var(--border);transition:transform .15s" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform=''">
        <div style="aspect-ratio:1;background:var(--bg-input);position:relative">
          <img src="${escapeAttr(img.image)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">
          ${img.position ? `<span style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:2px 6px;border-radius:4px">${escapeHtml(img.position)}</span>` : ''}
        </div>
        <div style="padding:8px;font-size:11px;color:var(--text-muted);line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:34px">
          ${escapeHtml(img.prompt || '(无描述)')}
        </div>
      </div>
    `).join('');
    grid.querySelectorAll('.img-card').forEach(card => {
      const id = card.dataset.id;
      card.onclick = () => openImageModal(loadImages().find(i => i.id === id), () => { paint(search.value); });
    });
  }
  paint();

  search.oninput = () => paint(search.value);
  clearBtn.onclick = async () => {
    if (images.length === 0) { toast('图片库已为空'); return; }
    if (await confirmDialog({ title: '清空图片库', message: `确定删除全部 ${images.length} 张图片吗？此操作不可恢复。`, confirmText: '清空', danger: true })) {
      Storage.set(LIB_KEY, []);
      toast('已清空');
      renderImageLibrary(container);
    }
  };
}

function openImageModal(img, rerender) {
  if (!img) return;
  openModal({
    title: '图片详情',
    size: 'lg',
    body: `
      <div style="text-align:center;background:var(--bg-input);border-radius:8px;padding:12px;margin-bottom:12px">
        <img src="${escapeAttr(img.image)}" style="max-width:100%;max-height:60vh;object-fit:contain;border-radius:6px">
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">📍 用途</div>
        <div style="font-size:13px">${escapeHtml(img.position || '未指定')}</div>
      </div>
      ${img.sourceTitle ? `<div style="margin-bottom:8px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">📰 来自文章</div>
        <div style="font-size:13px">${escapeHtml(img.sourceTitle)}</div>
      </div>` : ''}
      <div style="margin-bottom:8px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">🎨 画面描述（prompt）</div>
        <div style="padding:8px 10px;background:var(--bg-input);border-radius:6px;font-size:13px;line-height:1.6">${escapeHtml(img.prompt || '(无)')}</div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">生成于 ${new Date(img.createdAt).toLocaleString()}</div>
    `,
    foot: `<button class="btn" id="img_copy">${Icons.copy} 复制图片</button><button class="btn" id="img_download">${Icons.download} 下载</button><button class="btn" id="img_del">${Icons.trash} 删除</button><button class="btn btn-primary" id="img_close">关闭</button>`
  });

  document.getElementById('img_close').onclick = closeModal;
  document.getElementById('img_copy').onclick = async () => {
    try {
      const blob = await (await fetch(img.image)).blob();
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        toast('图片已复制到剪贴板');
      } else {
        toast('当前浏览器不支持复制图片，请用「下载」');
      }
    } catch (e) {
      toast('复制失败：' + e.message + '（请用下载）');
    }
  };
  document.getElementById('img_download').onclick = () => {
    const a = document.createElement('a');
    a.href = img.image;
    a.download = `cover-${img.id}.${img.image.startsWith('data:image/png') ? 'png' : 'jpg'}`;
    a.click();
  };
  document.getElementById('img_del').onclick = async () => {
    if (await confirmDialog({ title: '删除图片', message: '确定从图片库删除这张图吗？', confirmText: '删除', danger: true })) {
      Storage.set(LIB_KEY, loadImages().filter(i => i.id !== img.id));
      toast('已删除');
      closeModal();
      rerender && rerender();
    }
  };
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}