/* Shared read-only pending-tema recommendation and number export. ES5 / Rhino. */
(function (root) {
'use strict';
/* Exact signed decimal integer helpers. ES5; no host integer extension required. */
var INTEGER_MAX_SAFE = 9007199254740991;
function norm(a) {
  a = String(a); var negative = a.charAt(0) === '-';
  if (negative || a.charAt(0) === '+') a = a.slice(1);
  if (!/^[0-9]+$/.test(a)) throw new Error('整数格式无效');
  a = a.replace(/^0+/, '') || '0';
  return negative && a !== '0' ? '-' + a : a;
}
function absInt(a) { return a.charAt(0) === '-' ? a.slice(1) : a; }
function cmpAbs(a, b) { return a.length !== b.length ? (a.length < b.length ? -1 : 1) : a === b ? 0 : a < b ? -1 : 1; }
function addAbs(a, b) {
  var i = a.length - 1, j = b.length - 1, carry = 0, out = '', v;
  while (i >= 0 || j >= 0 || carry) {
    v = carry + (i >= 0 ? a.charCodeAt(i--) - 48 : 0) + (j >= 0 ? b.charCodeAt(j--) - 48 : 0);
    out = String(v % 10) + out; carry = Math.floor(v / 10);
  }
  return out || '0';
}
function I(value) {
  if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value || Math.abs(value) > INTEGER_MAX_SAFE) throw new Error('金额须为安全整数分');
  return String(value === 0 ? 0 : value);
}
function toNumber(value) {
  value = norm(value);
  if (cmpAbs(absInt(value), '9007199254740991') > 0) throw new Error('金额超过安全整数范围');
  return Number(value);
}
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function marketOf(options) {
  requireValue(options && typeof options === 'object', '抛单参数无效');
  requireValue(['新澳','香港','老澳门'].indexOf(options.market)>=0, '请选择澳门或香港');
  return options.market;
}
function exposureOf(options, requirePricing, allowSigned) {
  var market = marketOf(options), group = options.exposure, C = root.LotteryCore, result, rows = [], seen = {}, total = '0', i, row;
  if (group === undefined) {
    requireValue(C && typeof C.temaExposure === 'function', '特码统计资源尚未就绪');
    result = C.temaExposure(options.records || [], options.settings, {market:market});
    requireValue(result && Array.isArray(result.markets) && result.markets.length === 1, '特码统计彩种无效');
    group = result.markets[0];
  }
  requireValue(group && group.market === market, '特码统计彩种不一致');
  requireValue(Array.isArray(group.numbers) && group.numbers.length === 49, '特码统计须包含49个号码');
  requireValue(typeof group.temaStakeCents === 'number' && (allowSigned || group.temaStakeCents >= 0), '特码总金额无效');
  I(group.temaStakeCents);
  if (requirePricing) requireValue(group.available === true, '特码赔率或返水配置无效，请核对设置');
  for (i = 0; i < group.numbers.length; i++) {
    row = group.numbers[i];
    requireValue(row && typeof row.number === 'number' && Math.floor(row.number) === row.number && row.number >= 1 && row.number <= 49 && !seen[row.number], '特码号码统计无效');
    seen[row.number] = true;
    requireValue(typeof row.stakeCents === 'number' && (allowSigned || row.stakeCents >= 0), '特码号码金额无效');
    if (allowSigned) { I(row.stakeCents); total = I(toNumber(total) + row.stakeCents); }
    else total = addAbs(total, I(row.stakeCents));
    if (requirePricing) I(row.netCents);
    rows[row.number - 1] = {number:row.number, stakeCents:row.stakeCents, netCents:row.netCents};
  }
  requireValue(cmpAbs(total, I(group.temaStakeCents)) === 0, '特码号码金额与总额不一致');
  return {market:market, total:total, rows:rows, group:group};
}
function money(cents) {
  var value = I(cents), digits, whole, fraction;
  requireValue(cents >= 0, '导出金额须为非负整数分');
  digits = value;
  while (digits.length < 3) digits = '0' + digits;
  whole = digits.slice(0, -2); fraction = digits.slice(-2).replace(/0+$/, '');
  return whole + (fraction ? '.' + fraction : '');
}
function pricingFor(options) {
  var C = root.LotteryCore, pricing = null;
  C.activeRecords(options.records || []).forEach(function(record){
    if (record.deletedAt || record.market !== options.market) return;
    var active = C.projectTemaRecord(record);
    if (!active || active.settlement || !active.totalCents) return;
    var qs = active.qssSettingsSnapshot, rate, rebate;
    if (qs) { rate = Object.prototype.hasOwnProperty.call(qs.normalOdds, '特码') ? qs.normalOdds['特码'] : 47; rebate = QSSRules.temaRebate(qs); }
    else { var settings = options.settings, override = (settings.rateOverrides || {})[record.market + '|' + record.person] || {};rate = (override.tema === undefined ? settings.rates.tema : override.tema) + (settings.settlement.payoutIncludesStake ? 0 : 1);rebate = override.rebatePct === undefined ? settings.rates.rebatePct : override.rebatePct; }
    requireValue(typeof rate === 'number' && isFinite(rate) && rate > 0 && typeof rebate === 'number' && isFinite(rebate) && rebate >= 0 && rebate <= 100, '当前账单的特码赔率或返水无效');
    if (pricing) requireValue(pricing.odds === rate && pricing.rebateRate === rebate, '当前未结算特码含不同赔率或返水快照，请分账本抛单');
    else pricing = {odds:rate, rebateRate:rebate, rebateEnabled:rebate !== 0};
  });
  if (!pricing) {var qss = options.settings.qss;pricing = {odds:qss && qss.normalOdds['特码'] || 47, rebateRate:0, rebateEnabled:false};}
  return pricing;
}
/* Read-only special-number risk plans. Money remains integer cents. */
function riskSnapshot(options, allowSignedExposure) {
  options=Object.assign({},options,{records:retainedRecords(options)});
  var exposure=exposureOf(options,true,allowSignedExposure), runs=[],keys=Object.create(null),last=null,hasDecrease=false;
  // Plans and journal allocations consume positive sources in the same order.
  // Keep A/B/A pricing runs separate instead of merging both A runs ahead of B.
  (options.records||[]).forEach(function(record){
    if(record.market!==options.market)return;
    var active=pendingTema(record);if(!active||!active.totalCents)return;
    if(active.manualAdjustment&&active.manualAdjustment.direction==='decrease'){hasDecrease=true;return;}
    var price=pricingFor({records:[record],settings:options.settings,market:options.market});
    var key=price.odds+'|'+price.rebateRate;keys[key]=true;
    if(!last||last.key!==key){last={key:key,records:[]};runs.push(last);}
    last.records.push(record);
  });
  if(hasDecrease||Object.keys(keys).length>1){
    var components=runs.map(function(run){return riskSnapshot({records:run.records,settings:options.settings,market:options.market});});
    var mixed={market:exposure.market,rows:exposure.rows,components:components,odds:47,rebateRate:0,totalStakeCents:toNumber(exposure.total),originalReturns:exposure.group.numbers.map(function(row){return row.returnCents;}),originalRebate:exposure.group.rebateCents};
    mixed.rows.forEach(function(row){row.color=root.LotteryCore.colorForNumber(row.number);row.zodiac=options.settings.qss?root.QSSRules.numberZodiac(row.number,options.settings.qss):root.LotteryCore.zodiacForNumber(row.number,options.settings.yearZodiac);});
    // Manual decreases retain their saved reversal liabilities; they are never
    // allocated as positive offload sources. Match Core.temaExposure exactly.
    mixed.adjustmentReturns=mixed.originalReturns.slice();mixed.adjustmentRebate=mixed.originalRebate;
    components.forEach(function(part){mixed.adjustmentRebate-=part.originalRebate;part.originalReturns.forEach(function(value,index){mixed.adjustmentReturns[index]-=value;});});
    return mixed;
  }
  var pricing=pricingFor(options);
  var group=exposure.group;
  exposure.rows.forEach(function(row){row.color=root.LotteryCore.colorForNumber(row.number);row.zodiac=options.settings.qss?root.QSSRules.numberZodiac(row.number,options.settings.qss):root.LotteryCore.zodiacForNumber(row.number,options.settings.yearZodiac);});
  var lots=[],rebateLots=0;for(var n=0;n<49;n++)lots.push(0);
  root.LotteryCore.activeRecords(options.records||[]).forEach(function(record){
    if(record.deletedAt||record.market!==options.market)return;
    var active=root.LotteryCore.projectTemaRecord(record);if(!active||active.settlement)return;
    rebateLots++;active.items.forEach(function(item){if(item.kind==='tema')lots[item.selection[0]-1]++;});
  });
  return {market:exposure.market,rows:exposure.rows,odds:pricing.odds,rebateRate:pricing.rebateRate,totalStakeCents:toNumber(exposure.total),originalReturns:group.numbers.map(function(r){return r.returnCents;}),originalRebate:group.rebateCents,roundingLots:lots,rebateLots:rebateLots};
}
function riskPlan(data,config) {
  function valid(v){return typeof v==='number'&&isFinite(v)&&Math.floor(v)===v&&v>=0&&v<=100000000000;}
  function signed(v){return typeof v==='number'&&isFinite(v)&&Math.floor(v)===v&&Math.abs(v)<=9007199254740991;}
  function check(c,m){if(!c)throw new Error(m);}
  function sum(a){return a.reduce(function(n,v){var r=n+v;check(valid(r),'金额超出风控范围');return r;},0);}
  check(data&&data.rows&&data.rows.length===49,'特码统计须包含49个号码');
  check(typeof data.odds==='number'&&isFinite(data.odds)&&data.odds>0&&data.odds<=10000,'特码赔率无效');
  check(typeof data.rebateRate==='number'&&isFinite(data.rebateRate)&&data.rebateRate>=0&&data.rebateRate<=100,'返水比例无效');
  var stakes=data.rows.map(function(r,i){check(r.number===i+1&&valid(r.stakeCents),'号码金额无效或为负数，请先核对账单');return r.stakeCents;});
  config=config||{mode:'percent',value:100};
  check(['percent','fixed','selected','loss'].indexOf(config.mode)>=0,'请选择风控方式');
  var value=config.value, keep, limit=null, originalTotal=sum(stakes);
  if(data.originalReturns){check(data.originalReturns.length===49&&data.originalReturns.every(data.components?signed:valid)&&(data.components?signed:valid)(data.originalRebate),'原账单赔付或返水无效');}
  if(config.mode==='percent')check(typeof value==='number'&&isFinite(value)&&value>=0&&value<=100,'自己保留比例须为0至100');
  else if(config.mode!=='selected')check(valid(value),'金额须为有效非负整数分');
  function evaluate(values){
    if(data.components){
      var remove=stakes.map(function(v,i){return v-values[i];}),rebate=data.adjustmentRebate||0,payouts=data.adjustmentReturns?data.adjustmentReturns.slice():Array(49).fill(0);
      check(signed(rebate),'返水调整金额无效');
      check(payouts.length===49&&payouts.every(signed),'赔付调整金额无效');
      data.components.forEach(function(part){
        var kept=part.rows.map(function(row,i){var take=Math.min(remove[i],row.stakeCents);remove[i]-=take;return row.stakeCents-take;});
        var amount=sum(kept),unchanged=amount===part.totalStakeCents;
        rebate+=unchanged?part.originalRebate:amount===0?0:Math.ceil(amount*part.rebateRate/100+(part.rebateRate?part.rebateLots/2:0));
        kept.forEach(function(v,i){payouts[i]+=v===part.rows[i].stakeCents?part.originalReturns[i]:v===0?0:Math.ceil(v*part.odds+part.roundingLots[i]/2);});
      });
      check(remove.every(function(v){return v===0;}),'总账本抛单分配金额不一致');
      check(signed(rebate)&&payouts.every(signed),'赔付或返水超过安全金额范围');
      var total=sum(values),nets=payouts.map(function(v){var net=total-rebate-v;check(signed(net),'盈亏超过安全金额范围');return net;});
      return {total:total,rebate:rebate,nets:nets,worst:Math.min.apply(null,nets),best:Math.max.apply(null,nets)};
    }
    var total=sum(values);
    // Round liabilities upward, never understate the estimated maximum loss.
    var rebate=total===originalTotal&&data.originalReturns?data.originalRebate:total===0?0:Math.ceil(total*data.rebateRate/100+(data.rebateRate?(data.rebateLots||0)/2:0));
    var nets=values.map(function(v,i){
      var payout=v===stakes[i]&&data.originalReturns?data.originalReturns[i]:v===0?0:Math.ceil(v*data.odds+((data.roundingLots||[])[i]||0)/2);
      return total-rebate-payout;
    });
    return {total:total,rebate:rebate,nets:nets,worst:Math.min.apply(null,nets),best:Math.max.apply(null,nets)};
  }
  // New offloads use whole yuan. Round each number, cap at its funded whole-yuan
  // balance, then derive the retained cents from the actual amount being sent.
  // Fractions that cannot be sent without exceeding the balance remain retained.
  function wholeYuanKeep(values){return values.map(function(v,i){
    var requested=stakes[i]-v,units=Math.floor((requested+50)/100);
    return stakes[i]-Math.min(Math.floor(stakes[i]/100),units)*100;
  });}
  if(config.mode==='percent')keep=stakes.map(function(v){return Math.floor(v*value/100);});
  if(config.mode==='fixed')keep=stakes.map(function(v){return Math.min(v,value);});
  if(config.mode==='selected'){
    check(config.amounts&&typeof config.amounts==='object'&&!Array.isArray(config.amounts),'请勾选号码并填写保留金额');
    Object.keys(config.amounts).forEach(function(n){check(/^(?:[1-9]|[1-4][0-9])$/.test(n)&&valid(config.amounts[n]),'逐号保留金额无效');});
    keep=stakes.map(function(v,i){return Object.prototype.hasOwnProperty.call(config.amounts,String(i+1))?Math.min(v,config.amounts[i+1]):v;});
  }
  if(config.mode==='loss'){
    limit=value;
    var lo=0,hi=Math.max.apply(null,stakes);
    // Check quantized candidates, not a fractional plan that would break the
    // limit after rounding. Final validation also covers unavoidable sub-yuan tails.
    if(evaluate(stakes).worst>=-limit)keep=stakes.slice();
    else {
      while(lo<hi){var mid=Math.floor((lo+hi+1)/2),candidate=wholeYuanKeep(stakes.map(function(v){return Math.min(v,mid);}));if(evaluate(candidate).worst>=-limit)lo=mid;else hi=mid-1;}
      keep=stakes.map(function(v){return Math.min(v,lo);});
    }
  }
  keep=wholeYuanKeep(keep);
  var before=evaluate(stakes),after=evaluate(keep),total=sum(stakes),removed=total-after.total;
  check(limit===null||after.worst>=-limit,'整元抛单后未达到亏损限制，请调整上限或金额');
  var lines=[data.market==='新澳'?'澳门':data.market],rows=stakes.map(function(v,i){var off=v-keep[i];if(off)lines.push(('0'+(i+1)).slice(-2)+'='+money(off));return {number:i+1,stakeCents:v,keepCents:keep[i],offloadCents:off,netCents:before.nets[i],afterNetCents:after.nets[i]};});
  lines.push('总计'+money(removed));
  return {rows:rows,totalStakeCents:total,keepCents:after.total,offloadCents:removed,worstNetCents:after.worst,bestNetCents:after.best,rebateCents:after.rebate,limitCents:limit,text:lines.join('\n')};
}
/* Independent offload journal. Source orders are never rewritten. */
function pendingTema(record){
  var C=root.LotteryCore;
  if(!record||record.deletedAt)return null;
  var active=C.projectActiveRecord(record);
  if(!active||active.settlement)return null;
  var tema=C.projectTemaRecord(active);
  return tema&&!tema.settlement?tema:null;
}
function temaBalances(record){var values=Array(49).fill(0);record.items.forEach(function(item){if(item.kind==='tema')values[item.selection[0]-1]+=item.stakeCents;});return values;}
function offloadDebits(options){
  var records=Object.create(null),debits=Object.create(null);
  (options.records||[]).forEach(function(r){if(r.market===options.market)records[r.id]=pendingTema(r);});
  (options.riskJournal||[]).forEach(function(entry){if(entry.voidedAt||entry.market!==options.market)return;entry.allocations.forEach(function(a){if(!records[a.recordId])return;var values=debits[a.recordId]||(debits[a.recordId]=Array(49).fill(0));values[a.number-1]+=a.amountCents;});});
  return debits;
}
function retainedRecords(options,knownDebits){
  if(!(options.riskJournal||[]).some(function(e){return !e.voidedAt&&e.market===options.market;}))return options.records||[];
  var debits=knownDebits||offloadDebits(options),C=root.LotteryCore;
  return (options.records||[]).map(function(record){
    var debit=debits[record.id];if(!debit)return record;
    var active=pendingTema(record);if(!active)return record;
    requireValue(!active.manualAdjustment||active.manualAdjustment.direction!=='decrease','减少记录不能作为抛单来源');
    var remaining=debit.slice(),items=[];
    active.items.forEach(function(item){var index=item.selection[0]-1,take=Math.min(item.stakeCents,remaining[index]);remaining[index]-=take;var cents=item.stakeCents-take;if(cents)items.push({kind:'tema',market:record.market,selection:[index+1],stakeCents:cents});});
    requireValue(remaining.every(function(v){return v===0;}),'原单已变化，请先核对或撤销相关抛单');
    if(!items.length)return null;
    // These minimal projections are ephemeral inputs to exposure calculation only.
    // Admission slices, original text, settlements and records stay untouched.
    return {id:record.id,market:record.market,person:record.person,source:'风控保留金额',items:items,totalCents:items.reduce(function(sum,it){return sum+it.stakeCents;},0),settlement:null,qssSettingsSnapshot:record.qssSettingsSnapshot};
  }).filter(function(record){return record!==null;});
}
function retainedExposure(options){
  var debit=offloadDebits(options),C=root.LotteryCore,group=C.temaExposure(retainedRecords(options,debit),options.settings,{market:options.market}).markets[0];
  var total=0;Object.keys(debit).forEach(function(id){debit[id].forEach(function(v){total+=v;});});
  group.originalTemaStakeCents=group.temaStakeCents+total;group.offloadedCents=total;
  return group;
}
function allocateOffload(options,plan){
  var debits=offloadDebits(options),need=plan.rows.map(function(r){return r.offloadCents;}),allocations=[];
  (options.records||[]).forEach(function(record){
    if(record.market!==options.market)return;var active=pendingTema(record);if(!active||active.manualAdjustment&&active.manualAdjustment.direction==='decrease')return;
    var values=temaBalances(active),used=debits[record.id]||Array(49).fill(0);
    for(var n=0;n<49;n++){var take=Math.min(need[n],values[n]-used[n]);requireValue(take>=0&&Number.isSafeInteger(take),'抛单来源余额无效');if(take){allocations.push({recordId:record.id,number:n+1,amountCents:take});need[n]-=take;}}
  });
  requireValue(need.every(function(v){return v===0;}),'可抛金额不足，请重新生成');return allocations;
}
function validateJournal(state){
  var journal=state.riskJournal;if(journal===undefined)return;
  requireValue(Array.isArray(journal)&&journal.length<=10000&&state.schemaVersion===3,'抛单记录格式或版本无效');
  var records=Object.create(null),ids=Object.create(null),funding=Object.create(null);
  state.records.forEach(function(r){records[r.id]=r;});
  function amount(v){return Number.isSafeInteger(v)&&v>=0&&v<=100000000000;}
  journal.forEach(function(e){
    requireValue(e&&e.version===1&&typeof e.id==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(e.id)&&!ids[e.id],'抛单记录标识无效或重复');ids[e.id]=true;
    requireValue(['新澳','香港','老澳门'].indexOf(e.market)>=0&&typeof e.createdAt==='string'&&isFinite(Date.parse(e.createdAt)),'抛单地区或时间无效');
    requireValue(e.voidedAt===undefined||typeof e.voidedAt==='string'&&isFinite(Date.parse(e.voidedAt)),'抛单撤销时间无效');
    requireValue(amount(e.beforeCents)&&amount(e.afterCents)&&amount(e.totalCents)&&e.totalCents>0&&e.beforeCents-e.totalCents===e.afterCents,'抛单前后余额不一致');
    requireValue(Array.isArray(e.rows)&&e.rows.length>0&&e.rows.length<=49&&Array.isArray(e.allocations)&&e.allocations.length>0&&e.allocations.length<=500000,'抛单明细缺失或过多');
    var byNumber=Array(49).fill(0),allocated=Array(49).fill(0),seen=Object.create(null),sum=0;
    e.rows.forEach(function(r){requireValue(r&&Number.isInteger(r.number)&&r.number>=1&&r.number<=49&&!byNumber[r.number-1]&&amount(r.amountCents)&&r.amountCents>0,'抛单号码或金额无效');byNumber[r.number-1]=r.amountCents;sum+=r.amountCents;});
    requireValue(sum===e.totalCents,'抛单合计不一致');
    e.allocations.forEach(function(a){
      requireValue(a&&typeof a.recordId==='string'&&a.recordId.length<=120&&Number.isInteger(a.number)&&a.number>=1&&a.number<=49&&amount(a.amountCents)&&a.amountCents>0,'抛单来源明细无效');
      var key=a.recordId+'|'+a.number;requireValue(!seen[key],'同次抛单来源重复');seen[key]=true;allocated[a.number-1]+=a.amountCents;
      if(!e.voidedAt){var r=records[a.recordId];requireValue(r&&r.market===e.market&&(!r.manualAdjustment||r.manualAdjustment.direction!=='decrease'),'抛单来源不存在或地区不一致');funding[key]=(funding[key]||0)+a.amountCents;}
    });
    requireValue(byNumber.every(function(v,i){return v===allocated[i];}),'抛单来源与号码金额不一致');
  });
  // Every outstanding allocation remains funded, even after its source is settled.
  var balances=Object.create(null);
  Object.keys(funding).forEach(function(key){var at=key.lastIndexOf('|'),id=key.slice(0,at),n=Number(key.slice(at+1));var values=balances[id]||(balances[id]=temaBalances(records[id]));requireValue(funding[key]<=values[n-1],'原单金额不足，请先撤销相关抛单');});
}
function journalText(entry){var lines=[entry.market==='新澳'?'澳门':entry.market];entry.rows.forEach(function(row){lines.push(('0'+row.number).slice(-2)+'='+money(row.amountCents));});lines.push('总计'+money(entry.totalCents));return lines.join('\n');}
function journalHistory(options,page){
  var records=Object.create(null);(options.records||[]).forEach(function(r){records[r.id]=r;});
  var all=(options.riskJournal||[]).filter(function(e){return e.market===options.market;}).slice().reverse();page=Number.isInteger(page)&&page>=0?page:0;
  return {page:page,total:all.length,hasMore:(page+1)*20<all.length,items:all.slice(page*20,(page+1)*20).map(function(e){var active=0;if(!e.voidedAt)e.allocations.forEach(function(a){if(pendingTema(records[a.recordId]))active+=a.amountCents;});return {id:e.id,createdAt:e.createdAt,market:e.market,totalCents:e.totalCents,beforeCents:e.beforeCents,afterCents:e.afterCents,activeCents:active,voidedAt:e.voidedAt||null,text:journalText(e)};})};
}
function hasPendingOffload(state,id){return (state.riskJournal||[]).some(function(e){return !e.voidedAt&&e.allocations.some(function(a){return a.recordId===id;});});}

function totalSnapshot(parts,market){
  var components=[],records=[],snapshots=[];
  parts.forEach(function(part){
    var groups=Object.create(null),remaining=retainedRecords(Object.assign({},part,{market:market}));
    var pending=remaining.filter(function(record){return record.market===market&&pendingTema(record);});
    if(pending.some(function(record){var active=pendingTema(record);return active.manualAdjustment&&active.manualAdjustment.direction==='decrease';})){
      // A saved decrease belongs to its whole ledger exposure, not the price
      // active when it was entered. Keep its signed reversal separate.
      var snapshot=riskSnapshot({records:pending,settings:part.settings,market:market},true);
      snapshots.push(snapshot);components=components.concat(snapshot.components||[snapshot]);
      records=records.concat(pending);return;
    }
    pending.forEach(function(record){
      var price=pricingFor({records:[record],settings:part.settings,market:market}),key=price.odds+'|'+price.rebateRate;
      if(!groups[key])groups[key]=[];groups[key].push(record);
    });
    Object.keys(groups).forEach(function(key){
      var group=groups[key],snapshot=riskSnapshot({records:group,settings:part.settings,market:market});
      components.push(snapshot);snapshots.push(snapshot);
      // The same ordering funds preview liabilities and the committed journal.
      records=records.concat(group);
    });
  });
  var data={market:market,components:components,odds:47,rebateRate:0,totalStakeCents:0,originalReturns:Array(49).fill(0),originalRebate:0,adjustmentReturns:Array(49).fill(0),adjustmentRebate:0,rows:[]};
  for(var i=0;i<49;i++)data.rows.push({number:i+1,stakeCents:0,netCents:0,color:root.LotteryCore.colorForNumber(i+1)});
  snapshots.forEach(function(part){
    data.totalStakeCents+=part.totalStakeCents;data.originalRebate+=part.originalRebate;
    data.adjustmentRebate+=part.adjustmentRebate||0;
    part.rows.forEach(function(row,i){data.rows[i].stakeCents+=row.stakeCents;data.originalReturns[i]+=part.originalReturns[i];data.adjustmentReturns[i]+=(part.adjustmentReturns||[])[i]||0;data.rows[i].zodiac=row.zodiac;});
  });
  requireValue(Number.isSafeInteger(data.totalStakeCents)&&data.totalStakeCents>=0&&data.totalStakeCents<=100000000000,'总账本金额超过风控范围');
  requireValue(data.rows.every(function(row){return Number.isSafeInteger(row.stakeCents)&&row.stakeCents>=0&&row.stakeCents<=100000000000;}),'总账本号码金额无效或为负数，请先核对账单');
  data.rows.forEach(function(row,i){row.netCents=data.totalStakeCents-data.originalRebate-data.originalReturns[i];});
  return {data:data,records:records};
}
function formatRiskText(market,rows,format){
  format=format||{};
  var layout=format.layout===undefined?'vertical':format.layout,separator=format.separator===undefined?'=':format.separator;
  if(['新澳','香港','老澳门'].indexOf(market)<0||['vertical','horizontal'].indexOf(layout)<0)throw Error('复制格式无效');
  if(typeof separator!=='string'||separator.length<1||separator.length>4||/[0-9\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(separator))throw Error('分隔符请填写1至4个非数字符号或文字');
  function amount(cents){var value=(cents/100).toFixed(2);return value.replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');}
  var items=[],seen={},total=0;
  rows.forEach(function(row){var value=row.amountCents===undefined?row.offloadCents:row.amountCents;
    if(!Number.isInteger(row.number)||row.number<1||row.number>49||seen[row.number]||!Number.isSafeInteger(value)||value<0)throw Error('复制号码或金额无效');
    seen[row.number]=true;if(value){items.push({number:('0'+row.number).slice(-2),amount:value});total+=value;}
  });
  if(!Number.isSafeInteger(total))throw Error('复制金额过大');
  var lines=[market==='新澳'?'澳门':market];
  if(layout==='vertical')items.forEach(function(row){lines.push(row.number+separator+amount(row.amount));});
  else{
    var groups=[],lookup={};items.forEach(function(row){var key=String(row.amount);if(!lookup[key]){lookup[key]={numbers:[],amount:row.amount};groups.push(lookup[key]);}lookup[key].numbers.push(row.number);});
    if(groups.length)lines.push(groups.map(function(group){return group.numbers.join('*')+separator+amount(group.amount);}).join('，'));
  }
  lines.push('总计'+amount(total));return lines.join('\n');
}
root.QsRisk={snapshot:riskSnapshot,plan:riskPlan,exposure:retainedExposure,allocations:allocateOffload,validateJournal:validateJournal,history:journalHistory,text:journalText,hasOffload:hasPendingOffload,totalSnapshot:totalSnapshot,formatText:formatRiskText};

}(typeof globalThis !== 'undefined' ? globalThis : this));
