export class CompletionGenerator {
  constructor() {}

  generateBash(): string {
    return `# Bash completion for wt command
_wt_completion() {
    local cur prev words cword
    _init_completion || return

    local commands="create start open new list ls remove rm cleanup clean clone-volumes clone"
    
    # Get list of worktree names (excluding main)
    local worktrees=""
    if command -v git &>/dev/null && git rev-parse --git-dir &>/dev/null 2>&1; then
        local project_name=$(basename "$(git rev-parse --show-toplevel)" 2>/dev/null)
        local main_dir=$(git worktree list 2>/dev/null | head -1 | awk '{print $1}')
        
        while IFS= read -r line; do
            local wt_path=$(echo "$line" | awk '{print $1}')
            local wt_basename=$(basename "$wt_path")
            
            # Skip main worktree
            if [ "$wt_path" != "$main_dir" ]; then
                # Extract name from worktree path (format: project-name)
                local wt_name="\${wt_basename#\${project_name}-}"
                worktrees="$worktrees $wt_name"
            fi
        done < <(git worktree list 2>/dev/null)
    fi

    case $cword in
        1)
            # Complete command names
            COMPREPLY=($(compgen -W "$commands" -- "$cur"))
            ;;
        2)
            # Complete based on the command
            case $prev in
                open|start|cleanup|clean|remove|rm)
                    # Complete with worktree names
                    COMPREPLY=($(compgen -W "$worktrees" -- "$cur"))
                    ;;
                create|new)
                    # No completion for create/new (user provides new name)
                    ;;
            esac
            ;;
        3)
            # Complete flags for specific commands
            case \${words[1]} in
                cleanup|clean)
                    COMPREPLY=($(compgen -W "--remove-dir" -- "$cur"))
                    ;;
                open)
                    COMPREPLY=($(compgen -W "--new-tab --detached --print-command" -- "$cur"))
                    ;;
                create|new)
                    COMPREPLY=($(compgen -W "--no-clone" -- "$cur"))
                    ;;
            esac
            ;;
    esac
}

# Register the completion function
complete -F _wt_completion wt
complete -F _wt_completion ./wt`;
  }

  generateZsh(): string {
    return `# Zsh completion for wt command
_wt() {
    local commands worktrees
    
    commands=(
        'create:Create worktree (just directory + env files)'
        'start:Start containers in existing worktree'
        'open:Open tmux session for worktree'
        'new:Full workflow (create + start + open)'
        'list:List all worktrees'
        'remove:Remove worktree completely'
        'cleanup:Clean containers/volumes'
        'clone-volumes:Clone volumes from main worktree'
    )
    
    # Get list of worktree names (excluding main)
    worktrees=()
    if command -v git &>/dev/null && git rev-parse --git-dir &>/dev/null 2>&1; then
        local project_name=$(basename "$(git rev-parse --show-toplevel)" 2>/dev/null)
        local main_dir=$(git worktree list 2>/dev/null | head -1 | awk '{print $1}')
        
        while IFS= read -r line; do
            local wt_path=$(echo "$line" | awk '{print $1}')
            local wt_basename=$(basename "$wt_path")
            
            # Skip main worktree
            if [ "$wt_path" != "$main_dir" ]; then
                # Extract name from worktree path (format: project-name)
                local wt_name="\${wt_basename#\${project_name}-}"
                worktrees+=("$wt_name")
            fi
        done < <(git worktree list 2>/dev/null)
    fi
    
    case $CURRENT in
        2)
            _describe -t commands 'wt commands' commands
            ;;
        3)
            case \${words[2]} in
                open|start|cleanup|clean|remove|rm)
                    _describe -t worktrees 'worktrees' worktrees
                    ;;
                create|new)
                    # No completion for new names
                    ;;
            esac
            ;;
        4)
            case \${words[2]} in
                cleanup|clean)
                    _values 'flags' '--remove-dir[Remove worktree directory]'
                    ;;
                open)
                    _values 'flags' \
                        '--new-tab[Open in new iTerm tab]' \
                        '--detached[Create session but dont attach]' \
                        '--print-command[Just print the attach command]'
                    ;;
                create|new)
                    _values 'flags' '--no-clone[Do not clone data]'
                    ;;
            esac
            ;;
    esac
}

# Try to register completion
if type compdef >/dev/null 2>&1; then
    compdef _wt wt
    compdef _wt ./wt
fi`;
  }
}
