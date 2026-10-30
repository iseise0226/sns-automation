"""その日の作業フォルダ days/YYYY-MM-DD を雛形から作る。"""
import shutil, sys, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def new_day(root: Path, date: str) -> Path:
    d = root / "days" / date
    if not d.exists():
        shutil.copytree(root / "engine" / "template", d)
    (d / "shots").mkdir(exist_ok=True)
    (d / "audio").mkdir(exist_ok=True)
    return d

if __name__ == "__main__":
    date = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat()
    print(new_day(ROOT, date))
