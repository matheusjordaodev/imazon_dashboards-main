/* =========================================================
   Dashboard SAD – Assentamentos
   (versão sem botão “Carregar Mapa” + overlay de carregamento)
   ========================================================= */
   console.log("✅ dashboard.js carregado");

(async () => {
  const GEOJSON_URL = "../../dataset/sad/geojson/AMZ_assentamentos.geojson";
  const CSV_URL     = "../../dataset/sad/csv/alertas_sad_degradacao_09_2008_04_2024_assentamento.csv";
  const CSV_UF_KEY  = "ESTADO";
  const NAME_KEY    = "ASSENTAMEN";
  const normUF      = s => (s || "").toString().toUpperCase();
  const BRAZIL_BOUNDS = L.latLngBounds(
    L.latLng(-34.0, -74.0),
    L.latLng(  5.5, -34.0)
  );

  /* ---------- Variáveis globais ---------- */
  let geojson, df = [], years = [], ufs = [], allSet = [];
  let selUF = [], selSet = [], curYear, barSet = [];
  let mapInit = false, leafletMap, geoLayer, legend;

  /* ---------- DOM ---------- */
  const stateBtn         = document.getElementById("state-btn");
  const stateSelect      = document.getElementById("state-select");
  const resetBtn         = document.getElementById("reset-btn");
  const yearSelect       = document.getElementById("year-select");
  const settlementList   = document.getElementById("settlement-list");
  const settlementSearch = document.getElementById("settlement-search");
  const selectedCount    = document.getElementById("selected-count");
  const clearSel         = document.getElementById("clear-selection");
  const applySel         = document.getElementById("apply-selection");
  const downloadBtn      = document.getElementById("download-btn");
  const downloadStateBox = document.getElementById("download-state-checklist");
  const decSepSelector   = 'input[name="dec-sep"]:checked';
  const removeAccentsChk = document.getElementById("remove-accents");
  const loadingOverlay   = document.getElementById("loading-overlay");

  /* --------------------------------------------------------
     Helpers
  -------------------------------------------------------- */
  function getResponsiveConfig () { /* … (mesma função) … */ }
  function truncateText        (t,m=30){return (!t)?'':(t.length>m?t.slice(0,m)+'…':t);}
  function plotHorizontalBar   (opts){ /* … (idem) … */ }

  async function loadGeo () {
    geojson = await (await fetch(GEOJSON_URL)).json();
  }
  async function loadCsv () {
    const txt = await (await fetch(CSV_URL)).text();
    df = d3.csvParse(txt, d => ({
      ...d,
      ANO     : +d.ANO     || null,
      AREAKM2 : +d.AREAKM2 || 0,
      [CSV_UF_KEY]: normUF(d[CSV_UF_KEY])
    }));
  }

  /* ---------- Filtros iniciais ---------- */
  function buildFilters () {
  years = [...new Set(df.map(d => d.ANO))].sort((a,b) => a - b);
  curYear = Math.max(...years);
  yearSelect.innerHTML = years.map(y => `<option>${y}</option>`).join("");
  yearSelect.value = curYear;

  // 🔧 1) GeoJSON → filtra primeiro, depois cria o Set
  const geoUF = [...new Set(
    geojson.features
      .map(f => normUF(f.properties.UF))     // ou f.properties.uf
      .filter(Boolean)                       // <-- filtra aqui
  )];

  // 🔧 2) CSV → mesma lógica
  const csvUF = [...new Set(
    df.map(d => d[CSV_UF_KEY])
      .filter(Boolean)
  )];

  ufs = [...new Set([...geoUF, ...csvUF])].sort();
  stateSelect.innerHTML = ufs.map(u => `<option value="${u}">${u}</option>`).join("");

  allSet = [...new Set(df.map(d => d.ASSENTAMEN))].sort();
  buildDownloadChecklist();
}


  /* ---------- Atualização de botões e filtros ---------- */
  function updateStateBtn () {
    if (!selUF.length)           stateBtn.innerHTML = '<i class="fa fa-map me-1"></i>Selecione o Estado';
    else if (selUF.length === 1) stateBtn.innerHTML = `<i class="fa fa-map me-1"></i>UF: ${selUF[0]}`;
    else                         stateBtn.innerHTML = `<i class="fa fa-map me-1"></i>${selUF.length} UFs`;
  }

  function base () {
    const y = +yearSelect.value;
    selUF = Array.from(stateSelect.selectedOptions).map(o => o.value);
    updateStateBtn();
    let out = df.filter(d => d.ANO === y)
                .filter(d => !selUF.length || selUF.includes(d[CSV_UF_KEY]));
    if (selSet.length) out = out.filter(d => selSet.includes(d.ASSENTAMEN));
    return out;
  }

  /* ---------- Gráficos ---------- */
  function plotBar    () { /* … (idem com plotHorizontalBar) … */ }
  function plotLine   () { /* … (idem) … */ }
  function plotYearly () { /* … (idem) … */ }

  /* ---------- Mapa Leaflet ---------- */
  function initMap () {
    if (mapInit) return;
    leafletMap = L.map("map-graph", {
      zoomSnap  : .3,
      attributionControl: false,
      maxBounds : BRAZIL_BOUNDS,
      maxBoundsViscosity: 1
    }).setView([-14,-55], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18
    }).addTo(leafletMap);

    legend = L.DomUtil.create("div", "heat-legend");
    legend.style.display = "none";
    leafletMap.getContainer().appendChild(legend);

    mapInit = true;
  }

  function heatLegend (min, max, scale) {
    legend.innerHTML = `
      <h4>Área&nbsp;(km²)</h4>
      <div class="legend-gradient"></div>
      <div class="legend-labels">
        <span>${max.toLocaleString()}</span>
        <span>${((max+min)/2).toLocaleString()}</span>
        <span>${min.toLocaleString()}</span>
      </div>`;
    legend.querySelector(".legend-gradient").style.background =
      `linear-gradient(to top, ${scale(min)} 0%, ${scale((min+max)/2)} 50%, ${scale(max)} 100%)`;
    legend.style.display = "block";
  }

  function plotMap () {
    document.getElementById("map-title").textContent = `Mapa de Degradação Ambiental (km²) ${yearSelect.value}`;

    if (!mapInit) return;
    const dataArr = base();
    const agg = d3.rollup(dataArr, v => d3.sum(v, d => d.AREAKM2), d => d.ASSENTAMEN);
    const show = selSet.length ? selSet : barSet;
    const maxVal = d3.max(show, e => agg.get(e) || 0) || 1;
    const color = d3.scaleSequential().domain([0, maxVal]).interpolator(d3.interpolateYlOrRd);

    heatLegend(0, maxVal, color);

    if (geoLayer) geoLayer.remove();
    geoLayer = L.geoJSON(geojson, {
      coordsToLatLng: c => L.latLng(c[1], c[0]),
      filter: f => show.includes(f.properties[NAME_KEY]),
      style: f => ({
        weight: 1.2,
        color: "#555",
        fillOpacity: .75,
        fillColor: color(agg.get(f.properties[NAME_KEY]) || 0)
      }),
      onEachFeature: (f, layer) => {
        const nome = f.properties[NAME_KEY];
        const km2  = agg.get(nome) || 0;
        layer.bindTooltip(
          `<strong>${nome}</strong><br>${km2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km²`,
          { sticky: true }
        );
        layer.on({
          mouseover: e => e.target.setStyle({ weight: 2, color: "#000" }).bringToFront(),
          mouseout : e => geoLayer.resetStyle(e.target),
          click    : e => leafletMap.fitBounds(e.target.getBounds(), { maxZoom: 10 })
        });
      }
    }).addTo(leafletMap);

    if (geoLayer.getLayers().length) {
      const b = geoLayer.getBounds();
      leafletMap.fitBounds(b);
      if (leafletMap.getZoom() > 8) leafletMap.setZoom(8);
    }
  }

  /* ---------- Download CSV ---------- */
  function buildDownloadChecklist () { /* … (idem) … */ }
  function downloadCsv () { /* … (idem) … */ }

  /* ---------- Lista de assentamentos ---------- */
  function refreshList () { /* … (idem) … */ }
  function updateSelectedCount () { selectedCount.textContent = selSet.length; }

  /* ---------- Eventos ---------- */
  stateSelect.addEventListener("change", () => {
    plotBar(); plotLine(); plotYearly(); plotMap();
  });
  yearSelect.addEventListener("change", () => {
    plotBar(); plotLine(); plotYearly(); plotMap();
  });
  resetBtn.addEventListener("click", () => {
    selUF = []; selSet = [];
    stateSelect.value = "";
    yearSelect.value = curYear;
    updateStateBtn();
    refreshList();
    plotBar(); plotLine(); plotYearly(); plotMap();
  });

  settlementSearch.addEventListener("keyup", refreshList);
  settlementList.addEventListener("change", e => {
    if (e.target.type === "checkbox") {
      const value = e.target.value;
      e.target.checked
        ? (!selSet.includes(value) && selSet.push(value))
        : (selSet = selSet.filter(item => item !== value));
      updateSelectedCount();
    }
  });
  clearSel.addEventListener("click", () => { selSet = []; refreshList(); });
  applySel.addEventListener("click", () => {
    plotBar(); plotLine(); plotYearly(); plotMap();
    bootstrap.Modal.getInstance(document.getElementById("interest-modal")).hide();
  });
  downloadBtn.addEventListener("click", downloadCsv);

  /* ---------- Resize debounce ---------- */
  window.addEventListener("resize", debounce(() => {
    plotBar(); plotLine(); plotYearly();
  }, 300));
  function debounce (fn, wait) {
    let t; return (...args) => {
      clearTimeout(t); t = setTimeout(() => fn(...args), wait);
    };
  }

  /* ---------- Inicialização ---------- */
/* ---------- Inicialização ---------- */
(async () => {
  try {
    // carrega tudo em paralelo
    await Promise.all([loadGeo(), loadCsv()]);

    buildFilters();
    initMap();
    plotBar();
    plotLine();
    plotYearly();
    plotMap();
    refreshList();
  } catch (err) {
    console.error("Erro na inicialização:", err);
    // mensagem amigável na tela
    document.getElementById("app-root").innerHTML =
      `<div class="alert alert-danger mt-5">
         <h5>Falha ao carregar os dados.</h5>
         <p>Veja mais detalhes no console do navegador (F12 &gt; Console).</p>
       </div>`;
  } finally {
    // 🔑 isto roda SEMPRE, mesmo se deu erro
    loadingOverlay.style.display = "none";
  }
})();

})();
