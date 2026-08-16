// storage.js — 数据抽象层
// 当前实现：浏览器 localStorage + IndexedDB 本地双保险备份。
// 后续可整体替换为云数据库（腾讯云开发/Supabase），
// 只需保持 get/set/remove/uid/exportAll/importAll 接口不变，上层模块无需改动。

const PREFIX = 'wb_';
const afterSetHooks = [];

// 注册「写入后」回调，供云同步做增量推送（不破坏现有接口）
export function onAfterSet(fn) { afterSetHooks.push(fn); }

// ========== IndexedDB 本地双保险备份 ==========
const DB_NAME = 'wb-local-backup';
const DB_STORE = 'kv';
let dbPromise = null;

function openBackupDB() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
  }).catch(e => {
    console.warn('[storage] IndexedDB 备份打开失败', e);
    return null;
  });
  return dbPromise;
}

async function backupSet(key, val) {
  const db = await openBackupDB();
  if (!db) return;
  try {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(val, PREFIX + key);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  } catch (e) { console.warn('[storage] IndexedDB 备份写入失败', key, e); }
}

async function backupRemove(key) {
  const db = await openBackupDB();
  if (!db) return;
  try {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(PREFIX + key);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  } catch (e) { console.warn('[storage] IndexedDB 备份删除失败', key, e); }
}

export async function backupExport() {
  const db = await openBackupDB();
  if (!db) return {};
  try {
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAllKeys();
    const keys = await new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const data = {};
    for (const k of keys) {
      if (!k.startsWith(PREFIX)) continue;
      const vreq = store.get(k);
      const v = await new Promise((resolve, reject) => { vreq.onsuccess = () => resolve(vreq.result); vreq.onerror = () => reject(vreq.error); });
      data[k.slice(PREFIX.length)] = v;
    }
    return data;
  } catch (e) { console.warn('[storage] IndexedDB 备份导出失败', e); return {}; }
}

// 启动时：如果 localStorage 里的业务数据明显少于 IndexedDB 备份，说明 localStorage 被浏览器清理了，自动从备份恢复。
export async function restoreFromBackupIfNeeded(opts = {}) {
  const localCount = countLocalDataKeys();
  if (localCount >= 3 && !opts.force) return { restored: false, reason: 'localStorage 数据充足，无需恢复', count: localCount };
  try {
    const backup = await backupExport();
    const backupKeys = Object.keys(backup);
    if (backupKeys.length === 0) return { restored: false, reason: 'IndexedDB 备份为空', count: localCount };
    if (backupKeys.length <= localCount && !opts.force) return { restored: false, reason: '备份数据量不大于本地，不覆盖', localCount, backupCount: backupKeys.length };
    for (const [k, v] of Object.entries(backup)) {
      try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { console.warn('[storage] 恢复时写入失败', k, e); }
    }
    return { restored: true, count: backupKeys.length };
  } catch (e) {
    console.warn('[storage] 从备份恢复失败', e);
    return { restored: false, reason: e.message };
  }
}

function countLocalDataKeys() {
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) n++;
  }
  return n;
}

export const Storage = {
  get(key, def = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : def;
    } catch (e) {
      console.warn('storage.get failed', key, e);
      return def;
    }
  },
  set(key, val) {
    let ok = true;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(val));
    } catch (e) {
      ok = false;
      console.warn('storage.set failed', key, e);
    }
    // 异步双写 IndexedDB（不阻塞主流程）
    backupSet(key, val).catch(() => {});
    for (const h of afterSetHooks) {
      try { h(key, val); } catch (e) { console.warn('afterSet hook error', e); }
    }
    return ok; // false = 写入失败（多为 localStorage 容量超限），调用方可感知并处理
  },
  remove(key) {
    localStorage.removeItem(PREFIX + key);
    backupRemove(key).catch(() => {});
  },
  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },
  // 导出全部数据为 JSON（备份）
  exportAll() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
      }
    }
    return data;
  },
  // 从 JSON 导入（恢复）
  importAll(data) {
    Object.entries(data).forEach(([k, v]) => this.set(k, v));
  }
};

// 页面加载时立即尝试从 IndexedDB 恢复（同步部分：localStorage 读取是同步的；恢复写回也是同步的）
(function initBackupRestore() {
  if (typeof window === 'undefined') return;
  // 给其它脚本一点执行时间，避免阻塞首屏渲染
  setTimeout(() => {
    restoreFromBackupIfNeeded().then(r => {
      if (r.restored) console.info('[storage] 已从 IndexedDB 备份恢复', r.count, '条数据');
      else console.info('[storage] 备份检查:', r.reason);
    });
  }, 0);
})();
