# 🌡️ HEAT GUARD – 熱中症WBGTアラートアプリ（作業者画面）

筑波大学・J-SHIFT プロジェクト  
**開発者：** 岸 拓弘

---

## 🚀 GitHub Pages でのデプロイ手順

1. このリポジトリを GitHub に push
2. リポジトリの **Settings → Pages → Branch: main / root** を選択して Save
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される

---

## 📱 機能概要

| 機能 | 詳細 |
|------|------|
| **WBGT自動計算** | Liljegren簡易式（ISO 7243準拠） |
| **GPS連携** | ブラウザGeolocation APIで現在地取得（HTTPS必須） |
| **気象API** | Open-Meteo（無料・APIキー不要）でリアルタイム取得 |
| **地点プリセット** | 8か所（T-PIRC農場・安衛研・神田和泉町 など） |
| **カスタム地点** | 緯度経度で追加・localStorageに保存 |
| **AIチャット** | モック（オフライン可）/ Claude API（要APIキー）切替 |
| **緊急対応ガイド** | 重症度判定・初期対応5ステップ |

---

## 🔧 ファイル構成

```
heatguard-web/
├── index.html   # メインHTML
├── style.css    # スタイル（CSS変数でテーマ切替）
├── app.js       # ロジック（WBGT計算・API・AI）
└── README.md
```

---

## ⚠️ GPS について

- **HTTPS環境必須**（GitHub Pages は自動でHTTPS）
- `localhost` でも動作確認可能
- GPS拒否時・圏外時はデモデータにフォールバック

---

## 🤖 Claude API（AIライブモード）

デモバナーの「AIモード: モック」をタップして **Claude API** に切替。  
ただし **CORS制限** のため、現状はローカル開発環境 or CORS Proxyが必要。  
→ 本格運用時はバックエンドProxy（Node.js/Cloudflare Workers等）を推奨。

---

## 📋 エビデンス・準拠規格

- ISO 7243（WBGT熱ストレス評価）
- 厚生労働省「熱中症予防のためのWBGT活用指針」（2017）
- ACGIH TLV（作業強度別推奨WBGT上限値）

> ⚠️ 本アプリは参考情報の提供を目的とし、医療的診断を行うものではありません。

---

## 🗺️ ロードマップ

- [x] 作業者画面（GPS・API・AIチャット）
- [ ] 管理者ダッシュボード（複数作業者のWBGT一元管理）
- [ ] 緊急連絡機能（作業者→管理者）
- [ ] プッシュ通知
- [ ] React Native モバイルアプリ化
