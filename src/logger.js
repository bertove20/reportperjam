import pino from 'pino';

export const logger = pino({
  level: 'info',
  transport: {
    targets: [
      { target: 'pino/file', options: { destination: 'logs/bot.log', mkdir: true } },
      { target: 'pino-pretty', options: { colorize: true } }
    ]
  }
});
