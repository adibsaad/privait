import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { MessageSquare, Moon, Settings, Sun } from 'lucide-react'

import { ThreadList } from '@frontend/components/assistant-ui/thread-list'
import { Logo } from '@frontend/components/logo'
import { SettingsDialog } from '@frontend/components/settings-dialog'
import { Button } from '@frontend/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@frontend/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@frontend/components/ui/sidebar'
import { useTheme } from '@frontend/hooks/theme'

const NAV_ITEMS = [{ to: '/chat', label: 'Chat', icon: MessageSquare }]

function ThemeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const [settingsOpen, settingsOpenSet] = useState(false)
  const { pathname } = useLocation()

  return (
    <Sidebar collapsible="none" className="border-r" {...props}>
      <SidebarHeader className="border-b p-4">
        <NavLink to="/" aria-label="Privait home">
          <Logo />
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto">
        <SidebarMenu className="gap-1 p-2">
          {NAV_ITEMS.map(item => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith(item.to)}
                tooltip={item.label}
              >
                <NavLink to={item.to}>
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>

        <div className="px-2">
          <ThreadList />
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-1 px-1">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Settings"
                onClick={() => settingsOpenSet(true)}
              >
                <Settings className="size-4" />
              </Button>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {settingsOpen && (
        <SettingsDialog open={settingsOpen} onOpenChange={settingsOpenSet} />
      )}
      <SidebarRail />
    </Sidebar>
  )
}
