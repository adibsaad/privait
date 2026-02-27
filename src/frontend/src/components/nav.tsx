import { useMemo } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { Moon, Sun, User } from 'lucide-react'

import { Button } from '@frontend/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@frontend/components/ui/dropdown-menu'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
} from '@frontend/components/ui/sheet'
import { useCurrentUser } from '@frontend/hooks/current-user'
import { useTheme } from '@frontend/hooks/theme'
import { cn } from '@frontend/lib/utils'

import { Logo } from './logo'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { LoadingSpinner } from './ui/loading-spinner'

function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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

export function Nav() {
  const { currentUser, isLoading, logOut } = useCurrentUser()

  const Links = useMemo(
    () =>
      [
        currentUser && {
          name: 'Chat',
          href: '/chat',
        },
      ].filter(v => !!v),
    [currentUser],
  )

  return (
    <header className="flex h-20 w-full shrink-0 items-center border-b px-4 md:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden">
            <MenuIcon className="h-6 w-6" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <Link to="#" className="mr-6 flex lg:hidden">
            <Logo />
            <span className="sr-only">Privait</span>
          </Link>
          <div className="grid gap-2 py-6">
            <ModeToggle />
            {Links.map(link => (
              <NavLink
                to={link.href}
                key={link.href}
                className="flex w-full items-center py-2 text-lg font-semibold"
              >
                {link.name}
              </NavLink>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <nav className="hidden gap-6 lg:flex">
        <Link to="/" className="mr-6">
          <Logo />
        </Link>

        {Links.map(link => (
          <NavLink
            to={link.href}
            key={link.href}
            className={({ isActive }) => {
              return cn(
                'group inline-flex h-9 w-max items-center justify-center rounded-md',
                'px-4 py-2 text-sm font-medium transition-colors',
                'hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none',
                'disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-950 dark:hover:bg-gray-800 dark:hover:text-gray-50 dark:focus:bg-gray-800 dark:focus:text-gray-50',
                'dark:hover:bg-gray-800 dark:hover:text-gray-50 dark:focus:bg-gray-800 dark:focus:text-gray-50 dark:data-[state=open]:bg-gray-800/50',
                isActive ? 'bg-gray-100/50 dark:bg-gray-800/50' : 'bg-white',
              )
            }}
          >
            {link.name}
          </NavLink>
        ))}
      </nav>
      <nav className="ml-auto hidden items-center gap-6 lg:flex">
        <ModeToggle />

        {isLoading ? (
          <LoadingSpinner />
        ) : currentUser ? (
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Avatar>
                <AvatarImage src={currentUser.pictureUrl ?? ''} />
                <AvatarFallback>
                  <User className="h-full w-full rounded-full object-cover object-center" />
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{currentUser.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logOut}>Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link
            to="/login"
            className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-gray-100/50 data-[state=open]:bg-gray-100/50 dark:bg-gray-950 dark:hover:bg-gray-800 dark:hover:text-gray-50 dark:focus:bg-gray-800 dark:focus:text-gray-50 dark:data-[active]:bg-gray-800/50 dark:data-[state=open]:bg-gray-800/50"
          >
            Login
          </Link>
        )}
      </nav>
    </header>
  )
}

function MenuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  )
}
