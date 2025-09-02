import { execa } from 'execa';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ConfigLoader } from './config-loader';
import { EnvironmentUpdater } from './environment-updater';
import { TmuxManager } from './tmux-manager';
import { DockerManager } from './docker-manager';
import { GitManager } from './git-manager';

export interface WorktreeOptions {
  cloneData?: boolean;
}

export interface OpenOptions {
  newTab?: boolean;
  detached?: boolean;
  printCommand?: boolean;
}

export class WorktreeManager {
  private config: ConfigLoader;
  private envUpdater: EnvironmentUpdater;
  private tmux: TmuxManager;
  private docker: DockerManager;
  private git: GitManager;

  constructor() {
    this.config = new ConfigLoader();
    this.envUpdater = new EnvironmentUpdater(this.config);
    this.tmux = new TmuxManager();
    this.docker = new DockerManager();
    this.git = new GitManager();
  }

  async newWorktree(name: string, options: WorktreeOptions = {}): Promise<void> {
    const cloneData = options.cloneData ?? true;

    await this.createWorktree(name, { cloneData });
    console.log();
    console.log(chalk.yellow('🚀 Starting containers...'));
    await this.startWorktree(name);
    console.log();
    console.log(chalk.yellow('🖥️  Opening tmux session...'));

    if (cloneData) {
      await this.tmux.openWorktree(name, { detached: true });
      const sessionName = name;
      await this.tmux.sendKeys(
        sessionName,
        "echo 'Waiting for containers to start...'; sleep 10 && ./wt clone-volumes && echo 'Data cloned successfully!'",
        '0.0'
      );
      await this.tmux.attachSession(sessionName);
    } else {
      await this.tmux.openWorktree(name);
    }
  }

  async createWorktree(name: string, _options: WorktreeOptions = {}): Promise<void> {
    const spinner = ora('Creating worktree').start();

    try {
      const projectName = await this.git.getProjectName();
      const branchName = name;
      const worktreeDir = path.join('..', `${projectName}-${name}`);

      // Check if branch already exists
      if (await this.git.branchExists(branchName)) {
        throw new Error(`Branch ${branchName} already exists`);
      }

      // Check if directory already exists
      if (await fs.pathExists(worktreeDir)) {
        throw new Error(`Directory ${worktreeDir} already exists`);
      }

      spinner.text = `Creating worktree: ${worktreeDir}`;
      await this.git.addWorktree(worktreeDir, branchName);

      spinner.text = 'Copying environment files...';
      await this.copyEnvironmentFiles(worktreeDir);

      spinner.text = 'Copying gitignored files...';
      await this.copyGitIgnoredFiles(worktreeDir);


      spinner.text = 'Updating configuration...';
      await this.envUpdater.updateEnvironmentFiles(name, worktreeDir);

      spinner.succeed(chalk.green(`✅ Worktree created: ${worktreeDir}`));
      console.log(chalk.green(`🌿 Branch: ${branchName}`));
      console.log();
      console.log('Next steps:');
      console.log(`  wt start ${name}    # Start containers`);
      console.log(`  wt open ${name}     # Open tmux session`);

      // Only show ./dev up if the script exists
      const devScriptPath = path.join(worktreeDir, 'dev');
      if (await fs.pathExists(devScriptPath)) {
        console.log('  # OR');
        console.log(`  cd ${worktreeDir} && ./dev up`);
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to create worktree'));
      throw error;
    }
  }

  async startWorktree(name: string): Promise<void> {
    if (!this.config.get().startContainers) {
      console.log(chalk.yellow('🚀 Container management disabled (start-containers=false)'));
      console.log(chalk.green(`✅ Worktree ready`));
      console.log(`Use 'wt open ${name}' to open tmux session`);
      return;
    }

    const spinner = ora('Starting containers').start();

    try {
      const projectName = await this.git.getProjectName();
      const worktreeDir = path.join('..', `${projectName}-${name}`);

      if (!(await fs.pathExists(worktreeDir))) {
        throw new Error(
          `Worktree ${worktreeDir} not found. Use 'wt create ${name}' to create it first`
        );
      }

      await this.docker.startContainers(name, worktreeDir);

      spinner.succeed(chalk.green('✅ Containers started successfully'));
      console.log(`Use 'wt open ${name}' to open tmux session`);
    } catch (error) {
      spinner.fail(chalk.red('Failed to start containers'));
      throw error;
    }
  }

  async openWorktree(name: string, options: OpenOptions = {}): Promise<void> {
    const projectName = await this.git.getProjectName();
    const worktreeDir = path.join('..', `${projectName}-${name}`);

    if (!(await fs.pathExists(worktreeDir))) {
      throw new Error(
        `Worktree ${worktreeDir} not found. Use 'wt create ${name}' to create it first`
      );
    }

    await this.tmux.openWorktree(name, options);
  }

  async listWorktrees(): Promise<void> {
    console.log(chalk.green('📑 Git worktrees:'));
    const { stdout } = await execa('git', ['worktree', 'list']);
    console.log(stdout);
  }

  async cleanupWorktree(name: string, removeDir: boolean = false): Promise<void> {
    const spinner = ora(`Cleaning up worktree: ${name}`).start();

    try {
      const projectName = await this.git.getProjectName();
      const worktreeDir = path.join('..', `${projectName}-${name}`);

      // Check if the worktree directory exists in the parent directory
      if (!(await fs.pathExists(worktreeDir))) {
        throw new Error(
          `Worktree directory ${worktreeDir} not found. Make sure you run this command from the main git repository root.`
        );
      }

      if (this.config.get().startContainers) {
        spinner.text = 'Stopping containers...';
        await this.docker.cleanupContainers(name, worktreeDir);
      }

      spinner.text = 'Killing tmux session...';
      await this.tmux.killSession(name);

      if (removeDir) {
        spinner.text = 'Removing worktree...';
        await this.git.removeWorktree(worktreeDir);

        spinner.text = 'Deleting branch...';
        await this.git.deleteBranch(name);
      }

      spinner.succeed(chalk.green(`✅ Cleanup complete for worktree: ${name}`));

      if (!removeDir) {
        console.log(
          chalk.yellow(
            `💡 Note: Worktree directory preserved. Use 'wt cleanup ${name} --remove-dir' to delete it.`
          )
        );
      }
    } catch (error) {
      spinner.fail(chalk.red('Cleanup failed'));
      throw error;
    }
  }

  async cloneVolumes(): Promise<void> {
    const spinner = ora('Cloning volumes from main worktree').start();

    try {
      const currentDir = process.cwd();
      const projectName = await this.git.getProjectName();
      const worktreeName = path.basename(currentDir).replace(`${projectName}-`, '');

      if (path.basename(currentDir) === projectName) {
        throw new Error('Run this command from a worktree, not the main repository');
      }

      await this.docker.cloneVolumes(projectName, worktreeName);
      spinner.succeed(chalk.green('✅ Volume clone complete'));
    } catch (error) {
      spinner.fail(chalk.red('Failed to clone volumes'));
      throw error;
    }
  }

  private async copyEnvironmentFiles(worktreeDir: string): Promise<void> {
    const mainDir = await this.git.getMainWorktreeDir();
    
    // Load config to get ENV_FILES
    await this.config.loadConfig();
    const configEnvFiles = this.config.get().envFiles || [];
    
    // Use ENV_FILES from config if available, otherwise fall back to defaults
    const envFiles = configEnvFiles.length > 0 ? configEnvFiles : [
      '.env',
      'client-app/.env',
      'admin/.env',
      '.node_env',
      'node_env',
      '.node-env',
      'node.env'
    ];

    for (const envFile of envFiles) {
      const sourcePath = path.join(mainDir, envFile);
      const destPath = path.join(worktreeDir, envFile);
      const samplePath = path.join(worktreeDir, `${envFile}.sample`);

      if (await fs.pathExists(sourcePath)) {
        await fs.ensureDir(path.dirname(destPath));
        await fs.copy(sourcePath, destPath);
      } else if (await fs.pathExists(samplePath)) {
        await fs.ensureDir(path.dirname(destPath));
        await fs.copy(samplePath, destPath);
      }
    }

    // If using default files, also check for node_env files in subdirectories
    if (configEnvFiles.length === 0) {
      const subdirs = ['client-app', 'admin', 'server', 'api'];
      const nodeEnvPatterns = ['.node_env', 'node_env', '.node-env', 'node.env'];

      for (const subdir of subdirs) {
        for (const pattern of nodeEnvPatterns) {
          const envFile = path.join(subdir, pattern);
          const sourcePath = path.join(mainDir, envFile);
          const destPath = path.join(worktreeDir, envFile);
          const samplePath = path.join(worktreeDir, `${envFile}.sample`);

          if (await fs.pathExists(sourcePath)) {
            await fs.ensureDir(path.dirname(destPath));
            await fs.copy(sourcePath, destPath);
          } else if (await fs.pathExists(samplePath)) {
            await fs.ensureDir(path.dirname(destPath));
            await fs.copy(samplePath, destPath);
          }
        }
      }
    }
  }


  private async copyGitIgnoredFiles(worktreeDir: string): Promise<void> {
    const mainDir = await this.git.getMainWorktreeDir();
    const gitignorePath = path.join(mainDir, '.gitignore');

    if (!(await fs.pathExists(gitignorePath))) {
      return;
    }

    // Read and parse .gitignore
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    const patterns = gitignoreContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    // Process each pattern
    for (const pattern of patterns) {
      // Skip negation patterns (starting with !)
      if (pattern.startsWith('!')) {
        continue;
      }

      // Clean up the pattern
      let cleanPattern = pattern;
      // Remove trailing slashes for directories
      if (cleanPattern.endsWith('/')) {
        cleanPattern = cleanPattern.slice(0, -1);
      }

      const sourcePath = path.join(mainDir, cleanPattern);

      // Check if the path exists
      if (await fs.pathExists(sourcePath)) {
        const destPath = path.join(worktreeDir, cleanPattern);
        const stat = await fs.stat(sourcePath);

        // Skip if destination already exists (e.g., from copyEnvironmentFiles)
        if (await fs.pathExists(destPath)) {
          continue;
        }

        try {
          await fs.ensureDir(path.dirname(destPath));
          if (stat.isDirectory()) {
            await fs.copy(sourcePath, destPath, {
              overwrite: false,
              errorOnExist: false
            });
          } else {
            await fs.copy(sourcePath, destPath, {
              overwrite: false,
              errorOnExist: false
            });
          }
        } catch (error) {
          // Silently skip files that can't be copied
          console.log(
            chalk.yellow(
              `⚠️  Skipped copying ${cleanPattern}: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      }
    }
  }
}
