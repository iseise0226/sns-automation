from pathlib import Path
import sys; sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from capture import clip_box, rel_box, shot_specs

def test_clip_box_starts_above_found_text_and_keeps_height():
    assert clip_box({"x": 10, "y": 900, "width": 300, "height": 40}, page_h=5000, height=600, width=430) == \
        {"x": 0, "y": 860, "width": 430, "height": 600}

def test_clip_box_is_kept_inside_page():
    b = clip_box({"x": 0, "y": 4900, "width": 300, "height": 40}, page_h=5000, height=600, width=430)
    assert b["y"] + b["height"] <= 5000

def test_rel_box_is_ratio_of_clip():
    clip = {"x": 0, "y": 1000, "width": 400, "height": 500}
    assert rel_box({"x": 20, "y": 1100, "width": 200, "height": 100}, clip) == [0.03, 0.18, 0.55, 0.24]  # 上下左右に10pxの余白

def test_shot_specs_one_per_shot():
    src = {"a": {"url": "u1", "shot": "hero", "find": "x"}, "b": {"url": "u1", "shot": "hero", "find": "y"},
           "c": {"url": "u2", "shot": "price", "find": "z", "height": 300, "mark": "3,000"}}
    specs = shot_specs(src)
    assert [s["shot"] for s in specs] == ["hero", "price"]
    assert specs[1]["height"] == 300 and specs[1]["mark"] == "3,000"
