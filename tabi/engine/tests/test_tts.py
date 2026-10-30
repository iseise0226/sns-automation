from pathlib import Path
import sys; sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tts import plan_times, GAP, LEAD, TAIL

def test_plan_times_spacing():
    starts, total = plan_times([1.0, 2.0], [0.0, 0.3])
    assert starts[0] == LEAD
    assert abs(starts[1] - (LEAD + 1.0 + GAP + 0.3)) < 1e-9
    assert abs(total - (starts[1] + 2.0 + TAIL)) < 1e-9
