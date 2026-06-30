function collectErrorMessages(error: unknown): string[] {
  const messages = new Set<string>();
  const queue: unknown[] = [error];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }

    if (current instanceof Error && current.message) {
      messages.add(current.message);
    }

    if ('shortMessage' in current && typeof current.shortMessage === 'string') {
      messages.add(current.shortMessage);
    }

    if ('details' in current && typeof current.details === 'string') {
      messages.add(current.details);
    }

    if ('cause' in current) {
      queue.push(current.cause);
    }
  }

  return [...messages];
}

export function formatErrorMessage(error: unknown): string {
  const messages = collectErrorMessages(error);
  const normalizedMessages = messages.map((message) => message.toLowerCase());

  if (
    normalizedMessages.some((message) =>
      ['user denied', 'user rejected', 'denied transaction signature', 'rejected the request'].some((pattern) =>
        message.includes(pattern),
      ),
    )
  ) {
    return '你已取消本次操作';
  }

  if (
    normalizedMessages.some((message) =>
      ['insufficient funds', 'insufficient balance', 'exceeds balance'].some((pattern) => message.includes(pattern)),
    )
  ) {
    return '余额不足，请检查钱包余额后重试。';
  }

  if (
    normalizedMessages.some((message) =>
      ['execution reverted', 'reverted with the following reason', 'contract function', 'contract call'].some(
        (pattern) => message.includes(pattern),
      ),
    )
  ) {
    return '链上执行失败，请检查权限、地址、数量或合约状态后重试。';
  }

  if (
    normalizedMessages.some((message) =>
      ['rpc submit', 'internal error', 'network error', 'failed to fetch', 'timeout'].some((pattern) =>
        message.includes(pattern),
      ),
    )
  ) {
    return 'RPC 或网络暂时异常，请稍后重试。';
  }

  if (messages.length > 0) {
    const firstMessage = messages[0].trim();

    if (firstMessage.length <= 140) {
      return firstMessage;
    }
  }

  return '操作失败，请稍后重试。';
}
