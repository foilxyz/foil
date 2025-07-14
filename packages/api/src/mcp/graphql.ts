import { graphql, GraphQLSchema, printSchema } from 'graphql';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';
import { parse } from 'graphql/language';
import { SharedSchema } from '../graphql/sharedSchema';

let schema: GraphQLSchema;

async function initializeSchema() {
  if (!schema) {
    const sharedSchema = SharedSchema.getInstance();
    schema = sharedSchema.schema!;
  }
}

// Initialize schema when the module loads
initializeSchema();

/**
 * Get the GraphQL schema as SDL string
 */
async function getGraphQLSchemaSDL(): Promise<string> {
  if (!schema) {
    await initializeSchema();
    if (!schema) {
      throw new Error('GraphQL schema is not initialized.');
    }
  }
  return printSchema(schema);
}

/**
 * Execute a GraphQL query directly against the schema
 */
async function executeGraphQLQuery(
  query: string,
  variables?: string
): Promise<CallToolResult> {
  try {
    // Basic query validation
    parse(query);
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Invalid GraphQL query syntax: ${error}`,
        },
      ],
    };
  }

  try {
    if (!schema) {
      await initializeSchema();
      if (!schema) {
        throw new Error('GraphQL schema is not initialized.');
      }
    }

    // Parse variables if provided
    let parsedVariables: Record<string, unknown> | undefined;
    if (variables) {
      try {
        parsedVariables = JSON.parse(variables);
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Invalid variables JSON: ${error}`,
            },
          ],
        };
      }
    }

    // Execute the query directly using the graphql execution engine
    const result = await graphql({
      schema,
      source: query,
      variableValues: parsedVariables,
    });

    if (result.errors && result.errors.length > 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `GraphQL execution errors: ${JSON.stringify(result.errors, null, 2)}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              data: result.data,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to execute GraphQL query: ${error}`,
        },
      ],
    };
  }
}

// MCP Tools
export const introspectSchema = {
  name: 'introspect_sapience_schema',
  description:
    'Introspect the Sapience GraphQL schema to get all available queries, types, and fields',
  parameters: {
    properties: {
      __ignore__: z
        .boolean()
        .default(false)
        .describe(
          'This parameter is ignored - used for clients that cannot handle empty parameters'
        )
        .optional(),
    },
  },
  function: async (): Promise<CallToolResult> => {
    try {
      const schemaSDL = await getGraphQLSchemaSDL();
      return {
        content: [
          {
            type: 'text',
            text: schemaSDL,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to introspect schema: ${error}`,
          },
        ],
      };
    }
  },
};

export const queryGraphQL = {
  name: 'query_sapience_graphql',
  description:
    'Execute a GraphQL query against the Sapience API. Use introspect_sapience_schema first to see available queries.',
  parameters: {
    properties: {
      query: z.string().describe('The GraphQL query to execute'),
      variables: z
        .string()
        .describe('Optional JSON string of variables for the query')
        .optional(),
    },
  },
  function: async ({
    query,
    variables,
  }: {
    query: string;
    variables?: string;
  }): Promise<CallToolResult> => {
    return executeGraphQLQuery(query, variables);
  },
};
