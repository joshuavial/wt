# Claude Code Settings Copy

## ADDED Requirements

### Requirement: Copy Claude Settings on Worktree Creation

The system SHALL copy Claude Code per-project settings from the main worktree to the new worktree when creating a new worktree, if the `SYNC_CLAUDE_SETTINGS` configuration option is enabled and the source settings file exists.

#### Scenario: Settings copied when enabled and file exists

- **Given**: A main worktree with `.claude/settings.local.json` containing permission grants
- **And**: `SYNC_CLAUDE_SETTINGS=true` in `.wt.conf` (or using default)
- **When**: User runs `wt new feature-branch`
- **Then**: The new worktree contains `.claude/settings.local.json` with the same content as the main worktree

#### Scenario: Settings not copied when disabled

- **Given**: A main worktree with `.claude/settings.local.json` containing permission grants
- **And**: `SYNC_CLAUDE_SETTINGS=false` in `.wt.conf`
- **When**: User runs `wt new feature-branch`
- **Then**: The new worktree does NOT contain `.claude/settings.local.json`

#### Scenario: No error when source file missing

- **Given**: A main worktree without `.claude/settings.local.json`
- **And**: `SYNC_CLAUDE_SETTINGS=true` in `.wt.conf`
- **When**: User runs `wt new feature-branch`
- **Then**: The worktree is created successfully without any Claude settings copied
- **And**: No error is shown to the user

### Requirement: Config Option Default

The `SYNC_CLAUDE_SETTINGS` configuration option SHALL default to `true` when not specified in `.wt.conf`.

#### Scenario: Default behavior copies settings

- **Given**: A main worktree with `.claude/settings.local.json`
- **And**: No `SYNC_CLAUDE_SETTINGS` setting in `.wt.conf`
- **When**: User runs `wt new feature-branch`
- **Then**: The new worktree contains `.claude/settings.local.json`

### Requirement: Create Target Directory

The system SHALL create the `.claude/` directory in the new worktree if it does not exist before copying the settings file.

#### Scenario: Directory created when needed

- **Given**: A main worktree with `.claude/settings.local.json`
- **And**: The new worktree does not have a `.claude/` directory
- **When**: User runs `wt new feature-branch`
- **Then**: The `.claude/` directory is created in the new worktree
- **And**: The settings file is copied into it
