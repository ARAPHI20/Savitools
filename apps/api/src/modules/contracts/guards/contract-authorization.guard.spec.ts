import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractAuthorizationGuard } from './contract-authorization.guard';

function mockContext(user?: { id: string; email: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function mockConfig(allowedEmails: string): ConfigService {
  return {
    get: jest.fn((_key: string, defaultValue?: string) => allowedEmails ?? defaultValue),
  } as unknown as ConfigService;
}

describe('ContractAuthorizationGuard', () => {
  it('denies when no user is attached to the request', () => {
    const guard = new ContractAuthorizationGuard(mockConfig('admin@example.com'));
    expect(() => guard.canActivate(mockContext(undefined))).toThrow(ForbiddenException);
  });

  it('denies everyone when CONTRACT_ADMIN_EMAILS is unset', () => {
    const guard = new ContractAuthorizationGuard(mockConfig(''));
    const context = mockContext({ id: '1', email: 'admin@example.com' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('denies a user whose email is not in the allowlist', () => {
    const guard = new ContractAuthorizationGuard(mockConfig('admin@example.com'));
    const context = mockContext({ id: '1', email: 'someone-else@example.com' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows a user whose email is in the allowlist', () => {
    const guard = new ContractAuthorizationGuard(mockConfig('admin@example.com, ops@example.com'));
    const context = mockContext({ id: '1', email: 'ops@example.com' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('is case-insensitive when matching emails', () => {
    const guard = new ContractAuthorizationGuard(mockConfig('Admin@Example.com'));
    const context = mockContext({ id: '1', email: 'admin@example.com' });
    expect(guard.canActivate(context)).toBe(true);
  });
});
