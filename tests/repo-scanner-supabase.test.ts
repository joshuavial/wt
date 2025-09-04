import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RepoScanner } from '../src/repo-scanner';
import * as path from 'path';
import * as os from 'os';

// Use actual fs-extra for integration tests
vi.unmock('fs-extra');
import * as fs from 'fs-extra';

describe('RepoScanner - Supabase Config Detection', () => {
  let TEST_DIR: string;
  let scanner: RepoScanner;

  beforeEach(async () => {
    TEST_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'wt-test-'));
    scanner = new RepoScanner(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  describe('findSupabaseConfigs', () => {
    it('should find supabase config files', async () => {
      // Create test files
      await fs.ensureDir(path.join(TEST_DIR, 'supabase'));
      await fs.writeFile(path.join(TEST_DIR, 'supabase', 'config.toml'), `
project_id = "my-project"

[api]
port = 54321

[db]
port = 54322
`);

      await fs.ensureDir(path.join(TEST_DIR, 'supabase-test'));
      await fs.writeFile(path.join(TEST_DIR, 'supabase-test', 'config.toml'), `
project_id = "my-project-test"

[api]
port = 54341
`);

      const configs = await scanner.findSupabaseConfigs();
      expect(configs).toHaveLength(2);
      expect(configs).toContain('supabase/config.toml');
      expect(configs).toContain('supabase-test/config.toml');
    });

    it('should ignore node_modules', async () => {
      await fs.ensureDir(path.join(TEST_DIR, 'supabase'));
      await fs.writeFile(path.join(TEST_DIR, 'supabase', 'config.toml'), 'project_id = "main"');
      
      await fs.ensureDir(path.join(TEST_DIR, 'node_modules', 'some-package', 'supabase'));
      await fs.writeFile(path.join(TEST_DIR, 'node_modules', 'some-package', 'supabase', 'config.toml'), 'project_id = "ignored"');

      const configs = await scanner.findSupabaseConfigs();
      expect(configs).toHaveLength(1);
      expect(configs).toContain('supabase/config.toml');
    });
  });

  describe('parseSupabaseConfig', () => {
    it('should parse all port configurations', async () => {
      const configContent = `
# A string used to distinguish different Supabase projects on the same host
project_id = "assessment-tracker"

[api]
enabled = true
# Port to use for the API URL
port = 30203

[db]
# Port to use for the local database URL
port = 30202
# Port used by db diff command to initialize the shadow database
shadow_port = 30209

[db.pooler]
enabled = false
# Port to use for the local connection pooler
port = 30208

[studio]
enabled = true
# Port to use for Supabase Studio
port = 30204

[inbucket]
enabled = true
# Port to use for the email testing server web interface
port = 30205

[analytics]
enabled = true
# Port for analytics service
port = 30206
`;

      await fs.ensureDir(path.join(TEST_DIR, 'supabase'));
      await fs.writeFile(path.join(TEST_DIR, 'supabase', 'config.toml'), configContent);

      const config = await scanner.parseSupabaseConfig('supabase/config.toml');
      
      expect(config).toBeDefined();
      expect(config?.projectId).toBe('assessment-tracker');
      expect(config?.ports.api).toBe(30203);
      expect(config?.ports.db).toBe(30202);
      expect(config?.ports.studio).toBe(30204);
      expect(config?.ports.inbucket).toBe(30205);
      expect(config?.ports.analytics).toBe(30206);
      expect(config?.ports.pooler).toBe(30208);
      expect(config?.ports.shadow).toBe(30209);
    });

    it('should handle missing ports gracefully', async () => {
      const configContent = `
project_id = "minimal-project"

[api]
port = 54321
`;

      await fs.ensureDir(path.join(TEST_DIR, 'supabase'));
      await fs.writeFile(path.join(TEST_DIR, 'supabase', 'config.toml'), configContent);

      const config = await scanner.parseSupabaseConfig('supabase/config.toml');
      
      expect(config).toBeDefined();
      expect(config?.projectId).toBe('minimal-project');
      expect(config?.ports.api).toBe(54321);
      expect(config?.ports.db).toBeUndefined();
      expect(config?.ports.studio).toBeUndefined();
    });

    it('should handle test configuration', async () => {
      const configContent = `
project_id = "assessment-tracker-test"

[api]
port = 54341

[db]
port = 54342
`;

      await fs.ensureDir(path.join(TEST_DIR, 'supabase-test'));
      await fs.writeFile(path.join(TEST_DIR, 'supabase-test', 'config.toml'), configContent);

      const config = await scanner.parseSupabaseConfig('supabase-test/config.toml');
      
      expect(config).toBeDefined();
      expect(config?.projectId).toBe('assessment-tracker-test');
      expect(config?.ports.api).toBe(54341);
      expect(config?.ports.db).toBe(54342);
    });
  });
});