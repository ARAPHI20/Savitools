import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.constants';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class MonitorGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const allowedOrigin = this.configService.get<string>(
        'WEB_ORIGIN',
        'http://localhost:3000',
      );
      const requestOrigin = client.handshake.headers.origin;
      if (requestOrigin && requestOrigin !== allowedOrigin) {
        client.disconnect();
        return;
      }

      const suppliedToken =
        client.handshake.auth?.token ?? client.handshake.query?.token;
      let token = typeof suppliedToken === 'string' ? suppliedToken : undefined;
      if (!token && client.handshake.headers.cookie) {
        const cookieHeader = client.handshake.headers.cookie;
        const match = cookieHeader.match(
          new RegExp(`(?:^|;\\s*)${ACCESS_TOKEN_COOKIE}=([^;]+)`),
        );
        if (match) token = match[1];
      }

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      const userId = String(payload.sub);
      client.join(`user_${userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    void client;
  }

  emitToUser(userId: string, eventName: string, data: unknown): void {
    this.server.to(`user_${userId}`).emit(eventName, data);
  }
}
