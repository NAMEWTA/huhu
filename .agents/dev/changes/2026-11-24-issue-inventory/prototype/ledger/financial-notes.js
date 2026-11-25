const financialResources = [
  {kind:"note",documentId:"funding-note",title:"工作室经费记录",path:"财务/工作室经费记录.md",markdown:"# 工作室经费记录\n\n办公用品由工作室预算支出，报销凭证归入采购档案。"},
  {kind:"archive",documentId:"materials-archive",title:"物料采购档案",path:"档案/物料采购.md",markdown:"# 物料采购档案\n\n负责人　林川\n\n复核状态　已核对"},
];
const resourceKind = {note:"笔记",archive:"档案"};
const ownerKind = {book:"账本",budget:"预算",record:"流水"};
const resourceIdentity = ({kind,path,documentId}) => ({kind,path,documentId});
const matchingOwner = (left,right) => left.kind===right.kind&&left.id===right.id;
const resourceFor = ({kind,documentId,path}) => financialResources.find((item)=>
  item.kind===kind&&(documentId?documentId===item.documentId:path===item.path));

function seedFinancialNotes(book) {
  book.references.push({id:crypto.randomUUID(),owner:{kind:"book"},resource:resourceIdentity(financialResources[0])});
  book.references.push({id:crypto.randomUUID(),owner:{kind:"record",id:book.rows.find(({title})=>title==="购置纸笔").id},
    resource:{kind:"note",documentId:"missing-financial-note",path:"财务/旧采购笔记.md"}});
}

function referenceButton({kind,id},title="") {
  return button("财务笔记",{className:"small",aria:`${title?`${title}的`:""}财务笔记`,
    attrs:`data-reference-owner="${kind}" data-reference-id="${id??""}" data-reference-title="${escapeHtml(title)}"`});
}

function bindReferenceButtons(root=document) {
  all("[data-reference-owner]",root).forEach((trigger)=>trigger.onclick=()=>{
    const {referenceOwner:kind,referenceId:id,referenceTitle:title}=trigger.dataset;
    referenceDialog(bookNow(),{kind,...(id&&{id})},title);
  });
}

function openFinancialDocument(resource) {
  modal(resource.title,`<div class="dialog-body stack">
    <p class="meta">${resourceKind[resource.kind]} · ${escapeHtml(resource.path)}</p>
    <pre class="financial-markdown">${escapeHtml(resource.markdown)}</pre></div>
    <footer class="dialog-footer"><button type="button" data-close autofocus>返回</button></footer>`,{wide:true});
}

function referenceDialog(book,owner,title) {
  const dialog=modal(`${ownerKind[owner.kind]}财务笔记`,`<div class="dialog-body stack">
    <p class="meta">${escapeHtml(title||book.title)}</p><div id="reference-rows" class="stack"></div>
    <div id="reference-picker" class="stack" hidden></div>
    <p id="reference-feedback" role="status"></p>
    </div><footer class="dialog-footer"><button type="button" data-close autofocus>完成</button></footer>`,{wide:true});
  const list=by("#reference-rows",dialog), picker=by("#reference-picker",dialog);
  const status=(text)=>{by("#reference-feedback",dialog).textContent=text;};
  const mutationAllowed=()=>!ledger.readOnly&&bookNow()===book;
  function paint() {
    const rows=book.references.filter(({owner:entry})=>matchingOwner(owner,entry));
    list.innerHTML=`
      ${ledger.notesEnabled?"":`<div class="callout warn"><p>Notes 已停用。重新启用后可打开或修复关联，账本仍可记账。</p>
        <button type="button" id="enable-notes-demo">模拟重新启用 Notes</button></div>`}
      ${rows.length?`<ul class="list">${rows.map((ref)=>{
        const resource=resourceFor(ref.resource);
        const state=!ledger.notesEnabled?"notes-disabled":resource?"available":"missing";
        return `<li class="bar"><div class="stack"><strong>${escapeHtml(resource?.title??ref.resource.path)}</strong>
          <small class="meta financial-path">${resourceKind[ref.resource.kind]} · ${escapeHtml(resource?.path??ref.resource.path)}</small></div>
          <div class="row">${state==="available"?button("打开",{attrs:`data-open-reference="${ref.id}"`}):
            badge(state==="missing"?"资源已缺失":"Notes 已停用","warn")}
          ${state==="missing"?button("选择替换资源",{attrs:`data-repair-reference="${ref.id}" ${ledger.readOnly?"disabled":""}`}):""}
          ${button("移除关联",{className:"quiet",attrs:`data-unlink-reference="${ref.id}" ${ledger.readOnly?"disabled":""}`})}</div>
          ${state==="missing"?'<p class="meta">可选择现有资源来修复此关联。</p>':""}</li>`;
      }).join("")}</ul>`:'<p class="empty">尚无财务笔记关联。</p>'}
      <div><button type="button" class="primary" id="reference-add" ${ledger.readOnly||!ledger.notesEnabled?"disabled":""}>关联已有资源</button></div>`;
    bind("reference-add",()=>choose(),dialog);
    bind("enable-notes-demo",()=>{
      ledger.notesEnabled=true;
      by('[data-demo="notes"]').value="on";
      paint();
      by("#reference-add",dialog).focus();
      status("Notes 已重新启用。");
    },dialog);
    all("[data-open-reference]",dialog).forEach((button)=>button.onclick=()=>{
      const ref=rows.find(({id})=>id===button.dataset.openReference);
      const resource=resourceFor(ref.resource);
      if(ledger.notesEnabled&&resource)openFinancialDocument(resource);
      else{paint();status("资源状态已变化，请检查当前关联。");}
    });
    all("[data-repair-reference]",dialog).forEach((button)=>button.onclick=()=>choose(button.dataset.repairReference));
    all("[data-unlink-reference]",dialog).forEach((button)=>button.onclick=()=>{
      if(!mutationAllowed())return;
      const id=button.dataset.unlinkReference;
      if(takeFault("write"))return status("移除关联失败，可重试。");
      book.references=book.references.filter((ref)=>ref.id!==id);
      book.revision++;
      picker.hidden=true;
      paint();
      (by("#reference-add:not(:disabled)",dialog)??by("footer [data-close]",dialog)).focus();
      status("关联已移除，原资源仍在知识库中。");
    });
  }
  function choose(replaceId) {
    if(!mutationAllowed()||!ledger.notesEnabled)return;
    const expectedRevision=book.revision;
    const invoker=document.activeElement;
    picker.hidden=false;
    picker.innerHTML=`<section class="card stack" aria-labelledby="reference-picker-title">
      <h3 id="reference-picker-title">${replaceId?"选择替换资源":"选择已有资源"}</h3>
      <div class="record-filters">
        ${field("筛选资源",'<input id="resource-search" type="search">')}
        ${field("资源类型",'<select id="resource-kind"><option value="">全部资源</option><option value="note">笔记</option><option value="archive">档案</option></select>')}
      </div><form id="resource-choice" class="stack"><fieldset><legend>在当前 Vault 选择</legend><div class="stack" id="resource-results"></div></fieldset>
      <div class="row"><button type="button" id="resource-cancel">取消选择</button>
      <button type="submit" id="resource-link" class="primary" disabled>${replaceId?"保存修复":"确认关联"}</button></div></form></section>`;
    const search=by("#resource-search",picker),kind=by("#resource-kind",picker), form=by("#resource-choice",picker);
    const chosen=()=>by("[name=resource]:checked",form)?.value;
    const refresh=()=>{
      const current=chosen(), query=search.value.trim().toLowerCase();
      const existing=book.references.filter((ref)=>matchingOwner(ref.owner,owner)&&ref.id!==replaceId).map(({resource})=>resourceFor(resource)?.documentId);
      const matches=financialResources.filter((item)=>(!kind.value||kind.value===item.kind)&&!existing.includes(item.documentId)&&
        `${item.title} ${item.path}`.toLowerCase().includes(query));
      by("#resource-results",picker).innerHTML=matches.length?matches.map((item)=>
        `<label class="check"><input type="radio" name="resource" value="${item.documentId}" ${item.documentId===current?"checked":""}>
        <span>${escapeHtml(item.title)} <small class="meta financial-path">${resourceKind[item.kind]} · ${escapeHtml(item.path)}</small></span></label>`).join(""):'<p class="empty">没有可关联的匹配资源。</p>';
      by("#resource-link",picker).disabled=!chosen();
    };
    search.oninput=kind.onchange=refresh;
    form.onchange=()=>{by("#resource-link",picker).disabled=!chosen();};
    refresh();
    search.focus();
    bind("resource-cancel",()=>{picker.hidden=true;invoker.focus();status("");},picker);
    form.onsubmit=(event)=>{
      event.preventDefault();
      const resource=financialResources.find(({documentId})=>documentId===chosen());
      if(!resource||!mutationAllowed()||!ledger.notesEnabled)return;
      if(book.revision!==expectedRevision||takeFault("stale")){status("账本已变化，请重新选择资源。");return;}
      if(takeFault("write")){status("保存失败，所选资源已保留，可重试。");return;}
      const next={id:replaceId??crypto.randomUUID(),owner,resource:resourceIdentity(resource)};
      book.references=replaceId?book.references.map((ref)=>ref.id===replaceId?next:ref):[...book.references,next];
      book.revision++;
      picker.hidden=true;
      paint();
      by(`[data-open-reference="${next.id}"]`,dialog).focus();
      status(replaceId?"关联已修复。":"资源已关联。");
    };
  }
  paint();
}

function reviewDialog(book,{from,to,currency}) {
  const dialog=modal("期间复盘",`<form class="dialog-form"><div class="dialog-body stack">
    <div class="record-filters">
      ${field("复盘开始日期",`<input name="from" type="date" value="${from}" required autofocus>`)}
      ${field("复盘结束日期",`<input name="to" type="date" value="${to}" required>`)}
      ${field("复盘币种",`<select name="currency">${option("","分别汇总所有币种",currency)}${currencyChoices.map((key)=>option(key,key,currency)).join("")}</select>`)}
    </div><label class="check"><input type="checkbox" name="includeOffset">纳入已平账流水</label>
    <div><button type="button" id="preview-review">生成 Markdown 预览</button></div>
    <section id="review-preview" class="stack" hidden>
      <h3>Markdown 预览</h3><pre class="financial-markdown"></pre>
      ${field("复盘笔记名称",'<input name="name" maxlength="100" disabled>')}
    </section><div id="review-feedback" role="status"></div>
    </div><footer class="dialog-footer"><button type="button" data-close>关闭</button><button type="submit" class="primary" disabled>保存为笔记</button></footer></form>`,{wide:true});
  const form=by("form",dialog), name=form.elements.namedItem("name"), submit=by("[type=submit]",form);
  const preview=by("#review-preview",form), feedback=by("#review-feedback",form);
  const reason=ledger.readOnly?"Vault 为只读，可以预览复盘。":ledger.notesEnabled?"":"Notes 已停用，可以预览。重新启用后才能保存。";
  feedback.textContent=reason;
  let draft;
  const clear=()=>{
    draft=null;preview.hidden=true;name.disabled=submit.disabled=true;feedback.textContent=reason;
  };
  for(const key of ["from","to","currency","includeOffset"])form.elements.namedItem(key).onchange=clear;
  bind("preview-review",()=>{
    if(!form.reportValidity())return;
    const params=new FormData(form), start=params.get("from"), end=params.get("to"), selected=params.get("currency");
    const selectedDays=(Date.parse(end)-Date.parse(start))/86_400_000;
    if(selectedDays<0||selectedDays>=366){clear();feedback.textContent="请选择有效期间，最多 366 天。";return;}
    const rows=book.rows.filter(({date})=>date>=start&&date<=end);
    const currencies=selected?[selected]:[...new Set(book.accounts.map(({currency})=>currency))];
    const includeOffset=params.has("includeOffset");
    const content=currencies.flatMap((currency)=>{
      const result=finance(book,rows,currency,includeOffset);
      return [`## ${currency}`,`- 收入 ${money(result.income,currency)}`,`- 支出 ${money(result.expense,currency)}`,`- 转账 ${money(result.transfer,currency)}`,""];
    });
    const markdown=[`# ${book.title} · 期间复盘`,"",`期间 ${start} 至 ${end} · 时区 ${book.zone}`,includeOffset?"统计口径包含已平账流水。":"统计口径排除已平账流水。","",...content].join("\n");
    draft={markdown,expectedRevision:book.revision};
    by("pre",preview).textContent=markdown;
    preview.hidden=false;
    name.disabled=submit.disabled=Boolean(reason);
    if(!name.value)name.value=`账本复盘 ${start} 至 ${end}`;
    feedback.textContent=reason||"预览已生成，核对后可保存。";
  },dialog);
  form.onsubmit=(event)=>{
    event.preventDefault();
    if(!draft||reason)return;
    const title=name.value.trim();
    if(!title||title.includes("/")||title.includes("\\")){feedback.textContent="请输入不含路径分隔符的笔记名称。";return;}
    if(book.revision!==draft.expectedRevision||bookNow()!==book||takeFault("stale")){
      clear();feedback.textContent="账本已变化，请重新生成预览。";return;
    }
    const path=`${title}.md`;
    if(financialResources.some((item)=>item.path===path)){feedback.textContent="已有同名笔记，请修改名称。";return;}
    if(takeFault("write")){feedback.textContent="保存失败，预览和名称已保留，可重试。";return;}
    const resource={kind:"note",title,path,documentId:crypto.randomUUID(),markdown:draft.markdown};
    financialResources.push(resource);
    name.disabled=submit.disabled=true;
    feedback.innerHTML=`<p>已保存为 ${escapeHtml(path)}。</p><button type="button" id="open-review-note">打开复盘笔记</button>`;
    bind("open-review-note",()=>openFinancialDocument(resource),feedback);
    by("#open-review-note",feedback).focus();
    setStatus("复盘笔记已保存。");
  };
}
