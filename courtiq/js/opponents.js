// CourtIQ — Estatísticas de adversários por número de camisa
import { calcPlayerStats } from './stats.js';

// Agrupa eventos de adversários por (opponent, jersey_number)
// Retorna: { "Time X": { 7: { pts, reb, ast, ... }, 10: { ... } } }
export function groupOppStatsByJersey(events, games) {
  const gameMap = Object.fromEntries(games.map(g => [g.id, g]));

  // { opponentName: { jersey: [events] } }
  const byOppJersey = {};

  events.forEach(ev => {
    if (ev.player_id != null || ev.opp_jersey_number == null) return;
    const game = gameMap[ev.game_id];
    if (!game) return;
    const opp = game.opponent;
    if (!byOppJersey[opp]) byOppJersey[opp] = {};
    const j = ev.opp_jersey_number;
    if (!byOppJersey[opp][j]) byOppJersey[opp][j] = [];
    byOppJersey[opp][j].push(ev);
  });

  // Calcular stats para cada (opponent, jersey)
  const result = {};
  for (const opp of Object.keys(byOppJersey)) {
    result[opp] = {};
    for (const jersey of Object.keys(byOppJersey[opp])) {
      result[opp][jersey] = calcPlayerStats(byOppJersey[opp][jersey]);
    }
  }
  return result;
}

// Retorna lista de adversários únicos a partir dos jogos encerrados
export function getUniqueOpponents(games) {
  const seen = new Set();
  return games
    .filter(g => g.status === 'finished')
    .map(g => g.opponent)
    .filter(opp => {
      if (seen.has(opp)) return false;
      seen.add(opp);
      return true;
    });
}

// Retorna o record (vitórias/derrotas) contra um adversário específico
export function getHeadToHeadRecord(games, opponentName) {
  const confrontos = games.filter(
    g => g.status === 'finished' && g.opponent === opponentName
  );
  const wins = confrontos.filter(g => g.our_score != null && g.opp_score != null && g.our_score > g.opp_score).length;
  const losses = confrontos.length - wins;
  return { wins, losses, total: confrontos.length, games: confrontos };
}

// Calcula as médias do nosso time nos jogos contra um adversário
export function getOurAveragesVs(opponentGames, allEvents) {
  if (!opponentGames.length) return null;
  const gameIds = new Set(opponentGames.map(g => g.id));
  const relevantEvents = allEvents.filter(e => gameIds.has(e.game_id) && e.player_id != null);

  // Agrupa por jogo para calcular médias
  const byGame = {};
  relevantEvents.forEach(e => {
    if (!byGame[e.game_id]) byGame[e.game_id] = [];
    byGame[e.game_id].push(e);
  });

  const games = Object.values(byGame);
  if (!games.length) return null;

  const totals = games.map(evs => calcPlayerStats(evs));
  const n = totals.length;
  const totalFgMade = totals.reduce((a, b) => a + b.fgMade, 0);
  const totalFgAtt  = totals.reduce((a, b) => a + b.fgAtt, 0);

  return {
    pts:   +(totals.reduce((a, b) => a + b.pts, 0) / n).toFixed(1),
    reb:   +(totals.reduce((a, b) => a + b.reb, 0) / n).toFixed(1),
    ast:   +(totals.reduce((a, b) => a + b.ast, 0) / n).toFixed(1),
    stl:   +(totals.reduce((a, b) => a + b.stl, 0) / n).toFixed(1),
    fgPct: totalFgAtt > 0 ? Math.round(totalFgMade / totalFgAtt * 100) : 0,
    gamesPlayed: n,
  };
}
