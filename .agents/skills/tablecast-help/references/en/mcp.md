---
title: MCP connections and agents
description: Connect through OAuth, confirm your store and scopes, and find the right tools.
---

## Connect

Open [Plugin installation](/account/integrations/plugins) or [Manual installation](/account/integrations/manual). These setup screens require sign-in. Add the displayed endpoint to your MCP client, sign in with OAuth, and consent to the organisation and permissions. You do not need to clone a repository or run a development server.

The connection screen uses the name `tablecast` and the current application origin followed by `/mcp`. Production and test environments hold separate data, so check that the application and MCP origins match. The public plugin connects to production. You do not need to register the same connection manually a second time.

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

## Working as an agent

Discover the actual tools and read the connected server’s current schemas before assuming it is disconnected. Explanations and proposals are read-only. A request to apply a change authorises preparation of a draft. Publication requires [explicit human approval](./configuration.md). Do not invent prices or safety information missing from the source material.

Next: [Troubleshooting](./troubleshooting.md). [Documentation index](./index.md).
