// background.js 経由で GA4 にイベントを送る簡易ヘルパー
function trackEvent(name, params = {}) {
    try {
        chrome.runtime.sendMessage({ action: 'trackEvent', name, params });
    } catch (e) {
        // 送信失敗は無視
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // ウェルカムページが表示されたことを計測（オンボーディング到達率）
    trackEvent('welcome_shown');

    // 今日の日付（ISO形式）を「日付スタンプ」に反映 — 保存先が一目で分かる
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const stamp = document.getElementById('stampDate');
    const lede = document.getElementById('ledeDate');
    if (stamp) stamp.textContent = iso;
    if (lede) lede.textContent = iso;

    document.getElementById('openOptions').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('donateLink').addEventListener('click', () => {
        trackEvent('donate_clicked', { source: 'welcome' });
    });
});
