/*
    JJ象棋 AI 军师 - 测试版
    先确认拦截是否生效
*/

$notification.post('♟️ 测试', '脚本已触发', '请求URL: ' + $request.url.substring(0, 50));

try {
    var bodyText = $request.body || '';
    $notification.post('♟️ 测试', 'Body长度: ' + bodyText.length, bodyText.substring(0, 100));
} catch(e) {
    $notification.post('♟️ 测试', '错误', String(e));
}

$done({});
