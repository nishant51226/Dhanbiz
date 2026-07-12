import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";

export type RealtimeNotificationPayload = {
  id: string;
  name: string;
  body: string;
  type: string;
  image_url: string | null;
  data: Record<string, unknown>;
  event_key: string | null;
  created_at: string;
  read_at: string | null;
};

@WebSocketGateway({
  namespace: "/notifications",
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly auth: AuthService) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (this.auth.authEnabled()) {
      if (!token) {
        this.log.warn(`Socket ${client.id} rejected: missing auth token`);
        client.disconnect(true);
        return;
      }
      const user = this.auth.readAuthUser(token);
      if (!user) {
        this.log.warn(`Socket ${client.id} rejected: invalid auth token`);
        client.disconnect(true);
        return;
      }
      client.data.user = user satisfies AuthUser;
      await client.join(this.userRoom(user.userId));
      this.log.debug(`Socket ${client.id} joined room user:${user.userId}`);
      return;
    }
    const devUserId = String(client.handshake.auth?.userId ?? "").trim();
    if (devUserId) {
      await client.join(this.userRoom(devUserId));
      this.log.debug(`Socket ${client.id} joined dev room user:${devUserId}`);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    const user = client.data.user as AuthUser | undefined;
    if (user?.userId) {
      this.log.debug(`Socket ${client.id} disconnected user:${user.userId}`);
    }
  }

  emitToUser(userId: string, payload: RealtimeNotificationPayload): void {
    if (!this.server) return;
    this.server.to(this.userRoom(userId)).emit("notification", payload);
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth;
    if (auth && typeof auth.token === "string" && auth.token.trim()) {
      return auth.token.trim();
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice(7).trim();
    }
    return null;
  }
}
