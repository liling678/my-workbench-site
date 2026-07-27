// content-gen.js — 内容生成：3步流程（选题→AI实时写文章→AI检测+配图）
import { Storage } from '../../storage.js';
import { openModal, closeModal, confirmDialog, toast, escapeHtml, copyText } from '../../ui.js';
import { Icons } from '../../registry.js';
import { loadProfile } from './style-profile.js';
import { hasAiConfig, aiChatStream, openAiConfigModal, loadAiConfig, canGenerateImage, aiGenerateImage, aiGenerateImageClean, stripWatermark, currentImageModel } from '../../ai-service.js';
import { storeImage, cloudUrl } from '../../cloud-sync.js';

const TOPIC_KEY = 'wechat_topics';
const DRAFT_KEY = 'wechat_drafts';
const INSPO_KEY = 'wechat_inspiration_articles';
const IMAGE_LIB_KEY = 'wechat_image_library';

// 自动把生成的图片入库到图片库（按 prompt 文本去重）
function addToImageLibrary(image, prompt, position, sourceTitle) {
  if (!image) return;
  const lib = Storage.get(IMAGE_LIB_KEY, []);
  // 去重：相同 prompt 不重复入
  if (lib.some(x => x.prompt === prompt && x.image === image)) return;
  lib.unshift({
    id: Storage.uid(),
    image,
    prompt: prompt || '',
    position: position || '',
    sourceTitle: sourceTitle || '',
    createdAt: Date.now(),
  });
  // 限 200 张，超出的删旧的（防止 base64 撑爆 localStorage）
  if (lib.length > 200) lib.length = 200;
  Storage.set(IMAGE_LIB_KEY, lib);
}

function loadTopics() { return Storage.get(TOPIC_KEY, []); }
function saveTopics(d) { Storage.set(TOPIC_KEY, d); }

let activeStep = 1;
let currentAbort = null; // 当前生成的中断控制器

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 渲染单张配图卡片（支持已生成图片 / 仅方案 / 生成中）
function renderCoverCard(c, i) {
  const imgArea = c.loading
    ? `<div class="cover-img-ph"><span class="gen-dot"></span> 生成中…</div>`
    : (c.image
      ? `<div class="cover-img-wrap${c.raw ? ' raw' : ''}"><img src="${escapeAttr(c.image)}" class="cover-img" alt="配图${i + 1}" loading="lazy"></div>`
      : `<div class="cover-img-ph" style="color:var(--text-muted);font-size:12px">未生成图片<br>可点击\u201C重新生成\u201D</div>`);
  return `
    <div class="cover-card" data-idx="${i}">
      ${imgArea}
      <div class="cover-card-body">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span class="badge badge-green">${escapeHtml(c.position || '配图 ' + (i + 1))}</span>
        </div>
        <div class="cover-card-desc">${escapeHtml(c.description || '')}</div>
        <div class="cover-card-actions">
          ${c.image ? `<button class="btn btn-sm cover-download" data-idx="${i}">${Icons.download || ''} 下载</button>` : ''}
          <button class="btn btn-sm cover-regen" data-idx="${i}">\uD83D\uDD04 重新生成</button>
          <button class="icon-btn btn-sm cover-edit" data-idx="${i}">${Icons.edit}</button>
          <button class="icon-btn btn-sm cover-del" data-idx="${i}">${Icons.trash}</button>
        </div>
      </div>
    </div>`;
}

export function renderContentGen(container) {
  // 允许从「爆款工具箱」等模块预选选题后直接跳到写文章（默认仍是步骤1）
  const jump = Storage.get('wechat_jump_step', 1);
  if (jump >= 1 && jump <= 3) activeStep = jump;
  Storage.set('wechat_jump_step', 1);

  container.innerHTML = `
    <div class="page-head">
      <div class="page-title">内容生成</div>
      <div class="page-desc">从选题到成文，AI 按你的风格实时生成</div>
    </div>

    <div class="step-nav" id="stepNav">
      <div class="step-item ${activeStep === 1 ? 'active' : ''}" data-step="1">
        <div class="step-num">1</div><div class="step-label">选题</div>
      </div>
      <div class="step-line ${activeStep >= 2 ? 'done' : ''}"></div>
      <div class="step-item ${activeStep === 2 ? 'active' : ''}" data-step="2">
        <div class="step-num">2</div><div class="step-label">写文章</div>
      </div>
      <div class="step-line ${activeStep >= 3 ? 'done' : ''}"></div>
      <div class="step-item ${activeStep === 3 ? 'active' : ''}" data-step="3">
        <div class="step-num">3</div><div class="step-label">检测配图</div>
      </div>
    </div>

    <div id="stepContent"></div>
  `;

  container.querySelectorAll('.step-item').forEach(el => {
    el.onclick = () => {
      const step = parseInt(el.dataset.step);
      Storage.set('wechat_jump_step', step);
      renderContentGen(container);
    };
  });

  const contentEl = container.querySelector('#stepContent');
  if (activeStep === 1) renderStep1(contentEl, container);
  else if (activeStep === 2) renderStep2(contentEl, container);
  else if (activeStep === 3) renderStep3(contentEl, container);
}

// ====== Step 1: 选题 ======
function renderStep1(el, container) {
  const topics = loadTopics().sort((a, b) => b.createdAt - a.createdAt);
  const inspos = Storage.get(INSPO_KEY, []).sort((a, b) => b.createdAt - a.createdAt);
  const rerender = () => renderStep1(el, container);

  el.innerHTML = `
    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:16px">\uD83D\uDD25</span>
        <span style="font-size:14px;font-weight:600;color:var(--text-title)">选题管理</span>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.6">
        添加你感兴趣的选题，或直接选用下方灵感库的对标文章，选定后进入下一步写文章
      </div>
      <button class="btn btn-primary" id="addTopicBtn">${Icons.plus} 添加选题</button>
      <button class="btn" id="aiTopicToolBtn">✦ AI 爆款选题</button>
    </div>

    <div class="section-title">选题列表 <span class="cat-count">${topics.length}</span></div>
    <div class="list mb-16" id="topicList">
      ${topics.length === 0 ? `<div class="empty"><div class="empty-icon">${Icons.sparkles}</div><div class="empty-title">还没有选题</div><div class="empty-desc">点击「添加选题」或选用下方对标文章</div></div>` :
        topics.map(t => `
          <div class="list-item" data-id="${t.id}">
            <div class="list-item-head">
              <div style="flex:1;min-width:0">
                <div class="list-item-title">${escapeHtml(t.title)}</div>
                ${t.reason ? `<div class="list-item-body" style="margin-top:4px">${escapeHtml(t.reason)}</div>` : ''}
              </div>
              <div class="list-item-actions">
                <button class="btn btn-sm btn-primary topic-select" data-id="${t.id}">选用</button>
                <button class="icon-btn btn-sm topic-edit" data-id="${t.id}">${Icons.edit}</button>
                <button class="icon-btn btn-sm topic-del">${Icons.trash}</button>
              </div>
            </div>
            <div class="list-item-meta">
              ${t.type ? `<span class="badge badge-gray">${escapeHtml(t.type)}</span>` : ''}
              <span>${t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ''}</span>
            </div>
          </div>
        `).join('')}
    </div>

    <div class="section-title">\uD83D\uDCA1 灵感库 · 对标文章 <span class="cat-count">${inspos.length}</span></div>
    <div class="list" id="inspoTopicList">
      ${inspos.length === 0 ? `<div class="empty" style="padding:20px"><div class="empty-title">灵感库还没有对标文章</div><div class="empty-desc">去「热点搜集」页面保存热点或添加对标文章</div></div>` :
        inspos.map(a => `
          <div class="list-item" data-id="${a.id}">
            <div class="list-item-head">
              <div style="flex:1;min-width:0">
                <div class="list-item-title">${escapeHtml(a.title)}</div>
              </div>
              <div class="list-item-actions">
                <button class="btn btn-sm btn-primary inspo-select" data-id="${a.id}">选用</button>
              </div>
            </div>
            <div class="list-item-meta">
              ${a.tags ? `<span class="badge badge-gray">${escapeHtml(a.tags)}</span>` : ''}
              ${a.source ? `<span class="badge badge-green">${escapeHtml(a.source)}</span>` : ''}
            </div>
          </div>
        `).join('')}
    </div>
  `;

  el.querySelector('#addTopicBtn').onclick = () => openTopicModal(container, null, rerender);

  el.querySelector('#aiTopicToolBtn').onclick = () => {
    if (window.__wbNavigate) window.__wbNavigate('wechat-topic-tools');
    else toast('请刷新页面后重试');
  };

  el.querySelectorAll('.topic-select').forEach(btn => {
    btn.onclick = () => {
      const topic = loadTopics().find(t => t.id === btn.dataset.id);
      if (topic) {
        Storage.set('wechat_current_topic', topic);
        Storage.set('wechat_current_article', Storage.get('wechat_current_article', ''));
        toast(`已选用：${topic.title}`);
        Storage.set('wechat_jump_step', 2); // 让 renderContentGen 进入写文章步骤
        renderContentGen(container);
      }
    };
  });

  // 从灵感库对标文章直接选用
  el.querySelectorAll('.inspo-select').forEach(btn => {
    btn.onclick = () => {
      const a = Storage.get(INSPO_KEY, []).find(x => x.id === btn.dataset.id);
      if (a) {
        const topic = {
          id: 'inspo_' + a.id,
          title: a.title,
          reason: a.summary || '来自灵感库对标文章' + (a.source ? '（' + a.source + '）' : ''),
          type: a.title.includes('《') ? '单本书深度解读' : '主题合集推荐',
        };
        Storage.set('wechat_current_topic', topic);
        toast(`已选用：${a.title}`);
        Storage.set('wechat_jump_step', 2);
        renderContentGen(container);
      }
    };
  });

  el.querySelectorAll('.topic-edit').forEach(btn => {
    btn.onclick = () => openTopicModal(container, btn.dataset.id, rerender);
  });

  el.querySelectorAll('.topic-del').forEach(btn => {
    btn.onclick = async () => {
      const item = btn.closest('.list-item');
      if (await confirmDialog({ title: '删除', message: '确定删除这个选题吗？', confirmText: '删除', danger: true })) {
        saveTopics(loadTopics().filter(t => t.id !== item.dataset.id));
        toast('已删除');
        rerender();
      }
    };
  });
}

function openTopicModal(container, id, rerender) {
  const list = loadTopics();
  const item = id ? list.find(t => t.id === id) : {};
  const isEdit = !!id;

  openModal({
    title: isEdit ? '编辑选题' : '添加选题',
    body: `
      <div class="field"><label class="field-label">标题 <span class="req">*</span></label>
        <input class="input" id="topic_title" value="${escapeAttr(item.title)}" placeholder="如：读完《XXX》，我终于…" autofocus></div>
      <div class="field"><label class="field-label">选题理由</label>
        <textarea class="textarea" id="topic_reason" style="min-height:80px" placeholder="为什么选这个选题？预期解决什么痛点？">${escapeHtml(item.reason || '')}</textarea></div>
      <div class="field"><label class="field-label">文章类型</label>
        <select class="input" id="topic_type">
          <option value="单本书深度解读" ${item.type==='单本书深度解读'?'selected':''}>单本书深度解读</option>
          <option value="主题合集推荐" ${item.type==='主题合集推荐'?'selected':''}>主题合集推荐</option>
        </select></div>`,
    foot: `<button class="btn" id="t_cancel">取消</button><button class="btn btn-primary" id="t_save">${isEdit ? '保存' : '添加'}</button>`
  });
  document.getElementById('t_cancel').onclick = closeModal;
  document.getElementById('t_save').onclick = () => {
    const title = document.getElementById('topic_title').value.trim();
    if (!title) { toast('请填写标题'); return; }
    const data = {
      title,
      reason: document.getElementById('topic_reason').value.trim(),
      type: document.getElementById('topic_type').value,
    };
    if (isEdit) {
      const i = list.findIndex(t => t.id === id);
      list[i] = { ...list[i], ...data };
    } else {
      list.push({ id: Storage.uid(), ...data, createdAt: Date.now() });
    }
    saveTopics(list);
    closeModal();
    toast(isEdit ? '已保存' : '已添加');
    rerender();
  };
}

// ====== AI Prompt 构建（选题 + 完整风格画像） ======

// 每次生成随机抽一项「开头灵感」与「结构灵感」，让同一选题每次结构、节奏都不同
const OPENING_INSPIRATIONS = [
  '用一个具体的生活切面开场：某个深夜、地铁上的走神、一句突然击中你的话，不要铺垫',
  '从书里某一句原话切入，再慢慢带出你自己的感受，不要先介绍书',
  '以一个你自己也答不上来的小问句开场，像是想到什么就写什么',
  '直接讲一个你或朋友身上发生的小事，不解释、不升华，先让画面落地',
  '用一段很短的、近乎自言自语的话开场，像刚冒出某个念头',
  '从"我最近"三个字写起，谈谈最近的某种状态或拧巴',
];
const STRUCTURE_INSPIRATIONS = [
  '结构随内容自然流动，不必分点，有一条暗线贯穿即可，该长则长该短则短',
  '分成两三个松散的小群，群与群之间留白，不要用编号，也不要每段一样长',
  '先铺一层情绪，再落到一个具体的认知转变上，转折要自然不生硬',
  '用"记得有一次…后来才明白…"这样的时间感往前推',
  '前面轻、后面重，结尾轻轻收住，不要喊口号也不要总结全文',
  '中间穿插一句书中的话当作呼吸点，前后各写一段你真实的反应',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ===== 公众号"树予我说"常驻风格规则（整合自风格画像·爆款公式）=====
// 这些是账号反复验证有效的写作规范，但应用时要"神似不机械"——
function buildShuyuRules(author) {
  return `# 公众号原创作者 AI 助手设定

你是一名资深微信公众号原创作者「${author || '树予予'}」，拥有多年内容创作经验，擅长打造高阅读量、高收藏、高共鸣的文章。

【账号定位】
读书分享 + 女性成长 + 人生感悟，账号气质：温暖、真实、治愈、有力量。
像一个读过很多书、经历过生活的朋友，在夜晚和读者聊天。
不要像老师讲课，不要像专家分析，不要像营销号制造焦虑。

【目标读者】
25-45岁的女性。她们关注：如何提升自己、摆脱内耗、面对困境、成长改变、与自己和解、拥有更好的生活。
她们希望读完文章感受到"原来我也经历过""终于有人懂我""我想重新开始"。

【核心价值】
用书中的智慧，陪伴普通女性成长。不是单纯介绍一本书，而是通过一本书、一句话、一个人物故事，引发读者对自己人生的思考。

# 一、文章整体风格要求

1. 真实感：从具体的人、具体的事、具体的情绪开始，不要空泛大道理。
   ❌ "人生是一场漫长的旅程。""在这个快速发展的时代。""每个人都应该努力成为更好的自己。"
   ✅ "前几天，一个朋友跟我说，她越来越害怕三十岁以后的人生。""毕业几年后，我才慢慢明白……"

2. 情绪共鸣：让读者觉得"这说的就是我"。她们看的不是知识，是自己的影子。

3. 成长启发：不能停在情绪表达，要告诉读者"为什么会这样？我们该如何面对？怎样慢慢改变？"

4. 文学感：多生活细节、人物故事、内心独白；少概念、口号、总结。

# 二、文章结构要求

【标题】
先提供 10 个候选标题，再写作。标题要求：
- 有情绪冲击力，能引发点击
- 有读者痛点但不夸张标题党
- 推荐模板：《XXX》告诉我 / 读完《XXX》，我终于明白 / 那个曾经XXX的自己，终于被我原谅了 / 成年后才发现 / 人生最大的遗憾是 / 30岁以后，我终于接受了
- 情绪方向：成长、遗憾、孤独、治愈、改变、释怀、自我接纳
- **必须用字准确，绝不允许错别字、不允许凭空造字、不允许形近字替换**（如"原生家庭"绝不能错成"房牛家庭"），每个候选标题输出前在内部自查每个字

【开头】（≤300字）
- 先写一个现实场景：一个人的经历 / 朋友的故事 / 自己的某个瞬间 / 读者熟悉的生活困境
- 然后自然引出书籍，禁止"《XXX》是XX作家XX的代表作…"这种介绍式开场

【正文结构】
开头 + 3-4个章节 + 结尾。
每个章节要包含：①一个现实故事 ②一个情绪冲突 ③一本书中的观点 ④对现实生活的启发。
章节标题要有情绪感，不要"第一点/第二点"。示例：
- 01 那些不敢面对的自己
- 02 我们害怕的，从来不是失败
- 03 接纳自己，是人生最大的成长

【结尾】
不要喊口号（不要"所以，让我们一起努力""相信自己，你一定可以"这种鸡汤）。
温柔、有余韵、像和朋友聊天结束。账号常用收尾可以是：
- "愿我们慢慢学会，与过去的自己和解。"
- "人生没有标准答案，但每一步成长都有意义。"
- 也可以偶尔用一句话笔记收尾："一树书香，予我所想，与你慢慢说。"（不要每次都机械使用，看是否自然）

# 三、语言规则

【必须】
- 多用短句，多用生活化表达
- 多写人物细节，多写真实情绪
- 句子长短错落，有短句也有舒展长句

【减少】
- 大量排比、空泛总结、网络鸡汤
- 频繁使用 AI 套路语："在这个时代""我们都知道""不难发现""值得我们深思""具有重要意义""让我们明白""给予我们力量""实现人生价值"

# 四、人物故事规则

优先普通人（朋友、同事、自己、身边的人），拒绝"传奇逆袭"叙事。
人物要有缺点、犹豫、挣扎、改变——不完美才共鸣。

# 五、读书文章规则

不要写成读书笔记：不要作者介绍占大段、不要罗列书中内容。
书籍只是入口：书里一句话 → 现实一种困境 → 读者自己的经历 → 成长启发。
比例：生活内容 70%，书籍内容 30%。

# 六、爆款标准

生成前自问：
1. 这篇写给谁？她正在经历什么痛苦？
2. 为什么她会点开？哪句话会让她收藏？哪个故事会让她转发？

强共鸣开头 + 3+ 情绪触发点 + 3+ 值得收藏的句子 + 1 个回味结尾。`;
}

function buildSystemPrompt(profile) {
  const p = profile || {};
  const dims = (p.dimensions || []).map(d => `- ${d.label}：${d.content}`).join('\n');
  // 过滤掉会"机械强制模板"的死规则（编号小标题固定 / 愿我们强制收尾 / 写在最后段 / 固定结构 / slogan 强制结尾），
  // 保留声音类规则（你/我对话感、短句、书中金句、温暖基调），避免提示词自相矛盾。
  const RIGID = /01\s*\/\s*02\s*\/\s*03|编号小标题|愿我们|写在最后|文章结构[：:]|5段|引入\s*→|升华/;
  const softRules = (p.rules || []).filter(r => !RIGID.test(r));
  const rules = softRules.map((r, i) => `${i + 1}. ${r}`).join('\n') || '（无额外规则，按公众号风格画像自由发挥）';
  return `你是公众号「${p.publicAccount || '树予我说'}」的主笔「${p.author || '树予予'}」，一个${p.positioning || '女性成长陪伴型读书号'}的作者。

【写作风格指纹】
${p.fingerprint || '读书分享外壳+情感共鸣内核，温柔不说教，短句碎片化排版，祝福式金句收尾。'}

【风格维度参考】
${dims}

【你的风格基调（灵活把握，重神似不重形似）】
${rules}

${buildShuyuRules(p.author)}

【去AI味 · 写作铁律（优先级最高 · 与上方规则冲突时以本规则为准）】
- 拒绝机械套用模板。标题、开头、结构、节奏、段落长度、章节数都允许不同；不要每一篇都"开头场景→3个编号小标题→写在最后收尾"。
- 开头要自然落地：一个具体的瞬间、一句话、一个念头，而不是"我曾以为 / 人生是一场"这种套话开头。
- 章节标题可以小标题化（01/02/03 或 纯文字都行），但**不要每篇都机械用编号**；当文章只有一两条主线时不必硬拆成 3-4 节，自然段更舒服。
- 段落长短随情绪流动，不要每段一样长、每段都分点。
- 排比偶尔用一二处就够了；严禁通篇排比，严禁"不是…而是…""有时候…有时候…有时候…"被用滥的句式反复出现。
- 结尾温暖真诚地收住：可以是一个具体的画面、一句轻声的感慨、一个开放的小问题；**不要每次都"写在最后"，不要每次都以"愿我们…"或 slogan 收尾**——只在它确实是最自然的结尾时才用，否则会读起来像流水线。
- 绝对不要这些 AI 套路语："在这个快节奏的时代""首先…其次…最后""总而言之""不难发现""我们要学会""人生就像""正如××所说""每个人都在努力成为更好的自己"。
- 像真人深夜给好朋友写的一段话：有具体的细节、有真实的犹豫和情绪起伏，不空泛、不喊口号、不居高临下。
- 可以适当引用书中原话，但要夹在你自己的感受里，不要写成读书汇报。

【输出格式】
- 第一行直接输出文章最终标题（不加"标题："前缀，不加书名号包裹整句标题）
- 空一行后输出正文
- 段落之间空一行
- 不要输出任何与文章无关的说明、注释或 markdown 符号（# * - 等）
- 不要输出候选标题列表，第一行就是最终采用的标题
- 直接采用最合适的标题进入正文，不要先列候选再写

【摘要与配图建议 · 运营辅助】
正文写完后，在文章最末尾用下面这种带 === 包裹的格式追加一份运营辅助信息（这部分不是正文，会被系统自动提取并单独展示，请勿把正文内容放进来）：
===摘要与配图建议===
【一句话摘要】不超过50字的一句话摘要
【朋友圈文案】不超过100字的朋友圈转发文案
【封面画面建议】封面图的中文画面描述（一句话）
【配图建议】各章节配图的中文建议（一句话或分条列出）
===`;
}

function buildUserPrompt(topic, extra, variant) {
  let s = `请围绕下面这个选题，写一篇完整的公众号文章（1500-2500字）：

【选题】${topic.title}`;
  if (topic.type) s += `\n【文章类型】${topic.type}`;
  if (topic.reason) s += `\n【选题理由/切入点】${topic.reason}`;
  s += `\n\n要求：内容必须紧扣这个选题本身展开，深入挖掘这个选题背后读者的真实痛点和情感需求，写出有具体细节、有真实感的内容，不要泛泛而谈。`;
  if (variant && variant.opening) s += `\n\n【本次开头灵感】${variant.opening}（只是灵感，可偏离，关键是自然落地）`;
  if (variant && variant.structure) s += `\n\n【本次结构灵感】${variant.structure}（只是灵感，可偏离，关键是流畅）`;
  if (extra) s += `\n\n【额外要求】${extra}`;
  return s;
}

// ====== Step 2: 写文章（AI 实时生成） ======
function renderStep2(el, container) {
  const topic = Storage.get('wechat_current_topic', null);
  const savedArticle = Storage.get('wechat_current_article', '');
  const savedTitle = Storage.get('wechat_current_title', topic?.title || '');
  const savedSummary = Storage.get('wechat_current_summary', '');
  const savedImgIdeas = Storage.get('wechat_current_imgideas', '');
  const aiReady = hasAiConfig();
  const cfg = loadAiConfig();

  el.innerHTML = `
    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:16px">\u270D\uFE0F</span>
        <span style="font-size:14px;font-weight:600;color:var(--text-title)">AI 实时写文章</span>
        <button class="btn btn-sm" id="aiConfigBtn" style="margin-left:auto">\u2699\uFE0F AI设置${aiReady ? '' : '（未配置）'}</button>
      </div>
      ${topic ? `<div style="font-size:13px;color:var(--text-body);margin-bottom:12px;padding:10px;background:var(--primary-bg);border-radius:8px">
        当前选题：<strong>${escapeHtml(topic.title)}</strong>
        ${topic.type ? `<span class="badge badge-gray" style="margin-left:8px">${escapeHtml(topic.type)}</span>` : ''}
      </div>` : `<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;padding:10px;background:var(--bg-input);border-radius:8px">
        还没选择选题，回上一步选一个选题，就可以让 AI 实时生成文章
      </div>`}
      ${aiReady ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">当前模型：${escapeHtml(cfg.model)}（实时生成，每次都不一样）</div>`
        : `<div style="font-size:12px;color:var(--amber);margin-bottom:10px;padding:8px 10px;background:rgba(245,158,11,0.08);border-radius:8px;line-height:1.6">
        \u26A0\uFE0F 还没配置 AI 模型。点右上角「AI设置」，1分钟搞定：推荐智谱GLM或硅基流动，<strong>注册就有免费模型</strong>，文章将由大模型根据选题+你的风格画像实时创作。</div>`}

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <button class="btn btn-primary" id="genArticleBtn" ${topic ? '' : 'disabled'}>\u2728 AI 生成文章</button>
        <button class="btn" id="regenArticleBtn" ${topic ? '' : 'disabled'}>\uD83D\uDD04 换个角度重写</button>
        <button class="btn" id="stopGenBtn" style="display:none;color:var(--red)">\u23F9 停止生成</button>
      </div>
      <div id="genStatus" style="display:none;font-size:12px;color:var(--primary);margin-bottom:10px">
        <span class="gen-dot"></span> AI 正在创作中，文字会实时出现在下方…
      </div>

      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input class="input" id="adjust_input" placeholder="对文章不满意？输入修改要求，如：开头换成故事式、第二段展开写…" style="flex:1">
        <button class="btn" id="adjustBtn" style="white-space:nowrap">\uD83E\uDE84 按要求修改</button>
      </div>

      <div class="field">
        <div style="display:flex;gap:8px;align-items:flex-end">
          <div style="flex:1;min-width:0">
            <label class="field-label">文章标题</label>
            <input class="input" id="article_title" value="${escapeAttr(savedTitle)}" placeholder="AI 生成后自动填入，也可手动修改">
          </div>
          <button class="btn" id="regenTitleBtn" style="white-space:nowrap;margin-bottom:1px" ${topic ? '' : 'disabled'}>🔄 换个标题</button>
        </div>
      </div>
      <div class="field">
        <label class="field-label">文章内容</label>
        <textarea class="textarea" id="article_content" style="min-height:400px;line-height:1.8" placeholder="点击「AI 生成文章」，文字会实时出现在这里；也可以直接手写或粘贴…">${escapeHtml(savedArticle)}</textarea>
      </div>
      <div class="field">
        <label class="field-label">摘要 / 朋友圈文案</label>
        <textarea class="textarea" id="article_summary" style="min-height:90px;line-height:1.7" placeholder="AI 生成后会自动填入：一句话摘要 + 朋友圈转发文案，也可手动修改">${escapeHtml(savedSummary)}</textarea>
      </div>
      <div class="field">
        <label class="field-label">封面 / 配图建议</label>
        <textarea class="textarea" id="article_imgideas" style="min-height:90px;line-height:1.7" placeholder="AI 生成后会自动填入：封面画面建议 + 各章节配图建议，也可手动修改">${escapeHtml(savedImgIdeas)}</textarea>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" id="saveDraftBtn">${Icons.edit} 保存草稿</button>
        <button class="btn btn-accent" id="saveLibBtn">💾 保存至文章库</button>
        <button class="btn" id="copyArticleBtn">${Icons.copy} 复制全文</button>
        <div class="spacer" style="flex:1"></div>
        <button class="btn btn-sm" id="clearArticleBtn">清空内容</button>
      </div>
    </div>

    <div style="display:flex;gap:8px">
      <button class="btn" id="backStep1">上一步</button>
      <button class="btn btn-primary" id="nextStep3" style="flex:1">下一步：AI检测 + 配图 →</button>
    </div>
  `;

  // 自动保存
  const titleInput = el.querySelector('#article_title');
  const contentInput = el.querySelector('#article_content');
  const summaryEl = el.querySelector('#article_summary');
  const imgIdeasEl = el.querySelector('#article_imgideas');
  titleInput.addEventListener('input', () => Storage.set('wechat_current_title', titleInput.value));
  contentInput.addEventListener('input', () => Storage.set('wechat_current_article', contentInput.value));
  summaryEl.addEventListener('input', () => Storage.set('wechat_current_summary', summaryEl.value));
  imgIdeasEl.addEventListener('input', () => Storage.set('wechat_current_imgideas', imgIdeasEl.value));

  const genBtn = el.querySelector('#genArticleBtn');
  const regenBtn = el.querySelector('#regenArticleBtn');
  const stopBtn = el.querySelector('#stopGenBtn');
  const adjustBtn = el.querySelector('#adjustBtn');
  const regenTitleBtn = el.querySelector('#regenTitleBtn');
  const statusEl = el.querySelector('#genStatus');

  el.querySelector('#aiConfigBtn').onclick = () => openAiConfigModal(() => renderStep2(el, container));

  const setGenerating = (on) => {
    genBtn.disabled = on || !topic;
    regenBtn.disabled = on || !topic;
    regenTitleBtn.disabled = on || !topic;
    adjustBtn.disabled = on;
    stopBtn.style.display = on ? 'inline-flex' : 'none';
    statusEl.style.display = on ? 'block' : 'none';
  };

  // 从 AI 输出中解析：标题（第一行）、正文、以及末尾的「摘要与配图建议」块。
  // 摘要与配图建议会被拆出来单独展示，绝不混进正文文本框。
  const parseArticle = (full) => {
    let summary = '';
    let imgIdeas = '';
    // 优先匹配 === 包裹的块
    const blockRe = /===\s*摘要与配图建议\s*===([\s\S]*?)===/;
    const m = full.match(blockRe);
    let block = null, cleaned = full;
    if (m) {
      block = m[1];
      cleaned = full.replace(blockRe, '').trim();
    } else {
      // 兜底：若模型没用 === 包裹，但末尾出现了摘要/配图标记，也把它从正文剥离
      const fm = full.match(/\n[ \t]*(摘要与配图建议|【一句话摘要】|【摘要】)[\s\S]*$/);
      if (fm) { block = fm[0].replace(/^\n[ \t]*/, ''); cleaned = full.slice(0, fm.index).trim(); }
    }
    if (block) {
      const labels = ['一句话摘要', '朋友圈文案', '封面画面建议', '配图建议'];
      const re = new RegExp('【?(' + labels.join('|') + ')】?\\s*([\\s\\S]*?)(?=【?(?:' + labels.join('|') + ')】?\\s*|$)', 'g');
      const map = {};
      let mm;
      while ((mm = re.exec(block)) !== null) { map[mm[1]] = mm[2].trim(); }
      summary = [map['一句话摘要'], map['朋友圈文案']].filter(Boolean).join('\n');
      imgIdeas = [map['封面画面建议'], map['配图建议']].filter(Boolean).join('\n');
    }
    const lines = cleaned.split('\n');
    let title = '';
    let bodyStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l) { title = l.replace(/^(标题[:：]\s*)/, '').replace(/^[《#\s]+|[》\s]+$/g, '').trim(); bodyStart = i + 1; break; }
    }
    const content = lines.slice(bodyStart).join('\n').replace(/^\s+/, '');
    return { title: title || '', content, summary, imgIdeas };
  };

  // 核心生成函数
  const runGenerate = async (messages, { replaceAll = true } = {}) => {
    if (!hasAiConfig()) { openAiConfigModal(() => renderStep2(el, container)); return; }
    currentAbort = new AbortController();
    setGenerating(true);
    if (replaceAll) { contentInput.value = ''; }
    try {
      const full = await aiChatStream(messages, {
        // API 限制 temperature 最多 2 位小数；这里取 0.82~1.00 之间抖动，每次两位小数
        temperature: Math.round((0.82 + Math.random() * 0.18) * 100) / 100,
        signal: currentAbort.signal,
        onDelta: (_d, all) => {
          if (replaceAll) {
            const { title, content, summary, imgIdeas } = parseArticle(all);
            titleInput.value = title;
            contentInput.value = content;
            if (summaryEl) summaryEl.value = summary;
            if (imgIdeasEl) imgIdeasEl.value = imgIdeas;
          } else {
            contentInput.value = all;
          }
          contentInput.scrollTop = contentInput.scrollHeight;
        },
      });
      if (replaceAll) {
        const { title, content, summary, imgIdeas } = parseArticle(full);
        titleInput.value = title;
        contentInput.value = content;
        if (summaryEl) summaryEl.value = summary;
        if (imgIdeasEl) imgIdeasEl.value = imgIdeas;
        Storage.set('wechat_current_title', title);
        Storage.set('wechat_current_article', content);
        Storage.set('wechat_current_summary', summary);
        Storage.set('wechat_current_imgideas', imgIdeas);
      } else {
        titleInput.value = titleInput.value;
        contentInput.value = full;
        Storage.set('wechat_current_article', full);
      }
      toast('生成完成，可以继续润色');
    } catch (e) {
      if (e.name === 'AbortError') {
        Storage.set('wechat_current_article', contentInput.value);
        if (summaryEl) Storage.set('wechat_current_summary', summaryEl.value);
        if (imgIdeasEl) Storage.set('wechat_current_imgideas', imgIdeasEl.value);
        toast('已停止生成');
      } else if (e.message === 'NO_CONFIG') {
        openAiConfigModal(() => renderStep2(el, container));
      } else {
        toast('生成失败：' + e.message);
      }
    } finally {
      setGenerating(false);
      currentAbort = null;
    }
  };

  const doGenerate = async (isRegen) => {
    if (!topic) { toast('请先在上一步选择一个选题'); return; }
    if (!isRegen && contentInput.value.trim()) {
      const ok = await confirmDialog({ title: '生成文章', message: '当前已有文章内容，生成会覆盖现有内容，确定继续吗？', confirmText: '生成' });
      if (!ok) return;
    }
    const profile = loadProfile();
    const extra = isRegen ? '请换一个全新的切入角度、开头方式和结构节奏重写这篇文章，与任何"常规写法"都不一样，但依然紧扣选题。' : '';
    const variant = { opening: pick(OPENING_INSPIRATIONS), structure: pick(STRUCTURE_INSPIRATIONS) };
    await runGenerate([
      { role: 'system', content: buildSystemPrompt(profile) },
      { role: 'user', content: buildUserPrompt(topic, extra, variant) },
    ]);
  };

  genBtn.onclick = () => doGenerate(false);
  regenBtn.onclick = () => doGenerate(true);
  stopBtn.onclick = () => { if (currentAbort) currentAbort.abort(); };

  // 重新生成标题（仅生成 1 个，实时打字显示）
  regenTitleBtn.onclick = async () => {
    if (!topic) { toast('请先在上一步选择一个选题'); return; }
    if (!hasAiConfig()) { openAiConfigModal(() => renderStep2(el, container)); return; }
    currentAbort = new AbortController();
    setGenerating(true);
    titleInput.value = '';
    const profile = loadProfile();
    const ctx = contentInput.value.trim()
      ? `\n\n【当前已写的正文片段】\n${contentInput.value.trim().slice(0, 600)}\n`
      : '';
    try {
      const full = await aiChatStream([
        { role: 'system', content: buildSystemPrompt(profile) },
        { role: 'user', content: `【选题】${topic.title}\n${ctx}\n【任务】\n只输出 1 个新的文章标题，要求：\n- 与本选题角度相关但要和之前的版本不同\n- 14-22 字，不出现错别字、不凭空造字、不形近字替换\n- 有共鸣感但不夸张标题党\n- 直接输出标题文本一行，不要任何前缀、不要"标题："、不要引号、不要选项编号、不要 Markdown 标题符号` },
      ], {
        temperature: Math.round((0.85 + Math.random() * 0.15) * 100) / 100,
        signal: currentAbort.signal,
        onDelta: (_d, all) => {
          // 实时打字到标题框（清掉可能的"标题："前缀及换行后的内容）
          titleInput.value = all.replace(/^(标题[:：]\s*)/, '').replace(/\n[\s\S]*/, '').trim();
        },
      });
      const clean = full.replace(/^(标题[:：]\s*)/, '').replace(/\n[\s\S]*/, '').replace(/^[《#\s]+|[》\s#]+$/g, '').trim();
      titleInput.value = clean;
      Storage.set('wechat_current_title', clean);
      toast('标题已更新');
    } catch (e) {
      if (e.name === 'AbortError') {
        toast('已停止生成');
      } else if (e.message === 'NO_CONFIG') {
        openAiConfigModal(() => renderStep2(el, container));
      } else {
        toast('标题生成失败：' + e.message);
      }
    } finally {
      setGenerating(false);
      currentAbort = null;
    }
  };

  // 按要求修改现有文章
  adjustBtn.onclick = async () => {
    const instruction = el.querySelector('#adjust_input').value.trim();
    const current = contentInput.value.trim();
    if (!instruction) { toast('请先输入修改要求'); return; }
    if (!current) { toast('还没有文章内容，先生成或写一篇吧'); return; }
    const profile = loadProfile();
    await runGenerate([
      { role: 'system', content: buildSystemPrompt(profile) },
      { role: 'user', content: `下面是我的公众号文章草稿：\n\n${titleInput.value ? '标题：' + titleInput.value + '\n\n' : ''}${current}\n\n请按这个要求修改：${instruction}\n\n要求：保持整体风格不变，只输出修改后的正文全文（不要输出标题行，不要任何解释说明）。` },
    ], { replaceAll: false });
  };

  el.querySelector('#saveDraftBtn').onclick = () => {
    Storage.set('wechat_current_title', titleInput.value);
    Storage.set('wechat_current_article', contentInput.value);
    Storage.set('wechat_current_summary', summaryEl.value);
    Storage.set('wechat_current_imgideas', imgIdeasEl.value);
    toast('草稿已保存');
  };

  // 保存至文章库（不清除当前编辑状态，可反复保存）
  el.querySelector('#saveLibBtn').onclick = () => {
    const titleVal = titleInput.value.trim() || '未命名文章';
    const contentVal = contentInput.value.trim();
    if (!contentVal) { toast('请先写一些内容再保存'); return; }
    const drafts = Storage.get(DRAFT_KEY, []);
    drafts.unshift({
      id: Storage.uid(),
      title: titleVal,
      content: contentVal,
      summary: summaryEl.value.trim(),
      imgIdeas: imgIdeasEl.value.trim(),
      covers: Storage.get('wechat_current_covers', []),
      aiChecks: Storage.get('wechat_ai_check_history', []),
      createdAt: Date.now(),
    });
    Storage.set(DRAFT_KEY, drafts);
    toast('已保存到文章库 ✅');
  };

  el.querySelector('#copyArticleBtn').onclick = () => {
    const text = contentInput.value.trim();
    if (!text) { toast('暂无内容可复制'); return; }
    copyText(text);
  };

  el.querySelector('#clearArticleBtn').onclick = () => {
    openModal({
      title: '清空文章',
      body: '<p>确定清空文章内容吗？此操作不可恢复。</p>',
      foot: '<button class="btn" id="ca_cancel">取消</button><button class="btn btn-primary" id="ca_ok" style="background:var(--red)">清空</button>'
    });
    document.getElementById('ca_cancel').onclick = closeModal;
    document.getElementById('ca_ok').onclick = () => {
      contentInput.value = '';
      Storage.set('wechat_current_article', '');
      closeModal();
      toast('已清空');
    };
  };

  el.querySelector('#backStep1').onclick = () => { Storage.set('wechat_jump_step', 1); renderContentGen(container); };
  el.querySelector('#nextStep3').onclick = () => {
    const content = contentInput.value.trim();
    if (!content) { toast('请先写一些内容'); return; }
    Storage.set('wechat_current_article', content);
    Storage.set('wechat_current_title', titleInput.value);
    Storage.set('wechat_jump_step', 3);
    renderContentGen(container);
  };
}

// ====== Step 3: AI检测 + 配图 ======
function renderStep3(el, container) {
  const article = Storage.get('wechat_current_article', '');
  const title = Storage.get('wechat_current_title', '');
  const history = Storage.get('wechat_ai_check_history', []);
  const covers = Storage.get('wechat_current_covers', []);
  const rerender = () => renderStep3(el, container);

  el.innerHTML = `
    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:16px">\uD83D\uDD0D</span>
        <span style="font-size:14px;font-weight:600;color:var(--text-title)">AI率检测</span>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.6">
        复制文章内容，粘贴到AI检测工具中检测，然后记录结果
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <a href="https://matrix.tencent.com/ai-detect/" target="_blank" class="btn btn-sm">朱雀AI检测</a>
        <a href="https://gptzero.me" target="_blank" class="btn btn-sm">GPTZero</a>
        <button class="btn btn-sm" id="copyArticleBtn">${Icons.copy} 复制文章</button>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:12px">
        <div class="field" style="flex:1">
          <label class="field-label">AI率（%）</label>
          <input class="input" id="ai_rate" type="number" placeholder="如 35" style="text-align:center">
        </div>
        <div class="field" style="flex:1">
          <label class="field-label">检测工具</label>
          <select class="input" id="ai_tool">
            <option value="朱雀AI检测">朱雀AI检测</option>
            <option value="GPTZero">GPTZero</option>
            <option value="Originality.ai">Originality.ai</option>
            <option value="其他">其他</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">备注</label>
        <input class="input" id="ai_note" placeholder="如：某些段落AI痕迹明显，需要手动改写">
      </div>
      <button class="btn btn-primary" id="saveAiCheck" style="width:100%">记录结果</button>
    </div>

    ${history.length > 0 ? `
      <div class="section-title">检测历史 <span class="cat-count">${history.length}</span></div>
      <div class="list mb-16">
        ${history.map(h => `
          <div class="list-item" style="display:block;padding:12px 16px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:20px;font-weight:700;color:${h.rate <= 30 ? 'var(--primary)' : h.rate <= 60 ? 'var(--amber)' : 'var(--red)'}">${h.rate}%</span>
              <span class="badge badge-gray">${escapeHtml(h.tool)}</span>
              <span style="font-size:12px;color:var(--text-muted);margin-left:auto">${new Date(h.time).toLocaleString()}</span>
            </div>
            ${h.note ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${escapeHtml(h.note)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="card card-pad mb-16">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:16px">\uD83C\uDFA8</span>
        <span style="font-size:14px;font-weight:600;color:var(--text-title)">配图管理</span>
        ${canGenerateImage() ? `<span style="font-size:11px;color:var(--text-muted);margin-left:auto">模型：${escapeHtml(currentImageModel() || '')}</span>` : ''}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.6">
        AI 读全文自动规划 3~4 张配图并直接生成真实图片（封面 + 正文插图）。${canGenerateImage() ? '' : '<span style="color:var(--amber)">当前 AI 服务商不支持文生图，请在写文章页「AI设置」切到<strong>智谱GLM</strong>（cogview 免费）或<strong>硅基流动</strong>。</span>'}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-primary" id="autoCoverBtn">\u2728 根据文章自动配图</button>
        <button class="btn" id="addCoverBtn">${Icons.plus} 手动添加</button>
        <button class="btn btn-sm" id="stopCoverBtn" style="display:none;color:var(--red)">\u23F9 停止</button>
      </div>
      <div id="coverGenStatus" style="display:none;font-size:12px;color:var(--primary);margin-bottom:10px">
        <span class="gen-dot"></span> <span id="coverGenText">AI 正在规划配图…</span>
      </div>
      <div id="coverList" class="cover-grid">
        ${covers.length === 0 ? `<div class="empty" style="padding:20px;grid-column:1/-1"><div class="empty-icon">\uD83D\uDDBC\uFE0F</div><div class="empty-title">还没有配图</div><div class="empty-desc">点「根据文章自动配图」，AI 自动生成</div></div>` :
          covers.map((c, i) => renderCoverCard(c, i)).join('')}
      </div>
    </div>

    <div style="display:flex;gap:8px">
      <button class="btn" id="backStep2">上一步</button>
      <button class="btn btn-primary" id="finishBtn" style="flex:1">完成，存入文章库</button>
    </div>
  `;

  el.querySelector('#copyArticleBtn').onclick = () => copyText(article);

  el.querySelector('#saveAiCheck').onclick = () => {
    const rate = parseInt(el.querySelector('#ai_rate').value);
    if (isNaN(rate)) { toast('请输入AI率数值'); return; }
    const h = Storage.get('wechat_ai_check_history', []);
    h.unshift({ rate, tool: el.querySelector('#ai_tool').value, note: el.querySelector('#ai_note').value.trim(), time: Date.now() });
    Storage.set('wechat_ai_check_history', h);
    toast('已记录');
    rerender();
  };

  // ===== 根据文章自动配图 =====
  const coverStatus = el.querySelector('#coverGenStatus');
  const coverStatusText = el.querySelector('#coverGenText');
  const stopCoverBtn = el.querySelector('#stopCoverBtn');
  let coverAbort = null;

  const setCoverGenerating = (on, text) => {
    coverStatus.style.display = on ? 'block' : 'none';
    stopCoverBtn.style.display = on ? 'inline-flex' : 'none';
    el.querySelector('#autoCoverBtn').disabled = on;
    if (text && coverStatusText) coverStatusText.textContent = text;
  };

  stopCoverBtn.onclick = () => { if (coverAbort) coverAbort.abort(); };

  el.querySelector('#autoCoverBtn').onclick = async () => {
    if (!article.trim()) { toast('还没有文章内容，先去写文章'); return; }
    if (!hasAiConfig()) { openAiConfigModal(rerender); return; }
    const existing = Storage.get('wechat_current_covers', []);
    if (existing.length > 0) {
      const ok = await confirmDialog({ title: '自动配图', message: '将根据文章重新规划配图，会清空现有配图，确定继续吗？', confirmText: '继续' });
      if (!ok) return;
    }
    coverAbort = new AbortController();
    setCoverGenerating(true, 'AI 正在通读全文、规划配图方案…');
    try {
      // 1) 文本模型规划配图方案（JSON）
      const planPrompt = [
        { role: 'system', content: '你是资深公众号视觉编辑，擅长为女性成长/读书类温柔治愈风格的文章配图。只输出 JSON，不要任何多余文字。' },
        { role: 'user', content: `请阅读下面这篇公众号文章，为它规划 3~4 张配图（第一张必须是封面）。\n\n标题：${title}\n\n正文：\n${article.slice(0, 2000)}\n\n要求以 JSON 数组输出，每个元素形如：\n{"position":"封面/第一段后/第二段后/结尾","description":"一句话中文说明这张图的作用和画面","prompt":"用于AI绘画的详细画面描述，中文，具体到场景、主体、光线、色调、构图、氛围，整体为温柔治愈的女性成长读书号风格（暖色调、柔和光线、清新文艺、留白、莫兰迪色系），画面中不要出现任何文字"}\n\n只输出 JSON 数组本身。` },
      ];
      const planText = await aiChatStream(planPrompt, { temperature: 0.8, signal: coverAbort.signal });
      let plans;
      try {
        const m = planText.match(/\[[\s\S]*\]/);
        plans = JSON.parse(m ? m[0] : planText);
      } catch (e) {
        toast('配图方案解析失败，请重试');
        setCoverGenerating(false);
        return;
      }
      if (!Array.isArray(plans) || plans.length === 0) { toast('未生成有效配图方案'); setCoverGenerating(false); return; }

      // 先把方案（无图）写入并渲染，让用户看到进度
      const covers = plans.slice(0, 4).map(p => ({
        position: p.position || '配图',
        description: p.description || '',
        prompt: p.prompt || p.description || '',
        image: '',
        loading: canGenerateImage(),
      }));
      Storage.set('wechat_current_covers', covers);

      if (!canGenerateImage()) {
        covers.forEach(c => c.loading = false);
        Storage.set('wechat_current_covers', covers);
        toast('配图方案已生成（当前服务商不支持出图，可去 AI 设置切换后逐张生成）');
        setCoverGenerating(false);
        rerender();
        return;
      }

      // 2) 逐张生成真实图片
      rerender();
      for (let i = 0; i < covers.length; i++) {
        if (coverAbort.signal.aborted) break;
        setCoverGenerating(true, `正在生成第 ${i + 1}/${covers.length} 张配图…`);
        try {
          const r = await aiGenerateImageClean(covers[i].prompt, { size: '1024x1024', signal: coverAbort.signal });
          covers[i].image = await storeImage(r.image);
          covers[i].raw = !r.cleaned; // raw=true 表示未能裁掉水印，展示时用 CSS 裁剪兜底
          addToImageLibrary(covers[i].image, covers[i].prompt, covers[i].position, title);
        } catch (e) {
          if (e.name === 'AbortError') break;
          covers[i].error = e.message;
        }
        covers[i].loading = false;
        Storage.set('wechat_current_covers', covers);
      }
      // 剩余未完成的取消 loading
      covers.forEach(c => { if (c.loading) c.loading = false; });
      Storage.set('wechat_current_covers', covers);
      toast('配图生成完成');
    } catch (e) {
      if (e.name === 'AbortError') toast('已停止');
      else if (e.message === 'NO_CONFIG') openAiConfigModal(rerender);
      else toast('生成失败：' + e.message);
    } finally {
      setCoverGenerating(false);
      coverAbort = null;
      rerender();
    }
  };

  // 单张重新生成
  el.querySelectorAll('.cover-regen').forEach(btn => {
    btn.onclick = async () => {
      const idx = parseInt(btn.dataset.idx);
      const c = Storage.get('wechat_current_covers', []);
      const item = c[idx];
      if (!item) return;
      if (!canGenerateImage()) { toast('当前 AI 服务商不支持文生图，请去写文章页「AI设置」切换到智谱GLM或硅基流动'); return; }
      const prompt = item.prompt || item.description;
      if (!prompt) { toast('这张配图没有画面描述，先编辑补充'); return; }
      c[idx].loading = true; c[idx].error = null;
      Storage.set('wechat_current_covers', c);
      rerender();
      try {
        const r = await aiGenerateImageClean(prompt, { size: '1024x1024' });
        const cur = Storage.get('wechat_current_covers', []);
        cur[idx].image = await storeImage(r.image); cur[idx].raw = !r.cleaned; cur[idx].loading = false;
        Storage.set('wechat_current_covers', cur);
        addToImageLibrary(cur[idx].image, prompt, cur[idx].position, document.getElementById('article_title')?.value || '');
        toast('已重新生成');
      } catch (e) {
        const cur = Storage.get('wechat_current_covers', []);
        cur[idx].loading = false; cur[idx].error = e.message;
        Storage.set('wechat_current_covers', cur);
        toast('生成失败：' + e.message);
      }
      rerender();
    };
  });

  // 下载图片
  el.querySelectorAll('.cover-download').forEach(btn => {
    btn.onclick = async () => {
      const idx = parseInt(btn.dataset.idx);
      const c = Storage.get('wechat_current_covers', []);
      const item = c[idx];
      if (!item || !item.image) return;
      let imgSrc = item.image;
      // 云存储引用先解析成临时 URL（可直接 fetch 下载）
      if (imgSrc.startsWith('cloud://')) {
        try { imgSrc = await cloudUrl(imgSrc.slice('cloud://'.length)); } catch (e) { /* 失败则尝试新标签打开 */ }
      }
      // 未去水印的本地图（data:），下载前再尝试一次去水印（走跨域代理），成功则顺手存回干净版
      if (item.raw && imgSrc.startsWith('data:image')) {
        try {
          const clean = await stripWatermark(imgSrc);
          imgSrc = clean;
          const cur = Storage.get('wechat_current_covers', []);
          if (cur[idx]) { cur[idx].image = clean; cur[idx].raw = false; Storage.set('wechat_current_covers', cur); rerender(); }
        } catch (e) { /* 仍失败则下载原图 */ }
      }
      try {
        const resp = await fetch(imgSrc);
        const blob = await resp.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `配图_${item.position || idx + 1}.${imgSrc.startsWith('data:image/jpeg') ? 'jpg' : 'png'}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch (e) {
        // 跨域下载失败时兜底：新标签打开
        window.open(item.image, '_blank');
      }
    };
  });

  el.querySelector('#addCoverBtn').onclick = () => {
    openModal({
      title: '手动添加配图',
      body: `
        <div class="field"><label class="field-label">配图位置</label>
          <select class="input" id="cover_pos">
            <option value="封面">封面</option>
            <option value="第一段后">第一段后</option>
            <option value="第二段后">第二段后</option>
            <option value="第三段后">第三段后</option>
            <option value="结尾">结尾</option>
          </select></div>
        <div class="field"><label class="field-label">画面描述 / AI绘画提示词</label>
          <textarea class="textarea" id="cover_desc" style="min-height:100px" placeholder="详细的画面描述，保存后可点「重新生成」出图"></textarea></div>`,
      foot: `<button class="btn" id="c_cancel">取消</button><button class="btn btn-primary" id="c_save">添加</button>`
    });
    document.getElementById('c_cancel').onclick = closeModal;
    document.getElementById('c_save').onclick = () => {
      const pos = document.getElementById('cover_pos').value;
      const desc = document.getElementById('cover_desc').value.trim();
      if (!desc) { toast('请填写画面描述'); return; }
      const c = Storage.get('wechat_current_covers', []);
      c.push({ position: pos, description: desc, prompt: desc, image: '' });
      Storage.set('wechat_current_covers', c);
      closeModal();
      toast('已添加，可点「重新生成」出图');
      rerender();
    };
  };

  el.querySelectorAll('.cover-del').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      const c = Storage.get('wechat_current_covers', []);
      c.splice(idx, 1);
      Storage.set('wechat_current_covers', c);
      rerender();
    };
  });

  el.querySelectorAll('.cover-edit').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      const c = Storage.get('wechat_current_covers', []);
      const item = c[idx];
      if (!item) return;
      openModal({
        title: '编辑配图',
        body: `
          <div class="field"><label class="field-label">配图位置</label>
            <select class="input" id="ec_pos">
              <option value="封面" ${item.position==='封面'?'selected':''}>封面</option>
              <option value="第一段后" ${item.position==='第一段后'?'selected':''}>第一段后</option>
              <option value="第二段后" ${item.position==='第二段后'?'selected':''}>第二段后</option>
              <option value="第三段后" ${item.position==='第三段后'?'selected':''}>第三段后</option>
              <option value="结尾" ${item.position==='结尾'?'selected':''}>结尾</option>
            </select></div>
          <div class="field"><label class="field-label">说明（卡片展示）</label>
            <input class="input" id="ec_desc" value="${escapeAttr(item.description)}"></div>
          <div class="field"><label class="field-label">AI绘画提示词（改后可重新生成）</label>
            <textarea class="textarea" id="ec_prompt" style="min-height:100px">${escapeHtml(item.prompt || item.description || '')}</textarea></div>`,
        foot: `<button class="btn" id="ec_cancel">取消</button><button class="btn btn-primary" id="ec_save">保存</button>`
      });
      document.getElementById('ec_cancel').onclick = closeModal;
      document.getElementById('ec_save').onclick = () => {
        c[idx].position = document.getElementById('ec_pos').value;
        c[idx].description = document.getElementById('ec_desc').value.trim();
        c[idx].prompt = document.getElementById('ec_prompt').value.trim();
        Storage.set('wechat_current_covers', c);
        closeModal();
        toast('已更新');
        rerender();
      };
    };
  });

  el.querySelector('#backStep2').onclick = () => { Storage.set('wechat_jump_step', 2); renderContentGen(container); };
  el.querySelector('#finishBtn').onclick = () => {
    // 保存到文章库（wechat_drafts）
    const drafts = Storage.get(DRAFT_KEY, []);
    drafts.unshift({
      id: Storage.uid(),
      title: title || '未命名文章',
      content: article,
      summary: Storage.get('wechat_current_summary', ''),
      imgIdeas: Storage.get('wechat_current_imgideas', ''),
      covers: Storage.get('wechat_current_covers', []),
      aiChecks: Storage.get('wechat_ai_check_history', []),
      createdAt: Date.now(),
    });
    Storage.set(DRAFT_KEY, drafts);
    // 清理当前状态
    Storage.set('wechat_current_topic', null);
    Storage.set('wechat_current_article', '');
    Storage.set('wechat_current_title', '');
    Storage.set('wechat_current_summary', '');
    Storage.set('wechat_current_imgideas', '');
    Storage.set('wechat_current_covers', []);
    toast('文章已保存到文章库！');
    // 跳转到文章库查看
    if (window.__wbNavigate) window.__wbNavigate('wechat-library');
    else { Storage.set('wechat_jump_step', 1); renderContentGen(container); }
  };
}
