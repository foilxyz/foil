#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import * as tools from './tools';
import { z } from 'zod';

interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  function: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

// Create an MCP server
const server = new McpServer({
  name: "sapience-mcp-server",
  version: "1.0.0",
  description: `Context Information:
* Use the 'get_size_for_create_trader_position' tool to get the ideal size for a new trader position based on a desired collateral amount and prediction/answer.
* When sharing calldata generated by a tool, also present the user with instructions for how to stage/sign it with a multisig or wallet.
* While the codebase may reference 'epochs', users should refer to these as 'periods' in their queries. These terms are interchangeable in this context.
* Not all markets involved ETH and gas. vETH is the quote token and vGas is the base token.
* Some markets may resolve a question with a yes (represented as 1e18 vGas) or a no (0 vGas).
* Some markets may resolve a question with an arbitrary number of base tokens (average or cumulative) representing something unrelated to gas.`,
  model: {
    provider: "ollama",
    model: process.env.OLLAMA_MODEL || "mistral",
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    systemPrompt: `You are a helpful assistant with access to the following tools:
${Object.entries(tools).map(([moduleName, moduleTools]) => 
  Object.entries(moduleTools as Record<string, ToolDefinition>)
    .map(([toolName, tool]) => `${toolName}: ${tool.description}`)
    .join('\n')
).join('\n')}`
  }
});

// Debug log the available tools
console.error('Available tools:', Object.keys(tools));

// Register tools from each module
for (const [moduleName, moduleTools] of Object.entries(tools)) {
  console.error(`Processing module: ${moduleName}`);
  
  if (typeof moduleTools === 'object' && moduleTools !== null) {
    const toolsObj = moduleTools as unknown as Record<string, ToolDefinition>;
    console.error(`Tools in module ${moduleName}:`, Object.keys(toolsObj));

    for (const [toolName, tool] of Object.entries(toolsObj)) {
      try {
        // Format the tool name to be more descriptive
        const formattedToolName = toolName;

        console.error(`Registering tool: ${formattedToolName}`);
        
        if (!tool.parameters || !tool.parameters.properties) {
          console.error(`Tool ${formattedToolName} is missing required parameters structure`);
          continue;
        }

        // Create a Zod schema from the tool's parameter definition
        const paramsSchema = z.object(
          Object.fromEntries(
            Object.entries(tool.parameters.properties).map(([key, prop]) => [
              key,
              z.string()
            ])
          )
        ).required(
          Object.fromEntries(
            tool.parameters.required.map(key => [key, true])
          )
        );
        
        // Register tool with MCP server
        server.tool(
          formattedToolName,
          paramsSchema.shape,
          async (args) => {
            try {
              const result = await tool.function(args);
              return result;
            } catch (error) {
              console.error(`Error in tool ${formattedToolName}:`, error);
              return {
                content: [{ 
                  type: "text" as const,
                  text: error instanceof Error ? error.message : 'Unknown error occurred'
                }],
                isError: true
              };
            }
          }
        );
      } catch (error) {
        console.error(`Error registering tool ${moduleName}_${toolName}:`, error);
      }
    }
  }
}

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport); 