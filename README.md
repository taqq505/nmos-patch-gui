# NMOS Simple BCC

Lightweight, browser-only NMOS IS-04/IS-05 patching UI for ST 2110 routing.

![NMOS](https://img.shields.io/badge/NMOS-IS--04%20%7C%20IS--05-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![JavaScript](https://img.shields.io/badge/javascript-ES6+-yellow)
![PWA](https://img.shields.io/badge/PWA-installable-purple)

---

## Overview / 概要
NMOS Simple BCC is a minimal, browser-only tool for NMOS-based ST 2110 routing.
NMOS IS-04/IS-05 を使った ST 2110 ルーティングを、ブラウザだけで行う軽量ツールです。

## 🌐 Live Site
https://taqq505.github.io/nmos-patch-gui/

## Quick Start / 使い方

1. **Add Node / RDS** - Register NMOS devices directly or via RDS discovery
   NMOS機器を直接登録、またはRDS検索で追加

2. **Select Sender/Receiver** - Choose source and destination
   送信元と送信先を選択

3. **Patch** - Click "Patch" to connect
   「Patch」ボタンで接続

4. **Connection Status** - View active connections and enable/disable devices
   接続状態の確認と、デバイスの有効/無効を切り替え

## Features / 特徴

- **Browser-only**, no server required / サーバ不要
- **NMOS IS-04/IS-05** support / NMOS IS-04/IS-05 対応
- **ST2110-7** redundant streams (primary/secondary) / 冗長系対応
- **PWA** — installable as a desktop app / デスクトップアプリとしてインストール可能

### RDS Management / RDS管理
- Register and manage multiple RDS (Registry and Discovery System) servers
  複数のRDSサーバーを登録・管理
- **WebSocket subscription** — real-time node discovery updates
  WebSocketでリアルタイムにノード情報を受信
- Discovered nodes shown with "✓ Added" badge if already registered
  登録済みノードにバッジ表示

### Node Management / ノード管理
- Add nodes directly by URL or via RDS discovery / 直接URL入力またはRDS検索で追加
- **Delete individual nodes** / 各ノードを個別に削除可能
- Re-sync node data on demand / 手動で再同期

### Patching / パッチング
- Sender/Receiver lists sorted alphabetically by label / ラベルのアルファベット順で表示
- Drag & drop patching interface / ドラッグ＆ドロップ対応
- Connection Management: view, enable/disable with safety warnings
  接続の確認・安全警告付きの有効/無効切り替え

### Backup & Portability / バックアップ
- **Export** all settings, nodes, and history as a JSON file
  設定・ノード・履歴をJSONファイルとしてエクスポート
- **Import** on another PC to instantly restore your setup
  別のPCでインポートして即座に復元

### Stream Deck Integration / Stream Deck 連携
- **The Stream Deck plugin operates completely standalone** — no RDS server, no dedicated middleware, no extra software required
  **Stream DeckプラグインはRDSサーバーや専用ソフト不要で単体動作**
- The plugin communicates directly with NMOS devices via IS-04/IS-05 and executes TAKE independently
  プラグインがNMOS機器へ直接IS-04/IS-05でアクセスしTAKEを単独実行
- BCC is optional — once buttons are configured, Stream Deck works even without BCC running
  BCCはあくまでオプション。ボタン設定後はBCCを起動しなくても動作する
- When BCC is running with integration enabled, it sends the registered node list (`id`, `name`, `is04_url`) to the plugin via WebSocket for easy button setup
  BCC連携ONの場合、登録済みノード一覧をWebSocket経由で送信しボタン設定を補助
- **BCC integration is only compatible with this deployment**: https://taqq505.github.io/nmos-patch-gui/
  **BCC連携は以下のURLのBCCとのみ対応**: https://taqq505.github.io/nmos-patch-gui/
- Toggle on/off from Settings — saved in export JSON
  設定画面でON/OFF切り替え可能、エクスポートJSONに保存

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
├── index.html              # Main UI
├── manifest.json           # PWA manifest
├── service-worker.js       # PWA service worker (cache & offline)
├── favicon.svg
├── css/
│   └── style.css           # Styling
├── js/
│   ├── app.js              # Main application logic
│   ├── nmos-api.js         # NMOS IS-04/IS-05 API client
│   ├── rds-subscription.js # RDS WebSocket subscription manager
│   ├── sdp-parser.js       # SDP parser for ST2110 streams
│   ├── storage.js          # LocalStorage management
│   └── streamdeck-bridge.js# Stream Deck WebSocket bridge
└── README.md
```

## Technical Details / 技術詳細

### NMOS APIs
- **IS-04**: Device discovery and resource query
- **IS-05**: Connection management (PATCH `/single/senders/{id}` and `/single/receivers/{id}`)

### RDS WebSocket
- Subscribes to RDS node updates via WebSocket
- Stale request protection — rapid node switching no longer causes display glitches

### PWA
- **Installed app**: cache-first strategy — stable until manually updated
- **Browser**: network-first strategy — always fetches latest on reload
- Auto-detects new version on page load and shows an update toast
- Manual update available via the Install & Update tab in Settings
- NMOS device requests always bypass the cache (network-only)

### ST 2110-7 Redundant Stream Handling
- Receiver's `transport_params` length is read before patching to detect redundancy support
- **Sender -7 / Receiver -7**: both legs patched with primary and secondary addresses
- **Sender -7 / Receiver non-7**: only primary leg used (array trimmed to length 1)
- **Sender non-7 / Receiver -7**: primary patched, secondary explicitly set to `rtp_enabled: false`
- **Sender non-7 / Receiver non-7**: single-leg patch

### Stream Deck Integration
- **Plugin is fully standalone** — no RDS, no middleware, no extra software needed. The plugin queries IS-04/IS-05 directly and executes TAKE on its own.
- BCC is optional: once button assignments are saved to the plugin, BCC does not need to be running for TAKE to work
- When BCC integration is enabled, BCC acts as a WebSocket client (`ws://localhost:57284`) and sends the node list (`id`, `name`, `is04_url`) to the plugin for convenient button setup
- 5-second reconnect on disconnect, while integration is enabled
- See `js/streamdeck-bridge.js` for implementation

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
