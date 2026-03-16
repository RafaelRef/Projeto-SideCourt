// CourtIQ — Cálculo de estatísticas

export function calcPlayerStats(events) {
  const e = events || [];

  const pts2  = e.filter(ev => ev.type === '2pt_made').length * 2;
  const pts3  = e.filter(ev => ev.type === '3pt_made').length * 3;
  const ptsLL = e.filter(ev => ev.type === 'ft_made').length;
  const pts   = pts2 + pts3 + ptsLL;

  const fgMade  = e.filter(ev => ['2pt_made','3pt_made'].includes(ev.type)).length;
  const fgAtt   = e.filter(ev => ['2pt_made','2pt_miss','3pt_made','3pt_miss'].includes(ev.type)).length;
  const fgPct   = fgAtt > 0 ? Math.round(fgMade / fgAtt * 100) : 0;

  const threeMade = e.filter(ev => ev.type === '3pt_made').length;
  const threeAtt  = e.filter(ev => ['3pt_made','3pt_miss'].includes(ev.type)).length;
  const threePct  = threeAtt > 0 ? Math.round(threeMade / threeAtt * 100) : 0;

  const ftMade  = e.filter(ev => ev.type === 'ft_made').length;
  const ftAtt   = e.filter(ev => ['ft_made','ft_miss'].includes(ev.type)).length;
  const ftPct   = ftAtt > 0 ? Math.round(ftMade / ftAtt * 100) : 0;

  const reb  = e.filter(ev => ['reb_off','reb_def'].includes(ev.type)).length;
  const rebOff = e.filter(ev => ev.type === 'reb_off').length;
  const rebDef = e.filter(ev => ev.type === 'reb_def').length;
  const ast  = e.filter(ev => ev.type === 'ast').length;
  const stl  = e.filter(ev => ev.type === 'stl').length;
  const blk  = e.filter(ev => ev.type === 'blk').length;
  const to   = e.filter(ev => ev.type === 'to').length;
  const foul = e.filter(ev => ev.type === 'foul').length;

  return { pts, fgMade, fgAtt, fgPct, threeMade, threeAtt, threePct, ftMade, ftAtt, ftPct, reb, rebOff, rebDef, ast, stl, blk, to, foul };
}

export function calcPlayerAverages(eventsByGame) {
  const games = Object.values(eventsByGame || {});
  if (games.length === 0) return null;
  const totals = games.map(evs => calcPlayerStats(evs));
  const n = totals.length;
  const totalFgMade = totals.reduce((a, b) => a + b.fgMade, 0);
  const totalFgAtt  = totals.reduce((a, b) => a + b.fgAtt, 0);
  return {
    pts:   +(totals.reduce((a,b) => a + b.pts, 0)  / n).toFixed(1),
    reb:   +(totals.reduce((a,b) => a + b.reb, 0)  / n).toFixed(1),
    ast:   +(totals.reduce((a,b) => a + b.ast, 0)  / n).toFixed(1),
    stl:   +(totals.reduce((a,b) => a + b.stl, 0)  / n).toFixed(1),
    fgPct: totalFgAtt > 0 ? Math.round(totalFgMade / totalFgAtt * 100) : 0,
  };
}

export function calcBoxScore(events, players) {
  // events: todos os eventos do jogo
  // players: array de atletas do jogo
  return players.map(p => {
    const evs = events.filter(e => e.player_id === p.id);
    const st = calcPlayerStats(evs);
    return { player: p, ...st };
  }).sort((a, b) => b.pts - a.pts);
}

export function calcTeamScore(events) {
  return events.reduce((pts, e) => {
    if (e.type === '2pt_made') return pts + 2;
    if (e.type === '3pt_made') return pts + 3;
    if (e.type === 'ft_made')  return pts + 1;
    return pts;
  }, 0);
}

export function calcScoreByQuarter(events) {
  const quarters = { 1: 0, 2: 0, 3: 0, 4: 0 };
  events.forEach(e => {
    const q = e.quarter || 1;
    if (e.type === '2pt_made') quarters[q] += 2;
    else if (e.type === '3pt_made') quarters[q] += 3;
    else if (e.type === 'ft_made')  quarters[q] += 1;
  });
  return quarters;
}
