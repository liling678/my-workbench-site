// topic-tools.js — 爆款工具箱：①爆款选题生成器 ②爆款选题拆解器
import { Storage } from '../../storage.js';
import { openModal, closeModal, toast, escapeHtml, copyText, confirmDialog } from '../../ui.js';
import { Icons } from '../../registry.js';
import { loadProfile } from './style-profile.js';
import { hasAiConfig, aiChatStream, openAiConfigModal } from '../../ai-service.js';

const GEN_KEY = 'wechat_topic_gen_history';       // 爆款选题生成历史
const DECONSTRUCT_KEY = 'wechat_topic_deconstructs'; // 拆解历史
const TREND_CACHE_KEY = 'wechat_topic_trends_cache'; // 实时热榜缓存（选题生成专用）
const TREND_CACHE_TTL = 10 * 60 * 1000;             // 10 分钟

let activeTab = 'gen';   // 'gen' | 'deconstruct'
let genAbort = null;
let decAbort = null;
let cachedTrends = Storage.get(TREND_CACHE_KEY, null); // 内存级缓存

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 从模型输出里尽量稳妥地抽出一个 JSON（兼容 ```json 代码块 / 裸 JSON）
function extractJson(text, wantArray) {
  if (!text) return null;
  let t = text.trim();
  // 去掉 ```json ... ``` 围栏
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const open = wantArray ? '[' : '{';
  const close = wantArray ? ']' : '}';
  const start = t.indexOf(open);
  const end = t.lastIndexOf(close);
  if (start === -1 || end === -1 || end < start) return null;
  const slice = t.slice(start, end + 1);
  try { return JSON.parse(slice); } catch (e) { return null; }
}

function scoreColor(s) {
  s = Number(s) || 0;
  if (s >= 90) return 'var(--primary)';
  if (s >= 80) return 'var(--amber)';
  return 'var(--red)';
}

// ===== 实时热榜拉取（与 hot-search.js 同源，避免跨域问题） =====
const TREND_SOURCES = [
  { name: '微博', url: 'https://60s-api.viki.moe/v2/weibo' },
  { name: '知乎', url: 'https://60s-api.viki.moe/v2/zhihu' },
  { name: '头条', url: 'https://60s-api.viki.moe/v2/toutiao' },
];

async function fetchRealTimeTrends(force = false) {
  if (!force && cachedTrends && cachedTrends.items && cachedTrends.items.length && (Date.now() - cachedTrends.ts) < TREND_CACHE_TTL) {
    return cachedTrends.items;
  }
  const results = await Promise.allSettled(
    TREND_SOURCES.map(async src => {
      const resp = await fetch(src.url, { signal: AbortSignal.timeout(8000) });
      const json = await resp.json();
      if (json.code !== 200 || !Array.isArray(json.data)) throw new Error('bad data');
      return json.data.slice(0, 20).map(item => ({
        title: item.title || '',
        hot: item.hot_value || 0,
        link: item.link || item.url || '',
        source: src.name,
      })).filter(x => x.title);
    })
  );
  const items = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
  if (items.length) {
    cachedTrends = { ts: Date.now(), items };
    Storage.set(TREND_CACHE_KEY, cachedTrends);
  }
  return items;
}

function fmtHot(n) {
  if (!n) return '';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}

// ===== AI 提示词 =====

// 爆款选题生成器：基于真实实时热榜 + 账号风格，避免凭空编造
function buildTopicGenSystem() {
  return `# 爆款选题生成器 AI 设定

你是一名资深微信公众号运营专家，擅长把「当下真实热点」转化成「读书 + 女性成长」账号的爆款选题。

【核心规则】
- 严禁凭空编造选题。必须优先从用户提供的「实时热榜」中提炼选题角度。
- 如果热榜中没有直接相关条目，要从热榜的「情绪、社会心理、时代情绪」中延伸，不能回到老模板。
- 每次生成都要让读者感到："这是今天发生的事/今天大家都在聊的，她居然用书里的观点解释了。"

【账号定位】读书 + 女性成长 + 人生感悟
【目标读者】25-45岁女性，正经历：职场压力、年龄焦虑、情绪内耗、亲密关系困惑、自我怀疑、想改变但缺方向。
【选题公式】一本书 → 一个当下热点/情绪 → 一次自我成长/共鸣。

【选题挖掘原则】每个选题必须回答：
1. 为什么读者现在需要看？（结合哪个真实热点/情绪）
2. 她正在经历什么具体痛点？
3. 她为什么愿意转发给朋友？
4. 这个话题有没有长期搜索价值？

【严禁】
- 不要再用"人到30岁才发现""真正厉害的女人都懂得"这类固定标题模板。
- 不要生成"如何读一本书""努力的人一定成功"这类空泛鸡汤。
- 不要每次重复同样的 6 大方向和 6 个标题结构。

【评分标准】点击欲望(30) + 情绪共鸣(30) + 转发价值(20) + 长期价值(20) = 100分。只推荐80分以上选题。

【输出格式】只输出一个 JSON 数组，不要任何说明文字、不要 markdown 代码块标记。数组每个元素形如：
{"no":"01","topic":"为什么越懂事的人，越容易疲惫？","pain":"长期压抑自己、不敢拒绝别人","reader":"30岁左右的职场女性，习惯性讨好","book":"《被讨厌的勇气》","title":"《被讨厌的勇气》告诉我：真正成熟的人，都学会了拒绝","score":92,"trend":"源自微博热榜："。}
- trend 字段必填：写明灵感来自哪条真实热榜，格式如"源自微博热榜：XXX"或"源自知乎热榜：XXX"。
- 如果同一条热榜衍生出多个选题，trend 可以相同，但 topic/title 必须不同。
请生成 20 个选题，按爆款评分从高到低排序。`;
}

function buildTopicGenUser(focus, trendsText) {
  let s = '';
  if (trendsText && trendsText.trim()) {
    s += `【实时热榜】以下是从微博/知乎/头条拉取的当下真实热门话题（按热度排序）：\n${trendsText.trim()}\n\n`;
    s += '请基于以上真实热榜，生成 20 个高情绪价值的爆款选题。优先从热榜中找角度，不要凭空编造。';
  } else {
    s += '未获取到实时热榜，请基于当下社会情绪和女性成长读书号调性，生成 20 个不重复、有新鲜感的爆款选题。';
  }
  if (focus && focus.trim()) {
    s += `\n\n请重点围绕用户指定的方向/关键词来生成：${focus.trim()}（可融入但不必局限于此，保持账号整体调性）。`;
  }
  return s;
}

// 爆款选题拆解器
function buildDeconstructSystem() {
  return `# 爆款选题拆解器

你是一名公众号爆款分析师，擅长拆解 10万+ 文章的爆款逻辑。当用户给你一个文章标题（或主题），请拆解它：

1. 它为什么爆：从选题切口、传播机制、时效/共鸣等角度分析它为什么能传播。
2. 击中了什么情绪：目标读者被点燃的是哪种具体情绪（如羞耻、孤独、不甘、被看见的渴望）。
3. 套用什么标题/内容公式：可归纳的结构模式（如"反常识+身份代入""场景细节+金句收尾""痛点提问+反转"）。
4. 如何改造成「读书 + 女性成长」方向：结合具体书籍，给出 2-3 个可直接用的改造标题与切入点。

【输出格式】只输出一个 JSON 对象，不要任何说明文字、不要 markdown 代码块标记。形如：
{"why":"...","emotion":"...","formula":"...","adapt":[{"title":"改造标题1","angle":"切入点1"},{"title":"改造标题2","angle":"切入点2"}]}`;
}

// ===== 主渲染 =====
export function renderTopicTools(container) {
  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">爆款工具箱</div>
      <div class="page-desc">选题生成 + 爆款拆解，让每篇都打到读者心里</div>
    </div>

    <div class="tab-nav" id="ttTabNav">
      <div class="tab-item ${activeTab === 'gen' ? 'active' : ''}" data-tab="gen">\uD83D\uDD25 爆款选题生成</div>
      <div class="tab-item ${activeTab === 'deconstruct' ? 'active' : ''}" data-tab="deconstruct">\uD83D\uDD0D 爆款选题拆解</div>
    </div>

    <div id="ttContent"></div>
  `;

  container.querySelectorAll('.tab-item').forEach(el => {
    el.onclick = () => { activeTab = el.dataset.tab; renderTopicTools(container); };
  });

  const contentEl = container.querySelector('#ttContent');
  if (activeTab === 'gen') renderGenTab(contentEl, container);
  else renderDeconstructTab(contentEl, container);
}

// 渲染实时热榜预览条
function renderTrendsPreview(trends) {
  if (!trends || trends.length === 0) {
    return `<div class="tt-trends-empty">⏳ 尚未加载实时热榜，点「刷新热榜」或「生成选题」时自动拉取</div>`;
  }
  const list = trends.slice(0, 8).map((t, i) => `
    <span class="tt-trend-chip" title="${escapeAttr(t.source + (t.hot ? ' · ' + fmtHot(t.hot) : ''))}">
      <span class="tt-trend-dot" style="background:${t.source === '微博' ? '#E6162D' : t.source === '知乎' ? '#0084FF' : '#F04142'}"></span>
      ${escapeHtml(t.title)}
    </span>
  `).join('');
  return `
    <div class="tt-trends-head">
      <span>🔥 已接入实时热榜（展示前 8 条）</span>
      <span class="tt-trends-meta">${trends.length} 条 · ${new Date(cachedTrends.ts).toLocaleTimeString()}</span>
    </div>
    <div class="tt-trends-list">${list}</div>
  `;
}

// ===== Tab 1：爆款选题生成 =====
function renderGenTab(el, container) {
  const history = Storage.get(GEN_KEY, []).sort((a, b) => b.time - a.time);
  const rerender = () => renderGenTab(el, container);
  const trends = cachedTrends && cachedTrends.items ? cachedTrends.items : [];

  el.innerHTML = `
    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:16px">\uD83D\uDD25</span>
        <span style="font-size:14px;font-weight:600;color:var(--text-title)">今日爆款选题生成</span>
        ${hasAiConfig() ? '' : '<span style="margin-left:auto;font-size:11px;color:var(--amber)">未配置AI</span>'}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.6">
        已接入微博/知乎/头条实时热榜。AI 会基于<strong>当下真实热点</strong>生成选题，避免每次都一样。可选填方向让结果更聚焦。
      </div>

      <div class="tt-live-trends" id="tt_trendsBox">
        ${renderTrendsPreview(trends)}
      </div>

      <div class="field">
        <label class="field-label">指定方向 / 关键词（可选）</label>
        <input class="input" id="tt_focus" placeholder="如：30岁年龄焦虑、亲密关系、最近的热搜词…" value="${escapeAttr(Storage.get('wechat_topic_focus', ''))}">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;align-items:center">
        <button class="btn btn-primary" id="tt_genBtn">✦ 生成今日 20 个爆款选题</button>
        <button class="btn" id="tt_refreshTrendsBtn">🔄 刷新热榜</button>
        <button class="btn" id="tt_clearBtn">清空历史</button>
      </div>
      <div id="tt_genStatus" style="display:none;font-size:12px;color:var(--primary);margin-top:10px">
        <span class="gen-dot"></span> <span id="tt_genStatusText">AI 正在挖掘爆款选题，请稍候…</span>
      </div>
    </div>

    <div id="tt_genList">
      ${history.length === 0 ? `<div class="empty"><div class="empty-icon">\uD83D\uDD25</div><div class="empty-title">还没有生成过选题</div><div class="empty-desc">点上方按钮，让 AI 基于实时热榜给你挖一批能打的选题</div></div>` :
        history.map(batch => renderGenBatch(batch)).join('')}
    </div>
  `;

  const focusInput = el.querySelector('#tt_focus');
  focusInput.addEventListener('input', () => Storage.set('wechat_topic_focus', focusInput.value));

  const genBtn = el.querySelector('#tt_genBtn');
  const stopBtn = null;
  const statusEl = el.querySelector('#tt_genStatus');

  const statusTextEl = el.querySelector('#tt_genStatusText');

  genBtn.onclick = async () => {
    if (!hasAiConfig()) { openAiConfigModal(rerender); return; }
    if (genAbort) { genAbort.abort(); return; }
    genAbort = new AbortController();
    genBtn.textContent = '⏹ 停止生成';
    statusEl.style.display = 'block';

    let trends = [];
    let trendsText = '';
    try {
      statusTextEl.textContent = '正在拉取微博/知乎/头条实时热榜…';
      trends = await fetchRealTimeTrends(true); // 生成时强制刷新，保证最新
      if (trends.length) {
        // 刷新预览
        const box = el.querySelector('#tt_trendsBox');
        if (box) box.innerHTML = renderTrendsPreview(trends);
        trendsText = trends.map((t, i) => `${i + 1}. [${t.source}] ${t.title}${t.hot ? ' (热 ' + fmtHot(t.hot) + ')' : ''}`).join('\n');
      }
    } catch (e) {
      // 热榜失败不影响主流程，继续走 AI 兜底
      console.warn('拉取实时热榜失败', e);
    }

    try {
      statusTextEl.textContent = 'AI 正在基于实时热榜挖掘爆款选题…';
      const text = await aiChatStream([
        { role: 'system', content: buildTopicGenSystem() },
        { role: 'user', content: buildTopicGenUser(focusInput.value, trendsText) },
      ], { temperature: Math.round((0.7 + Math.random() * 0.2) * 100) / 100, signal: genAbort.signal });

      const arr = extractJson(text, true);
      if (!Array.isArray(arr) || arr.length === 0) { toast('选题解析失败，请重试'); statusEl.style.display = 'none'; genBtn.textContent = '✦ 生成今日 20 个爆款选题'; return; }
      const batch = { id: Storage.uid(), time: Date.now(), focus: focusInput.value.trim(), topics: arr, live: trends.length > 0, trendCount: trends.length };
      const h = Storage.get(GEN_KEY, []);
      h.unshift(batch);
      Storage.set(GEN_KEY, h);
      // 重新整体渲染列表（保留输入框内容）
      rerender();
      toast(`已生成 ${arr.length} 个选题${trends.length ? '（基于 ' + trends.length + ' 条实时热榜）' : ''}`);
    } catch (e) {
      if (e.name === 'AbortError') toast('已停止');
      else if (e.message === 'NO_CONFIG') openAiConfigModal(rerender);
      else toast('生成失败：' + e.message);
    } finally {
      genAbort = null;
      statusEl.style.display = 'none';
      genBtn.textContent = '✦ 生成今日 20 个爆款选题';
    }
  };

  el.querySelector('#tt_refreshTrendsBtn').onclick = async () => {
    const btn = el.querySelector('#tt_refreshTrendsBtn');
    const original = btn.textContent;
    btn.textContent = '⏳ 刷新中…';
    btn.disabled = true;
    try {
      const trends = await fetchRealTimeTrends(true);
      const box = el.querySelector('#tt_trendsBox');
      if (box) box.innerHTML = renderTrendsPreview(trends);
      toast(trends.length ? `已刷新 ${trends.length} 条实时热榜` : '热榜暂时拉取失败，请检查网络');
    } catch (e) {
      toast('热榜刷新失败：' + e.message);
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  };

  el.querySelector('#tt_clearBtn').onclick = async () => {
    const ok = await confirmDialog({ title: '清空', message: '确定清空全部生成历史吗？', confirmText: '清空', danger: true });
    if (!ok) return;
    Storage.set(GEN_KEY, []);
    rerender();
    toast('已清空');
  };

  bindGenBatchEvents(el, container);
}

function renderGenBatch(batch) {
  const topics = (batch.topics || []).map(t => `
    <div class="tt-topic-card">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <span class="tt-no">${escapeHtml(t.no || '')}</span>
        <div style="flex:1;min-width:0">
          <div class="tt-topic-title">${escapeHtml(t.topic || '')}</div>
          ${t.trend ? `<div class="tt-row"><span class="tt-key">来源</span><span style="color:var(--primary)">${escapeHtml(t.trend)}</span></div>` : ''}
          ${t.pain ? `<div class="tt-row"><span class="tt-key">痛点</span>${escapeHtml(t.pain)}</div>` : ''}
          ${t.reader ? `<div class="tt-row"><span class="tt-key">读者</span>${escapeHtml(t.reader)}</div>` : ''}
          ${t.book ? `<div class="tt-row"><span class="tt-key">荐书</span>${escapeHtml(t.book)}</div>` : ''}
          ${t.title ? `<div class="tt-row"><span class="tt-key">标题</span>${escapeHtml(t.title)}</div>` : ''}
        </div>
        <span class="tt-score" style="color:${scoreColor(t.score)}">${escapeHtml(t.score || '')}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-sm btn-primary tt-use" data-id="${batch.id}" data-no="${escapeAttr(t.no)}">➡ 选用到内容生成</button>
        <button class="btn btn-sm tt-copy" data-id="${batch.id}" data-no="${escapeAttr(t.no)}">${Icons.copy} 复制</button>
      </div>
    </div>
  `).join('');

  return `
    <div class="tt-batch">
      <div class="tt-batch-head">
        <span>📅 ${new Date(batch.time).toLocaleString()}</span>
        ${batch.focus ? `<span class="badge badge-gray">${escapeHtml(batch.focus)}</span>` : ''}
        ${batch.live ? `<span class="badge badge-green">🔥 基于 ${batch.trendCount || 0} 条实时热榜</span>` : ''}
        <span style="margin-left:auto;font-size:12px;color:var(--text-muted)">${batch.topics.length} 个选题</span>
      </div>
      <div class="tt-topic-grid">${topics}</div>
    </div>`;
}

function bindGenBatchEvents(el, container) {
  el.querySelectorAll('.tt-use').forEach(btn => {
    btn.onclick = () => {
      const batch = Storage.get(GEN_KEY, []).find(b => b.id === btn.dataset.id);
      if (!batch) return;
      const t = (batch.topics || []).find(x => String(x.no) === String(btn.dataset.no));
      if (!t) return;
      useAsTopic(t);
    };
  });
  el.querySelectorAll('.tt-copy').forEach(btn => {
    btn.onclick = () => {
      const batch = Storage.get(GEN_KEY, []).find(b => b.id === btn.dataset.id);
      if (!batch) return;
      const t = (batch.topics || []).find(x => String(x.no) === String(btn.dataset.no));
      if (!t) return;
      const lines = [
        t.topic || '',
        t.pain ? '痛点：' + t.pain : '',
        t.reader ? '读者：' + t.reader : '',
        t.book ? '荐书：' + t.book : '',
        t.title ? '标题：' + t.title : '',
        '爆款评分：' + (t.score || ''),
      ].filter(Boolean).join('\n');
      copyText(lines);
    };
  });
}

// 把工具生成的选题写进「内容生成」的选题列表，并直接跳到写文章
function useAsTopic(t) {
  const list = Storage.get('wechat_topics', []);
  const newTopic = {
    id: Storage.uid(),
    title: t.topic || '',
    reason: [
      t.pain ? '痛点：' + t.pain : '',
      t.reader ? '读者：' + t.reader : '',
      t.book ? '推荐书：' + t.book : '',
      t.title ? '推荐标题：' + t.title : '',
      t.score ? '爆款评分：' + t.score : '',
    ].filter(Boolean).join('\n'),
    type: (t.book && t.book.includes('《')) ? '单本书深度解读' : '主题合集推荐',
    createdAt: Date.now(),
    fromTopicTool: true,
  };
  list.push(newTopic);
  Storage.set('wechat_topics', list);
  Storage.set('wechat_current_topic', newTopic);
  Storage.set('wechat_jump_step', 2);
  toast('已加入选题，跳转到写文章');
  // navigate 由 app.js 注入（本模块通过 window.__wbNavigate 调用，避免循环依赖）
  if (window.__wbNavigate) window.__wbNavigate('wechat-gen');
}

// ===== Tab 2：爆款选题拆解 =====
function renderDeconstructTab(el, container) {
  const history = Storage.get(DECONSTRUCT_KEY, []).sort((a, b) => b.time - a.time);
  const rerender = () => renderDeconstructTab(el, container);

  el.innerHTML = `
    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:16px">\uD83D\uDD0D</span>
        <span style="font-size:14px;font-weight:600;color:var(--text-title)">爆款选题拆解器</span>
        ${hasAiConfig() ? '' : '<span style="margin-left:auto;font-size:11px;color:var(--amber)">未配置AI</span>'}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.6">
        粘贴一个据说 10万+ 的文章标题，AI 会拆解：<b>它为什么爆</b> · <b>击中了什么情绪</b> · <b>套用什么公式</b> · <b>如何改造成你的读书成长方向</b>。
      </div>
      <div class="field">
        <label class="field-label">文章标题 / 主题</label>
        <textarea class="textarea" id="tt_decInput" style="min-height:90px" placeholder="如：三十岁后，我终于戒掉了讨好型人格">${escapeHtml(Storage.get('wechat_dec_draft', ''))}</textarea>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" id="tt_decBtn">🔍 拆解它</button>
        <button class="btn" id="tt_decClearBtn">清空历史</button>
      </div>
      <div id="tt_decStatus" style="display:none;font-size:12px;color:var(--primary);margin-top:10px">
        <span class="gen-dot"></span> AI 正在拆解爆款逻辑…
      </div>
    </div>

    <div id="tt_decList">
      ${history.length === 0 ? `<div class="empty"><div class="empty-icon">\uD83D\uDD0D</div><div class="empty-title">还没有拆解记录</div><div class="empty-desc">粘贴一个爆款标题，看看它凭什么火</div></div>` :
        history.map(h => renderDeconstructCard(h)).join('')}
    </div>
  `;

  const input = el.querySelector('#tt_decInput');
  input.addEventListener('input', () => Storage.set('wechat_dec_draft', input.value));

  const decBtn = el.querySelector('#tt_decBtn');
  const statusEl = el.querySelector('#tt_decStatus');

  decBtn.onclick = async () => {
    const title = input.value.trim();
    if (!title) { toast('请先粘贴一个标题'); return; }
    if (!hasAiConfig()) { openAiConfigModal(rerender); return; }
    if (decAbort) { decAbort.abort(); return; }
    decAbort = new AbortController();
    decBtn.textContent = '⏹ 停止';
    statusEl.style.display = 'block';
    try {
      const text = await aiChatStream([
        { role: 'system', content: buildDeconstructSystem() },
        { role: 'user', content: `请拆解下面这个标题：\n\n${title}` },
      ], { temperature: Math.round((0.6 + Math.random() * 0.2) * 100) / 100, signal: decAbort.signal });

      const obj = extractJson(text, false);
      if (!obj || !obj.why) { toast('拆解结果解析失败，请重试'); statusEl.style.display = 'none'; decBtn.textContent = '🔍 拆解它'; return; }
      const rec = { id: Storage.uid(), time: Date.now(), title, result: obj };
      const h = Storage.get(DECONSTRUCT_KEY, []);
      h.unshift(rec);
      Storage.set(DECONSTRUCT_KEY, h);
      rerender();
      toast('拆解完成');
    } catch (e) {
      if (e.name === 'AbortError') toast('已停止');
      else if (e.message === 'NO_CONFIG') openAiConfigModal(rerender);
      else toast('拆解失败：' + e.message);
    } finally {
      decAbort = null;
      statusEl.style.display = 'none';
      decBtn.textContent = '🔍 拆解它';
    }
  };

  el.querySelector('#tt_decClearBtn').onclick = async () => {
    const ok = await confirmDialog({ title: '清空', message: '确定清空全部拆解记录吗？', confirmText: '清空', danger: true });
    if (!ok) return;
    Storage.set(DECONSTRUCT_KEY, []);
    rerender();
    toast('已清空');
  };

  // 改造标题 → 直接当选题用
  el.querySelectorAll('.tt-adapt-use').forEach(btn => {
    btn.onclick = () => {
      const rec = Storage.get(DECONSTRUCT_KEY, []).find(r => r.id === btn.dataset.id);
      if (!rec) return;
      const a = (rec.result.adapt || [])[parseInt(btn.dataset.idx)];
      if (!a) return;
      const list = Storage.get('wechat_topics', []);
      const newTopic = {
        id: Storage.uid(),
        title: a.title || '',
        reason: `来自爆款拆解改造：\n原爆款：${rec.title}\n切入点：${a.angle || ''}`,
        type: '主题合集推荐',
        createdAt: Date.now(),
        fromTopicTool: true,
      };
      list.push(newTopic);
      Storage.set('wechat_topics', list);
      Storage.set('wechat_current_topic', newTopic);
      Storage.set('wechat_jump_step', 2);
      toast('已加入选题，跳转到写文章');
      if (window.__wbNavigate) window.__wbNavigate('wechat-gen');
    };
  });

  el.querySelectorAll('.tt-dec-copy').forEach(btn => {
    btn.onclick = () => {
      const rec = Storage.get(DECONSTRUCT_KEY, []).find(r => r.id === btn.dataset.id);
      if (!rec) return;
      const o = rec.result;
      const lines = [
        '原爆款：' + rec.title,
        '',
        '【为什么爆】' + (o.why || ''),
        '【击中情绪】' + (o.emotion || ''),
        '【套用公式】' + (o.formula || ''),
        '',
        '【改造成读书成长方向】',
        ...(o.adapt || []).map((a, i) => `${i + 1}. ${a.title || ''}\n   ${a.angle || ''}`),
      ].join('\n');
      copyText(lines);
    };
  });
}

function renderDeconstructCard(rec) {
  const o = rec.result || {};
  const adapt = (o.adapt || []).map((a, i) => `
    <div class="tt-adapt-item">
      <div class="tt-adapt-title">${escapeHtml(a.title || '')}</div>
      ${a.angle ? `<div class="tt-adapt-angle">${escapeHtml(a.angle)}</div>` : ''}
      <button class="btn btn-sm btn-primary tt-adapt-use" data-id="${rec.id}" data-idx="${i}">➡ 用作选题</button>
    </div>
  `).join('');

  return `
    <div class="tt-dec-card">
      <div class="tt-batch-head">
        <span>🔖 ${escapeHtml(rec.title)}</span>
        <span style="margin-left:auto;font-size:12px;color:var(--text-muted)">${new Date(rec.time).toLocaleString()}</span>
      </div>
      <div class="tt-dec-block"><span class="tt-dec-tag">为什么爆</span><div>${escapeHtml(o.why || '')}</div></div>
      <div class="tt-dec-block"><span class="tt-dec-tag">击中情绪</span><div>${escapeHtml(o.emotion || '')}</div></div>
      <div class="tt-dec-block"><span class="tt-dec-tag">套用公式</span><div>${escapeHtml(o.formula || '')}</div></div>
      ${adapt ? `<div style="font-size:12px;font-weight:600;color:var(--text-title);margin:12px 0 6px">改造成读书成长方向</div><div class="tt-adapt-grid">${adapt}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-sm tt-dec-copy" data-id="${rec.id}">${Icons.copy} 复制全部</button>
      </div>
    </div>`;
}
