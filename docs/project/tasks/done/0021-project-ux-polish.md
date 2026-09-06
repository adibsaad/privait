---
id: 0021
title: Project UX polish (delete confirm, active row, two-column page, Enter submits)
---
## Goal
Four fixes from project-page testing: chat deletion needs a confirmation; the sidebar project row should highlight as active while its page is open; the project page drops the back button and becomes two-column (left: header/composer/chats, right: knowledge files); the project dialog submits on Enter in the name field.

## Acceptance criteria
- [x] Deleting a chat shows a confirmation dialog first; only confirming removes it
- [x] The sidebar project row is highlighted as active while `/project/:id` is open (same treatment as the active chat row)
- [x] Project page: no back button; two-column layout — left column header/composer/chat list, right column knowledge files
- [x] Pressing Enter while the name input is focused in the new/edit project dialog submits the dialog (Enter inside instructions stays a newline)

## Constraints
- Confirm dialog reuses the existing AlertDialog pattern
depends_on:
  - 0019

## Review
- Chat delete goes through an AlertDialog (same pattern as project delete): menu Delete opens the confirm, row stays until Yes, mutation fires on confirm.
- Project rows get `data-active` from the route (`/project/:id`) — same highlight treatment as the active chat row.
- Project page: back button dropped; two-column grid (`1fr 17rem`) — left header/composer/chats, right knowledge with a border separator.
- Dialog name field: Enter submits (instructions textarea keeps newlines); `autoFocus` on the name for keyboard flow.
- Verified live in the isolated dir: confirm dialog blocks deletion until Yes (server count drops after), active row + two-column layout via getBoundingClientRect, Enter-submits-and-closes the dialog.
