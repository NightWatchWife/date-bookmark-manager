/**
 * Date Bookmark Manager - Background Script
 * ブックマークを日付ごとのフォルダに自動整理し、
 * 月が替わった際に前月分のフォルダを月別にまとめます。
 */

const CONTEXT_MENU_ID = "bookmarkToDateFolder";

// ===== GA4 Measurement Protocol (匿名の利用統計) =====
// 計測IDは「Extension runtime」ストリームのもの。
// GA_API_SECRET は GA4管理画面で発行した値に差し替えてください（未設定時は送信をスキップ）。
const GA_MEASUREMENT_ID = 'G-9CSJ3Y9XEB';
// API secret は config.js（.gitignore 対象）から読み込む。
// config.js が無い／未設定の場合は計測を自動で無効化する。
self.GA_API_SECRET = '';
try {
    importScripts('config.js');
} catch (e) {
    console.warn('config.js が見つかりません。利用統計の送信は無効です。');
}
const GA_API_SECRET = self.GA_API_SECRET;
const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

/**
 * インストールごとに一意な匿名ID（個人情報ではない）を取得・生成する
 */
async function getClientId() {
    const { gaClientId } = await chrome.storage.local.get('gaClientId');
    if (gaClientId) return gaClientId;
    const id = crypto.randomUUID();
    await chrome.storage.local.set({ gaClientId: id });
    return id;
}

/**
 * GA4 にイベントを1件送信する（発生時に即時POST。バッチしないこと）
 * @param {string} name - イベント名
 * @param {Object} params - イベントパラメータ
 */
async function gaEvent(name, params = {}) {
    // API secret 未設定時は何もしない（誤送信防止）
    if (!GA_API_SECRET) return;
    // ユーザーがオプトアウトしている場合は送信しない
    const { analyticsEnabled = true } = await chrome.storage.local.get({ analyticsEnabled: true });
    if (!analyticsEnabled) return;
    try {
        const client_id = await getClientId();
        await fetch(GA_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({
                client_id,
                events: [{
                    name,
                    params: {
                        ...params,
                        engagement_time_msec: 100,
                        session_id: Date.now().toString()
                    }
                }]
            })
        });
    } catch (e) {
        console.error('GA event failed:', e);
    }
}

/**
 * 設定言語に基づく右クリックメニューのタイトル取得
 */
function getContextMenuTitle(language) {
    switch (language) {
        case 'en': return "Bookmark to Date Folder";
        case 'zh': return "添加到日期书签文件夹";
        case 'ko': return "날짜 폴더로 북마크";
        case 'ja':
        default: return "日付フォルダにブックマークする";
    }
}

/**
 * 選択されたフォーマットに基づいて日付関連の文字列を取得する
 */
function getFormatInfo(format, date) {
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    switch (format) {
        case 'yyyyMMdd':
            return {
                todayStr: `${yyyy}${mm}${dd}`,
                monthStr: `${yyyy}${mm}`,
                monthPattern: `${yyyy}${mm}`
            };
        case 'yyyy/MM/dd':
            return {
                todayStr: `${yyyy}/${mm}/${dd}`,
                monthStr: `${yyyy}/${mm}`,
                monthPattern: `${yyyy}/${mm}/`
            };
        case 'MMDD':
            return {
                todayStr: `${mm}${dd}`,
                monthStr: `${mm}`,
                monthPattern: `${mm}`
            };
        case 'MM-DD':
            return {
                todayStr: `${mm}-${dd}`,
                monthStr: `${mm}`,
                monthPattern: `${mm}-`
            };
        case 'MM/DD':
            return {
                todayStr: `${mm}/${dd}`,
                monthStr: `${mm}`,
                monthPattern: `${mm}/`
            };
        case 'yyyy-MM-dd':
        default:
            return {
                todayStr: `${yyyy}-${mm}-${dd}`,
                monthStr: `${yyyy}-${mm}`,
                monthPattern: `${yyyy}-${mm}-`
            };
    }
}

/**
 * 拡張機能のインストール・更新時に実行される初期設定
 */
chrome.runtime.onInstalled.addListener((details) => {
    // 新規インストール／更新を計測
    gaEvent(details.reason === 'install' ? 'extension_installed' : 'extension_updated', {
        version: chrome.runtime.getManifest().version
    });

    // 新規インストール時は使い方ページを開く（定着率向上のためのオンボーディング）
    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'welcome.html' });
    }

    chrome.storage.local.get({
        contextMenuLanguage: 'ja',
        dateFormat: 'yyyy-MM-dd',
        alwaysGroupCurrentMonth: false
    }, (items) => {
        chrome.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: getContextMenuTitle(items.contextMenuLanguage),
            contexts: ["page", "link"]
        });

        // インストール時に過去のフォルダ整理のみ実行する。
        // 当日のフォルダはユーザーが実際にブックマークを保存したタイミングで作るため、
        // ここで空のフォルダを先行作成しない。
        organizePreviousMonthFoldersWithCheck(items.dateFormat, items.alwaysGroupCurrentMonth);
    });
});

/**
 * 設定画面から変更通知を受け取った場合の処理
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateContextMenu') {
        chrome.contextMenus.update(CONTEXT_MENU_ID, {
            title: getContextMenuTitle(request.language)
        });
    } else if (request.action === 'trackEvent') {
        // options.js / popup.js など、他コンテキストからのイベント計測を仲介
        gaEvent(request.name, request.params || {});
    } else if (request.action === 'savePageToToday') {
        // popup からの「このページを保存」要求を処理
        bookmarkToTodayFolder(request.url, request.title || '新しいブックマーク', 'popup', (result) => {
            sendResponse(result);
        });
        return true; // 非同期で sendResponse するため
    }
});

/**
 * コンテキストメニュー（右クリック）クリック時のイベントリスナー
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
    const url = info.linkUrl || info.pageUrl;
    const title = tab.title || "新しいブックマーク";
    bookmarkToTodayFolder(url, title, 'context_menu');
});

/**
 * 当日の日付フォルダを解決（必要なら作成）し、ブックマークを保存する共通処理。
 * 右クリックメニューと popup の両方から利用する。
 * @param {string} url - 保存するURL
 * @param {string} title - ブックマークのタイトル
 * @param {string} source - 流入元（'context_menu' / 'popup'）計測用
 * @param {Function} [done] - 完了コールバック（{ ok, error } を受け取る）
 */
function bookmarkToTodayFolder(url, title, source, done) {
    chrome.storage.local.get({
        dateFormat: 'yyyy-MM-dd',
        alwaysGroupCurrentMonth: false
    }, (items) => {
        const formatInfo = getFormatInfo(items.dateFormat, new Date());
        const today = formatInfo.todayStr;

        // 整理を実行してからブックマークを追加（一貫性保持のため）
        organizePreviousMonthFoldersWithCheck(items.dateFormat, items.alwaysGroupCurrentMonth, () => {
            chrome.bookmarks.search({ title: today }, (folders) => {
                const exactTodayFolder = folders.find(f => f.title === today && !f.url);
                if (exactTodayFolder) {
                    // 既存の当日フォルダを使用
                    saveBookmark(url, title, exactTodayFolder.id, source, done);
                } else {
                    // 当日フォルダがない場合
                    if (items.alwaysGroupCurrentMonth) {
                        const monthFolderName = formatInfo.monthStr;
                        // 月フォルダを検索
                        chrome.bookmarks.search({ title: monthFolderName }, (monthFolders) => {
                            const exactMonthFolder = monthFolders.find(f => f.title === monthFolderName && !f.url);
                            if (exactMonthFolder) {
                                // 月フォルダの中に当日フォルダを作成
                                chrome.bookmarks.create({ title: today, parentId: exactMonthFolder.id }, (newFolder) => {
                                    saveBookmark(url, title, newFolder.id, source, done);
                                });
                            } else {
                                // 月フォルダがない場合、新規作成してから当日フォルダを作成
                                chrome.bookmarks.create({ title: monthFolderName }, (newMonthFolder) => {
                                    chrome.bookmarks.create({ title: today, parentId: newMonthFolder.id }, (newFolder) => {
                                        saveBookmark(url, title, newFolder.id, source, done);
                                    });
                                });
                            }
                        });
                    } else {
                        // オプション無効時はルートに直接作成
                        chrome.bookmarks.create({ title: today }, (newFolder) => {
                            saveBookmark(url, title, newFolder.id, source, done);
                        });
                    }
                }
            });
        });
    });
}

/**
 * 指定されたフォルダにブックマークを保存する
 * @param {string} url - 保存するURL
 * @param {string} title - ブックマークのタイトル
 * @param {string} folderId - 保存先フォルダのID
 * @param {string} source - 流入元（計測用）
 * @param {Function} [done] - 完了コールバック（{ ok, error } を受け取る）
 */
function saveBookmark(url, title, folderId, source, done) {
    chrome.bookmarks.create({
        parentId: folderId,
        title: title || "新しいブックマーク",
        url: url
    }, () => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            if (done) done({ ok: false, error: chrome.runtime.lastError.message });
            return;
        }
        // コア機能の実利用を計測（最重要指標）
        gaEvent('bookmark_saved', source ? { source } : {});
        if (done) done({ ok: true });
    });
}

/**
 * 与えられた日付から前月の1日の日付オブジェクトを取得する
 * @param {Date} date - 基準となる日付
 * @returns {Date} 前月の1日の日付オブジェクト
 */
function getPreviousMonthDate(date) {
    const prevMonth = new Date(date);
    prevMonth.setDate(1);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    return prevMonth;
}

/**
 * 重複実行を防止しつつ、前月以前のフォルダ整理を実行する
 * @param {string} dateFormat - 現在の設定された日付フォーマット
 * @param {Function} callback - 処理完了後に実行されるコールバック
 */
function organizePreviousMonthFoldersWithCheck(dateFormat, alwaysGroupCurrentMonth, callback) {
    const formatInfo = getFormatInfo(dateFormat, new Date());
    const todayStr = formatInfo.todayStr;

    // ストレージを確認し、当日の初回実行時のみ整理ロジックを動かす
    chrome.storage.local.get(['lastOrganizeDate'], (result) => {
        if (chrome.runtime.lastError) {
            console.error("ストレージの読み込みに失敗しました:", chrome.runtime.lastError.message);
            if (callback) callback();
            return;
        }
        if (result.lastOrganizeDate !== todayStr) {
            organizePreviousMonthFolders(dateFormat, alwaysGroupCurrentMonth, () => {
                chrome.storage.local.set({ lastOrganizeDate: todayStr }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("ストレージへの保存に失敗しました:", chrome.runtime.lastError.message);
                    }
                    if (callback) callback();
                });
            });
        } else {
            if (callback) callback();
        }
    });
}

/**
 * 過去（前月および前々月）のフォルダをチェックし、月別フォルダにまとめる
 * 古い月から1か月ずつ順番に処理することで、新しく作る月フォルダが
 * 親フォルダの一番下に時系列順（古い→新しい）で並ぶようにする。
 * @param {string} dateFormat - 現在の設定された日付フォーマット
 * @param {boolean} alwaysGroupCurrentMonth - 当月分も整理対象に含めるか
 * @param {Function} callback - すべての作成・移動が完了した後に実行されるコールバック
 */
function organizePreviousMonthFolders(dateFormat, alwaysGroupCurrentMonth, callback) {
    const today = new Date();
    const prev1 = getPreviousMonthDate(today);
    // 前々月も対象にする（月跨ぎ直後の整理漏れを防止するため）
    const prev2 = getPreviousMonthDate(prev1);

    // 古い月 → 新しい月の順。月フォルダは末尾に追加するため、この順で時系列に並ぶ
    const targets = [getFormatInfo(dateFormat, prev2), getFormatInfo(dateFormat, prev1)];
    if (alwaysGroupCurrentMonth) {
        targets.push(getFormatInfo(dateFormat, today));
    }

    (async () => {
        for (const formatData of targets) {
            try {
                // 直前の月の作成・移動でツリーが変わるため、月ごとに最新のツリーを取り直す
                // （古いスナップショットの index を使うと位置ずれや "Index out of bounds" になる）
                const [root] = await chrome.bookmarks.getTree();
                await organizeMonthFolders(root, formatData.monthPattern, formatData.monthStr);
            } catch (e) {
                console.error(`${formatData.monthStr} のフォルダ整理に失敗しました:`, e);
            }
        }
    })().finally(() => {
        if (callback) callback();
    });
}

/**
 * 指定月の日付フォルダを親フォルダごとに月フォルダへまとめる
 * @param {Object} root - ブックマークツリーのルートノード
 * @param {string} monthPattern - 検索する日付フォルダの接頭辞
 * @param {string} monthFolderName - 移動先となる月フォルダ名
 */
async function organizeMonthFolders(root, monthPattern, monthFolderName) {
    const groups = [];
    collectDateFolders(root, monthPattern, monthFolderName, groups);

    for (const { parentId, targetFolders, monthFolderNode } of groups) {
        let monthFolderId = monthFolderNode ? monthFolderNode.id : null;
        if (!monthFolderId) {
            // index を指定せずに作成し、親フォルダの一番下に追加する
            const newFolder = await chrome.bookmarks.create({ parentId, title: monthFolderName });
            monthFolderId = newFolder.id;
        }
        // 1件ずつ順番に移動し、月フォルダ内でも元の並び（日付順）のまま末尾に追加する
        for (const folder of targetFolders) {
            try {
                await chrome.bookmarks.move(folder.id, { parentId: monthFolderId });
            } catch (e) {
                console.error(`フォルダ ${folder.id} の移動に失敗しました:`, e);
            }
        }
    }
}

/**
 * ツリーを再帰的に探索し、月フォルダへまとめるべき日付フォルダを親フォルダ単位で収集する
 * @param {Object} node - 探索対象のブックマークノード
 * @param {string} monthPattern - 検索する日付フォルダの接頭辞
 * @param {string} monthFolderName - 移動先となる月フォルダ名
 * @param {Array} groups - 収集結果（{ parentId, targetFolders, monthFolderNode }）の格納先
 */
function collectDateFolders(node, monthPattern, monthFolderName, groups) {
    if (!node.children) return;

    // すでに月フォルダ内にある場合はスキップして無限ループや過剰な階層化を防ぐ
    if (node.title === monthFolderName) return;

    const targetFolders = [];
    let monthFolderNode = null;

    // 子要素を走査
    for (const child of node.children) {
        if (child.url) continue; // フォルダのみ対象
        if (child.title === monthFolderName) {
            monthFolderNode = child;
        } else if (child.title.startsWith(monthPattern)) {
            targetFolders.push(child);
        }
        // 再帰的に深層を探索
        collectDateFolders(child, monthPattern, monthFolderName, groups);
    }

    if (targetFolders.length > 0) {
        groups.push({ parentId: node.id, targetFolders, monthFolderNode });
    }
}

