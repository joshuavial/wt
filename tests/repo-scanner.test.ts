import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { RepoScanner } from '../src/repo-scanner';
import * as os from 'os';

// Use actual fs-extra for integration tests
vi.unmock('fs-extra');
import * as fs from 'fs-extra';

describe('RepoScanner', () => {
  let testDir: string;
  let scanner: RepoScanner;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wt-test-'));
    scanner = new RepoScanner(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('findEnvFiles', () => {
    it('should find .env files in root and subdirectories', async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, '.env'), 'ROOT_ENV=true');
      await fs.ensureDir(path.join(testDir, 'admin'));
      await fs.writeFile(path.join(testDir, 'admin', '.env'), 'ADMIN_ENV=true');
      await fs.ensureDir(path.join(testDir, 'client'));
      await fs.writeFile(path.join(testDir, 'client', '.env.local'), 'CLIENT_ENV=true');

      const files = await scanner.findEnvFiles();

      expect(files).toHaveLength(3);
      expect(files).toContain('.env');
      expect(files).toContain('admin/.env');
      expect(files).toContain('client/.env.local');
    });

    it('should ignore node_modules directory', async () => {
      await fs.ensureDir(path.join(testDir, 'node_modules'));
      await fs.writeFile(path.join(testDir, 'node_modules', '.env'), 'IGNORED=true');
      await fs.writeFile(path.join(testDir, '.env'), 'ROOT_ENV=true');

      const files = await scanner.findEnvFiles();

      expect(files).toHaveLength(1);
      expect(files).toContain('.env');
      expect(files).not.toContain('node_modules/.env');
    });

    it('should find various env file patterns', async () => {
      await fs.writeFile(path.join(testDir, '.env'), 'ENV1=true');
      await fs.writeFile(path.join(testDir, '.env.production'), 'ENV2=true');
      await fs.writeFile(path.join(testDir, 'env.local'), 'ENV3=true');
      await fs.writeFile(path.join(testDir, 'config.env'), 'ENV4=true');

      const files = await scanner.findEnvFiles();

      expect(files).toHaveLength(4);
      expect(files).toContain('.env');
      expect(files).toContain('.env.production');
      expect(files).toContain('env.local');
      expect(files).toContain('config.env');
    });
  });

  describe('findPortVariables', () => {
    it('should find PORT variables in env files', async () => {
      const envContent = `
# API Configuration
API_PORT=3000
CLIENT_PORT=3001
ADMIN_PORT=3002

# Database
DATABASE_URL=postgresql://localhost:5432/mydb
`;
      await fs.writeFile(path.join(testDir, '.env'), envContent);

      const portVars = await scanner.findPortVariables('.env');

      // Should find 4: 3 PORT variables + 1 URL with embedded port
      expect(portVars).toHaveLength(4);
      expect(portVars.find(v => v.name === 'API_PORT' && v.type === 'port')).toBeDefined();
      expect(portVars.find(v => v.name === 'CLIENT_PORT' && v.type === 'port')).toBeDefined();
      expect(portVars.find(v => v.name === 'ADMIN_PORT' && v.type === 'port')).toBeDefined();
      expect(portVars.find(v => v.name === 'DATABASE_URL' && v.value === '5432' && v.type === 'url_with_port')).toBeDefined();
    });

    it('should find variables with port in lowercase', async () => {
      const envContent = `
redis_port=6379
CACHE_port=6380
`;
      await fs.writeFile(path.join(testDir, '.env'), envContent);

      const portVars = await scanner.findPortVariables('.env');

      expect(portVars).toHaveLength(2);
      expect(portVars.find(v => v.name === 'redis_port')).toBeDefined();
      expect(portVars.find(v => v.name === 'CACHE_port')).toBeDefined();
    });

    it('should detect port numbers even without PORT in variable name', async () => {
      const envContent = `
API_HOST=3000
WEB_SERVER=8080
LOW_PORT=80
HIGH_NUMBER=99999
`;
      await fs.writeFile(path.join(testDir, '.env'), envContent);

      const portVars = await scanner.findPortVariables('.env');

      // Should find 3000 and 8080 as they look like ports
      expect(portVars.length).toBeGreaterThanOrEqual(2);
      expect(portVars.find(v => v.name === 'API_HOST' && v.value === '3000')).toBeDefined();
      expect(portVars.find(v => v.name === 'WEB_SERVER' && v.value === '8080')).toBeDefined();
    });

    it('should skip comments and empty lines', async () => {
      const envContent = `
# This is a comment
API_PORT=3000

# PORT=4000 (commented out)
CLIENT_PORT=3001
`;
      await fs.writeFile(path.join(testDir, '.env'), envContent);

      const portVars = await scanner.findPortVariables('.env');

      expect(portVars).toHaveLength(2);
      expect(portVars.find(v => v.value === '4000')).toBeUndefined();
    });

    it('should detect ports in URL variables', async () => {
      const envContent = `
VITE_API_URL='http://127.0.0.1:4444/v1/admin'
BACKEND_URL=https://api.example.com:8080
DATABASE_URL=postgresql://localhost:5432/mydb
SIMPLE_URL=https://example.com/api
`;
      await fs.writeFile(path.join(testDir, '.env'), envContent);

      const portVars = await scanner.findPortVariables('.env');


      // Should find URLs with embedded ports
      expect(portVars.find(v => v.name === 'VITE_API_URL' && v.value === '4444' && v.type === 'url_with_port')).toBeDefined();
      expect(portVars.find(v => v.name === 'BACKEND_URL' && v.value === '8080' && v.type === 'url_with_port')).toBeDefined();
      expect(portVars.find(v => v.name === 'DATABASE_URL' && v.value === '5432' && v.type === 'url_with_port')).toBeDefined();
      // Should not find URL without port
      expect(portVars.find(v => v.name === 'SIMPLE_URL')).toBeUndefined();
    });
  });

  describe('findDockerComposeFiles', () => {
    it('should find docker-compose files', async () => {
      await fs.writeFile(path.join(testDir, 'docker-compose.yml'), 'version: "3"');
      await fs.writeFile(path.join(testDir, 'docker-compose.dev.yml'), 'version: "3"');
      await fs.writeFile(path.join(testDir, 'compose.yaml'), 'version: "3"');

      const files = await scanner.findDockerComposeFiles();

      expect(files).toHaveLength(3);
      expect(files).toContain('docker-compose.yml');
      expect(files).toContain('docker-compose.dev.yml');
      expect(files).toContain('compose.yaml');
    });
  });

  describe('hasExistingConfig', () => {
    it('should return true when .wt.conf exists', async () => {
      await fs.writeFile(path.join(testDir, '.wt.conf'), '# Config');

      const hasConfig = await scanner.hasExistingConfig();

      expect(hasConfig).toBe(true);
    });

    it('should return false when .wt.conf does not exist', async () => {
      const hasConfig = await scanner.hasExistingConfig();

      expect(hasConfig).toBe(false);
    });
  });
});