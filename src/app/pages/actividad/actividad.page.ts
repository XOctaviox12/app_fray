import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService, ArchivoSubido } from '../../services/cloudinary.service';
import { Router } from '@angular/router';

// ─── Tipos ─────────────────────────────────────────────────────────────

export interface EntregaItem {
  id: number;
  alumno_id: number;
  alumno_nombre: string;
  archivo_url: string | null;
  respuesta_texto: string;
  calificacion: number | null;
  feedback: string;
  entregada_en: string;
}

export interface ActividadItem {
  id: number;
  titulo: string;
  instrucciones: string;
  tipo: string;
  fecha_entrega: string;
  valor_total: number;
  url_interactiva: string | null;
  asignatura: string;
  asignatura_id: number;
  grupo: string;
  grupo_id: number;
  docente: string;
  publicada: boolean;
  vencida: boolean;
  totalEntregas?: number;
  totalAlumnos?: number;
  entregas?: EntregaItem[];           // cargadas al expandir (docente)
  entrega: {                          // la propia del alumno
    id?: number;
    calificacion: number | null;
    feedback: string;
    entregada_en: string;
    archivo_url: string | null;
    respuesta_texto: string;
  } | null;
}

type TipoPregunta = 'MULTIPLE' | 'VF' | 'ABIERTA';

interface OpcionForm {
  id?: number;
  texto: string;
  es_correcta: boolean;
}
interface PreguntaForm {
  id?: number;
  tipo: TipoPregunta;
  texto: string;
  puntos: number;
  opciones: OpcionForm[];
}
interface PreguntaAlumno {
  id: number;
  tipo: TipoPregunta;
  texto: string;
  opciones: { id: number; texto: string }[];
}
interface Materia { id: number; nombre: string; }
interface Grupo   { id: number; nombre: string; grado: number; aula: string; }
interface ArchivoEnProgreso {
  file: File; progreso: number; subiendo: boolean; error: boolean; resultado?: ArchivoSubido;
}
// Combo materia+grupo del docente, ya filtrado por período activo (NON/PAR).
// Reemplaza las consultas directas a academic_asignatura_docentes,
// academic_asignatura_grupos, users_docentegrupo y academic_grupo del
// formulario de creación/edición.
interface ComboMateriaGrupo {
  asignatura_id: number;
  asignatura_nombre: string;
  grupo_id: number;
  grupo_nombre: string;
  grado: number;
  aula: string;
}

// Filtros por rol
type FiltroAlumno  = 'TODAS' | 'PENDIENTE' | 'ENTREGADA' | 'CALIFICADA';
type FiltroDocente = 'TODAS' | 'ACTIVAS' | 'VENCIDAS' | 'BORRADORES';
type FiltroTutor   = 'TODAS' | 'PENDIENTE' | 'ENTREGADA' | 'CALIFICADA';

// Tipos de ACTIVIDAD (nivel superior). Igual que en Django: solo estos 3.
// 'ABIERTA' NO es un tipo de actividad — es uno de los tipos de PREGUNTA
// que se pueden combinar libremente dentro de una actividad CUESTIONARIO
// (junto con MULTIPLE y VF), tal como lo hace crear_actividad() en Django.
const TIPOS_ACTIVIDAD = [
  { value: 'CUESTIONARIO', label: 'Cuestionario',         icon: 'list-outline' },
  { value: 'ARCHIVO',      label: 'Subir archivo',         icon: 'cloud-upload-outline' },
  { value: 'INTERACTIVA',  label: 'Ejercicio interactivo', icon: 'game-controller-outline' },
];

const ETIQUETAS_PREGUNTA: Record<TipoPregunta, string> = {
  MULTIPLE: 'Opción múltiple',
  VF:       'Verdadero / Falso',
  ABIERTA:  'Respuesta corta',
};

const MAX_MB  = 20;
const EXT_BAN = ['exe','bat','sh','cmd','msi'];

// ─────────────────────────────────────────────────────────────────────

@Component({
  standalone: true,
  selector: 'app-actividad',
  templateUrl: './actividad.page.html',
  styleUrls: ['./actividad.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule, RouterModule],
})
export class ActividadPage implements OnInit {



  cargando = true;
  error    = '';

  // ── Cuestionario — editor docente ────────────────────────────
  preguntasForm: PreguntaForm[] = [];

  // ── Cuestionario — responder alumno ──────────────────────────
  preguntasAlumno: PreguntaAlumno[] = [];
  respuestasSeleccionadas: Record<number, number> = {}; // pregunta_id -> opcion_id (MULTIPLE/VF)
  respuestasAbiertas: Record<number, string> = {};       // pregunta_id -> texto (ABIERTA)
  cargandoPreguntas = false;

  actividades: ActividadItem[] = [];

  // ── Filtros separados por rol ────────────────────────────────
  filtroAlumno:  FiltroAlumno  = 'TODAS';
  filtroDocente: FiltroDocente = 'TODAS';
  filtroTutor:   FiltroTutor   = 'TODAS';

  // ── Panel de entregas (docente) ──────────────────────────────
  actividadExpandida: ActividadItem | null = null;
  cargandoEntregas = false;

  // ── Panel calificación (docente) ─────────────────────────────
  entregaCalificando: EntregaItem | null = null;
  notaNueva    = '';
  feedbackNuevo = '';
  guardandoCal = false;

  // ── Panel entrega alumno ─────────────────────────────────────
  actividadEntregando: ActividadItem | null = null;
  archivoEntrega: File | null = null;
  subiendoEntrega = false;
  progresoEntrega = 0;
  guardandoEntrega = false;

  // ── Formulario docente ───────────────────────────────────────
  showForm   = false;
  editingId: number | null = null;
  guardando  = false;
  isDragging = false;

  tiposActividad = TIPOS_ACTIVIDAD;

  newAct = {
    titulo: '', instrucciones: '', tipo: 'CUESTIONARIO' as string,
    fecha: '', hora: '23:59', valor_total: 10,
    url_interactiva: '', publicada: true,
    materiaId: null as number | null,
    grupoId:   null as number | null,
  };

  archivosEnProgreso: ArchivoEnProgreso[] = [];
  archivosExistentes: ArchivoSubido[]     = [];

  materias:        Materia[] = [];
  gruposDeMateria: Grupo[]   = [];
  // Cache del combo materia+grupo del docente (período activo), cargado una
  // sola vez en cargarMaterias() y filtrado en memoria por onMateriaChange().
  combosMateriaGrupo: ComboMateriaGrupo[] = [];
  cargandoOpts = false;
  errorOpts: string | null = null;

  readonly fechaMinima = new Date().toISOString().split('T')[0];

  get esAlumno():  boolean { return this.sesion.esAlumno(); }
  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esTutor():   boolean { return this.sesion.esTutor(); }

  constructor(
    private sesion:     SesionService,
    private cloudinary: CloudinaryService,
    private alertCtrl:  AlertController,
    private toastCtrl:  ToastController,
    private router: Router,
  ) {}

  ngOnInit() {
    if (this.esDocente) this.cargarMaterias();
    this.cargarActividades();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PREGUNTAS — editor docente
  //  Se pueden combinar libremente MULTIPLE, VF y ABIERTA dentro
  //  de una misma actividad CUESTIONARIO, igual que en Django.
  // ═══════════════════════════════════════════════════════════════════

  agregarPregunta(tipo: TipoPregunta) {
    let opciones: OpcionForm[] = [];
    if (tipo === 'MULTIPLE') {
      opciones = [
        { texto: '', es_correcta: true },
        { texto: '', es_correcta: false },
      ];
    } else if (tipo === 'VF') {
      opciones = [
        { texto: 'Verdadero', es_correcta: true },
        { texto: 'Falso',     es_correcta: false },
      ];
    }
    // 'ABIERTA' no lleva opciones — el alumno responde con texto libre.
    this.preguntasForm.push({ tipo, texto: '', puntos: 1, opciones });
  }
  quitarPregunta(i: number) { this.preguntasForm.splice(i, 1); }

  agregarOpcion(pi: number) { this.preguntasForm[pi].opciones.push({ texto: '', es_correcta: false }); }
  quitarOpcion(pi: number, oi: number) { this.preguntasForm[pi].opciones.splice(oi, 1); }

  marcarCorrecta(pi: number, oi: number) {
    this.preguntasForm[pi].opciones.forEach((o, idx) => o.es_correcta = idx === oi);
  }

  etiquetaTipoPregunta(tipo: string): string {
    return ETIQUETAS_PREGUNTA[tipo as TipoPregunta] || tipo;
  }

  // Carga preguntas/opciones existentes al editar una actividad CUESTIONARIO
  private async cargarPreguntasParaEditar(actividadId: number) {
    // Antes: "p_actividad_id:" se mandaba vacío — nunca cargaba las
    // preguntas de la actividad que se estaba editando.
    const { data: pregs } = await this.sesion.supabase.rpc('leer_preguntas_actividad', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_actividad_id: actividadId });

    this.preguntasForm = [];
    for (const p of pregs || []) {
      let opciones: OpcionForm[] = [];
      if (p.tipo === 'MULTIPLE' || p.tipo === 'VF') {
        // academic_opcionrespuesta ya no es legible directo (RLS) — se usa la RPC
        // opciones_docente, que valida que el que llama sea el docente dueño.
        const token = this.sesion.usuario?.token;
        const { data: ops, error: errOps } = token
          ? await this.sesion.supabase.rpc('opciones_docente', { p_token: token, p_pregunta_id: p.id })
          : { data: [] as any[], error: null };
        if (errOps) console.error('Error opciones_docente:', errOps.message);
        opciones = (ops || []).map((o: any) => ({ id: o.id, texto: o.texto, es_correcta: o.es_correcta }));
      }
      this.preguntasForm.push({
        id: p.id, tipo: p.tipo, texto: p.texto, puntos: parseFloat(p.puntos), opciones,
      });
    }
  }

  // Guarda preguntas y opciones: borra las viejas y recrea (más simple y confiable que un upsert parcial).
  // Cada pregunta conserva su propio 'tipo' (MULTIPLE/VF/ABIERTA), permitiendo mezclarlas
  // dentro de la misma actividad — igual que la vista crear_actividad() en Django.
  private async guardarPreguntasOpciones(actividadId: number) {
    // Antes: "const { data:  }" — variable destructurada sin nombre (no
    // compila) y "p_actividad_id:" vacío. Se corrige a "viejas" +
    // actividadId, que es lo que usa la línea siguiente.
    const { data: viejas } = await this.sesion.supabase.rpc('leer_preguntas_actividad', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_actividad_id: actividadId });
    const idsViejas = (viejas || []).map((p: any) => p.id);

    if (idsViejas.length) {
      const tokenDoc = this.sesion.usuario?.token;
      await this.sesion.supabase.rpc('limpiar_respuestas_por_preguntas', { p_token: tokenDoc, p_pregunta_ids: idsViejas });
      // academic_opcionrespuesta ya no acepta DELETE directo (RLS) — se limpia vía
      // guardar_opciones_pregunta con un arreglo vacío (borra sin volver a insertar).
      if (tokenDoc) {
        for (const idViejo of idsViejas) {
          const { error: errClear } = await this.sesion.supabase.rpc('guardar_opciones_pregunta', {
            p_token: tokenDoc, p_pregunta_id: idViejo, p_opciones: [],
          });
          if (errClear) console.error('Error limpiando opciones de', idViejo, errClear.message);
        }
      }
      // Antes: "p_actividad_id:" vacío — nunca borraba las preguntas
      // viejas antes de recrearlas.
      await this.sesion.supabase.rpc('eliminar_preguntas_por_actividad', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_actividad_id: actividadId });
    }

    for (let i = 0; i < this.preguntasForm.length; i++) {
      const p = this.preguntasForm[i];
      if (!p.texto.trim()) continue;

      // Antes: "p_actividad_id: ," — coma sin valor, no compila.
      const { data: _pregData, error: errP } = await this.sesion.supabase.rpc('agregar_pregunta_actividad', {
          p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token),
          p_actividad_id: actividadId,
          p_texto: p.texto.trim(),
          p_tipo: p.tipo,
          p_orden: i,
          p_puntos: p.puntos || 0
        });
        const pregInsertada = _pregData ? _pregData[0] : null;
      if (errP) throw errP;

      if (p.tipo === 'MULTIPLE' || p.tipo === 'VF') {
        const opcionesValidas = p.opciones.filter(o => o.texto.trim());
        if (opcionesValidas.length) {
          // academic_opcionrespuesta ya no acepta INSERT directo (RLS) — se usa
          // guardar_opciones_pregunta, que valida que el que llama sea el docente dueño.
          const tokenDoc = this.sesion.usuario?.token;
          const { error: errO } = tokenDoc
            ? await this.sesion.supabase.rpc('guardar_opciones_pregunta', {
                p_token: tokenDoc,
                p_pregunta_id: (pregInsertada as any).id,
                p_opciones: opcionesValidas.map(o => ({ texto: o.texto.trim(), es_correcta: o.es_correcta })),
              })
            : { error: { message: 'Sin token de docente' } as any };
          if (errO) throw errO;
        }
      }
      // 'ABIERTA': sin opciones, no se autocalifica — igual que en Django.
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CARGA PRINCIPAL
  // ═══════════════════════════════════════════════════════════════════

  async cargarActividades() {
    this.cargando = true; this.error = '';
    try {
      if (this.esAlumno)       await this.cargarParaAlumno();
      else if (this.esDocente) await this.cargarParaDocente();
      else if (this.esTutor)   await this.cargarParaTutor();
    } catch (e: any) { this.error = 'Error al cargar: ' + e.message; }
    this.cargando = false;
  }

  // ── Alumno ────────────────────────────────────────────────────
async cargarParaAlumno() {

  // ============================================================
  // 1. SESIÓN DEL ALUMNO
  // ============================================================

  const alumnoId = this.sesion.usuario?.id;

  if (!alumnoId) {
    console.warn('⚠️ cargarParaAlumno: no existe alumnoId');
    return;
  }

  const token =
    this.sesion.usuario?.token ||
    this.sesion.tutor?.token;

  if (!token) {
    console.warn('⚠️ cargarParaAlumno: no existe token');
    return;
  }

  console.log('══════════════════════════════════════');
  console.log('🎓 CARGANDO ACTIVIDADES DEL ALUMNO');
  console.log('👤 alumnoId:', alumnoId);
  console.log('🔐 token disponible:', !!token);
  console.log('══════════════════════════════════════');


  // ============================================================
  // 2. OBTENER GRUPO DEL ALUMNO
  // ============================================================

  const {
    data: usu,
    error: errUsu
  } = await this.sesion.supabase
    .rpc('perfil_basico_usuario', {
      p_token: token,
      p_user_id: alumnoId
    })
    .single<{ alumno_grupo_id: number }>();

  if (errUsu) {
    console.error(
      '❌ Error perfil_basico_usuario:',
      errUsu
    );
    throw errUsu;
  }

  const grupoId = usu?.alumno_grupo_id;

  console.log(
    '👥 grupoId obtenido:',
    grupoId
  );

  if (!grupoId) {
    console.warn(
      '⚠️ El alumno no tiene grupo asignado'
    );

    this.actividades = [];
    return;
  }


  // ============================================================
  // 3. LEER ACTIVIDADES DEL GRUPO
  // ============================================================

const {
  data: actsRaw,
  error: errActs
} = await this.sesion.supabase
  .rpc('leer_actividades_grupo', {
    p_token: token,
    p_grupo_id: grupoId
  });

console.log(
  '📚 leer_actividades_grupo - respuesta RPC:',
  actsRaw
);

console.log(
  '📚 cantidad recibida:',
  actsRaw?.length || 0
);

console.log(
  '📚 primera actividad RAW:',
  actsRaw?.[0]
);

if (errActs) {
  console.error(
    '❌ Error leer_actividades_grupo:',
    errActs.message
  );

  throw errActs;
}

// ============================================================
// NORMALIZAR RESPUESTA DE LA RPC
// La RPC devuelve columnas out_*
// El resto del código utiliza nombres normales.
// ============================================================

const acts = (actsRaw || []).map((a: any) => ({
  id: a.out_id,
  titulo: a.out_titulo,
  instrucciones: a.out_instrucciones,
  tipo: a.out_tipo,
  fecha_entrega: a.out_fecha_entrega,
  valor_total: a.out_valor_total,
  url_interactiva: a.out_url_interactiva,
  asignatura_id: a.out_asignatura_id,
  grupo_id: a.out_grupo_id
}));

console.log(
  '✅ ACTIVIDADES NORMALIZADAS:',
  acts
);

console.log(
  '✅ IDs DE ACTIVIDADES:',
  acts.map((a: any) => a.id)
);


  // ============================================================
  // 4. NOMBRES DE ASIGNATURAS
  // ============================================================

  const asiIds = [
    ...new Set(
      (acts || [])
        .map((a: any) => a.asignatura_id)
        .filter(Boolean)
    )
  ];

  let asiMap: Record<number, string> = {};

  if (asiIds.length) {

    const {
      data: asis,
      error: errAsis
    } = await this.sesion.supabase
      .rpc('nombres_asignaturas', {
        p_token: token,
        p_ids: asiIds
      });

    if (errAsis) {
      console.error(
        '❌ Error nombres_asignaturas:',
        errAsis.message
      );
    }

    (asis || []).forEach((a: any) => {
      asiMap[a.id] = a.nombre;
    });
  }


  // ============================================================
  // 5. ENTREGAS PROPIAS DEL ALUMNO
  // ============================================================

  const actIds = (acts || [])
    .map((a: any) => a.id)
    .filter(Boolean);

  console.log(
    '📝 IDs de actividades:',
    actIds
  );

  let entregas: any[] = [];

  if (actIds.length) {

    const {
      data,
      error: errEnt
    } = await this.sesion.supabase
      .rpc('entregas_propias_de_actividades', {
        p_token: token,
        p_actividad_ids: actIds
      });

    if (errEnt) {
      console.error(
        '❌ Error entregas_propias_de_actividades:',
        errEnt.message
      );

      throw errEnt;
    }

    entregas = data || [];

    console.log(
      '📤 Entregas propias:',
      entregas
    );
  }


  // ============================================================
  // 6. MAPA DE ENTREGAS
  // ============================================================

  const entMap: Record<number, any> = {};

  entregas.forEach((e: any) => {

    if (e?.actividad_id) {
      entMap[e.actividad_id] = e;
    }

  });


  // ============================================================
  // 7. RESPUESTAS DE TEXTO DEL ALUMNO
  // ============================================================

  let respMap: Record<number, string> = {};

  if (actIds.length) {

    const entregaIds = Object.values(entMap)
      .map((e: any) => e?.id)
      .filter(Boolean);

    console.log(
      '🗒️ IDs de entregas:',
      entregaIds
    );

    if (entregaIds.length) {

      const {
        data: resps,
        error: errResps
      } = await this.sesion.supabase
        .rpc('respuestas_de_entregas_multi', {
          p_token: token,
          p_entrega_ids: entregaIds
        });

      if (errResps) {
        console.error(
          '❌ Error respuestas_de_entregas_multi:',
          errResps.message
        );
      }

      const entIdToActId: Record<number, number> = {};

      Object.entries(entMap).forEach(
        ([actId, ent]: [string, any]) => {

          if (ent?.id) {
            entIdToActId[ent.id] =
              parseInt(actId, 10);
          }

        }
      );

      (resps || []).forEach((r: any) => {

        const actId =
          entIdToActId[r.entrega_id];

        if (
          actId &&
          !respMap[actId]
        ) {
          respMap[actId] =
            r.texto || '';
        }

      });
    }
  }


  // ============================================================
  // 8. CONSTRUIR ACTIVIDADES PARA LA VISTA
  // ============================================================

  const ahora = new Date();

  this.actividades = (acts || []).map(
    (a: any) => {

      const ent =
        entMap[a.id];

      return {

        id: a.id,

        titulo:
          a.titulo,

        instrucciones:
          a.instrucciones || '',

        tipo:
          a.tipo,

        fecha_entrega:
          a.fecha_entrega,

        valor_total:
          parseFloat(a.valor_total),

        url_interactiva:
          a.url_interactiva,

        asignatura:
          asiMap[a.asignatura_id] || '—',

        asignatura_id:
          a.asignatura_id,

        grupo: '',

        grupo_id:
          a.grupo_id,

        docente: '',

        publicada: true,

        vencida:
          new Date(a.fecha_entrega) < ahora,

        entrega: ent
          ? {

              id:
                ent.id,

              calificacion:
                ent.calificacion != null
                  ? parseFloat(ent.calificacion)
                  : null,

              feedback:
                ent.feedback || '',

              entregada_en:
                ent.entregada_en,

              archivo_url:
                ent.archivo || null,

              respuesta_texto:
                respMap[a.id] || ''

            }
          : null

      };

    }
  );


  // ============================================================
  // 9. RESULTADO FINAL
  // ============================================================

  console.log(
    '══════════════════════════════════════'
  );

  console.log(
    '✅ ACTIVIDADES FINALES DEL ALUMNO:',
    this.actividades
  );

  console.log(
    '✅ TOTAL ACTIVIDADES:',
    this.actividades.length
  );

  console.log(
    '══════════════════════════════════════'
  );
}

  // ── Docente ───────────────────────────────────────────────────
  async cargarParaDocente() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    // Antes: "p_docente_id:" vacío — nunca traía las actividades del docente.
    const { data: acts, error } = await this.sesion.supabase
      .rpc('leer_actividades_docente', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_docente_id: docenteId });
    if (error) throw error;

    const asiIds = [...new Set((acts || []).map((a: any) => a.asignatura_id))];
    const gruIds = [...new Set((acts || []).map((a: any) => a.grupo_id))] as number[];
    let asiMap: Record<number, string> = {};
    let gruMap: Record<number, string> = {};
    const tokenDoc0 = this.sesion.usuario?.token;

    if (asiIds.length) {
      // Antes: SELECT directo a academic_asignatura — bloqueado por REVOKE (NON/PAR).
      const { data: asis, error: errAsis } = await this.sesion.supabase
        .rpc('nombres_asignaturas', { p_token: tokenDoc0, p_ids: asiIds });
      if (errAsis) console.error('Error nombres_asignaturas:', errAsis.message);
      (asis || []).forEach((a: any) => { asiMap[a.id] = a.nombre; });
    }
    if (gruIds.length) {
      // Antes: SELECT directo a academic_grupo — bloqueado por REVOKE (NON/PAR).
// nombres_grupos — aparece en cargarParaDocente
const { data: grus, error: errGrus } = await this.sesion.supabase
  .rpc('nombres_grupos', { p_token: tokenDoc0, p_ids: gruIds });
      if (errGrus) console.error('Error nombres_grupos:', errGrus.message);
      (grus || []).forEach((g: any) => { gruMap[g.id] = `${g.grado}° ${g.nombre}`; });
    }

    // Conteo de entregas y alumnos
    let conteoEnt: Record<number, number> = {};
    let alumnosPorGrupo: Record<number, number> = {};

    if ((acts || []).length) {
      const ids = (acts || []).map((a: any) => a.id);
      // Conteo de entregas por actividad (vía RPC segura: solo cuenta
      // actividades donde el que llama es el docente dueño — reemplaza el
      // .from() directo)
      const { data: conteos, error: errConteos } = await this.sesion.supabase
        .rpc('contar_entregas_de_actividades', { p_token: this.sesion.usuario?.token, p_actividad_ids: ids });
      if (errConteos) console.error('Error contar_entregas_de_actividades:', errConteos.message);
      (conteos || []).forEach((c: any) => { conteoEnt[c.actividad_id] = c.total; });

      if (gruIds.length) {
        const token2 = this.sesion.usuario?.token || this.sesion.tutor?.token;
        const { data: alumnos } = token2
          ? await this.sesion.supabase.rpc('alumnos_por_grupos', { p_token: token2, p_grupo_ids: gruIds })
          : { data: [] as any[] };
        (alumnos || []).forEach((a: any) => {
          alumnosPorGrupo[a.alumno_grupo_id] = (alumnosPorGrupo[a.alumno_grupo_id] || 0) + 1;
        });
      }
    }

    const ahora = new Date();
    this.actividades = (acts || []).map((a: any) => ({
      id: a.id, titulo: a.titulo, instrucciones: a.instrucciones || '',
      tipo: a.tipo, fecha_entrega: a.fecha_entrega,
      valor_total: parseFloat(a.valor_total),
      url_interactiva: a.url_interactiva,
      asignatura: asiMap[a.asignatura_id] || '—', asignatura_id: a.asignatura_id,
      grupo: gruMap[a.grupo_id] || '—', grupo_id: a.grupo_id,
      docente: '', publicada: a.publicada,
      vencida: new Date(a.fecha_entrega) < ahora,
      totalEntregas: conteoEnt[a.id] || 0,
      totalAlumnos:  alumnosPorGrupo[a.grupo_id] || 0,
      entregas: undefined, entrega: null,
    }));
  }

  // ── Tutor ─────────────────────────────────────────────────────
  async cargarParaTutor() {
    const alumnoId = this.sesion.tutor?.alumno_id;
    if (!alumnoId) return;

    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    if (!token) return;
    const { data: usu } = await this.sesion.supabase
      .rpc('perfil_basico_usuario', { p_token: token, p_user_id: alumnoId })
      .single<{ alumno_grupo_id: number; first_name: string; last_name: string }>();
    const grupoId = usu?.alumno_grupo_id;
    if (!grupoId) return;

    // Antes: "p_grupo_id:" vacío — nunca traía las actividades del grupo.
    const { data: acts, error } = await this.sesion.supabase
      .rpc('leer_actividades_grupo', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_grupo_id: grupoId });
    if (error) throw error;

    const asiIds = [...new Set((acts || []).map((a: any) => a.asignatura_id))];
    let asiMap: Record<number, string> = {};
    if (asiIds.length) {
      // Antes: SELECT directo a academic_asignatura — bloqueado por REVOKE (NON/PAR).
      const { data: asis, error: errAsis } = await this.sesion.supabase
        .rpc('nombres_asignaturas', { p_token: token, p_ids: asiIds });
      if (errAsis) console.error('Error nombres_asignaturas:', errAsis.message);
      (asis || []).forEach((a: any) => { asiMap[a.id] = a.nombre; });
    }

    // Entregas del alumno vía sesión de tutor (RPC segura: valida que el
    // tutor sea dueño del alumno — reemplaza el .from() directo)
    const actIds = (acts || []).map((a: any) => a.id);
    let entregas: any[] = [];
    if (actIds.length) {
      const { data, error: errEnt } = await this.sesion.supabase
        .rpc('entregas_de_actividad_tutor', { p_token: this.sesion.tutor?.token, p_actividad_ids: actIds });
      if (errEnt) throw errEnt;
      entregas = data || [];
    }
    const entMap: Record<number, any> = {};
    entregas.forEach((e: any) => { entMap[e.actividad_id] = e; });

    const ahora = new Date();
    this.actividades = (acts || []).map((a: any) => {
      const ent = entMap[a.id];
      return {
        id: a.id, titulo: a.titulo, instrucciones: a.instrucciones || '',
        tipo: a.tipo, fecha_entrega: a.fecha_entrega,
        valor_total: parseFloat(a.valor_total),
        url_interactiva: a.url_interactiva,
        asignatura: asiMap[a.asignatura_id] || '—', asignatura_id: a.asignatura_id,
        grupo: '', grupo_id: a.grupo_id, docente: '', publicada: true,
        vencida: new Date(a.fecha_entrega) < ahora,
        entrega: ent ? {
          calificacion: ent.calificacion != null ? parseFloat(ent.calificacion) : null,
          feedback: ent.feedback || '', entregada_en: ent.entregada_en,
          archivo_url: ent.archivo || null, respuesta_texto: '',
        } : null,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ENTREGAR ACTIVIDAD (alumno)
  //  Solo ARCHIVO y CUESTIONARIO requieren entrega — INTERACTIVA
  //  se resuelve fuera de la app (enlace externo), igual que en Django.
  // ═══════════════════════════════════════════════════════════════════

  async abrirEntrega(act: ActividadItem) {
    this.actividadEntregando = act;
    this.archivoEntrega  = null;
    this.progresoEntrega = 0;
    this.preguntasAlumno = [];
    this.respuestasSeleccionadas = {};
    this.respuestasAbiertas = {};

    if (act.tipo === 'CUESTIONARIO') {
      this.cargandoPreguntas = true;
      try {
        // Antes: "p_actividad_id:" vacío — nunca traía las preguntas.
        const { data: pregs } = await this.sesion.supabase.rpc('leer_preguntas_actividad', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_actividad_id: act.id });

        // Antes: un SELECT directo a academic_opcionrespuesta_publica POR
        // CADA pregunta dentro del for — bloqueado por REVOKE (NON/PAR) y
        // además N llamadas en serie. Se agrupa en una sola llamada a
        // opciones_alumno_multi (misma RPC ya creada para
        // detalle-actividad.page.ts) y se reparte el resultado en memoria.
        const idsConOpciones = (pregs || [])
          .filter((p: any) => p.tipo === 'MULTIPLE' || p.tipo === 'VF')
          .map((p: any) => p.id);

        let opcionesPorPregunta: Record<number, { id: number; texto: string }[]> = {};
        if (idsConOpciones.length) {
          const tokenAlu = this.sesion.usuario?.token || this.sesion.tutor?.token;
          const { data: opsMulti, error: errOps } = await this.sesion.supabase
            .rpc('opciones_alumno_multi', { p_token: tokenAlu, p_pregunta_ids: idsConOpciones });
          if (errOps) console.error('Error opciones_alumno_multi:', errOps.message);
          (opsMulti || []).forEach((o: any) => {
            if (!opcionesPorPregunta[o.pregunta_id]) opcionesPorPregunta[o.pregunta_id] = [];
            // El alumno lee opciones vía la RPC pública — nunca ve es_correcta.
            opcionesPorPregunta[o.pregunta_id].push({ id: o.id, texto: o.texto });
          });
        }

        for (const p of pregs || []) {
          const opciones = (p.tipo === 'MULTIPLE' || p.tipo === 'VF') ? (opcionesPorPregunta[p.id] || []) : [];
          this.preguntasAlumno.push({ id: p.id, tipo: p.tipo, texto: p.texto, opciones });
        }

        // Cargar selección previa si ya había entregado
        if (act.entrega?.id) {
         const { data: resp } = await this.sesion.supabase
  .rpc('respuestas_de_entrega', { p_token: this.sesion.usuario?.token, p_entrega_id: act.entrega.id });
          (resp || []).forEach((r: any) => {
            if (r.opcion_id) this.respuestasSeleccionadas[r.pregunta_id] = r.opcion_id;
            else if (r.texto) this.respuestasAbiertas[r.pregunta_id] = r.texto;
          });
        }
      } finally { this.cargandoPreguntas = false; }
    }
  }

  cerrarEntrega() {
    this.actividadEntregando = null;
    this.archivoEntrega = null;
  }

  onArchivoEntregaChange(e: any) {
    const file: File = e.target.files[0];
    if (!file) return;
    if (file.size / 1048576 > MAX_MB) { this.toast(`El archivo supera ${MAX_MB}MB.`, 'warning'); return; }
    this.archivoEntrega = file;
    e.target.value = '';
  }

  async guardarEntrega() {
    const act = this.actividadEntregando;
    if (!act) return;

    if (act.tipo === 'ARCHIVO' && !this.archivoEntrega && !act.entrega?.archivo_url)
      { this.toast('Selecciona un archivo para entregar.', 'warning'); return; }
    if (act.tipo === 'CUESTIONARIO') {
      const faltan = this.preguntasAlumno.some(p =>
        (p.tipo === 'MULTIPLE' || p.tipo === 'VF')
          ? !this.respuestasSeleccionadas[p.id]
          : !this.respuestasAbiertas[p.id]?.trim()
      );
      if (faltan) { this.toast('Responde todas las preguntas.', 'warning'); return; }
    }

    this.guardandoEntrega = true;
    try {
      let archivoUrl = act.entrega?.archivo_url || null;

      if (this.archivoEntrega) {
        this.subiendoEntrega = true;
        const r = await this.cloudinary.subirArchivo(this.archivoEntrega, pct => { this.progresoEntrega = pct; });
        archivoUrl = r.url;
        this.subiendoEntrega = false;
      }

      // Crear/actualizar la entrega vía RPC segura (upsert atómico: valida
      // sesión y que sea el propio alumno — reemplaza el update/insert directo)
      const { data: entregaId, error: errEntrega } = await this.sesion.supabase
        .rpc('guardar_entrega_actividad', {
          p_token: this.sesion.usuario?.token,
          p_actividad_id: act.id,
          p_archivo: archivoUrl,
        });
      if (errEntrega) throw errEntrega;

      const ahoraIso = new Date().toISOString();

      // ── Cuestionario: guardar la respuesta de cada pregunta, sea MULTIPLE, VF o ABIERTA,
      //    combinadas dentro de la misma entrega — igual que hace Django. ──
     let respuestaResumen = '';
      if (act.tipo === 'CUESTIONARIO' && entregaId) {
        const filas = this.preguntasAlumno.map(p => {
          if (p.tipo === 'MULTIPLE' || p.tipo === 'VF') {
            const opcionId = this.respuestasSeleccionadas[p.id];
            const opcionTexto = p.opciones.find(o => o.id === opcionId)?.texto || '';
            return { pregunta_id: p.id, opcion_id: opcionId, texto: opcionTexto };
          }
          const texto = this.respuestasAbiertas[p.id]?.trim() || '';
          if (!respuestaResumen) respuestaResumen = texto; // solo para el resumen mostrado al docente
          return { pregunta_id: p.id, opcion_id: null, texto };
        });
        const { error: errResp } = await this.sesion.supabase
          .rpc('guardar_respuestas_actividad', { p_token: this.sesion.usuario?.token, p_entrega_id: entregaId, p_respuestas: filas });
        if (errResp) throw errResp;
      }

      const idx = this.actividades.findIndex(a => a.id === act.id);
      if (idx !== -1) {
        this.actividades[idx].entrega = {
          id: entregaId!, calificacion: null, feedback: act.entrega?.feedback || '',
          entregada_en: ahoraIso, archivo_url: archivoUrl, respuesta_texto: respuestaResumen,
        };
      }

      this.toast('Actividad entregada con éxito.', 'success');
      this.cerrarEntrega();
    } catch (e: any) {
      this.toast('Error al entregar: ' + e.message, 'danger');
    } finally {
      this.guardandoEntrega = false;
      this.subiendoEntrega  = false;
    }
  }
 irADetalleActividad(id: any) {
    if (id) {
      this.router.navigate(['/detalle-actividad', id]);
    }
  }
  // ═══════════════════════════════════════════════════════════════════
  //  VER ENTREGAS (docente)
  // ═══════════════════════════════════════════════════════════════════

  async verEntregas(act: ActividadItem) {
    if (this.actividadExpandida?.id === act.id) {
      this.actividadExpandida = null; return;
    }
    this.actividadExpandida = act;
    if (act.entregas !== undefined) return; // ya cargadas

    this.cargandoEntregas = true;
    try {
      // Roster de entregas vía RPC segura: valida que el que llama sea el
      // docente dueño de la actividad — reemplaza el .from() directo
      const { data: ents, error } = await this.sesion.supabase
        .rpc('entregas_de_actividad_docente', { p_token: this.sesion.usuario?.token, p_actividad_id: act.id });
      if (error) throw error;
      (ents || []).sort((a: any, b: any) => new Date(b.entregada_en).getTime() - new Date(a.entregada_en).getTime());

      // Nombres de alumnos
      const alumnoIds = (ents || []).map((e: any) => e.alumno_id);
      let nombreMap: Record<number, string> = {};
      if (alumnoIds.length) {
        const token3 = this.sesion.usuario?.token || this.sesion.tutor?.token;
        const { data: users } = token3
          ? await this.sesion.supabase.rpc('nombres_usuarios', { p_token: token3, p_ids: alumnoIds })
          : { data: [] as any[] };
        (users || []).forEach((u: any) => { nombreMap[u.id] = `${u.first_name} ${u.last_name}`.trim(); });
      }

      // Respuestas de texto (resumen: primera respuesta abierta de cada entrega)
      const entIds = (ents || []).map((e: any) => e.id);
      let textoMap: Record<number, string> = {};
      if (entIds.length) {
        const { data: resps } = await this.sesion.supabase
          .rpc('respuestas_de_entregas_multi', { p_token: this.sesion.usuario?.token, p_entrega_ids: entIds });
        (resps || []).forEach((r: any) => { if (!textoMap[r.entrega_id]) textoMap[r.entrega_id] = r.texto; });
      }

      const idx = this.actividades.findIndex(a => a.id === act.id);
      if (idx !== -1) {
        this.actividades[idx].entregas = (ents || []).map((e: any) => ({
          id:              e.id,
          alumno_id:       e.alumno_id,
          alumno_nombre:   nombreMap[e.alumno_id] || 'Alumno',
          archivo_url:     e.archivo || null,
          respuesta_texto: textoMap[e.id] || '',
          calificacion:    e.calificacion != null ? parseFloat(e.calificacion) : null,
          feedback:        e.feedback || '',
          entregada_en:    e.entregada_en,
        }));
        this.actividadExpandida = this.actividades[idx];
      }
    } catch (e: any) {
      this.toast('Error al cargar entregas: ' + e.message, 'danger');
    } finally { this.cargandoEntregas = false; }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CALIFICAR (docente)
  // ═══════════════════════════════════════════════════════════════════

  abrirCalificacion(ent: EntregaItem) {
    this.entregaCalificando = ent;
    this.notaNueva     = ent.calificacion != null ? String(ent.calificacion) : '';
    this.feedbackNuevo = ent.feedback || '';
  }

  cerrarCalificacion() {
    this.entregaCalificando = null;
    this.notaNueva = ''; this.feedbackNuevo = '';
  }

  async guardarCalificacion() {
    const ent = this.entregaCalificando;
    if (!ent) return;

    const nota = parseFloat(this.notaNueva);
    if (isNaN(nota) || nota < 0 || nota > 10)
      { this.toast('La nota debe ser entre 0 y 10.', 'warning'); return; }

    this.guardandoCal = true;
    try {
      // Calificar vía RPC segura: valida que el que llama sea el docente
      // dueño de la actividad — reemplaza el .from().update() directo
      const { error } = await this.sesion.supabase
        .rpc('calificar_entrega_actividad', {
          p_token: this.sesion.usuario?.token,
          p_entrega_id: ent.id,
          p_calificacion: nota,
          p_feedback: this.feedbackNuevo.trim(),
        });
      if (error) throw error;

      ent.calificacion = nota;
      ent.feedback     = this.feedbackNuevo.trim();

      // Actualizar conteo en la card
      const act = this.actividadExpandida;
      if (act) {
        const idx = this.actividades.findIndex(a => a.id === act.id);
        if (idx !== -1) this.actividades[idx] = { ...this.actividades[idx] };
      }

      this.toast('Calificación guardada.', 'success');
      this.cerrarCalificacion();
    } catch (e: any) {
      this.toast('Error: ' + e.message, 'danger');
    } finally { this.guardandoCal = false; }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  FILTROS POR ROL
  // ═══════════════════════════════════════════════════════════════════

  get actividadesFiltradas(): ActividadItem[] {
    if (this.esAlumno) {
      if (this.filtroAlumno === 'PENDIENTE')  return this.actividades.filter(a => !a.entrega && !a.vencida);
      if (this.filtroAlumno === 'ENTREGADA')  return this.actividades.filter(a => a.entrega && a.entrega.calificacion == null);
      if (this.filtroAlumno === 'CALIFICADA') return this.actividades.filter(a => a.entrega?.calificacion != null);
      return this.actividades;
    }
    if (this.esDocente) {
      if (this.filtroDocente === 'ACTIVAS')    return this.actividades.filter(a => !a.vencida && a.publicada);
      if (this.filtroDocente === 'VENCIDAS')   return this.actividades.filter(a => a.vencida);
      if (this.filtroDocente === 'BORRADORES') return this.actividades.filter(a => !a.publicada);
      return this.actividades;
    }
    if (this.esTutor) {
      if (this.filtroTutor === 'PENDIENTE')  return this.actividades.filter(a => !a.entrega && !a.vencida);
      if (this.filtroTutor === 'ENTREGADA')  return this.actividades.filter(a => a.entrega && a.entrega.calificacion == null);
      if (this.filtroTutor === 'CALIFICADA') return this.actividades.filter(a => a.entrega?.calificacion != null);
    }
    return this.actividades;
  }
    // ── Agrupación por semana (más recientes arriba) ────────────
get actividadesAgrupadas(): { label: string; items: ActividadItem[] }[] {
  // Filtrar solo actividades con fecha_entrega válida
  const validas = this.actividadesFiltradas.filter(a => {
    if (!a.fecha_entrega) return false;
    const date = new Date(a.fecha_entrega);
    return !isNaN(date.getTime());
  });

  // Si no hay válidas, retornar vacío
  if (!validas.length) return [];

  const ordenadas = [...validas].sort((a, b) =>
    new Date(b.fecha_entrega).getTime() - new Date(a.fecha_entrega).getTime()
  );
    const grupos = new Map<string, ActividadItem[]>();
    for (const act of ordenadas) {
      const key = this.claveSemana(act.fecha_entrega);
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push(act);
    }

    return Array.from(grupos.values()).map(items => ({
      label: this.etiquetaSemana(items[0].fecha_entrega),
      items,
    }));
  }

  private inicioSemana(d: Date): Date {
    const date = new Date(d);
    const dia = date.getDay(); // 0 = domingo
    const diff = dia === 0 ? -6 : 1 - dia; // retrocede hasta el lunes
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

private claveSemana(fechaStr: string): string {
  if (!fechaStr) return 'sin-fecha';

  const date = new Date(fechaStr);
  if (isNaN(date.getTime())) return 'sin-fecha';

  return this.inicioSemana(date).toISOString().slice(0, 10);
}

  private etiquetaSemana(fechaStr: string): string {
    const lunes = this.inicioSemana(new Date(fechaStr));
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);

    const hoyLunes = this.inicioSemana(new Date());
    const diffSemanas = Math.round((hoyLunes.getTime() - lunes.getTime()) / (7 * 24 * 60 * 60 * 1000));

    if (diffSemanas === 0)  return 'Esta semana';
    if (diffSemanas === 1)  return 'Semana pasada';
    if (diffSemanas === -1) return 'Próxima semana';
    if (diffSemanas > 1)    return `Hace ${diffSemanas} semanas`;

    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${lunes.toLocaleDateString('es-MX', opts)} – ${domingo.toLocaleDateString('es-MX', opts)}`;
  }

  // Stats alumno y tutor
  get totalPendientes():  number { return this.actividades.filter(a => !a.entrega && !a.vencida).length; }
  get totalEntregadas():  number { return this.actividades.filter(a => a.entrega && a.entrega.calificacion == null).length; }
  get totalCalificadas(): number { return this.actividades.filter(a => a.entrega?.calificacion != null).length; }

  // Stats docente
  get totalActivas():    number { return this.actividades.filter(a => !a.vencida && a.publicada).length; }
  get totalVencidas():   number { return this.actividades.filter(a => a.vencida).length; }
  get totalBorradores(): number { return this.actividades.filter(a => !a.publicada).length; }

  get completionPercent(): number {
    if (!this.actividades.length) return 0;
    return Math.round(((this.totalEntregadas + this.totalCalificadas) / this.actividades.length) * 100);
  }
  get progressOffset(): number { return 2 * Math.PI * 50 * (1 - this.completionPercent / 100); }

  // ═══════════════════════════════════════════════════════════════════
  //  FORMULARIO CREAR/EDITAR (docente)
  // ═══════════════════════════════════════════════════════════════════

  async cargarMaterias() {
    const uid = this.sesion.usuario?.id; if (!uid) return;
    this.cargandoOpts = true;
    try {
      // Antes: SELECT directo a academic_asignatura_docentes (relación
      // docente→materia) seguido de otro SELECT a academic_asignatura —
      // bloqueados por REVOKE (NON/PAR). Se reemplaza por
      // combos_asignatura_grupo_docente, la misma RPC ya usada en
      // aula/detalle.page.ts, que trae materia+grupo del docente ya
      // filtrados por período activo en una sola llamada. El resultado se
      // cachea en combosMateriaGrupo y onMateriaChange() lo filtra en
      // memoria sin volver a pegarle al backend.
      const token = this.sesion.usuario?.token;
      const { data: combos, error } = await this.sesion.supabase
        .rpc('combos_asignatura_grupo_docente', { p_token: token,p_docente_id: uid  });
      if (error) throw error;
      this.combosMateriaGrupo = combos || [];

      const vistas = new Set<number>();
      const materiasUnicas: Materia[] = [];
      for (const c of this.combosMateriaGrupo) {
        if (!vistas.has(c.asignatura_id)) {
          vistas.add(c.asignatura_id);
          materiasUnicas.push({ id: c.asignatura_id, nombre: c.asignatura_nombre });
        }
      }
      this.materias = materiasUnicas.sort((a, b) => a.nombre.localeCompare(b.nombre));
    } catch (e: any) {
      console.error('Error combos_asignatura_grupo_docente:', e.message);
    } finally { this.cargandoOpts = false; }
  }

  async onMateriaChange(preservarGrupo: number | null = null) {
    if (!preservarGrupo) this.newAct.grupoId = null;
    this.gruposDeMateria = [];
    if (!this.newAct.materiaId) return;
    this.cargandoOpts = true; this.errorOpts = null;
    try {
      // Antes: SELECT directo a academic_asignatura_grupos, luego a
      // users_docentegrupo y por último a academic_grupo — 3 llamadas
      // encadenadas, bloqueadas por REVOKE (NON/PAR). Ya no hace falta
      // ninguna consulta: se filtra en memoria el combo que cargó
      // cargarMaterias() (combos_asignatura_grupo_docente), que ya viene
      // limitado al período activo.
      this.gruposDeMateria = this.combosMateriaGrupo
        .filter(c => c.asignatura_id === this.newAct.materiaId)
        .map(c => ({ id: c.grupo_id, nombre: c.grupo_nombre, grado: c.grado, aula: c.aula }))
        .sort((a, b) => a.grado - b.grado || a.nombre.localeCompare(b.nombre));

      if (preservarGrupo && this.gruposDeMateria.some(g => g.id === preservarGrupo))
        this.newAct.grupoId = preservarGrupo;
    } catch (e: any) { this.errorOpts = e.message; }
    finally { this.cargandoOpts = false; }
  }

  abrirFormularioNuevo() { this.editingId = null; this.resetForm(); this.preguntasForm = []; this.showForm = true; }

  async abrirFormularioEditar(a: ActividadItem) {
    this.editingId = a.id;
    this.archivosEnProgreso = []; this.archivosExistentes = [];
    const fh = a.fecha_entrega?.slice(0, 16) || '';
    this.newAct = {
      titulo: a.titulo, instrucciones: a.instrucciones, tipo: a.tipo,
      fecha: fh.slice(0, 10), hora: fh.slice(11, 16) || '23:59',
      valor_total: a.valor_total, url_interactiva: a.url_interactiva || '',
      publicada: a.publicada, materiaId: a.asignatura_id, grupoId: null,
    };
    this.preguntasForm = [];
    if (a.tipo === 'CUESTIONARIO') await this.cargarPreguntasParaEditar(a.id);
    this.showForm = true;
    await this.onMateriaChange(a.grupo_id);
  }

  async solicitarCierre() {
    const al = await this.alertCtrl.create({
      header: 'Descartar cambios', message: '¿Salir sin guardar?',
      buttons: [{ text: 'Seguir', role: 'cancel' }, { text: 'Descartar', role: 'destructive', handler: () => this.forzarCierre() }]
    });
    await al.present();
  }

  forzarCierre() { this.showForm = false; this.editingId = null; this.resetForm(); }

  private resetForm() {
    this.newAct = { titulo:'', instrucciones:'', tipo:'CUESTIONARIO', fecha:'', hora:'23:59', valor_total:10, url_interactiva:'', publicada:true, materiaId:null, grupoId:null };
    this.archivosEnProgreso = []; this.archivosExistentes = []; this.gruposDeMateria = []; this.errorOpts = null;
  }

  async guardarActividad() {
    const f = this.newAct;
    if (!f.titulo.trim())  { this.toast('Ponle un título.', 'warning'); return; }
    if (!f.materiaId)      { this.toast('Elige la materia.', 'warning'); return; }
    if (!f.grupoId)        { this.toast('Elige el grupo.', 'warning'); return; }
    if (!f.fecha)          { this.toast('Elige la fecha.', 'warning'); return; }
    if (f.tipo === 'INTERACTIVA' && !f.url_interactiva?.trim()) { this.toast('Agrega el enlace.', 'warning'); return; }

    if (f.tipo === 'CUESTIONARIO') {
      if (!this.preguntasForm.length) { this.toast('Agrega al menos una pregunta.', 'warning'); return; }
      for (const p of this.preguntasForm) {
        if (!p.texto.trim()) { this.toast('Cada pregunta necesita texto.', 'warning'); return; }
        if (p.tipo === 'MULTIPLE' && p.opciones.filter(o => o.texto.trim()).length < 2) {
          this.toast('Las preguntas de opción múltiple necesitan al menos 2 opciones.', 'warning'); return;
        }
      }
    }

    this.guardando = true;
    try {
      const arch = this.archivosEnProgreso.filter(a => a.resultado).map(a => a.resultado!);
      const archivoFinal = arch.length ? arch[0] : this.archivosExistentes[0] || null;
      const payload: any = {
        titulo: f.titulo.trim(), instrucciones: f.instrucciones.trim(), tipo: f.tipo,
        fecha_entrega: `${f.fecha}T${f.hora}:00`, valor_total: f.valor_total,
        url_interactiva: f.url_interactiva?.trim() || null, publicada: f.publicada,
        asignatura_id: f.materiaId, grupo_id: f.grupoId, docente_id: this.sesion.usuario?.id,
        archivo: archivoFinal ? archivoFinal.url : null,
        calificacion_automatica: false,
      };

      if (!this.editingId) {
        payload.creada_en = new Date().toISOString();
      }

      let actividadIdFinal: number;

      if (this.editingId) {
        // Antes: "p_actividad_id: , p_payload:  " — ambos vacíos, no compila.
        const { data, error } = await this.sesion.supabase.rpc('actualizar_actividad_json', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_actividad_id: this.editingId, p_payload: payload });
        if (error) throw error;
        actividadIdFinal = this.editingId;
        const idx = this.actividades.findIndex(a => a.id === this.editingId);
        if (idx !== -1) {
          const g = this.gruposDeMateria.find(g => g.id === f.grupoId);
          const m = this.materias.find(m => m.id === f.materiaId);
          this.actividades[idx] = { ...this.actividades[idx], titulo: data.titulo, instrucciones: data.instrucciones, tipo: data.tipo, fecha_entrega: data.fecha_entrega, valor_total: parseFloat(data.valor_total), url_interactiva: data.url_interactiva, publicada: data.publicada, asignatura: m?.nombre || this.actividades[idx].asignatura, grupo: g ? `${g.grado}° ${g.nombre}` : this.actividades[idx].grupo };
        }
        this.toast('Actividad actualizada.', 'success');
      } else {
        // Antes: "p_payload:  " vacío — creaba la actividad sin ningún dato.
        const { data, error } = await this.sesion.supabase.rpc('insertar_actividad_json', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_payload: payload });
        if (error) throw error;
        actividadIdFinal = data.id;
        const g = this.gruposDeMateria.find(g => g.id === f.grupoId);
        const m = this.materias.find(m => m.id === f.materiaId);
        this.actividades.unshift({ id:data.id, titulo:data.titulo, instrucciones:data.instrucciones, tipo:data.tipo, fecha_entrega:data.fecha_entrega, valor_total:parseFloat(data.valor_total), url_interactiva:data.url_interactiva, asignatura:m?.nombre||'—', asignatura_id:f.materiaId!, grupo:g?`${g.grado}° ${g.nombre}`:'—', grupo_id:f.grupoId!, docente:'', publicada:data.publicada, vencida:false, totalEntregas:0, totalAlumnos:0, entregas:undefined, entrega:null });
        this.toast('Actividad creada.', 'success');
      }

      if (f.tipo === 'CUESTIONARIO') {
        await this.guardarPreguntasOpciones(actividadIdFinal);
      }

      this.forzarCierre();
    } catch (e: any) { this.toast('Error: ' + e.message, 'danger'); }
    finally { this.guardando = false; }
  }

  async eliminarActividad(act: ActividadItem) {
    const al = await this.alertCtrl.create({
      header: 'Eliminar actividad',
      message: `¿Eliminar "${act.titulo}"? Esto borrará también las entregas y calificaciones de los alumnos.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar', role: 'destructive',
          handler: async () => {
            try {
              const tokenDoc = this.sesion.usuario?.token;

              // 1) IDs de entregas (vía RPC segura, valida docente dueño) y
              //    preguntas de esta actividad
              const { data: entregas } = await this.sesion.supabase
                .rpc('entregas_de_actividad_docente', { p_token: tokenDoc, p_actividad_id: act.id });
              const entregaIds = (entregas || []).map((e: any) => e.id);

              // Antes: "const { data:  }" sin nombre y "p_actividad_id:" vacío.
              const { data: preguntas } = await this.sesion.supabase.rpc('leer_preguntas_actividad', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_actividad_id: act.id });
              const preguntaIds = (preguntas || []).map((p: any) => p.id);

              // 2) Borrar respuestas de alumnos que dependan de esas entregas o preguntas
              if (entregaIds.length) {
                const { error: e1 } = await this.sesion.supabase
                  .rpc('limpiar_respuestas_por_entregas', { p_token: tokenDoc, p_entrega_ids: entregaIds });
                if (e1) throw e1;
              }
              if (preguntaIds.length) {
                const { error: e2 } = await this.sesion.supabase
                  .rpc('limpiar_respuestas_por_preguntas', { p_token: tokenDoc, p_pregunta_ids: preguntaIds });
                if (e2) throw e2;

                // Borrar las opciones antes que las preguntas (FK) — ya no acepta DELETE
                // directo (RLS), se limpia vía guardar_opciones_pregunta con arreglo vacío.
                if (tokenDoc) {
                  for (const pid of preguntaIds) {
                    const { error: errClear } = await this.sesion.supabase.rpc('guardar_opciones_pregunta', {
                      p_token: tokenDoc, p_pregunta_id: pid, p_opciones: [],
                    });
                    if (errClear) console.error('Error limpiando opciones de', pid, errClear.message);
                  }
                }
              }

              // 3) Borrar entregas (vía RPC segura) y preguntas
              const { error: e3 } = await this.sesion.supabase
                .rpc('borrar_entregas_de_actividad', { p_token: tokenDoc, p_actividad_id: act.id });
              if (e3) throw e3;

              // Antes: "p_actividad_id:" vacío.
              const { error: e4 } = await this.sesion.supabase.rpc('eliminar_preguntas_por_actividad', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_actividad_id: act.id });
              if (e4) throw e4;

              // 4) Ahora sí, borrar la actividad
              // Antes: "p_actividad_id:" vacío.
              const { error } = await this.sesion.supabase
                .rpc('eliminar_actividad_docente', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_actividad_id: act.id });
              if (error) throw error;

              this.actividades = this.actividades.filter(a => a.id !== act.id);
              this.toast('Actividad eliminada.', 'success');
            } catch (e: any) {
              console.error('Eliminar actividad:', e);
              this.toast('No se pudo eliminar: ' + e.message, 'danger');
            }
          }
        }
      ]
    });
    await al.present();
  }

  async togglePublicada(act: ActividadItem, ev: Event) {
    ev.stopPropagation();
    // Antes: "p_actividad_id: ," — coma sin valor, no compila.
    const { error } = await this.sesion.supabase.rpc('toggle_publicar_actividad', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_actividad_id: act.id, p_publicada: !act.publicada });
    if (error) { this.toast('Error.','danger'); return; }
    act.publicada = !act.publicada;
    this.toast(act.publicada ? 'Publicada.' : 'Borrador.','success');
  }

  // ── Archivos ─────────────────────────────────
  onDragOver(e: DragEvent)  { e.preventDefault(); e.stopPropagation(); this.isDragging = true; }
  onDragLeave(e: DragEvent) { e.preventDefault(); e.stopPropagation(); this.isDragging = false; }
  onDrop(e: DragEvent)      { e.preventDefault(); e.stopPropagation(); this.isDragging = false; if (e.dataTransfer?.files.length) this.subirArchivos(Array.from(e.dataTransfer.files)); }
  onFilesSelected(e: any)   { if (e.target.files?.length) { this.subirArchivos(Array.from(e.target.files)); e.target.value = ''; } }

  private subirArchivos(files: File[]) {
    for (const file of files) {
      const err = this.validarArchivo(file);
      if (err) { this.toast(`"${file.name}": ${err}`,'warning'); continue; }
      const item: ArchivoEnProgreso = { file, progreso:0, subiendo:true, error:false };
      this.archivosEnProgreso.push(item);
      this.cloudinary.subirArchivo(file, pct => item.progreso = pct)
        .then(r => { item.subiendo = false; item.resultado = r; })
        .catch(() => { item.subiendo = false; item.error = true; });
    }
  }

  private validarArchivo(file: File): string | null {
    if (file.size / 1048576 > MAX_MB) return `Supera ${MAX_MB}MB.`;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (EXT_BAN.includes(ext)) return 'Tipo no permitido.';
    return null;
  }

  removeFile(i: number, e: Event) { e.stopPropagation(); this.archivosEnProgreso.splice(i, 1); }
  removeArchivoExistente(i: number, e: Event) { e.stopPropagation(); this.archivosExistentes.splice(i, 1); }
  reintentarArchivo(i: number, e: Event) {
    e.stopPropagation(); const item = this.archivosEnProgreso[i];
    item.error = false; item.subiendo = true; item.progreso = 0;
    this.cloudinary.subirArchivo(item.file, pct => item.progreso = pct)
      .then(r => { item.subiendo = false; item.resultado = r; })
      .catch(() => { item.subiendo = false; item.error = true; });
  }

  // ── Helpers UI ─────────────────────────────────
  getEstadoClass(a: ActividadItem): string {
    if (!a.entrega) return a.vencida ? 'no-entregada' : 'pendiente';
    return a.entrega.calificacion != null ? 'calificada' : 'entregada';
  }
  getEstadoLabel(a: ActividadItem): string {
    if (!a.entrega) return a.vencida ? 'No entregada' : 'Pendiente';
    return a.entrega.calificacion != null ? 'Calificada' : 'Entregada';
  }
  getEstadoIcon(a: ActividadItem): string {
    if (!a.entrega) return a.vencida ? 'close-circle-outline' : 'time-outline';
    return a.entrega.calificacion != null ? 'ribbon-outline' : 'checkmark-circle-outline';
  }
  // Tipos de ACTIVIDAD (nivel superior) — solo los 3 de Django. Los tipos de
  // PREGUNTA (MULTIPLE/VF/ABIERTA) se etiquetan con etiquetaTipoPregunta().
  getTipoIcon(tipo: string): string {
    return {
      CUESTIONARIO: 'list-outline',
      ARCHIVO: 'cloud-upload-outline',
      INTERACTIVA: 'game-controller-outline',
    }[tipo] || 'clipboard-outline';
  }
  getTipoLabel(tipo: string): string {
    return {
      CUESTIONARIO: 'Cuestionario',
      ARCHIVO: 'Subir archivo',
      INTERACTIVA: 'Ejercicio interactivo',
    }[tipo] || tipo;
  }
  colorNota(n: number): string { if (n >= 9) return 'excelente'; if (n >= 7) return 'bien'; if (n >= 6) return 'regular'; return 'reprobado'; }
  esCritica(a: ActividadItem): boolean { if (a.entrega) return false; const diff = (new Date(a.fecha_entrega).getTime() - Date.now()) / (1000*60*60*24); return diff <= 2 && diff >= 0; }
  formatFecha(f: string): string { return new Date(f).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' }); }
  diasRestantes(f: string): string {
    const diff = Math.ceil((new Date(f).getTime() - Date.now()) / (1000*60*60*24));
    if (diff < 0) return `Venció hace ${Math.abs(diff)} día${Math.abs(diff)!==1?'s':''}`;
    if (diff === 0) return 'Vence hoy';
    if (diff === 1) return 'Vence mañana';
    return `${diff} días restantes`;
  }
  getFileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    return { pdf:'document-text-outline', doc:'reader-outline', docx:'reader-outline', jpg:'image-outline', jpeg:'image-outline', png:'image-outline', mp4:'videocam-outline', zip:'archive-outline' }[ext||''] || 'document-outline';
  }
  formatSize(b: number): string { if (!b) return '0 B'; const k=1024,s=['B','KB','MB'],i=Math.floor(Math.log(b)/Math.log(k)); return (b/Math.pow(k,i)).toFixed(1)+' '+s[i]; }
  doRefresh(event: any) { this.cargarActividades().then(() => event.target.complete()); }
  private async toast(msg: string, color: string) { const t = await this.toastCtrl.create({ message:msg, duration:2500, color, position:'bottom' }); await t.present(); }
}
