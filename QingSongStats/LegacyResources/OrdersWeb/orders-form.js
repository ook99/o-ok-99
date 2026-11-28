(function (root) {
    'use strict';
    // Presentation only. The settlement runtime remains the sole authority for
    // winning stakes, water, payouts, profile allocation and final profit.
    function project(row, gameplayLabel, name) {
        const linesByParent = new Map();
        for (const detail of row.details || []) {
            const lines = linesByParent.get(detail.parentOrderId) || [];
            lines.push(detail);
            linesByParent.set(detail.parentOrderId, lines);
        }
        return {
            name: name || row.declarantName,
            groups: (row.parentOrders || []).map((parent, index) => {
                const wins = new Map();
                for (const detail of linesByParent.get(parent.parentOrderId) || []) {
                    for (const slice of detail.pricingSlices || []) {
                        if (!slice.won || !(slice.winningStakeAmount > 0))
                            continue;
                        const label = gameplayLabel(slice.betType);
                        wins.set(label, (wins.get(label) || 0) + slice.winningStakeAmount);
                    }
                }
                return { id: parent.parentOrderId, sequence: index + 1, amount: parent.totalAmount, wins: [...wins].map(([betType, amount]) => ({ betType, amount })) };
            }),
            total: row.orderTotal,
            water: row.totalWater,
            payouts: (row.payoutRows || []).map(item => ({ betType: gameplayLabel(item.betType), stake: item.winningStakeAmount, odds: item.effectiveOdds, amount: item.payoutAmount })),
            profit: row.houseProfitLoss,
        };
    }
    function winningLines(value, maxWidth, measure, baseFontSize) {
        if (measure(value) <= maxWidth)
            return [{ text: value }];
        if (/(?:带主肖|零尾)/u.test(value))
            return [{ text: value, fontSize: Math.floor(baseFontSize * maxWidth / measure(value) * 100) / 100 }];
        const lines = [];
        let current = '';
        for (const character of Array.from(value)) {
            if (current && measure(current + character) > maxWidth) {
                lines.push({ text: current });
                current = character;
            }
            else
                current += character;
        }
        if (current)
            lines.push({ text: current });
        return lines;
    }
    function waterBreakdownLines(rows, gameplayLabel = value => value) {
        const byPlay = new Map();
        for (const row of rows || []) {
            const rates = byPlay.get(row.betType) || new Map();
            const current = rates.get(row.waterRatePercent) || { stake: 0, water: 0 };
            current.stake += row.validStakeAmount;
            current.water += row.waterAmount;
            rates.set(row.waterRatePercent, current);
            byPlay.set(row.betType, rates);
        }
        return [...byPlay].map(([betType, rates]) => {
            const title = String(gameplayLabel(betType) || betType).replace(/全中$/u, '');
            const terms = [...rates].map(([rate, value]) => `${value.stake}×${Number((rate / 100).toFixed(12))}`);
            const total = [...rates.values()].reduce((sum, value) => sum + value.water, 0);
            return `${title}水:${terms.join(' + ')}=${total}`;
        });
    }
    function textWithWaterBreakdown(text, lines, expanded) {
        if (!expanded || !lines.length)
            return text;
        const parts = String(text).split('\n'), index = parts.findIndex(line => /^水钱[:：]/u.test(line));
        if (index < 0)
            return text;
        parts.splice(index + 1, 0, ...lines);
        return parts.join('\n');
    }
    // Same contiguous-height balancing as Windows formSettlementColumns.
    function columns(groups, count) {
        if (!groups.length)
            return [];
        const columnCount = Math.max(1, Math.min(Math.floor(count) || 1, groups.length));
        const heights = groups.map(group => 1 + (group.displayLineCount ?? group.wins.length));
        const prefix = [0];
        for (const height of heights)
            prefix.push(prefix.at(-1) + height);
        const total = prefix.at(-1);
        const needed = limit => { let parts = 1, used = 0; for (const height of heights) {
            if (used + height > limit) {
                parts++;
                used = 0;
            }
            used += height;
        } return parts; };
        let lower = Math.max(...heights), upper = total;
        while (lower < upper) {
            const middle = Math.floor((lower + upper) / 2);
            if (needed(middle) <= columnCount)
                upper = middle;
            else
                lower = middle + 1;
        }
        const maximum = lower;
        const reachable = (weights, minimum) => {
            const sums = [0];
            for (const height of weights)
                sums.push(sums.at(-1) + height);
            const rows = [new Uint8Array(weights.length + 1)];
            rows[0][0] = 1;
            for (let part = 1; part <= columnCount; part++) {
                const previous = rows[part - 1], current = new Uint8Array(weights.length + 1);
                let left = 0, right = -1, available = 0;
                for (let end = part; end <= weights.length; end++) {
                    const earliest = sums[end] - maximum, latest = sums[end] - minimum;
                    while (right + 1 < end && sums[right + 1] <= latest) {
                        right++;
                        available += previous[right];
                    }
                    while (left <= right && sums[left] < earliest) {
                        available -= previous[left];
                        left++;
                    }
                    if (available > 0)
                        current[end] = 1;
                }
                rows.push(current);
            }
            return rows;
        };
        let minimum = 0, ceiling = Math.floor(total / columnCount);
        while (minimum < ceiling) {
            const middle = Math.ceil((minimum + ceiling) / 2);
            if (reachable(heights, middle)[columnCount][groups.length])
                minimum = middle;
            else
                ceiling = middle - 1;
        }
        const suffix = reachable([...heights].reverse(), minimum), result = [];
        let start = 0;
        for (let column = 0; column < columnCount - 1; column++) {
            const remaining = columnCount - column - 1;
            let chosen = start + 1;
            for (let end = groups.length - remaining; end > start; end--) {
                const height = prefix[end] - prefix[start];
                if (height > maximum)
                    continue;
                if (height < minimum)
                    break;
                if (!suffix[remaining][groups.length - end])
                    continue;
                chosen = end;
                break;
            }
            result.push(groups.slice(start, chosen));
            start = chosen;
        }
        result.push(groups.slice(start));
        return result;
    }
    const api = Object.freeze({ project, winningLines, columns, waterBreakdownLines, textWithWaterBreakdown });
    root.AndroidFormSettlement = api;
    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
})(globalThis);
