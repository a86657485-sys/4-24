import express from "express";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

// Support ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the db is stored in the workspace root or a data folder.
// Using a local file 'learning_records.sqlite'
const db = new Database("learning_records.sqlite", { verbose: console.log });

// Initialize database schema
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playerName TEXT NOT NULL,
    stage INTEGER NOT NULL,
    score INTEGER NOT NULL,
    failCount INTEGER DEFAULT 0,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies
  app.use(express.json());

  // --- API Routes ---

  // GET /api/health
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // POST /api/records - Save a student's learning record
  app.post("/api/records", (req, res) => {
    const { playerName, stage, score, failCount, details } = req.body;
    
    try {
      const stmt = db.prepare(`
        INSERT INTO records (playerName, stage, score, failCount, details)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const info = stmt.run(
        playerName || "Unknown", 
        stage || 0, 
        score || 0, 
        failCount || 0, 
        details ? JSON.stringify(details) : "{}"
      );
      
      res.json({ success: true, id: info.lastInsertRowid });
    } catch (err) {
      console.error("Error inserting record:", err);
      // @ts-ignore
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/records - Retrieve all records for the dashboard
  app.get("/api/records", (req, res) => {
    try {
      const stmt = db.prepare("SELECT * FROM records ORDER BY timestamp DESC");
      const rows = stmt.all();
      
      // Parse JSON details back into objects for easier client usage
      const parsedRows = rows.map((row: any) => ({
        ...row,
        details: row.details ? JSON.parse(row.details) : {}
      }));
      
      res.json(parsedRows);
    } catch (err) {
      console.error("Error fetching records:", err);
      // @ts-ignore
      res.status(500).json({ error: err.message });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    // Dynamic import inside a condition limits it to development only
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
