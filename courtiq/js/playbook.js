// CourtIQ — Quadro de jogadas (playbook designer) v2
// Desenha jogadas passo a passo sobre a quadra (SVG viewBox 0 0 560 300).
//
// Recursos:
//  - Marcadores: jogadoras (O 1-5), defensoras (X), bola
//  - Ações: movimento, passe, drible, bloqueio — com CURVA editável
//    (no modo mover, arraste a alça no meio da seta para curvá-la)
//  - Pontas das setas grudam na jogadora mais próxima (snap)
//  - Passos com herança de posições + animação interpolada (tween)
//  - Meia-quadra / quadra inteira
//  - Posições iniciais prontas (5 em quadra) e exportação em PNG
//
// Compatibilidade com jogadas antigas: markers kind 'cone' viram defensoras,
// setas sem cx/cy são retas.
import { drawCourt } from './shotchart.js';

const NS = 'http://www.w3.org/2000/svg';
const VW = 560, VH = 300;
const SNAP_DIST = 18;

const COLORS = {
  move:    '#1d2433',
  pass:    '#15803d',
  screen:  '#b45309',
  dribble: '#1d2433',
  player:  '#1d4ed8',
  defender:'#dc2626',
  ball:    '#e8590c',
};

/**
 * @param {object} opts
 * @param {SVGElement} opts.svg        - SVG da quadra
 * @param {function} [opts.onChange]   - chamado quando o estado muda (passos/passo atual)
 */
export function createPlaybook({ svg, onChange }) {
  let steps = [emptyStep()];
  let current = 0;
  let tool = 'select';
  let drag = null;       // { type:'marker'|'handle', idx }
  let drawing = null;    // seta em andamento
  let view = 'full';
  let animating = false;

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
  function setTool(t) { tool = t; svg.style.cursor = (t === 'select') ? 'default' : 'crosshair'; render(); }
  function getState() { return { steps: JSON.parse(JSON.stringify(steps)) }; }
  function loadSteps(arr) {
    steps = (Array.isArray(arr) && arr.length) ? JSON.parse(JSON.stringify(arr)) : [emptyStep()];
    // compat: 'cone' → defensora
    steps.forEach(s => (s.markers || []).forEach(m => { if (m.kind === 'cone') m.kind = 'defender'; }));
    current = 0; render(); emit();
  }
  function newDrawing() { steps = [emptyStep()]; current = 0; render(); emit(); }
  function setNote(text) { step().note = text; }

  function setView(v) {
    view = v;
    svg.setAttribute('viewBox', v === 'half' ? '0 0 282 300' : '0 0 560 300');
  }
  function getView() { return view; }

  function presetLineup() {
    // 5 atacantes em formação aberta atacando a cesta esquerda + bola com a 1
    const m = step().markers;
    const has = (lbl) => m.some(x => x.kind === 'player' && x.label === lbl);
    const spots = [
      ['1', 215, 150], ['2', 160, 70], ['3', 160, 230], ['4', 50, 45], ['5', 50, 255],
    ];
    spots.forEach(([lbl, x, y]) => { if (!has(lbl)) m.push({ kind: 'player', x, y, label: lbl }); });
    if (!m.some(x => x.kind === 'ball')) m.push({ kind: 'ball', x: 228, y: 138, label: '' });
    render();
  }

  function addStep() {
    // novo passo herda os marcadores do passo atual (jogadoras se movem), sem as setas
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

  // ---------- Animação interpolada ----------
  async function animate() {
    if (animating || steps.length < 2) { goTo(0); return; }
    animating = true;
    goTo(0);
    await wait(650);
    for (let i = 1; i < steps.length; i++) {
      await tweenTo(i);
      await wait(750);
    }
    animating = false;
  }

  function tweenTo(target) {
    return new Promise(resolve => {
      const from = steps[target - 1].markers, to = steps[target].markers;
      const pairs = to.map(m => {
        const match = from.find(f => f.kind === m.kind && f.label === m.label);
        return { m, fx: match ? match.x : m.x, fy: match ? match.y : m.y };
      });
      const D = 700;
      const t0 = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - t0) / D);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOut
        layer.innerHTML = '';
        // setas do passo alvo aparecem suaves junto do movimento
        steps[target].arrows.forEach((a, i) => {
          const el = arrowEl(a, i, true);
          el.style.opacity = String(0.25 + 0.75 * e);
          layer.appendChild(el);
        });
        pairs.forEach(({ m, fx, fy }) => {
          const ghost = { ...m, x: fx + (m.x - fx) * e, y: fy + (m.y - fy) * e };
          layer.appendChild(markerEl(ghost, -1, true));
        });
        if (t < 1) requestAnimationFrame(frame);
        else { current = target; render(); emit(); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }

  // ---------- Exportar PNG ----------
  function exportPng(filename = 'jogada') {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', NS);
    const vb = svg.viewBox.baseVal;
    const W = (vb.width || VW) * 2, H = (vb.height || VH) * 2;
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0d0f14';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      canvas.toBlob(png => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(png);
        a.download = `${filename.replace(/[^\w\-]+/g, '_')}_passo${current + 1}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      });
    };
    img.src = url;
  }

  // ---------- Eventos do SVG ----------
  function onSvgDown(e) {
    if (animating) return;
    const pt = coords(e);
    if (tool === 'select') return; // arrasto tratado pelos handlers dos elementos
    if (['player', 'ball', 'defender'].includes(tool)) {
      addMarker(tool, pt.x, pt.y);
      render();
      return;
    }
    if (['move', 'pass', 'screen', 'dribble'].includes(tool)) {
      const s = snapPoint(pt);
      drawing = { kind: tool, x1: s.x, y1: s.y, x2: pt.x, y2: pt.y };
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
      if (dist > 10) {
        const s = snapPoint({ x: drawing.x2, y: drawing.y2 });
        drawing.x2 = s.x; drawing.y2 = s.y;
        step().arrows.push({ ...drawing });
      }
      drawing = null;
      render();
    }
  }

  function snapPoint(pt) {
    let best = null, bestD = SNAP_DIST;
    for (const m of step().markers) {
      if (m.kind === 'ball') continue;
      const d = Math.hypot(m.x - pt.x, m.y - pt.y);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best ? { x: best.x, y: best.y } : pt;
  }

  function addMarker(kind, x, y) {
    let label = '';
    if (kind === 'player') {
      const used = step().markers.filter(m => m.kind === 'player').map(m => +m.label);
      label = String([1, 2, 3, 4, 5].find(n => !used.includes(n)) || (used.length + 1));
    } else if (kind === 'defender') {
      const used = step().markers.filter(m => m.kind === 'defender').length;
      label = 'X' + (used + 1);
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
    const el = arrowEl(drawing, -1, true);
    el.setAttribute('id', 'arrow-preview');
    el.style.opacity = '0.6';
    layer.appendChild(el);
  }

  // ---------- Marcadores ----------
  function markerEl(m, idx, ghost = false) {
    const g = document.createElementNS(NS, 'g');
    if (!ghost) g.style.cursor = (tool === 'select') ? 'grab' : (tool === 'erase' ? 'pointer' : 'default');
    g.setAttribute('filter', 'url(#pbShadow)');

    if (m.kind === 'ball') {
      const c = circle(m.x, m.y, 7.5, COLORS.ball, '#fff');
      g.appendChild(c);
      // gomos da bola
      const seam = document.createElementNS(NS, 'path');
      seam.setAttribute('d', `M ${m.x - 7.5} ${m.y} H ${m.x + 7.5} M ${m.x} ${m.y - 7.5} V ${m.y + 7.5}
        M ${m.x - 5.3} ${m.y - 5.3} Q ${m.x} ${m.y} ${m.x - 5.3} ${m.y + 5.3}
        M ${m.x + 5.3} ${m.y - 5.3} Q ${m.x} ${m.y} ${m.x + 5.3} ${m.y + 5.3}`);
      seam.setAttribute('stroke', 'rgba(0,0,0,0.45)');
      seam.setAttribute('stroke-width', '1');
      seam.setAttribute('fill', 'none');
      seam.style.pointerEvents = 'none';
      g.appendChild(seam);
    } else if (m.kind === 'defender' || m.kind === 'cone') {
      // X de defensora (notação clássica)
      const s = 8;
      const x1 = line(m.x - s, m.y - s, m.x + s, m.y + s, COLORS.defender, 4.5);
      const x2 = line(m.x + s, m.y - s, m.x - s, m.y + s, COLORS.defender, 4.5);
      [x1, x2].forEach(l => { l.setAttribute('stroke-linecap', 'round'); g.appendChild(l); });
      if (m.label) {
        const t = text(m.x + 12, m.y - 10, m.label.replace('X', ''), 9, '#fff');
        t.setAttribute('paint-order', 'stroke');
        t.setAttribute('stroke', 'rgba(0,0,0,0.6)');
        t.setAttribute('stroke-width', '2');
        g.appendChild(t);
      }
      // alvo de clique maior
      const hit = circle(m.x, m.y, 13, 'transparent', 'transparent');
      g.appendChild(hit);
    } else { // player
      g.appendChild(circle(m.x, m.y, 13, COLORS.player, '#fff'));
      g.appendChild(text(m.x, m.y, m.label, 13, '#fff'));
    }

    if (ghost) return g;

    g.addEventListener('pointerdown', (e) => {
      if (tool === 'erase') {
        e.stopPropagation();
        step().markers.splice(idx, 1);
        render();
        return;
      }
      if (tool !== 'select') return;
      e.stopPropagation();
      drag = { type: 'marker', idx };
      g.setPointerCapture(e.pointerId);
      g.addEventListener('pointermove', onDragMove);
      g.addEventListener('pointerup', onDragUp);
    });
    return g;
  }

  function onDragMove(e) {
    if (!drag) return;
    const pt = coords(e);
    if (drag.type === 'marker') {
      const m = step().markers[drag.idx];
      m.x = pt.x; m.y = pt.y;
    } else if (drag.type === 'handle') {
      const a = step().arrows[drag.idx];
      // curva passa pelo ponto arrastado em t=0.5: C = 2P − (A+B)/2
      a.cx = 2 * pt.x - (a.x1 + a.x2) / 2;
      a.cy = 2 * pt.y - (a.y1 + a.y2) / 2;
    }
    render();
  }
  function onDragUp() { drag = null; }

  // ---------- Setas ----------
  function arrowEl(a, idx, ghost = false) {
    const g = document.createElementNS(NS, 'g');
    const color = COLORS[a.kind] || COLORS.move;

    // contorno claro por baixo (legibilidade sobre a madeira)
    const outline = document.createElementNS(NS, 'path');
    outline.setAttribute('d', pathFor(a));
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', 'rgba(255,255,255,0.65)');
    outline.setAttribute('stroke-width', '5');
    outline.setAttribute('stroke-linecap', 'round');
    if (a.kind === 'pass') outline.setAttribute('stroke-dasharray', '8 6');
    g.appendChild(outline);

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', pathFor(a));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2.6');
    path.setAttribute('stroke-linecap', 'round');
    if (a.kind === 'pass') path.setAttribute('stroke-dasharray', '8 6');
    if (a.kind !== 'screen') path.setAttribute('marker-end', `url(#ah-${a.kind})`);
    g.appendChild(path);

    // remate do bloqueio (barra perpendicular)
    if (a.kind === 'screen') g.appendChild(screenCap(a, color));

    if (ghost || idx < 0) return g;

    // alvo de clique para apagar
    const hit = document.createElementNS(NS, 'path');
    hit.setAttribute('d', pathFor(a));
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '16');
    hit.style.cursor = tool === 'erase' ? 'pointer' : 'default';
    hit.addEventListener('pointerdown', (e) => {
      if (tool !== 'erase') return;
      e.stopPropagation();
      step().arrows.splice(idx, 1);
      render();
    });
    g.appendChild(hit);

    // alça de curvatura no modo mover
    if (tool === 'select') {
      const mid = curvePoint(a, 0.5);
      const handle = circle(mid.x, mid.y, 5, 'rgba(255,255,255,0.9)', color);
      handle.setAttribute('stroke-width', '2');
      handle.style.cursor = 'grab';
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        drag = { type: 'handle', idx };
        handle.setPointerCapture(e.pointerId);
        handle.addEventListener('pointermove', onDragMove);
        handle.addEventListener('pointerup', onDragUp);
      });
      g.appendChild(handle);
    }
    return g;
  }

  function ctrl(a) {
    return (a.cx != null)
      ? { x: a.cx, y: a.cy }
      : { x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 };
  }

  function curvePoint(a, t) {
    const c = ctrl(a);
    const u = 1 - t;
    return {
      x: u * u * a.x1 + 2 * u * t * c.x + t * t * a.x2,
      y: u * u * a.y1 + 2 * u * t * c.y + t * t * a.y2,
    };
  }

  function pathFor(a) {
    if (a.kind === 'dribble') {
      // ondulação amostrada ao longo da curva (ou reta)
      const segs = Math.max(6, Math.round(arrowLen(a) / 14));
      let d = `M ${a.x1} ${a.y1}`;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const p = curvePoint(a, t);
        const pPrev = curvePoint(a, (i - 0.5) / segs);
        const dx = p.x - curvePoint(a, (i - 1) / segs).x;
        const dy = p.y - curvePoint(a, (i - 1) / segs).y;
        const len = Math.hypot(dx, dy) || 1;
        const amp = (i % 2 === 0 ? 1 : -1) * 4.5;
        d += ` Q ${pPrev.x + (-dy / len) * amp} ${pPrev.y + (dx / len) * amp} ${p.x} ${p.y}`;
      }
      return d;
    }
    const c = ctrl(a);
    if (a.cx != null) return `M ${a.x1} ${a.y1} Q ${c.x} ${c.y} ${a.x2} ${a.y2}`;
    return `M ${a.x1} ${a.y1} L ${a.x2} ${a.y2}`;
  }

  function arrowLen(a) {
    return Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
  }

  function screenCap(a, color) {
    const end = curvePoint(a, 1);
    const near = curvePoint(a, 0.92);
    const dx = end.x - near.x, dy = end.y - near.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const cap = line(end.x + nx * 10, end.y + ny * 10, end.x - nx * 10, end.y - ny * 10, color, 4);
    cap.setAttribute('stroke-linecap', 'round');
    return cap;
  }

  // ---------- helpers ----------
  function coords(e) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const w = vb.width || VW, h = vb.height || VH;
    return {
      x: clamp(vb.x + (e.clientX - rect.left) / rect.width * w, 0, VW),
      y: clamp(vb.y + (e.clientY - rect.top) / rect.height * h, 0, VH),
    };
  }

  render(); emit();
  return {
    setTool, getState, loadSteps, newDrawing, setNote,
    addStep, deleteStep, next, prev, goTo, animate,
    setView, getView, presetLineup, exportPng,
  };
}

// ---------- util SVG ----------
function ensureDefs(svg) {
  let defs = svg.querySelector('defs#play-defs');
  if (defs) return;
  defs = document.createElementNS(NS, 'defs');
  defs.id = 'play-defs';

  // uma ponta de seta por tipo, na cor certa
  for (const [kind, color] of Object.entries({ move: COLORS.move, pass: COLORS.pass, dribble: COLORS.dribble })) {
    const marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', `ah-${kind}`);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8'); marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '5.5'); marker.setAttribute('markerHeight', '5.5');
    marker.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    p.setAttribute('fill', color);
    marker.appendChild(p);
    defs.appendChild(marker);
  }

  const shadow = document.createElementNS(NS, 'filter');
  shadow.setAttribute('id', 'pbShadow');
  shadow.setAttribute('x', '-40%'); shadow.setAttribute('y', '-40%');
  shadow.setAttribute('width', '180%'); shadow.setAttribute('height', '180%');
  shadow.innerHTML = '<feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#000" flood-opacity="0.4"/>';
  defs.appendChild(shadow);

  svg.appendChild(defs);
}

function circle(x, y, r, fill, stroke) {
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r);
  c.setAttribute('fill', fill); c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', '2');
  return c;
}
function line(x1, y1, x2, y2, stroke, width) {
  const l = document.createElementNS(NS, 'line');
  l.setAttribute('x1', x1); l.setAttribute('y1', y1);
  l.setAttribute('x2', x2); l.setAttribute('y2', y2);
  l.setAttribute('stroke', stroke); l.setAttribute('stroke-width', width);
  return l;
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
