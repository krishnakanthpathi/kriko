import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/config.js';
import { requestLogger } from './middleware/loggingMiddleware.js';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware.js';
import routes from './routes/index.js';
import clipboardObserver from './services/clipboardObserver.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 1. Core Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// 2. Serve Static Frontend files
app.use(express.static(path.join(__dirname, '../public')));

// 3. API Routes
app.use('/api', routes);

// 4. Fallback Page Not Found Handler
app.use(notFoundHandler);

// 5. Global Error Handler
app.use(errorHandler);

// Start the server
const server = app.listen(config.PORT, () => {
  console.log('\x1b[32m%s\x1b[0m', `==================================================`);
  console.log('\x1b[32m%s\x1b[0m', ` Kriko Assistant Server listening on port ${config.PORT}`);
  console.log('\x1b[32m%s\x1b[0m', ` Local:   http://localhost:${config.PORT}`);
  console.log('\x1b[32m%s\x1b[0m', ` Platform: ${process.platform} (macOS: ${config.IS_MACOS})`);
  console.log('\x1b[32m%s\x1b[0m', ` USE_KOKORO (TTS): ${config.USE_KOKORO}`);
  console.log('\x1b[32m%s\x1b[0m', `==================================================`);

  // Start background clipboard voice observer
  clipboardObserver.start();
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Shutting down gracefully...');
  server.close(() => {
    console.log('Http server closed.');
  });
});
