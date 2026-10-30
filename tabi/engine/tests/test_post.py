from pathlib import Path
import sys; sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from post import build_caption

S = {"caption": "本文", "hashtags": ["#新サービス", "#AIツール"], "pr": False}
SRC = {"price": {"url": "https://muse.example/pricing", "taken": "2026-10-30", "quote": "…"}}

def test_caption_has_sources_and_tags():
    c = build_caption(S, SRC)
    assert c.startswith("本文")
    assert "https://muse.example/pricing（2026-10-30時点）" in c
    assert c.rstrip().endswith("#新サービス #AIツール")

def test_pr_goes_first():
    assert build_caption({**S, "pr": True}, SRC).startswith("【PR】")

def test_length_limit():
    assert len(build_caption({**S, "caption": "あ" * 3000}, SRC)) <= 2200

def test_voice_credit():
    assert "VOICEVOX:No.7" in build_caption(S, SRC)
