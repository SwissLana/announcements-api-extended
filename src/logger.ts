import pino from 'pino';
const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'password', 'accessToken', 'refreshToken'],
});
export default logger;
