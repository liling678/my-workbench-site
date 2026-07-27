// exercise.js — 运动打卡独立模块：记录运动、查看历史、统计
import { registerStandalone, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, toast, fmtDate, dateKey, escapeHtml } from '../../ui.js';

const KEY = 'exercise_records';

function loadData() {
  return Storage.get(KEY, []);
}
function saveData(data) {
  Storage.set(KEY, data);
}

const TYPES = ['跑步', '健身', '瑜伽', '游泳', '骑行', '跳绳', '散步', '球类', '其他'];

export function initExercise() {
  registerStandalone('exercise', {
    title: '运动打卡',
    icon: Icons.exercise,
    render(container) {
      const data = loadData();
      const todayRecords = data.filter(r => r.date === dateKey(new Date()));
      const weekRecords = data.filter(r => {
        const d = new Date(r.date);
        const now = new Date();
        const diff = (now - d) / 86400000;
        return diff < 7;
      });
      const totalMin = weekRecords.reduce((s, r) => s + (r.duration || 0), 0);

      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">运动打卡</div>
          <div class="page-desc">坚持运动，保持活力</div>
        </div>

        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-num">${todayRecords.length}</div>
            <div class="stat-label">今日打卡</div>
          </div>
          <div class="stat-item">
            <div class="stat-num">${totalMin}</div>
            <div class="stat-label">本周分钟</div>
          </div>
          <div class="stat-item">
            <div class="stat-num">${weekRecords.length}</div>
            <div class="stat-label">本周次数</div>
          </div>
        </div>

        <div class="flex gap-8 mb-16">
          <button class="btn btn-primary" id="addExerciseBtn">${Icons.plus} 打卡运动</button>
        </div>

        <div class="section-title">运动记录</div>
        <div id="exerciseList"></div>
      `;

      renderList(container);
      container.querySelector('#addExerciseBtn').onclick = () => openAddModal(container);
    }
  });
}

function renderList(container) {
  const data = loadData().sort((a, b) => b.createdAt - a.createdAt);
  const el = container.querySelector('#exerciseList');
  if (data.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">\uD83C\uDFC3</div><div class="empty-title">还没有运动记录</div><div class="empty-desc">动起来吧！</div></div>`;
    return;
  }
  el.innerHTML = data.map(r => `
    <div class="note-card">
      <div class="note-card-head">
        <div class="note-card-title">${escapeHtml(r.type)} \u00B7 ${r.duration}min</div>
        <div class="task-actions">
          <button class="task-action-btn" data-ex-del="${r.id}">${Icons.trash}</button>
        </div>
      </div>
      ${r.feeling ? `<div class="bug-card-meta"><span class="badge badge-green">${escapeHtml(r.feeling)}</span></div>` : ''}
      ${r.note ? `<div class="note-card-body">${escapeHtml(r.note)}</div>` : ''}
      <div class="bug-card-section">${r.date} \u00B7 ${fmtDate(r.createdAt)}</div>
    </div>
  `).join('');

  el.querySelectorAll('[data-ex-del]').forEach(btn => {
    btn.onclick = () => {
      const data = loadData().filter(r => r.id !== btn.dataset.exDel);
      saveData(data);
      toast('已删除');
      renderList(container);
    };
  });
}

function openAddModal(container) {
  openModal({
    title: '运动打卡',
    body: `
      <div class="field">
        <label class="field-label">运动类型</label>
        <select class="select" id="exType">${TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label class="field-label">时长（分钟）</label>
        <input class="input" type="number" id="exDuration" value="30" min="1">
      </div>
      <div class="field">
        <label class="field-label">感受</label>
        <select class="select" id="exFeeling">
          <option value="">选择感受</option>
          <option value="轻松">轻松</option>
          <option value="刚好">刚好</option>
          <option value="有点累">有点累</option>
          <option value="很累但爽">很累但爽</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">备注（选填）</label>
        <textarea class="textarea" id="exNote" placeholder="今天的状态、成就等"></textarea>
      </div>`,
    foot: `<button class="btn" id="exCancel">取消</button><button class="btn btn-primary" id="exSave">打卡</button>`
  });
  document.getElementById('exCancel').onclick = closeModal;
  document.getElementById('exSave').onclick = () => {
    const type = document.getElementById('exType').value;
    const duration = parseInt(document.getElementById('exDuration').value) || 0;
    if (duration <= 0) { toast('请输入有效时长'); return; }
    const data = loadData();
    data.push({
      id: Storage.uid(),
      type, duration,
      feeling: document.getElementById('exFeeling').value,
      note: document.getElementById('exNote').value.trim(),
      date: dateKey(new Date()),
      createdAt: Date.now(),
    });
    saveData(data);
    closeModal();
    toast('运动打卡成功！');
    renderList(container);
    // 刷新统计
    const data2 = loadData();
    const todayRecords = data2.filter(r => r.date === dateKey(new Date()));
    const weekRecords = data2.filter(r => {
      const d = new Date(r.date);
      const now = new Date();
      const diff = (now - d) / 86400000;
      return diff < 7;
    });
    const totalMin = weekRecords.reduce((s, r) => s + (r.duration || 0), 0);
    const stats = container.querySelectorAll('.stat-num');
    if (stats[0]) stats[0].textContent = todayRecords.length;
    if (stats[1]) stats[1].textContent = totalMin;
    if (stats[2]) stats[2].textContent = weekRecords.length;
  };
}
