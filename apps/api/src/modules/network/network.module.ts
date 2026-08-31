import { Module } from "@nestjs/common";
import { NetworkController } from "./network.controller";
import { NetworkService } from "./network.service";
import { MetricsModule } from "../metrics/metrics.module";

@Module({
  imports: [MetricsModule],
  controllers: [NetworkController],
  providers: [NetworkService],
  exports: [NetworkService],
})
export class NetworkModule {}
