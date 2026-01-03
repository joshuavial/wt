# Claude Code Settings Cleanup

## ADDED Requirements

### Requirement: Cleanup Settings on Worktree Removal

The system SHALL remove the `.claude/` directory when removing a worktree's directory, as part of the normal directory removal process.

#### Scenario: Settings removed with worktree directory

- **Given**: A worktree with `.claude/settings.local.json`
- **When**: User runs `wt remove feature-branch`
- **Then**: The entire worktree directory is removed including `.claude/`

#### Scenario: Settings removed on cleanup with remove flag

- **Given**: A worktree with `.claude/settings.local.json`
- **When**: User runs `wt cleanup feature-branch --remove-dir`
- **Then**: The entire worktree directory is removed including `.claude/`

### Requirement: Settings Preserved on Cleanup Without Removal

The system SHALL preserve the `.claude/` directory when running cleanup without directory removal.

#### Scenario: Settings preserved on container-only cleanup

- **Given**: A worktree with `.claude/settings.local.json`
- **When**: User runs `wt cleanup feature-branch` (without `--remove-dir`)
- **Then**: The `.claude/` directory remains in the worktree
- **And**: Only containers are stopped
