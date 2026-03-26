import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { VerticalsService } from './verticals.service';

@ApiTags('verticals')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly verticals: VerticalsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Flat category list with active lot counts' })
  async list() {
    const data = await this.verticals.findAllCategoriesFlat();
    return { success: true, data };
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Category with spec template definitions' })
  @ApiResponse({ status: 200, description: 'Category detail' })
  @ApiResponse({ status: 404, description: 'Unknown category' })
  async bySlug(@Param('slug') slug: string) {
    const data = await this.verticals.findCategoryBySlug(slug);
    return { success: true, data };
  }
}
