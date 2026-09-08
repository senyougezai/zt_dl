(function () {
    'use strict';

    let capturedToken = null;

    // 辅助函数：从任意 Header 格式中提取 Bearer
    function extractBearer(headers) {
        if (!headers) return null;
        try {
            if (headers instanceof Headers) {
                const h = headers.get('authorization') || headers.get('Authorization');
                if (h && h.startsWith('Bearer ')) return h;
            } else if (Array.isArray(headers)) {
                for (const [k, v] of headers) {
                    if (k.toLowerCase() === 'authorization' && typeof v === 'string' && v.startsWith('Bearer ')) return v;
                }
            } else if (typeof headers === 'object') {
                for (const k of Object.keys(headers)) {
                    if (k.toLowerCase() === 'authorization') {
                        const v = headers[k];
                        if (typeof v === 'string' && v.startsWith('Bearer ')) return v;
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function saveToken(token) {
        if (token && token.startsWith('Bearer ')) {
            capturedToken = token;
            try { sessionStorage.setItem('zeta_ext_token', token); } catch (e) {}
            // 如果弹窗已打开，实时更新状态
            updateModalTokenStatus();
        }
    }

    // 1. 拦截 fetch (兼容 Request 对象与普通参数)
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        try {
            let auth = null;
            if (args[0] instanceof Request) {
                auth = extractBearer(args[0].headers);
            }
            if (!auth && args[1] && args[1].headers) {
                auth = extractBearer(args[1].headers);
            }
            if (auth) saveToken(auth);
        } catch (e) {}
        return originalFetch.apply(this, args);
    };

    // 2. 拦截 XMLHttpRequest (兼容 Axios 等请求库)
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
        try {
            if (typeof header === 'string' && header.toLowerCase() === 'authorization') {
                if (typeof value === 'string' && value.startsWith('Bearer ')) {
                    saveToken(value);
                }
            }
        } catch (e) {}
        return originalSetRequestHeader.apply(this, arguments);
    };

    // 3. 内存与存储区扫描
    function getToken() {
        if (capturedToken) return capturedToken;
        try {
            const saved = sessionStorage.getItem('zeta_ext_token');
            if (saved) return saved;

            const scan = (storage) => {
                for (let i = 0; i < storage.length; i++) {
                    const val = storage.getItem(storage.key(i));
                    if (!val) continue;
                    const match = val.match(/Bearer\s+(eyJhbGciOi[a-zA-Z0-9_\-\.]+)/i) || 
                                  val.match(/(eyJhbGciOi[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+)/);
                    if (match) {
                        const tokenStr = match[1] || match[0];
                        return tokenStr.startsWith('Bearer ') ? tokenStr : 'Bearer ' + tokenStr;
                    }
                }
                return null;
            };

            return scan(localStorage) || scan(sessionStorage);
        } catch (e) {
            return null;
        }
    }

    function getRoomId() {
        const match = window.location.pathname.match(/\/rooms\/([a-zA-Z0-9-]+)/);
        return match ? match[1] : null;
    }

    function updateModalTokenStatus() {
        const statusEl = document.getElementById('zeta-token-status');
        const inputEl = document.getElementById('zeta-input-token');
        const token = getToken();
        if (statusEl && token) {
            statusEl.innerHTML = '<span style="color: #10b981;">✅ 認証キー取得完了</span>';
            if (inputEl && !inputEl.value) inputEl.value = token;
        }
    }

    // 4. 弹窗界面
    function showModal() {
        const roomId = getRoomId();
        if (!roomId) {
            alert('⚠️ トークルーム（会話画面）を開いた状態でクリックしてください。');
            return;
        }

        if (document.getElementById('zeta-modal-overlay')) return;

        const currentToken = getToken() || '';

        const overlay = document.createElement('div');
        overlay.id = 'zeta-modal-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.65); z-index: 1000000;
            display: flex; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #1e1e24; color: #f3f4f6; border-radius: 12px;
            padding: 24px; width: 360px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            border: 1px solid #374151;
        `;

        modal.innerHTML = `
            <h3 style="margin: 0 0 16px; font-size: 18px; text-align: center;">📥 ログ保存設定</h3>
            
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                    <label style="color: #9ca3af;">認証キー(Token):</label>
                    <span id="zeta-token-status">${currentToken ? '<span style="color: #10b981;">✅ 取得済み</span>' : '<span style="color: #f59e0b;">⏳ 画面をスクロールで自動取得</span>'}</span>
                </div>
                <input id="zeta-input-token" type="text" value="${currentToken}" placeholder="未取得の場合は画面を上にスクロールするか、直接ペースト" style="width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; border: 1px solid #4b5563; background: #111827; color: #fff; font-size: 12px;" />
            </div>

            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 13px; color: #9ca3af; margin-bottom: 6px;">あなたの表示名:</label>
                <input id="zeta-input-username" type="text" value="まな" style="width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; border: 1px solid #4b5563; background: #111827; color: #fff; font-size: 14px;" />
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display: block; font-size: 13px; color: #9ca3af; margin-bottom: 6px;">取得件数 (最新N件):</label>
                <input id="zeta-input-limit" type="number" value="10000" min="10" max="10000" step="50" style="width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; border: 1px solid #4b5563; background: #111827; color: #fff; font-size: 14px;" />
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="zeta-btn-cancel" style="padding: 8px 14px; background: transparent; color: #9ca3af; border: 1px solid #4b5563; border-radius: 6px; cursor: pointer;">キャンセル</button>
                <button id="zeta-btn-run" style="padding: 8px 16px; background: #6366f1; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">ダウンロード開始</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.getElementById('zeta-btn-cancel').onclick = () => overlay.remove();
        document.getElementById('zeta-btn-run').onclick = () => {
            const rawToken = document.getElementById('zeta-input-token').value.trim();
            const finalToken = rawToken.startsWith('Bearer ') ? rawToken : (rawToken ? 'Bearer ' + rawToken : '');
            
            if (!finalToken) {
                alert('⚠️ 認証キーが取得できていません。チャット画面を少し上にスクロールして過去ログを読み込ませるか、手動でキーを貼り付けてください。');
                return;
            }

            const userName = document.getElementById('zeta-input-username').value.trim() || 'あなた';
            const limit = parseInt(document.getElementById('zeta-input-limit').value, 10) || 10000;
            executeDownload(roomId, finalToken, userName, limit, overlay);
        };
    }

    // 5. 执行下载
    async function executeDownload(roomId, token, userName, limit, overlay) {
        const runBtn = document.getElementById('zeta-btn-run');
        runBtn.innerText = '取得中...';
        runBtn.disabled = true;

        const targetUrl = `https://api.zeta-ai.io/v1/rooms/${roomId}/messages?limit=${limit}`;

        try {
            const res = await fetch(targetUrl, {
                method: 'GET',
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            });

            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

            const data = await res.json();
            let messages = data.messages || data || [];
            if (!Array.isArray(messages) && data.data) messages = data.data.messages || [];

            if (messages.length === 0) {
                alert('⚠️ メッセージを取得できませんでした。');
                runBtn.innerText = 'ダウンロード開始';
                runBtn.disabled = false;
                return;
            }

            messages.sort((a, b) => new Date(a.messageTime) - new Date(b.messageTime));

            if (messages.length > limit) {
                messages = messages.slice(-limit);
            }

            let finalOutput = `=== Zeta トーク記録 (${new Date().toLocaleString()}) ===\n`;
            finalOutput += `ユーザー名設定: ${userName} | 取得件数: ${messages.length}件\n\n`;

            messages.forEach(msg => {
                const isUser = msg.sender && msg.sender.type === 'USER';
                const time = msg.messageTime ? msg.messageTime.substring(0, 19).replace('T', ' ') : '';

                if (Array.isArray(msg.contents)) {
                    msg.contents.forEach(item => {
                        if (item && item.text && item.text.trim()) {
                            const roleName = isUser ? userName : (item.speakerName || "AI");
                            finalOutput += `[${time}] ${roleName}:\n${item.text.trim()}\n\n-------------------\n\n`;
                        }
                    });
                }
            });

            const blob = new Blob([finalOutput], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `Zeta_${userName}_${roomId.substring(0, 6)}.txt`;
            a.click();

            overlay.remove();
        } catch (err) {
            console.error(err);
            alert('❌ 取得に失敗しました(401等の可能性)。キーを確認してください。');
            runBtn.innerText = 'ダウンロード開始';
            runBtn.disabled = false;
        }
    }

    // 6. 右下常驻按钮
    function injectFloatingButton() {
        if (document.getElementById('zeta-trigger-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'zeta-trigger-btn';
        btn.innerText = '📥 ログ保存';
        btn.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 999999;
            padding: 10px 18px; background: #6366f1; color: #fff;
            font-size: 14px; font-weight: bold; border: none; border-radius: 50px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); cursor: pointer;
            transition: all 0.2s ease;
        `;
        btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
        btn.onmouseout = () => btn.style.transform = 'scale(1.0)';
        btn.onclick = showModal;

        document.body.appendChild(btn);
    }

    window.addEventListener('DOMContentLoaded', injectFloatingButton);
    setInterval(injectFloatingButton, 2000);
})();
