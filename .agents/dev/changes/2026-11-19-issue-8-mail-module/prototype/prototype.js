
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
const providers = [
  ['Gmail','imap.gmail.com','smtp.gmail.com','Google OAuth',465],['Yahoo','imap.mail.yahoo.com','smtp.mail.yahoo.com','应用密码',465],
  ['阿里邮箱','imap.aliyun.com','smtp.aliyun.com','客户端专用密码',465],['阿里企业邮箱','imap.qiye.aliyun.com','smtp.qiye.aliyun.com','企业客户端专用密码',465],
  ['189','imap.189.cn','smtp.189.cn','密码',465],['搜狐','imap.sohu.com','smtp.sohu.com','独立密码',465],
  ['QQ / Foxmail','imap.qq.com','smtp.qq.com','授权码',465],['腾讯企业邮','imap.exmail.qq.com','smtp.exmail.qq.com','客户端专用密码',465],
  ['网易 163','imap.163.com','smtp.163.com','授权码',465],['Outlook / Hotmail','outlook.office365.com','smtp.office365.com','Microsoft OAuth',587],
  ['新浪','imap.sina.com','smtp.sina.com','授权码',465],['139','imap.139.com','smtp.139.com','客户端密码',465],
  ['21CN','imap.21cn.com','smtp.21cn.com','密码',465],['完美邮箱','imap.88.com','smtp.88.com','专用密码',465],
  ['iCloud','imap.mail.me.com','smtp.mail.me.com','应用专用密码',587],['AOL','imap.aol.com','smtp.aol.com','应用密码',465],
  ['Yandex','imap.yandex.com','smtp.yandex.com','应用密码',465],['Mail.ru','imap.mail.ru','smtp.mail.ru','应用专用密码',465],
  ['自定义 IMAP/SMTP','','','自定义凭据',465]
];
const people = {'design@example.test':'周晴','archive@example.test':'杜宁','editor@example.test':'陈以安','finance@example.test':'梁晓'};
const person = email => people[email] || email;
const addresses = str => [...new Set((str || '').split(/[\s,，;；]+/).map(v=>v.trim().toLowerCase()).filter(Boolean))];
const fileSample = {name:'秋季发布评审议程.pdf',size:184320,owned:true};
function fixture() {
  return {
    accounts:[
      {id:'work',provider:'Gmail',label:'项目工作邮箱',email:'lin.work@example.test',send:true,auth:'Google OAuth',route:'Gmail history',status:'ready'},
      {id:'personal',provider:'Outlook / Hotmail',label:'个人信箱',email:'lin.home@example.test',send:true,auth:'Microsoft OAuth',route:'IMAP',status:'repair'},
      {id:'archive',provider:'自定义 IMAP/SMTP',label:'历史归档',email:'lin.archive@example.test',send:false,auth:'专用密码',route:'IMAP',status:'ready'}
    ],
    messages:[
      {id:'w1',mid:'design-a',account:'work',from:'design@example.test',to:['lin.work@example.test'],cc:[],subject:'秋季发布 · 评审议程与会议链接',body:'晓，你好！\n\n明早 10:30 我们在设计例会讨论秋季发布。请先检查附件里的议程，并在今天下班前标记仍有分歧的两处内容。\n\n我会准备一份纯文字备忘，方便各团队直接引用。\n周晴',quote:'上次会议：先定首页流程，再审核说明文字。',signature:'周晴 · 产品设计',attachments:[{...fileSample,owned:false}],day:0,when:'10:42',unread:true,img:true,folder:'INBOX'},
      {id:'w1-dup',mid:'design-a',account:'work',from:'design@example.test',to:['lin.work@example.test'],cc:[],subject:'秋季发布 · 评审议程与会议链接',body:'附件包含评审议程。',day:0,when:'10:42',unread:true,folder:'Archive'},
      {id:'w2',mid:'design-b',account:'work',from:'design@example.test',to:['lin.work@example.test'],cc:[],subject:'秋季发布 · 评审资料初稿',body:'这是很长的设计备忘。\n\n'+Array.from({length:8},(_,i)=>`第 ${i+1} 点｜请记录素材出处、负责团队与交付时间，并逐一与产品负责人确认使用场景。`).join('\n\n'),day:1,when:'16:24',unread:false},
      {id:'w3',mid:'design-c',account:'work',from:'editor@example.test',replyTo:'editor@example.test',to:['lin.work@example.test','design@example.test'],cc:['finance@example.test','design@example.test','lin.home@example.test'],bcc:['private@example.test'],subject:'秋季发布复盘 · 预算、交接与最终定稿',body:'各位好，请确认样片、费用归属和最终交接清单，便于我们统一定稿。',day:0,when:'08:05',unread:false},
      {id:'p1',mid:'archive-a',account:'personal',from:'archive@example.test',to:['lin.home@example.test'],cc:[],subject:'城市档案馆 · 冬季口述史访谈排程',body:'今年冬季访谈安排在 12 月第一周。蓝色封面的签署表仍需核对；可以从前台领取。',day:9,when:'14:36',unread:true},
      {id:'p2',mid:'library-a',account:'personal',from:'archive@example.test',to:['lin.home@example.test'],cc:[],subject:'档案馆志愿排班',body:'请在午休前确认周六可到馆的时段。',day:0,when:'09:08',unread:false},
      {id:'a1',account:'archive',from:'editor@example.test',to:['lin.archive@example.test'],cc:[],subject:'透明归档规范与会议纪要',body:'归档按原会话保留索引，并注明附件仅存名称的情况。',day:0,when:'08:12',unread:true},
      {id:'ignored',account:'work',from:'finance@example.test',to:['lin.work@example.test'],cc:[],subject:'已移至垃圾箱的样例',body:'隐藏列表',day:0,when:'09:37',folder:'trash'}
    ],
    drafts:[{id:'d0',revision:1,account:'work',to:'design@example.test',cc:'',bcc:'',subject:'下周评审 · 待确认事项',body:'我先整理两处还待核对的素材，补充完就发给你。',attachments:[fileSample],format:'text'}],
    jobs:[], backups:[], prefs:{interval:15, ai:false, endpoint:'http://127.0.0.1:11434', key:false},
    vault:'演示 Vault'
  };
}
let store = fixture(), page='mail', scope='all', period='today', view='accounts';
let thread='', target='', selectedHistory='', columnWidth=240, visibleCount=6;
let offline=false, readonly=false, composing=null, expanded=false, inline=false, composeBaseline='', composeError='';
let found=[], hit=0, searchTimer, syncTimer, observer, accountDraft, approvedAI=null;
let disclosure=new Set(), plaintext=new Set(), bodyState=new Map(), remoteRead=new Map(), imageAllowed=new Set();
const main=$('#main'), composer=$('#composer');
const account = id => store.accounts.find(x=>x.id===id);
const fault = type => {
  if ($('#fault').value!==type) return false;
  $('#fault').value='';
  return true;
};
const todayLabel = msg => msg.day===0 ? '今天' : msg.day===1 ? '昨天' : `${msg.day} 天前`;
const err = '<p class="error" id="mail-error" role="alert"></p>';
function modalError(message) { $('#mail-error').textContent = message; }
function composeFeedback(message) {
  composeError=message;
  const error=$('#compose-alert');
  if (error) error.textContent=message;
}
function changePage(next) {
  page=next;
  selectedHistory='';
  render();
}
function publicPeople(msg) {
  const self = new Set(store.accounts.map(a=>a.email.toLowerCase()));
  return [...new Set([msg.from,...msg.to,...msg.cc].filter(Boolean).map(v=>v.trim().toLowerCase()))].filter(v=>!self.has(v)).sort();
}
function visibleMessages() {
  const unique=new Map();
  for(const msg of store.messages) {
    if(['trash','junk','drafts'].includes(msg.folder) || !account(msg.account)) continue;
    const id=`${msg.account}:${msg.mid || msg.id}`;
    if (!unique.has(id)) unique.set(id,msg);
  }
  return [...unique.values()];
}
const threadKey = msg => publicPeople(msg).join('|');
function inPeriod(msg) {
  if(period==='today') return msg.day===0;
  if(period==='yesterday') return msg.day===1;
  if(period==='three') return msg.day<=2;
  return true;
}
const chronology=(a,b)=>b.day-a.day || a.when.localeCompare(b.when);
function threads() {
  const map=new Map();
  for(const msg of visibleMessages()) {
    if((scope!=='all' && msg.account!==scope) || !inPeriod(msg)) continue;
    const key=threadKey(msg);
    if(!key) continue;
    if(!map.has(key)) map.set(key,[]);
    map.get(key).push(msg);
  }
  return [...map].map(([key,list])=>({key,list:list.sort(chronology)})).sort((a,b)=>chronology(b.list.at(-1),a.list.at(-1)));
}
function sync(id) {
  const ids=id==='all' ? store.accounts.map(a=>a.id) : [id];
  if(readonly || offline) {announce(readonly?'只读 Vault，已暂停同步。':'离线，已保留本机缓存。');return;}
  const active=ids.map(account).filter(a=>a && !['repair','syncing'].includes(a.status));
  if(fault('connect')) {active.forEach(a=>{a.status='timeout';}); render(); announce('连接超时，缓存仍可读。请刷新重试。');return;}
  active.forEach(a=>{a.status='syncing';});
  render();
  const running=store;
  setTimeout(()=>{
    if(store!==running || !active.some(a=>account(a.id)===a && a.status==='syncing')) return;
    active.forEach(a=>{if(account(a.id)===a && a.status==='syncing') a.status='ready';});
    render();
    announce(ids.some(x=>account(x)?.status==='repair')?'同步完毕。有账号需要重新授权。':'同步完成 · 演示缓存已就绪');
  },420);
}
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{if(!offline && !readonly)sync('all');scheduleSync();},store.prefs.interval*60000);
}
const collapsed = new Set();
const labels = {ready:'已同步',repair:'需要重授权',timeout:'连接超时',syncing:'同步中…',local:'待首次同步'};
function accountRows() {
  const groups=Object.groupBy ? Object.groupBy(store.accounts,a=>a.provider) : store.accounts.reduce((result,a)=>{(result[a.provider] ||= []).push(a);return result;},Object.create(null));
  return Object.entries(groups).map(([provider,rows])=>`<details data-provider="${e(provider)}"${!collapsed.has(provider) ? ' open' : ''}>
    <summary>${e(provider)}</summary>${rows.map(a=>{
      const count=visibleMessages().filter(m=>m.account===a.id && m.unread).length;
      return `<div class="row account-head" data-account-id="${a.id}">
        ${button(`<strong>${e(a.label)}</strong><span class="badge${count?' ok':''}">${count}</span><span class="sub wrap">${e(a.email)} · ${labels[a.status]}</span>`,'select-account',{id:a.id,kind:'item',current:scope===a.id})}
        ${scope===a.id ? `<div class="row">${button('刷新','sync',{id:a.id,kind:'quiet'})}${button(a.status==='repair'?'重新授权':'编辑账号','edit-account',{id:a.id,kind:'quiet'})}${button('删除','delete-account',{id:a.id,kind:'quiet danger',title:`删除 ${a.label}`})}</div>` : ''}
      </div>`;
    }).join('')}</details>`).join('');
}
function contactsHtml(items) {
  const more = items.length>visibleCount;
  return `${items.slice(0,visibleCount).map(({key,list})=>{
    const last=list.at(-1);
    const names=publicPeople(last).map(person);
    const count=list.filter(m=>m.unread).length;
    return button(`<span class="avatar" aria-hidden="true">${e(names[0][0])}</span><span><strong>${e(names.join('、'))}</strong> ${count?`<span class="badge ok">${count} 封未读</span>`:''}<span class="sub">${e(last.subject)}</span><span class="sub">${todayLabel(last)} ${last.when}</span></span>`,'select-thread',{id:key,kind:'item',current:thread===key});
  }).join('') || '<p class="muted">当前范围内没有对话。</p>'}${more ? button('更多对话','more') : ''}`;
}
function messageBody(m) {
  const status=bodyState.get(m.id);
  if(!status) return '<p class="sub">正文等待载入…</p>';
  if(status==='loading') return '<p class="sub" role="status">正在加载正文…</p>';
  if(status==='failed') return `<div class="row"><p class="error">正文暂不可读。</p>${button('重试正文','retry-body',{id:m.id})}</div>`;
  const open=disclosure.has(m.id), isText=plaintext.has(m.id), long=m.body.length>315;
  const content=long && !open ? m.body.slice(0,252)+'…' : m.body;
  return `
    <p class="mail-body">${isText || m.format!=='rich' ? e(content) : richBody(content)}</p>${long ? button(open?'收起正文':'展开正文','expand-body',{id:m.id,kind:'quiet'}) : ''}
    ${m.quote ? `<details><summary>引用内容</summary><p>${e(m.quote)}</p></details>`:''}${m.signature ? `<details><summary>签名</summary><p>${e(m.signature)}</p></details>`:''}
    ${m.img && !isText ? `<div class="notice row">${imageAllowed.has(m.id) ? '本封图片已放行 · 显示本地样例占位' : `已屏蔽外部图片 ${button('仅为本封加载图片','image',{id:m.id})}`}</div>`:''}
    ${(m.attachments || []).map(a=>`<span class="badge">${e(a.name)} · ${a.owned?'受管附件':'仅有名称'}</span>`).join('')}
    <div class="mail-actions row">${button(isText?'HTML 显示':'纯文本显示','text-mode',{id:m.id,kind:'quiet'})}${button('查看原文','raw',{id:m.id,kind:'quiet'})}
      ${!m.sent ? `${button('回复','reply',{id:m.id})}${button('回复全部','reply-all',{id:m.id})}` : ''}${button('转发','forward',{id:m.id})}
      ${remoteRead.get(m.id)==='failed'?button('重试远端标读','mark',{id:m.id}):''}</div>`;
}
function messageHtml(m) {
  return `<article id="message-${m.id}" data-message="${m.id}" class="card message stack${m.sent?' sent':''}${target===m.id?' highlight':''}" tabindex="-1">
    <div class="row spread"><div><h3>${e(m.subject)}</h3><p class="sub">${e(person(m.from))} · ${e(account(m.account).label)} · ${todayLabel(m)} ${e(m.when)} · ${m.sent?'发件':'收件'}</p></div><span class="badge read-status">${readLabel(m)}</span></div>
    <div class="stack" data-mail-body>${messageBody(m)}</div></article>`;
}
function readLabel(m) {
  if(remoteRead.get(m.id)==='failed') return '远端标读待重试';
  if(m.unread) return '未读';
  if(remoteRead.get(m.id)==='local') return '本机已读';
  if(remoteRead.get(m.id)==='confirmed') return '远端已确认';
  return '已读';
}
function mailPage() {
  const items=threads();
  const selected=items.find(t=>t.key===thread);
  main.innerHTML = `<div class="mail-grid" data-view="${view}">
    <aside class="accounts" data-pane="accounts" aria-label="邮箱账号">
      <div class="row spread"><h1>邮件</h1>${button('写信','compose',{kind:'primary'})}</div>
      <div class="row">${button('搜索','search')}${button('草稿','drafts')}${button('发件箱','outbox')}</div>
      ${button('全部账号','select-account',{id:'all',kind:'item',current:scope==='all'})}${accountRows()}
      <div class="row rule">${button('添加邮箱','add-account')}${button('刷新全部','sync',{id:'all',kind:'quiet'})}</div>
      <label for="column-width" class="sub">账号栏宽度</label><input type="range" id="column-width" min="220" max="300" value="${columnWidth}">
    </aside>
    <section class="contacts" data-pane="contacts" aria-label="联系人对话">
      ${button('‹ 返回账号','back-accounts',{kind:'quiet mobile-back'})}
      <div class="row spread"><h2 id="contacts-title" tabindex="-1">联系人对话</h2>${button('搜索','search',{kind:'quiet mobile-back'})}</div>
      <label class="row"><span>时间</span><select id="period">${[['today','今天'],['yesterday','昨天'],['three','近三天'],['all','全部']].map(([id,label])=>option(id,label,period)).join('')}</select></label>
      <div id="contacts-list">${contactsHtml(items)}</div>
    </section>
    <section class="reader" data-pane="reader" aria-label="邮件阅读">
      ${button('‹ 返回对话','back-contacts',{kind:'quiet mobile-back'})}
      ${selected ? `<div class="row spread"><div><h2 id="reader-title" tabindex="-1">${e(selected.key.split('|').map(person).join('、'))}</h2><p class="sub">${e(selected.key.split('|').join(' · '))}</p></div><div class="row">${button('复制联系人','copy-address',{id:selected.key})}${button('新话题','new-topic',{id:selected.key})}${button('返回最新','latest')}</div></div>` : '<h2>邮件阅读</h2><p class="muted">从联系人对话中打开邮件。</p>'}
      <div class="reader-content" id="thread-messages" aria-label="当前对话邮件">${selected ? selected.list.map(messageHtml).join('') : ''}</div>
      <div id="inline-composer"></div>
    </section>
  </div>`;
  $('.mail-grid').style.setProperty('--accounts-width',`${columnWidth}px`);
  $('#column-width').oninput=event=>{columnWidth=Number(event.target.value);$('.mail-grid').style.setProperty('--accounts-width',`${columnWidth}px`);};
  $('#period').onchange=event=>{period=event.target.value;thread='';target='';visibleCount=6;render();$('#period').focus();};
  $$('.accounts details').forEach(element=>element.ontoggle=()=>{if(element.open)collapsed.delete(element.dataset.provider);else collapsed.add(element.dataset.provider);});
  $$('.account-head').forEach(element=>element.oncontextmenu=event=>{event.preventDefault(); showAccountMenu(element.dataset.accountId);});
  $('#contacts-list').oncontextmenu=event=>{
    const element=event.target.closest('[data-action="select-thread"]');
    if(!element)return;
    event.preventDefault();
    const t=items.find(i=>i.key===element.dataset.id);
    const msg=t?.list.toReversed().find(m=>!m.sent);
    if(msg) showModal('对话操作',`<div class="row">${button('引用回复','reply',{id:msg.id})}${button('回复全部','reply-all',{id:msg.id})}${button('取消','close-modal')}</div>`);
  };
  observeMessages();
}
function showAccountMenu(id) {
  const a=account(id);
  showModal(a.label,`<div class="row">${button('刷新','sync-close',{id})}${button(a.status==='repair'?'重新授权':'编辑账号','edit-account',{id})}${button('删除账号','delete-account',{id})}</div>`);
}
function observeMessages() {
  observer?.disconnect();
  if(!$('#thread-messages')) return;
  observer=new IntersectionObserver(entries=>{
    for (const entry of entries) {
      if(!entry.isIntersecting) continue;
      const msg=store.messages.find(m=>m.id===entry.target.dataset.message);
      if(!msg) continue;
      if(!bodyState.has(msg.id)) loadBody(msg);
      else if(bodyState.get(msg.id)==='ready' && msg.unread && !remoteRead.has(msg.id)) markRead(msg);
    }
  },{root:$('#thread-messages'),threshold:.05});
  $$('[data-message]').forEach(el=>observer.observe(el));
}
function bodyVisible(element, body) {
  if(!element || !body || !element.getClientRects().length || !body.getClientRects().length) return false;
  const a=element.getBoundingClientRect(),b=body.getBoundingClientRect(),region=$('#thread-messages').getBoundingClientRect();
  return Math.min(a.bottom,b.bottom,region.bottom,innerHeight)>Math.max(a.top,b.top,region.top,0);
}
function loadBody(msg) {
  bodyState.set(msg.id,'loading');
  refreshMessage(msg);
  const current=store, states=bodyState;
  const fail=fault('body');
  setTimeout(()=>{
    if(store!==current || states!==bodyState || !account(msg.account)) return;
    states.set(msg.id,fail?'failed':'ready');
    refreshMessage(msg);
    const node=$(`[data-message="${msg.id}"]`);
    if(!fail && msg.unread && !remoteRead.has(msg.id) && bodyVisible(node,node?.querySelector('[data-mail-body]'))) markRead(msg);
  },260);
}
function markRead(m) {
  const a=account(m.account);
  if(readonly) {announce('只读 Vault，未提交已读更新。');return;}
  if(a.route==='IMAP' && (offline || fault('read'))) {
    remoteRead.set(m.id,'failed');
  } else {
    remoteRead.set(m.id,a.route==='IMAP'?'confirmed':'local');
    m.unread=false;
    for(const clone of store.messages) if(clone.mid && clone.mid===m.mid && clone.account===m.account) clone.unread=false;
  }
  refreshMessage(m);
  const list=$('#contacts-list');
  if(list) list.innerHTML=contactsHtml(threads());
  const badge=$(`.account-head[data-account-id="${m.account}"] .badge`);
  if(badge) badge.textContent=visibleMessages().filter(x=>x.account===m.account && x.unread).length;
}
function refreshMessage(msg) {
  const node=$(`[data-message="${msg.id}"]`);
  if(!node)return;
  node.querySelector('[data-mail-body]').innerHTML=messageBody(msg);
  node.querySelector('.read-status').textContent=readLabel(msg);
}
function openSearch() {
  hit=0;
  showModal('搜索已缓存邮件',`<div class="stack"><label class="field"><span>主题、联系人或正文</span><input id="find-mail" type="search" autocomplete="off"></label>
    <p class="sub">跨所有邮箱搜索当前 Vault 的缓存。</p><div id="search-results" class="stack"></div></div>`,()=>{
      clearTimeout(searchTimer);closeModal();
    });
  const input=$('#find-mail');
  input.oninput=()=>{
    clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>search(input.value),250);
  };
  input.onkeydown=event=>{
    if(event.isComposing) return;
    if(event.key==='ArrowDown' || event.key==='ArrowUp'){
      event.preventDefault();
      if(found.length) {hit=(hit+(event.key==='ArrowDown'?1:-1)+found.length)%found.length;renderSearch();}
    }
    if(event.key==='Enter' && found[hit]) {event.preventDefault();locate(found[hit].id);}
  };
  search('');
}
let matchCount=0, maxSearch=8;
function search(value) {
  const query=value.trim().toLowerCase();
  maxSearch=8;hit=0;
  found=query ? visibleMessages().filter(m=>[m.subject,m.body,m.from,...publicPeople(m)].some(x=>x.toLowerCase().includes(query))).sort((a,b)=>chronology(b,a)) : [];
  matchCount=found.length;
  renderSearch();
}
function renderSearch() {
  $('#search-results').innerHTML=found.length ? `${found.slice(0,maxSearch).map((m,i)=>button(`<strong>${e(m.subject)}</strong><span class="sub">${e(account(m.account).label)} · ${todayLabel(m)} · ${e(m.body.slice(0,65))}</span>`,'locate',{id:m.id,kind:'item',current:i===hit})).join('')}${matchCount>maxSearch?button('更多搜索结果','search-more'):''}`:'<p class="muted">暂无匹配。</p>';
  if(hit>=maxSearch) {maxSearch=hit+1;renderSearch();}
}
function locate(id) {
  const msg=store.messages.find(m=>m.id===id);
  if(!msg)return;
  clearTimeout(searchTimer);
  closeModal();
  scope=msg.account; collapsed.delete(account(scope).provider);period='all';page='mail';view='reader';thread=threadKey(msg);target=id;
  render();
  requestAnimationFrame(()=>{
    const node=$(`#message-${id}`);
    if(node) {node.scrollIntoView({block:'center'});node.focus({preventScroll:true});setTimeout(()=>{node.classList.remove('highlight');if(target===id)target='';},4300);}
    else announce('此邮件只包含私有收件人，可从发件箱查阅。');
  });
}
function showRaw(id) {
  const m=store.messages.find(x=>x.id===id);
  showModal('邮件原文',`<pre aria-label="模拟邮件原文">From: ${e(m.from)}\nTo: ${e(m.to.join(', '))}\nCc: ${e(m.cc.join(', '))}\nSubject: ${e(m.subject)}\nMessage-ID: ${e(m.mid || '无')}\n\n${e(m.body)}</pre>`);
}
const composeKey = draft => JSON.stringify({...draft,revision:0});
function richBody(body) {
  return e(body).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'<span class="badge">链接 · $1 · $2</span>');
}
function startCompose(seed={}, mode='floating') {
  if(composing) {
    ($('#compose-form [name="to"]') || $('#compose-title'))?.focus();
    announce('请先完成或保存正在编辑的邮件。');
    return;
  }
  composing={id:crypto.randomUUID(),revision:0,account:scope!=='all'?scope:store.accounts.find(a=>a.send)?.id || store.accounts[0]?.id,to:'',cc:'',bcc:'',subject:'',body:'',attachments:[],format:'text',...structuredClone(seed)};
  composeBaseline=composeKey(composing);
  inline=mode==='inline';
  expanded=false;
  composeError='';
  renderCompose();
  $('#compose-form [name="to"]').focus();
}
function readCompose() {
  if(!composing || !$('#compose-form'))return;
  const v=data($('#compose-form'));
  Object.assign(composing,{account:v.account,to:v.to,cc:v.cc,bcc:v.bcc,subject:v.subject,body:v.body});
}
function composeClose() {
  readCompose();
  const hasContent = composing.to || composing.cc || composing.bcc || composing.subject || composing.body || composing.attachments.length;
  const isUnchanged = composing.revision && composeKey(composing)===composeBaseline;
  if (!hasContent || isUnchanged) {clearCompose();return;}
  saveDraft(true);
}
function clearCompose() {
  composing=null;
  composer.hidden=true;
  composer.replaceChildren();
  $('#inline-composer')?.replaceChildren();
  if (composeReturn?.isConnected) composeReturn.focus();
}
let composeReturn;
function renderCompose() {
  const replyHost=$('#inline-composer'), isInline=inline && !!replyHost;
  composer.hidden=!composing || isInline;
  if(!composing) return;
  const box=isInline ? replyHost : composer;
  const other=isInline ? composer : replyHost;
  other?.replaceChildren();
  composer.dataset.expanded=String(expanded);
  const a=account(composing.account);
  const disabled=!a?.send || a.status==='repair' || offline || readonly;
  let caption='';
  if(readonly)caption='只读 Vault：无法保存草稿或发送。';
  else if(offline)caption='当前离线。可以保存草稿，恢复联网后手动发送。';
  else if(a && !a.send)caption='该账号只接收邮件。请选择可发送的发件人。';
  else if(a?.status==='repair')caption='该邮箱需要重新授权后才可发送。';
  box.innerHTML=`<form id="compose-form" class="stack ${isInline?'card':''}" aria-labelledby="compose-title">
    <div class="row spread"><h2 id="compose-title" tabindex="-1">${isInline?'回复':'写信'}</h2><div class="row">${!isInline?button(expanded?'还原':'扩大','expand-compose',{kind:'quiet'}):''}${button('×','close-compose',{title:'关闭写信',kind:'quiet'})}</div></div>
    ${caption?`<p class="notice">${caption}</p>`:''}
    <label class="field"><span>发件人</span><select name="account"${isInline?' disabled':''}>${store.accounts.map(a=>option(a.id,`${a.label} · ${a.email}`,composing.account)).join('')}</select>${isInline?`<input type="hidden" name="account" value="${composing.account}">`:''}</label>
    <div class="address-fields">${field('收件人（用逗号分隔）','to',composing.to,'autocomplete="off" placeholder="design@example.test"')}
      <div class="pair">${field('抄送','cc',composing.cc,'autocomplete="off"')}${field('密送','bcc',composing.bcc,'autocomplete="off"')}</div>
    </div>${field('主题','subject',composing.subject)}
    <div class="row" aria-label="正文格式">${button('粗体','format',{id:'bold'})}${button('添加链接','format',{id:'link'})}${button('纯文本','set-text',{pressed:composing.format==='text'})}</div>
    <div class="field"><label for="composer-body">正文${composing.format==='rich'?' · 格式标记':''}</label><textarea id="composer-body" name="body">${e(composing.body)}</textarea></div>
    ${composing.format==='rich'?'<details><summary>格式预览</summary><p class="mail-body" id="rich-preview"></p></details>':''}
    ${composing.references ? `<p class="sub">使用来源邮箱保留回复引用链。</p>` : ''}
    <div class="row">${button('添加示例附件','attach')}${(composing.attachments || []).map(a=>`<span class="badge">${e(a.name)} · ${a.owned?`${Math.round(a.size/1024)} KB`:'仅有名称'}</span>${button('移除附件','remove-file',{id:a.name,kind:'quiet',title:`移除附件 ${a.name}`})}`).join('')}</div>
    <p id="compose-alert" class="error" role="alert">${e(composeError)}</p>
    <div class="row">${button('保存草稿','draft-save',{disabled:readonly})}${button('丢弃','discard-compose',{kind:'danger'})}<button type="submit" class="primary"${disabled?' disabled':''}>发送邮件</button></div></form>`;
  const form=$('#compose-form');
  const preview=$('#rich-preview');
  if(preview) {
    preview.innerHTML=richBody(composing.body);
    form.elements.body.oninput=event=>{preview.innerHTML=richBody(event.target.value);};
  }
  $('select[name="account"]',form).onchange=()=>{
    readCompose();
    if(!inline && composing.references){delete composing.references;}
    composeError='';
    renderCompose();
    $('#compose-form select[name="account"]').focus();
  };
  form.onsubmit=event=>{event.preventDefault();readCompose();submitMail();};
}
function saveDraft(close=false) {
  readCompose();
  if(readonly || fault('draft')) {composeFeedback(readonly?'只读 Vault 无法存草稿。':'草稿保存失败，编辑器已保留。请重试。');return;}
  const previous=store.drafts.find(x=>x.id===composing.id);
  if(!previous || composeKey(previous)!==composeKey(composing)) composing.revision++;
  const copy=structuredClone(composing);
  if(previous) store.drafts.splice(store.drafts.indexOf(previous),1,copy);
  else store.drafts.unshift(copy);
  composeBaseline=composeKey(copy);
  composeFeedback('');
  if(close)clearCompose();
  if(page==='drafts')render();
  announce(close?'写信已关闭，草稿已保存。':'已保存草稿');
  return copy;
}
function recipients(draft) {
  const seen=new Set();
  return ['to','cc','bcc'].flatMap(type=>addresses(draft[type]).filter(address=>{
    if(seen.has(address)) return false;
    seen.add(address);
    return true;
  }).map(address=>({type,address,state:'pending'})));
}
function submitMail() {
  const eligible=account(composing.account);
  if(readonly || offline || !eligible?.send || eligible.status==='repair') {
    composeFeedback('暂时无法发送。请检查网络与邮箱配置。');
    return;
  }
  const onward=recipients(composing);
  if(!onward.length || onward.some(({address})=>! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) || !composing.subject.trim()) {
    composeFeedback('请填写有效的收件邮箱及主题。地址可使用逗号分隔。');
    return;
  }
  if(composing.attachments.some(a=>!a.owned)) {
    composeFeedback('有附件只有名称，请移除后添加示例附件，或仅发送正文。');
    return;
  }
  const draft=saveDraft();
  if(!draft)return;
  const id=`${draft.id}-${draft.revision}`;
  const existing=store.jobs.find(j=>j.id===id);
  if(existing) {
    clearCompose();changePage('outbox');selectedHistory=existing.id;render();announce('已找到该草稿版本的投递记录。');return;
  }
  const job={id,draft,results:onward,attempts:0,notes:[],status:'pending'};
  store.jobs.unshift(job);
  attempt(job,job.results);
  clearCompose();
  page='outbox';selectedHistory=id;render();
  announce(jobMessage(job.status));
}
function jobMessage(status) {
  return {accepted:'服务端已接受',failed:'明确未投递，可以重试',partial:'部分接受，请检查各收件人的结果',unknown:'结果未知，请核对发件记录'}[status];
}
function attempt(job, rows) {
  const choice=['failed','partial','unknown'].find(fault) || 'accepted';
  const result=choice==='partial' && rows.length===1 ? 'failed' : choice;
  rows.forEach((row,i)=>{row.state=result==='partial' ? i===0?'accepted':'failed' : result;});
  job.attempts++;
  job.notes.push(`第 ${job.attempts} 次 · ${jobMessage(result)}`);
  job.status=job.results.some(x=>x.state==='unknown')?'unknown':job.results.every(x=>x.state==='accepted')?'accepted':job.results.some(x=>x.state==='accepted')?'partial':'failed';
  if(job.results.some(x=>x.state==='accepted')) {
    const d=job.draft, a=account(d.account), recipientList=job.results.filter(x=>x.state==='accepted');
    const msg={id:`sent-${job.id}`,mid:`${job.id}@huhu.example.test`,account:a.id,from:a.email,to:recipientList.filter(x=>x.type==='to').map(x=>x.address),cc:recipientList.filter(x=>x.type==='cc').map(x=>x.address),subject:d.subject,body:d.body,format:d.format,attachments:d.attachments,day:0,when:'11:46',sent:true,unread:false};
    const oldIndex=store.messages.findIndex(m=>m.id===msg.id);
    if(oldIndex<0)store.messages.push(msg);else store.messages.splice(oldIndex,1,msg);
    store.drafts=store.drafts.filter(x=>x.id!==d.id || x.revision!==d.revision);
  }
}
function reply(id,kind) {
  const m=store.messages.find(x=>x.id===id);
  if(!m)return;
  closeModal();
  if(composing){announce('请先完成或保存正在编辑的邮件。');return;}
  composeReturn=document.activeElement;
  if(kind!=='forward') {
    scope=m.account;period='all';thread=threadKey(m);view='reader';render();
    const to=m.replyTo || m.from;
    const all=publicPeople(m).filter(x=>x!==to);
    startCompose({account:m.account,to,cc:kind==='reply-all'?all.join(', '):'',subject:`回复：${m.subject}`,references:m.mid,body:`\n\n引用 ${person(m.from)}：\n${m.body}`},'inline');
    return;
  }
  startCompose({account:m.account,subject:`转发：${m.subject}`,body:`\n\n转发自 ${person(m.from)}：\n${m.body}`,attachments:m.attachments || []});
}
function historyPage() {
  const draftPage=page==='drafts', rows=draftPage?store.drafts:store.jobs;
  if(!selectedHistory && rows.length) selectedHistory=rows[0].id;
  const selected=rows.find(x=>x.id===selectedHistory);
  main.innerHTML=`<div class="pad stack">
    <div class="row spread"><h1>${draftPage?'草稿':'发件箱'}</h1><div class="row">${button('返回邮件','module')}${button('草稿','drafts',{pressed:draftPage})}${button('发件箱','outbox',{pressed:!draftPage})}</div></div>
    <p class="muted">${draftPage?'本机保存的草稿 · 服务商 Drafts 单独管理。':'本机发送操作及结果 · 服务商 Sent 单独管理。'}</p>
    <div class="history-grid"><aside class="card stack" aria-label="${draftPage?'草稿列表':'发件操作'}">${rows.map(x=>button(`<strong>${e((draftPage?x.subject:x.draft.subject) || '未填写主题')}</strong><span class="sub">${e(draftPage?account(x.account)?.label || '待配置邮箱':jobMessage(x.status))}</span>`,'history',{id:x.id,kind:'item',current:x.id===selectedHistory})).join('') || '<p class="muted">这里还没有记录。</p>'}</aside>
    <article class="card stack" aria-label="当前记录">${selected ? historyDetail(selected,draftPage) : '<p class="muted">选择记录查看详情。</p>'}</article></div></div>`;
}
function historyDetail(selected,draftPage) {
  const item=draftPage?selected:selected.draft;
  const canRetry=!draftPage && !readonly && !offline && selected.results.some(x=>x.state==='failed');
  return `<h2>${e(item.subject || '未填写主题')}</h2><p class="sub">发件账号 · ${e(account(item.account)?.email || '需重新配置')}</p>
    <p class="mail-body">${e(item.body)}</p><div class="row">${item.attachments.map(a=>`<span class="badge">${e(a.name)} · ${a.owned?'受管附件':'待重绑'}</span>`).join('')}</div>
    ${draftPage?`<p>收件人 ${e(item.to || '未填写')}</p><div class="row">${button('继续编辑','resume',{id:selected.id})}${button('删除草稿','delete-history',{id:selected.id,kind:'danger',disabled:readonly})}</div>`:
    `<div class="row"><span class="badge">${e(jobMessage(selected.status))}</span></div>
    <ul>${selected.results.map(r=>`<li>${{to:'收件人',cc:'抄送',bcc:'密送（私有）'}[r.type]} · ${e(r.address)} · ${e(jobMessage(r.state))}</li>`).join('')}</ul>
    <div class="stack rule"><h3>投递尝试</h3>${selected.notes.map(note=>`<p class="sub">${e(note)}</p>`).join('')}</div>
    <div class="row">${canRetry ? button('重试明确未投递项','retry-send',{id:selected.id}) : ''}${selected.status==='unknown' ? button('核对投递记录','reconcile',{id:selected.id}) : ''}${button('删除本地记录','delete-history',{id:selected.id,kind:'danger',disabled:readonly})}</div>`}`;
}
function preset(name,email) {
  const row=providers.find(p=>p[0]===name) || providers.at(-1);
  let [,imap,smtp,auth,port]=row;
  if(name==='完美邮箱') {
    const suffix=email.split('@').at(-1)?.toLowerCase();
    if(['111.com','email.cn'].includes(suffix)) {imap=`imap.${suffix}`;smtp=`smtp.${suffix}`;}
  }
  return {provider:row[0],imap,smtp,auth,imapPort:993,smtpPort:port,imapSecurity:'TLS',smtpSecurity:port===587?'STARTTLS':'TLS'};
}
function beginAccount(id) {
  if(readonly){announce('只读 Vault，无法编辑账号。');return;}
  const existing=account(id);
  const defaults=preset(existing?.provider || providers[0][0],existing?.email || '');
  accountDraft={...defaults,label:'',email:'',send:true,...existing,checked:false,folders:existing?.folders || ['INBOX']};
  showAccount();
}
function readAccount() {
  const form=$('#account-form'), values=data(form);
  const {provider,label,email,auth,imap,smtp,imapPort,smtpPort,imapSecurity,smtpSecurity,credential}=values;
  Object.assign(accountDraft,{provider,label,email,auth,imap,smtp,imapPort,smtpPort,imapSecurity,smtpSecurity,credential,send:!!values.send});
  if(form.elements.folders) accountDraft.folders=new FormData(form).getAll('folders');
}
function serverFields(label,name,host,port,security) {
  return `<div class="server-row">${field(`${label} 主机`,name,host)}${field(`${label} 端口`,name+'Port',port,'type="number" min="1" max="65535"')}
    <label class="field"><span>安全模式</span><select name="${name}Security">${['TLS','STARTTLS','无加密'].map(x=>option(x,x,security)).join('')}</select></label></div>`;
}
function showAccount() {
  const d=accountDraft;
  const def=preset(d.provider,d.email);
  const auths=def.auth.includes('OAuth')?[def.auth,'应用密码']:[def.auth];
  const oauth=d.auth.includes('OAuth');
  showModal(d.id?'编辑邮箱':'添加邮箱',`<form id="account-form" class="stack" aria-labelledby="modal-title">
    <div class="pair"><div class="field"><label for="account-provider">邮箱提供商</label><select id="account-provider" name="provider">${providers.map(([p])=>option(p,p,d.provider)).join('')}</select></div>
    ${field('显示名称','label',d.label,'required')}</div>${field('邮箱地址','email',d.email,'type="email" required')}
    <label class="field"><span>认证方式</span><select name="auth">${auths.map(a=>option(a,a,d.auth)).join('')}</select></label>
    ${oauth?'':`<label class="field"><span>凭据操作</span><select name="credential">${[['keep','保留已配置凭据'],['replace','使用演示凭据'],['clear','清空凭据']].map(([v,l])=>option(v,l,d.credential || (d.id?'keep':'replace'))).join('')}</select></label>`}
    <details${d.provider==='自定义 IMAP/SMTP'?' open':''}><summary>收发服务器</summary><div class="stack">
      ${serverFields('IMAP','imap',d.imap,d.imapPort,d.imapSecurity)}
      <label class="row"><input type="checkbox" name="send"${d.send?' checked':''}>启用 SMTP 发送</label>
      ${serverFields('SMTP','smtp',d.smtp,d.smtpPort,d.smtpSecurity)}</div></details>
    <p class="sub">${oauth?'演示约定：在引擎所在设备打开授权浏览器。':'使用邮箱提供商的 '+e(d.auth)+'；本页使用固定演示凭据。'}</p>
    <div class="stack" id="connection">${connectionHtml(d,oauth)}</div>${err}
    <div class="row">${button('取消','account-cancel')}<button type="submit" class="primary" id="save-account"${!d.checked?' disabled':''}>保存邮箱</button></div></form>`,()=>{accountDraft=null;closeModal();});
  const form=$('#account-form');
  form.onchange=event=>{
    const key=event.target.name;
    if(key==='folders')return;
    const before=preset(d.provider,d.email);
    readAccount();
    if(key==='provider')Object.assign(d,preset(d.provider,d.email),{credential:d.id?'keep':'replace'});
    if(key==='email' && d.provider==='完美邮箱'){
      const next=preset(d.provider,d.email);
      if(d.imap===before.imap)form.elements.imap.value=d.imap=next.imap;
      if(d.smtp===before.smtp)form.elements.smtp.value=d.smtp=next.smtp;
    }
    if(!d.checked && !['provider','auth','credential'].includes(key))return;
    d.checked=false;
    if(['provider','auth','credential'].includes(key))showAccount();
    else {$('#connection').innerHTML=connectionHtml(d,oauth);$('#save-account').disabled=true;}
  };
  form.onsubmit=event=>{
    event.preventDefault();
    readAccount();
    const d=accountDraft;
    if(!d.checked)return;
    if(!d.auth.includes('OAuth') && !d.folders.includes('INBOX')) {modalError('请至少选择 INBOX。');return;}
    if(store.accounts.some(x=>x.id!==d.id && x.email.toLowerCase()===d.email.toLowerCase())) {modalError('这个邮箱已经在 Vault 中。');return;}
    const existing = account(d.id);
    const {checked,credential,...fields}=d;
    const a={...fields,id:d.id || crypto.randomUUID(),route:d.auth==='Google OAuth'?'Gmail history':'IMAP',status:'local'};
    if(existing)store.accounts.splice(store.accounts.indexOf(existing),1,a);else store.accounts.push(a);
    closeModal();
    accountDraft=null;
    scope=a.id;collapsed.delete(a.provider);view='contacts';render();
    sync(a.id);
  };
}
function connectionHtml(d, oauth) {
  if(!d.checked)return button(oauth?'模拟开始授权':'测试连接并发现文件夹','account-check');
  if(oauth)return '<p class="notice">授权完成 · 邮箱一致。此连接使用上游规定的 OAuth 文件夹流程。</p>';
  return `<fieldset class="card"><legend>已发现可同步目录</legend>
    ${['INBOX','Sent','Archive','历史目录（不可选择）'].map((name,i)=>`<label class="row"><input type="checkbox" name="folders" value="${name}"${d.folders.includes(name)?' checked':''}${i===3?' disabled':''}>${name}</label>`).join('')}</fieldset>`;
}
function testAccount() {
  const form=$('#account-form');
  if(!form.reportValidity())return;
  readAccount();
  const d=accountDraft;
  if(offline || fault('connect')) {modalError('连接超时。请检查主机、端口和连线后重试。');return;}
  if(!d.auth.includes('OAuth')) {
    if(!d.imap.trim() || !d.imapPort || (d.send && (!d.smtp.trim() || !d.smtpPort))) {modalError('请填写接收服务器；开启发送时也须填写 SMTP 服务器。');return;}
    if(d.credential==='clear'){
      if(!d.id){modalError('新账号需要配置凭据。');return;}
      confirmAction('清空该邮箱的本机凭据？','本地缓存保留，之后可在该邮箱重新配置认证。','清空凭据',()=>{
        account(d.id).status='repair';accountDraft=null;render();announce('本机凭据已清空，请重新配置。');
      });
      return;
    }
    d.checked=true;
    showAccount();
    return;
  }
  showModal('邮箱授权 · 演示',`<div class="stack">
    <p>将在引擎所在设备授权 ${e(d.email)}。本次授权只影响当前演示邮箱。</p>${err}
    <div class="row">${button('取消授权','oauth-back')}${button('模拟授权成功','oauth-grant',{kind:'primary'})}${button('模拟超时','oauth-timeout')}</div></div>`,()=>{showAccount();modalError('已取消授权，可重新开始。');});
}
function settingsPage() {
  const p=store.prefs;
  main.innerHTML=`<div class="pad settings stack">
    <div class="row spread"><h1>邮件设置</h1>${button('返回邮件','module')}</div>
    <section class="card stack"><h2 id="sync-settings-title">同步</h2><form class="row" id="sync-settings" aria-labelledby="sync-settings-title">
      <label>检查间隔 <select name="interval">${[5,15,30,60].map(n=>option(String(n),`${n} 分钟`,String(p.interval))).join('')}</select></label><button type="submit"${readonly?' disabled':''}>保存间隔</button></form>
      <p class="sub">演示设置会更新下次检查的间隔；可用刷新按钮立即演练。</p>
      ${store.accounts.map(a=>`<p>${e(a.label)} · ${e(a.route)} · ${labels[a.status]}${a.provider.includes('Outlook')?' · 当前使用 IMAP':' '}</p>`).join('')}
    </section>
    <section class="card stack"><h2 id="ai-title">邮件 AI</h2>
      <form id="ai-settings" class="stack" aria-labelledby="ai-title">
        <label class="row"><input type="checkbox" name="ai"${p.ai?' checked':''}>启用 AI</label>
        ${field('目标服务地址','endpoint',p.endpoint,'type="url" required')}
        <div class="pair"><label class="field"><span>Key 操作</span><select name="keyMode"><option value="keep">保留</option><option value="replace">替换</option><option value="clear">清除</option></select></label>${field('演示 Key','secret','','type="password" autocomplete="off"')}</div>
        <p class="sub">当前 Key ${p.key?'已配置':'未配置'} · 本地回环支持 HTTP，远端必须使用 HTTPS。</p>
        <div id="settings-error" class="error" role="alert"></div><div class="row"><button type="submit"${readonly?' disabled':''}>保存 AI 设置</button>${button('验证服务','test-ai')}${button('选择内容演练','ai-content',{disabled:!p.ai})}</div>
      </form>
    </section>
    <section class="card stack"><h2>备份与数据</h2><p>${e(store.vault)} · ${store.backups.length} 份演示备份</p><p class="sub">草稿、发件结果和受管附件进入备份；恢复后需要配置本机认证。</p>
      <div class="row">${button('创建 Mail 备份','backup')}${button('预检并恢复','restore',{disabled:readonly || !store.backups.length})}${button('重建搜索索引','reindex')}</div>
    </section></div>`;
  $('#sync-settings').onsubmit=event=>{
    event.preventDefault();
    if(readonly)return;
    store.prefs.interval=Number(data(event.target).interval);scheduleSync();announce(`已保存检查间隔 · ${store.prefs.interval} 分钟`);
  };
  $('#ai-settings').onsubmit=event=>{
    event.preventDefault();
    if(readonly)return;
    const v=data(event.target);
    const feedback=$('#settings-error');
    let endpoint;
    try { endpoint=new URL(v.endpoint); }
    catch { feedback.textContent='请填写完整的服务地址。';return; }
    const loopback=['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname);
    if((endpoint.protocol!=='https:' && !(loopback && endpoint.protocol==='http:')) || endpoint.username || endpoint.password) {
      feedback.textContent='请填写不含凭据的 HTTPS 地址，或本地回环 HTTP 地址。';return;
    }
    if(v.keyMode==='replace' && !v.secret){feedback.textContent='请填写演示 Key。';return;}
    const key=loopback ? false : v.keyMode==='keep' ? p.key : v.keyMode==='replace';
    if(v.ai && !loopback && !key){feedback.textContent='远端服务需要配置演示 Key。';return;}
    store.prefs={...p,ai:!!v.ai,endpoint:v.endpoint,key};render();announce('已保存邮件 AI 设置');
  };
}
function aiContent() {
  const choices=visibleMessages().filter(m=>!m.sent).slice(0,6);
  showModal('选择交给 AI 的内容',`<form class="stack" id="ai-content" aria-labelledby="modal-title">
    <p>目标服务 · ${e(store.prefs.endpoint)}</p>
    <div class="field"><label for="ai-message">邮件</label><select name="message" id="ai-message">${choices.map(m=>option(m.id,m.subject)).join('')}</select></div>
    <div class="field"><label for="ai-mode">操作</label><select name="mode" id="ai-mode">${['总结','提取待办','起草回复','对话'].map(x=>option(x,x)).join('')}</select></div>
    <div id="ai-preview" class="notice"></div>${err}
    <div class="row">${button('取消','close-modal')}<button class="primary" type="submit"${choices.length?'':' disabled'}>同意使用所示内容</button></div></form>`);
  const form=$('#ai-content');
  function preview(){const m=choices.find(x=>x.id===form.elements.message.value);$('#ai-preview').textContent=m?.body || '暂无可选邮件';}
  form.onchange=preview;preview();
  form.onsubmit=event=>{
    event.preventDefault();
    if(fault('ai') || offline){modalError('演示服务暂不可用，原邮件与选择已保留。');return;}
    const v=data(form), m=choices.find(x=>x.id===v.message);
    const result={总结:`关于「${m.subject}」的往来，发件人请核对邮件中的安排。`,提取待办:'核对日期、负责人与所需材料。',起草回复:'您好，收到。我会核对安排与材料，确认后回复。',对话:'可以先根据邮件核对时间，再询问发件人缺少的信息。'}[v.mode];
    approvedAI={account:m.account,to:m.from,subject:`回复：${m.subject}`,body:result};
    showModal('AI 演示结果',`<div class="stack"><p>${e(result)}</p><div class="row">${button('返回','close-modal')}${v.mode==='起草回复'?button('采纳为草稿','ai-draft',{kind:'primary',disabled:readonly}):''}</div></div>`);
  };
}
function resetNav() {
  page='mail';scope='all';period='today';view='accounts';thread='';target='';selectedHistory='';visibleCount=6;
}
function resetVisual() {
  observer?.disconnect();clearTimeout(searchTimer);
  for(const a of store.accounts)if(a.status==='syncing')a.status='local';
  bodyState=new Map();remoteRead=new Map();disclosure=new Set();plaintext=new Set();imageAllowed=new Set();
  collapsed.clear();
  closeModal();clearCompose();
  resetNav();
}
function render() {
  if(composing)readCompose();
  observer?.disconnect();
  $('#crumb').textContent={mail:'邮件',settings:'邮件设置',drafts:'草稿',outbox:'发件箱'}[page];
  if(page==='mail')mailPage();
  else if(page==='settings')settingsPage();
  else historyPage();
  renderCompose();
}
function jumpLatest() {
  const list=$('#thread-messages');
  if(list)list.scrollTop=list.scrollHeight;
}
const actions={
  module:()=>changePage('mail'),settings:()=>changePage('settings'),
  drafts:()=>changePage('drafts'),outbox:()=>changePage('outbox'),
  'select-account':id=>{
    scope=id;if(id!=='all')collapsed.delete(account(id).provider);
    view='contacts';thread='';target='';visibleCount=6;render();
    const focus=matchMedia('(max-width: 820px)').matches?$('#contacts-title'):$(`[data-action="select-account"][data-id="${id}"]`);
    focus?.focus();
  },
  'back-accounts':()=>{view='accounts';render();$(`[data-action="select-account"][data-id="${scope}"]`)?.focus();},
  'select-thread':id=>{thread=id;target='';view='reader';render();jumpLatest();$('#reader-title')?.focus({preventScroll:true});},
  'back-contacts':()=>{view='contacts';render();($$('[data-action="select-thread"]').find(el=>el.dataset.id===thread) || $('#contacts-title'))?.focus();},
  more:()=>{visibleCount+=6;render();},
  search:openSearch,'search-more':()=>{maxSearch+=8;renderSearch();},locate,
  latest:jumpLatest,
  'notification-demo':()=>{
    if(store.messages.some(m=>m.id==='p1'))locate('p1');else announce('通知关联的样例邮件已不可用。');
  },
  'copy-address':async id=>{
    try{await navigator.clipboard.writeText(id.split('|').join(', '));announce('已复制公开联系人邮箱');}
    catch{announce('无法使用剪贴板。可手动选中显示的邮箱地址。');}
  },
  'retry-body':id=>loadBody(store.messages.find(x=>x.id===id)),
  mark:id=>markRead(store.messages.find(x=>x.id===id)),
  'expand-body':id=>{
    if(disclosure.has(id))disclosure.delete(id);else disclosure.add(id);
    refreshMessage(store.messages.find(x=>x.id===id));
    $(`[data-action="expand-body"][data-id="${id}"]`).focus();
  },
  'text-mode':id=>{
    if(plaintext.has(id))plaintext.delete(id);else plaintext.add(id);
    refreshMessage(store.messages.find(x=>x.id===id));
    $(`[data-action="text-mode"][data-id="${id}"]`).focus();
  },
  image:id=>{imageAllowed.add(id);refreshMessage(store.messages.find(x=>x.id===id));announce('已放行本封的模拟图片');},
  raw:showRaw,reply:id=>reply(id,'reply'),'reply-all':id=>reply(id,'reply-all'),forward:id=>reply(id,'forward'),
  'new-topic':id=>{composeReturn=document.activeElement;startCompose({to:id.split('|').join(', ')});},
  compose:()=>{composeReturn=document.activeElement;startCompose();},
  'expand-compose':()=>{readCompose();expanded=!expanded;renderCompose();$('[data-action="expand-compose"]').focus();},
  'close-compose':composeClose,'draft-save':()=>saveDraft(),
  'discard-compose':()=>{readCompose();confirmAction('丢弃当前编辑？','已保存版本会保留在草稿中。','丢弃本次编辑',()=>{clearCompose();announce('已丢弃本次编辑');});},
  attach:()=>{
    readCompose();
    if(composing.attachments.some(a=>a.name===fileSample.name && a.owned)){composeFeedback('该示例附件已添加。');return;}
    composing.attachments=composing.attachments.filter(a=>a.name!==fileSample.name);
    composing.attachments.push(fileSample);composeError='';renderCompose();$('[data-action="attach"]').focus();
  },
  'remove-file':id=>{readCompose();composing.attachments=composing.attachments.filter(x=>x.name!==id);composeError='';renderCompose();$('[data-action="attach"]').focus();},
  format:id=>{
    readCompose();
    const input=$('#compose-form textarea'), start=input.selectionStart,end=input.selectionEnd;
    const selection=input.value.slice(start,end);
    const apply=value=>{
      composing.body=input.value.slice(0,start)+value+input.value.slice(end);
      composing.format='rich';renderCompose();const body=$('#compose-form textarea');body.focus();body.setSelectionRange(start+value.length,start+value.length);
    };
    if(id==='bold'){apply(`**${selection || '重点文字'}**`);return;}
    showModal('添加正文链接',`<form class="stack" id="link-form" aria-labelledby="modal-title">${field('链接文字','label',selection,'required')}${field('链接地址','url','https://example.test/','type="url" required')}<div class="row">${button('取消','close-modal')}<button class="primary" type="submit">插入链接</button></div></form>`);
    $('#link-form').onsubmit=event=>{
      event.preventDefault();
      const v=data(event.target);
      const url=new URL(v.url);
      if(!['http:','https:'].includes(url.protocol)){event.target.elements.url.setCustomValidity('请输入 HTTP 或 HTTPS 地址');event.target.reportValidity();return;}
      closeModal();apply(`[${v.label}](${v.url})`);
    };
    $('#link-form').elements.url.oninput=event=>event.target.setCustomValidity('');
  },
  'set-text':()=>{readCompose();composing.format='text';renderCompose();$('[data-action="set-text"]').focus();},
  history:id=>{selectedHistory=id;render();$(`[data-action="history"][data-id="${id}"]`)?.focus();},
  resume:id=>{composeReturn=document.activeElement;startCompose(store.drafts.find(x=>x.id===id));},
  'delete-history':id=>{
    if(readonly)return;
    const isDraft=page==='drafts';
    confirmAction(isDraft?'删除草稿':'删除本地发件记录','操作仅影响本演示的本机记录。','确认删除',()=>{
      const key=isDraft?'drafts':'jobs';store[key]=store[key].filter(x=>x.id!==id);selectedHistory='';render();announce('本地记录已删除');
    });
  },
  'retry-send':id=>{
    const job=store.jobs.find(x=>x.id===id), a=account(job.draft.account);
    if(offline || readonly || !a?.send || a.status==='repair'){announce('目前无法投递，请恢复连接和邮箱认证。');return;}
    attempt(job,job.results.filter(x=>x.state==='failed'));render();announce(jobMessage(job.status));
  },
  reconcile:id=>{
    const job=store.jobs.find(x=>x.id===id);
    showModal('核对结果未知的投递',`<div class="stack"><p>请核对服务商 Sent、收件方反馈及投递日志。仅可重试已明确未投递的收件人。</p><p>演示：本次缺少可确认的远端记录，保留「结果未知」。</p><p class="sub">对应本机投递编号 · ${e(job.id)}</p>${button('返回发件箱','close-modal')}</div>`);
  },
  sync,'sync-close':id=>{closeModal();sync(id);},'add-account':()=>beginAccount(),'edit-account':beginAccount,
  'account-cancel':()=>{accountDraft=null;closeModal();},'account-check':testAccount,
  'oauth-back':()=>{showAccount();modalError('已取消授权，可重新开始。');},
  'oauth-timeout':()=>{showAccount();modalError('授权已超时，请重新开始。');},
  'oauth-grant':()=>{
    if(fault('oauth')){showAccount();modalError('服务商拒绝了授权，请重试。');return;}
    accountDraft.checked=true;showAccount();
  },
  'delete-account':id=>{
    if(readonly){announce('只读 Vault，无法删除账号。');return;}
    const a=account(id), drafts=store.drafts.filter(x=>x.account===id), jobs=store.jobs.filter(x=>x.draft.account===id);
    confirmAction('删除本地邮箱',`「${e(a.label)}」的配置、缓存、认证、${drafts.length} 份草稿和 ${jobs.length} 条发件记录将被移除。服务商邮箱及其他邮箱保留。`,'删除此邮箱',()=>{
      if(composing?.account===id)clearCompose();
      store.accounts=store.accounts.filter(x=>x.id!==id);store.messages=store.messages.filter(x=>x.account!==id);
      store.drafts=store.drafts.filter(x=>x.account!==id);store.jobs=store.jobs.filter(x=>x.draft.account!==id);
      resetNav();render();announce('已删除该邮箱的本地资料');
    });
  },
  backup:()=>{
    const snap=structuredClone(store);
    delete snap.backups;
    snap.accounts.forEach(a=>a.status='repair');
    snap.prefs.key=false;
    store.backups.push(snap);render();announce(`已创建备份 ${store.backups.length} · 配置、草稿、附件与投递记录`);
  },
  restore:()=>{
    showModal('预检邮件备份',`<form class="stack" id="restore-mail" aria-labelledby="modal-title"><label class="field"><span>备份</span><select name="backup">${store.backups.map((_,i)=>option(String(i),`Mail 演示备份 ${i+1}`)).join('')}</select></label>
      <p class="sub">恢复到新的演示 Vault。恢复保留投递记录，发件箱由用户主动继续处理。</p>${err}<div id="preflight" class="notice" hidden></div>
      <div class="row">${button('取消','close-modal')}<button type="submit">运行预检</button>${button('恢复备份','apply-backup',{kind:'primary',disabled:true})}</div></form>`);
    const form=$('#restore-mail');
    form.onchange=()=>{$('[data-action="apply-backup"]').disabled=true;$('#preflight').hidden=true;};
    form.onsubmit=event=>{
      event.preventDefault();
      const restore=$('[data-action="apply-backup"]'), preflight=$('#preflight');
      restore.disabled=true;preflight.hidden=true;
      if(fault('backup')){modalError('备份校验失败，目标 Vault 未变更。可重新预检。');return;}
      modalError('');
      const snap=store.backups[Number(data(form).backup)];
      preflight.hidden=false;preflight.textContent=`预检通过 · ${snap.accounts.length} 个邮箱需重授权 · ${snap.drafts.length} 份草稿 · ${snap.jobs.length} 条发件记录`;
      restore.disabled=false;
    };
  },
  'apply-backup':()=>{
    const snap=store.backups[Number(data($('#restore-mail')).backup)];
    const backups=store.backups;
    resetVisual();store={...structuredClone(snap),backups,vault:'Mail 恢复演示 Vault'};
    page='settings';scheduleSync();render();announce('已恢复到新的演示 Vault，请重新配置各邮箱认证。');
  },
  reindex:()=>{
    if(readonly){announce('只读 Vault，无法重建搜索索引。');return;}
    bodyState=new Map();announce(`已重建演示搜索索引 · ${visibleMessages().length} 封缓存邮件`);
  },
  'test-ai':()=>announce(offline || fault('ai')?'演示服务暂不可用，请重试。':'目标配置检查成功 · 模拟服务可用'),
  'ai-content':aiContent,'ai-draft':()=>{
    if(composing){announce('请先完成或保存正在编辑的邮件。');return;}
    closeModal();startCompose(approvedAI);
    if(saveDraft(true))changePage('drafts');
  },
  offline:(_,el)=>{offline=!offline;el.setAttribute('aria-pressed',String(offline));render();announce(offline?'已进入离线演示':'已恢复在线；可刷新或继续手动发送。');},
  readonly:(_,el)=>{readonly=!readonly;el.setAttribute('aria-pressed',String(readonly));render();announce(readonly?'已切换为只读 Vault':'已恢复可写 Vault');},
  restart:()=>{resetVisual();changePage(store.jobs.length?'outbox':'mail');announce('模拟重启完成。已保存的草稿和投递结果仍可查询。');},
  reset:()=>{
    resetVisual();store=fixture();offline=false;readonly=false;columnWidth=240;
    $('[data-action="offline"]').setAttribute('aria-pressed','false');$('[data-action="readonly"]').setAttribute('aria-pressed','false');
    $('#fault').value='';scheduleSync();render();announce('已重置邮件演示');
  }
};
document.addEventListener('keydown',event=>{
  if(event.isComposing)return;
  if((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='k' && !modal.open) {event.preventDefault();openSearch();}
  if(event.key==='Escape' && composing && !modal.open && event.target.closest('#compose-form')) {event.preventDefault();composeClose();}
});
render();
scheduleSync();
