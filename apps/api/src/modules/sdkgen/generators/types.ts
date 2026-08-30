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
  if (!schema) return '';
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  switch (schema.type) {
    case 'integer': return 0;
    case 'number':  return 0.0;
    case 'boolean': return false;
    case 'array':   return [];
    case 'object':  return {};
    case 'string': {
      const fmt = schema.format as string | undefined;
      if (fmt === 'date-time') return new Date(0).toISOString();
      if (fmt === 'date')      return '1970-01-01';
      if (fmt === 'time')      return '00:00:00';
      if (fmt === 'uuid')      return '00000000-0000-0000-0000-000000000000';
      if (fmt === 'email')     return 'user@example.com';
      if (fmt === 'uri' || fmt === 'url') return 'https://example.com';
      if (fmt === 'hostname')  return 'example.com';
      if (fmt === 'ipv4')      return '127.0.0.1';
      if (fmt === 'ipv6')      return '::1';
      if (fmt === 'password')  return '********';
      if (fmt === 'byte' || fmt === 'binary') return '';
      const name = (schema.title ?? schema.name ?? '') as string;
      if (name) return name.toLowerCase().replace(/\s+/g, '_');
      return '';
    }
    default:
      return '';
  }
}

export function parameterExample(parameter: OpenApiParameter): unknown {
  return parameter.example ?? schemaExample(parameter.schema);
}

export function requestProperties(operation: OpenApiOperation): Record<string, Record<string, any>> {
  const schema = operation.requestBody?.content?.['application/json']?.schema;
  return (schema?.properties ?? {}) as Record<string, Record<string, any>>;
}
