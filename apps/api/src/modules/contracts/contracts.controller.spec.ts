import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContractAuthorizationGuard } from './guards/contract-authorization.guard';

const JWT_SECRET = 'test-secret';
const ALLOWED_EMAIL = 'admin@example.com';
const OTHER_EMAIL = 'nobody@example.com';

describe('ContractsController', () => {
  let app: NestFastifyApplication;
  let jwtService: JwtService;
  let contractsService: jest.Mocked<Pick<ContractsService, 'deploy' | 'invoke' | 'getInfo' | 'storeUploadedWasm' | 'fetchWasmFromGit'>>;

  beforeAll(async () => {
    contractsService = {
      deploy: jest.fn().mockResolvedValue({ contractId: 'C123', wasmHash: 'abc', txHash: 'tx' }),
      invoke: jest.fn().mockResolvedValue({ result: null, txHash: 'tx' }),
      getInfo: jest.fn(),
      storeUploadedWasm: jest.fn().mockResolvedValue({
        wasmId: 'wasm_123',
        contentHash: 'abc',
        filename: 'contract.wasm',
        size: 10,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        uploadedAt: new Date().toISOString(),
        source: 'file',
      }),
      fetchWasmFromGit: jest.fn().mockResolvedValue(Buffer.from('wasm-bytes')),
    };

    const configValues: Record<string, string> = {
      JWT_SECRET,
      CONTRACT_ADMIN_EMAILS: ALLOWED_EMAIL,
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: JWT_SECRET,
        }),
      ],
      controllers: [ContractsController],
      providers: [
        { provide: ContractsService, useValue: contractsService },
        JwtAuthGuard,
        ContractAuthorizationGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => configValues[key] ?? defaultValue),
            getOrThrow: jest.fn((key: string) => {
              if (configValues[key] === undefined) throw new Error(`Missing config: ${key}`);
              return configValues[key];
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    jwtService = moduleRef.get(JwtService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const tokenFor = (email: string) =>
    jwtService.sign({ sub: 'user-1', email }, { secret: JWT_SECRET });

  describe('POST /contracts/deploy', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'POST',
        url: '/contracts/deploy',
      });

      expect(response.statusCode).toBe(401);
      expect(contractsService.deploy).not.toHaveBeenCalled();
    });

    it('rejects authenticated but unauthorized requests with 403', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'POST',
        url: '/contracts/deploy',
        headers: { authorization: `Bearer ${tokenFor(OTHER_EMAIL)}` },
      });

      expect(response.statusCode).toBe(403);
      expect(contractsService.deploy).not.toHaveBeenCalled();
    });
  });

  describe('POST /contracts/wasm/upload', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'POST',
        url: '/contracts/wasm/upload',
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects authenticated but unauthorized requests with 403', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'POST',
        url: '/contracts/wasm/upload',
        headers: { authorization: `Bearer ${tokenFor(OTHER_EMAIL)}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('allows an authorized user to upload WASM', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'POST',
        url: '/contracts/wasm/upload',
        headers: { authorization: `Bearer ${tokenFor(ALLOWED_EMAIL)}` },
        payload: {
          gitRepoUrl: 'https://github.com/example/repo.git',
          gitArtifactPath: 'contract.wasm',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(contractsService.fetchWasmFromGit).toHaveBeenCalled();
      expect(contractsService.storeUploadedWasm).toHaveBeenCalled();
    });
  });

  describe('POST /contracts/:contractId/invoke', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'POST',
        url: '/contracts/C123/invoke',
        payload: { functionName: 'transfer', args: [] },
      });

      expect(response.statusCode).toBe(401);
      expect(contractsService.invoke).not.toHaveBeenCalled();
    });

    it('rejects authenticated but unauthorized requests with 403', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'POST',
        url: '/contracts/C123/invoke',
        headers: { authorization: `Bearer ${tokenFor(OTHER_EMAIL)}` },
        payload: { functionName: 'transfer', args: [] },
      });

      expect(response.statusCode).toBe(403);
      expect(contractsService.invoke).not.toHaveBeenCalled();
    });

    it('allows an authorized user through to the service', async () => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'POST',
        url: '/contracts/C123/invoke',
        headers: { authorization: `Bearer ${tokenFor(ALLOWED_EMAIL)}` },
        payload: { functionName: 'transfer', args: [] },
      });

      expect(response.statusCode).toBe(201);
      expect(contractsService.invoke).toHaveBeenCalledWith('C123', 'transfer', []);
    });
  });
});
