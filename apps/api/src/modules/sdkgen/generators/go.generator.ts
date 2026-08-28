import { CodeGenerator, GeneratorContext, operationsFor, requestProperties, schemaExample, OpenApiOperation } from './types';

function goString(value: unknown): string {
  return JSON.stringify(String(value)).replace(/\\u2028|\\u2029/g, '');
}

export class GoGenerator implements CodeGenerator {
  generate(context: GeneratorContext): string {
    const baseUrl = context.spec.servers?.[0]?.url || 'https://api.example.com';
    let code = `package main\n\nimport (\n\t"bytes"\n\t"fmt"\n\t"net/http"\n\t"os"\n)\n\nfunc main() {\n\tapiKey := os.Getenv("API_KEY")\n\tclient := &http.Client{}\n`;
    for (const { path, method, operation } of operationsFor(context)) {
      const payload = this.body(operation);
      code += `\t// ${operation.summary || `${method.toUpperCase()} ${path}`}\n`;
      code += `\turl := ${goString(`${baseUrl}${path}`)}\n`;
      code += `\treq, err := http.NewRequest(${goString(method.toUpperCase())}, url, bytes.NewBufferString(${goString(payload)}))\n`;
      code += `\tif err != nil { panic(err) }\n\treq.Header.Set("Authorization", "Bearer "+apiKey)\n\treq.Header.Set("Content-Type", "application/json")\n`;
      code += `\tresp, err := client.Do(req)\n\tif err != nil { panic(err) }\n\tresp.Body.Close()\n\tfmt.Println(resp.Status)\n`;
    }
    code += `}\n`;
    return code.trim();
  }

  private body(operation: OpenApiOperation): string {
    const props = requestProperties(operation);
    return `{${Object.entries(props).map(([key, schema]) => `${JSON.stringify(key)}:${JSON.stringify(schemaExample(schema))}`).join(',')}}`;
  }
}
