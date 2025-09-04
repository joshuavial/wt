import prompts from 'prompts';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import { RepoScanner } from './repo-scanner';
import { ConfigGenerator, ConfigData } from './config-generator';
import { GitManager } from './git-manager';

export class InitWizard {
  private scanner: RepoScanner;
  private git: GitManager;
  private auto: boolean;

  constructor(auto: boolean = false) {
    this.scanner = new RepoScanner();
    this.git = new GitManager();
    this.auto = auto;
  }

  async run(): Promise<void> {
    console.log(chalk.blue('🔍 Scanning repository for configuration...'));
    console.log();

    // Check for existing config
    if (await this.scanner.hasExistingConfig()) {
      const { overwrite } = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: '.wt.conf already exists. Overwrite?',
        initial: false
      });

      if (!overwrite) {
        console.log(chalk.yellow('Cancelled.'));
        return;
      }
    }

    const config: ConfigData = {
      startContainers: true,
      portOffsetIncrement: 10,
      envFiles: [],
      portMappings: [],
      containerNames: [],
      fileUpdates: []
    };

    // Step 1: Find and confirm environment files
    const envFiles = await this.confirmEnvFiles();
    config.envFiles = envFiles;

    // Step 2: Find and confirm port variables
    const portMappings = await this.confirmPortMappings(envFiles);
    config.portMappings = portMappings;

    // Step 2.5: Find and confirm Supabase configurations
    const supabasePortMappings = await this.confirmSupabaseConfigs();
    // Add Supabase port mappings to config
    for (const mapping of supabasePortMappings) {
      if (!config.portMappings.find(m => m.variable === mapping.variable)) {
        config.portMappings.push(mapping);
      }
    }

    // Step 3: Analyze Docker Compose files
    const dockerInfo = await this.analyzeDockerCompose(portMappings);
    if (dockerInfo) {
      config.containerNames = dockerInfo.containerNames;
      
      // Add any additional ports found in docker-compose
      for (const port of dockerInfo.additionalPorts) {
        if (!config.portMappings.find(m => m.port === port.port)) {
          config.portMappings.push(port);
        }
      }
    }

    // Step 4: Generate FILE_UPDATES
    config.fileUpdates = await this.generateFileUpdates(config);

    // Step 5: Additional configuration
    const additionalConfig = await this.getAdditionalConfig();
    config.startContainers = additionalConfig.startContainers;
    config.portOffsetIncrement = additionalConfig.portOffsetIncrement;

    // Step 6: Preview and confirm
    await this.previewAndWrite(config);
  }

  private async confirmEnvFiles(): Promise<string[]> {
    const foundFiles = await this.scanner.findEnvFiles();
    
    if (foundFiles.length === 0) {
      console.log(chalk.yellow('No environment files found.'));
      return [];
    }

    console.log(chalk.green(`Found ${foundFiles.length} environment file(s):`));
    
    const confirmedFiles: string[] = [];

    if (this.auto) {
      // In auto mode, include all .env files
      return foundFiles.filter(f => f.endsWith('.env'));
    }

    for (const file of foundFiles) {
      const { include } = await prompts({
        type: 'confirm',
        name: 'include',
        message: `Include ${chalk.cyan(file)} for worktree copying?`,
        initial: file.endsWith('.env') // Default to true for .env files
      });

      if (include) {
        confirmedFiles.push(file);
      }
    }

    console.log();
    return confirmedFiles;
  }

  private async confirmSupabaseConfigs(): Promise<Array<{ variable: string; port: number }>> {
    console.log(chalk.blue('Scanning for Supabase configurations...'));
    
    const supabaseConfigs = await this.scanner.findSupabaseConfigs();
    
    if (supabaseConfigs.length === 0) {
      return [];
    }

    console.log(chalk.green(`Found ${supabaseConfigs.length} Supabase configuration(s):`));
    
    const allPortMappings: Array<{ variable: string; port: number }> = [];

    for (const configPath of supabaseConfigs) {
      const config = await this.scanner.parseSupabaseConfig(configPath);
      
      if (!config) {
        continue;
      }

      console.log();
      console.log(chalk.green(`Supabase project: ${config.projectId || path.dirname(configPath)}`));
      console.log(chalk.gray(`Config: ${configPath}`));
      
      // Determine prefix based on path
      const isTest = configPath.includes('supabase-test');
      const prefix = isTest ? 'SUPABASE_TEST_' : 'SUPABASE_';
      
      const portEntries = [
        { name: 'API', key: 'api' as const, port: config.ports.api },
        { name: 'Database', key: 'db' as const, port: config.ports.db },
        { name: 'Studio', key: 'studio' as const, port: config.ports.studio },
        { name: 'Inbucket', key: 'inbucket' as const, port: config.ports.inbucket },
        { name: 'Analytics', key: 'analytics' as const, port: config.ports.analytics },
        { name: 'Pooler', key: 'pooler' as const, port: config.ports.pooler },
        { name: 'Shadow', key: 'shadow' as const, port: config.ports.shadow }
      ];

      for (const entry of portEntries) {
        if (entry.port) {
          const varName = `${prefix}${entry.name.toUpperCase().replace(' ', '_')}_PORT`;
          
          if (this.auto) {
            allPortMappings.push({
              variable: varName,
              port: entry.port
            });
            console.log(`  ✓ ${entry.name}: ${entry.port} → ${varName}`);
          } else {
            const { track } = await prompts({
              type: 'confirm',
              name: 'track',
              message: `  ${entry.name}: ${entry.port} - Map to ${varName}?`,
              initial: true
            });

            if (track) {
              allPortMappings.push({
                variable: varName,
                port: entry.port
              });
            }
          }
        }
      }
    }

    console.log();
    return allPortMappings;
  }

  private async confirmPortMappings(envFiles: string[]): Promise<Array<{ variable: string; port: number }>> {
    console.log(chalk.blue('Scanning for PORT variables...'));
    
    const allPortVars: Array<{ variable: string; port: number; file: string }> = [];

    for (const file of envFiles) {
      const portVars = await this.scanner.findPortVariables(file);
      
      if (portVars.length > 0) {
        console.log();
        console.log(chalk.green(`In ${file}:`));
        
        for (const portVar of portVars) {
          const port = parseInt(portVar.value);
          
          // Skip if not a valid port number
          if (isNaN(port) || port < 1 || port > 65535) {
            continue;
          }

          // Only include actual port variables in PORT_MAPPINGS, not URLs
          if (portVar.type === 'port') {
            if (this.auto) {
              // In auto mode, include all valid port variables
              allPortVars.push({
                variable: portVar.name,
                port,
                file
              });
              console.log(`  ✓ ${portVar.name}=${port}`);
            } else {
              const { track } = await prompts({
                type: 'confirm',
                name: 'track',
                message: `  ${portVar.name}=${port} - Track for offset?`,
                initial: true
              });

              if (track) {
                allPortVars.push({
                  variable: portVar.name,
                  port,
                  file
                });
              }
            }
          } else if (portVar.type === 'url_with_port') {
            // Just display URLs with ports for information
            console.log(chalk.gray(`  ℹ ${portVar.name} contains port ${port} (URL variable)`));
          }
        }
      }
    }

    // Remove duplicates (same variable name)
    const uniquePortMappings = new Map<string, { variable: string; port: number }>();
    for (const mapping of allPortVars) {
      if (!uniquePortMappings.has(mapping.variable)) {
        uniquePortMappings.set(mapping.variable, {
          variable: mapping.variable,
          port: mapping.port
        });
      }
    }

    console.log();
    return Array.from(uniquePortMappings.values());
  }

  private async analyzeDockerCompose(existingPortMappings: Array<{ variable: string; port: number }>): Promise<{
    containerNames: Array<{ variable: string; template: string }>;
    additionalPorts: Array<{ variable: string; port: number }>;
  } | null> {
    const composeFiles = await this.scanner.findDockerComposeFiles();
    
    if (composeFiles.length === 0) {
      return null;
    }

    console.log(chalk.blue(`Found docker-compose file(s): ${composeFiles.join(', ')}`));
    
    const containerNames: Array<{ variable: string; template: string }> = [];
    const additionalPorts: Array<{ variable: string; port: number }> = [];
    const projectName = await this.git.getProjectName();

    for (const file of composeFiles) {
      const services = await this.scanner.parseDockerServices(file);
      
      if (services.length > 0) {
        console.log();
        console.log(chalk.green(`Services in ${file}:`));
        
        for (const service of services) {
          console.log(`  - ${service.name}`);
          
          if (service.containerName) {
            console.log(`    Container: ${service.containerName}`);
            
            if (!this.auto) {
              const { customize } = await prompts({
                type: 'confirm',
                name: 'customize',
                message: `    Create worktree-specific name?`,
                initial: true
              });

              if (customize) {
                const template = ConfigGenerator.generateContainerTemplate(
                  service.containerName,
                  projectName
                );
                
                const varName = `${service.name.toUpperCase()}_CONTAINER`;
                containerNames.push({
                  variable: varName,
                  template
                });
                
                console.log(chalk.gray(`    Template: ${template}`));
              }
            } else {
              // Auto mode
              const template = ConfigGenerator.generateContainerTemplate(
                service.containerName,
                projectName
              );
              const varName = `${service.name.toUpperCase()}_CONTAINER`;
              containerNames.push({
                variable: varName,
                template
              });
            }
          }
          
          // Extract ports
          for (const portMapping of service.ports) {
            // Handle "VAR_NAME:default_port" format from docker-compose parser
            if (portMapping.includes(':')) {
              const [varName, defaultPort] = portMapping.split(':');
              const port = parseInt(defaultPort);
              if (!isNaN(port)) {
                // Check if we already have this port variable
                const existingPort = existingPortMappings.find(m => m.variable === varName);
                if (!existingPort) {
                  additionalPorts.push({
                    variable: varName,
                    port
                  });
                }
              }
            } else {
              // Simple port number
              const port = parseInt(portMapping);
              if (!isNaN(port)) {
                const varName = `${service.name.toUpperCase()}_PORT`;
                additionalPorts.push({
                  variable: varName,
                  port
                });
              }
            }
          }
        }
      }
    }

    console.log();
    return { containerNames, additionalPorts };
  }

  private async generateFileUpdates(config: ConfigData): Promise<ConfigData['fileUpdates']> {
    const updates: ConfigData['fileUpdates'] = [];

    // First, add env_vars update for main .env with all port variables
    if (config.portMappings.length > 0) {
      updates.push({
        file: '.env',
        type: 'env_vars',
        spec: config.portMappings.map(m => m.variable).join(',')
      });
    }

    // Now scan for URL variables that need port replacement
    for (const file of config.envFiles) {
      const portVars = await this.scanner.findPortVariables(file);
      const urlsWithPorts = portVars.filter(v => v.type === 'url_with_port');
      
      for (const urlVar of urlsWithPorts) {
        // Find which port variable this URL uses
        const port = parseInt(urlVar.value);
        
        // Try to match it with a known port mapping
        let portVarName: string | undefined;
        
        // Try to find a matching port in our mappings
        const mapping = config.portMappings.find(m => m.port === port);
        if (mapping) portVarName = mapping.variable;
        
        if (portVarName) {
          // Add a replace rule for this URL
          updates.push({
            file,
            type: 'replace',
            spec: '',
            searchPattern: `:${port}`,
            replacement: `:{{${portVarName}}}`
          });
        }
      }
    }

    // Add docker-compose container name replacements if needed
    // This is simplified - in production, we'd parse the actual docker-compose file
    const composeFiles = ['docker-compose.yml', 'docker-compose.yaml'];
    for (const file of composeFiles) {
      if (config.containerNames.length > 0) {
        // This is a placeholder - real implementation would analyze the actual file
        updates.push({
          file,
          type: 'replace',
          spec: '',
          searchPattern: 'container_name: (\\w+)',
          replacement: 'container_name: {{WORKTREE_NAME}}-$1'
        });
      }
    }

    return updates;
  }

  private async getAdditionalConfig(): Promise<{
    startContainers: boolean;
    portOffsetIncrement: number;
  }> {
    if (this.auto) {
      return {
        startContainers: true,
        portOffsetIncrement: 10
      };
    }

    console.log(chalk.blue('Additional configuration:'));

    const { portOffset } = await prompts({
      type: 'number',
      name: 'portOffset',
      message: 'Port offset increment?',
      initial: 10,
      validate: value => value > 0 || 'Must be greater than 0'
    });

    const { startContainers } = await prompts({
      type: 'confirm',
      name: 'startContainers',
      message: 'Auto-start containers?',
      initial: true
    });

    console.log();
    return {
      startContainers,
      portOffsetIncrement: portOffset
    };
  }

  private async previewAndWrite(config: ConfigData): Promise<void> {
    const generator = new ConfigGenerator(config);
    const content = generator.toString();

    console.log(chalk.blue('Generated .wt.conf:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(content);
    console.log(chalk.gray('─'.repeat(50)));

    if (!this.auto) {
      const { write } = await prompts({
        type: 'confirm',
        name: 'write',
        message: 'Write this configuration?',
        initial: true
      });

      if (!write) {
        console.log(chalk.yellow('Cancelled.'));
        return;
      }
    }

    const configPath = path.join(process.cwd(), '.wt.conf');
    await fs.writeFile(configPath, content);
    
    console.log(chalk.green('✅ Created .wt.conf'));
    console.log();
    console.log('Next steps:');
    console.log('  1. Review the generated configuration');
    console.log('  2. Run "wt new <branch-name>" to create a new worktree');
  }
}