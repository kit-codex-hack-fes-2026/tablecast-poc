---
title: Troubleshooting
description: Check the environment, permissions, draft version and microphone state.
---

## Sign-in or store selection fails

Check the invited account and organisation, then choose the store again. Reading the documentation does not grant store access. Ask an organisation administrator to check membership rather than trying guessed organisation or store IDs.

## MCP tools are missing or authorisation fails

Refresh the actual tool list in your client. Check the application and MCP origins, production versus staging, OAuth organisation, scopes and expiry. Re-authorise if needed and compare the store returned by `get_configuration`. Never paste secret tokens into chat or a shared screen. See [MCP connections](./mcp.md).

## Saving, validation or publication stalls

Read the latest draft version and validation result using `get_draft_diff`. Reapply your changes to the latest version after a conflict. Leave unreadable prices and safety details pending. A validated draft still needs human publication approval. If the published version has advanced, start from that version. See [Configuration and publishing](./configuration.md).

## Voice is silent or does not reconnect

Check the iPad’s microphone permission, volume, network and table registration. Voice remains disconnected after stopping until you explicitly resume it. Confirm that the basket is preserved when resuming. You can also review order contents on screen.

## Materials or images will not import

Check that the ZIP is within 5 MiB, includes SKILL.md and its referenced files, and that replacement of matching materials is intended. Supply missing image sources and fix Skill check errors. Importing through the screen does not save the draft automatically. See [Store materials and Skills](./store-skills.md).

## Points or coupons differ from expectations

QR participation alone does not award points, and requesting a coupon does not confirm a discount. Check member entries and staff settlement state. Points policies and coupon rules apply when saved; leaving a menu draft unpublished or discarding it does not undo them. Review [Membership and rewards](./membership.md).

## A game is missing or does not work

Check registration, automatic validation, play-testing and publication separately, including the store and published version in the management app. Registration alone does not make a game available at the table. Review external asset dependencies and unsupported capabilities using [Tabletop games](./games.md).

## Share the details

Record the environment, time, page URL, reproduction steps, displayed error, draft ID and version. Exclude API keys, OAuth tokens, personal data and raw audio. Do not report an unverified connection, save or publication as successful.

[Documentation index](./index.md).
