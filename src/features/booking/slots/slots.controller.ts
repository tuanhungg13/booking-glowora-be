import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { SlotsService } from './slots.service';
import { AvailableSlotsQueryDto } from './dto/available-slots-query.dto';

@Controller('stores/:storeId/available-slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Get()
  @Public()
  getAvailableSlots(
    @Param('storeId') storeId: string,
    @Query() query: AvailableSlotsQueryDto,
  ) {
    return this.slotsService.getAvailableSlots(storeId, query);
  }
}
