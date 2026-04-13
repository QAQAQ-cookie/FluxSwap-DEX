function collectErrorMessages(error: unknown): string[] {
  const messages = new Set<string>()
  const queue: unknown[] = [error]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== 'object') {
      continue
    }

    if (current instanceof Error && current.message) {
      messages.add(current.message)
    }

    if ('shortMessage' in current && typeof current.shortMessage === 'string') {
      messages.add(current.shortMessage)
    }

    if ('details' in current && typeof current.details === 'string') {
      messages.add(current.details)
    }

    if ('cause' in current) {
      queue.push(current.cause)
    }
  }

  return [...messages]
}

type FormatErrorMessageOptions = {
  rejectedMessage?: string
}

export function formatErrorMessage(
  error: unknown,
  options?: FormatErrorMessageOptions,
): string {
  const messages = collectErrorMessages(error)

  if (
    messages.some((message) => {
      const normalized = message.toLowerCase()
      return (
        normalized.includes('user denied') ||
        normalized.includes('user rejected') ||
        normalized.includes('denied transaction signature') ||
        normalized.includes('rejected the request')
      )
    })
  ) {
    return options?.rejectedMessage ?? '你已取消本次交易'
  }

  if (messages.length > 0) {
    return messages[0]
  }

  return 'Unknown error'
}
