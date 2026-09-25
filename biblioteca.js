'use strict';

const API_BASE_URL = 'https://tcc-smartreader.onrender.com';
let livrosData = [];

// Elementos DOM
const booksGrid = document.getElementById('books-grid');
const searchInput = document.getElementById('library-search-input');
const btnClearSearch = document.getElementById('btn-clear-search');
const libraryStatus = document.getElementById('library-status');
const statusMsg = document.getElementById('status-msg');
const toast = document.getElementById('toast');

/* ─── SHOW TOAST ─── */
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = `toast show${type ? ' toast-' + type : ''}`;
  setTimeout(() => { toast.className = 'toast'; }, 2800);
}

/* ─── CARREGAR LIVROS DA API ─── */
async function fetchLivros() {
  try {
    libraryStatus.textContent = "Buscando acervo no servidor...";
    const response = await fetch(`${API_BASE_URL}/api/livros`);
    if (!response.ok) throw new Error('Falha ao obter lista de livros');

    livrosData = await response.json();
    renderBooks(livrosData);
  } catch (err) {
    console.error(err);
    libraryStatus.textContent = "Erro ao carregar os livros. Certifique-se de que o servidor está rodando.";
    showToast("Erro ao conectar com a API", "error");
  }
}

/* ─── RENDERIZAR CARDS COM ACESSIBILIDADE ─── */
function renderBooks(books) {
  booksGrid.innerHTML = '';
  const serverNotice = document.getElementById('server-notice');
  if (serverNotice) serverNotice.style.display = 'none';

  if (!books || books.length === 0) {
    libraryStatus.textContent = "Nenhum livro encontrado.";
    return;
  }

  libraryStatus.textContent = `Exibindo ${books.length} livro(s) disponível(eis).`;

  books.forEach(book => {
    const card = document.createElement('article');
    card.className = 'book-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Livro: ${book.titulo || 'Sem título'}`);

    const pdfUrl = `${API_BASE_URL}/api/proxy-pdf?url=${encodeURIComponent(book.url_pdf)}`;

  card.innerHTML = `
  <div class="book-cover-placeholder">
    ${
      book.capa_url
        ? `<img 
            src="${book.capa_url}" 
            alt="Capa do livro ${book.titulo || 'Sem título'}"
            class="book-cover-image"
          >`
        : `<span aria-hidden="true">◈</span>`
    }
  </div>

  <h2 class="book-title">
    ${book.titulo || 'Sem título'}
  </h2>

  <p class="book-author">
    ${book.autor || 'Autor desconhecido'}
  </p>

  <button
    class="btn-action btn-read-book"
    aria-label="Ler o livro ${book.titulo || 'Sem título'}"
  >
    Abrir Leitura
  </button>
`;

    // Redireciona o usuário para abrir o PDF diretamente na aplicação de leitura
    const readBtn = card.querySelector('.btn-read-book');
    const openBook = () => {
      // Salva a referência no localStorage para o SmartReader consumir
      localStorage.setItem('sr_current_filename', book.titulo || 'Livro Selecionado');
      // Redireciona apontando o proxy para o player
      window.location.href = `leitor.html?pdf=${encodeURIComponent(pdfUrl)}&title=${encodeURIComponent(book.titulo || '')}`;
    };

    readBtn.addEventListener('click', openBook);
    booksGrid.appendChild(card);
  });
}

/* ─── FILTRO DE BUSCA ─── */
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  const filtered = livrosData.filter(b => 
    (b.titulo && b.titulo.toLowerCase().includes(query)) ||
    (b.autor && b.autor.toLowerCase().includes(query))
  );
  renderBooks(filtered);
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  renderBooks(livrosData);
  searchInput.focus();
});

/* ─── RECURSOS DE VOZ / TTS DO CATÁLOGO ─── */
document.getElementById('btn-read-catalog').addEventListener('click', () => {
  if (typeof speechSynthesis === 'undefined') return;

  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    showToast('Leitura interrompida');
    return;
  }

  const titles = Array.from(document.querySelectorAll('.book-title')).map(el => el.textContent);
  if (titles.length === 0) {
    showToast('Nenhum livro para ler', 'error');
    return;
  }

  const textToRead = "Livros disponíveis no catálogo: " + titles.join(', ');
  const utter = new SpeechSynthesisUtterance(textToRead);
  utter.lang = 'pt-BR';
  speechSynthesis.speak(utter);
  showToast('Lendo catálogo em voz alta...');
});

/* ─── VLIBRAS TRIGGER ─── */
document.getElementById('btn-libras').addEventListener('click', () => {
  const vlibrasText = document.getElementById('vlibras-text');
  const titles = Array.from(document.querySelectorAll('.book-title')).map(el => el.textContent);
  
  if (titles.length === 0) return;

  vlibrasText.textContent = '';
  requestAnimationFrame(() => {
    vlibrasText.textContent = "Catálogo de livros: " + titles.join('. ');
  });
  showToast('Texto enviado para o VLibras', 'success');
});

/* ─── SIDEBAR RESPONSIVA ─── */
document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
  document.getElementById('btn-open-sidebar').style.display = 'flex';
});

document.getElementById('btn-open-sidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('collapsed');
  document.getElementById('btn-open-sidebar').style.display = 'none';
});

/* ─── TROCA DE TEMAS E RESTAURAÇÃO ─── */
function initTheme() {
  const themeButtons = document.querySelectorAll('.btn-theme');
  const savedTheme = localStorage.getItem('sr_theme') || 'theme-dark';

  // Aplica o tema na raiz e no body
  document.documentElement.className = savedTheme;
  document.body.className = savedTheme;

  // Atualiza os botões
  themeButtons.forEach(b => {
    const isActive = b.dataset.theme === savedTheme;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // Listener para troca
  themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      document.documentElement.className = theme;
      document.body.className = theme;
      localStorage.setItem('sr_theme', theme);

      themeButtons.forEach(b => {
        const isActive = b.dataset.theme === theme;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  fetchLivros();
});

// Atualiza quando o usuário volta para a biblioteca
window.addEventListener('focus', () => {
  fetchLivros();
});

// Também atualiza ao voltar pelo botão do navegador
window.addEventListener('pageshow', () => {
  fetchLivros();
});

