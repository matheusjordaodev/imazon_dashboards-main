const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache para dados
let cachedData = {
  geojson: null,
  degradData: null,
  lastUpdate: null
};

// Função para carregar dados GeoJSON
async function loadGeoJSON(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Erro ao carregar ${url}:`, error.message);
    return null;
  }
}

// Função para carregar dados Parquet (simulado com JSON)
async function loadParquetData(url) {
  try {
    // Como não temos suporte nativo para Parquet em Node.js,
    // vamos simular com dados JSON ou usar uma biblioteca específica
    console.log(`Simulando carregamento de dados Parquet de: ${url}`);
    
    // Dados simulados baseados na estrutura do DataFrame original
    return {
      data: [
        { ESTADO: 'Acre', ANO: 2023, AREAKM2: 125.5, ASSENTAMEN: 'Assentamento A' },
        { ESTADO: 'Amazonas', ANO: 2023, AREAKM2: 89.3, ASSENTAMEN: 'Assentamento B' },
        { ESTADO: 'Pará', ANO: 2023, AREAKM2: 234.7, ASSENTAMEN: 'Assentamento C' },
        { ESTADO: 'Rondônia', ANO: 2023, AREAKM2: 156.2, ASSENTAMEN: 'Assentamento D' },
        { ESTADO: 'Roraima', ANO: 2023, AREAKM2: 78.9, ASSENTAMEN: 'Assentamento E' },
        { ESTADO: 'Acre', ANO: 2022, AREAKM2: 98.4, ASSENTAMEN: 'Assentamento A' },
        { ESTADO: 'Amazonas', ANO: 2022, AREAKM2: 112.6, ASSENTAMEN: 'Assentamento B' },
        { ESTADO: 'Pará', ANO: 2022, AREAKM2: 189.3, ASSENTAMEN: 'Assentamento C' }
      ]
    };
  } catch (error) {
    console.error(`Erro ao carregar dados:`, error.message);
    return null;
  }
}

// Função para carregar todos os dados
async function loadAllData() {
  if (cachedData.lastUpdate && Date.now() - cachedData.lastUpdate < 3600000) {
    return cachedData;
  }

  console.log('Carregando dados...');
  
  const geojsonPromise = loadGeoJSON(
    'https://github.com/imazon-cgi/sad/raw/refs/heads/main/datasets/geojson/AMZ_assentamentos.geojson'
  );
  
  const degradDataPromise = loadParquetData(
    'https://github.com/imazon-cgi/sad/raw/refs/heads/main/datasets/csv/alertas_sad_degradacao_09_2008_04_2024_assentamento.parquet'
  );

  try {
    const [geojson, degradData] = await Promise.all([geojsonPromise, degradDataPromise]);
    
    cachedData = {
      geojson,
      degradData,
      lastUpdate: Date.now()
    };
    
    console.log('Dados carregados com sucesso');
    return cachedData;
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    throw error;
  }
}

// Função para processar dados acumulados por ano
function processAccumulatedData(data) {
  const accumulated = {};
  
  data.forEach(item => {
    const key = `${item.ESTADO}_${item.ANO}`;
    if (!accumulated[key]) {
      accumulated[key] = {
        ESTADO: item.ESTADO,
        ANO: item.ANO,
        AREAKM2: 0
      };
    }
    accumulated[key].AREAKM2 += item.AREAKM2;
  });
  
  return Object.values(accumulated).map(item => ({
    ...item,
    AREAKM2: Math.round(item.AREAKM2 * 100) / 100
  }));
}

// Função para processar dados por assentamento
function processSettlementData(data) {
  const settlements = {};
  
  data.forEach(item => {
    const key = `${item.ASSENTAMEN}_${item.ESTADO}_${item.ANO}`;
    if (!settlements[key]) {
      settlements[key] = {
        ASSENTAMEN: item.ASSENTAMEN,
        ESTADO: item.ESTADO,
        ANO: item.ANO,
        AREAKM2: 0
      };
    }
    settlements[key].AREAKM2 += item.AREAKM2;
  });
  
  return Object.values(settlements).map(item => ({
    ...item,
    AREAKM2: Math.round(item.AREAKM2 * 100) / 100
  }));
}

// Rotas da API

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para obter dados básicos
app.get('/api/data', async (req, res) => {
  try {
    const data = await loadAllData();
    
    if (!data.degradData) {
      return res.status(500).json({ error: 'Dados não disponíveis' });
    }
    
    const states = [...new Set(data.degradData.data.map(item => item.ESTADO))];
    const years = [...new Set(data.degradData.data.map(item => item.ANO))].sort();
    
    res.json({
      states,
      years,
      totalRecords: data.degradData.data.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para dados de gráfico de barras anual
app.get('/api/yearly-data/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const { states } = req.query;
    
    const data = await loadAllData();
    if (!data.degradData) {
      return res.status(500).json({ error: 'Dados não disponíveis' });
    }
    
    let filteredData = data.degradData.data.filter(item => item.ANO === year);
    
    if (states) {
      const stateList = states.split(',');
      filteredData = filteredData.filter(item => stateList.includes(item.ESTADO));
    }
    
    const settlementData = processSettlementData(filteredData);
    const top15 = settlementData
      .sort((a, b) => b.AREAKM2 - a.AREAKM2)
      .slice(0, 15);
    
    // Calcular percentuais
    const total = top15.reduce((sum, item) => sum + item.AREAKM2, 0);
    const result = top15.map(item => ({
      ...item,
      PERCENTUAL: Math.round((item.AREAKM2 / total) * 100 * 100) / 100
    }));
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para dados acumulados por estado
app.get('/api/accumulated-data', async (req, res) => {
  try {
    const data = await loadAllData();
    if (!data.degradData) {
      return res.status(500).json({ error: 'Dados não disponíveis' });
    }
    
    const accumulatedData = processAccumulatedData(data.degradData.data);
    
    // Agrupar por estado para totais
    const stateData = {};
    accumulatedData.forEach(item => {
      if (!stateData[item.ESTADO]) {
        stateData[item.ESTADO] = 0;
      }
      stateData[item.ESTADO] += item.AREAKM2;
    });
    
    const result = Object.entries(stateData).map(([estado, area]) => ({
      ESTADO: estado,
      AREAKM2: Math.round(area * 100) / 100
    })).sort((a, b) => b.AREAKM2 - a.AREAKM2);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para dados de linha temporal
app.get('/api/timeline-data', async (req, res) => {
  try {
    const { states } = req.query;
    
    const data = await loadAllData();
    if (!data.degradData) {
      return res.status(500).json({ error: 'Dados não disponíveis' });
    }
    
    let filteredData = data.degradData.data;
    
    if (states) {
      const stateList = states.split(',');
      filteredData = filteredData.filter(item => stateList.includes(item.ESTADO));
    }
    
    const timelineData = processAccumulatedData(filteredData);
    
    // Agrupar por ano
    const yearData = {};
    timelineData.forEach(item => {
      if (!yearData[item.ANO]) {
        yearData[item.ANO] = 0;
      }
      yearData[item.ANO] += item.AREAKM2;
    });
    
    const result = Object.entries(yearData).map(([ano, area]) => ({
      ANO: parseInt(ano),
      AREAKM2: Math.round(area * 100) / 100
    })).sort((a, b) => a.ANO - b.ANO);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para dados do mapa
app.get('/api/map-data/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const { states } = req.query;
    
    const data = await loadAllData();
    if (!data.geojson || !data.degradData) {
      return res.status(500).json({ error: 'Dados não disponíveis' });
    }
    
    let filteredData = data.degradData.data.filter(item => item.ANO === year);
    
    if (states) {
      const stateList = states.split(',');
      filteredData = filteredData.filter(item => stateList.includes(item.ESTADO));
    }
    
    const settlementData = processSettlementData(filteredData);
    
    res.json({
      geojson: data.geojson,
      data: settlementData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para download de CSV
app.get('/api/download-csv', async (req, res) => {
  try {
    const { states, separator = '.', removeAccents = 'false' } = req.query;
    
    const data = await loadAllData();
    if (!data.degradData) {
      return res.status(500).json({ error: 'Dados não disponíveis' });
    }
    
    let filteredData = data.degradData.data;
    
    if (states) {
      const stateList = states.split(',');
      filteredData = filteredData.filter(item => stateList.includes(item.ESTADO));
    }
    
    // Converter para CSV
    const headers = ['ESTADO', 'ANO', 'ASSENTAMEN', 'AREAKM2'];
    let csvContent = headers.join(',') + '\n';
    
    filteredData.forEach(item => {
      const row = [
        item.ESTADO,
        item.ANO,
        item.ASSENTAMEN,
        item.AREAKM2.toString().replace('.', separator)
      ];
      
      if (removeAccents === 'true') {
        // Função simples para remover acentos
        row[0] = row[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        row[2] = row[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }
      
      csvContent += row.join(',') + '\n';
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sad_degradacao_assentamentos.csv"');
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicializar servidor
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  
  // Carregar dados na inicialização
  try {
    await loadAllData();
    console.log('Dados iniciais carregados');
  } catch (error) {
    console.error('Erro ao carregar dados iniciais:', error);
  }
});

module.exports = app;

