import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import { BidService } from '../auctions/bid.service';
import { KycDocumentDto } from '../payments/dto/kyc-document.dto';
import { PaymentsService } from '../payments/payments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { NotificationPreferencesDto } from './dto/notification-preferences.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ValidateCardDto } from './dto/validate-card.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly bids: BidService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('me/transactions')
  @ApiOperation({ summary: 'Buyer transactions (won lots / payments)' })
  async myTransactions(@CurrentUser('sub') userId: string) {
    const data = await this.payments.listMyTransactions(userId);
    return { success: true, data };
  }

  @Post('me/payment/validate-card')
  @ApiOperation({ summary: 'Start card validation for bidding (redirect URL)' })
  @ApiResponse({ status: 200, description: 'Redirect URL for card validation' })
  @ApiValidationErrorResponse()
  async validateCard(
    @CurrentUser('sub') userId: string,
    @Body() dto: ValidateCardDto,
  ) {
    const data = await this.payments.startCardValidation(userId, dto.returnUrl);
    return { success: true, data };
  }

  @Post('me/kyc/document')
  @ApiOperation({ summary: 'Submit KYC document pages (base64)' })
  async submitKyc(
    @CurrentUser('sub') userId: string,
    @Body() dto: KycDocumentDto,
  ) {
    const pages = dto.pagesBase64.map((p) => Buffer.from(p, 'base64'));
    const data = await this.payments.submitKyc(userId, dto.documentType, pages);
    return { success: true, data };
  }

  @Get('me/kyc/status')
  @ApiOperation({ summary: 'KYC verification status' })
  async kycStatus(@CurrentUser('sub') userId: string) {
    const data = await this.payments.getKycStatusForUser(userId);
    return { success: true, data };
  }

  @Get('me/bids')
  @ApiOperation({ summary: 'Active bids (winning vs outbid)' })
  async myBids(@CurrentUser('sub') userId: string) {
    const data = await this.bids.getMyActiveBids(userId);
    return { success: true, data };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update profile' })
  @ApiValidationErrorResponse()
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const user = await this.users.updateProfile(userId, dto);
    return { success: true, data: { user } };
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Change password' })
  @ApiValidationErrorResponse()
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.users.changePassword(userId, dto);
    return { success: true };
  }

  @Get('me/notifications/preferences')
  @ApiOperation({ summary: 'Notification preferences' })
  async getNotifPrefs(@CurrentUser('sub') userId: string) {
    const preferences = await this.users.getNotificationPreferences(userId);
    return { success: true, data: { preferences } };
  }

  @Patch('me/notifications/preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiValidationErrorResponse()
  async patchNotifPrefs(
    @CurrentUser('sub') userId: string,
    @Body() dto: NotificationPreferencesDto,
  ) {
    const preferences = await this.users.updateNotificationPreferences(
      userId,
      dto,
    );
    return { success: true, data: { preferences } };
  }
}
