export interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: Record<string, any>;
  example?: unknown;
}

export interface OpenApiOperation {
  summary?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, { schema?: Record<string, any>; example?: unknown }>;
  };
}

export interface OpenApiSpec {
  servers?: { url: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
}

export interface GeneratorContext {
  spec: OpenApiSpec;
  endpoint?: string;
}

export interface CodeGenerator {
  generate(context: GeneratorContext): string;
}

export const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

export function operationsFor(context: GeneratorContext): Array<{ path: string; method: string; operation: OpenApiOperation }> {
  const paths = context.endpoint ? { [context.endpoint]: context.spec.paths[context.endpoint] } : context.spec.paths;
  const operations: Array<{ path: string; method: string; operation: OpenApiOperation }> = [];
  for (const [path, pathItem] of Object.entries(paths || {})) {
    if (!pathItem) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (HTTP_METHODS.has(method) && operation) operations.push({ path, method, operation });
    }
  }
  return operations;
}

export function schemaExample(schema: Record<string, any> | undefined): unknown {
  if (!schema) return 'TODO';
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === 'number' || schema.type === 'integer') return 0;
  if (schema.type === 'boolean') return false;
  return 'TODO';
}

export function parameterExample(parameter: OpenApiParameter): unknown {
  return parameter.example ?? schemaExample(parameter.schema);
}

export function requestProperties(operation: OpenApiOperation): Record<string, Record<string, any>> {
  const schema = operation.requestBody?.content?.['application/json']?.schema;
  return (schema?.properties ?? {}) as Record<string, Record<string, any>>;
}
