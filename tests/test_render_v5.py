# -*- coding: utf-8 -*-
"""見た目の版5（掴み・ループ）の決まりを確かめる（英語版。themes/part107.json の「見た目の版」は 3）。
動画は書き出さない（数秒で終わる）。

  python tests/test_render_v5.py
"""
import os, sys, unittest
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import render  # noqa: E402
from styles import LOOKS, base as B  # noqa: E402

# 2択（選択肢C が空）。根拠：14 CFR 91.17(a)(1)（107.27 で sUAS にも適用。飲んでから8時間は操縦しない）
TWO = {"q1": "You had one beer *6 hours* ago and want to fly your drone under Part 107.", "q2": "Legal or not?",
       "a": "Legal", "b": "Not legal", "c": "", "answer": "B", "trap": "Trap: The rule is *8 hours* after drinking!"}
# 問題文が長めの3択（inbox/queue.json の E007）
LONG = {"q1": "Airport Class E surface area", "q2": "What do you need before flying there?", "a": "Nothing, it's E",
        "b": "Call the airport", "c": "ATC authorization", "answer": "C", "trap": "Trap: Class E *surface area* needs ATC OK!"}


def small_theme():
    th = render.load_theme()
    th["画質"] = "720x1280"          # 確かめは小さい画面で
    th["声"] = dict(th.get("声", {}), 使う=False)
    return th


def words_of(sc):
    return set(" ".join(sc.get(k, "") for k in ("q1", "q2", "a", "b", "c", "trap")).replace("*", "").split())


class V5Test(unittest.TestCase):
    def test_時刻表(self):
        t = B.Timeline()
        self.assertAlmostEqual(t.dur, B.TR1 + B.HOLD)
        self.assertLess(t.count0, t.reveal)
        self.assertLess(t.trap, t.tr0)
        c = B.Timeline(cta=True)
        self.assertAlmostEqual(c.dur - t.dur, B.CTA_LEN)
        self.assertLess(c.times()["trap"][1], c.cta0)
        e = B.Timeline(extra=1.0)
        self.assertAlmostEqual(e.count0 - t.count0, 1.0)
        self.assertAlmostEqual(e.dur - t.dur, 1.0)

    def test_締めの声は偶数と奇数で分かれる(self):
        th = small_theme()
        self.assertEqual(th["締めの声を使う"], "偶数")
        self.assertTrue(B.cta_on("e012", th))
        self.assertFalse(B.cta_on("e013", th))
        th["締めの声を使う"] = "なし"
        self.assertFalse(B.cta_on("e012", th))
        th["締めの声を使う"] = "全部"
        self.assertTrue(B.cta_on("e013", th))

    def test_2択の台本を受け付ける(self):
        r = {"問題1行目": TWO["q1"], "問題2行目": TWO["q2"], "選択肢A": TWO["a"], "選択肢B": TWO["b"], "選択肢C": "",
             "正解": "B", "ひっかけ": TWO["trap"]}
        sc, why = render.script_of(r)
        self.assertIsNotNone(sc, why)
        r["正解"] = "C"                       # 2択で C は使えない
        self.assertIsNone(render.script_of(r)[0])
        r["正解"] = "B"; r["選択肢B"] = ""     # B が空はだめ
        self.assertIsNone(render.script_of(r)[0])

    def test_1こま目に問題が出ていて最後は1こま目と同じ(self):
        th = small_theme()
        for style in LOOKS:
            for sc, vid in ((render.SAMPLE, "e013"), (render.SAMPLE, "e012"), (TWO, "e901"), (LONG, "e008")):
                look = render.make_look(sc, th, style, vid)
                f0 = np.asarray(look.frame(0.0), dtype=np.float32)
                bg = np.asarray(look.bg.convert("RGB"), dtype=np.float32)
                y0, y1 = int(look.q_y * render.dk.R), int((look.q_y + look.qb.h) * render.dk.R)
                self.assertGreater(np.abs(f0[y0:y1] - bg[y0:y1]).mean(), 3.0, (style, vid, "1こま目に問題文が無い"))
                last = np.asarray(look.frame(look.dur - 1.0 / render.FPS), dtype=np.float32)
                self.assertLess(np.abs(f0 - last).mean(), 2.5, (style, vid, "最後が1こま目と違う"))

    def test_大事な文字は安全な範囲の中(self):
        th = small_theme()
        for style in LOOKS:
            for sc, vid in ((render.SAMPLE, "e013"), (TWO, "e902"), (LONG, "e007")):
                look = render.make_look(sc, th, style, vid)
                self.assertLessEqual(look.zone_top + B.ZONE, B.CONTENT_BOTTOM + 1, (style, vid))
                self.assertLessEqual(B.ICON_X + B.ICON_R, render.dk.SAFE["right"])
                self.assertLess(look.prompt_y, B.FOOT_Y - 10)

    def test_英語は単語の途中で改行しない(self):
        th = small_theme()
        for style in LOOKS:
            for sc, vid in ((render.SAMPLE, "e013"), (TWO, "e903"), (LONG, "e007")):
                look = render.make_look(sc, th, style, vid)
                src = words_of(sc) | {"Trap"}
                for tb in [look.qb] + list(look.cb) + [look.tb]:
                    self.assertTrue(tb.fits, (style, vid))
                    for line in tb.lines:
                        text = "".join(s for s, _, _ in line)
                        self.assertEqual(text, text.strip(), (style, vid, "行の頭か終わりに空白"))
                        for w in text.split():
                            self.assertIn(w, src, (style, vid, "単語の途中で改行：" + w))

    def test_英語の文言(self):
        th = render.load_theme()
        self.assertEqual(th["言語"], "en")
        self.assertGreaterEqual(th["見た目の版"], 3)
        for k in ("ラベル", "コメント", "毎日", "締めの声"):
            self.assertTrue(th["文言"].get(k), k)
        for k in ("締め_登録", "締め_案内"):
            self.assertNotIn(k, th["文言"])
        self.assertNotIn("つかみ", th)
        look = render.make_look(render.SAMPLE, small_theme(), "モーション", "e012")
        self.assertEqual(look.trap_parts()[0], "Trap")
        self.assertEqual(look.cta_lines(), ("Daily Part 107 trap", "Subscribe"))
        self.assertEqual(look.no_text(), "No.12")


if __name__ == "__main__":
    unittest.main(verbosity=1)
