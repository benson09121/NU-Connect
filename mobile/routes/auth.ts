import { Router } from 'express';
import authController from '../controllers/authController';
import { validateAzureJWTMobile } from '../../middlewares/middleWare';

const router = Router();

// Keep POST /login for backward compatibility with existing mobile clients.
router.post('/login', validateAzureJWTMobile, authController.login);
router.get('/login', validateAzureJWTMobile, authController.login);

router.post('/register', authController.register);
router.get('/programs', authController.getAllPrograms);

export default router;
