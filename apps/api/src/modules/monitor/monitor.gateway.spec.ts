import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MonitorGateway } from './monitor.gateway';

function client(handshake: Record<string, unknown>) {
  return { handshake, disconnect: jest.fn(), join: jest.fn() } as any;
}

describe('MonitorGateway authentication', () => {
  it('accepts a token in the Socket.IO auth payload', async () => {
    const jwt = { verify: jest.fn().mockReturnValue({ sub: 'user-1' }) } as unknown as JwtService;
    const config = { get: jest.fn().mockReturnValue('http://localhost:3000'), getOrThrow: jest.fn().mockReturnValue('secret') } as unknown as ConfigService;
    const gateway = new MonitorGateway(jwt, config);
    const socket = client({ auth: { token: 'token' }, headers: { origin: 'http://localhost:3000' } });

    await gateway.handleConnection(socket);

    expect(socket.join).toHaveBeenCalledWith('user_user-1');
  });

  it('accepts a token from the secure-cookie transport', async () => {
    const jwt = { verify: jest.fn().mockReturnValue({ sub: 'user-1' }) } as unknown as JwtService;
    const config = { get: jest.fn().mockReturnValue('http://localhost:3000'), getOrThrow: jest.fn().mockReturnValue('secret') } as unknown as ConfigService;
    const gateway = new MonitorGateway(jwt, config);
    const socket = client({ headers: { origin: 'http://localhost:3000', cookie: 'savitools_access_token=cookie-token' } });

    await gateway.handleConnection(socket);

    expect(jwt.verify).toHaveBeenCalledWith('cookie-token', { secret: 'secret' });
  });

  it('rejects query-string tokens', async () => {
    const jwt = { verify: jest.fn() } as unknown as JwtService;
    const config = { get: jest.fn().mockReturnValue('http://localhost:3000'), getOrThrow: jest.fn().mockReturnValue('secret') } as unknown as ConfigService;
    const gateway = new MonitorGateway(jwt, config);
    const socket = client({ query: { token: 'leaked-token' }, headers: { origin: 'http://localhost:3000' } });

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalled();
    expect(jwt.verify).not.toHaveBeenCalled();
  });
});
