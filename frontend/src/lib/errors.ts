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
  fallbackMessage?: string
}

function includesAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern))
}

export function formatErrorMessage(
  error: unknown,
  options?: FormatErrorMessageOptions,
): string {
  const messages = collectErrorMessages(error)
  const normalizedMessages = messages.map((message) => message.toLowerCase())

  if (
    normalizedMessages.some((normalized) =>
      includesAny(normalized, [
        'user denied',
        'user rejected',
        'denied transaction signature',
        'rejected the request',
      ]),
    )
  ) {
    return options?.rejectedMessage ?? '你已取消本次操作'
  }

  if (
    normalizedMessages.some((normalized) =>
      includesAny(normalized, [
        'insufficient funds',
        'insufficient balance',
        'exceeds balance',
        'transfer amount exceeds balance',
      ]),
    )
  ) {
    return '余额不足，请检查钱包余额后重试。'
  }

  if (
    normalizedMessages.some((normalized) =>
      includesAny(normalized, [
        'excessive_input_amount',
        'insufficient_output_amount',
        'insufficient liquidity',
        'slippage',
      ]),
    )
  ) {
    return '交易价格或池子状态已变化，请刷新报价或调高滑点后重试。'
  }

  if (
    normalizedMessages.some((normalized) =>
      includesAny(normalized, [
        'execution reverted',
        'reverted with the following reason',
        'contract function',
        'contract call',
      ]),
    )
  ) {
    return '链上交易执行失败，请检查数量、滑点、余额或池子状态后重试。'
  }

  if (
    normalizedMessages.some((normalized) =>
      includesAny(normalized, [
        'rpc submit',
        'internal error',
        'network error',
        'failed to fetch',
        'timeout',
      ]),
    )
  ) {
    return 'RPC 或网络暂时异常，请稍后重试。'
  }

  if (messages.length > 0) {
    const firstMessage = messages[0].trim()

    if (firstMessage.length <= 120) {
      return firstMessage
    }
  }

  return options?.fallbackMessage ?? '操作失败，请稍后重试。'
}
