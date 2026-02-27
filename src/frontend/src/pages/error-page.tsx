import { Link } from 'react-router-dom'

import { Nav } from '@frontend/components/nav'

export function ErrorPage() {
  return (
    <div
      className="mx-auto bg-white dark:bg-black dark:text-white"
      id="error-page"
      data-testid="error-page"
    >
      <Nav />
      <section className="p-4">
        <section className="relative z-10 py-[120px]">
          <div className="container mx-auto">
            <div className="-mx-4 flex">
              <div className="w-full px-4">
                <div className="mx-auto max-w-[400px] text-center">
                  <h4 className="mb-3 text-[22px] font-semibold leading-tight">
                    Oops!
                  </h4>
                  <p className="mb-8 text-lg">
                    Something went wrong. Please try again later.
                  </p>
                  <Link
                    to="/"
                    className="hover:text-primary inline-block rounded-lg border px-8 py-3 text-center text-base font-semibold transition hover:bg-white"
                  >
                    Go To Home
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>
  )
}
