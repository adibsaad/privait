import { createBrowserRouter, Navigate } from 'react-router-dom'

import './index.css'

import { Chat } from './components/chat'
import { ErrorPage } from './pages/error-page'
import { Root } from './pages/root'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: '',
        element: <Navigate to="chat" />,
      },
      {
        path: 'chat',
        element: <Chat />,
      },
      {
        path: '*',
        element: <Navigate to="chat" />,
      },
    ],
  },
])
