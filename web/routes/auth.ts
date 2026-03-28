import {Router} from 'express';
import authController from '../controllers/authController';
import {validateAzureJWT} from '../../middlewares/middleWare';


const router = Router();
router.get('/login', validateAzureJWT, authController.login);
router.get('/users', validateAzureJWT, authController.login);
// router.get('/permissions', middleware.validateAzureJWT, authController.getPermissions);
router.post('/register', authController.register);

export default router;
