/*
    拼多多 AI 购物助手 v4
    缓存推荐流 + 埋点触发 + 网页兜底

    BoxJS 订阅: https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/pdd-ai-boxjs.json

    Surge:
    [Script]
    PDD-Cache = type=http-response, pattern=https:\/\/api\.pinduoduo\.com\/api\/alexa\/(cells\/hub|homepage\/hub), requires-body=1, max-size=0, timeout=30, script-path=https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/PDD-AI.js, argument=cache
    PDD-Analyze = type=http-request, pattern=https:\/\/th-b\.pinduoduo\.com\/t\.gif, requires-body=1, max-size=0, timeout=60, script-path=https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/PDD-AI.js, argument=analyze
    [MITM]
    hostname = api.pinduoduo.com, th-b.pinduoduo.com

    作者: 小H
*/

var mode = typeof $argument !== 'undefined' ? $argument : '';
var enabled = $persistentStore.read("pdd_ai_enabled") !== "false";

if (!enabled) {
    $done({});
} else if (mode === 'cache') {
    cacheProducts();
} else if (mode === 'analyze') {
    analyzeProduct();
} else {
    $done({});
}

// ============ 缓存推荐流商品 ============
function cacheProducts() {
    var body = $response.body;
    try {
        var data = JSON.parse(body);
        var products = [];
        findProducts(data, products, 0);

        if (products.length > 0) {
            var cache = {};
            try { cache = JSON.parse($persistentStore.read("pdd_ai_goods_cache") || "{}"); } catch(e) {}

            for (var i = 0; i < products.length; i++) {
                cache[String(products[i].goods_id)] = products[i];
            }

            var keys = Object.keys(cache);
            if (keys.length > 50) {
                var toRemove = keys.slice(0, keys.length - 50);
                for (var j = 0; j < toRemove.length; j++) delete cache[toRemove[j]];
            }

            $persistentStore.write(JSON.stringify(cache), "pdd_ai_goods_cache");
        }
    } catch(e) {}
    $done({ body: body });
}

// ============ 分析商品 ============
function analyzeProduct() {
    var apiUrl = $persistentStore.read("pdd_ai_api_url") || "";
    var apiKey = $persistentStore.read("pdd_ai_api_key") || "";
    var modelName = $persistentStore.read("pdd_ai_model") || "gemini-3.8-flash-high";
    var cooldown = parseInt($persistentStore.read("pdd_ai_cooldown") || "30");

    if (!apiUrl || !apiKey) { $done({}); return; }

    var body = $request.body || '';
    if (body.indexOf('page_name=goods_detail') === -1 || body.indexOf('op=impr') === -1) {
        $done({});
        return;
    }

    var goodsIdMatch = body.match(/refer_goods_id=(\d+)/);
    if (!goodsIdMatch) { $done({}); return; }
    var goodsId = goodsIdMatch[1];

    // 去重 + 冷却
    var lastGoodsId = $persistentStore.read("pdd_ai_last_goods_id") || "";
    var lastTime = parseInt($persistentStore.read("pdd_ai_last_time") || "0");
    var now = new Date().getTime();
    if (goodsId === lastGoodsId && (now - lastTime) < cooldown * 1000) { $done({}); return; }

    $persistentStore.write(goodsId, "pdd_ai_last_goods_id");
    $persistentStore.write(String(now), "pdd_ai_last_time");

    // 先查缓存
    var cache = {};
    try { cache = JSON.parse($persistentStore.read("pdd_ai_goods_cache") || "{}"); } catch(e) {}
    var product = cache[goodsId];

    if (product) {
        // 缓存命中，直接分析
        callAI(product);
    } else {
        // 缓存没命中，从埋点提取 + 抓网页
        var priceMatch = body.match(/goods_price=([0-9.]+)/);
        var salesMatch = body.match(/sales_tip=([^&]+)/);
        var price = priceMatch ? priceMatch[1] : '';
        var sales = salesMatch ? decodeURIComponent(salesMatch[1]) : '';

        $notification.post('🛒 购物助手', price ? '¥' + price : 'ID: ' + goodsId, '正在获取商品信息...');

        // 抓拼多多网页获取商品名
        var pddUrl = 'https://mobile.yangkeduo.com/goods.html?goods_id=' + goodsId;
        $httpClient.get({
            url: pddUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
                'X-Surge-Skip-Scripting': 'true'
            },
            timeout: 8
        }, function(err, resp, htmlData) {
            var goodsName = '';
            if (!err && htmlData) {
                var titleMatch = htmlData.match(/<title>([^<]+)<\/title>/i);
                if (titleMatch) goodsName = titleMatch[1].replace(/\s*-\s*拼多多.*$/, '').trim();
                if (!goodsName) {
                    var ogMatch = htmlData.match(/property="og:title"\s+content="([^"]+)"/);
                    if (ogMatch) goodsName = ogMatch[1].trim();
                }
            }

            var fallback = {
                goods_id: goodsId,
                name: goodsName || '拼多多商品',
                price: price || '未知',
                originalPrice: '未知',
                salesTip: sales,
                mallName: '',
                discount: ''
            };
            callAI(fallback);
        });
    }

    function callAI(prod) {
        var info = '商品名: ' + prod.name + '\n'
            + '价格: ¥' + prod.price + '\n';
        if (prod.originalPrice && prod.originalPrice !== '未知') info += '原价: ¥' + prod.originalPrice + '\n';
        if (prod.discount) info += '折扣: ' + prod.discount + '\n';
        if (prod.salesTip) info += '销量: ' + prod.salesTip + '\n';
        if (prod.mallName) info += '店铺: ' + prod.mallName + '\n';

        var displayName = prod.name.substring(0, 20);
        var displaySub = '¥' + prod.price;
        if (prod.salesTip) displaySub += ' | ' + prod.salesTip;

        var prompt = '你是一个精明的购物顾问。请分析以下拼多多商品，给出购买建议。\n\n'
            + '【商品信息】\n' + info + '\n'
            + '【要求】用简洁中文回答，不超过150字：\n'
            + '1. 💰 价格评估：合理吗？和市场价比如何？\n'
            + '2. ⚠️ 风险提醒：有没有坑？\n'
            + '3. ✅ 购买建议：一句话总结。';

        $httpClient.post({
            url: apiUrl,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey,
                'X-Surge-Skip-Scripting': 'true'
            },
            body: JSON.stringify({
                model: modelName,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 300
            }),
            timeout: 50
        }, function(err, resp, respData) {
            if (err) {
                $notification.post('🛒 购物助手', 'AI 请求失败', String(err));
                $done({});
                return;
            }
            try {
                var result = JSON.parse(respData);
                if (result.choices && result.choices[0]) {
                    $notification.post('🛒 ' + displayName, displaySub, result.choices[0].message.content);
                } else if (result.error) {
                    $notification.post('🛒 购物助手', '错误', result.error.message || JSON.stringify(result.error));
                }
            } catch(e) {
                $notification.post('🛒 购物助手', '解析失败', respData ? respData.substring(0, 200) : '空');
            }
            $done({});
        });
    }
}

// ============ 递归提取商品 ============
function findProducts(obj, results, depth) {
    if (depth > 15 || results.length >= 20) return;
    if (!obj || typeof obj !== 'object') return;

    if (obj.goods_name && (obj.group_price !== undefined || obj.normal_price !== undefined)) {
        var gp = obj.group_price || 0;
        var np = obj.normal_price || 0;
        var price = typeof gp === 'number' && gp > 100 ? (gp / 100).toFixed(1) : String(gp);
        var orig = typeof np === 'number' && np > 100 ? (np / 100).toFixed(1) : String(np);

        results.push({
            goods_id: obj.goods_id || '',
            name: obj.goods_name || '',
            price: price,
            originalPrice: orig,
            salesTip: obj.sales_tip || obj.fallback_sales_tip || '',
            mallName: obj.mall_name || '',
            discount: (np > 0 && gp > 0 && np > gp) ? Math.round((1 - gp / np) * 100) + '%' : ''
        });
        return;
    }

    if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length && results.length < 20; i++) findProducts(obj[i], results, depth + 1);
    } else {
        var keys = Object.keys(obj);
        for (var k = 0; k < keys.length && results.length < 20; k++) findProducts(obj[keys[k]], results, depth + 1);
    }
}
