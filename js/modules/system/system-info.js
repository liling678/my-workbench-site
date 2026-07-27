// system-info.js — 系统信息：版本号、更新日志、运行状态诊断
import { registerStandalone } from '../../registry.js';
import { toast, escapeHtml } from '../../ui.js';

// ⚠️ 每次部署前更新这里：APP_VERSION 与 sw.js 的 CACHE 版本号保持一致
export const APP_VERSION = 'v16';
export const APP_DATE = '2026-07-27';

// 更新日志（新的放最上面）
const CHANGELOG = [
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
      (async () => {
        const lines = [];
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            const wbKeys = keys.filter(k => k.startsWith('wb-app-'));
            const running = wbKeys.length ? wbKeys.join(', ') : '(无)';
            const expected = 'wb-app-' + APP_VERSION;
            const ok = wbKeys.includes(expected) && wbKeys.length === 1;
            lines.push(`本机缓存版本：<b>${escapeHtml(running)}</b>`);
            lines.push(ok
              ? '✅ 你正在运行最新版本'
              : `⚠️ 本机缓存与代码版本(${expected})不一致，点上方「检查更新」或彻底关闭应用后重开`);
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
      })();

      // —— 手动检查更新 ——
      container.querySelector('#checkUpdateBtn').onclick = async () => {
        const btn = container.querySelector('#checkUpdateBtn');
        btn.disabled = true; btn.textContent = '检查中…';
        try {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
              await reg.update();
              toast('已检查更新，2 秒后自动刷新页面');
              setTimeout(() => location.reload(true), 2000);
              return;
            }
          }
          toast('未检测到离线服务，直接强制刷新');
          setTimeout(() => location.reload(true), 800);
        } catch (e) {
          toast('检查更新失败：' + (e.message || '网络异常'));
          btn.disabled = false; btn.textContent = '🔄 检查更新';
        }
      };
    },
  });
}
