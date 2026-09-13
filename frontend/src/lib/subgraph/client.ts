import { getSubgraphUrl } from '@/config/chain';

type GraphQLResponse<TData> = {
  data?: TData;
  errors?: Array<{
    message?: string;
  }>;
};

export async function fetchSubgraph<TData>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<TData> {
  const subgraphUrl = getSubgraphUrl();

  const response = await fetch(subgraphUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Subgraph request failed with status ${response.status}`);
  }

  const result = (await response.json()) as GraphQLResponse<TData>;

  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? 'Subgraph request failed');
  }

  if (!result.data) {
    throw new Error('Subgraph response did not include data');
  }

  return result.data;
}
