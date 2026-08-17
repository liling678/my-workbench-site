// dashboard.js — 首页仪表盘：问候 + 好句 + 双列照片 + 统计 + 精简体重 + 打卡 + 任务列表(tab切换)
import { Storage } from '../../storage.js';
import { openModal, closeModal, toast, todayKey, dateKey, escapeHtml, confirmDialog } from '../../ui.js';
import { Icons } from '../../registry.js';
import { openSyncSettings, loadCloudConfig } from '../../cloud-sync.js';
import { renderWeeklyCheckin, getTodayCheckinSummary } from '../checkin/monthly-checkin.js';

// 好句库：每条带来源（书名 + 作者）
const QUOTES = [
  { text: '种一棵树最好的时间是十年前，其次是现在。', source: '《说苑》', author: '刘向', en: 'The best time to plant a tree was ten years ago; the second best time is now.' },
  { text: '每一个不曾起舞的日子，都是对生命的辜负。', source: '《查拉图斯特拉如是说》', author: '尼采', en: 'Every day that we do not dance is a day we betray life.' },
  { text: '你现在的努力，是为了以后的从容。', source: '《人生海海》', author: '麦家', en: 'The effort you make today is for the ease you will enjoy tomorrow.' },
  { text: '慢慢来，比较快。', source: '《人间值得》', author: '中村恒子', en: 'Slow down — going gently is the faster way.' },
  { text: '不积跬步，无以至千里。', source: '《荀子·劝学》', author: '荀子', en: 'A journey of a thousand miles begins with a single step.' },
  { text: '行动是治愈焦虑的良药。', source: '《被讨厌的勇气》', author: '岸见一郎', en: 'Action is the best medicine for anxiety.' },
  { text: '把简单的事情做到极致，就是不简单。', source: '《匠人精神》', author: '秋山利辉', en: 'To do simple things to perfection is itself extraordinary.' },
  { text: '星光不问赶路人，时光不负有心人。', source: '《一个人的朝圣》', author: '蕾秋·乔伊斯', en: 'The stars do not ask the traveler where he goes, yet time rewards the devoted heart.' },
  { text: '所有的闪闪发光，都是在暗处默默打磨的结果。', source: '《活着》', author: '余华', en: 'Every sparkle you see was once quietly polished in the dark.' },
  { text: '与其等待机会，不如创造机会。', source: '《穷查理宝典》', author: '查理·芒格', en: 'Rather than wait for opportunity, create it.' },
  { text: '你只管努力，剩下的交给时间。', source: '《平凡的世界》', author: '路遥', en: 'Just do your best, and leave the rest to time.' },
  { text: '保持热爱，奔赴山海。', source: '《山月记》', author: '中岛敦', en: 'Hold on to what you love, and journey to the mountains and seas.' },
  { text: '路虽远，行则将至；事虽难，做则必成。', source: '《荀子·修身》', author: '荀子', en: 'Though the road is long, walking brings you there; though the task is hard, doing makes it done.' },
  { text: '自律给我自由。', source: '《少有人走的路》', author: '斯科特·派克', en: 'Self-discipline is what sets me free.' },
  { text: '生活不可能像你想象得那么好，但也不会像你想象得那么糟。', source: '《人生》', author: '路遥', en: 'Life is never as good as you hope, nor as bad as you fear.' },
];

const TASK_KEY = 'daily_tasks';
const WEIGHT_KEY = 'weight_records';
const WEIGHT_TARGET_KEY = 'weight_target';
const QUOTE_KEY = 'daily_quote';
const COUNTDOWN_KEY = 'countdown_events';

// 当前激活的任务tab
let activeTaskTab = 'daily';
// 当前查看的日期（null = 今天）。用于历史回看，让每日计划有「记忆」可翻看
let viewDateKey = null;

// 在给定日期 key 上偏移 n 天，返回新的 YYYY-MM-DD
function shiftDateKey(key, delta) {
  const d = new Date(key + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}

// 最多可前瞻的天数（用于限制「后一天」导航，避免无限往后翻）
const MAX_FUTURE_DAYS = 30;
function maxFutureKey() {
  const d = new Date();
  d.setDate(d.getDate() + MAX_FUTURE_DAYS);
  return dateKey(d);
}

// 把 YYYY-MM-DD 格式化为「X月X日」
function fmtDateShort(key) {
  const d = new Date(key + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// 每日好句：按日期固定，同一天不变化
function getDailyQuote() {
  const cached = Storage.get(QUOTE_KEY, null);
  const tk = todayKey();
  if (cached && cached.date === tk && cached.quote && cached.quote.en) {
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

function loadCountdowns() { return Storage.get(COUNTDOWN_KEY, []); }
function saveCountdowns(list) { Storage.set(COUNTDOWN_KEY, list); }

// 返回下一个即将到来的目标（按日期升序，剔除已过期）
function getNextCountdown() {
  const list = getUpcomingCountdowns();
  return list[0] || null;
}

// 返回所有未过期（含今天）的目标，按日期升序
function getUpcomingCountdowns() {
  const today = todayKey();
  return loadCountdowns()
    .filter(e => e.date >= today)
    .sort((a, b) => a.date < b.date ? -1 : 1);
}
function daysBetween(fromKey, toDateStr) {
  const a = new Date(fromKey + 'T00:00:00');
  const b = new Date(toDateStr + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function renderCountdownBody() {
  const list = getUpcomingCountdowns();
  if (!list || list.length === 0) {
    return `<div class="countdown-empty">还没有目标，点右上角「管理」添加<br>例如：软考 / 雅思 / 生日…</div>`;
  }
  const maxShow = 3;
  const shown = list.slice(0, maxShow);
  const items = shown.map(e => {
    const d = daysBetween(todayKey(), e.date);
    return `<div class="countdown-item">
      <div class="countdown-item-name">${escapeHtml(e.name)}</div>
      <div class="countdown-item-days"><span class="c-num">${d}</span><span class="c-unit">\u5929</span></div>
      <div class="countdown-item-date">${e.date}</div>
    </div>`;
  }).join('');
  const more = list.length > maxShow ? `<div class="countdown-more">还有 ${list.length - maxShow} 个目标，点右上角「管理」查看</div>` : '';
  return `<div class="countdown-list cols-${shown.length}">${items}${more}</div>`;
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

function getTasks(dk) {
  const all = Storage.get(TASK_KEY, {});
  const key = dk || todayKey();
  return all[key] || [];
}

function saveTasks(tasks, dk) {
  const all = Storage.get(TASK_KEY, {});
  all[dk || todayKey()] = tasks;
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

function getTaskStats(dk) {
  const tasks = getTasks(dk);
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const rate = total > 0 ? Math.round(done / total * 100) : 0;
  return { done, total, pending: total - done, rate };
}

// ====== 自动拉取任务（分日常/工作/学习三类）======
// dk：查看的日期（默认今天）。回看历史时用该日的数据判断自动任务是否已完成
function getAutoTasks(dk) {
  const tasks = [];
  const tk = dk || todayKey();

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
  // 当前查看的日期：viewDateKey 非空则为非今日，否则今天
  const todayK = todayKey();
  const viewKey = viewDateKey || todayK;
  const isToday = viewKey === todayK;
  const isPast = !isToday && viewKey < todayK;    // 真正的过去：只读，不可编辑
  const isFuture = !isToday && viewKey > todayK;  // 未来的前瞻计划：允许提前编辑
  // 兼容旧语义：仅「过去的日期」视为历史（锁定编辑），未来日期放开编辑
  const isHistory = isPast;
  const stats = getTaskStats(viewKey);
  const weights = getLast7DaysWeights();
  const allWeights = getWeights();
  const viewWeightRec = allWeights.find(r => r.date === viewKey);
  const todayWeight = viewWeightRec ? viewWeightRec.weight : null;
  const todayCheckin = getTodayCheckinSummary();
  const tasks = getTasks(viewKey);
  // 未来日期是「前瞻计划」，自动拉取的任务（基于当天数据推断）没有意义，只显示手动计划的任务
  const autoTasks = isFuture ? [] : getAutoTasks(viewKey);

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
  const viewDate = new Date(viewKey + 'T00:00:00');
  const dateStr = `${viewDate.getMonth() + 1}\u6708${viewDate.getDate()}\u65E5 \u00B7 \u5468${'\u65E5\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D'[viewDate.getDay()]}`;
  // 任务区标题：今天=「一些待办」；过去=当日计划（历史）；未来=当日计划（前瞻）
  const taskTitle = isToday
    ? '\u4E00\u4E9B\u5F85\u529E'
    : (viewDate.getMonth() + 1) + '\u6708' + viewDate.getDate() + '\u65E5 \u8BA1\u5212' + (isFuture ? '\uff08\u524D\u77BB\uff09' : '\uff08\u5386\u53F2\uff09');

  container.innerHTML = `
    <div class="greeting-card">
      <div class="greeting-top">
        <div>
          <div class="greeting-name">${greeting}\uFF0C\u6817\u5706\u5706</div>
          <div class="greeting-date">${dateStr} \u00B7 ${isToday ? '\u4ECA\u65E5' : isFuture ? '\u524D\u77BB\u8BA1\u5212' : '\u5F53\u65E5'}\u6709 ${stats.total} \u9879\u4EFB\u52A1${isPast ? ' \u00B7 \u5386\u53F2\uff08\u53EA\u8BFB\uff09' : ''}</div>
        </div>
        <div class="greeting-sync" id="dashSyncBtn" style="cursor:pointer">${loadCloudConfig() ? "\u5DF2\u914D\u7F6E" : "\u4E91\u540C\u6B65"}</div>
      </div>
      <div class="greeting-quote" id="quoteBox">
        <div class="greeting-quote-text">\u201C${escapeHtml(quote.text)}\u201D</div>
        ${quote.en ? `<div class="greeting-quote-en">${escapeHtml(quote.en)}</div>` : ''}
        <div class="greeting-quote-source">\u2014\u2014 ${escapeHtml(quote.source)}${quote.author ? ' \u00B7 ' + escapeHtml(quote.author) : ''}</div>
      </div>
    </div>

    <div class="countdown-card">
      <div class="countdown-head">
        <div class="countdown-head-left"><span class="countdown-head-icon">\u23F3</span><span class="countdown-head-title">\u76EE\u6807\u5012\u8BA1\u65F6</span></div>
        <span class="countdown-manage" id="cdManageBtn">\u7BA1\u7406</span>
      </div>
      ${renderCountdownBody()}
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
        <div class="stat-num">${todayCheckin.checked}/${todayCheckin.total}</div>
        <div class="stat-label">\u4ECA\u65E5\u6253\u5361</div>
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

    <div class="task-section-head">
      <span class="task-section-title">${taskTitle}</span>
      <div class="date-nav">
        <button class="date-nav-btn" id="datePrev" title="\u524D\u4E00\u5929">\u2039</button>
        <button class="date-nav-btn${isToday ? ' disabled' : ''}" id="dateToday" ${isToday ? 'disabled' : ''}>\u4ECA\u5929</button>
        <button class="date-nav-btn" id="dateNext" title="\u540E\u4E00\u5929\uff08\u6700\u591a\u524D\u77BB${MAX_FUTURE_DAYS}\u5929\uff09" ${viewKey >= maxFutureKey() ? 'disabled' : ''}>\u203A</button>
      </div>
    </div>

    <div class="task-tabs">
      <button class="task-tab ${activeTaskTab === 'daily' ? 'active' : ''}" data-tab="daily">\uD83C\uDFE0 \u65E5\u5E38</button>
      <button class="task-tab ${activeTaskTab === 'work' ? 'active' : ''}" data-tab="work">\uD83D\uDCBC \u5DE5\u4F5C</button>
      <button class="task-tab ${activeTaskTab === 'study' ? 'active' : ''}" data-tab="study">\uD83D\uDCDA \u5B66\u4E60</button>
    </div>
    <div id="taskTabContent">
      ${renderTaskTabContent(mergedTasks, activeTaskTab)}
    </div>

    <div id="homeCheckinHost"></div>
  `;

  // 体重修改按钮 → 跳转 body-care
  container.querySelector('#weightEditBtn').onclick = () => {
    if (isHistory) { toast('\u5386\u53F2\u8BB0\u5F52\u4E0D\u53EF\u7F16\u8F91\uFF0C\u70B9\u300C\u4ECA\u5929\u300D\u56DE\u5230\u5F53\u65E5'); return; }
    const navBtn = document.querySelector('[data-module="body-care"]');
    if (navBtn) navBtn.click();
  };

  // 同步按钮
  container.querySelector('#dashSyncBtn').onclick = () => openSyncSettings();

  // 倒计时管理
  container.querySelector('#cdManageBtn').onclick = () => openCountdownManage(container);

  // 首页「每日打卡」复用月度打卡表的本周打卡表 + 今日记录
  renderWeeklyCheckin(container.querySelector('#homeCheckinHost'));

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
      if (isHistory) { toast('\u5386\u53F2\u8BB0\u5F52\u4E0D\u53EF\u7F16\u8F91\uFF0C\u70B9\u300C\u4ECA\u5929\u300D\u56DE\u5230\u5F53\u65E5'); return; }
      const id = el.dataset.taskToggle;
      const tasks = getTasks(viewKey);
      let t = tasks.find(x => x.id === id);
      if (t) {
        t.done = !t.done;
        saveTasks(tasks, viewKey);
      } else {
        const autoTask = autoTasks.find(x => x.id === id);
        if (autoTask) {
          autoTask.done = true;
          tasks.push(autoTask);
          saveTasks(tasks, viewKey);
        }
      }
      initDashboard(container);
    };
  });

  // 任务编辑
  container.querySelectorAll('[data-task-edit]').forEach(el => {
    el.onclick = () => {
      if (isHistory) { toast('\u5386\u53F2\u8BB0\u5F52\u4E0D\u53EF\u7F16\u8F91\uFF0C\u70B9\u300C\u4ECA\u5929\u300D\u56DE\u5230\u5F53\u65E5'); return; }
      const id = el.dataset.taskEdit;
      const tasks = getTasks(viewKey);
      const t = tasks.find(x => x.id === id);
      if (t) openEditTaskModal(t, container);
    };
  });

  // 任务删除
  container.querySelectorAll('[data-task-del]').forEach(el => {
    el.onclick = async () => {
      if (isHistory) { toast('\u5386\u53F2\u8BB0\u5F52\u4E0D\u53EF\u7F16\u8F91\uFF0C\u70B9\u300C\u4ECA\u5929\u300D\u56DE\u5230\u5F53\u65E5'); return; }
      if (!await confirmDialog({ title: '删除任务', message: '确定删除这个任务吗？', confirmText: '删除', danger: true })) return;
      const id = el.dataset.taskDel;
      let tasks = getTasks(viewKey);
      const t = tasks.find(x => x.id === id);
      if (t) {
        tasks = tasks.filter(x => x.id !== id);
        saveTasks(tasks, viewKey);
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
      if (isHistory) { toast('\u5386\u53F2\u8BB0\u5F52\u4E0D\u53EF\u7F16\u8F91\uFF0C\u70B9\u300C\u4ECA\u5929\u300D\u56DE\u5230\u5F53\u65E5'); return; }
      const cat = el.dataset.addCat;
      openAddTaskModal(container, cat);
    };
  });

  // 日期切换 / 历史回看
  const datePrev = container.querySelector('#datePrev');
  const dateNext = container.querySelector('#dateNext');
  const dateToday = container.querySelector('#dateToday');
  if (datePrev) datePrev.onclick = () => { viewDateKey = shiftDateKey(viewKey, -1); initDashboard(container); };
  if (dateNext && !dateNext.disabled) dateNext.onclick = () => { if (viewKey < maxFutureKey()) { viewDateKey = shiftDateKey(viewKey, 1); initDashboard(container); } };
  if (dateToday && !dateToday.disabled) dateToday.onclick = () => { viewDateKey = null; initDashboard(container); };
}

function openCountdownManage(container) {
  const renderList = () => {
    const list = loadCountdowns().sort((a, b) => a.date < b.date ? -1 : 1);
    const today = todayKey();
    if (list.length === 0) {
      return `<div class="empty"><div class="empty-icon">⏳</div><div class="empty-title">还没有目标</div><div class="empty-desc">添加考试、生日、旅行等，首页会显示最近一个的倒计时</div></div>`;
    }
    return `<div class="list" id="cdList">` + list.map(e => {
      const d = daysBetween(today, e.date);
      const left = d === 0 ? '今天' : d < 0 ? '已过期' : `剩 ${d} 天`;
      return `<div class="list-item" data-id="${e.id}">
        <div class="list-item-head">
          <div style="flex:1;min-width:0">
            <div class="list-item-title">${escapeHtml(e.name)}</div>
            <div class="list-item-body" style="margin-top:4px;color:var(--text-muted)">${e.date} · ${left}</div>
          </div>
          <div class="list-item-actions">
            <button class="icon-btn btn-sm cd-edit" title="编辑">${Icons.edit}</button>
            <button class="icon-btn btn-sm cd-del" title="删除">${Icons.trash}</button>
          </div>
        </div>
      </div>`;
    }).join('') + `</div>`;
  };
  openModal({
    title: '目标倒计时管理',
    body: `
      <div class="field">
        <label class="field-label">目标名称</label>
        <input class="input" id="cdName" placeholder="如：软考 / 雅思 / 生日" autofocus>
      </div>
      <div class="field">
        <label class="field-label">目标日期</label>
        <input class="input" id="cdDate" type="date">
      </div>
      <div class="sync-actions">
        <button class="btn btn-primary" id="cdAddBtn">＋ 添加目标</button>
      </div>
      <div id="cdManageList">${renderList()}</div>
    `,
    foot: `<button class="btn" id="cdClose">关闭</button>`
  });
  document.getElementById('cdClose').onclick = closeModal;
  document.getElementById('cdAddBtn').onclick = () => {
    const name = document.getElementById('cdName').value.trim();
    const date = document.getElementById('cdDate').value;
    if (!name || !date) { toast('请填写名称和日期'); return; }
    const list = loadCountdowns();
    list.push({ id: Storage.uid(), name, date });
    saveCountdowns(list);
    document.getElementById('cdName').value = '';
    document.getElementById('cdDate').value = '';
    document.getElementById('cdManageList').innerHTML = renderList();
    toast('已添加');
    initDashboard(container);
  };
  const bindList = () => {
    document.querySelectorAll('#cdList .list-item').forEach(item => {
      const id = item.dataset.id;
      item.querySelector('.cd-edit').onclick = () => {
        const e = loadCountdowns().find(x => x.id === id);
        if (!e) return;
        document.getElementById('cdName').value = e.name;
        document.getElementById('cdDate').value = e.date;
        const list = loadCountdowns().filter(x => x.id !== id);
        saveCountdowns(list);
        document.getElementById('cdManageList').innerHTML = renderList();
        bindList();
        initDashboard(container);
      };
      item.querySelector('.cd-del').onclick = async () => {
        if (!await confirmDialog({ title: '删除目标', message: '确定删除这个目标吗？', confirmText: '删除', danger: true })) return;
        saveCountdowns(loadCountdowns().filter(x => x.id !== id));
        document.getElementById('cdManageList').innerHTML = renderList();
        bindList();
        initDashboard(container);
        toast('已删除');
      };
    });
  };
  bindList();
}

function openAddTaskModal(container, category) {
  const catLabel = category === 'daily' ? '\u65E5\u5E38' : category === 'work' ? '\u5DE5\u4F5C' : '\u5B66\u4E60';
  const dk = viewDateKey || todayKey();
  const dateHint = dk === todayKey()
    ? ''
    : `<div class="field-hint" style="margin-bottom:10px;color:var(--text-muted);font-size:12px">\u8BE5\u4EFB\u52A1\u5C06\u6DFB\u52A0\u5230 <b>${escapeHtml(fmtDateShort(dk))}</b>\uff08\u524D\u77BB\u8BA1\u5212\uff09</div>`;
  openModal({
    title: `\u6DFB\u52A0${catLabel}\u4EFB\u52A1`,
    body: `
      ${dateHint}
      <div class="field">
        <label class="field-label">\u4EFB\u52A1\u5185\u5BB9</label>
        <textarea class="textarea" id="newTaskText" placeholder="\u8FD9\u5929\u8981\u505A\u4EC0\u4E48\uFF1F" autofocus></textarea>
      </div>`,
    foot: `<button class="btn" id="taskCancel">\u53D6\u6D88</button><button class="btn btn-primary" id="taskSave">\u6DFB\u52A0</button>`
  });
  document.getElementById('taskCancel').onclick = closeModal;
  document.getElementById('taskSave').onclick = () => {
    const text = document.getElementById('newTaskText').value.trim();
    if (!text) { toast('\u8BF7\u8F93\u5165\u4EFB\u52A1\u5185\u5BB9'); return; }
    const tasks = getTasks(dk);
    tasks.push({ id: Storage.uid(), text, done: false, manual: true, category });
    saveTasks(tasks, dk);
    closeModal();
    toast('\u4EFB\u52A1\u5DF2\u6DFB\u52A0');
    activeTaskTab = category;
    initDashboard(container);
  };
}

function openEditTaskModal(task, container) {
  const dk = viewDateKey || todayKey();
  const dateHint = dk === todayKey()
    ? ''
    : `<div class="field-hint" style="margin-bottom:10px;color:var(--text-muted);font-size:12px">\u7F16\u8F91\u7684\u662F <b>${escapeHtml(fmtDateShort(dk))}</b>\u7684\u4EFB\u52A1</div>`;
  openModal({
    title: '\u7F16\u8F91\u4EFB\u52A1',
    body: `
      ${dateHint}
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
    const tasks = getTasks(dk);
    const t = tasks.find(x => x.id === task.id);
    if (t) { t.text = text; saveTasks(tasks, dk); }
    closeModal();
    toast('\u5DF2\u66F4\u65B0');
    initDashboard(container);
  };
}
