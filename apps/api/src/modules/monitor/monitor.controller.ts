import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CSV_BOM, toCsvRow } from '../../common/csv';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AlertRuleDto, CreateWatchDto } from './dto/create-watch.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RegisterWebhookDto } from './dto/register-webhook.dto';
import { ExportEventsQueryDto } from './dto/export-events.dto';
import { SearchEventsQueryDto } from './dto/search-events.dto';
import { MonitorService } from './monitor.service';

@ApiTags('monitor')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  @Post('watches')
  @ApiOperation({ summary: 'Create a ledger watch' })
  @ApiResponse({ status: 201, description: 'Watch created' })
  createWatch(@CurrentUser() user: AuthUser, @Body() dto: CreateWatchDto) {
    return this.monitorService.createWatch(user.id, dto);
  }

  @Get('watches')
  @ApiOperation({ summary: 'List the current user watches' })
  getWatches(@CurrentUser() user: AuthUser) {
    return this.monitorService.getWatches(user.id);
  }

  @Delete('watches/:id')
  @HttpCode(204)
  @ApiParam({ name: 'id', description: 'Watch ID' })
  async deleteWatch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.monitorService.deleteWatch(user.id, id);
  }

  @Get('watches/:id/events')
  @ApiOperation({ summary: 'Get paginated event history for a watch' })
  getEvents(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.monitorService.getEvents(user.id, id, query);
  }

  @Get('watches/:id/alerts')
  @ApiOperation({ summary: 'Get fired alerts for a watch' })
  getAlerts(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.monitorService.getAlerts(user.id, id, query);
  }

  @Post('watches/:id/alerts')
  @ApiOperation({ summary: 'Add an alert rule to a watch' })
  addAlertRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AlertRuleDto,
  ) {
    return this.monitorService.addAlertRule(user.id, id, dto);
  }

  @Post('watches/:id/alerts/:alertId/resend')
  @ApiOperation({ summary: 'Re-send a fired alert' })
  resendAlert(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('alertId') alertId: string,
  ) {
    return this.monitorService.resendAlert(user.id, id, alertId);
  }

  @Post('webhooks')
  @ApiOperation({ summary: 'Register the current user monitor webhook' })
  registerWebhook(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterWebhookDto,
  ) {
    return this.monitorService.registerWebhook(user.id, dto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search watch events across the current user watches' })
  @ApiQuery({ name: 'watchId', required: false })
  @ApiQuery({ name: 'eventType', required: false, enum: ['transaction', 'payment', 'contract'] })
  @ApiQuery({ name: 'q', required: false, description: 'Free-text search across event payloads' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date — events at or after this time' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date — events at or before this time' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  searchEvents(@CurrentUser() user: AuthUser, @Query() query: SearchEventsQueryDto) {
    return this.monitorService.searchEvents(user.id, query);
  }

  @Get('search/export')
  @ApiOperation({
    summary: 'Export monitor search results as CSV (UTF-8 BOM, streamed in chunks)',
  })
  @ApiQuery({ name: 'watchId', required: false })
  @ApiQuery({ name: 'eventType', required: false, enum: ['transaction', 'payment', 'contract'] })
  @ApiQuery({ name: 'q', required: false, description: 'Free-text search across event payloads' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date — events at or after this time' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date — events at or before this time' })
  async exportSearch(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportEventsQueryDto,
    @Res() reply: FastifyReply,
  ) {
    reply.hijack();
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header(
      'Content-Disposition',
      'attachment; filename="monitor-search.csv"',
    );
    reply.raw.write(CSV_BOM);
    reply.raw.write(
      toCsvRow([
        'event_type',
        'occurred_at',
        'amount',
        'asset',
        'from',
        'to',
        'transaction_hash',
        'paging_token',
        'watch_id',
        'payload',
      ]) + '\n',
    );

    try {
      await this.monitorService.streamSearchEventsCsv(
        user.id,
        query,
        (values) => {
          reply.raw.write(toCsvRow(values) + '\n');
        },
        () => {
          reply.raw.end();
        },
      );
    } catch (err) {
      reply.raw.end();
    }
  }
}
