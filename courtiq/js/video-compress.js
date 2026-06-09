// CourtIQ — Compressão de vídeo no navegador (ffmpeg.wasm)
// Usada quando o arquivo passa do limite do Supabase Storage (50 MB no Free).
// A IA (Gemini) amostra ~1 quadro/s, então reduzir resolução/fps não atrapalha
// a extração de estatísticas. Roda single-thread (sem exigir COOP/COEP, que
// poderiam quebrar as requisições ao Supabase/fontes).

// FFmpeg e util ficam HOSPEDADOS LOCALMENTE (courtiq/vendor/) — não via CDN.
// Motivo: a classe FFmpeg cria um Web Worker via `new URL('./worker.js',
// import.meta.url)`. Importando de um CDN (esm.sh), esse worker é cross-origin
// e o navegador bloqueia (`Failed to construct 'Worker'`); o bundle do esm.sh
// como blob também quebra ao ser avaliado. Servindo os arquivos same-origin, o
// worker resolve sozinho e tudo funciona. Só o core pesado (~30 MB) vem do CDN
// como blob (blob é same-origin, então roda dentro do worker sem problema).
import { FFmpeg } from '../vendor/ffmpeg/index.js';
import { toBlobURL, fetchFile } from '../vendor/ffmpeg-util/index.js';

// Core ESM (não UMD): o worker é de módulo e carrega o core via `import()`,
// que exige um módulo ES (o UMD travaria silenciosamente).
const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
// TARGET_BYTES: alvo do bitrate (pra caber o jogo INTEIRO). HARD_CAP_BYTES: teto
// rígido passado ao ffmpeg via '-fs', que para de escrever se estourar — garante
// que NUNCA passe de 50 MB (limite do Supabase Free), mesmo em jogos longos.
const TARGET_BYTES = 42 * 1024 * 1024;   // mira ~42 MB (folga p/ overshoot do x264)
const HARD_CAP_BYTES = 46 * 1024 * 1024; // teto absoluto ~46 MB (< 50, com margem)

let ffmpeg = null;
let loadingPromise = null;

// Carrega o core do ffmpeg.wasm uma única vez (fica em cache no navegador).
// onProgress('download', pct) reporta o download do core pra dar feedback real.
async function ensureLoaded(onStatus, onProgress) {
  if (ffmpeg) return ffmpeg;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    onStatus?.('Baixando compressor (primeira vez, ~30 MB)...');
    const inst = new FFmpeg();
    const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await toBlobURL(
      `${CORE_BASE}/ffmpeg-core.wasm`,
      'application/wasm',
      true,
      ({ received, total }) => {
        if (total > 0) onProgress?.('download', Math.round((received / total) * 100));
      },
    );
    onStatus?.('Iniciando compressor...');
    await inst.load({ coreURL, wasmURL }); // sem classWorkerURL: usa o worker vendorizado
    ffmpeg = inst;
    return inst;
  })();

  return loadingPromise;
}

// Lê a duração do vídeo (segundos) para calcular o bitrate-alvo.
function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    v.src = url;
  });
}

/**
 * Comprime o vídeo para ~45 MB (480p, 5 fps, sem áudio) usando ffmpeg.wasm.
 * @param {File} file
 * @param {object} [opts]
 * @param {(stage: string, pct: number) => void} [opts.onProgress] - stage: 'download' | 'compress'; pct 0..100
 * @param {(msg: string) => void} [opts.onStatus]
 * @returns {Promise<File>} novo arquivo .mp4 comprimido
 */
export async function compressVideo(file, { onProgress, onStatus } = {}) {
  const inst = await ensureLoaded(onStatus, onProgress);

  // bitrate de vídeo alvo (kbps) a partir da duração — SEM piso, pois em jogos
  // longos um piso alto faria estourar 50 MB. Quanto mais longo o vídeo, menor o
  // bitrate (necessário pra caber). O teto '-fs' abaixo é a garantia final.
  const duration = await readDuration(file);
  const targetKbps = duration && duration > 0
    ? Math.max(1, Math.floor((TARGET_BYTES * 8) / 1000 / duration))
    : 250; // duração desconhecida: bitrate modesto; '-fs' impede passar do limite

  onStatus?.('Comprimindo vídeo...');
  const progressHandler = ({ progress }) => {
    const pct = Math.max(0, Math.min(100, Math.round((progress || 0) * 100)));
    onProgress?.('compress', pct);
  };
  inst.on('progress', progressHandler);

  try {
    await inst.writeFile('input', await fetchFile(file));
    await inst.exec([
      '-i', 'input',
      '-an',                         // sem áudio (a IA não usa)
      '-vf', 'scale=-2:480,fps=5',   // 480p, 5 fps
      '-c:v', 'libx264',
      '-b:v', `${targetKbps}k`,      // bitrate-alvo -> tamanho previsível em 1 passada
      '-preset', 'veryfast',
      '-fs', String(HARD_CAP_BYTES),  // teto rígido: para de escrever se atingir ~47 MB
      '-movflags', '+faststart',
      'output.mp4',
    ]);

    const data = await inst.readFile('output.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    // limpa o FS virtual pra liberar memória
    try { await inst.deleteFile('input'); await inst.deleteFile('output.mp4'); } catch {}

    const baseName = (file.name || 'video').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}_comprimido.mp4`, { type: 'video/mp4' });
  } finally {
    inst.off('progress', progressHandler);
  }
}
