# Checklist Settings

This pattern is for durable settings where the best UX is "show me the whole set and let me tick what should be enabled".

## Reference Command

- `/server crosschannel-blocklist`

## Behavior

- one command owns the full saved set
- the modal opens with every currently enabled item pre-checked
- checked means "enabled in storage"
- unchecked means "disabled in storage"
- submitting writes the full checked set back to the database

## When To Use It

- the setting is naturally a set of channels, roles, notice types, nodes, or similar entries
- users usually think in terms of reviewing the whole configuration, not adding one item at a time
- the saved state should be obvious on reopen

## Pagination Rule

- if the option set fits in one modal (`<= 50` items), open the checkbox modal directly
- if the option set exceeds one modal, show a page-selection message first
- each page modal should still preload the saved state for just that page

## Status Rule

If the command changes durable config, add that state to `/tool status` so the current configuration is visible without reopening the command.

## Cross-Channel Blocklist Notes

- the setting stores top-level channel IDs
- blocking a forum or media parent also blocks tool-driven visits into threads under that parent
- the setting exists to stop `cross_channel_message` from being used to post into restricted destinations
