import { Component, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeHtml,SafeResourceUrl  } from '@angular/platform-browser';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService } from '../../services/cloudinary.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';
import { ActividadSyncService } from '../../services/actividad-sync.service';
import { Router } from '@angular/router';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
//                                      ^^^^^^^^^^^^^^ debe estar
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
  publicado_en?: string | null;
}

export const HORAS_LIMITE_ACTIVIDAD = 24;
export const ESTADO_SESION_ACTIVA = 'ACTIVA';
export const ESTADO_SESION_FINALIZADA = 'FINALIZADA';
export const ESTADO_SESION_BORRADOR = 'BORRADOR';

// Días que una clase FINALIZADA sigue siendo visible (modo lectura) para el
// alumno antes de que el job de limpieza la elimine definitivamente.
export const DIAS_VISIBILIDAD_FINALIZADA = 3;

// Sección de clases finalizadas agrupadas por materia — para el listado
// que ve el alumno cuando no hay clase en vivo.
export interface SeccionMateriaFinalizada {
  asignatura_id: number;
  asignatura_nombre: string;
  sesiones: SesionClase[];
}
export interface SesionClase {
  id?: number;
  docente_id: number;
  grupo_id: number;
  asignatura_id: number;
  titulo: string;
  estado: string;
  fecha: string;
  creada_en?: string;
  finalizada_en?: string | null;
  asignatura_nombre?: string;
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
  materiasFinalizadasSecciones: SeccionMateriaFinalizada[] = [];

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
  private actividadSync: ActividadSyncService,
  private router: Router,
  private toastCtrl: ToastController
) {}

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

  // Clase ya terminada pero todavía dentro de la ventana de gracia — se
  // muestra en modo lectura (sin poder enviar actividades).
  get sesionFinalizada(): boolean {
    return this.sesionActiva?.estado === ESTADO_SESION_FINALIZADA;
  }

  // `esRefresh = true` (pull-to-refresh) evita el flash de pantalla completa:
  // el ion-refresher ya muestra su propio spinner, así que aquí no volvemos
  // a tapar todo el contenido con el overlay de "Conectando...".
async inicializar(esRefresh = false) {
  // Forzar limpieza AGRESIVA del estado
  this.desuscribir();
  this.sesionActiva = null;
  this.bloques = [];
  this.materiasFinalizadasSecciones = [];
  this.tituloSesion = '';
  this.grupoSeleccionado = null;
  this.asignaturaSeleccionada = null;
  this.misAsignaturas = [];
  this.respuestasAlumno = {};
  this.actividadesEnviadas = {};
  this.resultadosActividad = {};
  this.enviandoActividad = {};

  if (!esRefresh) this.cargando = true;
  this.error = null;

  try {
    if (this.esDocente) {
      this.limpiarSesionesFinalizadasAntiguas().catch(e =>
        console.error('Error limpiando sesiones antiguas:', e?.message)
      );
    }

    if (this.esDocente) {
      await this.cargarAsignaturasDocente();
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
  trackByIndex(index: number): number {
  return index;
}

  // ═══════════════════════════════════════════════════
  //  DOCENTE — grupos y asignaturas
  // ═══════════════════════════════════════════════════

  // Carga el listado de asignatura_id que este docente imparte, para poder
  // filtrar con ellas en asignaturas_por_grupo(). Sin esto, onGrupoChange()
  // se detenía de inmediato porque asignaturasDocente quedaba siempre vacío.
async cargarAsignaturasDocente() {
  const token = this.sesion.usuario?.token;

  if (!token) {
    this.asignaturasDocente = [];
    return;
  }

  try {
    const { data, error } = await this.sesion.supabase.rpc(
      'asignaturas_del_docente',
      { p_token: token }
    );

    if (error) {
      console.error('Error cargando asignaturas del docente:', error.message);
      this.asignaturasDocente = [];
      return;
    }

    this.asignaturasDocente = (data || []).map((a: any) => a.id);
    console.log('DEBUG asignaturasDocente cargadas:', this.asignaturasDocente);
  } catch (e: any) {
    console.error('Error inesperado cargando asignaturas del docente:', e?.message || e);
    this.asignaturasDocente = [];
  }
}

async cargarGruposDocente() {
  const token = this.sesion.usuario?.token;
  const docenteId = this.sesion.usuario?.id;

  if (!docenteId || !token) {
    console.error('No hay docenteId o token en la sesión.');
    this.misGrupos = [];
    return;
  }

  try {
    const { data, error } = await this.sesion.supabase.rpc(
      'grupos_docente',
      { p_token: token }
    );

    if (error) {
      console.error('Error cargando grupos del docente:', error.message);
      this.misGrupos = [];
      return;
    }

    this.misGrupos = data || [];
    console.log('DEBUG misGrupos cargados:', this.misGrupos);
  } catch (e: any) {
    console.error('Error inesperado cargando grupos:', e?.message || e);
    this.misGrupos = [];
  }
}
async onGrupoChange() {
  this.asignaturaSeleccionada = null;
  this.misAsignaturas = [];

  if (!this.grupoSeleccionado || !this.asignaturasDocente.length) return;

  const token = this.sesion.usuario?.token;
  if (!token) return;

  const { data, error } = await this.sesion.supabase.rpc(
    'asignaturas_por_grupo',
    {
      p_token: token,
      p_grupo_id: this.grupoSeleccionado,
      p_asignaturas_docente: this.asignaturasDocente
    }
  );

  if (error) {
    console.error('Error cargando asignaturas del grupo:', error.message);
    this.misAsignaturas = [];
    return;
  }

  this.misAsignaturas = data || [];
}

  getLabelAsignatura(a: any): string {
    return a.clave ? `${a.nombre} (${a.clave})` : a.nombre;
  }

  // ═══════════════════════════════════════════════════
  //  EN VIVO — sesión activa
  // ═══════════════════════════════════════════════════

async buscarSesionActivaDocente() {
  const token = this.sesion.usuario?.token;
  const docenteId = this.sesion.usuario?.id;

  if (!docenteId || !token) {
    this.desuscribir();
    this.sesionActiva = null;
    this.bloques = [];
    return;
  }

  const { data, error } = await this.sesion.supabase.rpc(
    'sesion_activa_docente',
    { p_token: token }
  );

  if (error) {
    console.error('Error buscando sesión activa:', error.message);
    this.desuscribir();
    this.sesionActiva = null;
    this.bloques = [];
    return;
  }

  // ✅ FIX: Usar el resultado de data si existe
  if (data) {
    this.sesionActiva = data[0];
    await this.cargarBloques();
    this.suscribirRealtime();
    console.log('DEBUG: Sesión activa del docente cargada:', this.sesionActiva);
  } else {
    // Si no hay sesión activa, limpiar
    this.desuscribir();
    this.sesionActiva = null;
    this.bloques = [];
    console.log('DEBUG: No hay sesión activa para el docente');
  }
}

  // Una clase FINALIZADA sigue siendo "vigente" (visible en modo lectura)
  // mientras estemos dentro de DIAS_VISIBILIDAD_FINALIZADA desde que se
  // terminó. Si no trae finalizada_en (dato viejo, previo a este cambio),
  // no la ocultamos de golpe.
private dentroDeVentanaFinalizada(s: SesionClase): boolean {
  if (s.estado !== ESTADO_SESION_FINALIZADA) return false;
  const referencia = s.finalizada_en || s.creada_en;
  if (!referencia) return true; // sin ninguna fecha, no la ocultamos de golpe
  const limite = new Date(referencia).getTime() + DIAS_VISIBILIDAD_FINALIZADA * 24 * 60 * 60 * 1000;
  return Date.now() < limite;
}

async buscarSesionActivaAlumno() {
  const token = this.sesion.usuario?.token;
  const alumnoId = this.sesion.usuario?.id;

  if (!alumnoId || !token) {
    this.error = 'No hay sesión activa.';
    this.desuscribir();
    this.sesionActiva = null;
    this.bloques = [];
    this.materiasFinalizadasSecciones = [];
    return;
  }

  // Obtener grupo del alumno
  const { data: perfil, error: ePerfil } = await this.sesion.supabase
    .rpc('perfil_basico_usuario', {
      p_token: token,
      p_user_id: alumnoId
    })
    .single();

  if (ePerfil) {
    console.error('Error obteniendo perfil:', ePerfil.message);
    this.error = 'No se pudo obtener tu información.';
    return;
  }

  const grupoId = (perfil as any)?.alumno_grupo_id;
  if (!grupoId) {
    this.error = 'No tienes grupo asignado.';
    this.desuscribir();
    this.sesionActiva = null;
    this.bloques = [];
    this.materiasFinalizadasSecciones = [];
    return;
  }

  // Buscar sesión activa
  const { data, error } = await this.sesion.supabase.rpc(
    'sesion_activa_alumno',
    {
      p_token: token,
      p_alumno_id: alumnoId
    }
  );

  if (error) {
    console.error('Error buscando sesión activa:', error.message);
    this.desuscribir();
    this.sesionActiva = null;
    this.bloques = [];
    return;
  }

  if (data) {
    this.sesionActiva = data;
    this.materiasFinalizadasSecciones = [];
    await this.cargarBloques();
    this.suscribirRealtime();
  } else {
    this.desuscribir();
    this.sesionActiva = null;
    this.bloques = [];
    await this.cargarClasesFinalizadasAlumno(grupoId);
  }
}
// Trae las clases FINALIZADAS del grupo del alumno que siguen dentro de la
// ventana de gracia (DIAS_VISIBILIDAD_FINALIZADA) y las agrupa por materia
// para pintarlas como tarjetas seccionadas.
private async cargarClasesFinalizadasAlumno(grupoId: number) {
  const token = this.sesion.usuario?.token;
  const alumnoId = this.sesion.usuario?.id;

  if (!token || !alumnoId) {
    this.materiasFinalizadasSecciones = [];
    return;
  }

  const { data, error } = await this.sesion.supabase.rpc(
    'clases_finalizadas_alumno',
    {
      p_token: token,
      p_alumno_id: alumnoId
    }
  );

  if (error) {
    console.error('Error cargando clases finalizadas:', error.message);
    this.materiasFinalizadasSecciones = [];
    return;
  }

  const vigentes: SesionClase[] = data || [];
  if (!vigentes.length) {
    this.materiasFinalizadasSecciones = [];
    return;
  }

  const asigIds = [...new Set(vigentes.map(s => s.asignatura_id))];
  let asigMap: Record<number, string> = {};
  if (asigIds.length) {
    const { data: asigs } = await this.sesion.supabase.rpc(
      'nombres_asignaturas', { p_token: token, p_ids: asigIds }
    );
    (asigs || []).forEach((a: any) => { asigMap[a.id] = a.nombre; });
  }

  vigentes.forEach(s => { s.asignatura_nombre = asigMap[s.asignatura_id] || 'Materia'; });

  const secciones: Record<number, SeccionMateriaFinalizada> = {};
  vigentes.forEach(s => {
    if (!secciones[s.asignatura_id]) {
      secciones[s.asignatura_id] = {
        asignatura_id: s.asignatura_id,
        asignatura_nombre: s.asignatura_nombre!,
        sesiones: [],
      };
    }
    secciones[s.asignatura_id].sesiones.push(s);
  });

  this.materiasFinalizadasSecciones = Object.values(secciones)
    .sort((a, b) => a.asignatura_nombre.localeCompare(b.asignatura_nombre));
}

// Abre el detalle de solo lectura de una clase finalizada al tocar su tarjeta.
async abrirClaseFinalizada(s: SesionClase) {
  this.desuscribir();
  this.sesionActiva = { ...s };
  this.bloques = [];
  await this.cargarBloques();
  this.suscribirRealtime();
}

// Regresa del detalle de una clase finalizada al listado por materias
// (ya cacheado, no vuelve a consultar Supabase).
volverAListaFinalizadas() {
  this.desuscribir();
  this.sesionActiva = null;
  this.bloques = [];
}

async iniciarSesion() {
  if (!this.grupoSeleccionado || !this.asignaturaSeleccionada || !this.tituloSesion.trim()) return;

  const token = this.sesion.usuario?.token;
  if (!token) return;

  const { data, error } = await this.sesion.supabase.rpc(
    'crear_sesion_clase',
    {
      p_token: token,
      p_grupo_id: this.grupoSeleccionado,
      p_asignatura_id: this.asignaturaSeleccionada,
      p_titulo: this.tituloSesion.trim()
    }
  );

  if (error) {
    console.error('Error insertando sesión:', error.message);
    alert('No se pudo iniciar la sesión: ' + error.message);
    return;
  }

  this.sesionActiva = data;
  this.bloques = [];
  this.suscribirRealtime();
}

async terminarSesion() {
  if (!this.sesionActiva?.id) return;

  const token = this.sesion.usuario?.token;
  if (!token) return;

  const { error } = await this.sesion.supabase.rpc(
    'terminar_sesion_clase',
    {
      p_token: token,
      p_sesion_id: this.sesionActiva.id
    }
  );

  if (error) {
    console.error('Error terminando sesión:', error.message);
    alert('No se pudo terminar la sesión: ' + error.message);
    return;
  }

  this.desuscribir();
  this.sesionActiva = null;
  this.bloques = [];
  this.tituloSesion = '';
  this.grupoSeleccionado = null;
  this.asignaturaSeleccionada = null;
  this.misAsignaturas = [];
}

  // ─────────────────────────────────────────────
  // LIMPIEZA — borra sesiones FINALIZADAS más allá de la ventana de gracia
  // (y sus bloques/respuestas). Se dispara "en silencio" al inicializar la
  // vista del docente; si falla, no interrumpe el resto de la pantalla.
  // ─────────────────────────────────────────────
private async limpiarSesionesFinalizadasAntiguas() {
  const token = this.sesion.usuario?.token;
  const docenteId = this.sesion.usuario?.id;

  if (!token || !docenteId || !this.esDocente) return;

  const { error } = await this.sesion.supabase.rpc(
    'limpiar_sesiones_finalizadas_antiguas',
    { p_token: token }
  );

  if (error) {
    console.error('Error limpiando sesiones antiguas:', error.message);
  }
}

  // ─────────────────────────────────────────────
  // BORRADORES (guardar la configuración de una clase para iniciarla después)
  // ─────────────────────────────────────────────

async cargarBorradores() {
  const token = this.sesion.usuario?.token;
  if (!token) return;

  const { data, error } = await this.sesion.supabase.rpc(
    'borradores_docente',
    { p_token: token }
  );

  if (error) {
    console.error('Error cargando borradores:', error.message);
    this.misBorradores = [];
    return;
  }

  const borradores = data || [];
  if (!borradores.length) {
    this.misBorradores = [];
    return;
  }

  const grupoIds = [...new Set(borradores.map((b: any) => b.grupo_id))];
  const asigIds  = [...new Set(borradores.map((b: any) => b.asignatura_id))];

  let grupoMap: Record<number, string> = {};
  let asigMap:  Record<number, string> = {};

if (grupoIds.length) {
    const { data: grupos } = await this.sesion.supabase.rpc(
      'nombres_grupos', { p_token: token, p_ids: grupoIds }
    );
    (grupos || []).forEach((g: any) => { grupoMap[g.id] = `${g.grado}° — Grupo ${g.nombre}`; });
  }
  if (asigIds.length) {
    const { data: asigs } = await this.sesion.supabase.rpc(
      'nombres_asignaturas', { p_token: token, p_ids: asigIds }
    );
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
  const token = this.sesion.usuario?.token;

  if (!token) {
    this.guardandoBorrador = false;
    return;
  }

  const { error } = await this.sesion.supabase.rpc(
    'crear_sesion_clase',
    {
      p_token: token,
      p_grupo_id: this.grupoSeleccionado,
      p_asignatura_id: this.asignaturaSeleccionada,
      p_titulo: this.tituloSesion.trim(),
      p_borrador: true  // La RPC espera un booleano, no un string de estado
    }
  );

  this.guardandoBorrador = false;

  if (error) {
    console.error('Error guardando borrador:', error.message);
    alert('No se pudo guardar el borrador: ' + error.message);
    return;
  }

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
  // trae sesiones con estado = ACTIVA o FINALIZADA reciente.
  async abrirBorrador(b: SesionBorrador) {
    if (!b.id || this.sesionActiva) return;

    this.sesionActiva = { ...b };
    this.bloques = [];
    await this.cargarBloques();
    this.suscribirRealtime();
  }

async publicarBorrador() {
  if (!this.sesionActiva?.id || this.sesionActiva.estado !== ESTADO_SESION_BORRADOR) return;

  this.publicandoBorrador = true;
  const token = this.sesion.usuario?.token;

  if (!token) {
    this.publicandoBorrador = false;
    return;
  }

  const { data, error } = await this.sesion.supabase.rpc(
    'publicar_borrador_clase',
    {
      p_token: token,
      p_sesion_id: this.sesionActiva.id
    }
  );

  this.publicandoBorrador = false;

  if (error) {
    console.error('Error publicando borrador:', error.message);
    alert('No se pudo publicar la clase: ' + error.message);
    return;
  }

  this.sesionActiva = data;
  this.misBorradores = this.misBorradores.filter(x => x.id !== data.id);

  await this.cargarBloques();

  for (const b of this.bloques.filter(b => b.tipo === 'actividad')) {
    const result = await this.actividadSync.sincronizarBloque(b, this.sesionActiva!);
    if (!result.success) {
      console.warn(`⚠️  No se sincronizó bloque ${b.id}: ${result.error}`);
      // Continuar con los demás bloques — no interrumps el flujo
    } else {
      console.log(`✅ Bloque ${b.id} (${b.tipo}) sincronizado correctamente`);
    }
  }
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

  const token = this.sesion.usuario?.token;
  if (!token) return;

  const { error } = await this.sesion.supabase.rpc(
    'eliminar_borrador_clase',
    {
      p_token: token,
      p_sesion_id: b.id
    }
  );

  if (error) {
    console.error('Error eliminando borrador:', error.message);
    alert('No se pudo eliminar el borrador: ' + error.message);
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
  const token = this.sesion.usuario?.token;

  if (!token) {
    this.cargandoReutilizar = false;
    return;
  }

  try {
    const { data, error } = await this.sesion.supabase.rpc(
      'reutilizar_ultima_clase',
      {
        p_token: token,
        p_sesion_id: this.sesionActiva.id
      }
    );

    if (error) {
      console.error('Error reutilizando clase:', error.message);
      alert('No se pudo reutilizar la clase anterior: ' + error.message);
      return;
    }

    if (data && data.length > 0) {
      await this.cargarBloques();
    } else {
      alert('No hay una clase anterior de este grupo y materia para reutilizar.');
    }
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

  const token = this.sesion.usuario?.token;
  if (!token) return;

  const { data, error } = await this.sesion.supabase.rpc(
    'bloques_de_sesion',
    {
      p_token: token,
      p_sesion_id: this.sesionActiva.id
    }
  );

  if (error) {
    console.error('Error cargando bloques:', error.message);
    this.bloques = [];
    return;
  }

  this.bloques = data || [];

  if (this.esAlumno) {
    await this.cargarRespuestasActividades();
  }
}

  // ═══════════════════════════════════════════════════
  //  ACTIVIDADES — respuestas del alumno
  // ═══════════════════════════════════════════════════

private async cargarRespuestasActividades() {
  const token = this.sesion.usuario?.token;

  const bloqueIds = this.bloques
    .filter(b => b.tipo === 'actividad' && b.id)
    .map(b => b.id!);

  if (!token || !bloqueIds.length) return;

  const { data, error } = await this.sesion.supabase.rpc(
    'respuestas_actividad_clase',
    {
      p_token: token,
      p_bloque_ids: bloqueIds
    }
  );

  if (error) {
    console.error(
      'Error cargando respuestas de actividad:',
      error.message
    );
    return;
  }

  const respuestas = data || [];

  respuestas.forEach((r: any) => {
    this.respuestasAlumno[
      this.respuestaKey(r.bloque_id, r.pregunta_id)
    ] = r.respuesta;
  });

  bloqueIds.forEach(bid => {
    const respuestasBloque = respuestas.filter(
      (r: any) => r.bloque_id === bid
    );

    if (!respuestasBloque.length) return;

    this.actividadesEnviadas[bid] = true;

    const calificables = respuestasBloque.filter(
      (r: any) => r.es_correcta !== null
    );

    const correctas = calificables.filter(
      (r: any) => r.es_correcta === true
    );

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
  // Además, si la clase ya terminó (modo lectura) no se puede enviar nada.
actividadListaParaEnviar(bloque: BloqueClase): boolean {
  if (!bloque.id || this.actividadesEnviadas[bloque.id]) return false;
  if (this.sesionFinalizada) return false;
  if (this.actividadVencida(bloque)) return false;   // ← nuevo
  const act = this.parsearActividad(bloque.contenido);
  if (!act.preguntas.length) return false;

  return act.preguntas.every(p => {
    const v = this.respuestasAlumno[this.respuestaKey(bloque.id!, p.id)];
    return v !== undefined && v !== '';
  });
}

async enviarActividad(bloque: BloqueClase) {
  const token = this.sesion.usuario?.token;

  if (!token || !bloque.id) return;
  if (this.actividadesEnviadas[bloque.id]) return;
  if (this.sesionFinalizada) return;
  if (this.actividadVencida(bloque)) return;
  if (!this.actividadListaParaEnviar(bloque)) return;

  this.enviandoActividad[bloque.id] = true;

  try {
    const act = this.parsearActividad(bloque.contenido);

    const respuestas = act.preguntas.map(p => {
      const valor =
        this.respuestasAlumno[
          this.respuestaKey(bloque.id!, p.id)
        ];

      return {
        pregunta_id: p.id,
        respuesta: valor
      };
    });

    const { error } = await this.sesion.supabase.rpc(
      'guardar_respuestas_actividad_clase',
      {
        p_token: token,
        p_bloque_id: bloque.id,
        p_respuestas: respuestas
      }
    );

    if (error) {
      console.error(
        'Error enviando actividad:',
        error.message
      );

      alert(
        'No se pudo enviar tu actividad: ' +
        error.message
      );

      return;
    }

    /*
     * La RPC ya calculó es_correcta en el servidor.
     * Para mantener inmediatamente el resumen visual,
     * lo calculamos también en memoria con la misma lógica.
     */
    const filas = act.preguntas.map(p => {
      const valor =
        this.respuestasAlumno[
          this.respuestaKey(bloque.id!, p.id)
        ];

      let esCorrecta: boolean | null = null;

      if (
        p.tipo === 'opcion_multiple' &&
        typeof p.respuestaCorrecta === 'number'
      ) {
        esCorrecta = Number(valor) === p.respuestaCorrecta;
      } else if (
        p.tipo === 'verdadero_falso' &&
        typeof p.respuestaCorrecta === 'boolean'
      ) {
        esCorrecta =
          (valor === 'true') === p.respuestaCorrecta;
      }

      return {
        es_correcta: esCorrecta
      };
    });

    this.actividadesEnviadas[bloque.id] = true;

    const calificables = filas.filter(
      f => f.es_correcta !== null
    );

    const correctas = calificables.filter(
      f => f.es_correcta === true
    );

    this.resultadosActividad[bloque.id] = {
      correctas: correctas.length,
      calificables: calificables.length,
    };

  } finally {
    this.enviandoActividad[bloque.id] = false;
  }
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
  const token = this.sesion.usuario?.token;
  if (!token) return;

  const tipo = this.nuevoBloque.tipo!;

  // Validaciones por tipo (sin cambios)
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
      // ✅ EDITAR - USANDO RPC
      const { error } = await this.sesion.supabase.rpc(
        'editar_bloque_clase',
        {
          p_token: token,
          p_bloque_id: this.editandoBloque.id!,
          p_titulo: this.nuevoBloque.titulo || '',
          p_contenido: contenidoFinal
        }
      );
      if (error) throw error;
    } else {
      // ✅ CREAR - USANDO RPC
      const { error } = await this.sesion.supabase.rpc(
        'crear_bloque_clase',
        {
          p_token: token,
          p_sesion_id: this.nuevoBloque.sesion_id,
          p_tipo: tipo,
          p_contenido: contenidoFinal,
          p_titulo: this.nuevoBloque.titulo || '',
          p_orden: this.nuevoBloque.orden,
          p_publicar: this.claseEnVivo  // la RPC espera booleano, no una fecha
        }
      );
      if (error) throw error;
    }

    this.mostrarModalBloque = false;
    this.editandoBloque = null;
    await this.cargarBloques();

    // ✅ CORREGIDO: Sincronizar actividades en AMBOS casos (crear y editar)
    // Condición también CORREGIDA: usar !this.esBorradorEnEdicion en lugar de === false
    if (tipo === 'actividad' && (this.claseEnVivo || !this.esBorradorEnEdicion)) {
      // Buscar el bloque guardado por ID (si es edición) o por el contenido (si es nuevo)
      let bloqueGuardado: BloqueClase | undefined;

      if (this.editandoBloque) {
        // ✅ EDITAR: buscar por ID
        bloqueGuardado = this.bloques.find(b => b.id === this.editandoBloque!.id);
      } else {
        // ✅ CREAR: buscar el más reciente (último en el array después de recargar)
        // Los bloques se cargan en orden, así que el último es el nuevo
        bloqueGuardado = this.bloques[this.bloques.length - 1];
      }

      if (bloqueGuardado && bloqueGuardado.tipo === 'actividad') {
        const result = await this.actividadSync.sincronizarBloque(bloqueGuardado, this.sesionActiva!);
        if (!result.success) {
          console.warn(`⚠️  No se sincronizó actividad: ${result.error}`);
          // Mostrar toast al usuario
          const t = await this.toastCtrl.create({
            message: `Actividad guardada pero con advertencia: ${result.error}`,
            duration: 3000,
            color: 'warning',
            position: 'bottom'
          });
          await t.present();
        } else {
          console.log(`✅ Actividad sincronizada correctamente`);
        }
      }
    }
  } catch (e: any) {
    console.error('Error guardando bloque:', e.message);
    this.errorArchivo = 'No se pudo guardar: ' + e.message;
  } finally {
    this.guardandoBloque = false;
    this.subiendoArchivo = false;
  }
}

async eliminarBloque(bloque: BloqueClase) {
  const token = this.sesion.usuario?.token;
  if (!token || !bloque.id) return;

  const { error } = await this.sesion.supabase.rpc(
    'eliminar_bloque_clase',
    {
      p_token: token,
      p_bloque_id: bloque.id
    }
  );

  if (error) {
    console.error('Error eliminando bloque:', error.message);
    return;
  }

  if (bloque.tipo === 'actividad' && bloque.id) {
    await this.actividadSync.despublicarPorBloque(bloque.id);
  }

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

    this.canal = this.sesion.supabase
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
        const nuevoEstado = payload.new?.estado;

        if (nuevoEstado === ESTADO_SESION_ACTIVA) return; // sin cambios relevantes

        if (nuevoEstado === ESTADO_SESION_FINALIZADA) {
          // El docente acaba de terminar la clase: no la ocultamos de
          // inmediato — se queda visible en modo lectura durante la
          // ventana de gracia (igual que al recargar la página).
          this.sesionActiva = {
            ...this.sesionActiva!,
            estado: nuevoEstado,
            finalizada_en: payload.new.finalizada_en,
          };
          return;
        }

        // Cualquier otro caso (p. ej. se eliminó): sí la ocultamos.
        this.sesionActiva = null;
        this.bloques = [];
        this.desuscribir();
      })
      .subscribe();
  }

  desuscribir() {
    if (this.canal) {
      this.sesion.supabase.removeChannel(this.canal);
      this.canal = null;
    }
  }

  // ═══════════════════════════════════════════════════
  //  PLANES DE CLASE — lista
  // ═══════════════════════════════════════════════════
async cargarPlanes() {
  const token = this.sesion.usuario?.token;
  if (!token) return;

  const { data: planesRaw, error: ePlanes } = await this.sesion.supabase.rpc(
    'planes_docente',
    { p_token: token }
  );

  if (ePlanes) {
    console.error('Error cargando planes:', ePlanes.message);
    this.planes = [];
    return;
  }

  const planes = planesRaw || [];
  if (!planes.length) {
    this.planes = [];
    return;
  }

  const planIds = planes.map((p: any) => p.id);

  // Obtener conteos de temas
  const { data: conteos, error: eConteos } = await this.sesion.supabase.rpc(
    'conteo_temas_por_planes',
    {
      p_token: token,
      p_plan_ids: planIds
    }
  );

  if (eConteos) {
    console.error('Error obteniendo conteos de temas:', eConteos.message);
  }

  const conteoMap: Record<number, { total: number; completados: number }> = {};
  (conteos || []).forEach((c: any) => {
    conteoMap[c.plan_id] = {
      total: c.total,
      completados: c.completados
    };
  });

  this.planes = planes.map((p: any) => ({
    ...p,
    totalTemas:        conteoMap[p.id]?.total       || 0,
    temasCompletados:  conteoMap[p.id]?.completados || 0,
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

  const token = this.sesion.usuario?.token;
  if (!token) {
    this.guardandoPlan = false;
    return;
  }

  const payload = {
    p_token: token,
    p_grupo_id: this.grupoSeleccionado!,
    p_asignatura_id: this.asignaturaSeleccionada!,
    p_titulo: this.formPlan.titulo!.trim(),
    p_descripcion: this.formPlan.descripcion || '',
    p_periodo_tipo: this.formPlan.periodo_tipo || 'MES',
    p_fecha_inicio: this.formPlan.fecha_inicio!,
    p_fecha_fin: this.formPlan.fecha_fin!,
    p_objetivo_general: this.formPlan.objetivo_general || '',
    p_competencias: this.formPlan.competencias || '',
    p_publicado: publicar,
  };

  let planId = this.formPlan.id;

  try {
    if (this.modoEdicionPlan && planId) {
      // ✅ EDITAR
      const { data, error } = await this.sesion.supabase.rpc(
        'editar_plan_clase',
        {
          ...payload,
          p_plan_id: planId
        }
      );

      if (error) throw error;
      planId = data?.id;
    } else {
      // ✅ CREAR - CORREGIDO: usar 'crear_plan_clase'
      const { data, error } = await this.sesion.supabase.rpc(
        'crear_plan_clase',
        {
          p_token: token,
          p_docente_id: this.sesion.usuario!.id,
          p_grupo_id: this.grupoSeleccionado!,
          p_asignatura_id: this.asignaturaSeleccionada!,
          p_titulo: this.formPlan.titulo!.trim(),
          p_descripcion: this.formPlan.descripcion || '',
          p_periodo_tipo: this.formPlan.periodo_tipo || 'MES',
          p_fecha_inicio: this.formPlan.fecha_inicio!,
          p_fecha_fin: this.formPlan.fecha_fin!,
          p_objetivo_general: this.formPlan.objetivo_general || '',
          p_competencias: this.formPlan.competencias || '',
          p_publicado: publicar,
        }
      );

      if (error) throw error;
      planId = data?.id;
    }

    this.guardandoPlan = false;
    await this.cargarPlanes();

    const actualizado = this.planes.find(p => p.id === planId);
    if (actualizado) this.abrirDetalle(actualizado);
    else this.vistaPlanes = 'lista';

  } catch (e: any) {
    console.error('Error guardando plan:', e.message);
    alert('No se pudo guardar el plan: ' + e.message);
    this.guardandoPlan = false;
  }
}

async togglePublicadoPlan(p: PlanClase) {
  const token = this.sesion.usuario?.token;
  if (!token || !p.id) return;

  const { data, error } = await this.sesion.supabase.rpc(
    'toggle_publicado_plan',
    {
      p_token: token,
      p_plan_id: p.id
    }
  );

  if (error) {
    console.error('Error cambiando estado de publicación:', error.message);
    alert('No se pudo cambiar el estado: ' + error.message);
    return;
  }

  p.publicado = data;
  const seleccionado = this.planSeleccionado;
  if (seleccionado && seleccionado.id === p.id) {
    seleccionado.publicado = data;
  }
}

async eliminarPlan(p: PlanClase) {
  if (!p.id) return;

  const token = this.sesion.usuario?.token;
  if (!token) return;

  const { error } = await this.sesion.supabase.rpc(
    'eliminar_plan_clase',
    {
      p_token: token,
      p_plan_id: p.id
    }
  );

  if (error) {
    console.error('Error eliminando plan:', error.message);
    alert('No se pudo eliminar el plan: ' + error.message);
    return;
  }

  this.planes = this.planes.filter(x => x.id !== p.id);
  this.volverALista();
}

  abrirDetalle(a: any) {
    console.log('Navegando a actividad:', a.id);
    this.router.navigate(['/detalle-actividad', a.id]);
  }

  volverALista() {
    this.vistaPlanes = 'lista';
    this.planSeleccionado = null;
    this.temasPlan = [];
  }

async cargarTemas() {
  if (!this.planSeleccionado?.id) return;

  const token = this.sesion.usuario?.token;
  if (!token) return;

  const { data, error } = await this.sesion.supabase.rpc(
    'temas_de_plan',
    {
      p_token: token,
      p_plan_id: this.planSeleccionado.id
    }
  );

  if (error) {
    console.error('Error cargando temas:', error.message);
    this.temasPlan = [];
    return;
  }

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
  const token = this.sesion.usuario?.token;

  if (!token) {
    this.guardandoTema = false;
    return;
  }

  const { error } = await this.sesion.supabase.rpc(
    'crear_tema_clase',
    {
      p_token: token,
      p_plan_id: this.planSeleccionado.id,
      p_numero: this.nuevoTema.numero,
      p_titulo: this.nuevoTema.titulo.trim(),
      p_descripcion: this.nuevoTema.descripcion || '',
      p_fecha: this.nuevoTema.fecha || null,
      p_duracion_min: this.nuevoTema.duracion_min || 50,
      p_recursos: this.nuevoTema.recursos || '',
      p_evaluacion: this.nuevoTema.evaluacion || ''
    }
  );

  this.guardandoTema = false;

  if (!error) {
    this.mostrarModalTema = false;
    await this.cargarTemas();
    await this.cargarPlanes();
  } else {
    console.error('Error guardando tema:', error.message);
    alert('No se pudo guardar el tema: ' + error.message);
  }
}

async toggleTemaCompletado(t: TemaClase) {
  const token = this.sesion.usuario?.token;
  if (!token || !t.id) return;

  const nuevo = !t.completado;
  const { error } = await this.sesion.supabase.rpc(
    'toggle_tema_completado',
    {
      p_token: token,
      p_tema_id: t.id,
      p_completado: nuevo
    }
  );

  if (error) {
    console.error('Error actualizando tema:', error.message);
    // Revertir cambio local
    t.completado = !nuevo;
    return;
  }

  t.completado = nuevo;
  await this.cargarPlanes();
}

async eliminarTema(t: TemaClase) {
  const token = this.sesion.usuario?.token;
  if (!token || !t.id) return;

  const { error } = await this.sesion.supabase.rpc(
    'eliminar_tema_clase',
    {
      p_token: token,
      p_tema_id: t.id
    }
  );

  if (error) {
    console.error('Error eliminando tema:', error.message);
    alert('No se pudo eliminar el tema: ' + error.message);
    return;
  }

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
// Inserta transformación de Cloudinary (ancho máximo + calidad/formato automáticos)
// sin modificar el archivo original guardado.
imagenOptimizada(url: string, ancho = 800): string {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/w_${ancho},c_limit,q_auto,f_auto/`);
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
// Sanitiza cualquier URL para usarla en un [src] de <iframe> (ej. el
// visor de PDF). Angular exige SafeResourceUrl en ese contexto — sin
// esto truena NG0904.
pdfEmbed(url: string): SafeResourceUrl {
  return this.sanitizer.bypassSecurityTrustResourceUrl(url);
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
  private deadlineActividad(bloque: BloqueClase): number | null {
  if (!bloque.publicado_en) return null; // dato viejo sin publicado_en: no bloqueamos
  return new Date(bloque.publicado_en).getTime() + HORAS_LIMITE_ACTIVIDAD * 60 * 60 * 1000;
}

actividadVencida(bloque: BloqueClase): boolean {
  const limite = this.deadlineActividad(bloque);
  return limite !== null && Date.now() > limite;
}

// Texto tipo "3h 20m restantes" para mostrar al alumno mientras puede responder.
tiempoRestanteActividad(bloque: BloqueClase): string {
  const limite = this.deadlineActividad(bloque);
  if (limite === null) return '';
  const ms = limite - Date.now();
  if (ms <= 0) return 'Tiempo agotado';
  const horas = Math.floor(ms / 3600000);
  const minutos = Math.floor((ms % 3600000) / 60000);
  return horas > 0 ? `${horas}h ${minutos}m restantes` : `${minutos}m restantes`;
}
}
