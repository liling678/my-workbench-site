// hot-search.js — 热点搜集
// 上半：实时拉取热榜（微博/知乎/头条），按风格画像关键词过滤展示10条
// 下半：手动输入搜集要求 → 点击搜索，在实时热榜+内置选题库中匹配10条
// （对标文章已拆分为独立菜单 benchmark-articles.js，这里保留「保存到对标」入口）
// 数据源：60s API (https://60s-api.viki.moe)，支持CORS；失败时回退内置选题库
import { Storage } from '../../storage.js';
import { toast, escapeHtml } from '../../ui.js';
import { Icons } from '../../registry.js';
import { loadProfile } from './style-profile.js';

const INSPO_KEY = 'wechat_inspiration_articles';
const HOT_CACHE_KEY = 'wechat_hot_cache';
const CACHE_TTL = 10 * 60 * 1000; // 10分钟缓存

function loadInspo() { return Storage.get(INSPO_KEY, []); }
function saveInspo(data) { Storage.set(INSPO_KEY, data); }

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== 实时热榜数据源 =====
const HOT_SOURCES = [
  { name: '微博', url: 'https://60s-api.viki.moe/v2/weibo' },
  { name: '知乎', url: 'https://60s-api.viki.moe/v2/zhihu' },
  { name: '头条', url: 'https://60s-api.viki.moe/v2/toutiao' },
];

// 拉取所有热榜（并发，允许部分失败）
async function fetchHotLists(force = false) {
  // 读缓存
  if (!force) {
    const cache = Storage.get(HOT_CACHE_KEY, null);
    if (cache && cache.items && cache.items.length > 0 && (Date.now() - cache.ts) < CACHE_TTL) {
      return cache.items;
    }
  }
  const results = await Promise.allSettled(
    HOT_SOURCES.map(async src => {
      const resp = await fetch(src.url, { signal: AbortSignal.timeout(8000) });
      const json = await resp.json();
      if (json.code !== 200 || !Array.isArray(json.data)) throw new Error('bad data');
      return json.data.slice(0, 30).map(item => ({
        title: item.title || '',
        hot: item.hot_value || 0,
        link: item.link || item.url || '',
        source: src.name,
      })).filter(x => x.title);
    })
  );
  const items = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
  if (items.length > 0) {
    Storage.set(HOT_CACHE_KEY, { ts: Date.now(), items });
  }
  return items;
}

// ===== 风格关键词（从风格画像提取 + 女性成长号常用词） =====
function getStyleKeywords() {
  const base = ['女性', '女生', '女孩', '妈妈', '母亲', '婚姻', '离婚', '家庭', '育儿', '孩子',
    '情感', '恋爱', '相亲', '伴侣', '夫妻', '婆婆', '心理', '焦虑', '抑郁', '孤独',
    '成长', '自律', '独立', '职场', '工作', '辞职', '裸辞', '读书', '书', '教育',
    '父母', '爷爷', '奶奶', '外婆', '朋友', '闺蜜', '生活', '幸福', '治愈', '温暖',
    '30岁', '年龄', '中年', '养老', '退休', '存款', '搞钱', '副业', '自我', '和解'];
  const profile = loadProfile();
  if (profile) {
    const text = (profile.positioning || '') + ' ' + (profile.fingerprint || '');
    if (text.includes('读书')) base.push('作家', '文学', '出版');
    if (text.includes('情感')) base.push('分手', '暗恋', '表白');
  }
  return base;
}

// 给热榜条目按风格打分
function scoreByStyle(items) {
  const keywords = getStyleKeywords();
  return items.map(item => {
    let score = 0;
    keywords.forEach(kw => { if (item.title.includes(kw)) score += 2; });
    return { ...item, score };
  });
}

// 从实时热榜中选出适合本号风格的10条
function pickStyleTopics(items) {
  const scored = scoreByStyle(items);
  // 先取命中风格词的，按分数+热度排
  const hit = scored.filter(x => x.score > 0).sort((a, b) => (b.score - a.score) || (b.hot - a.hot));
  // 不够10条时用剩余热度最高的补
  const rest = scored.filter(x => x.score === 0).sort((a, b) => b.hot - a.hot);
  return [...hit, ...rest].slice(0, 10);
}

// 从搜索输入中提取有效关键词（剔除"类、的、热门、选题"等修饰词）
const SEARCH_STOPWORDS = ['热门选题', '相关选题', '类的', '类型', '相关', '热门', '选题', '热点', '文章', '内容', '帮我', '搜集', '搜索', '推荐', '一些', '关于', '方面', '要求', '找', '请', '的', '类'];
function extractKeywords(q) {
  let s = ' ' + q + ' ';
  SEARCH_STOPWORDS.forEach(w => { s = s.split(w).join(' '); });
  const kws = s.split(/[\s,，、;；.。!！?？]+/).filter(k => k.length >= 1);
  // 长词补充2字切片，提高命中率（如"财经理财" → 财经/理财）
  const extra = [];
  kws.forEach(k => {
    if (k.length >= 4) {
      for (let i = 0; i + 2 <= k.length; i += 2) extra.push(k.slice(i, i + 2));
    }
  });
  return { primary: kws, secondary: extra.filter(x => !kws.includes(x)) };
}

// 按用户搜索要求匹配（严格按关键词，绝不混入无关风格选题）
function searchTopics(items, query) {
  const q = (query || '').trim();
  if (!q) return pickStyleTopics(items); // 无关键词：按风格推荐

  const { primary, secondary } = extractKeywords(q);

  const scoreTitle = (title, tags = []) => {
    let score = 0;
    primary.forEach(kw => { if (title.includes(kw)) score += 5; });
    secondary.forEach(kw => { if (title.includes(kw)) score += 2; });
    primary.forEach(kw => { if (tags.some(tag => tag.includes(kw) || kw.includes(tag))) score += 3; });
    return score;
  };

  // 实时热榜：只保留命中关键词的
  const liveHit = items
    .map(item => ({ ...item, score: scoreTitle(item.title) }))
    .filter(x => x.score > 0);

  // 内置选题库：只保留命中关键词的
  const localHit = HOT_TOPICS
    .map(t => ({ title: t.title, hot: 0, link: '', source: '选题库', tags: t.tags, score: scoreTitle(t.title, t.tags) }))
    .filter(x => x.score > 0);

  // 只返回真正命中的结果，宁缺毋滥
  return [...liveHit, ...localHit]
    .sort((a, b) => (b.score - a.score) || (b.hot - a.hot))
    .slice(0, 10);
}

// ===== 内置选题库（女性成长+读书向，兜底 & 搜索补充） =====
const HOT_TOPICS = [
  { title: '《三十岁以后，我开始学着和父母和解》', tags: ['30岁', '父母', '亲情', '和解', '成长'] },
  { title: '读懂《被讨厌的勇气》才知道：你不是不够好，是太怕被嫌弃', tags: ['读书', '被讨厌的勇气', '自卑', '认可', '勇气'] },
  { title: '一个人最大的清醒：不再向任何人证明自己', tags: ['清醒', '独立', '证明', '自我'] },
  { title: '为什么越亲密的人，越容易伤你最深？', tags: ['亲密关系', '亲情', '友情', '伤害', '关系'] },
  { title: '那些独处的时光，终将成为你最好的底气', tags: ['独处', '孤独', '底气', '自我'] },
  { title: '在婚姻里慢慢找回自己', tags: ['婚姻', '女性', '自我', '成长'] },
  { title: '30岁重启人生：晚不晚，看你从哪一天开始', tags: ['30岁', '重启', '人生', '勇气'] },
  { title: '你不必把所有人都请进生命里', tags: ['社交', '断舍离', '孤独', '关系'] },
  { title: '你比想象中更强大：写给总觉得自己不够好的你', tags: ['自卑', '力量', '自我', '成长'] },
  { title: '致30+的你：先把自己活好，再谈其他', tags: ['30岁', '自我', '女性', '成长'] },
  { title: '慢慢来，比较快——写给焦虑的年轻人', tags: ['慢慢来', '焦虑', '成长', '生活'] },
  { title: '接纳不完美的自己，才是真正的成长', tags: ['不完美', '接纳', '成长', '自卑'] },
  { title: '在忙碌的生活里，给自己留一点温柔', tags: ['生活', '温柔', '治愈', '女性'] },
  { title: '愿你既有盔甲，也有软肋', tags: ['柔软', '坚强', '祝福', '女性'] },
  { title: '30岁之后，请活成一个有"边界感"的大人', tags: ['30岁', '边界感', '关系', '成熟'] },
  { title: '那些深夜里的眼泪，会变成照亮前路的光', tags: ['治愈', '眼泪', '成长', '女性'] },
  { title: '不要用别人的尺子，丈量自己的人生', tags: ['独立', '自我', '比较', '人生'] },
  { title: '你的善良，必须带点锋芒', tags: ['善良', '锋芒', '成长', '人际关系'] },
  { title: '最好的关系，是相处不累', tags: ['关系', '友情', '爱情', '相处'] },
  { title: '一个人值不值得深交，看他疲惫时的样子', tags: ['人际', '深交', '识人', '友情'] },
  { title: '读书和不读书，过的是不一样的人生', tags: ['读书', '成长', '人生', '学习'] },
  { title: '愿你遍历山河，仍觉人间值得', tags: ['祝福', '生活', '旅行', '治愈'] },
  { title: '凡是过往，皆为序章：和过去和解的5个方法', tags: ['和解', '过去', '成长', '读书'] },
  { title: '真正的成熟，是学会"算了"', tags: ['成熟', '释怀', '放下', '成长'] },
  { title: '三十而立，立的是什么？', tags: ['30岁', '而立', '人生', '思考'] },
  { title: '允许自己慢一点，也是一种勇气', tags: ['慢慢来', '勇气', '焦虑', '生活'] },
  { title: '在不确定的时代，做确定的自己', tags: ['不确定', '确定', '自我', '时代'] },
  { title: '女人这一生，最该投资的是自己', tags: ['女性', '自我', '投资', '成长'] },
  { title: '走过半生才明白：平淡，才是最深情的告白', tags: ['婚姻', '平淡', '半生', '深情'] },
  { title: '别让"应该"绑架了你的人生', tags: ['应该', '自我', '束缚', '自由'] },
  { title: '25-35岁，最该想清楚的5件事', tags: ['25岁', '30岁', '人生', '思考', '成长'] },
  { title: '你越安静，越有力量', tags: ['安静', '力量', '自我', '女性'] },
  { title: '在独处中蓄力，在热闹中清醒', tags: ['独处', '热闹', '清醒', '自我'] },
  { title: '生活的本质，不过是活出自己喜欢的样子', tags: ['生活', '喜欢', '自我', '人生'] },
  { title: '愿你眼里有光，心中有爱', tags: ['祝福', '治愈', '生活', '女性'] },
  { title: '接受生活的不完美，也是一种美', tags: ['不完美', '接纳', '生活', '成长'] },
  { title: '与其焦虑未来，不如把握现在', tags: ['焦虑', '未来', '现在', '生活'] },
  { title: '父母子女一场，是渐行渐远的修行', tags: ['父母', '亲情', '子女', '成长'] },
  { title: '你值得被爱，而不是被将就', tags: ['爱情', '被爱', '将就', '女性'] },
  { title: '人到中年，把日子过成自己喜欢的样子', tags: ['中年', '生活', '喜欢', '自我'] },
  { title: '那些打不倒你的，终将使你更强大', tags: ['强大', '困难', '成长', '治愈'] },
  { title: '学会和自己和解，是一生的功课', tags: ['和解', '自己', '成长', '读书'] },
  { title: '真正的成熟，是不再向外求认可', tags: ['成熟', '认可', '独立', '自我'] },
  { title: '婚姻里最好的状态：各自舒服，互不打扰', tags: ['婚姻', '舒服', '独立', '关系'] },
  { title: '请相信：你比自己想象中更值得被爱', tags: ['被爱', '自信', '女性', '成长'] },
  { title: '愿你拥有被讨厌的勇气，也有被喜欢的底气', tags: ['勇气', '底气', '被讨厌', '祝福'] },
  { title: '每个年龄段都有它的美好，不必回头看', tags: ['年龄', '美好', '当下', '生活'] },
  { title: '与其合群，不如学会高质量的独处', tags: ['合群', '独处', '社交', '自我'] },
  { title: '生活不会亏待认真的人', tags: ['生活', '认真', '治愈', '成长'] },
  { title: '愿你成为自己的太阳，无需凭借谁的光', tags: ['自我', '独立', '祝福', '女性'] },
  { title: '《人间失格》里最戳心的一句话：胆小鬼连幸福都会害怕', tags: ['读书', '人间失格', '太宰治', '幸福'] },
  { title: '《小王子》：所有的大人都曾经是孩子，只是很少有人记得了', tags: ['读书', '小王子', '童年', '成长'] },
  { title: '重读《简爱》：女孩子这一生，最该有的三个"底气"', tags: ['读书', '简爱', '女性', '底气'] },
  { title: '《你当像鸟飞往你的山》：一个人究竟要多努力，才能摆脱原生家庭', tags: ['读书', '原生家庭', '女性', '成长'] },
  { title: '《我们仨》：最好的婚姻，是把日子过成诗', tags: ['读书', '婚姻', '我们仨', '杨绛'] },
  { title: '《傲慢与偏见》：女孩子择偶，看这3点就够了', tags: ['读书', '傲慢与偏见', '择偶', '爱情'] },
  { title: '《月亮与六便士》：30岁后，我开始仰望月亮', tags: ['读书', '月亮与六便士', '梦想', '30岁'] },
  { title: '《被讨厌的勇气》：课题分离，是解决一切人际烦恼的钥匙', tags: ['读书', '被讨厌的勇气', '人际关系', '课题分离'] },
];

// 内置库兜底：按风格抽10条
function getFallbackTopics() {
  const shuffled = [...HOT_TOPICS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 10).map(t => ({ title: t.title, hot: 0, link: '', source: '选题库', tags: t.tags, score: 0 }));
}

// 格式化热度
function fmtHot(n) {
  if (!n) return '';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}

// 来源badge颜色
function sourceBadge(source) {
  const colors = { '微博': '#E6162D', '知乎': '#0084FF', '头条': '#F04142', '选题库': 'var(--primary)' };
  return `<span class="topic-source" style="background:${colors[source] || 'var(--primary)'}">${escapeHtml(source)}</span>`;
}

// 选题卡片 HTML
function topicCardHtml(t, idx) {
  return `
    <div class="topic-card" data-idx="${idx}">
      <div class="topic-card-title">${escapeHtml(t.title)}</div>
      <div class="topic-card-tags">
        ${sourceBadge(t.source)}
        ${t.hot ? `<span class="topic-tag">🔥 ${fmtHot(t.hot)}</span>` : ''}
        ${(t.tags || []).slice(0, 2).map(tag => `<span class="topic-tag">${escapeHtml(tag)}</span>`).join('')}
      </div>
      <div class="topic-card-actions">
        <button class="btn btn-ghost btn-xs topic-save" data-idx="${idx}">${Icons.plus} 保存到对标</button>
        <button class="btn btn-ghost btn-xs topic-copy" data-idx="${idx}">${Icons.copy} 复制</button>
        ${t.link ? `<a href="${escapeAttr(t.link)}" target="_blank" class="btn btn-ghost btn-xs">${Icons.link} 原文</a>` : ''}
      </div>
    </div>
  `;
}

// 保存到对标文章
function saveTopicToInspiration(topic) {
  const list = loadInspo();
  if (list.some(a => a.title === topic.title)) {
    toast('已存在相同对标文章');
    return false;
  }
  list.unshift({
    id: Storage.uid(),
    title: topic.title,
    link: topic.link || '',
    tags: (topic.tags || []).join('、') || topic.source,
    source: topic.source === '选题库' ? '热点搜集' : topic.source + '热榜',
    createdAt: Date.now(),
  });
  saveInspo(list);
  toast('已保存，去「对标文章」菜单查看');
  return true;
}

export function renderHotSearch(container) {
  const profile = loadProfile();
  const accountName = profile?.publicAccount || '本号';

  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">热点搜集</div>
      <div class="page-desc">实时拉取微博/知乎/头条热榜，按「${escapeHtml(accountName)}」风格筛选 + 手动搜索选题</div>
    </div>

    <!-- 上半：实时风格热点 -->
    <div class="card card-pad mb-16">
      <div class="hot-section-head">
        <div>
          <div class="hot-section-title">✨ 风格热点 · 实时热榜</div>
          <div class="hot-section-desc">实时拉取热榜，按「${escapeHtml(profile?.positioning || '女性成长陪伴型读书号')}」风格优先展示</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="refreshStyleBtn">🔄 刷新</button>
      </div>
      <div class="topic-grid" id="styleTopicGrid">
        <div class="hot-loading">⏳ 正在拉取实时热榜…</div>
      </div>
    </div>

    <!-- 下半：手动搜集 -->
    <div class="card card-pad mb-16">
      <div class="hot-section-head">
        <div>
          <div class="hot-section-title">🔍 手动搜集</div>
          <div class="hot-section-desc">输入要求关键词，在实时热榜和选题库中搜索10条相关选题</div>
        </div>
      </div>
      <div class="field" style="margin-bottom:12px">
        <textarea class="textarea" id="reqInput" style="min-height:72px" placeholder="例如：婚姻 女性成长 30岁焦虑（空格分隔多个关键词）"></textarea>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary btn-sm" id="searchBtn">${Icons.search} 搜索</button>
        <span style="font-size:12px;color:var(--text-muted)">搜索后展示10条相关热门选题</span>
      </div>
      <div id="searchResult" style="margin-top:16px"></div>
    </div>
  `;

  // 异步加载实时热榜
  loadStyleSection(container, false);

  // 刷新按钮（强制重新拉取）
  container.querySelector('#refreshStyleBtn').onclick = () => loadStyleSection(container, true);

  // 搜索按钮
  container.querySelector('#searchBtn').onclick = async () => {
    const q = container.querySelector('#reqInput').value.trim();
    const resultEl = container.querySelector('#searchResult');
    resultEl.innerHTML = '<div class="hot-loading">⏳ 正在搜索…</div>';
    let items = [];
    try { items = await fetchHotLists(false); } catch (e) { /* 忽略 */ }
    const results = searchTopics(items, q);
    if (results.length === 0) {
      resultEl.innerHTML = `<div class="empty" style="padding:20px"><div class="empty-title">当前热榜和选题库中没有与「${escapeHtml(q)}」匹配的选题</div><div class="empty-desc">只展示真正相关的结果，不会拿其他类型凑数～可以换个关键词、或点上方「🔄 刷新」拉取最新热榜后再搜</div></div>`;
      return;
    }
    resultEl.innerHTML = `
      <div class="search-result-head">
        <div class="search-result-title">${q ? `关于「${escapeHtml(q)}」的推荐选题` : '热门选题推荐'}</div>
        <div class="search-result-count">${results.length} 条</div>
      </div>
      <div class="topic-grid">
        ${results.map((t, i) => topicCardHtml(t, i)).join('')}
      </div>
    `;
    bindTopicActions(resultEl, results, container);
  };
}

// 加载上半部分实时热点
async function loadStyleSection(container, force) {
  const grid = container.querySelector('#styleTopicGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="hot-loading">⏳ 正在拉取实时热榜…</div>';
  let topics = [];
  let isLive = false;
  try {
    const items = await fetchHotLists(force);
    if (items.length > 0) {
      topics = pickStyleTopics(items);
      isLive = true;
    }
  } catch (e) { /* 走兜底 */ }
  if (topics.length === 0) {
    topics = getFallbackTopics();
  }
  // container可能已切换页面
  const gridNow = container.querySelector('#styleTopicGrid');
  if (!gridNow) return;
  gridNow.innerHTML = (isLive ? '' : '<div class="hot-fallback-tip">⚠️ 实时热榜暂时拉取失败，已展示内置选题库</div>')
    + topics.map((t, i) => topicCardHtml(t, i)).join('');
  bindTopicActions(gridNow, topics, container);
}

// 绑定选题卡片操作（scope内查找按钮）
function bindTopicActions(scopeEl, topics, container) {
  scopeEl.querySelectorAll('.topic-save').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      saveTopicToInspiration(topics[idx]);
    };
  });
  scopeEl.querySelectorAll('.topic-copy').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      navigator.clipboard.writeText(topics[idx].title).then(
        () => toast('标题已复制'),
        () => toast('复制失败，请手动复制')
      );
    };
  });
}
