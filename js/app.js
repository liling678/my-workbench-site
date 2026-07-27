// app.js — 启动器：侧边栏渲染、路由、模块加载
import {
  sections, standaloneModules, getModulesBySection, getModule,
  isSectionCollapsed, toggleSection, Icons,
  registerSection, registerModule, registerStandalone
} from './registry.js';
import { Storage } from './storage.js';
import { closeModal, openModal, toast, escapeHtml } from './ui.js';
import { initCloud, registerSyncHook, openSyncSettings } from './cloud-sync.js';

// 模块导入
import { initTestPoints } from './modules/testing/test-points.js';
import { initBugSummary } from './modules/testing/bug-summary.js';
import { initSkillLearning } from './modules/testing/skill-learning.js';
import { initOtherNotes } from './modules/testing/other-notes.js';
import { initDashboard } from './modules/home/dashboard.js';
import { initInspiration } from './modules/pet/inspiration.js';
import { initExercise } from './modules/life/exercise.js';
import { initMoodDiary } from './modules/life/mood-diary.js';
import { initBetterMe } from './modules/life/better-me.js';
import { initAppPlan } from './modules/app-dev/app-plan.js';
import { initWechatPlaceholders } from './modules/wechat/wechat-placeholders.js';
import { initBiubiu } from './modules/biubiu/biubiu.js';
import { initLearning } from './modules/learning/learning.js';
import { initMakeMoney } from './modules/money/make-money.js';
import { initBodyCare } from './modules/life/body-care.js';

// 注册所有板块和模块
function registerAll() {
  // 首页（独立，始终第一个）
  registerStandalone('dashboard', {
    title: '每日计划', icon: Icons.home, isHome: true,
    render: (c) => initDashboard(c)
  });

  // 测试相关
  registerSection('testing', '测试相关', { icon: Icons.testPoints });
  initTestPoints();
  initBugSummary();
  initSkillLearning();
  initOtherNotes();

  // 公主号生成中
  registerSection('wechat', '公主号生成中', { icon: Icons.wechat });
  initWechatPlaceholders();

  // 宠物bot
  registerSection('pet', '宠物bot', { icon: Icons.pet });
  initInspiration();

  // Biubiu大王
  initBiubiu();

  // 杂七杂八的学习
  initLearning();

  // 独立模块
  initExercise();
  initMoodDiary();
  initBetterMe();
  initAppPlan();
  initMakeMoney();
  initBodyCare();
}

// DOM 引用
const content = document.getElementById('content');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const menuBtn = document.getElementById('menuBtn');
const topbarTitle = document.getElementById('topbarTitle');
const sidebarNav = document.getElementById('sidebarNav');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const syncBtn = document.getElementById('syncBtn');

let currentModule = 'dashboard';

function openSidebar() {
  sidebar.classList.add('open');
  overlay.classList.add('show');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
}

function renderSidebar() {
  let html = '';

  // 首页
  const home = standaloneModules.find(m => m.isHome);
  if (home) {
    html += `<button class="nav-home ${currentModule === home.id ? 'active' : ''}" data-module="${home.id}">
      ${home.icon}<span>${home.title}</span>
    </button>`;
  }

  // 分组（折叠菜单）
  sections.forEach(sec => {
    const mods = getModulesBySection(sec.id);
    if (mods.length === 0) return;
    const collapsed = isSectionCollapsed(sec.id);
    const hasActive = mods.some(m => m.id === currentModule);
    const showCollapsed = collapsed && !hasActive; // 有活跃模块时强制展开
    html += `<div class="nav-section">
      <button class="nav-section-head" data-section="${sec.id}">
        <span class="nav-section-icon">${sec.icon || Icons.testPoints}</span>
        <span>${sec.title}</span>
        <span class="arrow ${showCollapsed ? 'collapsed' : ''}">${Icons.arrow}</span>
      </button>
      <div class="nav-section-modules ${showCollapsed ? 'collapsed' : ''}" data-section-modules="${sec.id}">`;
    mods.forEach(m => {
      html += `<button class="nav-module ${currentModule === m.id ? 'active' : ''}" data-module="${m.id}">
        ${m.icon || ''}<span>${m.title}</span>
        ${m.badge ? `<span class="nav-badge">${m.badge}</span>` : ''}
      </button>`;
    });
    html += `</div></div>`;
  });

  // 其他独立模块
  standaloneModules.filter(m => !m.isHome).forEach(m => {
    html += `<button class="nav-standalone ${currentModule === m.id ? 'active' : ''}" data-module="${m.id}">
      ${m.icon || ''}<span>${m.title}</span>
      ${m.badge ? `<span class="nav-badge">${m.badge}</span>` : ''}
    </button>`;
  });

  sidebarNav.innerHTML = html;

  // 绑定事件
  sidebarNav.querySelectorAll('[data-section]').forEach(btn => {
    btn.onclick = () => {
      const secId = btn.dataset.section;
      const isCol = toggleSection(secId);
      const arrow = btn.querySelector('.arrow');
      const modules = sidebarNav.querySelector(`[data-section-modules="${secId}"]`);
      const hasActive = getModulesBySection(secId).some(m => m.id === currentModule);
      const showCollapsed = isCol && !hasActive;
      if (arrow) arrow.classList.toggle('collapsed', showCollapsed);
      if (modules) modules.classList.toggle('collapsed', showCollapsed);
    };
  });

  sidebarNav.querySelectorAll('[data-module]').forEach(btn => {
    btn.onclick = () => {
      navigate(btn.dataset.module);
      if (window.innerWidth < 768) closeSidebar();
    };
  });
}

function navigate(moduleId) {
  const mod = getModule(moduleId);
  if (!mod) return;
  currentModule = moduleId;
  closeModal();
  topbarTitle.textContent = mod.title || '工作台';
  content.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'page';
  content.appendChild(page);
  try {
    mod.render(page);
  } catch (e) {
    console.error('Module render error:', e);
    page.innerHTML = `<div class="empty"><div class="empty-icon">!</div><div class="empty-title">模块加载失败</div><div class="empty-desc">${e.message}</div></div>`;
  }
  renderSidebar();
  content.scrollTop = 0;
}

// 导出数据：iOS / 第三方 WebView 优先用 Web Share API（可"存储到文件"/AirDrop），避开 a.download 被拦截
exportBtn.onclick = async () => {
  const data = Storage.exportAll();
  const json = JSON.stringify(data, null, 2);
  const filename = `workbench-backup-${new Date().toISOString().slice(0,10)}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '工作台备份' });
      toast('分享面板已打开，请选「存储到文件」/ AirDrop 等');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // 用户取消
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('数据已导出');
};

// 导入数据
importBtn.onclick = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        Storage.importAll(data);
        toast('数据已导入，刷新中...');
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        toast('导入失败：文件格式错误');
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

// 事件绑定
menuBtn.onclick = openSidebar;
overlay.onclick = closeSidebar;
if (syncBtn) syncBtn.onclick = openSyncSettings;

// 初始化
registerAll();
renderSidebar();
navigate('dashboard');

// 暴露给子模块（如 topic-tools 的「选用到内容生成」跳转），避免循环依赖
window.__wbNavigate = navigate;

// 云同步：只记录本地改动时间，不自动上传、不自动拉取
registerSyncHook();
(async () => {
  await initCloud();
})();

// 手动「从云端拉取」成功后，刷新当前正在查看的模块（无需重启即可看到数据）
window.addEventListener('wb-data-synced', () => {
  navigate(currentModule);
});
