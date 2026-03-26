import { Global, Module } from '@nestjs/common';
import { EventService } from './events.service';

@Global()
@Module({
  providers: [EventService],
  exports: [EventService],
})
export class EventsModule {}
