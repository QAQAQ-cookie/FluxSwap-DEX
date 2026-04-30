import type { SwapTokenOption } from '@/config/tokens';

export function sortPairTokens(
  first: SwapTokenOption | undefined,
  second: SwapTokenOption | undefined,
): [SwapTokenOption | undefined, SwapTokenOption | undefined] {
  if (!first || !second) {
    return [first, second];
  }

  return first.routeAddress.toLowerCase() <= second.routeAddress.toLowerCase()
    ? [first, second]
    : [second, first];
}
