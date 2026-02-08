import { PollDeduplicator } from './PollDeduplicator';
import { PollResult } from './types';

function createResult(overrides: Partial<PollResult> = {}): PollResult {
  return {
    success: true,
    dependenciesUpdated: 3,
    statusChanges: [],
    latencyMs: 50,
    ...overrides,
  };
}

describe('PollDeduplicator', () => {
  it('should execute pollFn for the first caller', async () => {
    const dedup = new PollDeduplicator();
    const result = createResult();
    const pollFn = jest.fn().mockResolvedValue(result);

    const actual = await dedup.deduplicate('http://example.com/health', pollFn);

    expect(actual).toEqual(result);
    expect(pollFn).toHaveBeenCalledTimes(1);
  });

  it('should return the same promise for concurrent calls to the same URL', async () => {
    const dedup = new PollDeduplicator();
    const result = createResult();

    let resolvePoll!: (value: PollResult) => void;
    const pollFn = jest.fn().mockReturnValue(
      new Promise<PollResult>(resolve => { resolvePoll = resolve; })
    );

    const promise1 = dedup.deduplicate('http://example.com/health', pollFn);
    const promise2 = dedup.deduplicate('http://example.com/health', pollFn);

    // Same promise reference
    expect(promise1).toBe(promise2);

    // pollFn only called once
    expect(pollFn).toHaveBeenCalledTimes(1);

    resolvePoll(result);

    const [r1, r2] = await Promise.all([promise1, promise2]);
    expect(r1).toEqual(result);
    expect(r2).toEqual(result);
  });

  it('should execute separate pollFns for different URLs', async () => {
    const dedup = new PollDeduplicator();
    const result1 = createResult({ latencyMs: 10 });
    const result2 = createResult({ latencyMs: 20 });

    const pollFn1 = jest.fn().mockResolvedValue(result1);
    const pollFn2 = jest.fn().mockResolvedValue(result2);

    const [r1, r2] = await Promise.all([
      dedup.deduplicate('http://a.com/health', pollFn1),
      dedup.deduplicate('http://b.com/health', pollFn2),
    ]);

    expect(r1).toEqual(result1);
    expect(r2).toEqual(result2);
    expect(pollFn1).toHaveBeenCalledTimes(1);
    expect(pollFn2).toHaveBeenCalledTimes(1);
  });

  it('should clean up after promise resolves', async () => {
    const dedup = new PollDeduplicator();
    const pollFn = jest.fn().mockResolvedValue(createResult());

    await dedup.deduplicate('http://example.com/health', pollFn);

    expect(dedup.isInflight('http://example.com/health')).toBe(false);
    expect(dedup.size).toBe(0);
  });

  it('should clean up after promise rejects', async () => {
    const dedup = new PollDeduplicator();
    const pollFn = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(
      dedup.deduplicate('http://example.com/health', pollFn)
    ).rejects.toThrow('Network error');

    expect(dedup.isInflight('http://example.com/health')).toBe(false);
    expect(dedup.size).toBe(0);
  });

  it('should allow new poll after previous one completes', async () => {
    const dedup = new PollDeduplicator();
    const result1 = createResult({ latencyMs: 10 });
    const result2 = createResult({ latencyMs: 20 });

    const pollFn1 = jest.fn().mockResolvedValue(result1);
    const pollFn2 = jest.fn().mockResolvedValue(result2);

    const r1 = await dedup.deduplicate('http://example.com/health', pollFn1);
    const r2 = await dedup.deduplicate('http://example.com/health', pollFn2);

    expect(r1).toEqual(result1);
    expect(r2).toEqual(result2);
    expect(pollFn1).toHaveBeenCalledTimes(1);
    expect(pollFn2).toHaveBeenCalledTimes(1);
  });

  it('should report inflight status', async () => {
    const dedup = new PollDeduplicator();

    let resolvePoll!: (value: PollResult) => void;
    const pollFn = jest.fn().mockReturnValue(
      new Promise<PollResult>(resolve => { resolvePoll = resolve; })
    );

    const promise = dedup.deduplicate('http://example.com/health', pollFn);

    expect(dedup.isInflight('http://example.com/health')).toBe(true);
    expect(dedup.size).toBe(1);

    resolvePoll(createResult());
    await promise;

    expect(dedup.isInflight('http://example.com/health')).toBe(false);
    expect(dedup.size).toBe(0);
  });

  it('should clear all inflight tracking', async () => {
    const dedup = new PollDeduplicator();

    // Create two pending polls but don't await them
    dedup.deduplicate('http://a.com/health', () => new Promise(() => {}));
    dedup.deduplicate('http://b.com/health', () => new Promise(() => {}));

    expect(dedup.size).toBe(2);

    dedup.clear();

    expect(dedup.size).toBe(0);
    expect(dedup.isInflight('http://a.com/health')).toBe(false);
  });

  it('should share rejection with all callers', async () => {
    const dedup = new PollDeduplicator();
    const error = new Error('Connection refused');

    let rejectPoll!: (error: Error) => void;
    const pollFn = jest.fn().mockReturnValue(
      new Promise<PollResult>((_resolve, reject) => { rejectPoll = reject; })
    );

    const promise1 = dedup.deduplicate('http://example.com/health', pollFn);
    const promise2 = dedup.deduplicate('http://example.com/health', pollFn);

    rejectPoll(error);

    await expect(promise1).rejects.toThrow('Connection refused');
    await expect(promise2).rejects.toThrow('Connection refused');
  });
});
