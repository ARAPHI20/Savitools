import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { AuthUser } from '../../auth/decorators/current-user.decorator';

/**
 * Deploying and invoking contracts spends the shared DEPLOYER_SECRET_KEY account,
 * so authentication alone isn't enough: the caller's email must also appear in the
 * CONTRACT_ADMIN_EMAILS allowlist. An unset or empty allowlist denies everyone —
 * operators must opt users in explicitly rather than defaulting to open access.
 */
@Injectable()
export class ContractAuthorizationGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Not authorized to perform this action');
    }

    const allowedEmails = this.getAllowedEmails();
    if (!allowedEmails.includes(user.email.toLowerCase())) {
      throw new ForbiddenException('Not authorized to perform this action');
    }

    return true;
  }

  private getAllowedEmails(): string[] {
    const raw = this.configService.get<string>('CONTRACT_ADMIN_EMAILS', '');
    return raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0);
  }
}
