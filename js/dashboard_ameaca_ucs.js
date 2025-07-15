/* eslint-disable no-unused-vars */
/* ---------- HELPERS SPINNER ------------ */
const showLoading = id =>{
  const s=document.querySelector('#'+id)
          ?.closest('.loading-overlay')
          ?.querySelector('.loading-spinner');
  if(s) s.style.display='flex';
};
const hideLoading = id =>{
  const s=document.querySelector('#'+id)
          ?.closest('.loading-overlay')
          ?.querySelector('.loading-spinner');
  if(s) s.style.display='none';
};
const hideGlobal = ()=>{ const g=document.getElementById('global-loader'); if(g) g.style.display='none'; };

/* ---------- CONSTANTES ----------------- */
const BRAZIL = [[-33.75,-73.99],[5.27,-34.79]];
const PALETTE = ["#ffffcc","#ffeda0","#fed976","#feb24c","#fd8d3c","#f03b20","#bd0026","#800026"];
const N_CLASSES = PALETTE.length;

const mob  = () => matchMedia('(max-width:768px)').matches;
const abbr = (t,l=18)=>mob()&&t&&t.length>l?`${t.slice(0,l-1)}…`:t;
const strip = t=>{
  const P=["APA ","ARIE ","PARNA ","RESEX ","RDS "],
        A=["DA ","DAS ","DE ","DES ","DO ","DOS "];
  let x=(t||'').trim();
  P.forEach(p=>{if(x.toUpperCase().startsWith(p))x=x.slice(p.length)});
  A.forEach(a=>{if(x.toUpperCase().startsWith(a))x=x.slice(a.length)});
  return x.trim();
};

(async()=>{

  /* GeoJSON ---------------------------------------------------- */
  const URL='https://raw.githubusercontent.com/imazon-cgi/ap/main/dataset/geojson/AMEACA_GERAL_UCs.geojson';
  const geo=await fetch(URL).then(r=>r.json()).catch(()=>({features:[]}));
  const FEAT=geo.features||[], PROP=FEAT.map(f=>f.properties||{});

  /* escala cor */
  const maxV=Math.max(...PROP.map(p=>+p.DESMATAM_1||0));
  const color=v=>{
    if(!v||isNaN(v))return'#ccc';
    const idx=Math.min(N_CLASSES-1,Math.floor((v/maxV)*N_CLASSES));
    return PALETTE[idx];
  };

  /* filtros */
  const uniq=a=>[...new Set(a.filter(Boolean))].sort();
  const addOpt=(id,o)=>o.forEach(v=>document.getElementById(id).insertAdjacentHTML('beforeend',`<option>${v}</option>`));
  addOpt('modalidade-filter',uniq(PROP.map(p=>p.MODALIDADE)));
  addOpt('uso-filter',uniq(PROP.map(p=>p.USO)));
  addOpt('uf-filter',uniq(PROP.map(p=>p.UF)));

  /* legenda */
  document.getElementById('legend-container').innerHTML=`
    <div class="legend-title fw-semibold text-center mb-1">Desmatamento (km²)</div>
    <div style="display:flex;align-items:center;font-size:.75rem">
      <div style="width:22px;height:150px;background:linear-gradient(to bottom,${PALETTE.at(-1)},${PALETTE[0]});border:1px solid #ccc"></div>
      <div class="d-flex flex-column justify-content-between h-100 ms-1" style="height:150px">
        <span>${Math.round(maxV)}</span><span>0</span>
      </div>
    </div>`;

  /* filtro util */
  const filtr=(m,u,uf)=>FEAT.filter(f=>{
    const p=f.properties;
    return(!m||p.MODALIDADE===m)&&(!u||p.USO===u)&&(!uf||p.UF===uf);
  });

  /* Leaflet ---------------------------------------------------- */
  const map=L.map('map',{center:[-14,-52],zoom:4,minZoom:4,maxBounds:BRAZIL,maxBoundsViscosity:.9,zoomControl:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  const layer=L.layerGroup().addTo(map);

  const draw=(m,u,uf)=>{
    layer.clearLayers();
    filtr(m,u,uf).forEach(f=>{
      const g=f.geometry;if(!g)return;
      const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
      polys.forEach(poly=>{
        const ring=poly[0].map(([lon,lat])=>[lat,lon]);
        const v=+f.properties.DESMATAM_1||0;
        const pl=L.polygon(ring,{color:'#000',weight:1,fillColor:color(v),fillOpacity:.7})
          .addTo(layer)
          .bindPopup(`<b>${f.properties.NOME}</b><br>${v.toFixed(2)} km²`);
        pl.on('click',()=>map.fitBounds(pl.getBounds(),{maxZoom:10,padding:[20,20]}));
      });
    });
    map.invalidateSize();
  };

  /* BAR -------------------------------------------------------- */
  const barDiv=document.getElementById('bar-chart');
  const bar=(m,u,uf)=>{
    showLoading('bar-chart');
    const rows=filtr(m,u,uf).map(f=>({a:strip(f.properties.NOME),v:+f.properties.DESMATAM_1||0}))
                            .sort((x,y)=>y.v-x.v).slice(0,10);
    if(!rows.length){Plotly.newPlot(barDiv,[],{}, {responsive:true}).then(()=>hideLoading('bar-chart'));return;}
    Plotly.newPlot(barDiv,[{
      type:'bar',orientation:'h',
      x:rows.map(r=>r.v),y:rows.map(r=>r.a),
      marker:{color:'#2E8B57'},
      text:rows.map(r=>r.v.toFixed(2)),textposition:'outside',
      textfont:{size:mob()?10:12,color:'#000'},cliponaxis:false
    }],{
      template:'plotly_white',height:mob()?300:450,bargap:.30,
      margin:{l:110,r:90,t:60,b:30},
      xaxis:{title:'Desmatamento (km²)',showgrid:true,gridcolor:'rgba(0,0,0,.08)'},
      yaxis:{automargin:true}
    },{responsive:true}).then(()=>hideLoading('bar-chart'));
  };
  window.addEventListener('resize',()=>{if(barDiv.data)Plotly.Plots.resize(barDiv);});

  /* DONUTS ----------------------------------------------------- */
  const pie1=document.getElementById('pie1');
  const pie2=document.getElementById('pie2');
  const pies=(m,u,uf)=>{
    showLoading('pie1');showLoading('pie2');
    const feats=filtr(m,u,uf);
    if(!feats.length){
      Plotly.newPlot(pie1,[],{}, {responsive:true}).then(()=>hideLoading('pie1'));
      Plotly.newPlot(pie2,[],{}, {responsive:true}).then(()=>hideLoading('pie2'));
      return;
    }
    const aggUF={},aggAP={};
    feats.forEach(f=>{
      const p=f.properties,v=+p.DESMATAM_1||0;
      aggUF[p.UF||'—']=(aggUF[p.UF||'—']||0)+v;
      const k=strip(p.NOME||'—'); aggAP[k]=(aggAP[k]||0)+v;
    });
    const top10=Object.entries(aggAP).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const mk=(div,labs,vals)=>Plotly.newPlot(div,[{
      type:'pie',labels:labs.map(abbr),values:vals,hole:.35,textinfo:'none',
      hovertemplate:'<b>%{label}</b><br>%{value:.2f} km²<extra></extra>'
    }],{
      template:'plotly_white',height:mob()?280:400,
      legend:mob()?{orientation:'h',x:.5,y:-.25,xanchor:'center',font:{size:9}}:
                    {orientation:'v',x:1.05,y:.5,xanchor:'left',yanchor:'middle',font:{size:11}},
      margin:mob()?{l:10,r:10,t:30,b:70}:{l:10,r:140,t:40,b:30}
    },{responsive:true});
    Promise.all([
      mk(pie1,Object.keys(aggUF),Object.values(aggUF)),
      mk(pie2,top10.map(t=>t[0]),top10.map(t=>t[1]))
    ]).then(()=>{hideLoading('pie1');hideLoading('pie2');});
  };

  /* DATATABLE -------------------------------------------------- */
  let dt=null;
  const table=(m,u,uf)=>{
    showLoading('top-table');
    const rows=filtr(m,u,uf)
      .sort((a,b)=>(+b.properties.DESMATAM_1||0)-(+a.properties.DESMATAM_1||0))
      .slice(0,20)
      .map(f=>{
        const p=f.properties;
        return[
          strip(p.NOME||'—'),
          +p['FOCOS DE C']||0,
          +p['N DE CAR']||0,
          (+p['CAR']||0).toFixed(2),
          +p['ESTRADAS N']||0
        ];
      });
    if(!dt){
      dt=$('#top-table').DataTable({
        data:rows,paging:true,searching:false,info:false,order:[],
        dom:'Bfrtip',
        buttons:[
          {extend:'copy',text:'<i class="fas fa-copy me-1"></i>Copiar',className:'btn-dt'},
          {extend:'excel',text:'<i class="fas fa-file-excel me-1"></i>Excel',className:'btn-dt',title:'UCs_Mais_Afetadas'},
          {extend:'csv',text:'<i class="fas fa-file-csv me-1"></i>CSV',className:'btn-dt',title:'UCs_Mais_Afetadas'}
        ],
        initComplete:()=>hideLoading('top-table')
      });
    }else{dt.clear();dt.rows.add(rows).draw();hideLoading('top-table');}
  };

  /* refresh geral */
  const cur=()=>[
    document.getElementById('modalidade-filter').value||null,
    document.getElementById('uso-filter').value||null,
    document.getElementById('uf-filter').value||null
  ];
  const refresh=()=>{
    const [m,u,uf]=cur();
    Promise.all([
      new Promise(r=>{bar(m,u,uf);r()}),
      new Promise(r=>{pies(m,u,uf);r()}),
      new Promise(r=>{table(m,u,uf);r()}),
      new Promise(r=>{draw(m,u,uf);r()})
    ]).then(hideGlobal);
  };

  /* listeners filtros */
  ['modalidade-filter','uso-filter','uf-filter'].forEach(id=>{
    document.getElementById(id).addEventListener('change',refresh);
  });
  document.getElementById('reset-btn').addEventListener('click',()=>{
    ['modalidade-filter','uso-filter','uf-filter'].forEach(id=>document.getElementById(id).value='');
    refresh();
  });

  /* CSV */
  document.getElementById('download-btn').addEventListener('click',()=>{
    const [m,u,uf]=cur(),feats=filtr(m,u,uf);
    const header='NOME,DESMATAM_1,MODALIDADE,USO,UF\n';
    const csv=feats.map(f=>{
      const p=f.properties;
      const nome=`"${(p.NOME||'').replace(/"/g,'""')}"`;
      return[nome,p.DESMATAM_1||'',p.MODALIDADE||'',p.USO||'',p.UF||''].join(',');
    }).join('\n');
    saveAs(new Blob([header+csv],{type:'text/csv;charset=utf-8'}),'ucs_filtradas.csv');
  });

  /* init */
  window.addEventListener('load',()=>map.invalidateSize());
  refresh();
})();
