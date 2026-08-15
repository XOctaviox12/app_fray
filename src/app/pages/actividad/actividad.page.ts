import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService, ArchivoSubido } from '../../services/cloudinary.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

// ─── Tipos ──────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  standalone: true,
  selector: 'app-actividad',
  templateUrl: './actividad.page.html',
  styleUrls: ['./actividad.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule, RouterModule],
})
export class ActividadPage implements OnInit {

  private supabase: SupabaseClient;

  cargando = true;
  error    = '';

  // ── Cuestionario — editor docente ──────────────────────
  preguntasForm: PreguntaForm[] = [];

  // ── Cuestionario — responder alumno ────────────────────
  preguntasAlumno: PreguntaAlumno[] = [];
  respuestasSeleccionadas: Record<number, number> = {}; // pregunta_id -> opcion_id (MULTIPLE/VF)
  respuestasAbiertas: Record<number, string> = {};       // pregunta_id -> texto (ABIERTA)
  cargandoPreguntas = false;

  actividades: ActividadItem[] = [];

  // ── Filtros separados por rol ─────────────────────────────
  filtroAlumno:  FiltroAlumno  = 'TODAS';
  filtroDocente: FiltroDocente = 'TODAS';
  filtroTutor:   FiltroTutor   = 'TODAS';

  // ── Panel de entregas (docente) ───────────────────────────
  actividadExpandida: ActividadItem | null = null;
  cargandoEntregas = false;

  // ── Panel calificación (docente) ──────────────────────────
  entregaCalificando: EntregaItem | null = null;
  notaNueva    = '';
  feedbackNuevo = '';
  guardandoCal = false;

  // ── Panel entrega alumno ──────────────────────────────────
  actividadEntregando: ActividadItem | null = null;
  archivoEntrega: File | null = null;
  subiendoEntrega = false;
  progresoEntrega = 0;
  guardandoEntrega = false;

  // ── Formulario docente ────────────────────────────────────
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
  ) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  ngOnInit() {
    if (this.esDocente) this.cargarMaterias();
    this.cargarActividades();
  }

  // ══════════════════════════════════════════════════════════
  //  PREGUNTAS — editor docente
  //  Se pueden combinar libremente MULTIPLE, VF y ABIERTA dentro
  //  de una misma actividad CUESTIONARIO, igual que en Django.
  // ══════════════════════════════════════════════════════════

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
    const { data: pregs } = await this.supabase
      .from('academic_preguntaactividad')
      .select('id, texto, puntos, orden, tipo')
      .eq('actividad_id', actividadId)
      .order('orden');

    this.preguntasForm = [];
    for (const p of pregs || []) {
      let opciones: OpcionForm[] = [];
      if (p.tipo === 'MULTIPLE' || p.tipo === 'VF') {
        const { data: ops } = await this.supabase
          .from('academic_opcionrespuesta')
          .select('id, texto, es_correcta')
          .eq('pregunta_id', p.id);
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
    const { data: viejas } = await this.supabase
      .from('academic_preguntaactividad').select('id').eq('actividad_id', actividadId);
    const idsViejas = (viejas || []).map((p: any) => p.id);

    if (idsViejas.length) {
      await this.supabase.from('academic_respuestaalumno').delete().in('pregunta_id', idsViejas);
      await this.supabase.from('academic_opcionrespuesta').delete().in('pregunta_id', idsViejas);
      await this.supabase.from('academic_preguntaactividad').delete().eq('actividad_id', actividadId);
    }

    for (let i = 0; i < this.preguntasForm.length; i++) {
      const p = this.preguntasForm[i];
      if (!p.texto.trim()) continue;

      const { data: pregInsertada, error: errP } = await this.supabase
        .from('academic_preguntaactividad')
        .insert({ texto: p.texto.trim(), tipo: p.tipo, orden: i, puntos: p.puntos, actividad_id: actividadId })
        .select('id').single();
      if (errP) throw errP;

      if (p.tipo === 'MULTIPLE' || p.tipo === 'VF') {
        const opcionesValidas = p.opciones.filter(o => o.texto.trim());
        if (opcionesValidas.length) {
          const { error: errO } = await this.supabase.from('academic_opcionrespuesta').insert(
            opcionesValidas.map(o => ({
              texto: o.texto.trim(), es_correcta: o.es_correcta, pregunta_id: (pregInsertada as any).id,
            }))
          );
          if (errO) throw errO;
        }
      }
      // 'ABIERTA': sin opciones, no se autocalifica — igual que en Django.
    }
  }

  // ══════════════════════════════════════════════════════════
  //  CARGA PRINCIPAL
  // ══════════════════════════════════════════════════════════

  async cargarActividades() {
    this.cargando = true; this.error = '';
    try {
      if (this.esAlumno)       await this.cargarParaAlumno();
      else if (this.esDocente) await this.cargarParaDocente();
      else if (this.esTutor)   await this.cargarParaTutor();
    } catch (e: any) { this.error = 'Error al cargar: ' + e.message; }
    this.cargando = false;
  }

  // ── Alumno ────────────────────────────────────────────────
  async cargarParaAlumno() {
    const alumnoId = this.sesion.usuario?.id;
    if (!alumnoId) return;

    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    if (!token) return;
    const { data: usu } = await this.supabase
      .rpc('perfil_basico_usuario', { p_token: token, p_user_id: alumnoId })
      .single<{ alumno_grupo_id: number }>();
    const grupoId = usu?.alumno_grupo_id;
    if (!grupoId) return;

    const { data: acts, error } = await this.supabase
      .from('academic_actividad')
      .select('id, titulo, instrucciones, tipo, fecha_entrega, valor_total, url_interactiva, asignatura_id, grupo_id')
      .eq('grupo_id', grupoId).eq('publicada', true)
      .order('fecha_entrega', { ascending: true });
    if (error) throw error;

    const asiIds = [...new Set((acts || []).map((a: any) => a.asignatura_id))];
    let asiMap: Record<number, string> = {};
    if (asiIds.length) {
      const { data: asis } = await this.supabase.from('academic_asignatura').select('id, nombre').in('id', asiIds);
      (asis || []).forEach((a: any) => { asiMap[a.id] = a.nombre; });
    }

    const { data: entregas } = await this.supabase
      .from('academic_entregaactividad')
      .select('id, actividad_id, calificacion, feedback, entregada_en, archivo')
      .eq('alumno_id', alumnoId);
    const entMap: Record<number, any> = {};
    (entregas || []).forEach((e: any) => { entMap[e.actividad_id] = e; });

    // Respuestas de texto del alumno (resumen: primera respuesta abierta de cada entrega)
    const actIds = (acts || []).map((a: any) => a.id);
    let respMap: Record<number, string> = {};
    if (actIds.length) {
      const entregaIds = Object.values(entMap).map((e: any) => e?.id).filter(Boolean);
      if (entregaIds.length) {
        const { data: resps } = await this.supabase
          .from('academic_respuestaalumno')
          .select('entrega_id, texto')
          .in('entrega_id', entregaIds);
        // Mapear entrega_id → actividad_id → texto
        const entIdToActId: Record<number, number> = {};
        Object.entries(entMap).forEach(([actId, ent]: any) => {
          if (ent?.id) entIdToActId[ent.id] = parseInt(actId);
        });
        (resps || []).forEach((r: any) => {
          const actId = entIdToActId[r.entrega_id];
          if (actId && !respMap[actId]) respMap[actId] = r.texto;
        });
      }
    }

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
          id:              ent.id,
          calificacion:    ent.calificacion != null ? parseFloat(ent.calificacion) : null,
          feedback:        ent.feedback || '',
          entregada_en:    ent.entregada_en,
          archivo_url:     ent.archivo || null,
          respuesta_texto: respMap[a.id] || '',
        } : null,
      };
    });
  }

  // ── Docente ───────────────────────────────────────────────
  async cargarParaDocente() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    const { data: acts, error } = await this.supabase
      .from('academic_actividad')
      .select('id, titulo, instrucciones, tipo, fecha_entrega, valor_total, url_interactiva, publicada, asignatura_id, grupo_id')
      .eq('docente_id', docenteId)
      .order('fecha_entrega', { ascending: false });
    if (error) throw error;

    const asiIds = [...new Set((acts || []).map((a: any) => a.asignatura_id))];
    const gruIds = [...new Set((acts || []).map((a: any) => a.grupo_id))] as number[];
    let asiMap: Record<number, string> = {};
    let gruMap: Record<number, string> = {};

    if (asiIds.length) {
      const { data: asis } = await this.supabase.from('academic_asignatura').select('id, nombre').in('id', asiIds);
      (asis || []).forEach((a: any) => { asiMap[a.id] = a.nombre; });
    }
    if (gruIds.length) {
      const { data: grus } = await this.supabase.from('academic_grupo').select('id, nombre, grado').in('id', gruIds);
      (grus || []).forEach((g: any) => { gruMap[g.id] = `${g.grado}° ${g.nombre}`; });
    }

    // Conteo de entregas y alumnos
    let conteoEnt: Record<number, number> = {};
    let alumnosPorGrupo: Record<number, number> = {};

    if ((acts || []).length) {
      const ids = (acts || []).map((a: any) => a.id);
      const { data: ents } = await this.supabase
        .from('academic_entregaactividad').select('actividad_id').in('actividad_id', ids);
      (ents || []).forEach((e: any) => { conteoEnt[e.actividad_id] = (conteoEnt[e.actividad_id] || 0) + 1; });

      if (gruIds.length) {
        const token2 = this.sesion.usuario?.token || this.sesion.tutor?.token;
        const { data: alumnos } = token2
          ? await this.supabase.rpc('alumnos_por_grupos', { p_token: token2, p_grupo_ids: gruIds })
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

  // ── Tutor ─────────────────────────────────────────────────
  async cargarParaTutor() {
    const alumnoId = this.sesion.tutor?.alumno_id;
    if (!alumnoId) return;

    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    if (!token) return;
    const { data: usu } = await this.supabase
      .rpc('perfil_basico_usuario', { p_token: token, p_user_id: alumnoId })
      .single<{ alumno_grupo_id: number; first_name: string; last_name: string }>();
    const grupoId = usu?.alumno_grupo_id;
    if (!grupoId) return;

    const { data: acts, error } = await this.supabase
      .from('academic_actividad')
      .select('id, titulo, instrucciones, tipo, fecha_entrega, valor_total, url_interactiva, asignatura_id, grupo_id')
      .eq('grupo_id', grupoId).eq('publicada', true)
      .order('fecha_entrega', { ascending: true });
    if (error) throw error;

    const asiIds = [...new Set((acts || []).map((a: any) => a.asignatura_id))];
    let asiMap: Record<number, string> = {};
    if (asiIds.length) {
      const { data: asis } = await this.supabase.from('academic_asignatura').select('id, nombre').in('id', asiIds);
      (asis || []).forEach((a: any) => { asiMap[a.id] = a.nombre; });
    }

    const { data: entregas } = await this.supabase
      .from('academic_entregaactividad')
      .select('actividad_id, calificacion, feedback, entregada_en, archivo')
      .eq('alumno_id', alumnoId);
    const entMap: Record<number, any> = {};
    (entregas || []).forEach((e: any) => { entMap[e.actividad_id] = e; });

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

  // ══════════════════════════════════════════════════════════
  //  ENTREGAR ACTIVIDAD (alumno)
  //  Solo ARCHIVO y CUESTIONARIO requieren entrega — INTERACTIVA
  //  se resuelve fuera de la app (enlace externo), igual que en Django.
  // ══════════════════════════════════════════════════════════

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
        const { data: pregs } = await this.supabase
          .from('academic_preguntaactividad')
          .select('id, texto, orden, tipo')
          .eq('actividad_id', act.id).order('orden');

        for (const p of pregs || []) {
          let opciones: { id: number; texto: string }[] = [];
          if (p.tipo === 'MULTIPLE' || p.tipo === 'VF') {
            const { data: ops } = await this.supabase
              .from('academic_opcionrespuesta').select('id, texto').eq('pregunta_id', p.id);
            opciones = ops || [];
          }
          this.preguntasAlumno.push({ id: p.id, tipo: p.tipo, texto: p.texto, opciones });
        }

        // Cargar selección previa si ya había entregado
        if (act.entrega?.id) {
          const { data: resp } = await this.supabase
            .from('academic_respuestaalumno')
            .select('pregunta_id, opcion_id, texto')
            .eq('entrega_id', act.entrega.id);
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
    const alumnoId = this.sesion.usuario?.id;

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

      const ahoraIso = new Date().toISOString();
      const payload: any = {
        actividad_id: act.id, alumno_id: alumnoId,
        archivo: archivoUrl,
        feedback: act.entrega?.feedback || '',
        entregada_en: ahoraIso,
      };

      let entregaId = act.entrega?.id;

      if (entregaId) {
        const { error: errUpd } = await this.supabase.from('academic_entregaactividad').update(payload).eq('id', entregaId);
        if (errUpd) throw errUpd;
      } else {
        const { data, error: errIns } = await this.supabase.from('academic_entregaactividad').insert(payload).select('id').single();
        if (errIns) throw errIns;
        entregaId = (data as any)?.id;
      }

      // ── Cuestionario: guardar la respuesta de cada pregunta, sea MULTIPLE, VF o ABIERTA,
      //    combinadas dentro de la misma entrega — igual que hace Django. ──
      let respuestaResumen = '';
      if (act.tipo === 'CUESTIONARIO' && entregaId) {
        await this.supabase.from('academic_respuestaalumno').delete().eq('entrega_id', entregaId);
        const filas = this.preguntasAlumno.map(p => {
          if (p.tipo === 'MULTIPLE' || p.tipo === 'VF') {
            const opcionId = this.respuestasSeleccionadas[p.id];
            const opcionTexto = p.opciones.find(o => o.id === opcionId)?.texto || '';
            return { entrega_id: entregaId, pregunta_id: p.id, opcion_id: opcionId, texto: opcionTexto };
          }
          const texto = this.respuestasAbiertas[p.id]?.trim() || '';
          if (!respuestaResumen) respuestaResumen = texto; // solo para el resumen mostrado al docente
          return { entrega_id: entregaId, pregunta_id: p.id, opcion_id: null, texto };
        });
        const { error: errResp } = await this.supabase.from('academic_respuestaalumno').insert(filas);
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

  // ══════════════════════════════════════════════════════════
  //  VER ENTREGAS (docente)
  // ══════════════════════════════════════════════════════════

  async verEntregas(act: ActividadItem) {
    if (this.actividadExpandida?.id === act.id) {
      this.actividadExpandida = null; return;
    }
    this.actividadExpandida = act;
    if (act.entregas !== undefined) return; // ya cargadas

    this.cargandoEntregas = true;
    try {
      const { data: ents, error } = await this.supabase
        .from('academic_entregaactividad')
        .select('id, alumno_id, calificacion, feedback, entregada_en, archivo')
        .eq('actividad_id', act.id)
        .order('entregada_en', { ascending: false });
      if (error) throw error;

      // Nombres de alumnos
      const alumnoIds = (ents || []).map((e: any) => e.alumno_id);
      let nombreMap: Record<number, string> = {};
      if (alumnoIds.length) {
        const token3 = this.sesion.usuario?.token || this.sesion.tutor?.token;
        const { data: users } = token3
          ? await this.supabase.rpc('nombres_usuarios', { p_token: token3, p_ids: alumnoIds })
          : { data: [] as any[] };
        (users || []).forEach((u: any) => { nombreMap[u.id] = `${u.first_name} ${u.last_name}`.trim(); });
      }

      // Respuestas de texto (resumen: primera respuesta abierta de cada entrega)
      const entIds = (ents || []).map((e: any) => e.id);
      let textoMap: Record<number, string> = {};
      if (entIds.length) {
        const { data: resps } = await this.supabase
          .from('academic_respuestaalumno').select('entrega_id, texto').in('entrega_id', entIds);
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

  // ══════════════════════════════════════════════════════════
  //  CALIFICAR (docente)
  // ══════════════════════════════════════════════════════════

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
      const { error } = await this.supabase
        .from('academic_entregaactividad')
        .update({ calificacion: nota, feedback: this.feedbackNuevo.trim() })
        .eq('id', ent.id);
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

  // ══════════════════════════════════════════════════════════
  //  FILTROS POR ROL
  // ══════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════
  //  FORMULARIO CREAR/EDITAR (docente)
  // ══════════════════════════════════════════════════════════

  async cargarMaterias() {
    const uid = this.sesion.usuario?.id; if (!uid) return;
    this.cargandoOpts = true;
    try {
      const { data: rel } = await this.supabase
        .from('academic_asignatura_docentes').select('asignatura_id').eq('user_id', uid);
      const ids = [...new Set((rel || []).map((r: any) => r.asignatura_id))];
      if (!ids.length) return;
      const { data } = await this.supabase.from('academic_asignatura').select('id, nombre').in('id', ids).order('nombre');
      this.materias = data || [];
    } finally { this.cargandoOpts = false; }
  }

  async onMateriaChange(preservarGrupo: number | null = null) {
    if (!preservarGrupo) this.newAct.grupoId = null;
    this.gruposDeMateria = [];
    if (!this.newAct.materiaId) return;
    this.cargandoOpts = true; this.errorOpts = null;
    try {
      const uid = this.sesion.usuario?.id;
      const { data: relGM } = await this.supabase
        .from('academic_asignatura_grupos').select('grupo_id').eq('asignatura_id', this.newAct.materiaId);
      const idsGM = (relGM || []).map((r: any) => r.grupo_id);
      if (!idsGM.length) return;
      const { data: relDG } = await this.supabase
        .from('academic_grupo_docentes').select('grupo_id').eq('user_id', uid).in('grupo_id', idsGM);
      const idsFinal = (relDG || []).map((r: any) => r.grupo_id);
      if (!idsFinal.length) return;
      const { data } = await this.supabase
        .from('academic_grupo').select('id, nombre, grado, aula').in('id', idsFinal).order('grado').order('nombre');
      this.gruposDeMateria = data || [];
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
        const { data, error } = await this.supabase.from('academic_actividad').update(payload).eq('id', this.editingId).select().single();
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
        const { data, error } = await this.supabase.from('academic_actividad').insert(payload).select().single();
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
              // 1) IDs de entregas y preguntas de esta actividad
              const { data: entregas } = await this.supabase
                .from('academic_entregaactividad').select('id').eq('actividad_id', act.id);
              const entregaIds = (entregas || []).map((e: any) => e.id);

              const { data: preguntas } = await this.supabase
                .from('academic_preguntaactividad').select('id').eq('actividad_id', act.id);
              const preguntaIds = (preguntas || []).map((p: any) => p.id);

              // 2) Borrar respuestas de alumnos que dependan de esas entregas o preguntas
              if (entregaIds.length) {
                const { error: e1 } = await this.supabase
                  .from('academic_respuestaalumno').delete().in('entrega_id', entregaIds);
                if (e1) throw e1;
              }
              if (preguntaIds.length) {
                const { error: e2 } = await this.supabase
                  .from('academic_respuestaalumno').delete().in('pregunta_id', preguntaIds);
                if (e2) throw e2;

                // Borrar las opciones antes que las preguntas (FK)
                const { error: eOp } = await this.supabase
                  .from('academic_opcionrespuesta').delete().in('pregunta_id', preguntaIds);
                if (eOp) throw eOp;
              }

              // 3) Borrar entregas y preguntas
              const { error: e3 } = await this.supabase
                .from('academic_entregaactividad').delete().eq('actividad_id', act.id);
              if (e3) throw e3;

              const { error: e4 } = await this.supabase
                .from('academic_preguntaactividad').delete().eq('actividad_id', act.id);
              if (e4) throw e4;

              // 4) Ahora sí, borrar la actividad
              const { error } = await this.supabase
                .from('academic_actividad').delete().eq('id', act.id);
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
    const { error } = await this.supabase.from('academic_actividad').update({ publicada: !act.publicada }).eq('id', act.id);
    if (error) { this.toast('Error.','danger'); return; }
    act.publicada = !act.publicada;
    this.toast(act.publicada ? 'Publicada.' : 'Borrador.','success');
  }

  // ── Archivos ──────────────────────────────
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

  // ── Helpers UI ────────────────────────────
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
