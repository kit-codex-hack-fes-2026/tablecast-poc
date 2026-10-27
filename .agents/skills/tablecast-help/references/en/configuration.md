---
title: Configuration and publishing
description: Prepare bilingual drafts, validate changes, and publish with human approval.
---

## Prepare a draft

Create a change under Menu & service. Give your agent the products to change, the intended result and the photographs, tables or URLs that support it. Keep Japanese and English settings consistent. Leave unknown prices, allergens and ingredients unconfirmed. Preserve products, images and settings outside the requested change.

## Save through an agent

1. Read `get_configuration` for the store, current configuration and input schema. For an existing draft, read its latest state with `get_draft_diff`.
2. Use `create_draft` for a new change.
3. Send the complete configuration and latest `expectedVersion` to `update_draft`. It is not a partial patch.
4. Run `validate_draft` and review `get_draft_diff`. Fix actionable errors and report the saved draft ID, version and unresolved items.

If a version conflict occurs, read the latest draft. Confirm overlapping changes, such as a competing price update, instead of overwriting them with an older version.

## Apply to the store

Saving a validated draft and publishing it are separate steps. When publication is requested, open the review URL returned by `request_publication`. A person checks the store, bilingual content, prices, required choices and differences, then approves the change. Agents must not impersonate that approval.

After publication, fetch the current configuration to confirm the result. Saving or validation alone does not prove publication. If the published version has advanced, transfer the requested changes onto a draft based on the new version.

## Images and availability

Upload real files with `upload_image`, then save the returned image key and source in the draft. Label generated images as illustrations. Uploading an image alone does not change the live menu. Mark an unavailable product as sold out rather than deleting it.

Related: [MCP connections](./mcp.md), [Troubleshooting](./troubleshooting.md), [Docs index](./index.md).
