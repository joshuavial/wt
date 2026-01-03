# Claude Code Settings Sync

> Automatically copy and clean up Claude Code per-project permissions when managing worktrees

## Why

When creating a new worktree with `wt new`, Claude Code treats it as a completely new project. This means:
- All previously authorized bash commands need to be re-approved
- All tool permissions need to be re-granted
- This is repetitive and friction-heavy when working across multiple worktrees

The permissions are stored in `.claude/settings.local.json` within each project directory. By copying this file from the parent worktree to the new worktree, we can preserve the permission grants.

Similarly, when deleting a worktree, the `.claude/` directory in that worktree should be cleaned up to avoid orphaned permission data.

## What Changes

### Configuration
- New `.wt.conf` setting: `SYNC_CLAUDE_SETTINGS` (boolean, default: true)
- Controls whether Claude Code settings are copied to new worktrees

### Worktree Creation (`wt new`, `wt create`)
- Copy `.claude/settings.local.json` from main worktree to new worktree
- Only copy if source file exists and `SYNC_CLAUDE_SETTINGS` is enabled
- Create `.claude/` directory in new worktree if needed

### Worktree Deletion (`wt cleanup --remove-dir`, `wt remove`)
- Remove `.claude/` directory from worktree being deleted
- This happens automatically as part of directory removal

## Scope

### In Scope
- Copying `.claude/settings.local.json` during worktree creation
- New config option to enable/disable this behavior
- Documentation updates

### Out of Scope
- Syncing global Claude Code settings (`~/.claude/settings.json`)
- Syncing session history (`~/.claude/projects/`)
- Syncing between existing worktrees (only main → new)
- Two-way sync (changes in worktree don't propagate back to main)
