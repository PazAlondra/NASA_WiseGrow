
import { useState } from 'react';
import {
  ClipboardList,
  MapPin,
  Sprout,
  Mountain,
  Tractor,
  Target,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  ChevronRight
} from 'lucide-react';

import './Questionnaire.css';

const crops = [
  'Maíz',
  'Frijol',
  'Trigo',
  'Sorgo',
  'Cebada',
  'Avena',
  'Arroz',
  'Soya',
  'Alfalfa',
  'Otro',
  'Desconocido'
];

const initialData = {
  latitude: '',
  longitude: '',
  state: '',
  area: '',
  productionSystem: '',
  waterAvailability: '',

  soilTexture: '',
  drainage: '',
  slope: '',
  erosion: '',
  soilCover: '',
  organicMatter: '',

  previousCrop: '',
  secondPreviousCrop: '',
  currentCrop: '',
  targetCrop1: '',
  targetCrop2: '',

  machinery: '',
  fertilizers: '',
  labor: '',
  irrigation: '',
  investment: '',

  primaryGoal: '',
  secondaryGoals: [],
  consultationTopics: [],

  planningHorizon: '',
  reviewFrequency: ''
};

const options = {
  productionSystem: [
    'Temporal',
    'Riego',
    'Mixto'
  ],
  waterAvailability: [
    'Alta',
    'Media',
    'Limitada',
    'Desconocida'
  ],
  soilTexture: [
    'Arenoso',
    'Franco arenoso',
    'Franco',
    'Franco arcilloso',
    'Arcilloso',
    'Desconocido'
  ],
  drainage: [
    'Bueno',
    'Moderado',
    'Deficiente',
    'Desconocido'
  ],
  slope: [
    'Plana',
    'Suave',
    'Moderada',
    'Pronunciada',
    'Desconocida'
  ],
  erosion: [
    'Ninguna identificada',
    'Leve',
    'Moderada',
    'Severa',
    'No identificada'
  ],
  soilCover: [
    'Permanente',
    'Estacional',
    'Escasa',
    'Sin cobertura',
    'Desconocida'
  ],
  organicMatter: [
    'Baja',
    'Media',
    'Alta',
    'No analizada'
  ],
  machinery: [
    'Completa',
    'Limitada',
    'Manual',
    'No disponible'
  ],
  fertilizers: [
    'Alta',
    'Media',
    'Limitada',
    'Desconocida'
  ],
  labor: [
    'Suficiente',
    'Limitada',
    'Muy limitada'
  ],
  irrigation: [
    'Permanente',
    'Estacional',
    'Sin riego'
  ],
  investment: [
    'Baja',
    'Media',
    'Alta'
  ],
  primaryGoal: [
    'Maximizar productividad',
    'Optimizar recursos',
    'Proteger el suelo',
    'Mejorar rentabilidad'
  ],
  planningHorizon: [
    '3 años',
    '4 años',
    '5 años'
  ],
  reviewFrequency: [
    'Anual',
    'Por ciclo agrícola'
  ]
};

function SelectField({
  label,
  name,
  value,
  onChange,
  choices,
  placeholder = 'Selecciona una opción',
  required = true
}) {
  return (
    <label className="question-field">
      <span>
        {label}
        {required && <b className="required-mark"> *</b>}
      </span>

      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
      >
        <option value="">{placeholder}</option>

        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ icon: Icon, number, title, description, children }) {
  return (
    <section className="question-section">
      <div className="question-section-heading">
        <div className="section-icon">
          <Icon size={21} />
        </div>

        <div>
          <span className="section-number">
            SECCIÓN {number}
          </span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <div className="question-grid">
        {children}
      </div>
    </section>
  );
}

export default function Questionnaire({ selectedState = 'México' }) {
  const [form, setForm] = useState(initialData);
  const [submitted, setSubmitted] = useState(false);

  const [error, setError] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value
    }));

    setError('');
    setSubmitted(false);
  };

  const handleGoalChange = (goal) => {
    setForm((previous) => {
      const selected = previous.secondaryGoals;

      if (selected.includes(goal)) {
        return {
          ...previous,
          secondaryGoals: selected.filter(
            (item) => item !== goal
          )
        };
      }

      if (selected.length >= 2) {
        return previous;
      }

      return {
        ...previous,
        secondaryGoals: [...selected, goal]
      };
    });

    setSubmitted(false);
  };

  const handleTopicChange = (topic) => {
    setForm((previous) => ({
      ...previous,
      consultationTopics: previous.consultationTopics.includes(topic)
        ? previous.consultationTopics.filter((item) => item !== topic)
        : [...previous.consultationTopics, topic]
    }));
    setSubmitted(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const hasLatitude = form.latitude !== '';
    const hasLongitude = form.longitude !== '';
    const latitude = hasLatitude ? Number(form.latitude) : null;
    const longitude = hasLongitude ? Number(form.longitude) : null;
    const area = Number(form.area);

    if (hasLatitude !== hasLongitude) {
      setError('Captura latitud y longitud juntas, o deja ambas vacías para consultar por estado.');
      return;
    }

    if (hasLatitude && (latitude < 14 || latitude > 33.5 || longitude < -119 || longitude > -86)) {
      setError(
        'Las coordenadas deben encontrarse dentro de la extensión de consulta configurada para México.'
      );
      return;
    }

    if (area <= 0 || !Number.isFinite(area)) {
      setError('La superficie debe ser mayor que cero.');
      return;
    }

    if (
      form.targetCrop1 &&
      form.targetCrop2 &&
      form.targetCrop1 === form.targetCrop2
    ) {
      setError('Selecciona dos cultivos alternativos diferentes.');
      return;
    }

    const questionnaireData = {
      ...form,
      latitude,
      longitude,
      state: selectedState,
      area,
      capturedAt: new Date().toISOString(),
      dataOrigin: 'Farmer declared information',
      status: 'pending_analysis'
    };

    console.log(
      'Datos del cuestionario:',
      questionnaireData
    );

    setSubmitted(true);
    setError('');
  };

  return (
    <div className="questionnaire-page">

      <div className="questionnaire-header">
        <div>
          <span className="questionnaire-eyebrow">
            CONFIGURACIÓN DEL ANÁLISIS
          </span>

          <p>
            Proporciona información de tu parcela para
            evaluar alternativas de rotación y manejo
            de recursos agrícolas.
          </p>
        </div>

        <div className="questionnaire-icon">
          <ClipboardList size={29} />
        </div>
      </div>

      <div className="questionnaire-progress">
        <div>
          <span>Información de la parcela</span>
          <strong>6 secciones</strong>
        </div>

        <div className="progress-track">
          <div className="progress-fill"></div>
        </div>

        <small>
          Completa los campos obligatorios para continuar.
        </small>
      </div>

      <form onSubmit={handleSubmit}>

        <Section
          number="00"
          icon={ClipboardList}
          title="¿Qué quieres saber?"
          description="Elige los temas que te interesan para adaptar tu consulta y las recomendaciones."
        >
          <div className="question-field goals-field topic-field">
            <span>Me gustaría recibir orientación sobre</span>
            <div className="goal-options topic-options">
              {[
                'Cuándo sembrar',
                'Cuándo y cuánto regar',
                'Lluvia y clima',
                'Salud del suelo',
                'Elegir un cultivo',
                'Cuidar la cosecha'
              ].map((topic) => (
                <label key={topic} className="goal-option">
                  <input
                    type="checkbox"
                    checked={form.consultationTopics.includes(topic)}
                    onChange={() => handleTopicChange(topic)}
                  />
                  {topic}
                </label>
              ))}
            </div>
          </div>
        </Section>

        <Section
          number="01"
          icon={MapPin}
          title="Ubicación y parcela"
          description="Identifica el área geográfica y las condiciones generales de producción."
        >

          <label className="question-field">
            <span>Estado de referencia</span>
            <input type="text" value={selectedState} readOnly aria-label="Estado seleccionado en la barra superior" />
          </label>

          <label className="question-field">
            <span>Latitud de la parcela (°) · opcional</span>
            <input
              type="number"
              name="latitude"
              min="14"
              max="33.5"
              step="any"
              value={form.latitude}
              onChange={handleChange}
              placeholder="Ej. 19.0433"
            />
          </label>

          <label className="question-field">
            <span>Longitud de la parcela (°) · opcional</span>
            <input
              type="number"
              name="longitude"
              min="-119"
              max="-86"
              step="any"
              value={form.longitude}
              onChange={handleChange}
              placeholder="Ej. -98.2019"
            />
          </label>

          <label className="question-field">
            <span>Superficie (hectáreas) *</span>
            <input
              type="number"
              name="area"
              min="0.01"
              step="0.01"
              value={form.area}
              onChange={handleChange}
              placeholder="Ej. 2.5"
              required
            />
          </label>

          <SelectField
            label="Sistema de producción"
            name="productionSystem"
            value={form.productionSystem}
            onChange={handleChange}
            choices={options.productionSystem}
          />

          <SelectField
            label="Disponibilidad de agua"
            name="waterAvailability"
            value={form.waterAvailability}
            onChange={handleChange}
            choices={options.waterAvailability}
          />

        </Section>

        <Section
          number="02"
          icon={Mountain}
          title="Características del suelo"
          description="Registra las condiciones conocidas del suelo y sus posibles riesgos."
        >

          {[
            ['soilTexture', 'Textura del suelo'],
            ['drainage', 'Drenaje'],
            ['slope', 'Pendiente'],
            ['erosion', 'Evidencia de erosión'],
            ['soilCover', 'Cobertura vegetal'],
            ['organicMatter', 'Materia orgánica']
          ].map(([name, label]) => (
            <SelectField
              key={name}
              label={label}
              name={name}
              value={form[name]}
              onChange={handleChange}
              choices={options[name]}
            />
          ))}

        </Section>

        <Section
          number="03"
          icon={Sprout}
          title="Historial y selección de cultivos"
          description="Indica los cultivos anteriores y las alternativas que deseas comparar."
        >

          {[
            ['previousCrop', 'Cultivo de la última temporada'],
            ['secondPreviousCrop', 'Cultivo de hace dos temporadas'],
            ['currentCrop', 'Cultivo actualmente establecido'],
            ['targetCrop1', 'Primera alternativa de cultivo'],
            ['targetCrop2', 'Segunda alternativa de cultivo']
          ].map(([name, label]) => (
            <SelectField
              key={name}
              label={label}
              name={name}
              value={form[name]}
              onChange={handleChange}
              choices={
                name === 'currentCrop'
                  ? ['Sin cultivo', ...crops]
                  : crops
              }
              required={
                name !== 'targetCrop1' &&
                name !== 'targetCrop2'
              }
              placeholder={
                name.includes('targetCrop')
                  ? 'Alternativa opcional'
                  : 'Selecciona un cultivo'
              }
            />
          ))}

        </Section>

        <Section
          number="04"
          icon={Tractor}
          title="Recursos disponibles"
          description="Considera la capacidad operativa y económica de la parcela."
        >

          {[
            ['machinery', 'Disponibilidad de maquinaria'],
            ['fertilizers', 'Disponibilidad de fertilizantes'],
            ['labor', 'Disponibilidad de mano de obra'],
            ['irrigation', 'Acceso a infraestructura de riego'],
            ['investment', 'Capacidad de inversión']
          ].map(([name, label]) => (
            <SelectField
              key={name}
              label={label}
              name={name}
              value={form[name]}
              onChange={handleChange}
              choices={options[name]}
            />
          ))}

        </Section>

        <Section
          number="05"
          icon={Target}
          title="Objetivos del agricultor"
          description="Define qué resultados deben tener mayor importancia."
        >

          <SelectField
            label="Objetivo principal"
            name="primaryGoal"
            value={form.primaryGoal}
            onChange={handleChange}
            choices={options.primaryGoal}
          />

          <div className="question-field goals-field">
            <span>Objetivos secundarios (máximo 2)</span>

            <div className="goal-options">
              {options.primaryGoal
                .filter((goal) => goal !== form.primaryGoal)
                .map((goal) => (
                  <label key={goal} className="goal-option">
                    <input
                      type="checkbox"
                      checked={form.secondaryGoals.includes(goal)}
                      onChange={() => handleGoalChange(goal)}
                      disabled={
                        form.secondaryGoals.length >= 2 &&
                        !form.secondaryGoals.includes(goal)
                      }
                    />
                    {goal}
                  </label>
                ))}
            </div>
          </div>

        </Section>

        <Section
          number="06"
          icon={CalendarDays}
          title="Planificación"
          description="Establece el horizonte de evaluación de las rotaciones."
        >

          <SelectField
            label="Duración de la rotación"
            name="planningHorizon"
            value={form.planningHorizon}
            onChange={handleChange}
            choices={options.planningHorizon}
          />

          <SelectField
            label="Frecuencia de revisión"
            name="reviewFrequency"
            value={form.reviewFrequency}
            onChange={handleChange}
            choices={options.reviewFrequency}
          />

        </Section>

        {error && (
          <div className="question-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {submitted && (
          <div className="question-success">
            <CheckCircle2 size={20} />
            <div>
              <strong>Cuestionario validado</strong>
              <p>
                Los datos fueron preparados correctamente
                para la siguiente etapa. Todavía no se han
                generado recomendaciones.
              </p>
            </div>
          </div>
        )}

        <div className="questionnaire-footer">
          <p>
            * Campos obligatorios. Los datos desconocidos
            deberán identificarse antes del análisis.
          </p>

          <button type="submit" className="question-submit">
            Validar información
            <ChevronRight size={18} />
          </button>
        </div>

      </form>

    </div>
  );
}
