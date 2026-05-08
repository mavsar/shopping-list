import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";

import { ensureBootstrapAdmin } from "./auth/bootstrap-admin.js";
import { sqlite } from "./db/client.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { itemsRouter } from "./routes/items.js";
import { listsRouter } from "./routes/lists.js";
import { usersRouter } from "./routes/users.js";

ensureBootstrapAdmin();

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/lists", listsRouter);
app.use("/api/items", itemsRouter);

app.get("/api/version", (_req, res) => {
  const [{ version }] = sqlite.prepare("SELECT sqlite_version() AS version").all() as Array<{ version: string }>;
  res.json({ sqliteVersion: version });
});

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);
const webDistPath = path.resolve(currentDirectoryPath, "..", "..", "web", "dist");
const itemImagesDirectoryPath = path.resolve(currentDirectoryPath, "..", "storage", "item-images");

if (!fs.existsSync(itemImagesDirectoryPath)) {
  fs.mkdirSync(itemImagesDirectoryPath, { recursive: true });
}

app.use("/api/item-images", express.static(itemImagesDirectoryPath));
app.use("/item-images", express.static(itemImagesDirectoryPath));

if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webDistPath, "index.html"));
  });
} else {
  app.get("*", (_req, res) => {
    res.status(503).json({
      error: "Frontend build not found. Run npm run build -w @shopping-list/web."
    });
  });
}

app.listen(port, () => {
  console.log(`Shopping list app listening on port ${port}`);
});
