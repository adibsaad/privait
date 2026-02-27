export function v<T, R>(fn: (...args: T[]) => Promise<R>) {
  return (...args: T[]) => void fn(...args)
}
