/*
    拼多多 AI 购物助手
    精准分析你正在看的商品

    BoxJS 订阅: https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/pdd-ai-boxjs.json

    工作原理:
    1. 拦截推荐流响应，缓存所有商品信息（按 goods_id 索引）
    2. 拦截埋点请求，检测 page_name=goods_detail 时提取 goods_id
    3. 从缓存中找到商品信息，调 AI 分析

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

// ============ 模式1: 缓存商品数据 ============
function cacheProducts() {
    var body = $response.body;
    try {
        var data = JSON.parse(body);
        var products = [];
        findProducts(data, products, 0);

        if (products.length > 0) {
            // 读取已有缓存
            var cache = {};
            try {
                cache = JSON.parse($persistentStore.read("pdd_ai_goods_cache") || "{}");
            } catch(e) {}

            // 添加新商品到缓存
            for (var i = 0; i < products.length; i++) {
                var p = products[i];
                cache[String(p.goods_id)] = p;
            }

            // 只保留最近50个商品，防止缓存太大
            var keys = Object.keys(cache);
            if (keys.length > 50) {
                var toRemove = keys.slice(0, keys.length - 50);
                for (var j = 0; j < toRemove.length; j++) {
                    delete cache[toRemove[j]];
                }
            }

            $persistentStore.write(JSON.stringify(cache), "pdd_ai_goods_cache");
        }
    } catch(e) {
        // 静默
    }
    $done({ body: body });
}

// ============ 模式2: 检测商品详情页并分析 ============
function analyzeProduct() {
    var apiUrl = $persistentStore.read("pdd_ai_api_url") || "";
    var apiKey = $persistentStore.read("pdd_ai_api_key") || "";
    var modelName = $persistentStore.read("pdd_ai_model") || "gemini-3.8-flash-high";
    var cooldown = parseInt($persistentStore.read("pdd_ai_cooldown") || "30");

    if (!apiUrl || !apiKey) {
        $done({});
        return;
    }

    // 从 POST body 中提取参数
    var body = $request.body || '';
    
    // 检查是否是商品详情页的埋点
    if (body.indexOf('page_name=goods_detail') === -1) {
        $done({});
        return;
    }

    // 只在第一次 impr（曝光）时触发，避免重复
    if (body.indexOf('op=impr') === -1) {
        $done({});
        return;
    }

    // 提取 goods_id
    var goodsIdMatch = body.match(/refer_goods_id=(\d+)/);
    if (!goodsIdMatch) {
        $done({});
        return;
    }
    var goodsId = goodsIdMatch[1];

    // 去重 + 冷却
    var lastGoodsId = $persistentStore.read("pdd_ai_last_goods_id") || "";
    var lastTime = parseInt($persistentStore.read("pdd_ai_last_time") || "0");
    var now = new Date().getTime();
    
    if (goodsId === lastGoodsId && (now - lastTime) < cooldown * 1000) {
        $done({});
        return;
    }

    // 从缓存中查找商品
    var cache = {};
    try {
        cache = JSON.parse($persistentStore.read("pdd_ai_goods_cache") || "{}");
    } catch(e) {}

    var product = cache[goodsId];
    if (!product) {
        // 缓存中没有，可能是从搜索/其他入口进来的
        $notification.post('🛒 购物助手', '商品ID: ' + goodsId, '未从推荐流缓存到该商品信息');
        $done({});
        return;
    }

    $persistentStore.write(goodsId, "pdd_ai_last_goods_id");
    $persistentStore.write(String(now), "pdd_ai_last_time");

    // 构建 AI prompt
    var info = '商品名: ' + product.name + '\n'
        + '拼团价: ¥' + product.price + '\n'
        + '原价: ¥' + product.originalPrice + '\n';
    if (product.discount) info += '折扣: ' + product.discount + '\n';
    if (product.salesTip) info += '销量: ' + product.salesTip + '\n';
    if (product.mallName) info += '店铺: ' + product.mallName + '\n';

    var prompt = '你是一个精明的购物顾问。请分析以下拼多多商品，给出购买建议。\n\n'
        + '【商品信息】\n' + info + '\n'
        + '【要求】用简洁中文回答，不超过150字：\n'
        + '1. 💰 价格评估：合理吗？和市场价比如何？\n'
        + '2. ⚠️ 风险提醒：有没有坑？\n'
        + '3. ✅ 购买建议：一句话总结。';

    // 通知正在分析
    $notification.post('🛒 ' + product.name.substring(0, 20), '¥' + product.price + ' | 原价¥' + product.originalPrice, '正在 AI 分析...');

    // 调用 AI（放行请求后异步）
    $done({});

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
            return;
        }
        try {
            var result = JSON.parse(respData);
            if (result.choices && result.choices[0]) {
                var content = result.choices[0].message.content;
                $notification.post('🛒 ' + product.name.substring(0, 20), '¥' + product.price + ' | 原价¥' + product.originalPrice, content);
            } else if (result.error) {
                $notification.post('🛒 购物助手', '错误', result.error.message || JSON.stringify(result.error));
            }
        } catch(e) {
            $notification.post('🛒 购物助手', '解析失败', respData ? respData.substring(0, 200) : '空');
        }
    });
}

// ============ 递归查找商品 ============
function findProducts(obj, results, depth) {
    if (depth > 15 || results.length >= 20) return;
    if (!obj || typeof obj !== 'object') return;

    if (obj.goods_name && (obj.group_price !== undefined || obj.normal_price !== undefined)) {
        var groupPrice = obj.group_price || 0;
        var normalPrice = obj.normal_price || 0;

        var price = typeof groupPrice === 'number' && groupPrice > 100 ?
            (groupPrice / 100).toFixed(1) : String(groupPrice);
        var origPrice = typeof normalPrice === 'number' && normalPrice > 100 ?
            (normalPrice / 100).toFixed(1) : String(normalPrice);

        var product = {
            goods_id: obj.goods_id || '',
            name: obj.goods_name || '',
            price: price,
            originalPrice: origPrice,
            salesTip: obj.sales_tip || obj.fallback_sales_tip || '',
            mallName: obj.mall_name || '',
            discount: ''
        };

        if (normalPrice > 0 && groupPrice > 0 && normalPrice > groupPrice) {
            product.discount = Math.round((1 - groupPrice / normalPrice) * 100) + '%';
        }

        results.push(product);
        return;
    }

    if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length && results.length < 20; i++) {
            findProducts(obj[i], results, depth + 1);
        }
    } else {
        var keys = Object.keys(obj);
        for (var k = 0; k < keys.length && results.length < 20; k++) {
            findProducts(obj[keys[k]], results, depth + 1);
        }
    }
}
