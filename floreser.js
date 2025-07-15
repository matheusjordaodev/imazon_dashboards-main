/**********************************************************************
 *  FLORESER – API (Router)
 *********************************************************************/
const express = require('express');
const ee      = require('@google/earthengine');
const fs      = require('fs');
const path    = require('path');
const csv     = require('csv-parser');
const axios   = require('axios').default;

const privateKey = require('./privatekey.json');
const router     = express.Router();

/*── Earth Engine helpers ────────────────────────────────────────────*/
function initializeEE () {
  return new Promise((ok, fail) => {
    ee.data.authenticateViaPrivateKey(
      privateKey,
      () => ee.initialize(null, null, ok, fail),
      fail
    );
  });
}

async function getSRTMMapUrl () {
  await initializeEE();
  const asset = 'projects/imazon-simex/FLORESER/'
              + 'floreser-collection-9-22-1-ages-sf/floreser-2023-22-1';
  const img   = ee.Image(asset);
  const vis   = {
    min: 1, max: 38,
    palette: [
      '#e7f8eb', '#cff2d8', '#b7ecc5', '#a0e6b2', '#88e09f',
      '#70da8b', '#59d478', '#41ce65', '#29c852', '#12c23f'
    ]
  };
  return img.getMap(vis).urlFormat;
}

/*── Rotas da API ────────────────────────────────────────────────────*/
router.get('/srtm-url', async (_req, res) => {
  try { res.json({ url: await getSRTMMapUrl() }); }
  catch (e) { console.error(e); res.status(500).send('Erro Earth Engine'); }
});

router.get('/municipios-amazonia', async (_req, res) => {
  try {
    const url   = 'https://github.com/imazon-cgi/simex/raw/refs/heads/main/'
                + 'datasets/geojson/limite_municipios_amz_legal.geojson';
    const { data } = await axios.get(url);
    res.json(data);
  } catch (e) {
    console.error(e); res.status(500).send('Erro GeoJSON');
  }
});

router.get('/lista-estados', (_req, res) => {
  const estados = new Set();
  fs.createReadStream(path.join(__dirname, 'dataset', 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', r => r.state && estados.add(r.state.trim()))
    .on('end',   () => res.json([...estados]))
    .on('error', e => { console.error(e); res.status(500).send('Erro estados'); });
});

router.get('/lista-municipios/:estado', (req, res) => {
  const uf = req.params.estado.trim();
  const municipios = new Set();
  fs.createReadStream(path.join(__dirname, 'dataset', 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', r => {
      if (r.state && r.name && r.state.trim() === uf) municipios.add(r.name.trim());
    })
    .on('end',   () => res.json([...municipios]))
    .on('error', e => { console.error(e); res.status(500).send('Erro municípios'); });
});

router.get('/area-data', (_req, res) => {
  const out = [];
  fs.createReadStream(path.join(__dirname, 'dataset', 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', r => out.push({ state: r.state, name: r.name, year: +r.year, area: +r.area }))
    .on('end',   () => res.json(out))
    .on('error', e => { console.error(e); res.status(500).send('Erro CSV'); });
});

router.get('/municipios-area-data', (req, res) => {
  const ini  = +req.query.startYear || 2008;
  const fim  = +req.query.endYear   || 2023;
  const rows = [];

  fs.createReadStream(path.join(__dirname, 'dataset', 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', r => {
      const y = +r.year;
      if (r.name && r.area && r.state && y >= ini && y <= fim)
        rows.push({ municipio: r.name.trim(), state: r.state.trim(), area: +r.area });
    })
    .on('end', () => {
      const map = rows.reduce((acc, cur) => {
        const k = `${cur.state}_${cur.municipio}`;
        acc[k] ??= { municipio: cur.municipio, state: cur.state, area: 0 };
        acc[k].area += cur.area;
        return acc;
      }, {});
      res.json(Object.values(map).sort((a, b) => b.area - a.area));
    })
    .on('error', e => { console.error(e); res.status(500).send('Erro CSV'); });
});

module.exports = router;
