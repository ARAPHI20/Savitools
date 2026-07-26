import { SdkgenService } from './sdkgen.service';

jest.mock('fs');
const fs = require('fs');

describe('SdkgenService', () => {
  let service: SdkgenService;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockSpec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            operationId: 'getTest',
            summary: 'Test endpoint',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    fs.readFileSync.mockReturnValue(JSON.stringify(mockSpec));

    service = new SdkgenService();
  });

  describe('generate', () => {
    it('generates TypeScript code for a valid spec and language', () => {
      const result = service.generate({
        spec: 'fluxa',
        language: 'typescript',
        endpoint: '/test',
      });

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('generates Python code', () => {
      const result = service.generate({
        spec: 'fluxa',
        language: 'python',
        endpoint: '/test',
      });

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('generates Go code', () => {
      const result = service.generate({
        spec: 'fluxa',
        language: 'go',
        endpoint: '/test',
      });

      expect(typeof result).toBe('string');
    });

    it('generates cURL code', () => {
      const result = service.generate({
        spec: 'fluxa',
        language: 'curl',
        endpoint: '/test',
      });

      expect(typeof result).toBe('string');
    });

    it('accepts javascript as alias for typescript', () => {
      const result = service.generate({
        spec: 'fluxa',
        language: 'javascript',
        endpoint: '/test',
      });

      expect(typeof result).toBe('string');
    });

    it('throws for unknown spec', () => {
      expect(() =>
        service.generate({ spec: 'unknown' as any, language: 'typescript', endpoint: '/test' }),
      ).toThrow('Spec unknown not found');
    });

    it('throws for unsupported language', () => {
      expect(() =>
        service.generate({ spec: 'fluxa', language: 'rust', endpoint: '/test' }),
      ).toThrow('Language rust is not supported');
    });
  });
});
