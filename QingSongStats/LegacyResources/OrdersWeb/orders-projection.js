/* Display adapter: consumes saved items and settlement snapshots only. Never parses or settles history. */
(function(root){'use strict';
const amount=c=>Number(c||0)/100,fmt=n=>String(Number(Number(n||0).toFixed(2)));
function project(details){
 const people=new Map(),outcomes=new Map(),originalOutcomes=new Map(),sequences=new Map();
 const chronological=details.map((detail,index)=>({detail,index})).sort((a,b)=>{const at=Date.parse(a.detail.record?.createdAt),bt=Date.parse(b.detail.record?.createdAt);return Number.isFinite(at)&&Number.isFinite(bt)&&at!==bt?at-bt:a.index-b.index});
 for(const {detail} of chronological){const r=detail.record;if(!r||r.deletedAt)continue;const name=r.person||'默认';let p=people.get(name);if(!p){p={id:name,name,items:[],originalItems:[],settlement:{declarantId:name,declarantName:name,parentOrders:[],details:[],payoutRows:[],waterRows:[],orderTotal:0,totalWater:0,totalPayout:0,houseProfitLoss:0,copyLines:[]},pending:false};people.set(name,p)}
 const st=r.settlement;p.pending ||= !st;const row=p.settlement;
 row.orderTotal+=amount(r.totalCents);if(st){row.totalWater+=amount(st.rebateCents);row.totalPayout+=amount(st.returnCents);row.houseProfitLoss+=amount(st.bankerNetCents)}
 for(const [gi,g] of (detail.sourceGroups||[]).entries()){
  const gid=r.id+':'+gi,seq=row.parentOrders.length+1,entries=[];row.parentOrders.push({parentOrderId:gid,totalAmount:amount(g.totalCents)});
  for(const idx of g.itemIndexes){const item=r.items[idx],b=item.qssBet||{},w=b.wisdomRecord||{},line=st?.lines?.[idx],id=r.id+':'+idx,betType=item.kindLabel||w.投注类型||item.kind;
   const body=String(w.订单信息||b.label||(item.selection||[]).join('-'))+String(w.计算方式==='各'&&betType==='特码'?'各数':w.计算方式||'各')+String(w.金额??amount(item.stakeCents));
   const entry={id,parentRecordId:r.id,prefix:(r.market==='老澳门'?'老澳':r.market)+'/'+betType,body,total:amount(item.stakeCents),group:{id:gid},order:{region:r.market,selections:item.selection||[],sourceGroupText:g.source,sourceText:g.source},categoryTag:'',mergeKey:[b.group,b.order,b.sliceIndex,betType,w.金额].join('|'),betType,unitAmount:w.金额};entries.push(entry);p.items.push(entry);sequences.set(id,seq);
   if(line){const won=!!line.won,winningStake=amount(line.winningStakeCents??(won?item.stakeCents:0));let matched=(line.hits||[]).map(String);if(!matched.length&&won)matched=String(line.winningInfo||'').match(/\d{1,2}|[鼠牛虎兔龙蛇马羊猴鸡狗猪]/g)||[];
    outcomes.set(id,{ok:true,detail:{won,winningAmount:winningStake,winningText:won?'中'+fmt(winningStake)+betType:'',matchedSelections:matched}});
    row.details.push({parentOrderId:gid,pricingSlices:[{won,winningStakeAmount:winningStake,betType}]});
    if(won){const rate=line.rate??(winningStake?amount(line.returnCents)/winningStake:0),key=betType+'|'+rate;let payout=row.payoutRows.find(x=>x.key===key);if(!payout){payout={key,betType,effectiveOdds:rate,winningStakeAmount:0,payoutAmount:0,stakes:[]};row.payoutRows.push(payout)}payout.winningStakeAmount+=winningStake;payout.payoutAmount+=amount(line.returnCents);payout.stakes.push(winningStake)}
    if(line.status==='refund'&&line.returnCents){const paid=amount(line.returnCents),key='refund|'+betType;let refund=row.payoutRows.find(x=>x.key===key);if(!refund){refund={key,betType:betType+'（和局退回）',effectiveOdds:1,winningStakeAmount:0,payoutAmount:0,stakes:[]};row.payoutRows.push(refund)}refund.winningStakeAmount+=paid;refund.payoutAmount+=paid;refund.stakes.push(paid);outcomes.get(id).detail.winningText='和局退回'+fmt(paid);}
    const stake=amount(line.stakeCents),water=amount(line.rebateCents);row.waterRows.push({betType,validStakeAmount:stake,waterRatePercent:stake?water/stake*100:0,waterAmount:water});
   }
  }
  // Original rows retain per-number results; merged rows use independent display copies.
  for(const entry of entries){const result=outcomes.get(entry.id);if(result)originalOutcomes.set(entry.id,JSON.parse(JSON.stringify(result)));}
  const merged=[];
  for(const entry of entries){const previous=merged[merged.length-1];if(previous&&entry.betType==='特码'&&previous.mergeKey===entry.mergeKey){
    const first=previous.order.selections;previous.order.selections=first.concat(entry.order.selections);previous.body=previous.order.selections.map(n=>String(n).padStart(2,'0')).join('-')+'各数'+entry.unitAmount;previous.total+=entry.total;
    const left=outcomes.get(previous.id),right=outcomes.get(entry.id);if(left&&right){left.detail.won ||= right.detail.won;left.detail.matchedSelections.push(...right.detail.matchedSelections);left.detail.winningAmount=(left.detail.winningAmount||0)+(right.detail.winningAmount||0);left.detail.winningText=left.detail.won?'中'+fmt(left.detail.winningAmount)+entry.betType:''}
   }else merged.push({...entry,order:{...entry.order,selections:[...entry.order.selections]}})}
  p.items.splice(p.items.length-entries.length,entries.length,...merged);
  if(entries.length)p.originalItems.push({...entries[0],originalEntries:entries});
 }
 }
 for(const p of people.values()){const r=p.settlement;const water=new Map();for(const line of r.waterRows){const key=line.betType+'|'+Number(line.waterRatePercent.toFixed(8));let grouped=water.get(key);if(!grouped){grouped={betType:line.betType,waterRatePercent:Number(line.waterRatePercent.toFixed(8)),stakeCents:0,waterCents:0};water.set(key,grouped)}grouped.stakeCents+=Math.round(line.validStakeAmount*100);grouped.waterCents+=Math.round(line.waterAmount*100)}r.waterRows=[...water.values()].map(x=>({betType:x.betType,waterRatePercent:x.waterRatePercent,validStakeAmount:x.stakeCents/100,waterAmount:x.waterCents/100}));for(const key of ['orderTotal','totalWater','totalPayout','houseProfitLoss'])r[key]=Math.round(r[key]*100)/100;r.copyLines=['申报人:'+p.name,'订单金额明细:',r.parentOrders.map(g=>fmt(g.totalAmount)).join('+')+'='+fmt(r.orderTotal)+'（共'+r.parentOrders.length+'条）','水钱:'+fmt(r.totalWater)];for(const pay of r.payoutRows)r.copyLines.push(pay.betType+':'+pay.stakes.map(fmt).join('+')+'='+fmt(pay.winningStakeAmount)+'×'+pay.effectiveOdds+'='+fmt(pay.payoutAmount));r.copyLines.push('最终盈亏:'+fmt(r.orderTotal)+'-'+fmt(r.totalWater)+r.payoutRows.map(x=>'-'+fmt(x.payoutAmount)).join('')+'='+fmt(r.houseProfitLoss));}
 return {people:[...people.values()],outcomes,originalOutcomes,sequences};
}
root.OrderProjection={project};
})(globalThis);
