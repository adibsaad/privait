export async function findFirstOrThrow<T>(
  promise: Promise<T | undefined | null>,
): Promise<T> {
  const result = await promise
  if (!result) throw new Error('Record not found')
  return result
}
