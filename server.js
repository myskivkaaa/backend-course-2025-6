// --- server.js ---
// Імпорт необхідних модулів
const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const { Command } = require("commander");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

// Ініціалізація командного рядка
const program = new Command();
program
  .requiredOption("-h, --host <host>", "server host")
  .requiredOption("-p, --port <port>", "server port")
  .requiredOption("-c, --cache <cacheDir>", "cache directory");
program.parse(process.argv);
const options = program.opts();

// --- Параметри сервера ---
const HOST = options.host;
const PORT = parseInt(options.port, 10);
const CACHE_DIR = path.resolve(options.cache);

// --- Створюємо теку для кешу ---
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log(` Створено теку кешу: ${CACHE_DIR}`);
}

// --- Ініціалізація Express ---
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Підготовка директорій для файлів і бази ---
const UPLOADS_DIR = path.join(CACHE_DIR, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
const DB_FILE = path.join(CACHE_DIR, "inventory.json");
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

// --- Допоміжні функції ---
function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- Налаштування multer для завантаження файлів ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`),
});
const upload = multer({ storage });

// --- Ендпоінти ---
app.get("/RegisterForm.html", (req, res) => {
  res.sendFile(path.join(__dirname, "RegisterForm.html"));
});

app.get("/SearchForm.html", (req, res) => {
  res.sendFile(path.join(__dirname, "SearchForm.html"));
});

// --- POST /register ---
app.post("/register", upload.single("photo"), (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name || inventory_name.trim() === "") {
    return res.status(400).json({ error: "Inventory name is required" });
  }

  const newItem = {
    id: uuidv4(),
    name: inventory_name,
    description: description || "",
    photo_path: req.file ? req.file.filename : null,
  };

  const db = readDB();
  db.push(newItem);
  writeDB(db);

  res.status(201).json(newItem);
});

// --- GET /inventory ---
app.get("/inventory", (req, res) => {
  const db = readDB();
  const base = `${req.protocol}://${req.get("host")}`;
  const response = db.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    photo: item.photo_path ? `${base}/inventory/${item.id}/photo` : null,
  }));
  res.json(response);
});

// --- GET /inventory/:id ---
app.get("/inventory/:id", (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const item = db.find((x) => x.id === id);
  if (!item) return res.status(404).json({ error: "Not found" });

  const base = `${req.protocol}://${req.get("host")}`;
  res.json({
    id: item.id,
    name: item.name,
    description: item.description,
    photo: item.photo_path ? `${base}/inventory/${item.id}/photo` : null,
  });
});

// --- PUT /inventory/:id ---
app.put("/inventory/:id", (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  const db = readDB();
  const index = db.findIndex((x) => x.id === id);
  if (index === -1) return res.status(404).json({ error: "Not found" });

  if (name) db[index].name = name;
  if (description) db[index].description = description;
  writeDB(db);

  res.json(db[index]);
});

// --- GET /inventory/:id/photo ---
app.get("/inventory/:id/photo", (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const item = db.find((x) => x.id === id);
  if (!item || !item.photo_path) return res.status(404).send("Not found");

  const photoPath = path.join(UPLOADS_DIR, item.photo_path);
  if (!fs.existsSync(photoPath)) return res.status(404).send("Not found");

  res.set("Content-Type", "image/jpeg");
  res.sendFile(photoPath);
});

// --- PUT /inventory/:id/photo ---
app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const index = db.findIndex((x) => x.id === id);
  if (index === -1) return res.status(404).json({ error: "Not found" });

  if (db[index].photo_path) {
    const old = path.join(UPLOADS_DIR, db[index].photo_path);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }

  db[index].photo_path = req.file ? req.file.filename : null;
  writeDB(db);
  res.json(db[index]);
});

// --- DELETE /inventory/:id ---
app.delete("/inventory/:id", (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const index = db.findIndex((x) => x.id === id);
  if (index === -1) return res.status(404).json({ error: "Not found" });

  const item = db[index];
  if (item.photo_path) {
    const old = path.join(UPLOADS_DIR, item.photo_path);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }

  db.splice(index, 1);
  writeDB(db);
  res.json({ message: "Deleted successfully" });
});

// --- POST /search ---
app.post("/search", (req, res) => {
  const { id, has_photo } = req.body;
  const db = readDB();
  const item = db.find((x) => x.id === id);
  if (!item) return res.status(404).json({ error: "Not found" });

  const base = `${req.protocol}://${req.get("host")}`;
  let desc = item.description;
  if (has_photo) {
    desc += ` (Photo: ${item.photo_path ? base + "/inventory/" + item.id + "/photo" : "none"})`;
  }

  res.json({
    id: item.id,
    name: item.name,
    description: desc,
  });
});

// --- 405 для невірних методів ---
app.all("*", (req, res) => {
  res.status(405).send("Method not allowed");
});

// --- Запуск сервера ---
const server = http.createServer(app);
server.listen(PORT, HOST, () => {
  console.log(` Сервер запущено на http://${HOST}:${PORT}`);
});
