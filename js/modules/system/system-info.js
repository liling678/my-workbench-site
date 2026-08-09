// system-info.js — 系统信息：版本号、更新日志、运行状态诊断
import { registerStandalone } from '../../registry.js';
import { toast, escapeHtml } from '../../ui.js';

// ⚠️ 每次部署前更新这里：APP_VERSION 与 sw.js 的 CACHE 版本号保持一致
export const APP_VERSION = 'v38';
export const APP_DATE = '2026-08-09';

// 清理残留的旧版本缓存：只保留 wb-app-<version>，删除其它 wb-app-* 键，
// 避免多个版本缓存并存导致「本机缓存与代码版本不一致」的误报。
async function cleanupStaleCaches(version) {
  if (!('caches' in window)) return;
  const expected = 'wb-app-' + version;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('wb-app-') && k !== expected).map(k => caches.delete(k)));
  } catch (e) { /* 忽略清理失败 */ }
}

// 更新日志（新的放最上面）
const CHANGELOG = [
  {
    version: 'v38', date: '2026-08-09',
    items: [
      '月度打卡表体验优化：年度目标文本框加大（ck-goal-text-lg）完整显示备考主线+关键节点+成果预期',
      '月度目标默认自动规划（按月份给出阶段化目标，8-12月各有专属规划），未手动保存时回填默认；按月存储天然保留每月历史，可用‹上月/下月›回看',
      '每日打卡格子改为「就地更新」：点格子不再整表重渲，解决点周日格后视图跳回顶部、每点一次都要重新滑动的问题',
      '每日打卡表格去掉多余的整表拉伸留白（width:auto），打卡目标列与日期列之间不再有大段空格',
      '每日打卡视图去掉「当月完成」列；顶部图例（完成/部分/未完成）改为换行显示在标题下方，表头一行完整展示',
      '统计页默认展示当月（切换 tab 自动定位当前月，仍可用月份导航查看历史）',
    ],
  },
  {
    version: 'v37', date: '2026-08-09',
    items: [
      '总览目标页拆分：总体目标输入框缩小为「一句话总览」，备考主线与关键考试节点统一移入「年度目标」',
    ],
  },
  {
    version: 'v36', date: '2026-08-09',
    items: [
      '打卡状态升级为三态：完成 / 部分完成 / 未完成，点格子循环切换（空→完成→部分→未完成）',
      '补卡规则：仅今日与昨日可打卡，更早的过往日自动置灰锁定，避免拖延补卡',
      '每日打卡表改为「本周 7 天」视图，每周一自然切换到当周（标题显示本周日期范围）',
      '新增「打卡总览」页：整月完整打卡表格（31 天 × 项目）实时更新，支持按月查看，补卡规则同样生效',
      '每日打卡表下方新增「今日记录」文本框，按天存储今日完成情况 / 学习状态 / 未达成原因',
      '统计页按三态重算：完成次数 / 部分次数 / 打卡覆盖率 / 日均完成项，每周与各项目分完成·部分·未完成',
    ],
  },
  {
    version: 'v35', date: '2026-08-09',
    items: [
      '月度打卡表改造：总览目标（总体+年度合并一页）、月度目标（含月度总结，按月存储）、阅读目标、每日打卡、统计 五个分区',
      '所有目标输入框默认置灰（disabled），点「✏️ 编辑」可改、点「💾 保存」后重新置灰并持久化',
      '打卡项默认规则调整：泡脚每周≥3次、早睡23:00前、穿搭/化妆每周≥2次不限周末；每日打卡项目支持管理（增删改）',
      '每日打卡表移除「月度总结」列（移至月度目标页）；新增「统计」页自动汇总当月总打卡 / 日均 / 覆盖率 / 每周 / 各项目月度完成',
    ],
  },
  {
    version: 'v34', date: '2026-08-09',
    items: [
      '新增独立菜单「月度打卡表」：含总体目标 / 阅读目标 / 年度目标 / 每日打卡 四个分区',
      '每日打卡为可勾选的月度表格：序号｜打卡目标｜1-31 日期列｜当月完成｜月度总结，周末列浅绿标注，底部「每日完成合计」按天统计',
      '内置固定 14 项打卡项目与执行规则、三阶段备注（即日起-10.10 / 10.11-10.24 / 10.25-12.06）、宽松豁免规则；支持按月切换、数据按月独立保存，长期复用',
    ],
  },
  {
    version: 'v33', date: '2026-08-09',
    items: [
      '目标倒计时样式重做：按目标数量自适应布局（1 个=横向大卡，2 个=并排方形，3 个=三列方形），更简洁美观',
      '倒计时卡片改为居中方块、加描边、圆角更大，剩余天数与日期清晰分层',
    ],
  },
  {
    version: 'v32', date: '2026-08-09',
    items: [
      '目标倒计时支持多个：首页在「每日一句」下方以列表展示所有未过期目标（名称 / 剩余天数 / 日期），最多显示 3 个，超出提示「管理」查看',
      '目标倒计时位置调整：从原打卡下方移到问候卡片（每日一句）正下方，打开更顺手',
      '云同步诊断增强：上传/拉取提示明确列出「已纳入同步的全部模块数据（共 N 类，含每日计划/打卡/体重/爆款选题/文章库/图片库/灵感库等），仅本地配置与同步日志除外」，一眼确认数据全量互通',
    ],
  },
  {
    version: 'v31', date: '2026-08-05',
    items: [
      '修复「每日计划没有记忆功能、看不到前面记录」：首页每日计划新增「日期切换 / 历史回看」，可翻看任意一天的计划和完成状态',
      '每日任务、打卡、体重均按查看日期展示；历史日只读不可编辑（避免误改过去记录），点「今天」一键回到当日',
      '自动任务（运动/心情/Biubiu 等）回看历史时按当天数据实时推断完成状态',
    ],
  },
  {
    version: 'v30', date: '2026-08-05',
    items: [
      '修复「其他数据能同步、照片拉不下来」：根因是 GitHub Contents API 单文件 1MB 限制，带照片的 JSON 超限被拒，云端只剩不含照片的旧数据',
      '云端读写改用 Git 数据库 API（blob→tree→commit→更新引用），单文件上限 100MB，照片等大体积 base64 数据可正常同步',
      '拉取新增「本地写入失败」检测：若手机端因 localStorage 配额不足导致照片等键写不进，会明确提示，不再静默丢失',
    ],
  },
  {
    version: 'v29', date: '2026-08-05',
    items: [
      '云同步增加「强制覆盖」按钮：电脑「以本地为准覆盖云端」、手机「以云端为准覆盖本地」，流程确定不再歧义',
      '拉取/上传结果新增诊断信息：实际生效的仓库、同步码、远端条目数、云端文件最后更新时间，一眼看出「云端是不是电脑刚传的」',
      '「一致」提示增加指引：若刚在电脑改了数据，请先在电脑点「上传到云端」再拉取',
    ],
  },
  {
    version: 'v28', date: '2026-08-05',
    items: [
      '修复「手机端升级到 v27 但拉取逻辑仍是旧版」：SW 对 js/css 改为 network-first，联网时永远返回最新代码，避免 PWA 一直跑缓存里的旧 cloud-sync.js',
      '拉取诊断增强：明确区分「云端文件不存在(404)」与「数据一致」，404 时提示检查两设备的仓库/同步码是否一致',
      '识别代理把 404 伪装成 200 空内容、以及代理返回非 JSON 的情况，给出明确报错而非误判为无数据',
    ],
  },
  {
    version: 'v27', date: '2026-08-05',
    items: [
      '修复「电脑上传后手机拉取提示没有新数据」：给云端读取增加 cache-busting 与 no-cache 头，避免 CORS 代理/浏览器缓存返回旧文件',
      '同步日志（cloud_sync_log）不再随数据一起同步，各设备保留自己的上传/拉取记录',
      '拉取无更新时提示改为「云端数据与本地一致（无更新）」，减少误判',
    ],
  },
  {
    version: 'v26', date: '2026-08-04',
    items: [
      '「爆款选题生成」数据源扩展到 6 个：微博/知乎/头条/抖音/百度 + 综合聚合源(vvhan)，多源失败自动跳过并跨源去重',
      '新增「去重过滤层」：生成前把最近 3 批历史选题喂给 AI 主动避开，生成后再用中文 bigram 相似度二次过滤本批与历史重复项',
      '结果卡片新增「已过滤 N 个重复」标识，热榜预览条显示数据源数量与每条来源标签，AI 温度提高以增加多样性',
    ],
  },
  {
    version: 'v25', date: '2026-08-04',
    items: [
      '「爆款选题生成」接入微博/知乎/头条实时热榜，AI 基于当下真实热点生成选题，避免每次内容雷同',
      '生成前强制刷新热榜，结果卡片新增「来源」字段与「基于 N 条实时热榜」标识',
      '新增「刷新热榜」按钮，可手动查看当前前 8 条实时热点；热榜拉取失败时自动走 AI 兜底',
    ],
  },
  {
    version: 'v24', date: '2026-07-28',
    items: [
      '新增「公众号排版」模块：给文章+配图自动排版成手机阅读样式，一键复制可粘贴到公众号/秀米的内联样式 HTML',
      '支持从文章库载入文章与配图，或空白粘贴；配图可来自图片库、本地上传或网址，可排序/加图注',
      '正文支持轻量标记：# 小标题、> 引用、--- 分隔、【图】在指定位置插入配图；「智能穿插」自动分布配图',
      '4 套排版主题（文艺绿/米白/深夜蓝/治愈粉），手机预览实时所见即所得；可保存排版模板复用',
    ],
  },
  {
    version: 'v23', date: '2026-07-28',
    items: [
      '修复英语学习顶部日期/倒计时框在手机端被旧进度条样式压缩为 6px、文字显示不完整的问题',
      '新增考公学习模块「为人民服务」：资深考公老师设计的 12 周在职备考路线，覆盖行测、申论、常识与时政',
      '考公模块内置周一到周日训练模板，每天按真实日期自动显示今日任务并支持完成打卡',
      '支持设置开始日期/考试日期、自动显示备考天数与倒计时；整体路线和每日任务均可手动编辑、增删及调整星期',
    ],
  },
  {
    version: 'v22', date: '2026-07-28',
    items: [
      '英语学习模块升级为「老师排好的计划」：首次打开自动种入整体备考路线(基础→分项突破→冲刺三阶段) + 周一到周日每日训练模板',
      '新增日期进度：设置开始/考试日期后，顶部自动显示「备考第 N 天·第 M 周·距考试 D 天」，每天打开自动更新',
      '新增「整体备考规划」卡片（可点「编辑整体规划」自由改写老师给的路线）',
      '每日计划可手动增删改，今日任务按日期勾选、跨天自动重置；具体练习仍用用户自己的 App',
    ],
  },
  {
    version: 'v21', date: '2026-07-28',
    items: [
      '英语学习模块大瘦身：删除单词库/口语/听力/阅读/写作/备考中心等所有复杂功能',
      '英语学习改为极简「每日学习计划」：按周一~周日安排每天要学什么，今日计划可勾选完成（按日期记录、跨天重置）',
      '具体背单词/口语练习交给用户自己的 App，工作台只负责列计划清单',
      '清理了随雅思模块产生的无用 CSS（翻卡、每日计划横幅、导入区等）',
    ],
  },
  {
    version: 'v20', date: '2026-07-27',
    items: [
      '单词库改为艾宾浩斯记忆曲线：每词记录学习日+阶段，第1/2/4/7/15/30天自动安排复习（当天学的词第二天必复习）',
      '单词库支持自动导入：一键导入雅思核心词(40个，自动去重) + 批量粘贴导入(支持/、|、逗号、空格、Tab分隔，自动识别词性)',
      '单词库新增「今日计划」横幅：显示当日新学/复习数量，点「开始今日学习」按艾宾浩斯队列练习',
      '雅思新增听力(素材库+精听/听写笔记)、阅读(同义替换词库+闪卡练习+通用错题本)、写作(语料库+练习记录)三个分项',
      '口语练习录音改为 base64 持久化保存，刷新页面后仍可回放（大录音>2MB不存，仅当次回放）',
      '备考中心新增「每日新词目标」设置，进度统计扩展为听说读写+错题多维',
    ],
  },
  {
    version: 'v19', date: '2026-07-27',
    items: [
      '新增雅思备考模块（资深老师设计）：单词库含 SRS 间隔重复记忆/复习、口语 Part1/2/3 话题卡+老师支招+录音陪练、备考中心（目标分/各科目标/考试日期/老师规划/笔记）',
      '首页计划页新增「目标倒计时」板块，可添加多个目标（如 10月24 软考）并自动显示剩余天数',
      '云端同步记录上传/拉取时间：同步设置弹窗内显示最近同步日志（含成功条数），传送成功一目了然',
      '按钮放大更易点按：复制/编辑/删除等图标按钮统一放大到 36px、图标 16px',
      'Baby 资料菜单图标改为爪印',
    ],
  },
  {
    version: 'v18', date: '2026-07-27',
    items: [
      '修复：图片库「清空」后又自动补回的 bug（清空后禁止自动补录，需要历史图可点「从文章库补录」）',
      '配图真实感升级：强制「真实摄影照片」风格（胶片质感/浅景深/暖色调），禁插画CG感、禁手部/人脸/屏幕/文字',
      '宠物灵感库链接解析简化：粘链接点「确定」即自动抓取+AI总结入库（无需复制 prompt 给外部 AI）',
      '弹窗防误关：点遮罩不再直接关闭，改为抖动提示；未填写时弹窗保持并提示「请填写」（所有弹窗统一）',
      '所有删除按钮统一加二次确认弹窗（宠物灵感/账号、运动打卡、赚钱点子、测试点、心情日记、Better Me、首页任务等）',
      '首页每日一句新增英文对照',
    ],
  },
  {
    version: 'v17', date: '2026-07-27',
    items: [
      '菜单调整：「热点搜集」和「爆款工具箱」合并为「热点·爆款」（顶部标签切换）',
      '新增「对标文章」独立菜单：从热点搜集里拆出来',
      '对标文章支持粘贴链接自动解析：自动抓取文章内容、AI 填充标题/公众号/标签/分析总结',
      '抓取失败时可粘贴全文，点「AI 解析填充」自动填好信息；支持查看/复制已存全文',
    ],
  },
  {
    version: 'v16', date: '2026-07-27',
    items: [
      '修复：摘要/朋友圈文案、封面/配图建议未自动填充（模型没按格式输出时自动补一次生成）',
      '内容生成页去掉「保存草稿」按钮（内容本来就实时自动保存），按钮排版对齐',
      '配图质量优化：禁止AI画手部/清晰人脸/电子屏幕（这些最容易画崩），优先静物风景',
      '文章库图片支持点击放大 + 保存，放大时自动去除AI水印并回存干净版',
      '修复：图片库入库静默失败（浏览器存储超限），改为自动腾空间重试，上限调整为60张',
      '图片库新增自动补录：打开时把文章库里漏掉的历史图片补进来',
    ],
  },
  {
    version: 'v15', date: '2026-07-27',
    items: [
      '新增「系统信息」菜单：版本号、更新日志、运行版本诊断、手动检查更新',
    ],
  },
  {
    version: 'v14.2', date: '2026-07-27',
    items: [
      '内容生成页新增「💾 保存至文章库」按钮（不清空当前内容，可反复保存）',
      '生成的文章不再夹带摘要/配图建议，拆分为两个独立文本框展示',
      '文章库「查看全文」显示摘要卡片和配图建议；「载入到生成器」一并恢复',
    ],
  },
  {
    version: 'v14.1', date: '2026-07-27',
    items: [
      '修复：选题「选用」后正确跳转到写文章步骤',
      '修复：文章生成后点「下一步」回到选题的 bug（现在正确进入检测配图）',
      '删除「发布记录」模块；完成保存改为直接存入文章库',
      '新增文章库（每次生成的文章自动记录）和图片库（每张配图自动入库，上限200张）',
      '重构文章 AI 分析弹窗：链接+全文输入，点确定直接分析',
      '去掉顶栏无用的搜索按钮',
      '标题旁新增「🔄换个标题」按钮；AI 提示词加错别字防护',
    ],
  },
  {
    version: 'v14', date: '2026-07-27',
    items: [
      '启用 GitHub Pages 固定域名 liling678.github.io/my-workbench-site（解决部署地址漂移）',
      '更新机制升级：打开时自动联网检查新版本，新版本就绪后自动刷新，无需手动操作',
    ],
  },
  {
    version: 'v8', date: '2026-07-26',
    items: [
      'GitHub 云同步支持多层网络兜底（自有代理 + 公开代理），新增网络自救指南',
      '云同步为纯手动模式：⬆ 上传到云端 / ⬇ 从云端拉取',
    ],
  },
  {
    version: 'v1-v7', date: '2026-07-25 ~ 07-26',
    items: [
      '工作台初版：每日计划首页（体重/打卡/任务）、测试相关、公众号、宠物bot、Biubiu大王、学习、Better Me、Make Money 等模块',
      '绿色主调 UI、移动端适配、PWA 离线支持',
      'GitHub 私有仓库云同步（多端数据互通）',
    ],
  },
];

const gearIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

export function initSystemInfo() {
  registerStandalone('system-info', {
    title: '系统信息',
    icon: gearIcon,
    render(container) {
      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">系统信息</div>
          <div class="page-desc">当前版本、更新日志与运行状态</div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div>
              <div style="font-size:13px;color:var(--text-muted)">代码版本（本次部署）</div>
              <div style="font-size:26px;font-weight:700;color:var(--primary)">${APP_VERSION}</div>
              <div style="font-size:12px;color:var(--text-muted)">发布日期：${APP_DATE}</div>
            </div>
            <button class="btn btn-primary" id="checkUpdateBtn">🔄 检查更新</button>
          </div>
          <div id="runStatus" style="margin-top:12px;font-size:13px;line-height:1.9;background:var(--bg-input);border-radius:8px;padding:10px 12px">正在读取运行状态…</div>
        </div>

        <div class="card">
          <div style="font-size:15px;font-weight:600;margin-bottom:12px">📋 更新日志</div>
          ${CHANGELOG.map(c => `
            <div style="margin-bottom:16px;padding-left:12px;border-left:3px solid var(--primary)">
              <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">
                <span style="font-weight:700;color:var(--primary)">${escapeHtml(c.version)}</span>
                <span style="font-size:12px;color:var(--text-muted)">${escapeHtml(c.date)}</span>
              </div>
              <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.9;color:var(--text)">
                ${c.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      `;

      // —— 运行状态诊断：本机 SW 缓存版本 vs 代码版本 ——
      const statusEl = container.querySelector('#runStatus');
      async function renderRunStatus() {
        const lines = [];
        try {
          if ('caches' in window) {
            // 先清理残留的旧版本缓存（只保留期望版本），避免「多缓存并存」造成误报
            await cleanupStaleCaches(APP_VERSION);
            const keys = await caches.keys();
            const wbKeys = keys.filter(k => k.startsWith('wb-app-'));
            const expected = 'wb-app-' + APP_VERSION;
            // 只要期望版本缓存存在即视为正常；长度>1 的残留已在上面清理，不会再触发误报
            const ok = wbKeys.includes(expected);
            lines.push(`本机缓存版本：<b>${escapeHtml(wbKeys.join(', ') || '(无)')}</b>`);
            lines.push(ok
              ? `✅ 你正在运行最新版本（${APP_VERSION}），缓存与代码一致`
              : `⚠️ 本机缺少 ${expected} 缓存（当前仅 ${wbKeys.join(', ') || '无'}），点上方「检查更新」或彻底关闭应用后重开`);
          } else {
            lines.push('本机不支持缓存检测');
          }
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
              lines.push(`离线支持：✅ 已启用${reg.waiting ? '（有新版本等待接管，重开应用即可生效）' : ''}`);
            } else {
              lines.push('离线支持：未启用（可能是首次访问或非安全上下文）');
            }
          }
          lines.push(`访问地址：${escapeHtml(location.origin + location.pathname)}`);
        } catch (e) {
          lines.push('状态读取失败：' + escapeHtml(e.message || String(e)));
        }
        statusEl.innerHTML = lines.join('<br>');
      }
      renderRunStatus();

      // —— 手动检查更新 ——
      container.querySelector('#checkUpdateBtn').onclick = async () => {
        const btn = container.querySelector('#checkUpdateBtn');
        btn.disabled = true; btn.textContent = '检查中…';
        try {
          if (!('serviceWorker' in navigator)) {
            toast('当前环境不支持离线更新，已强制刷新');
            setTimeout(() => location.reload(), 600);
            return;
          }
          const reg = await navigator.serviceWorker.getRegistration();
          if (!reg) {
            toast('未检测到离线服务，已强制刷新');
            setTimeout(() => location.reload(), 600);
            return;
          }
          // 强制向网络拉取最新 sw.js（来自 github.io），连不上会抛错
          await reg.update();
          // 无论是否有新版本，都顺手清理旧缓存，消除「本机缓存与代码版本不一致」的误报
          await cleanupStaleCaches(APP_VERSION);
          if (reg.waiting || reg.installing) {
            toast('发现新版本，即将刷新页面');
            setTimeout(() => location.reload(), 1200);
          } else {
            // 重新渲染诊断，让误报立即消失
            await renderRunStatus();
            toast('已是最新版本（' + APP_VERSION + '），已清理旧缓存');
            btn.disabled = false; btn.textContent = '🔄 检查更新';
          }
        } catch (e) {
          const msg = (e && (e.message || e.name)) || '未知错误';
          const net = /network|failed|fetch|update|abort|timeout|load/i.test(msg);
          if (net) {
            toast('无法连接 GitHub Pages：手机端常因无 VPN 或被运营商拦截 github.io 导致。可开 VPN/换网络后重试；其实完全关闭并重开 App 也会自动更新');
          } else {
            toast('检查更新出错：' + String(msg).slice(0, 50));
          }
          btn.disabled = false; btn.textContent = '🔄 检查更新';
        }
      };
    },
  });
}
