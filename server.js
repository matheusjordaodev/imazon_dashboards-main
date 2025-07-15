// ─────────────────────────────────────────────────────────────
// IMAZON GEO – SERVIDOR DASHBOARDS (versão com correções EE)
// ─────────────────────────────────────────────────────────────

// IMPORTS -----------------------------------------------------
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const csv     = require('csv-parser');
const axios   = require('axios').default;
const ee      = require('@google/earthengine');

// CONFIGURAÇÕES ----------------------------------------------
const PORT          = process.env.PORT || 8053;
const ROOT_DIR      = __dirname;
const DASHBOARD_DIR = path.join(ROOT_DIR, 'app', 'dashboards');
const DATASET_DIR   = path.join(ROOT_DIR, 'dataset');

// Mapeamento MIME (básico)
const MIME = {
  '.html':    'text/html',
  '.js':      'application/javascript',
  '.css':     'text/css',
  '.json':    'application/json',
  '.geojson': 'application/json',
  '.csv':     'text/csv',
  '.png':     'image/png',
  '.jpg':     'image/jpeg',
  '.svg':     'image/svg+xml',
};

// ─── EARTH ENGINE -------------------------------------------
// Carrega chave de serviço (procura na raiz do projeto)
const privateKey = require(path.join(__dirname, 'privatekey.json'));

let eeReady = null;                        // cache da Promise de init

function initializeEE() {
  if (eeReady) return eeReady;             // já inicializado → reutiliza

  eeReady = new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      privateKey,
      () => ee.initialize(null, null, resolve, reject),
      reject
    );
  })
  .then(() => console.log('✅ Earth Engine autenticado'))
  .catch(err => {
    eeReady = null;                        // permite tentar de novo
    throw err;
  });

  return eeReady;
}

async function getSRTMMapUrl() {
  await initializeEE();
  const asset = 'projects/imazon-simex/FLORESER/floreser-collection-9-22-1-ages-sf/floreser-2023-22-1';
  const img   = ee.Image(asset);
  const vis   = { min: 1, max: 38, palette: ['#e7f8eb', '#12c23f'] };
  const { urlFormat } = img.getMap(vis);   // lança se asset inacessível
  return urlFormat;
}

console.log('🌍 Inicializando Earth Engine...');
console.log(initializeEE());
// ─── EXPRESS APP --------------------------------------------
const app = express();

// Diretórios estáticos                                        
app.use('/dataset', express.static(DATASET_DIR));
app.use('/css',     express.static(path.join(ROOT_DIR, 'css')));
app.use('/js',      express.static(path.join(ROOT_DIR, 'js')));
app.use('/assets',  express.static(path.join(ROOT_DIR, 'assets')));
app.use('/img',     express.static(path.join(ROOT_DIR, 'img')));

// ------------------------------------------------------------
//                       ROTAS API
// ------------------------------------------------------------

// 1) URL do layer FLORESER (tiles EE)
app.get('/srtm-url', async (_req, res) => {
  try {
    const url = await getSRTMMapUrl();
    res.json({ url });
  } catch (err) {
    console.error('[/srtm-url] erro:', err);
    res.status(500).send('Erro ao obter URL do mapa SRTM');
  }
});

// 2) GeoJSON dos municípios da Amazônia Legal
app.get('/municipios-amazonia', async (_req, res) => {
  try {
    const url = 'https://github.com/imazon-cgi/simex/raw/refs/heads/main/datasets/geojson/limite_municipios_amz_legal.geojson';
    const { data } = await axios.get(url);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao obter GeoJSON de municípios');
  }
});

// 3) Lista de estados (únicos)
app.get('/lista-estados', (_req, res) => {
  const estados = new Set();
  fs.createReadStream(path.join(DATASET_DIR, 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', row => { if (row.state) estados.add(row.state.trim()); })
    .on('end', () => res.json([...estados]))
    .on('error', err => { console.error(err); res.status(500).send('Erro ao carregar estados'); });
});

// 4) Lista de municípios por estado
app.get('/lista-municipios/:estado', (req, res) => {
  const uf = req.params.estado.trim();
  const municipios = new Set();
  fs.createReadStream(path.join(DATASET_DIR, 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', row => {
      if (row.state && row.name && row.state.trim() === uf) municipios.add(row.name.trim());
    })
    .on('end', () => res.json([...municipios]))
    .on('error', err => { console.error(err); res.status(500).send('Erro ao carregar municípios'); });
});

// 5) Dados brutos para o gráfico (todas as linhas)
app.get('/area-data', (_req, res) => {
  const data = [];
  fs.createReadStream(path.join(DATASET_DIR, 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', row => data.push({
      state: row.state,
      name:  row.name,
      year:  parseInt(row.year),
      area:  parseFloat(row.area)
    }))
    .on('end', () => res.json(data))
    .on('error', err => { console.error(err); res.status(500).send('Erro ao carregar dados'); });
});

// 6) Dados de municípios agregados (filtro ano)
app.get('/municipios-area-data', (req, res) => {
  const startYear = parseInt(req.query.startYear) || 2008;
  const endYear   = parseInt(req.query.endYear)   || 2023;

  const linhas = [];
  fs.createReadStream(path.join(DATASET_DIR, 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', row => {
      const y = parseInt(row.year);
      if (row.name && row.area && row.state && y >= startYear && y <= endYear) {
        linhas.push({
          municipio: row.name.trim(),
          state:     row.state.trim(),
          area:      parseFloat(row.area)
        });
      }
    })
    .on('end', () => {
      const agreg = linhas.reduce((acc, r) => {
        const key = `${r.state}_${r.municipio}`;
        acc[key] = acc[key] || { municipio: r.municipio, state: r.state, area: 0 };
        acc[key].area += r.area;
        return acc;
      }, {});
      const arr = Object.values(agreg).sort((a, b) => b.area - a.area);
      res.json(arr);
    })
    .on('error', err => { console.error(err); res.status(500).send('Erro ao processar CSV'); });
});

// ------------------------------------------------------------
//            MIDDLEWARE – SERVE DASHBOARDS HTML/CSS
// ------------------------------------------------------------
app.use((req, res, next) => {
  let pathname = req.path;

  // Remove prefixo /app/dashboards
  if (pathname.startsWith('/app/dashboards')) {
    pathname = pathname.replace(/^\/app\/dashboards/, '') || '/';
  }

  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(DASHBOARD_DIR, 'index.html');
  } else {
    filePath = path.join(DASHBOARD_DIR, pathname);
    if (!path.extname(filePath)) {
      const tryHtml = `${filePath}.html`;
      filePath = fs.existsSync(tryHtml) ? tryHtml : path.join(DASHBOARD_DIR, 'index.html');
    }
  }

  if (fs.existsSync(filePath) && filePath.startsWith(DASHBOARD_DIR)) {
    res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    return res.sendFile(filePath);
  }
  next();
});

// 404 ---------------------------------------------------------
app.use((req, res) => res.status(404).send(`404 – ${req.path} não encontrado.`));

// START -------------------------------------------------------
app.listen(PORT, () => console.log(`🚀  Servidor rodando em http://localhost:${PORT}`));
