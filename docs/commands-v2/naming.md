# Naming

## Goals

- command names should read like user-facing product language, not internal implementation names
- multi-word flat settings can use hyphenation when it improves clarity
- avoid shorthand that needs project context to decode

## Current Guidance

- prefer explicit nouns for durable settings:
  - good: `crosschannel-blocklist`
  - weaker: `block-crossmsg-channels`
- avoid abbreviations like `msg`, `cfg`, or `stm` unless they are already established user-facing terms
- when a command edits a stored set, the name should feel like the name of that setting, not an action pair

## Checklist-Style Settings

When a command opens a modal showing the full saved set, name it after the setting itself:

- `/server crosschannel-blocklist`

This fits better than separate `add` and `remove` flows because the user is managing one persisted list, not issuing a one-off mutation.
