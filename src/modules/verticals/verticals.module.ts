import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { VerticalsController } from './verticals.controller';
import { VerticalsService } from './verticals.service';

@Module({
  controllers: [VerticalsController, CategoriesController],
  providers: [VerticalsService],
  exports: [VerticalsService],
})
export class VerticalsModule {}
