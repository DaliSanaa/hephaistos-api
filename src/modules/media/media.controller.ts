import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MediaUploadUrlDto } from './dto/upload-url.dto';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload-url')
  @ApiOperation({
    summary: 'Presigned PUT URL for R2 (mock when ENABLE_R2=false)',
  })
  @ApiResponse({ status: 200, description: 'uploadUrl, publicUrl, key' })
  @ApiValidationErrorResponse()
  async uploadUrl(
    @CurrentUser('sub') userId: string,
    @Body() dto: MediaUploadUrlDto,
  ) {
    const data = await this.media.getUploadUrl(
      userId,
      dto.fileName,
      dto.fileType,
      dto.context,
    );
    return { success: true, data };
  }
}
