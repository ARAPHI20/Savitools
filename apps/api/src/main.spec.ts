import { readFileSync } from 'fs';
import { join } from 'path';

describe('ValidationPipe Configuration', () => {
  it('should have ValidationPipe configured with correct options', () => {
    // This test verifies that the ValidationPipe is configured in main.ts
    // with the required options: whitelist, forbidNonWhitelisted, transform, and transformOptions
    const mainTsPath = join(__dirname, 'main.ts');
    const mainTs = readFileSync(mainTsPath, 'utf8');
    
    expect(mainTs).toContain('whitelist: true');
    expect(mainTs).toContain('forbidNonWhitelisted: true');
    expect(mainTs).toContain('transform: true');
    expect(mainTs).toContain('enableImplicitConversion: true');
    expect(mainTs).toContain('useGlobalPipes');
  });
});
