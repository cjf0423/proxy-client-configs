/*
    JJ象棋 AI 分析助手
    拦截棋局数据，通过大模型分析最佳走法，Surge 通知提示

    BoxJS 订阅: https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/jjchess-boxjs.json

    Surge:
    [Script]
    JJChessAI = type=http-request, pattern=https:\/\/arena\.srv\.jj\.cn\/api\/v2\/chess\/check_state, requires-body=1, max-size=0, timeout=60, script-path=https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/JJChess-AI.js
    [MITM]
    hostname = arena.srv.jj.cn

    原作者: 小H
*/

// ============ BoxJS 配置 ============
const enabled = $persistentStore.read("jjchess_enabled") !== "false";
const apiUrl = $persistentStore.read("jjchess_api_url") || "";
const apiKey = $persistentStore.read("jjchess_api_key") || "";
const model = $persistentStore.read("jjchess_model") || "gemini-3.8-flash-high";
const mySide = $persistentStore.read("jjchess_my_side") || "both";

if (!enabled) {
    $done({});
} else if (!apiUrl || !apiKey) {
    $notification.post('♟️ 象棋军师', '配置缺失', '请在 BoxJS 中配置 API 地址和 Key');
    $done({});
} else {
    try {
        main();
    } catch (e) {
        $notification.post('♟️ 象棋军师', '脚本异常', String(e));
        $done({});
    }
}

function main() {
    var bodyText = $request.body;

    if (!bodyText) {
        $notification.post('♟️ 调试', '', '请求 body 为空');
        $done({});
        return;
    }

    var body;
    try {
        body = JSON.parse(bodyText);
    } catch (e) {
        $notification.post('♟️ 调试', '', 'body 解析失败: ' + bodyText.substring(0, 100));
        $done({});
        return;
    }

    var order = body.order;

    if (!order || order.indexOf('position fen ') !== 0) {
        $done({});
        return;
    }

    // 去重
    var lastOrder = $persistentStore.read("jjchess_last_order");
    if (order === lastOrder) {
        $done({});
        return;
    }
    $persistentStore.write(order, "jjchess_last_order");

    // 解析 FEN
    var afterFen = order.substring(13);
    var movesMatch = afterFen.match(/^(.+?)\s+moves\s+(.+)$/);
    var baseFen, movesStr;
    if (movesMatch) {
        baseFen = movesMatch[1];
        movesStr = movesMatch[2];
    } else {
        baseFen = afterFen;
        movesStr = '';
    }

    var currentFen = movesStr ? applyMoves(baseFen, movesStr) : baseFen;
    var turn = currentFen.split(' ')[1];

    if (mySide === "red" && turn !== "w") { $done({}); return; }
    if (mySide === "black" && turn !== "b") { $done({}); return; }

    var boardStr = buildBoard(currentFen.split(' ')[0]);
    var turnStr = turn === 'w' ? '红方' : '黑方';

    // 先通知：已捕获棋局
    $notification.post('♟️ 象棋军师', turnStr + '走棋 - 分析中...', 'FEN: ' + currentFen.substring(0, 50));

    var prompt = '你是中国象棋特级大师。请分析以下棋局，给出当前最佳走法。\n\n'
        + '【当前棋盘】（上方为黑方，下方为红方）\n'
        + '黑 ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨\n'
        + boardStr
        + '红 九 八 七 六 五 四 三 二 一\n\n'
        + '当前FEN: ' + currentFen + '\n'
        + '轮到: ' + turnStr + '走棋\n\n'
        + '棋子说明: K帅A仕B相R车N马C炮P兵=红方(大写), k将a士b象r車n馬c砲p卒=黑方(小写)\n\n'
        + '【要求】\n'
        + '1. 给出最佳走法，用标准中文记谱法（如"马二进三"、"炮八平五"）\n'
        + '2. 一句话说明理由\n'
        + '3. 如有余力，给出对手可能的应对\n'
        + '格式:\n最佳: 马二进三（跳马出击，威胁中路）';

    // 发起 AI 请求，在回调里 $done
    $httpClient.post({
        url: apiUrl,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        }),
        timeout: 55
    }, function(err, resp, data) {
        if (err) {
            $notification.post('♟️ 象棋军师', 'AI 请求失败', String(err));
            $done({});
            return;
        }
        try {
            var result = JSON.parse(data);
            if (result.choices && result.choices[0]) {
                var content = result.choices[0].message.content;
                $notification.post('♟️ 象棋军师', turnStr + '走棋', content);
            } else if (result.error) {
                $notification.post('♟️ 象棋军师', 'AI 返回错误', result.error.message || JSON.stringify(result.error));
            } else {
                $notification.post('♟️ 象棋军师', '未知响应', data.substring(0, 200));
            }
        } catch (e) {
            $notification.post('♟️ 象棋军师', '解析失败', data ? data.substring(0, 200) : '空响应');
        }
        $done({});
    });
}

// ============ 应用走法到FEN ============
function applyMoves(fen, movesStr) {
    var parts = fen.split(' ');
    var rows = parts[0].split('/');
    var board = [];

    for (var i = 0; i < rows.length; i++) {
        var row = [];
        for (var j = 0; j < rows[i].length; j++) {
            var ch = rows[i][j];
            if (ch >= '1' && ch <= '9') {
                for (var k = 0; k < parseInt(ch); k++) row.push('.');
            } else {
                row.push(ch);
            }
        }
        board.push(row);
    }

    var moves = movesStr.trim().split(/\s+/);
    var turn = parts[1];

    for (var m = 0; m < moves.length; m++) {
        var move = moves[m];
        var fromCol = move.charCodeAt(0) - 97;
        var fromRow = 9 - parseInt(move[1]);
        var toCol = move.charCodeAt(2) - 97;
        var toRow = 9 - parseInt(move[3]);

        board[toRow][toCol] = board[fromRow][fromCol];
        board[fromRow][fromCol] = '.';
        turn = (turn === 'w') ? 'b' : 'w';
    }

    var fenRows = [];
    for (var r = 0; r < board.length; r++) {
        var fenRow = '';
        var empty = 0;
        for (var c = 0; c < board[r].length; c++) {
            if (board[r][c] === '.') {
                empty++;
            } else {
                if (empty > 0) { fenRow += empty; empty = 0; }
                fenRow += board[r][c];
            }
        }
        if (empty > 0) fenRow += empty;
        fenRows.push(fenRow);
    }

    return fenRows.join('/') + ' ' + turn + ' - - 0 1';
}

// ============ FEN → 文字棋盘 ============
function buildBoard(piecePlacement) {
    var pieceMap = {
        'K': '帅', 'A': '仕', 'B': '相', 'R': '车', 'N': '马', 'C': '炮', 'P': '兵',
        'k': '将', 'a': '士', 'b': '象', 'r': '車', 'n': '馬', 'c': '砲', 'p': '卒'
    };

    var rows = piecePlacement.split('/');
    var board = '';

    for (var i = 0; i < rows.length; i++) {
        var line = '';
        for (var j = 0; j < rows[i].length; j++) {
            var ch = rows[i][j];
            if (ch >= '1' && ch <= '9') {
                for (var k = 0; k < parseInt(ch); k++) {
                    line += (line ? ' ' : '') + '・';
                }
            } else {
                line += (line ? ' ' : '') + (pieceMap[ch] || ch);
            }
        }
        board += '   ' + line + '\n';
        if (i === 4) {
            board += '   ＝＝＝＝楚河汉界＝＝＝＝\n';
        }
    }

    return board;
}
