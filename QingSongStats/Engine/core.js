(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.LotteryCore = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  // Historical Stats accounting is retained; new orders use the QSSRules snapshot contract.
  var VERSION = '2.1.0';
  var MARKETS = ['新澳', '香港', '老澳门'];
  var ZODIACS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  var MAX_ITEMS = 5000, MAX_SAFE = 9007199254740991;
  var LEGACY_RATES = {
    tema: 47, pingte: 2, pingteSpecial: 1.8,
    lian2: 4, lian2Special: 3.5, lian3: 10, lian3Special: 8.5,
    lian4: 30, lian4Special: 25, lian5: 92, lian5Special: 82,
    wei1: 1.8, wei1Special: 2.1, wei2: 3, wei2Special: 3,
    wei3: 6, wei3Special: 6, wei4: 15, wei4Special: 15,
    wei5: 45, wei5Special: 45, er2: 60, techuan: 10, san3: 600, san2: 20,
    bu5: 2, bu6: null, bu7: null, bu8: null, bu9: null, bu10: null, bu11: null, bu12: null,
    rebatePct: 0
  };
  var DEFAULT_RATES = {tema:47,rebatePct:0};
  var PLAY_META = {
    tema:{label:'特码',size:1,type:'number',scope:'special'},
    pingxiao:{label:'平肖',size:1,type:'zodiac',scope:'all'},
    lianxiao2:{label:'二连肖',size:2,type:'zodiac',scope:'all'},
    lianxiao3:{label:'三连肖',size:3,type:'zodiac',scope:'all'},
    lianxiao4:{label:'四连肖',size:4,type:'zodiac',scope:'all'},
    lianxiao5:{label:'五连肖',size:5,type:'zodiac',scope:'all'},
    erzhonger:{label:'二中二',size:2,type:'number',scope:'regular'},
    sanzhongsan:{label:'三中三',size:3,type:'number',scope:'regular'},
    pingwei:{label:'平尾',size:1,type:'tail',scope:'all'}
  };
  var RED = [1,2,7,8,12,13,18,19,23,24,29,30,34,35,40,45,46];
  var BLUE = [3,4,9,10,14,15,20,25,26,31,36,37,41,42,47,48];
  function copy(a) { var b = {}; Object.keys(a || {}).forEach(function (k) { b[k] = a[k]; }); return b; }
  function assign(a, b) { Object.keys(b || {}).forEach(function (k) { a[k] = b[k]; }); return a; }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && Math.abs(n) <= MAX_SAFE; }
  function fail(message) { throw new Error(message); }
  function safeAdd(a, b) { var n = a + b; if (!isInt(n)) fail('金额合计超出安全计算范围'); return n; }
  function normalizeZodiacName(value) {
    // Zodiac display/settings compatibility only; no slip recognition rules.
    return String(value).replace(/\ud852\udc23/g, '猴').replace(/龍/g, '龙')
      .replace(/[雞鷄]/g, '鸡').replace(/馬/g, '马').replace(/豬/g, '猪')
      .replace(/老鼠/g, '鼠').replace(/老虎/g, '虎').replace(/兔子/g, '兔').replace(/公鸡/g, '鸡');
  }
  function defaultSettings() {
    return {year: 2026, yearZodiac: '马', rates: copy(DEFAULT_RATES),
      settlement: {includeSpecial: true, san2: 'atLeast', payoutIncludesStake: true},
      confirmedSettlement: true, people: ['默认'], rateOverrides: {}, qss:root.QSSRules.defaults(), playConfig:defaultPlayConfig()};
  }
  function isSupportedKind(kind) { return typeof kind==='string'&&(Object.prototype.hasOwnProperty.call(PLAY_META,kind)||root.QSSRules.isKind(kind)); }
  function defaultPlayConfig() { return {version:1,plays:{}}; }
  function decimalRatio(value) {
    if(typeof value!=='number'||!isFinite(value)||value<0||!/^[0-9]+(?:\.[0-9]{1,4})?$/.test(String(value)))fail('小数配置须为非负数且最多四位小数');
    var parts=String(value).split('.'),denominator=Math.pow(10,(parts[1]||'').length);
    return {numerator:Number(parts[0])*denominator+Number(parts[1]||0),denominator:denominator};
  }
  function exactAmount(cents,rate,percent) {
    var fraction=decimalRatio(rate);
    return proportionalRebate(cents,fraction.numerator,fraction.denominator*(percent?100:1));
  }
  function validatePlayConfig(config, allowLegacyFull) {
    if(!config||config.version!==1||!config.plays||typeof config.plays!=='object'||Array.isArray(config.plays))fail('玩法配置版本或结构无效');
    if(config.yearZodiac===undefined&&Object.keys(config.plays).length)Object.keys(PLAY_META).forEach(function(kind){if(kind!=='tema'&&!(allowLegacyFull===true&&kind==='pingwei')&&!Object.prototype.hasOwnProperty.call(config.plays,kind))fail('玩法配置缺少 '+kindLabel(kind));});
    Object.keys(config.plays).forEach(function(kind){
      if(!Object.prototype.hasOwnProperty.call(PLAY_META,kind)||kind==='tema')fail('玩法配置包含未知玩法：'+kind);
      var value=config.plays[kind];
      if(!value||typeof value.enabled!=='boolean'||typeof value.payoutIncludesStake!=='boolean')fail(kindLabel(kind)+'启用状态或本金规则无效');
      if(value.scope!=='regular'&&value.scope!=='all')fail(kindLabel(kind)+'开奖范围须为 regular 或 all');
      if(kind==='pingwei'){
        if(value.scope!=='all')fail('平尾开奖范围固定为6个正码加特码');
        if(!Object.prototype.hasOwnProperty.call(value,'zeroOdds'))fail('平尾缺少0尾赔率配置');
        if(value.zeroOdds!==null){decimalRatio(value.zeroOdds);if(value.zeroOdds<=0||value.zeroOdds>1000000)fail('0尾赔率须大于0且不超过1000000');}
        if(value.enabled&&value.zeroOdds===null)fail('平尾已启用，请配置0尾赔率');
      }else if(Object.prototype.hasOwnProperty.call(value,'zeroOdds'))fail(kindLabel(kind)+'不支持0尾赔率');
      if(value.odds!==null){decimalRatio(value.odds);if(value.odds<=0||value.odds>1000000)fail(kindLabel(kind)+'赔率须大于 0 且不超过 1000000');}
      if(value.specialOdds!==undefined&&value.specialOdds!==null){if(PLAY_META[kind].type!=='zodiac')fail(kindLabel(kind)+'不支持当年生肖赔率');decimalRatio(value.specialOdds);if(value.specialOdds<=0||value.specialOdds>1000000)fail(kindLabel(kind)+'当年生肖赔率须大于 0 且不超过 1000000');}
      if(value.enabled&&value.odds===null)fail(kindLabel(kind)+'已启用，请配置赔率');
      decimalRatio(value.rebatePct);if(value.rebatePct>100)fail(kindLabel(kind)+'返水比例须为 0 至 100');
    });
    if(config.yearZodiac!==undefined)checkZodiac(config.yearZodiac);
    return config;
  }
  function checkZodiac(z) { z = normalizeZodiacName(z); if (ZODIACS.indexOf(z) < 0) fail('生肖必须是鼠、牛、虎、兔、龙、蛇、马、羊、猴、鸡、狗、猪之一'); return z; }
  function checkNumber(n) { if (!isInt(n) || n < 1 || n > 49) fail('号码必须是 01 至 49 的整数'); return n; }
  function zodiacForNumber(number, yearZodiac) {
    checkNumber(number); var i = ZODIACS.indexOf(checkZodiac(yearZodiac || '马'));
    return ZODIACS[(i - ((number - 1) % 12) + 12) % 12];
  }
  function numbersForZodiac(zodiac, yearZodiac) {
    zodiac = checkZodiac(zodiac); checkZodiac(yearZodiac || '马');
    var out = []; for (var n = 1; n <= 49; n++) if (zodiacForNumber(n, yearZodiac) === zodiac) out.push(n); return out;
  }
  function colorForNumber(n) { checkNumber(n); return RED.indexOf(n) >= 0 ? 'red' : (BLUE.indexOf(n) >= 0 ? 'blue' : 'green'); }
  function kindLabel(kind) { return PLAY_META[kind]?PLAY_META[kind].label:root.QSSRules.isKind(kind)?root.QSSRules.kindLabel(kind):'历史记录'; }
  function formatMoney(cents) { if (!isInt(cents)) fail('金额必须是安全整数分'); return (cents / 100).toFixed(2); }
  function unique(values, label) {
    var seen = Object.create(null);
    values.forEach(function (v) { if (seen[v]) fail('同组' + label + '重复：' + v + '；请拆成独立行录入'); seen[v] = true; }); return values;
  }
  function uniqueStrings(a) { return a.filter(function(v,i){return a.indexOf(v)===i;}); }
  function itemTotal(items) {
    if(!Array.isArray(items)||items.length>MAX_ITEMS) fail('记录明细缺失或超过 5,000 注');
    return items.reduce(function(sum,item){if(!item||!isInt(item.stakeCents)||item.stakeCents<=0) fail('记录中的注额无效');return safeAdd(sum,item.stakeCents);},0);
  }
  function checkedRecordTotal(record) {
    if(record&&typeof record==='object'&&checkedFrozenTotals.has(record))return checkedFrozenTotals.get(record);
    if(!record||(MARKETS.indexOf(record.market)<0&&record.market!=='老澳'))fail('记录彩种无效');
    if(typeof record.person!=='string'||!record.person.trim())fail('记录下单人无效');
    var total=itemTotal(record.items);if(!record.items.length)fail('记录没有有效明细');
    record.items.forEach(function(item){validateItem(item);if(item.market!==record.market)fail('记录内彩种与记录彩种不一致');});
    if(!isInt(record.totalCents)||total!==record.totalCents) fail('记录总额与明细不符，请检查备份数据');
    if(record.settlement){
      var settlement=record.settlement;
      ['returnCents','rebateCents','bankerNetCents','winningStakeCents'].forEach(function(key){if(!isInt(settlement[key]))fail('结算金额无效');});
      var direction=record.manualAdjustment&&record.manualAdjustment.direction==='decrease'?-1:1;
      if(settlement.returnCents*direction<0||settlement.rebateCents*direction<0||settlement.rebateCents*direction>total||settlement.winningStakeCents*direction<0||settlement.winningStakeCents*direction>total)fail('结算金额不在有效范围内');
      if(safeAdd(safeAdd(total*direction,-settlement.returnCents),-settlement.rebateCents)!==settlement.bankerNetCents)fail('结算总额无法对账');
    }
    if(deeplyFrozen(record))checkedFrozenTotals.set(record,total);
    return total;
  }
  function proportionalRebate(value,part,whole){
    // Exact integer (value * part / whole), rounded half up without unsafe multiplication.
    var quotient=0,remainder=0,unitQ=Math.floor(value/whole),unitR=value%whole,multiplier=part;
    while(multiplier>0){
      if(multiplier%2===1){quotient=safeAdd(quotient,unitQ);if(remainder>=whole-unitR){remainder-=whole-unitR;quotient=safeAdd(quotient,1);}else remainder+=unitR;}
      multiplier=Math.floor(multiplier/2);if(!multiplier)break;
      unitQ=safeAdd(unitQ,unitQ);if(unitR>=whole-unitR){unitR-=whole-unitR;unitQ=safeAdd(unitQ,1);}else unitR+=unitR;
    }
    return remainder>=whole-remainder?safeAdd(quotient,1):quotient;
  }
  var deeplyFrozenObjects=new WeakSet(),activeProjectionCache=new WeakMap(),temaProjectionCache=new WeakMap(),checkedFrozenTotals=new WeakMap();
  function deeplyFrozen(value){
    if(!value||typeof value!=='object')return true;
    if(deeplyFrozenObjects.has(value))return true;
    if(!Object.isFrozen(value)||!Object.keys(value).every(function(key){return deeplyFrozen(value[key]);}))return false;
    deeplyFrozenObjects.add(value);return true;
  }
  function freezeProjection(value){
    if(!value||typeof value!=='object'||deeplyFrozenObjects.has(value))return value;
    // Most ledger fields are primitive. Avoid an interpreted recursive call
    // for every number/string while still freezing every reachable object.
    var keys=Object.keys(value);
    for(var i=0;i<keys.length;i++){var child=value[keys[i]];if(child&&typeof child==='object')freezeProjection(child);}
    Object.freeze(value);deeplyFrozenObjects.add(value);return value;
  }
  function projectionWithCache(record,cache,project){
    if(record&&typeof record==='object'&&cache.has(record))return cache.get(record);
    var immutable=deeplyFrozen(record),result=project(record);
    if(immutable&&record&&typeof record==='object'){freezeProjection(result);cache.set(record,result);}
    return result;
  }
  function projectTemaRecord(record){return projectionWithCache(record,temaProjectionCache,projectTemaRecordUncached);}
  function projectActiveRecord(record){return projectionWithCache(record,activeProjectionCache,projectActiveRecordUncached);}
  function projectTemaRecordUncached(record){
    if(!record||!Array.isArray(record.items))fail('记录明细缺失');
    var items=record.items.filter(function(item){return item&&item.kind==='tema';});
    if(!items.length)return null;
    var mixed=items.length!==record.items.length,hasOverride=Object.prototype.hasOwnProperty.call(record,'temaSettlement');
    if(!mixed&&!hasOverride){checkedRecordTotal(record);return record;}
    var oldTotal=itemTotal(record.items);if(oldTotal!==record.totalCents)fail('记录总额与明细不符，请检查备份数据');
    var projected=deeplyFrozen(record)?assign({},record):copy(record);delete projected.temaSettlement;
    projected.items=items.map(function(item){var result=copy(item);result.source=('0'+item.selection[0]).slice(-2)+'各'+formatMoney(item.stakeCents);return result;});
    projected.totalCents=itemTotal(projected.items);projected.source=projected.items.map(function(item){return item.source;}).join('\n');
    if(hasOverride)projected.settlement=record.temaSettlement;
    else if(record.settlement){
      var previous=record.settlement;if(!Array.isArray(previous.lines))fail('历史结算缺少可分离的特码明细');
      var lines=previous.lines.filter(function(line){return line&&line.kind==='tema';});
      if(lines.length!==items.length)fail('历史结算中的特码明细与记录不符');
      var returned=0,winning=0;
      lines.forEach(function(line,index){
        validateItem(line);
        if(line.selection[0]!==items[index].selection[0]||line.stakeCents!==items[index].stakeCents||typeof line.won!=='boolean'||!isInt(line.returnCents)||line.returnCents<0||(!line.won&&line.returnCents!==0))fail('历史结算中的特码明细无效');
        returned=safeAdd(returned,line.returnCents);if(line.won)winning=safeAdd(winning,line.stakeCents);
      });
      if(!isInt(previous.rebateCents)||previous.rebateCents<0||previous.rebateCents>oldTotal)fail('历史反水金额无效');
      var rebate=proportionalRebate(previous.rebateCents,projected.totalCents,oldTotal);
      projected.settlement=assign(copy(previous),{lines:lines.slice(),returnCents:returned,winningStakeCents:winning,rebateCents:rebate,bankerNetCents:safeAdd(safeAdd(projected.totalCents,-returned),-rebate),rulesNote:'历史特码结算：返奖及中奖注额取特码明细；原整笔反水按特码注额占比分摊并四舍五入到分。'});
    }else projected.settlement=null;
    checkedRecordTotal(projected);return projected;
  }
  function projectActiveRecordUncached(record){
    if(!record||!Array.isArray(record.items))fail('记录明细缺失');
    var items=record.items.filter(function(item){return item&&isSupportedKind(item.kind);});
    if(!items.length)return null;
    if(items.length===record.items.length){checkedRecordTotal(record);return record;}
    if(items.every(function(item){return item.kind==='tema';})){
      var legacy=copy(record);
      if(Object.prototype.hasOwnProperty.call(record,'activeSettlement'))legacy.temaSettlement=record.activeSettlement;
      return projectTemaRecord(legacy);
    }
    var total=itemTotal(record.items);if(total!==record.totalCents)fail('记录总额与明细不符');
    var projected=deeplyFrozen(record)?assign({},record):copy(record);projected.items=items;projected.totalCents=itemTotal(items);
    if(Object.prototype.hasOwnProperty.call(record,'activeSettlement'))projected.settlement=record.activeSettlement;
    else if(record.settlement){
      var previous=record.settlement,lines=(previous.lines||[]).filter(function(line){return isSupportedKind(line.kind);});
      if(lines.length!==items.length)fail('历史结算缺少对应明细');
      var returned=0,winning=0;
      lines.forEach(function(line,index){
        var item=items[index];validateItem(line);
        if(line.kind!==item.kind||JSON.stringify(line.selection)!==JSON.stringify(item.selection)||line.stakeCents!==item.stakeCents||typeof line.won!=='boolean'||!isInt(line.returnCents)||line.returnCents<0)fail('历史结算明细不一致');
        returned=safeAdd(returned,line.returnCents);if(line.won)winning=safeAdd(winning,line.stakeCents);
      });
      var rebate=proportionalRebate(previous.rebateCents,projected.totalCents,total);
      projected.settlement=assign(copy(previous),{lines:lines,returnCents:returned,winningStakeCents:winning,rebateCents:rebate,bankerNetCents:safeAdd(safeAdd(projected.totalCents,-returned),-rebate)});
    }else projected.settlement=null;
    checkedRecordTotal(projected);return projected;
  }
  function activeRecords(records){return (records||[]).map(projectActiveRecord).filter(function(record){return record!==null;});}
  function temaRecords(records){return (records||[]).map(projectTemaRecord).filter(function(record){return record!==null;});}
  // The ledger validator has already bounded the sum of all unsigned raw
  // stakes. Each active projection is a subset, so its signed stake totals
  // cannot overflow. Settlement amounts have no such bound across records.
  function validateAggregateTotals(records) {
    var returned=0,rebate=0,net=0;
    function addSettlementTotal(total,value){
      if(!isInt(value))fail('结算金额无效');
      return safeAdd(total,value);
    }
    records.forEach(function(record){
      if(record.deletedAt||MARKETS.indexOf(record.market)<0)return;
      record=projectActiveRecord(record);
      if(!record)return;
      record.items.forEach(function(item){
        if(item.kind!=='tema')return;
        if(!Array.isArray(item.selection)||item.selection.length!==1)fail('特码记录必须为单号码明细');
        checkNumber(item.selection[0]);
      });
      var settlement=record.settlement;
      if(!settlement)return;
      returned=addSettlementTotal(returned,settlement.returnCents);
      rebate=addSettlementTotal(rebate,settlement.rebateCents);
      net=addSettlementTotal(net,settlement.bankerNetCents);
    });
  }
  function summarize(records, filters) {
    filters=filters||{}; var result={totalCents:0,count:0,unitCount:0,numbers:[],byKind:[],byPerson:[],settledStakeCents:0,returnCents:0,rebateCents:0,bankerNetCents:0,pendingCents:0}, kinds=Object.create(null),people=Object.create(null);
    for(var n=1;n<=49;n++) result.numbers.push({number:n,stakeCents:0});
    (records||[]).forEach(function(record){
      if(record.deletedAt) return;
      if(MARKETS.indexOf(record.market)<0)return;
      if(['market','person'].some(function(key){return filters[key] && filters[key]!=='全部' && record[key]!==filters[key];}))return;
      record=projectActiveRecord(record);if(!record)return;
      var direction=record.manualAdjustment&&record.manualAdjustment.direction==='decrease'?-1:1;
      var total=record.totalCents*direction;result.totalCents=safeAdd(result.totalCents,total);result.count++;result.unitCount+=record.items.length;
      var person=record.person||'默认'; if(!Object.prototype.hasOwnProperty.call(people,person)) people[person]={person:person,totalCents:0,count:0};
      people[person].totalCents=safeAdd(people[person].totalCents,total);people[person].count++;
      record.items.forEach(function(item){
        if(!Object.prototype.hasOwnProperty.call(kinds,item.kind))kinds[item.kind]={kind:item.kind,totalCents:0,unitCount:0};
        kinds[item.kind].totalCents=safeAdd(kinds[item.kind].totalCents,item.stakeCents*direction);kinds[item.kind].unitCount++;
        if(item.kind==='tema'){if(!Array.isArray(item.selection)||item.selection.length!==1)fail('特码记录必须为单号码明细');var index=checkNumber(item.selection[0])-1;result.numbers[index].stakeCents=safeAdd(result.numbers[index].stakeCents,item.stakeCents*direction);}
      });
      if(record.settlement){
        result.settledStakeCents=safeAdd(result.settledStakeCents,total);
        ['returnCents','rebateCents','bankerNetCents'].forEach(function(key){if(!isInt(record.settlement[key]))fail('结算金额无效');result[key]=safeAdd(result[key],record.settlement[key]);});
      }else result.pendingCents=safeAdd(result.pendingCents,total);
    });
    result.byKind=Object.keys(kinds).map(function(k){return kinds[k];});result.byPerson=Object.keys(people).map(function(k){return people[k];});return result;
  }
  // This optional projection is intentionally separate from summarize and view.
  // Returns come from saved settlement lines; only the original per-kind
  // rebate rounding is reproduced from immutable admission/settlement rules.
  function summarizeLegacyPlays(records, filters) {
    filters=filters||{};
    var kinds=['pingxiao','lianxiao2','lianxiao3','lianxiao4','lianxiao5','erzhonger','sanzhongsan','pingwei'];
    var fields=['totalCents','pendingCents','settledStakeCents','returnCents','rebateCents','bankerNetCents','unitCount'];
    function empty(){var value={};fields.forEach(function(key){value[key]=0;});return value;}
    var rows=kinds.map(function(kind){return assign({kind:kind,label:kindLabel(kind)},empty());}),lookup=Object.create(null),totals=empty();
    var pingxiaoZodiacs=ZODIACS.map(function(zodiac){return {zodiac:zodiac,totalCents:0,unitCount:0};}),pingweiTails=[];
    for(var tail=0;tail<=9;tail++)pingweiTails.push({tail:tail,totalCents:0,unitCount:0});
    rows.forEach(function(row){lookup[row.kind]=row;});
    (records||[]).forEach(function(original){
      if(!original||original.deletedAt||MARKETS.indexOf(original.market)<0)return;
      if(filters.market&&filters.market!=='全部'&&original.market!==filters.market)return;
      if(!Array.isArray(original.items))fail('记录明细缺失');
      if(!original.items.some(function(item){return item&&Object.prototype.hasOwnProperty.call(lookup,item.kind);}))return;
      var record=projectActiveRecord(original),groups=Object.create(null),st=record.settlement;
      record.items.forEach(function(item){
        groups[item.kind]=safeAdd(groups[item.kind]||0,item.stakeCents);
        var row=lookup[item.kind];if(!row)return;
        row.totalCents=safeAdd(row.totalCents,item.stakeCents);row.unitCount=safeAdd(row.unitCount,1);
        if(item.kind==='pingxiao'){
          var zodiacRow=pingxiaoZodiacs[ZODIACS.indexOf(item.selection[0])];
          zodiacRow.totalCents=safeAdd(zodiacRow.totalCents,item.stakeCents);zodiacRow.unitCount=safeAdd(zodiacRow.unitCount,1);
        }else if(item.kind==='pingwei'){
          var tailRow=pingweiTails[item.selection[0]];
          tailRow.totalCents=safeAdd(tailRow.totalCents,item.stakeCents);tailRow.unitCount=safeAdd(tailRow.unitCount,1);
        }
        var field=st?'settledStakeCents':'pendingCents';row[field]=safeAdd(row[field],item.stakeCents);
      });
      if(!st)return;
      if(!Array.isArray(st.lines)||st.lines.length!==record.items.length)fail('玩法统计缺少对应结算明细');
      var returned=0,winning=0;
      st.lines.forEach(function(line,index){
        var item=record.items[index];
        if(!line||line.kind!==item.kind||JSON.stringify(line.selection)!==JSON.stringify(item.selection)||line.stakeCents!==item.stakeCents||typeof line.won!=='boolean'||!isInt(line.returnCents)||line.returnCents<0||(!line.won&&line.returnCents!==0))fail('玩法统计结算明细不一致');
        returned=safeAdd(returned,line.returnCents);if(line.won)winning=safeAdd(winning,line.stakeCents);
        if(lookup[item.kind])lookup[item.kind].returnCents=safeAdd(lookup[item.kind].returnCents,line.returnCents);
      });
      if(returned!==st.returnCents||winning!==st.winningStakeCents)fail('玩法统计结算返奖合计不一致');
      var snapshot=record.playConfigSnapshot,rebate=0;
      if(!snapshot||snapshot.yearZodiac===undefined)fail('玩法统计缺少入账规则快照');
      validatePlayConfig(snapshot);
      kinds.forEach(function(kind){
        if(!groups[kind])return;
        var rule=snapshot.plays[kind];if(!rule||!rule.enabled||rule.odds===null)fail('玩法统计入账规则快照无效');
        var cents=exactAmount(groups[kind],rule.rebatePct,true);rebate=safeAdd(rebate,cents);
        lookup[kind].rebateCents=safeAdd(lookup[kind].rebateCents,cents);
      });
      if(groups.tema){
        var saved=st.settingsSnapshot;if(!saved||!saved.rates)fail('玩法统计缺少特码结算规则快照');
        var rates=assign(copy(saved.rates),(saved.rateOverrides||{})[record.market+'|'+record.person]||{});
        if(typeof rates.rebatePct!=='number'||!isFinite(rates.rebatePct)||rates.rebatePct<0||rates.rebatePct>100)fail('玩法统计特码反水快照无效');
        rebate=safeAdd(rebate,roundedAmount(groups.tema,rates.rebatePct/100));
      }
      if(rebate!==st.rebateCents)fail('玩法统计反水与已保存结算不一致');
    });
    rows.forEach(function(row){row.bankerNetCents=safeAdd(safeAdd(row.settledStakeCents,-row.returnCents),-row.rebateCents);fields.forEach(function(key){totals[key]=safeAdd(totals[key],row[key]);});});
    pingxiaoZodiacs.sort(function(a,b){return b.totalCents-a.totalCents||ZODIACS.indexOf(a.zodiac)-ZODIACS.indexOf(b.zodiac);});
    pingweiTails.sort(function(a,b){return b.totalCents-a.totalCents||a.tail-b.tail;});
    return {rows:rows,totals:totals,pingxiaoZodiacs:pingxiaoZodiacs,pingweiTails:pingweiTails};
  }
  function summarizePlays(records,filters){
    var old=(records||[]).filter(function(r){return !r.qssSettingsSnapshot;}),result=summarizeLegacyPlays(old,filters),fields=['totalCents','pendingCents','settledStakeCents','returnCents','rebateCents','bankerNetCents','unitCount'],lookup={};
    result.rows=result.rows.filter(function(row){return row.totalCents!==0;});
    result.texiaoZodiacs=ZODIACS.map(function(zodiac){return {zodiac:zodiac,totalCents:0,unitCount:0};});
    root.QSSRules.catalog().forEach(function(meta){if(meta.kind==='tema')return;var row={kind:meta.kind,label:meta.label};fields.forEach(function(k){row[k]=0;});result.rows.push(row);lookup[meta.kind]=row;});
    (records||[]).forEach(function(r){if(!r.qssSettingsSnapshot||r.deletedAt||MARKETS.indexOf(r.market)<0||filters&&filters.market&&filters.market!=='全部'&&filters.market!==r.market)return;
      r.items.forEach(function(item,index){if(item.kind==='tema')return;var row=lookup[item.kind];if(!row){row={kind:item.kind,label:item.kindLabel||item.qssBet.type||'历史玩法'};fields.forEach(function(k){row[k]=0;});lookup[item.kind]=row;result.rows.push(row);}row.totalCents=safeAdd(row.totalCents,item.stakeCents);row.unitCount++;
        row[r.settlement?'settledStakeCents':'pendingCents']=safeAdd(row[r.settlement?'settledStakeCents':'pendingCents'],item.stakeCents);
        if(r.settlement){var line=r.settlement.lines[index];row.returnCents=safeAdd(row.returnCents,line.returnCents);row.rebateCents=safeAdd(row.rebateCents,line.rebateCents||0);}
        if(['平特','平特一肖','平特一肖带主肖'].indexOf(item.qssBet.type)>=0){var z=item.qssBet.label.split('_').slice(1).join('_'),zr=result.pingxiaoZodiacs.filter(function(v){return v.zodiac===z;})[0];if(zr){zr.totalCents=safeAdd(zr.totalCents,item.stakeCents);zr.unitCount++;}}
        if(['特肖','特肖带主肖'].indexOf(item.qssBet.type)>=0){var specialZ=item.qssBet.label.split('_').slice(1).join('_'),specialRow=result.texiaoZodiacs.filter(function(v){return v.zodiac===specialZ;})[0];if(!specialRow)fail('特肖统计生肖无效');specialRow.totalCents=safeAdd(specialRow.totalCents,item.stakeCents);specialRow.unitCount++;}
        if(['平特尾','平尾','平尾零尾'].indexOf(item.qssBet.type)>=0){var t=item.selection[0]%10,tr=result.pingweiTails.filter(function(v){return v.tail===t;})[0];tr.totalCents=safeAdd(tr.totalCents,item.stakeCents);tr.unitCount++;}
      });
    });
    Object.keys(lookup).forEach(function(k){var row=lookup[k];row.bankerNetCents=safeAdd(safeAdd(row.settledStakeCents,-row.returnCents),-row.rebateCents);fields.forEach(function(f){result.totals[f]=safeAdd(result.totals[f],row[f]);});});
    result.pingxiaoZodiacs.sort(function(a,b){return b.totalCents-a.totalCents||ZODIACS.indexOf(a.zodiac)-ZODIACS.indexOf(b.zodiac);});result.texiaoZodiacs.sort(function(a,b){return b.totalCents-a.totalCents||ZODIACS.indexOf(a.zodiac)-ZODIACS.indexOf(b.zodiac);});result.pingweiTails.sort(function(a,b){return b.totalCents-a.totalCents||a.tail-b.tail;});return result;
  }
  function validateItem(item) {
    if(item&&item.qssBet)return root.QSSRules.validateItem(item);
    if(!item||!isSupportedKind(item.kind))fail('玩法未在当前范围内');
    var meta=PLAY_META[item.kind];
    if(!Array.isArray(item.selection)||item.selection.length!==meta.size)fail(kindLabel(item.kind)+'组合数量须为'+meta.size);
    if(!isInt(item.stakeCents)||item.stakeCents===0)fail('注额须为有效非零整数分');
    item.selection.forEach(function(value){
      if(meta.type==='zodiac'){if(typeof value!=='string'||ZODIACS.indexOf(value)<0)fail('生肖须为十二生肖之一');}
      else if(meta.type==='tail'){if(!isInt(value)||value<0||value>9)fail('尾数须为0至9的整数');}
      else checkNumber(value);
    });
    if(item.selection.length>1)unique(item.selection,'选号');
    return item;
  }
  function roundedAmount(cents, multiple) {var amount=Math.round(cents*multiple);if(!isInt(amount)||amount<0)fail('返奖金额超出安全计算范围');return amount;}
  function temaExposure(records, settings, filters) {
    settings=settings||defaultSettings();filters=filters||{};
    var chosen=MARKETS.filter(function(market){return !filters.market||filters.market==='全部'||filters.market===market;});
    var result={temaStakeCents:0,otherPendingCents:0,rebateCents:0,maxProfitCents:0,maxLossCents:0,bestNetCents:0,worstNetCents:0,available:true,errors:[],markets:[]};
    var grouped=Object.create(null);
    chosen.forEach(function(market){grouped[market]=[];});
    (records||[]).forEach(function(record){
      if(record.deletedAt||!Object.prototype.hasOwnProperty.call(grouped,record.market))return;
      if(filters.person&&filters.person!=='全部'&&record.person!==filters.person)return;
      record=projectActiveRecord(record);if(!record||record.settlement)return;
      if(record.items.some(function(item){return item.kind!=='tema';}))record=projectTemaRecord(record);
      if(record)grouped[record.market].push(record);
    });
    chosen.forEach(function(market){
      var group={market:market,temaStakeCents:0,otherPendingCents:0,rebateCents:0,available:true,errors:[],bestNetCents:0,worstNetCents:0,maxProfitCents:0,maxLossCents:0,bestNumbers:[],worstNumbers:[],numbers:[]};
      for(var n=1;n<=49;n++)group.numbers.push({number:n,stakeCents:0,returnCents:0,netCents:0});
      grouped[market].forEach(function(record){
        var temaItems=[],recordStake=0,direction=record.manualAdjustment&&record.manualAdjustment.direction==='decrease'?-1:1;
        record.items.forEach(function(item){
          if(item.kind==='tema'){
            temaItems.push(item);recordStake=safeAdd(recordStake,item.stakeCents);
            var row=group.numbers[item.selection[0]-1];row.stakeCents=safeAdd(row.stakeCents,item.stakeCents*direction);
          }
        });
        group.temaStakeCents=safeAdd(group.temaStakeCents,recordStake*direction);
        if(!recordStake)return;
        try{
          if(direction<0){var reversal=record.manualAdjustment.reversal;if(!reversal)fail('手动减少缺少冲减快照');group.rebateCents=safeAdd(group.rebateCents,-reversal.rebateCents);var adjusted=group.numbers[record.manualAdjustment.number-1];adjusted.returnCents=safeAdd(adjusted.returnCents,-reversal.returnCents);return;}
          var qs=record.qssSettingsSnapshot;
          if(qs){var qr=Object.prototype.hasOwnProperty.call(qs.normalOdds,'特码')?qs.normalOdds['特码']:47;var qb=QSSRules.temaRebate(qs);group.rebateCents=safeAdd(group.rebateCents,roundedAmount(recordStake,qb/100)*direction);temaItems.forEach(function(item){var row=group.numbers[item.selection[0]-1];row.returnCents=safeAdd(row.returnCents,roundedAmount(item.stakeCents,qr)*direction);});return;}
          var rules=settings.settlement;
          if(!rules||typeof rules.payoutIncludesStake!=='boolean')fail('请先配置倍率是否包含本金');
          var rates=assign(copy(settings.rates),(settings.rateOverrides||{})[record.market+'|'+record.person]||{});
          if(typeof rates.tema!=='number'||!isFinite(rates.tema)||rates.tema<=0)fail('特码倍率未配置或无效');
          if(typeof rates.rebatePct!=='number'||!isFinite(rates.rebatePct)||rates.rebatePct<0||rates.rebatePct>100)fail('反水比例须为 0 至 100');
          var rate=rates.tema+(rules.payoutIncludesStake?0:1);
          group.rebateCents=safeAdd(group.rebateCents,roundedAmount(recordStake,rates.rebatePct/100));
          temaItems.forEach(function(item){var row=group.numbers[item.selection[0]-1];row.returnCents=safeAdd(row.returnCents,roundedAmount(item.stakeCents,rate));});
        }catch(error){group.available=false;group.errors.push(market+' / '+record.person+'：'+error.message);}
      });
      if(group.available){
        try{
          group.numbers.forEach(function(row){row.netCents=safeAdd(safeAdd(group.temaStakeCents,-row.returnCents),-group.rebateCents);});
          if(group.temaStakeCents||group.rebateCents||group.numbers.some(function(row){return row.stakeCents||row.returnCents;})){
            group.bestNetCents=Math.max.apply(null,group.numbers.map(function(row){return row.netCents;}));
            group.worstNetCents=Math.min.apply(null,group.numbers.map(function(row){return row.netCents;}));
            group.bestNumbers=group.numbers.filter(function(row){return row.netCents===group.bestNetCents;}).map(function(row){return row.number;});
            group.worstNumbers=group.numbers.filter(function(row){return row.netCents===group.worstNetCents;}).map(function(row){return row.number;});
            group.maxProfitCents=Math.max(0,group.bestNetCents);group.maxLossCents=Math.max(0,-group.worstNetCents);
          }
        }catch(error){group.available=false;group.errors.push(market+'：'+error.message);}
      }
      group.errors=uniqueStrings(group.errors);
      if(!group.available){
        group.rebateCents=null;group.bestNetCents=null;group.worstNetCents=null;group.maxProfitCents=null;group.maxLossCents=null;
        group.bestNumbers=[];group.worstNumbers=[];group.numbers.forEach(function(row){row.returnCents=null;row.netCents=null;});
      }
      result.temaStakeCents=safeAdd(result.temaStakeCents,group.temaStakeCents);result.otherPendingCents=safeAdd(result.otherPendingCents,group.otherPendingCents);
      result.markets.push(group);if(!group.available){result.available=false;result.errors=result.errors.concat(group.errors);}
    });
    if(result.available){
      try{
        result.markets.forEach(function(group){result.rebateCents=safeAdd(result.rebateCents,group.rebateCents);result.bestNetCents=safeAdd(result.bestNetCents,group.bestNetCents);result.worstNetCents=safeAdd(result.worstNetCents,group.worstNetCents);});
        result.maxProfitCents=Math.max(0,result.bestNetCents);result.maxLossCents=Math.max(0,-result.worstNetCents);
      }catch(error){result.available=false;result.errors.push('全部彩种：'+error.message);}
    }
    if(!result.available){result.rebateCents=null;result.bestNetCents=null;result.worstNetCents=null;result.maxProfitCents=null;result.maxLossCents=null;}
    return result;
  }
  function settlementArgs(record,draw,settings){
    if(record.deletedAt)fail('已删除记录请先恢复');
    if(MARKETS.indexOf(draw.market)<0||record.market!==draw.market)fail('开奖地区与记录不一致');
    checkedRecordTotal(record);
    var pricing=record.qssSettingsSnapshot||copy(settings.qss);if(!record.qssSettingsSnapshot){pricing.historicalRates=assign(copy(settings.rates),(settings.rateOverrides||{})[record.market+"|"+record.person]||{});pricing.historicalYear=settings.year;pricing.historicalIncludesStake=settings.settlement.payoutIncludesStake;}return [record,draw,pricing];
  }
  function settleRecord(record,draw,settings){return root.QSSRules.settle.apply(root.QSSRules,settlementArgs(record,draw,settings));}
  // Bound batches by records and items; large single records travel alone.
  function settleRequests(requests,consume){
    var results=[],batch=[],items=0,offset=0;
    function flush(){
      if(!batch.length)return;
      var values;
      if(root.QSParser&&typeof root.QSParser.settleMany==='function'){
        var settings=[],requests=batch.map(function(args){
          var index=settings.indexOf(args[2]);if(index<0){index=settings.length;settings.push(args[2]);}
          var record={items:args[0].items.map(function(item){
            var saved=item.qssBet&&item.qssBet.wisdomRecord;if(!saved)return item;
            // Only transport is projected; ledger validation still sees every original field.
            return {kind:item.kind,selection:item.selection,stakeCents:item.stakeCents,qssBet:{wisdomRecord:{投注类型:saved.投注类型,订单信息:saved.订单信息,金额:saved.金额,注数:saved.注数}}};
          })};
          if(args[0].manualAdjustment!==undefined)record.manualAdjustment=args[0].manualAdjustment;
          if(args[0].playConfigSnapshot!==undefined)record.playConfigSnapshot=args[0].playConfigSnapshot;
          if(args[0].qssDrawImpactScopes!==undefined)record.qssDrawImpactScopes=args[0].qssDrawImpactScopes;
          return [record,{market:args[1].market,special:args[1].special,regular:args[1].regular},index];
        });
        values=root.QSParser.settleMany({settings:settings,requests:requests});
      }else values=batch.map(function(args){return root.QSSRules.settle.apply(root.QSSRules,args);});
      if(!Array.isArray(values)||values.length!==batch.length)fail('批量兑奖结果不完整');
      if(consume){
        values.forEach(function(value,index){consume(value,offset+index);});
        offset+=values.length;
      }else values.forEach(function(value){results.push(value);});
      batch=[];items=0;
    }
    requests.forEach(function(args){var count=args[0].items.length;if(batch.length&&(batch.length>=64||items+count>512))flush();batch.push(args);items+=count;if(count>512)flush();});
    flush();return results;
  }
  function settleRecords(records,draw,settings){return settleRequests(records.map(function(record){return settlementArgs(record,draw,settings);}));}
  return {settleRequests:settleRequests,validateAggregateTotals:validateAggregateTotals,settleRecords:settleRecords,freezeSnapshot:freezeProjection,isDeepFrozen:deeplyFrozen,VERSION:VERSION,MARKETS:MARKETS,ZODIACS:ZODIACS,DEFAULT_RATES:DEFAULT_RATES,LEGACY_RATES:LEGACY_RATES,defaultSettings:defaultSettings,defaultPlayConfig:defaultPlayConfig,validatePlayConfig:validatePlayConfig,validateItem:validateItem,isSupportedKind:isSupportedKind,projectActiveRecord:projectActiveRecord,activeRecords:activeRecords,
    numbersForZodiac:numbersForZodiac,zodiacForNumber:zodiacForNumber,colorForNumber:colorForNumber,summarize:summarize,summarizePlays:summarizePlays,temaExposure:temaExposure,projectTemaRecord:projectTemaRecord,temaRecords:temaRecords,settleRecord:settleRecord,kindLabel:kindLabel,formatMoney:formatMoney};
}));
