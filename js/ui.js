// ui.js — 通用 UI 组件：弹窗、确认框、提示

const modalRoot = document.getElementById('modalRoot');
const toastRoot = document.getElementById('toastRoot');

export function openModal({ title, body, foot, size }) {
  closeModal();
  const cls = size === 'lg' ? 'modal lg' : 'modal';
  modalRoot.innerHTML = `
    <div class="${cls}">
      <div class="modal-head">
        <div class="modal-title">${title || ''}</div>
        <button class="icon-btn" id="modalCloseBtn" aria-label="关闭">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">${body || ''}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>`;
  modalRoot.classList.add('show');
  document.getElementById('modalCloseBtn').onclick = closeModal;
  // 防误关：点击遮罩空白处不再直接关闭弹窗（避免表单填一半误触丢失），
  // 只轻微晃动弹窗提示用户用「取消」或右上角 ✕ 关闭
  modalRoot.onclick = (e) => {
    if (e.target === modalRoot) {
      const m = modalRoot.querySelector('.modal');
      if (m) {
        m.style.animation = 'none';
        // 触发 reflow 后重新加抖动动画
        void m.offsetWidth;
        m.style.animation = 'wbModalShake .3s';
      }
    }
  };
  return modalRoot.querySelector('.modal');
}

export function closeModal() {
  modalRoot.classList.remove('show');
  modalRoot.innerHTML = '';
  modalRoot.onclick = null;
}

export function confirmDialog({ title, message, confirmText = '确认', danger }) {
  return new Promise(resolve => {
    openModal({
      title: title || '确认操作',
      body: `<p style="font-size:14px;color:var(--text-muted);line-height:1.7">${message}</p>`,
      foot: `<button class="btn" id="cancelBtn">取消</button>
             <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="okBtn">${confirmText}</button>`
    });
    document.getElementById('cancelBtn').onclick = () => { closeModal(); resolve(false); };
    document.getElementById('okBtn').onclick = () => { closeModal(); resolve(true); };
  });
}

export function toast(message, duration = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .2s';
    setTimeout(() => el.remove(), 200);
  }, duration);
}

export function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('已复制到剪贴板'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('已复制到剪贴板');
  }
}
