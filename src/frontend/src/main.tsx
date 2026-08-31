import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { ApolloProvider } from '@apollo/client/react'
import { Toaster } from 'sonner'

import './index.css'

import { bootstrapApollo } from './apollo-client'
import { TooltipProvider } from './components/ui/tooltip'
import { CurrentUserProvider } from './providers/current-user'
import { ThemeProvider } from './providers/theme'
import { router } from './router'

async function bootstrap() {
  const apolloClient = await bootstrapApollo()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ApolloProvider client={apolloClient}>
        <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
          <TooltipProvider>
            <CurrentUserProvider>
              <Toaster />
              <RouterProvider router={router} />
            </CurrentUserProvider>
          </TooltipProvider>
        </ThemeProvider>
      </ApolloProvider>
    </React.StrictMode>,
  )
}

void bootstrap()
