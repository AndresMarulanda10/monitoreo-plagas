import { useEffect, useMemo, useState } from 'react';
import { api, apiBase, type Catalog, type Configuration, type Dashboard, type ObservationEntry, type Review, type Severity } from '../lib/api';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

type FormEventLike = { preventDefault: () => void };

const SEVERITIES: Array<{ value: Severity; label: string }> = [
  { value: 0, label: 'Sin síntomas' },
  { value: 1, label: 'Baja' },
  { value: 2, label: 'Media' },
  { value: 3, label: 'Alta' },
];

function LeafIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.4 3.6C12.7 3.9 6.8 6.1 4.5 10.2c-1.7 3 .1 6.8 3.3 6.8 4.8 0 8.6-5.1 9.2-10.9" /><path d="M3.8 20.2c2.7-4.2 6.1-6.7 10.5-8.3" /></svg>;
}

function today() { return new Date().toISOString().slice(0, 10); }
function weekStart(date: string) { const value = new Date(`${date}T00:00:00Z`); const day = value.getUTCDay(); value.setUTCDate(value.getUTCDate() - ((day + 6) % 7)); return value.toISOString().slice(0, 10); }
function entryKey(plantId: string, organismId: string) { return `${plantId}::${organismId}`; }
export function asEntries(values: Record<string, Severity | undefined>): ObservationEntry[] { return Object.entries(values).flatMap(([key, severity]) => { if (severity === undefined) return []; const [plantId, organismId] = key.split('::'); return [{ plantId, organismId, severity }]; }); }

export default function MonitoringForm() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [values, setValues] = useState<Record<string, Severity | undefined>>({});
  const [configurationId, setConfigurationId] = useState('');
  const [reviewDate, setReviewDate] = useState(today());
  const [slot, setSlot] = useState<1 | 2>(1);
  const [existingReviewId, setExistingReviewId] = useState('');
  const [bed, setBed] = useState('all');
  const [screen, setScreen] = useState<'entry' | 'dashboard'>('entry');
  const [correction, setCorrection] = useState(false);
  const [reason, setReason] = useState('');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [observations, setObservations] = useState<Awaited<ReturnType<typeof api.observations>> | null>(null);
  const [dashboardQuery, setDashboardQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        await api.startSession();
        const result = await api.catalog();
        setCatalog(result.data);
        setConfigurationId(result.data.configurations[0]?.id ?? '');
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible cargar el catálogo.'); }
      finally { setLoading(false); }
    })();
  }, []);

  async function login(event: FormEventLike) {
    event.preventDefault(); setLoading(true); setError(null);
    try { await api.startSession({ email, password }); const result = await api.catalog(); setCatalog(result.data); setConfigurationId(result.data.configurations[0]?.id ?? ''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible iniciar sesión.'); }
    finally { setLoading(false); }
  }

  const configuration = catalog?.configurations.find((item) => item.id === configurationId);
  const plants = useMemo(() => configuration?.beds.flatMap((item) => item.plantIds.map((plantId) => ({ plantId, bed: item.number }))) ?? [], [configuration]);
  const visiblePlants = bed === 'all' ? plants : plants.filter((item) => String(item.bed) === bed);
  const complete = Boolean(configuration && plants.every(({ plantId }) => catalog?.organisms.every((organism) => values[entryKey(plantId, organism.id)] !== undefined)));
  const selectedEntries = useMemo(() => asEntries(values), [values]);

  function hydrate(next: Review) {
    const initial: Record<string, Severity | undefined> = {};
    next.version.entries.forEach((entry) => { initial[entryKey(entry.plantId, entry.organismId)] = entry.severity; });
    setValues(initial);
    setReview(next);
  }

  async function startDraft(event: FormEventLike) {
    event.preventDefault(); setError(null); setNotice(null); setSaving(true);
    try { const result = await api.createDraft({ configurationId, reviewWeek: weekStart(reviewDate), reviewDate, slot }); hydrate(result.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible iniciar la revisión.'); }
    finally { setSaving(false); }
  }

  async function reloadDraft() {
    if (!existingReviewId.trim()) return;
    setSaving(true); setError(null); setNotice(null);
    try { const result = await api.review(existingReviewId.trim()); setConfigurationId(result.data.configurationId); hydrate(result.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible recargar la revisión.'); }
    finally { setSaving(false); }
  }

  async function saveDraft() {
    if (!review) return; setSaving(true); setError(null); setNotice(null);
    try { const result = await api.save(review.reviewId, review.currentVersion, selectedEntries); hydrate(result.data); setNotice('Borrador guardado en el servidor.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar el borrador.'); }
    finally { setSaving(false); }
  }

  async function submit() {
    if (!review) return; setSaving(true); setError(null); setNotice(null);
    try { const result = await api.submit(review.reviewId, review.currentVersion); hydrate(result.review); setNotice(result.data.confirmation); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible enviar la revisión.'); }
    finally { setSaving(false); }
  }

  async function submitCorrection() {
    if (!review) return; setSaving(true); setError(null); setNotice(null);
    try { const result = await api.correct(review.reviewId, review.currentVersion, reason, selectedEntries); hydrate(result.data); setCorrection(false); setReason(''); setNotice(result.confirmation); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar la corrección.'); }
    finally { setSaving(false); }
  }

  function setSeverity(plantId: string, organismId: string, severity: Severity) { setValues((current) => ({ ...current, [entryKey(plantId, organismId)]: severity })); setNotice(null); }
  function markAllClear() { const next: Record<string, Severity> = {}; plants.forEach(({ plantId }) => catalog?.organisms.forEach((organism) => { next[entryKey(plantId, organism.id)] = 0; })); setValues(next); }

  async function showDashboard(query = '', filterQuery = query) {
    setScreen('dashboard'); setError(null); setDashboardQuery(filterQuery);
    try { const [summary, rows] = await Promise.all([api.dashboard(query), api.observations(`${query}${query ? '&' : '?'}limit=20`)]); setDashboard(summary.data); setObservations(rows); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible cargar el tablero.'); }
  }

  function nextDashboardPage() {
    if (!observations?.nextCursor) return;
    const separator = dashboardQuery ? '&' : '?';
    void showDashboard(`${dashboardQuery}${separator}cursor=${encodeURIComponent(observations.nextCursor)}`, dashboardQuery);
  }

  if (loading) return <div className="loading-screen">Cargando catálogo de monitoreo...</div>;
  if (!catalog) return <div className="loading-screen"><Card className="login-card p-6"><p className="eyebrow">Métrica Verde</p><h1 className="mt-2 font-display text-3xl font-semibold">Iniciar sesión</h1><p className="mt-2 text-sm text-muted-foreground">{error ?? 'Usa tu cuenta autorizada para acceder al monitoreo.'}</p><form className="mt-5 grid gap-3" onSubmit={login}><label className="field-label">Correo<input className="native-select" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="field-label">Contraseña<input className="native-select" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><Button type="submit" disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar'}</Button></form></Card></div>;

  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border bg-topbar text-topbar-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <a className="flex items-center gap-3" href="/" aria-label="Ir al inicio"><span className="brand-mark"><LeafIcon /></span><span><span className="block font-display text-lg font-semibold">Métrica Verde</span><span className="block text-[0.68rem] uppercase tracking-[0.2em] text-topbar-muted">Campo / control</span></span></a>
        <nav className="flex items-center gap-2" aria-label="Secciones"><button className={`nav-button ${screen === 'entry' ? 'nav-button-active' : ''}`} onClick={() => setScreen('entry')}>Registro</button><button className={`nav-button ${screen === 'dashboard' ? 'nav-button-active' : ''}`} onClick={() => void showDashboard()}>Tablero</button></nav>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pt-12">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {screen === 'dashboard' ? <DashboardView catalog={catalog} dashboard={dashboard} observations={observations} query={dashboardQuery} onRefresh={(query) => void showDashboard(query)} onNextPage={nextDashboardPage} /> : <>
        <section className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow">Registro de campo <span>•</span> API conectada</p><h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">Monitoreo de <em>sanidad</em></h1><p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">Registra la severidad de cada planta. El servidor valida la matriz completa antes de crear una versión inmutable.</p></div><div className="date-card"><span className="date-label">Estado</span><strong>{review ? `v${review.currentVersion} · ${review.status === 'submitted' ? 'Enviada' : 'Borrador'}` : 'Nueva revisión'}</strong></div></section>
        {!review ? <Card className="p-5 sm:p-6"><div className="mb-5"><h2 className="section-title">Iniciar revisión</h2><p className="section-caption">Selecciona una configuración y una de las dos rondas semanales.</p></div><form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={startDraft}><label className="field-label">Configuración<select className="native-select" value={configurationId} onChange={(event) => setConfigurationId(event.target.value)}>{catalog.configurations.map((item) => <option value={item.id} key={item.id}>{item.lotName} / {item.cropName}</option>)}</select></label><label className="field-label">Fecha<input className="native-select" type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} /></label><label className="field-label">Ronda semanal<select className="native-select" value={slot} onChange={(event) => setSlot(Number(event.target.value) as 1 | 2)}><option value="1">Ronda 1</option><option value="2">Ronda 2</option></select></label><div className="flex items-end"><Button type="submit" disabled={saving}>{saving ? 'Iniciando...' : 'Crear borrador'}</Button></div></form><div className="reload-row"><label className="field-label">Recargar por ID de revisión<input className="native-select" value={existingReviewId} onChange={(event) => setExistingReviewId(event.target.value)} placeholder="UUID de la revisión" /></label><Button type="button" className="secondary-button" onClick={() => void reloadDraft()} disabled={saving || !existingReviewId.trim()}>Recargar</Button></div></Card> : <ReviewView catalog={catalog} configuration={configuration!} review={review} values={values} visiblePlants={visiblePlants} bed={bed} setBed={setBed} correction={correction} reason={reason} setReason={setReason} complete={complete} saving={saving} onSetSeverity={setSeverity} onMarkAllClear={markAllClear} onSave={() => void saveDraft()} onSubmit={() => void submit()} onCorrection={() => setCorrection(true)} onSubmitCorrection={() => void submitCorrection()} />}
      </>}
    </main>
    <footer className="mx-auto flex max-w-7xl justify-between px-4 pb-8 text-xs text-muted-foreground sm:px-6 lg:px-8"><span>API server-side · Supabase no se expone al navegador</span><span>Escala: 0–3</span></footer>
  </div>;
}

function ReviewView(props: { catalog: Catalog; configuration: Configuration; review: Review; values: Record<string, Severity | undefined>; visiblePlants: Array<{ plantId: string; bed: number }>; bed: string; setBed: (value: string) => void; correction: boolean; reason: string; setReason: (value: string) => void; complete: boolean; saving: boolean; onSetSeverity: (plantId: string, organismId: string, severity: Severity) => void; onMarkAllClear: () => void; onSave: () => void; onSubmit: () => void; onCorrection: () => void; onSubmitCorrection: () => void }) {
  const { catalog, configuration, review, values, visiblePlants, bed, setBed, correction, reason, setReason, complete, saving, onSetSeverity, onMarkAllClear, onSave, onSubmit, onCorrection, onSubmitCorrection } = props;
  const editable = review.status === 'draft' || correction;
  return <>
    <Card className="mb-8 p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">{configuration.lotName} / {configuration.cropName}</p><h2 className="mt-2 font-display text-2xl font-semibold">Revisión del {review.reviewDate}</h2><p className="section-caption mt-1">Ronda {review.slot} · semana del {review.reviewWeek} · {review.completion.actual}/{review.completion.expected} coordenadas</p></div><div className="flex flex-wrap gap-2"><label className="field-label compact-label">Cama<select className="native-select" value={bed} onChange={(event) => setBed(event.target.value)}><option value="all">Todas las camas</option>{configuration.beds.map((item) => <option value={item.number} key={item.id}>Cama {item.number}</option>)}</select></label><Button type="button" className="secondary-button" onClick={onMarkAllClear}>Marcar todo 0</Button></div></div></Card>
    <section aria-labelledby="matrix-heading"><div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 id="matrix-heading" className="section-title">Matriz por organismo</h2><p className="section-caption">Cada planta debe tener un valor explícito para los ocho organismos.</p></div><div className="legend" aria-label="Leyenda de severidad">{SEVERITIES.map((item) => <span className="legend-item" key={item.value}><span className={`severity-dot severity-${item.value}`}>{item.value}</span>{item.label}</span>)}</div></div><div className="matrix-grid">{catalog.organisms.map((organism) => <fieldset className="organism-card" key={organism.id}><legend className="sr-only">{organism.name}</legend><div className="organism-heading"><div className="organism-icon"><LeafIcon /></div><div><h3>{organism.name}</h3><p>Escala 0–3 · score &gt; 0 = afectada</p></div></div><div className="accessible-table-wrap"><table className="matrix-table"><caption className="sr-only">Severidad de {organism.name} por planta</caption><thead><tr><th scope="col">Planta</th><th scope="col">Cama</th><th scope="col">Severidad</th></tr></thead><tbody>{visiblePlants.map(({ plantId, bed: bedNumber }) => <tr key={plantId}><th scope="row">Planta {plantId.split('-plant-').at(-1)?.padStart(2, '0')}</th><td>{bedNumber}</td><td><div className="severity-control" role="radiogroup" aria-label={`${organism.name}, planta ${plantId}`}>
      {SEVERITIES.map((item) => <label className={`severity-option severity-option-${item.value}`} key={`${plantId}-${organism.id}-${item.value}`}><input type="radio" name={entryKey(plantId, organism.id)} value={item.value} checked={values[entryKey(plantId, organism.id)] === item.value} disabled={!editable} onChange={() => onSetSeverity(plantId, organism.id, item.value)} /><span>{item.value}</span><span className="sr-only">{item.label}</span></label>)}
    </div></td></tr>)}</tbody></table></div></fieldset>)}</div></section>
    <Card className="save-panel mt-8"><div><h2 className="section-title">{correction ? 'Enviar corrección' : review.status === 'submitted' ? 'Versión enviada' : 'Guardar y enviar'}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{review.status === 'submitted' && !correction ? `La versión ${review.currentVersion} es inmutable. Puedes crear una corrección vinculada.` : complete ? 'Matriz completa. Puedes guardar el borrador o enviarlo para congelar esta versión.' : `Faltan ${review.completion.expected - review.completion.actual} coordenadas. La entrega está bloqueada.`}</p>{correction && <label className="field-label mt-3">Motivo de corrección<textarea className="native-select" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explica el ajuste realizado" /></label>}</div><div className="flex flex-wrap gap-2">{review.status === 'draft' && <Button type="button" className="secondary-button" onClick={onSave} disabled={saving}>Guardar borrador</Button>}{review.status === 'draft' && <Button type="button" onClick={onSubmit} disabled={saving || !complete}>{saving ? 'Enviando...' : 'Enviar revisión'}</Button>}{review.status === 'submitted' && !correction && <Button type="button" onClick={onCorrection}>Crear corrección</Button>}{correction && <><Button type="button" className="secondary-button" onClick={() => setReason('')}>Limpiar motivo</Button><Button type="button" onClick={onSubmitCorrection} disabled={saving || !complete || !reason.trim()}>{saving ? 'Guardando...' : 'Enviar corrección'}</Button></>}</div></Card>
  </>;
}

function DashboardView({ catalog, dashboard, observations, query, onRefresh, onNextPage }: { catalog: Catalog; dashboard: Dashboard | null; observations: Awaited<ReturnType<typeof api.observations>> | null; query: string; onRefresh: (query: string) => void; onNextPage: () => void }) {
  const [configurationId, setConfigurationId] = useState('');
  const [organismId, setOrganismId] = useState('');
  const [bed, setBed] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  function applyFilters(event: FormEventLike) { event.preventDefault(); const params = new URLSearchParams(); if (configurationId) params.set('configurationId', configurationId); if (organismId) params.set('organismId', organismId); if (bed) params.set('bed', bed); if (from) params.set('from', from); if (to) params.set('to', to); onRefresh(params.toString() ? `?${params.toString()}` : ''); }
  const csvQuery = query;
  return <section aria-labelledby="dashboard-heading"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Lectura consolidada</p><h1 id="dashboard-heading" className="mt-3 font-display text-4xl font-semibold">Tablero de <em>sanidad</em></h1><p className="mt-3 text-base text-muted-foreground">Métricas, tendencias y observaciones usan las mismas versiones enviadas.</p></div><Button type="button" className="secondary-button" onClick={() => onRefresh('')}>Actualizar</Button></div><Card className="mb-6 p-5"><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={applyFilters}><label className="field-label">Configuración<select className="native-select" value={configurationId} onChange={(event) => setConfigurationId(event.target.value)}><option value="">Todas</option>{catalog.configurations.map((item) => <option value={item.id} key={item.id}>{item.lotName} / {item.cropName}</option>)}</select></label><label className="field-label">Organismo<select className="native-select" value={organismId} onChange={(event) => setOrganismId(event.target.value)}><option value="">Todos</option>{catalog.organisms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="field-label">Cama<input className="native-select" inputMode="numeric" value={bed} onChange={(event) => setBed(event.target.value)} placeholder="Todas" /></label><label className="field-label">Desde<input className="native-select" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="field-label">Hasta<input className="native-select" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><div className="flex items-end"><Button type="submit">Aplicar filtros</Button></div></form><div className="mt-4 flex flex-wrap gap-4 text-sm"><span><strong>{dashboard?.count ?? 0}</strong> revisiones enviadas</span><span className="text-muted-foreground">Fórmula: incidencia = afectadas / inspeccionadas · severidad = suma / (inspeccionadas × 3)</span></div></Card>{dashboard?.empty ? <Card className="p-8 text-center"><h2 className="section-title">Sin datos para este filtro</h2><p className="mt-2 text-sm text-muted-foreground">Las métricas aparecen después de enviar una revisión completa.</p></Card> : <><div className="kpi-grid">{dashboard?.kpis.map((kpi) => <Card className="kpi-card" key={kpi.organismId}><span className="summary-label">{kpi.organismName}</span><strong>{kpi.incidencePercent}%</strong><span className="text-xs text-muted-foreground">Incidencia · {kpi.severityPercent}% severidad</span><span className="text-xs text-muted-foreground">{kpi.incidenceNumerator}/{kpi.incidenceDenominator} afectadas · {kpi.provenance[0]?.formulaVersion}</span></Card>)}</div><Card className="mt-6 p-5"><h2 className="section-title">Comparación por organismo</h2><div className="accessible-table-wrap mt-4"><table className="data-table"><caption className="sr-only">Comparación de incidencia y severidad por organismo</caption><thead><tr><th scope="col">Organismo</th><th scope="col">Incidencia</th><th scope="col">Severidad</th></tr></thead><tbody>{dashboard?.comparisons.map((item) => <tr key={item.organismId}><th scope="row">{item.organismName}</th><td>{item.incidencePercent}%</td><td>{item.severityPercent}%</td></tr>)}</tbody></table></div></Card><Card className="mt-6 p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="section-title">Tendencia por revisión</h2><p className="section-caption">Tabla equivalente accesible al resumen.</p></div><a className="text-sm font-bold text-primary" href={`${apiBase}/api/v1/exports/reviews.csv${csvQuery}`} download>Descargar CSV</a></div><div className="accessible-table-wrap"><table className="data-table"><caption className="sr-only">Tendencia de métricas por revisión y organismo</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Configuración</th><th scope="col">Organismo</th><th scope="col">Incidencia</th><th scope="col">Severidad</th><th scope="col">Fuente</th></tr></thead><tbody>{dashboard?.trends.flatMap((trend) => trend.metrics.map((metric) => <tr key={`${trend.reviewId}-${metric.organismId}`}><td>{trend.date}</td><td>{catalog.configurations.find((item) => item.id === trend.configurationId)?.lotName}</td><td>{catalog.organisms.find((item) => item.id === metric.organismId)?.name}</td><td>{metric.incidencePercent}%</td><td>{metric.severityPercent}%</td><td><code>{metric.formulaVersion} / v{metric.sourceVersion}</code></td></tr>))}</tbody></table></div></Card><Card className="mt-6 p-5"><h2 className="section-title">Observaciones recientes</h2><div className="accessible-table-wrap"><table className="data-table"><caption className="sr-only">Observaciones paginadas</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Planta</th><th scope="col">Organismo</th><th scope="col">Cama</th><th scope="col">Score</th></tr></thead><tbody>{observations?.data.map((row) => <tr key={`${row.reviewId}-${row.plantId}-${row.organismId}`}><td>{row.reviewDate}</td><td>{row.plantId}</td><td>{row.organismName}</td><td>{row.bed}</td><td><span className={`severity-dot severity-${row.severity}`}>{row.severity}</span></td></tr>)}</tbody></table></div>{observations?.nextCursor && <div className="mt-4 text-right"><Button type="button" className="secondary-button" onClick={onNextPage}>Siguiente página</Button></div>}</Card></>}</section>;
}
