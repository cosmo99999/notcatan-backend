import express from 'express';
import cors from 'cors';
import { AcceptTrade, buildBoard, FourPlayerPreGameOrder, getEmptyGame, GlobalActions, randomizeBoard, seed, ThreePlayerPreGameOrder, TwoPlayerPreGameOrder, type Game, type Player } from '@cosmo99999/notcatan-shared';

import 'dotenv/config';
import helmet from 'helmet';


const app = express();
const PORT = 3000;
app.use(cors());
app.use(express.json());

const allowedOrigins = process.env.ALLOWED_ORIGINS!.split(',').map(o => o.trim());

app.use(cors({
  origin: allowedOrigins,
  exposedHeaders: ['Content-Disposition']
}));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const secretkey = process.env.GAME_KEY;
let game: Game = getEmptyGame();

let actionCounter = 0;
const actionsList: action[] = [];

interface action {
  id?: number;
  sentById?: number;
  func: string;
  args: any[];
}
function aJson(a: action) {
  return { func: a.func, args: a.args };
}



function init() {
  game = buildBoard(game);
  game = randomizeBoard(game);
}
init();

function addPlayer(n: string): string | undefined {
  if (game!.players.length == 4) {
    return undefined;
  }
  const guid = crypto.randomUUID();
  console.log("player added: ");
  console.log(guid);
  const id = game!.players.length;
  const newPlayer: Player = {
    id: id,
    name: n,
    guid: guid,
    victoryPoints: 0,
    devCards: [],
    resources: [],
    colour: id,
    structureIds: [],
    playedDevThisTurn: false,
  }
  game!.players.push(newPlayer);
  return guid;
}
function validateGuid(req: express.Request, res: express.Response): boolean {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.json({ success: false });
    return false;
  }
  let found = false;
  game.players.forEach((p) => {
    if (p.guid == token) {
      found = true;
    }
  })
  if (!found) {
    res.json({ success: false });
  }
  return found;
}

app.post('/login', async (req, res) => {
  const { key, name } = req.body;
  console.log("req for login");
  if (key == secretkey) {
    const result = addPlayer(name);
    if (!result) {
      res.send({ success: false, messfetchage: "Already has 4 players" })
      return;
    } else {
      console.log("valid login");
      res.send({ success: true, token: result })
      return;
    }
  }
  res.send({ success: false, message: "Invalid key" })

});
app.get('/game', async (req, res) => {

  const guid = req.headers.authorization?.split(' ')[1];
  if (!validateGuid(req, res)) {
    return;
  }
  console.log("Returning whole game");
  console.log(game.currentTurnPlayerId);
  res.status(200).json({ success: true, game: game, id: guid });
});
app.get('/game/new', async (req, res) => {
  const players = game.players;
  game = getEmptyGame();
  init();
  game.players = players;

  res.json(game);
});
app.post('/game/begin', async (req, res) => {
  game.currentTurnPlayerId = 0;
  switch (game.players.length) {
    case 2: game.gameStartTurnOrders = TwoPlayerPreGameOrder; break;
    case 3: game.gameStartTurnOrders = ThreePlayerPreGameOrder; break;
    case 4: game.gameStartTurnOrders = FourPlayerPreGameOrder; break;
  }
  res.send({});
});
app.post('/action/:pId', async (req, res) => {
  if (!validateGuid(req, res)) {
    console.log("invalid");
    return;
  }
  const { pId } = req.params;
  const a: action = req.body;
  a.sentById = Number(pId);
  const f = GlobalActions.find(fu => fu.name == a.func)! as ((...args: any[]) => any);
  game = f(...a.args, game);
  a.id = actionCounter++;
  game.latestActionId = a.id!;
  actionsList.push(a);
  res.send({});
});
app.get('/action/:actionId/player/:pId', async (req, res) => {
  const { actionId, pId } = req.params;
  if (actionsList.length == 0) {
    res.json({ update: false })
    return;
  }
  const latest = actionsList[actionsList.length - 1]!.id;

  if (Number(actionId) == latest) {
    res.json({ update: false })
    return;
  }
  const newActions = actionsList.filter(a => a.id! > Number(actionId) && a.sentById! !== Number(pId)).sort((a, b) => a.id! - b.id!).map(a => aJson(a));
  console.log("Recieved PID :");
  console.log(pId);
  console.log("Recieved AID :");
  console.log(actionId);
  console.log("Latest AID :");
  console.log(latest);
  console.log(newActions);
  console.log(game.latestActionId);
  res.json({ update: true, actions: newActions, latestId: game.latestActionId });
});
app.post('/tradeAccept/:pId', async (req, res) => {
  if (!validateGuid(req, res)) {
    console.log("invalid");
    return;
  }
  const { pId } = req.params;
  console.log("PLayer: wants to trade");
  console.log(pId);
  console.log(game.liveTradeOffer);
  if (game.liveTradeOffer) {
    const a: action = { func: "AcceptTrade", args: [pId] };
    a.id = actionCounter++;
    game.latestActionId = a.id!;
    a.sentById = -1;
    const f = GlobalActions.find(fu => fu.name == "AcceptTrade")! as ((...args: any[]) => any);
    game = f(...a.args, game);
    actionsList.push(a);
    res.send({ success: true });
    return;
  }
  res.send({ success: false });
});

app.post('/game/reset', async (req, res) => {
  game = getEmptyGame();
  init();
  res.json({ message: 'game reset' });
});

app.listen(PORT, () => {
  console.log(`app listening on port ${PORT}`);
});


