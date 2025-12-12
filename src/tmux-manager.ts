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

function isInsideTmux(): boolean {
  return !!process.env.TMUX;
}

function isInsideITerm(): boolean {
  return !!process.env.ITERM_SESSION_ID;
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
    } else if (isInsideTmux() && isInsideITerm()) {
      // We're inside a tmux session in iTerm, open in new tab to avoid nesting
      console.log(chalk.yellow('📺 Detected running inside tmux session in iTerm'));
      await this.openInNewTab(worktreeDir, sessionName);
    } else if (isInsideTmux()) {
      // Inside tmux but not iTerm - can't open new tab, print instructions
      console.log(chalk.yellow('📺 Detected running inside tmux session'));
      console.log(chalk.yellow('⚠️  Cannot open new tab (not in iTerm). Session is ready.'));
      console.log(`Attach with: tmux attach -t ${sessionName}`);
    } else {
      // Default: attach in current terminal
      console.log(chalk.green(`✅ Attaching to tmux session: ${sessionName}`));
      await this.attachSession(sessionName);
    }
  }

  async createSession(sessionName: string, worktreeDir: string): Promise<void> {
    console.log(chalk.yellow(`🖥️  Creating tmux session: ${sessionName}`));

    // Load config
    await this.config.loadConfig();
    const cfg = this.config.get();
    const panes = cfg.tmuxPanes;

    // Build template variables
    const projectName = await this.git.getProjectName();
    const vars: Record<string, string> = {
      WORKTREE_NAME: sessionName,
      WORKTREE_DIR: worktreeDir,
      PROJECT_NAME: projectName
    };

    // Create base session (pane 0)
    await execa('tmux', ['new-session', '-d', '-s', sessionName, '-c', worktreeDir]);

    // Create additional panes based on config
    for (let i = 1; i < panes.length; i++) {
      const pane = panes[i];
      const args = ['split-window', pane.split === 'h' ? '-h' : '-v'];
      if (pane.size) {
        args.push('-p', pane.size.toString());
      }
      args.push('-c', worktreeDir, '-t', sessionName);
      await execa('tmux', args);
    }

    // Run commands in each pane
    for (let i = 0; i < panes.length; i++) {
      const pane = panes[i];
      if (!pane.command) continue;

      // Check condition if exists
      const condition = cfg.tmuxConditions.get(i);
      if (condition) {
        try {
          await execa('sh', ['-c', condition]);
        } catch {
          continue; // Condition failed, skip command
        }
      }

      // Handle special built-in commands
      if (pane.command === '__container_check__') {
        await this.runContainerCheck(sessionName, i, vars);
      } else {
        const cmd = this.substituteVars(pane.command, vars);
        await execa('tmux', ['send-keys', '-t', `${sessionName}:0.${i}`, cmd, 'C-m']);
      }
    }

    // Focus specified pane
    await execa('tmux', ['select-pane', '-t', `${sessionName}:0.${cfg.tmuxFocusPane}`]);
  }

  private substituteVars(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
  }

  private async runContainerCheck(sessionName: string, paneIndex: number, vars: Record<string, string>): Promise<void> {
    if (!this.config.get().startContainers) return;

    const containerPrefix = `${vars.PROJECT_NAME}-${vars.WORKTREE_NAME}`;

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
          `${sessionName}:0.${paneIndex}`,
          "echo 'Containers not running. Start with: ./dev up'",
          'C-m'
        ]);
      }
    } catch {
      // Docker might not be available
    }
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
