// server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const express = require("express");
const { Command } = require("commander");

const program = new Command();

program
  .requiredOption("-h, --host <host>", "server host")
  .requiredOption("-p, --port <port>", "server port")
  .requiredOption("-c, --cache <cacheDir>", "cache directory");

program.parse(process.argv);
const options = program.opts();

const HOST = options.host;
const PORT = parseInt(options.port, 10);
const CACHE_DIR = path.resolve(options.cache);

// створюємо теку кешу, якщо її немає
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log(` Створено теку кешу: ${CACHE_DIR}`);
}

const app = express();

app.get("/", (req, res) => {
  res.send(" Сервер працює! Частина 1 виконана.");
});

const server = http.createServer(app);
server.listen(PORT, HOST, () => {
  console.log(` Сервер запущено на http://${HOST}:${PORT}`);
});
