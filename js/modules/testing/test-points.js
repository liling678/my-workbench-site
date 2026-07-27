// 测试点生成器 — 需求 → 测试点 → 用例
import { registerModule, Icons } from '../../registry.js';
import { Storage } from '../../storage.js';
import { openModal, closeModal, toast, copyText, escapeHtml } from '../../ui.js';

const KEY = 'testpoints';
const CATEGORIES = [
  { id: 'functional', name: '功能测试', color: 'blue' },
  { id: 'boundary', name: '边界测试', color: 'amber' },
  { id: 'exception', name: '异常测试', color: 'red' },
  { id: 'performance', name: '性能测试', color: 'purple' },
  { id: 'compatibility', name: '兼容性测试', color: 'green' },
  { id: 'security', name: '安全测试', color: 'gray' },
];
const PRIORITIES = [
  { id: 'high', name: '高', cls: 'tp-prio-high' },
  { id: 'medium', name: '中', cls: 'tp-prio-medium' },
  { id: 'low', name: '低', cls: 'tp-prio-low' },
];

function loadData() {
  return Storage.get(KEY, { requirement: '', items: [] });
}
function saveData(data) {
  Storage.set(KEY, data);
}

// 从需求文本里提取"功能主体"用于模板填充
function extractSubject(text) {
  if (!text) return '该功能';
  const firstLine = text.split('\n')[0].trim();
  const cleaned = firstLine.replace(/^(需求|功能|实现|要求|描述)[：:]\s*/, '').slice(0, 20);
  return cleaned || '该功能';
}

// 检测需求中包含的功能关键词，生成更有针对性的测试点
function detectFeatures(req) {
  const text = (req || '').toLowerCase();
  const features = [];

  if (/登录|登陆|login|sign\s*in/.test(text)) features.push('login');
  if (/注册|register|sign\s*up|signup/.test(text)) features.push('register');
  if (/搜索|search|查询|检索/.test(text)) features.push('search');
  if (/上传|upload|文件|附件/.test(text)) features.push('upload');
  if (/支付|付款|payment|pay/.test(text)) features.push('payment');
  if (/表单|form|输入|提交/.test(text)) features.push('form');
  if (/列表|list|分页|page/.test(text)) features.push('list');
  if (/导出|export|下载|download/.test(text)) features.push('export');
  if (/权限|角色|role|auth/.test(text)) features.push('permission');
  if (/消息|通知|推送|message|notify/.test(text)) features.push('notification');
  if (/购物|商品|订单|order|cart|购物车/.test(text)) features.push('shopping');
  if (/评论|comment|点赞|like/.test(text)) features.push('social');

  return features;
}

// 根据功能关键词生成专属测试点
function generateFeatureTestPoints(features, subject) {
  const t = (s) => s.replace(/\{s\}/g, subject);
  const items = [];

  if (features.includes('login')) {
    items.push({ category: 'functional', priority: 'high', description: t('验证{s}正确账号密码登录成功'), expected: '登录成功，跳转正确页面' });
    items.push({ category: 'functional', priority: 'high', description: t('验证{s}错误密码登录失败'), expected: '提示密码错误，不跳转' });
    items.push({ category: 'functional', priority: 'medium', description: t('验证{s}手机号+验证码登录'), expected: '验证码发送成功，验证通过后登录' });
    items.push({ category: 'exception', priority: 'high', description: t('验证{s}账号锁定/解锁机制'), expected: '多次错误后锁定，解锁逻辑正确' });
    items.push({ category: 'security', priority: 'high', description: t('验证{s}密码加密传输与存储'), expected: '密码不明文传输/存储' });
    items.push({ category: 'security', priority: 'medium', description: t('验证{s}Token/Session过期处理'), expected: '过期后需重新登录' });
  }
  if (features.includes('register')) {
    items.push({ category: 'functional', priority: 'high', description: t('验证{s}注册流程完整可用'), expected: '注册成功，自动登录或跳转登录页' });
    items.push({ category: 'boundary', priority: 'high', description: t('验证{s}注册字段格式校验（手机号/邮箱/密码强度）'), expected: '格式不合法时明确提示' });
    items.push({ category: 'exception', priority: 'medium', description: t('验证{s}重复注册/已存在账号'), expected: '提示账号已存在' });
  }
  if (features.includes('search')) {
    items.push({ category: 'functional', priority: 'high', description: t('验证{s}关键词搜索结果准确'), expected: '返回匹配结果，排序合理' });
    items.push({ category: 'boundary', priority: 'medium', description: t('验证{s}搜索关键词为空/特殊字符'), expected: '空搜索有默认行为，特殊字符不报错' });
    items.push({ category: 'performance', priority: 'medium', description: t('验证{s}搜索响应时间'), expected: '搜索结果 ≤ 2s 返回' });
    items.push({ category: 'functional', priority: 'low', description: t('验证{s}搜索结果高亮/筛选/排序'), expected: '高亮正确，筛选排序生效' });
  }
  if (features.includes('upload')) {
    items.push({ category: 'functional', priority: 'high', description: t('验证{s}文件上传成功'), expected: '上传成功，文件可预览/下载' });
    items.push({ category: 'boundary', priority: 'high', description: t('验证{s}上传文件大小/格式限制'), expected: '超大文件被拦截，不支持的格式有提示' });
    items.push({ category: 'exception', priority: 'high', description: t('验证{s}上传中断/网络异常恢复'), expected: '支持断点续传或有错误提示' });
  }
  if (features.includes('payment')) {
    items.push({ category: 'functional', priority: 'high', description: t('验证{s}支付流程完整可用'), expected: '支付成功，订单状态更新' });
    items.push({ category: 'exception', priority: 'high', description: t('验证{s}支付中断/取消'), expected: '取消后订单状态正确，可重新支付' });
    items.push({ category: 'security', priority: 'high', description: t('验证{s}支付金额篡改防护'), expected: '金额不可前端篡改' });
    items.push({ category: 'exception', priority: 'high', description: t('验证{s}支付超时处理'), expected: '超时后订单关闭或可重试' });
  }
  if (features.includes('form')) {
    items.push({ category: 'functional', priority: 'high', description: t('验证{s}表单各字段正常提交'), expected: '提交成功，数据保存正确' });
    items.push({ category: 'boundary', priority: 'high', description: t('验证{s}表单必填项为空时拦截'), expected: '必填项为空有明确提示' });
    items.push({ category: 'boundary', priority: 'medium', description: t('验证{s}表单字段长度/格式限制'), expected: '超长/格式错误有提示' });
    items.push({ category: 'exception', priority: 'medium', description: t('验证{s}表单重复提交防护'), expected: '防重复提交机制生效' });
  }
  if (features.includes('list')) {
    items.push({ category: 'functional', priority: 'high', description: t('验证{s}列表正常加载展示'), expected: '数据加载正确，展示完整' });
    items.push({ category: 'boundary', priority: 'medium', description: t('验证{s}分页/滚动加载'), expected: '分页正确，无重复/遗漏' });
    items.push({ category: 'boundary', priority: 'medium', description: t('验证{s}列表数据为空时展示'), expected: '空状态友好提示' });
    items.push({ category: 'performance', priority: 'low', description: t('验证{s}大数据量列表加载性能'), expected: '无明显卡顿' });
  }
  if (features.includes('export')) {
    items.push({ category: 'functional', priority: 'medium', description: t('验证{s}导出/下载功能正常'), expected: '文件下载成功，内容正确' });
    items.push({ category: 'boundary', priority: 'medium', description: t('验证{s}导出大数据量'), expected: '大数据量导出不超时' });
    items.push({ category: 'exception', priority: 'medium', description: t('验证{s}导出无数据时处理'), expected: '空数据有提示或导出空文件' });
  }
  if (features.includes('permission')) {
    items.push({ category: 'security', priority: 'high', description: t('验证{s}不同角色权限隔离'), expected: '无权限功能不可见/不可操作' });
    items.push({ category: 'security', priority: 'high', description: t('验证{s}越权访问拦截'), expected: '越权请求被拦截' });
    items.push({ category: 'functional', priority: 'medium', description: t('验证{s}权限切换后页面刷新'), expected: '权限变更后UI正确更新' });
  }
  if (features.includes('notification')) {
    items.push({ category: 'functional', priority: 'medium', description: t('验证{s}消息通知发送与接收'), expected: '通知及时送达，内容正确' });
    items.push({ category: 'exception', priority: 'medium', description: t('验证{s}通知重复/丢失处理'), expected: '不重复推送，丢失可补发' });
  }
  if (features.includes('shopping')) {
    items.push({ category: 'functional', priority: 'high', description: t('验证{s}加入购物车/下单流程'), expected: '流程完整，数据正确' });
    items.push({ category: 'functional', priority: 'medium', description: t('验证{s}库存校验'), expected: '库存不足时拦截下单' });
    items.push({ category: 'exception', priority: 'medium', description: t('验证{s}订单取消/退款'), expected: '取消退款流程正确' });
  }
  if (features.includes('social')) {
    items.push({ category: 'functional', priority: 'medium', description: t('验证{s}评论发布/删除'), expected: '评论操作正常，实时更新' });
    items.push({ category: 'security', priority: 'medium', description: t('验证{s}评论内容XSS防护'), expected: '脚本内容被转义' });
    items.push({ category: 'functional', priority: 'low', description: t('验证{s}点赞/取消点赞'), expected: '状态切换正确，计数准确' });
  }

  return items;
}

// 智能生成：根据需求分析 + 通用模板
function generateSmart(req) {
  const subject = extractSubject(req);
  const features = detectFeatures(req);
  const featureItems = generateFeatureTestPoints(features, subject);
  const t = (s) => s.replace(/\{s\}/g, subject);

  // 通用测试点（始终包含）
  const generalItems = [
    { category: 'functional', priority: 'high', description: t('验证{s}主流程正常工作'), expected: '核心流程顺利完成，结果符合预期' },
    { category: 'boundary', priority: 'high', description: t('验证{s}输入字段的边界值（最小/最大/空/超长）'), expected: '边界值处理正确，有合理提示' },
    { category: 'exception', priority: 'high', description: t('验证{s}异常输入的拦截与提示'), expected: '异常输入被拦截，提示明确' },
    { category: 'exception', priority: 'medium', description: '验证网络中断 / 接口超时的处理', expected: '有loading与重试机制' },
    { category: 'performance', priority: 'medium', description: t('验证{s}响应时间在可接受范围'), expected: '响应 ≤ 预期阈值' },
    { category: 'compatibility', priority: 'medium', description: '验证多浏览器 / 多端表现一致', expected: '主流环境表现一致' },
    { category: 'security', priority: 'high', description: '验证输入防注入 / XSS', expected: '恶意输入被过滤' },
  ];

  // 如果检测到特定功能，减少通用测试点（避免重复）
  const allItems = [...featureItems, ...generalItems];

  // 去重（按描述）
  const seen = new Set();
  return allItems.filter(it => {
    if (seen.has(it.description)) return false;
    seen.add(it.description);
    return true;
  });
}

export function initTestPoints() {
  registerModule('test-points', {
    section: 'testing',
    title: '测试点生成器',
    icon: Icons.testPoints,
    description: '需求 → 测试点 → 用例',
    render(container) {
      const data = loadData();
      container.innerHTML = `
        <div class="page-head">
          <div class="page-title">测试点生成器</div>
          <div class="page-desc">输入需求描述，智能生成结构化测试点；支持手动编辑与导出</div>
        </div>

        <div class="card card-pad mb-16">
          <div class="field" style="margin-bottom:12px">
            <label class="field-label">需求 / 功能描述</label>
            <textarea class="textarea" id="reqInput" placeholder="例如：实现用户登录功能，支持手机号+验证码和账号密码两种方式，登录后跳转首页…">${data.requirement || ''}</textarea>
          </div>
          <div class="flex gap-8" style="flex-wrap:wrap">
            <button class="btn btn-primary" id="genBtn">${Icons.sparkles} 生成测试点</button>
            <button class="btn btn-sm" id="addTpBtn">${Icons.plus} 手动添加</button>
            <div class="spacer" style="flex:1"></div>
            <button class="btn btn-sm" id="exportBtn">${Icons.download} 导出</button>
            <button class="btn btn-sm" id="clearBtn">${Icons.trash} 清空</button>
          </div>
        </div>

        <div class="flex items-center justify-between mb-12">
          <div class="section-title" style="margin:0">测试点列表 <span class="cat-count" id="totalCount">0</span></div>
        </div>
        <div id="tpList"></div>
      `;

      const reqInput = container.querySelector('#reqInput');
      reqInput.addEventListener('input', () => {
        const d = loadData();
        d.requirement = reqInput.value;
        saveData(d);
      });

      // 生成测试点（智能 + 模板）
      container.querySelector('#genBtn').onclick = () => {
        const req = reqInput.value.trim();
        if (!req) { toast('请先输入需求描述'); return; }
        const d = loadData();
        const generated = generateSmart(req).map(it => ({ id: Storage.uid(), ...it }));
        if (d.items.length > 0) {
          openModal({
            title: '覆盖现有测试点？',
            body: `<p style="line-height:1.8">当前已有 ${d.items.length} 个测试点，生成将覆盖现有内容。</p>`,
            foot: `<button class="btn" id="mergeBtn">追加</button><button class="btn btn-primary" id="replaceBtn">覆盖</button>`
          });
          document.getElementById('mergeBtn').onclick = () => {
            d.items = [...d.items, ...generated];
            saveData(d);
            closeModal();
            renderList(container);
            toast(`已追加 ${generated.length} 个测试点`);
          };
          document.getElementById('replaceBtn').onclick = () => {
            d.items = generated;
            saveData(d);
            closeModal();
            renderList(container);
            toast(`已生成 ${generated.length} 个测试点`);
          };
        } else {
          d.items = generated;
          saveData(d);
          renderList(container);
          toast(`已生成 ${generated.length} 个测试点`);
        }
      };

      container.querySelector('#addTpBtn').onclick = () => openAddModal(container);
      container.querySelector('#exportBtn').onclick = () => exportData(container);
      container.querySelector('#clearBtn').onclick = () => {
        if (data.items.length === 0) { toast('暂无测试点'); return; }
        openModal({
          title: '清空测试点',
          body: '<p>确定清空所有测试点吗？此操作不可恢复。</p>',
          foot: '<button class="btn" id="clrCancel">取消</button><button class="btn btn-primary" id="clrOk" style="background:var(--red)">清空</button>'
        });
        document.getElementById('clrCancel').onclick = closeModal;
        document.getElementById('clrOk').onclick = () => {
          saveData({ requirement: data.requirement, items: [] });
          closeModal();
          renderList(container);
          toast('已清空');
        };
      };

      renderList(container);
    }
  });
}

function renderList(container) {
  const data = loadData();
  const listEl = container.querySelector('#tpList');
  container.querySelector('#totalCount').textContent = data.items.length;

  if (data.items.length === 0) {
    listEl.innerHTML = `<div class="empty">
      <div class="empty-icon">${Icons.testPoints}</div>
      <div class="empty-title">还没有测试点</div>
      <div class="empty-desc">输入需求后点击「生成测试点」快速开始</div>
    </div>`;
    return;
  }

  let html = '';
  CATEGORIES.forEach(cat => {
    const items = data.items.filter(it => it.category === cat.id);
    if (items.length === 0) return;
    html += `<div class="tp-cat-group">
      <div class="tp-cat-head">
        <span class="tp-cat-badge tp-cat-${cat.color}">${cat.name}</span>
        <span class="tp-cat-count">${items.length} 条</span>
      </div>
      <div class="tp-cat-items">`;
    items.forEach(it => {
      const p = PRIORITIES.find(x => x.id === it.priority) || PRIORITIES[1];
      html += `<div class="tp-card" data-id="${it.id}">
        <div class="tp-card-head">
          <span class="tp-prio-tag ${p.cls}">${p.name}</span>
          <div class="tp-card-actions">
            <button class="icon-btn btn-sm tp-edit" title="编辑">${Icons.edit}</button>
            <button class="icon-btn btn-sm tp-del" title="删除">${Icons.trash}</button>
          </div>
        </div>
        <div class="tp-card-desc" data-id="${it.id}">${escapeHtml(it.description || '')}</div>
        <div class="tp-card-expected">
          <span class="tp-card-label">预期</span>
          <span class="tp-card-value">${escapeHtml(it.expected || '')}</span>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });
  listEl.innerHTML = html;

  // 绑定事件
  listEl.querySelectorAll('.tp-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.tp-edit').onclick = () => openEditModal(container, id);
    card.querySelector('.tp-del').onclick = () => {
      const d = loadData();
      d.items = d.items.filter(x => x.id !== id);
      saveData(d);
      renderList(container);
      toast('已删除');
    };
  });
}

function openEditModal(container, id) {
  const d = loadData();
  const it = d.items.find(x => x.id === id);
  if (!it) return;
  openModal({
    title: '编辑测试点',
    body: `
      <div class="field">
        <label class="field-label">分类</label>
        <select class="select" id="editCat">
          ${CATEGORIES.map(c => `<option value="${c.id}" ${c.id === it.category ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">优先级</label>
        <select class="select" id="editPrio">
          ${PRIORITIES.map(p => `<option value="${p.id}" ${p.id === it.priority ? 'selected' : ''}>${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">测试点描述</label>
        <textarea class="textarea" id="editDesc" placeholder="描述要测试的内容">${escapeHtml(it.description || '')}</textarea>
      </div>
      <div class="field">
        <label class="field-label">预期结果</label>
        <input class="input" id="editExpected" placeholder="期望的结果" value="${escapeAttr(it.expected || '')}">
      </div>`,
    foot: `<button class="btn" id="editCancel">取消</button><button class="btn btn-primary" id="editSave">保存</button>`
  });
  document.getElementById('editCancel').onclick = closeModal;
  document.getElementById('editSave').onclick = () => {
    it.category = document.getElementById('editCat').value;
    it.priority = document.getElementById('editPrio').value;
    it.description = document.getElementById('editDesc').value;
    it.expected = document.getElementById('editExpected').value;
    saveData(d);
    closeModal();
    renderList(container);
    toast('已保存');
  };
}

function openAddModal(container) {
  openModal({
    title: '添加测试点',
    body: `
      <div class="field">
        <label class="field-label">分类</label>
        <select class="select" id="newCat">
          ${CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">优先级</label>
        <select class="select" id="newPrio">
          ${PRIORITIES.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">测试点描述</label>
        <textarea class="textarea" id="newDesc" placeholder="描述要测试的内容"></textarea>
      </div>
      <div class="field">
        <label class="field-label">预期结果</label>
        <input class="input" id="newExpected" placeholder="期望的结果">
      </div>`,
    foot: `<button class="btn" id="cancelAdd">取消</button><button class="btn btn-primary" id="saveAdd">添加</button>`
  });
  document.getElementById('cancelAdd').onclick = closeModal;
  document.getElementById('saveAdd').onclick = () => {
    const d = loadData();
    d.items.push({
      id: Storage.uid(),
      category: document.getElementById('newCat').value,
      priority: document.getElementById('newPrio').value,
      description: document.getElementById('newDesc').value,
      expected: document.getElementById('newExpected').value,
    });
    saveData(d);
    closeModal();
    renderList(container);
    toast('已添加');
  };
}

function exportData(container) {
  const data = loadData();
  if (data.items.length === 0) { toast('暂无测试点可导出'); return; }
  let md = `# 测试点清单\n\n**需求描述：**\n${data.requirement || '—'}\n\n`;
  CATEGORIES.forEach(cat => {
    const items = data.items.filter(it => it.category === cat.id);
    if (items.length === 0) return;
    md += `## ${cat.name}\n\n| 优先级 | 测试点 | 预期结果 |\n| --- | --- | --- |\n`;
    items.forEach(it => {
      const p = PRIORITIES.find(x => x.id === it.priority)?.name || '中';
      md += `| ${p} | ${it.description || ''} | ${it.expected || ''} |\n`;
    });
    md += '\n';
  });
  copyText(md);
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
