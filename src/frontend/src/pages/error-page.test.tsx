import React from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { render, waitFor, screen } from '@testing-library/react'
import { expect, describe, it } from 'vitest'

import { ErrorPage } from './error-page'

describe('Error page', () => {
  it('renders', async () => {
    const routes = [
      {
        path: '/error',
        element: <ErrorPage />,
      },
    ]

    const router = createMemoryRouter(routes, {
      initialEntries: ['/error'],
    })

    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByTestId('error-page'))
    expect(screen.getByTestId('error-page')).toBeDefined()
  })
})
