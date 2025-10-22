---
mode: agent
---

Using task master mcp and the provide task id provide by the user (or the next task if no task id was provided), you will:

- show details about the task
- If the task is already completed, you will inform the user that the task is already completed
- If the task is not found, you will inform the user that the task was not found
- If the task is pending, you will:
  - expand the task if it has no subtasks
  - Ask the user to confirm if they want to proceed with the task.
  - If the user confirms, you will:
    - Begin the task implementation by implementing each subtask in the order they are listed.
    - If the task has no subtasks, you implement the task directly.

---

You always:

- Inform the user about the task status and what you are doing.
- **`update-subtask`**: Log progress and findings on behalf of the user.
- **`set-status`**: Mark tasks and subtasks as `in-progress` when work begins or `done` as work is completed. IMPORTANT:
  - Before the first subtask is marked as `in-progress`, mark the main task as `in-progress`.
  - After the last subtask is marked as `done`, mark the main task as `done`.
- **`show-task`**: Display the task details to the user.

---

- Not task master project initialization is required, the project is already initialized.
- The PRD is already provided and parsed.
