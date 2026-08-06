const express = require("express");

console.log("LivrosRoutes carregada!");

const upload = require("../upload");
const { cadastrarLivro, listarLivros } = require("../controllers/livrosController");

const router = express.Router();

router.get("/", listarLivros);

router.post(
  "/",
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "capa", maxCount: 1 }
  ]),
  cadastrarLivro
);

module.exports = router;