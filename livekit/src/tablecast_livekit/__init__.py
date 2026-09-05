"""TableCastの音声接続。"""

import os

# Sileroが読むONNX Runtimeを初期化する前に、公式のプロセス単位opt-outを指定する。
os.environ.setdefault("ORT_DISABLE_TELEMETRY", "1")
