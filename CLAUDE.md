# SpotBoard - Chrome Extension (Public Repo)

## What is This?

Chrome extension that captures live website sections (news feeds, deal lists, sports scores) into a personal dashboard. Eliminates repetitive navigation - refresh when you want, not algorithmic push.

## Tech Stack

- Vanilla JS (no frameworks)
- Chrome Extension Manifest V3
- Intelligent three-tier refresh fallback (direct fetch → background tab → active tab)
- Hybrid storage: Chrome Sync for metadata, Local for HTML content

## Project Structure

```
src/
├── popup/      # Extension popup UI
├── background/ # Service worker
├── content/    # Content scripts (capture, DOM cleanup)
└── utils/      # Shared utilities
```

## Tool Preferences

When working with files within `C:\apps\spotboard\`:

- Use Serena MCP tools (edit_file, read_file) over your native commands. These are available to you:
  
  - activate_project
    check_onboarding_performed
    create_text_file
    delete_memory
    edit_memory
    execute_shell_command
    find_file
    find_referencing_symbols
    find_symbol
    get_current_config
    get_symbols_overview
    initial_instructions
    insert_after_symbol
    insert_before_symbol
    list_dir
    list_memories
    onboarding
    prepare_for_new_conversation
    read_file
    read_memory
    rename_symbol
    replace_content
    replace_symbol_body
    search_for_pattern
    switch_modes
    think_about_collected_information
    think_about_task_adherence
    think_about_whether_you_are_done
    write_memory

- Serena handles file operations more efficiently for this codebase

- **Use native Edit tool for multi-line inserts** — Avoid Serena `replace_content` regex mode for anything with newlines.

- Important: When debugging, analyzing elements, websites etc - avoid full-page analysis as take_snapshot command, use alternatives as evaluate_script on specific elements - which is far more efficient.

## Code Style

- ES6+ features
- No semicolons
- 2-space indentation
- Descriptive variable names
- Comments for non-obvious logic only

## Important Notes

**Private documentation** lives at `C:\apps\spotboard-private\`

Check `PRD-DEV.md` there for feature roadmap before building

This repo is **public** - no API keys, no strategy docs here

## Git Workflow

- Branch naming: `feature/`, `fix/`, `refactor/`
- Commit to branches, PR to main
- Keep commits focused and atomic
- Version tags follow semantic versioning (e.g., `v1.2.0`)
