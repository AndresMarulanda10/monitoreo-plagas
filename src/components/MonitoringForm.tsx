import { useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

type Severity = 0 | 1 | 2 | 3;

type Organism = {
  id: string;
  name: string;
  description: string;
  detail: string;
  plants: number;
  initial: Severity[];
  accent: string;
};

const SEVERITIES: Array<{ value: Severity; label: string; shortLabel: string }> = [
  { value: 0, label: 'Sin síntomas', shortLabel: 'Sin' },
  { value: 1, label: 'Baja', shortLabel: 'Baja' },
  { value: 2, label: 'Media', shortLabel: 'Media' },
  { value: 3, label: 'Alta', shortLabel: 'Alta' },
];

const ORGANISMS: Organism[] = [
  {
    id: 'mildeo',
    name: 'Mildeo',
    description: 'Polvoso',
    detail: 'Hojas y tallos',
    plants: 15,
    initial: [0, 1, 0, 2, 0, 0, 1, 0, 0, 3, 0, 0, 1, 0, 0],
    accent: 'mildeo',
  },
  {
    id: 'cladosporium',
    name: 'Cladosporium',
    description: 'Mancha foliar',
    detail: 'Hojas',
    plants: 12,
    initial: [0, 0, 2, 0, 1, 0, 0, 0, 0, 2, 0, 0],
    accent: 'cladosporium',
  },
  {
    id: 'botrytis',
    name: 'Botrytis',
    description: 'Moho gris',
    detail: 'Flores y frutos',
    plants: 10,
    initial: [0, 0, 0, 1, 0, 0, 0, 2, 0, 0],
    accent: 'botrytis',
  },
];

const INITIAL_SEVERITIES = Object.fromEntries(
  ORGANISMS.map((organism) => [organism.id, organism.initial]),
) as Record<string, Severity[]>;

function percentage(affected: number, total: number) {
  return Math.round((affected / total) * 100);
}

function LeafIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20.4 3.6C12.7 3.9 6.8 6.1 4.5 10.2c-1.7 3 .1 6.8 3.3 6.8 4.8 0 8.6-5.1 9.2-10.9" />
      <path d="M3.8 20.2c2.7-4.2 6.1-6.7 10.5-8.3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m4 10.5 3.8 3.8L16 6.2" />
    </svg>
  );
}

export default function MonitoringForm() {
  const [crop, setCrop] = useState('Tomate');
  const [lot, setLot] = useState('Invernadero A');
  const [bed, setBed] = useState('Cama 04');
  const [severities, setSeverities] = useState(INITIAL_SEVERITIES);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function updateSeverity(organismId: string, plantIndex: number, event: ChangeEvent<HTMLInputElement>) {
    const nextValue = Number(event.target.value) as Severity;
    setSeverities((current) => ({
      ...current,
      [organismId]: current[organismId].map((severity, index) =>
        index === plantIndex ? nextValue : severity,
      ),
    }));
    setSavedAt(null);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavedAt(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-topbar text-topbar-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a className="flex items-center gap-3" href="/" aria-label="Ir al inicio de Monitoreo">
            <span className="brand-mark"><LeafIcon /></span>
            <span>
              <span className="block font-display text-lg font-semibold tracking-tight">Métrica Verde</span>
              <span className="block text-[0.68rem] uppercase tracking-[0.2em] text-topbar-muted">Campo / control</span>
            </span>
          </a>
          <span className="status-pill"><span className="status-dot" /> Demo local</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <section className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">Registro de campo <span>•</span> ronda 01</p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
              Monitoreo de <em>sanidad</em>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Registra la severidad observada en cada planta y revisa la incidencia de la cama en tiempo real.
            </p>
          </div>
          <div className="date-card" aria-label="Fecha de la ronda">
            <span className="date-label">Fecha de monitoreo</span>
            <strong>01 septiembre 2026</strong>
          </div>
        </section>

        <form onSubmit={handleSubmit}>
          <section className="mb-8" aria-labelledby="context-heading">
            <Card className="p-5 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 id="context-heading" className="section-title">Contexto de la inspección</h2>
                  <p className="section-caption">Selecciona dónde estás tomando la muestra.</p>
                </div>
                <span className="step-number">01</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="field-label">
                  Cultivo
                  <span className="select-wrap">
                    <select value={crop} onChange={(event) => setCrop(event.target.value)}>
                      <option>Tomate</option>
                      <option>Pimentón</option>
                      <option>Rosa</option>
                      <option>Fresas</option>
                    </select>
                    <ChevronIcon />
                  </span>
                </label>
                <label className="field-label">
                  Lote
                  <span className="select-wrap">
                    <select value={lot} onChange={(event) => setLot(event.target.value)}>
                      <option>Invernadero A</option>
                      <option>Norte</option>
                      <option>Flores</option>
                      <option>Sector B</option>
                    </select>
                    <ChevronIcon />
                  </span>
                </label>
                <label className="field-label">
                  Cama
                  <span className="select-wrap">
                    <select value={bed} onChange={(event) => setBed(event.target.value)}>
                      <option>Cama 04</option>
                      <option>Cama 05</option>
                      <option>Cama 06</option>
                      <option>Cama 07</option>
                    </select>
                    <ChevronIcon />
                  </span>
                </label>
              </div>
            </Card>
          </section>

          <section aria-labelledby="severity-heading">
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="flex items-center gap-3">
                  <span className="step-number">02</span>
                  <h2 id="severity-heading" className="section-title">Observaciones por organismo</h2>
                </div>
                <p className="section-caption mt-2 sm:ml-12">Evalúa cada planta usando una escala de 0 a 3.</p>
              </div>
              <div className="legend" aria-label="Leyenda de severidad">
                {SEVERITIES.map((severity) => (
                  <span className="legend-item" key={severity.value}>
                    <span className={`severity-dot severity-${severity.value}`}>{severity.value}</span>
                    <span>{severity.label}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              {ORGANISMS.map((organism) => {
                const values = severities[organism.id];
                const affected = values.filter((severity) => severity > 0).length;
                const incidence = percentage(affected, organism.plants);

                return (
                  <fieldset className="organism-card" data-accent={organism.accent} key={organism.id}>
                    <legend className="sr-only">{organism.name}</legend>
                    <div className="organism-heading">
                      <div className="organism-icon" aria-hidden="true"><LeafIcon /></div>
                      <div className="min-w-0">
                        <h3>{organism.name}</h3>
                        <p>{organism.description} <span>•</span> {organism.detail}</p>
                      </div>
                      <span className="plant-count">{organism.plants} plantas</span>
                    </div>

                    <div className="organism-summary">
                      <div>
                        <span className="summary-label">Incidencia</span>
                        <strong>{incidence}%</strong>
                      </div>
                      <div className="summary-divider" />
                      <div>
                        <span className="summary-label">Afectadas</span>
                        <strong>{affected}<small> / {organism.plants}</small></strong>
                      </div>
                      <span className="summary-bar" aria-hidden="true"><span style={{ width: `${incidence}%` }} /></span>
                    </div>

                    <div className="plant-list">
                      {values.map((value, plantIndex) => {
                        const plantNumber = plantIndex + 1;
                        const inputGroup = `${organism.id}-plant-${plantNumber}`;

                        return (
                          <div className="plant-row" key={inputGroup}>
                            <span className="plant-name">Planta {String(plantNumber).padStart(2, '0')}</span>
                            <div className="severity-control" role="radiogroup" aria-label={`Severidad de planta ${plantNumber}`}>
                              {SEVERITIES.map((severity) => (
                                <label className={`severity-option severity-option-${severity.value}`} key={`${inputGroup}-${severity.value}`}>
                                  <input
                                    type="radio"
                                    name={inputGroup}
                                    value={severity.value}
                                    checked={value === severity.value}
                                    onChange={(event) => updateSeverity(organism.id, plantIndex, event)}
                                  />
                                  <span>{severity.value}</span>
                                  <span className="sr-only">{severity.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </section>

          <section className="mt-8" aria-labelledby="save-heading">
            <Card className="save-panel">
              <div>
                <div className="flex items-center gap-3">
                  <span className="step-number step-number-dark">03</span>
                  <h2 id="save-heading" className="section-title">Revisar registro</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground sm:ml-12">
                  {savedAt
                    ? `Última revisión local: ${savedAt}. No se envió información a un servidor.`
                    : 'Este botón solo simula el guardado para revisar la experiencia del formulario.'}
                </p>
              </div>
              <Button type="submit">
                <CheckIcon />
                {savedAt ? 'Demo revisada' : 'Guardar demo local'}
              </Button>
            </Card>
          </section>
        </form>
      </main>
      <footer className="mx-auto flex max-w-7xl flex-col gap-2 px-4 pb-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <span>Los datos de esta pantalla viven solo en tu navegador.</span>
        <span>Escala de severidad: 0–3</span>
      </footer>
    </div>
  );
}
