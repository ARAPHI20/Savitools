import { AuthService } from './auth.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

function mockRepo() {
  return {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'uuid-1', ...dto })),
    save: jest.fn(async (entity) => entity),
    delete: jest.fn(),
  };
}

function mockJwt() {
  return { sign: jest.fn(() => 'mock-access-token') };
}

function mockConfig() {
  return {
    getOrThrow: jest.fn(() => 'test-secret'),
    get: jest.fn((key: string) => {
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    }),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: ReturnType<typeof mockRepo>;
  let refreshTokensRepo: ReturnType<typeof mockRepo>;
  let jwt: ReturnType<typeof mockJwt>;
  let config: ReturnType<typeof mockConfig>;

  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('password123', 4);
  });

  beforeEach(() => {
    usersRepo = mockRepo();
    refreshTokensRepo = mockRepo();
    jwt = mockJwt();
    config = mockConfig();
    service = new AuthService(
      usersRepo as any,
      refreshTokensRepo as any,
      jwt as any,
      config as any,
    );
  });

  describe('register', () => {
    it('creates a new user and returns tokens', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(usersRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(usersRepo.create).toHaveBeenCalled();
      expect(usersRepo.save).toHaveBeenCalled();
      expect(result.user).toBeDefined();
      expect(result.tokens.accessToken).toBe('mock-access-token');
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('throws ConflictException for duplicate email', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({ email: 'dup@example.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('lowercases the email', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await service.register({ email: 'UPPER@EXAMPLE.COM', password: 'password123' });

      expect(usersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'upper@example.com' }),
      );
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash,
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.tokens.accessToken).toBe('mock-access-token');
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('throws UnauthorizedException for wrong password', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash,
      });

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for non-existent email', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lowercases email before lookup', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash,
      });

      await service.login({ email: 'TEST@EXAMPLE.COM', password: 'password123' });

      expect(usersRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });
  });

  describe('refresh', () => {
    it('rotates tokens for a valid refresh token', async () => {
      const { createHash } = require('crypto');
      const rawToken = 'raw-refresh-token';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const storedToken = {
        id: 'rt-1',
        tokenHash,
        expiresAt: new Date(Date.now() + 3600000),
        user: { id: 'user-1', email: 'test@example.com' },
      };

      refreshTokensRepo.findOne.mockResolvedValue(storedToken);

      const result = await service.refresh(rawToken);

      expect(refreshTokensRepo.delete).toHaveBeenCalledWith('rt-1');
      expect(result.tokens.accessToken).toBe('mock-access-token');
      expect(result.user.id).toBe('user-1');
    });

    it('throws UnauthorizedException for expired token', async () => {
      const { createHash } = require('crypto');
      const rawToken = 'expired-token';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      refreshTokensRepo.findOne.mockResolvedValue({
        id: 'rt-2',
        tokenHash,
        expiresAt: new Date(Date.now() - 1000),
        user: { id: 'user-1', email: 'test@example.com' },
      });

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for unknown token', async () => {
      refreshTokensRepo.findOne.mockResolvedValue(null);

      await expect(service.refresh('unknown')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('deletes the refresh token hash', async () => {
      await service.logout('some-token');
      expect(refreshTokensRepo.delete).toHaveBeenCalled();
    });

    it('does nothing when no token provided', async () => {
      await service.logout();
      expect(refreshTokensRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('getUserById', () => {
    it('looks up user by id', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'user-1' });
      const result = await service.getUserById('user-1');
      expect(result).toEqual({ id: 'user-1' });
    });
  });
});
