"""Run with the voice venv's Python; validates real offline synthesis."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

root = Path.home() / "Library/Application Support/Papinho/voice"
samples = Path(tempfile.mkdtemp(prefix="papinho-voices-"))
requests = [{"text": "Oi, eu sou o Papinho. Pode falar comigo à vontade. Como foi o seu dia?",
             "voice": voice, "rate": 175, "path": str(samples / f"{voice}.wav")}
            for voice in ("pm_alex", "pf_dora", "pm_santa")]
result = subprocess.run(
    [sys.executable, str(Path(__file__).with_name("neural_voice.py")), str(root)],
    input="".join(json.dumps(request) + "\n" for request in requests),
    text=True, capture_output=True, timeout=120, check=True,
)
responses = [json.loads(line) for line in result.stdout.splitlines()]
assert len(responses) == len(requests), (result.stdout, result.stderr)
for request, response in zip(requests, responses):
    assert response["ok"], response
    audio, rate = sf.read(request["path"])
    assert rate == 24000 and len(audio) > rate
    assert np.isfinite(audio).all() and 0.01 < np.max(np.abs(audio)) <= 0.96
    print(json.dumps({"voice": request["voice"], "path": request["path"], **response}))
