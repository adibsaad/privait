import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { ApolloProvider } from '@apollo/client'
import { Toaster } from 'sonner'

import './index.css'

import { apolloClient, ClientLinkBuilder } from './apollo-client'
import { TooltipProvider } from './components/ui/tooltip'
import { CurrentUserProvider } from './providers/current-user'
import { ThemeProvider } from './providers/theme'
import { router } from './router'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ApolloProvider client={apolloClient}>
      <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
        <TooltipProvider>
          <CurrentUserProvider>
            <ClientLinkBuilder />
            <Toaster />
            <RouterProvider router={router} />
          </CurrentUserProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ApolloProvider>
  </React.StrictMode>,
)
