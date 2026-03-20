const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const extensionPath = __dirname;
const outputDir = path.resolve(__dirname, 'store_assets');

(async () => {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log('Launching browser with extension...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
        ]
    });

    // 起動まで少し待つ
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Service Worker から拡張機能IDを取得する
    const targets = await browser.targets();
    const serviceWorkerTarget = targets.find(t => t.type() === 'service_worker' || t.type() === 'background_page');
    
    let extensionId = '';
    if (serviceWorkerTarget) {
        extensionId = serviceWorkerTarget.url().split('/')[2];
        console.log(`Found extension ID: ${extensionId}`);
    } else {
        console.error('Service worker target not found. Cannot determine extension ID.');
        await browser.close();
        process.exit(1);
    }

    const optionsUrl = `chrome-extension://${extensionId}/options.html`;
    console.log(`Navigating to ${optionsUrl}`);

    const page = await browser.newPage();
    // ストアスクリーンショット用に1280x800に設定
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(optionsUrl, { waitUntil: 'networkidle0' });
    
    // スタイルを少し整えて見た目を良くする（余白やフォントサイズ調整）
    await page.addStyleTag({
        content: `
            body { 
                transform: scale(1.6); 
                transform-origin: top center; 
                padding: 40px; 
                background-color: #f8f9fa;
                box-sizing: border-box;
                width: 800px;
                margin: 0 auto;
            }
            h1 { font-size: 32px; color: #1a73e8; font-weight: bold; }
            label { font-size: 20px; margin-top: 15px; display: block; }
            select { font-size: 18px; padding: 12px; width: 100%; box-sizing: border-box; }
            button { font-size: 20px; padding: 16px; margin-top: 30px; background-color: #1a73e8; border-radius: 8px;}
            #status { font-size: 18px; margin-top: 15px; }
            
            /* Add some decorative wrapper to look like a window or card */
            html { background-color: #e8eaed; }
            body {
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.1);
                margin-top: 40px;
            }
        `
    });

    await new Promise(r => setTimeout(r, 1000));

    // キャプチャ 1 (デフォルト)
    const outputPath1 = path.join(outputDir, 'options_settings_ja.jpg');
    await page.screenshot({ path: outputPath1, type: 'jpeg', quality: 90 });
    console.log(`Saved screenshot to ${outputPath1}`);

    // 言語を英語、フォーマットを別のに切り替える
    await page.select('#language', 'en');
    await page.select('#dateFormat', 'yyyyMMdd');
    await page.click('#saveButton');
    
    await new Promise(r => setTimeout(r, 1000)); // 保存メッセージ表示と再描画待ち
    
    // キャプチャ 2 (英語・設定変更後)
    const outputPath2 = path.join(outputDir, 'options_settings_en.jpg');
    await page.screenshot({ path: outputPath2, type: 'jpeg', quality: 90 });
    console.log(`Saved screenshot to ${outputPath2}`);

    await browser.close();
    console.log('Done.');
})();
