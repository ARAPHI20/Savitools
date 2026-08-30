import { CodeGenerator, GeneratorContext, operationsFor, requestProperties, schemaExample } from './types';

export class CurlGenerator implements CodeGenerator {
  generate(context: GeneratorContext): string {
    const baseUrl = context.spec.servers?.[0]?.url || 'https://api.example.com';
    let code = ``;

    for (const { path, method, operation } of operationsFor(context)) {
      const noBody = method === 'get' || method === 'head' || method === 'delete';
      code += `curl -X ${method.toUpperCase()} ${baseUrl}${path} \\\n`;
      code += `  -H "Authorization: Bearer $API_KEY"`;

      if (!noBody) {
        code += ` \\\n  -H "Content-Type: application/json"`;
        const props = requestProperties(operation);
        const entries = Object.entries(props);
        if (entries.length > 0) {
          const pairs = entries
            .map(([key, schema]) => `"${key}": ${JSON.stringify(schemaExample(schema))}`)
            .join(', ');
          code += ` \\\n  -d '{ ${pairs} }'`;
        }
      }

      code += `\n\n`;
    }

    return code.trim();
  }
}

