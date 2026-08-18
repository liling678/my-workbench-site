// cloud-sync.js — GitHub 云同步（纯前端浏览器直连，零后端、零付费）
// 原理：把工作台全部数据（localStorage 全量）读写成你私有仓库内的一个 JSON 文件，
//       多设备填「相同的同步码」→ 读写同一文件 → 数据互通。同步码即密码（文件名）。
//       图片以 base64 形式打包进数据 JSON 一起同步，不单独上传文件。
// 数据隔离：文件名使用同步码，不同步码 → 不同文件 → 互相看不见。
// 分支隔离：数据统一写在独立分支 `wb-sync`，避免污染源码 main 分支。
// 同步模式：纯手动。不后台定时同步、也不在改数据时自动上传。
//          由用户在设置弹窗里点「⬆ 上传到云端」或「⬇ 从云端拉取」主动触发。
import { Storage, onAfterSet } from './storage.js';
import { openModal, closeModal, confirmDialog, toast, escapeHtml } from './ui.js';

const CONFIG_KEY = 'cloud_config';   // { pat, owner, repo, syncCode }
const TS_KEY = 'cloud_ts';           // { key: lastWriteTs } 用于逐 key last-write-wins
const SYNC_LOG_KEY = 'cloud_sync_log'; // { lastPush, lastPushCount, lastPull, lastPullCount }
const SYNC_BRANCH = 'wb-sync';       // 数据单独存此分支，避免污染源码 main 分支
// 国内网络常拦截 api.github.com 直连：先直连、失败后依次尝试多个公开 CORS 代理兜底。
// 代理按成功率大致排序（thingproxy 转发完整 header，最适合 GitHub API 的 PUT 带 token）。
// 代理格式说明：
//   - corsproxy.io:       https://corsproxy.io/?<encoded url>     (GET 友好，PUT 经常 403)
//   - allorigins.win:     https://api.allorigins.win/raw?url=<enc>（GET 友好，PUT 会被拒）
//   - codetabs.com:       https://api.codetabs.com/v1/proxy?url=<enc>
//   - thingproxy:         https://thingproxy.freeboard.io/fetch/<url>（保留所有 header，PUT 可用）
// 只有 thingproxy / corsproxy.io 之类支持完整 header 转发的代理才能带 PAT 做 PUT（写文件）。
const CORS_PROXIES = [
  { name: 'thingproxy',   build: u => 'https://thingproxy.freeboard.io/fetch/' + u },
  { name: 'corsproxy.io', build: u => 'https://corsproxy.io/?' + encodeURIComponent(u) },
  { name: 'allorigins',   build: u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
  { name: 'codetabs',     build: u => 'https://api.codetabs.com/v1/proxy?url=' + encodeURIComponent(u) }
];
// 失败过的代理名单（避免每个请求都重试已知失败的代理）
const deadProxies = new Set();

// 用户配置的「自有代理 URL」（如 Cloudflare Worker 地址，结尾带 ?url=）。
// 一旦配置，所有请求都优先走它（直连 GitHub 已知的网络问题就别再花时间探测了）。
function getCustomProxy() {
  try {
    const c = loadCloudConfig();
    if (c && c.customProxy) return normalizeProxy(c.customProxy);
  } catch (e) {}
  return null;
}

// ghFetch(url, options, overrideProxy?)
//   overrideProxy: 调用方临时传入的代理 URL 字符串（不走 storage），优先级最高。
//                  例如测试按钮想让用户输入框里的代理立即生效。
async function ghFetch(url, options = {}, overrideProxy = null) {
  // 0) 优先尝试调用方传入的「临时代理」（测试连接专用，不污染 storage）
  const fromOverride = overrideProxy ? normalizeProxy(overrideProxy) : null;
  // 1) 其次尝试用户保存的「自有代理」
  const fromConfig = getCustomProxy();
  const custom = fromOverride || fromConfig;
  if (custom) {
    const proxied = custom + encodeURIComponent(url);
    console.info('[cloud-sync] 走自定义代理:', custom, '+', decodeURIComponent(encodeURIComponent(url)).slice(0, 60), '...');
    try {
      const res = await fetch(proxied, options);
      if (res.ok) return res;
      console.warn('[cloud-sync] 自有代理返回', res.status, '，回退到内置代理');
    } catch (e) {
      console.warn('[cloud-sync] 自有代理网络错误：', e.message, '回退到内置代理');
    }
  }
  // 2) 先直连：网络通就根本不需要走代理
  if (!deadProxies.has('direct')) {
    try {
      const res = await fetch(url, options);
      if (res.ok || (res.status >= 400 && res.status < 500)) return res; // 4xx 走代理也没用，直接返回
      console.warn('[cloud-sync] 直连 GitHub 5xx:', res.status);
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      const isNet = msg.includes('failed to fetch') || msg.includes('networkerror') || e.name === 'TypeError';
      if (isNet) {
        console.warn('[cloud-sync] 直连 api.github.com 被当前网络拦截，切换公开 CORS 代理');
        deadProxies.add('direct');
      } else {
        throw e; // 业务错误直接抛
      }
    }
  }
  // 3) 依次尝试代理
  for (const proxy of CORS_PROXIES) {
    if (deadProxies.has(proxy.name)) continue;
    const proxied = proxy.build(url);
    try {
      const res = await fetch(proxied, options);
      if (res.ok) {
        console.info('[cloud-sync] CORS 代理生效：', proxy.name);
        return res;
      }
      console.warn('[cloud-sync] 代理', proxy.name, '返回', res.status, '，尝试下一个');
      deadProxies.add(proxy.name); // 4xx/5xx 视为该代理对此 URL 不可用
    } catch (e) {
      console.warn('[cloud-sync] 代理', proxy.name, '网络错误：', e.message);
      deadProxies.add(proxy.name);
    }
  }
  throw new Error('当前网络下直连 GitHub 与所有公开 CORS 代理都不可用。建议：在 Cloudflare Workers 免费部署一个自有代理（约 5 分钟），详见设置里的「网络自救指南」。');
}

// 把用户填的任意形式 URL 标准化成 "https://xxx/?url=" 格式（兼容：xxx/、xxx、xxx/?url=、xxx/?foo=bar 三种情况）
function normalizeProxy(raw) {
  if (!raw) return null;
  const base = String(raw).trim();
  if (!base) return null;
  const hasQuery = base.includes('?');
  if (hasQuery) {
    // 已有查询参数：在末尾加 &url=（除非已经以 = 或 & 结尾）
    if (base.endsWith('=') || base.endsWith('&')) return base;
    return base + '&url=';
  }
  // 无查询参数：在末尾加 /?url=（或 ?url= 如果没有 /）
  return base + (base.endsWith('/') ? '?url=' : '/?url=');
}

let ready = false;
let isPulling = false;           // 拉取中标记，防止拉取写回本地时触发自动上传
let autoPushTimer = null;        // 防抖自动上传定时器
let autoPushPending = false;     // 是否有待上传的改动

export function loadCloudConfig() { return Storage.get(CONFIG_KEY, null); }
function saveCloudConfig(c) { Storage.set(CONFIG_KEY, c); }
function loadTs() { return Storage.get(TS_KEY, {}); }
function saveTs(t) { Storage.set(TS_KEY, t); }
function loadSyncLog() { return Storage.get(SYNC_LOG_KEY, { history: [] }); }
function saveSyncLog(l) { Storage.set(SYNC_LOG_KEY, l); }
function addSyncHistory(record) {
  const log = loadSyncLog();
  log.history = log.history || [];
  log.history.unshift({ time: Date.now(), ...record });
  if (log.history.length > 20) log.history = log.history.slice(0, 20);
  saveSyncLog(log);
}

// 友好显示同步时间：今天/昨天 + 时分，更早则 MM-DD HH:mm
export function fmtSyncTime(ts) {
  if (!ts) return '从未';
  const d = new Date(ts);
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return '今天 ' + hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  const yesterday = y.getFullYear() === d.getFullYear() && y.getMonth() === d.getMonth() && y.getDate() === d.getDate();
  if (yesterday) return '昨天 ' + hm;
  return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + hm;
}

export function isCloudEnabled() {
  const c = loadCloudConfig();
  return !!(c && c.pat && c.owner && c.repo && c.syncCode);
}

// 记录本地改动时间，并在用户停止操作后自动防抖上传到云端。
// 拉取过程中写回本地时不触发自动上传，避免循环。
export function registerSyncHook() {
  onAfterSet((key) => {
    if (key === CONFIG_KEY || key === TS_KEY) return;
    const ts = loadTs();
    ts[key] = Date.now();
    saveTs(ts);
    scheduleAutoPush();
  });
}

// 防抖自动上传：改动后 8 秒内无新改动则静默上传，避免每次操作都发请求。
function scheduleAutoPush() {
  if (isPulling) return;
  if (!ready) return;
  autoPushPending = true;
  if (autoPushTimer) clearTimeout(autoPushTimer);
  autoPushTimer = setTimeout(() => {
    autoPushTimer = null;
    autoPushPending = false;
    pushNow(false).catch(() => {});
  }, 8000);
}

// 页面隐藏/关闭前尝试立即上传（尽力而为）
function flushAutoPush() {
  if (autoPushTimer) { clearTimeout(autoPushTimer); autoPushTimer = null; }
  if (autoPushPending && ready) {
    autoPushPending = false;
    pushNow(false).catch(() => {});
  }
}

// 启动时自动拉取：如果云端比本地新，静默合并到本地并刷新当前模块。
export async function autoPull(showToast = false) {
  if (!ready) return 0;
  try {
    const result = await pullAll();
    if (result.updated > 0) {
      try { window.dispatchEvent(new Event('wb-data-synced')); } catch (e) {}
    }
    return result.updated;
  } catch (e) {
    console.error('[cloud-sync] autoPull failed', e);
    return 0;
  }
}

if (typeof window !== 'undefined') {
  // 切后台 / 关闭前立即上传
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAutoPush();
  });
  window.addEventListener('pagehide', flushAutoPush);
  // beforeunload 用同步方式发送 Beacon（fetch keepalive），尽量减少关闭时丢数据
  window.addEventListener('beforeunload', () => {
    if (autoPushPending && ready) {
      try {
        const data = JSON.stringify({ ts: Date.now(), data: Storage.exportAll() });
        // 注意：GitHub API 不支持简单 Beacon，这里只能尽力发送 keepalive fetch
        // 真正可靠的上传依赖 visibilitychange/pagehide 的异步 pushNow
        if (navigator.sendBeacon) navigator.sendBeacon('', new Blob([data], { type: 'application/json' }));
      } catch (e) {}
    }
  });
}

function ghHeaders(extra = {}) {
  const c = loadCloudConfig();
  return Object.assign({
    'Authorization': 'Bearer ' + c.pat,
    'Accept': 'application/vnd.github+json'
  }, extra);
}

// 云端文件路径：data/<同步码>.json（同步码做文件名，天然隔离）
function filePath() {
  const c = loadCloudConfig();
  return 'data/' + encodeURIComponent(c.syncCode) + '.json';
}
function apiUrl(ref) {
  const c = loadCloudConfig();
  const p = filePath().split('/').map(encodeURIComponent).join('/');
  let u = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${p}`;
  if (ref) u += '?ref=' + encodeURIComponent(ref);
  return u;
}

// UTF-8 安全的 base64
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob((b64 || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// 确保数据分支存在（首次同步时创建，基于默认分支 HEAD）
async function ensureSyncBranch() {
  const c = loadCloudConfig();
  try {
    const refRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/refs/heads/${SYNC_BRANCH}`, { headers: ghHeaders() });
    if (refRes.ok) return;                  // 已存在，无需处理
    if (refRes.status !== 404) return;      // 其它错误忽略，交给后续写入逻辑
    // 基于默认分支 HEAD 创建 wb-sync 分支
    const repoRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}`, { headers: ghHeaders() });
    const repo = await repoRes.json();
    const def = repo.default_branch || 'main';
    const baseRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/refs/heads/${def}`, { headers: ghHeaders() });
    if (!baseRes.ok) return;
    const baseJson = await baseRes.json();
    await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/refs`, {
      method: 'POST',
      headers: ghHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ref: `refs/heads/${SYNC_BRANCH}`, sha: baseJson.object.sha })
    });
  } catch (e) { console.warn('ensureSyncBranch failed', e); }
}

// 初始化：配置完整即可启用同步，不再把「上传/拉取」按钮锁死在「启动时网络握手成功」上。
// 之前 ready 仅在启动连上 GitHub 验证仓库后才置 true，一旦重启时 GitHub 连不上（没开 VPN / 网络被拦），
// ready 会被置回 false，于是配置明明已保存、按钮却仍提示「请先点保存设置」，逼用户再点一次保存。
// 现在：ready 只代表「配置已完整」，真正的网络错误交给点击同步时的请求去报错。
export async function initCloud() {
  if (!isCloudEnabled()) { ready = false; return false; }
  // 配置已保存 → 允许尝试同步（关键修复：不再因启动网络握手失败而把 ready 置否）
  ready = true;
  try {
    const c = loadCloudConfig();
    const res = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}`, { headers: ghHeaders() });
    if (res.status === 401) {
      // Token 无效：明确提示，但 ready 仍保持 true（之后点同步也会报 401，逻辑一致）
      toast('GitHub Token 无效或权限不足（需勾 repo），请重新保存设置');
      setStatus('error');
    } else if (res.status === 404) {
      toast('仓库不存在，检查 Owner / Repository');
      setStatus('error');
    } else if (res.ok) {
      setStatus('idle');
      // 启动成功后：先等 IndexedDB 恢复完成，再静默拉取云端最新数据
      setTimeout(() => { autoPull(false); }, 1500);
    } else {
      // 其它 HTTP 错误：保持 ready=true，交由手动同步时反馈，不在此处打断用户
      console.warn('[cloud-sync] 启动连接检查返回', res.status, '，ready 仍保持 true');
    }
    return true;
  } catch (e) {
    // 网络被拦截（没开 VPN 等常见情况）：仅记录，不打扰用户；
    // ready 保持 true，点击「上传/拉取」时会真正尝试并给出网络错误提示。
    console.warn('[cloud-sync] 启动网络连接检查失败（配置已保存，ready 仍为 true，点击同步时会真实报错）：', e.message);
    return true;
  }
}

// 读取远端文件最后写入时间（commit 时间），用于诊断「云端是不是刚被某设备上传过」
async function fetchCommitDate() {
  try {
    const c = loadCloudConfig();
    const p = filePath().split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${c.owner}/${c.repo}/commits?path=${p}&sha=${SYNC_BRANCH}&per_page=1&_cb=${Date.now()}`;
    const res = await ghFetch(url, { headers: ghHeaders() });
    if (!res.ok) return null;
    const arr = await res.json();
    if (Array.isArray(arr) && arr[0] && arr[0].commit) {
      return arr[0].commit.author?.date || arr[0].commit.committer?.date || null;
    }
  } catch (e) { console.warn('fetchCommitDate failed', e); }
  return null;
}

// 读取远端文件（wb-sync 分支）
// 优先用 Git 数据库 API（支持 >1MB 大文件，照片等 base64 大体积数据不会被 Contents API 的 1MB 限制挡掉）；
// 若 Git API 失败，回退到 Contents API。
// 返回：
//   { notFound: true }            —— 文件/分支不存在
//   { sha, ts, data, raw, lastCommit } —— 正常
async function readRemote() {
  try {
    return await readRemoteGit();
  } catch (e) {
    console.warn('[cloud-sync] Git API 读取失败，回退 Contents API：', e.message);
    return await readRemoteContents();
  }
}

// Git 数据库 API 读取（支持大文件）
async function readRemoteGit() {
  const c = loadCloudConfig();
  const p = filePath();
  const refRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/refs/heads/${SYNC_BRANCH}`, { headers: ghHeaders() });
  if (refRes.status === 404) return { notFound: true };
  if (!refRes.ok) throw new Error('读取分支引用失败：HTTP ' + refRes.status);
  const ref = await refRes.json();
  const commitRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/commits/${ref.object.sha}`, { headers: ghHeaders() });
  if (!commitRes.ok) throw new Error('读取提交失败：HTTP ' + commitRes.status);
  const commit = await commitRes.json();
  const treeRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/trees/${commit.tree.sha}?recursive=1`, { headers: ghHeaders() });
  if (!treeRes.ok) throw new Error('读取树失败：HTTP ' + treeRes.status);
  const tree = await treeRes.json();
  const entry = (tree.tree || []).find(t => t.path === p);
  if (!entry) return { notFound: true };
  const blobRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/blobs/${entry.sha}`, { headers: ghHeaders() });
  if (!blobRes.ok) throw new Error('读取 blob 失败：HTTP ' + blobRes.status);
  const blob = await blobRes.json();
  if (typeof blob.content !== 'string') throw new Error('blob 内容异常（代理可能被拦截）');
  let parsed = {};
  try { parsed = JSON.parse(b64decode(blob.content)); } catch (e) { parsed = {}; }
  const lastCommit = await fetchCommitDate();
  return { sha: ref.object.sha, ts: parsed.ts || {}, data: parsed.data || {}, raw: blob, lastCommit };
}

// Contents API 读取（兜底，单文件 1MB 限制，仅用于 Git API 不可用时）
async function readRemoteContents() {
  const base = apiUrl(SYNC_BRANCH);
  const url = base + (base.includes('?') ? '&' : '?') + '_cb=' + Date.now();
  const res = await ghFetch(url, {
    headers: ghHeaders({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' })
  });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('读取云端失败：HTTP ' + res.status);
  let json;
  try { json = await res.json(); }
  catch (e) { throw new Error('云端返回的不是合法 JSON（很可能代理失效/返回了错误页）'); }
  if (json && typeof json.message === 'string' && /not found|no such|does not exist/i.test(json.message)) return { notFound: true };
  if (json && json.message && /bad credentials|401/i.test(json.message)) throw new Error('GitHub Token 无效（401），请重新生成并保存');
  if (typeof json.content !== 'string') throw new Error('云端返回异常：缺少 content 字段（代理可能被拦截）' + JSON.stringify(json).slice(0, 120));
  let parsed = {};
  try { parsed = JSON.parse(b64decode(json.content)); } catch (e) { parsed = {}; }
  const lastCommit = await fetchCommitDate();
  return { sha: json.sha, ts: parsed.ts || {}, data: parsed.data || {}, raw: json, lastCommit };
}

// 把本地数据合并写入远端（逐 key last-write-wins）
// 使用 Git 数据库 API 写入（创建 blob → tree → commit → 更新分支引用），单文件上限 100MB，
// 彻底规避 Contents API 的 1MB 限制，照片等大体积 base64 数据也能同步。
// opts.force=true：以本地为准，云端只保留本地有的键（清除云端独有、本地已删的键）
async function writeRemote(opts = {}) {
  await ensureSyncBranch();
  const local = Storage.exportAll();
  const localTs = loadTs();
  let remote = null;
  try { remote = await readRemote(); } catch (e) { remote = null; }
  // readRemote 现在可能返回 { notFound:true }（文件/分支不存在），按「空远端」处理
  const rTs = (remote && !remote.notFound) ? (remote.ts || {}) : {};
  const rData = (remote && !remote.notFound) ? (remote.data || {}) : {};
  const newTs = Object.assign({}, rTs);
  const newData = Object.assign({}, rData);
  let pushed = 0;
  const localKeys = Object.keys(local).filter(k => k !== CONFIG_KEY && k !== TS_KEY && k !== SYNC_LOG_KEY);
  if (opts.force) {
    // 强制覆盖：云端完全以本地为准，丢掉云端独有键
    for (const key of localKeys) {
      const changed = !Object.prototype.hasOwnProperty.call(rData, key) || JSON.stringify(rData[key]) !== JSON.stringify(local[key]);
      newData[key] = local[key];
      newTs[key] = Math.max(localTs[key] || 0, Date.now());
      if (changed) pushed++;
    }
    // 清除云端有但本地没有的键
    for (const key of Object.keys(rData)) {
      if (!localKeys.includes(key)) { delete newData[key]; delete newTs[key]; pushed++; }
    }
  } else {
    for (const [key, value] of Object.entries(local)) {
      // 配置、时间戳、同步日志都是设备本地状态，不需要跨设备同步
      if (key === CONFIG_KEY || key === TS_KEY || key === SYNC_LOG_KEY) continue;
      const hasRemote = Object.prototype.hasOwnProperty.call(rData, key);
      const sameValue = hasRemote && JSON.stringify(rData[key]) === JSON.stringify(value);
      // 只要远端没有，或内容确实不同，就纳入本次手动上传。
      // 不再只依赖时间戳，避免历史数据和本地修改被误判为“没有新数据”。
      if (!sameValue) {
        newData[key] = value;
        newTs[key] = Math.max(localTs[key] || 0, Date.now());
        pushed++;
      }
    }
  }
  const contentB64 = b64encode(JSON.stringify({ ts: newTs, data: newData }));
  await writeFileGit(contentB64);
  return pushed;
}

// 通过 Git 数据库 API 写入文件（支持大文件）：blob → tree → commit → 更新分支引用
async function writeFileGit(contentB64) {
  const c = loadCloudConfig();
  const p = filePath();
  // 1) 创建 blob
  const blobRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/blobs`, {
    method: 'POST', headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content: contentB64, encoding: 'base64' })
  });
  if (!blobRes.ok) throw new Error('创建 blob 失败：' + blobRes.status);
  const blob = await blobRes.json();
  // 2) 取分支当前 HEAD 提交
  const refRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/refs/heads/${SYNC_BRANCH}`, { headers: ghHeaders() });
  if (!refRes.ok) throw new Error('读取分支引用失败：' + refRes.status);
  const ref = await refRes.json();
  const baseCommitSha = ref.object.sha;
  const commitRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders() });
  if (!commitRes.ok) throw new Error('读取提交失败：' + commitRes.status);
  const baseCommit = await commitRes.json();
  const baseTreeSha = baseCommit.tree.sha;
  // 3) 创建 tree（以当前树为基，覆盖目标文件）
  const treeRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/trees`, {
    method: 'POST', headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ base_tree: baseTreeSha, tree: [{ path: p, mode: '100644', type: 'blob', sha: blob.sha }] })
  });
  if (!treeRes.ok) throw new Error('创建树失败：' + treeRes.status);
  const newTree = await treeRes.json();
  // 4) 创建 commit
  const newCommitRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/commits`, {
    method: 'POST', headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message: 'workbench sync ' + new Date().toISOString(), tree: newTree.sha, parents: [baseCommitSha] })
  });
  if (!newCommitRes.ok) throw new Error('创建提交失败：' + newCommitRes.status);
  const newCommit = await newCommitRes.json();
  // 5) 更新分支引用指向新提交
  const updRes = await ghFetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/refs/heads/${SYNC_BRANCH}`, {
    method: 'PATCH', headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sha: newCommit.sha, force: true })
  });
  if (!updRes.ok) throw new Error('更新分支引用失败：' + updRes.status);
}

// 判断是否为纯对象（不含数组/null）
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// 智能合并两个值：避免「本地和云端不一致时直接互覆盖」导致丢数据。
// - 都是纯对象：逐键递归（兼容 daily_tasks 这种 {日期: [任务]} 的嵌套结构）
// - 都是「带 id 的对象数组」：按 id 取并集（本地新增项不会被云端覆盖掉）
// - 其它情况：以远端为准（保持原行为）
function deepMergeValues(localVal, remoteVal) {
  if (isPlainObject(localVal) && isPlainObject(remoteVal)) {
    const out = Object.assign({}, localVal);
    for (const k of Object.keys(remoteVal)) {
      if (Object.prototype.hasOwnProperty.call(out, k)) {
        out[k] = deepMergeValues(out[k], remoteVal[k]);
      } else {
        out[k] = remoteVal[k];
      }
    }
    return out;
  }
  const arrOk = Array.isArray(localVal) && Array.isArray(remoteVal) &&
    localVal.length > 0 && remoteVal.length > 0 &&
    localVal.every(x => x && x.id) && remoteVal.every(x => x && x.id);
  if (arrOk) {
    const seen = new Map();
    for (const x of remoteVal) seen.set(x.id, x);
    const merged = remoteVal.slice();
    for (const x of localVal) if (!seen.has(x.id)) merged.push(x);
    return merged;
  }
  return remoteVal;
}

// 拉取云端数据合并到本地（跨设备时钟不一致时用「值差异」兜底，避免漏拉）
// opts.force=true：以云端为准，本地只保留云端有的键（清除本地独有、云端没有的键）
// 返回 { updated, notFound, remoteKeys, sha, lastCommit }
export async function pullAll(opts = {}) {
  if (!ready) return { updated: 0, notFound: false };
  isPulling = true;
  try {
  const remote = await readRemote();
  if (!remote || remote.notFound) return { updated: 0, notFound: true };
  console.info('[cloud-sync] 读取远端文件', { sha: remote.sha, keys: Object.keys(remote.data).length, lastCommit: remote.lastCommit });
  const localTs = loadTs();
  let updated = 0;
  const failedWrites = [];   // 本地存储写入失败（配额不足）的键，用于提示用户
  if (opts.force) {
    // 强制覆盖：本地完全以云端为准，丢掉本地独有键
    const localAll = Storage.exportAll();
    for (const k of Object.keys(localAll)) {
      if (k === CONFIG_KEY || k === TS_KEY || k === SYNC_LOG_KEY) continue;
      if (!Object.prototype.hasOwnProperty.call(remote.data, k)) { Storage.remove(k); updated++; }
    }
  }
  for (const [key, value] of Object.entries(remote.data)) {
    // 不能只比时间戳：两台设备系统时钟可能不一致（一台快一台慢），纯时间戳比较会漏拉。
    // 改为：本地缺失 或 远端值不同 → 一律拉取（以值差异兜底，确保对端的新改动能下来）。
    const localVal = Storage.get(key, undefined);
    if (localVal === undefined) {
      // 本地缺失：直接拉取
      const ok = Storage.set(key, value);   // 可能因本地存储配额不足而失败（多为照片等大体积数据）
      if (!ok) failedWrites.push(key);
      localTs[key] = remote.ts[key] || Date.now();
      updated++;
    } else if (JSON.stringify(localVal) !== JSON.stringify(value)) {
      // 本地和云端都有且不一致：智能合并（按 id 并集 / 对象逐键递归），避免互相覆盖丢数据
      const merged = deepMergeValues(localVal, value);
      const ok = Storage.set(key, merged);
      if (!ok) failedWrites.push(key);
      localTs[key] = remote.ts[key] || Date.now();
      updated++;
    }
  }
  saveTs(localTs);
  return { updated, notFound: false, remoteKeys: Object.keys(remote.data).length, sha: remote.sha, lastCommit: remote.lastCommit, failedWrites };
  } finally {
    isPulling = false;
  }
}

// 把 ISO 时间转成「MM-DD HH:mm」本地显示（给云端 commit 时间用）
function fmtDateTime(iso) {
  if (!iso) return '未知';
  try {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  } catch (e) { return String(iso); }
}

// 诊断补全：在提示里带上当前生效的仓库/同步码/远端条目数/云端最后更新时间
// 同时明确告知「已同步全部模块数据」，让用户确认打卡/体重/每日计划/爆款选题等都在同步范围
function diagSuffix(result) {
  const cfg = loadCloudConfig() || {};
  const lc = result && result.lastCommit ? fmtDateTime(result.lastCommit) : '未知';
  const localData = Storage.exportAll();
  const localCount = Object.keys(localData).filter(k => k !== CONFIG_KEY && k !== TS_KEY && k !== SYNC_LOG_KEY).length;
  const scope = `\n已纳入同步的全部模块数据（每日计划/打卡/体重/爆款选题/文章库/图片库/灵感库/草稿等，共 ${localCount} 类；本地配置与同步日志除外）`;
  const tail = result
    ? `\n仓库=${cfg.repo || '?'} / 同步码=${cfg.syncCode || '?'} / 云端已存 ${result.remoteKeys} 条 / 最后更新：${lc}`
    : `\n仓库=${cfg.repo || '?'} / 同步码=${cfg.syncCode || '?'}`;
  return scope + tail;
}

// 手动「上传到云端」：把本地数据推送到 GitHub
// opts.force=true：以本地为准强制覆盖云端
export async function pushNow(showToast = true, opts = {}) {
  if (!ready) { if (showToast) toast('云同步未启用，请先保存设置'); return 0; }
  try {
    setStatus('syncing');
    const pushed = await writeRemote(opts);
    setStatus('ok');
    const log = loadSyncLog();
    log.lastPush = Date.now();
    log.lastPushCount = pushed;
    saveSyncLog(log);
    addSyncHistory({ dir: 'up', status: 'ok', count: pushed, message: pushed > 0 ? `已上传 ${pushed} 条` : '没有新数据需要上传' });
    if (showToast) {
      if (pushed > 0) {
        toast(`已上传 ${pushed} 条到云端` + diagSuffix());
      } else {
        // 云端已一致：核对远端，明确告诉用户「数据其实已在云端」，并确认待办在不在列
        let info = '';
        try {
          const remote = await readRemote();
          if (remote && !remote.notFound && remote.data) {
            const keys = Object.keys(remote.data);
            const t = remote.data.daily_tasks;
            const taskN = t ? Object.values(t).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0) : 0;
            info = `云端已是最新（共 ${keys.length} 类数据，含待办 ${taskN} 条，最后更新 ${fmtDateTime(remote.lastCommit)}）—— 数据已在云端，去另一台设备点「⬇ 从云端拉取」即可。`;
          } else {
            info = '云端暂无同步文件，但本机也无新改动需要上传。';
          }
        } catch (e) { info = '（无法核对云端，可能当前网络受限）'; }
        toast('没有新数据需要上传。' + info);
      }
    }
    updateSyncLogView();
    return pushed;
  } catch (e) {
    console.error('pushNow failed', e);
    setStatus('error');
    addSyncHistory({ dir: 'up', status: 'error', message: e.message || '网络错误' });
    if (showToast) toast('上传失败：' + (e.message || '网络错误'));
    updateSyncLogView();
    return 0;
  }
}

// 手动「从云端拉取」：把 GitHub 数据拉到本地，并在成功后刷新当前界面（无需重启）
// opts.force=true：以云端为准强制覆盖本地
export async function pullNow(showToast = true, opts = {}) {
  if (!ready) { if (showToast) toast('云同步未启用，请先保存设置'); return 0; }
  try {
    setStatus('syncing');
    const result = await pullAll(opts);
    setStatus('ok');
    const log = loadSyncLog();
    log.lastPull = Date.now();
    log.lastPullCount = result.updated;
    saveSyncLog(log);
    addSyncHistory({ dir: 'down', status: 'ok', count: result.updated, remoteKeys: result.remoteKeys, message: result.notFound ? '云端文件不存在' : result.updated > 0 ? `已拉取 ${result.updated} 条` : '云端与本地一致' });
    updateSyncLogView();
    // 关闭设置弹窗并刷新当前页面，让拉取的数据立即显示（无需重启）
    try { closeModal(); } catch (e) {}
    window.dispatchEvent(new Event('wb-data-synced'));
    if (showToast) {
      if (result.notFound) {
        const cfg = loadCloudConfig() || {};
        toast(`云端没有找到同步文件（404）。\n请确认手机端与电脑端的「仓库=${cfg.repo || '?'} / 同步码=${cfg.syncCode || '?'}」完全一致，且电脑端已成功上传到同一处`);
      } else if (result.updated > 0) {
        let msg = (opts.force ? `已强制覆盖拉取 ${result.updated} 条（以云端为准）` : `已从云端拉取 ${result.updated} 条`) + diagSuffix(result);
        if (result.failedWrites && result.failedWrites.length) {
          msg += `\n⚠️ 有 ${result.failedWrites.length} 条写入本机失败（多为照片等大体积数据，本地存储容量不足），请在电脑端压缩照片或减少照片数量后再同步`;
        }
        toast(msg);
      } else {
        toast(`云端数据与本地一致（无更新）` + diagSuffix(result) + `\n若你刚在电脑端改了数据，请先在电脑端点「⬆ 上传到云端」再拉取`);
      }
    }
    return result.updated;
  } catch (e) {
    console.error('pullNow failed', e);
    setStatus('error');
    addSyncHistory({ dir: 'down', status: 'error', message: e.message || '网络错误' });
    updateSyncLogView();
    if (showToast) toast('拉取失败：' + (e.message || '网络错误') + '\n（如网络被拦截，请在能连 GitHub 的网络下操作，或部署自有代理）');
    return 0;
  }
}

// ---------- UI ----------
function setStatus(s) {
  // 手动模式不显示顶栏状态按钮，只更新首页同步入口的文字状态。
  const pill = document.getElementById('dashSyncBtn');
  if (pill) {
    const label = { idle: '已配置', off: '云同步', syncing: '同步中…', ok: '已同步', error: '同步失败' }[s] || '云同步';
    pill.textContent = label;
    pill.dataset.status = s;
  }
}

// 顶栏同步状态按钮已移除：当前版本严格采用手动上传/拉取，避免造成自动同步的误解。

// 同步记录展示：设置弹窗内实时显示上次上传/拉取时间 + 最近操作历史（含失败）
function updateSyncLogView() {
  const el = document.getElementById('cloudSyncLog');
  if (!el) return;
  const log = loadSyncLog();
  const pushTxt = log.lastPush ? `${fmtSyncTime(log.lastPush)}（${log.lastPushCount} 条）` : '尚未上传';
  const pullTxt = log.lastPull ? `${fmtSyncTime(log.lastPull)}（${log.lastPullCount} 条）` : '尚未拉取';
  const history = (log.history || []).slice(0, 5);
  const histHtml = history.length === 0 ? '' : `
    <div style="margin-top:10px;padding-top:10px;border-top:0.5px dashed var(--border)">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">最近操作（含失败记录）</div>
      ${history.map(h => {
        const icon = h.dir === 'up' ? '⬆' : '⬇';
        const status = h.status === 'ok' ? '✅' : '❌';
        const count = h.count !== undefined ? `（${h.count} 条）` : '';
        return `<div class="sync-log-row" style="font-size:12px"><span class="sync-log-dot ${h.status === 'ok' ? 'up' : 'err'}"></span>${status} ${icon} ${fmtSyncTime(h.time)} ${count}${h.message ? ' · ' + escapeHtml(h.message) : ''}</div>`;
      }).join('')}
    </div>`;
  const idCfg = loadCloudConfig() || {};
  const identity = `
    <div class="sync-identity">
      <div class="sync-identity-title">🔑 本机同步身份（另一台设备必须<b>完全一致</b>，否则会读写不同的云端文件、互相看不到数据）</div>
      <div class="sync-identity-row">仓库：<b>${escapeHtml((idCfg.owner || '?') + '/' + (idCfg.repo || '?'))}</b></div>
      <div class="sync-identity-row">同步码：<b>${escapeHtml(idCfg.syncCode || '(未设置)')}</b></div>
    </div>`;
  el.innerHTML = `
    ${identity}
    <div class="sync-log-row"><span class="sync-log-dot up"></span>上次上传：<b>${pushTxt}</b></div>
    <div class="sync-log-row"><span class="sync-log-dot down"></span>上次拉取：<b>${pullTxt}</b></div>
    ${histHtml}`;
}

const GUIDE_STEPS = `
  <ol class="sync-steps">
    <li>登录 <a href="https://github.com" target="_blank" rel="noopener">GitHub</a>（你已建好 <code>liling678/my-workbench</code> 私有仓库）。</li>
    <li>打开 <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">GitHub Token 设置页</a> → 点 <b>Generate new token (classic)</b>。</li>
    <li>Note 随便填（如 workbench）；<b>Expiration 选 No expiration</b>（或自定义）；在权限里<b>勾选 repo</b>（整组勾上即可）→ 最底部 <b>Generate token</b>。</li>
    <li>复制生成的 token（<b>只显示一次</b>，形如 <code>ghp_xxxx</code>），粘贴到下面的「GitHub Token」。</li>
    <li>填好 Owner（你的用户名 <code>liling678</code>）、Repository（<code>my-workbench</code>）、同步码（自定义，建议英文/数字，如 <code>yuan2026</code>），点「保存设置」。</li>
    <li>之后在任一设备改完数据 → 点「⬆ 上传到云端」；在另一台设备点「⬇ 从云端拉取」即可同步（不会后台自动同步，一切手动）。</li>
  </ol>
  <div class="form-status">保存后本机历史数据需手动点「⬆ 上传到云端」才会写入 GitHub；另一台设备打开同一工作台、填<b>相同的 Token + 仓库 + 同步码</b>，再点「⬇ 从云端拉取」即可把记录（含照片与配图）拉下来。</div>
`;

// 网络自救：国内网络直连 api.github.com 经常被拦；公开 CORS 代理偶发也会挂。
// 最稳的办法：自己 5 分钟部署一个 Cloudflare Worker 中转（永久免费、国内可访问、PUT 带 token 全支持）。
// 在 Worker 里粘贴下面这段 JS，点 Save and Deploy → 拿到 xxx.workers.dev 地址 → 填到「自有代理 URL」。
const WORKER_SCRIPT = `// Cloudflare Worker —— GitHub API 反向代理（部署后填到工作台的「自有代理 URL」）
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    if (!target) return new Response('missing ?url=', { status: 400 });
    const apiReq = new Request(target, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
    });
    const apiRes = await fetch(apiReq);
    const out = new Response(apiRes.body, apiRes);
    out.headers.set('Access-Control-Allow-Origin', '*');
    out.headers.set('Access-Control-Allow-Headers', '*');
    out.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    return out;
  }
};`;

const NETWORK_HELP = `
  <div class="sync-network-help">
    <p><b>症状：</b>测试连接一直失败、控制台报 <code>ERR_CONNECTION_REFUSED</code> 或 <code>403 Forbidden</code>。</p>
    <p><b>原因：</b>当前网络下 <code>api.github.com</code> 被拦截，公开 CORS 代理（corsproxy.io / allorigins / codetabs / thingproxy）也不稳定。</p>
    <p><b>最稳方案（5 分钟，永久免费）：</b>用 Cloudflare Workers 部署一个你自己的反向代理。步骤：</p>
    <ol>
      <li>打开 <a href="https://dash.cloudflare.com/?to=/:account/workers" target="_blank" rel="noopener">Cloudflare 控制台 → Workers</a>，注册账号（免费）。</li>
      <li>点 Create Worker → 把下面这段 JS 整段粘贴进去 → 点 Save and Deploy。</li>
      <li>拿到形如 <code>https://xxx.workers.dev</code> 的地址，复制到本设置面板的<b>「自有代理 URL（可选）」</b>框里（结尾不带 <code>?url=</code>）。</li>
      <li>回到设置面板 → 点「保存设置」→ 再点「测试连接」应该就通了。</li>
    </ol>
    <details>
      <summary>👉 Worker 代码（点开复制）</summary>
      <pre class="worker-code">${WORKER_SCRIPT.replace(/</g, '&lt;')}</pre>
    </details>
  </div>
`;

export function openSyncSettings() {
  const cfg = loadCloudConfig() || { pat: '', owner: '', repo: '', syncCode: '', customProxy: '' };
  const enabled = isCloudEnabled();
  openModal({
    title: '云同步设置（GitHub 版 · 手动同步）',
    size: 'lg',
    body: `
      <div class="form-hint">
        多端填写<b>相同的 GitHub Token、仓库和同步码</b>即可共享数据。同步码相当于密码，请勿泄露。<br>
        数据存在你自己的私有仓库 <code>data/&lt;同步码&gt;.json</code> 里（独立 wb-sync 分支），纯前端直连 GitHub API，<b>零后端、零付费</b>。<br>
        <b>本工作台不会后台自动同步</b>，全部由你手动点「上传」或「拉取」触发。
      </div>
      <details class="sync-guide">
        <summary>📌 第一次用？点开看怎么准备（约 10 分钟，免费）</summary>
        ${GUIDE_STEPS}
      </details>
      <details class="sync-guide">
        <summary>🛟 测试连接一直失败？点开看网络自救指南（约 5 分钟）</summary>
        ${NETWORK_HELP}
      </details>
      <label class="form-label">GitHub Token（ghp_ 开头，仅存本机）</label>
      <input class="input" id="cloudPat" value="${escapeHtml(cfg.pat || '')}" placeholder="ghp_xxxx 个人访问令牌（需 repo 权限）" />
      <label class="form-label">Owner（仓库所有者用户名）</label>
      <input class="input" id="cloudOwner" value="${escapeHtml(cfg.owner || '')}" placeholder="例如 liling678" />
      <label class="form-label">Repository（仓库名）</label>
      <input class="input" id="cloudRepo" value="${escapeHtml(cfg.repo || '')}" placeholder="例如 my-workbench" />
      <label class="form-label">同步码（多端一致，相当于密码）</label>
      <input class="input" id="cloudCode" value="${escapeHtml(cfg.syncCode || '')}" placeholder="自定义，例如 yuan2026" />
      <label class="form-label">自有代理 URL（可选，<b>直连 GitHub 不通时填</b>）</label>
      <input class="input" id="cloudProxy" value="${escapeHtml(cfg.customProxy || '')}" placeholder="例：https://xxx.workers.dev/ （结尾有没有 ?url= 都可以，代码会自动补）" />
      <div class="form-hint" style="font-size:12px;color:#888;margin-top:-4px;margin-bottom:8px">
        填了之后所有请求都优先走这个代理（Cloudflare Worker 之类）。代码会自动识别并补 <code>?url=</code>，<b>不需要手动加</b>。
      </div>
      <div class="form-status" id="cloudStatus">${enabled ? '✅ 已启用（手动同步模式）' : '⚪ 未启用'}</div>

      <div class="sync-actions">
        <button class="btn btn-primary" id="cloudPullBtn">⬇ 从云端拉取</button>
        <button class="btn btn-ghost" id="cloudPushBtn">⬆ 上传到云端</button>
        <button class="btn btn-warn" id="cloudForcePullBtn">⬇ 强制覆盖拉取（以云端为准）</button>
        <button class="btn btn-warn" id="cloudForcePushBtn">⬆ 强制覆盖上传（以本地为准）</button>
      </div>
      <div class="form-hint" style="margin-top:6px">
        ⚠️ 「强制覆盖」会单向覆盖、不合并：手机点「强制拉取」会丢弃手机本地独有数据、完全变成云端内容；电脑点「强制上传」会用电脑数据覆盖云端（含删除云端独有键）。<b>标准同步请用上面两个普通按钮</b>，只有当普通拉取一直报「一致」却拿不到数据时，才用强制按钮确认流程。
      </div>
      <div class="sync-log" id="cloudSyncLog"></div>
      <div class="form-hint" style="margin-top:8px">
        用法：A 设备改完数据 → 点「⬆ 上传到云端」存到 GitHub；B 设备点「⬇ 从云端拉取」下载（拉取后界面自动刷新，无需重启）。
      </div>
    `,
    foot: `
      <button class="btn btn-ghost" id="cloudTestBtn">测试连接</button>
      <button class="btn btn-primary" id="cloudSaveBtn">保存设置</button>
    `
  });
  updateSyncLogView();
  document.getElementById('cloudTestBtn').onclick = async () => {
    const owner = document.getElementById('cloudOwner').value.trim();
    const repo = document.getElementById('cloudRepo').value.trim();
    const pat = document.getElementById('cloudPat').value.trim();
    const syncCode = document.getElementById('cloudCode').value.trim();
    const proxy = document.getElementById('cloudProxy').value.trim();
    if (!owner || !repo || !pat) { toast('先填 Owner / Repository / Token'); return; }
    // 把当前输入框的值先写入 storage，让后续读取同步文件等诊断逻辑用到最新配置
    deadProxies.clear();
    const cfg = loadCloudConfig() || { pat, owner, repo, syncCode: syncCode || '', customProxy: proxy };
    cfg.pat = pat; cfg.owner = owner; cfg.repo = repo;
    if (syncCode) cfg.syncCode = syncCode;
    if (proxy) cfg.customProxy = proxy;
    saveCloudConfig(cfg);
    ready = false;
    await initCloud();

    try {
      const res = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { 'Authorization': 'Bearer ' + pat, 'Accept': 'application/vnd.github+json' }
      }, proxy || null);
      if (res.status === 401) return toast('❌ Token 无效或权限不足（确认勾了 repo）');
      if (res.status === 404) return toast('❌ 仓库不存在，检查 Owner / Repository');
      if (!res.ok) return toast('❌ 连接失败：' + res.status);

      // 再尝试读取同步文件，给出更直观的诊断
      let fileInfo = '';
      if (syncCode) {
        try {
          const remote = await readRemote();
          if (remote && remote.notFound) {
            fileInfo = `\n⚠️ 云端还没有此同步码的数据文件。请先在另一设备点「上传到云端」。`;
          } else if (remote && remote.data) {
            const keys = Object.keys(remote.data).length;
            fileInfo = `\n同步文件存在：${keys} 条数据，云端最后更新：${fmtDateTime(remote.lastCommit)}`;
          } else {
            fileInfo = `\n读取同步文件返回异常`;
          }
        } catch (fe) { fileInfo = '\n读取同步文件时出错：' + (fe.message || '网络错误'); }
      } else {
        fileInfo = '\n填写「同步码」后可进一步检测云端数据文件。';
      }

      toast('✅ 连接成功，仓库可达' + fileInfo);
    } catch (e) { toast('连接失败：' + (e.message || '网络错误') + '\n点开上方「网络自救指南」看看怎么办'); }
  };
  document.getElementById('cloudSaveBtn').onclick = async () => {
    const owner = document.getElementById('cloudOwner').value.trim();
    const repo = document.getElementById('cloudRepo').value.trim();
    const pat = document.getElementById('cloudPat').value.trim();
    const syncCode = document.getElementById('cloudCode').value.trim();
    const customProxy = document.getElementById('cloudProxy').value.trim();
    if (!owner || !repo || !pat || !syncCode) { toast('四项都要填写'); return; }
    // 重置代理缓存（用户改了代理配置，让 deadProxies 失效，下次重新探测）
    deadProxies.clear();
    saveCloudConfig({ pat, owner, repo, syncCode, customProxy });
    ready = false;
    const ok = await initCloud();
    if (!ok) { toast('保存失败，检查 Token / 仓库或网络'); return; }
    const st = document.getElementById('cloudStatus');
    if (st) st.innerHTML = '✅ 已保存并验证通过（手动同步模式）';
    setStatus('idle');
    toast('设置已保存，可点「上传」或「拉取」');
  };
  document.getElementById('cloudPushBtn').onclick = async () => {
    if (!ready) { toast('请先点「保存设置」'); return; }
    await pushNow(true);
  };
  document.getElementById('cloudPullBtn').onclick = async () => {
    if (!ready) { toast('请先点「保存设置」'); return; }
    await pullNow(true);
  };
  document.getElementById('cloudForcePushBtn').onclick = async () => {
    if (!ready) { toast('请先点「保存设置」'); return; }
    const ok = await confirmDialog({ title: '强制覆盖上传', message: '将用本机数据完全覆盖云端（删除云端独有、本机没有的键）。\n确定继续？', confirmText: '强制上传', danger: true });
    if (ok) await pushNow(true, { force: true });
  };
  document.getElementById('cloudForcePullBtn').onclick = async () => {
    if (!ready) { toast('请先点「保存设置」'); return; }
    const ok = await confirmDialog({ title: '强制覆盖拉取', message: '将丢弃本机独有数据，完全变成云端内容。\n确定继续？', confirmText: '强制拉取', danger: true });
    if (ok) await pullNow(true, { force: true });
  };
}

// ===================== 图片同步（GitHub 模式） =====================
// GitHub 模式下图片以 base64 形式打包进数据 JSON 一起同步，不单独上传。
// 因此 storeImage 原样返回、cloudUrl 透传、无需图片 Hydrator。

export async function storeImage(src) {
  return src; // 图片随数据 JSON 同步，不上传单独文件
}

export async function cloudUrl(ref) {
  return ref; // data: 直接可用，其它透传
}

export function installCloudImageHydrator() {
  // GitHub 模式无需解析 supa://（已弃 Supabase），业务层用 base64 直接显示
}
