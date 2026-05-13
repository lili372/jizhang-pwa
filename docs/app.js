/* =========================================================
 * 记账小工具 - 纯前端 PWA
 * 数据全部存 localStorage, 结构简单, 易维护
 * ========================================================= */

/* ---------- 数据结构 ---------- */
// records: [{ id, type:'expense'|'income', categoryId, amount, note, date:'YYYY-MM-DD', createdAt }]
// categories: { expense: [...], income: [...] }
//   category: { id, name, icon, color, builtin }

const STORAGE_KEY = 'jizhang_data_v1';
// 迁移前自动快照的 key 前缀,每次代码版本升级时做一次快照
const MIGRATION_SNAPSHOT_PREFIX = 'jizhang_data_v1__pre_migrate__';
// 代码版本号,同步到 sw.js 里的 CACHE 版本号。改默认分类 / 迁移逻辑时务必 +1
const CODE_VERSION = 'v16';

const DEFAULT_EXPENSE_CATS = [
  { id: 'e_food',     name: '餐饮',   icon: '🍚', color: '#FF9A62' },
  { id: 'e_transit',  name: '交通',   icon: '🚌', color: '#5AA5E8' },
  { id: 'e_shop',     name: '购物',   icon: '🛍️', color: '#F06292' },
  { id: 'e_home',     name: '居住',   icon: '🏠', color: '#8D7BE8' },
  { id: 'e_fun',      name: '娱乐',   icon: '🎮', color: '#FFB547' },
  { id: 'e_study',    name: '学习',   icon: '📚', color: '#7986CB' },
  { id: 'e_work',     name: '工作',   icon: '💼', color: '#26A69A' },
  { id: 'e_transfer', name: '转出',   icon: '🔄', color: '#78909C' },
  { id: 'e_other',    name: '其他',   icon: '📦', color: '#9AA7A0' },
];
const DEFAULT_INCOME_CATS = [
  { id: 'i_salary',   name: '工资',   icon: '💰', color: '#4CAF7D' },
  { id: 'i_bonus',    name: '奖金',   icon: '🎁', color: '#FFB547' },
  { id: 'i_redpkt',   name: '红包',   icon: '🧧', color: '#E57373' },
  { id: 'i_invest',   name: '理财',   icon: '📈', color: '#5AA5E8' },
  { id: 'i_refund',   name: '报销',   icon: '💵', color: '#8D7BE8' },
  { id: 'i_transfer', name: '转入',   icon: '🔄', color: '#78909C' },
  { id: 'i_other',    name: '其他',   icon: '📦', color: '#9AA7A0' },
];

const COLOR_PALETTE = [
  '#FF9A62', '#E57373', '#F06292', '#FFB547',
  '#4CAF7D', '#7FC686', '#4DB6AC', '#5AA5E8',
  '#7986CB', '#8D7BE8', '#A1887F', '#9AA7A0',
  '#78909C', '#FF7043', '#66BB6A', '#26A69A',
];

// 常用 emoji 图标库,按主题分组排列
const EMOJI_LIBRARY = [
  // 饮食
  '🍚', '🍜', '🍔', '🍕', '🍱', '🍰', '🍎', '☕',
  // 购物日用
  '🛍️', '🧴', '💊', '👕', '👟', '💄', '🧻', '🎁',
  // 出行
  '🚌', '🚇', '🚕', '🚄', '✈️', '🚲', '⛽', '🅿️',
  // 居家
  '🏠', '💡', '💧', '📶', '🔌', '🛋️', '🛏️', '🧹',
  // 娱乐教育
  '🎮', '🎬', '🎵', '📚', '🎨', '🏃', '⚽', '🎤',
  // 金钱工作
  '💰', '💵', '💳', '🏦', '📈', '💼', '🧧', '📝',
  // 人与事
  '👶', '🐶', '🐱', '🌱', '❤️', '🎂', '🎉', '✨',
  // 其他
  '📱', '💻', '🔧', '🎯', '🏥', '📦', '❓', '⭐',
];

// 分类对应的备注快捷标签,按分类 id 匹配
// suffixDash: 点击后自动补一个 "-",方便继续输入具体内容
const NOTE_PRESETS = {
  e_food:     { items: ['早饭', '午饭', '晚饭', '聚餐', '零食', '饮料'], suffixDash: true },
  e_transit:  { items: ['地铁', '公交', '打车', '高铁', '火车', '飞机'], suffixDash: false },
  e_shop:     { items: ['水果', '日用', '药品', '衣物', '数码'], suffixDash: true },
  e_home:     { items: ['房租', '水费', '电费', '物业', '网费'], suffixDash: false },
  e_fun:      { items: ['电影', '游戏', 'KTV', '运动'], suffixDash: true },
  e_study:    { items: ['书籍', '课程', '网课', '文具'], suffixDash: true },
  e_work:     { items: ['API', '软件', '差旅', '打印', '设备'], suffixDash: true },
  e_transfer: { items: ['借出', '还款', '随礼', '代付', '转账'], suffixDash: true },
  i_transfer: { items: ['借入', '还回', '收礼', '转账'], suffixDash: true },
};

// 废弃分类迁移表:旧 id → { to: 新 id, notePrefix?: 记录备注前缀 }
// 运行时把用户数据里废弃 id 的记录改归到新分类,并从分类列表里删除旧项
// 注意:必须声明在 `let state = loadState()` 之前,否则 loadState 调用会触发 TDZ 引用错误
const DEPRECATED_CATEGORIES = {
  expense: {
    e_ai: { to: 'e_work', notePrefix: 'API-' },
  },
  income: {},
};

/* ---------- 状态 ---------- */
let state = loadState();
let currentTab = 'home';
let statsMonth = new Date(); // 统计页当前展示的月份
let statsType = 'expense';

// 记账弹层的临时状态
let recordDraft = null;

// 分类管理上下文
let catManageType = 'expense';
let catEditing = null; // {mode:'new'|'edit', type, category}

/* ---------- 存储 ---------- */
function loadState() {
  // 诊断:把 loadState 的执行步骤逐项记录,一旦抛异常能看到是哪一步
  window.__loadTrace = [];
  const trace = (step, info) => window.__loadTrace.push(step + ': ' + JSON.stringify(info));

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    trace('1-getItem', { rawLen: raw?.length ?? null, rawType: typeof raw });
    if (raw) {
      const data = JSON.parse(raw);
      trace('2-parse', {
        recordsCount: data?.records?.length ?? null,
        expCats: data?.categories?.expense?.length ?? null,
        incCats: data?.categories?.income?.length ?? null,
      });
      if (!data.categories) data.categories = { expense: [...DEFAULT_EXPENSE_CATS], income: [...DEFAULT_INCOME_CATS] };
      if (!data.records) data.records = [];
      trace('3-after-default-fill', { recordsCount: data.records.length });

      // 安全网 1:迁移前自动快照(每个代码版本只快照一次,避免反复覆盖)
      const snapshotKey = MIGRATION_SNAPSHOT_PREFIX + CODE_VERSION;
      if (!localStorage.getItem(snapshotKey)) {
        try {
          localStorage.setItem(snapshotKey, raw);
          trace('4-snapshot-created', { key: snapshotKey });
        } catch (e) {
          trace('4-snapshot-fail', { err: e.message });
        }
      } else {
        trace('4-snapshot-skip', { key: snapshotKey });
      }

      migrateDefaultCategories(data);
      trace('5-migrate-default', { recordsCount: data.records.length });

      migrateDeprecatedCategories(data);
      trace('6-migrate-deprecated', { recordsCount: data.records.length });

      trace('7-return', { recordsCount: data.records.length });
      return data;
    } else {
      trace('1b-raw-empty', {});
    }
  } catch (e) {
    trace('EXCEPTION', { msg: e.message, stack: e.stack?.split('\n').slice(0, 3).join(' | ') });
    console.error('[loadState] 抛异常:', e);
    // 不再吞:用 alert 立刻暴露
    try {
      alert('loadState 异常!\n' + e.message + '\n\n' + (e.stack?.split('\n').slice(0, 4).join('\n') || ''));
    } catch (_) {}
  }
  trace('FALLBACK', { reason: 'returning empty default' });
  return {
    records: [],
    categories: {
      expense: DEFAULT_EXPENSE_CATS.map(c => ({ ...c })),
      income:  DEFAULT_INCOME_CATS.map(c => ({ ...c })),
    },
  };
}

// 把默认分类里新加的项补进现有数据(按 id 去重),保持原顺序地插入到默认顺序对应的位置
function migrateDefaultCategories(data) {
  const mergeOne = (type, defaults) => {
    const list = data.categories[type] || [];
    const existing = new Set(list.map(c => c.id));
    defaults.forEach((def, i) => {
      if (existing.has(def.id)) return;
      // 找到应插入的位置:第一个"在 defaults 里序号比当前新项更大、且用户数据里存在的"项 之前
      let insertAt = list.length;
      for (let j = i + 1; j < defaults.length; j++) {
        const idx = list.findIndex(c => c.id === defaults[j].id);
        if (idx !== -1) { insertAt = idx; break; }
      }
      list.splice(insertAt, 0, { ...def });
    });
    data.categories[type] = list;
  };
  mergeOne('expense', DEFAULT_EXPENSE_CATS);
  mergeOne('income',  DEFAULT_INCOME_CATS);
}

function migrateDeprecatedCategories(data) {
  const handleOne = (type, map) => {
    const list = data.categories[type] || [];
    Object.entries(map).forEach(([oldId, { to, notePrefix }]) => {
      // 只在目标分类存在的情况下才迁移,避免把记录指向一个不存在的 id
      const hasTarget = list.some(c => c.id === to);
      if (!hasTarget) return;
      // 改记录 categoryId
      data.records.forEach(r => {
        if (r.type === type && r.categoryId === oldId) {
          r.categoryId = to;
          if (notePrefix) {
            const note = r.note || '';
            // 已经带前缀的不重复加,避免多次迁移时叠加
            if (!note.startsWith(notePrefix)) {
              r.note = notePrefix + note;
            }
          }
        }
      });
      // 从分类列表删除旧项
      data.categories[type] = list.filter(c => c.id !== oldId);
    });
  };
  handleOne('expense', DEPRECATED_CATEGORIES.expense);
  handleOne('income',  DEPRECATED_CATEGORIES.income);
}
function saveState() {
  // 安全网 2:拦截"可疑的空写入"——防止某种意外路径把 records 清空后又落盘
  // 规则:如果 localStorage 里现存 records > 0,而即将写入的 state.records 是 0 或缺失,拒绝
  try {
    const existingRaw = localStorage.getItem(STORAGE_KEY);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw);
      const existingCount = Array.isArray(existing?.records) ? existing.records.length : 0;
      const newCount = Array.isArray(state?.records) ? state.records.length : 0;
      // 已有数据 → 新数据为空,且不是用户主动清空 → 阻止
      if (existingCount > 0 && newCount === 0 && !state.__allowEmpty) {
        console.error('[saveState] 拒绝写入:current records=' + existingCount + ' → new records=0');
        toast('检测到异常,已阻止写入');
        return;
      }
    }
  } catch (_) { /* 校验出错不阻塞正常写入 */ }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('保存失败: 存储已满');
  }
}

/* ---------- 工具 ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }
function fmtMonth(d) { return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月'; }
function fmtAmount(n) { return Number(n).toFixed(2); }

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function weekdayText(d) {
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
}

function findCategory(type, id) {
  return state.categories[type].find(c => c.id === id) || {
    id: '_missing', name: '已删除', icon: '❓', color: '#aaa'
  };
}

function toast(msg, ms = 1500) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function monthRange(d) {
  const y = d.getFullYear(), m = d.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 1);
  return [fmtDate(start), fmtDate(end)];
}

function recordsInMonth(d) {
  const [s, e] = monthRange(d);
  return state.records.filter(r => r.date >= s && r.date < e);
}

/* ---------- Tab 切换 ---------- */
function switchTab(tab) {
  currentTab = tab;
  $$('.page').forEach(p => p.classList.toggle('hidden', p.dataset.page !== tab));
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'home') renderHome();
  if (tab === 'stats') renderStats();
}

/* ---------- 首页渲染 ---------- */
function renderHome() {
  const now = new Date();
  $('#summaryMonth').textContent = fmtMonth(now);

  const monthRecs = recordsInMonth(now);
  let income = 0, expense = 0;
  monthRecs.forEach(r => {
    if (r.type === 'income') income += r.amount;
    else expense += r.amount;
  });
  $('#summaryIncome').textContent  = fmtAmount(income);
  $('#summaryExpense').textContent = fmtAmount(expense);
  $('#summaryBalance').textContent = fmtAmount(income - expense);

  const list = $('#billList');
  if (state.records.length === 0) {
    list.innerHTML = '<div class="empty-hint">还没有记录,点下方 + 开始记一笔</div>';
    return;
  }

  // 按日期 + 时间分组, 降序
  const sorted = [...state.records].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ta = a.time || '', tb = b.time || '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return b.createdAt - a.createdAt;
  });
  const groups = {};
  sorted.forEach(r => { (groups[r.date] = groups[r.date] || []).push(r); });

  const today = fmtDate(new Date());
  const yest  = fmtDate(new Date(Date.now() - 86400000));

  let html = '';
  Object.keys(groups).forEach(date => {
    const recs = groups[date];
    let dIncome = 0, dExpense = 0;
    recs.forEach(r => { r.type === 'income' ? dIncome += r.amount : dExpense += r.amount; });

    const d = parseDate(date);
    const label = date === today ? '今天'
                : date === yest  ? '昨天'
                : (d.getMonth() + 1) + '月' + d.getDate() + '日';

    let sumHtml = '';
    if (dIncome)  sumHtml += `<span class="income">收 ${fmtAmount(dIncome)}</span>`;
    if (dExpense) sumHtml += `<span class="expense">支 ${fmtAmount(dExpense)}</span>`;

    html += `<div class="day-group">
      <div class="day-header">
        <div><span class="day-date">${label}</span><span class="day-weekday">周${weekdayText(d)}</span></div>
        <div class="day-sum">${sumHtml}</div>
      </div>`;
    recs.forEach(r => {
      const cat = findCategory(r.type, r.categoryId);
      const sign = r.type === 'income' ? '+' : '-';
      html += `<div class="bill-item" data-id="${r.id}">
        <div class="bill-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div>
        <div class="bill-body">
          <div class="bill-category">${cat.name}</div>
          <div class="bill-note">
            ${r.time ? `<span class="bill-time">${r.time}</span>` : ''}
            ${r.note ? `<span>${escapeHtml(r.note)}</span>` : ''}
          </div>
        </div>
        <div class="bill-amount ${r.type}">${sign}${fmtAmount(r.amount)}</div>
      </div>`;
    });
    html += '</div>';
  });
  list.innerHTML = html;

  // 点击编辑
  list.querySelectorAll('.bill-item').forEach(el => {
    el.addEventListener('click', () => openRecordSheet(el.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ---------- 记账弹层 ---------- */
function openRecordSheet(editId) {
  const sheet = $('#recordSheet');
  const delBtn = $('#recordDelete');

  if (editId) {
    const r = state.records.find(x => x.id === editId);
    if (!r) return;
    recordDraft = {
      id: r.id,
      type: r.type,
      categoryId: r.categoryId,
      amount: r.amount.toString(),
      note: r.note || '',
      date: r.date,
      time: r.time || '00:00:00',
    };
    $('#recordTitle').textContent = '编辑';
    delBtn.classList.remove('hidden');
  } else {
    const now = new Date();
    recordDraft = {
      id: null,
      type: 'expense',
      categoryId: state.categories.expense[0]?.id || null,
      amount: '',
      note: '',
      date: fmtDate(now),
      time: fmtTime(now),
    };
    $('#recordTitle').textContent = '记一笔';
    delBtn.classList.add('hidden');
  }

  refreshRecordSheet();
  sheet.classList.remove('hidden');
}

function closeRecordSheet() {
  $('#recordSheet').classList.add('hidden');
  recordDraft = null;
}

function refreshRecordSheet() {
  // 类型
  $$('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.rtype === recordDraft.type));
  // 金额
  $('#amountDisplay').textContent = recordDraft.amount === '' ? '0.00' : recordDraft.amount;
  // 备注日期时间
  $('#noteInput').value = recordDraft.note;
  $('#dateInput').value = recordDraft.date;
  $('#timeInput').value = recordDraft.time;
  // 分类
  renderCategoryGrid();
  // 备注快捷标签
  renderNotePresets();
}

function renderNotePresets() {
  const box = $('#notePresets');
  const preset = NOTE_PRESETS[recordDraft.categoryId];
  if (!preset) { box.innerHTML = ''; return; }
  box.innerHTML = preset.items.map(p =>
    `<button type="button" class="note-preset" data-note="${escapeHtml(p)}">${p}</button>`
  ).join('');
  box.querySelectorAll('.note-preset').forEach(el => {
    el.addEventListener('click', () => {
      const text = preset.suffixDash ? el.dataset.note + '-' : el.dataset.note;
      const input = $('#noteInput');
      input.value = text;
      recordDraft.note = text;
      if (preset.suffixDash) {
        input.focus();
        // 光标移到末尾
        const len = text.length;
        input.setSelectionRange(len, len);
      }
    });
  });
}

function renderCategoryGrid() {
  const grid = $('#categoryGrid');
  const cats = state.categories[recordDraft.type];
  if (!recordDraft.categoryId && cats.length) recordDraft.categoryId = cats[0].id;

  grid.innerHTML = cats.map(c => `
    <div class="cat-cell ${c.id === recordDraft.categoryId ? 'active' : ''}" data-id="${c.id}">
      <div class="cat-icon-wrap" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
      <div class="cat-name">${c.name}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.cat-cell').forEach(el => {
    el.addEventListener('click', () => {
      if (recordDraft.categoryId !== el.dataset.id) {
        recordDraft.categoryId = el.dataset.id;
        recordDraft.note = '';
      }
      refreshRecordSheet();
    });
  });
}

function handleKeyInput(key) {
  let a = recordDraft.amount;
  if (key === 'del') {
    a = a.slice(0, -1);
  } else if (key === 'clear') {
    a = '';
  } else if (key === 'confirm') {
    confirmRecord();
    return;
  } else if (key === '.') {
    if (!a) a = '0.';
    else if (!a.includes('.')) a += '.';
  } else if (key === '00') {
    if (a === '' || a === '0') { /* 忽略 */ }
    else if (a.includes('.')) {
      const deci = a.split('.')[1] || '';
      if (deci.length <= 0) a += '00';
      else if (deci.length === 1) a += '0';
    } else {
      a += '00';
    }
  } else {
    if (a === '0' && key !== '.') a = key;
    else if (a.includes('.')) {
      const deci = a.split('.')[1];
      if (deci.length < 2) a += key;
    } else {
      if (a.length < 9) a += key;
    }
  }
  recordDraft.amount = a;
  $('#amountDisplay').textContent = a === '' ? '0.00' : a;
}

function confirmRecord() {
  const amt = parseFloat(recordDraft.amount);
  if (!amt || amt <= 0) { toast('请输入金额'); return; }
  if (!recordDraft.categoryId) { toast('请选择分类'); return; }

  recordDraft.note = $('#noteInput').value.trim();
  recordDraft.date = $('#dateInput').value || fmtDate(new Date());
  // time 输入可能是 HH:mm 也可能是 HH:mm:ss,统一补齐为 HH:mm:ss
  let t = $('#timeInput').value || fmtTime(new Date());
  if (/^\d{2}:\d{2}$/.test(t)) t += ':00';
  recordDraft.time = t;

  if (recordDraft.id) {
    const r = state.records.find(x => x.id === recordDraft.id);
    if (r) {
      r.type = recordDraft.type;
      r.categoryId = recordDraft.categoryId;
      r.amount = amt;
      r.note = recordDraft.note;
      r.date = recordDraft.date;
      r.time = recordDraft.time;
    }
    toast('已更新');
  } else {
    state.records.push({
      id: uid(),
      type: recordDraft.type,
      categoryId: recordDraft.categoryId,
      amount: amt,
      note: recordDraft.note,
      date: recordDraft.date,
      time: recordDraft.time,
      createdAt: Date.now(),
    });
    toast('已记录');
  }
  saveState();
  closeRecordSheet();
  if (currentTab === 'home') renderHome();
  if (currentTab === 'stats') renderStats();
}

function deleteRecord() {
  if (!recordDraft?.id) return;
  if (!confirm('确定删除这条记录吗?')) return;
  state.records = state.records.filter(r => r.id !== recordDraft.id);
  saveState();
  closeRecordSheet();
  renderHome();
  toast('已删除');
}

/* ---------- 统计页 ---------- */
function renderStats() {
  $('#statsMonth').textContent = fmtMonth(statsMonth);
  $$('.stats-tab').forEach(b => b.classList.toggle('active', b.dataset.type === statsType));

  const recs = recordsInMonth(statsMonth).filter(r => r.type === statsType);
  const total = recs.reduce((s, r) => s + r.amount, 0);
  $('#statsTotal').textContent = fmtAmount(total);

  // 分类汇总
  const sumMap = {};
  recs.forEach(r => {
    sumMap[r.categoryId] = (sumMap[r.categoryId] || 0) + r.amount;
  });
  const ranked = Object.keys(sumMap)
    .map(id => ({ cat: findCategory(statsType, id), amount: sumMap[id] }))
    .sort((a, b) => b.amount - a.amount);

  drawPie(ranked, total);
  renderRanking(ranked, total);
  drawBar();
}

function renderRanking(ranked, total) {
  const box = $('#categoryRanking');
  if (ranked.length === 0) {
    box.innerHTML = '<div class="empty-hint" style="padding:20px 0">本月暂无记录</div>';
    return;
  }
  box.innerHTML = ranked.map(({ cat, amount }) => {
    const pct = total > 0 ? (amount / total * 100) : 0;
    return `<div class="rank-row">
      <div class="rank-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div>
      <div class="rank-body">
        <div class="rank-top">
          <span class="rank-name">${cat.name} · ${pct.toFixed(1)}%</span>
          <span class="rank-amount">${fmtAmount(amount)}</span>
        </div>
        <div class="rank-bar"><div class="rank-bar-fill" style="width:${pct}%;background:${cat.color}"></div></div>
      </div>
    </div>`;
  }).join('');
}

function drawPie(ranked, total) {
  const canvas = $('#pieChart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (total <= 0) {
    ctx.fillStyle = '#eef2ef';
    ctx.beginPath();
    ctx.arc(W/2, H/2, W*0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9aa7a0';
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无数据', W/2, H/2);
    return;
  }

  const cx = W/2, cy = H/2, R = W*0.42, r = W*0.25;
  let ang = -Math.PI / 2;
  ranked.forEach(({ cat, amount }) => {
    const slice = (amount / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, ang, ang + slice);
    ctx.closePath();
    ctx.fillStyle = cat.color;
    ctx.fill();
    ang += slice;
  });
  // 中空
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  // 中心文字
  ctx.fillStyle = '#1f2d27';
  ctx.font = 'bold 46px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fmtAmount(total), cx, cy - 10);
  ctx.fillStyle = '#9aa7a0';
  ctx.font = '22px sans-serif';
  ctx.fillText(statsType === 'expense' ? '总支出' : '总收入', cx, cy + 30);
}

function drawBar() {
  const canvas = $('#barChart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // 取近 6 个月
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(statsMonth.getFullYear(), statsMonth.getMonth() - i, 1);
    const recs = recordsInMonth(d).filter(r => r.type === statsType);
    const sum = recs.reduce((s, r) => s + r.amount, 0);
    months.push({ label: (d.getMonth()+1) + '月', sum, isCurrent: i === 0 });
  }
  const max = Math.max(...months.map(m => m.sum), 1);

  const pad = 40;
  const chartH = H - pad - 40;
  const gap = (W - pad*2) / months.length;

  // y 轴基线
  ctx.strokeStyle = '#eef2ef';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, H - 40);
  ctx.lineTo(W - pad, H - 40);
  ctx.stroke();

  months.forEach((m, i) => {
    const x = pad + gap * i + gap * 0.2;
    const w = gap * 0.6;
    const h = (m.sum / max) * chartH;
    const y = H - 40 - h;

    ctx.fillStyle = m.isCurrent ? '#4caf7d' : '#c8e6d5';
    // 圆角矩形
    const rad = 6;
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
    ctx.fill();

    // 数值
    if (m.sum > 0) {
      ctx.fillStyle = '#1f2d27';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.sum >= 10000 ? (m.sum/10000).toFixed(1)+'w' : Math.round(m.sum), x + w/2, y - 8);
    }

    // x 标签
    ctx.fillStyle = '#9aa7a0';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, x + w/2, H - 14);
  });
}

/* ---------- 分类管理 ---------- */
function openCatSheet(type) {
  catManageType = type;
  $('#catSheetTitle').textContent = type === 'expense' ? '支出分类' : '收入分类';
  renderCatManageList();
  $('#catSheet').classList.remove('hidden');
}

function renderCatManageList() {
  const box = $('#catManageList');
  const cats = state.categories[catManageType];
  box.innerHTML = cats.map(c => `
    <div class="cat-manage-item" data-id="${c.id}">
      <div class="cat-icon-wrap" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
      <div class="cat-manage-name">${c.name}</div>
      <div class="cat-manage-chevron">›</div>
    </div>
  `).join('');

  box.querySelectorAll('.cat-manage-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const cat = state.categories[catManageType].find(c => c.id === id);
      openCatEdit('edit', cat);
    });
  });
}

function openCatEdit(mode, cat) {
  catEditing = { mode, type: catManageType, category: cat ? { ...cat } : null };

  $('#catEditTitle').textContent = mode === 'new' ? '新建分类' : '编辑分类';
  $('#catEditName').value = cat ? cat.name : '';

  const defaultIcon = cat ? cat.icon : '📦';
  renderEmojiPicker(defaultIcon);

  const defaultColor = cat ? cat.color : COLOR_PALETTE[0];
  renderColorPalette(defaultColor);

  // 无法删除: 新建时 或者 最后一个分类
  const canDelete = mode === 'edit' && state.categories[catManageType].length > 1;
  $('#catEditDelete').classList.toggle('hidden', !canDelete);

  $('#catEditSheet').classList.remove('hidden');
}

function renderEmojiPicker(active) {
  $('#emojiPreview').textContent = active;
  const box = $('#emojiPicker');
  // 如果当前 emoji 不在预设库里,也加进去让它能显示为选中
  const list = EMOJI_LIBRARY.includes(active) ? EMOJI_LIBRARY : [active, ...EMOJI_LIBRARY];
  box.innerHTML = list.map(e =>
    `<div class="emoji-cell ${e === active ? 'active' : ''}" data-emoji="${e}">${e}</div>`
  ).join('');
  box.querySelectorAll('.emoji-cell').forEach(el => {
    el.addEventListener('click', () => {
      box.querySelectorAll('.emoji-cell').forEach(d => d.classList.remove('active'));
      el.classList.add('active');
      $('#emojiPreview').textContent = el.dataset.emoji;
    });
  });
}

function renderColorPalette(active) {
  const box = $('#colorPalette');
  box.innerHTML = COLOR_PALETTE.map(c =>
    `<div class="color-dot ${c === active ? 'active' : ''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');
  box.querySelectorAll('.color-dot').forEach(el => {
    el.addEventListener('click', () => {
      box.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      el.classList.add('active');
    });
  });
}

function saveCatEdit() {
  const name = $('#catEditName').value.trim();
  const icon = $('#emojiPicker .emoji-cell.active')?.dataset.emoji || '📦';
  const color = $('#colorPalette .color-dot.active')?.dataset.color || COLOR_PALETTE[0];
  if (!name) { toast('请输入名称'); return; }

  const list = state.categories[catEditing.type];
  if (catEditing.mode === 'new') {
    list.push({ id: uid(), name, icon, color });
  } else {
    const target = list.find(c => c.id === catEditing.category.id);
    if (target) Object.assign(target, { name, icon, color });
  }
  saveState();
  $('#catEditSheet').classList.add('hidden');
  renderCatManageList();
  if (currentTab === 'home') renderHome();
  if (currentTab === 'stats') renderStats();
  toast('已保存');
}

function deleteCatEdit() {
  if (!catEditing?.category) return;
  const used = state.records.some(r => r.type === catEditing.type && r.categoryId === catEditing.category.id);
  const msg = used
    ? '该分类有关联记录,删除后这些记录的分类会显示为"已删除"。确定删除?'
    : '确定删除该分类?';
  if (!confirm(msg)) return;
  state.categories[catEditing.type] = state.categories[catEditing.type].filter(c => c.id !== catEditing.category.id);
  saveState();
  $('#catEditSheet').classList.add('hidden');
  renderCatManageList();
  if (currentTab === 'home') renderHome();
  if (currentTab === 'stats') renderStats();
  toast('已删除');
}

/* ---------- 导入导出 ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jizhang-${fmtDate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('已导出');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.records || !data.categories) throw new Error('文件格式不正确');
      if (!confirm('导入会覆盖当前所有数据,确定继续?')) return;
      // 安全网 3:导入也走一次迁移,避免老备份与新代码不一致(比如老备份含 e_ai 而新代码已废弃)
      migrateDefaultCategories(data);
      migrateDeprecatedCategories(data);
      state = data;
      saveState();
      renderHome();
      toast('已导入(' + data.records.length + ' 条)');
    } catch (e) {
      toast('导入失败: ' + e.message);
    }
  };
  reader.readAsText(file);
}

function clearAll() {
  if (!confirm('将清空所有账单和自定义分类,此操作不可恢复,确定?')) return;
  if (!confirm('再次确认:真的要清空吗?')) return;
  state = {
    records: [],
    categories: {
      expense: DEFAULT_EXPENSE_CATS.map(c => ({ ...c })),
      income:  DEFAULT_INCOME_CATS.map(c => ({ ...c })),
    },
    // 标记:用户主动清空,允许绕过 saveState 的空写入拦截
    __allowEmpty: true,
  };
  saveState();
  delete state.__allowEmpty;
  renderHome();
  toast('已清空');
}

// 生成诊断文本(不带副作用,可独立调用)
function buildDiagnosticsText() {
  const lines = [];
  lines.push('=== 当前内存 state ===');
  lines.push('记录条数: ' + (state.records?.length ?? '?'));
  lines.push('支出分类: ' + (state.categories?.expense?.map(c => c.id).join(', ') ?? '?'));
  lines.push('收入分类: ' + (state.categories?.income?.map(c => c.id).join(', ') ?? '?'));

  lines.push('');
  lines.push('=== loadState 执行轨迹 ===');
  if (window.__loadTrace?.length) {
    window.__loadTrace.forEach(t => lines.push(t));
  } else {
    lines.push('(无,可能 loadState 未执行)');
  }

  lines.push('');
  lines.push('=== localStorage 主数据 ===');
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      lines.push('字节数: ' + raw.length);
      lines.push('记录条数: ' + (data.records?.length ?? '?'));
      lines.push('支出分类: ' + (data.categories?.expense?.map(c => c.id).join(', ') ?? '?'));
      lines.push('收入分类: ' + (data.categories?.income?.map(c => c.id).join(', ') ?? '?'));
    } else {
      lines.push('(空)');
    }
  } catch (e) {
    lines.push('读取失败: ' + e.message);
  }

  lines.push('');
  lines.push('=== 迁移前快照 ===');
  let foundSnapshot = false;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(MIGRATION_SNAPSHOT_PREFIX)) {
      foundSnapshot = true;
      try {
        const snap = JSON.parse(localStorage.getItem(key));
        lines.push(key.replace(MIGRATION_SNAPSHOT_PREFIX, '') + ': ' + (snap.records?.length ?? '?') + ' 条');
      } catch (e) {
        lines.push(key + ': 解析失败');
      }
    }
  }
  if (!foundSnapshot) lines.push('(无)');

  lines.push('');
  lines.push('=== 代码版本 ===');
  lines.push('CODE_VERSION: ' + CODE_VERSION);

  return lines.join('\n');
}

// 打开诊断弹层
function showDiagnostics() {
  $('#diagText').textContent = buildDiagnosticsText();
  $('#diagSheet').classList.remove('hidden');
}

function closeDiagnostics() {
  $('#diagSheet').classList.add('hidden');
}

// 复制诊断文本到剪贴板
function copyDiagnosticsText() {
  const text = $('#diagText').textContent;
  const done = () => toast('已复制诊断信息');
  const fail = () => toast('复制失败,请手动长按选择');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fail);
  } else {
    // 兼容老浏览器:select + execCommand
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (_) { fail(); }
  }
}

function restoreFromSnapshot() {
  // 找最新的一个快照(按 key 排序最大的)
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(MIGRATION_SNAPSHOT_PREFIX)) keys.push(k);
  }
  if (keys.length === 0) { toast('没有可恢复的快照'); return; }
  keys.sort();
  const latest = keys[keys.length - 1];
  if (!confirm('将用快照覆盖当前数据(快照: ' + latest.replace(MIGRATION_SNAPSHOT_PREFIX, '') + '),确定?')) return;
  try {
    const raw = localStorage.getItem(latest);
    const data = JSON.parse(raw);
    if (!data.records || !data.categories) throw new Error('快照格式异常');
    migrateDefaultCategories(data);
    migrateDeprecatedCategories(data);
    state = data;
    saveState();
    renderHome();
    // 刷新诊断面板里显示的文本(记录数已变)并关掉弹层
    if ($('#diagSheet') && !$('#diagSheet').classList.contains('hidden')) {
      $('#diagText').textContent = buildDiagnosticsText();
    }
    toast('已从快照恢复(' + data.records.length + ' 条)');
  } catch (e) {
    toast('恢复失败: ' + e.message);
  }
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  // Tab
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  // 记账按钮
  $('#addBtn').addEventListener('click', () => openRecordSheet());
  $('#recordCancel').addEventListener('click', closeRecordSheet);
  $('#recordDelete').addEventListener('click', deleteRecord);

  // 时间刷新按钮:把日期时间输入框填成此刻
  // 动画三阶段:涟漪扩散 → 刷新图标淡出、对勾淡入(带轻微放大) → 对勾淡出、刷新图标淡回
  $('#timeNowBtn').addEventListener('click', e => {
    const now = new Date();
    $('#dateInput').value = fmtDate(now);
    $('#timeInput').value = fmtTime(now);

    const btn = e.currentTarget;
    // 动画期间再次点击忽略,避免叠加
    if (btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';

    // 阶段 1:涟漪(0 - 500ms)
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.setProperty('--ripple-x', (e.clientX - rect.left) + 'px');
    ripple.style.setProperty('--ripple-y', (e.clientY - rect.top) + 'px');
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });

    // 阶段 2:涟漪进行中 300ms 时切成对勾
    setTimeout(() => {
      btn.classList.add('swap');
    }, 300);

    // 阶段 3:对勾停留 500ms 后切回刷新(300 + 500 = 800ms)
    setTimeout(() => {
      btn.classList.remove('swap');
      btn.dataset.busy = '';
    }, 800);
  });

  // 类型切换
  $$('.type-btn').forEach(b => b.addEventListener('click', () => {
    if (!recordDraft) return;
    if (recordDraft.type !== b.dataset.rtype) {
      recordDraft.type = b.dataset.rtype;
      recordDraft.categoryId = state.categories[recordDraft.type][0]?.id || null;
      recordDraft.note = '';
    }
    refreshRecordSheet();
  }));

  // 键盘
  $$('.keypad .key').forEach(k => k.addEventListener('click', () => {
    if (!recordDraft) return;
    const action = k.dataset.action;
    if (action) handleKeyInput(action);
    else handleKeyInput(k.textContent);
  }));

  // 点击遮罩关闭
  $('#recordSheet').addEventListener('click', e => {
    if (e.target.id === 'recordSheet') closeRecordSheet();
  });

  // 统计页
  $$('.stats-tab').forEach(b => b.addEventListener('click', () => {
    statsType = b.dataset.type;
    renderStats();
  }));
  $('#statsPrevMonth').addEventListener('click', () => {
    statsMonth = new Date(statsMonth.getFullYear(), statsMonth.getMonth() - 1, 1);
    renderStats();
  });
  $('#statsNextMonth').addEventListener('click', () => {
    statsMonth = new Date(statsMonth.getFullYear(), statsMonth.getMonth() + 1, 1);
    renderStats();
  });

  // 设置
  $('#manageExpenseCats').addEventListener('click', () => openCatSheet('expense'));
  $('#manageIncomeCats').addEventListener('click', () => openCatSheet('income'));
  $('#catSheetClose').addEventListener('click', () => $('#catSheet').classList.add('hidden'));
  $('#catAddBtn').addEventListener('click', () => openCatEdit('new', null));
  $('#catSheet').addEventListener('click', e => {
    if (e.target.id === 'catSheet') $('#catSheet').classList.add('hidden');
  });

  $('#catEditCancel').addEventListener('click', () => $('#catEditSheet').classList.add('hidden'));
  $('#catEditSave').addEventListener('click', saveCatEdit);
  $('#catEditDelete').addEventListener('click', deleteCatEdit);
  $('#catEditSheet').addEventListener('click', e => {
    if (e.target.id === 'catEditSheet') $('#catEditSheet').classList.add('hidden');
  });

  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) importData(f);
    e.target.value = '';
  });
  $('#diagBtn').addEventListener('click', showDiagnostics);
  $('#diagClose').addEventListener('click', closeDiagnostics);
  $('#diagCopyBtn').addEventListener('click', copyDiagnosticsText);
  $('#diagRestoreBtn').addEventListener('click', restoreFromSnapshot);
  $('#diagSheet').addEventListener('click', e => {
    if (e.target.id === 'diagSheet') closeDiagnostics();
  });
  $('#clearBtn').addEventListener('click', clearAll);
}

/* ---------- Service Worker ---------- */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW 注册失败', err));
  }
}

/* ---------- 启动 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  renderHome();
  registerSW();
  const footer = document.getElementById('settingsFooter');
  if (footer) footer.textContent = '记账 · 本地存储 · ' + CODE_VERSION;
});
