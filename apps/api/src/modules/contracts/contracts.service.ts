import { Injectable, BadRequestException, UnprocessableEntityException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
  rpc,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  Networks,
  Operation,
  nativeToScVal,
  scValToNative,
  hash,
  Address,
  StrKey,
  xdr,
} from '@stellar/stellar-sdk';

export interface WasmMetadata {
  wasmId: string;
  contentHash: string;
  filename: string;
  size: number;
  sha256: string;
  uploadedAt: string;
  source: 'file' | 'git' | 'url';
}

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);
  private readonly rpcServer: rpc.Server;
  private readonly deployer: Keypair;
  private readonly networkPassphrase: string;
  private readonly wasmStore = new Map<string, { buffer: Buffer; metadata: WasmMetadata }>();
  private readonly maxFileSize: number;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl = this.configService.getOrThrow<string>('STELLAR_RPC_URL');
    const network = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
    
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production' || 
                         network.toLowerCase() === 'mainnet' || 
                         network.toLowerCase() === 'public';

    if (isProduction && rpcUrl.startsWith('http://')) {
      throw new Error('Plaintext RPC (http) is not allowed for production signing');
    }

    this.rpcServer = new rpc.Server(rpcUrl, { allowHttp: !isProduction });

    const secretKey = this.configService.getOrThrow<string>('DEPLOYER_SECRET_KEY');
    this.deployer = Keypair.fromSecret(secretKey);

    this.networkPassphrase =
      this.configService.get<string>('STELLAR_NETWORK_PASSPHRASE') ||
      (network.toLowerCase() === 'mainnet' || network.toLowerCase() === 'public'
        ? Networks.PUBLIC
        : Networks.TESTNET);

    const configuredLimit = this.configService.get<string>('MAX_WASM_FILE_SIZE');
    this.maxFileSize = configuredLimit ? parseInt(configuredLimit, 10) : 5 * 1024 * 1024; // default 5MB
  }

  async storeUploadedWasm(params: {
    wasmBuffer: Buffer;
    filename: string;
    checksum?: string;
    source?: 'file' | 'git' | 'url';
  }): Promise<WasmMetadata> {
    const { wasmBuffer, filename, checksum, source = 'file' } = params;

    if (!wasmBuffer || wasmBuffer.length === 0) {
      throw new BadRequestException('WASM file is empty');
    }

    if (wasmBuffer.length > this.maxFileSize) {
      throw new BadRequestException(`WASM file exceeds maximum size of ${this.maxFileSize / (1024 * 1024)}MB`);
    }

    const calculatedSha256 = crypto.createHash('sha256').update(wasmBuffer).digest('hex');

    if (checksum) {
      if (checksum.toLowerCase() !== calculatedSha256.toLowerCase()) {
        throw new UnprocessableEntityException(
          `Checksum verification failed: expected ${checksum}, got ${calculatedSha256}`
        );
      }
    }

    const contentHash = hash(wasmBuffer).toString('hex');
    const wasmId = `wasm_${contentHash.substring(0, 16)}`;

    // Deduplicate: if contentHash already exists, return existing metadata
    if (this.wasmStore.has(contentHash)) {
      return this.wasmStore.get(contentHash)!.metadata;
    }

    const metadata: WasmMetadata = {
      wasmId,
      contentHash,
      filename,
      size: wasmBuffer.length,
      sha256: calculatedSha256,
      uploadedAt: new Date().toISOString(),
      source,
    };

    this.wasmStore.set(contentHash, { buffer: wasmBuffer, metadata });
    this.logger.log(`Stored WASM ${wasmId} (${metadata.size} bytes, sha256: ${calculatedSha256})`);

    return metadata;
  }

  async fetchWasmFromGit(gitRepoUrl: string, artifactPath: string): Promise<Buffer> {
    // Validate gitRepoUrl against basic SSRF or safe protocols
    if (!gitRepoUrl.startsWith('https://') && !gitRepoUrl.startsWith('git://') && !gitRepoUrl.startsWith('git@')) {
      throw new BadRequestException('Invalid Git repository URL protocol');
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'savitools-git-'));
    try {
      this.logger.log(`Cloning read-only Git repo ${gitRepoUrl} into ${tempDir}...`);
      execSync(`git clone --depth 1 --no-checkout ${JSON.stringify(gitRepoUrl)} .`, {
        cwd: tempDir,
        timeout: 30000,
        stdio: 'ignore',
      });

      // Sparse checkout artifact path
      execSync(`git sparse-checkout init --cone`, { cwd: tempDir, stdio: 'ignore' });
      execSync(`git sparse-checkout set ${JSON.stringify(artifactPath)}`, { cwd: tempDir, stdio: 'ignore' });
      execSync(`git checkout`, { cwd: tempDir, stdio: 'ignore' });

      const fullArtifactPath = path.join(tempDir, artifactPath);
      if (!fs.existsSync(fullArtifactPath)) {
        throw new NotFoundException(`WASM artifact not found at path ${artifactPath} in repository`);
      }

      return fs.readFileSync(fullArtifactPath);
    } catch (err: any) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Failed to fetch WASM from Git repository: ${err.message}`);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  async deploy(
    wasmBuffer: Buffer,
    constructorArgs?: unknown[],
  ): Promise<{ contractId: string; wasmHash: string; txHash: string }> {
    if (!wasmBuffer || wasmBuffer.length === 0) {
      throw new BadRequestException('WASM file is empty');
    }

    if (wasmBuffer.length > this.maxFileSize) {
      throw new BadRequestException(`WASM file exceeds maximum size of ${this.maxFileSize / (1024 * 1024)}MB`);
    }

    const scVals: xdr.ScVal[] = (constructorArgs ?? []).map((arg) => nativeToScVal(arg));

    const wasmHashBytes = hash(wasmBuffer);

    this.logger.log(`Uploading WASM (${wasmBuffer.length} bytes)...`);
    const uploadTxHash = await this.uploadWasm(wasmBuffer);

    this.logger.log(`Creating contract from WASM hash ${wasmHashBytes.toString('hex')}...`);
    const salt = Keypair.random().xdrPublicKey().value();
    const contractId = this.computeContractId(salt);
    const createTxHash = await this.createContract(wasmHashBytes, salt, scVals);

    return {
      contractId,
      wasmHash: wasmHashBytes.toString('hex'),
      txHash: createTxHash,
    };
  }

  private async uploadWasm(wasmBuffer: Buffer): Promise<string> {
    const account = await this.rpcServer.getAccount(this.deployer.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(Operation.uploadContractWasm({ wasm: wasmBuffer }))
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(tx);
    prepared.sign(this.deployer);

    const sendResult = await this.rpcServer.sendTransaction(prepared);
    const result = await this.rpcServer.pollTransaction(sendResult.hash, {
      attempts: 30,
    });

    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new BadRequestException(
        `WASM upload failed: ${result.status === rpc.Api.GetTransactionStatus.FAILED ? 'Transaction failed on ledger' : 'Transaction not found after polling'}`,
      );
    }

    return sendResult.hash;
  }

  private computeContractId(salt: Buffer): string {
    const address = new Address(this.deployer.publicKey());
    const preimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
      new xdr.ContractIdPreimageFromAddress({
        address: address.toScAddress(),
        salt: salt,
      }),
    );
    const preimageHash = hash(preimage.toXDR());
    return StrKey.encodeContract(preimageHash);
  }

  private async createContract(
    wasmHash: Buffer,
    salt: Buffer,
    constructorArgs: xdr.ScVal[],
  ): Promise<string> {
    const account = await this.rpcServer.getAccount(this.deployer.publicKey());
    const address = new Address(this.deployer.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.createCustomContract({
          address,
          wasmHash,
          salt,
          constructorArgs,
        }),
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(tx);
    prepared.sign(this.deployer);

    const sendResult = await this.rpcServer.sendTransaction(prepared);
    const result = await this.rpcServer.pollTransaction(sendResult.hash, {
      attempts: 30,
    });

    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new BadRequestException(
        `Contract creation failed: ${result.status === rpc.Api.GetTransactionStatus.FAILED ? 'Transaction failed on ledger' : 'Transaction not found after polling'}`,
      );
    }

    return sendResult.hash;
  }

  async invoke(
    contractId: string,
    functionName: string,
    args: unknown[],
  ): Promise<{ result: unknown; txHash: string }> {
    if (!StrKey.isValidContract(contractId)) {
      throw new BadRequestException('Invalid contract ID format');
    }

    this.assertInvocationAllowed(contractId, functionName);

    const scVals: xdr.ScVal[] = args.map((arg) => nativeToScVal(arg));
    const account = await this.rpcServer.getAccount(this.deployer.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          function: functionName,
          args: scVals,
        }),
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(tx);
    prepared.sign(this.deployer);

    const sendResult = await this.rpcServer.sendTransaction(prepared);
    const result = await this.rpcServer.pollTransaction(sendResult.hash, {
      attempts: 30,
    });

    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new BadRequestException(
        `Invocation failed: ${result.status === rpc.Api.GetTransactionStatus.FAILED ? 'Transaction failed on ledger' : 'Transaction not found after polling'}`,
      );
    }

    const returnValue = result.returnValue ? scValToNative(result.returnValue) : null;

    return {
      result: returnValue,
      txHash: sendResult.hash,
    };
  }

  private assertInvocationAllowed(contractId: string, functionName: string): void {
    const allowedContracts = this.configService.get<string>('CONTRACT_INVOKE_ALLOWED_CONTRACTS');
    const allowedFunctions = this.configService.get<string>('CONTRACT_INVOKE_ALLOWED_FUNCTIONS');

    if (!allowedContracts || !allowedFunctions) {
      throw new ForbiddenException('Contract invocations are not permitted (allowlist not configured)');
    }

    const contractsList = allowedContracts.split(',').map((c) => c.trim());
    const functionsList = allowedFunctions.split(',').map((f) => f.trim());

    if (!contractsList.includes(contractId) || !functionsList.includes(functionName)) {
      throw new ForbiddenException('Contract or function is not allowlisted for invocation');
    }
  }

  async getInfo(contractId: string): Promise<{ contractId: string; network: string; wasmHash?: string }> {
    if (!StrKey.isValidContract(contractId)) {
      throw new BadRequestException('Invalid contract ID format');
    }

    const network = this.configService.get<string>('STELLAR_NETWORK', 'testnet');

    try {
      const wasm = await this.rpcServer.getContractWasmByContractId(contractId);
      const wasmHash = wasm ? hash(wasm).toString('hex') : undefined;

      return {
        contractId,
        network,
        wasmHash,
      };
    } catch (err) {
      throw new NotFoundException(`Contract ${contractId} not found on network ${network}`);
    }
  }
}
