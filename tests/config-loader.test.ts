import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigLoader } from '../src/config-loader';
import * as fs from 'fs-extra';

vi.mock('../src/git-manager');

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;

  beforeEach(() => {
    configLoader = new ConfigLoader();
    vi.clearAllMocks();
  });

  describe('loadDefaultConfig', () => {
    it('should load default configuration', () => {
      const config = configLoader.get();

      expect(config).toEqual({
        startContainers: true,
        portOffsetIncrement: 10,
        envFiles: [],
        portMappings: {},
        containerNames: {},
        fileUpdates: []
      });
    });
  });

  describe('loadConfig', () => {
    it('should load and parse configuration from .wt.conf file', async () => {
      const mockConfigContent = `
# Configuration file
START_CONTAINERS=true
PORT_OFFSET_INCREMENT=20

PORT_MAPPINGS=(
    "API_PORT:3000"
    "CLIENT_PORT:3001"
    "ADMIN_PORT:3002"
)

CONTAINER_NAMES=(
    "DB_CONTAINER:myapp-{{WORKTREE_NAME}}-db"
    "API_CONTAINER:myapp-{{WORKTREE_NAME}}-api"
)

FILE_UPDATES=(
    ".env|env_vars|API_PORT,CLIENT_PORT"
    "docker-compose.yml|replace|container_name: myapp|container_name: myapp-{{WORKTREE_NAME}}"
    "config.json|append|{\\"worktree\\": \\"{{WORKTREE_NAME}}\\"}"
)
`;

      vi.mocked(fs.pathExists).mockResolvedValueOnce(true);
      vi.mocked(fs.readFile).mockResolvedValueOnce(mockConfigContent);

      const gitManager = (configLoader as any).git;
      gitManager.getMainWorktreeDir = vi.fn().mockResolvedValue('/Users/test/project');

      await configLoader.loadConfig();
      const config = configLoader.get();

      expect(config.startContainers).toBe(true);
      expect(config.portOffsetIncrement).toBe(20);
      expect(config.portMappings).toEqual({
        API_PORT: 3000,
        CLIENT_PORT: 3001,
        ADMIN_PORT: 3002
      });
      expect(config.containerNames).toEqual({
        DB_CONTAINER: 'myapp-{{WORKTREE_NAME}}-db',
        API_CONTAINER: 'myapp-{{WORKTREE_NAME}}-api'
      });
      expect(config.fileUpdates).toHaveLength(3);
      expect(config.fileUpdates[0]).toEqual({
        filePath: '.env',
        updateType: 'env_vars',
        spec: 'API_PORT,CLIENT_PORT'
      });
      expect(config.fileUpdates[1]).toEqual({
        filePath: 'docker-compose.yml',
        updateType: 'replace',
        spec: 'container_name: myapp-{{WORKTREE_NAME}}',
        searchPattern: 'container_name: myapp',
        replacement: 'container_name: myapp-{{WORKTREE_NAME}}'
      });
    });

    it('should handle missing config file gracefully', async () => {
      vi.mocked(fs.pathExists).mockResolvedValueOnce(false);

      const gitManager = (configLoader as any).git;
      gitManager.getMainWorktreeDir = vi.fn().mockResolvedValue('/Users/test/project');

      await configLoader.loadConfig();
      const config = configLoader.get();

      expect(config).toEqual({
        startContainers: true,
        portOffsetIncrement: 10,
        envFiles: [],
        portMappings: {},
        containerNames: {},
        fileUpdates: []
      });
    });

    it('should parse START_CONTAINERS with different values', async () => {
      const testCases = [
        { value: 'true', expected: true },
        { value: 'false', expected: false },
        { value: 'yes', expected: true },
        { value: 'no', expected: false },
        { value: '1', expected: true },
        { value: '0', expected: false },
        { value: 'invalid', expected: true } // default to true
      ];

      for (const testCase of testCases) {
        const mockConfig = `START_CONTAINERS=${testCase.value}`;

        vi.mocked(fs.pathExists).mockResolvedValueOnce(true);
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockConfig);

        const loader = new ConfigLoader();
        const gitManager = (loader as any).git;
        gitManager.getMainWorktreeDir = vi.fn().mockResolvedValue('/Users/test/project');

        await loader.loadConfig();
        expect(loader.get().startContainers).toBe(testCase.expected);
      }
    });

    it('should handle comments and empty lines', async () => {
      const mockConfigContent = `
# This is a comment
START_CONTAINERS=false

# Another comment
PORT_OFFSET_INCREMENT=15

# Empty lines above and below

PORT_MAPPINGS=(
    # Comment inside array
    "API_PORT:3000"
    # Another comment
    "CLIENT_PORT:3001"
)
`;

      vi.mocked(fs.pathExists).mockResolvedValueOnce(true);
      vi.mocked(fs.readFile).mockResolvedValueOnce(mockConfigContent);

      const gitManager = (configLoader as any).git;
      gitManager.getMainWorktreeDir = vi.fn().mockResolvedValue('/Users/test/project');

      await configLoader.loadConfig();
      const config = configLoader.get();

      expect(config.startContainers).toBe(false);
      expect(config.portOffsetIncrement).toBe(15);
      expect(config.portMappings).toEqual({
        API_PORT: 3000,
        CLIENT_PORT: 3001
      });
    });

    it('should handle malformed port mappings gracefully', async () => {
      const mockConfigContent = `
PORT_MAPPINGS=(
    "API_PORT:3000"
    "INVALID_FORMAT"
    "CLIENT_PORT:not_a_number"
    ":3002"
    "ADMIN_PORT:"
)
`;

      vi.mocked(fs.pathExists).mockResolvedValueOnce(true);
      vi.mocked(fs.readFile).mockResolvedValueOnce(mockConfigContent);

      const gitManager = (configLoader as any).git;
      gitManager.getMainWorktreeDir = vi.fn().mockResolvedValue('/Users/test/project');

      await configLoader.loadConfig();
      const config = configLoader.get();

      expect(config.portMappings).toEqual({
        API_PORT: 3000,
        CLIENT_PORT: NaN, // parseInt('not_a_number') returns NaN
        ADMIN_PORT: NaN
      });
    });

    it('should parse FILE_UPDATES with all update types', async () => {
      const mockConfigContent = `
FILE_UPDATES=(
    ".env|env_vars|API_PORT,CLIENT_PORT"
    "config.yml|replace|old_value|new_value"
    "README.md|append|Additional content"
)
`;

      vi.mocked(fs.pathExists).mockResolvedValueOnce(true);
      vi.mocked(fs.readFile).mockResolvedValueOnce(mockConfigContent);

      const gitManager = (configLoader as any).git;
      gitManager.getMainWorktreeDir = vi.fn().mockResolvedValue('/Users/test/project');

      await configLoader.loadConfig();
      const config = configLoader.get();

      expect(config.fileUpdates).toHaveLength(3);

      expect(config.fileUpdates[0]).toEqual({
        filePath: '.env',
        updateType: 'env_vars',
        spec: 'API_PORT,CLIENT_PORT'
      });

      expect(config.fileUpdates[1]).toEqual({
        filePath: 'config.yml',
        updateType: 'replace',
        spec: 'new_value',
        searchPattern: 'old_value',
        replacement: 'new_value'
      });

      expect(config.fileUpdates[2]).toEqual({
        filePath: 'README.md',
        updateType: 'append',
        spec: 'Additional content'
      });
    });
  });

  describe('parseArray', () => {
    it('should handle arrays with quotes correctly', async () => {
      const mockConfigContent = `
PORT_MAPPINGS=(
    "API_PORT:3000"
    'CLIENT_PORT:3001'
    ADMIN_PORT:3002
)
`;

      vi.mocked(fs.pathExists).mockResolvedValueOnce(true);
      vi.mocked(fs.readFile).mockResolvedValueOnce(mockConfigContent);

      const gitManager = (configLoader as any).git;
      gitManager.getMainWorktreeDir = vi.fn().mockResolvedValue('/Users/test/project');

      await configLoader.loadConfig();
      const config = configLoader.get();

      expect(config.portMappings).toEqual({
        API_PORT: 3000,
        CLIENT_PORT: 3001,
        ADMIN_PORT: 3002
      });
    });
  });
});
