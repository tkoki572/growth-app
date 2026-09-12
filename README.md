# Rypace

> 自分だけのリズムで、自分の歩幅で。

中核コンセプト：昨日の自分より、少し前へ。

## Web / GitHub Pages

Web版はこれまでどおり、リポジトリ直下の`index.html`、`style.css`、`script.js`、`assets/`を使用します。Capacitor導入によってGitHub Pagesの公開構成は変更しません。

## Capacitor

Capacitor用のWeb Assetsは、次のコマンドで`www/`へ生成します。

```bash
npm run build:web
```

`www/`は生成物のためGit管理しません。アプリ本体にはGitHub PagesのURLではなく、このローカルWeb Assetsを同梱します。

正式Bundle IDは`com.tkoki572.growthapp`に設定済みです。

## MacでiOSプロジェクトを生成する

1. Node.js 22以上、Xcode 26以上を用意します。
2. `capacitor.config.json`の`appId`が`com.tkoki572.growthapp`であることを確認します。
3. 依存関係をインストールします。

   ```bash
   npm install
   ```

4. iOSプロジェクトを生成します。

   ```bash
   npm run cap:add:ios
   ```

5. Web Assetsを変更した場合は同期します。

   ```bash
   npm run cap:sync
   ```

6. Xcodeで開きます。

   ```bash
   npm run cap:open:ios
   ```

7. XcodeでSigning & CapabilitiesのTeam、Bundle Identifier、Version、Buildを確認し、Simulatorと実機で動作確認します。

## リリース品質テスト

```bash
npm run test:release
```

テストにはPlaywrightが必要です。現在のCodex検証環境では同梱のPlaywrightを使用しています。
