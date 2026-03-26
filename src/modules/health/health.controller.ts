import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('system')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness — services ping + uptime' })
  async getHealth() {
    return this.health.getLiveness();
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness — 503 unless DB + Redis are up' })
  @ApiResponse({ status: 200, description: 'DB and Redis reachable' })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  async getReady(@Res() res: Response) {
    const body = await this.health.getReadiness();
    if (body.status !== 'ok') {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json(body);
    }
    return res.status(HttpStatus.OK).json(body);
  }
}
