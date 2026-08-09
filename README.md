# tasklist-tools

Task state management and navigation commands for tasklist files.

Requires a grammar package such as [language-tasklist](https://github.com/lumine-code/language-tasklist).

## Features

- **Task toggling**: cycle through task states with keyboard or middle-click.
- **Quick state commands**: set tasks directly to high, todo, done, fail, or info.
- **Header navigation**: jump between headers or move items to headers.
- **Status bar counter**: shows task counts by type with click-to-navigate.
- **Markdown translation**: convert markdown checkboxes to tasklist format.
- **Navigation panel**: outline support via [navigation-panel](https://github.com/lumine-code/navigation-panel).

## Installation

To install `tasklist-tools` search for _tasklist-tools_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/tasklist-tools`.

## Commands

Commands available in `lumine-workspace`. Each acts on the active editor and
declines with a notification when its grammar is not a tasklist:

- `tasklist-tools:toggle-tick`: add or toggle tick of selected tasks by `▷` `☐` `•` -> `✔` -> `✘` -> `☐` cycle,
- `tasklist-tools:set-as-high`: add or change tick of selected tasks as `▷`,
- `tasklist-tools:set-as-todo`: add or change tick of selected tasks as `☐`,
- `tasklist-tools:set-as-done`: add or change tick of selected tasks as `✔`,
- `tasklist-tools:set-as-fail`: add or change tick of selected tasks as `✘`,
- `tasklist-tools:set-as-info`: add or change tick of selected tasks as `•`,
- `tasklist-tools:go-to-next-tick`: navigate to next tick of any type with wraparound,
- `tasklist-tools:go-to-next-high`: navigate to next `▷` tick with wraparound,
- `tasklist-tools:go-to-next-todo`: navigate to next `☐` tick with wraparound,
- `tasklist-tools:go-to-next-done`: navigate to next `✔` tick with wraparound,
- `tasklist-tools:go-to-next-fail`: navigate to next `✘` tick with wraparound,
- `tasklist-tools:go-to-next-info`: navigate to next `•` tick with wraparound,
- `tasklist-tools:translate-markdown`: translate markdown-style ticks and bullets to tasklist-style,
- `tasklist-tools:move-items-to-next-header`: move selected items to next header,
- `tasklist-tools:move-items-to-last-header`: move selected items to last header,
- `tasklist-tools:move-to-next-header`: set cursor position equal to next header,
- `tasklist-tools:move-to-previous-header`: set cursor position equal to previous header,
- `tasklist-tools:move-to-last-header`: set cursor position equal to last header.

## Customization

The status-bar counter can be restyled from your `styles.css`, e.g.:

```css
.tasklist-status {
  #done-counter {
    color: var(--text-color-success);
  }
  #fail-counter {
    color: var(--text-color-error);
  }
}
```

## Services

- **status-bar** (`^1.0.0`): consumed to show the task summary counter in the status bar.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
