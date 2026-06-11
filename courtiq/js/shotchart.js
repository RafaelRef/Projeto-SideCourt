// CourtIQ — Shot Chart SVG interativo
// ViewBox: 0 0 560 300 (proporção FIBA 28m x 15m)

// Paleta da quadra — integrada ao design system escuro do app.
const LINE = '#4d5a78';        // linhas gerais
const LINE_HI = '#7c8db5';     // linhas de destaque (3pt, círculo central)
const RIM = '#ff7a3d';         // aro
const KEY_FILL = 'rgba(59,130,246,0.09)';   // garrafão
const ARC_FILL = 'rgba(59,130,246,0.04)';   // área de 3pt

const COURT_ELEMENTS = `
<defs>
  <linearGradient id="courtBg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#161b29"/>
    <stop offset="1" stop-color="#0e1119"/>
  </linearGradient>
  <radialGradient id="centerGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="rgba(59,130,246,0.16)"/>
    <stop offset="1" stop-color="rgba(59,130,246,0)"/>
  </radialGradient>
  <pattern id="planks" width="28" height="300" patternUnits="userSpaceOnUse">
    <rect width="28" height="300" fill="none"/>
    <line x1="0" y1="0" x2="0" y2="300" stroke="rgba(255,255,255,0.025)" stroke-width="1"/>
  </pattern>
  <filter id="dotGlow" x="-60%" y="-60%" width="220%" height="220%">
    <feDropShadow dx="0" dy="1" stdDeviation="1.6" flood-color="#000" flood-opacity="0.55"/>
  </filter>
</defs>

<rect width="560" height="300" rx="8" fill="url(#courtBg)"/>
<rect width="560" height="300" rx="8" fill="url(#planks)"/>

<!-- Áreas de 3 pontos (preenchimento sutil) -->
<path d="M 2 52 L 60 52 A 195 195 0 0 1 60 248 L 2 248 Z" fill="${ARC_FILL}"/>
<path d="M 558 52 L 500 52 A 195 195 0 0 0 500 248 L 558 248 Z" fill="${ARC_FILL}"/>

<!-- Brilho central + logo -->
<circle cx="280" cy="150" r="80" fill="url(#centerGlow)"/>
<text x="280" y="162" text-anchor="middle" font-family="'Barlow Condensed',sans-serif" font-weight="800"
  font-size="34" fill="rgba(255,255,255,0.05)" letter-spacing="2">COURTIQ</text>

<!-- Linhas externas e central -->
<rect x="2" y="2" width="556" height="296" rx="6" fill="none" stroke="${LINE}" stroke-width="2.4"/>
<line x1="280" y1="2" x2="280" y2="298" stroke="${LINE}" stroke-width="1.6"/>
<circle cx="280" cy="150" r="36" fill="none" stroke="${LINE_HI}" stroke-width="1.8"/>
<circle cx="280" cy="150" r="3" fill="${LINE_HI}"/>

<!-- Lado esquerdo (nosso ataque) -->
<rect x="2" y="87" width="142" height="126" fill="${KEY_FILL}" stroke="${LINE}" stroke-width="1.6"/>
<path d="M 144 87 A 63 63 0 0 1 144 213" fill="none" stroke="${LINE}" stroke-width="1.6"/>
<path d="M 144 213 A 63 63 0 0 1 144 87" fill="none" stroke="${LINE}" stroke-width="1.6" stroke-dasharray="5 5"/>
<path d="M 2 52 L 60 52 A 195 195 0 0 1 60 248 L 2 248" fill="none" stroke="${LINE_HI}" stroke-width="2"/>
<path d="M 36 127 A 23 23 0 0 1 36 173" fill="none" stroke="${LINE}" stroke-width="1.3"/>
<rect x="2" y="133" width="6" height="34" fill="none" stroke="${LINE}" stroke-width="1.5"/>
<line x1="25" y1="135" x2="25" y2="165" stroke="#dfe5f1" stroke-width="2.4"/>
<circle cx="36" cy="150" r="9" fill="none" stroke="${RIM}" stroke-width="2.2"/>

<!-- Lado direito (adversário) -->
<rect x="416" y="87" width="142" height="126" fill="${KEY_FILL}" stroke="${LINE}" stroke-width="1.6"/>
<path d="M 416 87 A 63 63 0 0 0 416 213" fill="none" stroke="${LINE}" stroke-width="1.6"/>
<path d="M 416 213 A 63 63 0 0 0 416 87" fill="none" stroke="${LINE}" stroke-width="1.6" stroke-dasharray="5 5"/>
<path d="M 558 52 L 500 52 A 195 195 0 0 0 500 248 L 558 248" fill="none" stroke="${LINE_HI}" stroke-width="2"/>
<path d="M 524 127 A 23 23 0 0 0 524 173" fill="none" stroke="${LINE}" stroke-width="1.3"/>
<rect x="552" y="133" width="6" height="34" fill="none" stroke="${LINE}" stroke-width="1.5"/>
<line x1="535" y1="135" x2="535" y2="165" stroke="#dfe5f1" stroke-width="2.4"/>
<circle cx="524" cy="150" r="9" fill="none" stroke="${RIM}" stroke-width="2.2"/>

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
    const is3 = s.type.startsWith('3');
    let label = `${made ? 'Cesta' : 'Erro'} de ${is3 ? '3' : '2'}`;
    if (s.opp_jersey_number != null) label += ` — adversário #${s.opp_jersey_number}`;
    if (s.ai_desc) label += ` — ${s.ai_desc}`;
    layer.appendChild(makeShotDot(s.shot_x, s.shot_y, made, opacity, label));
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

function makeShotDot(x, y, made, opacity, label = '') {
  const NS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(NS, 'g');
  g.style.opacity = opacity;
  g.setAttribute('filter', 'url(#dotGlow)');

  if (made) {
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', '6.5');
    circle.setAttribute('fill', '#10b981');
    circle.setAttribute('stroke', 'rgba(255,255,255,0.9)');
    circle.setAttribute('stroke-width', '1.4');
    g.appendChild(circle);
  } else {
    // ✕ vermelho com halo escuro para legibilidade sobre as linhas
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('cx', x);
    halo.setAttribute('cy', y);
    halo.setAttribute('r', '7');
    halo.setAttribute('fill', 'rgba(0,0,0,0.35)');
    g.appendChild(halo);
    const size = 4.6;
    [[-1, -1, 1, 1], [1, -1, -1, 1]].forEach(([a, b, c, d]) => {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', x + a * size); line.setAttribute('y1', y + b * size);
      line.setAttribute('x2', x + c * size); line.setAttribute('y2', y + d * size);
      line.setAttribute('stroke', '#f87171');
      line.setAttribute('stroke-width', '2.6');
      line.setAttribute('stroke-linecap', 'round');
      g.appendChild(line);
    });
  }

  if (label) {
    const title = document.createElementNS(NS, 'title');
    title.textContent = label;
    g.appendChild(title);
  }

  return g;
}
