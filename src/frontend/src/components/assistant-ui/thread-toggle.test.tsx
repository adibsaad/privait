import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IncognitoToggle } from '@frontend/components/assistant-ui/thread'
import { TooltipProvider } from '@frontend/components/ui/tooltip'
import { EMPTY_THREAD_ID } from '@frontend/config/consts'
import { ThreadContext } from '@frontend/context/thread'
import { ThreadActionsContext } from '@frontend/providers/apollo-chat-runtime'

const renderToggle = (
  currentThreadId: string,
  threadList: Array<{ id: string; incognito?: boolean }>,
  actions: { setThreadIncognito: ReturnType<typeof vi.fn> },
  newChatIncognito = false,
) => {
  return render(
    <ThreadContext.Provider
      value={
        {
          currentThreadId,
          threadList: threadList as never[],
          newChatIncognito,
          setNewChatIncognito: vi.fn(),
        } as never
      }
    >
      <ThreadActionsContext.Provider
        value={{ setThreadIncognito: actions.setThreadIncognito } as never}
      >
        <TooltipProvider>
          <IncognitoToggle />
        </TooltipProvider>
      </ThreadActionsContext.Provider>
    </ThreadContext.Provider>,
  )
}

describe('IncognitoToggle', () => {
  afterEach(cleanup)

  it('flips the persisted flag of an existing chat', async () => {
    const setThreadIncognito = vi.fn()
    renderToggle('7', [{ id: '7', incognito: false }], { setThreadIncognito })

    const button = screen.getByRole('button', {
      name: 'Toggle incognito for this chat',
    })
    expect(button.getAttribute('aria-pressed')).toBe('false')

    await userEvent.click(button)

    expect(setThreadIncognito).toHaveBeenCalledWith('7', true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('reflects an already-incognito chat and untoggles it', async () => {
    const setThreadIncognito = vi.fn()
    renderToggle('7', [{ id: '7', incognito: true }], { setThreadIncognito })

    const button = screen.getByRole('button', {
      name: 'Toggle incognito for this chat',
    })
    expect(button.getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(button)

    expect(setThreadIncognito).toHaveBeenCalledWith('7', false)
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('sets the pending birth flag on the new-chat page', async () => {
    const setThreadIncognito = vi.fn()
    renderToggle(EMPTY_THREAD_ID, [], { setThreadIncognito }, true)

    const button = screen.getByRole('button', {
      name: 'Toggle incognito for this chat',
    })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(setThreadIncognito).not.toHaveBeenCalled()
  })
})
