import { describe, expect, it } from 'vitest';
import { classifyHttpError } from './httpError';

describe('classifyHttpError', () => {
  it('classifies 401 as unauthorized and preserves the backend hint text', () => {
    const result = classifyHttpError(new Error('HTTP 401: token 未配置或已失效，请到后端管理面板右下角『打开密钥本』获取对应 token'));
    expect(result.kind).toBe('unauthorized');
    expect(result.status).toBe(401);
    expect(result.retryAfterSeconds).toBeNull();
    expect(result.message).toContain('打开密钥本');
  });

  it('classifies 429 as rateLimited and extracts retry_after when present', () => {
    const result = classifyHttpError('HTTP 429: 认证失败次数过多，来源 IP 已被临时限制，稍后重试|retry_after=30');
    expect(result.kind).toBe('rateLimited');
    expect(result.status).toBe(429);
    expect(result.retryAfterSeconds).toBe(30);
    expect(result.message).toBe('HTTP 429: 认证失败次数过多，来源 IP 已被临时限制，稍后重试');
  });

  it('classifies 429 without retry_after as rateLimited with null seconds', () => {
    const result = classifyHttpError('HTTP 429: 认证失败次数过多，来源 IP 已被临时限制，稍后重试');
    expect(result.kind).toBe('rateLimited');
    expect(result.retryAfterSeconds).toBeNull();
  });

  it('classifies errors without an HTTP status as network errors', () => {
    const result = classifyHttpError('连接失败，请检查后端地址');
    expect(result.kind).toBe('network');
    expect(result.status).toBeNull();
  });

  it('classifies other HTTP statuses as other', () => {
    const result = classifyHttpError('HTTP 500: internal error');
    expect(result.kind).toBe('other');
    expect(result.status).toBe(500);
  });
});
