import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitManager } from '../src/git-manager';
import { execa } from 'execa';

vi.mock('execa');

describe('GitManager', () => {
  let gitManager: GitManager;
  const mockExeca = execa as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    gitManager = new GitManager();
    vi.clearAllMocks();
  });

  describe('getProjectName', () => {
    it('should return the project name from git toplevel', async () => {
      mockExeca.mockResolvedValueOnce({
        stdout: '/Users/test/projects/my-project',
        stderr: '',
        exitCode: 0
      });

      const result = await gitManager.getProjectName();

      expect(mockExeca).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel']);
      expect(result).toBe('my-project');
    });

    it('should handle paths with spaces', async () => {
      mockExeca.mockResolvedValueOnce({
        stdout: '/Users/test/My Projects/my-project',
        stderr: '',
        exitCode: 0
      });

      const result = await gitManager.getProjectName();
      expect(result).toBe('my-project');
    });
  });

  describe('getMainWorktreeDir', () => {
    it('should return the main worktree directory', async () => {
      mockExeca.mockResolvedValueOnce({
        stdout:
          '/Users/test/projects/main  abcd1234 [main]\n/Users/test/projects/main-feature  efgh5678 [feature]',
        stderr: '',
        exitCode: 0
      });

      const result = await gitManager.getMainWorktreeDir();

      expect(mockExeca).toHaveBeenCalledWith('git', ['worktree', 'list']);
      expect(result).toBe('/Users/test/projects/main');
    });
  });

  describe('branchExists', () => {
    it('should return true if branch exists', async () => {
      mockExeca.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      const result = await gitManager.branchExists('feature-branch');

      expect(mockExeca).toHaveBeenCalledWith('git', [
        'show-ref',
        '--verify',
        '--quiet',
        'refs/heads/feature-branch'
      ]);
      expect(result).toBe(true);
    });

    it('should return false if branch does not exist', async () => {
      mockExeca.mockRejectedValueOnce(new Error('Branch not found'));

      const result = await gitManager.branchExists('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('addWorktree', () => {
    it('should add a new worktree with branch', async () => {
      mockExeca.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await gitManager.addWorktree('../my-project-feature', 'feature');

      expect(mockExeca).toHaveBeenCalledWith('git', [
        'worktree',
        'add',
        '../my-project-feature',
        '-b',
        'feature'
      ]);
    });
  });

  describe('removeWorktree', () => {
    it('should remove worktree using git command', async () => {
      mockExeca.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await gitManager.removeWorktree('../my-project-feature');

      expect(mockExeca).toHaveBeenCalledWith('git', [
        'worktree',
        'remove',
        '../my-project-feature',
        '--force'
      ]);
    });

    it('should fallback to manual removal if git command fails', async () => {
      mockExeca
        .mockRejectedValueOnce(new Error('Worktree removal failed'))
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await gitManager.removeWorktree('../my-project-feature');

      expect(mockExeca).toHaveBeenCalledWith('rm', ['-rf', '../my-project-feature']);
      expect(mockExeca).toHaveBeenCalledWith('git', ['worktree', 'prune']);
    });
  });

  describe('deleteBranch', () => {
    it('should delete branch', async () => {
      mockExeca.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await gitManager.deleteBranch('feature-branch');

      expect(mockExeca).toHaveBeenCalledWith('git', ['branch', '-D', 'feature-branch']);
    });

    it('should not throw if branch deletion fails', async () => {
      mockExeca.mockRejectedValueOnce(new Error('Branch not found'));

      await expect(gitManager.deleteBranch('non-existent')).resolves.not.toThrow();
    });
  });

  describe('getWorktreeIndex', () => {
    it('should return correct index for existing worktree', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'my-project', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({
          stdout: `/Users/test/my-project  abcd1234 [main]
/Users/test/my-project-feature1  efgh5678 [feature1]
/Users/test/my-project-feature2  ijkl9012 [feature2]`,
          stderr: '',
          exitCode: 0
        })
        .mockResolvedValueOnce({ stdout: '/Users/test/my-project', stderr: '', exitCode: 0 });

      const result = await gitManager.getWorktreeIndex('feature2');

      expect(result).toBe(2);
    });

    it('should return next available index for non-existent worktree', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'my-project', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({
          stdout: `/Users/test/my-project  abcd1234 [main]
/Users/test/my-project-feature1  efgh5678 [feature1]`,
          stderr: '',
          exitCode: 0
        })
        .mockResolvedValueOnce({ stdout: '/Users/test/my-project', stderr: '', exitCode: 0 });

      const result = await gitManager.getWorktreeIndex('new-feature');

      expect(result).toBe(2);
    });
  });

  describe('getWorktreeNames', () => {
    it('should return list of worktree names excluding main', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'my-project', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '/Users/test/my-project', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({
          stdout: `/Users/test/my-project  abcd1234 [main]
/Users/test/my-project-feature1  efgh5678 [feature1]
/Users/test/my-project-feature2  ijkl9012 [feature2]
/Users/test/my-project-bugfix  mnop3456 [bugfix]`,
          stderr: '',
          exitCode: 0
        });

      const result = await gitManager.getWorktreeNames();

      expect(result).toEqual(['feature1', 'feature2', 'bugfix']);
    });

    it('should return empty array if only main worktree exists', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'my-project', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '/Users/test/my-project', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({
          stdout: '/Users/test/my-project  abcd1234 [main]',
          stderr: '',
          exitCode: 0
        });

      const result = await gitManager.getWorktreeNames();

      expect(result).toEqual([]);
    });
  });
});
