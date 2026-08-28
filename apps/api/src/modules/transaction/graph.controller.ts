import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GraphService } from './graph.service';
import { GraphMode, GraphQueryDto } from './dto/graph.dto';

@ApiTags('graph')
@Controller('transaction')
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  @Post('graph')
  @ApiOperation({
    summary: 'Build a Stellar account relationship graph (signers / offers / payments)',
  })
  @ApiBody({ type: GraphQueryDto })
  @ApiResponse({ status: 200, description: 'Graph nodes and edges returned' })
  @ApiResponse({ status: 404, description: 'Root account not found on network' })
  @ApiResponse({ status: 400, description: 'Invalid query or Horizon failure' })
  buildGraph(@Body() dto: GraphQueryDto) {
    return this.graphService.buildGraph(dto);
  }
}

export { GraphMode };
