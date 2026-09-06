"""LiveKitのLLM拡張境界へ認証済みTableCast応答を登録する。"""

from collections.abc import AsyncGenerator, Callable
from contextlib import aclosing
from typing import Any
from uuid import uuid4

from livekit.agents import APIConnectOptions, APIError, llm
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, NOT_GIVEN, NotGivenOr


class TablecastLLM(llm.LLM):
    def __init__(self, response: Callable[[llm.ChatContext, str], AsyncGenerator[str]]) -> None:
        super().__init__()
        self.response = response

    @property
    def model(self) -> str:
        return "tablecast-cast"

    @property
    def provider(self) -> str:
        return "tablecast-api"

    def chat(
        self,
        *,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls: NotGivenOr[bool] = NOT_GIVEN,
        tool_choice: NotGivenOr[llm.ToolChoice] = NOT_GIVEN,
        extra_kwargs: NotGivenOr[dict[str, Any]] = NOT_GIVEN,
    ) -> llm.LLMStream:
        # API側の業務操作を、SDKの自動再試行で重複実行しない。
        return TablecastStream(self, chat_ctx)


class TablecastStream(llm.LLMStream):
    def __init__(self, model: TablecastLLM, chat_ctx: llm.ChatContext) -> None:
        super().__init__(
            model, chat_ctx=chat_ctx, tools=[], conn_options=APIConnectOptions(max_retry=0)
        )
        self.response = model.response

    async def _run(self) -> None:
        request_id = str(uuid4())
        try:
            async with aclosing(self.response(self.chat_ctx, request_id)) as response:
                async for text in response:
                    self._event_ch.send_nowait(
                        llm.ChatChunk(
                            id=request_id, delta=llm.ChoiceDelta(role="assistant", content=text)
                        )
                    )
        except Exception:
            # SDKの例外ログへHTTP・providerの本文やURLを渡さない。
            raise APIError("音声APIの応答生成に失敗しました", retryable=False) from None
