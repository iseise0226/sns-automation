from pathlib import Path
import sys; sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verify import check_facts, numbers_in

SRC = {"price": {"url": "https://x.example/p", "taken": "2026-10-30", "quote": "パワー 月額2,799円 マキシマム 月額13,990円"}}

def test_numbers_in_normalizes_commas_and_width():
    assert numbers_in("月２，７９９円と13,990円") == ["2799", "13990"]

def test_ok_when_numbers_found_in_quote():
    s = {"lines": [{"t": "有料は月2,799円から", "src": ["price"]}]}
    assert check_facts(s, SRC) == []

def test_ng_when_number_has_no_source():
    s = {"lines": [{"t": "有料は月2,799円から", "src": []}]}
    assert "出典なし" in check_facts(s, SRC)[0]

def test_ng_when_number_not_in_quote():
    s = {"lines": [{"t": "有料は月1,980円から", "src": ["price"]}]}
    assert "1980" in check_facts(s, SRC)[0]

def test_ng_when_source_id_missing():
    s = {"lines": [{"t": "10月23日から", "src": ["release"]}]}
    assert "release" in check_facts(s, SRC)[0]

def test_big_card_is_checked_too():
    s = {"lines": [{"t": "料金はこちら", "big": "月3,000円", "src": ["price"]}]}
    assert "3000" in check_facts(s, SRC)[0]

def test_brand_line_is_skipped():
    s = {"lines": [{"t": "使う前の30秒チェックは、フォローで", "brand": True, "src": []}]}
    assert check_facts(s, SRC) == []

def test_no_number_needs_no_source():
    s = {"lines": [{"t": "頼めば最後までやってくれる", "src": []}]}
    assert check_facts(s, SRC) == []
