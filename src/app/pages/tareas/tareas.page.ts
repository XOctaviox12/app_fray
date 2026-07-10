import { Component, OnInit } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService, ArchivoSubido } from '../../services/cloudinary.service';
import { Router } from '@angular/router';   // ← agregar

interface Materia { id: number; nombre: string; }
interface Grupo { id: number; nombre: string; grado: number; aula: string; }
interface ArchivoEnProgreso {
  file: File; progreso: number; subiendo: boolean; error: boolean; resultado?: ArchivoSubido;
}

interface Entrega {
  id: number;
  archivo: string;
  comentario: string;
  estado: string;
  calificacion: number | null;
  feedback: string;
  entregada_en: string;
  calificada_en: string | null;
  alumno_id: number;
  tarea_id: number;
}

interface AlumnoEntregaRow {
  alumno_id: number;
  alumno_nombre: string;
  entrega: Entrega | null;
  calificacionEdit: number | null;
  feedbackEdit: string;
  guardando: boolean;
}

interface Tarea {
  id: number; titulo: string; descripcion: string; fecha_entrega: string;
  materia_id: number; materia_nombre: string;
  grupo_id: number; grupo_nombre: string;
  archivos: ArchivoSubido[]; publicada: boolean;
  totalEntregas?: number; totalAlumnos?: number;

  // ── Alumno: su propia entrega ──
  entregaPropia?: Entrega | null;
  mostrarFormEntrega?: boolean;
  comentarioEntrega?: string;
  archivoEntregaSeleccionado?: File | null;
  subiendoEntrega?: boolean;
  progresoEntrega?: number;
  errorEntrega?: string;

  // ── Docente: panel de calificación ──
  panelAbierto?: boolean;
  cargandoEntregas?: boolean;
  entregasAlumnos?: AlumnoEntregaRow[];
}

type EstadoFiltro = 'todas' | 'activas' | 'vencidas';

const MAX_MB = 20;
const EXT_BAN = ['exe', 'bat', 'sh', 'cmd', 'msi'];
const ESTADO_ENTREGADA = 'ENTREGADA';
const ESTADO_CALIFICADA = 'CALIFICADA';

@Component({
  standalone: false,
  selector: 'app-tareas',
  templateUrl: './tareas.page.html',
  styleUrls: ['./tareas.page.scss'],
})
export class TareasPage implements OnInit {

  // ═══════════════════════════════════════════
  // DOCENTE
  // ═══════════════════════════════════════════

  showForm = false;
  editingTarea: Tarea | null = null;

  materias: Materia[] = [];
  gruposDeMateria: Grupo[] = [];
  cargandoOpciones = false;
  errorOpciones: string | null = null;

  tareas: Tarea[] = [];
  cargandoTareas = false;
  errorTareas: string | null = null;
  guardando = false;

  newTask = {
    titulo: '', materiaId: null as number | null,
    grupoId: null as number | null,
    fecha: '', descripcion: '', publicada: true,
  };

  archivosEnProgreso: ArchivoEnProgreso[] = [];
  archivosExistentes: ArchivoSubido[] = [];
  isDragging = false;

  searchTerm = '';
  filtroMateriaId: number | null = null;
  filtroGrupoId: number | null = null;
  filtroEstado: EstadoFiltro = 'todas';

  private formSnapshot = '';

  // ═══════════════════════════════════════════
  // ALUMNO
  // ═══════════════════════════════════════════

  tareasAlumno: Tarea[] = [];
  cargandoTareasAlumno = false;
  errorTareasAlumno: string | null = null;

  constructor(
    private sesion: SesionService,
    private cloudinary: CloudinaryService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private router: Router,
  ) { }

  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esAlumno(): boolean { return this.sesion.esAlumno(); }

  get fechaMinima(): string {
    return new Date().toISOString().split('T')[0];
  }

  ngOnInit() {
    if (this.esDocente) { this.cargarMaterias(); this.cargarTareas(); }
    else if (this.esAlumno) { this.cargarTareasAlumno(); }
  }

  ionViewWillEnter() {
    if (this.esDocente) this.cargarTareas();
    else if (this.esAlumno) this.cargarTareasAlumno();
  }

  doRefresh(event: any) {
    const done = () => event.target.complete();
    if (this.esDocente) this.cargarTareas().then(done);
    else if (this.esAlumno) this.cargarTareasAlumno().then(done);
    else done();
  }

  // ─────────────────────────────────────────────
  // DOCENTE: MATERIAS Y GRUPOS
  // ─────────────────────────────────────────────
  async cargarMaterias() {
    if (!this.esDocente) return;
    this.cargandoOpciones = true;
    try {
      const uid = this.sesion.usuario!.id;
      const { data: rel, error: eRel } = await this.sesion.supabase
        .from('academic_asignatura_docentes').select('asignatura_id').eq('user_id', uid);
      if (eRel) throw eRel;
      const ids = [...new Set((rel || []).map((r: any) => r.asignatura_id))];
      if (!ids.length) { this.materias = []; return; }

      const { data, error: eMat } = await this.sesion.supabase
        .from('academic_asignatura').select('id, nombre').in('id', ids).order('nombre');
      if (eMat) throw eMat;
      this.materias = data || [];
    } catch (e: any) {
      this.errorOpciones = `No se pudieron cargar tus materias. Detalle: ${e.message}`;
    } finally { this.cargandoOpciones = false; }
  }

  async onMateriaChange(preservarGrupoId: number | null = null) {
    if (!preservarGrupoId) this.newTask.grupoId = null;
    this.gruposDeMateria = [];
    if (!this.newTask.materiaId) return;
    this.cargandoOpciones = true;
    this.errorOpciones = null;
    try {
      const uid = this.sesion.usuario!.id;

      const { data: relGM, error: eGM } = await this.sesion.supabase
        .from('academic_asignatura_grupos').select('grupo_id')
        .eq('asignatura_id', this.newTask.materiaId);
      if (eGM) throw eGM;
      const idsGM = (relGM || []).map((r: any) => r.grupo_id);
      if (!idsGM.length) return;

      const { data: relDG, error: eDG } = await this.sesion.supabase
        .from('academic_grupo_docentes').select('grupo_id')
        .eq('user_id', uid).in('grupo_id', idsGM);
      if (eDG) throw eDG;
      const idsFinal = (relDG || []).map((r: any) => r.grupo_id);
      if (!idsFinal.length) return;

      const { data, error: eG } = await this.sesion.supabase
        .from('academic_grupo').select('id, nombre, grado, aula')
        .in('id', idsFinal).order('grado').order('nombre');
      if (eG) throw eG;
      this.gruposDeMateria = data || [];

      if (preservarGrupoId && this.gruposDeMateria.some(g => g.id === preservarGrupoId))
        this.newTask.grupoId = preservarGrupoId;

    } catch (e: any) {
      this.errorOpciones = `No se pudieron cargar los grupos. Detalle: ${e.message}`;
    }
    finally { this.cargandoOpciones = false; }
  }

  formatGrupo(g: any): string {
    if (!g) return '—';
    return g.aula ? `${g.grado}° ${g.nombre} — Aula ${g.aula}` : `${g.grado}° ${g.nombre}`;
  }

  // ─────────────────────────────────────────────
  // DOCENTE: CARGAR TAREAS
  // ─────────────────────────────────────────────
  async cargarTareas() {
    this.cargandoTareas = true;
    this.errorTareas = null;

    try {
      const uid = this.sesion.usuario!.id;
      const { data, error } = await this.sesion.supabase
        .from('academic_tarea')
        .select(`id, titulo, descripcion, fecha_entrega, archivo, publicada,
                 asignatura_id, grupo_id,
                 academic_asignatura(nombre),
                 academic_grupo(nombre, grado, aula)`)
        .eq('docente_id', uid)
        .order('fecha_entrega', { ascending: false });
      if (error) throw error;

      this.tareas = (data || []).map((t: any) => ({
        id: t.id,
        titulo: t.titulo,
        descripcion: t.descripcion || '',
        fecha_entrega: t.fecha_entrega,
        materia_id: t.asignatura_id,
        materia_nombre: t.academic_asignatura?.nombre || '—',
        grupo_id: t.grupo_id,
        grupo_nombre: this.formatGrupo(t.academic_grupo),
        archivos: this.parseArchivos(t.archivo),
        publicada: t.publicada ?? true,
        panelAbierto: false,
      }));

    } catch (e: any) {
      this.errorTareas = `No se pudieron cargar tus tareas. Detalle: ${e.message}`;
      this.cargandoTareas = false;
      return;
    }
    this.cargandoTareas = false;

    try {
      await this.cargarConteoEntregas();
    } catch (e: any) {
      console.error('No se pudo cargar el conteo de entregas (no crítico):', e.message);
    }
  }

  // Corregido: la columna real es tarea_id, no actividad_id.
  private async cargarConteoEntregas() {
    if (!this.tareas.length) return;
    const ids = this.tareas.map(t => t.id);

    const { data: entregas, error: eEnt } = await this.sesion.supabase
      .from('academic_entregatarea').select('tarea_id')
      .in('tarea_id', ids);
    if (eEnt) throw eEnt;

    const grupoIds = [...new Set(this.tareas.map(t => t.grupo_id))];
    const { data: alumnos, error: eAl } = await this.sesion.supabase
      .from('users_user').select('id, alumno_grupo_id')
      .in('alumno_grupo_id', grupoIds).eq('rol', 'ALUMNO');
    if (eAl) throw eAl;

    const entregasPorTarea = new Map<number, number>();
    (entregas || []).forEach((e: any) => {
      entregasPorTarea.set(e.tarea_id, (entregasPorTarea.get(e.tarea_id) || 0) + 1);
    });

    const alumnosPorGrupo = new Map<number, number>();
    (alumnos || []).forEach((a: any) => {
      alumnosPorGrupo.set(a.alumno_grupo_id, (alumnosPorGrupo.get(a.alumno_grupo_id) || 0) + 1);
    });

    this.tareas = this.tareas.map(t => ({
      ...t,
      totalEntregas: entregasPorTarea.get(t.id) || 0,
      totalAlumnos: alumnosPorGrupo.get(t.grupo_id) || 0,
    }));
  }

  private parseArchivos(raw: string | null): ArchivoSubido[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return []; }
  }

  esVencida(t: Tarea): boolean { return t.fecha_entrega < this.fechaMinima; }

  // ─────────────────────────────────────────────
  // DOCENTE: PANEL DE CALIFICACIÓN
  // ─────────────────────────────────────────────
  async togglePanelEntregas(tarea: Tarea) {
    tarea.panelAbierto = !tarea.panelAbierto;
    if (tarea.panelAbierto && !tarea.entregasAlumnos) {
      await this.cargarEntregasTarea(tarea);
    }
  }

  async cargarEntregasTarea(tarea: Tarea) {
    tarea.cargandoEntregas = true;
    try {
      const { data: alumnos, error: eAl } = await this.sesion.supabase
        .from('users_user')
        .select('id, first_name, last_name')
        .eq('alumno_grupo_id', tarea.grupo_id)
        .eq('rol', 'ALUMNO')
        .order('first_name');
      if (eAl) throw eAl;

      const { data: entregas, error: eEnt } = await this.sesion.supabase
        .from('academic_entregatarea')
        .select('*')
        .eq('tarea_id', tarea.id);
      if (eEnt) throw eEnt;

      const entregasPorAlumno = new Map<number, Entrega>();
      (entregas || []).forEach((e: any) => entregasPorAlumno.set(e.alumno_id, e));

      tarea.entregasAlumnos = (alumnos || [])
        .map((a: any) => {
          const entrega = entregasPorAlumno.get(a.id) || null;
          return {
            alumno_id: a.id,
            alumno_nombre: `${a.first_name} ${a.last_name}`.trim(),
            entrega,
            calificacionEdit: entrega?.calificacion ?? null,
            feedbackEdit: entrega?.feedback || '',
            guardando: false,
          } as AlumnoEntregaRow;
        })
        .sort((a, b) => {
          if (!!a.entrega === !!b.entrega) return a.alumno_nombre.localeCompare(b.alumno_nombre);
          return a.entrega ? -1 : 1;
        });

      tarea.totalEntregas = entregas?.length || 0;
      tarea.totalAlumnos = alumnos?.length || 0;
    } catch (e: any) {
      this.toast(`No se pudieron cargar las entregas: ${e.message}`, 'danger');
    } finally {
      tarea.cargandoEntregas = false;
    }
  }

  async guardarCalificacion(row: AlumnoEntregaRow) {
    if (!row.entrega) return;
    if (row.calificacionEdit == null || row.calificacionEdit < 0 || row.calificacionEdit > 10) {
      this.toast('La calificación debe ser entre 0 y 10.', 'warning');
      return;
    }
    row.guardando = true;
    try {
      const { data, error } = await this.sesion.supabase
        .from('academic_entregatarea')
        .update({
          calificacion: row.calificacionEdit,
          feedback: (row.feedbackEdit || '').trim(),
          estado: ESTADO_CALIFICADA,
          calificada_en: new Date().toISOString(),
        })
        .eq('id', row.entrega.id)
        .select().single();
      if (error) throw error;
      row.entrega = data;
      this.toast('Calificación guardada.', 'success');
    } catch (e: any) {
      this.toast(`No se pudo guardar: ${e.message}`, 'danger');
    } finally {
      row.guardando = false;
    }
  }

  esCalificada(entrega: Entrega | null | undefined): boolean {
    return (entrega?.estado || '').toUpperCase() === ESTADO_CALIFICADA;
  }

  // ─────────────────────────────────────────────
  // DOCENTE: FILTROS
  // ─────────────────────────────────────────────
  get materiasFiltro() { const m = new Map<number, string>(); this.tareas.forEach(t => m.set(t.materia_id, t.materia_nombre)); return [...m.entries()].map(([id, nombre]) => ({ id, nombre })); }
  get gruposFiltro() { const m = new Map<number, string>(); this.tareas.forEach(t => m.set(t.grupo_id, t.grupo_nombre)); return [...m.entries()].map(([id, nombre]) => ({ id, nombre })); }
  get hayFiltrosActivos() { return !!(this.searchTerm || this.filtroMateriaId || this.filtroGrupoId || this.filtroEstado !== 'todas'); }

  get tareasFiltradas(): Tarea[] {
    const q = this.searchTerm.trim().toLowerCase();
    return this.tareas.filter(t => {
      if (this.filtroEstado === 'activas' && this.esVencida(t)) return false;
      if (this.filtroEstado === 'vencidas' && !this.esVencida(t)) return false;
      if (this.filtroMateriaId && t.materia_id !== this.filtroMateriaId) return false;
      if (this.filtroGrupoId && t.grupo_id !== this.filtroGrupoId) return false;
      if (q && !t.titulo.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  limpiarFiltros() { this.searchTerm = ''; this.filtroMateriaId = null; this.filtroGrupoId = null; this.filtroEstado = 'todas'; }
  getPendientes() { return this.tareas.filter(t => !this.esVencida(t)).length; }
  getVencidas() { return this.tareas.filter(t => this.esVencida(t)).length; }

  // ─────────────────────────────────────────────
  // DOCENTE: FORMULARIO CREAR/EDITAR
  // ─────────────────────────────────────────────
  abrirFormularioNuevo() { this.editingTarea = null; this.resetForm(); this.showForm = true; this.snap(); }

  async abrirFormularioEditar(t: Tarea) {
    this.editingTarea = t;
    this.archivosEnProgreso = [];
    this.archivosExistentes = [...t.archivos];
    this.newTask = { titulo: t.titulo, materiaId: t.materia_id, grupoId: null, fecha: t.fecha_entrega?.slice(0, 10) || '', descripcion: t.descripcion, publicada: t.publicada };
    this.showForm = true;
    await this.onMateriaChange(t.grupo_id);
    this.snap();
  }

  duplicarTarea(t: Tarea) {
    this.editingTarea = null; this.archivosEnProgreso = []; this.archivosExistentes = [];
    this.newTask = { titulo: `${t.titulo} (copia)`, materiaId: t.materia_id, grupoId: null, fecha: '', descripcion: t.descripcion, publicada: t.publicada };
    this.showForm = true; this.onMateriaChange(); this.snap();
    this.toast('Revisa el grupo y la fecha antes de guardar.', 'warning');
  }

  private snap() { this.formSnapshot = JSON.stringify(this.newTask); }
  get hayCambios(): boolean { return this.showForm && (this.archivosEnProgreso.length > 0 || JSON.stringify(this.newTask) !== this.formSnapshot); }

  async solicitarCierreFormulario() {
    if (!this.hayCambios) { this.forzarCierre(); return; }
    const a = await this.alertCtrl.create({
      header: 'Descartar cambios',
      message: '¿Salir sin guardar?',
      buttons: [{ text: 'Seguir editando', role: 'cancel' }, { text: 'Descartar', role: 'destructive', handler: () => this.forzarCierre() }],
    });
    await a.present();
  }

  private forzarCierre() { this.showForm = false; this.editingTarea = null; this.resetForm(); }

  toggleForm() { this.showForm ? this.solicitarCierreFormulario() : this.abrirFormularioNuevo(); }

  private resetForm() {
    this.newTask = { titulo: '', materiaId: null, grupoId: null, fecha: '', descripcion: '', publicada: true };
    this.archivosEnProgreso = []; this.archivosExistentes = []; this.gruposDeMateria = []; this.formSnapshot = '';
  }

  async guardarTarea() {
    const t = this.newTask;
    if (!t.titulo.trim()) { this.toast('Ponle un título.', 'warning'); return; }
    if (!t.materiaId || !t.grupoId) { this.toast('Elige materia y grupo.', 'warning'); return; }
    if (!t.fecha) { this.toast('Elige fecha de entrega.', 'warning'); return; }
    if (t.fecha < this.fechaMinima) { this.toast('La fecha no puede ser anterior a hoy.', 'warning'); return; }
    if (this.archivosEnProgreso.some(a => a.subiendo)) { this.toast('Espera a que terminen de subirse los archivos.', 'warning'); return; }
    if (this.archivosEnProgreso.some(a => a.error)) { this.toast('Hay archivos con error.', 'warning'); return; }

    this.guardando = true;
    const archivosNuevos = this.archivosEnProgreso.filter(a => a.resultado).map(a => a.resultado!);
    const archivosFinal = [...this.archivosExistentes, ...archivosNuevos];
    const materiaSel = this.materias.find(m => m.id === t.materiaId);
    const grupoSel = this.gruposDeMateria.find(g => g.id === t.grupoId);

    try {
      if (this.editingTarea) await this.actualizar(archivosFinal, materiaSel, grupoSel);
      else await this.crear(archivosFinal, materiaSel, grupoSel);
      this.toast(this.editingTarea ? 'Tarea actualizada.' : 'Tarea creada.', 'success');
      this.forzarCierre();
    } catch (e: any) {
      console.error(e); this.toast(`Error: ${e.message}`, 'danger');
    } finally { this.guardando = false; }
  }

  private async crear(archivos: ArchivoSubido[], mat?: Materia, grp?: Grupo) {
    const t = this.newTask;
    const { data, error } = await this.sesion.supabase.from('academic_tarea').insert({
      titulo: t.titulo.trim(), descripcion: t.descripcion.trim(),
      fecha_entrega: t.fecha, asignatura_id: t.materiaId, grupo_id: t.grupoId,
      docente_id: this.sesion.usuario?.id, archivo: JSON.stringify(archivos), publicada: t.publicada,
    }).select().single();
    if (error) throw error;
    this.tareas.unshift({
      id: data.id, titulo: data.titulo, descripcion: data.descripcion || '', fecha_entrega: data.fecha_entrega,
      materia_id: data.asignatura_id, materia_nombre: mat?.nombre || '—',
      grupo_id: data.grupo_id, grupo_nombre: this.formatGrupo(grp),
      archivos, publicada: data.publicada, totalEntregas: 0, totalAlumnos: 0
    });
  }

  private async actualizar(archivos: ArchivoSubido[], mat?: Materia, grp?: Grupo) {
    const id = this.editingTarea!.id; const t = this.newTask;
    const { data, error } = await this.sesion.supabase.from('academic_tarea').update({
      titulo: t.titulo.trim(), descripcion: t.descripcion.trim(),
      fecha_entrega: t.fecha, asignatura_id: t.materiaId, grupo_id: t.grupoId,
      archivo: JSON.stringify(archivos), publicada: t.publicada,
    }).eq('id', id).select().single();
    if (error) throw error;
    const idx = this.tareas.findIndex(x => x.id === id);
    if (idx !== -1) this.tareas[idx] = {
      ...this.tareas[idx], ...data,
      materia_id: data.asignatura_id,
      materia_nombre: mat?.nombre || this.tareas[idx].materia_nombre,
      grupo_nombre: this.formatGrupo(grp) || this.tareas[idx].grupo_nombre,
      archivos
    };
  }

  async deleteTask(tarea: Tarea) {
    const detalle = tarea.totalEntregas
      ? ` Esta tarea tiene ${tarea.totalEntregas} entrega(s) que también se perderán.`
      : '';
    const a = await this.alertCtrl.create({
      header: 'Eliminar tarea', message: `¿Eliminar "${tarea.titulo}"?${detalle}`,
      buttons: [{ text: 'Cancelar', role: 'cancel' }, {
        text: 'Eliminar', role: 'destructive',
        handler: async () => {
          const { error } = await this.sesion.supabase.from('academic_tarea').delete().eq('id', tarea.id);
          if (error) { this.toast('No se pudo eliminar.', 'danger'); return; }
          this.tareas = this.tareas.filter(t => t.id !== tarea.id);
          this.toast('Tarea eliminada.', 'success');
        }
      }],
    });
    await a.present();
  }

  async togglePublicada(tarea: Tarea, ev: Event) {
    ev.stopPropagation();
    const { error } = await this.sesion.supabase.from('academic_tarea').update({ publicada: !tarea.publicada }).eq('id', tarea.id);
    if (error) { this.toast('No se pudo cambiar el estado.', 'danger'); return; }
    tarea.publicada = !tarea.publicada;
    this.toast(tarea.publicada ? 'Tarea publicada.' : 'Guardada como borrador.', 'success');
  }

  // ─────────────────────────────────────────────
  // DOCENTE: ARCHIVOS DE LA TAREA (múltiples)
  // ─────────────────────────────────────────────
  onDragOver(e: DragEvent) { e.preventDefault(); e.stopPropagation(); this.isDragging = true; }
  onDragLeave(e: DragEvent) { e.preventDefault(); e.stopPropagation(); this.isDragging = false; }
  onDrop(e: DragEvent) { e.preventDefault(); e.stopPropagation(); this.isDragging = false; if (e.dataTransfer?.files.length) this.subirArchivos(Array.from(e.dataTransfer.files)); }
  onFilesSelected(e: any) { if (e.target.files?.length) { this.subirArchivos(Array.from(e.target.files)); e.target.value = ''; } }

  private subirArchivos(files: File[]) {
    for (const file of files) {
      const err = this.validar(file);
      if (err) { this.toast(`"${file.name}": ${err}`, 'warning'); continue; }
      const item: ArchivoEnProgreso = { file, progreso: 0, subiendo: true, error: false };
      this.archivosEnProgreso.push(item);
      this.cloudinary.subirArchivo(file, pct => item.progreso = pct)
        .then(r => { item.subiendo = false; item.resultado = r; })
        .catch(() => { item.subiendo = false; item.error = true; });
    }
  }

  private validar(file: File): string | null {
    if (file.size / 1048576 > MAX_MB) return `Supera ${MAX_MB}MB.`;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (EXT_BAN.includes(ext)) return 'Tipo de archivo no permitido.';
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

  // ═══════════════════════════════════════════
  // ALUMNO: CARGAR SUS TAREAS + SU ENTREGA
  // ═══════════════════════════════════════════
async cargarTareasAlumno() {
  this.cargandoTareasAlumno = true;
  this.errorTareasAlumno = null;
  try {
    const uid = this.sesion.usuario!.id;

    // Antes: const grupoId = this.sesion.usuario?.alumno_grupo_id;
    // Ahora: se consulta fresco, igual que en inicio.page
    const { data: usu, error: eU } = await this.sesion.supabase
      .from('users_user')
      .select('alumno_grupo_id')
      .eq('id', uid)
      .single();
    if (eU) throw eU;

    const grupoId = (usu as any)?.alumno_grupo_id;
    if (!grupoId) { this.tareasAlumno = []; return; }

    const { data, error } = await this.sesion.supabase
      .from('academic_tarea')
      .select(`id, titulo, descripcion, fecha_entrega, archivo, publicada,
               asignatura_id, grupo_id,
               academic_asignatura(nombre),
               academic_grupo(nombre, grado, aula)`)
      .eq('grupo_id', grupoId)
      .eq('publicada', true)
      .order('fecha_entrega', { ascending: true });
    if (error) throw error;

      const tareas: Tarea[] = (data || []).map((t: any) => ({
        id: t.id,
        titulo: t.titulo,
        descripcion: t.descripcion || '',
        fecha_entrega: t.fecha_entrega,
        materia_id: t.asignatura_id,
        materia_nombre: t.academic_asignatura?.nombre || '—',
        grupo_id: t.grupo_id,
        grupo_nombre: this.formatGrupo(t.academic_grupo),
        archivos: this.parseArchivos(t.archivo),
        publicada: t.publicada ?? true,
        comentarioEntrega: '',
        archivoEntregaSeleccionado: null,
      }));

      if (tareas.length) {
        const ids = tareas.map(t => t.id);
        const { data: entregas, error: eEnt } = await this.sesion.supabase
          .from('academic_entregatarea')
          .select('*')
          .eq('alumno_id', uid)
          .in('tarea_id', ids);
        if (eEnt) throw eEnt;

        const porTarea = new Map<number, Entrega>();
        (entregas || []).forEach((e: any) => porTarea.set(e.tarea_id, e));
        tareas.forEach(t => t.entregaPropia = porTarea.get(t.id) || null);
      }

      this.tareasAlumno = tareas;
    } catch (e: any) {
      this.errorTareasAlumno = `No se pudieron cargar tus tareas. Detalle: ${e.message}`;
    } finally {
      this.cargandoTareasAlumno = false;
    }
  }

  toggleFormEntrega(tarea: Tarea) {
    tarea.mostrarFormEntrega = !tarea.mostrarFormEntrega;
    if (tarea.mostrarFormEntrega) {
      tarea.comentarioEntrega = tarea.entregaPropia?.comentario || '';
      tarea.archivoEntregaSeleccionado = null;
      tarea.errorEntrega = '';
    }
  }

  onArchivoEntregaSeleccionado(tarea: Tarea, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const err = this.validar(file);
    if (err) { tarea.errorEntrega = err; input.value = ''; return; }
    tarea.archivoEntregaSeleccionado = file;
    tarea.errorEntrega = '';
  }

  async enviarEntrega(tarea: Tarea) {
    if (this.tareaBloqueada(tarea)) {
      tarea.errorEntrega = this.esCalificada(tarea.entregaPropia)
        ? 'Esta tarea ya fue calificada, no puedes modificar tu entrega.'
        : 'La fecha de entrega ya venció, no puedes entregar ni modificar.';
      tarea.mostrarFormEntrega = false;
      return;
    }
    if (!tarea.archivoEntregaSeleccionado && !tarea.entregaPropia) {
      tarea.errorEntrega = 'Adjunta un archivo para entregar.';
      return;
    }
    if (!tarea.archivoEntregaSeleccionado && !tarea.entregaPropia) {
      tarea.errorEntrega = 'Adjunta un archivo para entregar.';
      return;
    }
    tarea.subiendoEntrega = true;
    tarea.progresoEntrega = 0;
    tarea.errorEntrega = '';

    try {
      let archivoUrl = tarea.entregaPropia?.archivo || '';
      if (tarea.archivoEntregaSeleccionado) {
        const subido = await this.cloudinary.subirArchivo(
          tarea.archivoEntregaSeleccionado,
          pct => tarea.progresoEntrega = pct
        );
        archivoUrl = subido.url;
      }

      const uid = this.sesion.usuario!.id;
      const comentario = (tarea.comentarioEntrega || '').trim();
      const ahora = new Date().toISOString();

      if (tarea.entregaPropia) {
        const { data, error } = await this.sesion.supabase
          .from('academic_entregatarea')
          .update({
            archivo: archivoUrl,
            comentario,
            estado: ESTADO_ENTREGADA,
            entregada_en: ahora,
            // Si vuelve a entregar, se resetea cualquier calificación previa
            calificacion: null,
            feedback: '',
            calificada_en: null,
          })
          .eq('id', tarea.entregaPropia.id)
          .select().single();
        if (error) throw error;
        tarea.entregaPropia = data;
      } else {
        const { data, error } = await this.sesion.supabase
          .from('academic_entregatarea')
          .insert({
            tarea_id: tarea.id,
            alumno_id: uid,
            archivo: archivoUrl,
            comentario,
            estado: ESTADO_ENTREGADA,
            entregada_en: ahora,
            feedback: '',
          })
          .select().single();
        if (error) throw error;
        tarea.entregaPropia = data;
      }

      tarea.mostrarFormEntrega = false;
      this.toast('Tarea entregada.', 'success');
    } catch (e: any) {
      tarea.errorEntrega = `No se pudo entregar: ${e.message}`;
    } finally {
      tarea.subiendoEntrega = false;
    }
  }

  esTardia(tarea: Tarea): boolean {
    if (!tarea.entregaPropia) return false;
    return tarea.entregaPropia.entregada_en.slice(0, 10) > tarea.fecha_entrega;
  }
  tareaBloqueada(tarea: Tarea): boolean {
    return this.esVencida(tarea) || this.esCalificada(tarea.entregaPropia);
  }
  // ─────────────────────────────────────────────
  // COMPARTIDOS
  // ─────────────────────────────────────────────
  getFileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    const m: Record<string, string> = { pdf: 'document-text-outline', doc: 'reader-outline', docx: 'reader-outline', jpg: 'image-outline', jpeg: 'image-outline', png: 'image-outline', mp4: 'videocam-outline', mov: 'videocam-outline', zip: 'archive-outline', rar: 'archive-outline' };
    return m[ext || ''] || 'document-outline';
  }

  formatSize(b: number): string {
    if (!b) return '0 B'; const k = 1024, s = ['B', 'KB', 'MB'], i = Math.floor(Math.log(b) / Math.log(k));
    return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
  }

  private async toast(msg: string, color: string) {
    const t = await this.toastCtrl.create({ message: msg, duration: 2500, color, position: 'bottom' });
    await t.present();
  }
  getPendientesAlumno(): number {
  return this.tareasAlumno.filter(t => !t.entregaPropia && !this.esVencida(t)).length;
}
irADetalle(tarea: Tarea) {
  this.router.navigate(['/tareas', tarea.id]);
}
}
