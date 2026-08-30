import { Controller, Post, Get, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Support')
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get public platform settings (e.g. support contact info)' })
  getSettings() {
    return this.supportService.getSettings();
  }

  @Public() // Bypasses mandatory JWT check, making it auth-optional
  @Post()
  @ApiOperation({ summary: 'Submit a support ticket' })
  @ApiResponse({
    status: 201,
    description: 'Ticket created successfully',
    schema: {
      example: {
        message: 'Support ticket submitted successfully',
        ticketNumber: 'SUP-171523200',
        id: 'uuid-string',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (e.g. short message)',
  })
  async create(@Body() dto: CreateSupportTicketDto, @Req() req: any) {
    /**
     * Logic: If a valid JWT is present, the global JwtAuthGuard (if configured)
     * attaches the user to the request. We extract the 'sub' (User ID).
     * If the user is anonymous, userId will be null.
     */
    const userId = req.user?.sub || null;

    return this.supportService.create(dto, userId);
  }
}
