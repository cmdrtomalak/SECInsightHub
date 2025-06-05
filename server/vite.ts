import express, { type Express, Router } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(server: Server): Promise<Router> {
  const router = Router();

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
    base: '/reader/',
  });

  router.use(vite.middlewares);
  router.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );

      const viteBase = vite.config.base; // Should be /reader/
      let urlForTransform = req.originalUrl;

      if (urlForTransform.startsWith(viteBase)) {
        // Remove the base prefix to get the path relative to the base
        // e.g., if originalUrl is /reader/foo, and base is /reader/, result is foo
        urlForTransform = urlForTransform.substring(viteBase.length);
        // Ensure it starts with a slash for Vite, e.g., /foo
        if (!urlForTransform.startsWith('/')) {
          urlForTransform = '/' + urlForTransform;
        }
      } else if (urlForTransform + '/' === viteBase) {
        // Handle case where originalUrl is /reader and base is /reader/
        urlForTransform = '/';
      }
      // If urlForTransform became empty (e.g. originalUrl was exactly the base like /reader/), ensure it's '/'
      if (urlForTransform === '') {
          urlForTransform = '/';
      }
      const page = await vite.transformIndexHtml(urlForTransform, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  return router;
}

export function serveStatic(): Router {
  const router = Router();
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  router.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  router.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });

  return router;
}
