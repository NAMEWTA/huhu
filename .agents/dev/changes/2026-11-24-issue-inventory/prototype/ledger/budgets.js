const budgetView = { year:"2026", month:"11", currency:"" };
const currentBudgetQuery = () => ({year:ledgerDay.slice(0,4),month:ledgerDay.slice(5,7),currency:""});
const budgetCategories = ["日常开支","交通","差旅","退款与补贴","工作收入","未分类"];
const budgetTags = {workspace:"工作室",materials:"物料"};
const budgetMonthPattern = "[0-9]{4}-(0[1-9]|1[0-2])";
const budgetNameKey = ({name,type,month}) => JSON.stringify([type,month??null,name.normalize("NFKC").toLowerCase()]);
const budgetKind = (type,direction) => type==="free"?"自由预算":`固定${labels[direction]}预算`;
const monthInput = (name,value,attributes="") =>
  `<input name="${name}" value="${escapeHtml(value)}" pattern="${budgetMonthPattern}" placeholder="YYYY-MM" required ${attributes}>`;

function seedBudgets(book) {
  const fixed = (name,month,limitMinor,direction="expense") => ({name,type:"fixed",currency:"CNY",limitMinor,month,direction,categoryIds:[]});
  const definitions = [
    fixed("日常支出","2026-11","40000"),
    fixed("日常支出","2026-12","50000"),
    fixed("当月收入","2026-11","300000","income"),
    {name:"工作室物料",type:"free",currency:"CNY",limitMinor:"14000",tagIds:["workspace","materials"],from:"2026-11-01"},
  ];
  book.budgets = definitions.map((definition)=>({id:crypto.randomUUID(),bookId:book.id,revision:"1",definition}));
}

function budgetOverview(book,query) {
  const period = query.month?`${query.year}-${query.month}`:query.year;
  const first = query.month?`${period}-01`:`${period}-01-01`;
  const last = query.month?`${period}-${new Date(Date.UTC(Number(query.year),Number(query.month),0)).getUTCDate()}`:`${period}-12-31`;
  const offsetMembers = new Set(book.offsets.flatMap(({members})=>members));
  const records = book.rows.filter(({id,date})=>date>=first&&date<=last&&!offsetMembers.has(id));
  const buckets = new Map();
  const budgets = book.budgets.flatMap((budget)=>{
    const def = budget.definition;
    if(query.currency&&query.currency!==def.currency)return [];
    const fixed = def.type==="fixed";
    if(fixed?!def.month.startsWith(period):(def.from&&def.from>last)||(def.to&&def.to<first))return [];
    const direction = fixed?def.direction:"expense";
    const rows = records.filter((row)=>row.type===direction&&row.currency===def.currency&&(fixed
      ?row.date.startsWith(def.month)&&(!def.categoryIds.length||def.categoryIds.includes(row.category))
      :(!def.from||row.date>=def.from)&&(!def.to||row.date<=def.to)&&row.tagIds?.some((id)=>def.tagIds.includes(id))));
    const actual = rows.reduce((sum,row)=>sum+BigInt(row.amount),0n);
    const limit = BigInt(def.limitMinor);
    const key = JSON.stringify([def.type,direction,def.currency]);
    const group = buckets.get(key)??{type:def.type,direction,currency:def.currency,limit:0n,actual:0n};
    group.limit+=limit;
    group.actual+=actual;
    buckets.set(key,group);
    return [{...budget,limitMinor:def.limitMinor,actualMinor:String(actual),remainingMinor:String(limit-actual),count:rows.length,rows}];
  });
  const totals = [...buckets.values()].map(({limit,actual,...bucket})=>({
    ...bucket,limitMinor:String(limit),actualMinor:String(actual),remainingMinor:String(limit-actual),
  }));
  return {revision:String(book.revision),budgets,totals};
}

function budgetTotalsMarkup(totals) {
  return totals.map(({type,direction,currency,actualMinor,limitMinor})=>
    `<li class="stack budget-total"><span>${budgetKind(type,direction)}</span><small>${money(actualMinor,currency)} / ${money(limitMinor,currency)}</small></li>`).join("");
}

function budgetProgressMarkup({definition,actualMinor,limitMinor,remainingMinor,count}) {
  const actual = BigInt(actualMinor), limit = BigInt(limitMinor);
  const percent = actual>=limit?100:Number(actual*100n/limit);
  const target = definition.direction==="income";
  const difference = BigInt(remainingMinor);
  const amountLabel = target?(difference<0n?"超过目标":"距目标"):(difference<0n?"已超支":"剩余");
  return `<div class="budget-progress stack">
    <progress max="100" value="${percent}" aria-label="${escapeHtml(definition.name)}的预算进度"></progress>
    <span>${money(actualMinor,definition.currency)} / ${money(limitMinor,definition.currency)}</span>
    <small class="meta">${amountLabel} ${money(difference<0n?-difference:difference,definition.currency)} · ${count} 笔</small>
  </div>`;
}

function showBudgets() {
  if(missing("预算"))return;
  const book = bookNow(), {budgets,totals} = budgetOverview(book,budgetView);
  const disabled = ledger.readOnly?"disabled":"";
  pane("预算",escapeHtml(book.title),`<div class="record-filters">
    ${field("预算年份",`<input id="budget-year" type="number" min="1900" max="2100" value="${budgetView.year}">`)}
    ${field("预算月份",`<select id="budget-month">${option("","全年",budgetView.month)}${Array.from({length:12},(_,i)=>{
      const value = String(i+1).padStart(2,"0");
      return option(value,`${i+1} 月`,budgetView.month);
    }).join("")}</select>`)}
    ${field("预算币种",`<select id="budget-currency">${option("","全部币种",budgetView.currency)}${currencyChoices.map((currency)=>option(currency,currency,budgetView.currency)).join("")}</select>`)}
  </div>${totals.length?`<section class="card stack"><h2>${budgetView.month?"月度汇总":"年度汇总"}</h2><ul class="list">${budgetTotalsMarkup(totals)}</ul></section>`:""}
  <section class="card stack"><div class="bar"><h2>预算列表</h2>
    <button id="budget-batch" type="button" disabled>批量编辑</button></div>
  ${budgets.length?`<ul class="list">${budgets.map((budget)=>{
    const {id,definition:def}=budget;
    return `<li class="budget-list-row"><div class="stack">
      <label class="check"><input type="checkbox" value="${id}" data-budget-select ${disabled}><strong>${escapeHtml(def.name)}</strong></label>
      <small class="meta">${budgetKind(def.type,def.direction)} · ${def.type==="fixed"?def.month:[def.from,def.to].filter(Boolean).join(" 至 ")||"不限期间"}</small>
    </div>${budgetProgressMarkup(budget)}
    <div class="row">${button("明细",{className:"small",aria:`查看 ${def.name} 明细`,attrs:`data-budget-detail="${id}"`})}
      ${referenceButton({kind:"budget",id},def.name)}</div></li>`;
  }).join("")}</ul>`:'<p class="empty">所选期间和币种没有预算。</p>'}</section>`,
  button("新增预算",{name:"Plus",className:"primary",attrs:`id=budget-new ${disabled}`})+
  button("跨月复制",{attrs:`id=budget-copy ${disabled}`}));
  for(const key of ["year","month","currency"]){
    by("#budget-"+key).onchange=(event)=>{
      const {value,validity}=event.target;
      if(key==="year"&&(!value||!validity.valid)){event.target.value=budgetView.year;return;}
      budgetView[key]=value;
      showBudgets();
      by("#budget-"+key).focus();
    };
  }
  const selections = () => all("[data-budget-select]:checked").map(({value})=>value);
  all("[data-budget-select]").forEach((checkbox)=>checkbox.onchange=()=>{
    const count = selections().length;
    const edit = by("#budget-batch");
    edit.disabled=!count;
    edit.textContent=count?`批量编辑（${count}）`:"批量编辑";
  });
  bind("budget-batch",()=>budgetEditor(book,book.budgets.filter(({id})=>selections().includes(id))));
  bind("budget-new",()=>budgetEditor(book,[]));
  bind("budget-copy",()=>copyBudgetDialog(book));
  all("[data-budget-detail]").forEach((entry)=>entry.onclick=()=>budgetDetail(book,budgets.find(({id})=>id===entry.dataset.budgetDetail)));
  bindReferenceButtons();
}

function budgetDetail(book,budget) {
  const {id,definition,rows,count}=budget;
  const dialog=modal(`预算明细 · ${definition.name}`,`<div class="dialog-body stack">
    ${budgetProgressMarkup(budget)}
    <div id="budget-detail-rows"></div>
    <p class="meta" id="budget-page-info" role="status"></p></div>
    <footer class="dialog-footer">${referenceButton({kind:"budget",id},definition.name)}
    <button id="budget-prev" type="button">上一页</button><button id="budget-next" type="button">下一页</button><button type="button" data-close autofocus>完成</button></footer>`,{wide:true});
  const pageSize=1, last=Math.max(1,Math.ceil(count/pageSize));
  let page=1;
  function paint() {
    by("#budget-detail-rows",dialog).innerHTML=rows.length?`<div class="scroll-table budget-table" role="region" aria-labelledby="budget-detail-caption" tabindex="0">
      <table><caption id="budget-detail-caption">预算匹配流水</caption><thead><tr><th scope="col">事项</th><th scope="col">业务日期</th><th scope="col">账户</th><th scope="col">金额</th></tr></thead>
      <tbody>${rows.slice((page-1)*pageSize,page*pageSize).map((row)=>`<tr><th scope="row">${escapeHtml(row.title)}</th><td>${row.date}</td><td>${escapeHtml(labelAccount(book,row.account))}</td><td>${money(row.amount,row.currency)}</td></tr>`).join("")}</tbody>
      </table></div>`:'<p class="empty">该预算没有匹配流水。</p>';
    by("#budget-page-info",dialog).textContent=`第 ${page} / ${last} 页 · 共 ${count} 笔`;
    by("#budget-prev",dialog).disabled=page<=1;
    by("#budget-next",dialog).disabled=page>=last;
  }
  bind("budget-prev",()=>{page--;paint();if(page===1)by("#budget-next",dialog).focus();},dialog);
  bind("budget-next",()=>{page++;paint();if(page===last)by("#budget-prev",dialog).focus();},dialog);
  bindReferenceButtons(dialog);
  paint();
}

function budgetEditor(book,selected) {
  if(ledger.readOnly)return;
  const expectedRevision=book.revision;
  const periods = [budgetView.year,budgetView.month||currentBudgetQuery().month].join("-");
  const drafts=selected.length?selected:[{definition:{name:"",type:"fixed",currency:book.currency,limitMinor:null,month:periods,direction:"expense",categoryIds:[]}}];
  const choices=(kind,items,ids)=>Object.entries(items).map(([value,text])=>
    `<label class="check"><input type="checkbox" name="${kind}" value="${escapeHtml(value)}" ${ids?.includes(value)?"checked":""}> ${escapeHtml(text)}</label>`).join("");
  const dialog=modal(selected.length?"批量编辑预算":"新增预算",`<form class="dialog-form"><div class="dialog-body stack">
    ${drafts.map(({definition:def},index)=>`<fieldset class="stack" data-budget-draft><legend>${escapeHtml(def.name||"预算")}</legend>
      <div class="record-filters">
        ${field("预算名称",`<input name="name" required maxlength="100" value="${escapeHtml(def.name)}" ${index===0?"autofocus":""}>`)}
        ${field("预算类型",`<select name="type">${option("fixed","固定预算",def.type)}${option("free","自由预算",def.type)}</select>`)}
        ${field("币种",`<select name="currency">${currencyChoices.map((key)=>option(key,key,def.currency)).join("")}</select>`)}
        ${field("预算额度",`<input name="limit" inputmode="decimal" required value="${def.limitMinor?money(def.limitMinor,def.currency).split(" ")[1].replaceAll(",",""):""}">`)}
      </div>
      <fieldset data-budget-type="fixed" class="stack"><legend>固定预算范围</legend>
        <div class="record-filters">${field("预算所属月份",monthInput("month",def.month??periods))}
        ${field("收支方向",`<select name="direction">${option("expense","支出",def.direction??"expense")}${option("income","收入",def.direction)}</select>`)}</div>
        <fieldset><legend>匹配分类（留空匹配全部）</legend><div class="row">${choices("category",Object.fromEntries(budgetCategories.map((name)=>[name,name])),def.categoryIds)}</div></fieldset>
      </fieldset>
      <fieldset data-budget-type="free" class="stack"><legend>自由预算范围</legend>
        <div class="record-filters">${field("开始日期",`<input type="date" name="from" value="${def.from??""}">`)}
        ${field("结束日期",`<input type="date" name="to" value="${def.to??""}">`)}</div>
        <fieldset><legend>至少选择一个支出标签</legend><div class="row">${choices("tag",budgetTags,def.tagIds)}</div></fieldset>
      </fieldset></fieldset>`).join("")}
    <p class="notice err" id="budget-edit-error" role="alert" hidden></p></div>
    <footer class="dialog-footer"><button type="button" data-close>取消</button><button type="submit" class="primary">保存预算</button></footer></form>`,{wide:true});
  const form=by("form",dialog);
  const rows=all("[data-budget-draft]",form);
  for(const row of rows){
    const type=by("[name=type]",row);
    const sync=()=>all("[data-budget-type]",row).forEach((fields)=>{
      fields.disabled=fields.hidden=fields.dataset.budgetType!==type.value;
    });
    type.onchange=sync;
    sync();
  }
  form.onsubmit=(event)=>{
    event.preventDefault();
    const slot=by("#budget-edit-error",dialog);
    const fail=(text)=>{slot.hidden=false;slot.textContent=text;};
    const names=new Set(book.budgets.filter((budget)=>!selected.includes(budget)).map(({definition})=>budgetNameKey(definition)));
    const saved=[];
    for(const [index,row] of rows.entries()){
      const input=(key)=>by(`[name=${key}]`,row).value;
      const checked=(key)=>all(`[name=${key}]:checked`,row).map(({value})=>value);
      const name=input("name").trim(),currency=input("currency"),type=input("type"),limitMinor=minor(input("limit"),currency);
      if(!name||!limitMinor)return fail("请输入预算名称与符合币种精度的正数额度。");
      const definition={name,currency,type,limitMinor};
      if(type==="fixed")Object.assign(definition,{month:input("month"),direction:input("direction"),categoryIds:checked("category")});
      else {
        const tagIds=checked("tag"),from=input("from"),to=input("to");
        if(!tagIds.length||from&&to&&from>to)return fail("自由预算需要至少一个标签，开始日期须早于或等于结束日期。");
        Object.assign(definition,{tagIds,...(from&&{from}),...(to&&{to})});
      }
      const key=budgetNameKey(definition);
      if(names.has(key))return fail(`同类预算已有「${name}」，草稿已保留。`);
      names.add(key);
      saved.push({id:drafts[index].id??crypto.randomUUID(),bookId:book.id,revision:String(book.revision+1),definition});
    }
    if(book.revision!==expectedRevision||takeFault("stale"))return fail("账本已变化。请重新打开编辑。");
    if(takeFault("write"))return fail("写入失败，草稿已保留，可重试。");
    book.budgets=[...book.budgets.filter((budget)=>!selected.includes(budget)),...saved];
    book.revision++;
    dialog.close();
    showBudgets();
    by("#budget-new")?.focus();
    setStatus(`已保存 ${saved.length} 项预算。`);
  };
}

function copyBudgetDialog(book) {
  if(ledger.readOnly)return;
  const source=[budgetView.year,budgetView.month||currentBudgetQuery().month].join("-");
  const [year,month]=source.split("-").map(Number);
  const next=(offset)=>new Date(Date.UTC(year,month-1+offset,1)).toISOString().slice(0,7);
  const expectedRevision=book.revision;
  const dialog=modal("跨月复制固定预算",`<form class="dialog-form"><div class="dialog-body stack">
    ${field("源月份",monthInput("source",source,"autofocus"))}
    ${field("目标月份",monthInput("target",next(1)))}
    <div class="stack" id="extra-targets"></div><div><button id="add-target" type="button">添加目标月</button></div>
    <p class="meta">跳过目标月份同名的固定预算，保留已有规则。</p>
    <p class="notice err" id="copy-budget-error" role="alert" hidden></p><div id="copy-budget-result" class="stack" role="status"></div>
    </div><footer class="dialog-footer"><button type="button" id="close-copy-budget" data-close>取消</button><button class="primary" type="submit">确认复制</button></footer></form>`);
  const form=by("form",dialog);
  let submitted=false;
  let targetCount=1;
  bind("add-target",()=>{
    targetCount++;
    by("#extra-targets",dialog).insertAdjacentHTML("beforeend",field(`目标月份 ${targetCount}`,monthInput("target",next(targetCount))));
    by("#extra-targets label:last-child input",dialog).focus();
  },dialog);
  form.onsubmit=(event)=>{
    event.preventDefault();
    if(submitted)return;
    const params=new FormData(form),from=params.get("source"),targets=params.getAll("target");
    const slot=by("#copy-budget-error",dialog);
    const fail=(text)=>{slot.textContent=text;slot.hidden=false;};
    if(new Set(targets).size!==targets.length)return fail("目标月份不能重复。");
    const originals=book.budgets.filter(({definition})=>definition.type==="fixed"&&definition.month===from);
    if(!originals.length)return fail("所选来源月没有固定预算。");
    if(book.revision!==expectedRevision||takeFault("stale"))return fail("账本已变化。请重新打开复制。");
    if(takeFault("write"))return fail("复制失败，所选月份已保留，可重试。");
    const known=new Map(book.budgets.map(({id,definition})=>[budgetNameKey(definition),id]));
    const result={created:0,skipped:[]};
    for(const month of targets)for(const budget of originals){
      const definition={...budget.definition,month};
      const key=budgetNameKey(definition),existingId=known.get(key);
      if(existingId)result.skipped.push({month,name:definition.name,existingId});
      else{
        const id=crypto.randomUUID();
        book.budgets.push({id,bookId:book.id,revision:String(book.revision+1),definition});
        known.set(key,id);
        result.created++;
      }
    }
    if(result.created)book.revision++;
    submitted=true;
    slot.hidden=true;
    all("input, #add-target, button[type=submit]",form).forEach((control)=>control.disabled=true);
    by("#copy-budget-result",dialog).innerHTML=`<p>已创建 ${result.created} 项，跳过 ${result.skipped.length} 项。</p>
      ${result.skipped.length?`<ul class="list">${result.skipped.map(({month,name})=>`<li>${month} · ${escapeHtml(name)} · 保留已有同名预算</li>`).join("")}</ul>`:""}`;
    const done=by("#close-copy-budget",dialog);
    done.textContent="完成";
    done.focus();
    setStatus(`已复制 ${result.created} 项固定预算。`);
  };
  dialog.addEventListener("close",()=>{
    if(submitted){showBudgets();by("#budget-copy")?.focus();}
  },{once:true});
}
