// topic-tools.js — 爆款工具箱：①爆款选题生成器 ②爆款选题拆解器
import { Storage } from '../../storage.js';
import { openModal, closeModal, toast, escapeHtml, copyText, confirmDialog } from '../../ui.js';
import { Icons } from '../../registry.js';
import { loadProfile } from './style-profile.js';
import { hasAiConfig, aiChatStream, openAiConfigModal } from '../../ai-service.js';

const GEN_KEY = 'wechat_topic_gen_history';       // 爆款选题生成历史
const DECONSTRUCT_KEY = 'wechat_topic_deconstructs'; // 拆解历史

let activeTab = 'gen';   // 'gen' | 'deconstruct'
let genAbort = null;
let decAbort = null;

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

// ===== AI 提示词 =====

// 爆款选题生成器：整合自用户提供的「资深运营专家」设定
function buildTopicGenSystem() {
  return `# 爆款选题生成器 AI 设定

你是一名资深微信公众号运营专家，拥有多年女性成长、读书类账号运营经验。
你的任务不是简单提供文章主题，而是挖掘："什么内容会让目标读者主动点击、收藏、转发。"

【账号定位】读书 + 女性成长 + 人生感悟
【目标读者】25-45岁的女性。她们正在经历：职场压力、年龄焦虑、自我怀疑、情绪内耗、亲密关系困惑、想改变却不知道如何开始、想提升自己但缺少方向。
【选题核心】不是讲书，而是：一本书 → 一个人生困惑 → 一种情绪共鸣 → 一次自我成长。

【选题挖掘原则】每个选题必须回答：
1. 为什么读者现在需要看？
2. 她正在经历什么痛点？
3. 她为什么愿意转发给朋友？
4. 这个话题是否具有长期搜索价值？
优先选择高情绪价值主题：后悔、遗憾、孤独、成长、和自己和解、被误解、自我接纳、改变人生、女性觉醒、摆脱内耗。

【6大方向】
1. 读书成长类：读完《书名》，我终于明白了XXX
2. 女性成长类：普通女性如何变得更好
3. 情绪疗愈类：读者内心隐藏的痛苦
4. 人生感悟类：成年人共同经历
5. 自我提升类：改变行动
6. 热点结合类：社会情绪热点 + 女性成长 + 书籍观点

【爆款标题结构（优先使用）】
- 读完《XXX》，我终于明白了XXX
- 人到XX岁才发现，XXX
- 那个曾经XXX的自己，终于被我原谅了
- 真正厉害的女人，都懂得XXX
- 停止XXX后，我的人生开始改变
- 看完XXX，我想告诉所有女人XXX

【选题筛选原则】
不要生成：太普通的话题（如何读一本书）、过度鸡汤（努力的人一定成功）、没有具体痛点的话题。
只优先生成让目标读者看到标题就产生："这不就是我吗？""我要看看她怎么说。""我要转给朋友。"

【评分标准】点击欲望(30) + 情绪共鸣(30) + 转发价值(20) + 长期价值(20) = 100分。只推荐80分以上选题。

【输出格式】只输出一个 JSON 数组，不要任何说明文字、不要 markdown 代码块标记。数组每个元素形如：
{"no":"01","topic":"为什么越懂事的人，越容易疲惫？","pain":"长期压抑自己、不敢拒绝别人","reader":"30岁左右的职场女性，习惯性讨好","book":"《被讨厌的勇气》","title":"《被讨厌的勇气》告诉我：真正成熟的人，都学会了拒绝","score":92}
请生成 20 个选题，按爆款评分从高到低排序。`;
}

function buildTopicGenUser(focus) {
  let s = '请生成今日推荐的 20 个爆款选题（JSON 数组）。';
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

// ===== Tab 1：爆款选题生成 =====
function renderGenTab(el, container) {
  const history = Storage.get(GEN_KEY, []).sort((a, b) => b.time - a.time);
  const rerender = () => renderGenTab(el, container);

  el.innerHTML = `
    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:16px">\uD83D\uDD25</span>
        <span style="font-size:14px;font-weight:600;color:var(--text-title)">今日爆款选题生成</span>
        ${hasAiConfig() ? '' : '<span style="margin-left:auto;font-size:11px;color:var(--amber)">未配置AI</span>'}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.6">
        基于资深运营专家设定，一次生成 20 个高情绪价值选题（含痛点、推荐书籍、爆款标题与评分）。可选填方向让结果更聚焦。
      </div>
      <div class="field">
        <label class="field-label">指定方向 / 关键词（可选）</label>
        <input class="input" id="tt_focus" placeholder="如：30岁年龄焦虑、亲密关系、最近的热搜词…" value="${escapeAttr(Storage.get('wechat_topic_focus', ''))}">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        <button class="btn btn-primary" id="tt_genBtn">✦ 生成今日 20 个爆款选题</button>
        <button class="btn" id="tt_clearBtn">清空历史</button>
      </div>
      <div id="tt_genStatus" style="display:none;font-size:12px;color:var(--primary);margin-top:10px">
        <span class="gen-dot"></span> AI 正在挖掘爆款选题，请稍候…
      </div>
    </div>

    <div id="tt_genList">
      ${history.length === 0 ? `<div class="empty"><div class="empty-icon">\uD83D\uDD25</div><div class="empty-title">还没有生成过选题</div><div class="empty-desc">点上方按钮，让 AI 给你挖一批能打的选题</div></div>` :
        history.map(batch => renderGenBatch(batch)).join('')}
    </div>
  `;

  const focusInput = el.querySelector('#tt_focus');
  focusInput.addEventListener('input', () => Storage.set('wechat_topic_focus', focusInput.value));

  const genBtn = el.querySelector('#tt_genBtn');
  const stopBtn = null;
  const statusEl = el.querySelector('#tt_genStatus');

  genBtn.onclick = async () => {
    if (!hasAiConfig()) { openAiConfigModal(rerender); return; }
    if (genAbort) { genAbort.abort(); return; }
    genAbort = new AbortController();
    genBtn.textContent = '⏹ 停止生成';
    statusEl.style.display = 'block';
    try {
      const text = await aiChatStream([
        { role: 'system', content: buildTopicGenSystem() },
        { role: 'user', content: buildTopicGenUser(focusInput.value) },
      ], { temperature: Math.round((0.7 + Math.random() * 0.2) * 100) / 100, signal: genAbort.signal });

      const arr = extractJson(text, true);
      if (!Array.isArray(arr) || arr.length === 0) { toast('选题解析失败，请重试'); statusEl.style.display = 'none'; genBtn.textContent = '✦ 生成今日 20 个爆款选题'; return; }
      const batch = { id: Storage.uid(), time: Date.now(), focus: focusInput.value.trim(), topics: arr };
      const h = Storage.get(GEN_KEY, []);
      h.unshift(batch);
      Storage.set(GEN_KEY, h);
      // 重新整体渲染列表（保留输入框内容）
      rerender();
      toast(`已生成 ${arr.length} 个爆款选题`);
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
