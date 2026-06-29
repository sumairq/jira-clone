import 'dotenv/config';
import 'reflect-metadata';
import express, { Express } from 'express';
import cors from 'cors';

import createDatabaseConnection from 'database/createConnection';
import { addRespondToResponse } from 'middleware/response';
import { authenticateUser } from 'middleware/authentication';
import { handleError } from 'middleware/errors';
import { RouteNotFoundError } from 'errors';

import { attachPublicRoutes, attachPrivateRoutes } from './routes';

// Cache the connection across warm serverless invocations so we only
// initialize a single DataSource per container.
let connectionPromise: Promise<unknown> | null = null;
const ensureDatabaseConnection = (): Promise<unknown> => {
  if (!connectionPromise) {
    connectionPromise = createDatabaseConnection().catch(error => {
      // Reset so the next request can retry instead of caching the failure.
      connectionPromise = null;
      throw error;
    });
  }
  return connectionPromise;
};

const createApp = (): Express => {
  const app = express();

  // Browser Origin headers never have a trailing slash or path, so the allowed
  // origins must not either. Configurable via CLIENT_ORIGIN (comma-separated).
  // The default includes the local dev client (webpack-dev-server on :8080) so
  // local development works without extra configuration.
  const allowedOrigins = (
    process.env.CLIENT_ORIGIN ||
    'http://localhost:8080,https://orbitclient-sepia.vercel.app'
  )
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''));

  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded());

  app.use(addRespondToResponse);

  app.use((_req, _res, next) => {
    ensureDatabaseConnection().then(() => next(), next);
  });

  attachPublicRoutes(app);

  app.use('/', authenticateUser);

  attachPrivateRoutes(app);

  app.use((req, _res, next) => next(new RouteNotFoundError(req.originalUrl)));
  app.use(handleError);

  return app;
};

const app = createApp();

// On Vercel (and other serverless platforms) the function must export the
// Express app; the platform handles incoming requests. Locally we listen.
if (!process.env.VERCEL) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server start on port ${port}`);
  });
}

export default app;
