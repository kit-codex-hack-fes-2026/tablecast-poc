---
title: Troubleshooting
description: Check the environment, permissions, draft version and microphone state.
---

## Sign-in or store selection fails

Check the invited account and organisation, then choose the store again. Reading the docs does not grant store access. Ask an organisation administrator to check membership rather than trying guessed organisation or store IDs.

## MCP tools are missing or authorisation fails

Refresh the actual tool list in your client. Check the application and MCP origins, production versus staging, OAuth organisation, scopes and expiry. Re-authorise if needed and compare the store returned by `get_configuration`. Never paste secret tokens into chat or a shared screen. See [MCP connections](./mcp.md).

## Saving, validation or publication stalls

Read the latest draft version and validation result using `get_draft_diff`. Reapply your changes to the latest version after a conflict. Leave unreadable prices and safety details pending. A validated draft still needs human publication approval. If the published version has advanced, start from that version. See [Configuration and publishing](./configuration.md).

## Voice is silent or does not reconnect

Check the iPad’s microphone permission, volume, network and table registration. Voice remains disconnected after stopping until you explicitly resume it. Confirm that the basket is preserved when resuming. You can also review order contents on screen.

## Share the details

Record the environment, time, page URL, reproduction steps, displayed error, draft ID and version. Exclude API keys, OAuth tokens, personal data and raw audio. Do not report an unverified connection, save or publication as successful.

[Docs index](./index.md).
