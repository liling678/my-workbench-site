// biubiu.js — Biubiu大王：每日一拍 + Baby资料记录
import { registerSection, registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, fmtDate, todayKey, escapeHtml } from '../../ui.js';
import { storeImage } from '../../cloud-sync.js';

const PHOTO_KEY = 'biubiu_daily_photos';
const BABY_KEY = 'biubiu_baby_profile';
const DEWORM_KEY = 'biubiu_deworm_records';
const WEIGHT_KEY = 'biubiu_weight_records';
const OTHER_KEY = 'biubiu_other_records';

function loadPhotos() { return Storage.get(PHOTO_KEY, []); }
function savePhotos(data) { Storage.set(PHOTO_KEY, data); }
function loadBaby() { return Storage.get(BABY_KEY, {}); }
function saveBaby(data) { Storage.set(BABY_KEY, data); }
function loadDeworm() { return Storage.get(DEWORM_KEY, []); }
function saveDeworm(d) { Storage.set(DEWORM_KEY, d); }
function loadWeights() { return Storage.get(WEIGHT_KEY, []); }
function saveWeights(d) { Storage.set(WEIGHT_KEY, d); }
function loadOther() { return Storage.get(OTHER_KEY, []); }
function saveOther(d) { Storage.set(OTHER_KEY, d); }

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

export function initBiubiu() {
  registerSection('biubiu', 'Biubiu大王', { icon: Icons.cat });

  // 每日一拍
  registerModule('biubiu-photo', {
    section: 'biubiu',
    title: '每日一拍',
    icon: Icons.camera,
    render(container) {
      const photos = loadPhotos().sort((a, b) => b.createdAt - a.createdAt);
      const today = todayKey();
      const hasToday = photos.some(p => p.date === today);

      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">每日一拍</div>
          <div class="page-desc">记录 Biubiu 每天的可爱瞬间 \uD83D\uDC31</div>
        </div>
        <div class="card card-pad mb-16" style="text-align:center">
          <div style="font-size:32px;margin-bottom:8px">\uD83D\uDCF7</div>
          <div style="font-size:14px;font-weight:500;color:var(--text-title);margin-bottom:6px">
            ${hasToday ? '今天已经拍过啦！' : '今天给 Biubiu 拍照了吗？'}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">已累计 ${photos.length} 张照片</div>
          <button class="btn btn-primary" id="uploadPhotoBtn">${Icons.camera} ${hasToday ? '再拍一张' : '上传今日照片'}</button>
        </div>
        <div class="section-title">照片墙 <span class="cat-count">${photos.length}</span></div>
        <div id="photoGrid"></div>
      `;
      renderPhotoGrid(container);
      container.querySelector('#uploadPhotoBtn').onclick = () => openUploadModal(container);
    }
  });

  // Baby资料记录
  registerModule('biubiu-baby', {
    section: 'biubiu',
    title: 'Baby资料',
    icon: Icons.paw,
    render: renderBabyProfile
  });
}

// —— Baby 资料记录 ——
function renderBabyProfile(container) {
  const baby = loadBaby();
  const deworms = loadDeworm().sort((a, b) => b.date - a.date);
  const weights = loadWeights().sort((a, b) => b.date - a.date);
  const others = loadOther().sort((a, b) => b.createdAt - a.createdAt);

  // 计算年龄
  let ageText = '未填写';
  if (baby.birthDate) {
    const birth = new Date(baby.birthDate);
    const now = new Date();
    const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    if (months >= 12) {
      ageText = `${Math.floor(months / 12)}岁${months % 12}个月`;
    } else {
      ageText = `${months}个月`;
    }
  }

  // 计算到家天数
  let homeDays = '未填写';
  if (baby.meetDate) {
    const meet = new Date(baby.meetDate);
    const now = new Date();
    homeDays = `${Math.floor((now - meet) / 86400000)} 天`;
  }

  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">Baby 资料记录</div>
      <div class="page-desc">Biubiu 的基本信息、驱虫、体重等成长记录</div>
    </div>

    <!-- 基本信息 -->
    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span style="font-size:16px">🐱</span>
        <span style="font-size:14px;font-weight:600;color:var(--text-title)">基本信息</span>
        <button class="btn btn-sm btn-primary" id="editBabyBtn" style="margin-left:auto">${Icons.edit} 编辑基本信息</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;font-size:13px">
        <div><span style="color:var(--text-muted)">名字：</span>${escapeHtml(baby.name || 'Biubiu')}</div>
        <div><span style="color:var(--text-muted)">性别：</span>${escapeHtml(baby.gender || '未填写')}</div>
        <div><span style="color:var(--text-muted)">出生日期：</span>${baby.birthDate ? new Date(baby.birthDate).toLocaleDateString() : '未填写'}</div>
        <div><span style="color:var(--text-muted)">见面日期：</span>${baby.meetDate ? new Date(baby.meetDate).toLocaleDateString() : '未填写'}</div>
        <div><span style="color:var(--text-muted)">年龄：</span>${ageText}</div>
        <div><span style="color:var(--text-muted)">到家天数：</span>${homeDays}</div>
        <div><span style="color:var(--text-muted)">品种：</span>${escapeHtml(baby.breed || '未填写')}</div>
        <div><span style="color:var(--text-muted)">花色：</span>${escapeHtml(baby.color || '未填写')}</div>
        ${baby.notes ? `<div style="grid-column:span 2"><span style="color:var(--text-muted)">备注：</span>${escapeHtml(baby.notes)}</div>` : ''}
      </div>
    </div>

    <!-- 驱虫记录 -->
    <div class="section-title">
      <span>驱虫记录</span>
      <span class="cat-count">${deworms.length}</span>
      <button class="btn btn-sm btn-primary" id="addDewormBtn" style="margin-left:auto">${Icons.plus} 添加</button>
    </div>
    <div class="list mb-16" id="dewormList">
      ${deworms.length === 0 ? `<div class="empty"><div class="empty-icon">💊</div><div class="empty-title">暂无驱虫记录</div></div>` :
        deworms.map(d => `
          <div class="list-item" data-id="${d.id}">
            <div class="list-item-head">
              <div style="flex:1;min-width:0">
                <div class="list-item-title">${escapeHtml(d.type || '驱虫')}</div>
                ${d.medication ? `<div class="list-item-body">药物：${escapeHtml(d.medication)}</div>` : ''}
              </div>
              <div class="list-item-actions">
                <button class="icon-btn btn-sm deworm-edit" data-id="${d.id}">${Icons.edit}</button>
                <button class="icon-btn btn-sm deworm-del" data-id="${d.id}">${Icons.trash}</button>
              </div>
            </div>
            <div class="list-item-meta">
              <span>📅 ${new Date(d.date).toLocaleDateString()}</span>
              ${d.nextDate ? `<span class="badge badge-gray">下次：${new Date(d.nextDate).toLocaleDateString()}</span>` : ''}
            </div>
          </div>
        `).join('')}
    </div>

    <!-- 体重记录 -->
    <div class="section-title">
      <span>体重记录</span>
      <span class="cat-count">${weights.length}</span>
      <button class="btn btn-sm btn-primary" id="addWeightBtn" style="margin-left:auto">${Icons.plus} 添加</button>
    </div>
    <div class="list mb-16" id="weightList">
      ${weights.length === 0 ? `<div class="empty"><div class="empty-icon">⚖️</div><div class="empty-title">暂无体重记录</div></div>` :
        weights.map(w => {
          const prev = weights[weights.indexOf(w) + 1];
          const change = prev ? (w.weight - prev.weight).toFixed(2) : null;
          return `
            <div class="list-item" data-id="${w.id}">
              <div class="list-item-head">
                <div style="flex:1;min-width:0">
                  <div class="list-item-title">${w.weight} kg</div>
                </div>
                <div class="list-item-actions">
                  <button class="icon-btn btn-sm weight-edit" data-id="${w.id}">${Icons.edit}</button>
                  <button class="icon-btn btn-sm weight-del" data-id="${w.id}">${Icons.trash}</button>
                </div>
              </div>
              <div class="list-item-meta">
                <span>📅 ${new Date(w.date).toLocaleDateString()}</span>
                ${change !== null ? `<span class="badge ${parseFloat(change) >= 0 ? 'badge-gray' : 'badge-green'}">${parseFloat(change) >= 0 ? '+' : ''}${change} kg</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
    </div>

    <!-- 其他记录 -->
    <div class="section-title">
      <span>其他记录</span>
      <span class="cat-count">${others.length}</span>
      <button class="btn btn-sm btn-primary" id="addOtherBtn" style="margin-left:auto">${Icons.plus} 添加</button>
    </div>
    <div class="list mb-16" id="otherList">
      ${others.length === 0 ? `<div class="empty"><div class="empty-icon">📝</div><div class="empty-title">暂无其他记录</div><div class="empty-desc">疫苗、洗澡、体检等都可以记录</div></div>` :
        others.map(o => `
          <div class="list-item" data-id="${o.id}">
            <div class="list-item-head">
              <div style="flex:1;min-width:0">
                <div class="list-item-title">${escapeHtml(o.title)}</div>
                ${o.content ? `<div class="list-item-body">${escapeHtml(o.content)}</div>` : ''}
              </div>
              <div class="list-item-actions">
                <button class="icon-btn btn-sm other-edit" data-id="${o.id}">${Icons.edit}</button>
                <button class="icon-btn btn-sm other-del" data-id="${o.id}">${Icons.trash}</button>
              </div>
            </div>
            <div class="list-item-meta">
              <span class="badge badge-gray">${escapeHtml(o.category || '其他')}</span>
              <span>📅 ${new Date(o.date).toLocaleDateString()}</span>
            </div>
          </div>
        `).join('')}
    </div>
  `;

  // 编辑基本信息
  container.querySelector('#editBabyBtn').onclick = () => {
    openModal({
      title: '编辑基本信息',
      body: `
        <div style="display:flex;gap:12px">
          <div class="field" style="flex:1"><label class="field-label">名字</label>
            <input class="input" id="b_name" value="${escapeAttr(baby.name || 'Biubiu')}"></div>
          <div class="field" style="flex:1"><label class="field-label">性别</label>
            <select class="input" id="b_gender">
              <option value="公" ${baby.gender === '公' ? 'selected' : ''}>公</option>
              <option value="母" ${baby.gender === '母' ? 'selected' : ''}>母</option>
            </select></div>
        </div>
        <div style="display:flex;gap:12px">
          <div class="field" style="flex:1"><label class="field-label">出生日期</label>
            <input class="input" id="b_birth" type="date" value="${baby.birthDate ? new Date(baby.birthDate).toISOString().slice(0,10) : ''}"></div>
          <div class="field" style="flex:1"><label class="field-label">见面日期</label>
            <input class="input" id="b_meet" type="date" value="${baby.meetDate ? new Date(baby.meetDate).toISOString().slice(0,10) : ''}"></div>
        </div>
        <div style="display:flex;gap:12px">
          <div class="field" style="flex:1"><label class="field-label">品种</label>
            <input class="input" id="b_breed" value="${escapeAttr(baby.breed)}" placeholder="如：英短银渐层"></div>
          <div class="field" style="flex:1"><label class="field-label">花色</label>
            <input class="input" id="b_color" value="${escapeAttr(baby.color)}" placeholder="如：银色"></div>
        </div>
        <div class="field"><label class="field-label">备注</label>
          <textarea class="textarea" id="b_notes" style="min-height:60px" placeholder="其他需要记录的信息">${escapeHtml(baby.notes)}</textarea></div>`,
      foot: `<button class="btn" id="b_cancel">取消</button><button class="btn btn-primary" id="b_save">保存</button>`
    });
    document.getElementById('b_cancel').onclick = closeModal;
    document.getElementById('b_save').onclick = () => {
      saveBaby({
        name: document.getElementById('b_name').value.trim(),
        gender: document.getElementById('b_gender').value,
        birthDate: document.getElementById('b_birth').value ? new Date(document.getElementById('b_birth').value).getTime() : null,
        meetDate: document.getElementById('b_meet').value ? new Date(document.getElementById('b_meet').value).getTime() : null,
        breed: document.getElementById('b_breed').value.trim(),
        color: document.getElementById('b_color').value.trim(),
        notes: document.getElementById('b_notes').value.trim(),
      });
      closeModal();
      toast('已保存');
      renderBabyProfile(container);
    };
  };

  // 添加/编辑驱虫记录
  container.querySelector('#addDewormBtn').onclick = () => openDewormModal(container);
  container.querySelectorAll('.deworm-edit').forEach(btn => {
    btn.onclick = () => openDewormModal(container, btn.dataset.id);
  });

  // 添加/编辑体重记录
  container.querySelector('#addWeightBtn').onclick = () => openWeightModal(container);
  container.querySelectorAll('.weight-edit').forEach(btn => {
    btn.onclick = () => openWeightModal(container, btn.dataset.id);
  });

  // 添加/编辑其他记录
  container.querySelector('#addOtherBtn').onclick = () => openOtherModal(container);
  container.querySelectorAll('.other-edit').forEach(btn => {
    btn.onclick = () => openOtherModal(container, btn.dataset.id);
  });

  // 删除按钮
  container.querySelectorAll('.deworm-del').forEach(btn => {
    btn.onclick = async () => {
      const item = btn.closest('.list-item');
      if (await confirmDialog({ title: '删除', message: '确定删除这条记录吗？', confirmText: '删除', danger: true })) {
        saveDeworm(loadDeworm().filter(d => d.id !== item.dataset.id));
        toast('已删除');
        renderBabyProfile(container);
      }
    };
  });
  container.querySelectorAll('.weight-del').forEach(btn => {
    btn.onclick = async () => {
      const item = btn.closest('.list-item');
      if (await confirmDialog({ title: '删除', message: '确定删除这条记录吗？', confirmText: '删除', danger: true })) {
        saveWeights(loadWeights().filter(w => w.id !== item.dataset.id));
        toast('已删除');
        renderBabyProfile(container);
      }
    };
  });
  container.querySelectorAll('.other-del').forEach(btn => {
    btn.onclick = async () => {
      const item = btn.closest('.list-item');
      if (await confirmDialog({ title: '删除', message: '确定删除这条记录吗？', confirmText: '删除', danger: true })) {
        saveOther(loadOther().filter(o => o.id !== item.dataset.id));
        toast('已删除');
        renderBabyProfile(container);
      }
    };
  });
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// —— 驱虫记录弹窗（支持新增/编辑）——
function openDewormModal(container, editId) {
  const editing = editId ? loadDeworm().find(d => d.id === editId) : null;
  openModal({
    title: editing ? '编辑驱虫记录' : '添加驱虫记录',
    body: `
      <div class="field"><label class="field-label">驱虫类型</label>
        <select class="input" id="d_type">
          ${['体内驱虫', '体外驱虫', '体内外驱虫'].map(t =>
            `<option value="${t}" ${editing && editing.type === t ? 'selected' : ''}>${t}</option>`
          ).join('')}
        </select></div>
      <div class="field"><label class="field-label">驱虫日期</label>
        <input class="input" id="d_date" type="date" value="${editing ? new Date(editing.date).toISOString().slice(0,10) : new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label class="field-label">药物名称</label>
        <input class="input" id="d_medication" value="${editing ? escapeAttr(editing.medication) : ''}" placeholder="如：大宠爱、福来恩"></div>
      <div class="field"><label class="field-label">下次驱虫日期（可选）</label>
        <input class="input" id="d_next" type="date" value="${editing && editing.nextDate ? new Date(editing.nextDate).toISOString().slice(0,10) : ''}"></div>`,
    foot: `<button class="btn" id="d_cancel">取消</button><button class="btn btn-primary" id="d_save">${editing ? '保存' : '添加'}</button>`
  });
  document.getElementById('d_cancel').onclick = closeModal;
  document.getElementById('d_save').onclick = () => {
    const item = {
      type: document.getElementById('d_type').value,
      date: new Date(document.getElementById('d_date').value).getTime(),
      medication: document.getElementById('d_medication').value.trim(),
      nextDate: document.getElementById('d_next').value ? new Date(document.getElementById('d_next').value).getTime() : null,
    };
    if (editing) {
      const data = loadDeworm();
      const idx = data.findIndex(d => d.id === editId);
      data[idx] = { ...editing, ...item };
      saveDeworm(data);
    } else {
      saveDeworm([...loadDeworm(), { id: Storage.uid(), ...item }]);
    }
    closeModal();
    toast(editing ? '已更新' : '已添加');
    renderBabyProfile(container);
  };
}

// —— 体重记录弹窗（支持新增/编辑）——
function openWeightModal(container, editId) {
  const editing = editId ? loadWeights().find(w => w.id === editId) : null;
  openModal({
    title: editing ? '编辑体重记录' : '添加体重记录',
    body: `
      <div class="field"><label class="field-label">体重（kg）</label>
        <input class="input" id="w_weight" type="number" step="0.01" value="${editing ? editing.weight : ''}" placeholder="如 3.5" autofocus></div>
      <div class="field"><label class="field-label">记录日期</label>
        <input class="input" id="w_date" type="date" value="${editing ? new Date(editing.date).toISOString().slice(0,10) : new Date().toISOString().slice(0,10)}"></div>`,
    foot: `<button class="btn" id="w_cancel">取消</button><button class="btn btn-primary" id="w_save">${editing ? '保存' : '添加'}</button>`
  });
  document.getElementById('w_cancel').onclick = closeModal;
  document.getElementById('w_save').onclick = () => {
    const weight = parseFloat(document.getElementById('w_weight').value);
    if (isNaN(weight) || weight <= 0) { toast('请输入有效体重'); return; }
    const item = {
      weight,
      date: new Date(document.getElementById('w_date').value).getTime(),
    };
    if (editing) {
      const data = loadWeights();
      const idx = data.findIndex(w => w.id === editId);
      data[idx] = { ...editing, ...item };
      saveWeights(data);
    } else {
      saveWeights([...loadWeights(), { id: Storage.uid(), ...item }]);
    }
    closeModal();
    toast(editing ? '已更新' : '已添加');
    renderBabyProfile(container);
  };
}

// —— 其他记录弹窗（支持新增/编辑）——
function openOtherModal(container, editId) {
  const editing = editId ? loadOther().find(o => o.id === editId) : null;
  openModal({
    title: editing ? '编辑其他记录' : '添加其他记录',
    body: `
      <div class="field"><label class="field-label">类别</label>
        <select class="input" id="o_category">
          ${['疫苗', '洗澡', '体检', '绝育', '生病', '其他'].map(c =>
            `<option value="${c}" ${editing && editing.category === c ? 'selected' : ''}>${c}</option>`
          ).join('')}
        </select></div>
      <div class="field"><label class="field-label">标题</label>
        <input class="input" id="o_title" value="${editing ? escapeAttr(editing.title) : ''}" placeholder="如：第一针疫苗" autofocus></div>
      <div class="field"><label class="field-label">详细内容</label>
        <textarea class="textarea" id="o_content" style="min-height:80px" placeholder="详细记录">${editing ? escapeHtml(editing.content) : ''}</textarea></div>
      <div class="field"><label class="field-label">日期</label>
        <input class="input" id="o_date" type="date" value="${editing ? new Date(editing.date).toISOString().slice(0,10) : new Date().toISOString().slice(0,10)}"></div>`,
    foot: `<button class="btn" id="o_cancel">取消</button><button class="btn btn-primary" id="o_save">${editing ? '保存' : '添加'}</button>`
  });
  document.getElementById('o_cancel').onclick = closeModal;
  document.getElementById('o_save').onclick = () => {
    const title = document.getElementById('o_title').value.trim();
    if (!title) { toast('请填写标题'); return; }
    const item = {
      category: document.getElementById('o_category').value,
      title,
      content: document.getElementById('o_content').value.trim(),
      date: new Date(document.getElementById('o_date').value).getTime(),
    };
    if (editing) {
      const data = loadOther();
      const idx = data.findIndex(o => o.id === editId);
      data[idx] = { ...editing, ...item };
      saveOther(data);
    } else {
      saveOther([...loadOther(), { id: Storage.uid(), ...item, createdAt: Date.now() }]);
    }
    closeModal();
    toast(editing ? '已更新' : '已添加');
    renderBabyProfile(container);
  };
}

// —— 每日一拍（保留原逻辑） ——
function renderPhotoGrid(container) {
  const photos = loadPhotos().sort((a, b) => b.createdAt - a.createdAt);
  const el = container.querySelector('#photoGrid');
  if (photos.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">\uD83D\uDCF7</div><div class="empty-title">还没有照片</div><div class="empty-desc">点击上方按钮，上传 Biubiu 的照片</div></div>`;
    return;
  }
  el.innerHTML = `<div class="photo-wall">` + photos.map(p => `
    <div class="photo-item" data-id="${p.id}">
      <img src="${p.image}" alt="${escapeHtml(p.note || 'Biubiu')}" loading="lazy">
      <div class="photo-overlay">
        ${p.note ? `<div class="photo-note">${escapeHtml(p.note)}</div>` : ''}
        <div class="photo-date">${p.date}</div>
      </div>
      <button class="photo-del" data-photo-del="${p.id}">${Icons.trash}</button>
    </div>
  `).join('') + `</div>`;

  el.querySelectorAll('[data-photo-del]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (await confirmDialog({ title: '删除照片', message: '确定删除这张照片吗？', confirmText: '删除', danger: true })) {
        savePhotos(loadPhotos().filter(p => p.id !== btn.dataset.photoDel));
        toast('已删除');
        rerender(container);
      }
    };
  });
}

function rerender(container) {
  const photos = loadPhotos().sort((a, b) => b.createdAt - a.createdAt);
  const today = todayKey();
  const hasToday = photos.some(p => p.date === today);
  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">每日一拍</div>
      <div class="page-desc">记录 Biubiu 每天的可爱瞬间 \uD83D\uDC31</div>
    </div>
    <div class="card card-pad mb-16" style="text-align:center">
      <div style="font-size:32px;margin-bottom:8px">\uD83D\uDCF7</div>
      <div style="font-size:14px;font-weight:500;color:var(--text-title);margin-bottom:6px">
        ${hasToday ? '今天已经拍过啦！' : '今天给 Biubiu 拍照了吗？'}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">已累计 ${photos.length} 张照片</div>
      <button class="btn btn-primary" id="uploadPhotoBtn">${Icons.camera} ${hasToday ? '再拍一张' : '上传今日照片'}</button>
    </div>
    <div class="section-title">照片墙 <span class="cat-count">${photos.length}</span></div>
    <div id="photoGrid"></div>
  `;
  renderPhotoGrid(container);
  container.querySelector('#uploadPhotoBtn').onclick = () => openUploadModal(container);
}

function openUploadModal(container) {
  openModal({
    title: '上传 Biubiu 照片',
    body: `
      <div class="field">
        <label class="field-label">选择照片 <span class="req">*</span></label>
        <input type="file" id="photoFile" accept="image/*" style="width:100%;font-size:13px">
      </div>
      <div class="field">
        <label class="field-label">备注（可选）</label>
        <input class="input" id="photoNote" placeholder="如：Biubiu 在晒太阳">
      </div>`,
    foot: `<button class="btn" id="photoCancel">取消</button><button class="btn btn-primary" id="photoSave">上传</button>`
  });
  document.getElementById('photoCancel').onclick = closeModal;
  document.getElementById('photoSave').onclick = async () => {
    const file = document.getElementById('photoFile').files[0];
    if (!file) { toast('请选择照片'); return; }
    if (file.size > 10 * 1024 * 1024) { toast('照片太大，请选择 10MB 以下的图片'); return; }
    try {
      const image = await storeImage(await compressImage(file));
      const note = document.getElementById('photoNote').value.trim();
      savePhotos([...loadPhotos(), {
        id: Storage.uid(),
        image, note,
        date: todayKey(),
        createdAt: Date.now(),
      }]);
      closeModal();
      toast('上传成功 \uD83D\uDC31');
      rerender(container);
    } catch (err) {
      toast('图片处理失败，请重试');
    }
  };
}
