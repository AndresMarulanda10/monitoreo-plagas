import { useState } from 'react';
import { api, apiBase, displayAreaName, displayCropName, displayOrganismName, type Catalog, type Dashboard, type ObservationRow, type ReportArea } from '../lib/api';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

type FormEventLike = { preventDefault: () => void };

function percent(value: number) { return `${value}%`; }

export default function ConsolidatedDashboard({ catalog, dashboard, observations, query, onRefresh, onNextPage }: { catalog: Catalog; dashboard: Dashboard | null; observations: Awaited<ReturnType<typeof api.observations>> | null; query: string; onRefresh: (query: string) => void; onNextPage: () => void }) {
  const [area, setArea] = useState<ReportArea>('combined');
  const [configurationId, setConfigurationId] = useState('');
  const [crop, setCrop] = useState('');
  const [organismId, setOrganismId] = useState('');
  const [bed, setBed] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const crops = [...new Set(catalog.configurations.map((item) => item.cropName))];

  function applyFilters(event: FormEventLike) {
    event.preventDefault();
    const params = new URLSearchParams();
    params.set('area', area);
    if (configurationId) params.set('configurationId', configurationId);
    if (crop) params.set('crop', crop);
    if (organismId) params.set('organismId', organismId);
    if (bed) params.set('bed', bed);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    onRefresh(params.toString() ? `?${params.toString()}` : '');
  }

  const csvUrl = `${apiBase}/api/v1/exports/reviews.csv${query}`;
  return <section aria-labelledby="dashboard-heading">
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="eyebrow">Lectura consolidada</p><h1 id="dashboard-heading" className="mt-3 font-display text-4xl font-semibold">Tablero de <em>sanidad</em></h1><p className="mt-3 max-w-2xl text-base text-muted-foreground">Consulta la incidencia y severidad por patógeno, cama y configuración. Cada fila identifica la ronda semanal para no mezclar las revisiones.</p></div>
       <Button type="button" className="secondary-button" onClick={() => onRefresh(`?area=${area}`)}>Actualizar</Button>
    </div>

    <Card className="mb-6 p-5">
       <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-8" onSubmit={applyFilters}>
         <label className="field-label">Área<select className="native-select" value={area} onChange={(event) => setArea(event.target.value as ReportArea)}><option value="combined">Consolidado</option><option value="microbiology">Microbiología</option><option value="entomology">Entomología</option></select></label>
        <label className="field-label">Configuración<select className="native-select" value={configurationId} onChange={(event) => setConfigurationId(event.target.value)}><option value="">Todas</option>{catalog.configurations.map((item) => <option value={item.id} key={item.id}>{item.lotName} / {displayCropName(item.cropName)}</option>)}</select></label>
        <label className="field-label">Cultivo<select className="native-select" value={crop} onChange={(event) => setCrop(event.target.value)}><option value="">Todos</option>{crops.map((item) => <option value={item} key={item}>{displayCropName(item)}</option>)}</select></label>
        <label className="field-label">Patógeno<select className="native-select" value={organismId} onChange={(event) => setOrganismId(event.target.value)}><option value="">Todos</option>{catalog.organisms.map((item) => <option value={item.id} key={item.id}>{displayOrganismName(item.name)}</option>)}</select></label>
        <label className="field-label">Cama<input className="native-select" inputMode="numeric" value={bed} onChange={(event) => setBed(event.target.value)} placeholder="Todas" /></label>
        <label className="field-label">Desde<input className="native-select" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="field-label">Hasta<input className="native-select" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <div className="flex items-end"><Button type="submit">Aplicar filtros</Button></div>
      </form>
      <div className="mt-4 flex flex-wrap gap-4 text-sm"><span><strong>{dashboard?.count ?? 0}</strong> revisiones enviadas</span><span><strong>{dashboard?.consolidated.length ?? 0}</strong> métricas por cama y patógeno</span><a className="text-primary underline" href={csvUrl}>Descargar CSV</a></div>
    </Card>

    {dashboard?.empty ? <Card className="p-8 text-center"><h2 className="section-title">Aún no hay revisiones enviadas</h2><p className="mt-2 text-sm text-muted-foreground">Cuando se envíe una matriz completa, sus porcentajes aparecerán aquí.</p></Card> : <>
      <section aria-labelledby="consolidated-heading" className="mb-6">
        <div className="mb-4"><h2 id="consolidated-heading" className="section-title">Métricas consolidadas por revisión y cama</h2><p className="section-caption">Incidencia = plantas con severidad mayor que 0. Severidad = suma de severidad / (plantas inspeccionadas × 3).</p></div>
         <Card className="p-0"><div className="accessible-table-wrap"><table className="data-table consolidated-table"><caption className="sr-only">Incidencia y severidad por área, patógeno, cama, cultivo y ronda semanal</caption><thead><tr><th scope="col">Área</th><th scope="col">Cultivo / lote</th><th scope="col">Revisión</th><th scope="col">Cama</th><th scope="col">Patógeno</th><th scope="col">Incidencia</th><th scope="col">Severidad</th><th scope="col">Muestra</th></tr></thead><tbody>{dashboard?.consolidated.map((row) => <tr key={`${row.reviewId}-${row.bed}-${row.organismId}`}><td><strong>{displayAreaName(row.area)}</strong></td><td><strong>{displayCropName(row.cropName)}</strong><span className="table-subtitle">{row.lotName}</span></td><td><strong>Ronda {row.slot}</strong><span className="table-subtitle">{row.reviewDate} · semana {row.reviewWeek}</span></td><td>Cama {row.bed}</td><th scope="row">{displayOrganismName(row.organismName)}</th><td className="metric-value">{percent(row.metric.incidencePercent)}<span className="table-subtitle">{row.metric.incidenceNumerator}/{row.metric.incidenceDenominator} plantas</span></td><td className="metric-value">{percent(row.metric.severityPercent)}<span className="table-subtitle">{row.metric.severityNumerator}/{row.metric.severityDenominator} puntos</span></td><td>{row.inspectedPlants} plantas</td></tr>)}</tbody></table></div></Card>
      </section>

       <section aria-labelledby="summary-heading" className="mb-6"><div className="mb-4"><h2 id="summary-heading" className="section-title">Resumen por área y patógeno</h2><p className="section-caption">Acumulado de las revisiones filtradas, conservando la fórmula de las versiones enviadas.</p></div><div className="kpi-grid">{dashboard?.kpis.map((item) => <Card className="kpi-card" key={`${item.area}-${item.organismId}`}><span className="summary-label">{displayAreaName(item.area)}</span><span className="summary-label">{displayOrganismName(item.organismName)}</span><strong>{percent(item.incidencePercent)}</strong><span className="text-sm text-muted-foreground">Incidencia</span><span className="text-sm"><b>{percent(item.severityPercent)}</b> severidad</span><span className="table-subtitle">{item.reviews} revisión(es)</span></Card>)}</div></section>

       <section aria-labelledby="observations-heading"><div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><h2 id="observations-heading" className="section-title">Evidencia por planta</h2><p className="section-caption">Detalle de las observaciones que originan las métricas consolidadas.</p></div>{observations?.nextCursor && <Button type="button" className="secondary-button" onClick={onNextPage}>Cargar más</Button>}</div><Card className="p-0"><div className="accessible-table-wrap"><table className="data-table"><thead><tr><th scope="col">Área</th><th scope="col">Revisión</th><th scope="col">Cultivo / cama</th><th scope="col">Planta</th><th scope="col">Patógeno</th><th scope="col">Severidad</th></tr></thead><tbody>{observations?.data.map((row: ObservationRow) => <tr key={`${row.reviewId}-${row.plantId}-${row.organismId}`}><td>{displayAreaName(row.area)}</td><td>Ronda {row.slot}<span className="table-subtitle">{row.reviewDate} · {row.reviewWeek}</span></td><td>{displayCropName(row.cropName)}<span className="table-subtitle">{row.lotName} · Cama {row.bed}</span></td><td>{row.plantId.split('-plant-').at(-1)?.padStart(2, '0')}</td><th scope="row">{displayOrganismName(row.organismName)}</th><td><span className={`severity-dot severity-${row.severity}`}>{row.severity}</span></td></tr>)}</tbody></table></div></Card></section>
    </>}
  </section>;
}
