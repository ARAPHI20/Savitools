import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EventsService } from './events.service';
import { QueryEventsDto } from './dto/query-events.dto';
import { FilterEventsDto } from './dto/filter-events.dto';
import { ReplayEventsDto } from './dto/replay-events.dto';
import { DecodedContractEvent, EventFilterCriterion } from './event-filters';

/**
 * Kept separate from ContractsController so the public read routes cannot
 * inherit its ContractAuthorizationGuard by accident. Reading events spends
 * nothing on-chain; only replay, which sends outbound traffic, is guarded.
 */
@ApiTags('contract-events')
@Controller('contracts/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Query and decode Soroban contract events' })
  @ApiResponse({ status: 200, description: 'Decoded events returned' })
  @ApiResponse({ status: 400, description: 'Invalid contract ID or ledger range' })
  @ApiResponse({ status: 502, description: 'Soroban RPC node unreachable' })
  async query(@Query() dto: QueryEventsDto) {
    return this.eventsService.queryEvents(dto);
  }

  @Post('filter')
  @ApiOperation({ summary: 'Apply filter criteria to a set of decoded events' })
  @ApiResponse({ status: 201, description: 'Filtered events returned' })
  @ApiResponse({ status: 400, description: 'Invalid criteria' })
  async filter(@Body() dto: FilterEventsDto) {
    return this.eventsService.filterEvents(
      dto.events as DecodedContractEvent[],
      dto.criteria as EventFilterCriterion[],
    );
  }

  @Post('replay')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Replay decoded events at a webhook endpoint' })
  @ApiResponse({ status: 201, description: 'Per-event delivery results returned' })
  @ApiResponse({ status: 400, description: 'Invalid or unsafe webhook URL' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  async replay(@Body() dto: ReplayEventsDto) {
    return this.eventsService.replayEvents(dto);
  }
}
