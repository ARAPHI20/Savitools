import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);
  private readonly rpcServer: rpc.Server;
  private readonly deployer: Keypair;
  private readonly networkPassphrase: string;

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
  }

  async deploy(
    wasmBuffer: Buffer,
    constructorArgs?: unknown[],
  ): Promise<{ contractId: string; wasmHash: string; txHash: string }> {
    if (!wasmBuffer || wasmBuffer.length === 0) {
      throw new BadRequestException('WASM file is empty');
    }

    if (wasmBuffer.length > 1024 * 1024) {
      throw new BadRequestException('WASM file exceeds maximum size of 1MB');
    }

    const scVals: xdr.ScVal[] = (constructorArgs ?? []).map((arg) => nativeToScVal(arg));

    const wasmHashBytes = hash(wasmBuffer);

    this.logger.log(`Uploading WASM (${wasmBuffer.length} bytes)...`);
    await this.uploadWasm(wasmBuffer);

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

  async uploadWasmOnly(wasmBuffer: Buffer): Promise<{ wasmHash: string; size: number }> {
    if (!wasmBuffer || wasmBuffer.length === 0) {
      throw new BadRequestException('WASM file is empty');
    }
    if (wasmBuffer.length > 1024 * 1024) {
      throw new BadRequestException('WASM file exceeds maximum size of 1MB');
    }

    // Check init auth / format basic validation (WASM magic header)
    if (wasmBuffer.length < 4 || wasmBuffer.readUInt32LE(0) !== 0x6d736100) {
      throw new BadRequestException('Invalid WASM format: missing magic header');
    }

    const wasmHashBytes = hash(wasmBuffer);
    await this.uploadWasm(wasmBuffer);
    return {
      wasmHash: wasmHashBytes.toString('hex'),
      size: wasmBuffer.length,
    };
  }

  async deployConfigured(params: {
    wasmBuffer: Buffer;
    admin?: string;
    salt?: string;
    constructorArgs?: unknown[];
  }): Promise<{ contractId: string; wasmHash: string; txHash: string }> {
    const { wasmBuffer, admin, salt: customSalt, constructorArgs } = params;
    if (!wasmBuffer || wasmBuffer.length === 0) {
      throw new BadRequestException('WASM file is empty');
    }

    const scVals: xdr.ScVal[] = (constructorArgs ?? []).map((arg) => nativeToScVal(arg));
    const wasmHashBytes = hash(wasmBuffer);

    await this.uploadWasm(wasmBuffer);

    let saltBuffer: Buffer;
    if (customSalt) {
      try {
        saltBuffer = Buffer.from(customSalt, 'hex');
        if (saltBuffer.length !== 32) {
          saltBuffer = Keypair.random().xdrPublicKey().value();
        }
      } catch {
        saltBuffer = Keypair.random().xdrPublicKey().value();
      }
    } else {
      saltBuffer = Keypair.random().xdrPublicKey().value();
    }

    const creatorAddress = admin && StrKey.isValidEd25519PublicKey(admin) ? new Address(admin) : new Address(this.deployer.publicKey());
    const contractId = this.computeContractIdWithAddress(creatorAddress, saltBuffer);
    const createTxHash = await this.createCustomContractWithAddress(creatorAddress, wasmHashBytes, saltBuffer, scVals);

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

  private computeContractIdWithAddress(address: Address, salt: Buffer): string {
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
    const address = new Address(this.deployer.publicKey());
    return this.createCustomContractWithAddress(address, wasmHash, salt, constructorArgs);
  }

  private async createCustomContractWithAddress(
    address: Address,
    wasmHash: Buffer,
    salt: Buffer,
    constructorArgs: xdr.ScVal[],
  ): Promise<string> {
    const account = await this.rpcServer.getAccount(this.deployer.publicKey());

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
    const allowedContracts = this.parseAllowlist('CONTRACT_INVOKE_ALLOWED_CONTRACTS');
    if (!allowedContracts.includes(contractId)) {
      throw new ForbiddenException(`Contract ${contractId} is not allowlisted for invocation`);
    }

    const allowedFunctions = this.parseAllowlist('CONTRACT_INVOKE_ALLOWED_FUNCTIONS');
    if (!allowedFunctions.includes(functionName)) {
      throw new ForbiddenException(`Function ${functionName} is not allowlisted for invocation`);
    }
  }

  private parseAllowlist(configKey: string): string[] {
    const raw = this.configService.get<string>(configKey, '');
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
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
    } catch {
      throw new NotFoundException(`Contract ${contractId} not found on network ${network}`);
    }
  }
}
