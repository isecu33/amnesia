/** Arranque del servidor — docs/02 §8. */
import { createServer } from 'node:http';
import { Server } from 'colyseus';
import cors from 'cors';
import express from 'express';
import { TotemRoom } from './room.js';
import { makeRoomCode } from './codes.js';

const port = Number(process.env['PORT'] ?? 2567);
const app = express();
app.use(cors());
app.use(express.json());
app.get('/hc', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

const gameServer = new Server({ server: createServer(app) });
gameServer.define('totem_room', TotemRoom).filterBy(['code']);

gameServer
  .listen(port)
  .then(() => console.log(JSON.stringify({ level: 'info', msg: 'listening', port })))
  .catch((err: unknown) => {
    console.error(JSON.stringify({ level: 'error', msg: String(err) }));
    process.exit(1);
  });

export { TotemRoom, makeRoomCode };
