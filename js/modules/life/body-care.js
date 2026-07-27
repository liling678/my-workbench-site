// body-care.js — Body Care：体重管理 + 身体记录
import { registerStandalone, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, toast, todayKey, dateKey, escapeHtml, confirmDialog } from '../../ui.js';

const WEIGHT_KEY = 'weight_records';
const WEIGHT_TARGET_KEY = 'weight_target';

function getWeights() { return Storage.get(WEIGHT_KEY, []); }
function getWeightTarget() { return Storage.get(WEIGHT_TARGET_KEY, 104); }
function setWeightTarget(val) { Storage.set(WEIGHT_TARGET_KEY, val); }

function getLast7DaysWeights() {
  const records = getWeights();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dk = dateKey(d);
    const rec = records.find(r => r.date === dk);
    days.push({
      date: dk,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      weight: rec ? rec.weight : null,
      isToday: i === 0,
    });
  }
  return days;
}

function saveWeight(weight) {
  const records = getWeights();
  const tk = todayKey();
  const existing = records.findIndex(r => r.date === tk);
  if (existing >= 0) {
    records[existing].weight = weight;
  } else {
    records.push({ date: tk, weight });
  }
  Storage.set(WEIGHT_KEY, records);
}

export function initBodyCare() {
  registerStandalone('body-care', {
    title: 'Body Care',
    icon: Icons.target,
    render: renderBodyCare
  });
}

function renderBodyCare(container) {
  const records = getWeights().sort((a, b) => b.date.localeCompare(a.date));
  const weights = getLast7DaysWeights();
  const todayWeight = weights[6].weight;
  const yesterdayWeight = weights[5].weight;
  const weightTarget = Number(getWeightTarget()) || 104;
  const weightChange = (todayWeight && yesterdayWeight) ? Number(todayWeight) - Number(yesterdayWeight) : null;
  const tw = Number(todayWeight);
  const diffToTarget = (!isNaN(tw) && tw > 0) ? (tw - weightTarget) : null;

  const maxWeight = Math.max(...weights.filter(w => w.weight).map(w => Number(w.weight)), 1);
  const minWeight = Math.min(...weights.filter(w => w.weight).map(w => Number(w.weight)), maxWeight);
  const range = maxWeight - minWeight || 1;

  const rerender = () => renderBodyCare(container);

  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">Body Care</div>
      <div class="page-desc">体重管理 \u00B7 身体记录</div>
    </div>

    <div class="card card-pad mb-16" style="text-align:center">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">今日体重</div>
      <div style="display:flex;align-items:baseline;justify-content:center;gap:4px;margin-bottom:8px">
        <span style="font-size:40px;font-weight:600;color:var(--primary)">${todayWeight || '--'}</span>
        <span style="font-size:16px;color:var(--text-muted)">\u65A4</span>
      </div>
      <div style="display:flex;justify-content:center;gap:16px;font-size:12px;color:var(--text-muted);flex-wrap:wrap">
        <span>\u76EE\u6807 ${weightTarget} \u65A4</span>
        ${weightChange !== null ? `<span style="color:${weightChange <= 0 ? 'var(--primary)' : 'var(--red)'}">${weightChange <= 0 ? '\u2193' : '\u2191'} ${Math.abs(weightChange).toFixed(1)} \u65A4</span>` : ''}
        ${diffToTarget !== null ? `<span style="color:${diffToTarget <= 0 ? 'var(--primary)' : 'var(--amber)'}">${diffToTarget > 0 ? `\u8FD8\u5DEE ${diffToTarget.toFixed(1)} \u65A4` : `\u5DF2\u8FBE\u6807 \uD83C\uDF89`}</span>` : ''}
      </div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
        <button class="btn btn-primary" id="recordWeightBtn">\u2696\uFE0F \u8BB0\u5F55\u4ECA\u65E5\u4F53\u91CD</button>
        <button class="btn" id="setTargetBtn">\uD83C\uDFAF \u8BBE\u7F6E\u76EE\u6807</button>
      </div>
    </div>

    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px">
        <span style="font-size:14px">\uD83D\uDCC8</span>
        <span style="font-size:13px;font-weight:600;color:var(--text-title)">\u8FD17\u65E5\u4F53\u91CD\u8D8B\u52BF</span>
      </div>
      <div class="weight-chart" style="height:80px;margin-bottom:8px">
        ${weights.map(w => {
          if (!w.weight) return `<div class="weight-bar" style="height:8px;background:var(--border-light)"></div>`;
          const h = 20 + ((Number(w.weight) - minWeight) / range) * 70;
          return `<div class="weight-bar ${w.isToday ? 'today' : 'normal'}" style="height:${h}%" title="${w.date}: ${w.weight}\u65A4"></div>`;
        }).join('')}
      </div>
      <div class="weight-dates">
        ${weights.map(w => `<span>${w.isToday ? '\u4ECA\u5929' : w.label}</span>`).join('')}
      </div>
    </div>

    <div class="section-title">
      <span>\u4F53\u91CD\u5386\u53F2</span>
      <span class="cat-count">${records.length}</span>
    </div>
    <div class="list" id="weightHistoryList">
      ${records.length === 0 ? `<div class="empty"><div class="empty-icon">\u2696\uFE0F</div><div class="empty-title">\u8FD8\u6CA1\u6709\u4F53\u91CD\u8BB0\u5F55</div></div>` :
        records.map((r, i) => {
          const prev = records[i + 1];
          const change = prev ? (Number(r.weight) - Number(prev.weight)).toFixed(1) : null;
          return `
            <div class="list-item" data-date="${r.date}">
              <div class="list-item-head">
                <div style="flex:1;min-width:0">
                  <div class="list-item-title">${r.weight} \u65A4</div>
                </div>
                <div class="list-item-actions">
                  <button class="icon-btn btn-sm wt-edit" data-date="${r.date}">${Icons.edit}</button>
                  <button class="icon-btn btn-sm wt-del" data-date="${r.date}">${Icons.trash}</button>
                </div>
              </div>
              <div class="list-item-meta">
                <span>\uD83D\uDCC5 ${r.date}</span>
                ${change !== null ? `<span class="badge ${parseFloat(change) >= 0 ? 'badge-gray' : 'badge-green'}">${parseFloat(change) >= 0 ? '+' : ''}${change} \u65A4</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
    </div>
  `;

  container.querySelector('#recordWeightBtn').onclick = () => {
    openModal({
      title: '\u8BB0\u5F55\u4ECA\u65E5\u4F53\u91CD',
      body: `<div class="field">
        <label class="field-label">\u4F53\u91CD\uFF08\u65A4\uFF09</label>
        <input class="input" id="weightInput" type="number" step="0.1" placeholder="\u8F93\u5165\u4F53\u91CD\uFF08\u65A4\uFF09" value="${todayWeight || ''}" autofocus>
      </div>`,
      foot: `<button class="btn" id="wCancel">\u53D6\u6D88</button><button class="btn btn-primary" id="wSave">\u8BB0\u5F55</button>`
    });
    document.getElementById('wCancel').onclick = closeModal;
    document.getElementById('wSave').onclick = () => {
      const val = parseFloat(document.getElementById('weightInput').value);
      if (!val || val <= 0) { toast('\u8BF7\u8F93\u5165\u6709\u6548\u4F53\u91CD'); return; }
      saveWeight(val);
      closeModal();
      toast('\u4F53\u91CD\u5DF2\u8BB0\u5F55');
      rerender();
    };
  };

  container.querySelector('#setTargetBtn').onclick = () => {
    openModal({
      title: '\u8BBE\u7F6E\u76EE\u6807\u4F53\u91CD',
      body: `<div class="field"><label class="field-label">\u76EE\u6807\u4F53\u91CD\uFF08\u65A4\uFF09</label>
        <input class="input" id="targetWeightInput" type="number" step="0.1" value="${weightTarget}" placeholder="\u5982 100" autofocus></div>`,
      foot: `<button class="btn" id="tCancel">\u53D6\u6D88</button><button class="btn btn-primary" id="tSave">\u4FDD\u5B58</button>`
    });
    document.getElementById('tCancel').onclick = closeModal;
    document.getElementById('tSave').onclick = () => {
      const val = parseFloat(document.getElementById('targetWeightInput').value);
      if (!val || val <= 0) { toast('\u8BF7\u8F93\u5165\u6709\u6548\u4F53\u91CD'); return; }
      setWeightTarget(val);
      closeModal();
      toast('\u76EE\u6807\u4F53\u91CD\u5DF2\u66F4\u65B0');
      rerender();
    };
  };

  container.querySelectorAll('.wt-edit').forEach(btn => {
    btn.onclick = () => {
      const date = btn.dataset.date;
      const rec = getWeights().find(r => r.date === date);
      if (!rec) return;
      openModal({
        title: '\u7F16\u8F91\u4F53\u91CD\u8BB0\u5F55',
        body: `<div class="field">
          <label class="field-label">\u65E5\u671F</label>
          <input class="input" value="${rec.date}" disabled style="opacity:0.6">
          <label class="field-label" style="margin-top:10px">\u4F53\u91CD\uFF08\u65A4\uFF09</label>
          <input class="input" id="editWeightVal" type="number" step="0.1" value="${rec.weight}" autofocus>
        </div>`,
        foot: `<button class="btn" id="ewCancel">\u53D6\u6D88</button><button class="btn btn-primary" id="ewSave">\u4FDD\u5B58</button>`
      });
      document.getElementById('ewCancel').onclick = closeModal;
      document.getElementById('ewSave').onclick = () => {
        const val = parseFloat(document.getElementById('editWeightVal').value);
        if (!val || val <= 0) { toast('\u8BF7\u8F93\u5165\u6709\u6548\u4F53\u91CD'); return; }
        const allRecords = getWeights();
        const idx = allRecords.findIndex(r => r.date === date);
        if (idx >= 0) { allRecords[idx].weight = val; Storage.set(WEIGHT_KEY, allRecords); }
        closeModal();
        toast('\u5DF2\u66F4\u65B0');
        rerender();
      };
    };
  });

  container.querySelectorAll('.wt-del').forEach(btn => {
    btn.onclick = async () => {
      const date = btn.dataset.date;
      if (await confirmDialog({ title: '\u5220\u9664', message: '\u786E\u5B9A\u5220\u9664\u8FD9\u6761\u4F53\u91CD\u8BB0\u5F55\u5417\uFF1F', confirmText: '\u5220\u9664', danger: true })) {
        Storage.set(WEIGHT_KEY, getWeights().filter(r => r.date !== date));
        toast('\u5DF2\u5220\u9664');
        rerender();
      }
    };
  });
}
