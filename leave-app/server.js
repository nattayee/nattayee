const http = require('node:http');
const { openDb } = require('./src/db');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || 'data.db';

const db = openDb(DB_FILE, { demoUsers: process.env.SEED_DEMO !== '0' });
const server = http.createServer(createApp(db));

server.listen(PORT, () => {
  console.log(`ระบบจัดการวันลาพร้อมใช้งานที่ http://localhost:${PORT}`);
});
