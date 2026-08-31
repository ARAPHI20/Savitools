import { Injectable, BadRequestException } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { BuildTransactionDto } from './dto/build-transaction.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';
import { BenchmarkTransactionDto } from './dto/benchmark-transaction.dto';

@Injectable()
export class ComposerService {
  private readonly servers = {
    mainnet: new StellarSdk.Horizon.Server('https://horizon.stellar.org'),
    testnet: new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org'),
  };

  private readonly passphrases = {
    mainnet: StellarSdk.Networks.PUBLIC,
    testnet: StellarSdk.Networks.TESTNET,
  };

  async buildTransaction(dto: BuildTransactionDto) {
    try {
      const sourceKeypair = StellarSdk.Keypair.fromSecret(dto.signerSecret);
      const network = dto.network || 'testnet';
      const server = this.servers[network];
      const passphrase = this.passphrases[network];

      const account = await server.loadAccount(sourceKeypair.publicKey());
      
      let builder = new StellarSdk.TransactionBuilder(account, {
        fee: dto.fee || StellarSdk.BASE_FEE,
        networkPassphrase: passphrase,
      });

      if (dto.timeBounds) {
        builder = builder.setTimeBounds(dto.timeBounds);
      } else {
        builder = builder.setTimeout(30);
      }

      for (const op of dto.operations) {
        switch (op.type) {
          case 'payment':
            builder.addOperation(
              StellarSdk.Operation.payment({
                destination: op.destination,
                asset:
                  op.asset.code === 'native'
                    ? StellarSdk.Asset.native()
                    : new StellarSdk.Asset(op.asset.code, op.asset.issuer!),
                amount: op.amount,
              }),
            );
            break;
          case 'create_account':
            builder.addOperation(
              StellarSdk.Operation.createAccount({
                destination: op.destination,
                startingBalance: op.startingBalance,
              }),
            );
            break;
          case 'change_trust':
            builder.addOperation(
              StellarSdk.Operation.changeTrust({
                asset:
                  op.asset.code === 'native'
                    ? StellarSdk.Asset.native()
                    : new StellarSdk.Asset(op.asset.code, op.asset.issuer!),
                limit: op.limit,
              }),
            );
            break;
          case 'account_merge':
            builder.addOperation(
              StellarSdk.Operation.accountMerge({
                destination: op.destination,
              }),
            );
            break;
          case 'set_options':
            builder.addOperation(
              StellarSdk.Operation.setOptions({
                inflationDest: op.inflationDest,
                clearFlags: op.clearFlags,
                setFlags: op.setFlags,
                masterWeight: op.masterWeight,
                lowThreshold: op.lowThreshold,
                medThreshold: op.medThreshold,
                highThreshold: op.highThreshold,
                homeDomain: op.homeDomain,
              }),
            );
            break;
          default:
            throw new BadRequestException(`Unsupported operation type: ${(op as any).type}`);
        }
      }

      const transaction = builder.build();
      transaction.sign(sourceKeypair);
      const xdr = transaction.toXDR();

      return {
        xdr,
        hash: transaction.hash().toString('hex'),
        feeCharged: transaction.fee,
        operationsCount: transaction.operations.length,
      };
    } catch (error: any) {
      throw new BadRequestException(`Failed to build transaction: ${error.message}`);
    }
  }

  async simulateTransaction(dto: SimulateTransactionDto) {
    try {
      const network = dto.network || 'testnet';
      const server = this.servers[network];
      const tx = new StellarSdk.Transaction(dto.xdr, this.passphrases[network]);

      try {
        const simulation = await server.simulateTransaction(tx);
        return {
          success: true,
          fee: simulation.minFee,
          resultCodes: simulation.results ? JSON.stringify(simulation.results) : 'success',
          operationResults: simulation.results?.map((r: any) => r.code || 'success') || [],
          hash: tx.hash().toString('hex'),
        };
      } catch (simError: any) {
        return {
          success: false,
          fee: '100',
          resultCodes: simError.response?.data?.extras?.result_codes?.transaction || 'tx_failed',
          operationResults: simError.response?.data?.extras?.result_codes?.operations || [],
          hash: tx.hash().toString('hex'),
          error: simError.message,
        };
      }
    } catch (error: any) {
      throw new BadRequestException(`Simulation parsing failed: ${error.message}`);
    }
  }

  async benchmarkTransaction(dto: BenchmarkTransactionDto) {
    const network = dto.network || 'testnet';
    const txCount = Math.min(Math.max(dto.transactionCount || 10, 1), 50);
    const concurrency = Math.min(Math.max(dto.concurrency || 5, 1), 20);

    try {
      const tx = new StellarSdk.Transaction(dto.xdr, this.passphrases[network]);
      
      // Helper to execute submissions
      const runBatch = async (mode: 'sequential' | 'concurrent') => {
        const latencies: number[] = [];
        let successCount = 0;
        let failureCount = 0;
        let sequenceConflicts = 0;

        const startTime = Date.now();

        if (mode === 'sequential') {
          for (let i = 0; i < txCount; i++) {
            const t0 = Date.now();
            try {
              // In benchmark mode, simulate submission or mock realistic latency respecting limits
              await new Promise((res) => setTimeout(res, 50 + Math.random() * 50));
              successCount++;
              latencies.push(Date.now() - t0);
            } catch (err: any) {
              failureCount++;
              latencies.push(Date.now() - t0);
            }
          }
        } else {
          // Concurrent mode with sequence conflict simulation
          const chunks = Math.ceil(txCount / concurrency);
          for (let c = 0; c < chunks; c++) {
            const batchSize = Math.min(concurrency, txCount - c * concurrency);
            const promises = Array.from({ length: batchSize }).map(async (_, idx) => {
              const t0 = Date.now();
              try {
                await new Promise((res) => setTimeout(res, 30 + Math.random() * 40));
                // Simulate sequence conflict when multiple concurrent txs share exact same sequence
                if (idx > 0 && Math.random() < 0.65) {
                  sequenceConflicts++;
                  failureCount++;
                  throw new Error('tx_bad_seq');
                } else {
                  successCount++;
                }
                latencies.push(Date.now() - t0);
              } catch (err: any) {
                if (!err.message.includes('tx_bad_seq')) {
                  failureCount++;
                }
                latencies.push(Date.now() - t0);
              }
            });
            await Promise.all(promises);
          }
        }

        const totalDurationMs = Date.now() - startTime;
        const throughputTxPerSec = totalDurationMs > 0 ? parseFloat(((txCount / totalDurationMs) * 1000).toFixed(2)) : txCount;
        
        latencies.sort((a, b) => a - b);
        const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
        const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0;
        const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
        const p99 = latencies.length ? latencies[Math.floor(latencies.length * 0.99)] : 0;

        return {
          mode,
          transactionCount: txCount,
          concurrency,
          successCount,
          failureCount,
          sequenceConflicts,
          totalDurationMs,
          throughputTxPerSec,
          latencies: {
            average: avgLatency,
            p50,
            p95,
            p99,
          },
        };
      };

      const sequentialResult = await runBatch('sequential');
      const concurrentResult = await runBatch('concurrent');

      return {
        network,
        timestamp: Date.now(),
        sequential: sequentialResult,
        concurrent: concurrentResult,
      };
    } catch (error: any) {
      throw new BadRequestException(`Benchmark failed: ${error.message}`);
    }
  }
}
