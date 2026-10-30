---
title: Store design and images
description: Create logos, backgrounds, promotional images and membership cards, then review and publish.
---

## Prepare the assets

Store design supports colours, fonts, component decoration, backgrounds, a store logo, a wide header banner and promotional images linked to products. You can also configure membership card artwork and the store’s member app icon. The store logo is separate from the organisation’s shared icon.

Provide official logos and dish photographs when available, with the intended use and source of each image. Keep logos, backgrounds and promotional artwork as separate assets. Do not embed member names, authentication QR codes or personal information in membership cards or coupon artwork.

## Example request

> Keep the attached store logo and create a paper-textured background and a seasonal product promotion. Check product names and prices against the current configuration. Preserve the menu and service settings in the same draft. Check readability and product links in the Japanese and English ordering screens, and show me before publication.

Use the bundled `tablecast-theme` skill. Agents read `get_configuration` and `get_theme_spec` for current settings, asset requirements and the editor. Image generation belongs to the client you are using; TableCast MCP imports assets and saves configuration. If generation is unavailable, use supplied images or identify the assets still needed.

## Save the images

`upload_image` accepts PNG, JPEG and WebP files up to 5 MiB and 16 million pixels. Upload real files, then use the returned image key and source with alternative text in the relevant languages. Label generated images as illustrations. Uploaded image URLs are publicly served, so use only assets suitable for public distribution. Uploading alone does not change the published store configuration.

## Review the actual screen

After saving and validating the draft, use the management app’s ordering preview to check Japanese and English in portrait and landscape. Check logo proportions, product names and prices, contrast, promotional product links and order confirmation controls. A generated mock-up does not replace reviewing the actual screen.

Use [Configuration and publishing](./configuration.md) to approve the design. Saving artwork in a coupon rule uses the separate [reward settings that apply immediately](./membership.md).

Related: [Store materials and Skills](./store-skills.md), [Documentation index](./index.md).
