---
title: MCP connections and agents
description: Connect through OAuth, confirm your store and scopes, and find the right tools.
---

## Connect

Open [Plugin installation](/account/integrations/plugins) or [Manual installation](/account/integrations/manual). These setup screens require sign-in. Add the displayed endpoint to your MCP client, sign in with OAuth, and consent to the organisation and permissions. You do not need to clone a repository or run a development server.

Production and staging are separate environments. On staging, use the displayed `tablecast-staging` endpoint and compare the origins of your application and MCP connection. Avoid manually registering a second copy of a connection already supplied by a plugin.

## Confirm permissions and store

Reading requires `tablecast:read`; draft changes require `tablecast:write`. Re-authorise with the required scopes if necessary. For multiple stores, select one with the connection URL’s `storeId` parameter. If omitted, the first permitted store in the organisation is selected. Confirm the name and ID returned by `get_configuration`; never invent an ID.

[OAuth connections](/account/mcp-sessions) shows permissions and expiry dates and lets you revoke unwanted connections. Access to the documentation does not authorise store operations.

## Choose a starting point

| Task                           | Tool and next guide                                                           |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Read menu and service settings | `get_configuration` → [Configuration](./configuration.md)                     |
| Change the menu                | `create_draft`, `update_draft` → [Configuration](./configuration.md)          |
| Review statistics              | `get_statistics` → [Analytics](./analytics.md)                                |
| Create a store theme           | `get_configuration`, `get_theme_spec` and the bundled `tablecast-theme` skill |
| Create a tabletop game         | `get_game_spec` and the bundled `tablecast` skill                             |
| Map Square products            | `get_pos_settings`, `get_pos_catalog` and the bundled `tablecast` skill       |

## Square product mappings

Once an administrator has connected Square in POS settings, ask the agent to map your products. Reading `get_pos_settings`, `get_pos_catalog` and `list_pos_devices` requires owner/admin permissions and `tablecast:read`; saving also requires `tablecast:write`. These lists are paginated, so the agent follows each continuation using the same conditions.

The agent compares names, variations, quantities and prices, then maps each customisation to a modifier belonging to its Square product. Square names retain their original language, including Japanese names in the English interface. Uncertain matches stay unresolved while confirmed matches can proceed.

`save_pos_mappings` replaces the complete set of up to 5,000 mappings, so valid mappings for current products outside the change must be read and preserved. It cannot append mappings in separate batches. Mappings with retired or missing IDs need a reported correction or removal; the agent must not silently remove them. Product mappings are saved in the same draft as the menu. Validate the draft and review its changes, then have a person approve publication in the management screen. Saving a draft does not change the live menu. Square locations and terminals are separate live connection settings, saved with `save_pos_connection_settings`. Legacy connection mappings are explicit import candidates; they are not applied to past orders. Use the management screen for OAuth connections, device registration and checkout. Saving mappings does not verify a real payment. See [Configuration and publishing](./configuration.md).

## Working as an agent

Discover the actual tools and read the connected server’s current schemas before assuming it is disconnected. Explanations and proposals are read-only. A request to apply a change authorises preparation of a draft. Publication requires [explicit human approval](./configuration.md). Do not invent prices or safety information missing from the source material.

Next: [Troubleshooting](./troubleshooting.md). [Documentation index](./index.md).
