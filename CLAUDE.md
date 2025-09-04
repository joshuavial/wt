# Repository Management Guidelines

## Structure
- Keep all scripts in their own dedicated folders
- Group related scripts together in the same folder
- Use descriptive folder names (e.g., `toggl/`, `data-processing/`)

## Adding New Scripts
1. Create a new folder if it's a new category of scripts
2. Include a README.md in each folder explaining its purpose
3. Add usage examples in the folder's README.md
4. Update requirements.txt if new dependencies are needed

## Environment
- Use .env files for configuration (see env.sample examples)
- Keep .env files in .gitignore
- Include env.sample files to document required variables

## Development
- Setup: `[YOUR_SETUP_COMMAND_HERE]`
- Follow existing code style patterns
- Document script usage and parameters

## Ticket Workflow System

The repository uses a structured workflow system for development tasks. Each task follows one of these workflows depending on size and complexity.

### Issue Structure

All GitHub issues follow a standardized format defined in File: `_ai.bws/protocols/issue.md`.

### Workflow Phases

Development follows these phases in sequence:

1. **Planning**: Define requirements, analyze technical approach, and create a detailed plan
   - See File: `_ai.bws/workflows/planning.md`
   
2. **Execution**: Implement the solution using TDD and continuous state tracking
   - See File: `_ai.bws/workflows/execution.md`
   
3. **Quality Assurance**: Verify the implementation meets quality standards and requirements
   - See File: `_ai.bws/workflows/qa.md`
   
4. **Management**: Improve development processes and workflow evolution
   - See File: `_ai.bws/workflows/management.md`

### Core Instructions

All workflows and protocols use a standardized instruction system defined in File: `_ai.bws/core-instructions.md`.
This document contains core definitions, instruction types, activation syntax, and the protocol registry.

### Important Workflow Guidelines

1. **One Workflow at a Time**: Always work within a single workflow phase. Never proceed to the next phase without explicit instruction.

2. **Workflow Identification**: If unclear which workflow phase applies, ask for clarification before proceeding.

3. **Workflow Transitions**: Only transition between workflow phases when explicitly instructed.

4. **Documentation**: Maintain appropriate documentation as specified in each workflow.

5. **Protocol Activation**: Use `protocol [name]` for protocols and `workflow [name]` for workflows.

6. **Workflow Adherence**: Continuously reference the current workflow document during work. If ever in doubt about process or next steps, re-read the relevant workflow document.

7. **Context Loading and Boot**: When beginning a new workflow phase:
   - Follow the Boot Protocol (File: `_ai.bws/protocols/boot.md`) to locate yourself in the project hierarchy
   - Thoroughly read the workflow document in its entirety
   - Read ALL linked documents referenced in the workflow
   - Ask the user any clarifying questions before beginning planning or execution
   - Do not proceed until you have a complete understanding of all requirements and processes

8. **Workflow Adoption**: When the user asks you to adopt a specific workflow (e.g., "use Planning workflow" or "use Execution workflow"):
   - IMMEDIATELY trigger the Boot Protocol
   - Confirm your understanding of the request and current state
   - Only proceed after user confirmation

9. **Continuous Alignment**: Regularly verify that work being done aligns with the current workflow phase's requirements and processes.

When using AI assistance, always specify which workflow phase you're currently in to ensure proper adherence to the process. AI assistants should actively confirm their understanding of the current workflow and request clarification if uncertain.