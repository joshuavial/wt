import { execa } from 'execa';
import chalk from 'chalk';
import * as path from 'path';
import { GitManager } from './git-manager';
import { ConfigLoader } from './config-loader';

export interface TmuxOpenOptions {
  newTab?: boolean;
  detached?: boolean;
  printCommand?: boolean;
}

export class TmuxManager {
  private git: GitManager;
  private config: ConfigLoader;

  constructor() {
    this.git = new GitManager();
    this.config = new ConfigLoader();
  }

  async openWorktree(name: string, options: TmuxOpenOptions = {}): Promise<void> {
    const projectName = await this.git.getProjectName();
    const worktreeDir = path.resolve('..', `${projectName}-${name}`);
    const sessionName = name;

    if (options.printCommand) {
      console.log(`cd ${worktreeDir} && tmux attach -t ${sessionName}`);
      return;
    }

    // Check if tmux is available
    try {
      await execa('which', ['tmux']);
    } catch {
      throw new Error('tmux is not installed');
    }

    // Create tmux session if it doesn't exist
    if (!(await this.sessionExists(sessionName))) {
      await this.createSession(sessionName, worktreeDir);
    }

    // Handle different opening modes
    if (options.detached) {
      console.log(chalk.green(`✅ Session ${sessionName} is ready`));
      console.log(`Attach with: tmux attach -t ${sessionName}`);
    } else if (options.newTab) {
      await this.openInNewTab(worktreeDir, sessionName);
    } else {
      // Default: attach in current terminal
      console.log(chalk.green(`✅ Attaching to tmux session: ${sessionName}`));
      await this.attachSession(sessionName);
    }
  }

  async createSession(sessionName: string, worktreeDir: string): Promise<void> {
    console.log(chalk.yellow(`🖥️  Creating tmux session: ${sessionName}`));

    // Create session in the worktree directory
    await execa('tmux', ['new-session', '-d', '-s', sessionName, '-c', worktreeDir]);

    // Create vertical split (right pane)
    await execa('tmux', ['split-window', '-h', '-c', worktreeDir, '-t', sessionName]);

    // Create horizontal split in right pane (bottom right)
    await execa('tmux', ['split-window', '-v', '-c', worktreeDir, '-t', `${sessionName}:0.1`]);

    // Try to start claude in bottom right pane
    try {
      await execa('which', ['claude']);
      await execa('tmux', ['send-keys', '-t', `${sessionName}:0.2`, 'claude', 'C-m']);
    } catch {
      // Claude not available, that's ok
    }

    // Check if containers are running
    if (this.config.get().startContainers) {
      const projectName = await this.git.getProjectName();
      const containerPrefix = `${projectName}-${sessionName}`;

      try {
        const { stdout } = await execa('docker', [
          'ps',
          '--filter',
          `name=${containerPrefix}`,
          '--format',
          '{{.Names}}'
        ]);
        if (!stdout.trim()) {
          await execa('tmux', [
            'send-keys',
            '-t',
            `${sessionName}:0.1`,
            "echo 'Containers not running. Start with: ./dev up'",
            'C-m'
          ]);
        }
      } catch {
        // Docker might not be available
      }
    }

    // Select the left pane (main working area)
    await execa('tmux', ['select-pane', '-t', `${sessionName}:0.0`]);
  }

  async sessionExists(sessionName: string): Promise<boolean> {
    try {
      await execa('tmux', ['has-session', '-t', sessionName]);
      return true;
    } catch {
      return false;
    }
  }

  async attachSession(sessionName: string): Promise<void> {
    await execa('tmux', ['attach-session', '-t', sessionName], { stdio: 'inherit' });
  }

  async killSession(sessionName: string): Promise<void> {
    try {
      await execa('tmux', ['kill-session', '-t', sessionName]);
    } catch {
      // Session might not exist
    }
  }

  async sendKeys(sessionName: string, keys: string, pane: string = '0.0'): Promise<void> {
    await execa('tmux', ['send-keys', '-t', `${sessionName}:${pane}`, keys, 'C-m']);
  }

  private async openInNewTab(worktreeDir: string, sessionName: string): Promise<void> {
    // Check if we're on macOS and iTerm is available
    const isMac = process.platform === 'darwin';

    if (isMac) {
      console.log(chalk.yellow('🆕 Opening new iTerm tab...'));

      const script = `
tell application "iTerm"
    tell current window
        create tab with default profile
        tell current session of current tab
            write text "cd ${worktreeDir} && tmux attach -t ${sessionName}"
        end tell
    end tell
end tell`;

      try {
        await execa('osascript', ['-e', script]);
      } catch {
        console.log(chalk.yellow('⚠️  iTerm not detected, falling back to current terminal'));
        await this.attachSession(sessionName);
      }
    } else {
      console.log(chalk.yellow('⚠️  New tab opening is only supported on macOS with iTerm'));
      await this.attachSession(sessionName);
    }
  }
}
