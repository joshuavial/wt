import * as fs from 'fs-extra';
import * as path from 'path';
import { GitManager } from './git-manager';

export interface PortMapping {
  [key: string]: number;
}

export interface ContainerNameMapping {
  [key: string]: string;
}

export interface FileUpdate {
  filePath: string;
  updateType: 'env_vars' | 'replace' | 'append';
  spec: string;
  searchPattern?: string;
  replacement?: string;
}

export interface Config {
  startContainers: boolean;
  portOffsetIncrement: number;
  envFiles: string[];
  portMappings: PortMapping;
  containerNames: ContainerNameMapping;
  fileUpdates: FileUpdate[];
}

export class ConfigLoader {
  private config: Config;
  private git: GitManager;

  constructor() {
    this.git = new GitManager();
    this.config = this.loadDefaultConfig();
  }

  async loadConfig(): Promise<void> {
    const mainDir = await this.git.getMainWorktreeDir();
    const configPath = path.join(mainDir, '.wt.conf');

    if (await fs.pathExists(configPath)) {
      const configContent = await fs.readFile(configPath, 'utf-8');
      this.parseConfig(configContent);
      console.log('📄 Loaded config from .wt.conf');
    }
  }

  get(): Config {
    return this.config;
  }

  private loadDefaultConfig(): Config {
    return {
      startContainers: true,
      portOffsetIncrement: 10,
      envFiles: [],
      portMappings: {},
      containerNames: {},
      fileUpdates: []
    };
  }

  private parseConfig(content: string): void {
    // Reset config to defaults before parsing
    this.config = this.loadDefaultConfig();

    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse START_CONTAINERS
      if (trimmed.startsWith('START_CONTAINERS=')) {
        const value = trimmed.split('=')[1].toLowerCase();
        if (['false', 'no', '0'].includes(value)) {
          this.config.startContainers = false;
        } else if (['true', 'yes', '1'].includes(value)) {
          this.config.startContainers = true;
        }
        // else keep default (true)
      }

      // Parse PORT_OFFSET_INCREMENT
      if (trimmed.startsWith('PORT_OFFSET_INCREMENT=')) {
        const value = parseInt(trimmed.split('=')[1], 10);
        if (!isNaN(value)) {
          this.config.portOffsetIncrement = value;
        }
      }

      // Parse PORT_MAPPINGS array
      if (trimmed.startsWith('PORT_MAPPINGS=(')) {
        const mappings = this.parseArray(content, 'PORT_MAPPINGS');
        for (const mapping of mappings) {
          const [varName, basePort] = mapping.split(':');
          if (varName && basePort !== undefined) {
            const port = parseInt(basePort, 10);
            this.config.portMappings[varName] = port; // Will be NaN for invalid numbers
          }
        }
      }

      // Parse CONTAINER_NAMES array
      if (trimmed.startsWith('CONTAINER_NAMES=(')) {
        const names = this.parseArray(content, 'CONTAINER_NAMES');
        for (const nameMapping of names) {
          const [varName, template] = nameMapping.split(':');
          if (varName && template) {
            this.config.containerNames[varName] = template;
          }
        }
      }

      // Parse ENV_FILES array
      if (trimmed.startsWith('ENV_FILES=(')) {
        const files = this.parseArray(content, 'ENV_FILES');
        this.config.envFiles = files;
      }

      // Parse FILE_UPDATES array
      if (trimmed.startsWith('FILE_UPDATES=(')) {
        const updates = this.parseArray(content, 'FILE_UPDATES');
        for (const update of updates) {
          const parts = update.split('|');
          if (parts.length >= 3) {
            const fileUpdate: FileUpdate = {
              filePath: parts[0],
              updateType: parts[1] as 'env_vars' | 'replace' | 'append',
              spec: parts[2]
            };

            if (parts[1] === 'replace' && parts.length >= 4) {
              fileUpdate.searchPattern = parts[2];
              fileUpdate.replacement = parts[3];
              fileUpdate.spec = parts[3]; // For replace, spec should be the replacement
            }

            this.config.fileUpdates.push(fileUpdate);
          }
        }
      }
    }
  }

  private parseArray(content: string, varName: string): string[] {
    const regex = new RegExp(`${varName}=\\(([^)]+)\\)`, 's');
    const match = content.match(regex);

    if (!match) {
      return [];
    }

    const arrayContent = match[1];
    const items: string[] = [];
    const lines = arrayContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        // Remove quotes if present
        const cleaned = trimmed.replace(/^["']|["']$/g, '');
        items.push(cleaned);
      }
    }

    return items;
  }
}
