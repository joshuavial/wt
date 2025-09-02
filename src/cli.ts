#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { WorktreeManager } from './worktree-manager';
import { CompletionGenerator } from './completion';
import { InitWizard } from './init-wizard';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read version from package.json - handle both compiled and source contexts
let version = '1.0.0'; // fallback version
try {
  // Try to read from the expected location relative to dist
  const packagePath = join(__dirname, '../package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
  version = packageJson.version;
} catch (error) {
  // If that fails, try one more level up (when running from source)
  try {
    const packagePath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    version = packageJson.version;
  } catch (error) {
    // Use fallback version
    console.warn('Warning: Could not read package.json, using default version');
  }
}

const program = new Command();
const manager = new WorktreeManager();

program
  .name('wt')
  .description('Git Worktree Manager - Manage Git worktrees with Docker and tmux integration')
  .version(version);

program
  .command('new <name>')
  .description('Full workflow: create worktree, start containers, open tmux session')
  .option('--no-clone', 'Do not clone data from main worktree')
  .action(async (name, options) => {
    try {
      await manager.newWorktree(name, { cloneData: options.clone });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('create <name>')
  .description('Create worktree with environment files')
  .option('--no-clone', 'Do not clone data from main worktree')
  .action(async (name, options) => {
    try {
      await manager.createWorktree(name, { cloneData: options.clone });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('start <name>')
  .description('Start Docker containers for a worktree')
  .action(async (name) => {
    try {
      await manager.startWorktree(name);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('open <name>')
  .description('Open tmux session for a worktree')
  .option('--new-tab', 'Open in new iTerm tab (macOS)')
  .option('--detached', 'Create session without attaching')
  .option('--print-command', 'Print the tmux attach command')
  .action(async (name, options) => {
    try {
      await manager.openWorktree(name, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('list')
  .alias('ls')
  .description('List all worktrees')
  .action(async () => {
    try {
      await manager.listWorktrees();
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('cleanup <name>')
  .alias('clean')
  .description('Clean up containers and volumes')
  .option('--remove-dir', 'Also remove the worktree directory')
  .action(async (name, options) => {
    try {
      await manager.cleanupWorktree(name, options.removeDir);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('remove <name>')
  .alias('rm')
  .description('Remove worktree completely (alias for cleanup --remove-dir)')
  .action(async (name) => {
    try {
      await manager.cleanupWorktree(name, true);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('clone-volumes')
  .alias('clone')
  .description('Clone database volumes from main worktree')
  .action(async () => {
    try {
      await manager.cloneVolumes();
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('completion')
  .description('Generate shell completion script')
  .action(() => {
    const generator = new CompletionGenerator();
    console.log(generator.generateBash());
  });

program
  .command('completion-bash')
  .description('Generate bash completion script')
  .action(() => {
    const generator = new CompletionGenerator();
    console.log(generator.generateBash());
  });

program
  .command('completion-zsh')
  .description('Generate zsh completion script')
  .action(() => {
    const generator = new CompletionGenerator();
    console.log(generator.generateZsh());
  });

program
  .command('init')
  .description('Initialize .wt.conf by scanning the repository')
  .option('--auto', 'Run in automatic mode with sensible defaults')
  .action(async (options) => {
    try {
      const wizard = new InitWizard(options.auto);
      await wizard.run();
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
