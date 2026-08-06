/**
 * SmartReader · IFNMG Janaúba
 * script.js — Reescrita completa
 * Funcionalidades: PDF.js, TTS, OCR (Tesseract.js), VLibras, PWA, WCAG 2.2
 */

'use strict';

/* ─── ESTADO GLOBAL ──────────────────────────────────────── */
const state = {
 pdfDoc: null,
 pageNum: 1,
 scale: 1.5,
 isSpeaking: false,
 isPaused: false,
 currentTextItems: [],
 ocrText: '',
 ocrProcessed: new Set(),
 fileName: '',
};

/* ─── ELEMENTOS DOM ──────────────────────────────────────── */
const $ = id => document.getElementById(id);
const canvas = $('pdf-render');
const ctx = canvas.getContext('2d');
const textLayer = $('text-layer');
const pdfContainer = $('pdf-container');
const emptyState = $('empty-state');
const fileInput = $('fileInput');
const uploadZone = $('upload-zone');
const fileInfo = $('file-info');
const pageInput = $('page-input');
const pageTotal = $('page-total');
const zoomDisplay = $('zoom-display');
const zoomSlider = $('zoom-slider');
const searchInput = $('search-input');
const searchResults = $('search-results');
const ocrStatus = $('ocr-status');
const docTitle = $('doc-title');
const statusMsg = $('status-msg');
const statusOcr = $('status-ocr-badge');
const statusOffline = $('status-offline');
const ttsRateInput = $('tts-rate');
const ttsPitchInput = $('tts-pitch');
const ttsRateVal = $('tts-rate-val');
const ttsPitchVal = $('tts-pitch-val');
const ttsVoiceSelect= $('tts-voice');
const vlibrasText = $('vlibras-text');

/* ─── PDF.js WORKER ──────────────────────────────────────── */
pdfjsLib.GlobalWorkerOptions.workerSrc =
 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

/* ─── TOAST ──────────────────────────────────────────────── */
function showToast(msg, type = '', duration = 2800) {
 const toast = $('toast');
 toast.textContent = msg;
 toast.className = `toast show${type ? ' toast-' + type : ''}`;
 clearTimeout(toast._timer);
 toast._timer = setTimeout(() => { toast.className = 'toast'; }, duration);
}

/* ─── CARREGAR PDF ───────────────────────────────────────── */
fileInput.addEventListener('change', e => {
 const file = e.target.files[0];
 if (file) loadPDF(file);
});

// Drag & drop
uploadZone.addEventListener('dragover', e => {
 e.preventDefault();
 uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
 e.preventDefault();
 uploadZone.classList.remove('drag-over');
 const file = e.dataTransfer.files[0];
 if (file?.type === 'application/pdf') loadPDF(file);
 else showToast('Arquivo deve ser um PDF.', 'error');
});

// Clique no label também dispara o input
uploadZone.addEventListener('keydown', e => {
 if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

function loadPDF(file) {
    if (file.type !== 'application/pdf') {
    showToast('Selecione um arquivo PDF válido.', 'error');
    return;
    }
    state.fileName = file.name;
    state.ocrProcessed.clear();
    state.ocrText = '';
    
    // Limpa os destaques antigos para não misturar com o novo PDF
    state.highlights = {}; 
   
    setStatus('Carregando…');
    fileInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
    docTitle.textContent = file.name;
   
    const reader = new FileReader();
    reader.onload = function() {
    const arrayBuffer = this.result; // Mantém a referência do buffer original
    const typedarray = new Uint8Array(arrayBuffer);
    
    // Guardar o PDF inteiro no IndexedDB para sobreviver ao F5 (recarregamento)
    savePDFToStorage(file.name, arrayBuffer);
   
    pdfjsLib.getDocument(typedarray).promise
    .then(pdf => {
    state.pdfDoc = pdf;
    state.pageNum = 1;
   
    // Recuperar progresso salvo
    const saved = loadProgress(file.name);
    if (saved && saved > 1 && saved <= pdf.numPages) {
    state.pageNum = saved;
    showToast(`Retomando na página ${saved}`, '', 2000);
    }
   
    pageTotal.textContent = pdf.numPages;
    pageInput.max = pdf.numPages;
    enableControls(true);
    renderPage(state.pageNum);
    showToast('PDF carregado com sucesso.', 'success');
    })
    .catch(err => {
    console.error(err);
    showToast('Erro ao abrir o PDF. Tente outro arquivo.', 'error');
    setStatus('Erro ao carregar.');
    });
    };
    reader.readAsArrayBuffer(file);
   }

/* ─── RENDERIZAR PÁGINA ──────────────────────────────────── */
function renderPage(num) {
 if (!state.pdfDoc) return;
 setStatus('Renderizando…');
 statusOcr.style.display = 'none';

 state.pdfDoc.getPage(num).then(page => {
 const viewport = page.getViewport({ scale: state.scale });

 canvas.height = viewport.height;
 canvas.width = viewport.width;
 canvas.setAttribute('data-loaded', 'true');
 canvas.setAttribute('aria-label', `Página ${num} de ${state.pdfDoc.numPages}`);

 // Esconder empty state
 emptyState.style.display = 'none';
 canvas.style.display = 'block';

 const renderCtx = { canvasContext: ctx, viewport };
 page.render(renderCtx).promise.then(() => {

 // Text layer
 textLayer.innerHTML = '';
 textLayer.style.width = canvas.width + 'px';
 textLayer.style.height = canvas.height + 'px';

 page.getTextContent().then(textContent => {
 state.currentTextItems = textContent.items;
 state.ocrText = '';

 pdfjsLib.renderTextLayer({
 textContent,
 container: textLayer,
 viewport,
 textDivs: [],
 });

 // Se OCR já foi processado nesta página, mostrar badge
 if (state.ocrProcessed.has(num)) {
 statusOcr.style.display = 'inline';
 }

 // Atualizar VLibras com texto da página
 const fullText = textContent.items.map(i => i.str).join(' ');
 updateVLibrasTarget(fullText);
 pageInput.value = num;
 setStatus(`Página ${num} de ${state.pdfDoc.numPages}`);
 });
 });
 });
}

/* ─── NAVEGAÇÃO ──────────────────────────────────────────── */
$('btn-prev').addEventListener('click', prevPage);
$('btn-next').addEventListener('click', nextPage);

function prevPage() {
 if (!state.pdfDoc || state.pageNum <= 1) return;
 state.pageNum--;
 renderPage(state.pageNum);
}
function nextPage() {
 if (!state.pdfDoc || state.pageNum >= state.pdfDoc.numPages) return;
 state.pageNum++;
 renderPage(state.pageNum);
}

pageInput.addEventListener('change', () => {
 const n = parseInt(pageInput.value);
 if (n >= 1 && n <= state.pdfDoc?.numPages) {
 state.pageNum = n;
 renderPage(n);
 } else {
 pageInput.value = state.pageNum;
 }
});

/* ─── ZOOM ───────────────────────────────────────────────── */
$('btn-zoom-in').addEventListener('click', () => setZoom(state.scale + 0.2));
$('btn-zoom-out').addEventListener('click', () => setZoom(state.scale - 0.2));
zoomSlider.addEventListener('input', () => setZoom(zoomSlider.value / 100, false));

function setZoom(newScale, updateSlider = true) {
 newScale = Math.min(3, Math.max(0.5, newScale));
 state.scale = parseFloat(newScale.toFixed(1));
 zoomDisplay.textContent = Math.round(state.scale * 100) + '%';
 if (updateSlider) zoomSlider.value = Math.round(state.scale * 100);
 renderPage(state.pageNum);
}

/* ─── TEMAS ──────────────────────────────────────────────── */
const themeButtons = document.querySelectorAll('.btn-theme');
themeButtons.forEach(btn => {
 btn.addEventListener('click', () => {
 const theme = btn.dataset.theme;
 document.body.className = theme;
 themeButtons.forEach(b => {
 b.classList.toggle('active', b.dataset.theme === theme);
 b.setAttribute('aria-pressed', b.dataset.theme === theme ? 'true' : 'false');
 });
 localStorage.setItem('sr_theme', theme);
 });
});

// Restaurar tema salvo
const savedTheme = localStorage.getItem('sr_theme');
if (savedTheme) {
 document.body.className = savedTheme;
 themeButtons.forEach(b => {
 b.classList.toggle('active', b.dataset.theme === savedTheme);
 b.setAttribute('aria-pressed', b.dataset.theme === savedTheme ? 'true' : 'false');
 });
}

/* ─── TEXT-TO-SPEECH ─────────────────────────────────────── */
const btnTTSPlay = $('btn-tts-play');
const btnTTSStop = $('btn-tts-stop');
const ttsLabelEl = $('tts-btn-label');
const ttsPlayIcon= $('tts-icon-play');
const ttsPauseIcon=$('tts-icon-pause');

// ─── SISTEMA DE TEXT-TO-SPEECH (CORRIGIDO) ──────────────────

// Popular vozes (Resolvido o bug do índice e do filtro)
function loadVoices() {
    if (typeof speechSynthesis === 'undefined') return;
  
    // Pegamos a lista global de todas as vozes do sistema primeiro
    const allVoices = speechSynthesis.getVoices();
    
    // Filtramos apenas para exibição visual
    const filteredVoices = allVoices.filter(v => v.lang.startsWith('pt') || v.lang.startsWith('en'));
  
    if (filteredVoices.length === 0) {
      ttsVoiceSelect.innerHTML = '<option value="-1">Voz padrão do sistema</option>';
      return;
    }
  
    // Mapeamos guardando o NOME da voz no value, para não depender de índices voláteis
    ttsVoiceSelect.innerHTML = filteredVoices.map((v, index) => {
      // Só deixa pré-selecionada a PRIMEIRA voz em pt-BR que encontrar para evitar conflitos
      const isFirstPT = v.lang.startsWith('pt') && filteredVoices.findIndex(f => f.lang.startsWith('pt')) === index;
      return `<option value="${v.name}" ${isFirstPT ? 'selected' : ''}>${v.name} (${v.lang})</option>`;
    }).join('');
  }
  
  // Escuta tanto o evento padrão quanto uma verificação direta para o ciclo do PWA
  if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
  speechSynthesis.addEventListener('voiceschanged', loadVoices);
  loadVoices(); // Execução imediata preventiva
  
  ttsRateInput.addEventListener('input', () => {
    ttsRateVal.textContent = parseFloat(ttsRateInput.value).toFixed(1) + '×';
  });
  ttsPitchInput.addEventListener('input', () => {
    ttsPitchVal.textContent = parseFloat(ttsPitchInput.value).toFixed(1);
  });
  
  btnTTSPlay.addEventListener('click', () => {
    if (state.isSpeaking && !state.isPaused) {
      // Pausar
      speechSynthesis.pause();
      state.isPaused = true;
      setTTSState('paused');
      setStatus('Leitura pausada.');
    } else if (state.isPaused) {
      // Retomar
      speechSynthesis.resume();
      state.isPaused = false;
      setTTSState('playing');
      setStatus('Lendo…');
    } else {
      // Iniciar
      startReading();
    }
  });
  
  btnTTSStop.addEventListener('click', stopReading);
  
  function getTextToRead() {
    if (state.ocrText) return state.ocrText;
    return state.currentTextItems.map(i => i.str).join(' ').trim();
  }
  
  function startReading() {
    const text = getTextToRead();
    if (!text) {
      showToast('Nenhum texto encontrado. Tente usar OCR.', 'error');
      return;
    }
  
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    
    // Define o idioma padrão, mas a voz escolhida abaixo vai sobrescrever com precisão
    utter.lang = 'pt-BR'; 
    utter.rate = parseFloat(ttsRateInput.value);
    utter.pitch = parseFloat(ttsPitchInput.value);
  
    // Busca a voz selecionada comparando pelo nome direto (à prova de falhas de índice)
    const allVoices = speechSynthesis.getVoices();
    const selectedVoiceName = ttsVoiceSelect.value;
    const chosenVoice = allVoices.find(v => v.name === selectedVoiceName);
    
    if (chosenVoice) {
      utter.voice = chosenVoice;
      utter.lang = chosenVoice.lang; // Garante a sincronia de idioma da voz
    }
  
    utter.onstart = () => {
      state.isSpeaking = true;
      state.isPaused = false;
      setTTSState('playing');
      setStatus('Lendo…');
    };
    
    utter.onend = utter.onerror = () => {
      state.isSpeaking = false;
      state.isPaused = false;
      setTTSState('idle');
      setStatus(`Página ${state.pageNum} de ${state.pdfDoc?.numPages ?? '—'}`);
    };
  
    speechSynthesis.speak(utter);
  }
  
  function stopReading() {
    speechSynthesis.cancel();
    state.isSpeaking = false;
    state.isPaused = false;
    setTTSState('idle');
  }
  
  function setTTSState(s) {
    if (s === 'playing') {
      btnTTSPlay.classList.add('speaking');
      ttsLabelEl.textContent = 'Pausar';
      ttsPlayIcon.style.display = 'none';
      ttsPauseIcon.style.display = 'block';
      btnTTSStop.disabled = false;
      btnTTSPlay.setAttribute('aria-label', 'Pausar leitura');
    } else if (s === 'paused') {
      btnTTSPlay.classList.remove('speaking');
      ttsLabelEl.textContent = 'Retomar';
      ttsPlayIcon.style.display = 'block';
      ttsPauseIcon.style.display = 'none';
      btnTTSPlay.setAttribute('aria-label', 'Retomar leitura');
    } else {
      btnTTSPlay.classList.remove('speaking');
      ttsLabelEl.textContent = 'Ler página';
      ttsPlayIcon.style.display = 'block';
      ttsPauseIcon.style.display = 'none';
      btnTTSStop.disabled = true;
      btnTTSPlay.setAttribute('aria-label', 'Iniciar leitura em voz alta');
    }
  }

/* ─── BUSCA ──────────────────────────────────────────────── */
// Ouvintes para os novos botões do HTML
$('btn-highlight').addEventListener('click', aplicarDestaqueManual);
$('btn-download-pdf').addEventListener('click', downloadModifiedPDF);
$('btn-search').addEventListener('click', performSearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') performSearch(); });

function performSearch() {
 const term = searchInput.value.trim().toLowerCase();
 if (!term) return;

 const spans = textLayer.querySelectorAll('span');
 let count = 0;
 spans.forEach(span => {
 span.classList.remove('highlight', 'highlight-active');
 if (span.textContent.toLowerCase().includes(term)) {
 span.classList.add('highlight');
 count++;
 }
 });

 // Rolar para o primeiro resultado
 const first = textLayer.querySelector('.highlight');
 if (first) {
 first.classList.add('highlight-active');
 first.scrollIntoView({ behavior: 'smooth', block: 'center' });
 }

 searchResults.textContent = count > 0
 ? `${count} ocorrência${count !== 1 ? 's' : ''} encontrada${count !== 1 ? 's' : ''}`
 : 'Nenhuma ocorrência encontrada.';
}

/* ─── OCR COM TESSERACT.js ───────────────────────────────── */
$('btn-ocr').addEventListener('click', runOCR);

async function runOCR() {
 if (!state.pdfDoc) return;

 // Carregar Tesseract.js dinamicamente
 if (!window.Tesseract) {
 const script = document.createElement('script');
 script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
 document.head.appendChild(script);
 await new Promise((res, rej) => { script.onload = res; script.onerror = rej; });
 }

 ocrStatus.innerHTML = `
 <div class="ocr-progress">
 <div class="progress-bar"><div class="progress-fill" id="ocr-bar" style="width:0%"></div></div>
 <span id="ocr-pct">0%</span>
 </div>`;
 setStatus('OCR em andamento…');
 $('btn-ocr').disabled = true;

 try {
 const worker = await Tesseract.createWorker('por', 1, {
 logger: m => {
 if (m.status === 'recognizing text') {
 const pct = Math.round(m.progress * 100);
 const bar = $('ocr-bar');
 const pctEl = $('ocr-pct');
 if (bar) bar.style.width = pct + '%';
 if (pctEl) pctEl.textContent = pct + '%';
 }
 }
 });

 // Usar canvas atual como fonte para OCR
 const imageData = canvas.toDataURL('image/png');
 const { data } = await worker.recognize(imageData);
 await worker.terminate();

 state.ocrText = data.text;
 state.ocrProcessed.add(state.pageNum);
 statusOcr.style.display = 'inline';
 ocrStatus.textContent = `OCR concluído — ${data.text.split(/\s+/).filter(Boolean).length} palavras extraídas.`;
 updateVLibrasTarget(data.text);
 setStatus(`Página ${state.pageNum} — OCR processado`);
 showToast('OCR concluído com sucesso.', 'success');
 } catch (err) {
 console.error(err);
 ocrStatus.textContent = 'Erro no OCR. Verifique a conexão.';
 showToast('Falha no OCR.', 'error');
 setStatus('Erro no OCR.');
 } finally {
 $('btn-ocr').disabled = false;
 }
}

/* ─── VLIBRAS ────────────────────────────────────────────── */
$('btn-libras').addEventListener('click', () => {
 const text = getTextToRead();
 if (!text) {
 showToast('Nenhum texto disponível para tradução.', 'error');
 return;
 }
 updateVLibrasTarget(text);
 showToast('Texto enviado ao VLibras.', 'success');
});

function updateVLibrasTarget(text) {
 if (!text) return;
 vlibrasText.textContent = '';
 requestAnimationFrame(() => { vlibrasText.textContent = text; });
}

/* ─── SALVAR / RECUPERAR PROGRESSO ──────────────────────── */
$('btn-save-progress').addEventListener('click', () => {
 if (!state.pdfDoc || !state.fileName) return;
 saveProgress(state.fileName, state.pageNum);
 showToast(`Progresso salvo — página ${state.pageNum}.`, 'success');
});

function saveProgress(fileName, page) {
 try {
 const data = JSON.parse(localStorage.getItem('sr_progress') || '{}');
 data[fileName] = { page, savedAt: Date.now() };
 localStorage.setItem('sr_progress', JSON.stringify(data));
 } catch { /* storage indisponível */ }
}

function loadProgress(fileName) {
 try {
 const data = JSON.parse(localStorage.getItem('sr_progress') || '{}');
 return data[fileName]?.page || null;
 } catch { return null; }
}

// Auto-save a cada troca de página
const _origRender = renderPage;
// (auto-save integrado no fluxo de navegação via estado)

/* ─── FULLSCREEN ─────────────────────────────────────────── */
$('btn-fullscreen').addEventListener('click', toggleFullscreen);
function toggleFullscreen() {
 if (!document.fullscreenElement) {
 document.documentElement.requestFullscreen().catch(() => {});
 } else {
 document.exitFullscreen();
 }
}

/* ─── SIDEBAR TOGGLE ─────────────────────────────────────── */
$('btn-toggle-sidebar').addEventListener('click', () => {
 const sidebar = $('sidebar');
 const isMobile = window.innerWidth <= 680;
 if (isMobile) {
 sidebar.classList.remove('mobile-open');
 $('btn-open-sidebar').style.display = 'flex';
 } else {
 sidebar.classList.toggle('collapsed');
 const isCollapsed = sidebar.classList.contains('collapsed');
 $('btn-open-sidebar').style.display = isCollapsed ? 'flex' : 'none';
 $('btn-toggle-sidebar').setAttribute('aria-expanded', !isCollapsed);
 }
});

$('btn-open-sidebar').addEventListener('click', () => {
 const sidebar = $('sidebar');
 const isMobile = window.innerWidth <= 680;
 if (isMobile) {
 sidebar.classList.add('mobile-open');
 $('btn-open-sidebar').style.display = 'none';
 } else {
 sidebar.classList.remove('collapsed');
 $('btn-open-sidebar').style.display = 'none';
 $('btn-toggle-sidebar').setAttribute('aria-expanded', 'true');
 }
});

/* ─── ATALHOS DE TECLADO ─────────────────────────────────── */
document.addEventListener('keydown', e => {
 // Ignorar quando foco está em input/select/textarea
 const tag = document.activeElement.tagName;
 if (['INPUT','SELECT','TEXTAREA'].includes(tag)) return;

 switch (e.key) {
 case 'ArrowRight':
 case 'PageDown': e.preventDefault(); nextPage(); break;
 case 'ArrowLeft':
 case 'PageUp': e.preventDefault(); prevPage(); break;
 case '+': e.preventDefault(); setZoom(state.scale + 0.2); break;
 case '-': e.preventDefault(); setZoom(state.scale - 0.2); break;
 case 'r': case 'R': if (!state.isSpeaking) startReading(); else stopReading(); break;
 case 'f': case 'F': toggleFullscreen(); break;
 case 'o': case 'O': fileInput.click(); break;
 case 's': case 'S':
 if (state.pdfDoc && state.fileName) { saveProgress(state.fileName, state.pageNum); showToast('Progresso salvo.', 'success'); }
 break;
 case 'Escape': stopReading(); break;
 }
});

/* ─── HABILITAR/DESABILITAR CONTROLES ────────────────────── */
function enableControls(enabled) {
    const ids = ['btn-prev','btn-next','btn-zoom-in','btn-zoom-out',
    'page-input','zoom-slider','btn-tts-play','search-input',
    'btn-search','btn-ocr','btn-libras', 
    'btn-highlight', 'btn-download-pdf']; // <-- ADICIONE ESSES DOIS AQUI NO FINAL DO ARRAY
    
    ids.forEach(id => {
    const el = $(id);
    if (el) el.disabled = !enabled;
    });
   }

/* ─── STATUS ─────────────────────────────────────────────── */
function setStatus(msg) {
 statusMsg.textContent = msg;
}

/* ─── OFFLINE DETECTION ──────────────────────────────────── */
function updateOnlineStatus() {
 statusOffline.style.display = navigator.onLine ? 'none' : 'inline';
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

/* ─── PWA — SERVICE WORKER ───────────────────────────────── */
if ('serviceWorker' in navigator) {
 window.addEventListener('load', () => {
 navigator.serviceWorker.register('sw.js').catch(() => {
 // SW não disponível — modo degradado, funcionalidade online normal
 });
 });
}

/* ─── BARRA LATERAL AJUSTÁVEL (RESIZE) ────────────────────── */
function initSidebarResizer() {
    const sidebar = $('sidebar');
    if (!sidebar) return;
  
    // Cria a alça de arraste dinamicamente para preservar o HTML intacto
    const resizer = document.createElement('div');
    resizer.id = 'sidebar-resizer';
    resizer.className = 'sidebar-resizer';
    sidebar.appendChild(resizer);
  
    let isDragging = false;
  
    resizer.addEventListener('pointerdown', (e) => {
      // Impede o redimensionamento se o menu estiver fechado ou se for tela mobile
      if (sidebar.classList.contains('collapsed') || window.innerWidth <= 680) return;
      
      isDragging = true;
      resizer.classList.add('is-dragging');
      document.body.classList.add('is-resizing');
      resizer.setPointerCapture(e.pointerId); // Garante captura do evento mesmo fora do elemento
    });
  
    document.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
  
      // Calcula a nova largura baseada na posição horizontal do ponteiro
      let newWidth = e.clientX;
  
      // Travas de segurança baseadas no CSS
      if (newWidth < 200) newWidth = 200;
      if (newWidth > 480) newWidth = 480;
  
      // Aplica a largura dinamicamente tanto para layouts Flexbox quanto Block fixo
      sidebar.style.width = `${newWidth}px`;
      sidebar.style.flex = `0 0 ${newWidth}px`;
    });
  
    document.addEventListener('pointerup', (e) => {
      if (!isDragging) return;
  
      isDragging = false;
      resizer.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing');
      resizer.releasePointerCapture(e.pointerId);
  
      // Salva a preferência do usuário, mantendo a autonomia de UX
      if (!sidebar.classList.contains('collapsed') && window.innerWidth > 680) {
        localStorage.setItem('sr_sidebar_width', sidebar.style.width);
      }
    });
  
    // Restaura a largura customizada salva anteriormente (se houver)
    const savedWidth = localStorage.getItem('sr_sidebar_width');
    if (savedWidth && window.innerWidth > 680 && !sidebar.classList.contains('collapsed')) {
      sidebar.style.width = savedWidth;
      sidebar.style.flex = `0 0 ${savedWidth}`;
    }
  }
  
/* ─── BANCO DE DADOS LOCAL (INDEXEDDB) ───────────────────── */
function getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SmartReaderDB', 1);
      request.onupgradeneeded = e => {
        e.target.result.createObjectStore('pdfs');
      };
      request.onsuccess = e => resolve(e.target.result);
      request.onerror = e => reject(e.target.error);
    });
  }
  
  async function savePDFToStorage(fileName, arrayBuffer) {
    try {
      const db = await getDB();
      const tx = db.transaction('pdfs', 'readwrite');
      tx.objectStore('pdfs').put(arrayBuffer, 'current_pdf');
      localStorage.setItem('sr_current_filename', fileName);
    } catch (err) { console.error('Erro ao salvar no IndexedDB:', err); }
  }
  
  async function loadPDFFromStorage() {
    try {
      const db = await getDB();
      return new Promise((resolve) => {
        const tx = db.transaction('pdfs', 'readonly');
        const req = tx.objectStore('pdfs').get('current_pdf');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  }

  // Inicializa o recurso assim que o script carregar totalmente
  initSidebarResizer();

/* ─── INIT ───────────────────────────────────────────────── */
enableControls(false);
setTTSState('idle');

// Tenta restaurar o último PDF aberto antes do recarregamento (F5)

(async function autoRestore() {
  const savedName = localStorage.getItem('sr_current_filename');

  if (savedName) {
    setStatus('Restaurando sessão anterior…');

    const arrayBuffer = await loadPDFFromStorage();

    if (arrayBuffer) {
      state.fileName = savedName;
      state.ocrProcessed.clear();
      state.ocrText = '';

      docTitle.textContent = savedName;
      fileInfo.textContent = `${savedName} (Sessão Restaurada)`;

      const typedarray = new Uint8Array(arrayBuffer);

      pdfjsLib.getDocument(typedarray).promise.then(pdf => {
        state.pdfDoc = pdf;
        state.pageNum = loadProgress(savedName) || 1;
        pageTotal.textContent = pdf.numPages;
        pageInput.max = pdf.numPages;
        enableControls(true);
        renderPage(state.pageNum);
        showToast('Sessão restaurada com sucesso.', 'success');
      }).catch(() => {
        setStatus('Pronto');
      });
    } else {
      setStatus('Pronto');
    }
  }
})();


/* ─── MARCAÇÕES E EXPORTAÇÃO DE PDF (SELECIONÁVEL E MANUAL) ─ */
state.highlights = state.highlights || {};

// Variável temporária para guardar o que está selecionado no momento
let currentSelectionData = null;

// Escuta a seleção de texto para CAPTURAR as coordenadas, mas NÃO desenha ainda
textLayer.addEventListener('mouseup', captureSelection);
textLayer.addEventListener('touchend', captureSelection);

function captureSelection() {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  if (!selectedText || !state.pdfDoc) {
    currentSelectionData = null;
    return;
  }

  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  const layerRect = textLayer.getBoundingClientRect();

  // Armazena temporariamente os retângulos da seleção atual
  currentSelectionData = {
    pageNum: state.pageNum,
    text: selectedText,
    rects: Array.from(rects).map(rect => ({
      x: (rect.left - layerRect.left) / state.scale,
      y: (rect.top - layerRect.top) / state.scale,
      width: rect.width / state.scale,
      height: rect.height / state.scale
    }))
  };
}

// FUNÇÃO ATIVADA MANUALMENTE: Executa a marcação de fato
function aplicarDestaqueManual() {
  if (!currentSelectionData || currentSelectionData.pageNum !== state.pageNum) {
    showToast('Selecione um texto antes de marcar.', 'error');
    return;
  }

  if (!state.highlights[state.pageNum]) {
    state.highlights[state.pageNum] = [];
  }

  // Transfere a seleção capturada para o histórico permanente de destaques
  currentSelectionData.rects.forEach(r => {
    state.highlights[state.pageNum].push({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      text: currentSelectionData.text
    });

    // Desenha o retângulo amarelo na tela agora que foi confirmado
    drawHighlightOnCanvas(r.x, r.y, r.width, r.height);
  });

  showToast('Destaque aplicado com sucesso.', 'success');
  
  // Limpa a seleção azul do navegador e reseta o estado temporário
  window.getSelection().removeAllRanges();
  currentSelectionData = null;
}

// Mantém o desenho visual do retângulo amarelo na tela
function drawHighlightOnCanvas(x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 0, 0.4)'; 
  ctx.fillRect(x * state.scale, y * state.scale, w * state.scale, h * state.scale);
  ctx.restore();
}

// FUNÇÃO DE EXPORTAÇÃO (DOWNLOAD DO PDF EDITADO)
async function downloadModifiedPDF() {
  if (!state.pdfDoc) return;
  setStatus('Preparando download…');

  if (!window.PDFLib) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    document.head.appendChild(script);
    await new Promise((res, rej) => { script.onload = res; script.onerror = rej; });
  }

  try {
    const originalBytes = await loadPDFFromStorage();
    if (!originalBytes) throw new Error('PDF original não encontrado no storage.');

    const pdfDocModifier = await PDFLib.PDFDocument.load(originalBytes);
    const pages = pdfDocModifier.getPages();

    Object.keys(state.highlights).forEach(pageIdx => {
      const pageNum = parseInt(pageIdx);
      const pdfLibPage = pages[pageNum - 1];
      const { width, height } = pdfLibPage.getSize();
      
      state.highlights[pageIdx].forEach(h => {
        const pdfY = height - (h.y + h.height);
        pdfLibPage.drawRectangle({
          x: h.x,
          y: pdfY,
          width: h.width,
          height: h.height,
          color: PDFLib.rgb(1, 1, 0),
          opacity: 0.4,
        });
      });
    });

    const modifiedBytes = await pdfDocModifier.save();
    const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `editado_${state.fileName || 'documento.pdf'}`;
    link.click();
    
    showToast('Download concluído!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Erro ao exportar o PDF.', 'error');
  } finally {
    setStatus(`Página ${state.pageNum} de ${state.pdfDoc.numPages}`);
  }
}


// FUNÇÃO DE EXPORTAÇÃO (DOWNLOAD DO PDF EDITADO)
async function downloadModifiedPDF() {
  if (!state.pdfDoc) return;
  setStatus('Preparando download…');

  // Carrega a biblioteca de manipulação PDF sob demanda (mantém performance)
  if (!window.PDFLib) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    document.head.appendChild(script);
    await new Promise((res, rej) => { script.onload = res; script.onerror = rej; });
  }

  try {
    // Recupera os bytes do PDF original guardados no nosso banco local
    const originalBytes = await loadPDFFromStorage();
    if (!originalBytes) throw new Error('PDF original não encontrado no storage.');

    // Inicializa o modificador da PDF-Lib
    const pdfDocModifier = await PDFLib.PDFDocument.load(originalBytes);
    const pages = pdfDocModifier.getPages();

    // Aplica todos os destaques salvos nas respectivas páginas do arquivo binário real
    Object.keys(state.highlights).forEach(pageIdx => {
      const pageNum = parseInt(pageIdx);
      const pdfLibPage = pages[pageNum - 1];
      const { width, height } = pdfLibPage.getSize();
      
      state.highlights[pageIdx].forEach(h => {
        // Conversão de coordenadas: PDF-Lib adota o eixo Y iniciando na base inferior da folha
        // O PDF.js adota o topo esquerdo como (0,0). Fazemos a inversão:
        const pdfY = height - (h.y + h.height);

        pdfLibPage.drawRectangle({
          x: h.x,
          y: pdfY,
          width: h.width,
          height: h.height,
          color: PDFLib.rgb(1, 1, 0), // Amarelo puro
          opacity: 0.4,
        });
      });
    });

    // Salva o novo arquivo binário gerado
    const modifiedBytes = await pdfDocModifier.save();
    
    // Força o download nativo do arquivo no navegador do usuário
    const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `editado_${state.fileName || 'documento.pdf'}`;
    link.click();
    
    showToast('Download concluído!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Erro ao exportar o PDF.', 'error');
  } finally {
    setStatus(`Página ${state.pageNum} de ${state.pdfDoc.numPages}`);
  }
}

// ─── SISTEMA DE TRADUÇÃO DA SIDEBAR (VERSÃO ULTRA ESTÁVEL) ───────────────────────

const btnTranslate = document.getElementById('btn-translate');
const translateStatus = document.getElementById('translate-status');

if (btnTranslate) {
  btnTranslate.addEventListener('click', async () => {
    // 1. Tenta pegar o texto selecionado pelo usuário
    let textoParaTraduzir = window.getSelection().toString().trim();
    
    // 2. Se não tiver seleção, tenta pegar o texto do OCR
    if (!textoParaTraduzir && typeof state !== 'undefined' && state.ocrText) {
      textoParaTraduzir = state.ocrText;
    }

    if (!textoParaTraduzir) {
      showToast('Selecione um texto ou processe o OCR para traduzir.', 'error');
      return;
    }

    try {
      btnTranslate.disabled = true;
      translateStatus.textContent = "Traduzindo texto...";
      translateStatus.style.color = "var(--text-sec)";

      // URL do motor estável do Google Translate (Auto-detectar idioma -> Português)
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q=${encodeURIComponent(textoParaTraduzir)}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Falha na API de tradução');
      
      const data = await response.json();
      
      // O Google quebra textos grandes em pedaços. Esse map junta todos os pedaços perfeitamente.
      const textoTraduzido = data[0].map(item => item[0]).join('');

      // Exibe o resultado na tela com o layout acessível para baixa visão
      translateStatus.innerHTML = `
        <strong style="color: var(--accent); display:block; margin-bottom:4px; font-size:11px; text-transform:uppercase;">Texto Traduzido:</strong>
        <p style="font-size: 12px; line-height: 1.5; color: var(--text-primary); text-align: left; background: var(--bg-hover); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); max-height: 200px; overflow-y: auto; white-space: pre-wrap;">
          ${textoTraduzido}
        </p>
      `;
      
      showToast('Tradução concluída!', 'success');

    } catch (error) {
      console.error(error);
      translateStatus.textContent = "Erro ao tentar traduzir.";
      translateStatus.style.color = "red";
      showToast('Erro ao conectar com o servidor de tradução.', 'error');
    } finally {
      btnTranslate.disabled = false;
    }
  });
}

// ─── CONTROLE RESPONSIVO DA SIDEBAR VIA IDs NATIVOS ───────

const btnAbrirMobile = document.getElementById('btn-open-sidebar');
const btnFecharMobile = document.getElementById('btn-toggle-sidebar');
const sidebarObjeto = document.querySelector('aside') || document.querySelector('.sidebar');

// Clicou no botão de abrir (☰) -> Adiciona a classe que mostra a sidebar
if (btnAbrirMobile && sidebarObjeto) {
  btnAbrirMobile.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebarObjeto.classList.add('active');
  });
}

// Clicou no botão de fechar -> Remove a classe e recolhe a sidebar
if (btnFecharMobile && sidebarObjeto) {
  btnFecharMobile.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebarObjeto.classList.remove('active');
  });
}

// ♿ Acessibilidade: Se o usuário clicar na área branca do PDF, a barra fecha sozinha no mobile
const areaDocumento = document.getElementById('viewerContainer') || document.querySelector('.main-content');
if (areaDocumento && sidebarObjeto) {
  areaDocumento.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebarObjeto.classList.remove('active');
    }
  });
}

// --- LÓGICA DE LOGIN ---
const modalAuth = document.getElementById('modal-auth');
const formAuth = document.getElementById('form-auth');
const authEmail = document.getElementById('auth-email');
const authSenha = document.getElementById('auth-senha');
const btnAuthSubmit = document.getElementById('btn-auth-submit');
const authTitle = document.getElementById('auth-title');
const authToggleLink = document.getElementById('auth-toggle-link');
const authToggleMsg = document.getElementById('auth-toggle-msg');
const btnFecharAuth = document.getElementById('btn-fechar-auth');

let modoCadastro = false;

// 1. Atualiza o botão da barra lateral com o estado da conta
async function atualizarInterfaceUsuario() {
  // Procura o botão na seção de Conta da sidebar
  const botoesSidebar = document.querySelectorAll('section.sidebar-section button');
  const btnConta = Array.from(botoesSidebar).find(b => b.textContent.includes('Entrar') || b.textContent.includes('Sair'));

  if (!btnConta || !window.supabaseClient) return;

  const { data: { user } } = await window.supabaseClient.auth.getUser();

  if (user) {
    const nomeUsuario = user.email.split('@')[0];
    btnConta.innerText = `👤 ${nomeUsuario} (Sair)`;
    btnConta.onclick = fazerLogout;
  } else {
    btnConta.innerText = "👤 Entrar / Cadastrar";
    btnConta.onclick = abrirLogin;
  }
}

// 2. Função para encerrar a sessão (Logout)
async function fazerLogout() {
  await window.supabaseClient.auth.signOut();
  alert("Você saiu da conta.");
  atualizarInterfaceUsuario();
}

// Alternar entre Login e Cadastro
authToggleLink?.addEventListener('click', (e) => {
  e.preventDefault();
  modoCadastro = !modoCadastro;
  authTitle.innerText = modoCadastro ? "Criar Conta" : "Entrar";
  btnAuthSubmit.innerText = modoCadastro ? "Cadastrar" : "Entrar";
  authToggleMsg.innerText = modoCadastro ? "Já tem conta?" : "Não tem conta?";
  authToggleLink.innerText = modoCadastro ? "Fazer Login" : "Criar conta";
});

// Fechar modal
btnFecharAuth?.addEventListener('click', () => {
  modalAuth.style.display = 'none';
});

// Enviar formulário
formAuth?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = authEmail.value;
  const password = authSenha.value;

  try {
    if (modoCadastro) {
      const { error } = await window.supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      alert("Conta criada com sucesso!");
    } else {
      const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      alert("Login realizado!");
    }
    modalAuth.style.display = 'none';
    atualizarInterfaceUsuario(); // ⬅️ Atualiza o botão na hora após logar!
  } catch (err) {
    alert("Erro: " + err.message);
  }
});

// Abrir modal de login
function abrirLogin() {
  if (modalAuth) modalAuth.style.display = 'flex';
}

// Verifica se já está logado ao carregar a página
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(atualizarInterfaceUsuario, 300);
});

// ─── CARREGAR O LIVRO ESCOLHIDO NA BIBLIOTECA ───────────────

async function carregarLivroSelecionado() {
  const parametros = new URLSearchParams(window.location.search);

  const pdfUrl = parametros.get("pdf");
  const titulo = parametros.get("title") || "Livro selecionado";

  // Se nenhum livro foi escolhido, não carrega nada automaticamente
  if (!pdfUrl) {
    console.log("Nenhum livro foi selecionado na biblioteca.");
    return;
  }

  try {
    console.log("Livro selecionado:", titulo);
    console.log("URL recebida:", pdfUrl);

    setStatus("Carregando livro da biblioteca...");

    const respostaPdf = await fetch(pdfUrl);

    if (!respostaPdf.ok) {
      throw new Error("Falha ao baixar o PDF.");
    }

    const blob = await respostaPdf.blob();

    const nomeArquivo = titulo.toLowerCase().endsWith(".pdf")
      ? titulo
      : `${titulo}.pdf`;

    const arquivo = new File(
      [blob],
      nomeArquivo,
      { type: "application/pdf" }
    );

    const docTitle = document.getElementById("doc-title");

    if (docTitle) {
      docTitle.textContent = titulo;
    }

    const emptyState = document.getElementById("empty-state");

    if (emptyState) {
      emptyState.style.display = "none";
    }

    if (typeof loadPDF === "function") {
      loadPDF(arquivo);
    }
  } catch (erro) {
    console.error("Erro ao abrir livro selecionado:", erro);

    if (typeof showToast === "function") {
      showToast("Não foi possível abrir este livro.", "error");
    }

    if (typeof setStatus === "function") {
      setStatus("Erro ao carregar o livro.");
    }
  }
}


carregarLivroSelecionado();

async function limparCache() {
  if ("caches" in window) {
    const nomes = await caches.keys();

    await Promise.all(
      nomes.map(nome => caches.delete(nome))
    );

    console.log("Cache limpo!");
  }
}

limparCache();
