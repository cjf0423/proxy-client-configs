/*
    Sur2b BoxJS Edition
    基于 Neurogram 的 Sur2b 修改，改为通过 BoxJS 管理配置

    BoxJS 订阅地址: https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/sur2b-boxjs.json

    Surge:
    [Script]
    Sur2b = type=http-response,pattern=https:\/\/www.youtube.com\/api\/timedtext\?,requires-body=1,max-size=0,binary-body-mode=0,timeout=30,script-path=https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/Sur2b-BoxJS.js
    [MITM]
    hostname = www.youtube.com

    QuanX:
    [rewrite_local]
    https:\/\/www\.youtube\.com\/api\/timedtext\? url script-response-body https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/Sur2b-BoxJS.js
    [mitm]
    hostname = www.youtube.com

    Loon:
    [Script]
    http-response https:\/\/www\.youtube\.com\/api\/timedtext\? script-path=https://raw.githubusercontent.com/cjf0423/proxy-client-configs/main/Sur2b-BoxJS.js, requires-body=true, timeout=30, tag=Sur2b

    原作者: Neurogram (Telegram: Neurogram, GitHub: Neurogram-R)
    修改: 小H (BoxJS 适配)
*/

// ============ BoxJS 变量读取 ============
const $ = new Env("Sur2b");

const conf = {
    videoSummary: $.getdata("sur2b_video_summary") === "true",
    openAIProxyUrl: $.getdata("sur2b_openai_url") || "https://api.openai.com/v1/chat/completions",
    openAIAPIKey: $.getdata("sur2b_openai_key") || "",
    openAIModel: $.getdata("sur2b_openai_model") || "gpt-4o-mini",
    summaryPrompts: $.getdata("sur2b_summary_prompt") || "请用中文简要总结以下 YouTube 视频字幕内容，分条列出要点：\n\n{{subtitles}}",
    summaryMaxMinutes: parseInt($.getdata("sur2b_summary_max_min") || "30"),
    videoTranslation: $.getdata("sur2b_video_translation") !== "false",
    translationProvider: $.getdata("sur2b_translation_provider") || "Google",
    targetLanguage: $.getdata("sur2b_target_lang") || "zh-CN",
    subLine: parseInt($.getdata("sur2b_sub_line") || "1"),
    deepLAPIKey: $.getdata("sur2b_deepl_key") || "",
    deepLUrl: $.getdata("sur2b_deepl_url") || "https://api-free.deepl.com/v2/translate",
    cacheMaxHours: parseInt($.getdata("sur2b_cache_hours") || "24"),
};

// ============ 主逻辑 ============
const url = $request.url;
let body = $response.body;
const autoGenSub = url.includes('&kind=asr');
const videoID = url.match(/(\?|&)v=([^&]+)/)?.[2];
const sourceLang = url.match(/&lang=([^&]+)/)?.[1];

(async () => {
    try {
        const subtitleData = processTimedText(body);

        if (!subtitleData.processedText) {
            $done({});
            return;
        }

        // 翻译（修改 body，必须在 $done 前完成）
        if (conf.videoTranslation) {
            try {
                await doTranslate(subtitleData);
            } catch (e) {
                // 翻译失败，返回原始字幕，不崩
            }
        }

        // 立即返回字幕
        $done({ body });

        // 摘要在 $done 后异步跑，不影响字幕
        if (conf.videoSummary && conf.openAIAPIKey && subtitleData.maxT <= conf.summaryMaxMinutes * 60 * 1000) {
            try {
                await doSummary(subtitleData);
            } catch (e) {
                // 摘要失败静默
            }
        }

    } catch (e) {
        // 任何未捕获的错误都保证返回原始字幕
        $done({ body });
    }
})();

// ============ AI 摘要 ============
async function doSummary(subtitleData) {
    const resp = await httpPost(conf.openAIProxyUrl, {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + conf.openAIAPIKey
    }, JSON.stringify({
        model: conf.openAIModel,
        messages: [{
            role: 'user',
            content: conf.summaryPrompts.replace(/{{subtitles}}/, subtitleData.processedText)
        }]
    }));

    if (resp.error) throw new Error(resp.error.message);
    const content = resp.choices[0].message.content;
    $.msg('📺 YouTube 视频摘要', '长按查看完整内容 👇', content);
}

// ============ 字幕翻译 ============
async function doTranslate(subtitleData) {
    let patt = new RegExp(`&lang=${conf.targetLanguage}&`, 'i');
    if (conf.targetLanguage == 'zh-CN' || conf.targetLanguage == 'ZH-HANS') patt = /&lang=zh(-Hans)*&/i;
    if (conf.targetLanguage == 'zh-TW' || conf.targetLanguage == 'ZH-HANT') patt = /&lang=zh-Hant&/i;

    // 已经是目标语言，不翻译
    if (url.includes('&tlang=') || patt.test(url)) return;
    // 简繁转换
    if (/&lang=zh(-Han)*/i.test(url) && /^zh-(CN|TW|HAN)/i.test(conf.targetLanguage)) {
        await chineseTransform();
        return;
    }
    // 自动生成字幕不翻译
    if (autoGenSub) return;

    const originalSubs = [];
    const regex = /<p t="\d+" d="\d+">([^<]+)<\/p>/g;
    let match;
    while ((match = regex.exec(body)) !== null) {
        originalSubs.push(match[1]);
    }
    if (originalSubs.length === 0) return;

    // 分批翻译
    const targetSubs = [];
    const batchSize = 50;
    for (let i = 0; i < originalSubs.length; i += batchSize) {
        const batch = originalSubs.slice(i, i + batchSize);
        const translated = await translateBatch(batch);
        targetSubs.push(...translated);
    }

    // 替换字幕
    let subIndex = 0;
    body = body.replace(regex, (fullMatch) => {
        if (subIndex < targetSubs.length && subIndex < originalSubs.length) {
            const orig = originalSubs[subIndex];
            const trans = targetSubs[subIndex];
            subIndex++;

            let text;
            if (conf.subLine === 1) text = `${trans}\n${orig}`;
            else if (conf.subLine === 2) text = `${orig}\n${trans}`;
            else text = trans;

            const attr = fullMatch.match(/<p (t="\d+" d="\d+")>/);
            return `<p ${attr[1]}>${text}</p>`;
        }
        return fullMatch;
    });
}

async function translateBatch(subs) {
    if (conf.translationProvider === 'DeepL') {
        if (!conf.deepLAPIKey) throw new Error('未配置 DeepL API Key');
        const resp = await httpPost(conf.deepLUrl, {
            'Content-Type': 'application/json',
            'Authorization': 'DeepL-Auth-Key ' + conf.deepLAPIKey,
        }, JSON.stringify({ text: subs, target_lang: conf.targetLanguage }));
        if (!resp.translations) throw new Error('DeepL 翻译失败');
        return resp.translations.map(t => t.text);
    }

    // Google
    const resp = await httpPost(
        `https://translate.google.com/translate_a/single?client=it&dt=qca&dt=t&dt=rmt&dt=bd&dt=rms&dt=sos&dt=md&dt=gt&dt=ld&dt=ss&dt=ex&otf=2&dj=1&hl=en&ie=UTF-8&oe=UTF-8&sl=auto&tl=${conf.targetLanguage}`,
        { 'User-Agent': 'GoogleTranslate/6.29.59279 (iPhone; iOS 15.4; en; iPhone14,2)' },
        `q=${encodeURIComponent('<p>' + subs.join('\n<p>'))}`
    );
    if (!resp.sentences) throw new Error('Google 翻译失败');
    return resp.sentences.map(s => s.trans).join('').split('<p>')
        .filter(s => s && s.trim().length > 0)
        .map(s => s.replace(/\s*[\r\n]+\s*/g, ' ').trim());
}

async function chineseTransform() {
    let from = 'cn', to = 'tw';
    if (/^zh-(CN|HANS)/i.test(conf.targetLanguage)) [from, to] = [to, from];
    const openccJS = await httpGet('https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js');
    eval(openccJS);
    body = OpenCC.Converter({ from, to })(body);
}

// ============ 工具函数 ============
function processTimedText(xml) {
    const regex = /<p t="(\d+)"[^>]*>(.*?)<\/p>/gs;
    let match, maxT = 0;
    const results = [];
    while ((match = regex.exec(xml)) !== null) {
        const t = parseInt(match[1], 10);
        const content = match[2].trim();
        let lineText = '';
        if (content.startsWith('<s')) {
            const words = Array.from(content.matchAll(/<s[^>]*>([^<]+)<\/s>/g), m => m[1]);
            if (words.length > 0) lineText = words.join('');
        } else {
            lineText = content;
        }
        lineText = lineText.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
        if (lineText) {
            if (t > maxT) maxT = t;
            const s = Math.floor(t / 1000);
            const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
            const ts = h > 0
                ? `(${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')})`
                : `(${m}:${String(sec).padStart(2,'0')})`;
            results.push(`${ts} ${lineText}`);
        }
    }
    return { processedText: results.join('\n'), maxT };
}

function httpPost(url, headers, body) {
    return new Promise((resolve, reject) => {
        $httpClient.post({ url, headers, body }, (err, resp, data) => {
            if (err) return reject(err);
            try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
    });
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        $httpClient.get({ url }, (err, resp, data) => {
            if (err) return reject(err);
            resolve(data);
        });
    });
}

// ============ Env 兼容层 ============
function Env(name) {
    this.name = name;
    this.getdata = (key) => {
        if (typeof $persistentStore !== 'undefined') return $persistentStore.read(key);
        if (typeof $prefs !== 'undefined') return $prefs.valueForKey(key);
    };
    this.setdata = (val, key) => {
        if (typeof $persistentStore !== 'undefined') return $persistentStore.write(val, key);
        if (typeof $prefs !== 'undefined') return $prefs.setValueForKey(val, key);
    };
    this.msg = (title, subtitle, body, opts = {}) => {
        if (typeof $notification !== 'undefined') $notification.post(title, subtitle, body, opts);
        else if (typeof $notify !== 'undefined') $notify(title, subtitle, body, opts);
    };
}
