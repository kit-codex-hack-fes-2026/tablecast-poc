---
title: Analytics and improvements
description: Check comparison periods and sample sizes before proposing a store improvement.
---

## Match the comparison conditions

Use the store’s statistics screen or MCP `get_statistics`. Confirm the store, date range, comparison period and metric definitions. Keep conditions such as closed-visit attribution consistent and report the underlying counts and denominators. Synthetic demo history does not establish real customer preferences.

## Understand the measures

The period covers normal visits closed within the specified interval, including orders, billing entries and calls belonging to those visits. Open visits and staff demos are excluded. This is different from a report grouped by payment date.

- Distinguish visits, recorded guests, order records and product quantities.
- Payment totals include positive and negative entries. A negative entry does not prove an external payment refund.
- Product order rate is the number of visits ordering that product divided by all eligible visits.
- Payments for visits using a plan include additional orders; they are not plan-fee revenue alone.
- Call counts are recorded events, not current pending calls or categories of questions.

Agents start with `get_statistics` using `summary`, then request `products` or `modifiers` as needed. Pages are ordered by ID, so the first page is not a popularity ranking. Follow `nextCursor` with the same query conditions and identify uncollected pages or incomplete snapshots.

## Ask an agent

Ask for a comparison of the last 28 days with the preceding 28 days, including sales, order counts, product mix and improvement ideas. Distinguish missing data from a successful result containing zero records. When analysing a supplied CSV, confirm its column meanings and period too.

## Turn findings into changes

Propose concrete service wording, product descriptions or timing changes, together with a way to evaluate them. Reading statistics or requesting advice does not authorise menu or price changes. If asked to apply an idea, read the current settings and save only the selected changes as a draft. Follow [Configuration and publishing](./configuration.md) for validation and approval.

Related: [MCP connections](./mcp.md), [Documentation index](./index.md).
