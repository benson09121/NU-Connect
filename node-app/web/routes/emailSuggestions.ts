import { Router } from 'express';
import { validateAzureJWT } from '../../middlewares/middleWare';
import { getEmailSuggestions, getAllUserEmailSuggestions } from '../controllers/emailSuggestionController';

const router = Router();

router.get('/email-suggestions', validateAzureJWT, getEmailSuggestions);
router.get('/email-suggestions-all', validateAzureJWT, getAllUserEmailSuggestions);

export default router;
