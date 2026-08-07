require("dotenv").config();
console.log("=== SERVER NOVO ===");
const supabase = require("./config/supabase");


const express = require("express");
const cors = require("cors");
const livrosRoutes = require("./routes/livrosRoutes");
const app = express();


app.use(cors());
app.use(express.json());
app.use("/api/livros", livrosRoutes);
// Rota inicial amo ff
app.get("/teste123", (req, res) => {
    res.send("Teste OK");
});







// Nova rota para servir o arquivo PDF sem CORS no front:
app.get("/api/proxy-pdf", async (req, res) => {
    const pdfUrl = req.query.url;
    if (!pdfUrl) return res.status(400).send("URL ausente");

    try {
        console.log("Proxy buscando:", pdfUrl);
        const response = await fetch(pdfUrl);

        if (!response.ok) {
            console.error("Supabase respondeu com erro:", response.status, response.statusText);
            return res.status(response.status).send(`Erro ao buscar o PDF na origem: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader("Content-Type", "application/pdf");
        res.send(buffer);
    } catch (err) {
        console.error("Erro no proxy:", err.message);
        res.status(500).send("Erro ao carregar PDF: " + err.message);
    }
});


const PORT = process.env.PORT || 3000;
console.log("Cheguei antes do app.listen");


app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

