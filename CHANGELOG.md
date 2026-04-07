# Changelog

## v2026.04.07

### New Features
- **Stream Deck Integration** — WebSocket bridge to Stream Deck plugin (`ws://localhost:57284`). Plugin operates standalone without RDS or middleware.
  **Stream Deck連携** — Stream Deckプラグインへ WebSocket接続（`ws://localhost:57284`）。RDS・専用ソフト不要でプラグイン単体動作。

- **PWA: Network-first for browser** — Browser clients always fetch the latest code on reload. Installed (PWA) clients remain cache-first.
  **PWA: ブラウザ向けネットワーク優先** — ブラウザで開いた場合は常に最新コードを取得。インストール済み（PWA）はキャッシュ優先を維持。

### Bug Fixes
- **Staged PATCH path detection** — Fixed 405 error on devices that accept GET with trailing slash but reject PATCH with trailing slash (e.g. IS-05 v1.0 devices). Now verifies both GET and PATCH before confirming the path.
  **Staged PATCHパス検出の修正** — GETはスラッシュありで通るがPATCHはスラッシュありで405を返す機器（IS-05 v1.0機器など）への対応。GETとPATCHの両方を確認してからパスを確定するよう修正。

---

## v2026.04.04

### Bug Fixes
- **ST 2110-7 mergeTransportParams** — Fixed secondary leg incorrectly inheriting receiver's existing transport_params when sender is non-7.
  **ST 2110-7 mergeTransportParams修正** — 非-7 Senderのとき、SecondaryレッグがReceiverの既存 transport_params を引き継いでしまう問題を修正。

- **RDS Multi-version Query** — Query API now queries all available versions (v1.3, v1.2, v1.1…) and merges results. Fixes devices registered via older IS-04 versions not appearing in the RDS discovery list.
  **RDS マルチバージョンクエリ** — Query API の全バージョン（v1.3, v1.2, v1.1…）に問い合わせて結果をマージ。古いIS-04バージョンで登録されたデバイスがRDS検索リストに表示されない問題を解消。

---

## v2026.03.13

### New Features
- **RDS WebSocket Subscription** — Real-time node discovery updates via WebSocket.
  **RDS WebSocketサブスクリプション** — WebSocket経由でノード情報をリアルタイム受信。

- **Export / Import** — Save and restore all settings, nodes, and history as a JSON file.
  **エクスポート / インポート** — 設定・ノード・履歴をJSONファイルで保存・復元。

- **Node Deletion** — Individual nodes can be deleted from the sidebar.
  **ノード削除** — サイドバーから個別にノードを削除可能。

- **Sidebar Settings** — Settings panel with Install & Update, Backup, Stream Deck, and About tabs.
  **サイドバー設定** — Install & Update / Backup / Stream Deck / About タブ付き設定パネル。

### Bug Fixes
- Fixed node selector minimum width shrinking on narrow viewports.
  ノードセレクタが狭い画面で縮んでしまう問題を修正。

- Stale request protection — rapid node switching no longer causes display glitches.
  高速なノード切り替え時に表示が乱れる問題を修正。

---

## v2026.03.09

### New Features
- RDS discovery and node management.
  RDS検索とノード管理。

- Alphabetical sort for sender/receiver lists.
  Sender/Receiverリストのアルファベット順ソート。

- Node registered badge in RDS discovery list.
  RDS検索リストに登録済みバッジ表示。
