"""Restore the uncompressed WebGL assets required by the data-center page."""

import gzip
import hashlib
from pathlib import Path


root = Path(__file__).resolve().parents[1] / "frontend"
source = root / "webgl-build"
destination = root / "public" / "data-center" / "Build"
digests = {
    "data-center.data": "713469b74a53b2eeffacce2e668ff7c245b4d2004d8cc90f315292910159437a",
    "data-center.wasm": "040fe297bf5277b43fb4e56d2d4099972003e062b3783b273429938597d99779",
}

for name, expected in digests.items():
    parts = sorted(source.glob(f"{name}.gz.part*"))
    if not parts:
        raise FileNotFoundError(f"Missing WebGL parts for {name}")
    content = gzip.decompress(b"".join(part.read_bytes() for part in parts))
    if hashlib.sha256(content).hexdigest() != expected:
        raise ValueError(f"WebGL asset checksum mismatch: {name}")
    destination.mkdir(parents=True, exist_ok=True)
    (destination / name).write_bytes(content)