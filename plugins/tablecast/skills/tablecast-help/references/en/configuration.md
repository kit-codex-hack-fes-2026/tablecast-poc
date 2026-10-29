---
title: Configuration and publishing
description: Prepare multilingual drafts, validate changes, and publish with human approval.
---

## Prepare a draft

Create a change under Menu & service. Give your agent the products to change, the intended result and the photographs, tables or URLs that support it. Keep Japanese and English settings consistent. Leave unknown prices, allergens and ingredients unconfirmed. Preserve products, images and settings outside the requested change.

## Start with the menu you already have

> Create a menu draft from the attached menu and photographs. Keep the listed tax-inclusive prices, portions, temperatures and surcharges, and preserve existing products. Add English, Simplified Chinese and Korean names, pronunciations and descriptions. Do not guess ingredients or allergens. Show the changes and questions that need checking. Do not publish yet.

Attach readable prices and options, and identify which photograph belongs to each dish. ChatGPT or Codex reads the materials; the connected MCP saves the configuration to TableCast. Keep Japanese and English when adding languages, and add the requested language settings and translations. Review the saved draft in the management app.

## Improve the guidance guests receive

> Guests often ask about local sake flavours and how to eat the dishes. Read the current menu and propose three explanations using real products. Include short Japanese and English wording, its sources, unresolved questions and a way to assess the improvement. Do not invent flavours or ingredients. Only propose changes for now.

Include the manager’s observations to explain the problem. Once you choose a proposal, the agent can save it as a draft. Guest ordering and staff calls belong to the guest app. The management MCP prepares the configuration used for that service.

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

Related: [MCP connections](./mcp.md), [Troubleshooting](./troubleshooting.md), [Documentation index](./index.md).

## Set up the whole store

Open Set up your store from the store home screen to review your menu, languages, service, materials, appearance and rewards. Give the plugin your store materials and ask it to set up the store. It checks existing settings and gaps, then updates the same draft. Configured does not mean fact-checked. A person completes the connection, device registration and publication approval.

## Edit and transfer store materials

Select a file in the service settings tree and switch between preview, source and visual editing. Tiptap supports headings, lists, code, tables, images and links. SKILL.md metadata is edited separately from its body. Record image sources when uploading. Create, rename or delete files and Skills, and import or export image-containing ZIP files up to 5 MiB. Explicitly select replacement to overwrite matching Skill IDs. Save the draft after importing.

Check Skills validates the required SKILL.md, YAML name and description, matching names and file references. Fix errors before validating for publication. Scripts in materials are not executed. Keep secrets and customer memories out of store materials.
