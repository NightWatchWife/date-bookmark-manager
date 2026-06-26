// background.js 経由で GA4 にイベントを送る簡易ヘルパー
function trackEvent(name, params = {}) {
    try {
        chrome.runtime.sendMessage({ action: 'trackEvent', name, params });
    } catch (e) {
        // 送信失敗は無視（計測は best-effort）
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 設定画面が開かれたことを計測
    trackEvent('options_opened');

    // 既存の設定を読み込んでフォームに反映
    chrome.storage.local.get({
        contextMenuLanguage: 'ja',
        dateFormat: 'yyyy-MM-dd',
        alwaysGroupCurrentMonth: false,
        analyticsEnabled: true
    }, (items) => {
        document.getElementById('language').value = items.contextMenuLanguage;
        document.getElementById('dateFormat').value = items.dateFormat;
        document.getElementById('alwaysGroupCurrentMonth').checked = items.alwaysGroupCurrentMonth;
        document.getElementById('analyticsEnabled').checked = items.analyticsEnabled;
    });

    // ドネイトリンクのクリックを計測
    document.getElementById('donateLink').addEventListener('click', () => {
        trackEvent('donate_clicked');
    });

    // 保存ボタンのクリックイベント
    document.getElementById('saveButton').addEventListener('click', () => {
        const language = document.getElementById('language').value;
        const dateFormat = document.getElementById('dateFormat').value;
        const alwaysGroupCurrentMonth = document.getElementById('alwaysGroupCurrentMonth').checked;
        const analyticsEnabled = document.getElementById('analyticsEnabled').checked;

        // どの設定が選ばれたかを計測（オプトアウト時はこの送信が最後の1件）
        trackEvent('setting_changed', {
            date_format: dateFormat,
            language: language,
            group_month: String(alwaysGroupCurrentMonth),
            analytics: String(analyticsEnabled)
        });

        chrome.storage.local.set({
            contextMenuLanguage: language,
            dateFormat: dateFormat,
            alwaysGroupCurrentMonth: alwaysGroupCurrentMonth,
            analyticsEnabled: analyticsEnabled
        }, () => {
            // 保存成功のメッセージを表示
            const status = document.getElementById('status');
            status.textContent = '設定を保存しました。(Settings saved.)';

            // background.js に設定変更を通知してコンテキストメニューを更新
            chrome.runtime.sendMessage({
                action: 'updateContextMenu',
                language: language
            });

            // 800ms後に自動でウィンドウを閉じる
            setTimeout(() => {
                window.close();
            }, 800);
        });
    });
});
