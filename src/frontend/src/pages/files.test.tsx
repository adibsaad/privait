import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client'
import { gql } from '@apollo/client/core'
import { ApolloProvider } from '@apollo/client/react'
import type { MockedResponse } from '@apollo/client/testing'
import { MockedProvider } from '@apollo/client/testing/react'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, describe, it, vi, afterEach } from 'vitest'

import { Files } from './files'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

afterEach(cleanup)

const ALL_FILES = gql`
  query allFiles {
    files {
      id
      originalName
      createdAt
      status
    }
  }
`

const DELETE_FILE = gql`
  mutation DeleteFile($fileId: Int!) {
    deleteFileUpload(fileId: $fileId) {
      __typename
      ... on Error {
        message
      }
      ... on MutationDeleteFileUploadSuccess {
        data
      }
    }
  }
`

function mocksFor(files: unknown[]): MockedResponse[] {
  return [
    {
      request: { query: ALL_FILES, variables: {} },
      result: { data: { files } },
    },
  ]
}

describe('Files page', () => {
  it('lists uploaded files with name, status, and date', async () => {
    render(
      <MockedProvider
        mocks={mocksFor([
          {
            id: '7',
            originalName: 'notes.md',
            createdAt: '2026-09-01T12:00:00Z',
            status: 'PROCESSED',
          },
        ])}
      >
        <Files />
      </MockedProvider>,
    )

    await waitFor(() => expect(screen.getByText('notes.md')).toBeDefined())
    expect(screen.getByText('PROCESSED')).toBeDefined()
    // date-fns 'PPP' renders "September 1st, 2026" (ordinal suffix varies by day).
    expect(screen.getByText(/September 1\w+, 2026/)).toBeDefined()
  })

  it('shows the empty state when there are no files', async () => {
    render(
      <MockedProvider mocks={mocksFor([])}>
        <Files />
      </MockedProvider>,
    )

    await waitFor(() =>
      expect(screen.getByText(/no files uploaded yet/i)).toBeDefined(),
    )
  })

  it('toasts the error when a delete fails', async () => {
    const { toast } = await import('sonner')
    const mocks: MockedResponse[] = [
      ...mocksFor([
        {
          id: '9',
          originalName: 'gone.txt',
          createdAt: '2026-09-01T12:00:00Z',
          status: 'UPLOADED',
        },
      ]),
      {
        request: { query: DELETE_FILE, variables: { fileId: 9 } },
        result: {
          data: {
            deleteFileUpload: {
              __typename: 'Error',
              message: 'File not found',
            },
          },
        },
      },
    ]

    render(
      <MockedProvider mocks={mocks} cache={new InMemoryCache()}>
        <Files />
      </MockedProvider>,
    )

    await waitFor(() => expect(screen.getByText('gone.txt')).toBeDefined())

    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete' }),
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('File not found'),
    )
  })

  it('submits uploads through the uploadFile mutation', async () => {
    // MockedProvider can't deep-match a File variable, so this test drives
    // the page with a stub link instead: it asserts the mutation routes with
    // the file attached and that the UI refreshes to show the result.
    const operations: string[] = []
    const link = new ApolloLink((operation, forward) => {
      operations.push(operation.operationName ?? '')

      if (operation.operationName === 'uploadFile') {
        const file = operation.variables.file as File
        expect(file).toBeInstanceOf(File)
        expect(file.name).toBe('dropped.txt')
        return new Observable(observer => {
          observer.next({
            data: {
              uploadFile: {
                __typename: 'MutationUploadFileSuccess',
                data: { id: '1' },
              },
            },
          })
          observer.complete()
        })
      }

      if (operation.operationName === 'allFiles') {
        return new Observable(observer => {
          observer.next({
            data: {
              files: [
                {
                  id: '1',
                  originalName: 'dropped.txt',
                  createdAt: '2026-09-01T12:00:00Z',
                  status: 'UPLOADED',
                },
              ],
            },
          })
          observer.complete()
        })
      }

      return forward(operation)
    })

    render(
      <ApolloProvider
        client={new ApolloClient({ cache: new InMemoryCache(), link })}
      >
        <Files />
      </ApolloProvider>,
    )

    const input = await screen.findByTestId('file-input')
    await userEvent.upload(
      input,
      new File(['hello'], 'dropped.txt', { type: 'text/plain' }),
    )

    await waitFor(() => expect(screen.getByText('dropped.txt')).toBeDefined())
    expect(operations).toContain('uploadFile')
  })
})
