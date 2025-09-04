import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';

interface PortVariable {
  file: string;
  name: string;
  value: string;
  line: string;
  type: 'port' | 'url_with_port';
}

interface DockerService {
  name: string;
  containerName?: string;
  ports: string[];
}

export interface SupabaseConfig {
  path: string;
  projectId: string;
  ports: {
    api?: number;
    db?: number;
    studio?: number;
    inbucket?: number;
    analytics?: number;
    pooler?: number;
    shadow?: number;
  };
}

export class RepoScanner {
  private rootDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = rootDir;
  }

  /**
   * Find all potential environment files in the repository
   */
  async findEnvFiles(): Promise<string[]> {
    const patterns = [
      '**/.env',
      '**/.env.*',
      '**/env.*',
      '**/*.env'
    ];
    
    const ignorePatterns = [
      '**/node_modules/**',
      '**/.venv/**',
      '**/venv/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**'
    ];

    const files: Set<string> = new Set();

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.rootDir,
        ignore: ignorePatterns,
        dot: true
      });
      matches.forEach((file: string) => files.add(file));
    }

    // Sort files by path for consistent ordering
    return Array.from(files).sort();
  }

  /**
   * Extract PORT-related variables from an environment file
   */
  async findPortVariables(filePath: string): Promise<PortVariable[]> {
    const fullPath = path.join(this.rootDir, filePath);
    
    if (!(await fs.pathExists(fullPath))) {
      return [];
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');
    const portVars: PortVariable[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Match lines with PORT in variable name or value
      const envVarMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (envVarMatch) {
        const [, name, value] = envVarMatch;
        // Remove quotes if present
        const cleanValue = value.trim().replace(/^["']|["']$/g, '');
        
        // Check if variable name contains PORT or if value looks like a port number
        if (name.toUpperCase().includes('PORT') || 
            (cleanValue && /^\d{2,5}$/.test(cleanValue) && parseInt(cleanValue) > 1024)) {
          portVars.push({
            file: filePath,
            name,
            value: cleanValue,
            line: trimmed,
            type: 'port'
          });
          continue; // Skip URL check if already detected as PORT variable
        }
        
        // Also check for URL variables with embedded ports
        if (name.includes('URL') && cleanValue) {
          const urlPortMatch = cleanValue.match(/:(\d{2,5})(?:\/|$)/);
          if (urlPortMatch && urlPortMatch[1] && parseInt(urlPortMatch[1]) > 1024) {
            portVars.push({
              file: filePath,
              name,
              value: urlPortMatch[1],
              line: trimmed,
              type: 'url_with_port'
            });
          }
        }
      }
    }

    return portVars;
  }

  /**
   * Find docker-compose files in the repository
   */
  async findDockerComposeFiles(): Promise<string[]> {
    const patterns = [
      'docker-compose.yml',
      'docker-compose.yaml',
      'docker-compose.*.yml',
      'docker-compose.*.yaml',
      'compose.yml',
      'compose.yaml'
    ];

    const files: Set<string> = new Set();

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.rootDir,
        ignore: ['**/node_modules/**']
      });
      matches.forEach((file: string) => files.add(file));
    }

    return Array.from(files).sort();
  }

  /**
   * Parse Docker Compose file to extract service information
   */
  async parseDockerServices(composePath: string): Promise<DockerService[]> {
    const fullPath = path.join(this.rootDir, composePath);
    
    if (!(await fs.pathExists(fullPath))) {
      return [];
    }

    try {
      // Simple parsing - for a production version, we'd use a proper YAML parser
      const content = await fs.readFile(fullPath, 'utf-8');
      const services: DockerService[] = [];
      
      // This is a simplified parser - in production, use a proper YAML library
      const lines = content.split('\n');
      let currentService: DockerService | null = null;
      let inServices = false;
      let indentLevel = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed === 'services:') {
          inServices = true;
          continue;
        }

        if (!inServices) {
          continue;
        }

        // Detect service name (less indented than properties)
        if (line.match(/^[a-zA-Z]/)) {
          inServices = false; // Exit if we hit a top-level key that's not services
          continue;
        }

        if (line.match(/^\s{2}[a-zA-Z]/)) {
          // New service
          const serviceName = trimmed.replace(':', '');
          currentService = {
            name: serviceName,
            ports: []
          };
          services.push(currentService);
          continue;
        }

        if (!currentService) {
          continue;
        }

        // Look for container_name
        const containerMatch = line.match(/container_name:\s*(.+)/);
        if (containerMatch) {
          currentService.containerName = containerMatch[1].trim();
        }

        // Look for ports
        if (line.includes('ports:')) {
          // Mark that we're in a ports section
          indentLevel = line.indexOf('ports:');
        } else if (indentLevel > 0 && line.match(/^\s*-/)) {
          // Port mapping line - handle various formats
          // Match patterns like:
          // - 127.0.0.1:${DB_PORT:-5454}:5432
          // - ${API_PORT:-4444}:8000
          // - 3000:3000
          const portLine = line.trim().substring(1).trim(); // Remove the dash
          
          // Extract the host port (first port in the mapping)
          // Handle ${VAR:-default} syntax
          const varDefaultMatch = portLine.match(/\$\{([A-Z_]+):-(\d+)\}/);
          if (varDefaultMatch) {
            const [, varName, defaultPort] = varDefaultMatch;
            currentService.ports.push(`${varName}:${defaultPort}`);
          } else {
            // Simple port matching - handle "127.0.0.1:3000:3000" format
            const simplePortMatch = portLine.match(/(?:[\d.]+:)?(\d+):\d+/);
            if (simplePortMatch) {
              currentService.ports.push(simplePortMatch[1]);
            } else {
              // Handle simple "9000:9000" format
              const basicPortMatch = portLine.match(/^"?(\d+):\d+"?$/);
              if (basicPortMatch) {
                currentService.ports.push(basicPortMatch[1]);
              }
            }
          }
        }
      }

      return services;
    } catch (error) {
      console.error(`Error parsing ${composePath}:`, error);
      return [];
    }
  }

  /**
   * Check if a .wt.conf already exists
   */
  async hasExistingConfig(): Promise<boolean> {
    const configPath = path.join(this.rootDir, '.wt.conf');
    return fs.pathExists(configPath);
  }

  /**
   * Find Supabase configuration files
   */
  async findSupabaseConfigs(): Promise<string[]> {
    const patterns = [
      '**/supabase/config.toml',
      '**/supabase-*/config.toml',
      'supabase/config.toml',
      'supabase-*/config.toml'
    ];
    
    const ignorePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**'
    ];

    const files: Set<string> = new Set();

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.rootDir,
        ignore: ignorePatterns
      });
      matches.forEach((file: string) => files.add(file));
    }

    return Array.from(files).sort();
  }

  /**
   * Parse a Supabase config.toml file to extract port information
   */
  async parseSupabaseConfig(configPath: string): Promise<SupabaseConfig | null> {
    const fullPath = path.join(this.rootDir, configPath);
    
    if (!(await fs.pathExists(fullPath))) {
      return null;
    }

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      
      const config: SupabaseConfig = {
        path: configPath,
        projectId: '',
        ports: {}
      };

      let currentSection = '';

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        // Check for project_id
        if (trimmed.startsWith('project_id =')) {
          const match = trimmed.match(/project_id\s*=\s*"([^"]+)"/);
          if (match) {
            config.projectId = match[1];
          }
        }

        // Check for section headers
        if (trimmed.startsWith('[')) {
          currentSection = trimmed.replace(/[\[\]]/g, '').toLowerCase();
          continue;
        }

        // Extract ports based on section
        if (trimmed.startsWith('port =')) {
          const portMatch = trimmed.match(/port\s*=\s*(\d+)/);
          if (portMatch) {
            const port = parseInt(portMatch[1]);
            
            switch (currentSection) {
              case 'api':
                config.ports.api = port;
                break;
              case 'db':
                config.ports.db = port;
                break;
              case 'studio':
                config.ports.studio = port;
                break;
              case 'inbucket':
                config.ports.inbucket = port;
                break;
              case 'analytics':
                config.ports.analytics = port;
                break;
              case 'db.pooler':
                config.ports.pooler = port;
                break;
            }
          }
        }

        // Check for shadow_port in db section
        if (currentSection === 'db' && trimmed.startsWith('shadow_port =')) {
          const portMatch = trimmed.match(/shadow_port\s*=\s*(\d+)/);
          if (portMatch) {
            config.ports.shadow = parseInt(portMatch[1]);
          }
        }
      }

      return config;
    } catch (error) {
      console.error(`Error parsing ${configPath}:`, error);
      return null;
    }
  }
}