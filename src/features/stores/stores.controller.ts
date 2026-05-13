import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../common/constants/permissions';
import { CreateStoreDto } from './dto/create-store.dto';
import { StoreFilterDto } from './dto/store-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UpdateWorkingHoursDto } from './dto/update-working-hours.dto';
import { StoresService } from './stores.service';

@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @ApiOperation({ summary: 'Public listing for active stores' })
  @Public()
  @Get()
  findAll(@Query() filter: StoreFilterDto) {
    return this.storesService.findAll(filter);
  }

  @ApiOperation({ summary: 'Create a store for current owner' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.CREATE)
  @Post()
  create(@Body() dto: CreateStoreDto, @CurrentUser() user: CurrentUserPayload) {
    return this.storesService.create(dto, user.id);
  }

  @ApiOperation({ summary: 'Stores owned by current user' })
  @ApiBearerAuth()
  @Get('mine')
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.storesService.findMine(user.id);
  }

  @ApiOperation({ summary: 'Public store detail by id or slug' })
  @Public()
  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.storesService.findOne(idOrSlug);
  }

  @ApiOperation({ summary: 'Update current owner store' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storesService.update(id, user.id, dto);
  }

  @ApiOperation({ summary: 'Replace working hours for current owner store' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.WORKING_HOUR.UPDATE)
  @Put(':id/working-hours')
  updateWorkingHours(
    @Param('id') id: string,
    @Body() dto: UpdateWorkingHoursDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storesService.updateWorkingHours(id, user.id, dto);
  }
}
