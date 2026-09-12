/*
    拼多多 AI 购物助手
    拦截商品数据，通过大模型分析商品是否值得购买

    BoxJS 订阅: https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/pdd-ai-boxjs.json

    Surge:
    [Script]
    PDD-AI = type=http-response, pattern=https:\/\/api\.pinduoduo\.com\/api\/alexa\/(cells\/hub|homepage\/hub), requires-body=1, max-size=0, timeout=60, script-path=https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/PDD-AI.js
    [MITM]
    hostname = api.pinduoduo.com

    作者: 小H
*/

// ============ BoxJS 配置 ============
var enabled = $persistentStore.read("pdd_ai_enabled") !== "false";
var apiUrl = $persistentStore.read("pdd_ai_api_url") || "";
var apiKey = $persistentStore.read("pdd_ai_api_key") || "";
var model = $persistentStore.read("pdd_ai_model") || "gemini-3.8-flash-high";
var cooldown = parseInt($persistentStore.read("pdd_ai_cooldown") || "30");
var responseBody = $response.body;

if (!enabled || !apiUrl || !apiKey) {
    $done({ body: responseBody });
} else {
    try {
        main();
    } catch (e) {
        $notification.post('🛒 购物助手', '脚本异常', String(e));
        $done({ body: responseBody });
    }
}

function main() {
    // 冷却检查
    var lastTime = parseInt($persistentStore.read("pdd_ai_last_time") || "0");
    var now = new Date().getTime();
    if ((now - lastTime) < cooldown * 1000) {
        $done({ body: responseBody });
        return;
    }

    // 解析响应
    var data;
    try {
        data = JSON.parse(responseBody);
    } catch (e) {
        $done({ body: responseBody });
        return;
    }

    // 提取商品
    var products = [];
    findProducts(data, products, 0);
    if (products.length === 0) {
        $done({ body: responseBody });
        return;
    }

    // 去重
    var lastGoodsId = $persistentStore.read("pdd_ai_last_goods_id") || "";
    var product = null;
    for (var i = 0; i < products.length; i++) {
        if (String(products[i].goods_id) !== lastGoodsId) {
            product = products[i];
            break;
        }
    }
    if (!product) {
        $done({ body: responseBody });
        return;
    }

    $persistentStore.write(String(now), "pdd_ai_last_time");
    $persistentStore.write(String(product.goods_id), "pdd_ai_last_goods_id");

    // 构建 prompt
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

    // 安全超时 - 5秒内AI没响应就先放行
    var timer = setTimeout(function() {
        $notification.post('🛒 ' + product.name.substring(0, 20), '¥' + product.price + ' | 原价¥' + product.originalPrice, 'AI 分析超时，请稍后查看');
        $done({ body: responseBody });
    }, 5000);

    // 调用 AI
    $httpClient.post({
        url: apiUrl,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
            'X-Surge-Skip-Scripting': 'true'
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300
        }),
        timeout: 50
    }, function(err, resp, respData) {
        clearTimeout(timer);
        if (err) {
            $notification.post('🛒 购物助手', 'AI 请求失败', String(err));
        } else {
            try {
                var result = JSON.parse(respData);
                if (result.choices && result.choices[0]) {
                    var content = result.choices[0].message.content;
                    $notification.post('🛒 ' + product.name.substring(0, 20), '¥' + product.price + ' | 原价¥' + product.originalPrice, content);
                } else if (result.error) {
                    $notification.post('🛒 购物助手', '错误', result.error.message || JSON.stringify(result.error));
                }
            } catch (e) {
                $notification.post('🛒 购物助手', '解析失败', respData ? respData.substring(0, 200) : '空');
            }
        }
        $done({ body: responseBody });
    });
}

// ============ 提取商品 ============
function findProducts(obj, results, depth) {
    if (depth > 15 || results.length >= 3) return;
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
        for (var i = 0; i < obj.length && results.length < 3; i++) {
            findProducts(obj[i], results, depth + 1);
        }
    } else {
        var keys = Object.keys(obj);
        for (var k = 0; k < keys.length && results.length < 3; k++) {
            findProducts(obj[keys[k]], results, depth + 1);
        }
    }
}
