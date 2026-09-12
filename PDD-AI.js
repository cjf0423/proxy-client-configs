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
const enabled = $persistentStore.read("pdd_ai_enabled") !== "false";
const apiUrl = $persistentStore.read("pdd_ai_api_url") || "";
const apiKey = $persistentStore.read("pdd_ai_api_key") || "";
const model = $persistentStore.read("pdd_ai_model") || "gemini-3.8-flash-high";
const cooldown = parseInt($persistentStore.read("pdd_ai_cooldown") || "30");

// 先放行响应，不阻塞 App
var responseBody = $response.body;
$done({ body: responseBody });

if (!enabled || !apiUrl || !apiKey) {
    // 未配置则静默
} else {
    try {
        main();
    } catch (e) {
        $notification.post('🛒 购物助手', '脚本异常', String(e));
    }
}

function main() {
    // 冷却检查
    var lastTime = parseInt($persistentStore.read("pdd_ai_last_time") || "0");
    var now = new Date().getTime();
    if ((now - lastTime) < cooldown * 1000) return;

    // 解析响应
    var data;
    try {
        data = JSON.parse(responseBody);
    } catch (e) {
        return; // 非 JSON，跳过
    }

    // 从响应中提取商品列表
    var products = extractProducts(data);
    if (products.length === 0) return;

    // 去重：跳过已分析的商品
    var lastGoodsId = $persistentStore.read("pdd_ai_last_goods_id") || "";
    var newProducts = products.filter(function(p) {
        return String(p.goods_id) !== lastGoodsId;
    });
    if (newProducts.length === 0) return;

    // 取第一个新商品分析
    var product = newProducts[0];
    $persistentStore.write(String(now), "pdd_ai_last_time");
    $persistentStore.write(String(product.goods_id), "pdd_ai_last_goods_id");

    // 通知：正在分析
    $notification.post('🛒 购物助手', product.name, '正在 AI 分析中...');

    // 构建 AI prompt
    var prompt = buildPrompt(product);

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
            max_tokens: 400
        }),
        timeout: 55
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
        } catch (e) {
            $notification.post('🛒 购物助手', '解析失败', respData ? respData.substring(0, 200) : '空');
        }
    });
}

// ============ 提取商品数据 ============
function extractProducts(data) {
    var products = [];
    var jsonStr = JSON.stringify(data);

    // 递归查找所有包含 goods_name 的对象
    findProducts(data, products, 0);

    return products;
}

function findProducts(obj, results, depth) {
    if (depth > 15 || results.length >= 5) return;
    if (!obj || typeof obj !== 'object') return;

    // 检查当前对象是否是商品
    if (obj.goods_name && (obj.group_price !== undefined || obj.normal_price !== undefined)) {
        var groupPrice = obj.group_price || obj.display_price || 0;
        var normalPrice = obj.normal_price || 0;

        // 价格可能是分为单位（整数）或元（小数）
        var price = typeof groupPrice === 'number' && groupPrice > 100 ?
            (groupPrice / 100).toFixed(1) : String(groupPrice);
        var origPrice = typeof normalPrice === 'number' && normalPrice > 100 ?
            (normalPrice / 100).toFixed(1) : String(normalPrice);

        var product = {
            goods_id: obj.goods_id || '',
            name: obj.goods_name || '',
            price: price,
            originalPrice: origPrice,
            salesTip: '',
            mallName: '',
            discount: ''
        };

        // 尝试提取更多字段
        if (obj.sales_tip) product.salesTip = obj.sales_tip;
        if (obj.fallback_sales_tip) product.salesTip = product.salesTip || obj.fallback_sales_tip;
        if (obj.mall_name) product.mallName = obj.mall_name;

        // 计算折扣
        if (normalPrice > 0 && groupPrice > 0 && normalPrice > groupPrice) {
            product.discount = Math.round((1 - groupPrice / normalPrice) * 100) + '%';
        }

        results.push(product);
        return;
    }

    // 递归搜索
    if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length && results.length < 5; i++) {
            findProducts(obj[i], results, depth + 1);
        }
    } else {
        var keys = Object.keys(obj);
        for (var k = 0; k < keys.length && results.length < 5; k++) {
            findProducts(obj[keys[k]], results, depth + 1);
        }
    }
}

// ============ 构建 AI 分析提示 ============
function buildPrompt(product) {
    var info = '商品名: ' + product.name + '\n'
        + '拼团价: ¥' + product.price + '\n'
        + '原价: ¥' + product.originalPrice + '\n';

    if (product.discount) info += '折扣: ' + product.discount + '\n';
    if (product.salesTip) info += '销量: ' + product.salesTip + '\n';
    if (product.mallName) info += '店铺: ' + product.mallName + '\n';

    return '你是一个精明的购物顾问。请分析以下拼多多商品，给出购买建议。\n\n'
        + '【商品信息】\n' + info + '\n'
        + '【分析要求】用简洁的中文回答，总共不超过150字：\n'
        + '1. 💰 价格评估：这个价格合理吗？和市场价比如何？\n'
        + '2. ⚠️ 风险提醒：有没有需要注意的坑（假货/临期/虚标等）？\n'
        + '3. ✅ 购买建议：值不值得买？一句话总结。\n'
        + '直接给结论，不要废话。';
}
