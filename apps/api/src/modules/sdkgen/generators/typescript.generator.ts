import { CodeGenerator, GeneratorContext, operationsFor, parameterExample, requestProperties, schemaExample, OpenApiOperation } from './types';

function tsLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export class TypeScriptGenerator implements CodeGenerator {
  generate(context: GeneratorContext): string {
    const baseUrl = context.spec.servers?.[0]?.url || 'https://api.example.com';
    let code = `import axios from 'axios';\n\nconst API_KEY = process.env.API_KEY ?? '';\n\n`;
    for (const { path, method, operation } of operationsFor(context)) {
      code += `// ${operation.summary || `${method.toUpperCase()} ${path}`}\n`;
      const params = operation.parameters ?? [];
      const values = new Map(params.map((parameter) => [parameter.name, parameterExample(parameter)]));
      const resolvedPath = path.replace(/\{([^}]+)\}/g, (_, name) => String(values.get(name) ?? `{${name}}`));
      const query = params.filter((parameter) => parameter.in === 'query');
      const queryOptions = query.length ? `, params: { ${query.map((p) => `${JSON.stringify(p.name)}: ${tsLiteral(values.get(p.name))}`).join(', ')} }` : '';
      const options = `{ headers: { Authorization: \`Bearer \${API_KEY}\` }${queryOptions} }`;
      const body = this.body(operation);
      const noBody = method === 'get' || method === 'head' || method === 'delete';
      code += noBody
        ? `const ${method}Response = await axios.${method}(${tsLiteral(`${baseUrl}${resolvedPath}`)}, ${options});\n\n`
        : `const ${method}Response = await axios.${method}(${tsLiteral(`${baseUrl}${resolvedPath}`)}, ${body}, ${options});\n\n`;
    }
    return code.trim();
  }

  private body(operation: OpenApiOperation): string {
    const props = requestProperties(operation);
    return `{ ${Object.entries(props).map(([key, schema]) => `${JSON.stringify(key)}: ${tsLiteral(schemaExample(schema))}`).join(', ')} }`;
  }
}
