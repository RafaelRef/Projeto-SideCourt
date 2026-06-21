// CourtIQ — Scout por voz
// Transcrição de comandos de narração (pt-BR) → eventos de jogo.
//
// Protocolo de comando (ordem: TIME → CAMISA → AÇÃO):
//   "Time A camisa 29 dois pontos"      → nosso #29 cesta de 2  (+ toque na quadra)
//   "Adversário 12 três errado"         → adv  #12 errou de 3   (+ toque na quadra)
//   "Einstein 7 rebote defensivo"       → nosso #7 reb. def.
//   "Time B 15 roubo"                   → adv  #15 roubo
//
// Robustez: todo comando PRECISA começar com um token de time. Isso transforma
// o token de time num delimitador — fala solta (torcida, "vai!") sem time é
// ignorada. Erros são recuperáveis: o app registra na hora com desfazer de 1 toque.

// ---------- Normalização ----------
function stripAccents(s) {
  // remove marcas diacríticas combinantes (U+0300–U+036F)
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function normalize(s) {
  return stripAccents(String(s || '').toLowerCase())
    .replace(/:/g, ' dois pontos ')  // a API transcreve "dois pontos" falado como ":"
    .replace(/[.,!?;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Números falados (0–99) ----------
const UNITS = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
const TEENS = { dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16, dezessete: 17, dezasete: 17, dezoito: 18, dezenove: 19, dezanove: 19 };
const TENS = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };

// Tenta ler um número começando em tokens[i]. Retorna { value, consumed } ou null.
function readNumberAt(tokens, i) {
  const t = tokens[i];
  if (t == null) return null;
  if (/^\d{1,2}$/.test(t)) return { value: +t, consumed: 1 };
  if (TENS[t] != null) {
    let val = TENS[t], consumed = 1;
    if (tokens[i + 1] === 'e' && UNITS[tokens[i + 2]] != null) { val += UNITS[tokens[i + 2]]; consumed = 3; }
    else if (UNITS[tokens[i + 1]] != null) { val += UNITS[tokens[i + 1]]; consumed = 2; }
    return { value: val, consumed };
  }
  if (TEENS[t] != null) return { value: TEENS[t], consumed: 1 };
  if (UNITS[t] != null) return { value: UNITS[t], consumed: 1 };
  return null;
}

// ---------- Times ----------
const OUR_ALIASES = ['time a', 'einstein', 'med einstein', 'nos', 'casa', 'nosso', 'nossa'];
const OPP_ALIASES = ['time b', 'adversario', 'adversaria', 'eles', 'elas', 'fora', 'visitante'];

function detectTeam(text) {
  for (const a of OUR_ALIASES) if (text.includes(a)) return { team: 'ours', alias: a };
  for (const a of OPP_ALIASES) if (text.includes(a)) return { team: 'opp', alias: a };
  return null;
}

// ---------- Ações ----------
const SHOT_TYPES = new Set(['2pt_made', '2pt_miss', '3pt_made', '3pt_miss']);

// Detecta o tipo de evento. Retorna string de tipo ou null.
function detectAction(text) {
  const miss = /\berrou\b|\berrad|\bfora\b|tentou|nao caiu|nao entrou|sobrou|tijolo/.test(text);

  // Lance livre
  if (/lance livre|lances livres/.test(text)) return miss ? 'ft_miss' : 'ft_made';

  // Arremessos de 2/3. O valor (dois/três) só conta como arremesso quando vem
  // acompanhado de uma palavra de resultado (pontos, errado, convertido...),
  // para não confundir com o número da camisa.
  const OUTCOME = '(pontos?|errad\\w*|errou|convert\\w*|certo|dentro|fora)';
  const three = new RegExp(`\\b(tres|3)\\s+${OUTCOME}`).test(text)
    || /(bola|cesta|arremesso|tentativa) de (tres|3)|triplo|bola de tres/.test(text);
  const two = new RegExp(`\\b(dois|2)\\s+${OUTCOME}`).test(text)
    || /cesta de (dois|2)|bandeja|enterrada|\bcesta\b/.test(text);
  if (three) return miss ? '3pt_miss' : '3pt_made';
  if (two) return miss ? '2pt_miss' : '2pt_made';

  // Não-arremessos
  if (/rebote|tabela/.test(text)) return /ofensiv/.test(text) ? 'reb_off' : 'reb_def';
  if (/assist|assistencia/.test(text)) return 'ast';
  if (/roubo|roubada|roubou/.test(text)) return 'stl';
  if (/toco|bloqueio|bloqueou|tapa/.test(text)) return 'blk';
  if (/turnover|perda|perdeu|errou o passe|errou passe/.test(text)) return 'to';
  if (/falta/.test(text)) return 'foul';
  return null;
}

const ACTION_LABEL = {
  '2pt_made': 'cesta de 2', '2pt_miss': 'errou de 2',
  '3pt_made': 'cesta de 3', '3pt_miss': 'errou de 3',
  'ft_made': 'lance livre ✓', 'ft_miss': 'lance livre ✗',
  'reb_off': 'rebote ofensivo', 'reb_def': 'rebote defensivo',
  'ast': 'assistência', 'stl': 'roubo', 'blk': 'toco', 'to': 'turnover', 'foul': 'falta',
};

/**
 * Interpreta uma frase narrada em um comando estruturado.
 * @param {string} transcript
 * @returns {{ok:boolean, team?:string, jersey?:number, type?:string, needsLocation?:boolean, label?:string, raw:string, reason?:string}}
 */
export function parseCommand(transcript) {
  const raw = String(transcript || '').trim();
  const text = normalize(raw);
  if (!text) return { ok: false, raw, reason: 'vazio' };

  // 1. Time (obrigatório, delimitador)
  const teamHit = detectTeam(text);
  if (!teamHit) return { ok: false, raw, reason: 'sem_time' };

  // 2. Camisa — após "camisa"/"número", senão o primeiro número da frase
  const tokens = text.split(' ');
  let jersey = null;
  const markerIdx = tokens.findIndex(t => t === 'camisa' || t === 'numero' || t === 'numero');
  if (markerIdx >= 0) {
    const n = readNumberAt(tokens, markerIdx + 1);
    if (n) jersey = n.value;
  }
  if (jersey == null) {
    for (let i = 0; i < tokens.length; i++) {
      const n = readNumberAt(tokens, i);
      // evita pegar o "2/3" que faz parte de "dois/três pontos"
      if (n && !(tokens[i + 1] === 'pontos' || tokens[i + 1] === 'ponto')) { jersey = n.value; break; }
    }
  }

  // 3. Ação
  const type = detectAction(text);
  if (!type) return { ok: false, team: teamHit.team, jersey, raw, reason: 'sem_acao' };
  if (jersey == null) return { ok: false, team: teamHit.team, type, raw, reason: 'sem_camisa' };

  const needsLocation = SHOT_TYPES.has(type);
  return {
    ok: true,
    team: teamHit.team,
    jersey,
    type,
    needsLocation,
    label: ACTION_LABEL[type] || type,
    raw,
  };
}

export function actionLabel(type) { return ACTION_LABEL[type] || type; }

// ---------- Reconhecimento de voz (Web Speech API, push-to-talk) ----------
export function speechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Cria um reconhecedor push-to-talk: cada start() captura UMA fala e para sozinho.
 * Esse padrão é o único confiável no Safari/WebKit (iOS) e funciona igual no Chrome.
 * @param {object} cb - { onInterim, onFinal(text, alternatives[]), onError(code), onState('listening'|'idle') }
 */
export function createRecognizer({ lang = 'pt-BR', onInterim, onFinal, onError, onState } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  const rec = new SR();
  rec.lang = lang;
  rec.continuous = false;       // uma fala por start (compatível com iOS)
  rec.interimResults = true;
  rec.maxAlternatives = 4;      // mais candidatos → mais chance de parse válido

  let active = false;

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        const alts = [];
        for (let a = 0; a < r.length; a++) alts.push(r[a].transcript);
        onFinal?.(alts[0] || '', alts);
      } else {
        interim += r[0].transcript;
      }
    }
    if (interim) onInterim?.(interim);
  };
  rec.onerror = (e) => onError?.(e.error || 'erro');
  rec.onend = () => { active = false; onState?.('idle'); };

  return {
    supported: true,
    get active() { return active; },
    start() {
      if (active) return;
      try { rec.start(); active = true; onState?.('listening'); }
      catch (err) { onError?.(String(err.message || err)); }
    },
    stop() { try { rec.stop(); } catch { /* noop */ } },
    abort() { try { rec.abort(); } catch { /* noop */ } },
  };
}
