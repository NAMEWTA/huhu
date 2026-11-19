'use strict';

const $ = (id) => document.getElementById(id);
const board = $('board');
const drawer = $('drawer');
const dialog = $('dialog');
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const columns = 6;
const vaultNames = ['北岸项目档案与季度研究工作区 🐯', '个人研究与资料整理'];
const labels = { home: '首页', tasks: '任务', notes: '知识库', inbox: '收件箱', plugins: '插件中心', ssh: 'SSH', agent: 'Agent CLI', rules: '自动化', git: '版本管理', closed: '窗口已关闭' };
const hosts = { studio: '北岸项目 · 资料归档主机', garden: '实验室 · 文档预览主机' };
const notes = ['十一月研究访谈与问题记录', '工作台交付清单与复盘提纲', '资料目录命名约定'];
const captures = ['对比三组用户访谈中的重复反馈', '补齐研究工坊使用手册的回链'];
const taskFixtures = [
  { id: 1, title: '整理周末项目走查记录和遗留问题', today: true },
  { id: 2, title: '复查研究样本与会议纪要的引用', today: true },
  { id: 3, title: '汇总下周发布说明的改动和附件', today: false },
];
const definitions = {
  metrics: { name: '概览', group: 'system', owner: '工作台', desc: '待办、笔记、待处理捕获与启用规则。', size: [6, 2], min: [3, 1] },
  tasks: { name: '我的任务', group: 'plugin', owner: '任务', desc: '跟踪全部待办或仅显示今日安排。', size: [3, 3], min: [2, 2], multi: true, config: 'filter' },
  notes: { name: '继续上次的思考', group: 'plugin', owner: '知识库', desc: '查看最近编辑的笔记并回到对应文档。', size: [3, 3], min: [2, 2] },
  focus: { name: '专注', group: 'system', owner: '工作台', desc: '开始专注并在工作台跟踪本次计时。', size: [3, 2], min: [2, 2] },
  habits: { name: '习惯', group: 'system', owner: '工作台', desc: '记录今天的阅读与整理习惯。', size: [3, 2], min: [2, 2] },
  inbox: { name: '灵感收件箱', group: 'plugin', owner: '收件箱', desc: '查看等待整理的新捕获。', size: [3, 3], min: [2, 2] },
  activity: { name: '最近活动', group: 'system', owner: '工作台', desc: '查看当前工作区近几次变动。', size: [3, 3], min: [2, 2] },
  ssh: { name: 'SSH 主机', group: 'plugin', owner: 'SSH', desc: '查看已保存的一台主机及分组。', size: [3, 2], min: [2, 2], multi: true, config: 'host' },
  git: { name: 'Git 概览', group: 'plugin', owner: '版本管理', desc: '查看当前分支和工作区的改动数量。', size: [3, 2], min: [2, 2] },
  agent: { name: 'Agent CLI', group: 'plugin', owner: 'Agent CLI', desc: '查看工作区状态并进入 Agent CLI。', size: [3, 2], min: [2, 2] },
  rules: { name: '自动化摘要', group: 'plugin', owner: '自动化', desc: '查看启用规则和最近一次运行。', size: [3, 2], min: [2, 2] },
};

let boards, businesses, activeVault, currentPage, openTabs, openedNote, lastSelectedNote;
let draft, undo, baseRevision, notice, pendingLeave, saving, pendingReceipt;
let serial, drag, focusTicker, sshRetry;

function escape(text) {
  const node = document.createElement('span');
  node.textContent = text;
  return node.innerHTML.replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function instance(id, type, x, y, config = '') {
  const [w, h] = definitions[type].size;
  return { id, type, title: '', config, hidden: false, x, y, w, h };
}

function defaults(vault) {
  const prefix = vault === 0 ? 'north-' : 'personal-';
  return [
    instance(prefix + 'metrics', 'metrics', 0, 0),
    instance(prefix + 'tasks', 'tasks', 0, 2, 'all'),
    instance(prefix + 'notes', 'notes', 3, 2),
    instance(prefix + 'focus', 'focus', 0, 5),
  ];
}

function business(vault) {
  return { tasks: taskFixtures.slice(0, vault === 0 ? 3 : 1).map((task) => ({ ...task, done: false })), habit: false, focusUntil: 0 };
}

function reset() {
  clearTimeout(saving);
  clearTimeout(sshRetry);
  clearInterval(focusTicker);
  boards = vaultNames.map((_, vault) => ({ revision: 1, items: defaults(vault), backup: null }));
  businesses = vaultNames.map((_, vault) => business(vault));
  activeVault = 0;
  currentPage = 'home';
  openTabs = ['home'];
  openedNote = '';
  lastSelectedNote = '';
  draft = null;
  undo = [];
  baseRevision = null;
  notice = null;
  pendingLeave = null;
  pendingReceipt = null;
  drag = null;
  saving = null;
  sshRetry = null;
  serial = 1;
  for (const [id, value] of Object.entries({ 'save-fault': '', 'board-scenario': '', 'ssh-state': 'on', theme: 'claude', appearance: 'light' })) $(id).value = value;
  if (drawer.open) drawer.close();
  if (dialog.open) dialog.close();
  focusTicker = setInterval(updateClock, 1000);
  updateTheme();
  render();
  announce('看板与示例数据已重置。');
}

const saved = () => boards[activeVault];
const data = () => businesses[activeVault];
const items = () => draft || saved().items;
const readOnly = () => $('board-scenario').value === 'readonly';
const recovery = () => $('board-scenario').value === 'recovery';
const canEdit = () => !readOnly() && !recovery();
const isNarrow = () => board.getBoundingClientRect().width <= 650;
const sorted = (collection) => collection.slice().sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
const changed = () => draft !== null && JSON.stringify(sorted(draft)) !== JSON.stringify(sorted(saved().items));
const widgetName = (item) => item.title || definitions[item.type].name;

function announce(message) { $('status').textContent = message; }
function setNotice(message, tone = 'warning', actions = '') { notice = { message, tone, actions }; }
function updateTheme() {
  const appearance = $('appearance').value;
  document.documentElement.dataset.theme = $('theme').value;
  document.documentElement.dataset.mode = appearance === 'system' ? (systemDark.matches ? 'dark' : 'light') : appearance;
}

const button = (label, action, classes = '', attrs = '') =>
  '<button type="button" class="' + classes + '" data-action="' + action + '" ' + attrs + '>' + label + '</button>';

function navigation(label, page, className = '', item = '') {
  return '<button type="button" class="' + className + '" data-nav="' + page + '"' +
    (item ? ' data-note="' + escape(item) + '"' : '') + '>' + label + '</button>';
}

function render() {
  const home = currentPage === 'home';
  const editing = draft !== null;
  $('dashboard').hidden = !home;
  $('dashboard').dataset.editing = editing;
  $('module').hidden = home;
  $('rail').hidden = currentPage === 'closed';
  $('tabs').hidden = currentPage === 'closed';
  $('crumb').hidden = currentPage === 'closed';
  $('vault').disabled = currentPage === 'closed';
  $('vault').textContent = vaultNames[activeVault] + ' ▾';
  $('vault').title = vaultNames[activeVault];
  $('crumb').innerHTML = '<span class="ellip">' + vaultNames[activeVault] + '</span><span aria-hidden="true">›</span><strong>' + labels[currentPage] + '</strong>';
  $('tabs').innerHTML = openTabs.map((page) =>
    '<button type="button" class="quiet" data-nav="' + page + '"' + (page === currentPage ? ' aria-current="page"' : '') + '>' + labels[page] + '</button>').join('');
  for (const item of $('rail').querySelectorAll('button')) {
    if (item.dataset.nav === currentPage) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  $('page-description').textContent = editing ? '编辑草稿 · 保存后应用到当前 Vault。' : '按你的工作方式组织首页。';
  $('begin').hidden = editing;
  $('add').hidden = isNarrow();
  $('begin').disabled = $('add').disabled = $('empty-add').disabled = !canEdit() || Boolean(saving);
  $('save').disabled = Boolean(saving || pendingReceipt) || !canEdit();
  $('layout-actions').hidden = !editing;
  $('board-tools').hidden = !editing;
  $('board-tools').inert = Boolean(saving || pendingReceipt);
  board.inert = Boolean(saving || pendingReceipt);
  $('add').disabled = !canEdit() || Boolean(saving || pendingReceipt);
  $('layout-actions').querySelector('[data-action=cancel]').disabled = Boolean(saving || pendingReceipt);
  $('board-tools').querySelector('[data-action=undo]').disabled = undo.length === 0;
  $('revision').textContent = '布局版本 ' + saved().revision + (editing ? ' · 编辑中' : '');
  if (home) renderBoard();
  else $('module').innerHTML = moduleContent();

  let status = notice;
  if (readOnly()) status = { message: '当前 Vault 为只读，已保存布局可浏览。', tone: 'warning' };
  if (recovery()) status = { message: '当前新格式布局无法读取。正在显示安全默认布局。', tone: 'error', actions: button('恢复最近的备份', 'backup') };
  $('notice').innerHTML = status ? '<div class="row banner" data-tone="' + status.tone + '"><p class="grow">' + escape(status.message) + '</p>' + (status.actions || '') + '</div>' : '';
}

function visibleItems() {
  return sorted(recovery() ? defaults(activeVault) : items()).filter((item) =>
    draft || (!item.hidden && !(item.type === 'ssh' && ['off', 'missing'].includes($('ssh-state').value))));
}

function renderBoard(focus = null) {
  const visible = visibleItems();
  board.classList.toggle('editing', draft !== null);
  board.innerHTML = visible.map(renderWidget).join('');
  $('empty').hidden = visible.length !== 0;
  if (focus) {
    const card = board.querySelector('[data-id="' + focus.id + '"]');
    (card?.querySelector('[data-action="' + focus.action + '"]') || $('add')).focus({ preventScroll: true });
  }
}

function frameStyles(item) {
  return '--column:' + (item.x + 1) + ';--row:' + (item.y + 1) + ';--width:' + item.w + ';--height:' + item.h;
}

function renderWidget(item) {
  const name = escape(widgetName(item));
  const geometry = (item.x + 1) + ' 列 ' + (item.y + 1) + ' 行 · ' + item.w + ' × ' + item.h;
  const label = ' data-id="' + item.id + '" aria-label="';
  const controls = !draft ? '' : '<div class="row widget-actions">' +
    button('⠿', 'move', 'icon quiet handle desktop-layout', label + '移动 ' + name + '（方向键）" title="移动 · 方向键"') +
    button('◢', 'resize', 'icon quiet handle desktop-layout', label + '缩放 ' + name + '（方向键）" title="缩放 · 方向键"') +
    button('⋯', 'widget-menu', 'icon quiet', label + '调整 ' + name + '" title="调整小组件" aria-haspopup="dialog"') +
    '</div>';
  return '<article class="card widget" data-id="' + item.id + '" data-type="' + item.type + '" data-geometry="' + geometry + '" style="' + frameStyles(item) +
    '" aria-labelledby="title-' + item.id + '"><header class="card-head"><h2 id="title-' + item.id + '">' + name + '</h2>' + controls +
    '</header>' + (draft ? '<small class="desktop-layout">' + geometry + (item.hidden ? ' · 已隐藏' : '') + '</small>' : '') +
    '<div class="widget-body ' + (draft ? '' : 'grow') + '">' + widgetContent(item) + '</div></article>';
}

function taskList(filter = 'all') {
  const tasks = data().tasks.filter((task) => !task.done && (filter !== 'today' || task.today));
  if (tasks.length === 0) return '<p class="muted">当前筛选下没有待处理任务。</p>';
  return tasks.map((task) => '<label class="row list-row"><input type="checkbox" data-task="' + task.id + '"' +
      (readOnly() || draft ? ' disabled' : '') + '><span>' + task.title + '<br><small>' + (task.today ? '今天' : '接下来') + '</small></span></label>').join('');
}

function widgetContent(item) {
  if (item.hidden) return '<p class="muted">已隐藏。通过小组件菜单恢复显示。</p>';
  if (item.type === 'tasks') return '<p class="muted">' + (item.config === 'today' ? '今日安排' : '全部待办') + '</p>' + taskList(item.config);
  if (item.type === 'metrics') {
    const metrics = [[data().tasks.filter((t) => !t.done).length, '待办', 'tasks'], [notes.length, '笔记', 'notes'], [captures.length, '待处理', 'inbox'], [2, '启用规则', 'rules']];
    return '<div class="metrics">' + metrics.map(([count, label, page]) => navigation('<strong>' + count + '</strong><br>' + label, page, 'quiet')).join('') + '</div>';
  }
  if (item.type === 'notes') return notes.map((note) => navigation(note + ' →', 'notes', 'list-row quiet', note)).join('');
  if (item.type === 'inbox') return captures.map((capture) => '<p class="list-row">' + capture + '</p>').join('') + navigation('打开收件箱 →', 'inbox', 'quiet');
  if (item.type === 'focus') return '<p class="muted" data-clock>' + clockLabel() + '</p>' + button(data().focusUntil ? '暂停专注' : '开始 25 分钟', 'focus', 'quiet', draft ? 'disabled' : '');
  if (item.type === 'habits') return '<label class="row list-row"><input type="checkbox" data-habit="true"' + (data().habit ? ' checked' : '') +
    (readOnly() || draft ? ' disabled' : '') + '> 今天阅读并整理一页笔记</label>';
  if (item.type === 'activity') return '<p class="list-row">09:20 · 更新发布走查记录</p><p class="list-row">08:45 · 整理研究访谈提纲</p>';
  if (item.type === 'git') return '<p><strong>main</strong> · 3 个未提交变更</p>' + navigation('查看版本管理 →', 'git', 'quiet');
  if (item.type === 'agent') return '<p>工作区可用</p>' + navigation('打开 Agent CLI →', 'agent', 'quiet');
  if (item.type === 'rules') return '<p>2 条启用 · 最近一次运行成功</p>' + navigation('查看自动化 →', 'rules', 'quiet');
  const pluginState = $('ssh-state').value;
  if (pluginState === 'off' || pluginState === 'missing') return '<p class="muted">' + (pluginState === 'off' ? '插件已停用' : '缺少小组件定义') + '。已保留实例、配置与位置。</p>';
  if (pluginState === 'denied') return '<p class="muted">当前 Vault 未授权读取 SSH 主机。</p>';
  if (pluginState === 'error') return '<p class="banner" data-tone="error">读取主机列表失败。</p>' + button('重试读取', 'retry-ssh', 'quiet');
  if (pluginState === 'loading') return '<progress aria-label="正在读取主机"></progress>';
  if (pluginState === 'broken-host' && item.config === 'studio') return '<p class="banner" data-tone="warning">已配置的主机不存在。</p>' +
    (draft && !isNarrow() ? button('重新选择主机', 'configure', 'quiet', 'data-id="' + item.id + '"') : '<p class="muted">可在桌面布局中重新选择。</p>');
  return '<p><strong>' + hosts[item.config] + '</strong></p><p class="muted">已保存主机 · 研究与交付</p>' + navigation('查看主机 →', 'ssh', 'quiet');
}

function clockLabel() {
  if (!data().focusUntil) return '尚未开始本次专注。';
  const seconds = Math.max(0, Math.ceil((data().focusUntil - Date.now()) / 1000));
  return '本次剩余 ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
function updateClock() {
  for (const clock of document.querySelectorAll('[data-clock]')) clock.textContent = clockLabel();
}

function moduleContent() {
  const lead = '<h1>' + labels[currentPage] + '</h1>';
  if (currentPage === 'closed') return lead + '<p class="muted">重新打开后显示当前 Vault 的已提交布局。</p><div>' + navigation('重新打开工作台', 'home', 'primary') + '</div>';
  const body = {
    tasks: taskList(),
    notes: openedNote ? '<h2>' + escape(openedNote) + '</h2><p>记录本周的讨论、决定和待跟进事项。</p>' : notes.map((note) => navigation(note, 'notes', 'list-row quiet', note)).join(''),
    inbox: captures.map((capture) => '<p class="list-row">' + capture + '</p>').join(''),
    plugins: '<p>SSH、版本管理、知识库、任务和收件箱提供首页小组件。</p>',
    ssh: '<p>已保存主机供布局演练选用。</p>' + Object.values(hosts).map((host) => '<p class="list-row">' + host + '</p>').join(''),
    agent: '<p>研究终端工作区 · 待开始</p>', rules: '<p>2 条已启用 · 最近运行成功</p>', git: '<p>main · 3 个未提交变更</p>',
  };
  return lead + '<div class="card stack">' + (body[currentPage] || '') + '</div><div>' + navigation('返回首页', 'home') + '</div>';
}

function beginEditing() {
  if (!canEdit() || saving) return false;
  if (!draft) { draft = structuredClone(saved().items); baseRevision = saved().revision; undo = []; notice = null; render(); }
  return true;
}
function alter(next, message, focus = null) {
  if (!draft || saving || !canEdit()) return;
  undo.push(structuredClone(draft));
  draft = next;
  if (notice?.tone === 'success') notice = null;
  render();
  if (focus) {
    const card = board.querySelector('[data-id="' + focus.id + '"]');
    (card?.querySelector('[data-action="' + focus.action + '"]') || $('add')).focus({ preventScroll: true });
  }
  announce(message);
}
function cancelEdit(message = '已取消编辑，已提交布局仍可查看。') {
  draft = null;
  undo = [];
  baseRevision = null;
  pendingReceipt = null;
  notice = null;
  render();
  announce(message);
}
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function valid(item) {
  const [minW, minH] = definitions[item.type].min;
  return item.x >= 0 && item.y >= 0 && item.x + item.w <= columns && item.y <= 100 &&
    item.w >= minW && item.h >= minH && item.h <= 5;
}
function reflow(collection, candidate) {
  const placed = [candidate];
  for (const item of sorted(collection).filter((entry) => entry.id !== candidate.id)) {
    const position = { ...item };
    while (placed.some((other) => overlaps(position, other))) position.y += 1;
    placed.push(position);
  }
  return placed.every(valid) ? sorted(placed) : null;
}
function firstFree(collection, item) {
  for (let y = 0; y <= 100; y++) {
    for (let x = 0; x <= columns - item.w; x++) {
      const trial = { ...item, x, y };
      if (!collection.some((other) => overlaps(trial, other))) return trial;
    }
  }
  return null;
}
function applyGeometry(item, candidate, focus) {
  const next = valid(candidate) && reflow(draft, candidate);
  if (!next) { announce('超出网格或卡片尺寸限制。保留上次有效位置。'); return false; }
  alter(next, widgetName(item) + ' · 第 ' + (candidate.y + 1) + ' 行，第 ' + (candidate.x + 1) + ' 列，' + candidate.w + ' × ' + candidate.h + '。', focus);
  return true;
}

function nudgeOrder(item, delta) {
  const arranged = sorted(draft);
  const index = arranged.findIndex((entry) => entry.id === item.id);
  const target = index + delta;
  if (target < 0 || target >= arranged.length) return announce('已到达顺序边界。');
  [arranged[index], arranged[target]] = [arranged[target], arranged[index]];
  const packed = packInOrder(arranged);
  if (!packed) return announce('当前画布已满，顺序保持原样。');
  dialog.close();
  alter(packed, widgetName(item) + ' 已移到第 ' + (target + 1) + ' 项。桌面布局同步。', { id: item.id, action: 'widget-menu' });
}
function packInOrder(arranged) {
  const packed = [];
  let cursor = 0;
  for (const entry of arranged) {
    while (cursor <= 100 * columns) {
      const trial = { ...entry, y: Math.floor(cursor / columns), x: cursor % columns };
      cursor += 1;
      if (!valid(trial) || packed.some((other) => overlaps(trial, other))) continue;
      packed.push(trial);
      break;
    }
  }
  return packed.length === arranged.length ? packed : null;
}

function setCss(node, item) {
  node.style.cssText = frameStyles(item);
}
function pointerPreview(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const x = Math.round((event.clientX - drag.x) / drag.stepX);
  const y = Math.round((event.clientY - drag.y) / drag.stepY);
  const base = drag.item;
  const moving = drag.action === 'move';
  drag.candidate = moving ? { ...base, x: base.x + x, y: base.y + y } : { ...base, w: base.w + x, h: base.h + y };
  drag.preview = valid(drag.candidate) && reflow(draft, drag.candidate);
  const view = drag.preview || draft;
  for (const item of view) {
    const card = board.querySelector('.widget[data-id="' + item.id + '"]');
    setCss(card, item);
    card.classList.toggle('invalid', item.id === base.id && !drag.preview);
  }
}
board.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.handle');
  if (!handle || event.button !== 0 || !draft || saving || isNarrow()) return;
  const card = handle.closest('.widget');
  const item = draft.find((entry) => entry.id === card.dataset.id);
  const styles = getComputedStyle(board);
  const gap = parseFloat(styles.columnGap);
  drag = { pointerId: event.pointerId, item, action: handle.dataset.action, x: event.clientX, y: event.clientY,
    stepX: (board.getBoundingClientRect().width + gap) / columns, stepY: parseFloat(styles.gridAutoRows) + gap };
  card.classList.add('moving');
  handle.setPointerCapture(event.pointerId);
});
board.addEventListener('pointermove', pointerPreview);
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  board.addEventListener(eventName, (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const gesture = drag;
    drag = null;
    if (eventName === 'pointerup' && gesture.candidate) {
      if (applyGeometry(gesture.item, gesture.candidate, { id: gesture.item.id, action: gesture.action })) return;
    }
    renderBoard({ id: gesture.item.id, action: gesture.action });
  });
}
board.addEventListener('keydown', (event) => {
  const handle = event.target.closest('.handle');
  if (!handle || !draft || saving || isNarrow()) return;
  const delta = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
  if (!delta) return;
  event.preventDefault();
  const item = draft.find((entry) => entry.id === handle.dataset.id);
  const [x, y] = delta;
  const candidate = handle.dataset.action === 'move' ? { ...item, x: item.x + x, y: item.y + y } : { ...item, w: item.w + x, h: item.h + y };
  applyGeometry(item, candidate, { id: item.id, action: handle.dataset.action });
});

function showDialog(title, body) {
  dialog.innerHTML = '<div class="stack"><h2 id="dialog-title">' + title + '</h2>' + body + '</div>';
  if (!dialog.open) dialog.showModal();
  else dialog.querySelector('[autofocus]')?.focus();
}
const cancel = (action = 'dismiss') => button('取消', action, '', 'autofocus');

function available(type) {
  return type !== 'ssh' || !['off', 'missing', 'denied'].includes($('ssh-state').value);
}

function updateCatalogCategories() {
  const owners = [...new Set(Object.entries(definitions)
    .filter(([type, def]) => def.group === 'plugin' && available(type))
    .map(([, def]) => def.owner))];
  $('catalog-category').innerHTML = '<option value="">全部</option><option value="system">系统</option><option value="plugin">插件</option>' +
    owners.map((owner) => '<option value="' + escape(owner) + '">' + escape(owner) + '</option>').join('');
}
function renderCatalog() {
  const query = $('catalog-search').value.trim().toLowerCase();
  const category = $('catalog-category').value;
  const entries = Object.entries(definitions).filter(([type, definition]) => available(type) &&
    (!category || category === definition.group || category === definition.owner) &&
    [definition.name, definition.owner, definition.desc].some((text) => text.toLowerCase().includes(query)));
  $('catalog-results').innerHTML = ['system', 'plugin'].map((group) => {
    const matches = entries.filter(([, entry]) => entry.group === group);
    if (matches.length === 0) return '';
    return '<fieldset class="stack"><legend>' + (group === 'system' ? '系统' : '插件') + '</legend>' + matches.map(([type, entry]) => {
      const existing = !entry.multi && draft.find((item) => item.type === type);
      const existingLabel = existing ? existing.hidden ? '恢复显示' : '已添加' : '选择';
      const attrs = 'data-type="' + type + '" ' + (existing && !existing.hidden ? 'disabled' : '');
      return '<div class="card catalog-row"><div><h3>' + entry.name + '</h3><p>' + entry.owner + ' · ' + entry.size.join(' × ') +
        '</p><p>' + entry.desc + '</p></div>' + button(existingLabel, 'pick', '', attrs) + '</div>';
    }).join('') + '</fieldset>';
  }).join('') || '<p class="empty">没有符合条件且可用的小组件。</p>';
}

function configure(type, item, returnToCatalog = false) {
  const def = definitions[type];
  const initial = item?.config || (def.config === 'host' ? 'studio' : 'all');
  let configField = '';
  if (def.config === 'host') configField = '<label>已保存的主机<select name="config">' +
    Object.entries(hosts).filter(([id]) => $('ssh-state').value !== 'broken-host' || id !== 'studio')
      .map(([id, label]) => '<option value="' + id + '"' + (initial === id ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>';
  if (def.config === 'filter') configField = '<label>任务筛选<select name="config"><option value="all">全部待办</option><option value="today"' +
    (initial === 'today' ? ' selected' : '') + '>今日安排</option></select></label>';
  showDialog((item ? '配置' : '添加') + '小组件 · ' + def.name, '<form id="configure-form" class="stack" data-type="' + type + '" data-item="' + (item?.id || '') + '">' +
    '<label>显示标题<input name="title" maxlength="60" value="' + escape(item?.title || '') + '" placeholder="' + def.name + '" autofocus></label>' + configField +
    '<p class="muted">推荐尺寸 ' + def.size.join(' × ') + '</p><p id="configuration-error" role="alert" hidden></p><div class="dialog-actions">' +
    button(returnToCatalog ? '返回目录' : '取消', 'dismiss') + '<button class="primary" type="submit">' + (item ? '应用配置' : '添加到看板') + '</button></div></form>');
}

function widgetMenu(item) {
  const narrow = isNarrow();
  const size = button('顺序与尺寸', 'geometry', '', 'data-id="' + item.id + '" autofocus');
  const controls = narrow ? size : size +
    button('配置或改名', 'configure', '', 'data-id="' + item.id + '"' + (available(item.type) ? '' : ' disabled')) +
    (definitions[item.type].multi ? button('复制实例', 'duplicate', '', 'data-id="' + item.id + '"' + (available(item.type) ? '' : ' disabled')) : '') +
    button(item.hidden ? '恢复显示' : '隐藏卡片', 'toggle-hidden', '', 'data-id="' + item.id + '"') +
    button('移除实例…', 'remove-confirm', 'danger', 'data-id="' + item.id + '"');
  showDialog(escape(widgetName(item)), '<p class="muted">实例 ' + item.id + ' · ' + item.w + ' × ' + item.h + '</p><div class="stack">' + controls +
    '</div><div class="dialog-actions">' + button('关闭', 'dismiss') + '</div>');
}

function geometryForm(item) {
  const narrow = isNarrow();
  const [minW, minH] = definitions[item.type].min;
  const input = (label, name, min, max, value, extra = '') => '<label>' + label + '<input type="number" name="' + name +
    '" required min="' + min + '" max="' + max + '" value="' + value + '" ' + extra + '></label>';
  const position = narrow ? '<div class="row">' + button('向前移一项', 'before', '', 'data-id="' + item.id + '" autofocus') +
    button('向后移一项', 'after', '', 'data-id="' + item.id + '"') + '</div>' :
    '<div class="inputs">' + input('起始列', 'x', 1, columns, item.x + 1, 'autofocus') + input('起始行', 'y', 1, 101, item.y + 1) + '</div>';
  showDialog('调整顺序与尺寸 · ' + escape(widgetName(item)), '<form id="geometry-form" class="stack" data-item="' + item.id + '">' +
    (narrow ? '<p class="muted">当前第 ' + (sorted(draft).findIndex((entry) => entry.id === item.id) + 1) +
    ' 项。宽度记录到同一布局，窄屏仍用单列展示。</p>' : '') + position + '<div class="inputs">' +
    input('宽（格）', 'w', minW, columns, item.w) + input('高（格）', 'h', minH, 5, item.h) +
    '</div><p id="geometry-error" role="alert" hidden>这个尺寸会超出可用网格。请缩小尺寸，或在桌面视图调整起始列。</p><div class="dialog-actions">' +
    button('推荐尺寸', 'recommended', '', 'data-id="' + item.id + '"') + button('取消', 'dismiss') +
    '<button class="primary" type="submit">应用尺寸</button></div></form>');
}

function updateGeometry(item, size) {
  const candidate = { ...item, ...size };
  const narrow = isNarrow();
  if (narrow) candidate.x = Math.min(item.x, columns - candidate.w);
  const position = valid(candidate) && reflow(draft, candidate);
  if (!position) return false;
  if (narrow) {
    const arrangement = sorted(draft).map((entry) => entry.id === candidate.id ? candidate : entry);
    const sameOrder = position.every((entry, index) => entry.id === arrangement[index].id);
    const next = sameOrder ? position : packInOrder(arrangement);
    if (!next) return false;
    dialog.close();
    alter(next, widgetName(item) + ' 的尺寸已设为 ' + candidate.w + ' × ' + candidate.h + '。桌面布局同步。', { id: item.id, action: 'widget-menu' });
    return true;
  }
  dialog.close();
  return applyGeometry(item, candidate, { id: item.id, action: 'widget-menu' });
}

function openVaults() {
  showDialog('切换 Vault', '<div class="stack">' +
    vaultNames.map((name, index) => button(escape(name), 'open-vault', '', 'data-index="' + index + '"' + (index === activeVault ? ' disabled' : ' autofocus'))).join('') +
    '</div><div class="dialog-actions">' + button('取消', 'dismiss') + '</div>');
}

function requestLeave(target) {
  if ((target.page === 'home' && currentPage === 'home') || saving) return;
  if (pendingReceipt) {
    $('notice').querySelector('button')?.focus();
    announce('请先核对已提交布局，再离开当前页面。');
    return;
  }
  if (!changed()) return leave(target);
  pendingLeave = target;
  showDialog(target.page === 'closed' ? '关闭窗口前处理看板草稿' : '离开前处理看板草稿',
    '<p>当前 Vault 的布局还未保存。</p><div class="dialog-actions">' +
    button('继续编辑', 'keep-editing', '', 'autofocus') + button('放弃并离开', 'discard-leave', 'danger') +
    button('保存并离开', 'save-leave', 'primary') + '</div>');
}

function leave(target) {
  if (dialog.open) dialog.close();
  draft = null;
  baseRevision = null;
  undo = [];
  pendingReceipt = null;
  pendingLeave = null;
  notice = null;
  if ('vault' in target) {
    activeVault = target.vault;
    currentPage = 'home';
    openTabs = ['home'];
    openedNote = '';
    lastSelectedNote = '';
    $('board-scenario').value = '';
  } else {
    currentPage = target.page;
    if (target.page !== 'closed' && !openTabs.includes(target.page)) openTabs.push(target.page);
    if (target.note) lastSelectedNote = target.note;
    openedNote = target.page === 'notes' ? lastSelectedNote : '';
  }
  render();
  $('module').querySelector('h1')?.focus();
  announce(currentPage === 'closed' ? '窗口已关闭。' : '当前 Vault · ' + labels[currentPage]);
}

function saveDraft(target = null) {
  if (!draft || saving || pendingReceipt || !canEdit()) return;
  if (dialog.open) dialog.close();
  pendingLeave = null;
  const input = sorted(structuredClone(draft));
  const fault = $('save-fault').value;
  $('save-fault').value = '';
  saving = setTimeout(() => {
    saving = null;
    if (fault === 'write') {
      setNotice('布局写入失败。已保留草稿，可重试保存。', 'error');
      render();
      $('save').focus();
      return;
    }
    const snapshot = saved();
    if (fault === 'conflict') {
      snapshot.backup = structuredClone(snapshot.items);
      snapshot.revision += 1;
      if (snapshot.items.length) snapshot.items[0].title = '团队更新 · 概览';
    }
    if (snapshot.revision !== baseRevision) {
      setNotice('其他会话已保存版本 ' + snapshot.revision + '。你的草稿仍在。', 'error', button('对照最新版本', 'compare'));
      render();
      $('notice').querySelector('button').focus();
      return;
    }
    snapshot.backup = structuredClone(snapshot.items);
    snapshot.items = input;
    snapshot.revision += 1;
    if (fault === 'lost') {
      pendingReceipt = { version: snapshot.revision, input, target };
      setNotice('保存回执丢失。请核对已提交的布局。', 'warning', button('核对已提交布局', 'verify-receipt'));
      render();
      $('notice').querySelector('button').focus();
      return;
    }
    finishSave(target);
  }, 300);
  setNotice('正在保存布局…', 'info');
  render();
}

function finishSave(target) {
  cancelEdit('已保存布局 · 版本 ' + saved().revision);
  if (target) leave(target);
  else {
    setNotice('布局已保存。重新打开会恢复此版本。', 'success');
    render();
    $('begin').focus();
  }
}

function compareLatest() {
  const listing = (collection) => collection.length ? '<ul>' + sorted(collection).map((item) =>
    '<li>' + escape(widgetName(item)) + ' · ' + (item.x + 1) + ' 列 ' + (item.y + 1) + ' 行 · ' + item.w + ' × ' + item.h + '</li>').join('') + '</ul>' : '<p>空布局</p>';
  showDialog('对照版本 ' + saved().revision, '<p>选择保留已保存版本，或将当前草稿作为下一次提交的完整布局。再次保存前仍可继续编辑。</p>' +
    '<div class="inputs"><section><h3>最新布局</h3>' + listing(saved().items) + '</section><section><h3>当前草稿</h3>' + listing(draft) +
    '</section></div><div class="dialog-actions">' + button('返回草稿', 'dismiss', '', 'autofocus') +
    button('采用最新布局', 'use-latest') + button('以此版本为基准保留草稿', 'rebase', 'primary') + '</div>');
}

const itemFor = (button) => draft?.find((item) => item.id === button.dataset.id);
const actions = {
  edit: () => { if (beginEditing()) $('save').focus(); },
  catalog: () => {
    if (isNarrow() || !beginEditing()) return;
    updateCatalogCategories();
    $('catalog-search').value = $('catalog-category').value = '';
    renderCatalog();
    drawer.showModal();
  },
  pick: (trigger) => {
    const type = trigger.dataset.type;
    const existing = !definitions[type].multi && draft.find((item) => item.type === type);
    if (existing) {
      if (existing.hidden) {
        drawer.close();
        alter(draft.map((item) => item.id === existing.id ? { ...item, hidden: false } : item), '已恢复显示。', { id: existing.id, action: 'widget-menu' });
      }
      return;
    }
    configure(type, null, true);
  },
  dismiss: () => { if (dialog.open) dialog.close(); else drawer.close(); },
  'widget-menu': (trigger) => widgetMenu(itemFor(trigger)),
  configure: (trigger) => { const item = itemFor(trigger); if (item) configure(item.type, item); },
  geometry: (trigger) => geometryForm(itemFor(trigger)),
  before: (trigger) => nudgeOrder(itemFor(trigger), -1),
  after: (trigger) => nudgeOrder(itemFor(trigger), 1),
  recommended: (trigger) => {
    const item = itemFor(trigger);
    const [w, h] = definitions[item.type].size;
    if (!updateGeometry(item, { w, h })) $('geometry-error').hidden = false;
  },
  duplicate: (trigger) => {
    const item = itemFor(trigger);
    const next = firstFree(draft, { ...item, id: 'widget-' + serial, title: widgetName(item).slice(0, 56) + '（副本）', hidden: false });
    if (!next) { announce('没有可放置副本的空间。'); return; }
    serial++;
    dialog.close();
    alter([...draft, next], '已复制为可独立配置的实例。', { id: next.id, action: 'widget-menu' });
  },
  'toggle-hidden': (trigger) => {
    const item = itemFor(trigger);
    dialog.close();
    alter(draft.map((entry) => entry.id === item.id ? { ...entry, hidden: !entry.hidden } : entry), item.hidden ? '已恢复显示。' : '已隐藏卡片。', { id: item.id, action: 'widget-menu' });
  },
  'remove-confirm': (trigger) => {
    const item = itemFor(trigger);
    showDialog('移除「' + escape(widgetName(item)) + '」？', '<p>主页会移除此实例。任务、笔记和已保存主机仍可从所属模块打开。</p><div class="dialog-actions">' +
      cancel() + button('移除实例', 'remove', 'danger', 'data-id="' + item.id + '"') + '</div>');
  },
  remove: (trigger) => { dialog.close(); alter(draft.filter((item) => item.id !== trigger.dataset.id), '已从草稿移除实例。'); $('save').focus(); },
  defaults: () => { if (!isNarrow()) alter(defaults(activeVault), '草稿已使用默认布局。可撤销本次恢复。'); },
  undo: () => {
    if (!undo.length || saving) return;
    draft = undo.pop();
    render();
    $('board-tools').querySelector('[data-action=undo]:not(:disabled)')?.focus();
    announce('已撤销上一次布局改动。');
  },
  cancel: () => { if (!saving) { cancelEdit(); $('begin').focus(); } },
  save: () => saveDraft(),
  'keep-editing': () => { pendingLeave = null; dialog.close(); announce('继续编辑，草稿已保留。'); },
  'discard-leave': () => leave(pendingLeave),
  'save-leave': () => saveDraft(pendingLeave),
  compare: compareLatest,
  'use-latest': () => { dialog.close(); cancelEdit('已载入最新布局。'); $('begin').focus(); },
  rebase: () => {
    dialog.close();
    baseRevision = saved().revision;
    pendingReceipt = null;
    setNotice('草稿已对照最新版本。保存时将提交这份完整布局。');
    render();
    $('save').focus();
  },
  'verify-receipt': () => {
    if (pendingReceipt && saved().revision === pendingReceipt.version && JSON.stringify(saved().items) === JSON.stringify(pendingReceipt.input)) {
      finishSave(pendingReceipt.target);
    } else {
      setNotice('当前布局版本已经更新。请先对照最新版本。', 'error', button('对照最新版本', 'compare'));
      render();
    }
  },
  vault: openVaults,
  'open-vault': (trigger) => requestLeave({ vault: Number(trigger.dataset.index) }),
  search: () => showDialog('搜索与命令', '<div class="stack">' + navigation('打开知识库', 'notes') + navigation('打开任务', 'tasks') +
    '</div><div class="dialog-actions">' + cancel() + '</div>'),
  focus: () => {
    if (readOnly() || draft) return;
    data().focusUntil = data().focusUntil ? 0 : Date.now() + 25 * 60 * 1000;
    renderBoard();
    board.querySelector('[data-action=focus]')?.focus();
    announce(data().focusUntil ? '本次专注已开始。' : '已暂停本次专注。');
  },
  'retry-ssh': () => {
    $('ssh-state').value = 'on';
    board.querySelectorAll('[data-type=ssh] .widget-body').forEach((body) => { body.innerHTML = '<progress aria-label="正在读取主机"></progress>'; });
    clearTimeout(sshRetry);
    sshRetry = setTimeout(() => { render(); announce('主机摘要已恢复。'); }, 250);
  },
  backup: () => {
    const snapshot = saved();
    if (snapshot.backup) {
      snapshot.items = structuredClone(snapshot.backup);
      snapshot.revision++;
    }
    $('board-scenario').value = '';
    cancelEdit('已恢复最近可用的新格式备份。');
    setNotice('已恢复最近可用的新格式备份。', 'success');
    render();
  },
  reset,
};

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('button');
  if (!trigger) return;
  if (trigger.dataset.nav) requestLeave({ page: trigger.dataset.nav, note: trigger.dataset.note });
  else actions[trigger.dataset.action]?.(trigger);
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (form.id !== 'configure-form' && form.id !== 'geometry-form') return;
  event.preventDefault();
  const record = Object.fromEntries(new FormData(form));
  const id = form.dataset.item;
  const item = draft.find((entry) => entry.id === id);
  if (form.id === 'geometry-form') {
    const size = { w: Number(record.w), h: Number(record.h) };
    if ('x' in record) Object.assign(size, { x: Number(record.x) - 1, y: Number(record.y) - 1 });
    if (!updateGeometry(item, size)) $('geometry-error').hidden = false;
    return;
  }
  const config = record.config || '';
  const title = record.title.trim();
  const next = item ? { ...item, title, config } : firstFree(draft, { ...instance('widget-' + serial, form.dataset.type, 0, 0, config), title });
  if (!next) {
    const error = $('configuration-error');
    error.textContent = '画布上没有足够空间。当前草稿已保留。';
    error.hidden = false;
    return;
  }
  if (!item) serial++;
  dialog.close();
  if (drawer.open) drawer.close();
  alter(item ? draft.map((entry) => entry.id === next.id ? next : entry) : [...draft, next],
    (item ? '已更新' : '已添加') + '「' + widgetName(next) + '」。', { id: next.id, action: 'widget-menu' });
});

$('catalog-search').addEventListener('input', renderCatalog);
document.addEventListener('change', (event) => {
  const { id, value, dataset } = event.target;
  if (id === 'catalog-category') renderCatalog();
  if (id === 'theme' || id === 'appearance') updateTheme();
  if (id === 'ssh-state' || id === 'board-scenario') {
    if (id === 'board-scenario' && value === 'recovery' && !saved().backup) saved().backup = structuredClone(saved().items);
    render();
  }
  if (dataset.task && !readOnly() && !draft) {
    const task = data().tasks.find((entry) => entry.id === Number(dataset.task));
    task.done = event.target.checked;
    const card = event.target.closest('.widget')?.dataset.id;
    render();
    const next = card ? board.querySelector('[data-id="' + card + '"]') : $('module');
    (next.querySelector('[data-task]') || $('begin')).focus({ preventScroll: true });
    announce('已完成「' + task.title + '」。布局版本仍为 ' + saved().revision + '。');
  }
  if (dataset.habit && !readOnly() && !draft) {
    data().habit = event.target.checked;
    announce(data().habit ? '已记录今天的习惯。' : '已取消今天的记录。');
  }
});
dialog.addEventListener('cancel', () => { pendingLeave = null; });
systemDark.addEventListener('change', updateTheme);
new ResizeObserver(() => {
  $('add').hidden = isNarrow();
  $('empty-add').hidden = isNarrow();
}).observe($('board'));
reset();
