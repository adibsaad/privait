import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'

import './index.css'

import { AuthRoute, UnauthRoute } from './components/auth'
import { Chat } from './components/chat'
import { MagicLink } from './pages/auth/magic-link'
import { ErrorPage } from './pages/error-page'
import { Login } from './pages/log-in'
import { Root } from './pages/root'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: 'login',
        element: (
          <UnauthRoute>
            <Login />
          </UnauthRoute>
        ),
      },
      // auth routes
      {
        path: 'auth',
        children: [
          {
            path: 'magic-link',
            element: <MagicLink />,
          },
        ],
      },
      {
        path: '',
        children: [
          {
            path: '',
            element: <Navigate to="chat" />,
          },
        ],
      },
      {
        path: '',
        element: (
          <AuthRoute>
            <Outlet />
          </AuthRoute>
        ),
        children: [
          {
            path: '',
            element: <Navigate to="chat" />,
          },
          {
            path: 'chat',
            element: <Chat />,
          },
        ],
      },
      {
        path: '*',
        element: <Navigate to="login" />,
      },
    ],
  },
])
