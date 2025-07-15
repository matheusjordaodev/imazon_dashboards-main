/* dashboard.js
   Lógica principal do painel de desmatamento
--------------------------------------------------------------*/
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  (async () => {

    /* UTILIDADES PARA SPINNER -------------------------------- */
    const showLoading = id => {
      const s = document
                  .querySelector(`#${id}`)?.closest('.loading-overlay')
                  ?.querySelector('.loading-spinner');
      if (s) s.style.display = 'flex';
    };
    const hideLoading = id => {
      const s = document
                  .querySelector(`#${id}`)?.closest('.loading-overlay')
                  ?.querySelector('.loading-spinner');
      if (s) s.style.display = 'none';
    };

    /* ------------ CONSTANTES / HELPERS ---------------------- */
    const BRAZIL_BOUNDS = [[-33.75, -73.99], [5.27, -34.79]];
    const PALETTE = ["#ffffcc", "#ffeda0", "#fed976", "#feb24c",
                     "#fd8d3c", "#f03b20", "#bd0026", "#800026"];
    const N_CLASSES = PALETTE.length;

    const isMobile = () => window.matchMedia('(max-width:768px)').matches;
    const abbreviate = (t, l = 18) =>
      isMobile() && t && t.length > l ? `${t.slice(0, l - 1)}…` : t;

    const stripPrefix = t => {
      const P = ["APA ", "ARIE ", "PARNA ", "RESEX ", "RDS "];
      const A = ["DA ", "DAS ", "DE ", "DES ", "DO ", "DOS "];
      let x = (t || '').trim();
      P.forEach(p => { if (x.toUpperCase().startsWith(p)) x = x.slice(p.length); });
      A.forEach(a => { if (x.toUpperCase().startsWith(a)) x = x.slice(a.length); });
      return x.trim();
    };

    /* ---------------- GEOJSON ------------------------------- */
    const GEO_URL =
      'https://raw.githubusercontent.com/imazon-cgi/ap/main/dataset/geojson/AMEACA_GERAL_Terra_indigena.geojson';

    const GEOJSON = await fetch(GEO_URL).then(r => r.json())
                       .catch(() => ({ features: [] }));

    const FEATURES = GEOJSON.features || [];
    const PROPS    = FEATURES.map(f => f.properties || {});

    /* ---------------- FILTROS ------------------------------- */
    const uniq = arr => [...new Set(arr.filter(Boolean))].sort();
    const fillSelect = (id, list) =>
      list.forEach(v =>
        document.getElementById(id)
                .insertAdjacentHTML('beforeend',
                                    `<option value="${v}">${v}</option>`));

    fillSelect('modalidade-filter', uniq(PROPS.map(p => p.MODALIDADE)));
    fillSelect('uso-filter',        uniq(PROPS.map(p => p.USO)));
    fillSelect('uf-filter',         uniq(PROPS.map(p => p.UF)));

    /* ---------------- ESCALA DE COR ------------------------- */
    const vals   = PROPS.map(p => +p.DESMATAM_1 || 0);
    const minVal = vals.length ? Math.min(...vals) : 0;
    const maxVal = vals.length ? Math.max(...vals) : 0;
    const step   = (maxVal - minVal) / N_CLASSES;
    const BINS   = Array.from({ length: N_CLASSES + 1 },
                              (_, i) => minVal + i * step);

    const classify = v => {
      if (v == null || isNaN(v)) return '#ccc';
      for (let i = 0; i < N_CLASSES; i++)
        if (v <= BINS[i + 1]) return PALETTE[i];
      return PALETTE.at(-1);
    };

    /* ---------------- LEGENDA ------------------------------- */
    document.getElementById('legend-container').innerHTML = `
      <div class="legend-title fw-semibold text-center mb-1">
        Desmatamento (km²)
      </div>
      <div style="display:flex;align-items:center;font-size:.75rem">
        <div style="width:22px;height:150px;
                    background:linear-gradient(to top,
                                ${PALETTE.at(-1)},${PALETTE[0]});
                    border:1px solid #ccc"></div>
        <div class="d-flex flex-column justify-content-between h-100 ms-1"
             style="height:150px">
          <span>${Math.round(minVal)}</span><span>${Math.round(maxVal)}</span>
        </div>
      </div>`;

    /* ---------------- FILTRO MEMÓRIA ------------------------ */
    const filter = (m, u, uf) => FEATURES.filter(f => {
      const p = f.properties;
      return (!m  || p.MODALIDADE === m) &&
             (!u  || p.USO        === u) &&
             (!uf || p.UF        === uf);
    });

    /* ---------------- MAPA LEAFLET -------------------------- */
    const map = L.map('map', {
      center:[-14.2,-51.9], zoom:4,
      minZoom:4, maxBounds:BRAZIL_BOUNDS, maxBoundsViscosity:.9,
      zoomControl:false
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution:'© OpenStreetMap' }).addTo(map);
    const layerGroup = L.layerGroup().addTo(map);

    const makePolygons = feats => {
      layerGroup.clearLayers();
      feats.forEach(f => {
        const g = f.geometry; if (!g) return;
        const polys = g.type === 'Polygon'      ? [g.coordinates]
                    : g.type === 'MultiPolygon' ? g.coordinates : [];
        polys.forEach(raw => {
          const latlng = raw.map(r => r.map(([lo,la]) => [la,lo]));
          const v  = +f.properties.DESMATAM_1 || 0;
          const pl = L.polygon(latlng, {
                       color:'#000', weight:1,
                       fillColor:classify(v), fillOpacity:.7
                     }).addTo(layerGroup);
          pl.bindTooltip(
            `<strong>${f.properties.NOME}</strong><br>${v.toFixed(2)} km²`
          );
        });
      });
    };

    /* ---------------- BARRA (Plotly) ------------------------ */
    const barDiv = document.getElementById('bar-chart');
    const renderBar = (m,u,uf) => {
      showLoading('bar-chart');

      const rows = filter(m,u,uf)
                   .map(f => ({ area:stripPrefix(f.properties.NOME),
                                km:+f.properties.DESMATAM_1 || 0 }))
                   .sort((a,b) => b.km - a.km)
                   .slice(0,10);

      if (!rows.length) {
        Plotly.newPlot(barDiv,[],{}, {responsive:true})
              .then(()=>hideLoading('bar-chart'));
        return;
      }

      Plotly.newPlot(barDiv, [{
        type :'bar',
        orientation:'h',
        x    : rows.map(r => r.km),
        y    : rows.map(r => r.area),
        marker:{ color:'#2E8B57' },
        text   : rows.map(r => r.km.toFixed(2)),
        textposition:'outside',
        textfont:{ size:isMobile()?10:12, color:'#000' },
        cliponaxis:false
      }], {
        template:'plotly_white',
        height  : isMobile()?300:450,
        bargap  : 0.30,
        margin  : { l:100, r:80, t:50, b:20 },
        xaxis   : { title:'Área Desmatada (km²)',
                    showgrid:true, gridcolor:'rgba(0,0,0,.08)' },
        yaxis   : { automargin:true }
      }, {responsive:true})
      .then(()=>hideLoading('bar-chart'));
    };
    window.addEventListener('resize', () => {
      if (barDiv.data) Plotly.Plots.resize(barDiv);
    });

    /* ---------------- DONUTS ------------------------------- */
    const pie1Div = document.getElementById('pie1');
    const pie2Div = document.getElementById('pie2');
    const renderPies = (m,u,uf) => {
      showLoading('pie1'); showLoading('pie2');

      const feats = filter(m,u,uf);
      if (!feats.length) {
        Plotly.newPlot(pie1Div,[],{}, {responsive:true})
              .then(()=>hideLoading('pie1'));
        Plotly.newPlot(pie2Div,[],{}, {responsive:true})
              .then(()=>hideLoading('pie2'));
        return;
      }

      /* agrega valores ------------------------------------- */
      const aggUF={}, aggAP={};
      feats.forEach(f=>{
        const p=f.properties, v=+p.DESMATAM_1||0;
        aggUF[p.UF||'—']            = (aggUF[p.UF||'—']||0) + v;
        aggAP[ stripPrefix(p.NOME)] = (aggAP[ stripPrefix(p.NOME)]||0) + v;
      });
      const topAP = Object.entries(aggAP)
                          .sort((a,b)=>b[1]-a[1])
                          .slice(0,10);

      const makePie = (div,labels,values) =>
        Plotly.newPlot(div,[{
          type :'pie',
          labels: labels.map(abbreviate),
          values,
          hole  :.35,
          textinfo:'none',
          hovertemplate:'<b>%{label}</b><br>%{value:.2f} km²<extra></extra>'
        }],{
          template:'plotly_white',
          height  : isMobile()?280:400,
          legend  : isMobile()
                    ? {orientation:'h',x:.5,y:-.25,xanchor:'center',font:{size:9}}
                    : {orientation:'v',x:1.05,y:.5,xanchor:'left',
                       yanchor:'middle',font:{size:11}},
          margin  : isMobile()
                    ? {l:10,r:10,t:30,b:70}
                    : {l:10,r:140,t:40,b:30}
        },{responsive:true});

      Promise.all([
        makePie(pie1Div, Object.keys(aggUF), Object.values(aggUF)),
        makePie(pie2Div, topAP.map(e=>e[0]), topAP.map(e=>e[1]))
      ]).then(()=>{ hideLoading('pie1'); hideLoading('pie2'); });
    };

    /* ---------------- TABELA (DataTables) ------------------- */
    let dt = null;
    const renderTable = (m,u,uf) => {
      showLoading('top-table');

      const rows = filter(m,u,uf)
        .sort((a,b)=>(+b.properties.DESMATAM_1||0) - (+a.properties.DESMATAM_1||0))
        .slice(0,20)
        .map(f=>{
          const p=f.properties;
          return [
            stripPrefix(p.NOME||'—'),
            +p['FOCOS DE C']||0,
            +p['N DE CAR']  ||0,
            (+p['CAR']      ||0).toFixed(2),
            +p['ESTRADAS N']||0
          ];
        });

      if (!dt) {
        dt = $('#top-table').DataTable({
          data:rows,
          paging   : true,
          searching: false,
          info     : false,
          order    : [],
          dom      : 'Bfrtip',
          buttons  : [
            {extend:'copy',  text:'<i class="fas fa-copy me-1"></i>Copiar',className:'btn-dt'},
            {extend:'excel', text:'<i class="fas fa-file-excel me-1"></i>Excel',className:'btn-dt',
             title:'Areas_Protegidas_Mais_Afetadas'},
            {extend:'csv',   text:'<i class="fas fa-file-csv me-1"></i>CSV',  className:'btn-dt',
             title:'Areas_Protegidas_Mais_Afetadas'}
          ],
          initComplete: () => hideLoading('top-table')
        });
      } else {
        dt.clear();
        dt.rows.add(rows).draw();
        hideLoading('top-table');
      }
    };

    /* ---------------- REFRESH GERAL ------------------------ */
    const curFilters = () => [
      document.getElementById('modalidade-filter').value || null,
      document.getElementById('uso-filter').value        || null,
      document.getElementById('uf-filter').value         || null
    ];
    const refreshAll = () => {
      const [m,u,uf] = curFilters();
      renderBar(m,u,uf);
      renderPies(m,u,uf);
      renderTable(m,u,uf);
      makePolygons(filter(m,u,uf));
    };

    /* listeners filtros + reset ----------------------------- */
    ['modalidade-filter','uso-filter','uf-filter']
      .forEach(id => document.getElementById(id).addEventListener('change',refreshAll));

    document.getElementById('reset-btn')
            .addEventListener('click',()=>{
              ['modalidade-filter','uso-filter','uf-filter']
                .forEach(id=>document.getElementById(id).value='');
              refreshAll();
            });

    /* ---------------- CSV EXPORT --------------------------- */
    document.getElementById('download-btn')
            .addEventListener('click',()=>{
              const [m,u,uf]=curFilters();
              const feats = filter(m,u,uf);
              const header='NOME,DESMATAM_1,MODALIDADE,USO,UF\n';
              const csv = feats.map(f=>{
                const p=f.properties||{};
                const nome=`"${(p.NOME||'').replace(/"/g,'""')}"`;
                return [nome,p.DESMATAM_1||'',p.MODALIDADE||'',
                        p.USO||'',p.UF||''].join(',');
              }).join('\n');
              saveAs(new Blob([header+csv],{
                     type:'text/csv;charset=utf-8'}),
                     'areas_filtradas.csv');
            });

    /* ---------------- PRIMEIRA EXECUÇÃO -------------------- */
    refreshAll();       // renderiza tudo ao carregar a página

  })().catch(err => console.error('[Dashboard Error]',err));
}
