import { execa } from 'execa';
import * as path from 'path';

export class GitManager {
  async getProjectName(): Promise<string> {
    const { stdout } = await execa('git', ['rev-parse', '--show-toplevel']);
    return path.basename(stdout);
  }

  async getMainWorktreeDir(): Promise<string> {
    const { stdout } = await execa('git', ['worktree', 'list']);
    const firstLine = stdout.split('\n')[0];
    return firstLine.split(/\s+/)[0];
  }

  async branchExists(branchName: string): Promise<boolean> {
    try {
      await execa('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);
      return true;
    } catch {
      return false;
    }
  }

  async addWorktree(worktreeDir: string, branchName: string): Promise<void> {
    await execa('git', ['worktree', 'add', worktreeDir, '-b', branchName]);
  }

  async removeWorktree(worktreeDir: string): Promise<void> {
    try {
      await execa('git', ['worktree', 'remove', worktreeDir, '--force']);
    } catch {
      // If that fails, try to clean up manually
      await execa('rm', ['-rf', worktreeDir]);
      await execa('git', ['worktree', 'prune']);
    }
  }

  async deleteBranch(branchName: string): Promise<void> {
    try {
      await execa('git', ['branch', '-D', branchName]);
    } catch {
      // Branch might already be deleted
    }
  }

  async getWorktreeIndex(worktreeName: string): Promise<number> {
    const projectName = await this.getProjectName();
    const { stdout } = await execa('git', ['worktree', 'list']);
    const mainDir = await this.getMainWorktreeDir();

    let index = 0;
    const lines = stdout.split('\n');

    for (const line of lines) {
      const wtPath = line.split(/\s+/)[0];
      const wtBasename = path.basename(wtPath);
      const wtName = wtBasename.replace(`${projectName}-`, '');

      // Skip main worktree
      if (wtPath === mainDir) {
        continue;
      }

      index++;

      if (wtName === worktreeName) {
        return index;
      }
    }

    // If not found, return next available index
    return index + 1;
  }

  async getWorktreeNames(): Promise<string[]> {
    const projectName = await this.getProjectName();
    const mainDir = await this.getMainWorktreeDir();
    const { stdout } = await execa('git', ['worktree', 'list']);

    const names: string[] = [];
    const lines = stdout.split('\n');

    for (const line of lines) {
      const wtPath = line.split(/\s+/)[0];
      if (wtPath === mainDir) {
        continue;
      }

      const wtBasename = path.basename(wtPath);
      const wtName = wtBasename.replace(`${projectName}-`, '');
      names.push(wtName);
    }

    return names;
  }
}
