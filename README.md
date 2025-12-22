# NMOS Simple BCC - Broadcast Control Center

A modern, browser-based Broadcast Control Center (BCC) for SMPTE ST 2110 video routing using NMOS IS-04/IS-05 APIs.

![NMOS](https://img.shields.io/badge/NMOS-IS--04%20%7C%20IS--05-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![JavaScript](https://img.shields.io/badge/javascript-ES6+-yellow)

---

# 日本語

## 概要
NMOS Simple BCC は、NMOS IS-04/IS-05 を使った ST 2110 ルーティングをブラウザだけで行う軽量なツールです。サーバ不要で、HTML/CSS/JSのみで動作します。

## デモ（GitHub Pages）
`https://taqq505.github.io/nmos-patch-gui/`

## 主な特徴
- ブラウザだけで動作（サーバ不要）
- NMOS IS-04/IS-05 対応
- ST2110-7（冗長系 primary/secondary）対応
- IS-04 から IS-05 エンドポイントを自動検出
- LocalStorage にノードと履歴を保存
- ダークテーマのレスポンシブUI
- パッチ履歴の表示

## 使い方（クイックスタート）
### 1) ローカルで起動
```bash
# Python 3
python3 -m http.server 8000

# Node.js (http-server)
npx http-server -p 8000
```
ブラウザで `http://localhost:8000` を開きます。

### 2) ノード追加
1. **Add Node** をクリック
2. ノード名と IS-04 URL を入力（例: `http://192.168.1.10:3000`）
3. **Add Node** で追加

### 3) パッチ実行
1. Sender/Receiver ノードを選択
2. Sender と Receiver をクリックで選択
3. **TAKE** を押す

## CORS について
ブラウザから機器に直接PATCHするため、機器側でCORS対応が必要です。

- テスト用途（ChromeのCORS無効起動）
```bash
# macOS
open -na "Google Chrome" --args --disable-web-security --user-data-dir=/tmp/chrome_dev

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --disable-web-security --user-data-dir=%TEMP%\chrome_dev

# Linux
google-chrome --disable-web-security --user-data-dir=/tmp/chrome_dev
```

- 本番用途（機器側のHTTPレスポンスに付与）
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## ディレクトリ構成
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

## トラブルシュート
- **Failed to fetch / Network error**
  - 原因: CORSが未対応
  - 対応: 機器側CORS設定 or テスト用CORS無効Chrome
- **IS-05 endpoint not found**
  - 原因: controlsにIS-05が無い
  - 対応: IS-04ポート+1を推測して接続

---

# English

## Overview
NMOS Simple BCC is a lightweight, browser-only tool for NMOS IS-04/IS-05 based ST 2110 routing. It runs with plain HTML/CSS/JS and requires no server.

## Demo (GitHub Pages)
`https://YOUR-USERNAME.github.io/nmos-patch-gui/`

## Features
- Pure browser-based (no server)
- NMOS IS-04/IS-05 support
- ST2110-7 redundant streams
- Auto-discovery of IS-05 endpoint from IS-04 controls
- LocalStorage for nodes and history
- Responsive dark UI
- Patch history view

## Quick Start
### 1) Run locally
```bash
# Python 3
python3 -m http.server 8000

# Node.js (http-server)
npx http-server -p 8000
```
Open `http://localhost:8000` in your browser.

### 2) Add node
1. Click **Add Node**
2. Enter name and IS-04 URL (e.g. `http://192.168.1.10:3000`)
3. Click **Add Node**

### 3) Patch
1. Select sender/receiver nodes
2. Click a sender and a receiver
3. Press **TAKE**

## CORS
This UI sends PATCH directly to devices, so CORS is required.

- For testing (CORS-disabled Chrome)
```bash
# macOS
open -na "Google Chrome" --args --disable-web-security --user-data-dir=/tmp/chrome_dev

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --disable-web-security --user-data-dir=%TEMP%\chrome_dev

# Linux
google-chrome --disable-web-security --user-data-dir=/tmp/chrome_dev
```

- For production (device-side response headers)
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Structure
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

## Troubleshooting
- **Failed to fetch / Network error**
  - Cause: device CORS not enabled
  - Fix: enable CORS headers or use CORS-disabled Chrome for testing
- **IS-05 endpoint not found**
  - Cause: no IS-05 control in IS-04
  - Fix: fallback tries IS-04 port + 1

---

## License
MIT License - See [LICENSE](LICENSE)
