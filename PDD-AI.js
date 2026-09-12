/*
    拼多多 AI 购物助手 v3
    通过埋点请求精准识别你在看的商品，调 AI 分析

    BoxJS 订阅: https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/pdd-ai-boxjs.json

    Surge:
    [Script]
    PDD-AI = type=http-request, pattern=https:\/\/th-b\.pinduoduo\.com\/t\.gif, requires-body=1, max-size=0, timeout=60, script-path=https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/PDD-AI.js
    [MITM]
    hostname = th-b.pinduoduo.com

    作者: 小H
*/

var enabled = $persistentStore.read("pdd_ai_enabled") !== "false";
var apiUrl = $persistentStore.read("pdd_ai_api_url") || "";
var apiKey = $persistentStore.read("pdd_ai_api_key") || "";
var modelName = $persistentStore.read("pdd_ai_model") || "gemini-3.8-flash-high";
var cooldown = parseInt($persistentStore.read("pdd_ai_cooldown") || "30");

if (!enabled || !apiUrl || !apiKey) {
    $done({});
} else {
    try {
        main();
    } catch (e) {
        $notification.post('🛒 购物助手', '异常', String(e));
        $done({});
    }
}

function main() {
    var body = $request.body || '';

    // 只在进入商品详情页时触发
    if (body.indexOf('page_name=goods_detail') === -1) {
        $done({});
        return;
    }

    // 只在第一次曝光时触发
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

    $persistentStore.write(goodsId, "pdd_ai_last_goods_id");
    $persistentStore.write(String(now), "pdd_ai_last_time");

    // 从埋点 body 里提取能拿到的信息
    var priceMatch = body.match(/goods_price=([0-9.]+)/);
    var salesMatch = body.match(/sales_tip=([^&]+)/);

    var price = priceMatch ? priceMatch[1] : '';
    var sales = salesMatch ? decodeURIComponent(salesMatch[1]) : '';

    var pddUrl = 'https://mobile.yangkeduo.com/goods.html?goods_id=' + goodsId;

    // 先通知
    var titleStr = price ? '¥' + price : 'ID: ' + goodsId;
    $notification.post('🛒 购物助手', titleStr, '正在分析...');

    // 获取商品页面标题
    $httpClient.get({
        url: pddUrl,
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'X-Surge-Skip-Scripting': 'true'
        },
        timeout: 8
    }, function(err, resp, htmlData) {
        var goodsName = '';
        if (!err && htmlData) {
            // 从 HTML 提取商品名
            var titleMatch = htmlData.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) {
                goodsName = titleMatch[1].replace(/\s*-\s*拼多多.*$/, '').trim();
            }
            if (!goodsName) {
                var ogMatch = htmlData.match(/property="og:title"\s+content="([^"]+)"/);
                if (ogMatch) goodsName = ogMatch[1].trim();
            }
        }

        // 构建商品信息
        var info = '';
        if (goodsName) info += '商品名: ' + goodsName + '\n';
        if (price) info += '价格: ¥' + price + '\n';
        if (sales) info += '销量: ' + sales + '\n';
        info += '商品链接: ' + pddUrl + '\n';

        if (!info || (!goodsName && !price)) {
            info = '拼多多商品ID: ' + goodsId + '\n商品链接: ' + pddUrl + '\n';
        }

        var prompt = '你是一个精明的购物顾问。请分析以下拼多多商品，给出购买建议。\n\n'
            + '【商品信息】\n' + info + '\n'
            + '【要求】用简洁中文回答，不超过150字：\n'
            + '1. 💰 价格评估：合理吗？和市场价比如何？\n'
            + '2. ⚠️ 风险提醒：有没有坑？\n'
            + '3. ✅ 购买建议：一句话总结。';

        // 更新通知标题
        var displayName = goodsName ? goodsName.substring(0, 20) : (price ? '¥' + price : 'ID: ' + goodsId);
        var displaySub = '';
        if (price && goodsName) displaySub = '¥' + price;
        if (sales) displaySub += (displaySub ? ' | ' : '') + sales;

        // 调 AI
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
        }, function(err2, resp2, respData) {
            if (err2) {
                $notification.post('🛒 购物助手', 'AI 请求失败', String(err2));
                $done({});
                return;
            }
            try {
                var result = JSON.parse(respData);
                if (result.choices && result.choices[0]) {
                    var content = result.choices[0].message.content;
                    $notification.post('🛒 ' + displayName, displaySub || '拼多多', content);
                } else if (result.error) {
                    $notification.post('🛒 购物助手', '错误', result.error.message || JSON.stringify(result.error));
                }
            } catch(e) {
                $notification.post('🛒 购物助手', '解析失败', respData ? respData.substring(0, 200) : '空');
            }
            $done({});
        });
    });
}
