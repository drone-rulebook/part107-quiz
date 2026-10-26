# Part 107 Trick Questions（英語版ショート）

米国のドローン資格（FAA Part 107）のひっかけ問題を、毎日1本の縦型ショート（英語・約11〜16秒）にする置き場です。

- 動画の流れ（見た目の版5の形。themes/part107.json の「見た目の版」は 3）：1こま目から問題の全文（見出し PART 107 TRICK QUESTION・No.番号・ドローンの絵つき）→ 3択（選択肢C が空なら2択）→ カウントダウン（「Which one? Comment your answer」）→ 正解 → ひっかけ →（締めの声を使う動画だけ「Daily Part 107 trap / Subscribe」の帯と声）→ 1こま目と同じ「問題だけ」の画面に戻る（くり返し再生がつながる。つかみの画面・締めの画面はやめた）
- 問題の読み上げが長いときは、読み終わるまでカウントダウンを待つ（最大1.2秒。2択は2.6秒）
- 締めの声は「締めの声を使う」（偶数・奇数・全部・なし）で台本IDの偶数・奇数ごとに入れ分ける。どの動画に入れたかは status.json の「締めの声」に残る
日本語版（drone-rule-videos）とは別のチャンネル・別のスプレッドシートで動きます。

- 台本：英語版のスプレッドシートの「台本」シート（ウェブに公開した CSV を config.json の csv_url に入れる）
- 動画づくり：.github/workflows/render.yml（毎日 1時台・13時台。公開予定日が3日先までの「待ち」を動画にして videos/ に置く）
- 声：Kokoro（モデルは Apache-2.0、kokoro-onnx は MIT）。話者 af_heart。クレジットの表示義務なし
- 見た目・文言：themes/part107.json（「見た目の版」を上げると、まだ出していない動画を作り直す）
- 投稿：スプレッドシートのスクリプト（part107.gs）が毎日 9時台（日本時間）に YouTube に出す
- 結果：status.json
- 練習ページ（英語・無料）：site/build.py が台本シートの公開CSVから作り、.github/workflows/site.yml が毎日 GitHub Pages に出す（https://drone-rulebook.github.io/part107-quiz/ ）
  - はじめに1回だけ：置き場の Settings → Pages の Source を「GitHub Actions」にする
  - 文言・色・講座の紹介リンク（course）は site/site.json。メモに「限定公開」か「止める」がある行は出さない
  - 手元で確かめる：python site/build.py --csv tests/sample_site_en.csv --out _site
