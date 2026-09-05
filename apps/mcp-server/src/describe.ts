/**
 * Self-describing payload for GET /mcp/description.
 * An AI agent pointed at this endpoint can work out how to connect to the
 * MCP server on its own: endpoints, auth, tools, resources, and copy-paste
 * connection snippets.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

/**
 * Minimal zod → JSON Schema for the flat object schemas used in tools.ts.
 * Covers ZodObject (with nested ZodOptional), ZodString, ZodNumber, ZodBoolean.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap() as z.ZodTypeAny)
  }
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries(schema.shape)) {
      const field = value as z.ZodTypeAny
      properties[key] = zodToJsonSchema(field)
      if (!field.isOptional()) required.push(key)
    }
    return { type: 'object', properties, required }
  }
  if (schema instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: 'string' }
    if (schema.description) out.description = schema.description
    return out
  }
  if (schema instanceof z.ZodNumber) {
    const out: Record<string, unknown> = { type: 'number' }
    if (schema.description) out.description = schema.description
    return out
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' }
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options }
  }
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema(schema.element as z.ZodTypeAny) }
  }
  return { type: 'unknown' }
}

// The McpServer keeps registries private; read them through a narrow adapter.
interface ToolRegistryEntry {
  title?: string
  description?: string
  inputSchema?: z.ZodTypeAny
}

interface ResourceTemplateEntry {
  title?: string
  resourceTemplate?: { uriTemplate?: { toString(): string } }
}

interface FixedResourceEntry {
  title?: string
  uri?: string
}

export function buildDescription(server: McpServer, baseUrl: string): Record<string, unknown> {
  const internal = server as unknown as {
    _registeredTools?: Record<string, ToolRegistryEntry>
    // Templated resources are keyed by name; fixed-URI ones by the URI itself
    _registeredResourceTemplates?: Record<string, ResourceTemplateEntry>
    _registeredResources?: Record<string, FixedResourceEntry>
  }

  const tools = Object.entries(internal._registeredTools ?? {}).map(([name, tool]) => ({
    name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema ? zodToJsonSchema(tool.inputSchema) : { type: 'object' },
  }))

  const resources = [
    ...Object.entries(internal._registeredResourceTemplates ?? {}).map(([name, r]) => ({
      name,
      title: r.title,
      uri: r.resourceTemplate?.uriTemplate?.toString() ?? '',
    })),
    ...Object.values(internal._registeredResources ?? {}).map((r) => ({
      name: r.uri,
      title: r.title,
      uri: r.uri ?? '',
    })),
  ]

  return {
    service: 'citadelMD MCP server',
    version: '1.0.0',
    description:
      'MCP server for citadelMD (self-hosted collaborative Markdown/Excalidraw editor). Lets AI agents list, read, search, create, update, and commit documents with git history.',
    transport: 'streamable-http',
    endpoints: {
      mcp: `${baseUrl}/mcp`,
      health: `${baseUrl}/health`,
      description: `${baseUrl}/mcp/description`,
    },
    auth: {
      header: 'Authorization',
      scheme: 'Bearer',
      value: 'Bearer <API_KEY>',
      where_to_get_key:
        'API keys are per-user in citadelMD. An admin reveals one by regenerating it: ' +
        'PATCH /api/users/{userId} with body {"regenerateApiKey": true} — the key is shown once in the response.',
      note: 'All operations run with the permissions of the user owning the key.',
    },
    tools,
    resources,
    connect: {
      claude_code_command:
        `claude mcp add --transport http citadelMD ${baseUrl}/mcp ` +
        `--header "Authorization: Bearer <API_KEY>"`,
      mcp_json: {
        mcpServers: {
          citadelMD: {
            type: 'http',
            url: `${baseUrl}/mcp`,
            headers: { Authorization: 'Bearer <API_KEY>' },
          },
        },
      },
      curl_smoke_test: `curl -X POST ${baseUrl}/mcp -H 'Content-Type: application/json' ` +
        `-H 'Accept: application/json, text/event-stream' -H 'Authorization: Bearer <API_KEY>' ` +
        `-d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'`,
    },
  }
}
