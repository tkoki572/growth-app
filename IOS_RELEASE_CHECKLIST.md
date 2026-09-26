# Rypace iOS / App Store 引き継ぎ手順

この手順は、Windowsで準備済みのRypaceをMacでiOSプロジェクト化し、TestFlightへ送るためのものです。

## 確定情報

- App Name: `Rypace`
- Bundle ID: `com.tkoki572.growthapp`
- Web Assets: `www`
- App Icon原本: `assets/ios/Rypace-AppIcon-1024.png`
- Splash原本: `assets/ios/Rypace-Splash-v1.0-90pct.png`
- Launch Screen背景色: `#FEFAF2`（素材四隅のRGB 254, 250, 242）

## 1. Macに必要なもの

1. macOSを最新の安定版へ更新する
2. App StoreからXcodeをインストールして一度起動する
3. Xcodeの追加コンポーネントとライセンス確認を完了する
4. Node.js 22以上をインストールする
5. Apple Developer Program加入済みApple IDをXcodeへ追加する

## 2. リポジトリ取得と依存関係

```bash
git clone https://github.com/tkoki572/growth-app.git
cd growth-app
npm install
npm run ios:verify
```

`iOS release readiness checks passed`が表示されることを確認します。

## 3. iOSプロジェクト生成

初回だけ実行します。

```bash
npm run cap:add:ios
npm run cap:open:ios
```

すでに`ios/`がGitに存在する場合は、代わりに次を実行します。

```bash
npm run cap:sync
npm run cap:open:ios
```

生成後の`ios/`は、Xcodeでの設定を保持するためGitへ追加します。

## 4. Xcode基本設定

1. Project navigatorで`App`プロジェクトを選ぶ
2. TARGETSの`App`を選ぶ
3. Signing & Capabilitiesを開く
4. TeamにApple Developer Programのチームを選ぶ
5. Bundle Identifierが`com.tkoki572.growthapp`であることを確認する
6. GeneralでDisplay Nameが`Rypace`であることを確認する
7. Versionを`1.0.0`、Buildを`1`に設定する
8. Automatically manage signingを有効にする

## 5. App Icon

1. `App/Assets.xcassets`の`AppIcon`を開く
2. `assets/ios/Rypace-AppIcon-1024.png`を1024×1024のApp Icon欄へ追加する
3. Xcodeの単一1024px画像からの自動生成を使用する
4. 角丸やエフェクトを画像へ追加しない
5. Light / Dark / Tintedの追加バリエーションはv1.0では必須にせず、標準アイコンを使用する

原本は1024×1024、RGB、透過なしで検証済みです。

## 6. Launch Screen

原本画像を画面比率ごとに切り抜かず、`LaunchScreen.storyboard`で安全に表示します。

1. `LaunchScreen.storyboard`を開く
2. ルートViewの背景色を`#FEFAF2`に設定する
3. Asset Catalogへ`Rypace-Splash-v1.0-90pct.png`を画像セットとして追加する
4. Image Viewを1つ配置し、その画像を選ぶ
5. Content Modeを`Aspect Fit`にする（`Aspect Fill`は使用しない）
6. Image Viewを画面中央に置き、四辺をSafe AreaまたはSuperviewへ制約する
7. コード、アニメーション、ネットワーク処理は追加しない
8. iPhone SE相当、標準iPhone、Max系、iPadで配置を確認する

素材は853×1844、RGB、透過なしです。元画像のロゴ・文字・配置・色は変更しません。

## 7. 権限とPrivacy

v1.0ではCamera、Microphone、Location、Contacts、Photos、Bluetooth、Notificationを使用しません。Info.plistへこれらのUsage Descriptionを追加しないでください。Xcode生成後、Signing & Capabilitiesに不要なCapabilityがないことも確認します。

## 8. 動作確認

Simulatorと実機の両方で次を確認します。

1. 起動時にLaunch ScreenからRypaceホームへ遷移する
2. Habit / Mission / Todo / Progressが動作する
3. XP / Level / streakが正しい
4. アプリ終了・再起動後もlocalStorageデータが残る
5. 日付変更処理が動作する
6. 外部Webサイトを読み込まず、オフラインでも起動する
7. App Icon、表示名、ステータスバー、Safe Areaを確認する
8. iPhoneの設定画面で不要な権限が表示されない

PWA / Safari版とiOS版のlocalStorageは別領域です。自動移行はv1.0の対象外です。

## 9. ArchiveとTestFlight

1. Xcode上部の実行先を`Any iOS Device (arm64)`へ変更する
2. Product → Archiveを選ぶ
3. Organizerで`Validate App`を実行する
4. 問題がなければ`Distribute App`を選ぶ
5. `App Store Connect` → `Upload`を選ぶ
6. App Store Connectでビルド処理完了を待つ
7. TestFlightの内部テストへ追加する
8. 実機TestFlightで最終確認する
9. 問題がなければApp Store提出情報と審査項目を入力する

## 10. Webコード変更時

```bash
npm run cap:sync
```

を実行してからXcodeで再ビルドします。GitHub Pagesは引き続きリポジトリ直下の`index.html`、`style.css`、`script.js`、`assets/`を使用します。
