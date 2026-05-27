import { IsString, Matches } from 'class-validator';

export class CalendarQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month phải có định dạng YYYY-MM' })
  month!: string;
}
