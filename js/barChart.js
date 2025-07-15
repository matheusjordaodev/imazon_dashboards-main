// barChart.js
// Encapsula função para renderizar gráfico de barras horizontais com valores visíveis.
// Depende apenas de Plotly (já carregado no HTML) e usa window.innerWidth para responsividade de texto.
// Uso básico:
//   renderHorizontalBarChart(divId, valuesArray, labelsArray, { title, config, highlightIndex, baseColor, minOpacity, textColor })
// Onde:
//   - divId: string, id do div onde o Plotly irá renderizar.
//   - valuesArray: array de números (valores a plotar).
//   - labelsArray: array de strings (rótulos do eixo y), na mesma ordem de valuesArray.
//   - options (opcional): objeto com:
//       * title: string para título do gráfico.
//       * config: objeto com campos { titleSize, axisSize, tickSize, margin:{l,r,t,b}, height } vindo de getResponsiveConfig() ou similar.
//       * highlightIndex: índice numérico (0-based) do bar que deve ter opacidade/foco extra. Opcional.
//       * baseColor: array [r,g,b] ou string CSS (se array, será usado com rgba para gerar variações de opacidade). Padrão [40,167,69] (verde).
//       * minOpacity: número entre 0 e 1 para opacidade mínima das barras menores. Padrão 0.4.
//       * textColor: string CSS para cor do texto que aparece nas barras (ex.: '#000' ou '#fff'). Padrão '#000'.
// Exemplo de chamada mais abaixo.

(function(window){
  /**
   * Plota um gráfico de barras horizontais em Plotly exibindo valores nas barras.
   * @param {string} divId - ID do container (div) do Plotly.
   * @param {number[]} valuesArray - Array de valores numéricos.
   * @param {string[]} labelsArray - Array de rótulos (strings), mesma ordem de valuesArray.
   * @param {object} options - Configurações opcionais:
   *   - title: título do gráfico.
   *   - config: objeto com { titleSize, axisSize, tickSize, margin:{l,r,t,b}, height }.
   *             Caso não fornecido, usa um padrão genérico.
   *   - highlightIndex: índice a destacar (barra com opacidade máxima).
   *   - baseColor: [r,g,b] ou string CSS. Se for [r,g,b], usado para gerar rgba com opacidade variável.
   *   - minOpacity: opacidade mínima (0-1) para barras menores.
   *   - textColor: cor do texto dentro/fora das barras.
   */
  function renderHorizontalBarChart(divId, valuesArray, labelsArray, options = {}) {
    // Extrair opções com valores padrão
    const {
      title = '',
      config = null,
      highlightIndex = null,
      baseColor = [40, 167, 69], // cor verde padrão em RGB
      minOpacity = 0.4,
      textColor = '#000'
    } = options;

    // Obter config de responsividade: se fornecido, use; senão, defina um padrão
    let cfg;
    if (config && typeof config === 'object') {
      cfg = config;
    } else {
      // Padrão genérico caso não tenha getResponsiveConfig()
      cfg = {
        titleSize: 14,
        axisSize: 12,
        tickSize: 10,
        margin: { l: 150, r: 20, t: 50, b: 40 },
        height: 450
      };
    }

    // Garantir arrays válidos
    const values = Array.isArray(valuesArray) ? valuesArray : [];
    const labels = Array.isArray(labelsArray) ? labelsArray : [];
    // Se lengths não coincidirem, não faz sentido plotar; nesse caso limpa o gráfico
    if (values.length !== labels.length) {
      console.warn(`renderHorizontalBarChart: valuesArray.length (${values.length}) diferente de labelsArray.length (${labels.length}). Limpando gráfico.`);
      Plotly.newPlot(divId, [], {}, { responsive: true, displayModeBar: false });
      return;
    }
    if (values.length === 0) {
      // gráfico vazio
      Plotly.newPlot(divId, [], {}, { responsive: true, displayModeBar: false });
      return;
    }

    // Calcular cores das barras com opacidade variável proporcional ao valor
    let barColors;
    if (Array.isArray(baseColor) && baseColor.length === 3) {
      // baseColor é [r,g,b]
      const [r, g, b] = baseColor;
      const maxVal = Math.max(...values, 1);
      barColors = values.map((v, idx) => {
        let opacity = minOpacity + (v / maxVal) * (1 - minOpacity);
        // caso queira destacar um índice específico:
        if (highlightIndex !== null && idx === highlightIndex) {
          opacity = 1;
        }
        // Garantir entre 0 e 1
        opacity = Math.min(Math.max(opacity, 0), 1);
        return `rgba(${r},${g},${b},${opacity})`;
      });
    } else {
      // baseColor como string CSS fixa: sem variação de opacidade, ou poderia usar alpha fixo
      barColors = values.map((_, idx) => {
        if (highlightIndex !== null && idx === highlightIndex) {
          // se quiser destacar, usa baseColor com opacidade 1 (assumindo baseColor sem alpha)
          return baseColor;
        }
        return baseColor;
      });
    }

    // Preparar texto que aparece nas barras
    // Se for mobile (tela pequena), usamos toFixed(0); senão toFixed(2). Ajuste conforme necessidade.
    const textValues = values.map(v => {
      return (window.innerWidth <= 575) ? v.toFixed(0) : v.toFixed(2);
    });
    // Posição do texto: dentro ou fora da barra
    const textPos = (window.innerWidth <= 575) ? 'inside' : 'outside';

    // Montar trace do Plotly
    const trace = {
      x: values,
      y: labels,
      type: 'bar',
      orientation: 'h',
      marker: {
        color: barColors,
        line: { color: '#1e7e34', width: 1 }
      },
      text: textValues,
      textposition: textPos,
      textfont: { size: cfg.tickSize, color: textColor },
      customdata: labels,
      hovertemplate: '<b>%{customdata}</b><br>Valor: %{x:.2f}<extra></extra>'
    };

    // Montar layout
    const layout = {
      title: { text: title, x: 0.5, font: { size: cfg.titleSize } },
      margin: {
        l: cfg.margin.l,
        r: cfg.margin.r,
        t: cfg.margin.t,
        b: cfg.margin.b
      },
      height: cfg.height,
      yaxis: {
        automargin: true,
        tickfont: { size: cfg.tickSize },
        tickmode: 'linear'
      },
      xaxis: {
        title: { text: 'Valor', font: { size: cfg.axisSize } },
        tickfont: { size: cfg.tickSize }
      },
      plot_bgcolor: 'rgba(0,0,0,0)',
      paper_bgcolor: 'rgba(0,0,0,0)',
      font: { size: cfg.tickSize }
    };

    // Renderizar com Plotly
    Plotly.newPlot(divId, [trace], layout, { displayModeBar: false, responsive: true });
  }

  // Expor globalmente
  window.renderHorizontalBarChart = renderHorizontalBarChart;
})(window);
