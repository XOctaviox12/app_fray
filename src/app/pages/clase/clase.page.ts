import { Component, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeHtml,SafeResourceUrl  } from '@angular/platform-browser';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService } from '../../services/cloudinary.service';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';


export type BloqueType = 'texto' | 'pdf' | 'video' | 'actividad' | 'imagen' | 'link';

export interface BloqueClase {
  id?: number;
  sesion_id: number;
  tipo: BloqueType;
  contenido: string;
  orden: number;
  titulo?: string;
  activo: boolean;
  creado_en?: string;
}

export const ESTADO_SESION_ACTIVA = 'ACTIVA';
export const ESTADO_SESION_FINALIZADA = 'FINALIZADA';
export const ESTADO_SESION_BORRADOR = 'BORRADOR';

export interface SesionClase {
  id?: number;
  docente_id: number;
  grupo_id: number;
  asignatura_id: number;
  titulo: string;
  estado: string;
  fecha: string;
  creada_en?: string;
}

// Borrador con nombres resueltos para mostrar en la lista, sin tener que
// volver a cruzar tablas cada vez que se pinta la card.
export interface SesionBorrador extends SesionClase {
  grupo_nombre?: string;
  asignatura_nombre?: string;
}

export type PeriodoTipo = 'SEMANA' | 'QUINCENA' | 'MES' | 'BIMESTRE' | 'SEMESTRE' | 'ANUAL';

export interface PlanClase {
  id?: number;
  docente_id: number;
  asignatura_id: number;
  grupo_id: number;
  titulo: string;
  descripcion: string;
  periodo_tipo: PeriodoTipo;
  fecha_inicio: string;
  fecha_fin: string;
  objetivo_general: string;
  competencias: string;
  publicado: boolean;
  creado_en?: string;
  actualizado_en?: string;
  asignatura_nombre?: string;
  grupo_nombre?: string;
  totalTemas?: number;
  temasCompletados?: number;
}

export interface TemaClase {
  id?: number;
  plan_id: number;
  numero: number;
  titulo: string;
  descripcion: string;
  fecha: string | null;
  duracion_min: number;
  recursos: string;
  evaluacion: string;
  completado: boolean;
  notas_docente: string;
}

// ── Actividad estructurada (se guarda como JSON dentro de `contenido`) ──
export type TipoPregunta = 'opcion_multiple' | 'verdadero_falso' | 'respuesta_corta';

export interface PreguntaActividad {
  id: string;
  tipo: TipoPregunta;
  pregunta: string;
  opciones?: string[];        // solo opcion_multiple
  respuestaCorrecta?: number | boolean | string | null;
}

export interface ActividadContenido {
  instrucciones: string;
  preguntas: PreguntaActividad[];
}

// ── Respuesta de un alumno a una pregunta de actividad ──
// Se guarda una fila por (bloque, pregunta, alumno) en Supabase.
export interface RespuestaActividad {
  id?: number;
  bloque_id: number;
  pregunta_id: string;
  alumno_id: number;
  respuesta: string;             // índice como texto (opcion_multiple), 'true'/'false' (vf), o texto libre
  es_correcta: boolean | null;   // null cuando no es autocalificable (respuesta_corta)
  respondido_en?: string;
}

// Resumen de aciertos de una actividad ya enviada, para mostrarle al alumno
// cuántas preguntas autocalificables acertó (respuesta_corta no cuenta aquí).
export interface ResultadoActividad {
  correctas: number;
  calificables: number;
}

@Component({
  standalone: false,
  selector: 'app-clase',
  templateUrl: './clase.page.html',
  styleUrls: ['./clase.page.scss'],
})
export class ClasePage implements OnInit, OnDestroy {

  cargando    = true;
  error: string | null = null;

  segmento: 'planes' | 'vivo' = 'planes';

  // ── EN VIVO ─────────────────────────────────────────
  sesionActiva: SesionClase | null = null;
  bloques: BloqueClase[] = [];

  misGrupos:      any[] = [];
  misAsignaturas: any[] = [];
  grupoSeleccionado:      number | null = null;
  asignaturaSeleccionada: number | null = null;
  tituloSesion = '';

  // ── Reutilizar clase anterior ──
  cargandoReutilizar = false;

  // ── Borradores de clase ──
  misBorradores: SesionBorrador[] = [];
  guardandoBorrador = false;
  publicandoBorrador = false;

  // ── Modal de bloque (crear / editar) ──
  mostrarModalBloque = false;
  editandoBloque: BloqueClase | null = null;
  nuevoBloque: Partial<BloqueClase> = { tipo: 'texto', contenido: '', titulo: '', activo: true };
  guardandoBloque = false;

  // Subida de archivo (pdf/video/imagen)
  modoUrlExterna = false;   // false = subir archivo, true = pegar URL
  archivoSeleccionado: File | null = null;
  subiendoArchivo = false;
  progresoArchivo = 0;
  errorArchivo = '';

  // Preguntas de actividad (estado editable del modal)
  actividadInstrucciones = '';
  preguntasActividad: PreguntaActividad[] = [];


  // ── Actividades — respuestas del alumno ──
  // Todo se guarda en memoria como string para simplificar el enlace con los
  // inputs; se serializa/deserializa según el tipo de pregunta al leer/escribir.
  respuestasAlumno: Record<string, string> = {};              // key: `${bloqueId}_${preguntaId}`
  actividadesEnviadas: Record<number, boolean> = {};          // key: bloqueId
  resultadosActividad: Record<number, ResultadoActividad> = {}; // key: bloqueId
  enviandoActividad: Record<number, boolean> = {};             // key: bloqueId

  // ── Visor de media (imagen / video a pantalla completa) ──
  mediaVisorAbierto = false;
  mediaVisorUrl = '';
  mediaVisorTipo: 'imagen' | 'video' = 'imagen';

  private canal: RealtimeChannel | null = null;
  private supabase: SupabaseClient;
  private asignaturasDocente: number[] = [];

  // ── PLANES DE CLASE ─────────────────────────────────
  vistaPlanes: 'lista' | 'form' | 'detalle' = 'lista';
  planes: PlanClase[] = [];
  planSeleccionado: PlanClase | null = null;
  temasPlan: TemaClase[] = [];

  modoEdicionPlan = false;
  formPlan: Partial<PlanClase> = {};
  guardandoPlan = false;

  mostrarModalTema = false;
  nuevoTema: Partial<TemaClase> = {};
  guardandoTema = false;

  readonly periodos: { value: PeriodoTipo; label: string }[] = [
    { value: 'SEMANA',   label: 'Semanal' },
    { value: 'QUINCENA', label: 'Quincenal' },
    { value: 'MES',      label: 'Mensual' },
    { value: 'BIMESTRE', label: 'Bimestral' },
    { value: 'SEMESTRE', label: 'Semestral' },
    { value: 'ANUAL',    label: 'Anual' },
  ];

  constructor(
    public sesion: SesionService,
    private cloudinary: CloudinaryService,
    private sanitizer: DomSanitizer,
  ) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  ngOnInit()    { this.inicializar(); }
  ngOnDestroy() { this.desuscribir(); }

  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esAlumno():  boolean { return this.sesion.esAlumno(); }

  // El panel de bloques (tipo-btns-row + bloques-container) se muestra igual
  // para una clase EN VIVO y para un borrador en edición — la diferencia es
  // solo de estado interno; los alumnos jamás ven un borrador porque su
  // consulta filtra siempre por estado = ACTIVA.
  get claseEnVivo(): boolean {
    return this.sesionActiva?.estado === ESTADO_SESION_ACTIVA;
  }
  get esBorradorEnEdicion(): boolean {
    return this.sesionActiva?.estado === ESTADO_SESION_BORRADOR;
  }

  // `esRefresh = true` (pull-to-refresh) evita el flash de pantalla completa:
  // el ion-refresher ya muestra su propio spinner, así que aquí no volvemos
  // a tapar todo el contenido con el overlay de "Conectando...".
  async inicializar(esRefresh = false) {
    if (!esRefresh) this.cargando = true;
    this.error = null;
    try {
      if (this.esDocente) {
        await this.cargarGruposDocente();
        await this.buscarSesionActivaDocente();
        await this.cargarBorradores();
        await this.cargarPlanes();
      } else {
        await this.buscarSesionActivaAlumno();
      }
    } finally {
      this.cargando = false;
    }
  }

  cambiarSegmento(event: any) {
    this.segmento = event.detail.value;
    if (this.segmento === 'planes') this.volverALista();
  }

  // ═══════════════════════════════════════════════════
  //  DOCENTE — grupos y asignaturas
  // ═══════════════════════════════════════════════════

  async cargarGruposDocente() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    const { data: relAsig } = await this.supabase
      .from('academic_asignatura_docentes')
      .select('asignatura_id')
      .eq('user_id', docenteId);

    this.asignaturasDocente = (relAsig || []).map((r: any) => r.asignatura_id);
    if (!this.asignaturasDocente.length) { this.misGrupos = []; return; }

    const { data: relGM } = await this.supabase
      .from('academic_asignatura_grupos')
      .select('grupo_id')
      .in('asignatura_id', this.asignaturasDocente);

    const grupoIdsPorMateria = [...new Set((relGM || []).map((r: any) => r.grupo_id))];
    if (!grupoIdsPorMateria.length) { this.misGrupos = []; return; }

    const { data: relGrupos } = await this.supabase
      .from('academic_grupo_docentes')
      .select('grupo_id')
      .eq('user_id', docenteId)
      .in('grupo_id', grupoIdsPorMateria);

    const grupoIdsFinal = [...new Set((relGrupos || []).map((r: any) => r.grupo_id))];
    if (!grupoIdsFinal.length) { this.misGrupos = []; return; }

    const { data: grupos } = await this.supabase
      .from('academic_grupo')
      .select('id, nombre, grado')
      .in('id', grupoIdsFinal)
      .order('grado');

    this.misGrupos = grupos || [];
  }

  async onGrupoChange() {
    this.asignaturaSeleccionada = null;
    this.misAsignaturas = [];

    if (!this.grupoSeleccionado || !this.asignaturasDocente.length) return;

    const { data: relGrupo } = await this.supabase
      .from('academic_asignatura_grupos')
      .select('asignatura_id')
      .eq('grupo_id', this.grupoSeleccionado);

    const asigGrupo = (relGrupo || []).map((r: any) => r.asignatura_id);
    const asigFiltradas = asigGrupo.filter((id: number) => this.asignaturasDocente.includes(id));

    if (!asigFiltradas.length) { this.misAsignaturas = []; return; }

    const { data: asignaturas } = await this.supabase
      .from('academic_asignatura')
      .select('id, nombre, clave')
      .in('id', asigFiltradas)
      .order('nombre');

    this.misAsignaturas = asignaturas || [];
  }

  getLabelAsignatura(a: any): string {
    return a.clave ? `${a.nombre} (${a.clave})` : a.nombre;
  }

  // ═══════════════════════════════════════════════════
  //  EN VIVO — sesión activa
  // ═══════════════════════════════════════════════════

  async buscarSesionActivaDocente() {
    const docenteId = this.sesion.usuario?.id;
    const { data } = await this.supabase
      .from('academic_sesionclase')
      .select('*')
      .eq('docente_id', docenteId)
      .eq('estado', ESTADO_SESION_ACTIVA)
      .order('creada_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      this.sesionActiva = data;
      await this.cargarBloques();
      this.suscribirRealtime();
    } else {
      // Importante: si ya no hay sesión activa (se cerró desde otro lado,
      // o simplemente terminó), hay que limpiar el estado local en vez de
      // dejar la vista mostrando una sesión "fantasma" tras un refresh.
      this.desuscribir();
      this.sesionActiva = null;
      this.bloques = [];
    }
  }

  async buscarSesionActivaAlumno() {
    const alumnoId = this.sesion.usuario?.id;

    const { data: usu } = await this.supabase
      .from('users_user')
      .select('alumno_grupo_id')
      .eq('id', alumnoId)
      .single();

    const grupoId = (usu as any)?.alumno_grupo_id;
    if (!grupoId) {
      this.error = 'No tienes grupo asignado.';
      this.desuscribir();
      this.sesionActiva = null;
      this.bloques = [];
      return;
    }

    const { data } = await this.supabase
      .from('academic_sesionclase')
      .select('*')
      .eq('grupo_id', grupoId)
      .eq('estado', ESTADO_SESION_ACTIVA)
      .order('creada_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      this.sesionActiva = data;
      await this.cargarBloques();
      this.suscribirRealtime();
    } else {
      this.desuscribir();
      this.sesionActiva = null;
      this.bloques = [];
    }
  }

  async iniciarSesion() {
    if (!this.grupoSeleccionado || !this.asignaturaSeleccionada || !this.tituloSesion.trim()) return;

    const nueva: Omit<SesionClase, 'id' | 'creada_en'> = {
      docente_id:    this.sesion.usuario!.id,
      grupo_id:      this.grupoSeleccionado,
      asignatura_id: this.asignaturaSeleccionada,
      titulo:        this.tituloSesion.trim(),
      estado:        ESTADO_SESION_ACTIVA,
      fecha:         new Date().toISOString().split('T')[0],
    };

    const { data, error } = await this.supabase
      .from('academic_sesionclase')
      .insert(nueva)
      .select()
      .single();

    if (error) {
      console.error('Error insertando sesión:', error.message);
      return;
    }

    this.sesionActiva = data;
    this.bloques = [];
    this.suscribirRealtime();
  }

  async terminarSesion() {
    if (!this.sesionActiva?.id) return;
    await this.supabase
      .from('academic_sesionclase')
      .update({ estado: ESTADO_SESION_FINALIZADA })
      .eq('id', this.sesionActiva.id);

    this.desuscribir();
    this.sesionActiva = null;
    this.bloques = [];
    this.tituloSesion = '';
    this.grupoSeleccionado = null;
    this.asignaturaSeleccionada = null;
    this.misAsignaturas = [];
  }

  // ─────────────────────────────────────────────
  // BORRADORES (guardar la configuración de una clase para iniciarla después)
  // ─────────────────────────────────────────────

  async cargarBorradores() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    const { data, error } = await this.supabase
      .from('academic_sesionclase')
      .select('*')
      .eq('docente_id', docenteId)
      .eq('estado', ESTADO_SESION_BORRADOR)
      .order('creada_en', { ascending: false });

    if (error) {
      console.error('Error cargando borradores:', error.message);
      this.misBorradores = [];
      return;
    }

    const borradores = data || [];
    if (!borradores.length) { this.misBorradores = []; return; }

    const grupoIds = [...new Set(borradores.map((b: any) => b.grupo_id))];
    const asigIds  = [...new Set(borradores.map((b: any) => b.asignatura_id))];

    let grupoMap: Record<number, string> = {};
    let asigMap:  Record<number, string> = {};

    if (grupoIds.length) {
      const { data: grupos } = await this.supabase
        .from('academic_grupo')
        .select('id, nombre, grado')
        .in('id', grupoIds);
      (grupos || []).forEach((g: any) => { grupoMap[g.id] = `${g.grado}° — Grupo ${g.nombre}`; });
    }
    if (asigIds.length) {
      const { data: asigs } = await this.supabase
        .from('academic_asignatura')
        .select('id, nombre')
        .in('id', asigIds);
      (asigs || []).forEach((a: any) => { asigMap[a.id] = a.nombre; });
    }

    this.misBorradores = borradores.map((b: any) => ({
      ...b,
      grupo_nombre:      grupoMap[b.grupo_id]       || 'Grupo no encontrado',
      asignatura_nombre: asigMap[b.asignatura_id]   || 'Materia no encontrada',
    }));
  }

  // Guarda la configuración actual del formulario (grupo, materia, título)
  // como borrador, sin activarla ni notificar a los alumnos.
  async guardarBorrador() {
    if (!this.grupoSeleccionado || !this.asignaturaSeleccionada || !this.tituloSesion.trim()) return;
    this.guardandoBorrador = true;

    const nuevo: Omit<SesionClase, 'id' | 'creada_en'> = {
      docente_id:    this.sesion.usuario!.id,
      grupo_id:      this.grupoSeleccionado,
      asignatura_id: this.asignaturaSeleccionada,
      titulo:        this.tituloSesion.trim(),
      estado:        ESTADO_SESION_BORRADOR,
      fecha:         new Date().toISOString().split('T')[0],
    };

    const { error } = await this.supabase
      .from('academic_sesionclase')
      .insert(nuevo);

    this.guardandoBorrador = false;

    if (error) {
      console.error('Error guardando borrador:', error.message);
      alert('No se pudo guardar el borrador: ' + error.message);
      return;
    }

    // Limpiar el formulario y refrescar la lista
    this.tituloSesion = '';
    this.grupoSeleccionado = null;
    this.asignaturaSeleccionada = null;
    this.misAsignaturas = [];
    await this.cargarBorradores();
  }

  // Abre el borrador en el MISMO panel que una clase en vivo (botones de
  // texto/pdf/video/imagen/link/actividad + lista de bloques) para que el
  // docente pueda preparar el contenido con calma. El estado sigue siendo
  // BORRADOR, así que los alumnos no ven nada todavía — su consulta solo
  // trae sesiones con estado = ACTIVA.
  async abrirBorrador(b: SesionBorrador) {
    if (!b.id || this.sesionActiva) return;

    this.sesionActiva = { ...b };
    this.bloques = [];
    await this.cargarBloques();
    this.suscribirRealtime();
  }

  // Convierte el borrador que se está editando en sesión ACTIVA — a partir
  // de este momento los alumnos sí ven el título y el contenido ya cargado.
  async publicarBorrador() {
    if (!this.sesionActiva?.id || this.sesionActiva.estado !== ESTADO_SESION_BORRADOR) return;
    this.publicandoBorrador = true;

    const { data, error } = await this.supabase
      .from('academic_sesionclase')
      .update({
        estado: ESTADO_SESION_ACTIVA,
        fecha: new Date().toISOString().split('T')[0],
      })
      .eq('id', this.sesionActiva.id)
      .select()
      .single();

    this.publicandoBorrador = false;

    if (error) {
      console.error('Error publicando borrador:', error.message);
      alert('No se pudo publicar la clase: ' + error.message);
      return;
    }

    this.sesionActiva = data;
    this.misBorradores = this.misBorradores.filter(x => x.id !== data.id);
  }

  // Sale del modo edición sin publicar. El borrador y todo lo que ya se
  // agregó (bloques) quedan guardados tal cual para retomarlos después.
  salirDeBorrador() {
    this.desuscribir();
    this.sesionActiva = null;
    this.bloques = [];
  }

  async eliminarBorrador(b: SesionBorrador) {
    if (!b.id) return;
    const { error } = await this.supabase
      .from('academic_sesionclase')
      .delete()
      .eq('id', b.id);

    if (error) {
      console.error('Error eliminando borrador:', error.message);
      return;
    }
    this.misBorradores = this.misBorradores.filter(x => x.id !== b.id);
  }

  // ─────────────────────────────────────────────
  // REUTILIZAR ÚLTIMA CLASE (sin tabla nueva)
  // ─────────────────────────────────────────────
  async reutilizarUltimaClase() {
    if (!this.sesionActiva?.id) return;
    this.cargandoReutilizar = true;

    try {
      const { data: anterior, error: eAnt } = await this.supabase
        .from('academic_sesionclase')
        .select('id')
        .eq('docente_id', this.sesion.usuario!.id)
        .eq('grupo_id', this.sesionActiva.grupo_id)
        .eq('asignatura_id', this.sesionActiva.asignatura_id)
        .eq('estado', ESTADO_SESION_FINALIZADA)
        .neq('id', this.sesionActiva.id)
        .order('creada_en', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (eAnt) throw eAnt;
      if (!anterior) {
        alert('No hay una clase anterior de este grupo y materia para reutilizar.');
        return;
      }

      const { data: bloquesAnteriores, error: eBloq } = await this.supabase
        .from('academic_bloqueclase')
        .select('*')
        .eq('sesion_id', anterior.id)
        .eq('activo', true)
        .order('orden');

      if (eBloq) throw eBloq;
      if (!bloquesAnteriores?.length) {
        alert('La clase anterior no tenía contenido guardado.');
        return;
      }

      const copias = bloquesAnteriores.map((b: any) => ({
        sesion_id: this.sesionActiva!.id,
        tipo: b.tipo,
        contenido: b.contenido,
        orden: b.orden,
        titulo: b.titulo || '',
        activo: true,
        creado_en: new Date().toISOString(),
      }));

      const { error: eIns } = await this.supabase
        .from('academic_bloqueclase')
        .insert(copias);

      if (eIns) throw eIns;
      await this.cargarBloques();
    } catch (e: any) {
      console.error('Error reutilizando clase anterior:', e.message);
      alert('No se pudo reutilizar la clase anterior: ' + e.message);
    } finally {
      this.cargandoReutilizar = false;
    }
  }

  // ═══════════════════════════════════════════════════
  //  BLOQUES (en vivo)
  // ═══════════════════════════════════════════════════

  async cargarBloques() {
    if (!this.sesionActiva?.id) return;
    const { data } = await this.supabase
      .from('academic_bloqueclase')
      .select('*')
      .eq('sesion_id', this.sesionActiva.id)
      .eq('activo', true)
      .order('orden');

    this.bloques = data || [];

    // El alumno puede volver a entrar a una sesión ya iniciada, o refrescar
    // la página, así que hay que traer sus respuestas previas para no dejar
    // las actividades "en blanco" ni permitir reenviar una ya contestada.
    if (this.esAlumno) {
      await this.cargarRespuestasActividades();
    }
  }

  // ═══════════════════════════════════════════════════
  //  ACTIVIDADES — respuestas del alumno
  // ═══════════════════════════════════════════════════

  private async cargarRespuestasActividades() {
    const alumnoId = this.sesion.usuario?.id;
    const bloqueIds = this.bloques
      .filter(b => b.tipo === 'actividad' && b.id)
      .map(b => b.id!);

    if (!alumnoId || !bloqueIds.length) return;

    const { data, error } = await this.supabase
      .from('academic_respuestaactividad')
      .select('*')
      .eq('alumno_id', alumnoId)
      .in('bloque_id', bloqueIds);

    if (error) {
      console.error('Error cargando respuestas de actividad:', error.message);
      return;
    }

    const respuestas = data || [];

    respuestas.forEach((r: any) => {
      this.respuestasAlumno[this.respuestaKey(r.bloque_id, r.pregunta_id)] = r.respuesta;
    });

    // Si ya existe al menos una respuesta guardada para un bloque, lo damos
    // por enviado (no se puede volver a contestar) y recalculamos el
    // resumen de aciertos para mostrarlo de inmediato.
    bloqueIds.forEach(bid => {
      const respuestasBloque = respuestas.filter((r: any) => r.bloque_id === bid);
      if (!respuestasBloque.length) return;

      this.actividadesEnviadas[bid] = true;
      const calificables = respuestasBloque.filter((r: any) => r.es_correcta !== null);
      const correctas = calificables.filter((r: any) => r.es_correcta === true);
      this.resultadosActividad[bid] = {
        correctas: correctas.length,
        calificables: calificables.length,
      };
    });
  }

  respuestaKey(bloqueId: number, preguntaId: string): string {
    return `${bloqueId}_${preguntaId}`;
  }

  getRespuestaOpcion(bloqueId: number, preguntaId: string): number | null {
    const v = this.respuestasAlumno[this.respuestaKey(bloqueId, preguntaId)];
    return (v === undefined || v === '') ? null : Number(v);
  }

  getRespuestaVF(bloqueId: number, preguntaId: string): boolean | null {
    const v = this.respuestasAlumno[this.respuestaKey(bloqueId, preguntaId)];
    if (v === undefined || v === '') return null;
    return v === 'true';
  }

  getRespuestaTexto(bloqueId: number, preguntaId: string): string {
    return this.respuestasAlumno[this.respuestaKey(bloqueId, preguntaId)] || '';
  }

  setRespuestaOpcion(bloqueId: number, preguntaId: string, index: number) {
    if (this.actividadesEnviadas[bloqueId]) return;
    this.respuestasAlumno[this.respuestaKey(bloqueId, preguntaId)] = String(index);
  }

  setRespuestaVF(bloqueId: number, preguntaId: string, valor: boolean) {
    if (this.actividadesEnviadas[bloqueId]) return;
    this.respuestasAlumno[this.respuestaKey(bloqueId, preguntaId)] = String(valor);
  }

  setRespuestaTexto(bloqueId: number, preguntaId: string, valor: string) {
    if (this.actividadesEnviadas[bloqueId]) return;
    this.respuestasAlumno[this.respuestaKey(bloqueId, preguntaId)] = valor;
  }

  // Exige que todas las preguntas tengan respuesta antes de habilitar "Enviar".
  actividadListaParaEnviar(bloque: BloqueClase): boolean {
    if (!bloque.id || this.actividadesEnviadas[bloque.id]) return false;
    const act = this.parsearActividad(bloque.contenido);
    if (!act.preguntas.length) return false;

    return act.preguntas.every(p => {
      const v = this.respuestasAlumno[this.respuestaKey(bloque.id!, p.id)];
      return v !== undefined && v !== '';
    });
  }

  async enviarActividad(bloque: BloqueClase) {
    const alumnoId = this.sesion.usuario?.id;
    if (!alumnoId || !bloque.id) return;
    if (this.actividadesEnviadas[bloque.id]) return;
    if (!this.actividadListaParaEnviar(bloque)) return;

    this.enviandoActividad[bloque.id] = true;
    const act = this.parsearActividad(bloque.contenido);

    const filas: RespuestaActividad[] = act.preguntas.map(p => {
      const valor = this.respuestasAlumno[this.respuestaKey(bloque.id!, p.id)];
      let esCorrecta: boolean | null = null;

      if (p.tipo === 'opcion_multiple' && typeof p.respuestaCorrecta === 'number') {
        esCorrecta = Number(valor) === p.respuestaCorrecta;
      } else if (p.tipo === 'verdadero_falso' && typeof p.respuestaCorrecta === 'boolean') {
        esCorrecta = (valor === 'true') === p.respuestaCorrecta;
      }
      // respuesta_corta no se autocalifica: es_correcta queda en null.

      return {
        bloque_id: bloque.id!,
        pregunta_id: p.id,
        alumno_id: alumnoId,
        respuesta: valor,
        es_correcta: esCorrecta,
        respondido_en: new Date().toISOString(),
      };
    });

    const { error } = await this.supabase
      .from('academic_respuestaactividad')
      .upsert(filas, { onConflict: 'bloque_id,pregunta_id,alumno_id' });

    this.enviandoActividad[bloque.id] = false;

    if (error) {
      console.error('Error enviando actividad:', error.message);
      alert('No se pudo enviar tu actividad: ' + error.message);
      return;
    }

    this.actividadesEnviadas[bloque.id] = true;
    const calificables = filas.filter(f => f.es_correcta !== null);
    const correctas = calificables.filter(f => f.es_correcta === true);
    this.resultadosActividad[bloque.id] = {
      correctas: correctas.length,
      calificables: calificables.length,
    };
  }

  // ── Abrir modal para CREAR ──
  abrirModalBloque(tipo: BloqueType = 'texto') {
    this.editandoBloque = null;
    this.nuevoBloque = {
      tipo,
      contenido: '',
      titulo: '',
      activo: true,
      orden: this.bloques.length + 1,
      sesion_id: this.sesionActiva!.id!,
    };
    this.resetEstadoArchivo();
    this.resetEstadoActividad();
    this.mostrarModalBloque = true;
  }

  // ── Abrir modal para EDITAR ──
  editarBloque(b: BloqueClase) {
    this.editandoBloque = b;
    this.nuevoBloque = { ...b };
    this.resetEstadoArchivo();

    if (b.tipo === 'actividad') {
      this.cargarActividadEnFormulario(b.contenido);
    } else {
      this.resetEstadoActividad();
      // Si el contenido ya es una URL (viene de una subida previa o link externo),
      // lo mostramos en modo "URL externa" para que se pueda editar como texto.
      if (['pdf', 'video', 'imagen'].includes(b.tipo)) {
        this.modoUrlExterna = true;
      }
    }
    this.mostrarModalBloque = true;
  }

  cerrarModal() {
    this.mostrarModalBloque = false;
    this.editandoBloque = null;
    this.resetEstadoArchivo();
    this.resetEstadoActividad();
  }

  private resetEstadoArchivo() {
    this.modoUrlExterna = false;
    this.archivoSeleccionado = null;
    this.subiendoArchivo = false;
    this.progresoArchivo = 0;
    this.errorArchivo = '';
  }

  private resetEstadoActividad() {
    this.actividadInstrucciones = '';
    this.preguntasActividad = [];
  }

  toggleModoUrl() {
    this.modoUrlExterna = !this.modoUrlExterna;
    this.archivoSeleccionado = null;
    this.errorArchivo = '';
  }

  // ── Selección y subida de archivo (pdf/video/imagen) ──
  onArchivoSeleccionado(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const maxMB = this.nuevoBloque.tipo === 'video' ? 100 : 20;
    if (file.size / 1048576 > maxMB) {
      this.errorArchivo = `El archivo supera ${maxMB}MB.`;
      input.value = '';
      return;
    }

    this.archivoSeleccionado = file;
    this.errorArchivo = '';
  }

  quitarArchivoSeleccionado() {
    this.archivoSeleccionado = null;
  }

  // ── Preguntas de actividad ──
  agregarPregunta(tipo: TipoPregunta) {
    const nueva: PreguntaActividad = {
      id: `p${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tipo,
      pregunta: '',
      opciones: tipo === 'opcion_multiple' ? ['', ''] : undefined,
      respuestaCorrecta: tipo === 'verdadero_falso' ? true : (tipo === 'opcion_multiple' ? 0 : ''),
    };
    this.preguntasActividad.push(nueva);
  }

  quitarPregunta(i: number) {
    this.preguntasActividad.splice(i, 1);
  }

  agregarOpcion(pregunta: PreguntaActividad) {
    if (!pregunta.opciones) pregunta.opciones = [];
    pregunta.opciones.push('');
  }

  quitarOpcion(pregunta: PreguntaActividad, i: number) {
    pregunta.opciones?.splice(i, 1);
    if (typeof pregunta.respuestaCorrecta === 'number' && pregunta.respuestaCorrecta >= (pregunta.opciones?.length || 0)) {
      pregunta.respuestaCorrecta = 0;
    }
  }

  private cargarActividadEnFormulario(contenidoRaw: string) {
    try {
      const parsed: ActividadContenido = JSON.parse(contenidoRaw);
      this.actividadInstrucciones = parsed.instrucciones || '';
      this.preguntasActividad = parsed.preguntas || [];
    } catch {
      // Contenido viejo en texto plano (antes de este cambio): lo tratamos
      // como instrucciones sin preguntas, para no perder el dato existente.
      this.actividadInstrucciones = contenidoRaw || '';
      this.preguntasActividad = [];
    }
  }

  private serializarActividad(): string {
    const data: ActividadContenido = {
      instrucciones: this.actividadInstrucciones.trim(),
      preguntas: this.preguntasActividad
        .filter(p => p.pregunta.trim())
        .map(p => ({
          ...p,
          opciones: p.opciones?.map(o => o.trim()).filter(Boolean),
        })),
    };
    return JSON.stringify(data);
  }

  actividadValida(): boolean {
    if (!this.actividadInstrucciones.trim() && this.preguntasActividad.length === 0) return false;
    for (const p of this.preguntasActividad) {
      if (!p.pregunta.trim()) return false;
      if (p.tipo === 'opcion_multiple') {
        const validas = (p.opciones || []).filter(o => o.trim());
        if (validas.length < 2) return false;
      }
    }
    return true;
  }

  // ── Guardar (crear o actualizar) ──
  async guardarBloque() {
    const tipo = this.nuevoBloque.tipo!;

    // Validaciones por tipo
    if (tipo === 'texto' && !this.nuevoBloque.contenido?.trim()) return;
    if (tipo === 'link' && !this.nuevoBloque.contenido?.trim()) return;
    if (tipo === 'actividad' && !this.actividadValida()) return;
    if (['pdf', 'video', 'imagen'].includes(tipo)) {
      const hayUrl = this.modoUrlExterna && this.nuevoBloque.contenido?.trim();
      const hayArchivoNuevo = !this.modoUrlExterna && this.archivoSeleccionado;
      const hayContenidoPrevio = !!this.editandoBloque && !hayArchivoNuevo && !!this.nuevoBloque.contenido;
      if (!hayUrl && !hayArchivoNuevo && !hayContenidoPrevio) return;
    }

    this.guardandoBloque = true;

    try {
      let contenidoFinal = this.nuevoBloque.contenido || '';

      if (tipo === 'actividad') {
        contenidoFinal = this.serializarActividad();
      } else if (['pdf', 'video', 'imagen'].includes(tipo) && !this.modoUrlExterna && this.archivoSeleccionado) {
        this.subiendoArchivo = true;
        const subido = await this.cloudinary.subirArchivo(
          this.archivoSeleccionado,
          pct => this.progresoArchivo = pct
        );
        contenidoFinal = tipo === 'video' ? this.transformarVideoUrl(subido.url) : subido.url;
        this.subiendoArchivo = false;
      }

      if (this.editandoBloque) {
        const { error } = await this.supabase
          .from('academic_bloqueclase')
          .update({
            titulo: this.nuevoBloque.titulo || '',
            contenido: contenidoFinal,
          })
          .eq('id', this.editandoBloque.id!);
        if (error) throw error;
      } else {
        const { error } = await this.supabase
          .from('academic_bloqueclase')
          .insert({
            sesion_id: this.nuevoBloque.sesion_id,
            tipo,
            contenido: contenidoFinal,
            titulo: this.nuevoBloque.titulo || '',
            orden: this.nuevoBloque.orden,
            activo: true,
            creado_en: new Date().toISOString(),
          });
        if (error) throw error;
      }

      this.mostrarModalBloque = false;
      this.editandoBloque = null;
      await this.cargarBloques();
    } catch (e: any) {
      console.error('Error guardando bloque:', e.message);
      this.errorArchivo = 'No se pudo guardar: ' + e.message;
    } finally {
      this.guardandoBloque = false;
      this.subiendoArchivo = false;
    }
  }

  async eliminarBloque(bloque: BloqueClase) {
    await this.supabase
      .from('academic_bloqueclase')
      .update({ activo: false })
      .eq('id', bloque.id!);
    this.bloques = this.bloques.filter(b => b.id !== bloque.id);
  }

  // ── Helpers para render de actividad en la lista de bloques ──
  parsearActividad(contenidoRaw: string): ActividadContenido {
    try {
      return JSON.parse(contenidoRaw);
    } catch {
      return { instrucciones: contenidoRaw || '', preguntas: [] };
    }
  }

  etiquetaTipoPregunta(tipo: TipoPregunta): string {
    const map: Record<TipoPregunta, string> = {
      opcion_multiple: 'Opción múltiple',
      verdadero_falso: 'Verdadero / Falso',
      respuesta_corta: 'Respuesta corta',
    };
    return map[tipo];
  }

  // ═══════════════════════════════════════════════════
  //  TEXTO CON ENLACES AUTOMÁTICOS + VISOR DE MEDIA
  // ═══════════════════════════════════════════════════

  // Convierte URLs sueltas dentro de un bloque de texto en enlaces
  // clickeables. Se escapa el texto primero para no introducir HTML
  // arbitrario, y el resultado se marca como seguro solo después de
  // haber sido construido por nosotros mismos.
  linkify(texto: string): SafeHtml {
    if (!texto) return this.sanitizer.bypassSecurityTrustHtml('');

    const escapado = texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const urlRegex = /((https?:\/\/|www\.)[^\s<]+)/gi;
    const conLinks = escapado.replace(urlRegex, (match) => {
      const href = match.startsWith('http') ? match : `https://${match}`;
      return `<a href="${href}" target="_blank" rel="noopener" class="texto-link-inline">${match}</a>`;
    });

    return this.sanitizer.bypassSecurityTrustHtml(conLinks);
  }

  // Nombre de dominio amigable para mostrar en los bloques tipo "link"
  // (ej. "docs.google.com" en vez de la URL completa).
  hostnameDe(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  abrirMedia(url: string, tipo: 'imagen' | 'video') {
    this.mediaVisorUrl = url;
    this.mediaVisorTipo = tipo;
    this.mediaVisorAbierto = true;
  }

  cerrarMedia() {
    this.mediaVisorAbierto = false;
    this.mediaVisorUrl = '';
  }

  // ═══════════════════════════════════════════════════
  //  REALTIME
  // ═══════════════════════════════════════════════════

  suscribirRealtime() {
    if (!this.sesionActiva?.id) return;
    this.desuscribir();

    this.canal = this.supabase
      .channel(`clase-${this.sesionActiva.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'academic_bloqueclase',
        filter: `sesion_id=eq.${this.sesionActiva.id}`,
      }, () => { this.cargarBloques(); })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'academic_sesionclase',
        filter: `id=eq.${this.sesionActiva!.id}`,
      }, (payload: any) => {
        if (payload.new?.estado !== ESTADO_SESION_ACTIVA) {
          this.sesionActiva = null;
          this.bloques = [];
          this.desuscribir();
        }
      })
      .subscribe();
  }

  desuscribir() {
    if (this.canal) {
      this.supabase.removeChannel(this.canal);
      this.canal = null;
    }
  }

  // ═══════════════════════════════════════════════════
  //  PLANES DE CLASE — lista
  // ═══════════════════════════════════════════════════

  async cargarPlanes() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    const { data: planesRaw } = await this.supabase
      .from('academic_planclase')
      .select('*')
      .eq('docente_id', docenteId)
      .order('fecha_inicio', { ascending: false });

    const planes = planesRaw || [];
    if (!planes.length) { this.planes = []; return; }

    const asigIds  = [...new Set(planes.map((p: any) => p.asignatura_id))];
    const grupoIds = [...new Set(planes.map((p: any) => p.grupo_id))];
    const planIds  = planes.map((p: any) => p.id);

    let asigMap: Record<number, string>  = {};
    let grupoMap: Record<number, string> = {};

    if (asigIds.length) {
      const { data: asigs } = await this.supabase
        .from('academic_asignatura').select('id, nombre').in('id', asigIds);
      (asigs || []).forEach((a: any) => { asigMap[a.id] = a.nombre; });
    }
    if (grupoIds.length) {
      const { data: grupos } = await this.supabase
        .from('academic_grupo').select('id, nombre, grado').in('id', grupoIds);
      (grupos || []).forEach((g: any) => { grupoMap[g.id] = `${g.grado}°${g.nombre}`; });
    }

    let temasPorPlan: Record<number, { total: number; completados: number }> = {};
    const { data: temas } = await this.supabase
      .from('academic_temaclase').select('plan_id, completado').in('plan_id', planIds);
    (temas || []).forEach((t: any) => {
      if (!temasPorPlan[t.plan_id]) temasPorPlan[t.plan_id] = { total: 0, completados: 0 };
      temasPorPlan[t.plan_id].total++;
      if (t.completado) temasPorPlan[t.plan_id].completados++;
    });

    this.planes = planes.map((p: any) => ({
      ...p,
      asignatura_nombre: asigMap[p.asignatura_id]  || '—',
      grupo_nombre:      grupoMap[p.grupo_id]       || '—',
      totalTemas:        temasPorPlan[p.id]?.total       || 0,
      temasCompletados:  temasPorPlan[p.id]?.completados || 0,
    }));
  }

  progresoPlan(p: PlanClase): number {
    if (!p.totalTemas) return 0;
    return Math.round((p.temasCompletados! / p.totalTemas!) * 100);
  }

  periodoLabel(tipo: PeriodoTipo): string {
    return this.periodos.find(p => p.value === tipo)?.label || tipo;
  }

  abrirNuevoPlan() {
    this.modoEdicionPlan = false;
    this.formPlan = { periodo_tipo: 'MES' };
    this.grupoSeleccionado = null;
    this.asignaturaSeleccionada = null;
    this.misAsignaturas = [];
    this.vistaPlanes = 'form';
  }

  async editarPlanExistente(p: PlanClase) {
    this.modoEdicionPlan = true;
    this.formPlan = { ...p };
    this.grupoSeleccionado = p.grupo_id;
    await this.onGrupoChange();
    this.asignaturaSeleccionada = p.asignatura_id;
    this.vistaPlanes = 'form';
  }

  cancelarFormPlan() {
    this.vistaPlanes = this.modoEdicionPlan && this.formPlan.id ? 'detalle' : 'lista';
  }

  formPlanValido(): boolean {
    return !!(
      this.grupoSeleccionado &&
      this.asignaturaSeleccionada &&
      this.formPlan.titulo?.trim() &&
      this.formPlan.fecha_inicio &&
      this.formPlan.fecha_fin &&
      this.formPlan.fecha_inicio < this.formPlan.fecha_fin
    );
  }

  async guardarPlan(publicar: boolean) {
    if (!this.formPlanValido()) return;
    this.guardandoPlan = true;

    const payload = {
      docente_id:       this.sesion.usuario!.id,
      grupo_id:         this.grupoSeleccionado,
      asignatura_id:    this.asignaturaSeleccionada,
      titulo:           this.formPlan.titulo!.trim(),
      descripcion:      this.formPlan.descripcion || '',
      periodo_tipo:     this.formPlan.periodo_tipo || 'MES',
      fecha_inicio:     this.formPlan.fecha_inicio,
      fecha_fin:        this.formPlan.fecha_fin,
      objetivo_general: this.formPlan.objetivo_general || '',
      competencias:     this.formPlan.competencias || '',
      publicado:        publicar,
    };

    let planId = this.formPlan.id;

    if (this.modoEdicionPlan && planId) {
      await this.supabase.from('academic_planclase').update(payload).eq('id', planId);
    } else {
      const { data, error } = await this.supabase
        .from('academic_planclase').insert(payload).select().single();
      if (error) { console.error(error); this.guardandoPlan = false; return; }
      planId = (data as any)?.id;
    }

    this.guardandoPlan = false;
    await this.cargarPlanes();

    const actualizado = this.planes.find(p => p.id === planId);
    if (actualizado) this.abrirDetallePlan(actualizado);
    else this.vistaPlanes = 'lista';
  }

  async togglePublicadoPlan(p: PlanClase) {
    const nuevo = !p.publicado;
    await this.supabase.from('academic_planclase').update({ publicado: nuevo }).eq('id', p.id!);
    p.publicado = nuevo;
    const seleccionado = this.planSeleccionado;
    if (seleccionado && seleccionado.id === p.id) {
      seleccionado.publicado = nuevo;
    }
  }

  async eliminarPlan(p: PlanClase) {
    await this.supabase.from('academic_planclase').delete().eq('id', p.id!);
    this.planes = this.planes.filter(x => x.id !== p.id);
    this.volverALista();
  }

  async abrirDetallePlan(p: PlanClase) {
    this.planSeleccionado = p;
    this.vistaPlanes = 'detalle';
    await this.cargarTemas();
  }

  volverALista() {
    this.vistaPlanes = 'lista';
    this.planSeleccionado = null;
    this.temasPlan = [];
  }

  async cargarTemas() {
    if (!this.planSeleccionado?.id) return;
    const { data } = await this.supabase
      .from('academic_temaclase')
      .select('*')
      .eq('plan_id', this.planSeleccionado.id)
      .order('numero');
    this.temasPlan = data || [];
  }

  get siguienteNumeroTema(): number {
    if (!this.temasPlan.length) return 1;
    return Math.max(...this.temasPlan.map(t => t.numero)) + 1;
  }

  abrirModalTema() {
    this.nuevoTema = {
      numero: this.siguienteNumeroTema,
      duracion_min: 50,
      titulo: '', descripcion: '', recursos: '', evaluacion: '',
      fecha: null,
    };
    this.mostrarModalTema = true;
  }

  cerrarModalTema() { this.mostrarModalTema = false; }

  async guardarTema() {
    if (!this.nuevoTema.titulo?.trim() || !this.nuevoTema.numero || !this.planSeleccionado?.id) return;
    this.guardandoTema = true;

    const { error } = await this.supabase.from('academic_temaclase').insert({
      plan_id:       this.planSeleccionado.id,
      numero:        this.nuevoTema.numero,
      titulo:        this.nuevoTema.titulo.trim(),
      descripcion:   this.nuevoTema.descripcion || '',
      fecha:         this.nuevoTema.fecha || null,
      duracion_min:  this.nuevoTema.duracion_min || 50,
      recursos:      this.nuevoTema.recursos || '',
      evaluacion:    this.nuevoTema.evaluacion || '',
      completado:    false,
    });

    this.guardandoTema = false;
    if (!error) {
      this.mostrarModalTema = false;
      await this.cargarTemas();
      await this.cargarPlanes();
    } else {
      console.error('Error guardando tema:', error.message);
    }
  }

  async toggleTemaCompletado(t: TemaClase) {
    const nuevo = !t.completado;
    t.completado = nuevo;
    await this.supabase.from('academic_temaclase').update({ completado: nuevo }).eq('id', t.id!);
    await this.cargarPlanes();
  }

  async eliminarTema(t: TemaClase) {
    await this.supabase.from('academic_temaclase').delete().eq('id', t.id!);
    this.temasPlan = this.temasPlan.filter(x => x.id !== t.id);
    await this.cargarPlanes();
  }

  // ═══════════════════════════════════════════════════
  //  HELPERS UI (en vivo)
  // ═══════════════════════════════════════════════════

  iconoBloque(tipo: BloqueType): string {
    const map: Record<BloqueType, string> = {
      texto: 'document-text-outline', pdf: 'document-outline',
      video: 'videocam-outline', actividad: 'checkmark-done-outline',
      imagen: 'image-outline', link: 'link-outline',
    };
    return map[tipo] ?? 'cube-outline';
  }

  etiquetaTipo(tipo: BloqueType): string {
    const map: Record<BloqueType, string> = {
      texto: 'Texto', pdf: 'PDF', video: 'Video',
      actividad: 'Actividad', imagen: 'Imagen', link: 'Enlace',
    };
    return map[tipo] ?? tipo;
  }

  esYoutube(url: string): boolean {
    return url?.includes('youtube.com') || url?.includes('youtu.be');
  }

youtubeEmbed(url: string): SafeResourceUrl {
  let embedUrl = url;
  if (url.includes('youtu.be/')) {
    embedUrl = `https://www.youtube.com/embed/${url.split('youtu.be/')[1].split('?')[0]}`;
  } else if (url.includes('v=')) {
    embedUrl = `https://www.youtube.com/embed/${url.split('v=')[1].split('&')[0]}`;
  }
  return this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
}
// Devuelve la URL "watch" normal (no embed) para abrir en la app nativa de YouTube.
// iOS la intercepta como Universal Link si la app está instalada.
youtubeWatchUrl(url: string): string {
  if (url.includes('youtu.be/')) {
    const id = url.split('youtu.be/')[1].split('?')[0];
    return `https://www.youtube.com/watch?v=${id}`;
  }
  if (url.includes('v=')) {
    const id = url.split('v=')[1].split('&')[0];
    return `https://www.youtube.com/watch?v=${id}`;
  }
  return url;
}
// Fuerza a Cloudinary a servir siempre el video como MP4/H.264/AAC.
private transformarVideoUrl(url: string): string {
  return url.replace('/video/upload/', '/video/upload/f_mp4,vc_h264,ac_aac/');
}

  trackBloque(_: number, b: BloqueClase) { return b.id; }
  trackPlan(_: number, p: PlanClase)     { return p.id; }
  trackTema(_: number, t: TemaClase)     { return t.id; }
  trackBorrador(_: number, b: SesionBorrador) { return b.id; }
  trackPregunta(_: number, p: PreguntaActividad) { return p.id; }

  doRefresh(event: any) {
    this.inicializar(true).then(() => event.target.complete());
  }
}
