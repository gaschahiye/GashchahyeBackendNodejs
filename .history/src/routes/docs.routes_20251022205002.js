const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const express = require('express');
const app = express();
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Seller API',
      version: '1.0.0',
      description: 'Seller management API documentation',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
  },
  apis: ['./src/routes/*.js'], // path to your route files
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

module.exports = router;
