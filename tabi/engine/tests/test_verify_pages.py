from pathlib import Path
import sys; sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verify import check_facts

SRC = {"price": {"url": "https://x.example/p", "taken": "2026-10-31", "quote": "月額3,000円"}}

def test_pages_are_the_judge_not_the_quote():
    # quote には 3,000 があっても、実際のページ本文に無ければNG
    s = {"lines": [{"t": "月額3,000円", "src": ["price"]}]}
    assert check_facts(s, SRC, pages={"price": "月額2,980円のプラン"})

def test_ok_when_page_has_number():
    s = {"lines": [{"t": "月額3,000円", "src": ["price"]}]}
    assert check_facts(s, SRC, pages={"price": "…月額3,000円の単独の…"}) == []

def test_ng_when_page_missing():
    s = {"lines": [{"t": "月額3,000円", "src": ["price"]}]}
    assert "ページ本文" in check_facts(s, SRC, pages={})[0]
