type GraphQLResponse<TData> = {
  data?: TData;
  errors?: Array<{
    message?: string;
  }>;
};

const DEFAULT_SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
  'http://localhost:8000/subgraphs/name/fluxswap-subgraph';

export async function fetchSubgraph<TData>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<TData> {
  const response = await fetch(DEFAULT_SUBGRAPH_URL, {
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
