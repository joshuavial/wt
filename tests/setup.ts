import { beforeEach, vi } from 'vitest';

// Mock execa module
vi.mock('execa', () => ({
  execa: vi.fn(),
  execaSync: vi.fn()
}));

// Mock fs-extra module
vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn(),
    ensureDir: vi.fn(),
    ensureFile: vi.fn(),
    copy: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    appendFile: vi.fn(),
    symlink: vi.fn(),
    remove: vi.fn(),
    stat: vi.fn()
  },
  pathExists: vi.fn(),
  ensureDir: vi.fn(),
  ensureFile: vi.fn(),
  copy: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  symlink: vi.fn(),
  remove: vi.fn(),
  stat: vi.fn()
}));

// Mock ora
vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: ''
  })
}));

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str
  }
}));

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
