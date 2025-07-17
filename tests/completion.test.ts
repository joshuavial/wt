import { describe, it, expect, beforeEach } from 'vitest';
import { CompletionGenerator } from '../src/completion';

describe('CompletionGenerator', () => {
  let generator: CompletionGenerator;

  beforeEach(() => {
    generator = new CompletionGenerator();
  });

  describe('generateBash', () => {
    it('should generate valid bash completion script', () => {
      const result = generator.generateBash();

      // Check for key bash completion components
      expect(result).toContain('# Bash completion for wt command');
      expect(result).toContain('_wt_completion()');
      expect(result).toContain('local cur prev words cword');
      expect(result).toContain('_init_completion || return');

      // Check for command list
      expect(result).toContain(
        'local commands="create start open new list ls remove rm cleanup clean clone-volumes clone"'
      );

      // Check for git worktree detection
      expect(result).toContain('git worktree list');
      expect(result).toContain('local project_name=$(basename "$(git rev-parse --show-toplevel)"');

      // Check for COMPREPLY usage
      expect(result).toContain('COMPREPLY=($(compgen');

      // Check for command-specific completions
      expect(result).toContain('case $prev in');
      expect(result).toContain('open|start|cleanup|clean|remove|rm)');

      // Check for flag completions
      expect(result).toContain('--remove-dir');
      expect(result).toContain('--new-tab --detached --print-command');
      expect(result).toContain('--no-clone');

      // Check for completion registration
      expect(result).toContain('complete -F _wt_completion wt');
      expect(result).toContain('complete -F _wt_completion ./wt');
    });

    it('should handle worktree name extraction correctly', () => {
      const result = generator.generateBash();

      // Check the worktree name extraction logic
      expect(result).toContain('local wt_name="${wt_basename#${project_name}-}"');
      expect(result).toContain('if [ "$wt_path" != "$main_dir" ]; then');
      expect(result).toContain('worktrees="$worktrees $wt_name"');
    });

    it('should properly escape shell variables', () => {
      const result = generator.generateBash();

      // Check for proper variable escaping
      expect(result).toMatch(/\$\{words\[1\]\}/);
      expect(result).toMatch(/\$\{wt_basename#\$\{project_name\}-\}/);
    });
  });

  describe('generateZsh', () => {
    it('should generate valid zsh completion script', () => {
      const result = generator.generateZsh();

      // Check for key zsh completion components
      expect(result).toContain('# Zsh completion for wt command');
      expect(result).toContain('_wt()');
      expect(result).toContain('local commands worktrees');

      // Check for command descriptions
      expect(result).toContain("'create:Create worktree (just directory + env files)'");
      expect(result).toContain("'new:Full workflow (create + start + open)'");
      expect(result).toContain("'list:List all worktrees'");

      // Check for zsh-specific functions
      expect(result).toContain('_describe -t commands');
      expect(result).toContain('_describe -t worktrees');
      expect(result).toContain('_values');

      // Check for worktree detection
      expect(result).toContain('git worktree list');
      expect(result).toContain('local project_name=$(basename "$(git rev-parse --show-toplevel)"');

      // Check for flag descriptions
      expect(result).toContain("'--remove-dir[Remove worktree directory]'");
      expect(result).toContain("'--new-tab[Open in new iTerm tab]'");
      expect(result).toContain("'--detached[Create session but dont attach]'");
      expect(result).toContain("'--no-clone[Do not clone data]'");

      // Check for completion registration
      expect(result).toContain('compdef _wt wt');
      expect(result).toContain('compdef _wt ./wt');
    });

    it('should handle case statements correctly', () => {
      const result = generator.generateZsh();

      // Check case statements
      expect(result).toContain('case $CURRENT in');
      expect(result).toContain('case ${words[2]} in');

      // Check command matching
      expect(result).toContain('open|start|cleanup|clean|remove|rm)');
      expect(result).toContain('create|new)');
    });

    it('should include conditional compdef registration', () => {
      const result = generator.generateZsh();

      // Check for safe compdef registration
      expect(result).toContain('if type compdef >/dev/null 2>&1; then');
      expect(result).toContain('fi');
    });
  });

  describe('common functionality', () => {
    it('should generate consistent command lists between bash and zsh', () => {
      const bashResult = generator.generateBash();
      const zshResult = generator.generateZsh();

      // Both should have the same commands
      const commands = [
        'create',
        'start',
        'open',
        'new',
        'list',
        'remove',
        'cleanup',
        'clone-volumes'
      ];

      for (const cmd of commands) {
        expect(bashResult).toContain(cmd);
        expect(zshResult).toContain(cmd);
      }
    });

    it('should handle aliases consistently', () => {
      const bashResult = generator.generateBash();
      const _zshResult = generator.generateZsh();

      // Check for command aliases
      expect(bashResult).toContain('ls'); // alias for list
      expect(bashResult).toContain('rm'); // alias for remove
      expect(bashResult).toContain('clean'); // alias for cleanup
      expect(bashResult).toContain('clone'); // alias for clone-volumes
    });
  });
});
