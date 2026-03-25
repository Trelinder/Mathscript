from pathlib import Path
import runpy

_ = runpy.run_path(Path(__file__).with_name("main.py"))
