# Workspace agent and editing rules

- `Terra`, `Sol`, and `Luna` are custom-agent names. They must never be interpreted as paths, directory names, or edit targets.
- If the user explicitly selects Terra, keep Terra active for the current request. Do not switch to Luna or Sol unless the user explicitly requests a switch.
- Before any edit, identify a concrete file path. Never use `.` or a directory as an edit target; directory paths must only be used for discovery or listing.
- If no file is specified, inspect the workspace to find the relevant file or ask a concise clarification question before editing.
- Treat a plain agent name in a chat reply as a selection confirmation, not as a request to edit that name.
- After editing, validate the changed files and report any remaining configuration or tool errors.
- Keep responses and prompts concise; do not repeat prior conversation, tool output, or unchanged code.
- Request only targeted files, symbols, and command output. Do not use `#codebase` or attach whole folders unless the task requires it.
- For a new topic, recommend a new chat session. For a long task, use `/compact` and retain only decisions, constraints, changed files, and unresolved errors.
- Avoid duplicate searches, repeated validation, unnecessary web research, and speculative tool calls because they increase token usage.