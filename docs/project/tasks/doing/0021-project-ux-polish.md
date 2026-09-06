---
id: 0021
title: Project UX polish (delete confirm, active row, two-column page, Enter submits)
---
## Goal
Four fixes from project-page testing: chat deletion needs a confirmation; the sidebar project row should highlight as active while its page is open; the project page drops the back button and becomes two-column (left: header/composer/chats, right: knowledge files); the project dialog submits on Enter in the name field.

## Acceptance criteria
- [ ] Deleting a chat shows a confirmation dialog first; only confirming removes it
- [ ] The sidebar project row is highlighted as active while `/project/:id` is open (same treatment as the active chat row)
- [ ] Project page: no back button; two-column layout — left column header/composer/chat list, right column knowledge files
- [ ] Pressing Enter while the name input is focused in the new/edit project dialog submits the dialog (Enter inside instructions stays a newline)

## Constraints
- Confirm dialog reuses the existing AlertDialog pattern
depends_on:
  - 0019
