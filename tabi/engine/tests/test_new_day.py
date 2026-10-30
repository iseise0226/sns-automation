from pathlib import Path
import sys; sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from new_day import new_day

def test_new_day_creates_folders(tmp_path):
    (tmp_path / "engine" / "template").mkdir(parents=True)
    (tmp_path / "engine" / "template" / "package.json").write_text("{}")
    d = new_day(tmp_path, "2026-11-01")
    assert d == tmp_path / "days" / "2026-11-01"
    assert (d / "shots").is_dir() and (d / "audio").is_dir()
    assert (d / "package.json").exists()

def test_new_day_keeps_existing(tmp_path):
    (tmp_path / "engine" / "template").mkdir(parents=True)
    d = new_day(tmp_path, "2026-11-01")
    (d / "script.json").write_text("keep")
    new_day(tmp_path, "2026-11-01")
    assert (d / "script.json").read_text() == "keep"
