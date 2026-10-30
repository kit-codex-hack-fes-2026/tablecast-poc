---
title: Languages and food information
description: Set product names, pronunciations, reference currencies, ingredients and dietary information.
---

## Names and pronunciations

Add the languages your store needs while retaining Japanese and English. Keep a meaningful display name separate from the pronunciation of the original name. Preserve brands, portions, quantities, preparation methods and surcharges in translations. Check categories, options, descriptions, service instructions and image alternatives too.

Missing translations fall back from the selected language to English, then Japanese. Interface languages and the languages registered for store content are separate. Removing a language from the active selection does not require deleting its saved translations.

Agents read `locales`, `uiLocales`, `fallback` and the schema from `get_configuration`. Supply both `displayName` and `transliteration` for each translated product language; omit untranslated languages instead of inserting empty strings. Use British English and Hepburn romanisation with macrons for Japanese names in English.

## Reference currency and payment

Foreign currency amounts on the tabletop screen are estimates. Prices, surcharges, orders and bills use Japanese yen. The initial reference currency follows the language, and a guest’s manual currency selection is retained. If conversion is unavailable, check the yen amount. Do not describe an estimate as the final charge.

## Ingredients and options

Register the product’s base food information, removable or additional components, and components included by default. Link options to component additions and removals. Removing an egg topping does not remove egg contained in the noodles. Check the resulting information in the product details after selecting options.

TableCast uses a 29-item Japanese allergen classification. Follow the connected server’s list instead of inventing IDs or entering free text as an ID. It is not an exhaustive list of every possible allergy.

Vegan, vegetarian, halal and gluten-free assessments, halal certification and cross-contact through shared equipment are separate fields. A dish name or photograph does not establish verified information. Keep missing facts unknown and check with the kitchen or supplier. Removing an ingredient does not establish that cross-contact has been eliminated.

## Example request

> Use this ingredient sheet to update food information for products and options in a draft. Leave unconfirmed fields unknown. Add Simplified Chinese and Korean names, pronunciations and descriptions while preserving prices and existing translations. Show the changes and questions for the kitchen.

Agents preserve the full configuration and [save and validate a draft](./configuration.md). Refer unresolved safety questions to [staff](./service.md). Configuration changes do not rewrite historical order records.

Related: [Configuration and publishing](./configuration.md), [Documentation index](./index.md).
