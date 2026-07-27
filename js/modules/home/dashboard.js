// dashboard.js — 首页仪表盘：问候 + 好句 + 双列照片 + 统计 + 精简体重 + 打卡 + 任务列表(tab切换)
import { Storage } from '../../storage.js';
import { openModal, closeModal, toast, todayKey, dateKey, escapeHtml, confirmDialog } from '../../ui.js';
import { Icons } from '../../registry.js';
import { openSyncSettings, loadCloudConfig } from '../../cloud-sync.js';

// 好句库：每条带来源（书名 + 作者）
const QUOTES = [
  { text: '种一棵树最好的时间是十年前，其次是现在。', source: '《说苑》', author: '刘向' },
  { text: '每一个不曾起舞的日子，都是对生命的辜负。', source: '《查拉图斯特拉如是说》', author: '尼采' },
  { text: '你现在的努力，是为了以后的从容。', source: '《人生海海》', author: '麦家' },
  { text: '慢慢来，比较快。', source: '《人间值得》', author: '中村恒子' },
  { text: '不积跬步，无以至千里。', source: '《荀子·劝学》', author: '荀子' },
  { text: '行动是治愈焦虑的良药。', source: '《被讨厌的勇气》', author: '岸见一郎' },
  { text: '把简单的事情做到极致，就是不简单。', source: '《匠人精神》', author: '秋山利辉' },
  { text: '星光不问赶路人，时光不负有心人。', source: '《一个人的朝圣》', author: '蕾秋·乔伊斯' },
  { text: '所有的闪闪发光，都是在暗处默默打磨的结果。', source: '《活着》', author: '余华' },
  { text: '与其等待机会，不如创造机会。', source: '《穷查理宝典》', author: '查理·芒格' },
  { text: '你只管努力，剩下的交给时间。', source: '《平凡的世界》', author: '路遥' },
  { text: '保持热爱，奔赴山海。', source: '《山月记》', author: '中岛敦' },
  { text: '路虽远，行则将至；事虽难，做则必成。', source: '《荀子·修身》', author: '荀子' },
  { text: '自律给我自由。', source: '《少有人走的路》', author: '斯科特·派克' },
  { text: '生活不可能像你想象得那么好，但也不会像你想象得那么糟。', source: '《人生》', author: '路遥' },
];

const CHECKIN_ITEMS = [
  { id: 'exercise', name: '运动', icon: '\uD83C\uDFC3', inputLabel: '运动时长', inputPlaceholder: '如 30min' },
  { id: 'reading', name: '读书', icon: '\uD83D\uDCD6', inputLabel: '阅读量', inputPlaceholder: '如 20页' },
  { id: 'water', name: '喝水', icon: '\uD83D\uDCA7', inputLabel: '喝水杯数', inputPlaceholder: '如 6杯' },
  { id: 'sleep', name: '早睡', icon: '\uD83C\uDF19', inputLabel: '入睡时间', inputPlaceholder: '如 23:00' },
];

const TASK_KEY = 'daily_tasks';
const WEIGHT_KEY = 'weight_records';
const CHECKIN_KEY = 'checkin_records';
const WEIGHT_TARGET_KEY = 'weight_target';
const QUOTE_KEY = 'daily_quote';

// 当前激活的任务tab
let activeTaskTab = 'daily';

// 每日好句：按日期固定，同一天不变化
function getDailyQuote() {
  const cached = Storage.get(QUOTE_KEY, null);
  const tk = todayKey();
  if (cached && cached.date === tk) {
    return cached.quote;
  }
  const soulQuotes = Storage.get('soul_massage_quotes', []);
  const soulWithSource = soulQuotes.filter(q => q.source || q.author);
  if (soulWithSource.length > 0) {
    const idx = hashDate(tk) % soulWithSource.length;
    const q = soulWithSource[idx];
    const quote = { text: q.text, source: q.source || '收藏', author: q.author || '' };
    Storage.set(QUOTE_KEY, { date: tk, quote });
    return quote;
  }
  const idx = hashDate(tk) % QUOTES.length;
  const quote = QUOTES[idx];
  Storage.set(QUOTE_KEY, { date: tk, quote });
  return quote;
}

function hashDate(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getWeightTarget() {
  return Storage.get(WEIGHT_TARGET_KEY, 104);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  if (h < 22) return '晚上好';
  return '夜深了';
}

function getTasks() {
  const all = Storage.get(TASK_KEY, {});
  const tk = todayKey();
  return all[tk] || [];
}

function saveTasks(tasks) {
  const all = Storage.get(TASK_KEY, {});
  all[todayKey()] = tasks;
  Storage.set(TASK_KEY, all);
}

function getWeights() {
  return Storage.get(WEIGHT_KEY, []);
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

function getCheckins() {
  const all = Storage.get(CHECKIN_KEY, {});
  return all[todayKey()] || {};
}

function saveCheckin(itemId, detail) {
  const all = Storage.get(CHECKIN_KEY, {});
  const tk = todayKey();
  if (!all[tk]) all[tk] = {};
  all[tk][itemId] = { detail, time: Date.now() };
  Storage.set(CHECKIN_KEY, all);
}

function removeCheckin(itemId) {
  const all = Storage.get(CHECKIN_KEY, {});
  const tk = todayKey();
  if (all[tk]) {
    delete all[tk][itemId];
    Storage.set(CHECKIN_KEY, all);
  }
}

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

function getCheckinStreak() {
  const all = Storage.get(CHECKIN_KEY, {});
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dk = dateKey(d);
    const dayCheckins = all[dk] || {};
    const allDone = CHECKIN_ITEMS.every(item => dayCheckins[item.id]);
    if (allDone) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

function getTaskStats() {
  const tasks = getTasks();
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const rate = total > 0 ? Math.round(done / total * 100) : 0;
  return { done, total, pending: total - done, rate };
}

// ====== 自动拉取任务（分日常/工作/学习三类）======
function getAutoTasks() {
  const tasks = [];
  const tk = todayKey();

  // 日常类
  const exerciseData = Storage.get('exercise_records', []);
  const todayExercise = exerciseData.find(r => r.date === tk);
  if (!todayExercise) {
    tasks.push({ id: 'auto_exercise', text: '今日运动打卡', source: '运动打卡', auto: true, category: 'daily' });
  }
  const moodData = Storage.get('mood_records', []);
  const todayMood = moodData.find(r => r.date === tk);
  if (!todayMood) {
    tasks.push({ id: 'auto_mood', text: '记录今日心情', source: '心情日记', auto: true, category: 'daily' });
  }
  const biubiuPhotos = Storage.get('biubiu_daily_photos', []);
  const todayPhoto = biubiuPhotos.find(p => p.date === tk);
  if (!todayPhoto) {
    tasks.push({ id: 'auto_biubiu', text: '给 Biubiu 拍今日照片', source: 'Biubiu大王', auto: true, category: 'daily' });
  }

  // 学习类
  const tpData = Storage.get('testpoints', { requirement: '', items: [] });
  if (tpData.requirement) {
    tasks.push({ id: 'auto_tp', text: `完善测试点：${tpData.requirement.slice(0, 20)}${tpData.requirement.length > 20 ? '...' : ''}`, source: '测试点生成', auto: true, category: 'study' });
  }
  const bugData = Storage.get('bugs', []);
  const openBugs = bugData.filter(b => b.status === 'open' || b.status === 'fixing');
  if (openBugs.length > 0) {
    tasks.push({ id: 'auto_bug', text: `处理 ${openBugs.length} 个未解决 Bug`, source: 'Bug 总结', auto: true, category: 'study' });
  }
  const skillData = Storage.get('skilllearning', { plans: [], notes: [], resources: [] });
  if (skillData.plans && skillData.plans.length > 0) {
    skillData.plans.forEach(p => {
      if (p.progress < 100) {
        tasks.push({ id: `auto_plan_${p.id}`, text: `学习：${p.title} (${p.progress}%)`, source: '测试技能学习', auto: true, category: 'study' });
      }
    });
  }
  const tarotData = Storage.get('learning_tarot', []);
  if (tarotData.length < 78) {
    tasks.push({ id: 'auto_tarot', text: `塔罗牌学习（已记录 ${tarotData.length}/78 张）`, source: '塔罗牌学习', auto: true, category: 'study' });
  }
  const englishData = Storage.get('learning_english', []);
  if (englishData.length === 0) {
    tasks.push({ id: 'auto_english', text: '今日英语学习', source: '英语学习', auto: true, category: 'study' });
  }

  return tasks;
}

// ====== 双列照片：biu娃美照 + 玲子碎碎念 ======
function getRecentBiubiuPhoto() {
  const all = Storage.get('biubiu_daily_photos', []);
  if (all.length === 0) return null;
  return all.sort((a, b) => b.createdAt - a.createdAt)[0];
}

function getRecentSnapshot() {
  const all = Storage.get('mood_snapshots', []);
  if (all.length === 0) return null;
  return all.sort((a, b) => b.createdAt - a.createdAt)[0];
}

function renderDualPhotos() {
  const biubiuPhoto = getRecentBiubiuPhoto();
  const snapshot = getRecentSnapshot();

  const biubiuHtml = biubiuPhoto
    ? `<div class="dual-photo-img" style="background-image:url('${biubiuPhoto.image}')"></div>
       <div class="dual-photo-overlay">
         <span class="dual-photo-note">${escapeHtml(biubiuPhoto.note || 'Biubiu 的日常')}</span>
         <span class="dual-photo-date">${biubiuPhoto.date}</span>
       </div>`
    : `<div class="dual-photo-empty">
         <div style="font-size:28px">\uD83D\uDC31</div>
         <div>还没有照片</div>
         <div style="font-size:10px">去 Biubiu大王 · 每日一拍</div>
       </div>`;

  const snapHtml = snapshot
    ? `<div class="dual-photo-img" style="background-image:url('${snapshot.image}')"></div>
       <div class="dual-photo-overlay">
         <span class="dual-photo-note">${escapeHtml(snapshot.note || '生活碎片')}</span>
         <span class="dual-photo-date">${snapshot.date}</span>
       </div>`
    : `<div class="dual-photo-empty">
         <div style="font-size:28px">\uD83D\uDCF7</div>
         <div>还没有随拍</div>
         <div style="font-size:10px">去 心情日记 · 每日随拍</div>
       </div>`;

  return `<div class="dual-photo-grid">
    <div class="dual-photo-col">
      <div class="dual-photo-label">\uD83D\uDC31 biu娃美照</div>
      <div class="dual-photo-frame">${biubiuHtml}</div>
    </div>
    <div class="dual-photo-col">
      <div class="dual-photo-label">\uD83D\uDCF7 玲子碎碎念</div>
      <div class="dual-photo-frame">${snapHtml}</div>
    </div>
  </div>`;
}

// ====== 任务tab渲染 ======
function renderTaskTabContent(tasks, cat) {
  const sectionTasks = tasks.filter(t => (t.category || 'daily') === cat);
  if (sectionTasks.length === 0) {
    const emptyText = cat === 'work' ? '点击 + 添加今日工作任务' : '暂无任务';
    return `<div class="task-cat-block">
      <div class="task-cat-head">
        <span class="task-cat-count">0</span>
        <button class="task-cat-add" data-add-cat="${cat}">+</button>
      </div>
      <div class="task-cat-empty">${emptyText}</div>
    </div>`;
  }
  const doneCount = sectionTasks.filter(t => t.done).length;
  return `<div class="task-cat-block">
    <div class="task-cat-head">
      <span class="task-cat-count">${doneCount}/${sectionTasks.length}</span>
      <button class="task-cat-add" data-add-cat="${cat}">+</button>
    </div>
    <div class="task-cat-list">
      ${sectionTasks.map(t => `
        <div class="task-item ${t.done ? 'completed' : ''}" data-task-id="${t.id}">
          <div class="task-check ${t.done ? 'done' : ''}" data-task-toggle="${t.id}"></div>
          <div class="task-body">
            <div class="task-text">${escapeHtml(t.text)}</div>
            <div class="task-meta ${t.auto ? 'auto' : 'manual'}">${t.auto ? '\u81EA\u52A8\u62C9\u53D6 \u00B7 ' + escapeHtml(t.source) : '\u624B\u52A8\u6DFB\u52A0'}</div>
          </div>
          ${!t.auto ? `<div class="task-actions">
            <button class="task-action-btn task-edit" data-task-edit="${t.id}">${Icons.edit}</button>
            <button class="task-action-btn task-del" data-task-del="${t.id}">${Icons.trash}</button>
          </div>` : `<div class="task-actions">
            <button class="task-action-btn task-del" data-task-del="${t.id}">${Icons.trash}</button>
          </div>`}
        </div>
      `).join('')}
    </div>
  </div>`;
}

export function initDashboard(container) {
  const quote = getDailyQuote();
  const greeting = getGreeting();
  const stats = getTaskStats();
  const weights = getLast7DaysWeights();
  const todayWeight = weights[6].weight;
  const checkins = getCheckins();
  const streak = getCheckinStreak();
  const tasks = getTasks();
  const autoTasks = getAutoTasks();

  // 合并自动任务和手动任务
  const manualIds = new Set(tasks.map(t => t.id));
  const ignored = Storage.get('ignored_auto_tasks', []);
  const mergedTasks = [
    ...tasks,
    ...autoTasks.filter(at => !manualIds.has(at.id) && !ignored.includes(at.id))
  ];

  const weightTarget = Number(getWeightTarget()) || 104;
  const tw = Number(todayWeight);
  const diffToTarget = (!isNaN(tw) && tw > 0) ? (tw - weightTarget) : null;

  const now = new Date();
  const dateStr = `${now.getMonth() + 1}\u6708${now.getDate()}\u65E5 \u00B7 \u5468${'\u65E5\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D'[now.getDay()]}`;

  container.innerHTML = `
    <div class="greeting-card">
      <div class="greeting-top">
        <div>
          <div class="greeting-name">${greeting}\uFF0C\u6817\u5706\u5706</div>
          <div class="greeting-date">${dateStr} \u00B7 \u4ECA\u65E5\u6709 ${stats.total} \u9879\u4EFB\u52A1</div>
        </div>
        <div class="greeting-sync" id="dashSyncBtn" style="cursor:pointer">${loadCloudConfig() ? "\u5DF2\u914D\u7F6E" : "\u4E91\u540C\u6B65"}</div>
      </div>
      <div class="greeting-quote" id="quoteBox">
        <div class="greeting-quote-text">\u201C${escapeHtml(quote.text)}\u201D</div>
        <div class="greeting-quote-source">\u2014\u2014 ${escapeHtml(quote.source)}${quote.author ? ' \u00B7 ' + escapeHtml(quote.author) : ''}</div>
      </div>
    </div>

    ${renderDualPhotos()}

    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-num">${stats.pending}</div>
        <div class="stat-label">\u5F85\u5B8C\u6210</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">${stats.rate}%</div>
        <div class="stat-label">\u5B8C\u6210\u7387</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">${streak}</div>
        <div class="stat-label">\u8FDE\u7EED\u5929\u6570</div>
      </div>
    </div>

    <div class="weight-card weight-compact">
      <div class="weight-head">
        <div class="weight-head-left">
          <span class="weight-head-icon">\u2696\uFE0F</span>
          <span class="weight-head-title">\u6BCF\u65E5\u4F53\u91CD</span>
        </div>
        <span class="weight-head-target">\u76EE\u6807 ${weightTarget} \u65A4</span>
      </div>
      <div class="weight-compact-row">
        <div class="weight-compact-display">
          <span class="weight-num">${todayWeight || '--'}</span>
          <span class="weight-unit">\u65A4</span>
          ${diffToTarget !== null ? `<span class="weight-compact-diff ${diffToTarget <= 0 ? 'down' : 'up'}">${diffToTarget > 0 ? '\u8FD8\u5DEE ' + diffToTarget.toFixed(1) + ' \u65A4' : '\u5DF2\u8FBE\u6807 \uD83C\uDF89'}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-primary" id="weightEditBtn">\u4FEE\u6539</button>
      </div>
    </div>

    <div class="checkin-card">
      <div class="checkin-head">
        <div class="checkin-head-left">
          <span class="checkin-head-icon">\u2705</span>
          <span class="checkin-head-title">\u6BCF\u65E5\u6253\u5361</span>
        </div>
        <span class="checkin-head-count">${CHECKIN_ITEMS.filter(i => checkins[i.id]).length}/${CHECKIN_ITEMS.length}</span>
      </div>
      <div class="checkin-row">
        ${CHECKIN_ITEMS.map(item => {
          const ci = checkins[item.id];
          const done = !!ci;
          return `<div class="checkin-tile ${done ? 'done' : 'undone'}" data-checkin="${item.id}">
            <div class="checkin-tile-icon">${done ? '\u2714' : item.icon}</div>
            <div class="checkin-tile-name">${item.name}</div>
            ${done ? `<div class="checkin-tile-detail">${escapeHtml(ci.detail)}</div>` : ''}
            <div class="checkin-tile-status">${done ? '' : '\u70B9\u51FB\u6253\u5361'}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="checkin-footer">
        <div class="checkin-dots">
          ${Array.from({length: 7}, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (6 - i));
            const dk = dateKey(d);
            const all = Storage.get(CHECKIN_KEY, {});
            const dayCi = all[dk] || {};
            const allDone = CHECKIN_ITEMS.every(item => dayCi[item.id]);
            return `<div class="checkin-dot ${allDone ? '' : 'empty'}" title="${dk}"></div>`;
          }).join('')}
        </div>
        <span class="checkin-streak">\u8FDE\u7EED ${streak} \u5929\u5168\u52E4</span>
      </div>
    </div>

    <div class="task-section-head">
      <span class="task-section-title">\u6BCF\u65E5\u8BA1\u5212</span>
    </div>

    <div class="task-tabs">
      <button class="task-tab ${activeTaskTab === 'daily' ? 'active' : ''}" data-tab="daily">\uD83C\uDFE0 \u65E5\u5E38</button>
      <button class="task-tab ${activeTaskTab === 'work' ? 'active' : ''}" data-tab="work">\uD83D\uDCBC \u5DE5\u4F5C</button>
      <button class="task-tab ${activeTaskTab === 'study' ? 'active' : ''}" data-tab="study">\uD83D\uDCDA \u5B66\u4E60</button>
    </div>
    <div id="taskTabContent">
      ${renderTaskTabContent(mergedTasks, activeTaskTab)}
    </div>
  `;

  // 体重修改按钮 → 跳转 body-care
  container.querySelector('#weightEditBtn').onclick = () => {
    const navBtn = document.querySelector('[data-module="body-care"]');
    if (navBtn) navBtn.click();
  };

  // 同步按钮
  container.querySelector('#dashSyncBtn').onclick = () => openSyncSettings();

  // 打卡
  container.querySelectorAll('[data-checkin]').forEach(el => {
    el.onclick = () => {
      const itemId = el.dataset.checkin;
      const item = CHECKIN_ITEMS.find(i => i.id === itemId);
      const checkins = getCheckins();
      if (checkins[itemId]) {
        removeCheckin(itemId);
        toast(`\u5DF2\u53D6\u6D88${item.name}\u6253\u5361`);
        initDashboard(container);
      } else {
        openCheckinModal(item, container);
      }
    };
  });

  // 任务tab切换
  container.querySelectorAll('[data-tab]').forEach(el => {
    el.onclick = () => {
      activeTaskTab = el.dataset.tab;
      initDashboard(container);
    };
  });

  // 任务勾选
  container.querySelectorAll('[data-task-toggle]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.taskToggle;
      const tasks = getTasks();
      let t = tasks.find(x => x.id === id);
      if (t) {
        t.done = !t.done;
        saveTasks(tasks);
      } else {
        const autoTask = autoTasks.find(x => x.id === id);
        if (autoTask) {
          autoTask.done = true;
          tasks.push(autoTask);
          saveTasks(tasks);
        }
      }
      initDashboard(container);
    };
  });

  // 任务编辑
  container.querySelectorAll('[data-task-edit]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.taskEdit;
      const tasks = getTasks();
      const t = tasks.find(x => x.id === id);
      if (t) openEditTaskModal(t, container);
    };
  });

  // 任务删除
  container.querySelectorAll('[data-task-del]').forEach(el => {
    el.onclick = async () => {
      const id = el.dataset.taskDel;
      let tasks = getTasks();
      const t = tasks.find(x => x.id === id);
      if (t) {
        tasks = tasks.filter(x => x.id !== id);
        saveTasks(tasks);
      } else {
        const ignored = Storage.get('ignored_auto_tasks', []);
        if (!ignored.includes(id)) ignored.push(id);
        Storage.set('ignored_auto_tasks', ignored);
      }
      toast('\u5DF2\u5220\u9664');
      initDashboard(container);
    };
  });

  // 分区添加任务
  container.querySelectorAll('[data-add-cat]').forEach(el => {
    el.onclick = () => {
      const cat = el.dataset.addCat;
      openAddTaskModal(container, cat);
    };
  });
}

function openCheckinModal(item, container) {
  openModal({
    title: `${item.name}\u6253\u5361`,
    body: `
      <div class="field">
        <label class="field-label">${item.inputLabel}</label>
        <input class="input" id="checkinDetail" placeholder="${item.inputPlaceholder}" autofocus>
      </div>`,
    foot: `<button class="btn" id="checkinCancel">\u53D6\u6D88</button><button class="btn btn-primary" id="checkinSave">\u6253\u5361</button>`
  });
  document.getElementById('checkinCancel').onclick = closeModal;
  document.getElementById('checkinSave').onclick = () => {
    const detail = document.getElementById('checkinDetail').value.trim() || '\u5DF2\u5B8C\u6210';
    saveCheckin(item.id, detail);
    closeModal();
    toast(`${item.name}\u6253\u5361\u6210\u529F`);
    initDashboard(container);
  };
}

function openAddTaskModal(container, category) {
  const catLabel = category === 'daily' ? '\u65E5\u5E38' : category === 'work' ? '\u5DE5\u4F5C' : '\u5B66\u4E60';
  openModal({
    title: `\u6DFB\u52A0${catLabel}\u4EFB\u52A1`,
    body: `
      <div class="field">
        <label class="field-label">\u4EFB\u52A1\u5185\u5BB9</label>
        <textarea class="textarea" id="newTaskText" placeholder="\u4ECA\u5929\u8981\u505A\u4EC0\u4E48\uFF1F" autofocus></textarea>
      </div>`,
    foot: `<button class="btn" id="taskCancel">\u53D6\u6D88</button><button class="btn btn-primary" id="taskSave">\u6DFB\u52A0</button>`
  });
  document.getElementById('taskCancel').onclick = closeModal;
  document.getElementById('taskSave').onclick = () => {
    const text = document.getElementById('newTaskText').value.trim();
    if (!text) { toast('\u8BF7\u8F93\u5165\u4EFB\u52A1\u5185\u5BB9'); return; }
    const tasks = getTasks();
    tasks.push({ id: Storage.uid(), text, done: false, manual: true, category });
    saveTasks(tasks);
    closeModal();
    toast('\u4EFB\u52A1\u5DF2\u6DFB\u52A0');
    activeTaskTab = category;
    initDashboard(container);
  };
}

function openEditTaskModal(task, container) {
  openModal({
    title: '\u7F16\u8F91\u4EFB\u52A1',
    body: `
      <div class="field">
        <label class="field-label">\u4EFB\u52A1\u5185\u5BB9</label>
        <textarea class="textarea" id="editTaskText">${escapeHtml(task.text)}</textarea>
      </div>`,
    foot: `<button class="btn" id="editCancel">\u53D6\u6D88</button><button class="btn btn-primary" id="editSave">\u4FDD\u5B58</button>`
  });
  document.getElementById('editCancel').onclick = closeModal;
  document.getElementById('editSave').onclick = () => {
    const text = document.getElementById('editTaskText').value.trim();
    if (!text) { toast('\u8BF7\u8F93\u5165\u4EFB\u52A1\u5185\u5BB9'); return; }
    const tasks = getTasks();
    const t = tasks.find(x => x.id === task.id);
    if (t) { t.text = text; saveTasks(tasks); }
    closeModal();
    toast('\u5DF2\u66F4\u65B0');
    initDashboard(container);
  };
}
