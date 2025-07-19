import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { WorktreeManager } from '../src/worktree-manager';
import { execa } from 'execa';
import * as fs from 'fs-extra';
import chalk from 'chalk';

vi.mock('execa');
vi.mock('../src/config-loader');
vi.mock('../src/environment-updater');
vi.mock('../src/tmux-manager');
vi.mock('../src/docker-manager');
vi.mock('../src/git-manager');

describe('WorktreeManager', () => {
  let worktreeManager: WorktreeManager;
  let mockConfig: any;
  let mockEnvUpdater: any;
  let mockTmux: any;
  let mockDocker: any;
  let mockGit: any;
  const mockExeca = execa as unknown as MockedFunction<typeof execa>;

  beforeEach(() => {
    worktreeManager = new WorktreeManager();

    // Access mocked dependencies
    mockConfig = (worktreeManager as any).config;
    mockEnvUpdater = (worktreeManager as any).envUpdater;
    mockTmux = (worktreeManager as any).tmux;
    mockDocker = (worktreeManager as any).docker;
    mockGit = (worktreeManager as any).git;

    // Setup default mocks
    mockConfig.get = vi.fn().mockReturnValue({
      startContainers: true,
      portOffsetIncrement: 10,
      portMappings: {},
      containerNames: {},
      fileUpdates: []
    });

    mockGit.getProjectName = vi.fn().mockResolvedValue('my-project');
    mockGit.getMainWorktreeDir = vi.fn().mockResolvedValue('/Users/test/my-project');
    mockGit.branchExists = vi.fn().mockResolvedValue(false);
    mockGit.addWorktree = vi.fn().mockResolvedValue(undefined);
    mockGit.removeWorktree = vi.fn().mockResolvedValue(undefined);
    mockGit.deleteBranch = vi.fn().mockResolvedValue(undefined);

    // Reset all mocks
    vi.mocked(fs.pathExists).mockReset();
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.copy).mockResolvedValue(undefined);
    vi.mocked(fs.symlink).mockResolvedValue(undefined);

    mockEnvUpdater.updateEnvironmentFiles = vi.fn().mockResolvedValue(undefined);
    mockTmux.openWorktree = vi.fn().mockResolvedValue(undefined);
    mockTmux.attachSession = vi.fn().mockResolvedValue(undefined);
    mockTmux.sendKeys = vi.fn().mockResolvedValue(undefined);
    mockTmux.killSession = vi.fn().mockResolvedValue(undefined);
    mockDocker.startContainers = vi.fn().mockResolvedValue(undefined);
    mockDocker.cleanupContainers = vi.fn().mockResolvedValue(undefined);
    mockDocker.cloneVolumes = vi.fn().mockResolvedValue(undefined);
  });

  describe('newWorktree', () => {
    it('should execute full workflow: create, start, and open', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock implementation for all path checks
      let worktreeCreated = false;
      vi.mocked(fs.pathExists).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr.includes('my-project-feature1')) {
          const exists = worktreeCreated;
          if (!exists && pathStr === '../my-project-feature1') {
            // After first check, mark as created
            worktreeCreated = true;
          }
          return exists;
        }
        if (pathStr.endsWith('.env')) {
          return true;
        }
        if (pathStr.endsWith('_ai.bws')) {
          return true;
        }
        return false;
      });

      await worktreeManager.newWorktree('feature1');

      expect(mockGit.addWorktree).toHaveBeenCalledWith('../my-project-feature1', 'feature1');
      expect(mockDocker.startContainers).toHaveBeenCalledWith('feature1', '../my-project-feature1');
      expect(mockTmux.openWorktree).toHaveBeenCalledWith('feature1', { detached: true });
      expect(mockTmux.sendKeys).toHaveBeenCalled();
      expect(mockTmux.attachSession).toHaveBeenCalledWith('feature1');

      consoleSpy.mockRestore();
    });

    it('should skip data cloning when cloneData is false', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock implementation for all path checks
      let worktreeCreated = false;
      vi.mocked(fs.pathExists).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr.includes('my-project-feature1')) {
          const exists = worktreeCreated;
          if (!exists && pathStr === '../my-project-feature1') {
            // After first check, mark as created
            worktreeCreated = true;
          }
          return exists;
        }
        if (pathStr.endsWith('.env')) {
          return true;
        }
        if (pathStr.endsWith('_ai.bws')) {
          return true;
        }
        return false;
      });

      await worktreeManager.newWorktree('feature1', { cloneData: false });

      expect(mockTmux.openWorktree).toHaveBeenCalledWith('feature1');
      expect(mockTmux.sendKeys).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('createWorktree', () => {
    it('should create worktree with all setup steps', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock implementation to handle multiple checks
      vi.mocked(fs.pathExists).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr.includes('my-project-feature1') && !pathStr.endsWith('/dev')) {
          return false;
        } // worktree doesn't exist
        if (pathStr.endsWith('.env')) {
          return true;
        } // .env exists
        if (pathStr.endsWith('_ai.bws')) {
          return true;
        } // _ai.bws exists
        if (pathStr.endsWith('/dev')) {
          return true;
        } // dev script exists
        return false;
      });

      await worktreeManager.createWorktree('feature1');

      // Verify branch and directory checks
      expect(mockGit.branchExists).toHaveBeenCalledWith('feature1');
      expect(fs.pathExists).toHaveBeenCalledWith('../my-project-feature1');

      // Verify worktree creation
      expect(mockGit.addWorktree).toHaveBeenCalledWith('../my-project-feature1', 'feature1');

      // Verify environment file copying
      expect(fs.copy).toHaveBeenCalledWith(
        '/Users/test/my-project/.env',
        '../my-project-feature1/.env'
      );

      // Verify symlink creation
      expect(fs.symlink).toHaveBeenCalledWith(
        '/Users/test/my-project/_ai.bws',
        '../my-project-feature1/_ai.bws'
      );

      // Verify environment updates
      expect(mockEnvUpdater.updateEnvironmentFiles).toHaveBeenCalledWith(
        'feature1',
        '../my-project-feature1'
      );

      consoleSpy.mockRestore();
    });

    it('should throw error if branch already exists', async () => {
      mockGit.branchExists.mockResolvedValueOnce(true);

      await expect(worktreeManager.createWorktree('existing')).rejects.toThrow(
        'Branch existing already exists'
      );
    });

    it('should throw error if directory already exists', async () => {
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true);

      await expect(worktreeManager.createWorktree('existing')).rejects.toThrow(
        'Directory ../my-project-existing already exists'
      );
    });

    it('should copy from sample files if env files do not exist', async () => {
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(false) // worktree dir
        .mockResolvedValueOnce(false) // .env doesn't exist in main
        .mockResolvedValueOnce(true) // .env.sample exists in worktree
        .mockResolvedValueOnce(false); // _ai.bws doesn't exist

      await worktreeManager.createWorktree('feature1');

      expect(fs.copy).toHaveBeenCalledWith(
        '../my-project-feature1/.env.sample',
        '../my-project-feature1/.env'
      );
    });

    it('should copy gitignored files from main worktree', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock gitignore content
      const gitignoreContent = `
# Comments should be ignored
node_modules/
.env
.env.local
dist/
coverage/
*.log
.DS_Store
      `;

      // Reset mocks
      vi.mocked(fs.pathExists).mockReset();
      vi.mocked(fs.readFile).mockReset();
      vi.mocked(fs.copy).mockReset();
      vi.mocked(fs.stat).mockReset();

      // Mock implementation for path checks
      vi.mocked(fs.pathExists).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr === '../my-project-feature1') {
          return false;
        } // worktree doesn't exist initially
        if (pathStr === '/Users/test/my-project/.gitignore') {
          return true;
        }
        if (pathStr === '/Users/test/my-project/.env') {
          return true;
        }
        if (pathStr === '/Users/test/my-project/node_modules') {
          return true;
        }
        if (pathStr === '/Users/test/my-project/dist') {
          return true;
        }
        if (pathStr === '/Users/test/my-project/.DS_Store') {
          return true;
        }
        if (pathStr === '/Users/test/my-project/_ai.bws') {
          return true;
        }
        if (pathStr.includes('../my-project-feature1/')) {
          return false;
        } // dest files don't exist
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (path.toString().endsWith('.gitignore')) {
          return gitignoreContent;
        }
        return '';
      });

      vi.mocked(fs.stat).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr.includes('node_modules') || pathStr.includes('dist')) {
          return { isDirectory: () => true } as any;
        }
        return { isDirectory: () => false } as any;
      });

      await worktreeManager.createWorktree('feature1');

      // Verify gitignore was read
      expect(fs.readFile).toHaveBeenCalledWith('/Users/test/my-project/.gitignore', 'utf-8');

      // Verify gitignored files were copied
      expect(fs.copy).toHaveBeenCalledWith(
        '/Users/test/my-project/.env',
        '../my-project-feature1/.env',
        expect.objectContaining({ overwrite: false })
      );
      expect(fs.copy).toHaveBeenCalledWith(
        '/Users/test/my-project/node_modules',
        '../my-project-feature1/node_modules',
        expect.objectContaining({ overwrite: false })
      );
      expect(fs.copy).toHaveBeenCalledWith(
        '/Users/test/my-project/dist',
        '../my-project-feature1/dist',
        expect.objectContaining({ overwrite: false })
      );
      expect(fs.copy).toHaveBeenCalledWith(
        '/Users/test/my-project/.DS_Store',
        '../my-project-feature1/.DS_Store',
        expect.objectContaining({ overwrite: false })
      );

      consoleSpy.mockRestore();
    });

    it('should not show ./dev up command if dev script does not exist', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock implementation where dev script doesn't exist
      vi.mocked(fs.pathExists).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr.includes('my-project-feature1') && !pathStr.endsWith('/dev')) {
          return false;
        } // worktree doesn't exist
        if (pathStr.endsWith('.env')) {
          return true;
        } // .env exists
        if (pathStr.endsWith('_ai.bws')) {
          return true;
        } // _ai.bws exists
        if (pathStr.endsWith('/dev')) {
          return false;
        } // dev script does NOT exist
        if (pathStr.endsWith('.gitignore')) {
          return false;
        } // no gitignore
        return false;
      });

      await worktreeManager.createWorktree('feature1');

      // Check console output
      const logCalls = consoleSpy.mock.calls.map((call) => call[0]);

      // Should show standard next steps
      expect(logCalls).toContain('Next steps:');
      expect(logCalls).toContain('  wt start feature1    # Start containers');
      expect(logCalls).toContain('  wt open feature1     # Open tmux session');

      // Should NOT show ./dev up option
      expect(logCalls).not.toContain('  # OR');
      expect(logCalls).not.toContain('  cd ../my-project-feature1 && ./dev up');

      consoleSpy.mockRestore();
    });
  });

  describe('startWorktree', () => {
    it('should start containers when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(fs.pathExists).mockResolvedValue(true);

      await worktreeManager.startWorktree('feature1');

      expect(mockDocker.startContainers).toHaveBeenCalledWith('feature1', '../my-project-feature1');

      consoleSpy.mockRestore();
    });

    it('should skip containers when disabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockConfig.get.mockReturnValue({
        startContainers: false,
        portOffsetIncrement: 10,
        portMappings: {},
        containerNames: {},
        fileUpdates: []
      });

      await worktreeManager.startWorktree('feature1');

      expect(consoleSpy).toHaveBeenCalledWith(
        chalk.yellow('🚀 Container management disabled (start-containers=false)')
      );
      expect(mockDocker.startContainers).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should throw error if worktree does not exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);

      await expect(worktreeManager.startWorktree('nonexistent')).rejects.toThrow(
        'Worktree ../my-project-nonexistent not found'
      );
    });
  });

  describe('openWorktree', () => {
    it('should open tmux session for existing worktree', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true);

      await worktreeManager.openWorktree('feature1', { newTab: true });

      expect(mockTmux.openWorktree).toHaveBeenCalledWith('feature1', { newTab: true });
    });

    it('should throw error if worktree does not exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);

      await expect(worktreeManager.openWorktree('nonexistent')).rejects.toThrow(
        'Worktree ../my-project-nonexistent not found'
      );
    });
  });

  describe('listWorktrees', () => {
    it('should list all worktrees', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockExeca.mockResolvedValueOnce({
        stdout:
          '/Users/test/my-project  abcd1234 [main]\n/Users/test/my-project-feature1  efgh5678 [feature1]',
        stderr: '',
        exitCode: 0
      } as any);

      await worktreeManager.listWorktrees();

      expect(consoleSpy).toHaveBeenCalledWith(chalk.green('📑 Git worktrees:'));
      expect(mockExeca).toHaveBeenCalledWith('git', ['worktree', 'list']);

      consoleSpy.mockRestore();
    });
  });

  describe('cleanupWorktree', () => {
    it('should cleanup containers and tmux session', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(fs.pathExists).mockResolvedValue(true); // worktree exists

      await worktreeManager.cleanupWorktree('feature1');

      expect(mockDocker.cleanupContainers).toHaveBeenCalledWith(
        'feature1',
        '../my-project-feature1'
      );
      expect(mockTmux.killSession).toHaveBeenCalledWith('feature1');
      expect(mockGit.removeWorktree).not.toHaveBeenCalled();
      expect(mockGit.deleteBranch).not.toHaveBeenCalled();

      expect(consoleSpy).toHaveBeenCalledWith(
        chalk.yellow(
          "💡 Note: Worktree directory preserved. Use 'wt cleanup feature1 --remove-dir' to delete it."
        )
      );

      consoleSpy.mockRestore();
    });

    it('should remove worktree and branch when removeDir is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(fs.pathExists).mockResolvedValue(true); // worktree exists

      await worktreeManager.cleanupWorktree('feature1', true);

      expect(mockGit.removeWorktree).toHaveBeenCalledWith('../my-project-feature1');
      expect(mockGit.deleteBranch).toHaveBeenCalledWith('feature1');

      expect(consoleSpy).not.toHaveBeenCalledWith(
        chalk.yellow(
          "💡 Note: Worktree directory preserved. Use 'wt cleanup feature1 --remove-dir' to delete it."
        )
      );

      consoleSpy.mockRestore();
    });

    it('should skip container cleanup when containers are disabled', async () => {
      mockConfig.get.mockReturnValue({
        startContainers: false,
        portOffsetIncrement: 10,
        portMappings: {},
        containerNames: {},
        fileUpdates: []
      });

      vi.mocked(fs.pathExists).mockResolvedValue(true); // worktree exists

      await worktreeManager.cleanupWorktree('feature1');

      expect(mockDocker.cleanupContainers).not.toHaveBeenCalled();
      expect(mockTmux.killSession).toHaveBeenCalled();
    });

    it('should throw error if worktree directory does not exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);

      await expect(worktreeManager.cleanupWorktree('feature1')).rejects.toThrow(
        'Worktree directory ../my-project-feature1 not found. Make sure you run this command from the main git repository root.'
      );

      // Should not proceed with cleanup
      expect(mockDocker.cleanupContainers).not.toHaveBeenCalled();
      expect(mockTmux.killSession).not.toHaveBeenCalled();
      expect(mockGit.removeWorktree).not.toHaveBeenCalled();
      expect(mockGit.deleteBranch).not.toHaveBeenCalled();
    });
  });

  describe('cloneVolumes', () => {
    it('should clone volumes from main worktree', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock current directory as worktree
      Object.defineProperty(process, 'cwd', {
        value: () => '/Users/test/my-project-feature1',
        configurable: true
      });

      await worktreeManager.cloneVolumes();

      expect(mockDocker.cloneVolumes).toHaveBeenCalledWith('my-project', 'feature1');

      consoleSpy.mockRestore();
    });

    it('should throw error if run from main repository', async () => {
      // Mock current directory as main repo
      Object.defineProperty(process, 'cwd', {
        value: () => '/Users/test/my-project',
        configurable: true
      });

      await expect(worktreeManager.cloneVolumes()).rejects.toThrow(
        'Run this command from a worktree, not the main repository'
      );
    });
  });
});
