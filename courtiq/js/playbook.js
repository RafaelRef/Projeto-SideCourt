// CourtIQ — Quadro de jogadas (playbook designer)
// Desenha jogadas passo a passo sobre a quadra (SVG viewBox 0 0 560 300).
import { drawCourt } from './shotchart.js';

const NS = 'http://www.w3.org/2000/svg';
const VW = 560, VH = 300;

/**
 * @param {object} opts
 * @param {SVGElement} opts.svg        - SVG da quadra
 * @param {function} [opts.onChange]   - chamado quando o estado muda (passos/passo atual)
 */
export function createPlaybook({ svg, onChange }) {
  let steps = [emptyStep()];
  let current = 0;
  let tool = 'select';
  let drag = null;       // arrasto de marcador
  let drawing = null;    // desenho de seta em andamento

  drawCourt(svg);
  const layer = document.createElementNS(NS, 'g');
  layer.id = 'play-layer';
  svg.appendChild(layer);
  ensureDefs(svg);

  svg.addEventListener('pointerdown', onSvgDown);
  svg.addEventListener('pointermove', onSvgMove);
  svg.addEventListener('pointerup', onSvgUp);

  function emptyStep() { return { markers: [], arrows: [], note: '' }; }
  function step() { return steps[current]; }
  function emit() { onChange && onChange({ index: current, total: steps.length, note: step().note }); }

  // ---------- API pública ----------
  function setTool(t) { tool = t; svg.style.cursor = (t === 'select') ? 'default' : 'crosshair'; }
  function getState() { return { steps: JSON.parse(JSON.stringify(steps)) }; }
  function loadSteps(arr) {
    steps = (Array.isArray(arr) && arr.length) ? JSON.parse(JSON.stringify(arr)) : [emptyStep()];
    current = 0; render(); emit();
  }
  function newDrawing() { steps = [emptyStep()]; current = 0; render(); emit(); }
  function setNote(text) { step().note = text; }

  function addStep() {
    // novo passo herda os marcadores do passo atual (jogadores se movem), sem as setas
    const clone = { markers: JSON.parse(JSON.stringify(step().markers)), arrows: [], note: '' };
    steps.splice(current + 1, 0, clone);
    current++; render(); emit();
  }
  function deleteStep() {
    if (steps.length <= 1) { steps = [emptyStep()]; current = 0; }
    else { steps.splice(current, 1); current = Math.max(0, current - 1); }
    render(); emit();
  }
  function goTo(i) { current = Math.max(0, Math.min(steps.length - 1, i)); render(); emit(); }
  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  async function animate() {
    for (let i = 0; i < steps.length; i++) {
      goTo(i);
      await wait(900);
    }
  }

  // ---------- Eventos ----------
  function onSvgDown(e) {
    const pt = coords(e);
    if (tool === 'select') return; // arrasto de marcador é tratado por handler do próprio marcador
    if (['player','ball','cone'].includes(tool)) {
      addMarker(tool, pt.x, pt.y);
      render();
      return;
    }
    if (['move','pass','screen','dribble'].includes(tool)) {
      drawing = { kind: tool, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
    }
  }

  function onSvgMove(e) {
    if (!drawing) return;
    const pt = coords(e);
    drawing.x2 = pt.x; drawing.y2 = pt.y;
    renderPreview();
  }

  function onSvgUp() {
    if (drawing) {
      const dist = Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1);
      if (dist > 8) step().arrows.push({ ...drawing });
      drawing = null;
      render();
    }
  }

  function addMarker(kind, x, y) {
    let label = '';
    if (kind === 'player') {
      const used = step().markers.filter(m => m.kind === 'player').map(m => +m.label);
      label = String([1,2,3,4,5].find(n => !used.includes(n)) || (used.length + 1));
    } else if (kind === 'cone') {
      const used = step().markers.filter(m => m.kind === 'cone').length;
      label = 'X' + (used + 1);
    } else if (kind === 'ball') {
      label = '';
    }
    step().markers.push({ kind, x, y, label });
  }

  // ---------- Render ----------
  function render() {
    layer.innerHTML = '';
    step().arrows.forEach((a, i) => layer.appendChild(arrowEl(a, i)));
    step().markers.forEach((m, i) => layer.appendChild(markerEl(m, i)));
  }

  function renderPreview() {
    let prev = layer.querySelector('#arrow-preview');
    if (prev) prev.remove();
    const el = arrowEl(drawing, -1);
    el.setAttribute('id', 'arrow-preview');
    el.style.opacity = '0.6';
    layer.appendChild(el);
  }

  function markerEl(m, idx) {
    const g = document.createElementNS(NS, 'g');
    g.style.cursor = (tool === 'select') ? 'grab' : (tool === 'erase' ? 'pointer' : 'default');

    if (m.kind === 'ball') {
      const c = circle(m.x, m.y, 8, '#ff6b35', '#7a2e00');
      g.appendChild(c);
      g.appendChild(text(m.x, m.y, '●', 7, '#7a2e00'));
    } else if (m.kind === 'cone') {
      const tri = document.createElementNS(NS, 'polygon');
      tri.setAttribute('points', `${m.x},${m.y-11} ${m.x-10},${m.y+8} ${m.x+10},${m.y+8}`);
      tri.setAttribute('fill', '#ef4444');
      tri.setAttribute('stroke', '#fff');
      tri.setAttribute('stroke-width', '1.5');
      g.appendChild(tri);
      if (m.label) g.appendChild(text(m.x, m.y + 3, m.label, 8, '#fff'));
    } else { // player
      g.appendChild(circle(m.x, m.y, 13, '#2f6fed', '#fff'));
      g.appendChild(text(m.x, m.y, m.label, 12, '#fff'));
    }

    g.addEventListener('pointerdown', (e) => {
      if (tool === 'erase') {
        e.stopPropagation();
        step().markers.splice(idx, 1);
        render();
        return;
      }
      if (tool !== 'select') return;
      e.stopPropagation();
      drag = { idx, g };
      g.setPointerCapture(e.pointerId);
      g.addEventListener('pointermove', onMarkerMove);
      g.addEventListener('pointerup', onMarkerUp);
    });
    return g;
  }

  function onMarkerMove(e) {
    if (!drag) return;
    const pt = coords(e);
    const m = step().markers[drag.idx];
    m.x = pt.x; m.y = pt.y;
    render();
  }
  function onMarkerUp() { drag = null; }

  function arrowEl(a, idx) {
    const g = document.createElementNS(NS, 'g');
    const color = a.kind === 'pass' ? '#22c55e' : a.kind === 'screen' ? '#f59e0b' : '#e2e8f0';

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', pathFor(a));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2.5');
    if (a.kind === 'pass') path.setAttribute('stroke-dasharray', '7 5');
    if (a.kind !== 'screen') path.setAttribute('marker-end', 'url(#arrowhead)');
    g.appendChild(path);

    // remate do bloqueio (barra perpendicular)
    if (a.kind === 'screen') g.appendChild(screenCap(a, color));

    // alvo de clique para apagar
    if (idx >= 0) {
      const hit = document.createElementNS(NS, 'path');
      hit.setAttribute('d', pathFor(a));
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '14');
      hit.style.cursor = tool === 'erase' ? 'pointer' : 'default';
      hit.addEventListener('pointerdown', (e) => {
        if (tool !== 'erase') return;
        e.stopPropagation();
        step().arrows.splice(idx, 1);
        render();
      });
      g.appendChild(hit);
    }
    return g;
  }

  function pathFor(a) {
    if (a.kind === 'dribble') {
      // linha ondulada
      const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len; // normal
      const waves = Math.max(2, Math.round(len / 18));
      let d = `M ${a.x1} ${a.y1}`;
      for (let i = 1; i <= waves; i++) {
        const t = i / waves;
        const px = a.x1 + dx * t, py = a.y1 + dy * t;
        const amp = (i % 2 === 0 ? 1 : -1) * 5;
        const cx = px + nx * amp, cy = py + ny * amp;
        d += ` Q ${cx} ${cy} ${px} ${py}`;
      }
      return d;
    }
    return `M ${a.x1} ${a.y1} L ${a.x2} ${a.y2}`;
  }

  function screenCap(a, color) {
    const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const cap = document.createElementNS(NS, 'line');
    cap.setAttribute('x1', a.x2 + nx * 9); cap.setAttribute('y1', a.y2 + ny * 9);
    cap.setAttribute('x2', a.x2 - nx * 9); cap.setAttribute('y2', a.y2 - ny * 9);
    cap.setAttribute('stroke', color); cap.setAttribute('stroke-width', '3');
    return cap;
  }

  // ---------- helpers ----------
  function coords(e) {
    const rect = svg.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / rect.width * VW, 0, VW),
      y: clamp((e.clientY - rect.top) / rect.height * VH, 0, VH),
    };
  }

  render(); emit();
  return { setTool, getState, loadSteps, newDrawing, setNote, addStep, deleteStep, next, prev, goTo, animate };
}

// ---------- util SVG ----------
function ensureDefs(svg) {
  let defs = svg.querySelector('defs#play-defs');
  if (defs) return;
  defs = document.createElementNS(NS, 'defs');
  defs.id = 'play-defs';
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '8'); marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  p.setAttribute('fill', '#e2e8f0');
  marker.appendChild(p);
  defs.appendChild(marker);
  svg.appendChild(defs);
}

function circle(x, y, r, fill, stroke) {
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r);
  c.setAttribute('fill', fill); c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', '2');
  return c;
}
function text(x, y, str, size, fill) {
  const t = document.createElementNS(NS, 'text');
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central');
  t.setAttribute('font-size', size); t.setAttribute('font-weight', '800');
  t.setAttribute('font-family', "'Barlow Condensed', sans-serif");
  t.setAttribute('fill', fill); t.style.pointerEvents = 'none';
  t.textContent = str;
  return t;
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
