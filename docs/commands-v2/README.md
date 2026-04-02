# Commands V2

This folder is the planning space for future command UX rewrites.

It does not change the current runtime layout:

- implementation stays in `src/commands/`
- the existing command loader and category/group structure stay in place
- these docs define target naming, interaction patterns, and migration direction

Current seed documents:

- `naming.md` for user-facing command naming rules
- `checklist-settings.md` for the new persistent checklist-setting pattern
- `migration-map.md` for concrete current-to-v2 examples

Baseline principles:

- prefer clear user-facing names over internal shorthand
- use hyphenated subcommand names for multi-word flat settings when that improves readability
- prefer one persistent checklist command over paired add/remove commands when the user is really editing a saved set
- if a command changes durable server config, expose that state in `/tool status`
