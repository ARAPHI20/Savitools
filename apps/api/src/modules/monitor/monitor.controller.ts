import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AlertRuleDto, CreateWatchDto } from './dto/create-watch.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RegisterWebhookDto } from './dto/register-webhook.dto';
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
}
