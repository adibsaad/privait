import { Outlet } from 'react-router-dom'

import { Nav } from '../components/nav'

export function Root() {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <Nav />
      <section className="p-8">
        <Outlet />
      </section>
    </div>
  )
}
