import { Injectable } from '@nestjs/common';
import { AuctionStatus, LotStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuctionsGateway } from '../auctions/auctions.gateway';

@Injectable()
export class AdminAuctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AuctionsGateway,
  ) {}

  async getLiveAuctions() {
    const lots = await this.prisma.lot.findMany({
      where: {
        deletedAt: null,
        status: LotStatus.ACTIVE,
        auctionStatus: AuctionStatus.LIVE,
      },
      orderBy: { endDate: 'asc' },
      take: 500,
    });

    const now = Date.now();
    const items = await Promise.all(
      lots.map(async (lot) => {
        const [watcherCount, activeViewers] = await Promise.all([
          this.prisma.watchlistItem.count({ where: { lotId: lot.id } }),
          this.gateway.getLotRoomClientCount(lot.id),
        ]);
        return {
          lotId: lot.id,
          slug: lot.slug,
          title: lot.title,
          brand: lot.brand,
          model: lot.model,
          currentBid: lot.currentBid,
          bidCount: lot.bidCount,
          endDate: lot.endDate.toISOString(),
          timeRemaining: Math.max(
            0,
            Math.floor((lot.endDate.getTime() - now) / 1000),
          ),
          watcherCount,
          activeViewers,
        };
      }),
    );

    return { items };
  }
}
