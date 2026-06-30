# Changelog

## Unreleased

### New Features
- **Advanced Mode — Matrix View** — Full crosspoint matrix for video/audio/data routing. Rows = Senders, columns = Receivers (rotated headers). Supports three patch modes switchable via a segmented control:
  - **TAKE** — Select a crosspoint and confirm via a bottom bar before patching.
  - **1-CLICK** — Tap a crosspoint to patch immediately (no confirmation step).
  - **BULK** — Select multiple crosspoints across receivers, then TAKE ALL in one shot. Each receiver can only have one pending sender.
  Locked receivers (from node settings) are shown with a lock badge and dark-red header, and cannot be clicked. Local labels are shown with priority over IS-04 labels. The matrix auto-updates when nodes are added or changed. Zoom in/out (40%–200%) is available within the matrix box. Side panels can be collapsed. Custom scrollbars match the main page style. Vertical scrolling is contained within the matrix box at all viewport sizes.
  **アドバンスモード — マトリクスビュー** — 映像/音声/データのクロスポイントマトリクス。行 = Sender、列 = Receiver（縦書きヘッダー）。セグメントコントロールで3モードを切替可能：
  - **TAKE** — クロスポイントを選択し、下部バーで確認してPATCH。
  - **1-CLICK** — タップ直後に即時PATCH（確認ステップなし）。
  - **BULK** — 複数クロスポイントを選択してまとめてTAKE。1つのReceiverに選択できるSenderは1つまで。
  ノード設定でロックされたReceiverはロックバッジ付き（暗赤色）で表示され、選択不可。ローカルラベルをIS-04ラベルより優先表示。ノード追加・変更時にマトリクスを自動更新。マトリクスボックス内の拡大縮小（40%〜200%）に対応。サイドパネルは折りたたみ可能。カスタムスクロールバーはメインページと統一。縦スクロールはマトリクスボックス内のみに限定。

- **Receiver Lock & Local Label** — Per-receiver lock toggle with memo, set from an accordion in Settings → NODE. Locked receivers stay visible in the receiver list but cannot be selected for patching. Senders and receivers also support a `local_label` (custom name shown instead of the NMOS label).
  **Receiverロック & ローカルラベル** — Settings → NODEのアコーディオンから各Receiverをロック+メモ設定可能。ロック中はReceiverリストに表示されるが選択不可。Sender/Receiver共通で`local_label`（NMOSラベルの代わりに表示するカスタム名）にも対応。

- **SDP Source registration** — Add a sender directly from a pasted/dropped SDP file (no IS-04 required). Shows a preview (source/destination IP, port, ST 2110-7 redundancy) before committing. Registered under a virtual "SDP Sources" node and usable in the normal TAKE flow.
  **SDPソース登録** — SDPファイルの貼り付け/ドラッグ&ドロップでIS-04不要のSenderを登録。登録前に内容確認（送信元/宛先IP、ポート、ST 2110-7冗長判定）を表示。仮想ノード「SDP Sources」にまとまり、通常のTAKE操作で使用可能。

### Bug Fixes
- Resource detail modal (Sender/Receiver double-click JSON view) no longer shrinks to fit content — fixed height responsive to window size.
  リソース詳細モーダル（Sender/Receiverダブルクリックで開くJSON表示）がコンテンツ量で縮んでしまう問題を修正。ウィンドウサイズに追従する高さに変更。

- Add Node modal occasionally showed both IS-04 and SDP forms at once when reopened after switching tabs.
  Add Nodeモーダルで、タブ切り替え後に再度開くとIS-04フォームとSDPフォームが同時に表示される場合がある問題を修正。

- ST 2110-40 (ancillary/metadata) SDP was misclassified as "video" since it is carried over an `m=video` line; now detected via the `smpte291` rtpmap encoding.
  ST 2110-40（メタデータ）のSDPが `m=video` 行のため "video" と誤判定される問題を修正。rtpmapの`smpte291`エンコーディングで判定するよう変更。

---

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
