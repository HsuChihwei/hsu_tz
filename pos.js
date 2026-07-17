import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SITE = 'tzzb.10jqka.com.cn';

// 账户配置文件路径
const ACCOUNT_CONFIG_PATH = path.join(os.homedir(), '.opencli', 'profiles', 'default', 'tzzb', 'account.json');

// 读取保存的账户 ID
function getSavedAccountId() {
    try {
        if (fs.existsSync(ACCOUNT_CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(ACCOUNT_CONFIG_PATH, 'utf8'));
            return config.accountId;
        }
    } catch (e) {
        // 配置文件读取失败，忽略
    }
    return null;
}

// 保存账户 ID
function saveAccountId(accountId) {
    try {
        const dir = path.dirname(ACCOUNT_CONFIG_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(ACCOUNT_CONFIG_PATH, JSON.stringify({ accountId, savedAt: new Date().toISOString() }, null, 2));
        console.log(`✅ 账户 ID 已保存: ${accountId}`);
    } catch (e) {
        console.log(`⚠️ 账户 ID 保存失败: ${e.message}`);
    }
}

// 从 URL 中提取账户 ID
function extractAccountId(url) {
    const match = url.match(/\/myAccount\/a\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

// 导航到账户汇总页，页面会自动跳转到第一个券商账户的位置页面
function buildNavigateUrl() {
    return 'https://tzzb.10jqka.com.cn/pc/index.html#/myAccount';
}

// 格式化数字：保留两位小数，保留正负号
const fmtNum = (s) => {
    if (!s || s === '--') return '--';
    const clean = s.replace(/[+%]/g, '');
    const n = parseFloat(clean);
    if (isNaN(n)) return s;
    const sign = n >= 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}`;
};

// 格式化无符号数字（用于市值、价格）
const fmtNumRaw = (s) => {
    if (!s || s === '--') return '--';
    const clean = s.replace(/[+%]/g, '');
    const n = parseFloat(clean);
    if (isNaN(n)) return s;
    return n.toFixed(2);
};

// 合并盈亏：金额(率)
const mergeProfit = (profit, rate) => {
    const p = fmtNum(profit);
    const r = rate || '--';
    if (p === '--') return '--';
    return `${p}(${r})`;
};

// 动态列配置（会被函数修改）
let dynamicColumns = [
    '代码', '名称', '市值', '当日盈亏', '持有盈亏',
    '仓位占比', '持仓数', '持有天数', '成本/现价'
];

// 字段映射：英文标识 -> {中文列名, 提取函数}
const fieldDefs = {
    'code':  { label: '代码',   extract: (r) => r[0] },
    'name':  { label: '名称',   extract: (r) => r[1] },
    'value': { label: '持仓市值', extract: (r) => fmtNumRaw(r[2]) },
    'dp':    { label: '当日盈亏', extract: (r) => fmtNum(r[3]) },
    'dpr':   { label: '当日盈亏率', extract: (r) => r[4] || '--' },
    'hp':    { label: '持有盈亏', extract: (r) => fmtNum(r[5]) },
    'hpr':   { label: '持有盈亏率', extract: (r) => r[6] || '--' },
    'hd':    { label: '持仓天数', extract: (r) => r[14] || '--' },
    'hr':    { label: '持仓比例', extract: (r) => r[12] || '--' },
    'cost':  { label: '成本',   extract: (r) => fmtNumRaw(r[18]) },
    'price': { label: '现价',   extract: (r) => fmtNumRaw(r[17]) },
};

cli({
    site: 'tzzb',
    name: 'pos',
    description: '获取持仓汇总。支持多账户切换(--account)，支持排序(--sortby/--sort)和自定义输出字段(--data)。默认展示汇总持仓。可用 opencli tzzb accounts 查看所有券商账户。',
    access: 'read',
    example: 'opencli tzzb pos [--account 银河] [--sortby value] [--sort des] [--data code,name,dp,dpr,value,hr]',
    domain: SITE,
    strategy: Strategy.COOKIE,
    browser: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    navigateBefore: 'https://tzzb.10jqka.com.cn/pc/index.html#/myAccount',
    siteSession: 'ephemeral',
    defaultFormat: 'md',
    args: [
        { name: 'sortby', type: 'str', default: 'dayprofit', help: '排序字段：value(市值)、dayprofit(当日盈亏)、holdprofit(持有盈亏)、holddays(持有天数)' },
        { name: 'sort', type: 'str', default: 'des', help: '排序方向：asc(升序)、des(降序)' },
        {
            name: 'data',
            type: 'str',
            default: 'code,name,dp,dpr,value,hr',
            help: '输出字段（逗号分隔）：code(代码)、name(名称)、value(持仓市值)、dp(当日盈亏)、dpr(当日盈亏率)、hp(持有盈亏)、hpr(持有盈亏率)、hd(持有天数)、hr(仓位占比)、cost(成本)、price(现价)。默认输出：code,name,dp,dpr,value,hr'
        },
        { name: 'refresh', type: 'bool', default: false, help: '查询前刷新页面以获取最新数据' },
        { name: 'account', type: 'str', default: '', help: '选择券商账户：汇总持仓、银河国金、小远银河、小远华鑫、小远东莞、华泰、蚂蚁财富、爱基金。为空时默认显示汇总持仓' },
    ],
    columns: dynamicColumns,
    func: async (page, args) => {
        // 如果指定了 --refresh，先刷新页面
        if (args.refresh) {
            console.log('刷新页面以获取最新数据...');
            await page.evaluate(() => location.reload());
            // 在页面上下文中等待
            await page.evaluate(() => new Promise(r => setTimeout(r, 3000)));
        }
        
        const sortby = args.sortby || 'dayprofit';
        const sortDir = args.sort || 'des';

        // 根据 --data 参数更新列配置
        const dataFields = (args.data || 'code,name,dp,dpr,value,hr').split(',');
        const newColumns = dataFields
            .map(f => fieldDefs[f.trim()])
            .filter(Boolean)
            .map(f => f.label);
        dynamicColumns.length = 0;
        dynamicColumns.push(...newColumns);

        // 排序字段映射
        const sortFieldMap = {
            'value': '持仓市值',
            'dayprofit': '当日盈亏',
            'holdprofit': '持有盈亏',
            'holddays': '持仓天数',
        };
        const sortField = sortFieldMap[sortby] || '当日盈亏';

        // 1. 快速鉴权检查
        const url = await page.evaluate(() => window.location.href);
        if (url.includes('login') || url.includes('auth')) {
            throw new AuthRequiredError('tzzb pos', '未登录。请执行 opencli browser tzzb open https://tzzb.10jqka.com.cn 打开浏览器登录同花顺账号。');
        }

        // 2. 等待 SPA 数据加载完成
        await page.evaluate(() => new Promise(function(r) { setTimeout(r, 3000); }));

        // 3. 选择指定券商账户（默认汇总持仓，需显式点击以确保选中）
        var targetTab = (args.account || '').trim() || '汇总持仓';
        var idx = await page.evaluate(function(name) {
            var tabBar = document.querySelector('.SumAccountTab_listView');
            if (!tabBar) return -1;
            var items = tabBar.querySelectorAll('div > div');
            for (var j = 0; j < items.length; j++) {
                if (items[j].textContent.trim() === name) return j;
            }
            return -1;
        }, targetTab);
        if (idx >= 0) {
            var selector = '.SumAccountTab_listView > div:nth-child(' + (idx + 1) + ')';
            try { await page.click(selector); } catch(e) {
                await page.evaluate(function(s) {
                    var el = document.querySelector(s);
                    if (el) {
                        var evt = new MouseEvent('click', {bubbles:true, cancelable:true, view:window});
                        el.dispatchEvent(evt);
                    }
                }, selector);
            }
        } else {
            console.log('⚠️ 未找到账户 "' + targetTab + '"');
        }
        await page.evaluate(function() { return new Promise(function(r) { setTimeout(r, 5000); }); });

        // 4. 等待 SPA 调用 stock_position API，直接获取结构化数据
            var apiData = null;
        try {
            var resp = await page.waitForResponse(function(r) {
                return r.url().includes('stock_position');
            }, { timeout: 15000 });
            var json = await resp.json();
            apiData = json.ex_data;
        } catch (e) {
        }

        // 5. 解析数据：优先 API，降级走 DOM 文本
        var positions = [];
        var summaryValues = null;

        if (apiData && apiData.position && apiData.position.length > 0) {
            positions = apiData.position;
            // 从各持仓汇总计算行
            var sumValue = 0, sumDp = 0, sumHp = 0;
            for (var pi = 0; pi < positions.length; pi++) {
                sumValue += parseFloat(positions[pi].value) || 0;
                sumDp += parseFloat(positions[pi].pre_profit) || 0;
                sumHp += parseFloat(positions[pi].hold_profit) || 0;
            }
            var dpRate = sumValue > 0 ? (sumDp / sumValue * 100).toFixed(2) + '%' : '--';
            var hpRate = sumValue > 0 ? (sumHp / sumValue * 100).toFixed(2) + '%' : '--';
            summaryValues = {
                value: String(sumValue),
                dp: String(sumDp),
                dpr: dpRate,
                hp: String(sumHp),
                hpr: hpRate,
                rate: apiData.position_rate,
            };
        } else {
            // 降级：从 DOM 文本解析（分段滚动捕获）
            var allRows = await page.evaluate(async function() {
                var seenCodes = {};
                var allResults = [];
                var viewportH = window.innerHeight;
                var maxScroll = document.body.scrollHeight;
                for (var step = 0; step < 50; step++) {
                    window.scrollTo(0, step * viewportH * 0.8);
                    await new Promise(function(r) { setTimeout(r, 400); });
                    var docText = document.body.innerText;
                    var idx = docText.indexOf("明细");
                    if (idx < 0) continue;
                    var lines = docText.substring(idx).split("\n").map(function(l){return l.trim()}).filter(Boolean);
                    var dataStart = 0;
                    for (var s = 0; s < lines.length; s++) {
                        if (/^\d{6}/.test(lines[s])) { dataStart = s; break; }
                    }
                    if (dataStart === 0) continue;
                    var dataPart = lines.slice(dataStart);
                    var pos = 0;
                    while (pos < dataPart.length) {
                        var ln = dataPart[pos];
                        if (/^\d{6}/.test(ln)) {
                            var code = ln;
                            if (!seenCodes[code]) {
                                seenCodes[code] = true;
                                var stock = dataPart.slice(pos, pos + 25);
                                if (stock.length >= 18) allResults.push(stock);
                            }
                            pos += 25;
                        } else if (ln === '汇总') {
                            var sumRow = dataPart.slice(pos, pos + 10);
                            allResults.push(sumRow);
                            pos = dataPart.length;
                            break;
                        } else {
                            pos++;
                        }
                    }
                    if (step * viewportH * 0.8 >= maxScroll) break;
                }
                window.scrollTo(0, 0);
                return allResults;
            });

            if (!allRows || allRows.length < 2) {
                throw new EmptyResultError('tzzb pos', '未获取到持仓数据');
            }

            var dataRows = allRows.filter(function(r) { return /^\d{6}/.test(r[0]); });
            if (dataRows.length === 0) {
                throw new EmptyResultError('tzzb pos', '表格中无股票持仓记录，账户可能为空仓');
            }

            // 提取汇总行
            for (var ri = 0; ri < allRows.length; ri++) {
                if (allRows[ri][0] === '汇总') { summaryValues = allRows[ri]; break; }
            }

            // 将 DOM 解析结果转为统一格式
            positions = dataRows.map(function(r) {
                return {
                    code: r[0],
                    name: r[1],
                    value: r[2],
                    pre_profit: r[3],
                    pre_rate: r[4],
                    hold_profit: r[5],
                    hold_rate: r[6],
                    position_rate: r[12] || '0',
                    hold_days: r[14],
                    price: r[17],
                    cost: r[18],
                };
            });
            // 降级模式下也从各持仓汇总计算，不使用 DOM 汇总行的索引映射
            var fallbackSv = 0, fallbackDp = 0, fallbackHp = 0;
            for (var fi = 0; fi < positions.length; fi++) {
                fallbackSv += parseFloat(positions[fi].value) || 0;
                fallbackDp += parseFloat(positions[fi].pre_profit) || 0;
                fallbackHp += parseFloat(positions[fi].hold_profit) || 0;
            }
            var fbDpRate = fallbackSv > 0 ? (fallbackDp / fallbackSv * 100).toFixed(2) + '%' : '--';
            var fbHpRate = fallbackSv > 0 ? (fallbackHp / fallbackSv * 100).toFixed(2) + '%' : '--';
            var totalRate = 0;
            for (var fi2 = 0; fi2 < positions.length; fi2++) {
                totalRate += parseFloat(positions[fi2].position_rate) || 0;
            }
            summaryValues = {
                value: String(fallbackSv),
                dp: String(fallbackDp),
                dpr: fbDpRate,
                hp: String(fallbackHp),
                hpr: fbHpRate,
                rate: totalRate > 0 ? totalRate.toFixed(2) + '%' : '--',
            };
        }

        // 6. 构建输出行
        // API 字段映射到 fieldDefs 所需位置
        function getField(p, field) {
            switch (field) {
                case 'code':  return p.code || '--';
                case 'name':  return p.name || '--';
                case 'value': return fmtNumRaw(p.value);
                case 'dp':    return fmtNum(p.pre_profit);
                case 'dpr':   return p.pre_rate || '--';
                case 'hp':    return fmtNum(p.hold_profit);
                case 'hpr':   return p.hold_rate || '--';
                case 'hr':    return p.position_rate || '--';
                case 'hd':    return p.hold_days || '--';
                case 'cost':  return fmtNumRaw(p.cost);
                case 'price': return fmtNumRaw(p.price);
                default:      return '--';
            }
        }

        // 汇总行
        const summaryObj = {};
        for (const field of dataFields) {
            const def = fieldDefs[field.trim()];
            if (def) {
                var sv = '--';
                if (summaryValues) {
                    if (field.trim() === 'code') sv = '汇总';
                    else if (field.trim() === 'name') sv = '';
                    else if (field.trim() === 'value') sv = fmtNumRaw(summaryValues.value);
                    else if (field.trim() === 'dp') sv = mergeProfit(summaryValues.dp, summaryValues.dpr);
                    else if (field.trim() === 'dpr') sv = summaryValues.dpr || '--';
                    else if (field.trim() === 'hp') sv = fmtNum(summaryValues.hp);
                    else if (field.trim() === 'hpr') sv = summaryValues.hpr || '--';
                    else if (field.trim() === 'hr') sv = summaryValues.rate || '--';
                    else if (field.trim() === 'hd') sv = '--';
                    else if (field.trim() === 'cost') sv = '--';
                    else if (field.trim() === 'price') sv = '--';
                    else sv = '--';
                }
                summaryObj[def.label] = sv;
            }
        }

        // 股票行
        const stockRows = positions.map(function(p) {
            const row = {};
            for (const field of dataFields) {
                const def = fieldDefs[field.trim()];
                if (def) {
                    row[def.label] = getField(p, field.trim());
                }
            }
            return row;
        });

        // 排序
        const extractNum = function(field, row) {
            const fieldKey = Object.keys(fieldDefs).find(function(k) { return fieldDefs[k].label === field; });
            if (!fieldKey) return 0;
            const val = row[field];
            if (!val || val === '--') return 0;
            if (fieldKey === 'dp' || fieldKey === 'hp') {
                const numPart = String(val).split('(')[0];
                return parseFloat(numPart.replace(/[+%]/g, '')) || 0;
            }
            return parseFloat(String(val).replace(/[+%]/g, '')) || 0;
        };

        stockRows.sort(function(a, b) {
            const va = extractNum(sortField, a);
            const vb = extractNum(sortField, b);
            return sortDir === 'asc' ? va - vb : vb - va;
        });

        return summaryObj ? [...stockRows, summaryObj] : stockRows;
    },
});

// 独立刷新命令（重新加载最新数据）
cli({
    site: 'tzzb',
    name: 'reload',
    description: '刷新持仓页面，重新加载最新数据',
    access: 'read',
    domain: SITE,
    strategy: Strategy.COOKIE,
    browser: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    navigateBefore: 'https://tzzb.10jqka.com.cn/pc/index.html#/myAccount',
    siteSession: 'ephemeral',
    func: async (page) => {
        console.log('正在刷新数据...');
        await page.evaluate(() => location.reload());
        await page.evaluate(() => new Promise(function(r) { setTimeout(r, 10000); }));
        
        var ready = await page.evaluate(function() {
            var txt = document.body.innerText;
            return txt.indexOf('明细') >= 0 && txt.length > 600;
        });
        
        if (ready) {
            return { 
                status: 'success', 
                message: '数据已更新',
                timestamp: new Date().toLocaleString('zh-CN')
            };
        }
        throw new EmptyResultError('tzzb reload', '刷新后数据未加载');
    },
});

// 初始化命令：登录并保存账户 ID
cli({
    site: 'tzzb',
    name: 'init',
    description: '初始化账户：登录同花顺并保存账户 ID，后续查询将自动使用该账户',
    access: 'read',
    domain: SITE,
    strategy: Strategy.COOKIE,
    browser: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    navigateBefore: 'https://tzzb.10jqka.com.cn/pc/index.html#/myAccount',
    siteSession: 'persistent',
    func: async (page, args) => {
        console.log('正在检测账户...');
        
        const url = await page.evaluate(() => window.location.href);
        
        if (url.includes('login') || url.includes('auth')) {
            throw new AuthRequiredError('tzzb init', '请先登录。在打开的浏览器窗口中登录同花顺账号后，再次执行 opencli tzzb init');
        }
        
        const accountId = extractAccountId(url);
        if (accountId) {
            saveAccountId(accountId);
            return {
                status: 'success',
                accountId,
                message: `✅ 账户初始化成功！账户 ID: ${accountId}`,
                configPath: ACCOUNT_CONFIG_PATH,
                timestamp: new Date().toLocaleString('zh-CN')
            };
        } else {
            // 尝试等待页面重定向到账户页面
            console.log('等待页面跳转到账户页面...');
            await page.evaluate(() => new Promise(r => setTimeout(r, 3000)));
            
            const newUrl = await page.evaluate(() => window.location.href);
            const newAccountId = extractAccountId(newUrl);
            
            if (newAccountId) {
                saveAccountId(newAccountId);
                return {
                    status: 'success',
                    accountId: newAccountId,
                    message: `✅ 账户初始化成功！账户 ID: ${newAccountId}`,
                    configPath: ACCOUNT_CONFIG_PATH,
                    timestamp: new Date().toLocaleString('zh-CN')
                };
            }
            
            return {
                status: 'pending',
                message: '⚠️ 未检测到账户 ID，请确保已登录并访问持仓页面',
                currentUrl: url,
                help: '请在浏览器中手动访问持仓页面，然后再次执行 opencli tzzb init'
            };
        }
    },
});

// 查看账户状态命令
cli({
    site: 'tzzb',
    name: 'status',
    description: '查看已保存的账户 ID 配置',
    access: 'read',
    domain: SITE,
    func: async () => {
        const accountId = getSavedAccountId();
        
        if (accountId) {
            try {
                const config = JSON.parse(fs.readFileSync(ACCOUNT_CONFIG_PATH, 'utf8'));
                return {
                    status: 'configured',
                    accountId,
                    savedAt: config.savedAt,
                    configPath: ACCOUNT_CONFIG_PATH,
                    message: `✅ 已配置账户: ${accountId}`
                };
            } catch (e) {
                return {
                    status: 'configured',
                    accountId,
                    message: `✅ 已配置账户: ${accountId}`,
                    warning: '配置文件读取失败，但账户 ID 已保存'
                };
            }
        } else {
            return {
                status: 'not_configured',
                message: '⚠️ 未配置账户 ID',
                help: '请执行 opencli tzzb init 初始化账户',
                configPath: ACCOUNT_CONFIG_PATH
            };
        }
    },
});

// 列出页面上的可用券商账户
cli({
    site: 'tzzb',
    name: 'accounts',
    description: '列出当前登录账户下可用的券商账户标签',
    access: 'read',
    domain: SITE,
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: 'https://tzzb.10jqka.com.cn/pc/index.html#/myAccount',
    siteSession: 'ephemeral',
    defaultFormat: 'md',
    columns: ['券商账户'],
    func: async (page) => {
        var accts = await page.evaluate(function() {
            var all = document.querySelectorAll('*');
            var seen = {};
            var result = [];
            for (var j = 0; j < all.length; j++) {
                var el = all[j];
                if (el.children.length === 0) {
                    var t = el.textContent.trim();
                    if (/^[\u4e00-\u9fa5]{2,6}$/.test(t) && 
                        ['首页','数据导入','添加','总资产','当日盈亏','本月盈亏','今年盈亏','仓位',
                         '盈亏对比','胜率对比','组合穿透','明细','代码','名称','持有金额',
                         '关联板块','板块涨幅','组合盈亏','组合涨幅','昨日盈亏','昨日盈亏率',
                         '持有盈亏','持有盈亏率','累计盈亏','累计盈亏率','本周盈亏','本月盈亏','今年盈亏',
                         '仓位占比','持有数量','持仓天数','确认涨幅','确认净值','单位成本','回本涨幅',
                         '近1月涨幅','近3月涨幅','近6月涨幅','近1年涨幅',
                         '持仓列表','交易记录','数据导出','持仓管理',
                         '创业板指','上证指数','深证指数'].indexOf(t) < 0) {
                        if (!seen[t]) {
                            seen[t] = true;
                            result.push(t);
                        }
                    }
                }
            }
            return result;
        });
        return accts.map(function(a) { return { '券商账户': a }; });
    }
});
