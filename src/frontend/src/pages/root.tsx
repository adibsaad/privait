import { Outlet } from 'react-router-dom'

import { AppSidebar } from '../components/app-sidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '../components/ui/sidebar'
import { ApolloChatRuntimeProvider } from '../providers/apollo-chat-runtime'
import { ThreadProvider } from '../providers/thread'

export function Root() {
  return (
    <ThreadProvider>
      <ApolloChatRuntimeProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <SidebarTrigger className="absolute left-2 top-2 z-10 md:hidden" />
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
      </ApolloChatRuntimeProvider>
    </ThreadProvider>
  )
}
