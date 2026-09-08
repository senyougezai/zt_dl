(function () {
    'use strict';

    let capturedToken = null;

    // 1. 通信から Authorization Token を自動抽出
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        try {
            const [, config] = args;
            if (config && config.headers) {
                let auth = null;
                if (config.headers instanceof Headers) {
                    auth = config.headers.get('authorization') || config.headers.get('Authorization');
                } else if (typeof config.headers === 'object') {
                    auth = config.headers['authorization'] || config.headers['Authorization'];
                }
                if (auth && auth.startsWith('Bearer ')) {
                    capturedToken = auth;
                    sessionStorage.setItem('zeta_ext_token', auth);
                }
            }
        } catch (e) {}
        return originalFetch.apply(this, args);
    };

    function getToken() {
        if (capturedToken) return capturedToken;
        const saved = sessionStorage.getItem('zeta_ext_token');
        if (saved) return saved;

        for (let i = 0; i < localStorage.length; i++) {
            const val = localStorage.getItem(localStorage.key(i));
            if (typeof val === 'string' && val.includes('eyJhbGciOi')) {
                const match = val.match(/eyJhbGciOi[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
                if (match) return 'Bearer ' + match[0];
            }
        }
        return null;
    }

    function getRoomId() {
        const match = window.location.pathname.match(/\/rooms\/([a-zA-Z0-9-]+)/);
        return match ? match[1] : null;
    }

    // 2. 設定ダイアログ（モーダル）の作成
    function showModal() {
        const roomId = getRoomId();
        if (!roomId) {
            alert('⚠️ トークルームを開いた状態で実行してください。');
            return;
        }

        const token = getToken();
        if (!token) {
            alert('⚠️ 認証キーを認識中です。画面を少し上にスクロールして過去ログを一度読み込んでから再度お試しください。');
            return;
        }

        if (document.getElementById('zeta-modal-overlay')) return;

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
            padding: 24px; width: 340px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            border: 1px solid #374151;
        `;

        modal.innerHTML = `
            <h3 style="margin: 0 0 16px; font-size: 18px; text-align: center;">📥 ログ保存の設定</h3>
            <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 13px; color: #9ca3af; margin-bottom: 6px;">あなたの表示名:</label>
                <input id="zeta-input-username" type="text" value="まな" style="width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; border: 1px solid #4b5563; background: #111827; color: #fff; font-size: 14px;" />
            </div>
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-size: 13px; color: #9ca3af; margin-bottom: 6px;">取得件数 (最新N件):</label>
                <input id="zeta-input-limit" type="number" value="10000" min="10" max="10000" step="50" style="width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; border: 1px solid #4b5563; background: #111827; color: #fff; font-size: 14px;" />
                <span style="font-size: 11px; color: #6b7280; display: block; margin-top: 4px;">※ 全件保存したい場合は「10000」のままでOK</span>
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
            const userName = document.getElementById('zeta-input-username').value.trim() || 'あなた';
            const limit = parseInt(document.getElementById('zeta-input-limit').value, 10) || 10000;
            executeDownload(roomId, token, userName, limit, overlay);
        };
    }

    // 3. ダウンロード処理
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
                overlay.remove();
                return;
            }

            // 時系列（昇順）にソート
            messages.sort((a, b) => new Date(a.messageTime) - new Date(b.messageTime));

            // 指定件数に切り詰め（最新N件）
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
            alert('❌ 取得に失敗しました。少し上にスクロールして再度お試しください。');
            runBtn.innerText = 'ダウンロード開始';
            runBtn.disabled = false;
        }
    }

    // 4. 画面右下にトリガーボタンを常駐
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
