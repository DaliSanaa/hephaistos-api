import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

export type BidBroadcastPayload = {
  event: string;
  lotId: string;
  slug: string;
  amount: number;
  bidCount: number;
  userId: string;
  endDate: string;
  bidderName: string;
};

export type AuctionStatusBroadcastPayload = {
  event: string;
  lotId: string;
  slug?: string;
  sold?: boolean;
  winnerId?: string | null;
  finalPrice?: number;
  status?: string;
};

@WebSocketGateway({
  namespace: '/auctions',
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class AuctionsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AuctionsGateway.name);

  @WebSocketServer()
  server!: Server;

  afterInit() {
    this.logger.log('WebSocket /auctions ready');
  }

  handleConnection(client: Socket) {
    this.logger.debug(`client connected ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`client disconnected ${client.id}`);
  }

  @SubscribeMessage('join:lot')
  handleJoinLot(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { lotId: string },
  ) {
    if (payload?.lotId) void client.join(`lot:${payload.lotId}`);
  }

  @SubscribeMessage('leave:lot')
  handleLeaveLot(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { lotId: string },
  ) {
    if (payload?.lotId) void client.leave(`lot:${payload.lotId}`);
  }

  @SubscribeMessage('join:user')
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId: string },
  ) {
    if (payload?.userId) void client.join(`user:${payload.userId}`);
  }

  @SubscribeMessage('leave:user')
  handleLeaveUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId: string },
  ) {
    if (payload?.userId) void client.leave(`user:${payload.userId}`);
  }

  broadcastBid(lotId: string, data: BidBroadcastPayload) {
    this.server.to(`lot:${lotId}`).emit('bid:update', data);
  }

  broadcastAuctionStatus(lotId: string, data: AuctionStatusBroadcastPayload) {
    this.server.to(`lot:${lotId}`).emit('auction:status', data);
  }

  broadcastAuctionExtended(
    lotId: string,
    payload: { lotId: string; newEndDate: string },
  ) {
    this.server.to(`lot:${lotId}`).emit('auction:extended', payload);
  }

  /** Number of connected Socket.IO clients in `lot:{lotId}` room. */
  async getLotRoomClientCount(lotId: string): Promise<number> {
    if (!this.server) return 0;
    const sockets = await this.server.in(`lot:${lotId}`).fetchSockets();
    return sockets.length;
  }
}
