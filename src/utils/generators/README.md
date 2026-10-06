# Target Generator

All generators share one selector in the studio and extension panel. The six primary entries scroll within the existing pill strip; remaining entries use More. Settings are stored separately under `ps_gen_opts:<id>` and selection retains the existing `ps_prompt_engine` key. Character and scene records are never modified by selection or formatting.

To add a generator:

1. Add its ID to `GeneratorId` and configuration to `registry.ts`.
2. Add a named adapter and dispatch entry in `adapters.ts`; reuse `shared.ts` helpers.
3. Export the adapter from `index.ts` and add prompt behavior coverage.

Options render from the registry without generator-specific React components. Unknown generator IDs use the Custom natural-language adapter. Templates run locally with no AI API calls.

`collectFacts` reads saved identity, outfit, location, scene, and visible custom fields. Custom labels such as Voice notes, Camera movement, Ambient audio, Pose, Expression, Character consistency rules, Scene continuity rules, and Avoid supply additional universal details without changing stored records. Generator options override relevant defaults. Video prompts retain props and custom details and omit empty sections. Reference modes describe images the user attaches in the destination tool; they do not upload images.

Midjourney reference formatting follows the selected version: v6 uses character reference and v7 uses [Omni Reference](https://docs.midjourney.com/hc/en-us/articles/36285124473997-Omni-Reference). Other numeric settings and duration choices are prompt/settings notes; availability depends on the destination model and interface.

Validation:

```sh
npm test
node --test tests/generator-selector.test.mjs
npm run build
```

Browser tests cover selector switching, saved options across reloads, active highlighting, and the narrow extension panel in both themes.
