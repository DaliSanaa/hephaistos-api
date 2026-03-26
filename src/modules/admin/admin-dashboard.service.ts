import { Injectable } from '@nestjs/common';
import {
  AuctionStatus,
  DisputeStatus,
  LotStatus,
  PayoutStatus,
  TransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const CACHE_KEY = 'admin:dashboard:stats';
const TTL_SEC = 30;

export type AdminDashboardStats = {
  totalUsers: number;
  newUsersToday: number;
  totalLots: number;
  activeLots: number;
  pendingReview: number;
  liveAuctions: number;
  totalBids: number;
  bidsToday: number;
  totalRevenue: number;
  revenueThisMonth: number;
  openDisputes: number;
  pendingPayouts: number;
};

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getStats(): Promise<AdminDashboardStats> {
    return this.redis.getOrSet(CACHE_KEY, TTL_SEC, () => this.computeStats());
  }

  private async computeStats(): Promise<AdminDashboardStats> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(
      startOfDay.getFullYear(),
      startOfDay.getMonth(),
      1,
    );

    const [
      totalUsers,
      newUsersToday,
      totalLots,
      activeLots,
      pendingReview,
      liveAuctions,
      totalBids,
      bidsToday,
      revenueAgg,
      revenueMonthAgg,
      openDisputes,
      pendingPayouts,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({
        where: { deletedAt: null, createdAt: { gte: startOfDay } },
      }),
      this.prisma.lot.count({ where: { deletedAt: null } }),
      this.prisma.lot.count({
        where: { deletedAt: null, status: LotStatus.ACTIVE },
      }),
      this.prisma.lot.count({
        where: { deletedAt: null, status: LotStatus.PENDING_REVIEW },
      }),
      this.prisma.lot.count({
        where: {
          deletedAt: null,
          status: LotStatus.ACTIVE,
          auctionStatus: AuctionStatus.LIVE,
        },
      }),
      this.prisma.bid.count(),
      this.prisma.bid.count({
        where: { createdAt: { gte: startOfDay } },
      }),
      this.prisma.transaction.aggregate({
        where: { status: TransactionStatus.COMPLETED },
        _sum: { platformRevenue: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          status: TransactionStatus.COMPLETED,
          updatedAt: { gte: startOfMonth },
        },
        _sum: { platformRevenue: true },
      }),
      this.prisma.dispute.count({
        where: {
          status: {
            in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW],
          },
        },
      }),
      this.prisma.payout.count({
        where: {
          status: {
            in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING],
          },
        },
      }),
    ]);

    return {
      totalUsers,
      newUsersToday,
      totalLots,
      activeLots,
      pendingReview,
      liveAuctions,
      totalBids,
      bidsToday,
      totalRevenue: revenueAgg._sum.platformRevenue ?? 0,
      revenueThisMonth: revenueMonthAgg._sum.platformRevenue ?? 0,
      openDisputes,
      pendingPayouts,
    };
  }
}
