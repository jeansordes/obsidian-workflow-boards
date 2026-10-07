# Workflow Boards

Configurable linked-note workflows, recurring tasks, personal dashboards and CRM pipelines for Obsidian. Notes and Markdown Kanban boards remain the source of truth.

**Status: 0.1.0 preview. Not yet listed in Obsidian Community.** Automated tests cover the workflow engine and configurable schemas. Desktop visual testing, mobile testing and Community review are still pending. The interface is currently French; settings and default property names are English.

## Features

- Derive task progress from linked cards across several boards. Completion requires all expected boards to be in a configured completion column.
- Surface missing cards, duplicate cards, duplicate task identifiers and missing project links.
- Create a task and its board cards with one command.
- Assign an owner, next action, priority, due date, focus, blocker and waiting-for information.
- Log a recurring task execution before restarting selected boards.
- Display CRM pipelines with won/lost columns, follow-ups and amounts in a chosen currency.
- Configure workspace root, folders, note types, property mappings, completion columns, identifier prefix and journal heading.

There are no hard-coded team members or vault paths. Owners come from person notes in your configured directory. No network calls, telemetry or external services are used. The Kanban community plugin is optional for dragging cards visually; Workflow Boards reads the Markdown board format directly.

## Install the preview

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/jeansordes/obsidian-workflow-boards/releases).
2. Create `.obsidian/plugins/workflow-boards/` inside your vault and copy those three files into it.
3. Reload Obsidian and enable **Workflow Boards** under Community plugins.
4. Open its settings and configure folders and properties, then press **Save settings**.

Requires Obsidian 1.14.4 or later for this preview. Mobile-compatible APIs are used, but mobile operation has not been manually verified. Once the plugin is accepted into the Community directory, installation and updates can use Obsidian's normal plugin manager.

## Quick start

Copy the contents of `examples/` into a test vault. Defaults use `Tasks`, `Boards`, `Projects`, `People`, `Campaigns` and `Deals`. Create the folders you need before creating notes through commands. CRM is optional.

A task has one project and one or more expected boards:

```yaml
type: task
id: T-001
project: "[[Projects/Example]]"
workflows:
  - "[[Boards/Review]]"
recurring: false
owner: "[[People/Example person]]"
next_action: Review the proposal
```

A board has `type: workflow` and `kanban-plugin: board`. Each second-level heading is a column, and every card is a single note link:

```markdown
## Ready

- [ ] [[Tasks/T-001 - Example]]

## Done
```

Free-text cards are reported as invalid. Archived cards do not count as present. Keep expected cards on boards while their task is tracked.

## Views

Insert these fenced blocks into notes:

````markdown
```workflow-dashboard
scope: tous
```

```workflow-tickets
scope: tous
```

```workflow-crm
scope: tous
```
````

Dashboard filters: `personne: "[[People/Example person]]"` or `scope: sans_responsable` for unassigned tasks. Search filters active tasks; completed tasks appear separately in a collapsed section.

Ticket filters: `scope: projet` on a project note; `scope: sans_suivi` for tasks without cards; or `scope: team` together with an explicit vault-relative `folder: Boards/Engineering`.

CRM filters: `scope: campagne` with `campagne: Campaigns/Example`, or `scope: responsable` with an exact `responsable` property value.

## CRM schema

Campaign notes use `type: campaign`, `won_columns: [Signed]`, `lost_columns: [Lost]` and the same Markdown column/card format. Deal notes use `type: deal`, a single `campaign` link, a single `client` link to a `person` or `organization` note in the configured People directory, optional `contacts` links to person notes, `owner`, `next_action`, `follow_up` (YYYY-MM-DD), `amount` and `currency`. Amounts in other currencies are excluded, not converted.

## Configuration and migration

All mappings are configured under Settings → Workflow Boards. Saving configuration does not rename folders or rewrite existing notes. Each vault has its own configuration. Dates use the device's local date.

To migrate an existing workflow system, map its folders, note types and property names first. Compare the displayed results in a copy of the vault before replacing existing dashboard blocks. Keep the old extension available until its replacement is verified. No automatic migration is performed.

Current conventions: a task belongs to exactly one project; priorities are P1/P2/P3; the next-action body fallback recognizes the French headings `Prochaine action` and `Travaux`. The mapped next-action property works in any language. Task creation and execution logs currently use French prose.

## Reliability limits

Multi-file changes are not atomic. If a write fails partway through creation or restart, inspect the surviving note and board cards before retrying. Changes are serialized within one plugin instance; independently working devices can still allocate duplicate IDs. Dashboards detect these duplicates. Back up your vault and resolve them before continuing.

## Development and maintenance

```sh
npm ci
npm run check
```

Source: `src/main.js` and `src/settings.js`. Tests use synthetic vaults; private vault data must never be added to the repository. `npm run build` produces `main.js`; runtime dependencies are limited to Obsidian's API.

GitHub Actions runs tests and builds on pull requests and pushes. Version-tag pushes create a draft release containing the three installation files. See [RELEASING.md](RELEASING.md) for validation and publication steps. Report reproducible issues using anonymized example notes.

License: MIT.
