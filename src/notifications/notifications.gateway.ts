import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('NotificationsGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribeToUser')
  handleSubscribe(client: Socket, userId: string) {
    client.join(`user_${userId}`);
    this.logger.log(`Client ${client.id} subscribed to user_${userId}`);
    return { event: 'subscribed', data: userId };
  }

  sendNotificationToUser(userId: string, notification: any) {
    if (this.server) {
      this.server.to(`user_${userId}`).emit('newNotification', notification);
    } else {
      this.logger.warn(
        `WebSocket server not initialized; cannot send real-time notification to user_${userId}`,
      );
    }
  }
}
