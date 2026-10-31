---
title: Tabletop games
description: Ask an agent to build a game, then register, validate, play-test and publish it.
---

## Describe the game

Specify the player count, rules, round length, Japanese and English guidance, and how it ends. For example: create a short turn-based dice game for two to four people, show scores and the current turn, and allow players to exit early. Any drinking theme must allow skipping and participation with soft drinks.

## Register and play-test

Use the bundled `tablecast` skill. The agent confirms the store and reads `get_game_spec` for the current specification and available capabilities. To change an existing game, it reads the target and version, then registers a new version with `register_game`. Pasting code into the conversation does not register a game.

Run `validate_game`, then play-test in the returned review page. Check starting, player count, bilingual rules, turn changes, results and exit. Automatic validation alone does not establish that the game plays correctly. Register fixes as a new version.

## Publish or stop

A person play-tests and approves the selected version in the management app’s games screen. Games have their own versions, separate from menu drafts. MCP does not publish or stop them. Use the management app to stop publication or republish an earlier version.

A publication update does not replace the version of a game already in play. Stopping publication ends existing plays too. Resuming after closing the game is outside the current specification.

## Available capabilities

Games run separately from the ordering interface. Do not build around external CDNs or network access, ordering APIs, credentials, microphone, camera or game AI. Bundle required assets and libraries in the package. Follow the connected server’s actual limits and capabilities.

Related: [MCP connections](./mcp.md), [Documentation index](./index.md).
