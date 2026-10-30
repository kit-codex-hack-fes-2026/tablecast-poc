---
title: Membership and rewards
description: Join a visit from a phone, manage memories, and use points and coupons.
---

## Join from your phone

Open the member QR code on the iPad and scan it with your own phone. After signing in and giving initial store membership consent, you join the current visit. Each accompanying member scans with their own phone. You do not need to enter your login details on the iPad.

Check the store, table and connection state after joining. If the QR code has expired, scan the current code on the iPad. Open store membership cards and settings from the [member page](/member). You can leave a visit you have joined.

## Manage history and memories

For each store, control companion-history sharing, use of personal history and memories during service, and automatic saving of explicit preferences. You can change or withdraw consent later. With several members present, service uses a shared context or an explicitly selected person; it does not identify people by voice or face.

With automatic saving enabled, service can save clear, lasting preferences stated by the identified recipient. A quantity for this order or an inferred health condition is not a lasting preference. Members can add, edit or delete their own memories and edit consumption records. Editing personal consumption does not change the table’s original orders or bill. The management MCP cannot retrieve members’ personal memories in bulk.

## Check points

Stores configure visit-based or purchase-based points. Scanning the QR code alone does not award points; staff confirm eligible participants during settlement. Purchase-based points use the purchase amount allocated equally among eligible members, which is distinct from each person’s actual payment. Members can view their balance and entries.

## Use a coupon

Select an available coupon on your phone’s visit screen and request its use. Staff check the conditions and apply it to the bill. A submitted request is not a confirmed discount. One coupon is allowed per bill. Check the expiry, minimum bill and discount cap on the coupon. Issued coupons retain the conditions from their issue version.

## Configure store rewards

Use the management app’s points and coupons screens. When asking an agent, specify the points unit, issue conditions, validity period and discount amount or rate.

**Saving a points policy or coupon rule applies it immediately; it does not wait for menu-draft approval.** Points policies apply to future visits. Membership card and app icon designs use the [store design](./theme.md) draft and publication process.

> First check the current points policy and coupon rules. Find how many members currently qualify for a newly issued coupon under these conditions. Do not save settings or issue coupons yet.

Agents read `get_point_policy` and `list_coupon_rules`, then use `preview_coupon_audience` to check the audience. The preview issues no coupons, and future memberships or visits can change the count. Saving, manual issue and revocation require a request covering those operations.

Related: [Service and ordering](./service.md), [Configuration and publishing](./configuration.md), [Documentation index](./index.md).
