// ai-service.js — 通用 AI 大模型调用服务（浏览器直连，OpenAI 兼容协议）
// 支持：智谱GLM（有免费模型）、DeepSeek、硅基流动（有免费模型）、自定义 OpenAI 兼容接口
import { Storage } from './storage.js';
import { openModal, closeModal, toast, escapeHtml } from './ui.js';

const AI_CONFIG_KEY = 'ai_config';

// 预设服务商（均已实测支持浏览器跨域直连）
export const AI_PROVIDERS = {
  zhipu: {
    name: '智谱GLM（有免费模型）',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4-flash', label: 'glm-4-flash（免费）' },
      { id: 'glm-4-air', label: 'glm-4-air（便宜）' },
      { id: 'glm-4-plus', label: 'glm-4-plus（效果好）' },
    ],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    keyTip: '注册智谱开放平台后，在「API keys」页面创建即可，glm-4-flash 模型完全免费',
  },
  siliconflow: {
    name: '硅基流动（有免费模型）',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B（免费）' },
      { id: 'THUDM/glm-4-9b-chat', label: 'GLM-4-9B（免费）' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5-72B（效果好）' },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3（效果好）' },
    ],
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    keyTip: '注册硅基流动后在「API密钥」页面创建，7B/9B 模型免费，注册还送额度',
  },
  deepseek: {
    name: 'DeepSeek（便宜好用）',
    baseUrl: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-chat', label: 'deepseek-chat（V3）' },
      { id: 'deepseek-reasoner', label: 'deepseek-reasoner（R1 推理）' },
    ],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyTip: '注册 DeepSeek 开放平台，充值后在「API keys」页面创建（写一篇文章约几分钱）',
  },
  custom: {
    name: '自定义（OpenAI 兼容）',
    baseUrl: '',
    models: [],
    keyUrl: '',
    keyTip: '任何 OpenAI 兼容接口：填入 Base URL（如 https://xxx/v1）、模型名和 API Key。注意：接口必须支持浏览器跨域（CORS）',
  },
};

export function loadAiConfig() {
  return Storage.get(AI_CONFIG_KEY, null);
}

export function saveAiConfig(cfg) {
  Storage.set(AI_CONFIG_KEY, cfg);
}

export function hasAiConfig() {
  const cfg = loadAiConfig();
  return !!(cfg && cfg.apiKey && cfg.baseUrl && cfg.model);
}

// ===== 核心：流式调用（SSE），onDelta 逐字回调 =====
export async function aiChatStream(messages, { temperature = 0.9, onDelta, signal } = {}) {
  const cfg = loadAiConfig();
  if (!cfg || !cfg.apiKey) throw new Error('NO_CONFIG');

  // API 限制 temperature 最多 2 位小数，统一在这里截断，防止调用方传 0.8234567... 被 400
  const safeTemp = Math.round(Number(temperature) * 100) / 100;

  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.apiKey,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: safeTemp,
      stream: true,
    }),
    signal,
  });

  if (!resp.ok) {
    let detail = '';
    try {
      const j = await resp.json();
      detail = j.error?.message || j.message || JSON.stringify(j).slice(0, 200);
    } catch (e) { detail = 'HTTP ' + resp.status; }
    if (resp.status === 401 || resp.status === 403) throw new Error('API Key 无效或没有权限：' + detail);
    if (resp.status === 429) throw new Error('请求太频繁或额度不足：' + detail);
    throw new Error('接口调用失败（' + resp.status + '）：' + detail);
  }

  // 解析 SSE 流
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // 留下不完整的最后一行
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith('data:')) continue;
      const data = l.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const delta = j.choices?.[0]?.delta?.content || '';
        if (delta) {
          full += delta;
          if (onDelta) onDelta(delta, full);
        }
      } catch (e) { /* 忽略解析失败的行 */ }
    }
  }
  return full;
}

// ===== 图片生成（文生图，OpenAI 兼容 /images/generations） =====
// 各服务商默认的图片模型（免费/便宜优先）
const IMAGE_MODELS = {
  zhipu: 'cogview-3-flash',          // 智谱：完全免费
  siliconflow: 'Kwai-Kolors/Kolors', // 硅基流动：Kolors
  deepseek: null,                     // DeepSeek 暂不支持文生图
  custom: null,                       // 自定义需填 imageModel
};

// 当前配置是否支持生成图片
export function canGenerateImage() {
  const cfg = loadAiConfig();
  if (!cfg || !cfg.apiKey) return false;
  if (cfg.provider === 'zhipu' || cfg.provider === 'siliconflow') return true;
  if (cfg.provider === 'custom' && cfg.imageModel) return true;
  return false;
}

// 返回当前可用的图片模型名（供界面提示）
export function currentImageModel() {
  const cfg = loadAiConfig();
  if (!cfg) return null;
  return cfg.imageModel || IMAGE_MODELS[cfg.provider] || null;
}

// 生成单张图片，返回图片 URL
export async function aiGenerateImage(prompt, { size = '1024x1024', signal } = {}) {
  const cfg = loadAiConfig();
  if (!cfg || !cfg.apiKey) throw new Error('NO_CONFIG');
  const model = cfg.imageModel || IMAGE_MODELS[cfg.provider];
  if (!model) throw new Error('当前服务商不支持文生图，请在 AI 设置中切换到智谱GLM或硅基流动');

  const url = cfg.baseUrl.replace(/\/+$/, '') + '/images/generations';
  let body;
  if (cfg.provider === 'siliconflow') {
    body = { model, prompt, image_size: size, batch_size: 1, num_inference_steps: 20 };
  } else {
    // 智谱 CogView / 通用 OpenAI 兼容
    // watermark_enabled:false 尝试关闭显式水印（智谱需在后台签署免责声明才生效，未签署时会被忽略）
    body = { model, prompt, size, watermark_enabled: false };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.apiKey,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    let detail = '';
    try {
      const j = await resp.json();
      detail = j.error?.message || j.message || JSON.stringify(j).slice(0, 200);
    } catch (e) { detail = 'HTTP ' + resp.status; }
    if (resp.status === 401 || resp.status === 403) throw new Error('API Key 无效或没有权限：' + detail);
    if (resp.status === 429) throw new Error('请求太频繁或额度不足：' + detail);
    throw new Error('图片生成失败（' + resp.status + '）：' + detail);
  }

  const j = await resp.json();
  const imgUrl = j.data?.[0]?.url || j.images?.[0]?.url || j.data?.[0]?.b64_json;
  if (!imgUrl) throw new Error('接口未返回图片');
  // b64_json 兜底
  if (j.data?.[0]?.b64_json && !j.data?.[0]?.url) return 'data:image/png;base64,' + j.data[0].b64_json;
  return imgUrl;
}

// ===== 图片去水印处理 =====
// AI 生成的图片右下角通常带「AI生成」显式水印。
// 处理方式：把图片画到 canvas 上，裁掉底部水印条，再导出为本地 dataURL。
// 附带好处：图片转为本地数据后不再依赖临时链接（智谱链接30天过期）。
function loadImageFromObjectUrl(objUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = objUrl;
  });
}

async function fetchImageBlob(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { mode: 'cors', signal: ctrl.signal });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    if (!blob.type.startsWith('image/') && blob.size < 5000) throw new Error('非图片内容');
    return blob;
  } finally {
    clearTimeout(timer);
  }
}

async function loadImageForCanvas(url) {
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return loadImageFromObjectUrl(url);
  }
  // 智谱图片 CDN 不返回 CORS 头，直连 fetch 会被浏览器拦截；
  // 依次尝试：直连 → weserv 图片代理 → allorigins 代理（均带 CORS 头，可安全画到 canvas）
  const candidates = [
    url,
    'https://images.weserv.nl/?url=' + encodeURIComponent(url),
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
  ];
  let lastErr = null;
  for (const cand of candidates) {
    try {
      const blob = await fetchImageBlob(cand);
      const objUrl = URL.createObjectURL(blob);
      try {
        return await loadImageFromObjectUrl(objUrl);
      } catch (e) {
        URL.revokeObjectURL(objUrl);
        throw e;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('图片加载失败');
}

// 裁掉底部水印条并压缩输出 dataURL；处理失败时抛错（调用方自行兜底用原图）
export async function stripWatermark(imageUrl, { cropRatio = 0.08, maxWidth = 900, quality = 0.85 } = {}) {
  const img = await loadImageForCanvas(imageUrl);
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih) throw new Error('图片尺寸无效');

  // 水印在右下角，裁掉整条底部（至少64px，默认8%高度），画面主体不受影响
  const cropPx = Math.max(64, Math.round(ih * cropRatio));
  const srcH = ih - cropPx;

  // 等比压缩，控制存储体积
  const scale = Math.min(1, maxWidth / iw);
  const outW = Math.round(iw * scale);
  const outH = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, iw, srcH, 0, 0, outW, outH);
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  if (!dataUrl || dataUrl.length < 100) throw new Error('图片处理失败');
  return dataUrl;
}

// 生成图片并自动去水印。
// 返回 { image, cleaned }：cleaned=true 表示已成功裁掉水印（本地dataURL）；
// cleaned=false 表示所有跨域读取途径都失败，返回原图链接（调用方可用 CSS 显示层裁剪兜底）
export async function aiGenerateImageClean(prompt, opts = {}) {
  const rawUrl = await aiGenerateImage(prompt, opts);
  try {
    const clean = await stripWatermark(rawUrl);
    return { image: clean, cleaned: true };
  } catch (e) {
    console.warn('去水印处理失败，使用原图：', e.message);
    return { image: rawUrl, cleaned: false };
  }
}

// ===== 配置弹窗 =====
export function openAiConfigModal(onSaved) {
  const cfg = loadAiConfig() || { provider: 'zhipu', apiKey: '', model: 'glm-4-flash', baseUrl: AI_PROVIDERS.zhipu.baseUrl };
  const provKeys = Object.keys(AI_PROVIDERS);

  openModal({
    title: 'AI 模型设置',
    body: `
      <div style="font-size:12px;color:var(--text-muted);line-height:1.7;margin-bottom:12px;padding:10px;background:var(--primary-bg);border-radius:8px">
        文章由 AI 大模型<strong>实时生成</strong>，需要一个 API Key（存在你自己浏览器里，不会上传）。<br>
        推荐<strong>智谱GLM</strong>或<strong>硅基流动</strong>：注册就有免费模型，白嫖够用。
      </div>
      <div class="field"><label class="field-label">服务商</label>
        <select class="input" id="ai_provider">
          ${provKeys.map(k => `<option value="${k}" ${cfg.provider === k ? 'selected' : ''}>${AI_PROVIDERS[k].name}</option>`).join('')}
        </select></div>
      <div class="field" id="ai_baseurl_field" style="display:${cfg.provider === 'custom' ? 'block' : 'none'}">
        <label class="field-label">Base URL</label>
        <input class="input" id="ai_baseurl" value="${escapeHtml(cfg.baseUrl || '')}" placeholder="https://xxx/v1"></div>
      <div class="field"><label class="field-label">模型</label>
        <select class="input" id="ai_model_select" style="display:${cfg.provider === 'custom' ? 'none' : 'block'}"></select>
        <input class="input" id="ai_model_input" value="${escapeHtml(cfg.model || '')}" placeholder="模型名，如 gpt-4o-mini" style="display:${cfg.provider === 'custom' ? 'block' : 'none'}"></div>
      <div class="field"><label class="field-label">API Key</label>
        <input class="input" id="ai_key" type="password" value="${escapeHtml(cfg.apiKey || '')}" placeholder="粘贴你的 API Key"></div>
      <div id="ai_key_tip" style="font-size:12px;color:var(--text-muted);line-height:1.6"></div>
    `,
    foot: `<button class="btn" id="ai_cancel">取消</button><button class="btn btn-primary" id="ai_save">保存</button>`,
  });

  const provSel = document.getElementById('ai_provider');
  const modelSel = document.getElementById('ai_model_select');
  const modelInput = document.getElementById('ai_model_input');
  const baseField = document.getElementById('ai_baseurl_field');
  const tipEl = document.getElementById('ai_key_tip');

  const refreshProvider = () => {
    const p = AI_PROVIDERS[provSel.value];
    const isCustom = provSel.value === 'custom';
    baseField.style.display = isCustom ? 'block' : 'none';
    modelSel.style.display = isCustom ? 'none' : 'block';
    modelInput.style.display = isCustom ? 'block' : 'none';
    if (!isCustom) {
      modelSel.innerHTML = p.models.map(m => `<option value="${m.id}" ${cfg.model === m.id ? 'selected' : ''}>${m.label}</option>`).join('');
    }
    tipEl.innerHTML = (p.keyUrl ? `<a href="${p.keyUrl}" target="_blank" style="color:var(--primary)">→ 去获取 API Key</a><br>` : '') + escapeHtml(p.keyTip);
  };
  provSel.onchange = refreshProvider;
  refreshProvider();

  document.getElementById('ai_cancel').onclick = closeModal;
  document.getElementById('ai_save').onclick = () => {
    const provider = provSel.value;
    const isCustom = provider === 'custom';
    const baseUrl = isCustom ? document.getElementById('ai_baseurl').value.trim() : AI_PROVIDERS[provider].baseUrl;
    const model = isCustom ? modelInput.value.trim() : modelSel.value;
    const apiKey = document.getElementById('ai_key').value.trim();
    if (!apiKey) { toast('请填写 API Key'); return; }
    if (!baseUrl) { toast('请填写 Base URL'); return; }
    if (!model) { toast('请填写模型名'); return; }
    saveAiConfig({ provider, baseUrl, model, apiKey });
    closeModal();
    toast('AI 设置已保存');
    if (onSaved) onSaved();
  };
}
