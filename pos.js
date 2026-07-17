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

        // 2. 等待页面加载后刷新，然后等待数据加载
        await page.evaluate(() => location.reload());
        await page.evaluate(() => new Promise(function(r) { setTimeout(r, 8000); }));

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

        // 4. 从 body 文本提取持仓数据
        var rows = await page.evaluate(() => {
            var docText = document.body.innerText;
            var idx = docText.indexOf("明细");
            if (idx < 0) return [];
            var bodyLines = docText.substring(idx).split("\n")
                .map(function(l) { return l.trim(); }).filter(Boolean);
            if (bodyLines.length < 30) return [];
            var dataPart = bodyLines.slice(28);
            var result = [];
            var pos = 0;
            while (pos < dataPart.length) {
                var ln = dataPart[pos];
                if (/^\d{6}/.test(ln)) {
                    var stock = dataPart.slice(pos, pos + 24);
                    if (stock.length >= 18) result.push(stock);
                    pos += 25;
                } else if (ln === '汇总') {
                    var sumRow = dataPart.slice(pos, pos + 10);
                    result.push(sumRow);
                    break;
                } else {
                    pos++;
                }
            }
            return result;
        });

        if (!rows || rows.length < 2) {
            throw new EmptyResultError('tzzb pos', '未获取到持仓数据');
        }

        var dataRows = rows.filter(function(r) { return /^\d{6}/.test(r[0]); });
        if (dataRows.length === 0) {
            throw new EmptyResultError('tzzb pos', '表格中无股票持仓记录，账户可能为空仓');
        }

        // 提取汇总行
        var summaryRow = null;
        for (var ri = 0; ri < rows.length; ri++) {
            if (rows[ri][0] === '汇总') { summaryRow = rows[ri]; break; }
        }

        // 汇总字段映射（新页面结构）
        var summaryFieldMap = {
            'code': function() { return '汇总'; },
            'name': function() { return ''; },
            'value': function() { return fmtNumRaw(summaryRow[1]); },
            'dp': function() { return mergeProfit(summaryRow[2], summaryRow[3]); },
            'dpr': function() { return summaryRow[3] || '--'; },
            'hp': function() { return mergeProfit(summaryRow[4], summaryRow[5]); },
            'hpr': function() { return summaryRow[5] || '--'; },
            'hr': function() { return summaryRow[8] || '--'; },
            'hd': function() { return '--'; },
            'cost': function() { return '--'; },
            'price': function() { return '--'; },
        };

        // 构建汇总行（根据 data 字段动态构建）
        const summary = summaryRow ? (() => {
            const obj = {};
            for (const field of dataFields) {
                const fn = summaryFieldMap[field.trim()];
                if (fn) {
                    const def = fieldDefs[field.trim()];
                    obj[def.label] = fn();
                }
            }
            return obj;
        })() : null;

        // 构建股票行（根据 data 字段动态构建）
        const stockRows = dataRows.map(r => {
            const row = {};
            for (const field of dataFields) {
                const def = fieldDefs[field.trim()];
                if (def) {
                    row[def.label] = def.extract(r);
                }
            }
            return row;
        });

        // 排序：根据排序字段提取数值
        const extractNum = (field, row) => {
            // field 是中文列名，找到对应的字段标识
            const fieldKey = Object.keys(fieldDefs).find(k => fieldDefs[k].label === field);
            if (!fieldKey) return 0;
            const val = row[field];
            if (!val || val === '--') return 0;
            // 对于盈亏金额字段，取括号前的数字
            if (fieldKey === 'dp' || fieldKey === 'hp') {
                const numPart = val.split('(')[0];
                return parseFloat(numPart.replace(/[+%]/g, '')) || 0;
            }
            // 其他字段直接取数值
            return parseFloat(val.replace(/[+%]/g, '')) || 0;
        };

        stockRows.sort((a, b) => {
            const va = extractNum(sortField, a);
            const vb = extractNum(sortField, b);
            return sortDir === 'asc' ? va - vb : vb - va;
        });

        return summary ? [...stockRows, summary] : stockRows;
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
