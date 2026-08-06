const supabase = require("../config/supabase");

async function listarLivros(req, res) {
  const { data, error } = await supabase
    .from("livros")
    .select("id, titulo, autor, url_pdf, capa_url, created_at")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ erro: "Erro ao buscar livros.", detalhes: error });
  res.json(data);
}

async function cadastrarLivro(req, res) {
  try {
    // 1. Extrai os textos do formulário
    const { titulo, autor } = req.body;

   // Verifica se o PDF foi enviado
if (!req.files || !req.files.pdf) {
  return res.status(400).json({
    erro: "Nenhum arquivo PDF foi enviado."
  });
}

const pdf = req.files.pdf[0];

// Nome do PDF
const nomeArquivo = `${Date.now()}-${pdf.originalname}`;

// Upload do PDF
const { data: uploadData, error: uploadError } = await supabase.storage
  .from("livros-pdf")
  .upload(nomeArquivo, pdf.buffer, {
    contentType: pdf.mimetype,
  });
let capa_url = null;

if (req.files.capa) {
  const capa = req.files.capa[0];

  const nomeCapa = `${Date.now()}-${capa.originalname}`;

  const { error: capaError } = await supabase.storage
    .from("capa_livros")
    .upload(nomeCapa, capa.buffer, {
      contentType: capa.mimetype,
    });

  if (capaError) {
    return res.status(500).json({
      erro: "Erro ao enviar a capa."
    });
  }

  const { data } = supabase.storage
    .from("capa_livros")
    .getPublicUrl(nomeCapa);

  capa_url = data.publicUrl;
}
    if (uploadError) {
      return res.status(500).json({ erro: "Erro ao enviar o PDF para o Storage." });
    }

    // 4. Obtém a URL pública do PDF
    const { data: urlData } = supabase.storage
      .from("livros-pdf")
      .getPublicUrl(nomeArquivo);

    const url_pdf = urlData.publicUrl;

    // 5. Guarda as informações na tabela 'livros' do banco de dados
    const { data, error } = await supabase
      .from("livros")
      .insert([
        {
         titulo,
         autor,
         url_pdf,
         capa_url
      }
   ])
  .select();

    if (error) {
      return res.status(500).json({ erro: "Erro ao salvar no banco de dados.", detalhes: error });
    }

    // Sucesso!
    return res.status(201).json({
      mensagem: "Livro cadastrado com sucesso!",
      livro: data[0]
    });

  } catch (err) {
    return res.status(500).json({ erro: "Erro interno no servidor." });
  }
}

module.exports = {
  cadastrarLivro,
  listarLivros,
};