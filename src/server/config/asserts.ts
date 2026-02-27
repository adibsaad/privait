export function assertNotNull<T>(x: T | null, msg: string): asserts x is T {
  if (x === null) {
    throw new Error(msg)
  }
}
