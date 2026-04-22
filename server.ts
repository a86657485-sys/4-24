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
  app.use(express.json({ limit: '50mb' }));

  // --- API Routes ---

  // GET /admin - Serve the independent Teacher Dashboard
  app.get("/admin", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="zh">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>西游词云 - 教师独立数据大屏</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-900 text-white p-8 font-sans">
        <div class="max-w-6xl mx-auto">
            <div class="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
                <h1 class="text-3xl font-bold text-amber-400">📊 独立数据看板 (本地部署版)</h1>
                <div class="flex gap-4">
                    <a href="/" class="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm font-bold transition">返回学生端</a>
                    <button onclick="fetchData()" class="bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded text-sm font-bold transition">↻ 刷新数据</button>
                </div>
            </div>
            
            <div id="data-container" class="grid gap-4">
                <p class="text-slate-400">正在加载数据...</p>
            </div>
        </div>

        <script>
            async function fetchData() {
                try {
                    const res = await fetch('/api/records');
                    const records = await res.json();
                    const container = document.getElementById('data-container');
                    
                    if (records.length === 0) {
                        container.innerHTML = '<div class="p-8 text-center bg-slate-800 rounded-lg text-slate-400">暂无学生数据。学生通关后数据会显示在这里。</div>';
                        return;
                    }

                    container.innerHTML = records.map(r => {
                        let extraHtml = '';
                        if (r.details && r.details.wordCloudImage) {
                            extraHtml = '<div class="mt-4 border-t border-slate-600 pt-4"><p class="text-sm text-slate-400 mb-2">生成的词云图：</p><img src="' + r.details.wordCloudImage + '" class="w-full max-w-sm rounded border border-slate-600" /></div>';
                        }
                        return '<div class="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">' +
                               '<div class="flex justify-between items-start">' +
                                 '<div>' +
                                   '<h3 class="text-xl font-bold text-emerald-400">👤 ' + (r.playerName || '未知学生') + ' <span class="text-sm font-normal text-slate-400 ml-2">🕒 ' + r.timestamp + '</span></h3>' +
                                   '<p class="mt-2 text-amber-300 font-bold">完成关卡：第 ' + r.stage + ' 关 | 获得金币：' + r.score + '</p>' +
                                 '</div>' +
                               '</div>' +
                               '<div class="mt-4 bg-slate-900 p-4 rounded text-sm font-mono text-slate-300 overflow-auto max-h-40">' +
                                 '详细探针分析：<br/>' + JSON.stringify(r.details, null, 2) + extraHtml +
                               '</div>' +
                               '</div>';
                    }).join('');
                } catch (e) {
                    console.error(e);
                }
            }
            fetchData();
            setInterval(fetchData, 5000); // 每5秒自动刷新
        </script>
    </body>
    </html>
    `);
  });

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
