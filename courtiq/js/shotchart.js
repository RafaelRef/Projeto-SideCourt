// CourtIQ — Shot Chart SVG interativo
// ViewBox: 0 0 560 300 (proporção FIBA 28m x 15m)

const COURT_ELEMENTS = `
<defs>
  <pattern id="parquet" width="20" height="20" patternUnits="userSpaceOnUse">
    <rect width="20" height="20" fill="#7c5c2e"/>
    <rect width="10" height="10" fill="#8b6834"/>
    <rect x="10" y="10" width="10" height="10" fill="#8b6834"/>
  </pattern>
</defs>
<rect width="560" height="300" fill="url(#parquet)"/>
<rect x="2" y="2" width="556" height="296" fill="none" stroke="#fff" stroke-width="2"/>
<line x1="280" y1="2" x2="280" y2="298" stroke="#fff" stroke-width="1.5"/>
<circle cx="280" cy="150" r="36" fill="none" stroke="#fff" stroke-width="1.5"/>
<circle cx="280" cy="150" r="3" fill="#fff"/>
<rect x="2" y="87" width="142" height="126" fill="none" stroke="#fff" stroke-width="1.5"/>
<path d="M 144 87 A 63 63 0 0 1 144 213" fill="none" stroke="#fff" stroke-width="1.5"/>
<path d="M 2 52 L 60 52 A 195 195 0 0 1 60 248 L 2 248" fill="none" stroke="#fff" stroke-width="1.5"/>
<rect x="2" y="133" width="8" height="34" fill="none" stroke="#fff" stroke-width="1.5"/>
<circle cx="36" cy="150" r="9" fill="none" stroke="#ff6b35" stroke-width="2"/>
<line x1="10" y1="150" x2="27" y2="150" stroke="#ff6b35" stroke-width="1.5"/>
<rect x="416" y="87" width="142" height="126" fill="none" stroke="#fff" stroke-width="1.5"/>
<path d="M 416 87 A 63 63 0 0 0 416 213" fill="none" stroke="#fff" stroke-width="1.5"/>
<path d="M 558 52 L 500 52 A 195 195 0 0 0 500 248 L 558 248" fill="none" stroke="#fff" stroke-width="1.5"/>
<rect x="550" y="133" width="8" height="34" fill="none" stroke="#fff" stroke-width="1.5"/>
<circle cx="524" cy="150" r="9" fill="none" stroke="#ff6b35" stroke-width="2"/>
<line x1="550" y1="150" x2="533" y2="150" stroke="#ff6b35" stroke-width="1.5"/>
<g id="shot-layer"></g>
`;

/** Desenha a quadra num elemento SVG sem interatividade */
export function drawCourt(svgEl) {
  svgEl.setAttribute('viewBox', '0 0 560 300');
  svgEl.innerHTML = COURT_ELEMENTS;
}

/**
 * Inicializa o shot chart interativo num SVG.
 * @param {SVGElement} svgEl
 * @param {function(x: number, y: number): void} [onShotPlaced] - chamado ao clicar na quadra em modo ativo
 */
export function initShotChart(svgEl, onShotPlaced) {
  drawCourt(svgEl);
  svgEl._shotActive = false;

  // Crosshair
  const crosshair = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  crosshair.id = 'crosshair';
  crosshair.style.display = 'none';
  crosshair.innerHTML = `
    <line id="ch-h" stroke="#3b82f6" stroke-width="1" stroke-dasharray="4 2"/>
    <line id="ch-v" stroke="#3b82f6" stroke-width="1" stroke-dasharray="4 2"/>
    <circle r="5" fill="none" stroke="#3b82f6" stroke-width="1.5"/>
  `;
  svgEl.appendChild(crosshair);

  svgEl.addEventListener('mousemove', (e) => {
    if (!svgEl._shotActive) return;
    const { x, y } = svgCoords(svgEl, e);
    moveCrosshair(crosshair, x, y);
    crosshair.style.display = '';
  });

  svgEl.addEventListener('mouseleave', () => { crosshair.style.display = 'none'; });

  svgEl.addEventListener('click', (e) => {
    if (!svgEl._shotActive || !onShotPlaced) return;
    const { x, y } = svgCoords(svgEl, e);
    svgEl._shotActive = false;
    svgEl.style.cursor = '';
    crosshair.style.display = 'none';
    onShotPlaced(x, y);
  });
}

/** Ativa o modo de seleção de local */
export function activateShotMode(svgEl) {
  svgEl._shotActive = true;
  svgEl.style.cursor = 'crosshair';
}

/** Desativa o modo de seleção */
export function deactivateShotMode(svgEl) {
  svgEl._shotActive = false;
  svgEl.style.cursor = '';
  const ch = document.getElementById('crosshair');
  if (ch) ch.style.display = 'none';
}

/**
 * Renderiza todos os arremessos no SVG.
 * @param {SVGElement} svgEl
 * @param {Array} shots - eventos com shot_x, shot_y, type, player_id
 * @param {'all'|'made'|'missed'} filter
 * @param {string|null} activePlayerId - destaca arremessos da atleta selecionada
 */
export function renderShots(svgEl, shots, filter = 'all', activePlayerId = null) {
  let layer = svgEl.querySelector('#shot-layer');
  if (!layer) {
    layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.id = 'shot-layer';
    svgEl.appendChild(layer);
  }
  layer.innerHTML = '';

  const filtered = shots.filter(s => {
    if (s.shot_x == null || s.shot_y == null) return false;
    const made = s.type === '2pt_made' || s.type === '3pt_made';
    if (filter === 'made' && !made) return false;
    if (filter === 'missed' && made) return false;
    return true;
  });

  filtered.forEach(s => {
    const made = s.type === '2pt_made' || s.type === '3pt_made';
    const isActive = !activePlayerId || s.player_id === activePlayerId;
    const opacity = isActive ? 1 : 0.3;
    layer.appendChild(makeShotDot(s.shot_x, s.shot_y, made, opacity));
  });
}

/**
 * Adiciona um ponto com animação de ripple.
 * @param {SVGElement} svgEl
 * @param {object} shot - { shot_x, shot_y, type }
 */
export function addShot(svgEl, shot) {
  let layer = svgEl.querySelector('#shot-layer');
  if (!layer) { layer = document.createElementNS('http://www.w3.org/2000/svg', 'g'); layer.id = 'shot-layer'; svgEl.appendChild(layer); }
  const made = shot.type === '2pt_made' || shot.type === '3pt_made';
  const dot = makeShotDot(shot.shot_x, shot.shot_y, made, 1);

  // Ripple
  const ripple = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ripple.setAttribute('cx', shot.shot_x);
  ripple.setAttribute('cy', shot.shot_y);
  ripple.setAttribute('r', '9');
  ripple.setAttribute('fill', 'none');
  ripple.setAttribute('stroke', made ? '#22c55e' : '#ef4444');
  ripple.setAttribute('stroke-width', '2');
  ripple.style.opacity = '0.8';
  layer.appendChild(ripple);

  // Animar ripple
  let r = 9, op = 0.8;
  const anim = setInterval(() => {
    r += 2; op -= 0.1;
    ripple.setAttribute('r', r);
    ripple.style.opacity = Math.max(op, 0);
    if (op <= 0) { clearInterval(anim); layer.removeChild(ripple); }
  }, 30);

  layer.appendChild(dot);
}

/** Remove todos os arremessos do SVG */
export function clearShots(svgEl) {
  const layer = svgEl.querySelector('#shot-layer');
  if (layer) layer.innerHTML = '';
}

/**
 * Calcula stats de arremessos para uma atleta.
 * @param {Array} shots
 * @param {string|null} playerId
 * @returns {{ total: number, made: number, missed: number, pct: string }}
 */
export function getShotStats(shots, playerId = null) {
  const relevant = shots.filter(s => {
    if (s.shot_x == null) return false;
    if (playerId && s.player_id !== playerId) return false;
    return true;
  });
  const made = relevant.filter(s => s.type === '2pt_made' || s.type === '3pt_made').length;
  const total = relevant.length;
  const missed = total - made;
  const pct = total > 0 ? Math.round(made / total * 100) + '%' : '0%';
  return { total, made, missed, pct };
}

// --- Helpers internos ---

function svgCoords(svgEl, e) {
  const rect = svgEl.getBoundingClientRect();
  const vb = svgEl.viewBox.baseVal;
  const x = (e.clientX - rect.left) / rect.width * (vb.width || 560);
  const y = (e.clientY - rect.top) / rect.height * (vb.height || 300);
  return { x, y };
}

function moveCrosshair(g, x, y) {
  g.querySelector('circle').setAttribute('cx', x);
  g.querySelector('circle').setAttribute('cy', y);
  g.querySelector('#ch-h').setAttribute('x1', 0);
  g.querySelector('#ch-h').setAttribute('x2', 560);
  g.querySelector('#ch-h').setAttribute('y1', y);
  g.querySelector('#ch-h').setAttribute('y2', y);
  g.querySelector('#ch-v').setAttribute('x1', x);
  g.querySelector('#ch-v').setAttribute('x2', x);
  g.querySelector('#ch-v').setAttribute('y1', 0);
  g.querySelector('#ch-v').setAttribute('y2', 300);
}

function makeShotDot(x, y, made, opacity) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.style.opacity = opacity;

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', '9');
  circle.setAttribute('fill', made ? '#22c55e' : '#ef4444');
  circle.setAttribute('stroke', '#fff');
  circle.setAttribute('stroke-width', '1.5');
  g.appendChild(circle);

  if (!made) {
    // X sobre o ponto errado
    const size = 5;
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', x - size); line1.setAttribute('y1', y - size);
    line1.setAttribute('x2', x + size); line1.setAttribute('y2', y + size);
    line1.setAttribute('stroke', '#fff'); line1.setAttribute('stroke-width', '2');
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', x + size); line2.setAttribute('y1', y - size);
    line2.setAttribute('x2', x - size); line2.setAttribute('y2', y + size);
    line2.setAttribute('stroke', '#fff'); line2.setAttribute('stroke-width', '2');
    g.appendChild(line1);
    g.appendChild(line2);
  }

  return g;
}
