import { execa } from 'execa';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import { GitManager } from './git-manager';

export class DockerManager {
  private git: GitManager;

  constructor() {
    this.git = new GitManager();
  }

  private async checkDockerComposeExists(worktreeDir: string): Promise<boolean> {
    const dockerComposePath = path.join(worktreeDir, 'docker-compose.yml');
    const dockerComposeYamlPath = path.join(worktreeDir, 'docker-compose.yaml');
    
    return (await fs.pathExists(dockerComposePath)) || (await fs.pathExists(dockerComposeYamlPath));
  }

  async startContainers(name: string, worktreeDir: string): Promise<void> {
    // Check if docker-compose.yml exists
    if (!(await this.checkDockerComposeExists(worktreeDir))) {
      console.log(chalk.yellow('⚠️  No docker-compose.yml found, skipping container startup'));
      return;
    }

    const projectName = await this.git.getProjectName();
    const composeProjectName = `${projectName}-${name}`;

    // Set COMPOSE_PROJECT_NAME environment variable
    const env = {
      ...process.env,
      COMPOSE_PROJECT_NAME: composeProjectName
    };

    // Start containers
    await execa('./dev', ['up', '-d'], {
      cwd: worktreeDir,
      env,
      stdio: 'inherit'
    });
  }

  async cleanupContainers(name: string, worktreeDir: string): Promise<void> {
    // Check if docker-compose.yml exists
    if (!(await this.checkDockerComposeExists(worktreeDir))) {
      console.log(chalk.yellow('⚠️  No docker-compose.yml found, skipping container cleanup'));
      return;
    }

    const projectName = await this.git.getProjectName();
    const composeProjectName = `${projectName}-${name}`;

    // Try to stop containers using docker-compose
    try {
      const env = {
        ...process.env,
        COMPOSE_PROJECT_NAME: composeProjectName
      };

      await execa('./dev', ['down', '--remove-orphans'], {
        cwd: worktreeDir,
        env
      });
    } catch {
      // Might fail if directory doesn't exist
    }

    // Force remove any lingering containers
    try {
      const { stdout } = await execa('docker', [
        'ps',
        '-a',
        '--filter',
        `name=${composeProjectName}`,
        '--format',
        '{{.Names}}'
      ]);

      const containers = stdout.split('\n').filter(Boolean);
      for (const container of containers) {
        console.log(`   Removing container: ${container}`);
        await execa('docker', ['rm', '-f', container]);
      }
    } catch {
      // No containers to remove
    }

    // Remove Docker volumes
    console.log('   Removing Docker volumes...');
    try {
      const { stdout } = await execa('docker', [
        'volume',
        'ls',
        '--filter',
        `name=${composeProjectName}`,
        '--format',
        '{{.Name}}'
      ]);

      const volumes = stdout.split('\n').filter(Boolean);
      for (const volume of volumes) {
        console.log(`   Removing volume: ${volume}`);
        await execa('docker', ['volume', 'rm', volume]);
      }
    } catch {
      // No volumes to remove
    }
  }

  async cloneVolumes(projectName: string, worktreeName: string): Promise<void> {
    // Check if docker-compose.yml exists in current directory
    if (!(await this.checkDockerComposeExists(process.cwd()))) {
      console.log(chalk.yellow('⚠️  No docker-compose.yml found, cannot clone volumes'));
      return;
    }

    const sourceProject = projectName;
    const destProject = `${projectName}-${worktreeName}`;

    console.log(chalk.yellow('📦 Cloning Docker volumes from main worktree...'));

    // Check if main worktree has running containers
    try {
      const { stdout } = await execa('docker', [
        'ps',
        '--filter',
        `name=${sourceProject}_db`,
        '--format',
        '{{.Names}}'
      ]);
      if (!stdout.trim()) {
        console.log(
          chalk.yellow('⚠️  No running database found in main worktree. Skipping volume clone.')
        );
        console.log('   To clone data later, run: wt clone-volumes');
        return;
      }
    } catch {
      throw new Error('Docker is not running or accessible');
    }

    // Clone PostgreSQL data using pg_dump/restore
    console.log('   Cloning PostgreSQL database...');
    try {
      const dump = await execa('docker', [
        'exec',
        `${sourceProject}-db-1`,
        'pg_dump',
        '-U',
        'web-app-db',
        'web-app-db'
      ]);

      await execa(
        'docker',
        ['exec', '-i', `${destProject}-db-1`, 'psql', '-U', 'web-app-db', 'web-app-db'],
        {
          input: dump.stdout
        }
      );
    } catch (error) {
      console.log(chalk.yellow('   Note: Database will be cloned after containers start'));
    }

    // Clone Qdrant data if exists
    try {
      const { stdout } = await execa('docker', [
        'volume',
        'ls',
        '--filter',
        `name=${sourceProject}_qdrant_data`,
        '--format',
        '{{.Name}}'
      ]);
      if (stdout.trim()) {
        console.log('   Cloning Qdrant vector data...');
        await execa('docker', [
          'run',
          '--rm',
          '-v',
          `${sourceProject}_qdrant_data:/source:ro`,
          '-v',
          `${destProject}_qdrant_data:/dest`,
          'alpine',
          'sh',
          '-c',
          'cp -a /source/. /dest/'
        ]);
      }
    } catch {
      // Qdrant volume might not exist
    }

    console.log(chalk.green('✅ Volume clone complete'));
  }
}
