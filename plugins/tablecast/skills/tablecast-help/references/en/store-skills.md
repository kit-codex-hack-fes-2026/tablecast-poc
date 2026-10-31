---
title: Store materials and Skills
description: Edit service reference materials and save files, images and ZIP imports in a draft.
---

## Store materials and the plugin

A store Skill contains knowledge for service, such as how to eat a dish or information about the venue. It is separate from the configuration skills bundled with the Agent Plugin. Writing scripts or tool names in store materials does not grant execution permissions. Service uses the published version.

## Edit in the management app

Select a file in the service settings tree and switch between preview, source and visual editing. You can edit headings, lists, code, tables, images and links. Edit the name, description and other `SKILL.md` metadata separately from the body.

Check the content, including images and code blocks, before saving. Update references when renaming a file. Give images a source and alternative text, and do not describe generated images as photographs. Images are publicly served, so exclude secrets and members’ personal information.

## Organise the materials

Each Skill needs a `SKILL.md` whose opening YAML contains a name matching the folder and a description. Keep the entry point concise and link to detailed files using relative paths.

```text
local-sake/
  SKILL.md
  references/serving.md
  assets/bottle.webp
```

```markdown
---
name: local-sake
description: Read when explaining how the store serves its local sake.
---

Use the verified [serving guidance](references/serving.md).
```

The limits are eight Skills, 30 files per Skill, 32,000 characters per file and 256,000 characters overall, counted in UTF-16 code units. Use verified ingredient and price information. Do not copy customer memories or credentials into store materials.

## Transfer a ZIP

Import ZIP files up to 5 MiB. For one Skill, place `SKILL.md` at the root; for several, use separate Skill folders as above. Select replacement only when you intend to replace matching IDs. Supply missing image source information. ZIP files exported by TableCast include image sources and alternative text.

Save the draft after importing through the management app. Check Skills validates required files, names, descriptions and references. Fix errors before [publication validation](./configuration.md). Passing these checks does not establish that the content is factually correct.

## Ask an agent

> Organise these dish descriptions and photographs as store materials. Preserve existing materials and put longer explanations in reference files. Check image sources, broken references and the saved draft. Do not publish yet.

Agents use `list_store_skills` for the tree and `read_store_skill_file` for relevant text. Use `edit_store_skill` to edit, `import_store_skills` and `export_store_skills` for ZIP files, and `lint_store_skills` to check them. Pass the version returned by each change as the next `expectedVersion`. Receiving an export link does not mean the ZIP has been downloaded. Use the management app’s export if the client cannot retrieve it.

Related: [Configuration and publishing](./configuration.md), [Troubleshooting](./troubleshooting.md), [Documentation index](./index.md).
