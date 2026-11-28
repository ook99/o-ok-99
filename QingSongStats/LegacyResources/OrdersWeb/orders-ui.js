(()=>{'use strict';const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=n=>(Number(n||0)/100).toLocaleString('zh-CN',{maximumFractionDigits:2});let data={details:[],declarants:[],recordOwners:new Set()},person='',detailPeople=[],tab='settlement',original=false,selection=false,chosen=new Set();
let projection={people:[],outcomes:new Map(),sequences:new Map()},settlementMode='regular';
let detailProjectionCache=null,aliasIndex=new Map(),recordSearchText=new WeakMap();
function aliasesFor(name){return aliasIndex.get(name)||[];}
function resetSearchIndex(settings){
 aliasIndex=new Map();recordSearchText=new WeakMap();
 for(const [alias,name] of Object.entries(settings?.declarantAliases||{})){if(!aliasIndex.has(name))aliasIndex.set(name,[]);aliasIndex.get(name).push(alias);}
}
function searchText(detail){
 let text=recordSearchText.get(detail);
 if(text===undefined){
  const name=detail.record.person;
  text=[name,...aliasesFor(name),...detail.sourceGroups.map(group=>group.source)].join('\n').toLocaleLowerCase();
  recordSearchText.set(detail,text);
 }
 return text;
}
function currentDetailProjection(){
 const key=JSON.stringify(['orderSearch','orderFilterRegion','orderFilterDeclarant','orderFilterPlay'].map(id=>$('#'+id).value).concat(detailPeople.length?detailPeople:[person]));
 if(detailProjectionCache&&detailProjectionCache.data===data&&detailProjectionCache.key===key)return detailProjectionCache.value;
 const selected=new Set(detailPeople.length?detailPeople:[person]);const value=OrderProjection.project(scopedDetails().filter(d=>selected.has(d.record.person)));detailProjectionCache={data,key,value};return value;
}
function deferredSearch(renderFn){let timer;return ()=>{clearTimeout(timer);timer=setTimeout(renderFn,120);};}
const send=(action,value={})=>{if(action==='settle'||action==='delete'){const owners=value.people||[value.person];const ds=scopedDetails().filter(d=>owners.includes(d.record.person)&&(action!=='settle'||!d.record.settlement));value.ids=ds.map(d=>d.record.id);value.revision=data.revision;const regions=[...new Set(ds.map(d=>d.record.market))];if(regions.length>1){if(action==='settle'){value.batches=regions.map(m=>({market:m,recordIds:ds.filter(d=>d.record.market===m).map(d=>d.record.id)}));OrderHost.send('settleBatch',JSON.stringify(value));return;}OrderHost.send('notice',JSON.stringify({text:'删除订单请先筛选一个彩种'}));return;}value.market=regions[0];}OrderHost.send(action,JSON.stringify(value))};
window.ordersReceive=v=>{
 resetSearchIndex(v.settings);
 const details=v.details||[],summaries=new Map(),recordOwners=new Set(),playLabels=new Set();
 for(const detail of details){
  const record=detail.record,name=record.person||'默认';
  recordOwners.add(record.person);
  let summary=summaries.get(name);
  if(!summary){summary={name,count:0,totalCents:0};summaries.set(name,summary);}
  summary.count+=detail.sourceGroups.length;
  summary.totalCents+=record.totalCents;
  for(const item of record.items)playLabels.add(item.kindLabel);
 }
 data={...v,details,declarants:[...summaries.values()],recordOwners};
 if(window.ordersDraws&&Object.prototype.hasOwnProperty.call(v,'draws'))window.ordersDraws(v.draws||{});
 for(const [id,values,label] of [['orderFilterDeclarant',data.declarants.map(p=>p.name),'全部申报人'],['orderFilterPlay',[...playLabels],'全部玩法']]){
  const select=$('#'+id),old=select.value;
  select.innerHTML='<option value="">'+label+'</option>'+values.map(value=>'<option>'+esc(value)+'</option>').join('');
  select.value=old;
 }
 render();
};
function scopedDetails(){
 const query=$('#orderSearch').value.trim().toLocaleLowerCase(),region=$('#orderFilterRegion').value,owner=$('#orderFilterDeclarant').value,play=$('#orderFilterPlay').value;
 return data.details.filter(detail=>{
  const record=detail.record;
  return (!region||record.market===region)&&(!owner||record.person===owner)&&(!play||record.items.some(item=>item.kindLabel===play))&&(!query||searchText(detail).includes(query));
 });
}
function people(){const map=new Map();for(const d of scopedDetails()){const r=d.record;let p=map.get(r.person);if(!p){p={name:r.person,count:0,totalCents:0};map.set(r.person,p)}p.count+=d.sourceGroups.length;p.totalCents+=r.totalCents}const q=$('#orderSearch').value.trim().toLocaleLowerCase();if(!$('#orderFilterRegion').value&&!$('#orderFilterPlay').value){for(const name of directoryNames()){if(!map.has(name)&&(!q||name.toLocaleLowerCase().includes(q))&&(!$('#orderFilterDeclarant').value||$('#orderFilterDeclarant').value===name))map.set(name,{name,count:0,totalCents:0})}}return [...map.values()]}
function render(){const ps=people();$('#selectionStatus').textContent=selection?'已选 '+chosen.size+' 人':'共 '+ps.length+' 人';$('.declarant-area').classList.toggle('edit-mode',selection);$('#declarantList').innerHTML=ps.map(p=>`<button class="declarant-row ${chosen.has(p.name)?'selected':''}" data-person="${esc(p.name)}"><span class="select-dot selection-state" ${selection?'':'hidden'}></span><span class="declarant-avatar">${esc(p.name.slice(0,1))}</span><span class="declarant-copy"><strong>${esc(p.name)}</strong><small>${esc(aliasesFor(p.name).join('、'))}</small></span><span class="declarant-metric"><small>共${p.count}笔</small><b>¥${money(p.totalCents)}</b></span><svg class="declarant-chevron" viewBox="0 0 20 20"><path d="M7 4l6 6-6 6"/></svg></button>`).join('');$('#orderEmpty').hidden=ps.length>0;$('#orderEmpty').classList.toggle('show',!ps.length);$('#bulkActions').style.display=selection?'grid':'none';$('#editDeclarants').textContent=selection?'完成':'选择';if(person&&!$('#personDirectory').classList.contains('show'))renderDetail();}
let detailRenderEpoch=0,detailRenderComplete=Promise.resolve(),detailVirtual=null;
function stopDetailRendering(){++detailRenderEpoch;if(detailVirtual){detailVirtual.observer.disconnect();detailVirtual=null;}}
function orderRenderGroups(item,isOriginal){const groups=new Map();item.items.forEach((entry,index)=>{if(isOriginal)groups.set(entry.group.id,{total:(entry.originalEntries||[entry]).reduce((sum,c)=>sum+Number(c.total),0),lastIndex:index});else{const g=groups.get(entry.group.id)||{total:0,lastIndex:index};g.total+=Number(entry.total);g.lastIndex=index;groups.set(entry.group.id,g);}});return groups;}
function renderOrderJobs(jobs,outcomes,isOriginal){
 stopDetailRendering();const epoch=detailRenderEpoch,host=$('#detailOrders');host.innerHTML='';host.dataset.orderCount=String(jobs.reduce((n,j)=>n+j.end-j.start,0));
 if(tab!=='orders'){detailRenderComplete=Promise.resolve();return;}
 const renderer=isOriginal?OrderDonorRenderers.detailOriginalOrdersMarkup:OrderDonorRenderers.detailOrdersMarkup;
 const chunks=[],sc=$('.detail-content');
 const mount=entry=>{if(entry.mounted)return;entry.node.style.height='';entry.node.innerHTML=renderer(entry.item,outcomes,entry);entry.mounted=true;};
 const observer=new IntersectionObserver(entries=>{if(epoch!==detailRenderEpoch)return;for(const observation of entries){const entry=observation.target.__orderChunk;if(observation.isIntersecting)mount(entry);else if(entry.mounted){const height=entry.node.getBoundingClientRect().height;entry.node.style.height=height+'px';entry.node.replaceChildren();entry.mounted=false;}}},{root:sc,rootMargin:'600px 0px'});
 const fragment=document.createDocumentFragment();let owner=null;
 for(const job of jobs){if(job.owner&&job.owner!==owner){const title=document.createElement('h3');title.className='detail-owner-name';title.textContent=job.owner;fragment.append(title);owner=job.owner;}
 const node=document.createElement('div');node.className='order-window-chunk';const entry={...job,node,mounted:false};node.__orderChunk=entry;node.style.height=((job.end-job.start)*52)+'px';chunks.push(entry);fragment.append(node);}
 host.append(fragment);detailVirtual={observer,chunks,renderer,outcomes};chunks.slice(0,2).forEach(mount);chunks.forEach(e=>observer.observe(e.node));detailRenderComplete=Promise.resolve();
}
function renderOrderRows(item,outcomes,isOriginal){
 const groups=orderRenderGroups(item,isOriginal),jobs=[];for(let start=0;start<item.items.length;start+=50)jobs.push({item,groups,start,end:Math.min(start+50,item.items.length)});renderOrderJobs(jobs,outcomes,isOriginal);
}
function renderDetail(){
 const scope=currentDetailProjection(),multiple=detailPeople.length>=2;
 const people=scope.people,primary=multiple?people[0]:people.find(row=>row.name===person);
 if(!primary)return;
 OrderDonorRenderers.setSequences(scope.sequences);
 const showsOrders=tab==='orders',form=settlementMode==='form',settlement=$('#detailSettlement');
 $('.detail-identity').hidden=multiple;
 $('#declarantDetail').classList.add('show');
 $('#declarantDetail').classList.toggle('show-order-modes',showsOrders);
 $('#detailName').textContent=person;
 $('#detailAvatar').textContent=person.slice(0,1);
 $('#detailTitle').textContent=showsOrders?'订单详情':multiple?'订单兑奖':person;
 $('#detailNicknames').textContent='';
 $('#detailNicknames').hidden=true;
 const pricing=personPricingName();
 $('#detailPricing').textContent='赔率方案：'+(pricing==='默认赔率'?'默认系统赔率':pricing);

 if(showsOrders){
  if(settlement.firstChild)settlement.replaceChildren();
  if(multiple)renderMultipleOrderRows(people,scope);
  else{
   const query=$('#detailSearch').value.trim();
   const items=(original?primary.originalItems:primary.items).filter(entry=>!query||(original?entry.order.sourceGroupText:entry.prefix+' '+entry.body).includes(query));
   renderOrderRows({...primary,items},original?scope.originalOutcomes:scope.outcomes,original);
  }
 }else{
  renderOrderJobs([],null,original);
  const controls='<div class="risk-tabs settlement-display-controls" role="tablist" aria-label="兑奖显示方式"><button data-settlement-display="regular" class="'+(form?'':'active')+'">常规兑奖</button><button data-settlement-display="form" class="'+(form?'active':'')+'">表单兑奖</button></div>';
  settlement.innerHTML=controls+(multiple?people:[primary]).map(row=>{
   if(row.pending){
    if(multiple)return '<pre class="settlement-sheet">'+esc(row.name)+'尚未开奖</pre>';
    const amounts=row.settlement.parentOrders.map(group=>String(Math.round(group.totalAmount*100)/100));
    return '<pre class="settlement-sheet">订单金额：'+esc(amounts.join('+')+'='+String(Math.round(row.settlement.orderTotal*100)/100))+'<br><br>部分订单尚未开奖，请前往开奖页面开奖</pre>';
   }
   if(form)return OrderDonorRenderers.formSettlementCard(row.settlement,OrderDonorRenderers.formSettlementLayout());
   return '<section class="settlement-person"><pre class="settlement-sheet">'+OrderDonorRenderers.settlementDisplayMarkup(row.settlement)+'</pre></section>';
  }).join('');
 }
 $('#detailShareActions').hidden=!showsOrders&&form&&(multiple?people.every(row=>!row.pending):!primary.pending);
 document.querySelectorAll('[data-detail-tab]').forEach(button=>{
  const active=button.dataset.detailTab===tab;
  button.classList.toggle('active',active);
  button.setAttribute('aria-selected',String(active));
  button.style.color=active?'#1599e8':'#333';
 });
 document.querySelectorAll('[data-settlement-display]').forEach(button=>button.style.color=showsOrders?'#333':'#1599e8');
 document.querySelectorAll('[data-detail-order-mode]').forEach(button=>button.style.color=showsOrders?'#1599e8':'#333');
 $('#detailOrders').classList.toggle('active',showsOrders);
 settlement.classList.toggle('active',!showsOrders);
 $('#detailOrderModes').hidden=!showsOrders;
 $('#detailSearchForm').hidden=!showsOrders;
 $('#detailEditHint').hidden=!showsOrders;
}
function renderMultipleOrderRows(people,scope){
 const jobs=[],query=$('#detailSearch').value.trim();
 for(const p of people){const item={...p,items:(original?p.originalItems:p.items).filter(e=>!query||(original?e.order.sourceGroupText:e.prefix+' '+e.body).includes(query))},groups=orderRenderGroups(item,original);for(let start=0;start<item.items.length;start+=50)jobs.push({owner:p.name,item,groups,start,end:Math.min(start+50,item.items.length)});}
 renderOrderJobs(jobs,original?scope.originalOutcomes:scope.outcomes,original);
}
$('#detailSettlement').onclick=e=>{const mode=e.target.closest('[data-settlement-display]'),water=e.target.closest('[data-water-toggle]');if(mode){settlementMode=mode.dataset.settlementDisplay;renderDetail()}else if(water){OrderDonorRenderers.toggleWater(water.dataset.waterKey);renderDetail()}};
$('#declarantList').onclick=e=>{const row=e.target.closest('[data-person]');if(!row)return;const n=row.dataset.person;if(selection){chosen.has(n)?chosen.delete(n):chosen.add(n);render()}else{person=n;detailPeople=[n];if(!data.recordOwners.has(n)){openSettings();return}send('person',{person});renderDetail()}};
$('#closeDeclarantDetail').onclick=()=>{stopDetailRendering();person='';detailPeople=[];$('#declarantDetail').classList.remove('show')};$('#editDeclarants').onclick=()=>{selection=!selection;chosen.clear();render()};$('#selectAllDeclarants').onclick=()=>{chosen.size===people().length?chosen.clear():people().forEach(p=>chosen.add(p.name));render()};$('#viewDeclarants').onclick=()=>{if(chosen.size){detailPeople=[...chosen];person=detailPeople[0];send('person',{person});renderDetail()}else send('notice',{text:'请先选择申报人'})};$('#deleteDeclarants').onclick=()=>{if(!chosen.size){send('notice',{text:'请先选择申报人'});return}const names=[...chosen],withOrders=names.filter(n=>data.recordOwners.has(n));if(!withOrders.length){send('deleteDeclarants',{names,revision:data.revision});return}if(withOrders.length!==names.length){send('notice',{text:'请分开选择：空申报人可删除姓名，有订单的申报人可删除订单'});return}send('delete',{people:names})};$('#orderSearchForm').onsubmit=e=>{e.preventDefault();render()};$('#orderSearch').oninput=deferredSearch(render);$('#clearOrderSearch').onclick=()=>{$('#orderSearch').value='';render()};$('#toggleOrderFilters').onclick=()=>{$('#orderFilters').hidden=!$('#orderFilters').hidden};$('#orderFilterRegion').innerHTML='<option value="">全部彩种</option>'+['新澳','香港','老澳门'].map(m=>`<option>${m}</option>`).join('');$('#orderFilterRegion').onchange=render;$('#orderFilterDeclarant').onchange=render;$('#orderFilterPlay').onchange=render;$('#resetOrderFilters').onclick=()=>{for(const id of ['orderFilterRegion','orderFilterDeclarant','orderFilterPlay'])$('#'+id).value='';render()};document.querySelectorAll('[data-detail-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.detailTab;renderDetail()});document.querySelectorAll('[data-detail-order-mode]').forEach(b=>b.onclick=()=>{original=b.dataset.detailOrderMode==='original';document.querySelectorAll('[data-detail-order-mode]').forEach(x=>x.classList.toggle('active',x===b));renderDetail()});$('#detailSearch').oninput=deferredSearch(renderDetail);$('#shareDetailImage').onclick=()=>send('share',{person});$('#openDeclarantSettings').onclick=()=>send('settings',{person});$('#refreshDraws').onclick=()=>{setDrawExpanded(true);if(!Object.keys(currentDraws).length)send('draw')};$('#drawCollapsedBar').onclick=()=>$('#drawBoard').classList.toggle('is-collapsed');$('#detailOrders').onclick=e=>{const r=e.target.closest('[data-order-id]');if(r)send('detail',{id:r.dataset.orderId.slice(0,r.dataset.orderId.lastIndexOf(':'))})};$('#detailOrders').oncontextmenu=e=>{e.preventDefault();const r=e.target.closest('[data-order-id]');if(r)send('editMenu',{id:r.dataset.orderId.slice(0,r.dataset.orderId.lastIndexOf(':'))})};document.querySelectorAll('[data-sketch-icon]').forEach(el=>{const icon=AndroidSketchIcons[el.dataset.sketchIcon];if(icon){el.innerHTML=icon.markup;el.setAttribute('viewBox',icon.viewBox)}});function savePerson(patch){const aliases=Object.keys(data.settings?.declarantAliases||{}).filter(a=>data.settings.declarantAliases[a]===person);send('personSettings',{name:person,aliases,revision:data.revision,...patch})}
function openSettings(){const s=data.settings||{};$('#declarantSettingsTitle').textContent=person+'设置';$('#declarantNameLabel').textContent=person;renderPersonPricing();$('#declarantSettings').classList.add('show')}
$('#openDeclarantSettings').onclick=openSettings;$('#closeDeclarantSettings').onclick=()=>$('#declarantSettings').classList.remove('show');
function choices(trigger,panel,options,selected,choose){const box=$(panel);box.innerHTML=options.map(([value,label])=>'<button type="button" class="aui-select-option '+(value===selected?'selected':'')+'" data-value="'+esc(value)+'">'+esc(label)+'</button>').join('');$(trigger).onclick=()=>{box.style.display=box.style.display==='block'?'none':'block'};box.onclick=e=>{const b=e.target.closest('[data-value]');if(b){choose(b.dataset.value);box.style.display='none'}}}
window.ordersBack=()=>{if($('#declarantSettings').classList.contains('show')){$('#declarantSettings').classList.remove('show');return true}if($('#declarantDetail').classList.contains('show')){stopDetailRendering();$('#declarantDetail').classList.remove('show');person='';detailPeople=[];return true}return false};

function detailTextNumber(value){return String(Number(Number(value||0).toFixed(2)));}
function copyCurrentDetails(selectedPerson){
 const scope=currentDetailProjection(),selected=new Set(selectedPerson?[selectedPerson]:(detailPeople.length?detailPeople:[person]));
 OrderDonorRenderers.setSequences(scope.sequences);
 const sections=scope.people.filter(row=>selected.has(row.name)).map(row=>{
  if(tab==='orders'){
   const query=$('#detailSearch').value.trim(),items=(original?row.originalItems:row.items).filter(entry=>!query||(original?entry.order.sourceGroupText:entry.prefix+' '+entry.body).includes(query));
   const renderer=original?OrderDonorRenderers.detailOriginalOrdersMarkup:OrderDonorRenderers.detailOrdersMarkup,container=document.createElement('div');
   // Rebuild every matching row, including those outside the virtual scroll window.
   container.innerHTML=renderer({...row,items},original?scope.originalOutcomes:scope.outcomes);
   const lines=[...container.querySelectorAll('[data-order-id]')].map(element=>{
    const number=element.querySelector('.detail-order-sequence:not(.detail-order-sequence-empty)')?.textContent||'',prefix=element.querySelector('.detail-order-prefix strong')?.textContent||'',body=element.querySelector('p')?.textContent||'',status=[...element.querySelectorAll('.detail-order-win,.detail-order-review,.detail-original-status')].map(node=>node.textContent),amount=element.querySelector('.detail-order-total')?.textContent;
    return [[number,prefix].filter(Boolean).join(' '),body,...status,amount?'金额:'+amount.replace(/^¥/,''):''].filter(Boolean).join('\n');
   });
   return '申报人:'+row.name+'\n'+(lines.length?lines.join('\n\n'):'没有符合筛选条件的订单');
  }
  if(row.pending)return ['申报人:'+row.name,'订单金额：'+row.settlement.parentOrders.map(group=>detailTextNumber(group.totalAmount)).join('+')+'='+detailTextNumber(row.settlement.orderTotal),'部分订单尚未开奖，请前往开奖页面开奖'].join('\n');
  if(settlementMode!=='form')return OrderDonorRenderers.settlementDisplayText(row.settlement);
  const card=document.createElement('div');card.innerHTML=OrderDonorRenderers.formSettlementCard(row.settlement,OrderDonorRenderers.formSettlementLayout());
  const groups=[...card.querySelectorAll('.mobile-form-group')].map(group=>[group.querySelector('.mobile-form-group-number').textContent+' 金额:'+group.querySelector('.mobile-form-group-amount').textContent,...[...group.querySelectorAll('.mobile-form-group-win')].map(win=>win.textContent)].join('\n'));
  return [card.querySelector('.mobile-form-name').textContent,...groups,...[...card.querySelectorAll('.mobile-form-summary>span')].map(line=>line.textContent)].join('\n');
 });
 if(!sections.length){send('notice',{text:'没有可复制的内容'});return;}
 send('copy',{text:sections.join('\n\n')});
}
$('#copyDetailText').onclick=()=>copyCurrentDetails();
$('#detailSettlement').addEventListener('click',event=>{const button=event.target.closest('[data-form-copy]');if(button)copyCurrentDetails(button.closest('.mobile-form-person').dataset.formDeclarant);});

let sharingImage=false;
const orderImageTargetRows=150,orderImageMaxRows=300,orderImageMaxBytes=3*1024*1024;
class OrderImageLimit extends Error{}
function imageCapture(source,range){
 const host=source.cloneNode(true),width=Math.max(1,Math.ceil(source.getBoundingClientRect().width));
 if(detailVirtual&&source.id==='declarantDetail'){
  const capture=host.querySelector('#detailOrders');capture.replaceChildren();let owner=null,offset=0,firstItem=null;
  for(const entry of detailVirtual.chunks){
   const length=entry.end-entry.start,start=range?Math.max(0,range.start-offset):0,end=range?Math.min(length,range.end-offset):length;offset+=length;
   if(start>=end)continue;
   const part={...entry,start:entry.start+start,end:entry.start+end};if(!firstItem)firstItem=entry.item.items[part.start];
   if(entry.owner&&entry.owner!==owner){const title=document.createElement('h3');title.className='detail-owner-name';title.textContent=entry.owner;capture.append(title);owner=entry.owner;}
   const chunk=document.createElement('div');chunk.innerHTML=detailVirtual.renderer(entry.item,detailVirtual.outcomes,part);capture.append(chunk);
  }
  // A page can start midway through one message; repeat its identifying context.
  if(range&&firstItem&&!original){
   const first=capture.querySelector('[data-order-id]'),prefix=first?.querySelector('.detail-order-prefix'),sequence=first?.querySelector('.detail-order-sequence');
   if(prefix&&!prefix.querySelector('strong')){const label=document.createElement('strong');label.textContent=firstItem.prefix;prefix.prepend(label);}
   if(sequence){sequence.classList.remove('detail-order-sequence-empty');sequence.removeAttribute('aria-hidden');}
  }
 }
 // Expand the snapshot independently of the viewport and virtual scroll window.
 // In particular, inherited inset:0 must not constrain its bottom to the screen.
 host.style.cssText+=';display:block!important;position:absolute!important;inset:auto!important;left:0!important;top:0!important;bottom:auto!important;right:auto!important;width:'+width+'px!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;contain:none!important;transform:none!important;z-index:-100;background:#fff;';
 host.querySelectorAll('[data-water-toggle]').forEach(button=>{const label=document.createElement('span');label.textContent=button.textContent;button.replaceWith(label);});
 host.querySelectorAll('button,.detail-bar,.detail-tabs,.detail-order-modes,.settlement-display-controls,#detailSearchForm,#detailShareActions,#detailEditHint,.detail-pane:not(.active)').forEach(node=>node.remove());
 host.querySelectorAll('.detail-content,.detail-pane.active,.order-render-chunk,.order-window-chunk').forEach(node=>{
  node.style.cssText+=';display:block!important;position:static!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;contain:none!important;content-visibility:visible!important;';node.scrollTop=0;
 });
 if(range)host.querySelectorAll('.detail-order').forEach(row=>{row.style.paddingBlock='4px';});
 if(range&&(range.start>0||range.end<range.total)){const label=document.createElement('p');label.textContent='第'+(range.page+1)+'张 · 第'+(range.start+1)+'–'+range.end+'条';label.style.cssText='margin:0;padding:8px 12px;color:#555;font-size:13px;background:white';host.prepend(label);}
 return host;
}
function longImagePlan(width,height,singlePage){
 // Bound bitmap memory and dimensions, reducing resolution before adding a page.
 const scaleFor=h=>Math.min(2,1200/width,30000/h,Math.sqrt(12000000/(width*h)));
 const one=scaleFor(height),count=!singlePage&&width*one<160&&height>30000?2:1;
 return Array.from({length:count},(_,index)=>{const top=Math.floor(height*index/count),bottom=Math.floor(height*(index+1)/count);return {top,height:bottom-top,scale:scaleFor(bottom-top)};});
}
async function encodeOrderImage(canvas,maxChars,singlePage){
 const formats=[['image/png'],['image/jpeg',.92],['image/jpeg',.84]];
 if(!singlePage)formats.push(['image/jpeg',.72],['image/jpeg',.55]);
 for(const [type,quality] of formats){
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,quality));
  if(!blob||blob.type!==type||4*Math.ceil(blob.size/3)>maxChars)continue;
  return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(reader.result.split(',')[1]);
   reader.onerror=()=>reject(Error('图片编码失败'));
   reader.readAsDataURL(blob);
  });
 }
 throw new OrderImageLimit('图片内容较多，请缩小订单范围后分享');
}
async function captureLongImages(host,singlePage,maxChars){
 const width=Math.ceil(host.getBoundingClientRect().width),height=Math.ceil(Math.max(host.scrollHeight,host.getBoundingClientRect().height));
 if(!width||!height)throw Error('没有可分享的内容');
 const images=[];
 for(const part of longImagePlan(width,height,singlePage)){
  const minScale=singlePage?1:0;
  if(part.scale<minScale)throw new OrderImageLimit('本张原文较长，请缩小筛选范围以保留文字清晰度');
  let encoded=null,lastError;
  for(const reduction of [1,.75,.5]){
   if(part.scale*reduction<minScale)break;
   let canvas;
   try{
    canvas=await html2canvas(host,{scale:part.scale*reduction,width,height:part.height,y:part.top,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0});
    if(!canvas.width||!canvas.height)throw Error('长图生成失败');
    // Reading a pixel detects browsers that silently refuse an oversized canvas.
    canvas.getContext('2d').getImageData(0,canvas.height-1,1,1);
    encoded=await encodeOrderImage(canvas,maxChars,singlePage);
   }catch(error){lastError=error;}finally{if(canvas){canvas.width=0;canvas.height=0;}}
   if(encoded)break;
  }
  if(!encoded)throw lastError||Error('长图生成失败');
  images.push(encoded);
 }
 return images;
}
async function shareCurrent(selectedSource){
 if(sharingImage)return;
 sharingImage=true;
 const buttons=[...document.querySelectorAll('#shareDetailImage,[data-form-share]')],labels=buttons.map(button=>button.textContent);
 buttons.forEach(button=>{button.disabled=true;button.textContent='正在生成长图…';});
 let host;
 try{
  const epoch=detailRenderEpoch;await detailRenderComplete;
  if(epoch!==detailRenderEpoch||!person)throw Error('页面已切换，请重新点击分享');
  // Pending forms intentionally use the regular display; they still need a share source.
  const source=selectedSource instanceof Element?selectedSource:tab==='settlement'&&settlementMode==='form'&&detailPeople.length<2?($('#detailSettlement .mobile-form-capture')||$('#declarantDetail')):$('#declarantDetail');
  if(!source)throw Error('没有可分享的内容');
  const paginate=tab==='orders'&&source.id==='declarantDetail'&&detailVirtual;
  const count=paginate?detailVirtual.chunks.reduce((sum,entry)=>sum+entry.end-entry.start,0):0;
  if(count>8000)throw Error('订单过多，请筛选至8000条以内再分享');
  const pageBudget=paginate?Math.min(orderImageMaxBytes*4/3,Math.floor(39000000/Math.max(1,Math.ceil(count/orderImageTargetRows)))):8000000;
  const images=[];let encodedSize=0,start=0,attemptRows=orderImageMaxRows;
  do{
   if(epoch!==detailRenderEpoch||!person)throw Error('页面已切换，请重新点击分享');
   if(images.length>=100)throw Error('图片超过100张，请缩小订单范围后分享');
   buttons.forEach(button=>{button.textContent='正在生成第 '+(images.length+1)+' 张图片…';});
   let end=Math.min(count,start+attemptRows),captured;
   while(!captured){
    if(epoch!==detailRenderEpoch||!person)throw Error('页面已切换，请重新点击分享');
    const range=paginate?{start,end,page:images.length,total:count}:null;
    host=imageCapture(source,range);document.body.append(host);
    try{
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     captured=await captureLongImages(host,Boolean(paginate),pageBudget);
    }catch(error){
     const rows=end-start;
     if(!paginate||!(error instanceof OrderImageLimit)||rows<=1)throw error;
     // Reduce the row count before reducing text below the export scale floor.
     const next=Math.max(rows>orderImageTargetRows?orderImageTargetRows:1,Math.floor(rows*.75));
     end=start+next;
     attemptRows=Math.min(orderImageMaxRows,Math.ceil(next*1.1));
    }finally{host.remove();host=null;}
   }
   for(const image of captured){encodedSize+=image.length;if(encodedSize>40000000)throw Error('图片数据过多，请缩小订单范围后分享');images.push(image);}
   start=end;
  }while(paginate&&start<count);
  if(epoch!==detailRenderEpoch||!person)throw Error('页面已切换，请重新点击分享');
  OrderHost.send(images.length===1?'shareImage':'shareImages',JSON.stringify(images.length===1?{image:images[0]}:{images}));
 }catch(error){send('notice',{text:'生成图片失败：'+(error.message||'请重试')});}
 finally{host?.remove();buttons.forEach((button,index)=>{button.disabled=false;button.textContent=labels[index];});sharingImage=false;}
}
$('#shareDetailImage').onclick=()=>shareCurrent();
$('#detailSettlement').addEventListener('click',event=>{const button=event.target.closest('[data-form-share]');if(button)shareCurrent(button.closest('.mobile-form-person').querySelector('.mobile-form-capture'));});


const drawRed=new Set([1,2,7,8,12,13,18,19,23,24,29,30,34,35,40,45,46]);const drawBlue=new Set([3,4,9,10,14,15,20,25,26,31,36,37,41,42,47,48]);
document.querySelectorAll('.draw-ball b').forEach(ball=>{ball.innerHTML='<svg class="draw-ring" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12.2"/></svg><span class="draw-number">--</span>'});
let drawExpanded=false,currentDraws={};
function setDrawExpanded(value){drawExpanded=value;$('#drawBoard').classList.toggle('is-collapsed',!value);}
window.ordersDraws=draws=>{currentDraws=draws;let count=0;document.querySelectorAll('[data-draw-region]').forEach(row=>{const draw=draws[row.dataset.drawRegion==='老澳'?'老澳门':row.dataset.drawRegion];row.hidden=false;if(!draw){row.querySelector('.draw-identity small').textContent='—期';row.querySelectorAll('.draw-ball').forEach(b=>{b.querySelector('.draw-number').textContent='--';b.querySelector('small').textContent='--/--'});return;}count++;row.querySelector('.draw-identity small').textContent=String(draw.period).slice(-3)+'期';[...row.querySelectorAll('.draw-ball')].forEach((ball,i)=>{const n=Number(draw.numbers[i]);ball.querySelector('.draw-number').textContent=String(n).padStart(2,'0');ball.classList.remove('ball-red','ball-blue','ball-green');ball.classList.add(drawRed.has(n)?'ball-red':drawBlue.has(n)?'ball-blue':'ball-green');const zodiac=['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'][((Number(data.settings?.drawYear||new Date().getFullYear())-2020)%12-(n-1)%12+24)%12];const elements={金:[4,5,12,13,26,27,34,35,42,43],木:[8,9,16,17,24,25,38,39,46,47],水:[1,14,15,22,23,30,31,44,45],火:[2,3,10,11,18,19,32,33,40,41,48,49],土:[6,7,20,21,28,29,36,37]};ball.querySelector('small').textContent=Object.keys(elements).find(k=>elements[k].includes(n))+'/'+zodiac})});$('#drawBoard').classList.remove('is-empty');setDrawExpanded(drawExpanded)};ordersDraws({});


let drawRegion='新澳';document.querySelectorAll('[data-draw-region]').forEach(row=>{row.oncontextmenu=e=>{e.preventDefault();openDraw(row)};row.onclick=()=>openDraw(row)});
function openDraw(row){drawRegion=row.dataset.drawRegion==='老澳'?'老澳门':row.dataset.drawRegion;$('#drawEditTitle').textContent='编辑'+row.dataset.drawRegion+'开奖号码';$('#drawInputs').innerHTML=Array.from({length:7},(_,i)=>'<input inputmode="numeric" maxlength="2" aria-label="'+(i===6?'特码':'平码'+(i+1))+'" value="'+(currentDraws[drawRegion]?.numbers?.[i]||'')+'">').join('');$('#drawEditModal').classList.add('show')}
$('#cancelDrawEdit').onclick=()=>$('#drawEditModal').classList.remove('show');$('#clearDrawEdit').onclick=()=>{send('clearPageDraw',{market:drawRegion});$('#drawEditModal').classList.remove('show')};$('#saveDrawEdit').onclick=()=>{const numbers=[...$('#drawInputs').querySelectorAll('input')].map(i=>Number(i.value));if(numbers.some(n=>!Number.isInteger(n)||n<1||n>49)||new Set(numbers).size!==7){send('notice',{text:'请填写7个不重复的1至49号码'});return}send('manualPageDraw',{market:drawRegion,numbers});$('#drawEditModal').classList.remove('show')};
$('#drawCollapsedBar').onclick=()=>$('#refreshDraws').click();
let drawTouchY=null;$('#drawBoard').addEventListener('touchstart',e=>{drawTouchY=e.touches[0].clientY},{passive:true});$('#drawBoard').addEventListener('touchend',e=>{if(drawTouchY!==null&&e.changedTouches[0].clientY-drawTouchY < -45)setDrawExpanded(false);drawTouchY=null},{passive:true});

$('#renameDeclarantTrigger').onclick=()=>{$('#declarantRenameInput').value=person;$('#declarantRenameModal').classList.add('show')};$('#cancelDeclarantRename').onclick=()=>$('#declarantRenameModal').classList.remove('show');$('#saveDeclarantRename').onclick=()=>{const name=$('#declarantRenameInput').value.trim();if(!name)return;const aliases=Object.keys(data.settings?.declarantAliases||{}).filter(a=>data.settings.declarantAliases[a]===person);if(!aliases.includes(person))aliases.push(person);send('personSettings',{name,previousName:person,aliases,revision:data.revision});$('#declarantRenameModal').classList.remove('show');person=name;};




let activeOrderRow=null,holdTimer,holdPoint;
function closeOrderActions(){clearTimeout(holdTimer);holdPoint=null;activeOrderRow=null;$('#orderGroupActions').classList.remove('show')}
window.ordersPageLeave=closeOrderActions;
window.ordersHome=()=>{stopDetailRendering();setDrawExpanded(false);closeOrderActions();person='';detailPeople=[];selection=false;chosen.clear();for(const id of ['declarantSettings','personDirectory','declarantDetail'])$('#'+id).classList.remove('show');render()};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#orderGroupActions'))closeOrderActions()},true);
document.addEventListener('scroll',closeOrderActions,true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)closeOrderActions()});
const backBeforeActions=window.ordersBack;window.ordersBack=()=>{if($('#orderGroupActions').classList.contains('show')){closeOrderActions();return true}return backBeforeActions()};
function openOrderActions(row){if(!row)return;activeOrderRow=row;const menu=$('#orderGroupActions');menu.classList.add('show');const rect=row.getBoundingClientRect(),host=$('#app').getBoundingClientRect(),above=rect.top-host.top>48;menu.dataset.side=above?'above':'below';menu.style.left=Math.max(8,Math.min(host.width-188,rect.right-host.left-180))+'px';menu.style.top=Math.max(8,(above?rect.top-host.top-40:rect.bottom-host.top+8))+'px'}
$('#detailOrders').onclick=()=>$('#orderGroupActions').classList.remove('show');$('#detailOrders').oncontextmenu=e=>{e.preventDefault();openOrderActions(e.target.closest('[data-order-id]'))};$('#detailOrders').onpointerdown=e=>{holdPoint=[e.clientX,e.clientY];clearTimeout(holdTimer);holdTimer=setTimeout(()=>openOrderActions(e.target.closest('[data-order-id]')),500)};$('#detailOrders').onpointermove=e=>{if(holdPoint&&Math.hypot(e.clientX-holdPoint[0],e.clientY-holdPoint[1])>8)clearTimeout(holdTimer)};for(const type of ['pointerup','pointercancel','pointerleave'])$('#detailOrders').addEventListener(type,()=>clearTimeout(holdTimer));
for(const [id,action] of [['editOrderGroup','editOrder'],['insertOrderGroup','insertOrder'],['deleteOrderGroup','deleteOrder']])$('#'+id).onclick=()=>{if(!activeOrderRow)return;const orderId=activeOrderRow.dataset.orderId;send(action,{id:orderId.slice(0,orderId.lastIndexOf(':')),group:activeOrderRow.dataset.messageGroup,revision:data.revision});$('#orderGroupActions').classList.remove('show')};

let directorySelecting=false,directoryChosen=new Set();
function directoryNames(){return [...new Set([...data.declarants.map(p=>p.name),...Object.values(data.settings?.declarantAliases||{})])].sort((a,b)=>a.localeCompare(b,'zh-CN'))}
function renderDirectory(){$('#directorySelection').textContent=directorySelecting?'完成':'选择';$('#directorySelectionBar').hidden=!directorySelecting;$('#directoryCount').textContent='已选'+directoryChosen.size+'项';const q=$('#directorySearch').value.trim();const names=directoryNames().filter(n=>!q||n.includes(q));$('#directoryRows').innerHTML=names.length?names.map(n=>'<button class="directory-row '+(directorySelecting?'selecting ':'')+(directoryChosen.has(n)?'selected':'')+'" data-directory-person="'+esc(n)+'">'+(directorySelecting?'<i class="selection-circle" aria-hidden="true"></i>':'')+'<span>'+esc(n)+'</span><span class="clear-chevron" aria-hidden="true"></span></button>').join(''):'<div class="directory-empty">'+(q?'没有找到申报人':'暂无申报人')+'</div>'}
window.openPersonDirectory=()=>{stopDetailRendering();$('#declarantDetail').classList.remove('show');$('#declarantSettings').classList.remove('show');person='';detailPeople=[];send('person',{person:''});$('#personDirectory').classList.add('show');renderDirectory()};
$('#directorySearch').oninput=deferredSearch(renderDirectory);$('#directorySearchForm').onsubmit=e=>{e.preventDefault();renderDirectory()};
$('#directoryAddForm').onsubmit=e=>{e.preventDefault();const name=$('#directoryName').value.trim();if(!name)return;if(directoryNames().includes(name)){send('notice',{text:'申报人已存在'});return}send('personSettings',{name,aliases:[],revision:data.revision});$('#directoryName').value=''};
$('#directoryRows').onclick=e=>{const b=e.target.closest('[data-directory-person]');if(b){const n=b.dataset.directoryPerson;if(directorySelecting){directoryChosen.has(n)?directoryChosen.delete(n):directoryChosen.add(n);renderDirectory()}else{person=n;openSettings()}}};
$('#closePersonDirectory').onclick=()=>{$('#personDirectory').classList.remove('show');send('directoryBack')};
$('#directorySelection').onclick=()=>{directorySelecting=!directorySelecting;directoryChosen.clear();renderDirectory()};
$('#directoryAll').onclick=()=>{const names=directoryNames().filter(n=>n.includes($('#directorySearch').value.trim()));directoryChosen=directoryChosen.size===names.length?new Set():new Set(names);renderDirectory()};
$('#directoryDelete').onclick=()=>{if(directoryChosen.size)send('deleteDeclarants',{names:[...directoryChosen],revision:data.revision})};
const receiveBeforeDirectory=window.ordersReceive;window.ordersReceive=v=>{receiveBeforeDirectory(v);if($('#personDirectory').classList.contains('show'))renderDirectory()};
const backBeforeDirectory=window.ordersBack;window.ordersBack=()=>{if($('#declarantSettings').classList.contains('show'))return backBeforeDirectory();if($('#personDirectory').classList.contains('show')){$('#closePersonDirectory').click();return true}return backBeforeDirectory()};
function personPricingName(){return data.settings?.declarantGlobalPresets?.[person]||data.settings?.qss?.globalPricingActive||'默认赔率'}
function renderPersonPricing(){const q=data.settings?.qss||{},active=personPricingName();$('#personPricingLabel').textContent=active==='默认赔率'?'默认系统赔率':active;const names=[...new Set(['默认赔率',q.globalPricingActive||'默认赔率',...Object.keys(q.globalPricingPresets||{})])];$('#personPricingOptions').innerHTML=names.map(n=>'<button type="button" class="person-pricing-option '+(n===active?'selected':'')+'" data-preset="'+esc(n)+'"><i class="selection-circle"></i><span>'+esc(n==='默认赔率'?'默认系统赔率':n)+'</span></button>').join('')}
$('#personPricingTrigger').onclick=()=>{renderPersonPricing();const box=$('#personPricingOptions');box.hidden=!box.hidden;$('#personPricingTrigger').setAttribute('aria-expanded',String(!box.hidden))};
$('#personPricingOptions').onclick=e=>{const button=e.target.closest('[data-preset]');if(button)savePerson({globalPricingPreset:button.dataset.preset})};
const receiveBeforePricing=window.ordersReceive;window.ordersReceive=v=>{receiveBeforePricing(v);if($('#declarantSettings').classList.contains('show'))renderPersonPricing()};
$('#addOrderPerson').onclick=()=>send('addPerson',{names:directoryNames(),revision:data.revision});
$('#transferDeclarants').onclick=()=>{const ids=scopedDetails().filter(d=>chosen.has(d.record.person)).map(d=>d.record.id);if(!ids.length){send('notice',{text:'请先选择有订单的申报人'});return}send('transferOrders',{ids:[...new Set(ids)],names:directoryNames(),revision:data.revision})};
send('ready');})();
