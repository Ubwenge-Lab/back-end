import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Header('Content-Type', 'text/html')
  getHello(): string {
    return this.appService.getHello();
  }
  //temporary test route
  @Get('test-error')
  triggerError() {
    throw new Error('Database connection timed out! (Simulated Crash)');
  }
}
