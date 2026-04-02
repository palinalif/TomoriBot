# Dependency Patches

This directory tracks TomoriBot's manual dependency patches and vendored dependency overrides.

Keep these changes small, package-scoped, and temporary. On any related dependency update, try removing the patch or override first, then run:

- `bun install`
- `bun audit`
- `bun run check`
- `bun run lint`

Remove the patch or override permanently once those commands pass without it.

## Revert Procedure

Use this checklist whenever an upstream dependency update may have made a manual patch or override unnecessary:

1. Remove the relevant patch file and/or override entry.
2. Delete any vendored dependency directory tied to that override.
3. Run `bun install` to refresh `bun.lock`.
4. Run `bun audit`.
5. Run `bun run check`.
6. Run `bun run lint`.
7. Keep the removal only if all checks pass and the dependency path stays fixed.

## Active entries

### `patches/@aws-sdk%2Fxml-builder@3.972.11.patch`

- Reason: forces `fast-xml-parser` to a non-vulnerable version in the AWS SDK transitive tree.
- Remove when: the resolved `@aws-sdk/xml-builder` release already depends on a fixed `fast-xml-parser` version and the quality gates above pass without this patch.
- How to revert: remove the `@aws-sdk/xml-builder@3.972.11` entry from `patchedDependencies`, delete this patch file, run `bun install`, then rerun the quality gates above.

### `patches/@matrix-org%2Fmatrix-sdk-crypto-nodejs@0.4.0.patch`

- Reason: the native Windows binding is not published for the Matrix crypto package, but TomoriBot's Matrix bridge only needs plaintext relay behavior. The patch replaces module-load crashes with lazy-throw stubs so accidental crypto usage still fails explicitly.
- Remove when: upstream publishes a working Windows binding for this package, or TomoriBot no longer loads this module in plaintext bridge mode, and the Matrix bridge still starts cleanly without the patch.
- How to revert: remove the `@matrix-org/matrix-sdk-crypto-nodejs@0.4.0` entry from `patchedDependencies`, delete this patch file, run `bun install`, then verify Matrix bridge startup and the quality gates above.

### `vendor/shapeshift`

- Reason: as of April 2, 2026, the latest `discord.js` / `@discordjs/builders` line still resolves `@sapphire/shapeshift@4.0.0`, which depends on `lodash`. TomoriBot vendors a minimal copy without `lodash` so the Discord dependency path no longer carries that advisory.
- Local change: the vendored copy removes the `lodash` dependency and inlines the small helpers previously used from `lodash/get` and `lodash/uniqWith` into the built CJS and ESM outputs.
- Verified upstream versions on April 2, 2026: `discord.js@14.26.0`, `@discordjs/builders@1.14.1`, `@sapphire/shapeshift@4.0.0`.
- Remove when: the supported upstream `discord.js` dependency chain no longer pulls `lodash` through `@sapphire/shapeshift`, and the quality gates above pass after deleting the override and vendored copy.
- How to revert: remove the `@sapphire/shapeshift` override from `package.json`, delete `vendor/shapeshift`, run `bun install`, then rerun `bun audit`, `bun run check`, and `bun run lint`.

## Related CI Policy

The dependency security gate is implemented in `scripts/auditDependencies.ts`. Its accepted-risk entries must stay aligned with the manual patch state above and be removed as soon as the underlying upstream dependency chain is fixed.
