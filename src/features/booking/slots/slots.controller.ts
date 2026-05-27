import { Body, Controller, Param, Post } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { SlotsService } from './slots.service';
import { AvailableSlotsDto } from './dto/available-slots-query.dto';

@Controller('stores/:storeId/available-slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Post()
  @Public()
  getAvailableSlots(
    @Param('storeId') storeId: string,
    @Body() dto: AvailableSlotsDto,
  ) {
    return this.slotsService.getAvailableSlots(storeId, dto);
  }
}
