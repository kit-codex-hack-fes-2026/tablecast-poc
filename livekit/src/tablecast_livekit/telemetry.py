"""LiveKitの公開OTel接続とログ境界。送信障害を音声処理から分離する。"""

import json
import logging
import os
import re
import traceback
from collections.abc import Mapping
from functools import cache
from typing import Any

from livekit.agents import JobProcess, get_job_context
from livekit.agents.telemetry import set_tracer_provider
from livekit.agents.voice.agent_session import RecordingOptions
from opentelemetry import trace
from opentelemetry.context import Context
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import Span, SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.util.types import AttributeValue

_CREDENTIAL = re.compile(
    r"authorization|cookie|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|^token$",
    re.I,
)
_LOG_FIELDS = frozenset(logging.makeLogRecord({}).__dict__) | {"message", "asctime"}
_OPERATION_FIELDS = frozenset(
    {
        "event",
        "operation",
        "phase",
        "httpStatus",
        "requestId",
        "voiceSessionId",
        "tableSessionId",
        "releaseSha",
        "turnId",
        "speechId",
        "durationMs",
        "interrupted",
        "errorType",
    }
)


def capture_content() -> bool:
    return os.environ.get("TABLECAST_OTEL_CAPTURE_CONTENT") == "true"


def recording_options() -> RecordingOptions:
    return {
        "audio": False,
        "transcript": capture_content(),
        "traces": True,
        "logs": True,
        "redaction": not capture_content(),
    }


def safe_content(value: Any) -> Any:
    """顧客情報の設定にかかわらず、認証フィールドと既知の秘密値を除去する。"""
    if isinstance(value, Mapping):
        return {
            key: "[REDACTED]" if _CREDENTIAL.search(str(key)) else safe_content(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [safe_content(item) for item in value]
    if not isinstance(value, str):
        return value
    try:
        parsed = json.loads(value)
        if isinstance(parsed, (dict, list)):
            return json.dumps(safe_content(parsed), ensure_ascii=False)
    except (ValueError, TypeError):
        pass
    value = re.sub(r"\b(Bearer|Basic)\s+\S+", r"\1 [REDACTED]", value, flags=re.I)
    for key, secret in os.environ.items():
        if _CREDENTIAL.search(key) and len(secret) >= 8:
            value = value.replace(secret, "[REDACTED]")
    return re.sub(
        r"((?:password|api[_-]?key|access[_-]?token|refresh[_-]?token|secret)\s*[=:]\s*)[^\s,;]+",
        r"\1[REDACTED]",
        value,
        flags=re.I,
    )


class TelemetryLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        capture = capture_content()
        message = record.getMessage()
        record.msg = (
            safe_content(message)
            if capture
            else (message if re.fullmatch(r"tablecast\.[a-z_.]+", message) else record.name)
        )
        record.args = ()
        if record.exc_info:
            if capture:
                record.msg += "\n" + safe_content(
                    "".join(traceback.format_exception(*record.exc_info))
                )
            record.errorType = record.exc_info[0].__name__ if record.exc_info[0] else "Error"
        record.exc_info = None
        record.exc_text = None
        record.stack_info = None
        for key in list(record.__dict__):
            if key in _LOG_FIELDS:
                continue
            if _CREDENTIAL.search(key) or (not capture and key not in _OPERATION_FIELDS):
                del record.__dict__[key]
            else:
                value = safe_content(record.__dict__[key])
                record.__dict__[key] = (
                    json.dumps(value, ensure_ascii=False)
                    if isinstance(value, (dict, list))
                    else value
                )
        try:
            ctx = get_job_context()
            record.voiceSessionId = json.loads(ctx.job.metadata or "{}").get("voiceSessionId")
        except (RuntimeError, ValueError):
            pass
        return True


class SessionCorrelation(SpanProcessor):
    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        try:
            metadata = json.loads(get_job_context().job.metadata or "{}")
        except (RuntimeError, ValueError):
            return
        if isinstance(metadata.get("voiceSessionId"), str):
            span.set_attribute("tablecast.voice.session.id", metadata["voiceSessionId"])
        carrier = metadata.get("traceContext", {})
        if span.parent is None and isinstance(carrier, dict):
            remote = trace.get_current_span(TraceContextTextMapPropagator().extract(carrier))
            if remote.get_span_context().is_valid:
                span.add_link(remote.get_span_context())


@cache
def configure_telemetry() -> tuple[TracerProvider, LoggerProvider] | None:
    endpoint = os.environ.get("TABLECAST_OTEL_ENDPOINT", "").rstrip("/")
    if not endpoint:
        return None
    attributes: dict[str, AttributeValue] = {
        "service.namespace": "tablecast",
        "service.name": "tablecast-voice",
        "service.version": os.environ.get("TABLECAST_RELEASE_SHA", "local"),
        "deployment.environment.name": os.environ.get("TABLECAST_ENV", "development"),
    }
    if attributes["deployment.environment.name"] == "preview":
        attributes["tablecast.pr.number"] = os.environ.get("TABLECAST_PR_NUMBER", "")
    resource = Resource(attributes)
    headers = (
        {"Authorization": os.environ["TABLECAST_OTEL_AUTHORIZATION"]}
        if os.environ.get("TABLECAST_OTEL_AUTHORIZATION")
        else {}
    )
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(SessionCorrelation())
    provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(
                endpoint=f"{endpoint}/v1/traces",
                headers=headers,
                timeout=5,
            )
        )
    )
    trace.set_tracer_provider(provider)
    set_tracer_provider(provider, metadata=attributes, allow_pii=capture_content())
    # Cloudは自身のlogger providerを使う。共有すると二つのhandlerが同じ宛先へ重複送信する。
    logs = LoggerProvider(resource=resource)
    logs.add_log_record_processor(
        BatchLogRecordProcessor(
            OTLPLogExporter(
                endpoint=f"{endpoint}/v1/logs",
                headers=headers,
                timeout=5,
            )
        )
    )
    handler = LoggingHandler(level=logging.INFO, logger_provider=logs)
    handler.addFilter(lambda record: not record.name.startswith(("opentelemetry", "urllib3")))
    root = logging.getLogger()
    root.addHandler(handler)
    # 後から追加されるCloud handlerも、ここで除去済みの同じLogRecordを受け取る。
    for target in root.handlers:
        target.addFilter(TelemetryLogFilter())
    return provider, logs


def prewarm_telemetry(_process: JobProcess) -> None:
    configure_telemetry()


def flush_telemetry() -> None:
    if providers := configure_telemetry():
        for provider in providers:
            provider.force_flush(timeout_millis=5000)
