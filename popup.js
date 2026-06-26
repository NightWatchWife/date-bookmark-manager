// background.js 経由で GA4 にイベントを送る簡易ヘルパー
function trackEvent(name, params = {}) {
    try {
        chrome.runtime.sendMessage({ action: 'trackEvent', name, params });
    } catch (e) {
        // 送信失敗は無視
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('saveButton');
    const status = document.getElementById('status');

    // 今日の日付（ISO形式）を表示 — 保存先を明示
    const d = new Date();
    const popupDate = document.getElementById('popupDate');
    if (popupDate) {
        popupDate.textContent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // 「このページを保存」ボタン
    saveButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab || !tab.url) {
                status.textContent = '保存できないページです';
                status.style.color = '#b91c1c';
                return;
            }

            saveButton.disabled = true;
            status.style.color = '#1a7f37';
            status.textContent = '保存中…';

            chrome.runtime.sendMessage(
                { action: 'savePageToToday', url: tab.url, title: tab.title },
                (res) => {
                    if (chrome.runtime.lastError || !res || !res.ok) {
                        status.textContent = '保存に失敗しました';
                        status.style.color = '#b91c1c';
                        saveButton.disabled = false;
                        return;
                    }
                    status.innerHTML = '<svg class="mi" viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> 今日のフォルダに保存しました';
                    // 完了の手応えを見せてから自動で閉じる
                    setTimeout(() => window.close(), 900);
                }
            );
        });
    });

    // 設定ページを開く
    document.getElementById('optionsLink').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });

    // ドネイトリンクのクリックを計測
    document.getElementById('donateLink').addEventListener('click', () => {
        trackEvent('donate_clicked', { source: 'popup' });
    });
});
