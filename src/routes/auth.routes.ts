import { Router } from 'express';
import { authLimiter } from '../middleware/security.ts';
import { register, login, refresh, logout, me } from '../controllers/auth.controller.ts';
import { authenticate } from '../middleware/authenticate.ts';
import { validateBody } from '../middleware/validate.ts';
import { registerSchema, loginSchema, refreshSchema } from '../validators/auth.validator.ts';

const router = Router();
router.use(authLimiter);
router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.post('/refresh', validateBody(refreshSchema), refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, me);
export default router;
