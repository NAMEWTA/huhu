'use strict';

const byId = (id) => document.getElementById(id);
const menu = byId('menu');
const dialog = byId('dialog');
const themes = matchMedia('(prefers-color-scheme: dark)');
const narrow = matchMedia('(max-width: 540px)');
const vaults = ['北岸项目档案与季度研究工作区 🐯 · 交付与复盘', '团队资料与技术笔记'];
const noteNames = ['11 月发布走查记录', '知识库索引与维护约定'];
const original = [
  '本周先核对安装首帧、窗口按钮和 Vault 切换。\n关闭测试需要确认最后一笔文字可以恢复。',
  '每个项目保留一页索引，记录背景、决定和后续负责事项。',
];
const titles = { home: '首页', notes: '知识库', tasks: '任务' };
const windowNames = { normal: '普通窗口', maximized: '已最大化', fullscreen: '全屏', blurred: '窗口失焦', minimized: '已最小化', closed: '窗口已关闭', quit: '应用已退出' };
const failure = { write: '文件写入失败。改动仍在当前窗口。', conflict: '磁盘上的版本发生变化。重试将重新检查示例版本。', timeout: '等待保存结果超时。最后一笔改动尚未确认。' };

let state;
let timer;
let editorContext;
let closing;
let clipboard;
let altOnly = false;

function reset() {
  clearTimeout(timer);
  state = {
    vault: 0, scene: 'ready', window: 'normal', focus: false, page: 'home',
    note: 0, files: vaults.map(() => original.slice()), drafts: vaults.map(() => [null, null]),
    working: original.slice(), undo: [[], []], done: [false, false], open: ['home'], compact: 'show',
  };
  editorContext = null;
  closing = null;
  clipboard = '';
  for (const [id, value] of Object.entries({ platform: 'win', scene: 'ready', policy: 'auto', fault: '', theme: 'claude', mode: 'light', 'compact-choice': 'show' })) byId(id).value = value;
  if (dialog.open) dialog.close();
  if (menu.open) menu.close();
  setTheme();
  render();
  announce('已恢复工作台和示例数据。');
}

function escapeText(text) {
  const node = document.createElement('span');
  node.textContent = text;
  return node.innerHTML.replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function editable() {
  return state.scene === 'ready' && state.page === 'notes' && state.note !== null && state.window !== 'closed' && state.window !== 'quit';
}
function dirty(index) {
  return state.working[index] !== (state.drafts[state.vault][index] ?? state.files[state.vault][index]);
}
function announce(text) { byId('status').textContent = text; }
function setTheme() {
  document.documentElement.dataset.theme = byId('theme').value;
  const mode = byId('mode').value;
  document.documentElement.dataset.mode = mode === 'system' ? (themes.matches ? 'dark' : 'light') : mode;
}
function modeStatus() {
  const el = byId('maximize');
  const isMac = byId('platform').value === 'mac';
  const label = isMac ? '进入全屏' : state.window === 'maximized' ? '还原窗口' : '最大化窗口';
  el.setAttribute('aria-label', label);
  el.title = label;
  el.textContent = state.window === 'maximized' ? '❐' : '□';
  byId('window-status').textContent = byId('platform').value === 'web' ? '浏览器' : windowNames[state.window];
}
function render() {
  const platform = byId('platform').value;
  const hasVault = ['ready', 'readonly', 'engine', 'starting'].includes(state.scene);
  const ready = state.scene === 'ready' || state.scene === 'readonly';
  const away = ['closed', 'quit', 'minimized'].includes(state.window);
  const native = byId('native');
  if (platform !== byId('titlebar').dataset.platform) {
    if (platform === 'mac') {
      byId('brand').before(native);
      native.prepend(native.querySelector('.close'));
    } else {
      byId('titlebar').append(native);
      native.append(native.querySelector('.close'));
    }
  }
  byId('frame').dataset.window = state.window;
  byId('titlebar').dataset.platform = platform;
  byId('workspace').dataset.focus = state.focus && ready;
  byId('native').hidden = platform === 'web' || away;
  byId('system').hidden = platform !== 'mac' || state.window === 'quit';
  byId('menu-button').hidden = platform === 'mac' || away;
  byId('rail').hidden = !ready || away;
  byId('tabs').hidden = !ready || away;
  byId('crumb').hidden = !ready || away;
  byId('vault-title').textContent = hasVault ? vaults[state.vault] + ' ▾' : '选择 Vault ▾';
  byId('vault-title').title = hasVault ? vaults[state.vault] : '选择 Vault';
  byId('vault-title').disabled = state.scene === 'renderer' || state.scene === 'starting' || away;
  byId('search-button').disabled = !ready || away;
  byId('search-button').hidden = away || (narrow.matches && state.compact === 'menu');
  byId('drag-zone').hidden = platform === 'web';
  byId('crumb').innerHTML = '<span class="ellip">' + vaults[state.vault] + '</span><span aria-hidden="true">›</span><strong>' + titles[state.page] + '</strong>';
  document.title = (hasVault && !away ? vaults[state.vault] + ' — ' : '') + 'HUHU';
  modeStatus();
  for (const button of byId('rail').querySelectorAll('button')) {
    if (button.dataset.action === state.page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  byId('tabs').innerHTML = state.open.map((id) =>
    '<button type="button" class="quiet" data-action="' + id + '"' + (id === state.page ? ' aria-current="page"' : '') + '>' + titles[id] + '</button>' +
    (id !== 'home' ? '<button type="button" class="quiet" data-action="close-tab" data-id="' + id + '" aria-label="关闭' + titles[id] + '标签">×</button>' : '')).join('') +
    '<button type="button" class="quiet end" data-action="focus">专注模式</button>';
  byId('page').innerHTML = pageContent(away);
  announce(away ? windowNames[state.window] : {
    ready: '引擎就绪', readonly: '引擎就绪 · 只读 Vault', launch: '等候选择 Vault',
    starting: '引擎正在启动', engine: '引擎未连接', renderer: '主页面加载失败',
  }[state.scene]);
}

function pageContent(away) {
  if (away) {
    const action = state.window === 'minimized' ? '恢复窗口' : state.window === 'quit' ? '重新打开应用' : '重新打开窗口';
    return '<section class="content stack"><h1>' + windowNames[state.window] + '</h1><div><button type="button" class="primary" data-action="restore">' + action + '</button></div></section>';
  }
  if (state.scene === 'launch') return '<div class="content launch"><section class="stack"><h1>打开文件夹。<br>进入你的工作台。</h1><p class="muted">一个 Vault，一套属于你的数据。用 Markdown 保存笔记，用 JSON 保存工作台配置。</p></section><section class="card stack"><h2>打开你的知识库</h2><p class="muted">从已有目录开始，或先体验完整的示例。</p><div class="row"><button type="button" data-action="vault" class="primary">打开 Vault 文件夹</button><button type="button" data-action="open-demo">打开示例 Vault</button></div></section></div>';
  if (state.scene === 'starting') return '<section class="content stack" aria-busy="true"><h1>正在启动工作台</h1><p class="muted">正在读取 Vault 并连接工作台引擎。</p><progress aria-label="启动进度"></progress><div><button type="button" data-action="launch">取消打开</button></div></section>';
  if (state.scene === 'engine' || state.scene === 'renderer') {
    const renderer = state.scene === 'renderer';
    return '<section class="content stack"><h1>' + (renderer ? '无法加载工作台' : '工作台引擎未连接') + '</h1><p class="banner" data-tone="error" role="alert">' +
      (renderer ? '主页面加载失败。窗口控制仍可用，最近一次编辑可能需要恢复。' : 'Vault 会话仍在此窗口。重启引擎后可以继续。') +
      '</p><div class="row"><button type="button" class="primary" data-action="recover">' + (renderer ? '重新加载工作台' : '重启引擎') + '</button><button type="button" data-action="vault"' + (renderer ? ' hidden' : '') + '>切换 Vault</button></div></section>';
  }
  const focus = state.focus ? '<button type="button" data-action="focus">退出专注模式</button>' : '';
  if (state.page === 'notes') {
    const tabs = noteNames.map((name, index) => '<button type="button" data-action="note" data-id="' + index + '" ' + (state.note === index ? 'aria-current="page"' : '') + '>' + name + '</button>').join('');
    const document = state.note === null ? '<div class="empty"><p>从左侧列表打开文档。</p></div>' :
      '<div class="card stack"><div class="row"><h2 class="grow">' + noteNames[state.note] + '</h2><span id="doc-state" class="pill">' + documentStatus() + '</span></div><label>文档内容<textarea id="editor" ' + (editable() ? '' : 'readonly') + '>' + escapeText(state.working[state.note]) + '</textarea></label></div>';
    return '<section class="content stack"><div class="row"><h1 class="grow">知识库</h1>' + focus + '</div><div class="notes"><nav class="card stack" aria-label="文档">' + tabs + '</nav>' + document + '</div></section>';
  }
  if (state.page === 'tasks') {
    const tasks = ['核对三平台窗口控制与帮助入口', '准备试用者的工作台走查清单'];
    return '<section class="content stack"><div class="row"><h1 class="grow">任务</h1>' + focus + '</div><article class="card stack"><h2>我的任务</h2>' +
      tasks.map((text, index) => '<label class="row list-row"><input type="checkbox" data-task="' + index + '" ' + (state.done[index] ? 'checked ' : '') + (state.scene === 'readonly' ? 'disabled' : '') + '>' + text + '</label>').join('') + '</article></section>';
  }
  return '<section class="content"><div class="row page-head"><div class="grow"><h1>工作台</h1><p class="muted">从今天要做的事继续。</p></div>' + focus + '</div><div class="overview"><article class="card stack"><h2>我的任务</h2><p>' + state.done.filter((done) => !done).length +
    ' 项待处理</p><div><button type="button" data-action="tasks">查看任务 →</button></div></article><article class="card stack"><h2>继续上次的思考</h2><p>11 月发布走查记录</p><div><button type="button" data-action="notes">打开知识库 →</button></div></article></div></section>';
}

function documentStatus() {
  if (dirty(state.note)) return '未落盘';
  return state.drafts[state.vault][state.note] !== null ? '已保留草稿' : '已保存';
}

function navigate(page) {
  if (!['ready', 'readonly'].includes(state.scene) || ['closed', 'quit', 'minimized'].includes(state.window)) return;
  if (!state.open.includes(page)) state.open.push(page);
  editorContext = null;
  state.page = page;
  render();
  if (page === 'notes') byId('editor')?.focus();
}

function assignScene(scene) {
  clearTimeout(timer);
  byId('scene').value = scene === 'blur' ? 'blur' : scene;
  if (scene === 'blur') { state.window = 'blurred'; state.scene = 'ready'; }
  else { state.scene = scene; state.window = 'normal'; }
  render();
}

function start(target) {
  assignScene('starting');
  timer = setTimeout(() => {
    if (state.vault !== target) {
      state.vault = target;
      state.working = state.files[target].map((text, index) => state.drafts[target][index] ?? text);
      state.undo = [[], []];
      state.page = 'home';
      state.open = ['home'];
      state.note = 0;
    }
    assignScene('ready');
  }, 550);
}

function showDialog(title, content) {
  dialog.innerHTML = '<div class="stack"><h2 id="dialog-title">' + title + '</h2>' + content + '</div>';
  if (!dialog.open) dialog.showModal();
  else dialog.querySelector('[autofocus]')?.focus();
}
const actionButton = (text, action, css = '', extra = '') => '<button type="button" class="' + css + '" data-action="' + action + '" ' + extra + '>' + text + '</button>';

function vaultChooser() {
  showDialog('选择 Vault', '<p class="muted">本次运行中的示例 Vault</p><div class="stack">' +
    vaults.map((name, i) => actionButton(escapeText(name), 'select-vault', '', 'data-id="' + i + '"' + (i === 0 ? ' autofocus' : ''))).join('') +
    '</div><div class="dialog-actions">' + actionButton('取消', 'dismiss') + '</div>');
}

function captureEditor() {
  const el = byId('editor');
  if (!el || document.activeElement !== el) return;
  editorContext = { vault: state.vault, note: state.note, start: el.selectionStart, end: el.selectionEnd };
}
function currentContext() {
  return editable() && editorContext?.vault === state.vault && editorContext.note === state.note;
}

function saveNote(index, manual = false) {
  if (manual) state.drafts[state.vault][index] = state.working[index];
  else {
    state.files[state.vault][index] = state.working[index];
    state.drafts[state.vault][index] = null;
  }
}
function saveActive() {
  if (!currentContext()) return;
  const fault = byId('fault').value;
  byId('fault').value = '';
  if (fault) { announce(failure[fault]); return; }
  saveNote(state.note);
  byId('doc-state').textContent = documentStatus();
  announce('已保存「' + noteNames[state.note] + '」。');
}
function editActive(action) {
  if (!currentContext()) return;
  const { start, end, note } = editorContext;
  const el = byId('editor');
  if (action === 'copy') {
    clipboard = el.value.slice(start, end);
    announce(clipboard ? '已复制当前文档选区到演练剪贴板。' : '当前没有选中文字。');
    return;
  }
  if (action === 'undo') {
    const last = state.undo[note].pop();
    if (last === undefined) return;
    el.value = last;
  } else {
    if (!clipboard) return;
    state.undo[note].push(el.value);
    el.setRangeText(clipboard, start, end, 'end');
  }
  state.working[note] = el.value;
  byId('doc-state').textContent = documentStatus();
  el.focus();
}

function openMenu(button) {
  if (menu.open) return;
  const group = button.dataset.group;
  const ready = ['ready', 'readonly'].includes(state.scene);
  const blocked = !currentContext();
  const desktop = byId('platform').value !== 'web';
  const sections = {
    HUHU: [['关于 HUHU', 'about'], ['隐藏 HUHU', 'minimize', byId('platform').value !== 'mac'], ['退出应用', 'quit', !desktop]],
    文件: [['打开或切换 Vault', 'vault', byId('vault-title').disabled], ['保存当前文档', 'save', blocked, 'Mod+S'], ['关闭文档', 'close-document', state.page !== 'notes' || state.note === null || !ready]],
    编辑: [['撤销', 'undo', blocked], ['复制选区', 'copy', blocked], ['粘贴到文档', 'paste', blocked]],
    视图: [['搜索与命令', 'palette', !ready, 'Mod+K'], [state.focus ? '退出专注模式' : '专注模式', 'focus', !ready], [state.window === 'fullscreen' ? '退出全屏' : '进入全屏', 'fullscreen', !desktop]],
    窗口: [['最小化窗口', 'minimize', !desktop], ['最大化或还原窗口', 'maximize', !desktop], ['关闭窗口', 'close', !desktop]],
    帮助: [['HUHU 使用说明', 'help']],
  };
  byId('menu-title').textContent = group || 'HUHU 应用菜单';
  byId('menu-items').innerHTML = Object.entries(sections).filter(([name]) => !group || group === name).map(([name, entries]) =>
    '<section>' + (group ? '' : '<h3>' + name + '</h3>') + entries.map(([label, action, disabled, shortcut]) =>
      actionButton(label + (shortcut ? '<small>' + shortcut + '</small>' : ''), action, '', disabled ? 'disabled title="当前场景或焦点不可用"' : '')).join('') + '</section>').join('') +
    (group === 'HUHU' ? '<p class="muted">系统服务由 macOS 提供。</p>' : '');
  const box = button.getBoundingClientRect();
  menu.style.setProperty('--menu-top', Math.min(box.bottom, innerHeight - 85) + 'px');
  menu.style.setProperty('--menu-left', Math.max(8, Math.min(box.left, innerWidth - 298)) + 'px');
  menu.showModal();
}

function requestClose(kind, target) {
  if (closing || ['closed', 'quit'].includes(state.window)) return;
  closing = { kind, target };
  const unknown = state.scene === 'renderer';
  if (unknown) return closeError('主页面失联。上次已存内容仍可恢复，最近编辑尚未确认。');
  if (!state.working.some((_, index) => dirty(index))) return finishClose('没有待落盘改动。');
  tryClose();
}
function tryClose() {
  if (!closing) return;
  if (state.scene === 'renderer') {
    clearTimeout(timer);
    state.scene = 'ready';
    byId('scene').value = 'ready';
    render();
  }
  closing.busy = true;
  showDialog('正在处理未保存改动', '<p>正在检查当前 Vault 的文档。</p><progress aria-label="保存进度"></progress>');
  const attempt = closing;
  timer = setTimeout(() => {
    if (closing !== attempt) return;
    closing.busy = false;
    const fault = byId('fault').value;
    byId('fault').value = '';
    if (fault) return closeError(failure[fault]);
    const manual = byId('policy').value === 'manual';
    state.working.forEach((_, index) => { if (dirty(index)) saveNote(index, manual); });
    finishClose(manual ? '已保留可恢复草稿。' : '已写入示例文档。');
  }, 420);
}
function closeError(message) {
  showDialog('无法确认保存结果', '<p class="banner" data-tone="error" role="alert">' + message + '</p><div class="dialog-actions">' +
    actionButton('取消' + (closing.kind === 'switch' ? '切换' : closing.kind === 'quit' ? '退出' : '关闭'), 'cancel-close', '', 'autofocus') +
    actionButton('重试保存', 'retry', 'primary') + actionButton('放弃这次改动…', 'discard-request', 'danger') + '</div>');
}
function finishClose(message) {
  const { kind, target } = closing;
  closing = null;
  if (dialog.open) dialog.close();
  if (kind === 'switch') {
    start(target);
    return;
  }
  clearTimeout(timer);
  state.window = kind === 'quit' ? 'quit' : 'closed';
  render();
  announce(message + ' ' + windowNames[state.window] + '。');
}

const actions = {
  home: () => navigate('home'), notes: () => navigate('notes'), tasks: () => navigate('tasks'),
  note: (button) => { state.note = Number(button.dataset.id); render(); byId('editor').focus(); },
  'close-tab': (button) => { const id = button.dataset.id; state.open = state.open.filter((page) => page !== id); if (state.page === id) state.page = 'home'; render(); },
  'close-document': () => {
    state.note = null;
    editorContext = null;
    render();
    byId('page').querySelector('[data-action=note]')?.focus();
    announce('文档视图已关闭，当前 Vault 会话继续保留。');
  },
  menu: openMenu,
  dismiss: () => { if (menu.open) menu.close(); else dialog.close(); },
  vault: vaultChooser,
  'open-demo': () => start(0),
  'select-vault': (button) => {
    const target = Number(button.dataset.id);
    if (state.scene === 'launch' || state.vault === target) { dialog.close(); start(target); }
    else requestClose('switch', target);
  },
  launch: () => assignScene('launch'),
  recover: () => start(state.vault),
  palette: () => showDialog('搜索与命令', '<label>查找功能<input id="command-search" type="search" placeholder="输入命令或模块名称" autofocus></label><div id="commands" class="stack">' +
    actionButton('打开知识库', 'notes', '', 'data-command') + actionButton('打开任务', 'tasks', '', 'data-command') +
    actionButton('切换专注模式', 'focus', '', 'data-command') + '</div><div class="dialog-actions">' + actionButton('关闭', 'dismiss') + '</div>'),
  focus: () => { if (!['ready', 'readonly'].includes(state.scene)) return; state.focus = !state.focus; render(); byId('page').querySelector('[data-action=focus]')?.focus(); },
  fullscreen: () => { state.window = state.window === 'fullscreen' ? 'normal' : 'fullscreen'; render(); },
  minimize: () => { state.window = 'minimized'; render(); },
  maximize: () => {
    if (byId('platform').value === 'mac') return actions.fullscreen();
    state.window = state.window === 'maximized' ? 'normal' : 'maximized'; render();
  },
  restore: () => { state.window = 'normal'; render(); },
  about: () => showDialog('关于 HUHU', '<p>HUHU Workbench · 0.0.1-rc.4</p><div class="dialog-actions">' + actionButton('关闭', 'dismiss', '', 'autofocus') + '</div>'),
  help: () => showDialog('HUHU 使用说明', '<p>从 Vault 菜单选择工作区。在知识库编辑文档时，用搜索与命令打开功能，或从文件菜单保存当前文档。</p><div class="dialog-actions">' + actionButton('关闭', 'dismiss', '', 'autofocus') + '</div>'),
  save: saveActive, undo: () => editActive('undo'), copy: () => editActive('copy'), paste: () => editActive('paste'),
  close: () => requestClose('close'), quit: () => requestClose('quit'),
  'cancel-close': () => { clearTimeout(timer); closing = null; dialog.close(); announce('已取消，当前会话与改动保留。'); },
  retry: tryClose,
  'discard-request': () => showDialog('放弃本次未保存改动？', '<p>将恢复上次已保存的文件或已保留的草稿。</p><div class="dialog-actions">' +
    actionButton('继续留在窗口', 'cancel-close', '', 'autofocus') + actionButton('确认放弃', 'discard', 'danger') + '</div>'),
  discard: () => {
    state.working = state.files[state.vault].map((text, index) => state.drafts[state.vault][index] ?? text);
    state.undo = [[], []];
    finishClose('已明确放弃未保存改动。');
  },
  reset,
};

document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('[data-action=menu]')) captureEditor();
});
document.addEventListener('select', captureEditor);
document.addEventListener('focusin', (event) => {
  if (event.target.id === 'editor') captureEditor();
  else if (event.target.matches('input, select, textarea')) editorContext = null;
});
document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (menu.contains(button) && action !== 'dismiss') menu.close();
  if (button.hasAttribute('data-command')) dialog.close();
  actions[action]?.(button);
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'editor' && editable()) {
    state.undo[state.note].push(state.working[state.note]);
    state.working[state.note] = event.target.value;
    byId('doc-state').textContent = documentStatus();
    captureEditor();
  }
  if (event.target.id === 'command-search') {
    for (const command of byId('commands').children) command.hidden = !command.textContent.includes(event.target.value.trim());
  }
});
document.addEventListener('change', (event) => {
  const { id, value, dataset } = event.target;
  if (id === 'platform') { state.window = 'normal'; render(); }
  if (id === 'scene') {
    if (value === 'starting') start(state.vault);
    else assignScene(value);
  }
  if (id === 'theme' || id === 'mode') setTheme();
  if (id === 'compact-choice') { state.compact = value; render(); }
  if (dataset.task !== undefined) {
    state.done[Number(dataset.task)] = event.target.checked;
    announce(event.target.checked ? '任务已完成。' : '任务已恢复为待处理。');
  }
});
function keyboardMenu() {
  captureEditor();
  const button = byId('platform').value === 'mac' ? byId('system').querySelector('button') : byId('menu-button');
  if (button.hidden || button.closest('[hidden]')) return;
  button.focus();
  openMenu(button);
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Alt' && !event.repeat) altOnly = true;
  else if (event.key !== 'Alt') altOnly = false;
  const desktop = byId('platform').value !== 'web';
  if (dialog.open || menu.open) return;
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (desktop && key === 'f10') {
    event.preventDefault();
    keyboardMenu();
  } else if (mod && key === 's' && editable()) {
    event.preventDefault(); captureEditor(); saveActive();
  } else if (mod && key === 'k' && !byId('search-button').disabled) {
    event.preventDefault(); actions.palette();
  } else if (desktop && ((event.altKey && key === 'f4') || (event.metaKey && key === 'w'))) {
    event.preventDefault(); actions.close();
  } else if (desktop && event.metaKey && key === 'q') {
    event.preventDefault(); actions.quit();
  } else if (desktop && (key === 'f11' || (key === 'escape' && state.window === 'fullscreen'))) {
    event.preventDefault(); actions.fullscreen();
  }
});
document.addEventListener('keyup', (event) => {
  if (event.key !== 'Alt' || !altOnly) return;
  altOnly = false;
  if (['win', 'linux'].includes(byId('platform').value) && !dialog.open && !menu.open) {
    event.preventDefault();
    keyboardMenu();
  }
});
dialog.addEventListener('cancel', (event) => {
  if (!closing) return;
  event.preventDefault();
  if (!closing.busy) actions['cancel-close']();
});
themes.addEventListener('change', setTheme);
narrow.addEventListener('change', () => {
  byId('search-button').hidden = ['closed', 'quit', 'minimized'].includes(state.window) || (narrow.matches && state.compact === 'menu');
});
reset();

