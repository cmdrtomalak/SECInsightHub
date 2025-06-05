import express, { type Request, Response, NextFunction, Router } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import http from 'http';

const app = express();

const server = http.createServer(app);

const readerRouter = Router();

// Increase payload size limit - place this early
readerRouter.use(express.json({ limit: '50mb' })); // For JSON payloads
readerRouter.use(express.urlencoded({ limit: '50mb', extended: true })); // For URL-encoded payloads

readerRouter.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // if (capturedJsonResponse) {
      //   logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      // }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(readerRouter);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    const viteRouter = await setupVite(server);
    readerRouter.use(viteRouter);
  } else {
    const staticRouter = serveStatic();
    readerRouter.use(staticRouter);
  }

  app.use('/reader', readerRouter);

  // The final error handler can be on the main app.
  // It will catch errors that bubble up from the readerRouter.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    // It's often better to log the error rather than re-throwing it in a final handler
    console.error(err);
  });

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
