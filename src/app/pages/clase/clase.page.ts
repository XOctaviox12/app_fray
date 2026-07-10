import { Component, OnInit, OnDestroy } from '@angular/core';
import { SesionService } from '../../services/sesion.service';
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

export interface SesionClase {
  id?: number;
  docente_id: number;
  grupo_id: number;
  asignatura_id: number;
  titulo: string;
  estado: string;      // ← antes: activa: boolean
  fecha: string;
  creada_en?: string;
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
  // campos calculados para mostrar en la lista (no existen en la tabla)
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

@Component({
  standalone: false,
  selector: 'app-clase',
  templateUrl: './clase.page.html',
  styleUrls: ['./clase.page.scss'],
})
export class ClasePage implements OnInit, OnDestroy {

  cargando    = true;
  error: string | null = null;

  // Segmento principal (solo docente): 'planes' | 'vivo'
  segmento: 'planes' | 'vivo' = 'planes';

  // ── EN VIVO ─────────────────────────────────────────
  sesionActiva: SesionClase | null = null;
  bloques: BloqueClase[] = [];

  // Selector docente (compartido: se usa tanto para iniciar sesión en vivo
  // como para crear/editar un plan — ambos necesitan grupo + materia)
  misGrupos:      any[] = [];
  misAsignaturas: any[] = [];
  grupoSeleccionado:      number | null = null;
  asignaturaSeleccionada: number | null = null;
  tituloSesion = '';

  mostrarModalBloque = false;
  nuevoBloque: Partial<BloqueClase> = { tipo: 'texto', contenido: '', titulo: '', activo: true };
  guardandoBloque = false;

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

  constructor(public sesion: SesionService) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  ngOnInit()    { this.inicializar(); }
  ngOnDestroy() { this.desuscribir(); }

  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esAlumno():  boolean { return this.sesion.esAlumno(); }

  async inicializar() {
    this.cargando = true;
    if (this.esDocente) {
      await this.cargarGruposDocente();
      await this.buscarSesionActivaDocente();
      await this.cargarPlanes();
    } else {
      await this.buscarSesionActivaAlumno();
    }
    this.cargando = false;
  }

  cambiarSegmento(event: any) {
    this.segmento = event.detail.value;
    if (this.segmento === 'planes') this.volverALista();
  }

  // ═══════════════════════════════════════════════════
  //  DOCENTE — grupos y asignaturas (compartido)
  // ═══════════════════════════════════════════════════

async cargarGruposDocente() {
  const docenteId = this.sesion.usuario?.id;
  if (!docenteId) return;

  // 1. Materias que realmente imparte el docente
  const { data: relAsig } = await this.supabase
    .from('academic_asignatura_docentes')
    .select('asignatura_id')
    .eq('user_id', docenteId);

  this.asignaturasDocente = (relAsig || []).map((r: any) => r.asignatura_id);
  if (!this.asignaturasDocente.length) { this.misGrupos = []; return; }

  // 2. Grupos donde se imparte alguna de esas materias
  const { data: relGM } = await this.supabase
    .from('academic_asignatura_grupos')
    .select('grupo_id')
    .in('asignatura_id', this.asignaturasDocente);

  const grupoIdsPorMateria = [...new Set((relGM || []).map((r: any) => r.grupo_id))];
  if (!grupoIdsPorMateria.length) { this.misGrupos = []; return; }

  // 3. Intersección con los grupos formalmente asignados al docente
  //    (academic_grupo_docentes), para no mostrar grupos donde la materia
  //    se imparte pero él no está asignado como docente de ese grupo.
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
  if (!grupoId) { this.error = 'No tienes grupo asignado.'; return; }

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
    console.error('Error insertando sesión:', error.message, error.details, error.hint, error.code);
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
  }

  abrirModalBloque(tipo: BloqueType = 'texto') {
    this.nuevoBloque = {
      tipo,
      contenido: '',
      titulo: '',
      activo: true,
      orden: this.bloques.length + 1,
      sesion_id: this.sesionActiva!.id!,
    };
    this.mostrarModalBloque = true;
  }

  cerrarModal() { this.mostrarModalBloque = false; }

  async guardarBloque() {
    if (!this.nuevoBloque.contenido?.trim() && this.nuevoBloque.tipo !== 'actividad') return;
    this.guardandoBloque = true;

    const { error } = await this.supabase
      .from('academic_bloqueclase')
      .insert({ ...this.nuevoBloque });

    this.guardandoBloque = false;
    if (!error) {
      this.mostrarModalBloque = false;
      await this.cargarBloques();
    } else {
      console.error('Error guardando bloque:', error.message);
    }
  }

  async eliminarBloque(bloque: BloqueClase) {
    await this.supabase
      .from('academic_bloqueclase')
      .update({ activo: false })
      .eq('id', bloque.id!);
    this.bloques = this.bloques.filter(b => b.id !== bloque.id);
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

  // ── Crear / editar plan ──────────────────────────────

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

  // ── Detalle plan + temas ─────────────────────────────

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
    t.completado = nuevo; // optimista
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

  youtubeEmbed(url: string): string {
    if (url.includes('youtu.be/')) {
      return `https://www.youtube.com/embed/${url.split('youtu.be/')[1].split('?')[0]}`;
    }
    if (url.includes('v=')) {
      return `https://www.youtube.com/embed/${url.split('v=')[1].split('&')[0]}`;
    }
    return url;
  }

  trackBloque(_: number, b: BloqueClase) { return b.id; }
  trackPlan(_: number, p: PlanClase)     { return p.id; }
  trackTema(_: number, t: TemaClase)     { return t.id; }

  doRefresh(event: any) {
    this.inicializar().then(() => event.target.complete());
  }
}
