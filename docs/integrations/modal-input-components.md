# Modal Input Components

Discord introduced new interactive input components for modals beyond the original Text Input. These components enable richer form-like experiences with structured selection inputs.

## Overview

| Type | Name                              | Description                                           | Container |
| ---- | --------------------------------- | ----------------------------------------------------- | --------- |
| 4    | [Text Input](#text-input)         | Free-form text entry (original modal input)           | Action Row |
| 18   | [Label](#label)                   | Wrapper component for new modal inputs                | —         |
| 21   | [Radio Group](#radio-group)       | Select exactly one option from a list                 | Label     |
| 22   | [Checkbox Group](#checkbox-group) | Select one or many options from a list                | Label     |
| 23   | [Checkbox](#checkbox)             | Single yes/no toggle                                  | Label     |

### Key Differences from Message Components

- **Label wrapper required**: Radio Group, Checkbox Group, and Checkbox must be placed inside a Label component (type 18), _not_ an Action Row. This is unlike Text Inputs which use Action Rows.
- **Modal-only**: These components are only available in modals — they cannot be used in message payloads.
- **Submit data structure**: The interaction response nests the input component inside the Label's `component` field, not in an `ActionRow.components` array.

---

## Label

A Label is a container component for wrapping new modal input types. It provides a visible label and optional description above the input.

Labels are analogous to Action Rows for Text Inputs, but designed specifically for the newer input components.

### Label Structure

| Field        | Type      | Description                                      |
| ------------ | --------- | ------------------------------------------------ |
| type         | integer   | `18` for label                                   |
| id?          | integer   | Optional identifier for component                |
| label        | string    | Text displayed above the input                   |
| description? | string    | Optional description text displayed below label  |
| component    | component | The input component (Radio Group, Checkbox Group, or Checkbox) |

---

## Radio Group

A Radio Group allows the user to select **exactly one** option from a defined list. Useful for mutually exclusive choices like provider selection, mode switches, or preference settings.

### Radio Group Structure

| Field      | Type                         | Description                                                      |
| ---------- | ---------------------------- | ---------------------------------------------------------------- |
| type       | integer                      | `21` for radio group                                             |
| id?        | integer                      | Optional identifier for component                                |
| custom_id  | string                       | Developer-defined identifier for the input; 1-100 characters     |
| options    | array of radio group options | List of options to show; min 2, max 10                           |
| required?  | boolean                      | Whether a selection is required to submit the modal (default: true) |

### Radio Group Option Structure

| Field        | Type    | Description                                              |
| ------------ | ------- | -------------------------------------------------------- |
| value        | string  | Dev-defined value of the option; max 100 characters      |
| label        | string  | User-facing label of the option; max 100 characters      |
| description? | string  | Optional description for the option; max 100 characters  |
| default?     | boolean | Shows the option as selected by default                  |

### Radio Group Interaction Response

| Field     | Type    | Description                                                          |
| --------- | ------- | -------------------------------------------------------------------- |
| type      | integer | `21` for a Radio Group                                               |
| id        | integer | Unique identifier for the component                                  |
| custom_id | string  | Developer-defined identifier for the input; 1-100 characters         |
| value     | ?string | The value of the selected option, or `null` if no option is selected |

### Modal Payload Example

```json
{
  "type": 9,
  "data": {
    "custom_id": "class_selection_modal",
    "title": "Class Selection",
    "components": [
      {
        "type": 18,
        "label": "Choose your class",
        "description": "Your class determines the style of play for your character.",
        "component": {
          "type": 21,
          "custom_id": "class_radio",
          "options": [
            {"value": "warrior", "label": "Warrior", "description": "Strong and brave"},
            {"value": "rogue", "label": "Rogue", "description": "Weak and squishy"},
            {"value": "wizard", "label": "Wizard", "description": "Nerd"},
            {"value": "bard", "label": "Bard", "description": "Annoys everyone"},
            {"value": "witch_doctor", "label": "Witch Doctor", "description": "Actually a pretty cool option"}
          ]
        }
      }
    ]
  }
}
```

### Submit Interaction Data Example

```json
{
  "type": 5,
  "data": {
    "custom_id": "class_selection_modal",
    "components": [
      {
        "id": 1,
        "type": 18,
        "component": {
          "custom_id": "class_radio",
          "id": 2,
          "type": 21,
          "value": "warrior"
        }
      }
    ]
  }
}
```

---

## Checkbox Group

A Checkbox Group allows the user to select **one or many** options from a list. Ideal for multi-select scenarios like capability toggles, feature flags, or day-of-week selection.

### Checkbox Group Structure

| Field       | Type                             | Description                                                                           |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| type        | integer                          | `22` for checkbox group                                                               |
| id?         | integer                          | Optional identifier for component                                                     |
| custom_id   | string                           | Developer-defined identifier for the input; 1-100 characters                          |
| options     | array of checkbox group options  | List of options to show; min 1, max 10                                                |
| min_values? | integer                          | Minimum items that must be chosen; min 0, max 10 (default: 1); if 0, `required` must be false |
| max_values? | integer                          | Maximum items that can be chosen; min 1, max 10 (default: number of options)          |
| required?   | boolean                          | Whether selecting within the group is required (default: true)                        |

### Checkbox Group Option Structure

| Field        | Type    | Description                                              |
| ------------ | ------- | -------------------------------------------------------- |
| value        | string  | Dev-defined value of the option; max 100 characters      |
| label        | string  | User-facing label of the option; max 100 characters      |
| description? | string  | Optional description for the option; max 100 characters  |
| default?     | boolean | Shows the option as selected by default                  |

### Checkbox Group Interaction Response

| Field     | Type             | Description                                                                      |
| --------- | ---------------- | -------------------------------------------------------------------------------- |
| type      | integer          | `22` for a Checkbox Group                                                        |
| id        | integer          | Unique identifier for the component                                              |
| custom_id | string           | Developer-defined identifier for the input; 1-100 characters                     |
| values    | array of strings | The values of the selected options, or `[]` if no options are selected           |

### Modal Payload Example

```json
{
  "type": 9,
  "data": {
    "custom_id": "day_selection_modal",
    "title": "Study Days",
    "components": [
      {
        "type": 18,
        "label": "Which days are you free?",
        "description": "Choose all of the days you're able to meet up.",
        "component": {
          "type": 22,
          "custom_id": "event_checkbox",
          "options": [
            {"value": "march-4", "label": "March 4th"},
            {"value": "march-5", "label": "March 5th"},
            {"value": "march-7", "label": "March 7th", "description": "I know this is a Saturday and is tough"},
            {"value": "march-9", "label": "March 9th"},
            {"value": "march-10", "label": "March 10th"}
          ]
        }
      }
    ]
  }
}
```

### Submit Interaction Data Example

```json
{
  "type": 5,
  "data": {
    "custom_id": "day_selection_modal",
    "components": [
      {
        "id": 1,
        "type": 18,
        "component": {
          "custom_id": "event_checkbox",
          "id": 2,
          "type": 22,
          "values": [
            "march-5",
            "march-10",
            "march-4"
          ]
        }
      }
    ]
  }
}
```

---

## Checkbox

A Checkbox is a single toggle for simple yes/no questions. Unlike Checkbox Group (which provides a list of options), a standalone Checkbox is a single binary input.

### Checkbox Structure

| Field     | Type    | Description                                                  |
| --------- | ------- | ------------------------------------------------------------ |
| type      | integer | `23` for checkbox                                            |
| id?       | integer | Optional identifier for component                            |
| custom_id | string  | Developer-defined identifier for the input; 1-100 characters |
| default?  | boolean | Whether the checkbox is selected by default                  |

> **Note:** Checkboxes cannot be set as `required`. To achieve required single-option behavior, use a Checkbox Group with one option and `required: true`.

### Checkbox Interaction Response

| Field     | Type    | Description                                                  |
| --------- | ------- | ------------------------------------------------------------ |
| type      | integer | `23` for a Checkbox                                          |
| id        | integer | Unique identifier for the component                          |
| custom_id | string  | Developer-defined identifier for the input; 1-100 characters |
| value     | boolean | The state of the checkbox (`true` if checked, `false` if unchecked) |

### Modal Payload Example

```json
{
  "type": 9,
  "data": {
    "custom_id": "secret_note_modal",
    "title": "Secret Note",
    "components": [
      {
        "type": 18,
        "label": "Do you like me?",
        "component": {
          "type": 23,
          "custom_id": "like_checkbox"
        }
      }
    ]
  }
}
```

### Submit Interaction Data Example

```json
{
  "type": 5,
  "data": {
    "custom_id": "secret_note_modal",
    "components": [
      {
        "id": 1,
        "type": 18,
        "component": {
          "custom_id": "like_checkbox",
          "id": 2,
          "type": 23,
          "value": true
        }
      }
    ]
  }
}
```

---

## TomoriBot Migration Opportunities

Several existing TomoriBot flows currently use workarounds that these new components could simplify:

### Custom Provider Capabilities (`customProviderModal.ts`)

**Current approach**: After the initial modal, 4 separate `StringSelectMenuBuilder` dropdowns are shown in a follow-up message for yes/no capability toggles (tools, images, videos, structured output).

**With new components**: A single modal could contain all 4 toggles using either:
- **Checkbox Group**: One group with options like "Tool Calling", "Image Vision", "Video Vision", "Structured Output" — user checks all that apply.
- **Individual Checkboxes**: 4 separate Checkbox components, each wrapped in a Label, for clear per-capability toggling.

This eliminates the multi-step message-based flow and collapses it into a single modal submission.

### General Pattern

Any command that currently shows a follow-up message with yes/no select menus or boolean choices can potentially be migrated to a modal with Checkboxes. Commands that present mutually exclusive options via string selects could use Radio Groups instead.

---

## discord.js Support Status

As of discord.js v14.x, these components may not yet have dedicated builder classes. Until official support lands, raw component payloads can be sent using the Discord API directly or by constructing component objects manually. Check the [discord.js changelog](https://discord.js.org/docs/packages/discord.js/main) for builder availability.
