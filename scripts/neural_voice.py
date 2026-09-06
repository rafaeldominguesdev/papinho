"""Persistent offline Kokoro worker. One JSON request/response per line."""
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro


def main():
    root = Path(sys.argv[1])
    model = Kokoro(str(root / "kokoro-v1.0.onnx"), str(root / "voices-v1.0.bin"))
    for line in sys.stdin:
        try:
            request = json.loads(line)
            started = time.monotonic()
            voice = request["voice"]
            if voice not in ("pm_alex", "pf_dora", "pm_santa"):
                raise ValueError("Voz brasileira não reconhecida")
            audio, sample_rate = model.create(
                request["text"], voice=voice,
                speed=max(0.7, min(1.4, request.get("rate", 175) / 175)),
                lang="pt-br",
            )
            if not len(audio) or not np.isfinite(audio).all():
                raise ValueError("O motor de voz não gerou áudio válido")
            # Evita distorção, sem aumentar ruído em trechos silenciosos.
            peak = float(np.max(np.abs(audio)))
            if peak > 0.95:
                audio = audio * (0.95 / peak)
            sf.write(request["path"], audio, sample_rate, subtype="PCM_16")
            print(json.dumps({"ok": True, "seconds": len(audio) / sample_rate,
                              "elapsed": time.monotonic() - started}), flush=True)
        except Exception as error:
            print(json.dumps({"ok": False, "error": str(error)}), flush=True)


if __name__ == "__main__":
    main()
