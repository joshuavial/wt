import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnvironmentUpdater } from '../src/environment-updater';
import { ConfigLoader } from '../src/config-loader';
import * as fs from 'fs-extra';
import * as path from 'path';

vi.mock('../src/git-manager');
vi.mock('../src/config-loader');

describe('EnvironmentUpdater', () => {
  let envUpdater: EnvironmentUpdater;
  let mockConfig: ConfigLoader;
  let mockGitManager: any;

  beforeEach(() => {
    mockConfig = new ConfigLoader();
    envUpdater = new EnvironmentUpdater(mockConfig);
    mockGitManager = (envUpdater as any).git;

    // Setup default mock config
    vi.mocked(mockConfig.get).mockReturnValue({
      startContainers: true,
      portOffsetIncrement: 10,
      portMappings: {},
      containerNames: {},
      fileUpdates: []
    });
  });

  describe('updateEnvironmentFiles', () => {
    it('should update environment files with port offsets', async () => {
      const worktreeName = 'feature1';
      const worktreeDir = '/test/project-feature1';

      mockGitManager.getWorktreeIndex = vi.fn().mockResolvedValue(1);

      vi.mocked(mockConfig.get).mockReturnValue({
        startContainers: true,
        portOffsetIncrement: 10,
        portMappings: {
          API_PORT: 3000,
          CLIENT_PORT: 3001
        },
        containerNames: {},
        fileUpdates: []
      });

      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('API_PORT=3000\nCLIENT_PORT=3001\n');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await envUpdater.updateEnvironmentFiles(worktreeName, worktreeDir);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(worktreeDir, '.env'),
        'API_PORT=3010\nCLIENT_PORT=3011\n'
      );
    });

    it('should process file updates of type env_vars', async () => {
      const worktreeName = 'feature2';
      const worktreeDir = '/test/project-feature2';

      mockGitManager.getWorktreeIndex = vi.fn().mockResolvedValue(2);

      vi.mocked(mockConfig.get).mockReturnValue({
        startContainers: true,
        portOffsetIncrement: 10,
        portMappings: {
          API_PORT: 3000,
          WEB_PORT: 8080
        },
        containerNames: {},
        fileUpdates: [
          {
            filePath: 'config/.env.local',
            updateType: 'env_vars',
            spec: 'API_PORT,WEB_PORT'
          }
        ]
      });

      vi.mocked(fs.pathExists).mockResolvedValue(false);
      vi.mocked(fs.ensureFile).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await envUpdater.updateEnvironmentFiles(worktreeName, worktreeDir);

      expect(fs.ensureFile).toHaveBeenCalledWith(path.join(worktreeDir, 'config/.env.local'));
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(worktreeDir, 'config/.env.local'),
        '\nAPI_PORT=3020\nWEB_PORT=8100'
      );
    });

    it('should process file updates of type replace', async () => {
      const worktreeName = 'feature3';
      const worktreeDir = '/test/project-feature3';

      mockGitManager.getWorktreeIndex = vi.fn().mockResolvedValue(3);

      vi.mocked(mockConfig.get).mockReturnValue({
        startContainers: true,
        portOffsetIncrement: 10,
        portMappings: {},
        containerNames: {},
        fileUpdates: [
          {
            filePath: 'docker-compose.yml',
            updateType: 'replace',
            spec: 'myapp-{{WORKTREE_NAME}}',
            searchPattern: 'container_name: myapp',
            replacement: 'container_name: myapp-{{WORKTREE_NAME}}'
          }
        ]
      });

      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        'services:\n  api:\n    container_name: myapp\n    ports:\n      - "3000:3000"'
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await envUpdater.updateEnvironmentFiles(worktreeName, worktreeDir);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(worktreeDir, 'docker-compose.yml'),
        'services:\n  api:\n    container_name: myapp-feature3\n    ports:\n      - "3000:3000"'
      );
    });

    it('should process file updates of type append', async () => {
      const worktreeName = 'feature4';
      const worktreeDir = '/test/project-feature4';

      mockGitManager.getWorktreeIndex = vi.fn().mockResolvedValue(4);

      vi.mocked(mockConfig.get).mockReturnValue({
        startContainers: true,
        portOffsetIncrement: 10,
        portMappings: {
          API_PORT: 3000
        },
        containerNames: {},
        fileUpdates: [
          {
            filePath: 'config.json',
            updateType: 'append',
            spec: '{"worktree": "{{WORKTREE_NAME}}", "port": {{API_PORT}}}'
          }
        ]
      });

      vi.mocked(fs.appendFile).mockResolvedValue(undefined);

      await envUpdater.updateEnvironmentFiles(worktreeName, worktreeDir);

      expect(fs.appendFile).toHaveBeenCalledWith(
        path.join(worktreeDir, 'config.json'),
        '\n{"worktree": "feature4", "port": 3040}'
      );
    });

    it('should update container names', async () => {
      const worktreeName = 'feature5';
      const worktreeDir = '/test/project-feature5';

      mockGitManager.getWorktreeIndex = vi.fn().mockResolvedValue(5);

      vi.mocked(mockConfig.get).mockReturnValue({
        startContainers: true,
        portOffsetIncrement: 10,
        portMappings: {},
        containerNames: {
          DB_CONTAINER: 'myapp-{{WORKTREE_NAME}}-db',
          API_CONTAINER: 'myapp-{{WORKTREE_INDEX}}-api'
        },
        fileUpdates: []
      });

      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('DB_CONTAINER=myapp-db\n');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await envUpdater.updateEnvironmentFiles(worktreeName, worktreeDir);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(worktreeDir, '.env'),
        'DB_CONTAINER=myapp-feature5-db\n\nAPI_CONTAINER=myapp-5-api'
      );
    });

    it('should handle missing files gracefully', async () => {
      const worktreeName = 'feature6';
      const worktreeDir = '/test/project-feature6';

      mockGitManager.getWorktreeIndex = vi.fn().mockResolvedValue(6);

      vi.mocked(mockConfig.get).mockReturnValue({
        startContainers: true,
        portOffsetIncrement: 10,
        portMappings: {},
        containerNames: {},
        fileUpdates: [
          {
            filePath: 'missing.txt',
            updateType: 'replace',
            spec: 'new',
            searchPattern: 'old',
            replacement: 'new'
          }
        ]
      });

      vi.mocked(fs.pathExists).mockResolvedValue(false);

      await envUpdater.updateEnvironmentFiles(worktreeName, worktreeDir);

      expect(fs.readFile).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('template substitution', () => {
    it('should substitute all template variables correctly', async () => {
      const worktreeName = 'test-branch';
      const worktreeDir = '/test/project-test-branch';

      mockGitManager.getWorktreeIndex = vi.fn().mockResolvedValue(2);

      vi.mocked(mockConfig.get).mockReturnValue({
        startContainers: true,
        portOffsetIncrement: 100,
        portMappings: {
          API_PORT: 3000,
          DB_PORT: 5432
        },
        containerNames: {},
        fileUpdates: [
          {
            filePath: 'test.txt',
            updateType: 'append',
            spec: 'Worktree: {{WORKTREE_NAME}}, Index: {{WORKTREE_INDEX}}, API: {{API_PORT}}, DB: {{DB_PORT}}'
          }
        ]
      });

      vi.mocked(fs.appendFile).mockResolvedValue(undefined);

      await envUpdater.updateEnvironmentFiles(worktreeName, worktreeDir);

      expect(fs.appendFile).toHaveBeenCalledWith(
        path.join(worktreeDir, 'test.txt'),
        '\nWorktree: test-branch, Index: 2, API: 3200, DB: 5632'
      );
    });
  });
});
