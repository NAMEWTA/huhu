const currencyDigits = { CNY:2, TWD:2, USD:2, JPY:0 };
const currencyChoices = Object.keys(currencyDigits);
const ledgerDay = "2026-11-25";
const labels = { income:"收入", expense:"支出", transfer:"转账" };
const ledger = { books:[], active:null, readOnly:false, fault:"ok", selected:null, focusIds:null, filter:{ type:"", from:"", to:"", currency:"", query:"" } };
const bookNow = () => ledger.books.find((book) => book.id === ledger.active) ?? null;
const labelAccount = (book,id) => book.accounts.find((account)=>account.id===id)?.name ?? "原账户已缺失";
const booking = (title,amount,type,account,date=ledgerDay) => ({id:crypto.randomUUID(),title,amount:String(amount),type,account,date,currency:"CNY",category:type==="income"?"退款与补贴":"日常开支",memo:""});

function minor(text,currency) {
  const scale = currencyDigits[currency];
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match || text.length>34 || scale===undefined || (match[2]?.length??0)>scale) return null;
  const value=BigInt(match[1]+(match[2]??"").padEnd(scale,"0"));
  return value>0n?value.toString():null;
}

function money(amount,currency) {
  const scale=currencyDigits[currency]??2, units=BigInt(amount), sign=units<0n?"−":"";
  const digits=(units<0n?-units:units).toString().padStart(scale+1,"0");
  const main=scale?digits.slice(0,-scale):digits;
  return `${currency} ${sign}${main.replace(/\B(?=(\d{3})+(?!\d))/g,",")}${scale?"."+digits.slice(-scale):""}`;
}

function makeBook(title,currency,zone,account) {
  return { id:crypto.randomUUID(),title,currency,zone,revision:1,
    accounts:[{id:"primary",name:account,currency,base:"0",state:"active"}],rows:[],offsets:[],imports:new Set(),periods:new Set() };
}

function loadSample() {
  const book=makeBook("北岸日常账本","CNY","Asia/Taipei","银行账户");
  book.accounts[0].base="65000";
  book.accounts.push({id:"cash",name:"现金",state:"active",currency:"CNY",base:"10000"},{id:"travel",name:"旅费卡",state:"active",currency:"JPY",base:"5200"});
  book.rows=[
    booking("退还工作坊押金","6000","income","primary"),
    booking("退还工作坊资料费","4000","income","cash"),
    booking("工作坊报名","10000","expense","primary","2026-11-24"),
    booking("购置纸笔","4200","expense","cash","2026-11-24"),
    booking("研究经费到账","280000","income","primary","2026-11-22"),
    booking("差旅餐费","850","expense","travel","2026-11-20"),
  ];
  book.rows.at(-1).currency="JPY";
  ledger.books.push(book);ledger.active=book.id;renderShell();
}

function balances(book) {
  return book.accounts.map((account)=>{
    let balance=BigInt(account.base);
    for(const row of book.rows){
      if(row.account===account.id)balance+=(row.type==="income"?1n:-1n)*BigInt(row.amount);
      if(row.type==="transfer"&&row.to===account.id)balance+=BigInt(row.toAmount);
    }
    return { ...account,balance };
  });
}

function finance(book,rows,currency) {
  const offsetMembers=new Set(book.offsets.flatMap((group)=>group.members));
  return rows.reduce((s,row)=>{
    if(row.currency===currency&&!offsetMembers.has(row.id))s[row.type]+=BigInt(row.amount);
    return s;
  },{ income:0n,expense:0n,transfer:0n });
}

function bookBar() {
  return `<div class="book-toolbar bar">${field("当前账本",`<select id="book-switch"><option value="">选择账本</option>${ledger.books.map((book)=>option(book.id,book.title,ledger.active)).join("")}</select>`)}
   ${button("新建账本",{name:"Plus",attrs:ledger.readOnly?"id=book-new disabled":"id=book-new"})}</div>`;
}

function pane(title,description,content,actions="") {
  main.innerHTML=`<div class="module-container stack">${heading(title,description,actions)}${bookBar()}${ledger.readOnly?'<p class="notice warn">当前 Vault 为只读。可查看账本和预览，不能提交。</p>':""}${content}</div>`;
  bind("book-new",bookDialog);
  by("#book-switch").onchange=(event)=>{
    ledger.active=event.target.value||null;ledger.focusIds=null;ledger.selected=null;ledger.filter={type:"",from:"",to:"",currency:"",query:""};renderShell();
  };
}

function missing(title) {
  if(bookNow())return false;
  pane(title,"",`<section class="card stack empty-state"><h2>还没有账本</h2><p>先建立账本，选择业务时区和第一项资金账户。</p>
  <div>${button("创建第一个账本",{name:"Plus",className:"primary",attrs:ledger.readOnly?"id=empty-create disabled":"id=empty-create"})}</div></section>`);
  bind("empty-create",bookDialog);
  return true;
}

function takeFault(expected) {
  if(ledger.fault!==expected)return false;
  ledger.fault="ok";by('[data-demo="fault"]').value="ok";return true;
}

function bookDialog() {
  if(ledger.readOnly)return;
  const dialog=modal("创建账本",`<form class="dialog-form"><div class="dialog-body stack">
    ${field("账本名称",'<input name="name" maxlength="100" required autofocus>')}
    ${field("默认币种",`<select name="currency">${currencyChoices.map((value)=>option(value,value,"CNY")).join("")}</select>`)}
    ${field("业务时区",`<select name="zone">${["Asia/Taipei","Asia/Shanghai","America/New_York","UTC"].map((value)=>option(value,value,"Asia/Taipei")).join("")}</select>`)}
    ${field("首个资金账户",'<input name="account" required placeholder="例如银行账户">')}
    <p class="meta">账本始终以保存的业务时区归集日期。</p><p class="notice err" id="book-error" hidden role="alert"></p>
    </div><footer class="dialog-footer"><button type="button" data-close>取消</button><button type="submit" class="primary">创建账本</button></footer></form>`);
  by("form",dialog).onsubmit=(event)=>{
    event.preventDefault();
    const form=Object.fromEntries(new FormData(event.currentTarget));
    const title=form.name.trim();
    const error=by("#book-error",dialog);
    if(!title||!form.account.trim()||ledger.books.some((value)=>value.title===title)){
      error.textContent="请输入新的账本名以及资金账户。";error.hidden=false;return;
    }
    if(takeFault("write")){error.textContent="写入失败，表单已保留。";error.hidden=false;return;}
    const book=makeBook(title,form.currency,form.zone,form.account.trim());
    ledger.books.push(book);ledger.active=book.id;
    dialog.close();openPage("overview");setStatus("账本已创建。");
  };
}

function accountDialog() {
  const book=bookNow();
  if(ledger.readOnly)return;
  const dialog=modal("新增资金账户",`<form class="dialog-form"><div class="dialog-body stack">
    ${field("账户名称",'<input name="name" required autofocus>')}
    ${field("账户币种",`<select name="currency">${currencyChoices.map((currency)=>option(currency,currency,book.currency)).join("")}</select>`)}
    ${field("账户类型",'<select name="kind"><option>银行账户</option><option>现金</option><option>信用卡</option><option>电子钱包</option></select>')}
    ${field("期初余额",'<input name="balance" inputmode="decimal" value="0" required>')}
    <p class="notice err" id="account-error" hidden role="alert"></p></div>
    <footer class="dialog-footer"><button type="button" data-close>取消</button><button type="submit" class="primary">保存账户</button></footer></form>`);
  by("form",dialog).onsubmit=(event)=>{
    event.preventDefault();
    const value=Object.fromEntries(new FormData(event.currentTarget));
    const raw=value.balance.trim();
    const unsigned=raw.startsWith("-")?raw.slice(1):raw;
    const balance=/^0(?:\.0+)?$/.test(unsigned)?"0":minor(unsigned,value.currency);
    if(balance===null||!value.name.trim()){
      const slot=by("#account-error",dialog);slot.hidden=false;slot.textContent="检查账户名称和币种精度。";return;
    }
    book.accounts.push({id:crypto.randomUUID(),name:value.name.trim(),currency:value.currency,base:raw.startsWith("-")&&balance!=="0"?"-"+balance:balance,state:"active",kind:value.kind});
    book.revision++;dialog.close();showOverview();
  };
}

function newRecordButton() {
  return button("记一笔",{name:"Plus",className:"primary",attrs:ledger.readOnly?"id=add-record disabled":"id=add-record"});
}

function showOverview() {
  if(missing("账本总览"))return;
  const book=bookNow(), totals=finance(book,book.rows.filter((row)=>row.date.startsWith(ledgerDay.slice(0,7))),book.currency);
  pane("账本总览",escapeHtml(book.title)+" · "+escapeHtml(book.zone),`<div class="metric-grid">
    ${[["本月收入",totals.income],["本月支出",totals.expense],["本月净收入",totals.income-totals.expense]].map(([label,amount])=>`<section class="card metric"><small>${label}</small><strong>${money(amount,book.currency)}</strong></section>`).join("")}</div>
    <div class="two-up"><section class="card stack"><div class="bar"><h2>最近流水</h2>${button("全部流水",{className:"small quiet",attrs:'data-route="records"'})}</div>
    ${book.rows.length?`<ul class="list">${book.rows.slice(0,5).map((row)=>`<li class="bar"><span>${escapeHtml(row.title)}</span><code>${money(row.amount,row.currency)}</code></li>`).join("")}</ul>`:'<p class="empty">还没有流水。</p>'}</section>
    <section class="card stack"><div class="bar"><h2>账户余额</h2>${button("新增账户",{name:"Plus",className:"small",attrs:ledger.readOnly?"id=account-add disabled":"id=account-add"})}</div>
    <ul class="list">${balances(book).map((account)=>`<li class="bar"><span>${escapeHtml(account.name)}</span><code data-book-balance="${account.id}">${money(account.balance,account.currency)}</code></li>`).join("")}</ul>
    </section></div>`,newRecordButton());
  bind("add-record",()=>recordDialog());bind("account-add",accountDialog);
}

function recordDialog(row=null) {
  const book=bookNow();
  if(ledger.readOnly)return;
  const dialog=modal(row?"编辑流水":"记一笔",`<form class="dialog-form"><div class="dialog-body form-container">
    <div class="form-grid"><div class="stack">
    ${field("事项",`<input name="title" required value="${escapeHtml(row?.title??"")}" autofocus>`)}
    ${field("交易类型",`<select name="type">${Object.entries(labels).map(([key,label])=>option(key,label,row?.type??"expense")).join("")}</select>`)}
    ${field("资金账户",`<select name="account">${book.accounts.map((account)=>option(account.id,account.name,row?.account)).join("")}</select>`)}
    ${field("金额",`<input name="amount" inputmode="decimal" required value="${row?money(row.amount,row.currency).split(" ")[1]?.replaceAll(",",""):""}">`)}
    <div class="stack" id="transfer-fields" hidden>
      ${field("转入账户",`<select name="to"><option value="">请选择</option>${book.accounts.map((account)=>option(account.id,account.name,row?.to)).join("")}</select>`)}
      ${field("转入实际金额",`<input name="toAmount" inputmode="decimal" value="${row?.toAmount?money(row.toAmount,row.toCurrency).split(" ")[1]?.replaceAll(",",""):""}">`)}
    </div>
    </div><aside class="stack">
    ${field("业务日期",`<input name="date" required type="date" value="${row?.date??ledgerDay}">`)}
    ${field("分类",`<select name="category">${["日常开支","交通","差旅","退款与补贴","工作收入","未分类"].map((item)=>option(item,item,row?.category)).join("")}</select>`)}
    ${field("备注",`<textarea name="memo" rows="4">${escapeHtml(row?.memo??"")}</textarea>`)}
    <p class="meta">账本时区 ${book.zone}</p></aside></div>
    <p class="notice err" id="record-error" role="alert" hidden></p>
    </div><footer class="dialog-footer"><button type="button" data-close>取消</button><button type="submit" class="primary">保存流水</button></footer></form>`,{wide:true});
  const form=by("form",dialog), snap=book.revision;
  const update=()=>{by("#transfer-fields",dialog).hidden=form.elements.type.value!=="transfer";};
  form.elements.type.onchange=update;update();
  form.onsubmit=(event)=>{
    event.preventDefault();
    const data=Object.fromEntries(new FormData(form));
    const account=book.accounts.find(({id})=>id===data.account);
    const transferTo=book.accounts.find(({id})=>id===data.to);
    const amount=minor(data.amount,account?.currency);
    const toAmount=data.type==="transfer"&&transferTo?minor(data.toAmount|| (transferTo.currency===account.currency?data.amount:""),transferTo.currency):null;
    let problem=!data.title.trim()?"请填写事项。":!amount?"金额必须是该账户币种可精确表示的正数。":"";
    if(!problem&&data.type==="transfer"&&(!transferTo||transferTo===account||!toAmount))problem="选择两个不同账户，并填写转入端金额。";
    if(!problem&&data.type==="transfer"&&transferTo?.currency===account.currency&&amount!==toAmount)problem="同币种转账两端金额应相同。";
    if(row&&book.offsets.some(({members})=>members.includes(row.id)))problem="这条流水已平账。请先撤销整组平账。";
    if(takeFault("write"))problem="保存失败，当前输入已保留。";
    if(book.revision!==snap||ledger.active!==book.id)problem="账本已变化，需要在当前版本重新打开。";
    if(problem){const slot=by("#record-error",dialog);slot.hidden=false;slot.textContent=problem;return;}
    const record={...data,title:data.title.trim(),id:row?.id??crypto.randomUUID(),amount,currency:account.currency,toAmount,toCurrency:transferTo?.currency};
    if(row)Object.assign(row,record);else book.rows.unshift(record);
    book.revision++;ledger.selected=record.id;dialog.close();openPage("records");setStatus("流水已保存。");
  };
}

function visibleRows(book) {
  const {query,from,to,type,currency}=ledger.filter;
  return book.rows.filter((row)=>(!query||[row.title,row.memo,row.category].join(" ").includes(query))&&(!from||row.date>=from)&&(!to||row.date<=to)&&(!type||row.type===type)&&(!currency||row.currency===currency)&&(!ledger.focusIds||ledger.focusIds.includes(row.id)));
}

function showRecords() {
  if(missing("流水"))return;
  const book=bookNow(), f=ledger.filter;
  pane("流水",escapeHtml(book.title),`<div class="record-filters">
    ${field("搜索流水",`<input id="record-query" type="search" value="${escapeHtml(f.query)}">`)}
    ${field("从",`<input id="record-from" type="date" value="${f.from}">`)}
    ${field("至",`<input id="record-to" type="date" value="${f.to}">`)}
    ${field("类型",`<select id="record-type">${option("","全部类型",f.type)}${Object.entries(labels).map(([key,label])=>option(key,label,f.type)).join("")}</select>`)}
    ${button("清除筛选",{className:"small",attrs:"id=clear-record"})}
    </div><section class="card" id="record-table"></section>`,button("导入账单",{name:"Plus",attrs:'data-route="import"'})+newRecordButton());
  const paint=()=>{
    const rows=visibleRows(book);
    by("#record-table").innerHTML=`<div class="directory-head bar"><h2>流水明细</h2><small>${rows.length} 笔</small></div>
      ${rows.length?`<ul class="list record-list">${rows.map((row)=>`<li class="bar">
        <div><strong>${escapeHtml(row.title)}</strong><p class="meta">${row.date} · ${labels[row.type]} · ${escapeHtml(labelAccount(book,row.account))}${row.type==="transfer"?" → "+escapeHtml(labelAccount(book,row.to)):""}</p></div>
        <div class="row"><code>${money(row.amount,row.currency)}</code>${row.type==="transfer"?`<small>→ ${money(row.toAmount,row.toCurrency)}</small>`:""}
        ${book.offsets.some(({members})=>members.includes(row.id))?badge("已平账","info"):""}${button("编辑",{className:"small",aria:`编辑 ${row.title}`,attrs:`data-record="${row.id}" ${ledger.readOnly?"disabled":""}`})}</div>
        </li>`).join("")}</ul>`:`<p class="empty">${book.rows.length?"没有匹配的流水。":"尚未记录流水。"}</p>`}`;
    all("[data-record]").forEach((entry)=>entry.onclick=()=>recordDialog(book.rows.find(({id})=>id===entry.dataset.record)));
  };
  by("#record-query").oninput=(event)=>{f.query=event.target.value;paint();};
  for(const name of ["from","to","type"])by(`#record-${name}`).onchange=(event)=>{f[name]=event.target.value;paint();};
  bind("clear-record",()=>{ledger.focusIds=null;ledger.filter={type:"",from:"",to:"",currency:"",query:""};showRecords();});
  bind("add-record",()=>recordDialog());paint();
}

const csvDemo = "日期,事项,金额,类型,账户\n2026-11-24,购置纸笔,42.00,支出,现金\n2026-11-24T16:30:00Z,展览物料,28.50,支出,银行账户\n2026-11-25,无效金额,1.2.3,支出,银行账户\n2026-11-25,信用卡还款,120,转账,银行账户\n2026-11-25,公交交通,3.25,支出,改为备用金";
const importColumns = { date:"日期列",title:"事项列",amount:"金额列",type:"收支类型列",account:"账户列" };

function importDay(value,sourceZone,bookZone) {
  if(/^\d{4}-\d\d-\d\d$/.test(value)){
    return !Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;
  }
  if(!/(Z|[+-]\d\d:\d\d)$/.test(value))return null;
  const instant=Date.parse(value);
  if(!Number.isFinite(instant))return null;
  const pieces=(zone)=>Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(instant).map(({type,value})=>[type,value]));
  const result=pieces(bookZone);
  const original=pieces(sourceZone);
  return { date:`${result.year}-${result.month}-${result.day}`, source:`${original.year}-${original.month}-${original.day}` };
}

function reportImport(book,rows,digest,snap,dialog,showAgain) {
  const lookup = new Map(book.accounts.map((account)=>[account.id,account]));
  const render=()=>{
    by("#import-preview",dialog).innerHTML=`<div class="row">${badge(`识别 ${rows.filter((row)=>!row.issue).length}`,"ok")}
      ${badge(`待决 ${rows.filter(({issue})=>Boolean(issue)).length}`,"warn")}${badge(`疑似重复 ${rows.filter(({duplicate})=>duplicate).length}`)}</div>
      <ul class="list import-list">${rows.map((row)=>`<li class="stack"><div class="bar"><label class="check"><input type="checkbox" data-import-select="${row.line}" ${row.selected?"checked":""} ${row.issue||row.imported?"disabled":""}>
      <span>第 ${row.line} 行 · ${escapeHtml(row.title||"未识别事项")}</span></label>${row.imported?badge("已提交"):row.issue?badge(row.issue,"warn"):row.duplicate?badge("疑似重复","warn"):""}</div>
      <div class="meta">${escapeHtml(row.date)} ${row.amount?money(row.amount,row.currency):""} · ${escapeHtml(row.originalAccount)}${row.sourceDate&&row.sourceDate!==row.date?` · 来源日 ${row.sourceDate}`:""}</div>
      ${row.issue==="账户待选"?field("映射账户",`<select data-map-account="${row.line}"><option value="">选择资金账户</option>${book.accounts.map((account)=>option(account.id,account.name)).join("")}</select>`):""}</li>`).join("")}</ul>`;
    all("[data-import-select]",dialog).forEach((checkbox)=>checkbox.onchange=()=>{rows.find(({line})=>line===Number(checkbox.dataset.importSelect)).selected=checkbox.checked;});
    all("[data-map-account]",dialog).forEach((select)=>select.onchange=()=>{
      const row=rows.find(({line})=>line===Number(select.dataset.mapAccount)), account=lookup.get(select.value);
      if(!account)return;
      row.account=account.id;row.currency=account.currency;row.amount=minor(row.originalAmount,account.currency);
      row.issue=row.amount?null:"金额无效";row.selected=!row.issue;render();
    });
  };
  render();
  bind("confirm-import",()=>{
    const selected=rows.filter(({selected,issue,imported})=>selected&&!issue&&!imported);
    const error=by("#import-error",dialog);
    if(!selected.length){error.textContent="请选择至少一条可以提交的记录。";return;}
    if(takeFault("stale")||book.revision!==snap||ledger.active!==book.id) {
      error.textContent="账本或映射已变化，需要重新预览。";
      return;
    }
    if(takeFault("write")){error.textContent="写入失败。原预览与勾选已保留。";return;}
    if(ledger.readOnly){error.textContent="只读账本禁止确认导入。";return;}
    for(const item of selected){
      const key=`${digest}:${item.line}`;
      if(book.imports.has(key))continue;
      book.imports.add(key);
      book.rows.unshift({ ...booking(item.title,item.amount,item.type,item.account,item.date),currency:item.currency });
    }
    book.revision++;
    dialog.close();openPage("records");setStatus(`本次写入 ${selected.length} 条流水。`);
  },dialog);
  bind("back-import",showAgain,dialog);
}

function importDialog() {
  const book=bookNow();
  if(ledger.readOnly)return;
  const state={source:"通用 CSV",text:csvDemo,zone:"Asia/Taipei",headers:[],parsed:[],mapping:{}};
  const dialog=modal("导入账单",'<div id="import-shell" class="dialog-form"></div>',{wide:true});
  const shell=by("#import-shell",dialog);
  function mapping() {
    shell.innerHTML=`<div class="dialog-body stack"><h3>选择文件与列映射</h3>
      <div class="cols">${field("来源",`<select id="import-source">${["通用 CSV","支付宝 CSV","京东 CSV","微信 XLSX 样例"].map((key)=>option(key,key,state.source)).join("")}</select>`)}
      ${field("来源时区",`<select id="import-zone">${["Asia/Taipei","Asia/Shanghai","America/Los_Angeles","UTC"].map((key)=>option(key,key,state.zone)).join("")}</select>`)}</div>
      ${field("选择 UTF-8 CSV",'<input type="file" accept=".csv,text/csv" id="import-file">')}
      ${field("CSV 内容",`<textarea id="csv-text" rows="6">${escapeHtml(state.text)}</textarea>`)}
      <div class="record-filters" id="column-map"></div><p id="import-check" class="notice err" hidden role="alert"></p>
      </div><footer class="dialog-footer"><button type="button" data-close>取消</button><button class="primary" id="preview-import" type="button">预览导入</button></footer>`;
    const updateColumns=()=>{
      state.text=by("#csv-text",dialog).value;
      [state.headers=[],...state.parsed]=d3.csvParseRows(state.text.trim()).filter((row)=>row.some(Boolean));
      by("#column-map",dialog).innerHTML=Object.entries(importColumns).map(([key,label],i)=>
        field(label,`<select data-column="${key}">${state.headers.map((name,index)=>option(String(index),name,state.mapping[key]??String(i))).join("")}</select>`)).join("");
    };
    bind("preview-import",preview,dialog);
    by("#csv-text",dialog).oninput=updateColumns;
    by("#import-source",dialog).onchange=(event)=>{state.source=event.target.value;};
    by("#import-zone",dialog).onchange=(event)=>{state.zone=event.target.value;};
    by("#import-file",dialog).onchange=async(event)=>{
      const file=event.target.files[0];
      if(!file)return;
      if(file.size>1_048_576){by("#import-check",dialog).hidden=false;by("#import-check",dialog).textContent="原型仅预览 1 MiB 内的 CSV。";return;}
      by("#csv-text",dialog).value=await file.text();updateColumns();
    };
    updateColumns();
  }
  async function preview() {
    state.mapping=Object.fromEntries(all("[data-column]",dialog).map((select)=>[select.dataset.column,select.value]));
    if(!state.parsed.length || Object.keys(state.mapping).some((key)=>!state.headers[Number(state.mapping[key])])){
      const error=by("#import-check",dialog);error.hidden=false;error.textContent="需要表头、有效列和至少一条数据。";return;
    }
    const snap=book.revision;
    const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(state.text));
    if(!dialog.open)return;
    const digest=Array.from(new Uint8Array(hash),(part)=>part.toString(16).padStart(2,"0")).join("");
    const rows=state.parsed.map((cells,index)=>{
      const pick=(name)=>String(cells[Number(state.mapping[name])]??"").trim();
      const originalAccount=pick("account"), originalAmount=pick("amount");
      const day=importDay(pick("date"),state.zone,book.zone), date=typeof day==="string"?day:day?.date??"";
      const account=book.accounts.find((item)=>item.name===originalAccount);
      const type=Object.keys(labels).find((name)=>labels[name]===pick("type")||name===pick("type"));
      const currency=account?.currency??book.currency;
      const amount=minor(originalAmount,currency);
      const issue=!day ? "日期或时区待决"
        :!type?"类型待决":type==="transfer"?"缺转入端":!amount?"金额无效":!account?"账户待选":null;
      const duplicate=book.rows.some((row)=>row.date===date&&row.type===type&&row.amount===amount&&row.account===account?.id);
      const imported=book.imports.has(`${digest}:${index+2}`);
      return {line:index+2,title:pick("title"),date,sourceDate:day?.source,type,account:account?.id,currency,amount,originalAccount,originalAmount,issue,duplicate,imported,selected:!issue&&!duplicate&&!imported};
    });
    shell.innerHTML=`<div class="dialog-body stack"><div><h3>预览待写入流水</h3><p class="meta">${escapeHtml(state.source)} · 来源 ${escapeHtml(state.zone)} · 业务日 ${book.zone}。空缺或可疑行可以先跳过。</p></div>
      <div id="import-preview" class="stack"></div><p id="import-error" role="alert"></p></div>
      <footer class="dialog-footer"><button type="button" data-close>取消</button><button type="button" id="back-import">返回映射</button><button type="button" id="confirm-import" class="primary">确认导入</button></footer>`;
    reportImport(book,rows,digest,snap,dialog,mapping);
  }
  mapping();
}

function offsetDialog() {
  const book=bookNow();
  const assigned=new Set(book.offsets.flatMap(({members})=>members));
  const expenses=book.rows.filter(({type,id})=>type==="expense"&&!assigned.has(id));
  const dialog=modal("预览平账",`<div class="dialog-body stack">
    ${field("要平账的支出",`<select id="offset-anchor"><option value="">选择原支出</option>${expenses.map((row)=>option(row.id,`${row.title} · ${money(row.amount,row.currency)}`)).join("")}</select>`)}
    <div id="offset-candidates" class="stack"></div><p id="offset-note" class="notice" role="status">选择支出和一笔或多笔退款。</p>
    </div><footer class="dialog-footer"><button type="button" data-close>取消</button><button type="button" id="confirm-offset" class="primary" disabled>确认平账</button></footer>`,{wide:true});
  const code=by("#offset-anchor",dialog);
  const approve=by("#confirm-offset",dialog), summary=by("#offset-note",dialog);
  const snap=book.revision;
  let members=[];
  const update=()=>{
    const anchor=expenses.find(({id})=>id===code.value);
    const matches=all("[data-offset-item]:checked",dialog).map((item)=>book.rows.find(({id})=>id===item.dataset.offsetItem));
    const sum=matches.reduce((total,row)=>total+BigInt(row.amount),0n);
    const equal=anchor&&matches.length>0&&matches.length<=5&&sum===BigInt(anchor.amount);
    approve.disabled=!equal;
    members=equal?[anchor.id,...matches.map(({id})=>id)]:[];
    summary.textContent=anchor?`已选择 ${matches.length} 笔退款 · ${money(sum,anchor.currency)} / ${money(anchor.amount,anchor.currency)}${equal?"。确认后从收支报表排除，账户余额保持原资金变动。":""}`:"选择支出和一笔或多笔退款。";
  };
  code.onchange=()=>{
    const anchor=expenses.find(({id})=>id===code.value);
    const candidates=book.rows.filter((row)=>row.type==="income"&&row.currency===anchor?.currency&&!assigned.has(row.id));
    by("#offset-candidates",dialog).innerHTML=`<h3>同币种退款</h3>${candidates.map((row)=>`<label class="check"><input type="checkbox" data-offset-item="${row.id}"><span>${escapeHtml(row.title)} · ${money(row.amount,row.currency)} · ${escapeHtml(labelAccount(book,row.account))}</span></label>`).join("")||"<p>没有可选退款。</p>"}`;
    all("[data-offset-item]",dialog).forEach((entry)=>entry.onchange=update);update();
  };
  bind("confirm-offset",()=>{
    if(!members.length)return;
    if(book.revision!==snap||takeFault("stale")||bookNow()!==book){summary.textContent="预览已过期，请重新核对。";return;}
    if(ledger.readOnly||takeFault("write")){summary.textContent="平账未保存，当前选择已保留。";return;}
    book.offsets.push({id:crypto.randomUUID(),members});book.revision++;dialog.close();showOffsets();setStatus("整组平账已确认。");
  },dialog);
}

function showOffsets() {
  if(missing("平账"))return;
  const book=bookNow();
  pane("平账","选择一笔支出以及等额的同币种退款",`<section class="card stack"><h2>已平账</h2>
    ${book.offsets.length?`<ul class="list">${book.offsets.map((group)=>{
      const rows=group.members.map((key)=>book.rows.find(({id})=>id===key));
      return `<li class="bar"><div><strong>${escapeHtml(rows[0].title)} · ${rows.length} 笔</strong><p class="meta">${rows.map(({title})=>escapeHtml(title)).join("、")}</p></div>
      ${button("撤销整组",{className:"small",attrs:`data-undo-offset="${group.id}" ${ledger.readOnly?"disabled":""}`})}</li>`;
    }).join("")}</ul>`:'<p class="empty">没有已平账的流水组。</p>'}</section>`,
    button("新建平账",{name:"Plus",className:"primary",attrs:ledger.readOnly?"id=offset-new disabled":"id=offset-new"}));
  bind("offset-new",offsetDialog);
  all("[data-undo-offset]").forEach((entry)=>entry.onclick=()=>confirmation("撤销平账","原流水仍然保留，撤销后会重新计入收支。","撤销平账",()=>{
    book.offsets=book.offsets.filter(({id})=>id!==entry.dataset.undoOffset);book.revision++;showOffsets();
  }));
}

const reportFilter={from:"2026-11-01",to:"2026-11-30",currency:""};
function showReports() {
  if(missing("报表"))return;
  const book=bookNow(), currency=book.accounts.some((account)=>account.currency===reportFilter.currency)?reportFilter.currency:book.currency;
  pane("账本报表",`业务时区 ${book.zone}`,`<div class="record-filters">
    ${field("开始日期",`<input id="report-from" type="date" value="${reportFilter.from}">`)}
    ${field("结束日期",`<input id="report-to" type="date" value="${reportFilter.to}">`)}
    ${field("报表币种",`<select id="report-currency">${[...new Set(book.accounts.map((row)=>row.currency))].map((key)=>option(key,key,currency)).join("")}</select>`)}
    <button id="current-month" type="button">本月</button></div>
    <div id="report-body"></div>`);
  const paint=()=>{
    const rows=book.rows.filter((row)=>row.currency===currency&&row.date>=reportFilter.from&&row.date<=reportFilter.to);
    const totals=finance(book,rows,currency);
    const entries=[["income","收入",totals.income],["expense","支出",totals.expense],["transfer","转账",totals.transfer]];
    by("#report-body").innerHTML=reportFilter.from>reportFilter.to?'<p class="notice warn">开始日期必须早于或等于结束日期。</p>':`<div class="stack">
      <div class="metric-grid">${entries.map(([,label,amount])=>`<section class="card metric"><small>${label}</small><strong>${money(amount,currency)}</strong></section>`).join("")}</div>
      <div class="two-up"><section class="card stack"><h2>期间收支</h2><p class="meta">已平账组排除在收支统计外。不同币种分别查看。</p>
      ${entries.map(([kind,label,amount])=>`<div class="bar"><span>${label}</span>${button("查看"+label+"明细",{className:"small quiet",attrs:`data-report-drill="${kind}"`})}</div>`).join("")}
      ${rows.length?"":'<p class="empty">所选期间没有数据。</p>'}</section>
      <section class="card stack"><h2>账户余额</h2><ul class="list">${balances(book).filter((account)=>account.currency===currency).map((account)=>`<li class="bar"><span>${escapeHtml(account.name)}</span><code>${money(account.balance,currency)}</code></li>`).join("")}</ul></section></div></div>`;
    const groups=new Set(book.offsets.flatMap((group)=>group.members));
    all("[data-report-drill]").forEach((entry)=>entry.onclick=()=>{
      ledger.filter={type:entry.dataset.reportDrill,from:reportFilter.from,to:reportFilter.to,currency,query:""};
      ledger.focusIds=rows.filter(({type,id})=>type===entry.dataset.reportDrill&&!groups.has(id)).map(({id})=>id);
      openPage("records");
    });
  };
  for(const side of ["from","to"])by(`#report-${side}`).onchange=(event)=>{reportFilter[side]=event.target.value;paint();};
  by("#report-currency").onchange=(event)=>{reportFilter.currency=event.target.value;showReports();};
  bind("current-month",()=>{reportFilter.from="2026-11-01";reportFilter.to="2026-11-30";showReports();});
  paint();
}

const periodic = {
  fixed:[
    {key:"fixed-2026-09",date:"2026-09-01",amount:"25000",title:"工作室订阅",status:"可补记"},
    {key:"fixed-2026-10",date:"2026-10-01",amount:"25000",title:"工作室订阅",status:"停用期间"},
    {key:"fixed-2026-11",date:"2026-11-01",amount:"25000",title:"工作室订阅",status:"账户已归档"},
  ],
  loan:[
    {key:"loan-001",date:"2026-09-30",amount:"102500",principal:"100000",interest:"2500",title:"设备贷款还款",status:"可补记"},
    {key:"loan-002",date:"2026-10-31",amount:"101250",principal:"100000",interest:"1250",title:"设备贷款还款",status:"可补记"},
    {key:"loan-003",date:"2026-11-30",amount:"100000",principal:"100000",interest:"0",title:"设备贷款还款",status:"未到期"},
  ],
};

function periodDialog(kind) {
  const book=bookNow(), sample=periodic[kind];
  if(ledger.readOnly)return;
  const dialog=modal(kind==="fixed"?"预览固定收支补期":"预览贷款历史补记",`<div class="dialog-body stack">
    <p>选中可补记的到期行后确认。这些流水会按各期原业务日写入当前账本。</p>
    ${field("入账账户",`<select id="period-account">${book.accounts.map((account)=>option(account.id,account.name)).join("")}</select>`)}
    <ul class="list" id="period-rows"></ul><p id="period-error" class="notice" role="status"></p></div>
    <footer class="dialog-footer"><button type="button" data-close>取消</button><button type="button" id="confirm-period" class="primary">确认所选期次</button></footer>`,{wide:true});
  const snap=book.revision;
  let fixedRepair=false;
  const refresh=()=>{
    const list=by("#period-rows",dialog);
    const account=book.accounts.find(({id})=>id===by("#period-account",dialog).value);
    list.innerHTML=sample.map((row)=>{
      const status=book.periods.has(row.key)?"已补记":row.status==="账户已归档"&&fixedRepair?"可补记":row.status;
      return `<li class="stack"><div class="bar">
      <label class="check"><input type="checkbox" data-period-id="${row.key}" ${status!=="可补记"?"disabled":""}><span>${row.date} · ${row.title}</span></label>
      ${badge(status,status==="已补记"?"ok":status==="账户已归档"?"warn":"")}</div>
      <div class="meta">${money(row.amount,account.currency)}${row.principal?` · 本金 ${money(row.principal,account.currency)} · 利息 ${money(row.interest,account.currency)}`:""}</div>
      ${status==="账户已归档"?button("用所选账户修正",{className:"small",attrs:"id=repair-period"}):""}</li>`;
    }).join("");
    bind("repair-period",()=>{fixedRepair=true;refresh();},dialog);
  };
  refresh();
  by("#period-account",dialog).onchange=refresh;
  bind("confirm-period",()=>{
    const keys=all("[data-period-id]:checked",dialog).map((node)=>node.dataset.periodId);
    const slot=by("#period-error",dialog);
    if(!keys.length){slot.textContent="请选择至少一个待补记期次。";return;}
    if(takeFault("stale")||book.revision!==snap||bookNow()!==book){slot.textContent="账本已改变，请关闭后重做预览。";return;}
    if(takeFault("write")||ledger.readOnly){slot.textContent="保存失败，当前期次选择已保留。";return;}
    const account=book.accounts.find(({id})=>id===by("#period-account",dialog).value);
    for(const key of keys){
      if(book.periods.has(key))continue;
      const row=sample.find((item)=>item.key===key);
      book.rows.unshift({...booking(row.title,row.amount,"expense",account.id,row.date),currency:account.currency});
      book.periods.add(key);
    }
    book.revision++;dialog.close();showCycles();setStatus(`已确认 ${keys.length} 个所选期次。`);
  },dialog);
}

function showCycles() {
  if(missing("固定收支与贷款"))return;
  const book=bookNow();
  pane("固定收支与贷款","预览可补记范围与处理结果",`<div class="two-up">
    <section class="card stack"><h2>固定收支</h2><p>工作室订阅 · 每月 1 日</p>
    <p class="meta">停用期间无补记。账户修正后可确认待处理期次。</p>
    <div class="row">${button("预览固定收支补期",{name:"CalendarClock",attrs:ledger.readOnly?"id=preview-fixed disabled":"id=preview-fixed"})} <a href="../automations/index.html#plans/plan-ledger">在自动化中心管理计划</a></div>
    <small>已补记 ${[...book.periods].filter((key)=>key.startsWith("fixed-")).length} 期</small></section>
    <section class="card stack"><h2>贷款</h2><p>设备贷款 · 等额本金样例</p>
    <p class="meta">明确确认所选到期期次，查看后续日期和本息。未到期项不能补记。</p>
    <div>${button("预览贷款历史补记",{name:"CalendarClock",attrs:ledger.readOnly?"id=preview-loan disabled":"id=preview-loan"})}</div>
    <small>已补记 ${[...book.periods].filter((key)=>key.startsWith("loan-")).length} 期</small></section>
    </div>`);
  bind("preview-fixed",()=>periodDialog("fixed"));bind("preview-loan",()=>periodDialog("loan"));
}

let savedPackage = null;
function restoreDialog() {
  if(ledger.readOnly)return;
  const book=bookNow();
  const fallback={
    title:"家用旧账",currency:"CNY",zone:"Asia/Taipei",schemaVersion:1,
    accounts:[{id:"primary",name:"现金",currency:"CNY",base:"0",state:"active"}],
    rows:[booking("旧账保留记录","3700","expense","primary","2026-10-08")],
    offsets:[],periods:[],imports:[],
  };
  const snapshot=structuredClone(savedPackage??fallback);
  const dialog=modal("恢复账本包",'<div id="restore-preview" class="dialog-form"></div>',{wide:true});
  const panel=by("#restore-preview",dialog);
  let format="huhu", withAccounts=true, withRows=true;
  let confirmed=false;
  const show=()=>{
    const title=by("#restore-title",dialog)?.value??(snapshot.title+" · 恢复");
    panel.innerHTML=`<div class="dialog-body stack"><div class="cols">
      ${field("备份来源",`<select id="restore-origin">${option("huhu","Huhu v1 账本包",format)}${option("homi","HomiBook v1 演练包",format)}${option("bad","损坏或未知版本包",format)}</select>`)}
      ${field("恢复到新账本",`<input id="restore-title" value="${escapeHtml(title)}">`)}
      </div><fieldset><legend>选择要恢复的模块</legend>
      <label class="check"><input type="checkbox" id="restore-accounts" ${withAccounts?"checked":""}> 账户与期初余额</label>
      <label class="check"><input type="checkbox" id="restore-records" ${withRows?"checked":""}> 流水与关系</label>
      </fieldset><div class="callout">${snapshot.accounts.length} 个账户 · ${snapshot.rows.length} 条流水 · ${snapshot.zone}
      ${format==="homi"?'<p>上游样本含失效凭证引用，保留流水并单列待核对。旧 offsetAt 标记不生成虚构平账组。</p>':""}</div>
      <p id="restore-error" role="alert">${format==="bad"?"无法校验当前包版本。":withRows&&!withAccounts?"流水需要账户，请补选依赖。":""}</p>
      </div><footer class="dialog-footer"><button type="button" data-close>取消</button><button type="button" id="confirm-restore" class="primary" ${format==="bad"||withRows&&!withAccounts?"disabled":""}>确认恢复</button></footer>`;
    by("#restore-origin",dialog).onchange=(event)=>{format=event.target.value;show();};
    by("#restore-accounts",dialog).onchange=(event)=>{withAccounts=event.target.checked;show();};
    by("#restore-records",dialog).onchange=(event)=>{withRows=event.target.checked;show();};
    bind("confirm-restore",()=>{
      const title=by("#restore-title",dialog).value.trim();
      const error=by("#restore-error",dialog);
      if(confirmed||!title||ledger.books.some((value)=>value.title===title)){error.textContent="请输入尚未使用的账本名称。";return;}
      if(takeFault("write")){error.textContent="恢复未发布，可使用当前预览重试。";return;}
      confirmed=true;
      const newBook={ ...makeBook(title,snapshot.currency,snapshot.zone,"待建账户"),accounts:withAccounts?snapshot.accounts:[], rows:withRows?snapshot.rows:[],
        offsets:withRows?snapshot.offsets:[],periods:new Set(withRows?snapshot.periods:[]),imports:new Set(withRows?snapshot.imports:[]) };
      if(!newBook.accounts.length)newBook.accounts.push({id:"primary",name:"备用金",currency:newBook.currency,base:"0",state:"active"});
      ledger.books.push(newBook);ledger.active=newBook.id;dialog.close();openPage("overview");setStatus(book?"已恢复为新账本，原账本保持可用。":"已恢复为新账本。");
    },dialog);
  };
  show();
}

function showImport() {
  const book=bookNow();
  pane("导入与恢复","账单、账本备份与状态",`<div class="two-up">
    <section class="card stack"><h2>导入账单</h2><p>选择 CSV、核对字段映射、预览并确认。原型使用本地 CSV 与来源样例。</p>
    ${button("打开导入向导",{name:"Plus",attrs:ledger.readOnly||!book?"id=open-import disabled":"id=open-import"})}</section>
    <section class="card stack"><h2>账本备份</h2><p>恢复先检查版本和模块依赖，再写入新的账本。</p><div class="row">
    ${button("准备当前快照",{name:"Database",attrs:book?"id=prepare-backup":"id=prepare-backup disabled"})}
    ${button("预览恢复",{name:"History",attrs:ledger.readOnly?"id=restore-open disabled":"id=restore-open"})}</div>
    <p class="meta" id="backup-result">${savedPackage?"当前会话已有快照 · "+escapeHtml(savedPackage.title):"可使用内置演示包。"} </p></section></div>`);
  bind("open-import",importDialog);bind("restore-open",restoreDialog);
  bind("prepare-backup",()=>{
    const {title,currency,zone,accounts,rows,offsets,periods,imports}=book;
    savedPackage=structuredClone({title,currency,zone,accounts,rows,offsets,periods:[...periods],imports:[...imports],schemaVersion:1});
    by("#backup-result").textContent=`快照已准备 · ${accounts.length} 个账户、${rows.length} 条流水。`;
  });
}

function ledgerNavigation() {
  return `<h2>账本</h2><nav aria-label="账本导航">${Object.entries(app.pages).map(([key,page])=>button(page.label,{
    name:page.icon,className:"quiet nav-link",attrs:`data-route="${key}" ${app.route===key?'aria-current="page"':""}`,
  })).join("")}</nav><p class="sidebar-link"><a href="../workbench/index.html">返回工作台原型</a></p>`;
}
startShell({
  defaultRoute:"overview",
  pages:{
    overview:{label:"总览",icon:"House",sidebar:ledgerNavigation,show:showOverview},
    records:{label:"流水",icon:"ListTodo",sidebar:ledgerNavigation,show:showRecords},
    offsets:{label:"平账",icon:"Layers",sidebar:ledgerNavigation,show:showOffsets},
    reports:{label:"报表",icon:"FileText",sidebar:ledgerNavigation,show:showReports},
    cycles:{label:"固定收支与贷款",icon:"CalendarClock",sidebar:ledgerNavigation,show:showCycles},
    import:{label:"导入与恢复",icon:"History",sidebar:ledgerNavigation,show:showImport},
  },
  demo:()=>button("载入样例账本",{attrs:"id=load-sample",className:"small"})+
    demo("access","Vault 访问",'<option value="write">可写</option><option value="readonly">只读</option>')+
    demo("fault","下一次确认",'<option value="ok">正常</option><option value="write">写入失败</option><option value="stale">预览版本过期</option>'),
});
bind("load-sample",()=>{loadSample();by(".demo-controls").open=false;});
by("#demo-fields").onchange=(event)=>{
  if(event.target.dataset.demo==="access"){ledger.readOnly=event.target.value==="readonly";renderShell();}
  if(event.target.dataset.demo==="fault")ledger.fault=event.target.value;
};
