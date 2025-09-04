# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2025-09-04

### Added
- **Automatic Supabase configuration detection**: The `wt init` command now automatically detects and parses Supabase `config.toml` files in the repository
- **Supabase port mapping**: Automatically generates port mapping variables for all Supabase services (API, Database, Studio, Inbucket, Analytics, Pooler, Shadow)
- **Multi-instance Supabase support**: Detects both main and test Supabase instances with appropriate naming conventions (e.g., `SUPABASE_API_PORT` vs `SUPABASE_TEST_API_PORT`)

### Changed
- Enhanced `wt init` workflow to include Supabase configuration scanning after environment file detection
- `.wt.conf` file now added to `.gitignore` by default as it contains machine-specific port configurations

## [0.2.1] - 2025-07-21

### Fixed
- Removed automatic `_ai.bws` symlink creation from `create` command to prevent "already exists" errors on subsequent worktree creations

## [0.2.0] - 2025-07-19

### Added
- **Automatic .gitignore file copying**: When creating a new worktree, automatically copies all files and directories listed in `.gitignore` from the main worktree (e.g., `node_modules`, `.env` files, `dist`, etc.)
- **Docker Compose validation**: All Docker-related commands now check for the existence of `docker-compose.yml` or `docker-compose.yaml` before executing
- **Cleanup directory validation**: The `cleanup` command now verifies it's being run from the main git repository root to prevent accidental execution from wrong directories
- **Conditional ./dev script display**: The `./dev up` suggestion is now only shown if the `dev` script actually exists in the worktree

### Changed
- Docker operations (start, cleanup, clone-volumes) now gracefully skip with warning messages when no docker-compose file is found
- Improved error messages for better user guidance

### Fixed
- TypeScript error with optional `searchPattern` and `replacement` parameters in environment file updates
- Added missing `stat` mock in test setup

## [0.1.0] - 2025-07-18

### Initial Release
- **Git worktree management**: Create, list, and cleanup Git worktrees with isolated branches
- **Docker container orchestration**: Automatic container management with unique port offsets per worktree
- **Tmux session integration**: Dedicated tmux sessions for each worktree with automatic creation and attachment
- **Environment file management**: 
  - Automatic copying of `.env` files from main worktree or `.env.sample` templates
  - Dynamic port offset calculation to prevent conflicts
  - Template variable substitution ({{WORKTREE_NAME}}, {{WORKTREE_INDEX}}, etc.)
- **Configuration system**: Support for `.wt.conf` file with customizable settings
- **Database cloning**: Clone PostgreSQL and Qdrant volumes from main worktree
- **Shell completion**: Bash and Zsh completion support
- **ESLint and Prettier**: Code quality tools with TypeScript support
- **Comprehensive test suite**: 78+ tests with 86%+ coverage