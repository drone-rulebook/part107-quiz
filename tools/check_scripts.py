# -*- coding: utf-8 -*-
"""inbox/queue.json（まとめて作った台本）を点検する。動画に入りきるか（3つの見た目すべて）も確かめる。

使い方：python tools/check_scripts.py [inbox/queue.json]
ひとつでも直す所があれば、その一覧を出して終わり値 1 で終わる。
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
os.chdir(HERE)
import render
from styles import LOOKS
from styles import base as B

LIMITS = {"title": 70, "q1": 30, "q2": 48, "a": 20, "b": 20, "c": 20, "trap": 52, "explain": 260, "basis": 120}
NEED = ["qid", "title", "q1", "q2", "a", "b", "c", "answer", "trap", "explain", "basis"]


def check(path):
    data = json.load(open(path, encoding="utf-8"))
    errs = []
    if data.get("format") != "part107-inbox/v1" or not isinstance(data.get("scripts"), list):
        return ["format は part107-inbox/v1、scripts は配列にしてください"]
    theme = render.load_theme()
    theme["声"]["使う"] = False
    seen = set()
    for k, s in enumerate(data["scripts"]):
        tag = f"#{k + 1} {s.get('qid', '?')}"
        for f in NEED:
            if not str(s.get(f, "")).strip():
                errs.append(f"{tag}: {f} が空です")
        for f, n in LIMITS.items():
            if len(str(s.get(f, ""))) > n:
                errs.append(f"{tag}: {f} が長すぎます（{len(str(s.get(f, '')))}字 > {n}字）")
        if str(s.get("answer", "")).strip().upper() not in ("A", "B", "C"):
            errs.append(f"{tag}: answer は A・B・C のどれか")
        if not str(s.get("trap", "")).startswith("Trap: "):
            errs.append(f"{tag}: trap は「Trap: 」で始めてください")
        if s.get("qid") in seen:
            errs.append(f"{tag}: qid が重なっています")
        seen.add(s.get("qid"))
        if re.search(r"[^\x20-\x7E’‘“”–—…]", "".join(str(s.get(f, "")) for f in ("q1", "q2", "a", "b", "c", "trap"))):
            errs.append(f"{tag}: 動画の文字に英語以外の文字があります")
        row = {"問題1行目": s.get("q1", ""), "問題2行目": s.get("q2", ""), "選択肢A": s.get("a", ""), "選択肢B": s.get("b", ""),
               "選択肢C": s.get("c", ""), "正解": s.get("answer", ""), "ひっかけ": s.get("trap", "")}
        sc, why = render.script_of(row)
        if sc is None:
            errs.append(f"{tag}: {why}")
            continue
        for style in LOOKS:
            look = render.make_look(sc, theme, style, "e%03d" % (k + 1))
            parts = [("問題", getattr(look, "qb", None))] + [("選択肢" + "ABC"[i], b) for i, b in enumerate(getattr(look, "cb", []) or [])]
            if hasattr(look, "tb"):
                parts.append(("ひっかけ", look.tb))
            for name, tb in parts:
                if tb is not None and not tb.fits:
                    errs.append(f"{tag}: {style} で {name} が入りきりません（短くしてください）")
            # 見た目の版5：問題文の下に、選択肢とカウントダウン・コメントの呼びかけ・ひっかけの場所（ZONE）が残るか
            if look.zone_top + B.ZONE > B.CONTENT_BOTTOM + 1:
                errs.append(f"{tag}: {style} で 問題文が長く、カウントダウンとひっかけの場所が足りません（短くしてください）")
    errs += check_theme(theme, data["scripts"])
    return errs


def check_theme(theme, scripts):
    """画面に出す決まった文言（見出し・コメントの呼びかけ・「毎日」の文言・締めの帯）が、3つの見た目すべてで入りきるか"""
    errs = []
    row = next((s for s in scripts if s.get("q1")), None)
    if row is None:
        return errs
    sc, _ = render.script_of({"問題1行目": row.get("q1", ""), "問題2行目": row.get("q2", ""), "選択肢A": row.get("a", ""),
                              "選択肢B": row.get("b", ""), "選択肢C": row.get("c", ""), "正解": row.get("answer", ""),
                              "ひっかけ": row.get("trap", "")})
    if sc is None:
        return errs
    w = theme["文言"]
    for key in ("ラベル", "コメント", "毎日"):
        if not str(w.get(key, "")).strip():
            errs.append(f"themes の 文言「{key}」が空です")
    if re.search(r"\d", w.get("締めの声", "").replace("107", "")) or len(w.get("締めの声", "").split()) > 8:
        errs.append("締めの声は数字なし・8語以内にしてください（2.0秒に収まらないと省かれます）")
    for style in LOOKS:
        look = render.make_look(sc, theme, style, "e002")       # 偶数の台本ID（締めの帯ありの形）も作れるか
        dk = render.dk
        safe_w = dk.SAFE["right"] - dk.SAFE["left"]
        label_end = dk.SAFE["left"] + dk.text_sprite(look.label_text() + "  " + look.no_text(), (0, 0, 0, 255), "Bold", 26).width / dk.R
        if label_end > B.ICON_X - B.ICON_R - 4:
            errs.append(f"{style} で 見出し（ラベルと No.）がドローンの絵に重なります")
        pr = look.prompt_sprite((0, 0, 0, 255), (0, 0, 0, 255))
        if pr is not None and pr.width / dk.R - 2 * dk.PAD > safe_w:
            errs.append(f"コメントの呼びかけ が {style} で入りきりません")
        for name, text, px in [("毎日", w.get("毎日", ""), 22)] + [("締めの帯", t, 46 if i == 0 else 28) for i, t in enumerate(look.cta_lines())]:
            if text and dk.text_sprite(text, (0, 0, 0, 255), "Black", px).width / dk.R - 2 * dk.PAD > safe_w:
                errs.append(f"{name}「{text}」が {style} で入りきりません")
    return errs


if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "inbox", "queue.json")
    errs = check(p)
    if errs:
        print("直す所があります：")
        for e in errs:
            print(" -", e)
        sys.exit(1)
    print("OK：", len(json.load(open(p, encoding="utf-8"))["scripts"]), "本、すべて点検を通りました")
