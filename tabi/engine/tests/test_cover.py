from pathlib import Path
import sys; sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image
from cover import make_cover, wrap

FONT = str(Path(__file__).resolve().parents[1] / "template" / "fonts" / "NotoSansJP-VF.ttf")

def test_make_cover_size(tmp_path):
    shots = tmp_path / "shots"; shots.mkdir()
    Image.new("RGB", (600, 800), "white").save(shots / "hero.png")
    S = {"service": "Alexa+", "title": "アマゾンのAI「Alexa+」日本で開始", "hook": "プライム会員なら追加料金なし", "lines": [{"fx": "shot", "shot": "hero"}]}
    out = make_cover(S, tmp_path, FONT)
    im = Image.open(out)
    assert im.size == (1080, 1920)

def test_make_cover_without_shot(tmp_path):
    S = {"service": "Muse", "title": "t", "hook": "h", "lines": []}
    assert Image.open(make_cover(S, tmp_path, FONT)).size == (1080, 1920)

def test_wrap_breaks_long_text():
    lines = wrap("プライム会員なら追加料金なし", lambda s: len(s) * 90, 900)
    assert len(lines) == 2 and "".join(lines) == "プライム会員なら追加料金なし"
