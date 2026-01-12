

// content/video_extractor.js

console.log('[Gemini Video] Extractor loaded');

// Prevent multiple listeners
if (!window.hasGeminiVideoListener) {
    window.hasGeminiVideoListener = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'EXTRACT_VIDEO_SUBTITLES') {
            extractSubtitles()
                .then(data => sendResponse({ success: true, data }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true; // Async response
        }
    });
}

async function extractSubtitles() {
    const url = window.location.href;
    if (url.includes('youtube.com/watch')) {
        // Special Handling for YouTube:
        // We do NOT extract subtitles here anymore.
        // Instead, we return a special signal that tells the VideoManager 
        // to use the "Gemini YouTube Extension" capability (Prompt Engineering)
        // rather than sending raw subtitle text.
        return {
            text: null, // No text content
            title: document.title.replace(' - YouTube', ''),
            platform: 'YouTube',
            useExtension: true, // Flag to trigger Extension flow
            url: url
        };
    } else if (url.includes('bilibili.com/video')) {
        return await extractBilibili();
    } else {
        throw new Error('当前页面不支持视频总结，仅支持 Bilibili 和 YouTube。');
    }
}

// --- Helper: Proxy Fetch for CORS ---
async function proxyFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'PROXY_FETCH', url, options }, response => {
            if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
            }
            if (response && response.success) {
                resolve({
                    ok: true,
                    json: async () => response.data,
                    text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
                });
            } else {
                reject(new Error(response?.error || 'Request failed'));
            }
        });
    });
}

// --- YouTube Extraction ---

async function extractYouTube() {
    // 1. Try to get player response from Main World variable
    let playerResponse = await getYouTubePlayerResponse();
    
    if (!playerResponse) {
        // Fallback: Try to fetch the page HTML and parse it (via Proxy to avoid CORS if needed, but usually same-origin is blocked)
        // Actually, we are in content script, so we can access DOM.
        // But the ytInitialPlayerResponse is in a script tag.
        throw new Error('无法获取 YouTube 视频信息');
    }

    // 2. Extract caption tracks
    const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!captions || captions.length === 0) {
        throw new Error('该视频没有可用字幕 (CC)');
    }

    // 3. Select best track (Priority: Selected Language > English > Auto)
    // For now, just pick the first one or try to match 'zh' if possible, but user might want original.
    // Let's pick the first one for simplicity, or look for 'baseUrl'.
    
    // Sort to prefer current UI language or English, but first one is usually default.
    console.log('[YouTube] Available caption tracks:', captions);
    
    // Priority: zh-CN -> zh-Hans -> zh -> en -> first available
    let track = captions.find(c => c.languageCode === 'zh-CN') || 
                captions.find(c => c.languageCode === 'zh-Hans') ||
                captions.find(c => c.languageCode === 'zh') ||
                captions.find(c => c.languageCode === 'en') ||
                captions[0];
                
    console.log('[YouTube] Selected track:', track);
    
    const trackUrl = track.baseUrl;
    
    if (!trackUrl) {
        throw new Error('无效的字幕地址');
    }
    
    // 4. Fetch XML/JSON transcript (Use Proxy for CORS)
    // NOTE: YouTube caption tracks usually require credentials or valid session tokens
    // if the video is restricted. However, simple public videos might work without.
    // Let's use proxyFetch but be careful about headers.
    
    console.log('[YouTube] Fetching subtitle track:', trackUrl);
    
    // For YouTube, simple fetch might fail if it requires cookies that are not passed correctly
    // or if the proxyFetch doesn't handle the response text format well (it tries to JSON parse first).
    // Our proxyFetch implementation tries response.json() first then response.text().
    // YouTube captions are XML, so response.json() will fail, falling back to text(), which is CORRECT.
    
    const response = await proxyFetch(trackUrl);
    
    // proxyFetch returns an object with .text() method
    const text = await response.text();
    console.log('[YouTube] Subtitle track received, length:', text.length);
    
    // 5. Parse XML to Text
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    const texts = xmlDoc.getElementsByTagName('text');
    
    let fullText = [];
    for (let i = 0; i < texts.length; i++) {
        fullText.push(texts[i].textContent);
    }
    
    // Clean text
    let cleanedText = fullText.join(' ')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
    if (!cleanedText || cleanedText.length === 0) {
        throw new Error('字幕内容为空，可能是解析失败');
    }


    return {
        text: cleanedText,
        title: document.title.replace(' - YouTube', ''),
        platform: 'YouTube'
    };
}

async function getYouTubePlayerResponse() {
    // Strategy 1: Try to read from Main World (Page Context) via a script injection
    // This is the most reliable way because the data is already in memory.
    try {
        console.log('[YouTube] Attempting to read ytInitialPlayerResponse from page context...');
        
        // We inject a small script to extract the variable from the page's window object
        // and post it back to us via window.postMessage
        const result = await new Promise((resolve) => {
            const scriptId = 'gemini-yt-extractor-' + Date.now();
            
            const script = document.createElement('script');
            script.id = scriptId;
            script.textContent = `
                (function() {
                    try {
                        const data = window.ytInitialPlayerResponse;
                        window.postMessage({ 
                            type: '${scriptId}', 
                            success: true, 
                            data: data 
                        }, '*');
                    } catch(e) {
                        window.postMessage({ 
                            type: '${scriptId}', 
                            success: false 
                        }, '*');
                    }
                })();
            `;
            
            const listener = (event) => {
                if (event.source === window && event.data && event.data.type === scriptId) {
                    window.removeEventListener('message', listener);
                    document.getElementById(scriptId)?.remove();
                    resolve(event.data.success ? event.data.data : null);
                }
            };
            
            window.addEventListener('message', listener);
            (document.head || document.documentElement).appendChild(script);
            
            // Timeout safety
            setTimeout(() => {
                window.removeEventListener('message', listener);
                document.getElementById(scriptId)?.remove();
                resolve(null);
            }, 1000);
        });
        
        if (result && result.captions) {
             console.log('[YouTube] Successfully extracted player response from page context');
             return result;
        } else {
             console.log('[YouTube] Page context extraction failed or no captions found');
        }
    } catch(e) {
        console.warn('[YouTube] Context extraction error:', e);
    }

    // Strategy 2: Fetch Page Source (Fallback)
    // Only used if Strategy 1 fails.
    try {
        console.log('[YouTube] Fallback: Fetching page source...');
        
        // Use proxyFetch to get the page content
        const response = await proxyFetch(window.location.href);
        const html = await response.text();
        
        console.log('[YouTube] Page source fetched, length:', html.length);
        
        // ... (rest of the parsing logic) ...
        const markers = [
            'var ytInitialPlayerResponse = ',
            'ytInitialPlayerResponse = ',
            'var ytInitialPlayerResponse=',
            'ytInitialPlayerResponse='
        ];

        for (const startMarker of markers) {
            const startIdx = html.indexOf(startMarker);

            if (startIdx !== -1) {
                console.log(`[YouTube] Found marker: "${startMarker}" at index ${startIdx}`);
                const jsonStart = startIdx + startMarker.length;
                let braceCount = 0;
                let inString = false;
                let escapeNext = false;
                let jsonEnd = -1;

                for (let i = jsonStart; i < html.length; i++) {
                    const char = html[i];

                    if (escapeNext) {
                        escapeNext = false;
                        continue;
                    }

                    if (char === '\\') {
                        escapeNext = true;
                        continue;
                    }

                    if (char === '"') {
                        inString = !inString;
                        continue;
                    }

                    if (!inString) {
                        if (char === '{') braceCount++;
                        else if (char === '}') {
                            braceCount--;
                            if (braceCount === 0) {
                                jsonEnd = i + 1;
                                break;
                            }
                        }
                    }
                }

                if (jsonEnd > jsonStart) {
                    try {
                        const jsonStr = html.substring(jsonStart, jsonEnd);
                        console.log('[YouTube] Extracted JSON length:', jsonStr.length);
                        const data = JSON.parse(jsonStr);
                        console.log('[YouTube] Successfully parsed player response from HTML');
                        return data;
                    } catch (parseError) {
                        console.error(`Failed to parse JSON from marker "${startMarker}":`, parseError);
                        continue; // Try next marker
                    }
                }
            }
        }
        
        console.warn('[YouTube] No player response marker found in HTML');
    } catch (e) {
        console.error('Failed to fetch/parse page for player response', e);
    }

    return null;
}

// --- Bilibili Extraction ---

async function extractBilibili() {
    // 1. Get BVID/CID
    // Regex URL
    const bvidMatch = window.location.href.match(/video\/(BV[a-zA-Z0-9]+)/);
    const bvid = bvidMatch ? bvidMatch[1] : null;
    
    if (!bvid) throw new Error('未找到 BVID');
    
    // Common options for Bilibili API requests (Credential is key!)
    const fetchOptions = {
        credentials: 'include', // Send cookies (SESSDATA)
        headers: {
            'Referer': window.location.href,
            'User-Agent': navigator.userAgent
        }
    };
    
    // Get CID from API
    // Need to handle multi-page (p=X)
    const pMatch = window.location.href.match(/[?&]p=(\d+)/);
    const pageNumber = pMatch ? parseInt(pMatch[1], 10) : 1;
    
    // Use `x/player/pagelist` instead of `x/web-interface/view` for CID fetching
    // `web-interface/view` returns the main CID, but for multi-page videos, pagelist is more reliable for specific pages
    // However, `view` also contains `pages` array. Let's stick to `view` but add detailed logging.
    
    const infoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    console.log('[Bilibili] Fetching video info for CID:', infoUrl);
    
    const infoResp = await proxyFetch(infoUrl, fetchOptions);
    const infoData = await infoResp.json();
    
    if (infoData.code !== 0) throw new Error('B站 API 请求失败: ' + infoData.message);
    
    let cid;
    if (infoData.data.pages && infoData.data.pages.length >= pageNumber) {
        // Log the page selection logic
        console.log(`[Bilibili] Multi-page video detected. Total pages: ${infoData.data.pages.length}, Requesting page: ${pageNumber}`);
        const pageData = infoData.data.pages[pageNumber - 1];
        cid = pageData.cid;
        console.log(`[Bilibili] Selected CID: ${cid} from page ${pageData.page} (Part: ${pageData.part})`);
    } else {
        cid = infoData.data.cid;
        console.log(`[Bilibili] Single-page video. Selected CID: ${cid}`);
    }
    
    if (!cid) {
        throw new Error('无法获取视频 CID');
    }
    
    // Double check with window.__INITIAL_STATE__ if available (as a sanity check)
    // Sometimes API returns different CID from what's playing if the video was updated
    try {
         // This runs in content script, but window object is isolated. 
         // We can't easily access Main World variables without script injection.
         // But we can check if the current URL has a 'cid' parameter (rare but possible)
    } catch(e) {}
    
    // 2. Get Subtitle List
    const subUrl = `https://api.bilibili.com/x/player/v2?cid=${cid}&bvid=${bvid}`;
    console.log('[Bilibili] Fetching subtitles list:', subUrl);
    
    const subResp = await proxyFetch(subUrl, fetchOptions);
    const subData = await subResp.json();
    console.log('[Bilibili] Subtitles list response:', subData);
    
    const subtitles = subData.data?.subtitle?.subtitles;
    
    if (!subtitles || subtitles.length === 0) {
        console.warn('[Bilibili] No subtitles found in response');
        throw new Error('该视频没有 CC 字幕');
    }
    
    console.log('[Bilibili] Available subtitles:', subtitles);
    
    // 3. Fetch Subtitle Content (Prioritize Chinese)
    // Find first zh-CN, zh-Hans, ai-zh, or just zh
    let targetSub = subtitles.find(s => ['zh-CN', 'zh-Hans', 'ai-zh', 'zh'].includes(s.lan));
    if (!targetSub) {
        // Fallback to first available
        console.log('[Bilibili] No Chinese subtitle found, falling back to first available:', subtitles[0]);
        targetSub = subtitles[0];
    } else {
        console.log('[Bilibili] Selected Chinese subtitle:', targetSub);
    }
    
    // Check if the subtitle is potentially irrelevant (e.g., from a different video)
    // This is a heuristic check. Bilibili sometimes returns a subtitle list that belongs to a different video
    // if the current video has no subtitles but is part of a list or recommendation flow.
    // However, the API returns subtitles based on CID, which should be unique to the video part.
    // A more likely case for "wrong content" is that the API returns a subtitle object, but it's empty or garbage.
    
    // Special Check: Verify if the subtitle URL looks valid
    if (!targetSub.subtitle_url) {
         throw new Error('获取到的字幕对象缺少 URL');
    }

    const subContentUrl = targetSub.subtitle_url;
    // Bilibili subtitle URL usually starts with //, need https:
    const finalSubUrl = subContentUrl.startsWith('//') ? 'https:' + subContentUrl : subContentUrl;
    
    console.log('[Bilibili] Fetching subtitle content:', finalSubUrl);
    const contentResp = await proxyFetch(finalSubUrl, fetchOptions);
    const contentData = await contentResp.json();
    console.log('[Bilibili] Subtitle content received, body length:', contentData.body?.length);
    
    // 4. Parse content
    // contentData.body is array of {from, to, content}
    const fullText = contentData.body.map(item => item.content).join('\n').trim();

    // --- Strict Content Validation ---
    // Check if the content is too short or looks like an error message/ad
    if (fullText.length < 50) {
         console.warn('[Bilibili] Subtitle content is too short, might be invalid:', fullText);
         // Optionally throw error to trigger fallback or UI warning
         // throw new Error('字幕内容过短，可能无效');
    }

    // Check for obvious mismatch indicators (heuristic)
    // e.g., if title says "Google" but subtitle says "UNOVE广告" (like in the user log)
    // But this is hard to generalize. 
    // The user's log shows: "本节目包含UNOVE广告... 班长先进吧..." 
    // This looks like a subtitle for a completely different video (maybe a variety show?).
    
    // KEY FIX: Verify if the subtitle actually matches the current video's CID? 
    // The API `x/player/v2` returns subtitles FOR the requested CID. 
    // If the CID is correct, the subtitles *should* be correct.
    // The issue might be that we got the WRONG CID.
    
    if (!fullText || fullText.length === 0) {
        throw new Error('字幕内容为空，可能是解析失败');
    }

    return {
        text: fullText,
        title: infoData.data.title,
        platform: 'Bilibili'
    };
}
