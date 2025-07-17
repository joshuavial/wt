import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DockerManager } from '../src/docker-manager';
import { execa } from 'execa';
import chalk from 'chalk';

vi.mock('execa');
vi.mock('../src/git-manager');

describe('DockerManager', () => {
  let dockerManager: DockerManager;
  const mockExeca = execa as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dockerManager = new DockerManager();
    vi.clearAllMocks();

    // Mock GitManager
    const mockGitManager = (dockerManager as any).git;
    mockGitManager.getProjectName = vi.fn().mockResolvedValue('my-project');
  });

  describe('startContainers', () => {
    it('should start containers with correct compose project name', async () => {
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await dockerManager.startContainers('feature1', '/test/project-feature1');

      expect(mockExeca).toHaveBeenCalledWith('./dev', ['up', '-d'], {
        cwd: '/test/project-feature1',
        env: expect.objectContaining({
          COMPOSE_PROJECT_NAME: 'my-project-feature1'
        }),
        stdio: 'inherit'
      });
    });
  });

  describe('cleanupContainers', () => {
    it('should stop containers using docker-compose', async () => {
      // Mock successful docker-compose down
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      // Mock no lingering containers
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      // Mock no volumes
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await dockerManager.cleanupContainers('feature1', '/test/project-feature1');

      expect(mockExeca).toHaveBeenCalledWith('./dev', ['down', '--remove-orphans'], {
        cwd: '/test/project-feature1',
        env: expect.objectContaining({
          COMPOSE_PROJECT_NAME: 'my-project-feature1'
        })
      });
    });

    it('should force remove lingering containers', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock failed docker-compose down
      mockExeca.mockRejectedValueOnce(new Error('Directory not found'));

      // Mock containers list
      mockExeca.mockResolvedValueOnce({
        stdout: 'my-project-feature1-api-1\nmy-project-feature1-db-1',
        stderr: '',
        exitCode: 0
      });

      // Mock container removals
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      // Mock no volumes
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await dockerManager.cleanupContainers('feature1', '/test/project-feature1');

      expect(mockExeca).toHaveBeenCalledWith('docker', [
        'ps',
        '-a',
        '--filter',
        'name=my-project-feature1',
        '--format',
        '{{.Names}}'
      ]);

      expect(mockExeca).toHaveBeenCalledWith('docker', ['rm', '-f', 'my-project-feature1-api-1']);
      expect(mockExeca).toHaveBeenCalledWith('docker', ['rm', '-f', 'my-project-feature1-db-1']);

      consoleSpy.mockRestore();
    });

    it('should remove Docker volumes', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock successful docker-compose down
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      // Mock no lingering containers
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      // Mock volumes list
      mockExeca.mockResolvedValueOnce({
        stdout: 'my-project-feature1_postgres_data\nmy-project-feature1_redis_data',
        stderr: '',
        exitCode: 0
      });

      // Mock volume removals
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      mockExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await dockerManager.cleanupContainers('feature1', '/test/project-feature1');

      expect(consoleSpy).toHaveBeenCalledWith('   Removing Docker volumes...');

      expect(mockExeca).toHaveBeenCalledWith('docker', [
        'volume',
        'ls',
        '--filter',
        'name=my-project-feature1',
        '--format',
        '{{.Name}}'
      ]);

      expect(mockExeca).toHaveBeenCalledWith('docker', [
        'volume',
        'rm',
        'my-project-feature1_postgres_data'
      ]);
      expect(mockExeca).toHaveBeenCalledWith('docker', [
        'volume',
        'rm',
        'my-project-feature1_redis_data'
      ]);

      consoleSpy.mockRestore();
    });
  });

  describe('cloneVolumes', () => {
    it('should clone PostgreSQL database using pg_dump/restore', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock checking for running containers
      mockExeca.mockResolvedValueOnce({
        stdout: 'my-project_db',
        stderr: '',
        exitCode: 0
      });

      // Mock pg_dump
      mockExeca.mockResolvedValueOnce({
        stdout: 'CREATE TABLE test...',
        stderr: '',
        exitCode: 0
      });

      // Mock pg restore
      mockExeca.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      // Mock checking for qdrant volume (not found)
      mockExeca.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await dockerManager.cloneVolumes('my-project', 'feature1');

      expect(mockExeca).toHaveBeenCalledWith('docker', [
        'exec',
        'my-project-db-1',
        'pg_dump',
        '-U',
        'web-app-db',
        'web-app-db'
      ]);

      expect(mockExeca).toHaveBeenCalledWith(
        'docker',
        ['exec', '-i', 'my-project-feature1-db-1', 'psql', '-U', 'web-app-db', 'web-app-db'],
        {
          input: 'CREATE TABLE test...'
        }
      );

      expect(consoleSpy).toHaveBeenCalledWith(chalk.green('✅ Volume clone complete'));

      consoleSpy.mockRestore();
    });

    it('should skip cloning if no running database found', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock checking for running containers (none found)
      mockExeca.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await dockerManager.cloneVolumes('my-project', 'feature1');

      expect(consoleSpy).toHaveBeenCalledWith(
        chalk.yellow('⚠️  No running database found in main worktree. Skipping volume clone.')
      );
      expect(consoleSpy).toHaveBeenCalledWith('   To clone data later, run: wt clone-volumes');

      // Should not attempt pg_dump
      expect(mockExeca).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });

    it('should clone Qdrant data if volume exists', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock checking for running containers
      mockExeca.mockResolvedValueOnce({
        stdout: 'my-project_db',
        stderr: '',
        exitCode: 0
      });

      // Mock pg_dump
      mockExeca.mockResolvedValueOnce({
        stdout: 'CREATE TABLE test...',
        stderr: '',
        exitCode: 0
      });

      // Mock pg restore
      mockExeca.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      // Mock checking for qdrant volume (found)
      mockExeca.mockResolvedValueOnce({
        stdout: 'my-project_qdrant_data',
        stderr: '',
        exitCode: 0
      });

      // Mock volume copy
      mockExeca.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await dockerManager.cloneVolumes('my-project', 'feature1');

      expect(consoleSpy).toHaveBeenCalledWith('   Cloning Qdrant vector data...');

      expect(mockExeca).toHaveBeenCalledWith('docker', [
        'run',
        '--rm',
        '-v',
        'my-project_qdrant_data:/source:ro',
        '-v',
        'my-project-feature1_qdrant_data:/dest',
        'alpine',
        'sh',
        '-c',
        'cp -a /source/. /dest/'
      ]);

      consoleSpy.mockRestore();
    });

    it('should handle database clone failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock checking for running containers
      mockExeca.mockResolvedValueOnce({
        stdout: 'my-project_db',
        stderr: '',
        exitCode: 0
      });

      // Mock pg_dump
      mockExeca.mockResolvedValueOnce({
        stdout: 'CREATE TABLE test...',
        stderr: '',
        exitCode: 0
      });

      // Mock pg restore failure
      mockExeca.mockRejectedValueOnce(new Error('Container not ready'));

      // Mock checking for qdrant volume (not found)
      mockExeca.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await dockerManager.cloneVolumes('my-project', 'feature1');

      expect(consoleSpy).toHaveBeenCalledWith(
        chalk.yellow('   Note: Database will be cloned after containers start')
      );

      consoleSpy.mockRestore();
    });

    it('should throw if Docker is not running', async () => {
      // Mock Docker not available
      mockExeca.mockRejectedValueOnce(new Error('Cannot connect to Docker daemon'));

      await expect(dockerManager.cloneVolumes('my-project', 'feature1')).rejects.toThrow(
        'Docker is not running or accessible'
      );
    });
  });
});
