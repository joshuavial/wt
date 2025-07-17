import * as fs from 'fs-extra';
import * as path from 'path';
import { ConfigLoader, FileUpdate } from './config-loader';
import { GitManager } from './git-manager';

export class EnvironmentUpdater {
  private config: ConfigLoader;
  private git: GitManager;

  constructor(config: ConfigLoader) {
    this.config = config;
    this.git = new GitManager();
  }

  async updateEnvironmentFiles(worktreeName: string, worktreeDir: string): Promise<void> {
    const worktreeIndex = await this.git.getWorktreeIndex(worktreeName);
    const portOffset = await this.calculatePortOffset(worktreeName);

    // Process FILE_UPDATES
    for (const update of this.config.get().fileUpdates) {
      await this.processFileUpdate(update, worktreeName, worktreeDir, worktreeIndex, portOffset);
    }

    // Process PORT_MAPPINGS
    const portMappings = this.config.get().portMappings;
    if (Object.keys(portMappings).length > 0) {
      await this.updatePortVariables(worktreeDir, portMappings, portOffset);
    }

    // Process CONTAINER_NAMES
    const containerNames = this.config.get().containerNames;
    if (Object.keys(containerNames).length > 0) {
      await this.updateContainerNames(worktreeDir, containerNames, worktreeName, worktreeIndex);
    }
  }

  private async processFileUpdate(
    update: FileUpdate,
    worktreeName: string,
    worktreeDir: string,
    worktreeIndex: number,
    portOffset: number
  ): Promise<void> {
    const fullPath = path.join(worktreeDir, update.filePath);

    switch (update.updateType) {
      case 'env_vars':
        await this.updateEnvVars(fullPath, update.spec, portOffset);
        break;

      case 'replace':
        await this.replaceInFile(
          fullPath,
          update.searchPattern,
          update.replacement,
          worktreeName,
          worktreeIndex
        );
        break;

      case 'append': {
        const content = this.substituteTemplate(
          update.spec,
          worktreeName,
          worktreeIndex,
          portOffset
        );
        await fs.appendFile(fullPath, `\n${content}`);
        break;
      }
    }
  }

  private async updateEnvVars(
    filePath: string,
    varSpec: string,
    portOffset: number
  ): Promise<void> {
    const vars = varSpec.split(',').map((v) => v.trim());
    const portMappings = this.config.get().portMappings;

    if (!(await fs.pathExists(filePath))) {
      await fs.ensureFile(filePath);
    }

    let content = await fs.readFile(filePath, 'utf-8');

    for (const varName of vars) {
      const basePort = portMappings[varName];
      if (basePort) {
        const newPort = basePort + portOffset;
        const regex = new RegExp(`^${varName}=.*$`, 'gm');

        if (regex.test(content)) {
          content = content.replace(regex, `${varName}=${newPort}`);
        } else {
          content += `\n${varName}=${newPort}`;
        }
      }
    }

    await fs.writeFile(filePath, content);
  }

  private async replaceInFile(
    filePath: string,
    searchPattern: string,
    replacement: string,
    worktreeName: string,
    worktreeIndex: number
  ): Promise<void> {
    if (!(await fs.pathExists(filePath))) {
      return;
    }

    let content = await fs.readFile(filePath, 'utf-8');
    const portOffset = await this.calculatePortOffset(worktreeName);
    const substitutedReplacement = this.substituteTemplate(
      replacement,
      worktreeName,
      worktreeIndex,
      portOffset
    );

    content = content.replace(new RegExp(searchPattern, 'g'), substitutedReplacement);
    await fs.writeFile(filePath, content);
  }

  private async updatePortVariables(
    worktreeDir: string,
    portMappings: Record<string, number>,
    portOffset: number
  ): Promise<void> {
    const envPath = path.join(worktreeDir, '.env');

    if (!(await fs.pathExists(envPath))) {
      await fs.ensureFile(envPath);
    }

    let content = await fs.readFile(envPath, 'utf-8');

    for (const [varName, basePort] of Object.entries(portMappings)) {
      const newPort = basePort + portOffset;
      const regex = new RegExp(`^${varName}=.*$`, 'gm');

      if (regex.test(content)) {
        content = content.replace(regex, `${varName}=${newPort}`);
      } else {
        content += `\n${varName}=${newPort}`;
      }
    }

    await fs.writeFile(envPath, content);
  }

  private async updateContainerNames(
    worktreeDir: string,
    containerNames: Record<string, string>,
    worktreeName: string,
    worktreeIndex: number
  ): Promise<void> {
    const envPath = path.join(worktreeDir, '.env');

    if (!(await fs.pathExists(envPath))) {
      await fs.ensureFile(envPath);
    }

    let content = await fs.readFile(envPath, 'utf-8');

    for (const [varName, template] of Object.entries(containerNames)) {
      const containerName = this.substituteTemplate(template, worktreeName, worktreeIndex, 0);
      const regex = new RegExp(`^${varName}=.*$`, 'gm');

      if (regex.test(content)) {
        content = content.replace(regex, `${varName}=${containerName}`);
      } else {
        content += `\n${varName}=${containerName}`;
      }
    }

    await fs.writeFile(envPath, content);
  }

  private async calculatePortOffset(worktreeName: string): Promise<number> {
    const index = await this.git.getWorktreeIndex(worktreeName);
    return index * this.config.get().portOffsetIncrement;
  }

  private substituteTemplate(
    template: string,
    worktreeName: string,
    worktreeIndex: number,
    portOffset: number
  ): string {
    let result = template;

    // Replace {{WORKTREE_NAME}}
    result = result.replace(/\{\{WORKTREE_NAME\}\}/g, worktreeName);

    // Replace {{WORKTREE_INDEX}}
    result = result.replace(/\{\{WORKTREE_INDEX\}\}/g, worktreeIndex.toString());

    // Replace port placeholders
    const portMappings = this.config.get().portMappings;
    for (const [portVar, basePort] of Object.entries(portMappings)) {
      const newPort = basePort + portOffset;
      result = result.replace(new RegExp(`\\{\\{${portVar}\\}\\}`, 'g'), newPort.toString());
    }

    return result;
  }
}
