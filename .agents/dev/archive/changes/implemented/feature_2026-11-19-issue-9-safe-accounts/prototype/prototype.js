
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const e = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const button = (label, action, options = {}) => {
  const {id = '', kind = '', current = false, pressed, disabled = false, title = ''} = options;
  return `<button type="button" class="${kind}" data-action="${action}" data-id="${e(id)}"${current ? ' aria-current="true"' : ''}${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}${disabled ? ' disabled' : ''}${title ? ` aria-label="${e(title)}"` : ''}>${label}</button>`;
};
const field = (label, name, value = '', attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${e(value)}" ${attrs}></label>`;
const option = (value, label, selected) => `<option value="${e(value)}"${value === selected ? ' selected' : ''}>${e(label)}</option>`;
const data = form => Object.fromEntries(new FormData(form));
const modal = $('#modal');
const modalBody = $('#modal-body');
let modalReturn;
let onModalCancel;
function showModal(title, body, cancel) {
  if (!modal.open) modalReturn = document.activeElement;
  $('#modal-title').textContent = title;
  modalBody.innerHTML = body;
  onModalCancel = cancel;
  if (!modal.open) modal.showModal();
  (modalBody.querySelector('[data-initial-focus]') || modalBody.querySelector('input:not([type=hidden]), select') || $('#modal-title')).focus();
}
function closeModal() {
  onModalCancel = undefined;
  if (modal.open) modal.close();
  modalBody.replaceChildren();
  if (modalReturn?.isConnected) modalReturn.focus();
}
modal.addEventListener('cancel', event => {
  event.preventDefault();
  if (onModalCancel) onModalCancel(); else closeModal();
});
function announce(message) { $('#status').textContent = message; }
function confirmAction(title, details, label, then) {
  showModal(title, `<div class="stack"><p>${details}</p><form id="confirm-form" class="row"><button type="button" data-action="close-modal" data-initial-focus>取消</button><button type="submit" class="primary">${label}</button></form></div>`);
  $('#confirm-form').onsubmit = event => { event.preventDefault(); closeModal(); then(); };
}
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  if (target.dataset.action === 'close-modal') {
    if (onModalCancel) onModalCancel(); else closeModal();
    return;
  }
  if (target.dataset.action === 'theme-mode') {
    document.documentElement.dataset.mode = document.documentElement.dataset.mode === 'light' ? 'dark' : 'light';
    target.textContent = document.documentElement.dataset.mode === 'dark' ? '浅色' : '深色';
    return;
  }
  actions[target.dataset.action]?.(target.dataset.id, target);
});
$('#theme').onchange = event => { document.documentElement.dataset.theme = event.target.value; };
const palette = {blue:'蓝色',green:'绿色',orange:'橙色',purple:'紫色'};
const owners = {
  ssh: ['SSH','演示构建主机','主机认证',['密码','私钥与口令','系统 agent／身份文件']],
  git: ['Git 同步','https://git.example.test/产品资料','远端认证',['HTTPS token','系统 SSH']],
  agent: ['Agent CLI','研发环境','启动环境',['受保护变量','普通变量','CLI 原生登录']],
  auto: ['自动化','每周归档规则','规则环境',['受保护变量','普通变量']],
  mail: ['邮件','team@example.test','邮箱认证',['专用密码','OAuth','AI 专用 Key']]
};
const newAccount = () => ({id: crypto.randomUUID(), login:'', password:'', mobile:'', email:'', note:''});
const sampleAccount = (login,password,mobile,email,note) => ({...newAccount(),login,password,mobile,email,note});
function fixture(clean = false) {
  return {
    tags: clean ? [] : [{id:'work',name:'工作',color:'blue'},{id:'important',name:'常用',color:'green'},{id:'private',name:'个人',color:'purple'}],
    entries: clean ? [] : [
      {id:'google',name:'Google',url:'https://accounts.google.com/',tags:['work','important'],revision:1,accounts:[
        sampleAccount('林晓 · 工作账号','DEMO-Google-01!','+886 0912 345 678','lin.work@example.test','团队日历、共享云端硬盘与设计看板。'),
        sampleAccount('lin.personal','DEMO-Google-02!','0912 000 208','lin.personal@example.test','个人照片与订阅。'),
        sampleAccount('lin.archive','DEMO-Google-03!','','lin.archive@example.test','存放 2024 年项目归档。')
      ]},
      {id:'uni',name:'台北跨校研究资料共享与伦理审查工作平台',url:'https://portal.example.test/research/shared/very-long-submission-directory/2026-fall-committee',tags:['work'],revision:1,accounts:Array.from({length:12},(_,i)=>sampleAccount(`研究助理 ${i+1}`,'','','',`第 ${i+1} 项资料访问。`))},
      {id:'book',name:'城市图书馆',url:'https://books.example.test/',tags:['private'],revision:1,accounts:[sampleAccount('xiao.reader','DEMO-Library!','','','图书借阅与续期。')]},
      {id:'plain',name:'旅行预订',url:'',tags:[],revision:1,accounts:[sampleAccount('lin.travel','','','','年度差旅。')]}
    ], master:clean ? '' : 'Huhu-demo-2026', backups: [], modules:clean ? {} : {git:{target:owners.git[1],method:'HTTPS token',configured:true}},
    prefs:{minutes:5,leave:true}, failures:0, blockedUntil:0, vault:'演示 Vault'
  };
}
let store = fixture();
let otherVault;
let disabled = false;
let unlocked = false, page = 'safe', view = 'list', entryId = 'google', accountId = '', revealed = '', query = '';
let filters = new Set();
let edit = null, idleTimer, clipboardNotice;
const main = $('#main');
const demoFault = () => $('#fault').value;
function consumeFault(type) {
  if (demoFault() !== type) return false;
  $('#fault').value = '';
  return true;
}
function clearSession() {
  clearTimeout(idleTimer);
  unlocked = false;
  revealed = '';
  edit = null;
  query = '';
  filters.clear();
  entryId = '';
  accountId = '';
  view = 'list';
  closeModal();
}
function armIdle() {
  clearTimeout(idleTimer);
  if (unlocked && store.prefs.minutes) idleTimer = setTimeout(() => lock('已自动锁定'), store.prefs.minutes*60000);
}
document.addEventListener('pointerdown', armIdle);
document.addEventListener('keydown', armIdle);
function lock(message='保险箱已锁定，未保存编辑已清除。') {
  clearSession();
  render();
  announce(message);
}
function changePage(next) {
  if (next !== page) {
    revealed = '';
    announce('');
    if (page === 'safe' && unlocked && store.prefs.leave) clearSession();
    page = next;
  }
  render();
}
function formError(message) { $('#dialog-error').textContent = message; }
const errorLine = '<p class="error" id="dialog-error" role="alert"></p>';
const currentEntry = () => store.entries.find(entry=>entry.id===entryId);
const matching = (entry, q) => entry.accounts.filter(a=>[a.login,a.mobile,a.email,a.note].some(v=>v.toLowerCase().includes(q)));
const tagBadge = tag => `<span class="badge tag ${tag.color}">${e(tag.name)}</span>`;
const tagsOf = entry => store.tags.filter(tag=>entry.tags.includes(tag.id)).map(tagBadge).join(' ');
function enterSafe(form) {
  const values = data(form);
  const feedback = $('#unlock-error');
  if (consumeFault('damaged')) {
    feedback.textContent = '无法读取演示保险箱。请重试，或在设置中恢复已创建的演示快照。';
    form.reset();
    return;
  }
  if (performance.now() < store.blockedUntil) {
    feedback.textContent = '请等待 5 秒后重试。';
    return;
  }
  if (store.master && values.master !== store.master) {
    form.reset();
    store.failures++;
    if (store.failures % 3 === 0) store.blockedUntil = performance.now()+5000;
    feedback.textContent = store.failures % 3 === 0 ? '连续输错三次，请等待 5 秒。' : '主密码不正确，请重新输入。';
    return;
  }
  if (!store.master && (values.master !== values.repeat || values.master.length < 8)) {
    feedback.textContent = '请使用至少 8 个字符，并输入相同的确认密码。';
    return;
  }
  if (!store.master) store.master = values.master;
  store.failures = 0;
  unlocked = true;
  entryId = store.entries[0]?.id || '';
  render();
  $('#search').focus();
  armIdle();
  announce('保险箱已解锁');
}
function lockedPage() {
  if (disabled) return '<div class="locked card stack"><h1>保险箱已停用</h1><p>可从演示控制重新启用保险箱。模块认证仍可使用。</p></div>';
  return `<div class="locked card stack">
    <span class="lock-icon" aria-hidden="true">◇</span><h1 id="unlock-title">${store.master ? '保险箱已锁定' : '设置保险箱'}</h1>
    <p class="muted">${store.master ? '输入主密码以查看个人条目。' + (store.master==='Huhu-demo-2026' ? '样例主密码为 Huhu-demo-2026。' : '') : '为这个空白保险箱设置演示主密码。'}</p>
    <form class="stack" id="unlock-form" aria-labelledby="unlock-title">
      ${field('主密码','master','', 'type="password" required autocomplete="off" aria-describedby="unlock-error"')}
      ${store.master ? '' : field('确认主密码','repeat','', 'type="password" required autocomplete="off"')}
      <p class="error" id="unlock-error" role="alert"></p>
      <button type="submit" class="primary">${store.master ? '解锁' : '创建并解锁'}</button>
    </form><p class="sub">SSH、Git、Agent CLI、自动化与邮件在各自的模块配置认证。</p>
  </div>`;
}
function filteredEntries() {
  const q = query.trim().toLowerCase();
  return store.entries.filter(entry => {
    const inTags = filters.has('none') ? !entry.tags.length : [...filters].every(t=>entry.tags.includes(t));
    const inText = !q || [entry.name,entry.url,...store.tags.filter(t=>entry.tags.includes(t.id)).map(t=>t.name)].some(v=>v.toLowerCase().includes(q)) || matching(entry,q).length;
    return inTags && inText;
  });
}
function renderList() {
  const result = filteredEntries();
  $('#safe-items').innerHTML = result.length ? result.map(entry=>{
    const q = query.trim().toLowerCase(), hit = q ? matching(entry,q)[0] : undefined;
    return `<button class="item" type="button" data-action="entry" data-id="${entry.id}"${hit ? ` data-account="${hit.id}"` : ''}${entry.id===entryId ? ' aria-current="true"' : ''}><strong>${e(entry.name)}</strong><span class="sub wrap">${e(entry.url || '未填网址')} · ${entry.accounts.length} 个账号</span><span class="row">${tagsOf(entry)}</span>${hit ? `<span class="sub">命中账号 · ${e(hit.login)}</span>` : ''}</button>`;
  }).join('') : `<p class="muted">${store.entries.length ? '没有符合条件的条目。' : '还没有个人条目。'}</p>`;
}
function renderDetail() {
  const detail = $('#safe-detail');
  const entry = currentEntry();
  if (!entry) {
    detail.innerHTML = '<p class="muted">选择一个条目查看账号。</p>';
    return;
  }
  const account = entry.accounts.find(a=>a.id===accountId) || entry.accounts[0];
  accountId = account.id;
  const show = revealed === account.id;
  detail.innerHTML = `
    ${button('‹ 返回条目','back',{kind:'mobile-back quiet'})}
    <div class="row spread"><h2 id="entry-title" tabindex="-1">${e(entry.name)}</h2><div class="row">${button('编辑条目','edit',{id:entry.id})}${button('删除条目','delete-entry',{kind:'danger',id:entry.id})}</div></div>
    <p class="muted">${e(entry.url || '未填网址')}</p><div class="row">${tagsOf(entry)}</div>
    <div class="row spread rule"><label class="row" for="account-select">账号 <select id="account-select">${entry.accounts.map(a=>option(a.id,a.login,account.id)).join('')}</select></label>${button('添加账号','add-account',{id:entry.id})}</div>
    <div class="card stack"><div class="row spread"><h3>${e(account.login)}</h3><div class="row">${button('编辑账号','edit-account')}${button('删除账号','delete-account',{kind:'danger'})}</div></div>
      <dl class="values"><dt>账号</dt><dd class="row">${e(account.login)} ${button('复制账号','copy-login',{kind:'quiet'})}</dd><dt>手机号</dt><dd>${e(account.mobile || '未设置')}</dd><dt>邮箱</dt><dd>${e(account.email || '未设置')}</dd><dt>备注</dt><dd>${e(account.note || '未填写')}</dd></dl>
      <div class="row rule"><span>密码</span><code class="secret" id="password-value">${account.password ? show ? e(account.password) : '••••••••' : '未设置'}</code>
        ${button(show?'隐藏密码':'显示密码','reveal',{disabled:!account.password,pressed:show})}${button('复制密码','copy',{disabled:!account.password})}</div>
    </div>`;
  $('#account-select').onchange = event => {
    accountId = event.target.value;
    revealed = '';
    announce('');
    renderDetail();
    $('#account-select').focus();
  };
}
function safePage() {
  if (!unlocked) {
    main.innerHTML = lockedPage();
    const form = $('#unlock-form');
    if (form) form.onsubmit = event=>{event.preventDefault(); enterSafe(event.target);};
    return;
  }
  const filterHtml = [['all','全部'],['none','无标签'],...store.tags.map(t=>[t.id,t.name])].map(([id,label])=>button(e(label),'filter',{id,pressed:id==='all' ? !filters.size : filters.has(id)})).join('');
  main.innerHTML = `
    <div class="row spread"><h1>保险箱</h1><div class="row">${button('标签管理','tags')}${button('更改主密码','master-change')}${button('创建演示备份','snapshot')}${button('锁定','lock')}${button('新建条目','new',{kind:'primary'})}</div></div>
    <div class="safe-grid" data-view="${view}">
      <aside class="card stack" id="safe-list" aria-label="个人条目">
        <label class="field"><span>搜索</span><input id="search" type="search" value="${e(query)}" placeholder="名称、账号、标签或备注"></label>
        <div class="row" role="group" aria-label="标签筛选">${filterHtml}</div><p class="sub">多选时显示包含全部已选标签的条目。</p><div id="safe-items" class="stack"></div>
      </aside>
      <article class="card stack" id="safe-detail" aria-label="账号详情"></article>
    </div>`;
  $('#search').oninput = event=>{query=event.target.value; renderList();};
  renderList();
  renderDetail();
}
function openEdit(entry, account, adding = false) {
  const copy = entry ? structuredClone(entry) : {id:crypto.randomUUID(),name:'',url:'',tags:[],accounts:[newAccount()],revision:0};
  if (adding) copy.accounts.push(newAccount());
  const scope = account ? account.id : adding ? copy.accounts.at(-1).id : '';
  edit = {copy, scope, mode:scope ? 'account' : 'entry', original: entry ? JSON.stringify(copy) : '', passwordActions:{}, pendingTags:[], fresh:!entry, adding};
  showEdit();
}
function readEditForm(form) {
  const values = data(form);
  if (edit.mode==='entry') {
    edit.copy.name = values.name;
    edit.copy.url = values.url;
    edit.copy.tags = new FormData(form).getAll('tags');
  }
  for (const account of edit.copy.accounts) {
    if (!Object.hasOwn(values,`login-${account.id}`)) continue;
    for (const key of ['login','mobile','email','note']) account[key] = values[`${key}-${account.id}`];
    edit.passwordActions[account.id] = [values[`mode-${account.id}`],values[`password-${account.id}`]];
  }
}
function handleEditClose() {
  const form = $('#edit-form');
  if (form) readEditForm(form);
  const mayHaveChange = !edit.original || JSON.stringify(edit.copy)!==edit.original || Object.values(edit.passwordActions).some(([mode])=>mode!=='keep');
  if (!mayHaveChange) { edit=null; closeModal(); return; }
  showModal('放弃本次编辑？',`<div class="stack"><p>本次修改尚未保存。</p><div class="row">${button('继续编辑','edit-continue')}${button('放弃更改','edit-discard',{kind:'danger'})}</div></div>`,showEdit);
}
function editAccountFields(account,index) {
  const id=account.id;
  const [mode, password] = edit.passwordActions[id] || ['keep',''];
  return `<fieldset class="stack card account-edit"><legend>账号 ${index+1}</legend>
    ${edit.fresh && edit.copy.accounts.length>1 ? button('移除此账号','edit-remove',{id,kind:'quiet',title:`移除此账号 · 第 ${index+1} 个`}) : ''}
    <div class="pair">${field('账号',`login-${id}`,account.login,'required')}${field('手机号',`mobile-${id}`,account.mobile,'type="tel"')}</div>
    ${field('邮箱',`email-${id}`,account.email,'type="email"')}
    <div class="field"><label for="note-${id}">备注</label><textarea id="note-${id}" name="note-${id}">${e(account.note)}</textarea></div>
    <div class="pair"><label class="field"><span>密码操作</span><select name="mode-${id}">${[['keep','保留原密码'],['set','设置新密码'],['clear','清空密码']].map(([value,label])=>option(value,label,mode)).join('')}</select></label>
    ${field('新密码',`password-${id}`,password,`type="password" autocomplete="off"${mode==='set' ? ' required' : ' disabled'}`)}</div></fieldset>`;
}
function showEdit() {
  const {copy,mode,scope,fresh} = edit;
  const accounts = fresh ? copy.accounts : copy.accounts.filter(a=>a.id===scope);
  const headline = fresh ? '新建条目' : mode==='entry' ? '编辑条目' : '保存账号';
  showModal(headline,`<form class="stack" id="edit-form" aria-labelledby="modal-title">
    ${mode==='entry' ? `<div class="pair">${field('名称','name',copy.name,'required')}${field('网址','url',copy.url,'type="url"')}</div>
      <fieldset class="card"><legend>标签</legend><div class="row">${[...store.tags,...edit.pendingTags].map(t=>`<label class="row"><input type="checkbox" name="tags" value="${t.id}"${copy.tags.includes(t.id) ? ' checked' : ''}>${tagBadge(t)}</label>`).join('')}${button('新增标签','edit-new-tag')}</div></fieldset>` : ''}
    ${accounts.map(editAccountFields).join('')}${fresh ? button('再添加一个账号','edit-add') : ''}
    ${errorLine}<div class="row">${button('取消编辑','close-modal')}${button('锁定保险箱','lock')}<button type="submit" class="primary">保存</button></div></form>`,handleEditClose);
  const form=$('#edit-form');
  form.onchange = event=>{
    if (!event.target.name.startsWith('mode-')) return;
    const input=form.elements[`password-${event.target.name.slice(5)}`];
    input.disabled=event.target.value!=='set';
    input.required=!input.disabled;
    if (input.disabled) input.value='';
  };
  form.onsubmit = event=>{event.preventDefault(); readEditForm(form); saveEdit();};
}
function saveEdit() {
  const {copy,passwordActions,fresh,scope} = edit;
  if (!unlocked) return;
  if (!copy.name.trim() || copy.accounts.some(a=>!a.login.trim())) {
    formError('请填写名称及每个账号。');
    return;
  }
  if (consumeFault('save')) {
    formError('模拟写入失败。已保留表单，请重试保存。');
    return;
  }
  const existing = store.entries.find(entry=>entry.id===copy.id);
  const simulated = consumeFault('conflict');
  if (simulated && existing) existing.revision++;
  if (simulated || (existing && existing.revision!==copy.revision)) {
    formError('版本已变化，当前编辑已保留。选择「重读当前版本」后核对并重新修改。');
    if (!$('#reload-edit')) $('#dialog-error').insertAdjacentHTML('afterend',button('重读当前版本','edit-reload',{id:copy.id}).replace('<button ','<button id="reload-edit" '));
    return;
  }
  for (const account of copy.accounts) {
    const [mode,password] = passwordActions[account.id] || ['keep',''];
    if (mode==='set') account.password=password;
    if (mode==='clear') account.password='';
  }
  copy.revision++;
  store.tags.push(...edit.pendingTags.filter(t=>copy.tags.includes(t.id)));
  if (fresh) store.entries.unshift(copy);
  else store.entries.splice(store.entries.indexOf(existing),1,copy);
  edit=null;
  closeModal();
  entryId=copy.id;
  accountId=scope || copy.accounts[0].id;
  revealed='';
  view='detail';
  render();
  announce('已保存到保险箱');
}
function openTags() {
  showModal('标签管理',`<div class="stack">${store.tags.map(t=>`<div class="row spread rule"><span>${tagBadge(t)} · ${store.entries.filter(x=>x.tags.includes(t.id)).length} 个条目</span><div class="row">${button('编辑','tag-edit',{id:t.id,title:`编辑 ${t.name}`})}${button('删除','tag-delete',{id:t.id,kind:'danger',title:`删除 ${t.name}`})}</div></div>`).join('') || '<p>暂无标签。</p>'}${button('新建标签','tag-edit',{kind:'primary'})}</div>`);
}
function openTag(id, fromEdit=false) {
  const tag = store.tags.find(t=>t.id===id);
  showModal(tag ? '编辑标签' : '新建标签',`<form class="stack" id="tag-form" aria-labelledby="modal-title">
    ${field('名称','name',tag?.name,'required')}<div class="field"><label for="tag-color">颜色</label><select name="color" id="tag-color">${Object.entries(palette).map(([id,label])=>option(id,label,tag?.color)).join('')}</select></div>
    ${errorLine}<div class="row">${fromEdit ? button('返回编辑','edit-continue') : button('返回标签管理','tags')}<button type="submit" class="primary">${fromEdit ? '应用标签' : '保存标签'}</button></div></form>`,fromEdit?showEdit:undefined);
  $('#tag-form').onsubmit = event=>{
    event.preventDefault();
    const values = data(event.target), name = values.name.trim();
    const match = [...store.tags,...(fromEdit ? edit.pendingTags : [])].find(t=>t.name===name && t.id!==id);
    if (!name) { formError('请输入标签名称。'); return; }
    if (match && tag) { formError('已有同名标签。请改用其他名称。'); return; }
    if (fromEdit) {
      const pending=match || {...values,name,id:crypto.randomUUID()};
      if(!match)edit.pendingTags.push(pending);
      if(!edit.copy.tags.includes(pending.id))edit.copy.tags.push(pending.id);
      showEdit();
      return;
    }
    if (tag) Object.assign(tag,{...values,name});
    else if (!match) store.tags.push({...values,name,id:crypto.randomUUID()});
    render();
    openTags();
    announce(match ? '已复用现有标签' : '标签已保存');
  };
}
function settingsPage() {
  main.innerHTML = `<div class="stack">
    <div class="row spread"><h1>保险箱与模块设置</h1>${button('返回保险箱','module')}</div>
    <section class="card stack"><h2>保险箱</h2>
      <p>当前 Vault · ${e(store.vault)} · ${unlocked ? '已解锁' : store.master ? '已锁定' : '未初始化'}</p>
      <form class="row" id="prefs" aria-label="保险箱锁定设置"><label>自动锁定 <select name="minutes">${[[0,'关闭'],[1,'1 分钟'],[5,'5 分钟'],[15,'15 分钟']].map(([value,label])=>option(String(value),label,String(store.prefs.minutes))).join('')}</select></label>
        <label class="row"><input name="leave" type="checkbox"${store.prefs.leave ? ' checked' : ''}>离开模块时锁定</label><button type="submit">保存锁定设置</button></form>
      <div class="row">${button('更改主密码','master-change',{disabled:!unlocked})}${button('创建演示备份','snapshot',{disabled:!unlocked})}${button('恢复演示备份','restore',{disabled:!store.backups.length})}${button('切换演示 Vault','vault')}</div>
      <p class="sub">解锁后可从保险箱页面更改主密码、创建备份。备份恢复需要创建备份时的主密码。</p>
    </section>
    <section class="stack"><h2>模块认证设置</h2><p class="muted">模块使用自己的受保护凭据。还原配置后，会提示重新配置本机认证。</p>
      <div class="module-grid">${Object.entries(owners).map(([id,[name,target,label]])=>{
        const config=store.modules[id];
        return `<article class="card stack"><h3>${name}</h3><p class="sub">${e(config?.target || target)}</p><div class="row"><span class="badge ${config?.configured?'ok':''}">${e(config?.configured ? '已配置 · '+config.method : config ? '需重新配置' : '未配置')}</span>${button(`配置${label}`,'owner',{id,title:`配置${name}${label}`})}</div>${button('模拟使用','owner-test',{id,title:`模拟使用${name}`})}</article>`;
      }).join('')}</div>
      <p id="module-result" class="notice" role="status" hidden></p>
    </section></div>`;
  $('#prefs').onsubmit=event=>{
    event.preventDefault();
    const values=data(event.target);
    store.prefs={minutes:Number(values.minutes),leave:!!values.leave};
    armIdle();
    announce('已保存锁定设置');
  };
}
function openOwner(id) {
  const [name,target,label,methods]=owners[id];
  const config=store.modules[id] || {};
  showModal(`${name} · ${label}`,`<form class="stack" id="owner-form" aria-labelledby="modal-title">
    ${field('所属对象','target',config.target || target,'required')}${field('用户名或变量名','user',config.user || '')}
    <label class="field"><span>认证方式</span><select name="method">${methods.map(method=>option(method,method,config.method)).join('')}</select></label>
    <label class="field"><span>凭据操作</span><select name="mode">${Object.entries({keep:'保留已有状态',replace:'配置或替换模拟凭据',clear:'清除认证'}).map(([value,label])=>option(value,label,config.configured?'keep':'replace')).join('')}</select></label>
    ${field('模拟值','secret','','type="password" autocomplete="off" aria-describedby="owner-help"')}
    <p class="sub" id="owner-help">请填写任意演示值。读取常规设置时仅显示认证状态。</p>${errorLine}
    <div class="row">${button('取消','close-modal')}<button type="submit" class="primary">保存模块配置</button></div></form>`);
  $('#owner-form').onsubmit=event=>{
    event.preventDefault();
    const {target,user,method,mode,secret}=data(event.target);
    const nativeMethod = ['系统 SSH','系统 agent／身份文件','CLI 原生登录'].includes(method);
    if (consumeFault('protect')) { formError('本机保护暂不可用。旧配置已保留，请重试。'); return; }
    if (mode==='replace' && !secret && !nativeMethod) { formError('请填入模拟值。'); return; }
    const same = config.target===target && config.method===method;
    const configured = nativeMethod || mode==='replace' || (mode==='keep' && same && !!config.configured);
    store.modules[id]={target,user,method,configured};
    closeModal();
    render();
    announce(configured ? '模块认证已配置' : '已保存设置，需为该目标重新配置认证');
  };
}
function render() {
  $('#crumb').textContent = page==='settings' ? '保险箱与模块设置' : '保险箱';
  if (page==='settings') settingsPage(); else safePage();
}
const actions = {
  module:()=>changePage('safe'), settings:()=>changePage('settings'),
  reset:()=>{clearSession(); store=fixture(); otherVault=undefined; disabled=false; $('[data-action="toggle-safe"]').setAttribute('aria-pressed','false'); page='safe'; $('#fault').value=''; render(); announce('已重置演示');},
  clean:()=>{clearSession(); store=fixture(true); otherVault=undefined; page='safe'; $('#fault').value=''; render(); announce('空白 Vault 已准备好');},
  'toggle-safe':(_,target)=>{disabled=!disabled; target.setAttribute('aria-pressed',String(disabled));lock(disabled?'保险箱已停用。模块认证保持可用。':'保险箱已启用。');},
  restart:()=>{ page='safe'; lock('模拟重启完成。请重新解锁，本次窗口中的已保存条目可继续使用。'); },
  idle:()=>{ if (unlocked && store.prefs.minutes) lock('已自动锁定'); else announce('自动锁定已关闭，或保险箱已锁定。'); },
  lock:()=>lock(),
  entry:(id,clicked)=>{entryId=id; accountId=clicked.dataset.account || ''; revealed=''; view='detail'; $('.safe-grid').dataset.view=view; renderList(); renderDetail(); $('#entry-title').focus();},
  back:()=>{view='list'; revealed=''; $('.safe-grid').dataset.view=view; renderDetail(); ($(`#safe-items button[data-id="${entryId}"]`) || $('#search')).focus();},
  filter:(id)=>{if (id==='all') filters.clear(); else if (id==='none') filters=filters.has('none') ? new Set() : new Set(['none']); else {filters.delete('none'); if (filters.has(id)) filters.delete(id); else filters.add(id);}
    if (!filteredEntries().some(entry=>entry.id===entryId)) {entryId='';accountId='';revealed='';} render(); $(`[data-action="filter"][data-id="${id}"]`).focus();},
  new:()=>openEdit(), edit:()=>openEdit(currentEntry()),
  'add-account':()=>openEdit(currentEntry(),null,true),
  'edit-account':()=>openEdit(currentEntry(),currentEntry().accounts.find(a=>a.id===accountId)),
  'edit-add':()=>{readEditForm($('#edit-form')); edit.copy.accounts.push(newAccount()); showEdit(); $(`[name="login-${edit.copy.accounts.at(-1).id}"]`).focus();},
  'edit-remove':id=>{readEditForm($('#edit-form')); edit.copy.accounts=edit.copy.accounts.filter(a=>a.id!==id); delete edit.passwordActions[id]; showEdit();},
  'edit-new-tag':()=>{readEditForm($('#edit-form'));openTag('',true);},
  'edit-continue':showEdit, 'edit-discard':()=>{edit=null;closeModal();announce('已放弃未保存的更改');},
  'edit-reload':id=>{const current=store.entries.find(x=>x.id===id); const a=current?.accounts.find(x=>x.id===edit.scope); openEdit(current,a,edit.adding);},
  reveal:()=>{revealed=revealed===accountId ? '' : accountId; renderDetail(); $('[data-action="reveal"]').focus(); announce(revealed ? '已显示当前账号的密码' : '已隐藏密码');},
  copy:async ()=>{
    const current = currentEntry().accounts.find(a=>a.id===accountId);
    const request = Symbol();
    clipboardNotice = request;
    try {
      if (consumeFault('copy') || !navigator.clipboard?.writeText) throw Error('clipboard unavailable');
      await navigator.clipboard.writeText(current.password);
      if (clipboardNotice===request && unlocked && accountId===current.id) announce('已复制当前账号的密码');
    } catch {
      if (clipboardNotice===request && unlocked && accountId===current.id) announce('无法使用剪贴板。可以点击显示密码后手动复制。');
    }
  },
  'copy-login':async ()=>{
    const current=currentEntry().accounts.find(a=>a.id===accountId);
    try {
      if (consumeFault('copy')) throw Error('clipboard unavailable');
      await navigator.clipboard.writeText(current.login);
      if (unlocked && accountId===current.id) announce('已复制账号');
    } catch {
      if (unlocked && accountId===current.id) announce('无法使用剪贴板。可手动复制账号。');
    }
  },
  'delete-entry':id=>{
    const entry=store.entries.find(x=>x.id===id);
    confirmAction('删除整个条目', `「${e(entry.name)}」及其 ${entry.accounts.length} 个账号将从本次演示中删除。`, '删除整个条目',()=>{
      store.entries=store.entries.filter(x=>x.id!==id); entryId='';accountId='';revealed='';view='list';render();$('#search').focus();announce('已删除条目');
    });
  },
  'delete-account':()=>{
    const entry=currentEntry(), account=entry.accounts.find(a=>a.id===accountId);
    if(entry.accounts.length===1){
      confirmAction('这是最后一个账号', `「${e(account.login)}」是「${e(entry.name)}」的最后一个账号。可转到整条删除确认。`, '转到删除条目',()=>actions['delete-entry'](entry.id));
      return;
    }
    confirmAction('删除账号', `删除「${e(account.login)}」？`, '确认删除账号',()=>{
      entry.accounts=entry.accounts.filter(a=>a.id!==account.id);entry.revision++;accountId=entry.accounts[0].id;revealed='';render();announce('已删除所选账号');
    });
  },
  tags:openTags,'tag-edit':id=>openTag(id),'tag-delete':id=>{
    const tag=store.tags.find(x=>x.id===id);
    confirmAction('删除标签',`删除「${e(tag.name)}」并从相关条目解除关联？`,'删除标签',()=>{
      store.tags=store.tags.filter(x=>x.id!==id);
      store.entries.forEach(x=>{x.tags=x.tags.filter(t=>t!==id);});
      filters.delete(id); render();openTags();announce('已删除标签');
    });
  },
  owner:openOwner,'owner-test':id=>{
    const result=$('#module-result'), config=store.modules[id];
    result.hidden=false;
    result.textContent=config?.configured ? `${owners[id][0]}：已使用模块自己的配置完成模拟操作。` : `${owners[id][0]}：需要先配置该模块的认证。`;
  },
  'master-change':()=>{
    showModal('更改主密码',`<form id="master-form" class="stack" aria-labelledby="modal-title">
      ${field('当前主密码','old','','type="password" autocomplete="off" required')}${field('新主密码','next','','type="password" minlength="8" autocomplete="off" required')}${field('确认新主密码','repeat','','type="password" autocomplete="off" required')}${errorLine}
      <div class="row">${button('取消','close-modal')}<button type="submit" class="primary">保存新主密码</button></div></form>`);
    $('#master-form').onsubmit=event=>{
      event.preventDefault();
      const {old,next,repeat}=data(event.target);
      if(old!==store.master || next!==repeat) { formError('当前主密码错误，或新密码确认不一致。'); return; }
      if(consumeFault('save')) { formError('模拟写入失败，当前主密码仍有效。'); return; }
      store.master=next;
      closeModal();announce('主密码已更改');
    };
  },
  snapshot:()=>{
    store.backups.push({master:store.master,entries:structuredClone(store.entries),tags:structuredClone(store.tags),
      modules:Object.fromEntries(Object.entries(store.modules).map(([id,config])=>[id,{...config,configured:false}]))});
    render(); announce(`已创建第 ${store.backups.length} 份演示备份`);
  },
  restore:()=>{
    showModal('恢复演示备份',`<form id="restore-form" class="stack" aria-labelledby="modal-title">
      <label class="field"><span>备份</span><select name="snapshot">${store.backups.map((_,i)=>option(String(i),`演示备份 ${i+1}`)).join('')}</select></label>
      ${field('该备份的主密码','master','','type="password" required autocomplete="off"')}${errorLine}
      <p>恢复到新的演示 Vault。模块认证将显示需重新配置。</p><div class="row">${button('取消','close-modal')}<button type="submit" class="primary">验证并恢复</button></div></form>`);
    $('#restore-form').onsubmit=event=>{
      event.preventDefault();
      const values=data(event.target), snapshot=store.backups[Number(values.snapshot)];
      if (consumeFault('damaged')) { formError('演示备份损坏，未能恢复。'); return; }
      if (snapshot.master!==values.master) { formError('备份主密码不正确。'); return; }
      const restored = structuredClone(snapshot);
      otherVault=store;
      store={...fixture(true),...restored,backups:store.backups,vault:'恢复 Vault'};
      page='safe';lock('已恢复到新的演示 Vault，请解锁。');
    };
  },
  vault:()=>confirmAction('切换演示 Vault',`切换至「${e(otherVault?.vault || '第二个演示 Vault')}」。当前解锁会话会结束。`,'切换',()=>{
    const previous=store;
    store=otherVault || {...fixture(true),vault:'第二个演示 Vault'};
    otherVault=previous;
    page='safe';lock('已切换 Vault，原解锁会话已结束。');
  })
};
render();
