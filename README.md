# Part 107 Trick Questions（英語版ショート）

米国のドローン資格（FAA Part 107）のひっかけ問題を、毎日1本の縦型ショート（英語・14秒）にする置き場です。
日本語版（drone-rule-videos）とは別のチャンネル・別のスプレッドシートで動きます。

- 台本：英語版のスプレッドシートの「台本」シート（ウェブに公開した CSV を config.json の csv_url に入れる）
- 動画づくり：.github/workflows/render.yml（毎日 1時台・13時台。公開予定日が3日先までの「待ち」を動画にして videos/ に置く）
- 声：Kokoro（モデルは Apache-2.0、kokoro-onnx は MIT）。話者 af_heart。クレジットの表示義務なし
- 見た目・文言：themes/part107.json（「見た目の版」を上げると、まだ出していない動画を作り直す）
- 投稿：スプレッドシートのスクリプト（part107.gs）が毎日 9時台（日本時間）に YouTube に出す
- 結果：status.json
