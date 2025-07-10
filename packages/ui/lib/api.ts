import { GraphQLClient } from 'graphql-request';

// Base client for legacy usage
const client = new GraphQLClient('/graphql');

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

// Specific typed functions for generated queries
import type { 
  GetResourcesQuery, 
  GetResourcesQueryVariables,
  GetResourceCandlesQuery,
  GetResourceCandlesQueryVariables,
  GetIndexCandlesQuery,
  GetIndexCandlesQueryVariables
} from '../types/graphql';

export const getResources = async (
  query: string,
  variables?: GetResourcesQueryVariables
): Promise<GetResourcesQuery> => {
  return typedGraphqlRequest<GetResourcesQuery, GetResourcesQueryVariables>(query, variables);
};

export const getResourceCandles = async (
  query: string,
  variables: GetResourceCandlesQueryVariables
): Promise<GetResourceCandlesQuery> => {
  return typedGraphqlRequest<GetResourceCandlesQuery, GetResourceCandlesQueryVariables>(query, variables);
};

export const getIndexCandles = async (
  query: string,
  variables: GetIndexCandlesQueryVariables
): Promise<GetIndexCandlesQuery> => {
  return typedGraphqlRequest<GetIndexCandlesQuery, GetIndexCandlesQueryVariables>(query, variables);
};

// Legacy API functions
export const foilApi = {
  get: async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
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
    return response.json();
  },
};
