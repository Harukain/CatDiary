import { redisConnectionFromUrl } from '@cat-diary/domain';
import { Queue } from 'bullmq';
import type { RedisConnectionOptions } from '@cat-diary/domain';

const queueNames = {
  scheduler: 'cat-diary-scheduler',
  notifications: 'cat-diary-notifications',
  exports: 'cat-diary-exports',
} as const;
type QueueName = keyof typeof queueNames;
type Command = 'status' | 'pause' | 'resume';

export interface QueueOperation {
  command: Command;
  queues: QueueName[];
}

interface OperableQueue {
  pause(): Promise<void>;
  resume(): Promise<void>;
  isPaused(): Promise<boolean>;
  getJobCounts(...types: Parameters<Queue['getJobCounts']>): ReturnType<Queue['getJobCounts']>;
  close(): Promise<void>;
}

export function parseQueueOperation(argv: string[]): QueueOperation {
  const normalized = argv[0] === '--' ? argv.slice(1) : argv;
  const [commandText, ...flags] = normalized;
  if (commandText !== 'status' && commandText !== 'pause' && commandText !== 'resume')
    throw new Error(usage());
  let requestedQueue: QueueName | 'all' = commandText === 'status' ? 'all' : ('' as QueueName);
  let confirmation: string | undefined;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (flag === '--queue' && value) {
      if (!(value in queueNames) && value !== 'all') throw new Error(`Unknown queue: ${value}`);
      requestedQueue = value as QueueName | 'all';
      index += 1;
    } else if (flag === '--confirm' && value) {
      confirmation = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete option: ${flag ?? ''}\n${usage()}`);
    }
  }
  if (!requestedQueue) throw new Error(`--queue is required for ${commandText}`);
  const queues =
    requestedQueue === 'all' ? (Object.keys(queueNames) as QueueName[]) : [requestedQueue];
  if (commandText !== 'status') {
    const expected = `${commandText.toUpperCase()}:${requestedQueue}`;
    if (confirmation !== expected)
      throw new Error(`Refusing ${commandText}: pass --confirm ${expected}`);
  }
  return { command: commandText, queues };
}

export async function runQueueOperation(
  operation: QueueOperation,
  redisUrl = process.env.REDIS_URL,
  queueFactory: (name: string, connection: RedisConnectionOptions) => OperableQueue = (
    name,
    connection,
  ) => new Queue(name, { connection }),
) {
  if (!redisUrl) throw new Error('REDIS_URL is required');
  const connection = redisConnectionFromUrl(redisUrl);
  const queues = operation.queues.map((name) => ({
    name,
    queue: queueFactory(queueNames[name], connection),
  }));
  try {
    const results = [];
    for (const { name, queue } of queues) {
      if (operation.command === 'pause') await queue.pause();
      if (operation.command === 'resume') await queue.resume();
      const [paused, counts] = await Promise.all([
        queue.isPaused(),
        queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused'),
      ]);
      results.push({ queue: name, paused, counts });
    }
    return { command: operation.command, results, timestamp: new Date().toISOString() };
  } finally {
    await Promise.all(queues.map(({ queue }) => queue.close()));
  }
}

function usage() {
  return [
    'Usage:',
    '  queue:ops status [--queue scheduler|notifications|exports|all]',
    '  queue:ops pause --queue <name|all> --confirm PAUSE:<name|all>',
    '  queue:ops resume --queue <name|all> --confirm RESUME:<name|all>',
  ].join('\n');
}

const entrypoint = process.argv[1]?.replaceAll('\\', '/');
if (entrypoint?.endsWith('/queue-operations.ts') || entrypoint?.endsWith('/queue-operations.js')) {
  runQueueOperation(parseQueueOperation(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
