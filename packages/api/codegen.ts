import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./schema.graphql",
  generates: {
    // Generate types for the UI package (client)
    "../ui/types/graphql.ts": {
      plugins: ["typescript", "typescript-operations"],
      config: {
        avoidOptionals: false,
        dedupeFragments: true,
        enumsAsTypes: true,
        exportFragmentSpreadSubTypes: true,
        skipTypename: false,
      },
    }
  },
};

export default config; 