import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Authenticate the WebSocket connection using JWT
   */
  async handleConnection(client: Socket) {
    try {
      // Extract token from standard auth payload or headers
      const token = 
        client.handshake.auth?.token || 
        client.handshake.headers?.authorization?.split(' ')[1];
        
      if (!token) {
        throw new Error('No authentication token provided');
      }
      
      // Verify token (uses your existing JWT setup)
      const decoded = this.jwtService.verify(token, { 
        secret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET 
      });
      
      // Attach the userId to the socket client for future requests
      client.data.userId = decoded.sub;
      this.logger.log(`User ${decoded.sub} connected to chat socket`);
    } catch (error) {
      this.logger.error(`WebSocket auth failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`User ${client.data.userId} disconnected`);
  }

  /**
   * Securely join an appointment's chat room
   */
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody('appointmentId') appointmentId: string,
  ) {
    try {
      const userId = client.data.userId;
      
      // Strict validation: Does this user belong to this valid appointment?
      await this.chatService.validateChatAccess(userId, appointmentId);
      
      client.join(appointmentId);
      this.logger.log(`User ${userId} joined room ${appointmentId}`);
      
      return { status: 'success', message: 'Joined room successfully' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  /**
   * Receive, save, and broadcast a new message
   */
@SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { appointmentId: string; content: string },
  ) {
    try {
      const userId = client.data.userId;
      
      // 1. Validate access and determine the receiver
      const { receiverId } = await this.chatService.validateChatAccess(
        userId, 
        payload.appointmentId
      );
      
      // 2. Persist the message
      const savedMessage = await this.chatService.saveMessage(
        payload.appointmentId,
        userId,
        receiverId,
        payload.content,
      );
      
      // 3. Broadcast to the room
      this.server.to(payload.appointmentId).emit('receive_message', savedMessage);
      
      // 4. Offline Detection & Notification Dispatch
      // Fetch all active socket connections currently sitting inside this appointment room
      const socketsInRoom = await this.server.in(payload.appointmentId).fetchSockets();
      
      // Check if any of those sockets belong to the receiver
      const isReceiverOnline = socketsInRoom.some(
        (socket) => socket.data?.userId === receiverId
      );

      if (!isReceiverOnline) {
        this.logger.log(`User ${receiverId} is not in room ${payload.appointmentId}. Dispatching offline notification.`);
        
        await this.notificationsService.create({
          userId: receiverId,
          type: NotificationType.NEW_CHAT_MESSAGE,
          title: 'New Message Received',
          message: `You have a new message regarding your appointment.`,
        });
      }
      
      return { status: 'success', data: savedMessage };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}