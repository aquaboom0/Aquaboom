// AquaRush Backend Entry Point
// This file starts the Express server

import app from './app.js';

const PORT = process.env.PORT || 3000;

console.log(`Starting AquaRush Backend on port ${PORT}...`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

// The actual server startup is handled in app.js
// This file is here for clarity and as an alternative entry point

export default app;