import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuctionStatus, LotStatus } from '@prisma/client';
import type { Queue } from 'bullmq';
import { BidService } from './bid.service';
import { AuctionsGateway } from './auctions.gateway';
import { EventService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { TypesenseService } from '../search/typesense.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

describe('BidService.placeBid', () => {
  const sellerId = 'seller-1';
  const buyerId = 'buyer-1';
  const lotId = 'lot-1';
  const slug = 'test-lot-slug';

  const baseLot = {
    id: lotId,
    slug,
    title: 'Tractor',
    sellerId,
    auctionStatus: AuctionStatus.LIVE,
    status: LotStatus.ACTIVE,
    endDate: new Date(Date.now() + 60_000),
    currentBid: 100_000,
    bidCount: 1,
    startingPrice: 50_000,
    seller: { id: sellerId },
  };

  let prisma: {
    lot: { findFirst: jest.Mock; update: jest.Mock };
    bid: { findFirst: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let redis: { setNxEx: jest.Mock; del: jest.Mock; set: jest.Mock };
  let payments: { assertBidAllowed: jest.Mock };
  let gateway: { broadcastBid: jest.Mock; broadcastAuctionExtended: jest.Mock };
  let auctionQueue: { getJob: jest.Mock; add: jest.Mock };
  let service: BidService;

  beforeEach(() => {
    prisma = {
      lot: {
        findFirst: jest.fn().mockResolvedValue(baseLot),
        update: jest.fn().mockResolvedValue({}),
      },
      bid: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'other-user' }),
        create: jest.fn().mockResolvedValue({ id: 'bid-new' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          firstName: 'Jane',
          lastName: 'Doe',
        }),
      },
    };
    redis = {
      setNxEx: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    payments = { assertBidAllowed: jest.fn().mockResolvedValue(undefined) };
    gateway = {
      broadcastBid: jest.fn(),
      broadcastAuctionExtended: jest.fn(),
    };
    auctionQueue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue(undefined),
    };

    service = new BidService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      { log: jest.fn() } as unknown as EventService,
      {} as unknown as NotificationsService,
      gateway as unknown as AuctionsGateway,
      payments as unknown as PaymentsService,
      {
        get: jest.fn((k: string) =>
          k === 'FRONTEND_URL' ? 'http://localhost:3000' : '',
        ),
      } as unknown as ConfigService,
      {} as unknown as TypesenseService,
      auctionQueue as unknown as Queue,
    );
  });

  it('throws NotFound when lot missing', async () => {
    prisma.lot.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.placeBid(slug, buyerId, 200_000, 'ip', 'ua'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Forbidden when bidder is seller', async () => {
    await expect(
      service.placeBid(slug, sellerId, 200_000, 'ip', 'ua'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws BadRequest when bid below minimum', async () => {
    await expect(
      service.placeBid(slug, buyerId, 100_000, 'ip', 'ua'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequest when already highest bidder', async () => {
    prisma.bid.findFirst.mockResolvedValueOnce({ userId: buyerId });
    await expect(
      service.placeBid(slug, buyerId, 200_000, 'ip', 'ua'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws Conflict when lock not acquired', async () => {
    redis.setNxEx.mockResolvedValueOnce(false);
    await expect(
      service.placeBid(slug, buyerId, 200_000, 'ip', 'ua'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
