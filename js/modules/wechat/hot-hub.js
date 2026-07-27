// hot-hub.js — 热点·爆款：热点搜集 + 爆款工具箱 合并菜单（顶部大标签切换）
import { Storage } from '../../storage.js';
import { renderHotSearch } from './hot-search.js';
import { renderTopicTools } from './topic-tools.js';

const TAB_KEY = 'wechat_hothub_tab'; // 'hot' | 'tools'

export function renderHotHub(container) {
  const tab = Storage.get(TAB_KEY, 'hot');
  container.innerHTML = `
    <div class="hothub-tabs" style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn ${tab === 'hot' ? 'btn-primary' : ''}" id="hubTabHot" style="flex:1;max-width:200px">🔥 热点搜集</button>
      <button class="btn ${tab === 'tools' ? 'btn-primary' : ''}" id="hubTabTools" style="flex:1;max-width:200px">💥 爆款工具箱</button>
    </div>
    <div id="hubInner"></div>
  `;
  container.querySelector('#hubTabHot').onclick = () => { Storage.set(TAB_KEY, 'hot'); renderHotHub(container); };
  container.querySelector('#hubTabTools').onclick = () => { Storage.set(TAB_KEY, 'tools'); renderHotHub(container); };

  const inner = container.querySelector('#hubInner');
  if (tab === 'tools') renderTopicTools(inner);
  else renderHotSearch(inner);
}
