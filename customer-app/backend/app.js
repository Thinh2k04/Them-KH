// Imports
const express = require('express');
const routes = require('./routes');
const app = express();

// Constants
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(express.json());

// Main logic
app.use('/api', routes);

// Export
module.exports = app;
