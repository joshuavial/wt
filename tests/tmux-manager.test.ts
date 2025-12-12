import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TmuxManager } from '../src/tmux-manager';
import { execa } from 'execa';
import chalk from 'chalk';

vi.mock('execa');
vi.mock('../src/git-manager');
vi.mock('../src/config-loader');

describe('TmuxManager', () => {
  let tmuxManager: TmuxManager;
  const mockExeca = execa as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmuxManager = new TmuxManager();
    vi.clearAllMocks();

    // Clear environment variables that affect behavior
    delete process.env.TMUX;
    delete process.env.ITERM_SESSION_ID;

    // Mock GitManager
    const mockGitManager = (tmuxManager as any).git;
    mockGitManager.getProjectName = vi.fn().mockResolvedValue('my-project');

    // Mock ConfigLoader with new tmux fields
    const mockConfig = (tmuxManager as any).config;
    mockConfig.loadConfig = vi.fn().mockResolvedValue(undefined);
    mockConfig.get = vi.fn().mockReturnValue({
      startContainers: true,
      portOffsetIncrement: 10,
      portMappings: {},
      containerNames: {},
      fileUpdates: [],
      tmuxPanes: [
        { split: '-' },
        { split: 'h' },
        { split: 'v', command: 'claude' }
      ],
      tmuxFocusPane: 0,
      tmuxConditions: new Map([[2, 'command -v claude']])
    });
  });

  describe('openWorktree', () => {
    it('should print command when printCommand option is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await tmuxManager.openWorktree('feature1', { printCommand: true });

      expect(consoleSpy).toHaveBeenCalledWith(
        'cd /Users/jv/workspace/my-project-feature1 && tmux attach -t feature1'
      );
      expect(mockExeca).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should throw error if tmux is not installed', async () => {
      mockExeca.mockRejectedValueOnce(new Error('Command not found'));

      await expect(tmuxManager.openWorktree('feature1')).rejects.toThrow('tmux is not installed');
    });

    it('should create session if it does not exist', async () => {
      // Mock tmux availability check
      mockExeca.mockResolvedValueOnce({ stdout: '/usr/bin/tmux', stderr: '', exitCode: 0 });

      // Mock session exists check (fails)
      mockExeca.mockRejectedValueOnce(new Error('Session not found'));

      // Mock createSession calls
      mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      await tmuxManager.openWorktree('feature1');

      // Verify createSession was called
      expect(mockExeca).toHaveBeenCalledWith('tmux', [
        'new-session',
        '-d',
        '-s',
        'feature1',
        '-c',
        expect.stringContaining('my-project-feature1')
      ]);
    });

    it('should attach to existing session', async () => {
      // Mock tmux availability check
      mockExeca.mockResolvedValueOnce({ stdout: '/usr/bin/tmux', stderr: '', exitCode: 0 });

      // Mock session exists check (succeeds)
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      // Mock attach
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await tmuxManager.openWorktree('feature1');

      expect(mockExeca).toHaveBeenCalledWith('tmux', ['attach-session', '-t', 'feature1'], {
        stdio: 'inherit'
      });
    });

    it('should handle detached option', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock tmux availability check
      mockExeca.mockResolvedValueOnce({ stdout: '/usr/bin/tmux', stderr: '', exitCode: 0 });

      // Mock session exists check (succeeds)
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await tmuxManager.openWorktree('feature1', { detached: true });

      expect(consoleSpy).toHaveBeenCalledWith(chalk.green('✅ Session feature1 is ready'));
      expect(consoleSpy).toHaveBeenCalledWith('Attach with: tmux attach -t feature1');
      expect(mockExeca).not.toHaveBeenCalledWith('tmux', ['attach-session', '-t', 'feature1'], {
        stdio: 'inherit'
      });

      consoleSpy.mockRestore();
    });

    it('should handle newTab option on macOS', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock tmux availability check
      mockExeca.mockResolvedValueOnce({ stdout: '/usr/bin/tmux', stderr: '', exitCode: 0 });

      // Mock session exists check (succeeds)
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      // Mock osascript call
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await tmuxManager.openWorktree('feature1', { newTab: true });

      expect(consoleSpy).toHaveBeenCalledWith(chalk.yellow('🆕 Opening new iTerm tab...'));
      expect(mockExeca).toHaveBeenCalledWith('osascript', ['-e', expect.stringContaining('iTerm')]);

      consoleSpy.mockRestore();
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('createSession', () => {
    it('should create tmux session with proper layout', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock all tmux commands
      mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      await (tmuxManager as any).createSession('feature1', '/test/project-feature1');

      // Verify session creation
      expect(mockExeca).toHaveBeenCalledWith('tmux', [
        'new-session',
        '-d',
        '-s',
        'feature1',
        '-c',
        '/test/project-feature1'
      ]);

      // Verify splits (based on default config: h split, then v split)
      expect(mockExeca).toHaveBeenCalledWith('tmux', [
        'split-window',
        '-h',
        '-c',
        '/test/project-feature1',
        '-t',
        'feature1'
      ]);

      expect(mockExeca).toHaveBeenCalledWith('tmux', [
        'split-window',
        '-v',
        '-c',
        '/test/project-feature1',
        '-t',
        'feature1'
      ]);

      // Verify pane selection
      expect(mockExeca).toHaveBeenCalledWith('tmux', ['select-pane', '-t', 'feature1:0.0']);

      consoleSpy.mockRestore();
    });

    it('should try to start claude if condition passes', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock tmux commands
      mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      await (tmuxManager as any).createSession('feature1', '/test/project-feature1');

      // Should check condition and then send claude command
      expect(mockExeca).toHaveBeenCalledWith('sh', ['-c', 'command -v claude']);
      expect(mockExeca).toHaveBeenCalledWith('tmux', [
        'send-keys',
        '-t',
        'feature1:0.2',
        'claude',
        'C-m'
      ]);

      consoleSpy.mockRestore();
    });

    it('should skip claude if condition fails', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock tmux commands - condition check fails
      mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'sh' && args[0] === '-c' && args[1] === 'command -v claude') {
          throw new Error('command not found');
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      await (tmuxManager as any).createSession('feature1', '/test/project-feature1');

      // Should NOT send claude command since condition failed
      expect(mockExeca).not.toHaveBeenCalledWith('tmux', [
        'send-keys',
        '-t',
        'feature1:0.2',
        'claude',
        'C-m'
      ]);

      consoleSpy.mockRestore();
    });
  });

  describe('sessionExists', () => {
    it('should return true if session exists', async () => {
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await (tmuxManager as any).sessionExists('feature1');

      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('tmux', ['has-session', '-t', 'feature1']);
    });

    it('should return false if session does not exist', async () => {
      mockExeca.mockRejectedValueOnce(new Error('Session not found'));

      const result = await (tmuxManager as any).sessionExists('feature1');

      expect(result).toBe(false);
    });
  });

  describe('killSession', () => {
    it('should kill tmux session', async () => {
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await tmuxManager.killSession('feature1');

      expect(mockExeca).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'feature1']);
    });

    it('should not throw if session does not exist', async () => {
      mockExeca.mockRejectedValueOnce(new Error('Session not found'));

      await expect(tmuxManager.killSession('feature1')).resolves.not.toThrow();
    });
  });

  describe('sendKeys', () => {
    it('should send keys to tmux pane', async () => {
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await tmuxManager.sendKeys('feature1', 'echo hello', '0.1');

      expect(mockExeca).toHaveBeenCalledWith('tmux', [
        'send-keys',
        '-t',
        'feature1:0.1',
        'echo hello',
        'C-m'
      ]);
    });

    it('should use default pane if not specified', async () => {
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await tmuxManager.sendKeys('feature1', 'echo hello');

      expect(mockExeca).toHaveBeenCalledWith('tmux', [
        'send-keys',
        '-t',
        'feature1:0.0',
        'echo hello',
        'C-m'
      ]);
    });
  });
});
