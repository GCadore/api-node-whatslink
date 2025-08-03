const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const cors = require("cors");

const app = express();
app.use(cors());
const PORT = process.env.PORT || 8000;

// Swagger config
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "WhatsApp Group Link Scraper API",
      version: "1.0.0",
      description: "API para coletar links e categorias de grupos de WhatsApp de sites específicos",
    },
    servers: [
      {
        url: "/",
      },
    ],
  },
  apis: ["./api_whatsapp.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Função para buscar os links de grupos
async function getWhatsappGroupLinks(baseUrl, numLinksToGet) {
  const allGroupLinks = [];
  let pageCounter = 1;

  while (allGroupLinks.length < numLinksToGet) {
    const currentUrl = baseUrl.includes("/page/")
      ? `${baseUrl}/page/${pageCounter}`
      : `${baseUrl}?page=${pageCounter}`;

    try {
      const response = await axios.get(currentUrl);
      const $ = cheerio.load(response.data);
      const groupCards = $("div.card.group, div.card.group.vip");

      if (groupCards.length === 0) break;

      for (
        let i = 0;
        i < groupCards.length && allGroupLinks.length < numLinksToGet;
        i++
      ) {
        const card = groupCards[i];
        const cardBody = cheerio.load(card)("div.card-body");
        const linkTag = cardBody.find("a[href]").first();
        if (!linkTag.length) continue;

        let detailPageUrl = linkTag.attr("href");
        if (!detailPageUrl.startsWith("http")) {
          detailPageUrl = `${baseUrl.replace(/\/$/, "")}/${detailPageUrl.replace(/^\//, "")}`;
        }

        try {
          const detailResponse = await axios.get(detailPageUrl);
          const $$ = cheerio.load(detailResponse.data);
          const detailCardBody = $$(".card-body");
          const whatsappLinkTag = detailCardBody.find("a.btn.btn-success.btn-block[data-url]");

          if (whatsappLinkTag.length > 0) {
            const whatsappGroupLink = whatsappLinkTag.attr("data-url");
            if (whatsappGroupLink.includes("chat.whatsapp.com")) {
              allGroupLinks.push(whatsappGroupLink);
            }
          }
        } catch (err) {
          continue;
        }
      }

      pageCounter++;
    } catch (err) {
      break;
    }
  }

  return allGroupLinks.slice(0, numLinksToGet);
}

// Função para buscar categorias da página inicial
async function getCategories(baseUrl) {
  try {
    const response = await axios.get(baseUrl);
    const $ = cheerio.load(response.data);

    const categories = [];

    $(".row-categories .col-category a.category").each((i, el) => {
      const name = $(el).find(".category-name").text().trim();
      const url = $(el).attr("href");
      if (name && url) {
        categories.push({ name, url });
      }
    });

    return categories;
  } catch (error) {
    console.error("Erro ao buscar categorias:", error.message);
    return [];
  }
}

/**
 * @swagger
 * /get_whatsapp_links:
 *   get:
 *     summary: Coleta links de grupos de WhatsApp
 *     parameters:
 *       - in: query
 *         name: base_url
 *         schema:
 *           type: string
 *           default: https://gruposwhats.app
 *         description: URL base do site que lista os grupos
 *       - in: query
 *         name: num_links
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Número de links a serem coletados
 *     responses:
 *       200:
 *         description: Lista de links de grupos do WhatsApp
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       400:
 *         description: Parâmetros inválidos
 *       404:
 *         description: Nenhum link encontrado
 *       500:
 *         description: Erro interno no servidor
 */
app.get("/get_whatsapp_links", async (req, res) => {
  const baseUrl = req.query.base_url || "https://gruposwhats.app";
  const numLinks = parseInt(req.query.num_links) || 5;

  if (!baseUrl || numLinks <= 0) {
    return res.status(400).json({ error: "Parâmetros inválidos." });
  }

  try {
    const links = await getWhatsappGroupLinks(baseUrl, numLinks);
    if (links.length === 0) {
      return res.status(404).json({ error: "Nenhum link encontrado." });
    }
    res.json(links);
  } catch (err) {
    res.status(500).json({ error: "Erro interno no servidor.", detail: err.message });
  }
});

/**
 * @swagger
 * /get_categories:
 *   get:
 *     summary: Retorna as categorias de grupos disponíveis
 *     parameters:
 *       - in: query
 *         name: base_url
 *         schema:
 *           type: string
 *           default: https://gruposwhats.app
 *         description: URL base do site
 *     responses:
 *       200:
 *         description: Lista de categorias com nome e link
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   url:
 *                     type: string
 *       500:
 *         description: Erro ao buscar categorias
 */
app.get("/get_categories", async (req, res) => {
  const baseUrl = req.query.base_url || "https://gruposwhats.app";

  try {
    const categories = await getCategories(baseUrl);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar categorias", detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
