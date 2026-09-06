import { Outlet } from 'react-router-dom'

import { AppSidebar } from '../components/app-sidebar'
import { MemoriesWatcher } from '../components/memories-watcher'
import { TitleBar } from '../components/titlebar'
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
        <MemoriesWatcher />
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <TitleBar />
            <div className="min-h-0 flex-1">
              <Outlet />
            </div>
            <SidebarTrigger className="absolute left-2 top-12 z-10 md:hidden" />
          </SidebarInset>
        </SidebarProvider>
      </ApolloChatRuntimeProvider>
    </ThreadProvider>
  )
}
