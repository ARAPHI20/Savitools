import { GoGenerator } from './generators/go.generator';
import { PythonGenerator } from './generators/python.generator';
import { TypeScriptGenerator } from './generators/typescript.generator';
import { SdkgenService } from './sdkgen.service';

jest.mock('fs');
const fs = require('fs');

describe('SDK generators', () => {
  const spec = {
    servers: [{ url: 'https://api.example.com' }],
    paths: {
      '/items/{id}': {
        get: { summary: 'Read', parameters: [{ name: 'id', in: 'path', example: 'a"b' }] },
        post: { summary: 'Create', requestBody: { content: { 'application/json': { schema: { properties: { note: { type: 'string', example: "a'b\\c" } } } } } } },
        patch: { summary: 'Patch' },
        delete: { summary: 'Delete' },
      },
    },
  } as any;

  it.each([
    ['TypeScript', new TypeScriptGenerator(), 'API_KEY', 'a\'b'],
    ['Python', new PythonGenerator(), 'API_KEY', 'a\\\'b'],
    ['Go', new GoGenerator(), 'os.Getenv("API_KEY")', 'a\'b'],
  ])('generates escaped %s source for every operation', (_name, generator, credential, escaped) => {
    const output = generator.generate({ spec });
    expect(output).toContain(credential);
    const methods = generator instanceof TypeScriptGenerator
      ? ['axios.get', 'axios.post', 'axios.patch', 'axios.delete']
      : generator instanceof PythonGenerator
        ? ['requests.get', 'requests.post', 'requests.patch', 'requests.delete']
        : ['http.NewRequest("GET"', 'http.NewRequest("POST"', 'http.NewRequest("PATCH"', 'http.NewRequest("DELETE"'];
    for (const method of methods) expect(output).toContain(method);
    expect(output).toContain(escaped);
  });
});

describe('SdkgenService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.readFileSync.mockReturnValue(JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: { '/test': { get: { summary: 'Test endpoint', responses: { '200': { description: 'OK' } } } } },
    }));
  });

  it.each(['typescript', 'python', 'go', 'curl', 'javascript'])('generates %s code', (language) => {
    const service = new SdkgenService();
    expect(service.generate({ spec: 'fluxa', language, endpoint: '/test' })).toEqual(expect.any(String));
  });

  it('throws for unknown spec and unsupported language', () => {
    const service = new SdkgenService();
    expect(() => service.generate({ spec: 'unknown' as any, language: 'typescript', endpoint: '/test' })).toThrow('Spec unknown not found');
    expect(() => service.generate({ spec: 'fluxa', language: 'rust', endpoint: '/test' })).toThrow('Language rust is not supported');
  });
});
