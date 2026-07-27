// mood-diary.js — 心情日记：每日心情记录 + 每日随拍
import { registerStandalone, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, toast, fmtDate, dateKey, escapeHtml, confirmDialog } from '../../ui.js';

const KEY = 'mood_records';
const SNAP_KEY = 'mood_snapshots';

function loadData() { return Storage.get(KEY, []); }
function saveData(data) { Storage.set(KEY, data); }
function loadSnaps() { return Storage.get(SNAP_KEY, []); }
function saveSnaps(data) { Storage.set(SNAP_KEY, data); }

const MOODS = [
  { id: 'great', emoji: '\uD83D\uDE04', name: '超好', color: 'badge-green' },
  { id: 'good', emoji: '\uD83D\uDE42', name: '不错', color: 'badge-blue' },
  { id: 'ok', emoji: '\uD83D\uDE10', name: '一般', color: 'badge-gray' },
  { id: 'bad', emoji: '\uD83D\uDE1F', name: '不太好', color: 'badge-amber' },
  { id: 'terrible', emoji: '\uD83D\uDE2D', name: '糟糕', color: 'badge-red' },
];

// 图片压缩
function compressImage(file, maxWidth = 400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function initMoodDiary() {
  registerStandalone('mood-diary', {
    title: '心情日记',
    icon: Icons.mood,
    render(container) {
      const data = loadData().sort((a, b) => b.createdAt - a.createdAt);
      const snaps = loadSnaps().sort((a, b) => b.createdAt - a.createdAt);
      const todayMood = data.find(r => r.date === dateKey(new Date()));
      const todaySnap = snaps.find(s => s.date === dateKey(new Date()));

      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">心情日记</div>
          <div class="page-desc">记录每一天的心情与生活碎片</div>
        </div>

        <div class="card card-pad mb-16">
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px">今天心情怎么样？</div>
          <div style="display:flex;gap:8px;justify-content:space-between">
            ${MOODS.map(m => `
              <div class="checkin-item undone" data-mood="${m.id}" style="flex:1;padding:10px 4px">
                <div class="checkin-item-icon" style="font-size:24px">${m.emoji}</div>
                <div class="checkin-item-name" style="font-size:11px">${m.name}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 每日随拍 -->
        <div class="card card-pad mb-16">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span style="font-size:16px">\uD83D\uDCF7</span>
            <span style="font-size:14px;font-weight:600;color:var(--text-title)">每日随拍</span>
            <span style="font-size:11px;color:var(--text-muted);margin-left:auto">${todaySnap ? '今天已拍' : '今天还没拍'}</span>
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">记录生活中的小碎片，会展示在首页"玲子碎碎念"</div>
          <button class="btn btn-primary" id="uploadSnapBtn" style="width:100%">\uD83D\uDCF7 ${todaySnap ? '再拍一张' : '上传今日随拍'}</button>
        </div>

        <div class="section-title">随拍相册 <span class="cat-count">${snaps.length}</span></div>
        <div id="snapGrid" style="margin-bottom:16px"></div>

        <div class="section-title">心情记录 <span class="cat-count">${data.length}</span></div>
        <div id="moodList"></div>
      `;

      container.querySelectorAll('[data-mood]').forEach(el => {
        el.onclick = () => openMoodModal(el.dataset.mood, container);
      });
      container.querySelector('#uploadSnapBtn').onclick = () => openSnapModal(container);

      renderSnapGrid(container);
      renderMoodList(container);
    }
  });
}

function renderSnapGrid(container) {
  const snaps = loadSnaps().sort((a, b) => b.createdAt - a.createdAt);
  const el = container.querySelector('#snapGrid');
  if (snaps.length === 0) {
    el.innerHTML = `<div class="empty" style="padding:24px"><div class="empty-icon">\uD83D\uDCF7</div><div class="empty-title">还没有随拍</div><div class="empty-desc">上传一张今天的生活碎片吧</div></div>`;
    return;
  }
  el.innerHTML = `<div class="photo-wall">` + snaps.map(s => `
    <div class="photo-item" data-id="${s.id}">
      <img src="${s.image}" alt="${escapeHtml(s.note || '随拍')}" loading="lazy">
      <div class="photo-overlay">
        ${s.note ? `<div class="photo-note">${escapeHtml(s.note)}</div>` : ''}
        <div class="photo-date">${s.date}</div>
      </div>
      <button class="photo-del" data-snap-del="${s.id}">${Icons.trash}</button>
    </div>
  `).join('') + `</div>`;

  el.querySelectorAll('[data-snap-del]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (await confirmDialog({ title: '删除', message: '确定删除这张随拍吗？', confirmText: '删除', danger: true })) {
        saveSnaps(loadSnaps().filter(s => s.id !== btn.dataset.snapDel));
        toast('已删除');
        renderSnapGrid(container);
      }
    };
  });
}

function openSnapModal(container) {
  openModal({
    title: '上传今日随拍',
    body: `
      <div class="field">
        <label class="field-label">选择照片 <span class="req">*</span></label>
        <input type="file" id="snapFile" accept="image/*" style="width:100%;font-size:13px">
      </div>
      <div class="field">
        <label class="field-label">备注（可选）</label>
        <input class="input" id="snapNote" placeholder="如：今天的晚霞好美">
      </div>`,
    foot: `<button class="btn" id="snapCancel">取消</button><button class="btn btn-primary" id="snapSave">上传</button>`
  });
  document.getElementById('snapCancel').onclick = closeModal;
  document.getElementById('snapSave').onclick = async () => {
    const file = document.getElementById('snapFile').files[0];
    if (!file) { toast('请选择照片'); return; }
    if (file.size > 10 * 1024 * 1024) { toast('照片太大，请选择 10MB 以下的图片'); return; }
    try {
      const image = await compressImage(file);
      const note = document.getElementById('snapNote').value.trim();
      saveSnaps([...loadSnaps(), {
        id: Storage.uid(),
        image, note,
        date: dateKey(new Date()),
        createdAt: Date.now(),
      }]);
      closeModal();
      toast('上传成功');
      renderSnapGrid(container);
      // 更新按钮文字
      const btn = container.querySelector('#uploadSnapBtn');
      if (btn) btn.textContent = '\uD83D\uDCF7 再拍一张';
    } catch (err) {
      toast('图片处理失败，请重试');
    }
  };
}

function renderMoodList(container) {
  const data = loadData().sort((a, b) => b.createdAt - a.createdAt);
  const el = container.querySelector('#moodList');
  if (data.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">\uD83D\uDCD6</div><div class="empty-title">还没有心情记录</div><div class="empty-desc">选一个表情记录今天的心情吧</div></div>`;
    return;
  }
  el.innerHTML = data.map(r => {
    const mood = MOODS.find(m => m.id === r.mood) || MOODS[2];
    return `
      <div class="note-card">
        <div class="note-card-head">
          <div class="note-card-title">${mood.emoji} ${mood.name}</div>
          <div class="task-actions">
            <button class="task-action-btn" data-mood-del="${r.id}">${Icons.trash}</button>
          </div>
        </div>
        ${r.content ? `<div class="note-card-body">${escapeHtml(r.content)}</div>` : ''}
        <div class="bug-card-section">${r.date} \u00B7 ${fmtDate(r.createdAt)}</div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('[data-mood-del]').forEach(btn => {
    btn.onclick = async () => {
      if (!await confirmDialog({ title: '删除', message: '确定删除这篇心情日记吗？', confirmText: '删除', danger: true })) return;
      const data = loadData().filter(r => r.id !== btn.dataset.moodDel);
      saveData(data);
      toast('已删除');
      renderMoodList(container);
    };
  });
}

function openMoodModal(moodId, container) {
  const mood = MOODS.find(m => m.id === moodId);
  openModal({
    title: `${mood.emoji} 今天${mood.name}`,
    body: `
      <div class="field">
        <label class="field-label">写点什么（选填）</label>
        <textarea class="textarea" id="moodContent" placeholder="今天发生了什么？为什么是这个心情？" autofocus></textarea>
      </div>`,
    foot: `<button class="btn" id="moodCancel">取消</button><button class="btn btn-primary" id="moodSave">记录</button>`
  });
  document.getElementById('moodCancel').onclick = closeModal;
  document.getElementById('moodSave').onclick = () => {
    const data = loadData();
    const today = dateKey(new Date());
    const existing = data.findIndex(r => r.date === today);
    const record = {
      id: existing >= 0 ? data[existing].id : Storage.uid(),
      mood: moodId,
      content: document.getElementById('moodContent').value.trim(),
      date: today,
      createdAt: Date.now(),
    };
    if (existing >= 0) {
      data[existing] = record;
    } else {
      data.push(record);
    }
    saveData(data);
    closeModal();
    toast('心情已记录');
    renderMoodList(container);
  };
}
