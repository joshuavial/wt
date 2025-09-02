# wt - Git Worktree Manager

A TypeScript CLI tool for managing Git worktrees with Docker container orchestration and tmux session management. `wt` enables multiple AI agents or developers to work on improvements in parallel without disturbing each other.

## Overview

`wt` (worktree) is a command-line tool that automates the creation and management of Git worktrees, making it easy to have multiple folders and branches where AI agents can work on different improvements simultaneously without interfering with each other. Each worktree provides an isolated development environment with its own branch, containers, and configuration, allowing parallel development workflows without conflicts.

### Key Features

- **Parallel Development**: Enable multiple AI agents to work on separate improvements simultaneously
- **Automated Worktree Management**: Create, list, and remove Git worktrees with simple commands
- **Complete Isolation**: Each worktree gets its own branch and folder, preventing conflicts between parallel development efforts
- **Docker Integration**: Automatically manages Docker containers per worktree with port offset management (when docker-compose.yml exists)
- **Environment Isolation**: Each worktree gets its own environment configuration with automatic port mapping
- **Tmux Session Management**: Creates organized tmux sessions with pre-configured panes
- **Data Cloning**: Clone PostgreSQL and vector databases from your main worktree
- **Shell Completion**: Full bash and zsh completion support
- **Configuration File Support**: Customize behavior with `.wt.conf` files

## Installation

```bash
pnpm add -g @joshuavial/wt
```

Or install locally in your project:

```bash
pnpm add -D @joshuavial/wt
```

## Quick Start

```bash
# Initialize configuration by scanning your repository
wt init

# Create a new worktree with branch, start containers, and open tmux session
wt new feature-auth

# Or step by step:
wt create feature-auth  # Create worktree and branch
wt start feature-auth   # Start Docker containers
wt open feature-auth    # Open tmux session

# List all worktrees
wt list

# Clean up when done
wt cleanup feature-auth --remove-dir
```

## Commands

### Core Commands

- `wt init [--auto]` - Initialize .wt.conf by scanning the repository
  - `--auto` - Run in automatic mode with sensible defaults
- `wt new <name> [--no-clone]` - Full workflow: create worktree, start containers, open tmux session
- `wt create <name> [--no-clone]` - Create worktree with environment files
- `wt start <name>` - Start Docker containers for a worktree
- `wt open <name> [options]` - Open tmux session for a worktree
  - `--new-tab` - Open in new iTerm tab (macOS)
  - `--detached` - Create session without attaching
  - `--print-command` - Print the tmux attach command

### Management Commands

- `wt list` - List all worktrees
- `wt cleanup <name> [--remove-dir]` - Clean up containers and volumes
- `wt remove <name>` - Remove worktree completely (alias for cleanup --remove-dir)
- `wt clone-volumes` - Clone database volumes from main worktree

## Configuration

Create a `.wt.conf` file in your project root to customize behavior:

```bash
# .wt.conf example

# Control whether to start containers automatically
START_CONTAINERS=true

# Port offset increment between worktrees
PORT_OFFSET_INCREMENT=10

# Environment files to copy to worktrees
ENV_FILES=(
    ".env"
    "admin/.env"
    "client-app/.env"
)

# Define port mappings for automatic offset
PORT_MAPPINGS=(
    "API_PORT:3000"
    "CLIENT_PORT:3001"
    "ADMIN_PORT:3002"
)

# Define container name templates
CONTAINER_NAMES=(
    "DB_CONTAINER:myapp-{{WORKTREE_NAME}}-db"
    "API_CONTAINER:myapp-{{WORKTREE_NAME}}-api"
)

# File update rules
FILE_UPDATES=(
    ".env|env_vars|API_PORT,CLIENT_PORT,ADMIN_PORT"
    "docker-compose.yml|replace|container_name: myapp|container_name: myapp-{{WORKTREE_NAME}}"
)
```

### Template Variables

- `{{WORKTREE_NAME}}` - The name of the worktree
- `{{WORKTREE_INDEX}}` - Numeric index of the worktree (1, 2, 3...)
- `{{PORT_VAR}}` - Any port variable defined in PORT_MAPPINGS

## Workflow Example

### Parallel AI Agent Development

1. **AI Agent 1 works on authentication**:
   ```bash
   wt new agent1-auth-feature
   ```
   Creates an isolated environment with its own branch for authentication work.

2. **AI Agent 2 works on performance improvements**:
   ```bash
   wt new agent2-performance
   ```
   Creates a separate worktree and branch, allowing simultaneous work without conflicts.

3. **AI Agent 3 refactors the database layer**:
   ```bash
   wt new agent3-db-refactor
   ```
   Another isolated environment for database work.

Each agent works in complete isolation with:
- Separate Git branches preventing merge conflicts
- Independent Docker containers with unique ports
- Isolated environment configurations
- No interference between parallel development efforts

### Feature Development Workflow

1. **Start a new feature**:
   ```bash
   wt new user-authentication
   ```
   This creates a new worktree, sets up environment files with unique ports, starts Docker containers, and opens a tmux session.

2. **Work in the tmux session**:
   - Left pane: Main development
   - Top-right pane: Running services/logs
   - Bottom-right pane: Claude AI assistant (if available)

3. **Switch between features**:
   ```bash
   wt open another-feature
   ```

4. **Clean up after merging**:
   ```bash
   # Run from the main git repository root directory
   wt cleanup user-authentication --remove-dir
   ```
   
   **Note**: The cleanup command must be run from the main git repository root, not from within a worktree.

### Port Management

Each worktree automatically gets offset ports to avoid conflicts:
- Main worktree: API on 3000, Client on 3001
- First worktree: API on 3010, Client on 3011
- Second worktree: API on 3020, Client on 3021

## Shell Completion

### Bash
```bash
# Add to ~/.bashrc or ~/.bash_profile
eval "$(wt completion-bash)"
```

### Zsh
```bash
# Add to ~/.zshrc
eval "$(wt completion-zsh)"
```

## Advanced Features

### Custom Environment Updates

The tool can automatically update multiple file types:
- Environment variables in `.env` files
- Docker Compose configurations
- Any text file with pattern replacement

### Automatic File Copying

When creating a new worktree, `wt` automatically copies:
- All `.env` files from the main worktree (or from `.env.sample` if the main doesn't have them)
- Files and directories listed in `.gitignore` (like `node_modules`, `dist`, etc.)
- This ensures your worktree has all necessary local files that aren't tracked by Git

### Database Cloning

When creating a new worktree, `wt` can clone databases from your main worktree:
- PostgreSQL databases via pg_dump/restore
- Vector databases (Qdrant) via volume cloning
- Automatic retry if containers aren't ready

### Tmux Integration

Each worktree gets a dedicated tmux session with:
- Automatic pane layout (main, services, assistant)
- Working directory set to worktree root
- Container status checking
- Session persistence

## Requirements

- Git 2.5+ (for worktree support)
- Node.js 18+ and pnpm
- Docker and Docker Compose (optional, for container management - commands gracefully skip if docker-compose.yml not found)
- tmux (optional, for session management)
- bash 4+ or zsh (for full feature support)

## Architecture

The tool is built with:
- TypeScript for type safety and modern JavaScript features
- Commander.js for CLI command parsing
- Chalk for colored output
- Shell execution for Git and Docker commands
- Configuration file parsing for customization

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

MIT License - see LICENSE file for details
