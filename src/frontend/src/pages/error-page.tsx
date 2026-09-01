import { Link } from 'react-router-dom'

export function ErrorPage() {
  return (
    <div
      className="bg-background text-foreground flex min-h-svh items-center justify-center"
      id="error-page"
      data-testid="error-page"
    >
      <div className="mx-auto max-w-[400px] text-center">
        <h4 className="mb-3 text-[22px] font-semibold leading-tight">Oops!</h4>
        <p className="mb-8 text-lg">
          Something went wrong. Please try again later.
        </p>
        <Link
          to="/"
          className="hover:bg-accent inline-block rounded-lg border px-8 py-3 text-center text-base font-semibold transition"
        >
          Go To Home
        </Link>
      </div>
    </div>
  )
}
