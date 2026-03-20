document.addEventListener('DOMContentLoaded', () => {
    // 既存の設定を読み込んでフォームに反映
    chrome.storage.local.get({
        contextMenuLanguage: 'ja',
        dateFormat: 'yyyy-MM-dd'
    }, (items) => {
        document.getElementById('language').value = items.contextMenuLanguage;
        document.getElementById('dateFormat').value = items.dateFormat;
    });

    // 保存ボタンのクリックイベント
    document.getElementById('saveButton').addEventListener('click', () => {
        const language = document.getElementById('language').value;
        const dateFormat = document.getElementById('dateFormat').value;

        chrome.storage.local.set({
            contextMenuLanguage: language,
            dateFormat: dateFormat
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
