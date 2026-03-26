import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { VerticalsService } from './verticals.service';

@ApiTags('verticals')
@Controller('verticals')
export class VerticalsController {
  constructor(private readonly verticals: VerticalsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List verticals with categories and spec fields' })
  @ApiResponse({ status: 200, description: 'Verticals tree' })
  async list() {
    const data = await this.verticals.findAllVerticals();
    return { success: true, data };
  }
}
