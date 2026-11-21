"""Restore the uncompressed WebGL assets required by the data-center page."""

import gzip
import hashlib
from pathlib import Path


root = Path(__file__).resolve().parents[1] / "frontend"
source = root / "webgl-build"
destination = root / "public" / "data-center" / "Build"
digests = {
    "data-center.data": "2e2aab6005140096552c9f595da0930d68f95bbf01d399fa4075ebd4d8f86699",
    "data-center.wasm": "5a4fda9955508d4a514f8d4ed52e6f668321d7ee1cdc30a9188767a06fb6601c",
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