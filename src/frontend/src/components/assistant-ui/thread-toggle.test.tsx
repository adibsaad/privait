import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IncognitoToggle } from '@frontend/components/assistant-ui/thread'
import { TooltipProvider } from '@frontend/components/ui/tooltip'
import { EMPTY_THREAD_ID } from '@frontend/config/consts'
import { ThreadContext } from '@frontend/context/thread'
import {
  AllConversationsDocument,
  type Conversation,
} from '@frontend/graphql/output/graphql'
import { ThreadActionsContext } from '@frontend/providers/apollo-chat-runtime'

const renderToggle = (
  currentThreadId: string,
  incognito: boolean,
  setThreadIncognito: ReturnType<typeof vi.fn>,
  newChatIncognito = false,
) => {
  const client = new ApolloClient({
    // Cache-only reads never hit the link; the URI is a never-called stub.
    link: new HttpLink({ uri: 'http://localhost:0/graphql' }),
    cache: new InMemoryCache(),
  })
  client.writeQuery({
    query: AllConversationsDocument,
    data: {
      conversations: [
        {
          __typename: 'Conversation',
          id: '7',
          title: 't',
          archived: false,
          projectId: null,
          incognito,
          updatedAt: '',
          messages: [],
        } satisfies Conversation,
      ],
    },
  })
  return render(
    <ThreadContext.Provider
      value={
        {
          currentThreadId,
          threadList: [],
          newChatIncognito,
          setNewChatIncognito: vi.fn(),
        } as never
      }
    >
      <ThreadActionsContext.Provider value={{ setThreadIncognito } as never}>
        <TooltipProvider>
          <ApolloProvider client={client}>
            <IncognitoToggle />
          </ApolloProvider>
        </TooltipProvider>
      </ThreadActionsContext.Provider>
    </ThreadContext.Provider>,
  )
}

const toggleButton = () =>
  screen.getByRole('button', { name: 'Toggle incognito for this chat' })

describe('IncognitoToggle', () => {
  afterEach(cleanup)

  it('flips the persisted flag of an existing chat', async () => {
    const setThreadIncognito = vi.fn()
    renderToggle('7', false, setThreadIncognito)

    await waitFor(() =>
      expect(toggleButton().getAttribute('aria-pressed')).toBe('false'),
    )

    await userEvent.click(toggleButton())

    expect(setThreadIncognito).toHaveBeenCalledWith('7', true)
  })

  it('reflects an already-incognito chat and untoggles it', async () => {
    const setThreadIncognito = vi.fn()
    renderToggle('7', true, setThreadIncognito)

    await waitFor(() =>
      expect(toggleButton().getAttribute('aria-pressed')).toBe('true'),
    )

    await userEvent.click(toggleButton())

    expect(setThreadIncognito).toHaveBeenCalledWith('7', false)
    expect(toggleButton().getAttribute('aria-pressed')).toBe('true')
  })

  it('sets the pending birth flag on the new-chat page', async () => {
    const setThreadIncognito = vi.fn()
    renderToggle(EMPTY_THREAD_ID, false, setThreadIncognito, true)

    await waitFor(() =>
      expect(toggleButton().getAttribute('aria-pressed')).toBe('true'),
    )
    expect(setThreadIncognito).not.toHaveBeenCalled()
  })
})
