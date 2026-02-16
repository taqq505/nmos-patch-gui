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

## Quick Start / 使い方

1. **Add Node** - Click "Add Node" to register NMOS devices
   「Add Node」をクリックして、NMOS機器を登録

2. **Select Sender/Receiver** - Choose source and destination
   送信元と送信先を選択

3. **Patch** - Drag & drop or click "Patch" button to connect
   ドラッグ＆ドロップまたは「Patch」ボタンで接続

4. **Connection Status** - View active connections and enable/disable devices
   接続状態の確認と、デバイスの有効/無効を切り替え

## Features / 特徴
- **Browser-only**, no server required / サーバ不要
- **NMOS IS-04/IS-05** support / NMOS IS-04/IS-05 対応
- **ST2110-7** redundant streams (primary/secondary) / 冗長系対応
- **Connection Management** / コネクション管理
  - View active sender/receiver connections / 送受信中の接続を表示
  - Enable/Disable control with safety warnings / 安全警告付きの有効/無効切り替え
  - Real-time connection status / リアルタイムで接続状態を確認
- **Auto-discovery** of IS-05 endpoint / IS-05 自動検出
- **LocalStorage** for nodes/history / ノード・履歴を保存
- **Drag & drop** patching interface / ドラッグ＆ドロップで簡単パッチング

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
### macOS
```bash
open -na "Google Chrome" --args --disable-web-security --user-data-dir=/tmp/chrome_dev
```

### Windows
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --disable-web-security --user-data-dir=%TEMP%\chrome_dev
```

### Linux
```bash
# Option 1: User home directory (recommended)
google-chrome --user-data-dir="$HOME/chrome-dev-data" --disable-web-security

# Option 2: Temp directory
google-chrome --disable-web-security --user-data-dir=/tmp/chrome_dev
```
> **Note:** If using Chromium, replace `google-chrome` with `chromium`.

## Structure / 構成
```
nmos-patch-gui/
├── index.html          # Main UI
├── css/
│   └── style.css      # Styling
├── js/
│   ├── app.js         # Main application logic
│   ├── nmos-api.js    # NMOS IS-04/IS-05 API client
│   ├── sdp-parser.js  # SDP parser for ST2110 streams
│   └── storage.js     # LocalStorage management
└── README.md
```

## Technical Details / 技術詳細

### NMOS APIs
- **IS-04**: Device discovery and resource query
- **IS-05**: Connection management (PATCH `/single/senders/{id}` and `/single/receivers/{id}`)

### Connection Control
- `master_enable` flag control for senders/receivers
- Active connection monitoring via `/active` endpoint
- Safety warnings before enable/disable operations

### Browser Compatibility
- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge

## Development / 開発

### Local Development
Simply open `index.html` in your browser. No build process required.

### CORS for Development
For local testing without CORS issues, use the Chrome launch commands provided in the CORS section above.

## License / ライセンス
MIT License - See [LICENSE](LICENSE)

## Credits / クレジット
- NMOS specifications by [AMWA](https://specs.amwa.tv/)
- ST 2110 standards by [SMPTE](https://www.smpte.org/)
