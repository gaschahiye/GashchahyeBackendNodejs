const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('../config/swagger-docs');

const router = express.Router();

router.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'LPG Management System API',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none'
  }
}));

router.get('/json', (req, res) => {
  res.json(swaggerDocument);
});

module.exports = router;
