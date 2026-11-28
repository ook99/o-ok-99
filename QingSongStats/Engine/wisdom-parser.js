/* Native transport and ledger serialization only. Recognition and winning rules
 * are provided exclusively by the bundled WisdomEngine. */
(function(root){
'use strict';
// Assign a shared declaration by exact group size, never infer a compound bet.
// Inspect original physical lines so invalid amounts retain exact source spans.
// Only explicit price anchors or zodiac/tail suffixes introduce decimal stakes;
// numeric selections such as 二中二01.02.03各10 remain number lists.
// A punctuation suffix ends an explicitly marked amount at the end of a
// physical line or before another complete order. Keep source offsets intact.
function qssNormalizePricePunctuation(line){
 var amounts=/(?:各(?:数|号|肖|尾|包|组|注)?|每(?:个)?(?:数|号|肖|尾|组|注)?|包(?:[ \t]*[鼠牛虎兔龙蛇马羊猴鸡狗猪龍馬雞豬]+[ \t]*肖?|肖|尾)?|个数个|个数|个|买|押)[ \t\u00a0\u202f\u3000]*[0-9０-９]+(?:[.．][0-9０-９]{1,2})?(?:[ \t]*(?:元|米|斤|块|文|[¥￥]))?([.．…]+)/g;
 return line.replace(amounts,function(match,punctuation,offset){
  var next=line.slice(offset+match.length);
  if(/^[ \t]*(?:元|米|斤|块|文|[¥￥])/.test(next)){
   return match.slice(0,-punctuation.length)+' '.repeat(punctuation.length);
  }
  if(/^[ \t\u00a0\u202f\u3000]*(?:\r?$|[,，;；。])/.test(next))return match.slice(0,-punctuation.length)+' '.repeat(punctuation.length);
  var zodiac=/^[ \t]*(?:(?:平特|平肖|平|特肖|包)[ \t]*)?[鼠牛虎兔龙蛇马羊猴鸡狗猪龍馬雞豬]+[ \t]*(?:肖[ \t]*)?(?:(?:各(?:号|数|肖)?|每(?:个)?(?:号|数|肖)?|个)[ \t]*)?[0-9０-９]/.test(next);
  var numericBoundary=punctuation.length>=3||punctuation.indexOf('…')>=0||/^[ \t]+/.test(next);
  var numericOrder=numericBoundary&&/^[ \t]*([0-9０-９]{1,2}(?:[ \t]*[.,．，、/＋+－-][ \t]*[0-9０-９]{1,2})*)[ \t]*(?:各(?:数|号)?|每(?:个)?号|个)[ \t]*[0-9０-９]/.exec(next);
  var numbers=numericOrder&&numericOrder[1].replace(/[０-９]/g,function(ch){return String.fromCharCode(ch.charCodeAt(0)-65248);}).match(/[0-9]+/g).every(function(n){return Number(n)>=1&&Number(n)<=49;});
  return zodiac||numbers?match.slice(0,-punctuation.length)+'；'+' '.repeat(punctuation.length-1):match;
 });
}
// Use the existing special-number package grammar for 包虎肖100. A single
// space keeps all later amount diagnostics aligned with the original text.
function qssNormalizeZodiacPackage(line){
 return line.replace(/(^|[,，。;；])([ \t]*(?:(?:老澳门|旧澳门|香港|新澳门|新澳|澳门|港特|澳特|港|香|澳|奥|新|门)[ \t]*[:：，,]?[ \t]*)?包[ \t]*[鼠牛虎兔龙蛇马羊猴鸡狗猪龍馬雞豬]+[ \t]*)肖(?=[ \t]*[0-9０-９零〇一二两兩三四五六七八九十百千万萬壹贰貳叁參肆伍陆陸柒捌玖拾佰仟])/g,'$1$2 ');
}
// A bare dot after a 01-49 selection separates its stake when the next
// integer is >=50, or the final token carries a currency unit. Replace only
// that delimiter, preserving UTF-16 length and the immutable original source.
// The bare-dot conversion leaves 各/每/包 and whitespace-delimited decimals intact.
function qssNormalizeDotStakes(line){
 // A standalone A/a suffix after an amount is a currency unit.
 line=line.replace(/([0-9０-９][ \t]*)[AaＡａ](?=$|[ \t\r,，;；。])/g,'$1元');
 line=qssNormalizeZodiacPackage(qssNormalizePricePunctuation(line));
 var normalized=line.replace(/[０-９]/g,function(ch){return String.fromCharCode(ch.charCodeAt(0)-65248);}).replace(/．/g,'.'),chars=line.split('');
 var boundary=/(^|[,，;；。:：])/g,b;
 while((b=boundary.exec(normalized))){
  var at=b.index+b[0].length;
  while(at<normalized.length){
   var rest=normalized.slice(at),m=/^[ \t\u00a0\u202f\u3000]*(?:(?:老澳门|旧澳门|香港|新澳门|新澳|澳门|港特|澳特|港|香|澳|奥|新|门)[ \t]*)?(?:(?:特码|特号|号码|二中二|三中二|三中三|二中特|特串)[ \t]*)?([0-9]+(?:[ \t]*\.[ \t]*[0-9]*)+)/.exec(rest);
   if(!m)break;
   var token=m[1],start=at+m[0].length-token.length,end=at+m[0].length,after=normalized.slice(end);
   // A later explicit declaration prices the whole selection list.
   if(/^[ \t]*(?:各|每|包|个|买|押)/.test(after))break;
   var parts=token.split('.'),price=-1;
   if(!/^[0-9]{1,2}$/.test(parts[0])||Number(parts[0])<1||Number(parts[0])>49)break;
   for(var i=1;i<parts.length;i++){
    var part=parts[i].trim();
    if(!/^[0-9]+$/.test(part))break;
    if(Number(part)>=50){price=i;break;}
    if(i===parts.length-1&&/^[ \t]*(?:元|米|斤|块|文|[¥￥])/.test(after)){price=i;break;}
    if(!/^[0-9]{1,2}$/.test(part)||Number(part)<1||Number(part)>49)break;
   }
   if(price<0)break;
   var dot=start;for(var j=0;j<price;j++)dot+=parts[j].length+(j?1:0);
   chars[dot]='各';
   // Leading zeroes belong to a confirmed stake, never another selection.
   // Blank them without shifting source ranges (34.01元 -> 34各 1元).
   var zeroes=/^[ \t]*0+(?=[0-9])/.exec(parts[price]);
   if(zeroes)for(var z=0;z<zeroes[0].length;z++)chars[dot+1+z]=' ';
   // Only a complete priced order establishes a following whitespace boundary.
   var tail=/^[ \t]*(?:元|米|斤|块|文|[¥￥])?(?:[ \t]+|$)/.exec(after);
   if(!tail||!tail[0].length)break;
   at=end+tail[0].length;
  }
  if(!b[0].length)boundary.lastIndex++;
 }
 return chars.join('');
}
function qssDecimalAmountTokens(line){
 var normalized=qssNormalizeDotStakes(line).replace(/[０-９]/g,function(ch){return String.fromCharCode(ch.charCodeAt(0)-65248);}).replace(/．/g,'.');
 var anchors=/(?:[二三四五2345]连(?:肖|尾)?|各(?:数|号|肖|尾|包|组|注)?|每(?:个)?(?:数|号|肖|尾|组|注)?|包(?:肖|尾)?|个数个|个数|个|号|买|押|[鼠牛虎兔龙蛇马羊猴鸡狗猪]|[0-9]尾)[ \t]*([0-9]+(?:\.[0-9]*)+)/g, out=[],m;
 while((m=anchors.exec(normalized))){
  var token=m[1],start=m.index+m[0].length-token.length,end=start+token.length,after=normalized.slice(end);
  // A following 各/每 means the fractional digits are the next selection.
  if(/^[0-9]+\.[0-9]{1,2}$/.test(token)&&/^[ \t]*(?:各|每)/.test(after))continue;
  // After a selection prefix, two or more 01-49 numbers (optional final dot) remain selections.
  // Explicit price prefixes (各/每/包/etc.) cannot use this exception.
  var anchor=m[0].slice(0,m[0].length-token.length).trim();
  if(/^(?:号|[鼠牛虎兔龙蛇马羊猴鸡狗猪]|[0-9]尾|[二三四五2345]连(?:肖|尾)?)$/.test(anchor)&&/^[0-9]{1,2}(?:\.[0-9]{1,2})+\.?$/.test(token)&&token.replace(/\.$/,'').split('.').every(function(n){return Number(n)>=1&&Number(n)<=49;})&&/^[ \t]*(?:各|每)/.test(after))continue;
  // A trailing period can terminate an integer amount before the next order.
  if(/^[0-9]+\.$/.test(token)&&after&&(/^[ \t]+[0-9]/.test(after)||/^[ \t]*(?:[鼠牛虎兔龙蛇马羊猴鸡狗猪]|平|特|二连|三连)/.test(after)))continue;
  if(token.indexOf('.')<0)continue;
  out.push({text:line.slice(start,end),normalized:token,start:start,end:end,valid:/^[0-9]+\.[0-9]{1,2}$/.test(token)});
 }
 // Unanchored numeric stakes may follow a selection separated by whitespace.
 // Three fractional digits can never be a legal 01-49 selection token.
 var loose=/(^|[ \t])([0-9]+(?:\.[0-9]*)+)(?=[ \t]*(?:元|米|斤|块|文|$))/g;
 while((m=loose.exec(normalized))){
  var t=m[2],at=m.index+m[1].length,valid=/^[0-9]+\.[0-9]{1,2}$/.test(t);
  // Normalize full-width amounts after an explicit space as well as price anchors.
  // Multi-dot lists retain their existing selection/separator interpretation.
  if(valid||/\.[0-9]{3,}/.test(t)||(/^[0-9]{3,}\./.test(t)&&!valid)){
   if(!out.some(function(v){return v.start===at;}))out.push({text:line.slice(at,at+t.length),normalized:t,start:at,end:at+t.length,valid:valid});
  }
 }
 return out;
}
// A price marker and currency suffix bound an amount, so embedded spaces
// cannot be interpreted as separate stakes or selection numbers.
function qssSplitAmountTokens(line){
 var re=/(?:各(?:包肖|生肖|数|号|肖|尾|包|组|注)?|每(?:个)?(?:数|号|肖|尾|组|注)|个数个|个数|个)[ \t\u00a0\u202f\u3000]*([0-9０-９.．]+(?:[ \t\u00a0\u202f\u3000]+[0-9０-９.．]+)+)[ \t\u00a0\u202f\u3000]*(?:米|元|斤|块|文|[¥￥])/g,out=[],m;
 while((m=re.exec(line))){if(!/[0-9０-９]/.test(m[1]))continue;var start=m.index+m[0].indexOf(m[1]);out.push({text:m[1],start:start,end:start+m[1].length});}
 return out;
}
function normalizeSharedLinkedGroups(text) {
 return text.replace(/(^|\n)([ \t]*)([鼠牛虎兔龙蛇马羊猴鸡狗猪]+(?:[ \t]*[,，、][ \t]*[鼠牛虎兔龙蛇马羊猴鸡狗猪]+)+)[ \t]*[,，、][ \t]*((?:[二三四五2345]连(?:肖)?[ \t]*[,，、]?[ \t]*){2,})各[ \t]*([0-9０-９]+(?:\.[0-9]+)?)[ \t]*(元|米|斤|块|文)?(?=[ \t]*(?:\n|$))/g,function(all,boundary,indent,selections,plays,amount,unit){
  var sizes=[],m,re=/([二三四五2345])连/g,values={'二':2,'三':3,'四':4,'五':5};
  while((m=re.exec(plays)))sizes.push(values[m[1]]||Number(m[1]));
  var groups=selections.split(/[ \t]*[,，、][ \t]*/);
  if(groups.some(function(g){return sizes.indexOf(g.length)<0;})||sizes.some(function(n){return !groups.some(function(g){return g.length===n;});}))return all;
  var names={2:'二',3:'三',4:'四',5:'五'};
  return boundary+indent+groups.map(function(g){return names[g.length]+'连肖 '+g+'各'+amount+(unit||'');}).join('，');
 });
}
function isChatTimestamp(line) {
 return /^\s*\d{4}年\d{1,2}月\d{1,2}日(?:[ \t\u00a0]+(?:[01]?\d|2[0-3])[:：][0-5]\d(?:[:：][0-5]\d)?)?\s*$/.test(line);
}
function repeatedInlineSenders(lines) {
 var candidates=[],counts=Object.create(null);
 lines.forEach(function(line,index){
  // Match CRLF headers without changing the original body or UTF-16 offsets.
  if(isChatTimestamp(line))return;
  var matchLine=line.replace(/\r$/,'');
  var m=/^[ \t\u00a0]*([^:：\n]{1,80})[:：]([ \t\u00a0]*)(.*)$/.exec(matchLine);
  if(!m)return;
  var name=m[1].trim();
  // Betting declarations and numeric separators are never sender names.
  if(!name||/(?:各(?:号|数|肖|组)?|每|个数)[ \t]*[0-9０-９零一二两三四五六七八九十百千万]|^(?:复式)?(?:[二三四五2345]连(?:肖|尾)?|特码|特肖|平特|号码)$/.test(name)||/^(?:香港|澳门|新澳|新澳门|新澳特|新澳门特|澳门特|香港特|澳特|港特|港|澳|香|奥|门|新)$/.test(name)||/^[0-9０-９\s.、,，/鼠牛虎兔龙蛇马羊猴鸡狗猪]+$/.test(name))return;
  var prefixLength=matchLine.length-m[3].length;
  candidates.push({line:index,name:name,body:line.slice(prefixLength),prefixLength:prefixLength});
  counts[name]=(counts[name]||0)+1;
 });
 var headers=Object.create(null);
 candidates.forEach(function(h){if(counts[h.name]>=4)headers[h.line]=h;});
 return headers;
}
function clone(v){return JSON.parse(JSON.stringify(v));}
function assert(v,m){if(!v)throw Error(m);}
function cents(v){var n=Math.round(Number(v)*100);assert(Number.isSafeInteger(n)&&Math.abs(n/100-Number(v))<1e-7,'金额不能精确到分');return n;}
function base(t){return t.replace(/复式|拖式/g,'');}
function standaloneRegion(line){
 var m=/^\s*(老澳门|旧澳门|老澳|老奥|旧澳|香港|新澳门|新澳|澳门|港|香|澳|奥|新|门)\s*[:：,，。]?\s*$/.exec(line);
 return !m?'':/^(?:香港|港|香)$/.test(m[1])?'香港':/^(?:老|旧)/.test(m[1])?'老澳门':'澳门';
}
function leadingRegion(line){
 var m=/^\s*(老澳门|旧澳门|老澳|老奥|旧澳|香港|新澳门|新澳|澳门|港特|澳特|港|香|澳|奥|新|门)(?=\s|[:：,，]|[0-9０-９鼠牛虎兔龙蛇马羊猴鸡狗猪特平大小单双红绿蓝复三二四五六七八九十])/.exec(line);
 return !m?'':/^(?:香港|港特|港|香)$/.test(m[1])?'香港':/^(?:老|旧)/.test(m[1])?'老澳门':'澳门';
}
function regionalSegments(segment){
 var lines=segment.text.split('\n'),out=[],block=null;
 function fresh(){return {text:'',person:segment.person,lineMap:[],headerLine:out.length?undefined:segment.headerLine};}
 function flush(){if(block&&block.lineMap.length){out.push(block);block=null;}}
 function append(line,index){if(!block)block=fresh();block.text+=(block.lineMap.length?'\n':'')+line;block.lineMap.push(segment.lineMap[index]);}
 for(var i=0;i<lines.length;i++){
  var area=standaloneRegion(lines[i]);
  if(!area){
   var inlineArea=leadingRegion(lines[i]);
   if(inlineArea){
    if(block&&block.regionalArea!==inlineArea&&block.text.split('\n').some(function(s){return !standaloneRegion(s)&&/[0-9０-９鼠牛虎兔龙蛇马羊猴鸡狗猪]/.test(s);}))flush();
    if(!block)block=fresh();block.regionalArea=inlineArea;
   }
  }
  if(area){
   var following=false;for(var j=i+1;j<lines.length;j++)if(lines[j].trim()&&!standaloneRegion(lines[j])){following=true;break;}
   // A header begins the next regional block; a footer prices the block
   // immediately before it. Chat-message boundaries are handled separately.
   if(following&&block&&block.text.split('\n').some(function(s){return s.trim()&&!standaloneRegion(s);}))flush();
   if(!block)block=fresh();
   if(!following&&block.regionalArea&&block.regionalArea!==area)block.regionConflict=segment.lineMap[i];
   block.regionalArea=area;
  }
  append(lines[i],i);
 }
 flush();return out;
}
// Diagnostic-only alignment. The donor may split one source line into several
// lines while replacing units/removing chat headings. Its lineIndex is therefore
// an index into preprocessedText, never directly into the user's original text.
function diagnosticMap(original,processed){
 function tokens(s){var out=[],m,re=/[0-9]+|[A-Za-z]+|[\u3400-\u9fff]/g;while((m=re.exec(s)))out.push({value:m[0],start:m.index,end:re.lastIndex});return out;}
 var a=tokens(original),b=tokens(processed),n=a.length,m=b.length,map=[];
 // Bound both memory and time for the 12k input limit. Unmapped diagnostics
 // fall back to literal error tokens, never guessed/repaired betting content.
 if(n*m>4000000)return map;
 var width=m+1,dp=new Uint16Array((n+1)*width);
 for(var i=n-1;i>=0;i--)for(var j=m-1;j>=0;j--)dp[i*width+j]=a[i].value===b[j].value?1+dp[(i+1)*width+j+1]:Math.max(dp[(i+1)*width+j],dp[i*width+j+1]);
 for(var i=0,j=0;i<n&&j<m;){if(a[i].value===b[j].value){map.push({from:b[j].start,to:b[j].end,start:a[i].start,end:a[i].end});i++;j++;}else if(dp[(i+1)*width+j]>=dp[i*width+j+1])i++;else j++;}
 return map;
}
function anomalyTokens(warning){var out=[],m,re=/\[异常:([^\]]+)\]/g;while((m=re.exec(warning))){var prefix=/^\s*(\d+(?:\s*[,，]\s*\d+)*)/.exec(m[1]);if(prefix)prefix[1].split(/\s*[,，]\s*/).forEach(function(t){out.push(t);});}return out;}
// Bind standalone play/stake declarations to their selection block before
// donor inheritance runs. Keep line count stable for error navigation.
function bindDeclaredBlocks(text){
 var lines=text.split('\n'),play='(?:复[式试][ \\t]*)?(?:二中二|三中二|三中三|特串|二中特|[二三四五2345]连(?:肖|尾)?|平特一肖|平特肖|平肖|平特尾|平尾|平码|特码|[五六七八九十]+不中)',amount='[0-9０-９零一二两三四五六七八九十百千万]+(?:\\.[0-9]+)?',head=new RegExp('^[ \\t]*('+play+')[ \\t]*(?:(?:各(?:组|数|号|肖|尾)?|每组|一组|[#=])[ \\t]*('+amount+')[ \\t]*(?:元|块|斤|米|文)?)?[ \\t]*$'),stake=new RegExp('^[ \\t]*(?:各(?:组|数|号|肖|尾)?|每组|一组|[#=])[ \\t]*('+amount+')[ \\t]*(?:元|块|斤|米|文)?[ \\t]*$');
 function selection(s,declaredPlay){if(/尾/.test(declaredPlay))s=s.replace(/尾(?:数)?/g,'');return /^[0-9０-９鼠牛虎兔龙蛇马羊猴鸡狗猪\s.,，。、/＋+_—–-]+$/.test(s)&&/[0-9鼠牛虎兔龙蛇马羊猴鸡狗猪]/.test(s);}
 for(var i=0;i<lines.length;i++){
  var h=head.exec(lines[i]);if(!h)continue;
  var indexes=[],j=i+1;for(;j<lines.length;j++){if(!lines[j].trim())continue;if(!selection(lines[j],h[1]))break;indexes.push(j);}
  var a=h[2],tail=j<lines.length&&stake.exec(lines[j]);if(!a&&tail)a=tail[1];
  if(indexes.length&&a){lines[i]='';indexes.forEach(function(k){lines[k]=h[1]+' '+lines[k].trim()+'各'+a;});if(tail&&!h[2])lines[j]='';i=tail&&!h[2]?j:indexes[indexes.length-1];continue;}
  // A suffix declaration prices only immediately preceding unpriced lines.
  if(h[2]){var before=[];for(var k=i-1;k>=0;k--){if(!lines[k].trim())continue;if(!selection(lines[k],h[1]))break;before.unshift(k);}if(before.length){before.forEach(function(k){lines[k]=h[1]+' '+lines[k].trim()+'各'+h[2];});lines[i]='';}}
 }
 return lines.join('\n');
}
// Cache only donor segment calculations under identical complete settings.
// Every call still rebuilds source ranges, validations, totals and admission tokens.
var segmentMemoSettings='',segmentMemo=new Map(),segmentMemoBytes=0;
function bindNumberContinuationPrices(text){
 // A complete price can close a wrapped list. Keep the physical rows so
 // each selection still maps to its source line.
 var lines=text.split('\n');
 var separators='.,，。、．/／－-';
 var numberRow=new RegExp('^([ \\t]*)['+separators+']*[ \\t]*([0-9][0-9 \\t'+separators+']*)(.*)$');
 var amount='([0-9零〇一二两三四五六七八九十百千万]+(?:\\.[0-9]{1,2})?)';
 var priceSuffix='[ \\t]*'+amount+'[ \\t]*(?:元|斤|米|块|文)?';
 var rowPrice=new RegExp('^[ \\t]*(?:各(?:数|号)?|每(?:个)?号|个)'+priceSuffix+'(?:[，, \\t]*(?:总|共)[0-9]+)?[ \\t]*$');
 var priceOnly=new RegExp('^[ \\t]*(?:各(?:数|号)?|每(?:个)?号)'+priceSuffix+'[ \\t]*$');
 var price=null;
 for(var i=lines.length-1;i>=0;i--){
  var line=lines[i].replace(/\r$/,'').replace(/[０-９]/g,function(ch){return String.fromCharCode(ch.charCodeAt(0)-65248);});
  // Separate the selection at the price marker before matching. This also
  // keeps a decimal amount out of the selection token list.
  var row=numberRow.exec(line),numbers=row?(row[2].match(/[0-9]+/g)||[]):[];
  var validNumbers=numbers.length&&numbers.every(function(number){return number.length<=2&&+number>=1&&+number<=49;});
  if(validNumbers&&!row[3].trim()&&price){
   lines[i]=row[1]+numbers.join('.')+'各'+price.amount+'元';
   lines[price.index]=price.row;
   continue;
  }
  var priced=validNumbers&&rowPrice.exec(row[3]);
  var standalone=priceOnly.exec(line);
  if(priced){
   var finalRow=/^[ \t]*[0-9]/.test(lines[i])?lines[i]:row[1]+numbers.join('.')+row[3];
   price={amount:priced[1],index:i,row:finalRow};
  }
  else if(standalone)price={amount:standalone[1],index:i,row:' '.repeat(lines[i].length)};
  else price=null;
 }
 return lines.join('\n');
}
function parse(text,year,options){
 options=options||{};var settings=options.settings||WISDOM_DEFAULTS;
 var settingsKey=JSON.stringify(settings);
 if(settingsKey!==segmentMemoSettings){segmentMemoSettings=settingsKey;segmentMemo.clear();segmentMemoBytes=0;}
 WisdomEngine.configureRecognition(settings);
 var replace={};settings.replacementRules.forEach(function(r){if(['一个号','一个','个'].indexOf(r.from)>=0&&r.to==='各')return;replace[r.from]=r.to;});
 var parseOptions=Object.assign({},WISDOM_DEFAULTS.recognitionOptions,settings.recognitionOptions||{},{昵称列表:settings.nicknameList||[],替换规则:replace});
 parseOptions.totalVerify=!!parseOptions["总额核对"];
 parseOptions.regionMode=parseOptions.regionNoBreak?"regionNoBreak":parseOptions.regionCurrLine?"regionCurrLine":"regionNextLine";
 var sourceLines=text.split('\n'),sourceOffsets=[],sourceOffset=0;sourceLines.forEach(function(line){sourceOffsets.push(sourceOffset);sourceOffset+=line.length+1;});
 var nicknameHeaders=[];
 sourceLines.forEach(function(line,i){var m=/^\s*([^:：\n]{1,80})[:：]\s*$/.exec(line);if(m&&!standaloneRegion(line)&&(i===0||!sourceLines[i-1].trim()))nicknameHeaders.push({line:i,name:m[1].trim()});});
 // A repeated sender confirms the exported-chat structure. Other sender
 // headings in that same export must also terminate inheritance.
 var headerCounts={};nicknameHeaders.forEach(function(h){headerCounts[h.name]=(headerCounts[h.name]||0)+1;});
 // A colon at the end of a betting line is also common (for example
 // "11:22:33:44:36各100" split across copied lines). Treat a bare line as
 // an exported-chat nickname only when the same candidate is repeated at
 // least four times in the long text.
 var hasRepeatedChatName=nicknameHeaders.some(function(h){return headerCounts[h.name]>=4;});
 var chatHeaderLines=repeatedInlineSenders(sourceLines);
 var segments=[{text:'',person:'',lineMap:[]}],current=segments[0];
 sourceLines.forEach(function(line,sourceLine){
  var sharedSender=/^【微信申报人：([^\n]{1,40})】$/.exec(line);if(sharedSender){current={text:'',person:sharedSender[1],lineMap:[],headerLine:sourceLine};segments.push(current);return;}
  var namedHeader=/^\s*([^:：\n]{1,40})[:：]\s*$/.exec(line);if(namedHeader&&Array.isArray(options.sharedSenderNames)&&options.sharedSenderNames.indexOf(namedHeader[1].trim())>=0){current={text:'',person:namedHeader[1].trim(),lineMap:[],headerLine:sourceLine};segments.push(current);return;}
  if(isChatTimestamp(line))return;
  if(sourceLine+1<sourceLines.length&&isChatTimestamp(sourceLines[sourceLine+1])&&
     (sourceLine===0||!sourceLines[sourceLine-1].trim())){
   var sender=line.trim().replace(/^·\s*/,'').replace(/[:：]$/,'').trim();
   if(sender&&sender.length<=40&&!standaloneRegion(line)&&
      /[A-Za-z\u3400-\u9fff]/.test(sender)&&!/(?:各(?:号|数|肖|组)?|每|个)\s*[0-9０-９]/.test(sender)){
    current={text:'',person:sender,lineMap:[],headerLine:sourceLine};
    segments.push(current);
    return;
   }
  }
  if(Object.prototype.hasOwnProperty.call(chatHeaderLines,sourceLine)){var heading=chatHeaderLines[sourceLine];current={text:'',person:heading.name,lineMap:[],headerLine:sourceLine};segments.push(current);if(!heading.body.trim())return;line=' '.repeat(heading.prefixLength)+heading.body;}
  if(standaloneRegion(line)){current.text+=(current.lineMap.length?'\n':'')+line;current.lineMap.push(sourceLine);return;}
  var hit=parseOptions['昵称模式']?WisdomEngine.检测昵称行(line,settings.nicknameList||[]):{};
  if(hit.是昵称行){current={text:'',person:hit.昵称,lineMap:[],_comparisonHeaderLine:sourceLine};segments.push(current);return;}
  var inline=parseOptions['昵称模式']?WisdomEngine.检测行首昵称(line,settings.nicknameList||[]):{};
  if(inline.有行首昵称){current={text:inline.内容,person:inline.昵称,lineMap:[sourceLine]};segments.push(current);}
  else {current.text+=(current.lineMap.length?'\n':'')+line;current.lineMap.push(sourceLine);}
 });
 // Display-only chat boundaries, captured before regional splitting. Do not
 // attach them to financial records or alter recognition source offsets.
 var comparisonSourceGroups=segments.filter(function(segment){return segment.text.trim()&&segment.lineMap.length;}).map(function(segment){
  var first=segment.headerLine!==undefined?segment.headerLine:segment._comparisonHeaderLine!==undefined?segment._comparisonHeaderLine:segment.lineMap[0];
  var last=segment.lineMap[segment.lineMap.length-1];
  return {startIndex:sourceOffsets[first],endIndex:sourceOffsets[last]+sourceLines[last].length,nickname:segment.person||''};
 });
 segments=segments.reduce(function(all,segment){return all.concat(regionalSegments(segment));},[]);
 var out={preprocessedText:''},records=[],ambiguousPrefixes=[];
 segments.forEach(function(segment,segmentIndex){
  if(!segment.text.trim())return;
  var malformedAmounts=[];segment.text.split('\n').forEach(function(line,localLine){
   var sourceLine=segment.lineMap[localLine],original=sourceLines[sourceLine]||'',lineStart=original.lastIndexOf(line);if(lineStart<0&&line.length===original.length)lineStart=0;if(lineStart<0)lineStart=Math.max(0,original.length-line.length);
   function reject(hit,warning){malformedAmounts.push({text:hit.text,lineIndex:sourceLine,start:sourceOffsets[sourceLine]+lineStart+hit.start,end:sourceOffsets[sourceLine]+lineStart+hit.end,warning:warning});}
   var splitAmounts=qssSplitAmountTokens(line);
   qssDecimalAmountTokens(line).forEach(function(hit){if(!hit.valid&&!splitAmounts.some(function(split){return hit.start<split.end&&hit.end>split.start;}))reject(hit,'金额小数最多保留两位，请修改后重新识别，未入账');});
   splitAmounts.forEach(function(hit){reject(hit,'金额被空格断开，请检查“'+hit.text+'”，修改后重新识别，未入账');});
  });
  if(malformedAmounts.length){ambiguousPrefixes.push.apply(ambiguousPrefixes,malformedAmounts);return;}
  if(segment.regionConflict!==undefined){var conflictLine=segment.regionConflict;ambiguousPrefixes.push({text:sourceLines[conflictLine],lineIndex:conflictLine,start:sourceOffsets[conflictLine],end:sourceOffsets[conflictLine]+sourceLines[conflictLine].length,regionConflict:true});}
  // “一个号” is a natural-language unit meaning each number. Normalize it
  // before the donor parser sees the standalone “一” token as number 01.
  // Normalize colloquial per-number wording before the donor sees it. The
  // donor already understands “各/每个号”, but a bare “一个” can be split
  // into the numeric token 1 and accidentally become number 01. Restrict
  // this replacement to an amount-bearing phrase immediately after a number
  // list so legitimate text such as “一组/一个三连” is untouched.
  // Only amount-bearing phrases after a selection are units. Do not rewrite
  // prose/nicknames or Chinese-number/play tokens globally.
  // A bare zodiac suffix denotes special zodiac; do not replace 肖 inside
  // named plays such as 四连肖 or explicit 平特肖.
  // Explicit per-zodiac package pricing must precede generic 包 cleanup.
  var donorText=segment.text.replace(/天肖|地肖/g,function(category){return category==='天肖'?'兔马猴猪牛龙':'蛇羊鸡狗鼠虎';}).replace(/([鼠牛虎兔龙蛇马羊猴鸡狗猪]+)[ \t]*包肖[ \t]*各(?=[ \t]*[0-9０-９零一二两三四五六七八九十百千万])/g,'$1各肖');
  donorText=donorText.split('\n').map(function(line){line=qssNormalizeDotStakes(line);var tokens=qssDecimalAmountTokens(line);for(var i=tokens.length-1;i>=0;i--){var token=tokens[i];if(token.valid)line=line.slice(0,token.start)+token.normalized+line.slice(token.end);}return line;}).join('\n');
  // A long token inside an explicitly priced numeric list is ambiguous, not a stake.
  var gluedNumberFound=false;
  segment.text.split('\n').forEach(function(line,localLine){
    if(!/(?:各(?:号|数)?|个)[ \t]*[0-9零一二两三四五六七八九十百千万]+/.test(line))return;
    var re=/(^|[+＋.,，、 \t])([0-9]{3,})(?=[+＋.,，、 \t]+[0-9]{1,2}(?:\D|$))/g,hit;
    while((hit=re.exec(line))){
      var before=line.slice(0,hit.index+hit[1].length);
      if(/(?:各|个|元|斤|米|块)[ \t]*$/.test(before))continue;
      var sourceLine=segment.lineMap[localLine],original=sourceLines[sourceLine]||'',at=original.indexOf(line)+hit.index+hit[1].length;
      if(at<0)at=original.indexOf(hit[2]);
      gluedNumberFound=true;
      ambiguousPrefixes.push({text:hit[2],lineIndex:sourceLine,start:sourceOffsets[sourceLine]+at,end:sourceOffsets[sourceLine]+at+hit[2].length,warning:'号码“'+hit[2]+'”疑似连在一起，请补上分隔符后重新识别，未入账'});
    }
  });
  if(gluedNumberFound)return;
  // Decorative brackets around numeric rows do not end a shared-price block.
  donorText=donorText.split('\n').map(function(line){
    if(!/^[ \t【】\[\]\\0-9.,，、]+(?:(?:各(?:号|数)?|个)[ \t]*[0-9]+(?:元|斤|米|块)?)?[ \t]*$/.test(line))return line;
    if(!/[【】\[\]]/.test(line))return line;
    return line.replace(/[【】\[\]\\]/g,'');
  }).join('\n');
  // A bounded issue label at a physical line start is metadata, never stake.
  donorText=donorText.replace(/^[ \t]*(?:第[ \t]*)?[0-9０-９]{3}[ \t]*(?:[.．][ \t]*)?(?:期|井)[ \t]*[,，:：][ \t]*/gm,function(label){return ' '.repeat(label.length);});
  donorText=donorText.replace(/(^|[\s,，。;；:：])((?:老澳门|旧澳门|香港|新澳门|新澳|澳门|港|香|澳|奥|新|门)?[ \t]*)([鼠牛虎兔龙蛇马羊猴鸡狗猪]+)[ \t]*肖(?=[ \t]*(?:各|每肖)?[ \t]*[0-9０-９零一二两三四五六七八九十百千万])/g,'$1$2特肖$3');
  donorText=donorText.replace(/(?:老澳(?!门)|老奥)(?=[ \t]*[，,。;；:：]?[ \t]*(?:\n|$))/g,'老澳门');
  donorText=donorText.replace(/(^|[\s,，。;；:：])老奥(?=[ \t]*[:：，,]?[ \t]*[0-9０-９鼠牛虎兔龙蛇马羊猴鸡狗猪特平])/g,'$1老澳门');
  donorText=donorText.replace(/(^|[\s,，。;；:：])特号(?=[ \t]*[,，:：、]?[ \t]*(?:[0-9０-９鼠牛虎兔龙蛇马羊猴鸡狗猪]|$))/g,'$1特码');
  donorText=donorText.replace(/([鼠牛虎兔龙蛇马羊猴鸡狗猪])(?=[0-9０-９]{1,2}(?:[ \t]*[-－—–.。/、,，+＋][ \t]*[0-9０-９]{1,2})+[ \t]*(?:各(?:号|数)?|每(?:个)?号)[ \t]*[0-9０-９零一二两三四五六七八九十百千万])/g,'$1 ');
  // A single explicit trailing price applies to every unpriced zodiac and number.
  donorText=donorText.replace(/(^|[\n;；])([ \t]*(?:(?:新澳门|老澳门|旧澳门|澳门|香港|新澳|澳|港|香|奥|新|门)[ \t]*[:：，,]?[ \t]*)?(?:(?:特码|特肖)[ \t]*[:：]?[ \t]*)?)([鼠牛虎兔龙蛇马羊猴鸡狗猪0-9０-９][鼠牛虎兔龙蛇马羊猴鸡狗猪0-9０-９ \t.。/、,，+＋－—–-]*?)([ \t]*(?:各(?:号|数)?|每(?:个)?号)[ \t]*[0-9０-９零一二两三四五六七八九十百千万]+(?:\.[0-9]+)?[ \t]*(?:元|米|斤|块|文)?)(?=$|[\n;；，,])/g,function(all,boundary,prefix,selection,price,offset){
    if(!/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/.test(selection))return all;
    var numbers=selection.match(/[0-9０-９]+/g)||[];
    if(numbers.length<2||numbers.some(function(n){var v=n.replace(/[０-９]/g,function(c){return String(c.charCodeAt(0)-65296);});return v.length>2||Number(v)<1||Number(v)>49;}))return all;
    var tokens=selection.match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]|[0-9０-９]+/g);
    return boundary+prefix+tokens.join('.')+price;
  });
  // A currency suffix closes an amount before punctuation normalization.
  // A dash after a bare zodiac label separates the amount; only an
  // explicit flat-play marker (such as 平 or 平特) selects 平肖.
  donorText=donorText.replace(/(^|[\s,，。;；:：])((?:(?:老澳门|旧澳门|香港|新澳门|新澳|澳门)[ \t]*)?)([鼠牛虎兔龙蛇马羊猴鸡狗猪]+)(肖?)([ \t]*[-－—–][ \t]*)(?=[0-9０-９])/g,
   function(_,boundary,region,zodiac,label,separator){return boundary+region+'特肖'+zodiac+' '.repeat(Math.max(0,label.length+separator.length-2));});
  donorText=donorText.replace(/([0-9０-９])[ \t]*[¥￥]/g,'$1元');
  donorText=normalizeSharedLinkedGroups(donorText);
  donorText=donorText.replace(/[\u00a0\u202f\u3000]/g,' ');
  donorText=donorText.replace(/(^|[\n，,；;])([ \t]*)帮下(?=[0-9])/g,'$1$2');
  donorText=donorText.replace(/[（(]([鼠牛虎兔龙蛇马羊猴鸡狗猪]+)[）)][ \t]*个(?=[0-9])/g,'$1各');
  donorText=donorText.replace(/个数个(?=[0-9])/g,'各数');
  donorText=donorText.replace(/野肖/g,'野兽');
  // Expand category names before donor amount parsing, preserving its per-number/per-zodiac semantics.
  donorText=donorText.replace(/平([鼠牛虎兔龙蛇马羊猴鸡狗猪])(?=[ \t]*[0-9])/g,'平特$1');
  donorText=donorText.replace(/平([0-9])尾[ \t]*[，,][ \t]*(?=[0-9])/g,'平特$1尾');
  donorText=bindNumberContinuationPrices(donorText);
  donorText=donorText.replace(/^([ \t]*(?:(?:老澳门|新澳门|旧澳门|香港|澳门|老澳|老奥|新澳|澳|港|香|奥|新|门)[ \t]*[，,:：]?[ \t]*)?(?:特码[ \t]*[，,:：]?[ \t]*)?)([0-9][0-9 \t.,，。、/－-]*)(各(?:数|号)?[ \t]*[0-9]+[^\n]*)$/gm,function(all,prefix,selection,price){
    var ns=selection.match(/[0-9]+/g)||[];
    if(ns.some(function(n){return n.length>2||+n<1||+n>49;}))return all;
    return prefix+ns.join('.')+price;
  });
  donorText=donorText.replace(/([0-9０-９鼠牛虎兔龙蛇马羊猴鸡狗猪])([ \t]*)(?:一个号|一个|个号|个)(?=[ \t]*[0-9０-９零一二三四五六七八九十百千万])/g,'$1$2各');
  // “18号10开” is a known ambiguous/typo form from the legacy fixes. Do
  // not let the donor silently turn it into a valid 18@10 bet; keep a
  // precise repair target and block the whole batch until corrected.
  donorText=donorText.split('\n').map(function(line,localLine){var hit=/(\d+[ \t]*号[ \t]*\d+[ \t]*开)/.exec(line);if(!hit)return line;var sourceLine=segment.lineMap[localLine],originalLine=sourceLines[sourceLine]||'',at=originalLine.indexOf(hit[1]);if(at<0)at=0;ambiguousPrefixes.push({text:hit[1],lineIndex:sourceLine,start:sourceOffsets[sourceLine]+at,end:sourceOffsets[sourceLine]+at+hit[1].length});return line.replace(hit[1], ' '.repeat(hit[1].length));}).join('\n');
  // Accept the common chat order “玩法 各组金额 内容” by moving the
  // selection before the stake. Keep this limited to explicit play markers.
  donorText=donorText.split('\n').map(function(line){
    // Group pricing is one unit; its numeral must never become selection 01.
    line=line.replace(/(?:一组|每组|各组)[\t \u00a0\u3000]*(?:各[\t \u00a0\u3000]*)?(?=[0-9０-９零一二两三四五六七八九十百千万])/g,'各');
    line=line.replace(/^\s*([0-9０-９鼠牛虎兔龙蛇马羊猴鸡狗猪][0-9０-９鼠牛虎兔龙蛇马羊猴鸡狗猪\s.,，。、/＋+_—–-]*?)\s*((?:复[式试]\s*)?(?:[二三四五2345]中[二三23]|[二三四五2345]连(?:肖|尾)?|平特一肖|平特肖|平肖))\s*(?:各组|每组|一组|各)?\s*([0-9０-９零一二两三四五六七八九十百千万]+(?:\.[0-9]+)?)\s*(?:米|斤|元|块|文)?\s*$/,'$2 $1各$3');
    return line.replace(/^(\s*(?:复[式试]\s*)?(?:[二三四五2345]中[二三23]|[二三四五六七八九十2-9]+连(?:肖|尾)?|平特一肖|平特肖|平肖))\s*(?:各组|每组|一组|各|每肖)?\s*([0-9０-９零一二两三四五六七八九十百千万]+(?:\.[0-9]+)?)\s*(?:米|斤|元|块|文)?\s+([0-9０-９鼠牛虎兔龙蛇马羊猴鸡狗猪][0-9０-９鼠牛虎兔龙蛇马羊猴鸡狗猪\s.,，。、/＋+_—–-]*)$/,'$1 $3各$2');
  }).join('\n');
  // “狗平特100” is the suffix form of “平特狗100”. Only zodiac names
  // are accepted here, so ordinary numeric text is unaffected.
  donorText=donorText.replace(/([鼠牛虎兔龙蛇马羊猴鸡狗猪])[ \t]*平特(?=[0-9０-９零一二三四五六七八九十百千万])/g,'平特$1');
  // Tail shorthand such as “平3.5尾各3000” and “平1234567890尾” is a
  // 平尾 play, not a 特码 number list. Expand each tail into the donor's
  // unambiguous single-tail form while preserving the shared stake.
  donorText=donorText.replace(/平(?:特)?[ \t]*([0-9０-９](?:[.、,，/、_~-][0-9０-９])+|[0-9０-９]{2,})[ \t]*尾(?:数)?([ \t]*(?:各|每(?:个)?尾|一个尾|个尾)?[ \t]*[0-9０-９零一二三四五六七八九十百千万]+)/g,function(_,digits,stake){
    var normalized=digits.replace(/[０-９]/g,function(c){return String(c.charCodeAt(0)-65296);});
    var tails=normalized.split(/[.、,，/、_~-]/);
    if(tails.length===1)tails=normalized.split('');
    return tails.map(function(t){return '平特'+t+'尾'+stake;}).join('\n');
  });
  // Explicit plain-tail aliases retain their play marker before donor cleanup.
  // The donor otherwise drops the bare “平” in “平3尾100” and expands it
  // to five special numbers. Only a single tail with a following amount is
  // normalized; ordinary “3尾”, linked tails and unpriced text stay intact.
  // For this one-tail selection “各” is redundant. Removing it also prevents
  // the donor from merging adjacent priced tails into one amount-bearing list.
  donorText=donorText.replace(/平(?:特)?[ \t]*([0-9０-９])[ \t]*尾[ \t]*(?:(?:各|每(?:个)?尾|一个尾|个尾)[ \t]*)?(?=[0-9０-９零一二三四五六七八九十百千万])/g,'平特$1尾');
  donorText=donorText.replace(/平(?:特)?尾[ \t]*([0-9０-９])[ \t]*(?:尾[ \t]*(?:(?:各|每(?:个)?尾|一个尾|个尾)[ \t]*)?|(?:各|每(?:个)?尾|一个尾|个尾)[ \t]*)(?=[0-9０-９零一二三四五六七八九十百千万])/g,'平特$1尾');
  // A leading quantity before an already priced zodiac is ambiguous. Keep
  // its source range for correction instead of letting the donor duplicate it.
  donorText=donorText.split('\n').map(function(line,localLine){
   var hit=/^([ \t]*)([0-9０-９]+[ \t]*(?:天|期)?)([ \t]*)(?=[鼠牛虎兔龙蛇马羊猴鸡狗猪][ \t]*(?:各|个|每号|每个号|一个号|一个)?[ \t]*[0-9０-９])/.exec(line)||/^([ \t]*)([0-9０-９]+[ \t]*(?:天|期))([ \t]*)$/.exec(line);
   if(!hit)return line;
   var quantity=Number(hit[2].replace(/[０-９]/g,function(c){return String(c.charCodeAt(0)-65296);}).trim());
   if(!/[天期]/.test(hit[2])&&quantity>=1&&quantity<=49)return line;
   var sourceLine=segment.lineMap[localLine],originalLine=sourceLines[sourceLine]||'',at=originalLine.indexOf(hit[2]);
   if(at<0)at=hit[1].length;
   ambiguousPrefixes.push({text:hit[2],lineIndex:sourceLine,start:sourceOffsets[sourceLine]+at,end:sourceOffsets[sourceLine]+at+hit[2].length});
   return ' '.repeat(hit[0].length)+line.slice(hit[0].length);
  }).join('\n');
  // The donor's generic preprocessing treats any standalone trailing colon
  // as a chat heading. Preserve short betting lines such as
  // “牛虎马狗个数20:” by removing only that punctuation when the line also
  // contains an explicit selection and stake marker. Pure name lines keep
  // their colon and remain subject to the four-occurrence rule above.
  donorText=donorText.split('\n').map(function(line){
   if(/[:：][ \t]*$/.test(line)&&/[鼠牛虎兔龙蛇马羊猴鸡狗猪]|(?:0?[1-9]|[1-4][0-9])/.test(line)&&/(?:各|个数|号|元|米|斤|文|金额)/.test(line))return line.replace(/[:：][ \t]*$/,'');
   return line;
  }).join('\n');
  // Keep declarations and let the donor generate its original warning rows.
  donorText=donorText.replace(/(?:下注总额|下注合计|总下注|总金额|总额|总计|合计|总|共)(?=[ \t]*[:：]?[ \t]*[0-9０-９])/g,function(word,offset){return (offset>0&&donorText.charAt(offset-1)!=='\n'?'\n':'')+'合计';});
  // A priced zodiac link followed by an explicitly priced number selection
  // starts a new order. Commas inside selections remain untouched.
  donorText=donorText.replace(/((?:[鼠牛虎兔龙蛇马羊猴鸡狗猪]{2,}[二三四五2345]连(?:肖)?|[二三四五2345]连(?:肖)?[ \t]*[鼠牛虎兔龙蛇马羊猴鸡狗猪]{2,})[ \t]*(?:各|每组|一组)?[ \t]*[0-9]+(?:\.[0-9]{1,2})?[ \t]*(?:元|米|斤)?)[,，](?=[ \t]*(?:(?:老澳门|香港|澳门|新澳|港|澳)[ \t]*)?(?:0?[1-9]|[1-4][0-9])(?:[ \t]*[.,，、/＋+\-][ \t]*(?:0?[1-9]|[1-4][0-9]))*[ \t]*(?:各(?:数|号)?|每(?:个)?号|一个号|个)[ \t]*[0-9])/g,'$1\n');
  donorText=bindDeclaredBlocks(donorText);
  if(segment.regionalArea)donorText=donorText.split('\n').map(function(line){
   if(!line.trim()||standaloneRegion(line))return '';
   // Explicit inline regions retain the donor's existing interpretation.
   return /香港|老澳门|旧澳门|新澳门|澳门|新澳|港|澳|奥|香|门|新/.test(line)?line:segment.regionalArea+line;
  }).join('\n');
  var personName=(settings.declarantAliases||{})[segment.person]||segment.person,policy=(settings.declarantPolicies||{})[personName],segmentOptions=Object.assign({},parseOptions);
  if(policy){
   segmentOptions.shengXiaoJinE_TeMaZong=false;segmentOptions.shengXiaoJinE_TeMaGeXiao=policy.bareZodiacMode==='zodiac';segmentOptions.shengXiaoJinE_TeMaGeShu=policy.bareZodiacMode==='numbers';
   if(policy.bareZodiacMode==='review'){var ambiguous=/[鼠牛虎兔龙蛇马羊猴鸡狗猪]+[ \t]*[0-9]+/.exec(donorText);if(ambiguous){var first=segment.lineMap[0]||0;ambiguousPrefixes.push({text:ambiguous[0],lineIndex:first,start:sourceOffsets[first],end:sourceOffsets[first]+sourceLines[first].length,warning:'申报人设置为人工核对，请明确填写各数或各肖'});return;}}
  }
  var memoKey=JSON.stringify([donorText,segmentOptions]),memo=segmentMemo.get(memoKey),parsed;
  if(memo){parsed=JSON.parse(memo);}
  else {
   parsed=WisdomEngine.parseOrders(donorText,segmentOptions);
   parsed={preprocessedText:parsed.preprocessedText,records:parsed.records,processedRecords:WisdomEngine.processRecords(clone(parsed.records))};
   var memoRaw=JSON.stringify(parsed);
   if(memoKey.length+memoRaw.length<=256*1024){
    while(segmentMemo.size&&(segmentMemo.size>=128||segmentMemoBytes+memoKey.length+memoRaw.length>1024*1024)){
     var oldest=segmentMemo.keys().next().value;segmentMemoBytes-=oldest.length+segmentMemo.get(oldest).length;segmentMemo.delete(oldest);
    }
    segmentMemo.set(memoKey,memoRaw);segmentMemoBytes+=memoKey.length+memoRaw.length;
   }
  }
  out.preprocessedText+=parsed.preprocessedText+'\n';
  if(segment.regionalArea){
   var regionalLines=parsed.preprocessedText.split('\n');
   parsed.records.forEach(function(r){
    var explicit=(regionalLines[Number(r.lineIndex||0)]||'').match(/老澳门|澳门|香港/g)||[];
    if(!explicit.some(function(area){return area!==segment.regionalArea;}))r.区域=segment.regionalArea;
   });
  }
  var originalWarnings=parsed.records.map(function(r){return r.警告信息||"";}),processedLines=parsed.preprocessedText.split('\n'),processedOffsets=[],offset=0;
  processedLines.forEach(function(line){processedOffsets.push(offset);offset+=line.length+1;});
  var original=segment.lineMap.map(function(i){return sourceLines[i];}).join('\n'),localOffsets=[],off=0;
  segment.lineMap.forEach(function(i){localOffsets.push(off);off+=sourceLines[i].length+1;});
  var mapped=null;
  function globalOffset(local){for(var i=localOffsets.length-1;i>=0;i--)if(local>=localOffsets[i])return sourceOffsets[segment.lineMap[i]]+local-localOffsets[i];return 0;}
  var processedRecords=parsed.processedRecords;
  if(segment.regionalArea)processedRecords.forEach(function(r,i){r.区域=parsed.records[i].区域;});
  processedRecords.forEach(function(r,recordIndex){
   var originalWarning=originalWarnings[recordIndex];if(originalWarning&&String(r.警告信息||"").indexOf(originalWarning)<0)r.警告信息=(r.警告信息?r.警告信息+" ":"")+originalWarning;
   r.昵称=segment.person;r._messageGroup=segmentIndex;var firstLine=segment.headerLine===undefined?segment.lineMap[0]:segment.headerLine;r._sourceStart=sourceOffsets[firstLine]||0;r._sourceEnd=segment.lineMap.length?sourceOffsets[segment.lineMap[segment.lineMap.length-1]]+sourceLines[segment.lineMap[segment.lineMap.length-1]].length:r._sourceStart;var localLine=Number(r.lineIndex||0);r.lineIndex=segment.lineMap[localLine]===undefined?(segment.lineMap[0]||0):segment.lineMap[localLine];
   if((!r.isTotalVerifyWarning&&r.警告信息&&r.警告信息!=='[自动复式]')||r.isException||r.投注类型==='组合异常'||!Number.isFinite(Number(r.订单总额))){
    if(mapped===null)mapped=diagnosticMap(original,parsed.preprocessedText);
    var totalLine=/第(\d+)行声明/.exec(r.订单信息||'');if(r.isTotalVerifyWarning&&totalLine)localLine=Number(totalLine[1])-1;
    var start=processedOffsets[localLine],end=start+(processedLines[localLine]||'').length;
    var hits=mapped.filter(function(v){return v.from>=start&&v.to<=end;});
    var rangeStart=hits.length?hits[0].start:0,rangeEnd=hits.length?hits[hits.length-1].end:original.length;
    var targets=[],warning=String(r.警告信息||''),typo,re=/["“]([^"”]+)["”]中的["“]([^"”]+)["”]/g;
    // Donor typo warnings may be attached to its first record, not the line
    // containing the typo. Locate the quoted original context instead.
    while((typo=re.exec(warning))){var contextAt=original.indexOf(typo[1]);while(contextAt>=0){var inside=typo[1].indexOf(typo[2]);if(inside>=0)targets.push({start:globalOffset(contextAt+inside),end:globalOffset(contextAt+inside+typo[2].length)});contextAt=original.indexOf(typo[1],contextAt+1);}}
    var tokens=anomalyTokens(warning);if(!tokens.length&&r.投注类型==='组合异常'&&/^\d+$/.test(r.订单信息||''))tokens=[r.订单信息];
    tokens.forEach(function(token){
     var candidates=[],at=original.indexOf(token);while(at>=0){
      if((at===0||!/[0-9]/.test(original.charAt(at-1)))&&!/[0-9]/.test(original.charAt(at+token.length)))candidates.push(at);
      at=original.indexOf(token,at+1);
     }
     var local=candidates.filter(function(at){return at>=rangeStart&&at+token.length<=rangeEnd;});
     if(!local.length&&candidates.length){candidates.sort(function(a,b){return Math.abs(a-rangeStart)-Math.abs(b-rangeStart);});local=[candidates[0]];}
     local.forEach(function(at){targets.push({start:globalOffset(at),end:globalOffset(at+token.length)});});
    });
    if(!targets.length&&rangeEnd>rangeStart)targets.push({start:globalOffset(rangeStart),end:globalOffset(rangeEnd)});
    if(targets.length){r._errorTargets=targets;var pos=targets[0].start;for(var li=sourceOffsets.length-1;li>=0;li--)if(sourceOffsets[li]<=pos){r.lineIndex=li;break;}}
   }
   records.push(r);
  });
 });

 ambiguousPrefixes.forEach(function(prefix){records.push({投注类型:'组合异常',订单信息:prefix.text,原订单信息:prefix.text,警告信息:prefix.warning?prefix.warning:prefix.regionConflict?'同一下注段的开头和末尾地区不一致，请明确本段地区，未入帐':'“'+prefix.text+'”含义不明确，未计入下注，请删除说明文字或补全下注对象',金额:0,订单总额:0,注数:0,isException:true,lineIndex:prefix.lineIndex,_errorTargets:[{start:prefix.start,end:prefix.end}]});});
 var result={results:[],failedSlices:[],grandTotalAmount:0,grandTotalBets:0,billableAmount:0,billableCents:0,valid:true,conflicts:[],errorMessage:'',wisdomRecords:records,items:[],marketPartitions:[],repairCandidates:[],repairTargets:[],repairExplanations:[]};
 var parts={};result.displayRows=[];result.comparisonSourceGroups=comparisonSourceGroups;
 var opts=Object.assign({},WISDOM_DEFAULTS.recognitionOptions,settings.recognitionOptions||{});
 function fail(message){result.valid=false;result.failedSlices.push({errorMessage:message});result.errorMessage+=(result.errorMessage?'\n':'')+message;}
 if(!records.length){fail('未识别到有效订单，请检查内容');sourceLines.forEach(function(line,i){if(line.trim())result.repairTargets.push({start:sourceOffsets[i],end:sourceOffsets[i]+line.length,sectionIndex:0});});}
 records.forEach(function(r,ri){
  // Only donor total-check rows are advisory. Never downgrade a real bet's errors.
  if(r.isTotalVerifyWarning&&r.投注类型==='总额核对'){
   result.displayRows.push({region:'',type:'总额核对',content:'',calculation:'',amount:'',count:'',total:'',message:r.警告信息||r.订单信息||'',isError:false,isWarning:true,lineIndex:Number(r.lineIndex||0)});
   return;
  }
  var warning=r.警告信息||'';
  var displayOriginal=r.原订单信息;
  // Split single linked-zodiac bets may share the entire source block.
  // Show each actual group without replacing its retained audit source.
  if(/连肖/.test(r.投注类型||'')&&r.注数===1){
   var actualZodiacs=String(r.订单信息||'').match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/g)||[];
   var originalZodiacs=String(displayOriginal||'').match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/g)||[];
   if(actualZodiacs.length&&originalZodiacs.join('')!==actualZodiacs.join(''))displayOriginal=r.订单信息;
  }
  // Combination plays must carry an actual selection. The donor can emit a
  // superficially valid “三连肖/二连肖” row with an empty selection when a
  // following line is accidentally attached; block it instead of admitting
  // a wrong bet or silently borrowing the previous row's zodiac.
  var needsSelection=/连肖|连尾|中二|中三|不中|特串|二中特/.test(r.投注类型||'');
  var hasSelection=!!String(r.订单信息||r.分注订单信息||'').match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]|[0-9０-９]/);
  var invalidAmount=!Number.isFinite(Number(r.订单总额))||Number(r.订单总额)<=0||Number(r.订单总额)>2147483647||!Number.isInteger(r.注数)||r.注数<=0;
  var splitToSingle=r.投注类型==='特码'||['平特一肖','平特一肖带主肖','特肖','特肖带主肖','一肖不出','平尾','平尾零尾','尾数不出'].indexOf(r.投注类型)>=0;
  if(!invalidAmount&&splitToSingle&&!Number.isSafeInteger(Math.round(Number(r.订单总额)*100)/r.注数)){warning='总金额无法平均分到每号或每注的分位，请修改金额后重新识别，未入账';r.警告信息=warning;}
  if(invalidAmount&&!warning){warning='金额或注数无效，请检查金额是否被空格断开（例如“2 0米”），修改后重新解析';r.警告信息=warning;}
  var invalid=(warning&&warning!=='[自动复式]')||invalidAmount||r.isException||r.投注类型==='组合异常'||(needsSelection&&!hasSelection);
  if(invalid&&!(r._errorTargets&&r._errorTargets.length)){
   var begin=Number.isInteger(r._sourceStart)?r._sourceStart:sourceOffsets[Number(r.lineIndex)||0],end=Number.isInteger(r._sourceEnd)?r._sourceEnd:begin+(sourceLines[Number(r.lineIndex)||0]||'').length;
   if(begin>=0&&end>begin&&end<=text.length){
    var amountGap=invalidAmount?/(?:各数|每个数|各号|各|个)\s*([0-9]+[ \t]+[0-9]+)\s*(?:米|元|斤|块)/.exec(text.slice(begin,end)):null;
    if(amountGap){var local=amountGap.index+amountGap[0].indexOf(amountGap[1]);r._errorTargets=[{start:begin+local,end:begin+local+amountGap[1].length}];}
    else r._errorTargets=[{start:begin,end:end}];
   }
  }
  if(invalid&&r._errorTargets&&r._errorTargets.length){var errorOffset=r._errorTargets[0].start;for(var errorLine=sourceOffsets.length-1;errorLine>=0;errorLine--)if(sourceOffsets[errorLine]<=errorOffset){r.lineIndex=errorLine;break;}}
  if(needsSelection&&!hasSelection&&!warning)r.警告信息='玩法缺少有效组合内容，未入帐，请补全该条订单';
  result.displayRows.push({region:r.区域||'澳门',type:(opts['显示昵称']&&r.昵称?'['+r.昵称+'] ':'')+(r.投注类型||''),content:(opts.showZodiacText||opts['显示原订单信息']?displayOriginal:r.分注订单信息)||r.订单信息||'',calculation:r.计算方式||'',amount:String(r.金额===undefined?'':r.金额),count:opts['显示注数']===false?'':r.注数显示||'',total:opts['显示订单总额']===false?'':r.订单总额显示||'',message:warning||(invalid?'无法识别此条订单':''),isError:!!invalid,lineIndex:Number(r.lineIndex||0)});
  if(invalid){(r._errorTargets||[]).forEach(function(t){result.repairTargets.push({start:t.start,end:t.end,sectionIndex:result.displayRows.length-1});});delete r._errorTargets;fail('第'+(Number(r.lineIndex||0)+1)+'行：'+(r.警告信息||r.订单信息||'组合异常'));return;}
  if(WISDOM_TYPES.indexOf(r.投注类型)<0){fail('未定义玩法：'+r.投注类型);return;}
  var area=r.区域||'澳门',market=area==='澳门'?'新澳':area;
  assert(['新澳','香港','老澳门'].indexOf(market)>=0,'未知地区：'+area);
  var partKey=market+"|"+(r.昵称||r.nickname||"");var part=parts[partKey];
  if(!part){var si=result.results.length;part=parts[partKey]={person:r.昵称||r.nickname||"默认",market:market,items:[],totalCents:0,slices:[],sourceGroups:[],sliceIndex:si};result.marketPartitions.push(part);result.results.push({originalContent:text,region:area,normalResults:[],specialResults:[],totalAmount:0,totalBets:0,hasError:false,errorMessage:'',billableAmount:0,billableCents:0,startIndex:0,endIndex:text.length,wisdomLines:[]});}
  var slice=result.results[part.sliceIndex],total=cents(r.订单总额);
  if(!part.messageSlices)part.messageSlices={};
  if(part.messageSlices[r._messageGroup]===undefined){
   if(Object.keys(part.messageSlices).length){part.sliceIndex=result.results.length;result.results.push({originalContent:'',region:area,normalResults:[],specialResults:[],totalAmount:0,totalBets:0,hasError:false,errorMessage:'',billableAmount:0,billableCents:0,startIndex:0,endIndex:0,wisdomLines:[]});}
   part.messageSlices[r._messageGroup]=part.sliceIndex;
  }
  part.sliceIndex=part.messageSlices[r._messageGroup];slice=result.results[part.sliceIndex];
  slice.startIndex=r._sourceStart;slice.endIndex=r._sourceEnd;slice.originalContent=text.slice(slice.startIndex,slice.endIndex);
  assert(total>0&&total<=214748364700&&Number.isInteger(r.注数)&&r.注数>0,'订单金额或注数无效');
  slice.wisdomLines.push(r.投注类型+' '+(displayOriginal||r.订单信息)+' '+r.计算方式+r.金额+'元 ['+r.注数+'注，共'+r.订单总额+'元]');
  function push(rec,selection,stake,normal){var item={kind:normal?'tema':'wisdom:'+r.投注类型,kindLabel:r.投注类型,selection:selection,stakeCents:stake,source:sourceLines[Number(rec.lineIndex)]||rec.原订单信息||rec.订单信息,market:market,qssBet:{normal:normal,type:normal?'normal':r.投注类型,label:normal?String(selection[0]).padStart(2,'0'):r.投注类型+'_'+rec.订单信息,numbers:selection,batchId:ri,group:ri,order:ri,sliceIndex:part.sliceIndex,wisdomRecord:rec}};result.items.push(item);part.items.push(item);}
  var rec=clone(r);rec.订单信息=r.分注订单信息||r.订单信息;
  if(r.投注类型==='特码'){
   var nums=rec.订单信息.match(/\d+/g)||[];
   assert(nums.length===r.注数&&nums.every(function(n){return Number(n)>=1&&Number(n)<=49;}),'特码分注数量不一致');
   var each=total/nums.length;assert(Number.isSafeInteger(each),'每号金额不能精确到分');
   nums.forEach(function(n){var one=clone(rec);one.订单信息=String(n).padStart(2,'0');one.金额=each/100;one.注数=1;one.订单总额=each/100;push(one,[Number(n)],each,true);slice.normalResults.push([one.订单信息,each/100,ri,ri].join(':'));});
  }else if(['平特一肖','平特一肖带主肖','特肖','特肖带主肖','一肖不出','平尾','平尾零尾','尾数不出'].indexOf(r.投注类型)>=0){
   var choices=/尾/.test(r.投注类型)?(rec.订单信息.match(/[0-9]/g)||[]):(rec.订单信息.match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/g)||[]);
   assert(choices.length===r.注数,'单肖或单尾分注数量不一致');var each=total/choices.length;assert(Number.isSafeInteger(each),'单注金额不能精确到分');
   choices.forEach(function(choice){var one=clone(rec);one.订单信息=choice;one.金额=each/100;one.注数=1;one.订单总额=each/100;var selection=/尾/.test(r.投注类型)?[Number(choice)]:[];push(one,selection,each,false);slice.specialResults.push({type:r.投注类型,label:r.投注类型+'_'+choice,numbers:selection,amount:each/100,batchId:ri});});
  }else{
   var nums=(rec.订单信息.match(/\d+/g)||[]).map(Number).filter(function(n){return n>=0&&n<=49;});
   // The original structured Wisdom record, rather than this display selection,
   // is authoritative for all zodiac, tail and attribute plays.
   push(rec,nums,total,false);slice.specialResults.push({type:r.投注类型,label:r.投注类型+'_'+rec.订单信息,numbers:nums,amount:total/100,batchId:ri});
  }
  part.totalCents+=total;slice.billableCents+=total;slice.billableAmount=slice.billableCents/100;slice.totalAmount=slice.billableAmount;slice.totalBets+=r.注数;result.grandTotalBets+=r.注数;
 });
 result.marketPartitions.forEach(function(part){
  part.slices=[];
  part.sourceGroups=[];
  var bySlice=Object.create(null);
  // Index the partition once. Each message keeps the same item order and cents.
  part.items.forEach(function(item,index){
   var sliceIndex=item.qssBet.sliceIndex;
   var entry=bySlice[sliceIndex];
   if(!entry)entry=bySlice[sliceIndex]={indexes:[],subtotal:0};
   entry.indexes.push(index);
   entry.subtotal+=item.stakeCents;
  });
  Object.keys(part.messageSlices||{}).forEach(function(key){
   var sliceIndex=part.messageSlices[key],source=result.results[sliceIndex];
   var entry=bySlice[sliceIndex]||{indexes:[],subtotal:0};
   var count=entry.indexes.length;
   part.slices.push({sliceIndex:sliceIndex,source:source.originalContent,startIndex:source.startIndex,endIndex:source.endIndex,totalCents:entry.subtotal,itemCount:count});
   part.sourceGroups.push({sliceIndex:sliceIndex,source:source.originalContent,startIndex:source.startIndex,endIndex:source.endIndex,itemIndexes:entry.indexes,totalCents:entry.subtotal,itemCount:count});
  });
  delete part.messageSlices;
  delete part.sliceIndex;
  result.billableCents+=part.totalCents;
 });
 result.billableAmount=result.billableCents/100;result.grandTotalAmount=result.billableAmount;
 if(opts['显示订单组金额'])result.marketPartitions.forEach(function(part){result.displayRows.push({region:part.market,type:'订单组金额',content:(opts['显示昵称']&&part.person!=='默认'?part.person+' ':'')+'合计: '+part.totalCents/100,calculation:'',amount:'',count:'',total:'',message:'',isError:false,lineIndex:0});});
 if(!result.valid){result.results.forEach(function(s){s.hasError=true;s.errorMessage=result.errorMessage;});}
 return result;
}
// Historical schema translation uses stored selections and stakes only, never
// reparses old source text or restores any removed recognition rules.
function historicalRecord(record,p){
 var aliases={'normal':'特码','正码':'平码','平特':'平特一肖','平特尾':'平尾','2连肖':'二连肖','3连肖':'三连肖','4连肖':'四连肖','5连肖':'五连肖','2连尾':'二连尾','3连尾':'三连尾','4连尾':'四连尾','5连尾':'五连尾','包红':'波色','包绿':'波色','包蓝':'波色','包红单数':'半波红单','包红双数':'半波红双','包绿单数':'半波绿单','包绿双数':'半波绿双','包蓝单数':'半波蓝单','包蓝双数':'半波蓝双','包单':'特码单数','包双':'特码双数','包大':'特码大数','包小':'特码小数','包合单':'特码合单','包合双':'特码合双','包合大':'特码合大','包合小':'特码合小','包_家肖':'六肖中特','包_野肖':'六肖中特'};
 var kinds={tema:'特码',pingxiao:'平特一肖',pingte:'平特一肖',lianxiao2:'二连肖',lianxiao3:'三连肖',lianxiao4:'四连肖',lianxiao5:'五连肖',lian2:'二连肖',lian3:'三连肖',lian4:'四连肖',lian5:'五连肖',erzhonger:'二中二',er2:'二中二',sanzhongsan:'三中三',san3:'三中三',san2:'三中二',techuan:'特串',pingwei:'平尾',wei1:'平尾'};
 for(var n=2;n<=5;n++)kinds['wei'+n]=['','','二','三','四','五'][n]+'连尾';var cn=['五','六','七','八','九','十','十一','十二'];cn.forEach(function(v,i){kinds['bu'+(i+5)]=v+'不中';});
 var converted=clone(record),settings=clone(WISDOM_DEFAULTS);if(p){settings.baseYear=p.historicalYear||p.baseYear||2026;settings.zodiacMappings=p.zodiacMappings||null;}
 Object.keys(p&&p.normalOdds||{}).forEach(function(k){var t=aliases[k]||k;if(Object.prototype.hasOwnProperty.call(settings.normalOdds,t))settings.normalOdds[t]=p.normalOdds[k];});
 Object.keys(p&&p.currentYearOdds||{}).forEach(function(k){var t=(aliases[k]||k)+'带主肖';if(Object.prototype.hasOwnProperty.call(settings.normalOdds,t))settings.normalOdds[t]=p.currentYearOdds[k];});
 if(p&&p.rebates){settings.rebates.enabled=p.rebates.enabled;Object.keys(settings.rebates.byPlay).forEach(function(t){settings.rebates.byPlay[t]=p.rebates.nonSpecial||0;});settings.rebates.byPlay['特码']=p.rebates.specialNumber||0;Object.keys(p.rebates.byPlay||{}).forEach(function(k){settings.rebates.byPlay[aliases[k]||k]=p.rebates.byPlay[k];});}
 if(p&&p.normalOdds){if(p.normalOdds['平特0尾']!==undefined)settings.normalOdds['平尾零尾']=p.normalOdds['平特0尾'];if(p.normalOdds['平特1-9尾']!==undefined)settings.normalOdds['平尾']=p.normalOdds['平特1-9尾'];}
 converted.items.forEach(function(it){if(it.qssBet&&it.qssBet.wisdomRecord)return;var b=it.qssBet||{},oldType=b.normal?'normal':b.type,t=aliases[oldType]||oldType||kinds[it.kind],label=b.label||'',split=label.indexOf('_'),content=split>=0?label.slice(split+1):'';
 assert(WISDOM_TYPES.indexOf(t)>=0,'历史玩法无法映射：'+it.kind);
 var key=oldType==='平特尾'?(it.selection[0]%10===0?'平特0尾':'平特1-9尾'):oldType==='normal'?'特码':/^包[红绿蓝][单双]数$/.test(oldType)?'包波色双单':/^包[红绿蓝]$/.test(oldType)?'包波色':/^包_[家野]肖$/.test(oldType)?'包家野肖':/^包/.test(oldType)?'包双单合双单':oldType;
 if(p&&p.normalOdds&&p.normalOdds[key]!==undefined){settings.normalOdds[t]=p.normalOdds[key];if(t==='三中二')settings.normalOdds['三中二全中']=p.normalOdds[key];if(t.indexOf('连尾')>=0)settings.normalOdds[t+'带零尾']=p.normalOdds[key];}
 if(p&&p.rebates&&p.rebates.byPlay&&p.rebates.byPlay[key]!==undefined)settings.rebates.byPlay[t]=p.rebates.byPlay[key];
 if(t==='特码'||t==='平码'||/中|特串/.test(t))content=it.selection.map(function(n){return String(n).padStart(2,'0');}).join('-');
 else if(!content)content=it.selection.join('-');
 if(t==='波色')content=oldType.replace('包','');
 if(oldType==='包_家肖')content='牛马羊鸡狗猪';if(oldType==='包_野肖')content='鼠虎兔龙蛇猴';
 if(t==='平尾'&&it.selection[0]%10===0)t='平尾零尾';
 var snap=record.playConfigSnapshot,rule=snap&&snap.plays&&snap.plays[it.kind];
 if(!it.qssBet&&it.kind==='tema'&&p.historicalRates){settings.normalOdds['特码']=p.historicalRates.tema+(p.historicalIncludesStake===false?1:0);settings.rebates.byPlay['特码']=p.historicalRates.rebatePct||0;}
 if(rule){var rate=t==='平尾零尾'&&rule.zeroOdds!==undefined?rule.zeroOdds:rule.odds;settings.normalOdds[t]=rate+(rule.payoutIncludesStake===false?1:0);settings.rebates.byPlay[t]=rule.rebatePct||0;if(rule.specialOdds!==undefined){settings.normalOdds[t+'带主肖']=rule.specialOdds+(rule.payoutIncludesStake===false?1:0);settings.rebates.byPlay[t+'带主肖']=rule.rebatePct||0;}}
 if(t.indexOf('连尾')>=0||t==='平尾'||t==='平尾零尾')content=Array.from(new Set(it.selection.map(function(n){return n%10;}))).join('-');
 if(/连肖|不中|中二|中三|中特|特串/.test(t))content='('+content+')';
 var rec={区域:it.market==='新澳'?'澳门':it.market,投注类型:t,订单信息:content,金额:it.stakeCents/100,注数:1,订单总额:it.stakeCents/100};
 it.qssBet=Object.assign({},b,{wisdomRecord:rec});
 });return {record:converted,settings:settings};
}
function configureSettlement(settings){
 WisdomEngine.configureRecognition(settings);
 return WisdomEngine.configure(settings);
}
function settle(record,draw,settings){
 return settleConfigured(record,draw,settings,configureSettlement);
}
function settleConfigured(record,draw,p,loadSettings){
 if(record.items.some(function(it){return !it.qssBet||!it.qssBet.wisdomRecord;})){var old=historicalRecord(record,p);record=old.record;p=old.settings;}

 assert(record.items.every(function(it){return it.qssBet&&it.qssBet.wisdomRecord;}),'此历史记录未转换为智慧订单格式，不能重新结算');
 var loaded=loadSettings(p),service=new WisdomEngine.兑奖服务(),C=WisdomEngine.COL;
 service.设置投注类型配置(loaded.betting);service.设置申报人配置(loaded.declarers);
 var region=draw.market==='新澳'?'澳门':draw.market||'澳门',numbers=(draw.regular&&draw.regular.length?draw.regular:[0,0,0,0,0,0]).concat([draw.special]).map(function(n){return String(n).padStart(2,'0');}),lottery={};lottery[region]={numbers:numbers};service.设置开奖数据(lottery);
 var rows=record.items.map(function(item){var rec=item.qssBet.wisdomRecord,row=[];row[C.区域]=region;row[C.投注类型]=rec.投注类型;row[C.订单信息]=rec.订单信息;row[C.金额]=rec.金额;row[C.注数]=rec.注数;row[C.订单总额]=item.stakeCents/100;row[C.申报人]='native';row[C.自定义]='否';return row;});
 var drawData=service._获取区域开奖数据.bind(service),currentType='';
 service._获取区域开奖数据=function(area){var data=drawData(area),scope=(record.qssDrawImpactScopes||{})[currentType];if(data&&scope==='all')data.平码列表=numbers.slice();else if(data&&scope==='regular'&&currentType!=='特码'&&currentType.indexOf('特肖')!==0&&currentType.indexOf('特码')!==0)data.特码=null;return data;};
 var outcomes;
 if(record.qssDrawImpactScopes){var combined=[];rows.forEach(function(row){currentType=row[C.投注类型];var one=service.执行综合兑奖([row],true);assert(!one.错误,one.错误);(one.按区域[region].native||[]).forEach(function(result){combined.push(result);});});outcomes={按区域:{}};outcomes.按区域[region]={native:combined};}
 else outcomes=service.执行综合兑奖(rows,true);assert(!outcomes.错误,outcomes.错误);var results=outcomes.按区域[region].native||[];assert(results.length===record.items.length,'对奖结果不完整');
 var lines=[],total=0,returned=0,rebate=0,winning=0,refund=0;
 results.forEach(function(outcome,index){var item=record.items[index],t=item.qssBet.wisdomRecord.投注类型;assert(!outcome.错误信息,outcome.错误信息);var isRefund=!!outcome.是和局,paid=cents(outcome.总赔付金额||0),win=isRefund?0:cents(outcome.中奖金额||0),rb=isRefund?0:cents(outcome.调整后返水金额||0);
  assert(Number.isSafeInteger(paid)&&paid>=0&&win>=0&&win<=item.stakeCents&&rb>=0&&rb<=item.stakeCents,'对奖金额超出范围');
  lines.push({kind:item.kind,selection:item.selection.slice(),stakeCents:item.stakeCents,won:!!outcome.是否中奖,returnCents:paid,rate:outcome.赔率,status:isRefund?'refund':outcome.是否中奖?'win':'lose',hits:[],rawReturnCents:paid,rebateCategory:t,rebateCents:rb,winningStakeCents:win,winningInfo:outcome.中奖信息||''});
  total+=item.stakeCents;returned+=paid;rebate+=rb;winning+=win;if(isRefund)refund+=item.stakeCents;
 });
 if(record.manualAdjustment&&record.manualAdjustment.direction==='decrease'){var reverse=record.manualAdjustment.reversal;assert(reverse&&lines.length===1,'冲减快照缺失');returned=lines[0].won?reverse.returnCents:0;rebate=reverse.rebateCents;lines[0].returnCents=lines[0].rawReturnCents=-returned;lines[0].rebateCents=-rebate;lines[0].winningStakeCents=-lines[0].winningStakeCents;total=-total;returned=-returned;rebate=-rebate;winning=-winning;refund=-refund;}
 return {returnCents:returned,rebateCents:rebate,bankerNetCents:total-returned-rebate,winningStakeCents:winning,refundCents:refund,rawReturnCents:returned,rawRebateCents:rebate,lines:lines,rulesNote:'智慧订单手机端解析及兑奖规则；使用入账时赔率和返水快照。'};
}
function settleMany(packet){
 var requests=packet&&packet.requests,settings=packet&&packet.settings;
 assert(Array.isArray(requests)&&requests.length>=1&&requests.length<=64&&Array.isArray(settings)&&settings.length>=1&&settings.length<=64,'兑奖批次无效');
 var currentSettings,loaded;
 function loadSettings(nextSettings){
  // This batch is synchronous. Keep a fresh service for each record, but
  // rebuild the engine tables only when its complete saved settings change.
  if(!loaded||nextSettings!==currentSettings){
   loaded=configureSettlement(nextSettings);
   currentSettings=nextSettings;
  }
  return loaded;
 }
 return requests.map(function(args){
  assert(Array.isArray(args)&&args.length===3&&Number.isInteger(args[2])&&args[2]>=0&&args[2]<settings.length,'兑奖参数无效');
  return settleConfigured(args[0],args[1],settings[args[2]],loadSettings);
 });
}
root.QSParser={parse:parse,settle:settle,settleMany:settleMany,defaultReplacements:function(){var o={};WISDOM_DEFAULTS.replacementRules.forEach(function(r){o[r.from]=r.to;});return o;},defaultZodiacMappings:function(year){var z='鼠牛虎兔龙蛇马羊猴鸡狗猪',o={};z.split('').forEach(function(v){o[v]=[];});for(var n=1;n<=49;n++)o[z[((year-1900)%12-(n-1)%12+24)%12]].push(n);return o;}};
})(typeof globalThis!=='undefined'?globalThis:this);
