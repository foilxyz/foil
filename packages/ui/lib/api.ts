import { GraphQLClient } from 'graphql-request';

// Build the GraphQL endpoint URL
const getGraphQLEndpoint = () => {
  const baseUrl = process.env.NEXT_PUBLIC_FOIL_API_URL;
  if (baseUrl) {
    return `${baseUrl}/graphql`;
  }
  
  // Fallback for development or when env var is not set
  if (typeof window !== 'undefined') {
    // Client-side: use current origin
    return `${window.location.origin}/graphql`;
  } else {
    // Server-side: use localhost for development
    return 'http://localhost:3001/graphql';
  }
};

// Base client for legacy usage
const client = new GraphQLClient(getGraphQLEndpoint());

// Generic request function (current implementation)
export async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  try {
    return await client.request<T>(query, variables);
  } catch (error) {
    console.error('GraphQL request failed:', error);
    throw error;
  }
}

// Enhanced typed client for fully generated queries
export async function typedGraphqlRequest<
  TQuery,
  TVariables extends Record<string, any> = Record<string, never>
>(
  query: string,
  variables?: TVariables
): Promise<TQuery> {
  try {
    return await client.request<TQuery>(query, variables);
  } catch (error) {
    console.error('GraphQL request failed:', error);
    throw error;
  }
}

// Legacy API functions
export const foilApi = {
  get: async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  },
  post: async (url: string, data: any) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  },
};
