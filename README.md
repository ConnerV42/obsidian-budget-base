# BudgetBase — Obsidian Budget Plugin

📊 Zero-based budgeting inside Obsidian. Markdown underneath, rich UI on top.

![Obsidian](https://img.shields.io/badge/Obsidian-v1.0+-7c3aed)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Visual Dashboard** — See your entire budget at a glance with progress bars and pie charts
- **Inline Editing** — Click any amount to edit it directly
- **Category Organization** — Group expenses into collapsible sections with drag-and-drop reordering
- **Markdown-First** — Your data stays in plain markdown files you own
- **Tag-Based Coloring** — Visual distinction for savings (vault), investments (roth/taxable), bills, subscriptions, and discretionary spending

## Installation

### From GitHub (Manual)

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`)
2. Create folder: `<vault>/.obsidian/plugins/budgetbase/`
3. Copy the three files into that folder
4. Restart Obsidian
5. Enable "BudgetBase" in Settings → Community plugins

### From Source (Local Development)

**Prerequisites:**
- Node.js 18+ (`brew install node` or use nvm)
- Your Obsidian vault path (find via Obsidian → Settings → About → scroll down)

**Setup:**

```bash
# 1. Clone the repo
git clone https://github.com/ConnerV42/obsidian-budget-base.git
cd obsidian-budget-base

# 2. Install dependencies
npm install

# 3. Build the plugin
npm run build

# 4. Deploy to your vault (replace with your vault path)
VAULT="$HOME/path/to/your/vault"
mkdir -p "$VAULT/.obsidian/plugins/budgetbase"
cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/budgetbase/"

# 5. Reload Obsidian (Cmd+R) and enable the plugin
#    Settings → Community plugins → Enable "BudgetBase"
```

**Development workflow:**

```bash
# Watch mode — rebuilds on file changes
npm run dev

# In another terminal, auto-deploy on rebuild:
VAULT="$HOME/path/to/your/vault"
fswatch -o main.js | xargs -n1 -I{} cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/budgetbase/"

# Or just manually copy + Cmd+R to reload after changes
```

**Using Make (recommended):**

```bash
# One-time setup: set local vault path for this repo
echo "$HOME/path/to/your/vault" > .vault-path

# Or override per command
export VAULT="$HOME/path/to/your/vault"

# One command: build + deploy
make deploy

# Or full setup from scratch
make setup
```

## Usage

### Budget File Format

Create a markdown file with this structure:

```markdown
---
type: budget
month: 2026-02
income: 5000
---

## Savings
- [vault] Emergency Fund: 500
- [vault] Vacation Fund: 200

## Investments
- [roth] Roth IRA: 250
- [taxable] Taxable Brokerage: 50

## Fixed Expenses
- [bill] Rent: 1500
- [bill] Car Payment: 300

## Subscriptions
- [sub] Streaming: 15
- [sub] Music: 12

## Discretionary
- [flex] Groceries: 400
- [flex] Dining Out: 150
```

### Tags

| Tag | Purpose | Color |
|-----|---------|-------|
| `vault` | Savings buckets | 🟢 Emerald |
| `roth` | Retirement accounts | 🔵 Cyan |
| `taxable` | Investment accounts | 🟣 Indigo |
| `bill` | Fixed expenses | 🔴 Red |
| `sub` | Subscriptions | 🟠 Amber |
| `flex` | Discretionary spending | 🟣 Violet |

### Interaction

- **Edit amounts** — Click any dollar value to edit inline
- **Add items** — Click "+ Add item" at the bottom of any category
- **Delete items** — Hover and click the × button
- **Reorder items** — Drag by the ⋮⋮ handle
- **Collapse categories** — Click the category header
- **Open chart on mobile** — Tap the mini pie icon on the right edge to switch between `List` and `Chart`
- **Open source note** — Open the dashboard pane menu (`...`) and choose **Open budget source note**
- **Create next month** — Open the dashboard pane menu (`...`) and choose **Create next month budget**

### Rendering Safety Notes

- BudgetBase uses a dedicated custom workspace view (`budgetbase-dashboard`) registered with Obsidian's `registerView` API.
- Dashboard rendering no longer depends on Markdown preview DOM internals.
- Markdown remains the source of truth; the dashboard parses and writes the same `.md` budget file content.
- Use the dashboard pane menu (`...`) action **Open budget source note** to jump to the raw Markdown note.

### Conflict Recovery (Writes Paused)

When BudgetBase detects external file divergence while you have local edits, it pauses writes and shows an in-view banner:

- **State shown:** `External change detected. Writes paused.`
- **Use Remote** — Discard local pending edits and adopt current file contents from disk.
- **Retry Local** — Attempt to write your local pending snapshot only if remote still matches the conflict checkpoint.
- **Open Diff** — Expand an inline inspect view with local pending vs remote current snapshots.

Conflict state is persisted by file path, including your pending local snapshot. If Obsidian reloads/restarts before you resolve, the conflict banner and recovery actions are restored.

### YAML Safety Notes

- In Obsidian runtime, YAML parsing/serialization uses Obsidian's YAML helpers when available.
- Fallback YAML mode supports a conservative subset and intentionally refuses unsupported constructs instead of rewriting them.

## Settings

Access via Settings → BudgetBase:

- **Currency** — Symbol, position, decimal places
- **Default income** — Pre-fill when creating new budgets
- **Pie chart** — Show/hide by default, size options
- **Default categories** — Template for new budget files

## Commands

- **Create new budget** — Generate a budget file for the current month
- **Open budget dashboard** — Jump to your most recent budget file

## Development

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build

# Run tests
npm test
```

### Tech Stack

- **[Preact](https://preactjs.com/)** — 3KB React alternative
- **[Visx](https://airbnb.io/visx/)** — Low-level visualization primitives
- **[esbuild](https://esbuild.github.io/)** — Fast bundler (~70KB output)

## Release Notes

- Conflict-safety UX pass: external divergence now shows an in-view paused-writes banner with `Use Remote`, `Retry Local`, and inline `Open Diff` inspect flow. Unresolved local snapshots/conflict metadata now persist across reload/restart, and conflict resolution transitions are explicit via strategy-based API.

## License

MIT © Conner Verret

---

Built with ☕ for personal finance nerds who live in Obsidian.
