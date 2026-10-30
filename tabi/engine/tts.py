"""script.json の各文を VOICEVOX で読み上げ、audio/ と lines.json を作る。カレントは days/YYYY-MM-DD。"""
import json, os, subprocess, time, urllib.request, urllib.parse, wave

B = "http://127.0.0.1:50021"
ENGINE = os.environ.get("VOICEVOX_RUN", "C:/Users/USER/Downloads/VOICEVOX/VOICEVOX/vv-engine/run.exe")
LEAD, GAP, TAIL = 0.3, 0.25, 2.0

def ensure_engine():
    try:
        urllib.request.urlopen(B + "/version", timeout=2); return
    except Exception:
        pass
    subprocess.Popen([ENGINE, "--host", "127.0.0.1", "--port", "50021"], cwd=os.path.dirname(ENGINE),
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     creationflags=0x00000008 if os.name == "nt" else 0)
    for _ in range(90):
        try:
            urllib.request.urlopen(B + "/version", timeout=2); return
        except Exception:
            time.sleep(2)
    raise RuntimeError("VOICEVOX が起動しません")

def plan_times(durs, pauses):
    starts, t = [], LEAD
    for d, p in zip(durs, pauses):
        t += p; starts.append(t); t += d + GAP
    return starts, starts[-1] + durs[-1] + TAIL

def synth(text, sid, speed):
    q = json.load(urllib.request.urlopen(urllib.request.Request(
        f"{B}/audio_query?speaker={sid}&text=" + urllib.parse.quote(text), method="POST")))
    q["speedScale"] = speed; q["prePhonemeLength"] = 0.05; q["postPhonemeLength"] = 0.08
    r = urllib.request.Request(f"{B}/synthesis?speaker={sid}", data=json.dumps(q).encode(),
                               headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(r).read()

def main():
    ensure_engine()
    S = json.load(open("script.json", encoding="utf-8"))
    sid, speed = S["voice"]["id"], S["voice"].get("speed", 1.15)
    frames, durs, rate = [], [], 24000
    for i, l in enumerate(S["lines"]):
        fn = f"audio/l{i:03d}.wav"; open(fn, "wb").write(synth(l.get("say", l["t"]), sid, speed))
        w = wave.open(fn); rate = w.getframerate(); durs.append(w.getnframes() / rate)
        frames.append(w.readframes(w.getnframes())); w.close()
    starts, total = plan_times(durs, [l.get("pause", 0) for l in S["lines"]])
    buf = bytearray(int(total * rate) * 2)
    for st, fr in zip(starts, frames):
        o = int(st * rate) * 2; buf[o:o + len(fr)] = fr
    w = wave.open("audio/narration.wav", "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
    w.writeframes(bytes(buf)); w.close()
    json.dump({"total": round(total, 2), "lines": [{"i": i, "start": round(s, 3), "dur": round(d, 3)}
               for i, (s, d) in enumerate(zip(starts, durs))]}, open("lines.json", "w", encoding="utf-8"))
    print("lines", len(durs), "total", round(total, 1), "s")

if __name__ == "__main__":
    main()
