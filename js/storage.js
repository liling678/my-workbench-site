// storage.js — 数据抽象层
// 当前实现：浏览器 localStorage。后续可整体替换为云数据库（腾讯云开发/Supabase），
// 只需保持 get/set/remove/uid 接口不变，上层模块无需改动。

const PREFIX = 'wb_';
const afterSetHooks = [];

// 注册「写入后」回调，供云同步做增量推送（不破坏现有接口）
export function onAfterSet(fn) { afterSetHooks.push(fn); }

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
    for (const h of afterSetHooks) {
      try { h(key, val); } catch (e) { console.warn('afterSet hook error', e); }
    }
    return ok; // false = 写入失败（多为 localStorage 容量超限），调用方可感知并处理
  },
  remove(key) {
    localStorage.removeItem(PREFIX + key);
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
