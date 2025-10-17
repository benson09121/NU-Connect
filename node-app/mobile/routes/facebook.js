const express = require('express');
const router = express.Router();
const facebookController = require('../controllers/facebookController');

router.get('/facebook/posts', facebookController.getFacebookPosts);

router.get('/facebook/public-page/:pageId/posts', facebookController.getPublicPagePosts);

// Static Facebook posts endpoint
router.get('/facebook/static-posts', facebookController.getStaticFacebookPosts);

module.exports = router;
