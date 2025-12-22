# NMOS Simple BCC

Lightweight, browser-only NMOS IS-04/IS-05 patching UI for ST 2110 routing.

![NMOS](https://img.shields.io/badge/NMOS-IS--04%20%7C%20IS--05-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![JavaScript](https://img.shields.io/badge/javascript-ES6+-yellow)

---

## Overview / 概要
NMOS Simple BCC is a minimal, browser-only tool for NMOS-based ST 2110 routing.  
NMOS IS-04/IS-05 を使った ST 2110 ルーティングを、ブラウザだけで行う軽量ツールです。

## 🌐 Live Site
https://taqq505.github.io/nmos-patch-gui/

## Features / 特徴
- Browser-only, no server required / サーバ不要
- NMOS IS-04/IS-05 support / NMOS IS-04/IS-05 対応
- ST2110-7 redundant streams / 冗長系 primary/secondary 対応
- Auto-discovery of IS-05 endpoint / IS-05 自動検出
- LocalStorage for nodes/history / ノード・履歴を保存

## CORS / CORS
This UI sends PATCH directly to devices, so device-side CORS headers are required.  
ノードがCORS対応していない場合は、以下の方法でChromeを立ち上げ直してください。  
ただし、**このモードは安全ではありません。テスト用途のみに限定してください。**

**Device-side headers / 機器側ヘッダー例**
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

**Dev-only Chrome launch / テスト用途のみ**
```bash
# macOS
open -na "Google Chrome" --args --disable-web-security --user-data-dir=/tmp/chrome_dev

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --disable-web-security --user-data-dir=%TEMP%\chrome_dev

# Linux
google-chrome --disable-web-security --user-data-dir=/tmp/chrome_dev
```

## Structure / 構成
```
nmos-patch-gui/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── nmos-api.js
│   ├── sdp-parser.js
│   └── storage.js
└── README.md
```

## License / ライセンス
MIT License - See [LICENSE](LICENSE)
