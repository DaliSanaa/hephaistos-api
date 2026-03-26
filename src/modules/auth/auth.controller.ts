import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register (sets httpOnly JWT cookie)' })
  @ApiResponse({ status: 201, description: 'Registered; sets cookie' })
  @ApiValidationErrorResponse()
  async register(
    @Body() dto: RegisterDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.register(dto, ip);
    res.cookie('hephaistos_token', token, this.auth.getCookieOptions());
    return { success: true, data: { user }, token: '' };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login (sets httpOnly JWT cookie)' })
  @ApiResponse({ status: 200, description: 'Logged in; sets cookie' })
  @ApiValidationErrorResponse()
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(dto, ip);
    res.cookie('hephaistos_token', token, this.auth.getCookieOptions());
    return { success: true, data: { user }, token: '' };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout (clears cookie)' })
  @ApiResponse({ status: 200, description: 'Cookie cleared' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.cookie('hephaistos_token', '', this.auth.clearCookieOptions());
    return { success: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user from JWT cookie' })
  @ApiResponse({ status: 200, description: 'Current user' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async me(@CurrentUser('sub') userId: string) {
    const user = await this.auth.me(userId);
    return { success: true, data: { user } };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiValidationErrorResponse()
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return {
      success: true,
      message: 'If the email exists, a reset link has been sent.',
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiValidationErrorResponse()
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const newPass = dto.newPassword ?? dto.password;
    if (!newPass) {
      throw new BadRequestException('newPassword or password is required');
    }
    await this.auth.resetPassword(dto.token, newPass);
    return { success: true };
  }
}
