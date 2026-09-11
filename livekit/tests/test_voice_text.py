"""端末向けの逐次表示をSDKの公開送信・AgentSession境界で検証する。"""

import asyncio
import json
from unittest.mock import create_autospec

import pytest
from livekit import rtc

from tablecast_livekit.voice_text import VoiceTextPublisher


@pytest.fixture
async def transport():
    participant = create_autospec(rtc.LocalParticipant, instance=True)
    packets: asyncio.Queue[dict] = asyncio.Queue()

    async def publish(payload, **options):
        packets.put_nowait(json.loads(payload))

    participant.publish_data.side_effect = publish
    publisher = VoiceTextPublisher(participant, "tablecast-device", lambda: True)
    try:
        yield publisher, packets, participant
    finally:
        await publisher.aclose()
        for call in participant.publish_data.await_args_list:
            assert call.kwargs == {
                "reliable": True,
                "topic": "tablecast.voice",
                "destination_identities": ["tablecast-device"],
            }
            assert len(call.args[0]) <= 15 * 1024


async def test_累積表示を合流し旧turnの未送信本文を破棄する(transport):
    publisher, packets, participant = transport
    publisher.begin_turn("tablecast-old")
    publisher.send(
        {
            "type": "assistant",
            "turnId": "tablecast-old",
            "text": "旧",
            "rawText": "旧",
            "final": False,
        }
    )
    publisher.begin_turn("tablecast-current")
    for text in ["は", "はい", "はい。"]:
        publisher.send(
            {
                "type": "assistant",
                "turnId": "tablecast-current",
                "text": text,
                "rawText": text,
                "final": text.endswith("。"),
            }
        )
    packet = await asyncio.wait_for(packets.get(), timeout=2)
    assert packet == {
        "type": "assistant",
        "turnId": "tablecast-current",
        "text": "はい。",
        "rawText": "はい。",
        "final": True,
    }
    assert participant.publish_data.await_count == 1
    publisher.interrupt("tablecast-current")
    publisher.send(
        {
            "type": "assistant",
            "turnId": "tablecast-current",
            "text": "遅延",
            "rawText": "遅延",
            "final": True,
        }
    )
    assert await asyncio.wait_for(packets.get(), timeout=2) == {
        "type": "interrupted",
        "turnId": "tablecast-current",
    }


async def test_送信が滞留しても入力を待たせず停止で未送信更新と送信taskを破棄する(transport):
    publisher, packets, participant = transport
    entered = asyncio.Event()

    async def blocked(*args, **kwargs):
        entered.set()
        await asyncio.Event().wait()

    participant.publish_data.side_effect = blocked
    publisher.send({"type": "user", "id": "tablecast-user-first", "text": "はい", "final": False})
    await asyncio.wait_for(entered.wait(), timeout=2)
    for index in range(100):
        publisher.send(
            {"type": "user", "id": f"tablecast-user-{index}", "text": "更新", "final": True}
        )
    assert len(publisher.pending) == 64
    await asyncio.wait_for(publisher.aclose(), timeout=1)
    publisher.send({"type": "user", "id": "tablecast-user-late", "text": "停止後", "final": True})
    assert not publisher.pending
    assert publisher.task.cancelled()
    assert participant.publish_data.await_count == 1
    assert packets.empty()


async def test_15KiBを超える累積本文を完全版として切り詰めず固定エラーで終了する(transport):
    publisher, packets, _ = transport
    publisher.begin_turn("tablecast-large")
    text = "日本語" * 2000
    publisher.send(
        {
            "type": "assistant",
            "turnId": "tablecast-large",
            "text": text,
            "rawText": text,
            "final": False,
        }
    )
    publisher.send(
        {
            "type": "assistant",
            "turnId": "tablecast-large",
            "text": text + "。",
            "rawText": text + "。",
            "final": True,
        }
    )
    assert await asyncio.wait_for(packets.get(), timeout=2) == {
        "type": "error",
        "turnId": "tablecast-large",
        "code": "VOICE_TEXT_TOO_LARGE",
    }
