from pathlib import Path
import sys; sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from topics import record, is_done, update_weights, parse_insights

T = {"done": [], "weights": {"ai": 1.0, "money": 1.0, "work": 1.0, "life": 1.0}, "hooks": [], "weekly": []}

def test_record_and_is_done():
    t = record(T, {"date": "2026-11-01", "service": "Muse", "category": "ai", "hook": "頼めば最後まで", "media_id": "1"})
    assert is_done(t, "muse") and not is_done(t, "dots")
    assert T["done"] == []

def test_update_weights_moves_toward_better_category():
    stats = [{"category": "ai", "score": 300}, {"category": "ai", "score": 260}, {"category": "life", "score": 40}]
    w = update_weights(T, stats)["weights"]
    assert w["ai"] > 1.0 > w["life"]
    assert all(0.3 <= v <= 3.0 for v in w.values())

def test_parse_insights():
    log = ('post\tPost via Graph API\t2026-11-03T01:00:00Z INSIGHT 111 {"views":1000,"saved":10,"shares":2,"follows":3}\n'
           'post\tPost via Graph API\t2026-11-03T01:00:01Z INSIGHT 222 {"views":200,"saved":0,"shares":0,"follows":0}\n')
    s = parse_insights(log, {"111": "ai", "222": "life"})
    assert s == [{"media_id": "111", "category": "ai", "score": 1000 / 100 + 10 * 3 + 2 * 3 + 3 * 5},
                 {"media_id": "222", "category": "life", "score": 2.0}]
