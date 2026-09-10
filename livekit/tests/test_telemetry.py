"""実OTLP送信境界で収集切替、相関、重複と送信障害を検証する。"""

import gzip
import logging
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from opentelemetry.proto.collector.logs.v1.logs_service_pb2 import ExportLogsServiceRequest
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest

from tablecast_livekit.telemetry import TelemetryLogFilter, recording_options, safe_content


@pytest.mark.parametrize("capture", [False, True], ids=["本文を除去", "本文を収集"])
def test_収集設定によらず認証情報を除去し録音を追加しない(monkeypatch, capture):
    # Given: 顧客本文と認証情報を含む構造化ログ。
    monkeypatch.setenv("TABLECAST_OTEL_CAPTURE_CONTENT", str(capture).lower())
    monkeypatch.setenv("OPENAI_API_KEY", "tablecast-secret-key")
    record = logging.makeLogRecord(
        {
            "name": "tablecast.voice",
            "levelno": logging.ERROR,
            "msg": "顧客からの質問 tablecast-secret-key",
            "args": (),
            "voiceSessionId": "tablecast-session",
            "customer": "顧客情報",
            "tool": {"arguments": "会話内容", "apiKey": "private"},
        }
    )
    # When: GrafanaとCloudのhandlerより前のフィルターを通す。
    assert TelemetryLogFilter().filter(record)
    encoded = str(record.__dict__)
    # Then: 本文のみ切り替わり、相関と資格情報除去は維持する。
    assert ("顧客からの質問" in encoded) is capture
    assert ("会話内容" in encoded) is capture
    assert "tablecast-secret-key" not in encoded
    assert "private" not in encoded
    assert record.__dict__["voiceSessionId"] == "tablecast-session"
    assert safe_content({"Cookie": "private", "text": "Bearer private"}) == {
        "Cookie": "[REDACTED]",
        "text": "Bearer [REDACTED]",
    }
    assert recording_options() == {
        "audio": False,
        "transcript": capture,
        "traces": True,
        "logs": True,
        "redaction": not capture,
    }


@pytest.mark.parametrize(
    "capture,status",
    [(False, 200), (True, 200), (True, 503)],
    ids=["本文を除去", "本文を収集", "送信先が停止"],
)
def test_実SDKから一度だけ送信し宛先の停止で業務処理を失敗させない(capture, status):
    # Given: protobufを受ける実HTTP境界。SDKのglobal状態は子プロセスに隔離する。
    received: list[tuple[str, bytes]] = []

    class Collector(BaseHTTPRequestHandler):
        def do_POST(self):
            body = self.rfile.read(int(self.headers["Content-Length"]))
            if self.headers.get("Content-Encoding") == "gzip":
                body = gzip.decompress(body)
            received.append((self.path, body))
            self.send_response(status)
            self.end_headers()

        def log_message(self, format: str, *args):
            pass

    collector = ThreadingHTTPServer(("127.0.0.1", 0), Collector)
    thread = threading.Thread(target=collector.serve_forever, daemon=True)
    thread.start()
    script = """
import asyncio, logging, os, pickle
import httpx
from livekit.agents.telemetry import tracer
from tablecast_livekit.api import VoiceAPI
from tablecast_livekit.telemetry import configure_telemetry, flush_telemetry
configure_telemetry()
configure_telemetry()
logging.getLogger().setLevel(logging.INFO)
async def run():
    async def respond(request):
        assert "traceparent" in request.headers
        return httpx.Response(200, headers={"X-Request-Id": "tablecast-request"},
                              json={"result": {"ok": True}})
    with tracer.start_as_current_span("tablecast.voice.test",
            attributes={"lk.pii.input": "顧客の会話", "lk.speech_id": "tablecast-speech"}):
        async with httpx.AsyncClient(base_url="https://tablecast.test",
                                    transport=httpx.MockTransport(respond)) as client:
            result = await VoiceAPI(client, "tablecast-session").tool(
                "tablecast-turn", "getCatalog", "tablecast-call", {"query": "商品"})
            assert result == {"ok": True}
asyncio.run(run())
# IPCと同じpickle往復後、子で処理済みのログと設定前の起動ログを親へ渡す。
for event, fields in [
    ("tablecast.voice_http", {"tablecastTelemetryProcess": os.getpid() + 1}),
    ("tablecast.startup", {}),
]:
    record = logging.makeLogRecord({"name": "tablecast.voice", "msg": event,
                                   "levelno": logging.INFO, "args": (),
                                   "process": os.getpid() + 1, **fields})
    logging.getLogger(record.name).handle(pickle.loads(pickle.dumps(record)))
flush_telemetry()
print("TABLECAST_COMPLETED")
"""
    try:
        # When: 通常の業務API境界を計測し、二度のsetup後にflushする。
        result = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=30,
            env={
                **os.environ,
                "TABLECAST_OTEL_ENDPOINT": f"http://127.0.0.1:{collector.server_port}",
                "TABLECAST_OTEL_AUTHORIZATION": "",
                "TABLECAST_OTEL_CAPTURE_CONTENT": str(capture).lower(),
                "TABLECAST_ENV": "preview",
                "TABLECAST_PR_NUMBER": "65",
            },
        )
    finally:
        collector.shutdown()
        collector.server_close()
        thread.join()
    # Then: 送信障害でも業務結果を返す。成功時は各spanと完了ログが一度だけ届く。
    assert result.returncode == 0, result.stderr
    assert "TABLECAST_COMPLETED" in result.stdout
    assert received
    if status != 200:
        return
    spans = [
        span
        for path, body in received
        if path == "/v1/traces"
        for resource in ExportTraceServiceRequest.FromString(body).resource_spans
        for scope in resource.scope_spans
        for span in scope.spans
    ]
    assert sorted(span.name for span in spans) == ["tablecast.voice.api", "tablecast.voice.test"]
    parent = next(span for span in spans if span.name == "tablecast.voice.test")
    child = next(span for span in spans if span.name == "tablecast.voice.api")
    assert child.trace_id == parent.trace_id
    assert child.parent_span_id == parent.span_id
    assert (b"lk.pii.input" in parent.SerializeToString()) is capture
    assert b"tablecast-request" in child.SerializeToString()
    logs = [
        log
        for path, body in received
        if path == "/v1/logs"
        for resource in ExportLogsServiceRequest.FromString(body).resource_logs
        for scope in resource.scope_logs
        for log in scope.log_records
    ]
    completed = [log for log in logs if log.body.string_value == "tablecast.voice_http"]
    assert len(completed) == 1
    assert completed[0].trace_id == child.trace_id
    assert completed[0].span_id == child.span_id
    assert sum(log.body.string_value == "tablecast.startup" for log in logs) == 1
