// CourtIQ — Editor de formação (escalação visual arrastável)
import { drawCourt } from './shotchart.js';

/**
 * Cria um editor de formação interativo.
 * @param {object} opts
 * @param {SVGElement} opts.svg          - SVG da quadra
 * @param {HTMLElement} opts.dotsLayer   - camada sobre o SVG para os marcadores
 * @param {HTMLElement} opts.benchEl     - área dos atletas no banco
 * @returns {object} editor
 */
export function createFormationEditor({ svg, dotsLayer, benchEl }) {
  let players = [];
  // spots: Map<player_id, {x, y}>  (x,y em fração 0..1)
  let spots = new Map();
  let dragging = null;

  drawCourt(svg);

  function setPlayers(list) {
    players = list || [];
    render();
  }

  function loadSpots(arr) {
    spots = new Map();
    (arr || []).forEach(s => {
      if (s.player_id) spots.set(s.player_id, { x: s.x, y: s.y });
    });
    render();
  }

  function getSpots() {
    return [...spots.entries()].map(([player_id, p]) => ({ player_id, x: +p.x.toFixed(4), y: +p.y.toFixed(4) }));
  }

  function clear() {
    spots = new Map();
    render();
  }

  function addPlayer(id) {
    if (spots.has(id)) return;
    // posiciona em cascata a partir do centro
    const n = spots.size;
    const x = 0.5 + (n % 2 === 0 ? -0.08 : 0.08) * Math.ceil(n / 2);
    const y = 0.25 + 0.12 * n;
    spots.set(id, { x: clamp(x), y: clamp(Math.min(y, 0.9)) });
    render();
  }

  function removePlayer(id) {
    spots.delete(id);
    render();
  }

  function render() {
    // Banco: atletas ainda não escalados
    const benched = players.filter(p => !spots.has(p.id));
    benchEl.innerHTML = benched.length === 0
      ? '<span class="text-muted text-sm">Todas escaladas — arraste para reposicionar.</span>'
      : benched.map(p => `
          <button class="bench-chip" data-id="${p.id}" title="${p.name}">
            <span class="bench-chip-num">#${p.jersey_number ?? '—'}</span>
            <span class="bench-chip-name">${p.name.split(' ')[0]}</span>
          </button>`).join('');
    benchEl.querySelectorAll('.bench-chip').forEach(chip => {
      chip.addEventListener('click', () => addPlayer(chip.dataset.id));
    });

    // Dots na quadra
    dotsLayer.innerHTML = '';
    spots.forEach((pos, id) => {
      const p = players.find(x => x.id === id);
      if (!p) return;
      const dot = document.createElement('div');
      dot.className = 'player-dot draggable';
      dot.dataset.id = id;
      dot.style.left = (pos.x * 100) + '%';
      dot.style.top = (pos.y * 100) + '%';
      dot.innerHTML = `
        <span class="dot-num">#${p.jersey_number ?? ''}</span>
        <span class="dot-name">${p.name.split(' ')[0]}</span>
        <span class="dot-remove" title="Remover">×</span>`;
      dot.addEventListener('pointerdown', (e) => startDrag(e, id, dot));
      dot.querySelector('.dot-remove').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        removePlayer(id);
      });
      dotsLayer.appendChild(dot);
    });
  }

  function startDrag(e, id, dot) {
    e.preventDefault();
    dragging = { id, dot };
    dot.setPointerCapture(e.pointerId);
    dot.classList.add('dragging');
    dot.addEventListener('pointermove', onDrag);
    dot.addEventListener('pointerup', endDrag);
    dot.addEventListener('pointercancel', endDrag);
  }

  function onDrag(e) {
    if (!dragging) return;
    const rect = dotsLayer.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width);
    const y = clamp((e.clientY - rect.top) / rect.height);
    spots.set(dragging.id, { x, y });
    dragging.dot.style.left = (x * 100) + '%';
    dragging.dot.style.top = (y * 100) + '%';
  }

  function endDrag(e) {
    if (!dragging) return;
    const { dot } = dragging;
    dot.classList.remove('dragging');
    dot.removeEventListener('pointermove', onDrag);
    dot.removeEventListener('pointerup', endDrag);
    dot.removeEventListener('pointercancel', endDrag);
    dragging = null;
  }

  return { setPlayers, loadSpots, getSpots, clear };
}

function clamp(v, min = 0.04, max = 0.96) {
  return Math.max(min, Math.min(max, v));
}
