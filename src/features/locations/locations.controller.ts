import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LocationsService } from './locations.service';

@ApiTags('locations')
@Public()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @ApiOperation({ summary: 'Danh sách tỉnh/thành phố' })
  @Get('provinces')
  findAllProvinces() {
    return this.locationsService.findAllProvinces();
  }

  @ApiOperation({ summary: 'Danh sách xã/phường theo tỉnh/thành phố' })
  @ApiParam({ name: 'provinceId', type: Number, example: 1 })
  @Get('provinces/:provinceId/wards')
  findWardsByProvince(@Param('provinceId', ParseIntPipe) provinceId: number) {
    return this.locationsService.findWardsByProvince(provinceId);
  }
}
