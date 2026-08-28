import { CodeGenerator, GeneratorContext, operationsFor, parameterExample, requestProperties, schemaExample, OpenApiOperation } from './types';

function pyLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class PythonGenerator implements CodeGenerator {
  generate(context: GeneratorContext): string {
    const baseUrl = context.spec.servers?.[0]?.url || 'https://api.example.com';
    let code = `import os\nimport requests\n\nAPI_KEY = os.environ.get("API_KEY", "")\nheaders = {"Authorization": f"Bearer {API_KEY}"}\n\n`;
    for (const { path, method, operation } of operationsFor(context)) {
      const values = new Map((operation.parameters ?? []).map((parameter) => [parameter.name, parameterExample(parameter)]));
      const resolvedPath = path.replace(/\{([^}]+)\}/g, (_, name) => String(values.get(name) ?? `{${name}}`));
      const query = (operation.parameters ?? []).filter((parameter) => parameter.in === 'query');
      const queryText = query.length ? `, params={${query.map((p) => `${pyLiteral(p.name)}: ${pyLiteral(values.get(p.name))}`).join(', ')}}` : '';
      const bodyText = method === 'get' || method === 'head' || method === 'delete' ? '' : `, json=${this.body(operation)}`;
      code += `# ${operation.summary || `${method.toUpperCase()} ${path}`}\n`;
      code += `response = requests.${method}(${pyLiteral(`${baseUrl}${resolvedPath}`)}, headers=headers${queryText}${bodyText})\nprint(response.json())\n\n`;
    }
    return code.trim();
  }

  private body(operation: OpenApiOperation): string {
    return `{${Object.entries(requestProperties(operation)).map(([key, schema]) => `${pyLiteral(key)}: ${pyLiteral(schemaExample(schema))}`).join(', ')}}`;
  }
}
