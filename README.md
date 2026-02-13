# DicomViewer
<img width="1869" height="533" alt="DicomViewerイメージ画像2" src="https://github.com/user-attachments/assets/88f93dc2-66b9-4dc6-ac6f-e14c17690d83" />

## 概要
DICOM画像の表示・解析ができるビューワです。
リポジトリ内のzipファイルはアプリのビルドが完了しているものです。任意のディレクトリにて解凍すると使用可能となります。

## セットアップ(機能の追加を行う方向け)
### 前提条件
WindowsOS上での使用を想定しています。
リポジトリをクローンして各自の研究に必要な機能を追加してもらうことを想定しています。その場合、Windowsに以下がインストールされている必要があります。  
[Node.jsのインストールはこちらから](https://nodejs.org/ja)

動作を確認できたバージョン
  - node.js v22.18.0
  - npm 10.9.3

### インストール
1. リポジトリをクローン
Windowsのコマンドプロンプトを起動後、任意のディレクトリに移動した後、以下のコマンドでリポジトリをクローンします。URLはその都度ご確認ください。
クローンするとDicomViewer(クローン時点のこのレポジトリの名前)のディレクトリが作成されます。
```bash
git clone https://github.com/MaedaKei/DicomViewer
cd DicomViewer
```

2. 依存関係をインストール
リポジトリをクローンして作成されたディレクトリに移動後、以下のコマンドを実行します。
リポジトリ内のpackage-lock.jsonをもとに必要なパッケージをインストールします。
```bash
npm ci
```

3. 開発モードでの実行
アプリをビルドせずに、開発モードで素早く起動確認を行うことができます。
```bash
npm run start
```

4. アプリのビルド
electron-builderによりアプリのビルドを行っています。コード署名を回避するため出力はzip形式としています。
package.jsonのscriptセクションが編集されていない場合、以下のコマンドでアプリビルドが開始されます。
```bash
npm run build
```
ビルド時の条件はelectron-builder.ymlにて設定できますので、変更が必要な場合はお手数ですが記入例を検索の上編集をお願いします。

## 技術スタック
- **Runtime**: Electron v37.2.6
- **Language**: Vanilla JavaScript, HTML, CSS (No Framework)
- **DICOM Library**:
  - cornerstone-core v2.6.1
  - cornerstone-wado-image-loader v4.13.2
  - dicom-parser v1.8.21

## トラブルシューティング

### よくある問題

## ライセンス

MIT License

## サポート
問題報告はissuesにて受付中(2025/11/15現在)です。
## メモ
2025/11/14時点：
CT画像、セグメンテーションマスク、セグメンテーションマスクの差分画像を表示可能。
評価指標はセグメンテーションマスク用のVolumetricDSCを搭載済み。
今後の開発予定：
1．セグメンテーションマスク用の評価指標HDの実装
2．輪郭データ対応
3．症例の一括変更機能
4．線量分布対応
