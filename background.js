/**
 * Date Bookmark Manager - Background Script
 * ブックマークを日付（YYYY-MM-DD）ごとのフォルダに自動整理し、
 * 月が替わった際に前月分のフォルダを月別（YYYY-MM）にまとめます。
 */

/**
 * 拡張機能のインストール・更新時に実行される初期設定
 */
chrome.runtime.onInstalled.addListener(() => {
    // 右クリックメニューの作成
    chrome.contextMenus.create({
        id: "bookmarkToDateFolder",
        title: "日付フォルダにブックマークする",
        contexts: ["page", "link"]
    });

    // インストール時に過去のフォルダ整理を実行し、当日のフォルダを準備
    organizePreviousMonthFoldersWithCheck(() => {
        createTodayFolderIfNotExists();
    });
});

/**
 * コンテキストメニュー（右クリック）クリック時のイベントリスナー
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
    const today = getTodayString();

    // 整理を実行してからブックマークを追加（一貫性保持のため）
    organizePreviousMonthFoldersWithCheck(() => {
        chrome.bookmarks.search({ title: today }, (folders) => {
            if (folders.length === 0) {
                // 当日のフォルダがない場合は新規作成
                chrome.bookmarks.create({ title: today }, (newFolder) => {
                    saveBookmark(info, tab, newFolder.id);
                });
            } else {
                // 既存の当日フォルダを使用
                saveBookmark(info, tab, folders[0].id);
            }
        });
    });
});

/**
 * 指定されたフォルダにブックマークを保存する
 * @param {Object} info - contextMenus.onClicked の info オブジェクト
 * @param {Object} tab - contextMenus.onClicked の tab オブジェクト
 * @param {string} folderId - 保存先フォルダのID
 */
function saveBookmark(info, tab, folderId) {
    const url = info.linkUrl || info.pageUrl;
    const title = tab.title || "新しいブックマーク";

    chrome.bookmarks.create({
        parentId: folderId,
        title: title,
        url: url
    }, () => {
        if (chrome.runtime.lastError) {
            // エラーが発生した場合は拡張機能の内部ログとして記録（必要最小限）
            console.error(chrome.runtime.lastError);
        }
    });
}

/**
 * 現在の日付を YYYY-MM-DD 形式で取得する
 * @returns {string} フォーマット済み日付文字列
 */
function getTodayString() {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * 日付を YYYY-MM 形式の文字列に変換する
 * @param {Date} date - 対象の日付オブジェクト
 * @returns {string} フォーマット済み年月文字列
 */
function formatMonth(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
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
 * @param {Function} callback - 処理完了後に実行されるコールバック
 */
function organizePreviousMonthFoldersWithCheck(callback) {
    const today = getTodayString();

    // ストレージを確認し、当日の初回実行時のみ整理ロジックを動かす
    chrome.storage.local.get(['lastOrganizeDate'], (result) => {
        if (chrome.runtime.lastError) {
            console.error("ストレージの読み込みに失敗しました:", chrome.runtime.lastError.message);
            if (callback) callback();
            return;
        }
        if (result.lastOrganizeDate !== today) {
            organizePreviousMonthFolders(() => {
                chrome.storage.local.set({ lastOrganizeDate: today }, () => {
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
 * @param {Function} callback - 処理完了後に実行されるコールバック
 */
function organizePreviousMonthFolders(callback) {
    const today = new Date();

    // 整理対象：前月
    const prev1 = getPreviousMonthDate(today);
    const prev1Str = formatMonth(prev1);

    // 整理対象：前々月（月跨ぎ直後の整理漏れを防止するため）
    const prev2 = getPreviousMonthDate(prev1);
    const prev2Str = formatMonth(prev2);

    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        if (chrome.runtime.lastError) {
            console.error("ブックマークツリーの取得に失敗しました:", chrome.runtime.lastError.message);
            if (callback) callback();
            return;
        }
        let completedTasks = 0;
        const totalTasks = 2;

        const checkCompletion = () => {
            completedTasks++;
            if (completedTasks === totalTasks && callback) {
                callback();
            }
        };

        // 各対象月のフォルダを検索・整理
        [prev1Str, prev2Str].forEach(monthStr => {
            const pattern = `${monthStr}-`; // YYYY-MM- 形式のフォルダを探す
            searchAndOrganizeFolders(bookmarkTreeNodes[0], pattern, monthStr, null, checkCompletion, true);
        });
    });
}

/**
 * フォルダを再帰的に探索し、日付フォルダを月別フォルダに移動する
 * @param {Object} node - 探索対象のブックマークノード
 * @param {string} monthPattern - 検索する日付フォルダの接頭辞（例: "2023-12-"）
 * @param {string} monthFolderName - 移動先となる月フォルダ名（例: "2023-12"）
 * @param {Object} parentNode - 現在のノードの親ノード
 * @param {Function} callback - 処理完了後に実行されるコールバック
 * @param {boolean} isRootCall - ルートからの初回呼び出し判定
 */
function searchAndOrganizeFolders(node, monthPattern, monthFolderName, parentNode, callback, isRootCall = false) {
    if (!node.children) {
        if (callback && isRootCall) callback();
        return;
    }

    // すでに月フォルダ内にある場合はスキップして無限ループや過剰な階層化を防ぐ
    if (node.title === monthFolderName || (parentNode && parentNode.title === monthFolderName)) {
        if (callback && isRootCall) callback();
        return;
    }

    const targetFolders = [];
    let monthFolderNode = null;

    // 子要素を走査
    for (const child of node.children) {
        if (!child.url) { // フォルダのみ対象
            if (child.title.startsWith(monthPattern)) {
                targetFolders.push(child);
            } else if (child.title === monthFolderName) {
                monthFolderNode = child;
            }
            // 再帰的に深層を探索
            searchAndOrganizeFolders(child, monthPattern, monthFolderName, node, null, false);
        }
    }

    // 日付フォルダが見つかった場合、月フォルダへ集約
    if (targetFolders.length > 0) {
        if (!monthFolderNode) {
            // 月フォルダが存在しない場合は新規作成
            // もともと最初の日付フォルダがあった位置に作成し、時系列（現在の月フォルダの直上など）を保つ
            const insertIndex = targetFolders[0].index;
            chrome.bookmarks.create({
                parentId: node.id,
                title: monthFolderName,
                index: insertIndex
            }, (newFolder) => {
                if (chrome.runtime.lastError) {
                    console.error("月フォルダの作成に失敗しました:", chrome.runtime.lastError.message);
                    if (isRootCall && callback) callback();
                    return;
                }
                moveFolders(targetFolders, newFolder.id, isRootCall ? callback : null);
            });
        } else {
            // 既存の月フォルダを使用
            moveFolders(targetFolders, monthFolderNode.id, isRootCall ? callback : null);
        }
    } else if (isRootCall && callback) {
        callback();
    }
}

/**
 * 複数のフォルダを一括で指定先フォルダへ移動する
 * @param {Array} folders - 移動対象のフォルダオブジェクト配列
 * @param {string} targetParentId - 移動先の親フォルダID
 * @param {Function} callback - すべての移動完了後に実行されるコールバック
 */
function moveFolders(folders, targetParentId, callback) {
    if (folders.length === 0) {
        if (callback) callback();
        return;
    }

    let movedCount = 0;
    folders.forEach(folder => {
        chrome.bookmarks.move(folder.id, { parentId: targetParentId }, () => {
            if (chrome.runtime.lastError) {
                console.error(`フォルダ ${folder.id} の移動に失敗しました:`, chrome.runtime.lastError.message);
            }
            movedCount++;
            if (movedCount === folders.length && callback) {
                callback();
            }
        });
    });
}

/**
 * 当日の日付フォルダが存在しない場合のみ作成する
 */
function createTodayFolderIfNotExists() {
    const today = getTodayString();
    chrome.bookmarks.search({ title: today }, (folders) => {
        if (chrome.runtime.lastError) {
            console.error("フォルダ検索中にエラーが発生しました:", chrome.runtime.lastError.message);
            return;
        }
        if (folders.length === 0) {
            chrome.bookmarks.create({ title: today }, () => {
                if (chrome.runtime.lastError) {
                    console.error("当日フォルダの作成に失敗しました:", chrome.runtime.lastError.message);
                }
            });
        }
    });
}
