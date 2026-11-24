const widgetCatalog = {
  focus:{ title:"专注计时", group:"效率", source:"首页", icon:"Clock", desc:"查看当前专注阶段和原计划。", w:2,h:2,max:1 },
  tasks:{ title:"我的待办", group:"效率", source:"任务", icon:"ListTodo", desc:"查看待办、截止日期及等待答复。", w:2,h:2,max:2 },
  notes:{ title:"日记速览", group:"知识", source:"知识库", icon:"Notebook", desc:"在首页打开最近编辑的日记。", w:2,h:2,max:1 },
  mail:{ title:"邮件摘要", group:"沟通", source:"邮件", icon:"Mail", desc:"快速返回最近来信与发件结果。", w:2,h:2,max:1 },
  sync:{ title:"版本状态", group:"维护", source:"版本与同步", icon:"GitBranch", desc:"查看同步状态和周期安排。", w:2,h:2,max:1 },
};
const dashboard = {
  saved:[{id:"focus-one", type:"focus",x:0,y:0,w:2,h:2},{id:"task-one",type:"tasks",x:2,y:0,w:2,h:2},{id:"journal-one",type:"notes",x:0,y:2,w:2,h:2,hidden:true}],
  draft:null, saveFault:false, sourceBlocked:false,
};
const cards = () => dashboard.draft ?? dashboard.saved;

function cardContent(type) {
  const pending = tasks.records.filter(({ state }) => state === "待办" || state === "等待答复");
  const items = {
    focus:`<strong class="widget-number">25:00</strong><span class="meta">下一次专注 · 未开始</span>${planLink("plan-focus","查看专注计划")}`,
    tasks:`<strong class="widget-number">${pending.length} 项</strong><span class="meta">待办和等待你答复的任务</span>${button("打开任务",{attrs:'data-route="tasks"',className:"small quiet"})}`,
    notes:`<strong>${notes.current} · 日记</strong><span class="meta">最近打开的记录</span>${button("打开日记",{attrs:'data-route="notes"',className:"small quiet"})}`,
    mail:dashboard.sourceBlocked ? '<span class="callout warn">邮件模块不可用，卡片位置已保留。</span>' : `<strong>${mail.threads.length} 封会话</strong>${button("打开邮件",{attrs:'data-route="mail"',className:"small quiet"})}`,
    sync:`<strong>工作区已同步</strong><span class="meta">当前分支 · ${escapeHtml(syncSettings.branch)}</span>${planLink("plan-git","查看同步计划")}`,
  };
  return items[type];
}

function cardPlacement(item) {
  return `grid-area:${item.y+1}/${item.x+1}/span ${item.h}/span ${item.w}`;
}

function moveCard(item, proposed) {
  const previous = {x:item.x,y:item.y,w:item.w,h:item.h};
  for (const [key,value] of Object.entries(proposed)) item[key]=value;
  item.w=Math.max(1,Math.min(4,item.w));
  item.h=Math.max(2,Math.min(5,item.h));
  item.x=Math.max(0,Math.min(4-item.w,item.x));
  item.y=Math.max(0,item.y);
  const overlaps = (left,right) => left.x < right.x+right.w && left.x+left.w > right.x && left.y < right.y+right.h && left.y+left.h > right.y;
  const others = cards().filter((candidate)=>candidate!==item && !candidate.hidden);
  const collided=others.filter((candidate)=>overlaps(candidate,item));
  if (collided.length===1 && previous.w===item.w && previous.h===item.h && collided[0].w===item.w && collided[0].h===item.h && !others.some((other)=>other!==collided[0] && overlaps(other,previous)) && !overlaps(previous,item)) {
    collided[0].x=previous.x;
    collided[0].y=previous.y;
  } else {
    for (const touched of collided) {
      touched.y=item.y+item.h;
      while (others.some((other)=>other!==touched && overlaps(other,touched))) touched.y+=1;
    }
  }
  all("[data-widget]",main).forEach((element)=>{
    const card=cards().find(({id})=>id===element.dataset.widget);
    element.style.cssText=cardPlacement(card);
  });
  by("#grid-live").textContent=`${widgetCatalog[item.type].title} · 第 ${item.x+1} 列、第 ${item.y+1} 行 · ${item.w}×${item.h}`;
}

function addWidget() {
  const dialog=modal("添加卡片",`<div class="dialog-body stack"><div class="row">
    ${field("搜索卡片",'<input id="widget-query" type="search" placeholder="搜索名称、来源或用途" autofocus>')}
    ${field("分类",'<select id="widget-kind"><option>全部</option><option>效率</option><option>知识</option><option>沟通</option><option>维护</option></select>')}
    </div><div class="widget-directory" id="widget-directory"></div></div>
    <footer class="dialog-footer"><button type="button" data-close>完成</button></footer>`,{wide:true});
  const paint = () => {
    const query=by("#widget-query",dialog).value.trim().toLowerCase();
    const category=by("#widget-kind",dialog).value;
    const entries=Object.entries(widgetCatalog).filter(([,definition])=>
      (category==="全部"||definition.group===category) && (definition.title+definition.source+definition.desc).toLowerCase().includes(query));
    by("#widget-directory",dialog).innerHTML=entries.map(([type,definition])=>{
      const instances=cards().filter((item)=>item.type===type);
      const hidden=instances.some((item)=>item.hidden);
      const blocked=dashboard.sourceBlocked && type==="mail";
      const addable=instances.length<definition.max;
      return `<article class="card stack catalog-card"><div class="bar"><span class="widget-icon">${icon(definition.icon)}</span><span class="widget-size" aria-label="${definition.w}列 ${definition.h}行">${definition.w}×${definition.h}</span></div>
      <div><h3>${definition.title}</h3><small>${definition.source} · ${definition.group}</small></div><p>${definition.desc}</p>
      ${button(blocked?"插件不可用":hidden?"恢复隐藏卡片":addable?instances.length?"再添加一个":"添加":"已添加",{
        className:addable||hidden?"small primary":"small",attrs:`data-widget-add="${type}" ${blocked||(!addable&&!hidden)?"disabled":""}` })}</article>`;
    }).join("")||'<p class="empty">没有匹配的卡片。</p>';
    all("[data-widget-add]",dialog).forEach((entry)=>entry.onclick=()=>{
      const type=entry.dataset.widgetAdd;
      const hidden=cards().find((item)=>item.type===type&&item.hidden);
      const y=cards().reduce((bottom,item)=>item.hidden?bottom:Math.max(bottom,item.y+item.h),0);
      if (hidden) { hidden.hidden=false; hidden.y=y; }
      else {
        const definition=widgetCatalog[type];
        cards().push({id:crypto.randomUUID(),type,x:0,y,w:definition.w,h:definition.h});
      }
      paint();
      showDashboard();
      by("#widget-query",dialog).focus();
    });
  };
  by("#widget-kind",dialog).onchange=paint;
  by("#widget-query",dialog).oninput=paint;
  paint();
}

function showDashboard() {
  const editing=dashboard.draft!==null;
  const actions=editing? button("添加卡片",{name:"Plus",attrs:"id=add-widget"})+button("取消编辑",{attrs:"id=cancel-grid"})+button("保存布局",{name:"Check",className:"primary",attrs:"id=save-grid"})
    :button("编辑布局",{name:"LayoutGrid",attrs:"id=edit-grid"});
  main.innerHTML=`<div class="module-container stack">${heading("首页看板","",actions)}
    ${editing?'<p class="meta">拖动卡头移动，拖动右下角缩放。聚焦手柄后可按方向键，Shift 加方向键缩放。</p>':""}
    <p id="grid-live" role="status" class="meta" ${editing?"":"hidden"}></p>
    <div class="dashboard-grid" aria-label="首页卡片">${cards().filter(({hidden})=>!hidden).map((item)=>{
      const definition=widgetCatalog[item.type];
      return `<article class="card dashboard-card" data-widget="${item.id}" style="${cardPlacement(item)}">
        <header class="bar"><div class="row">
        ${editing?button("",{name:"Grip",aria:`移动${definition.title}`,className:"quiet small grid-grip",attrs:`data-move-card="${item.id}"`}):icon(definition.icon)}
        <h2>${definition.title}</h2></div>
        ${editing?button("",{name:"Eye",aria:`隐藏${definition.title}`,className:"quiet small",attrs:`data-hide-card="${item.id}"`}):""}</header>
        <div class="widget-body stack">${cardContent(item.type)}</div>
        ${editing?button("",{name:"Maximize2",aria:`缩放${definition.title}`,className:"quiet small resize-grip",attrs:`data-resize-card="${item.id}"`}):""}
      </article>`;
    }).join("")}</div></div>`;
  bind("edit-grid",()=>{dashboard.draft=structuredClone(dashboard.saved);showDashboard();by("#add-widget").focus();});
  bind("cancel-grid",()=>{dashboard.draft=null;showDashboard();by("#edit-grid").focus();setStatus("已恢复上一次保存的布局。");});
  bind("save-grid",()=>{
    if(dashboard.saveFault){dashboard.saveFault=false;by('[data-demo="grid-save"]').value="ok";by("#grid-live").textContent="保存冲突，当前布局仍保留，检查后可重试。";return;}
    dashboard.saved=structuredClone(dashboard.draft);dashboard.draft=null;showDashboard();by("#edit-grid").focus();setStatus("布局已保存。");
  });
  bind("add-widget",addWidget);
  all("[data-hide-card]",main).forEach((entry)=>entry.onclick=()=>{
    cards().find(({id})=>id===entry.dataset.hideCard).hidden=true;
    showDashboard();
  });
  const grid=by(".dashboard-grid",main);
  all("[data-move-card], [data-resize-card]",grid).forEach((handle)=>{
    const item=cards().find(({id})=>id===(handle.dataset.moveCard||handle.dataset.resizeCard));
    const isResize=Boolean(handle.dataset.resizeCard);
    const change=(start,dx,dy,resize)=>moveCard(item,resize?{w:start.w+dx,h:start.h+dy}:{x:start.x+dx,y:start.y+dy});
    handle.onkeydown=(event)=>{
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const dx={ArrowLeft:-1,ArrowRight:1}[event.key]??0;
      const dy={ArrowUp:-1,ArrowDown:1}[event.key]??0;
      change({...item},dx,dy,isResize||event.shiftKey);
    };
    handle.onpointerdown=(event)=>{
      if(event.button!==0)return;
      const start={...item,x0:event.clientX,y0:event.clientY};
      const snapshot=cards().map((card)=>[card,{x:card.x,y:card.y,w:card.w,h:card.h}]);
      const column=(grid.clientWidth+10)/4;
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("dragging");
      let last="";
      handle.onpointermove=(next)=>{
        const dx=Math.round((next.clientX-start.x0)/column);
        const dy=Math.round((next.clientY-start.y0)/82);
        if(last===`${dx},${dy}`)return;
        last=`${dx},${dy}`;
        for (const [card,position] of snapshot) Object.assign(card,position);
        change(start,dx,dy,isResize);
      };
      handle.onpointerup=()=>{
        handle.classList.remove("dragging");
        handle.onpointermove=null;
      };
      handle.onpointercancel=()=>{
        for (const [card,position] of snapshot) Object.assign(card,position);
        handle.onpointermove=null;
        showDashboard();
      };
    };
  });
}
