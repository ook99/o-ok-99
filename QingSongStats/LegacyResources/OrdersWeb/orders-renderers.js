(function(root){'use strict';
const $=s=>document.querySelector(s), app=document.getElementById('app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtRiskLogAmount=n=>String(Number(Number(n||0).toFixed(2)));
const domainRuntime={formatOrderAmount:fmtRiskLogAmount,gameplayNameLabel:v=>v};
const drawRegionNames={'新澳':'新澳','香港':'香港','老澳门':'老澳'};
let detailSequenceByOrder=new Map(),detailProjection={waterExpanded:new Set()};
    function detailCategoryLabel(value) { return /^(?:带主肖|带?零尾)$/u.test(value || '') ? '' : value || ''; }
    function detailWinningText(text, category) { const value = String(text ?? ''), suffix = category && !detailCategoryLabel(category) ? ` · ${category}` : ''; return suffix && value.endsWith(suffix) ? value.slice(0, -suffix.length) : value; }
    function selectionHighlightRanges(text, order, outcome) {
        if (!outcome?.ok || !outcome.detail?.won)
            return [];
        const canonical = value => /^\d{1,2}(?:号)?$/u.test(String(value)) ? String(Number.parseInt(value, 10)).padStart(2, '0') : String(value);
        const selected = new Set((order?.selections || []).map(canonical));
        const matched = new Set((outcome.detail.matchedSelections || []).map(canonical).filter(value => selected.has(value)));
        if (!matched.size)
            return [];
        const semantics = order?.sourceSelectionSemantics, numberAttributes = globalThis.AndroidSemanticRecognizer?.numberAttributes;
        if (semantics?.kind === 'zodiac' && Array.isArray(semantics.sourceSelections) && order?.attributeContextId && typeof numberAttributes === 'function') {
            const sourceZodiacs = new Set(semantics.sourceSelections);
            for (const number of [...matched]) {
                if (!/^\d{2}$/u.test(number))
                    continue;
                try {
                    const zodiac = numberAttributes(Number(number), order.attributeContextId)?.zodiac2026;
                    if (sourceZodiacs.has(zodiac))
                        matched.add(zodiac);
                }
                catch { /* A display projection must not block an already judged order. */ }
            }
        }
        const source = String(text ?? ''), pricing = /(?:各数|各组|各号|各|每组|共)\s*(?:-?\d|[一二三四五六七八九十百])/u.exec(source), limit = pricing?.index ?? source.length, ranges = [];
        for (const match of source.matchAll(/\d{1,2}号?|[鼠牛虎兔龙蛇马羊猴鸡狗猪]/gu)) {
            if (match.index >= limit)
                break;
            if (matched.has(canonical(match[0])))
                ranges.push({ start: match.index, end: match.index + match[0].length });
        }
        return ranges;
    }
    function highlightedTextParts(text, ranges) {
        const source = String(text ?? '');
        if (!ranges.length)
            return [{ text: source, highlighted: false }];
        const parts = [];
        let cursor = 0;
        for (const hit of [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)) {
            if (hit.start < cursor)
                continue;
            if (hit.start > cursor)
                parts.push({ text: source.slice(cursor, hit.start), highlighted: false });
            parts.push({ text: source.slice(hit.start, hit.end), highlighted: true });
            cursor = hit.end;
        }
        if (cursor < source.length)
            parts.push({ text: source.slice(cursor), highlighted: false });
        return parts;
    }
    function detailOrdersMarkup(item, outcomes = new Map(), range) { const groups = range?.groups || new Map(); if (!range?.groups)
        item.items.forEach((entry, index) => { const group = groups.get(entry.group.id) || { total: 0, lastIndex: index }; group.total += Number(entry.total); group.lastIndex = index; groups.set(entry.group.id, group); }); const start = range?.start || 0; return item.items.slice(start, range?.end ?? item.items.length).map((entry, offset) => { const index = start + offset, previousEntry = item.items[index - 1], nextEntry = item.items[index + 1], endsMessage = Boolean(nextEntry && entry.group.id !== nextEntry.group.id), startsMessage = !previousEntry || previousEntry.group.id !== entry.group.id, showPrefix = startsMessage || previousEntry.prefix !== entry.prefix, group = groups.get(entry.group.id), sequence = detailSequenceByOrder.get(entry.id) || 1, outcome = outcomes.get(entry.id), category = detailCategoryLabel(entry.categoryTag), winner = outcome?.ok && outcome.detail.won ? detailWinningText(outcome.detail.winningText, entry.categoryTag) : '', reason = outcome && !outcome.ok ? (outcome.gates || []).filter(g => g.code !== 'missing-draw').map(g => g.reason).join('；') : ''; return `<div class="detail-order${endsMessage ? ' detail-message-end' : ''}" data-message-group="${esc(entry.group.id)}" role="button" tabindex="0" data-owner-id="${esc(item.id)}" data-order-id="${esc(entry.id)}" aria-label="订单，长按修改或删除" data-order-region="${esc(entry.order.region)}"><span class="detail-order-copy"><span class="detail-order-heading">${startsMessage ? `<small class="detail-order-sequence" aria-label="第${sequence}组">${sequence}</small>` : `<small class="detail-order-sequence detail-order-sequence-empty" aria-hidden="true">${sequence}</small>`}<span class="detail-order-prefix">${showPrefix ? `<strong>${esc(entry.prefix)}</strong>` : ''}${winner ? `<small class="detail-order-win" title="${esc((outcome.detail.matchedSelections || []).join('、'))}">${esc(winner)}</small>` : reason ? `<small class="detail-order-review">${esc(reason)}</small>` : ''}</span></span><p>${category ? `<small class="detail-order-category">${esc(category)}</small>` : ''}${highlightedTextParts(entry.body, selectionHighlightRanges(entry.body, entry.order, outcome)).map(part => part.highlighted ? `<mark class="detail-order-hit">${esc(part.text)}</mark>` : esc(part.text)).join('')}</p></span>${index === group.lastIndex ? `<span class="detail-order-total" data-group-total="${esc(entry.group.id)}" aria-label="第${sequence}组，金额${fmtRiskLogAmount(group.total)}">¥${fmtRiskLogAmount(group.total)}</span>` : ''}</div>`; }).join(''); }
    function originalGroupText(entries) { const sources = entries.map(entry => entry.order?.sourceGroupText); if (sources.length && sources.every(text => typeof text === 'string' && text.trim() && text === sources[0]))
        return { text: sources[0], complete: true }; if (entries.length === 1 && typeof entries[0].order?.sourceText === 'string' && entries[0].order.sourceText.trim())
        return { text: entries[0].order.sourceText, complete: false }; return { text: '该组完整原文未保存，无法还原', complete: false }; }
    function originalWinningParts(text, entries, outcomes) {
        const hits = [];
        for (const entry of entries) {
            const order = entry.order, outcome = outcomes.get(entry.id), sourceText = order?.sourceText;
            if (!outcome?.ok || !outcome.detail?.won || !sourceText)
                continue;
            let start = null;
            const range = order.sourceGroupRange;
            if (Number.isInteger(order.start) && Number.isInteger(range?.start)) {
                const candidate = order.start - range.start;
                if (candidate >= 0 && text.slice(candidate, candidate + sourceText.length) === sourceText)
                    start = candidate;
            }
            if (start === null) {
                const first = text.indexOf(sourceText);
                if (first >= 0 && text.indexOf(sourceText, first + 1) < 0)
                    start = first;
            }
            if (start === null)
                continue;
            for (const hit of selectionHighlightRanges(sourceText, order, outcome))
                hits.push({ start: start + hit.start, end: start + hit.end });
        }
        return highlightedTextParts(text, hits);
    }
    function detailOriginalOrdersMarkup(item, outcomes = new Map(), range) { const groups = range?.groups || new Map(), start = range?.start || 0; if (!range?.groups)
        item.items.forEach((entry, index) => groups.set(entry.group.id, { total: (entry.originalEntries || [entry]).reduce((sum, child) => sum + Number(child.total), 0), lastIndex: index })); return item.items.slice(start, range?.end ?? item.items.length).map((entry, offset) => { const index = start + offset, entries = entry.originalEntries || [entry], source = originalGroupText(entries), parts = source.complete ? originalWinningParts(source.text, entries, outcomes) : [{ text: source.text, highlighted: false }], sequence = detailSequenceByOrder.get(entry.id) || 1, body = parts.map(part => part.highlighted ? `<mark class="detail-original-hit">${esc(part.text)}</mark>` : esc(part.text)).join(''), statuses = entries.flatMap(child => { const result = outcomes.get(child.id); if (!result?.ok || !result.detail?.won || !result.detail.winningText)
        return []; const label = detailWinningText(result.detail.winningText, child.categoryTag), region = child.order?.region, prefix = drawRegionNames[region] || String(region ?? '').replace(/六合彩$/u, ''); return [`<span class="detail-original-status is-win" data-outcome-order-id="${esc(child.id)}">${esc(prefix + label)}</span>`]; }).join(''); return `<div class="detail-order${index < item.items.length - 1 ? ' detail-message-end' : ''}" data-message-group="${esc(entry.group.id)}" role="button" tabindex="0" data-owner-id="${esc(item.id)}" data-order-id="${esc(entry.id)}" aria-label="第${sequence}组原单，长按修改或删除" data-order-region="${esc(entry.order.region)}"><span class="detail-original-copy"><small class="detail-order-sequence" aria-label="第${sequence}组">${sequence}</small><p class="detail-original-text${source.complete ? '' : ' detail-original-missing'}">${body}</p>${statuses ? `<span class="detail-original-status-list">${statuses}</span>` : ""}</span><span class="detail-order-total" data-group-total="${esc(entry.group.id)}">¥${fmtRiskLogAmount(groups.get(entry.group.id)?.total || 0)}</span></div>`; }).join(''); }
    function settlementWaterKey(row, mode) { return JSON.stringify([mode, row.declarantId, row.pricingProfileId ?? null]); }
    function settlementWaterLines(row) { return globalThis.AndroidFormSettlement.waterBreakdownLines(row.waterRows, domainRuntime.gameplayNameLabel); }
    function settlementWaterExpanded(row, mode) { return detailProjection?.waterExpanded?.has(settlementWaterKey(row, mode)) || false; }
    function settlementDisplayText(row) { return globalThis.AndroidFormSettlement.textWithWaterBreakdown(row.copyLines.join('\n'), settlementWaterLines(row), settlementWaterExpanded(row, 'regular')); }
    function settlementDisplayMarkup(row) {
        const waterLines = settlementWaterLines(row), expanded = settlementWaterExpanded(row, 'regular'), key = settlementWaterKey(row, 'regular');
        return row.copyLines.map(line => {
            if (!waterLines.length || !/^水钱[:：]/u.test(line))
                return esc(line);
            return `<span><button type="button" class="settlement-water-toggle" data-water-toggle data-water-key="${esc(key)}" aria-expanded="${expanded}">水钱</button>${esc(line.slice(2))}${expanded ? `<span class="settlement-water-details">\n${esc(waterLines.join('\n'))}</span>` : ''}</span>`;
        }).join('\n');
    }
    function formNumber(value) { return String(Number(Number(value || 0).toFixed(2))); }
    function formOrderNumber(value) { return domainRuntime.formatOrderAmount(value); }
    function formSettlementLayout() {
        const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-scale')) || 1, fontSize = 11 * scale, cardWidth = 68 * scale, canvas = document.createElement('canvas'), context = canvas.getContext('2d');
        if (context)
            context.font = `${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
        const measure = text => context ? context.measureText(text).width : Array.from(text).length * fontSize;
        const detailWidth = $('#detailSettlement').clientWidth || Math.max(0, app.clientWidth - 24), captureWidth = Math.max(cardWidth, detailWidth - 32), count = Math.max(1, Math.floor((captureWidth + 4) / (cardWidth + 4)));
        return { fontSize, cardWidth, measure, count };
    }
    function formSettlementCard(row, { fontSize, cardWidth, measure, count }) {
        const form = globalThis.AndroidFormSettlement.project(row, domainRuntime.gameplayNameLabel, row.copyLines[0]?.replace(/^申报人[:：]/u, '') || row.declarantName);
        const groups = form.groups.map(group => { const winLines = group.wins.flatMap(win => globalThis.AndroidFormSettlement.winningLines(`${formOrderNumber(win.amount)}${win.betType}`, cardWidth - 4, measure, fontSize)); return { ...group, winLines, displayLineCount: winLines.length }; });
        const renderGroup = group => `<div class="mobile-form-group" title="第${group.sequence}组，总额${formOrderNumber(group.amount)}"><div class="mobile-form-group-head"><span class="mobile-form-group-number">${group.sequence}</span><span class="mobile-form-group-amount">${formOrderNumber(group.amount)}</span></div>${group.winLines.map(line => `<div class="mobile-form-group-win"${line.fontSize ? ` style="font-size:${line.fontSize}px"` : ''} title="${esc(line.text)}">${esc(line.text)}</div>`).join('')}</div>`;
        const columns = globalThis.AndroidFormSettlement.columns(groups, count);
        const rows = `<div class="mobile-form-columns" data-layout="vertical">${columns.map(column => `<div class="mobile-form-column">${column.map(renderGroup).join('')}</div>`).join('')}</div>`;
        const payouts = form.payouts.map(item => `<span>${esc(item.betType)}:${formOrderNumber(item.stake)}×${esc(item.odds)}=${formNumber(item.amount)}</span>`).join('');
        const waterLines = settlementWaterLines(row), waterExpanded = settlementWaterExpanded(row, 'form'), waterKey = settlementWaterKey(row, 'form');
        const waterTotal = waterLines.length ? `<span class="mobile-form-water-total"><button type="button" class="mobile-form-water-toggle" data-water-toggle data-water-key="${esc(waterKey)}" aria-expanded="${waterExpanded}">水钱</button><span>:${formNumber(form.water)}</span></span>` : `<span>水钱:${formNumber(form.water)}</span>`;
        const waterDetails = waterExpanded ? waterLines.map(line => `<span class="mobile-form-water-detail">${esc(line)}</span>`).join('') : '';
        const sign = form.profit > 0 ? 'positive' : form.profit < 0 ? 'negative' : 'neutral';
        return `<section class="mobile-form-person" data-form-declarant="${esc(row.declarantId)}" data-form-pricing="${esc(row.pricingProfileId)}"><div class="mobile-form-capture"><div class="mobile-form-name">申报人:${esc(form.name)}</div>${rows}<div class="mobile-form-summary"><span>总额:${formOrderNumber(form.total)}</span>${waterTotal}${waterDetails}${payouts}<span><span class="mobile-form-profit-label">最终盈亏:${formOrderNumber(form.total)}-${formNumber(form.water)}${form.payouts.map(item => `-${formNumber(item.amount)}`).join('')}=</span><span class="mobile-form-profit" data-sign="${sign}">${formNumber(form.profit)}</span></span></div></div><div class="mobile-form-actions"><button type="button" class="mobile-form-share" data-form-copy>复制明细</button><button type="button" class="mobile-form-share" data-form-share>分享表单图片</button></div></section>`;
    }
root.OrderDonorRenderers={detailOrdersMarkup,detailOriginalOrdersMarkup,formSettlementCard,formSettlementLayout,settlementDisplayMarkup,settlementDisplayText,setSequences:map=>{detailSequenceByOrder=map},toggleWater:key=>{const s=detailProjection.waterExpanded;s.has(key)?s.delete(key):s.add(key)}};
})(globalThis);