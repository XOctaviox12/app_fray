import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService, ArchivoSubido } from '../../services/cloudinary.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';
import { VisorArchivosService } from '../../services/visor-archivos.service';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface MaterialItem {
  id: number;
  titulo: string;
  descripcion: string;
  tipo: 'PDF' | 'VIDEO' | 'IMAGEN' | 'LINK' | 'OTRO';
  archivo_url: string | null;
  url_externa: string | null;
  asignatura: string;
  asignatura_id: number;
  grupo: string;
  grupo_id: number;
  activo: boolean;
  creado_en: string;
}

interface Materia { id: number; nombre: string; }
interface Grupo   { id: number; nombre: string; grado: number; }

const ICON_MAP: Record<string, string> = {
  PDF:    'document-text-outline',
  VIDEO:  'videocam-outline',
  IMAGEN: 'image-outline',
  LINK:   'link-outline',
  OTRO:   'attach-outline',
};

// Extensiones aceptadas por tipo. Array vacío = cualquier extensión permitida.
const EXTENSIONES_VALIDAS: Record<string, string[]> = {
  PDF:    ['pdf'],
  IMAGEN: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  VIDEO:  ['mp4', 'mov', 'avi', 'webm', 'mkv'],
  OTRO:   [],
};

@Component({
  selector: 'app-herramientas',
  templateUrl: './herramientas.page.html',
  styleUrls: ['./herramientas.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class HerramientasPage implements OnInit {

  private supabase: SupabaseClient;

  // ── Estado ───────────────────────────────────────────────────
  cargando    = true;
  guardando   = false;
  isDragging  = false;
  showForm    = false;
  editingId: number | null = null;
  error = '';

  // Se activa si el rol del usuario no tiene una vista de materiales soportada
  sinRolSoportado = false;

  // ── Datos ────────────────────────────────────────────────────
  materials: MaterialItem[] = [];

  // Contenido educativo estático (GeoGebra, Kahoot, etc.)
  // NOTA: hoy es fijo en el código. Si se quiere que un admin lo edite sin
  // tocar código, hay que moverlo a una tabla en base de datos (ver recomendación aparte).
  educationalContent = [
    { icon: 'calculator-outline', title: 'GeoGebra',         description: 'Geometría y álgebra interactiva.',    category: 'Matemáticas', duration: 'Ilimitado', level: 'básico',     gradient: 'linear-gradient(135deg,#0a1f44,#1a3a6e)', url: 'https://www.geogebra.org/calculator' },
    { icon: 'flask-outline',      title: 'PhET Simulations', description: 'Simulaciones científicas de la U. de Colorado.',  category: 'Ciencias',    duration: 'Ilimitado', level: 'intermedio', gradient: 'linear-gradient(135deg,#ff6b00,#ff9a44)', url: 'https://phet.colorado.edu/es/' },
    { icon: 'game-controller-outline', title: 'Kahoot',      description: 'Cuestionarios interactivos en clase.', category: 'Evaluación',  duration: 'Variable', level: 'básico',     gradient: 'linear-gradient(135deg,#1a3a6e,#4a7ab5)', url: 'https://kahoot.com/' },
    { icon: 'library-outline',    title: 'Quizlet',          description: 'Tarjetas de memoria y tests.', category: 'Estudio',     duration: 'Variable', level: 'básico',     gradient: 'linear-gradient(135deg,#0a1f44,#ff6b00)', url: 'https://quizlet.com/' },
  ];

  // ── Formulario ───────────────────────────────────────────────
  newMaterial = {
    titulo:      '',
    descripcion: '',
    tipo:        'PDF' as string,
    url_externa: '',
    materiaId:   null as number | null,
    grupoId:     null as number | null,
  };

  archivoSeleccionado: File | null = null;
  archivoExistente: string | null  = null; // URL Cloudinary ya guardada
  subiendoArchivo  = false;
  progresoArchivo  = 0;

  // ── Selectores materia/grupo ─────────────────────────────────
  materias:        Materia[] = [];
  gruposDeMateria: Grupo[]   = [];
  cargandoOpts    = false;

  // ── Búsqueda y filtros ───────────────────────────────────────
  searchTerm    = '';
  filtroTipo    = 'TODOS';
  filtroMateria = 'TODAS';

  // ── Paginación ───────────────────────────────────────────────
  pageSize = 12;
  paginaActual = 1;

  readonly fechaMinima = new Date().toISOString().split('T')[0];

  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esAlumno():  boolean { return this.sesion.esAlumno(); }
  get esTutor():   boolean { return this.sesion.esTutor(); }

  // Asunción: estos métodos siguen el mismo patrón que esDocente/esAlumno/esTutor.
  // Si no existen en SesionService, avísame para ajustar el nombre real.
  get esAdmin():    boolean { return (this.sesion as any).esAdmin?.()    ?? false; }
  get esCoord():     boolean { return (this.sesion as any).esCoord?.()    ?? false; }
  get esDirector():  boolean { return (this.sesion as any).esDirector?.() ?? false; }

  get puedeGestionar(): boolean { return this.esDocente; } // quién puede subir/editar/borrar

  get materialesFiltrados(): MaterialItem[] {
    return this.materials.filter(m => {
      if (this.filtroTipo !== 'TODOS' && m.tipo !== this.filtroTipo) return false;
      if (this.filtroMateria !== 'TODAS' && m.asignatura !== this.filtroMateria) return false;
      if (this.searchTerm.trim()) {
        const q = this.searchTerm.toLowerCase();
        return m.titulo.toLowerCase().includes(q)
          || m.asignatura.toLowerCase().includes(q)
          || m.descripcion.toLowerCase().includes(q);
      }
      return true;
    });
  }

  // Lista de materias presentes en el material cargado, para armar los chips de filtro.
  // Se calcula a partir de los materiales, no de un catálogo aparte, así solo aparecen
  // materias que realmente tienen contenido publicado.
  get materiasConMaterial(): string[] {
    return [...new Set(this.materials.map(m => m.asignatura))].sort((a, b) => a.localeCompare(b, 'es'));
  }

  contarMateria(nombre: string): number {
    return this.materials.filter(m => m.asignatura === nombre).length;
  }

  cambiarFiltroMateria(materia: string) {
    this.filtroMateria = materia;
    this.paginaActual = 1;
  }

  get materialesPaginados(): MaterialItem[] {
    return this.materialesFiltrados.slice(0, this.pageSize * this.paginaActual);
  }

  get hayMasPorCargar(): boolean {
    return this.materialesPaginados.length < this.materialesFiltrados.length;
  }

  cargarMas() { this.paginaActual++; }

  cambiarFiltroTipo(tipo: string) {
    this.filtroTipo = tipo;
    this.paginaActual = 1;
  }

  onBusquedaCambia() {
    this.paginaActual = 1;
  }

  contarTipo(tipo: string): number {
    return this.materials.filter(m => m.tipo === tipo).length;
  }

  constructor(
    private router:     Router,
    private sesion:     SesionService,
    private cloudinary: CloudinaryService,
    private alertCtrl:  AlertController,
    private toastCtrl:  ToastController,
    private visorArchivos: VisorArchivosService,
  ) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  ngOnInit() {
    this.cargarDatos();
    if (this.esDocente) this.cargarMaterias();
  }

  // ══════════════════════════════════════════════════════════
  //  CARGA DE MATERIALES
  // ══════════════════════════════════════════════════════════

  async cargarDatos() {
    this.cargando = true;
    this.error = '';
    this.sinRolSoportado = false;
    this.paginaActual = 1;
    this.filtroMateria = 'TODAS';
    try {
      if (this.esDocente)          await this.cargarMaterialesDocente();
      else if (this.esAlumno)      await this.cargarMaterialesAlumno();
      else if (this.esTutor)       await this.cargarMaterialesAlumnoHijo();
      else if (this.esAdmin || this.esCoord || this.esDirector) await this.cargarMaterialesAdmin();
      else this.sinRolSoportado = true;
    } catch (e: any) {
      console.error('Herramientas:', e.message);
      this.error = 'Error al cargar materiales: ' + e.message;
    } finally {
      this.cargando = false;
    }
  }

  private async cargarMaterialesDocente() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    const { data, error } = await this.supabase
      .from('academic_materialapoyo')
      .select('id, titulo, descripcion, tipo, archivo, url_externa, activo, creado_en, asignatura_id, grupo_id')
      .eq('docente_id', docenteId)
      .eq('activo', true)
      .order('creado_en', { ascending: false });

    if (error) throw error;
    await this.hidratar(data || []);
  }

  private async cargarMaterialesAlumno() {
    const alumnoId = this.sesion.usuario?.id;
    if (!alumnoId) return;

    const { data: usu } = await this.supabase
      .from('users_user').select('alumno_grupo_id').eq('id', alumnoId).single();
    const grupoId = (usu as any)?.alumno_grupo_id;
    if (!grupoId) return;

    const { data, error } = await this.supabase
      .from('academic_materialapoyo')
      .select('id, titulo, descripcion, tipo, archivo, url_externa, activo, creado_en, asignatura_id, grupo_id')
      .eq('grupo_id', grupoId)
      .eq('activo', true)
      .order('creado_en', { ascending: false });

    if (error) throw error;
    await this.hidratar(data || []);
  }

  private async cargarMaterialesAlumnoHijo() {
    const alumnoId = this.sesion.tutor?.alumno_id;
    if (!alumnoId) return;

    const { data: usu } = await this.supabase
      .from('users_user').select('alumno_grupo_id').eq('id', alumnoId).single();
    const grupoId = (usu as any)?.alumno_grupo_id;
    if (!grupoId) return;

    const { data, error } = await this.supabase
      .from('academic_materialapoyo')
      .select('id, titulo, descripcion, tipo, archivo, url_externa, activo, creado_en, asignatura_id, grupo_id')
      .eq('grupo_id', grupoId)
      .eq('activo', true)
      .order('creado_en', { ascending: false });

    if (error) throw error;
    await this.hidratar(data || []);
  }

  // Vista de solo lectura para ADMIN/COORD/DIRECTOR: todos los materiales del plantel.
  // Asunción: sesion.usuario trae plantel_id, siguiendo el mismo aislamiento
  // por plantel que ya usas en el resto del proyecto. Ajusta el nombre del campo si difiere.
  private async cargarMaterialesAdmin() {
    const plantelId = (this.sesion.usuario as any)?.plantel_id;
    if (!plantelId) { this.sinRolSoportado = true; return; }

    const { data: grupos, error: gErr } = await this.supabase
      .from('academic_grupo').select('id').eq('plantel_id', plantelId);
    if (gErr) throw gErr;

    const grupoIds = (grupos || []).map((g: any) => g.id);
    if (!grupoIds.length) return;

    const { data, error } = await this.supabase
      .from('academic_materialapoyo')
      .select('id, titulo, descripcion, tipo, archivo, url_externa, activo, creado_en, asignatura_id, grupo_id')
      .in('grupo_id', grupoIds)
      .eq('activo', true)
      .order('creado_en', { ascending: false });

    if (error) throw error;
    await this.hidratar(data || []);
  }

  // Hidrata con nombres de asignatura y grupo
  private async hidratar(rows: any[]) {
    if (!rows.length) { this.materials = []; return; }

    const asiIds = [...new Set(rows.map(r => r.asignatura_id))];
    const gruIds = [...new Set(rows.map(r => r.grupo_id))];

    const [{ data: asis }, { data: grus }] = await Promise.all([
      this.supabase.from('academic_asignatura').select('id, nombre').in('id', asiIds),
      this.supabase.from('academic_grupo').select('id, nombre, grado').in('id', gruIds),
    ]);

    const asiMap: Record<number, string> = {};
    const gruMap: Record<number, string> = {};
    (asis || []).forEach((a: any) => { asiMap[a.id] = a.nombre; });
    (grus || []).forEach((g: any) => { gruMap[g.id] = `${g.grado}° ${g.nombre}`; });

    this.materials = rows.map(r => ({
      id:           r.id,
      titulo:       r.titulo,
      descripcion:  r.descripcion || '',
      tipo:         r.tipo,
      archivo_url:  r.archivo || null,
      url_externa:  r.url_externa || null,
      asignatura:   asiMap[r.asignatura_id] || '—',
      asignatura_id: r.asignatura_id,
      grupo:        gruMap[r.grupo_id] || '—',
      grupo_id:     r.grupo_id,
      activo:       r.activo,
      creado_en:    r.creado_en,
    }));
  }

  // ══════════════════════════════════════════════════════════
  //  OPCIONES MATERIA / GRUPO (docente)
  // ══════════════════════════════════════════════════════════

  async cargarMaterias() {
    const uid = this.sesion.usuario?.id;
    if (!uid) return;
    const { data: rel } = await this.supabase
      .from('academic_asignatura_docentes').select('asignatura_id').eq('user_id', uid);
    const ids = [...new Set((rel || []).map((r: any) => r.asignatura_id))];
    if (!ids.length) return;
    const { data } = await this.supabase.from('academic_asignatura').select('id, nombre').in('id', ids).order('nombre');
    this.materias = data || [];
  }

  async onMateriaChange() {
    this.newMaterial.grupoId = null;
    this.gruposDeMateria = [];
    if (!this.newMaterial.materiaId) return;
    this.cargandoOpts = true;
    try {
      const uid = this.sesion.usuario?.id;
      const { data: relGM } = await this.supabase
        .from('academic_asignatura_grupos').select('grupo_id').eq('asignatura_id', this.newMaterial.materiaId);
      const idsGM = (relGM || []).map((r: any) => r.grupo_id);
      if (!idsGM.length) return;

      const { data: relDG } = await this.supabase
        .from('academic_grupo_docentes').select('grupo_id').eq('user_id', uid).in('grupo_id', idsGM);
      const idsFinal = (relDG || []).map((r: any) => r.grupo_id);
      if (!idsFinal.length) return;

      const { data } = await this.supabase
        .from('academic_grupo').select('id, nombre, grado').in('id', idsFinal).order('grado');
      this.gruposDeMateria = data || [];
    } finally { this.cargandoOpts = false; }
  }

  // ══════════════════════════════════════════════════════════
  //  FORMULARIO — ABRIR / CERRAR
  // ══════════════════════════════════════════════════════════

  async abrirNuevo() {
    // Si ya hay un formulario abierto (p.ej. editando) con cambios sin guardar,
    // confirmar antes de descartarlo — antes este botón lo pisaba sin preguntar.
    if (this.showForm && this.hayCambiosSinGuardar()) {
      const confirmado = await this.confirmarDescarte();
      if (!confirmado) return;
    }
    this.editingId = null;
    this.resetForm();
    this.showForm = true;
  }

  async abrirEditar(mat: MaterialItem) {
    if (this.showForm && this.hayCambiosSinGuardar()) {
      const confirmado = await this.confirmarDescarte();
      if (!confirmado) return;
    }
    this.editingId = mat.id;
    this.archivoSeleccionado = null;
    this.archivoExistente    = mat.archivo_url;
    this.newMaterial = {
      titulo:      mat.titulo,
      descripcion: mat.descripcion,
      tipo:        mat.tipo,
      url_externa: mat.url_externa || '',
      materiaId:   mat.asignatura_id,
      grupoId:     mat.grupo_id,
    };
    this.showForm = true;
    await this.onMateriaChange();
    this.newMaterial.grupoId = mat.grupo_id;
  }

  forzarCierre() {
    this.showForm = false;
    this.editingId = null;
    this.resetForm();
  }

  async solicitarCierre() {
    if (!this.hayCambiosSinGuardar()) { this.forzarCierre(); return; }
    const confirmado = await this.confirmarDescarte();
    if (confirmado) this.forzarCierre();
  }

  private hayCambiosSinGuardar(): boolean {
    return !!this.newMaterial.titulo.trim() || !!this.archivoSeleccionado;
  }

  private confirmarDescarte(): Promise<boolean> {
    return new Promise((resolve) => {
      this.alertCtrl.create({
        header: 'Descartar cambios', message: '¿Salir sin guardar?',
        buttons: [
          { text: 'Seguir', role: 'cancel', handler: () => resolve(false) },
          { text: 'Descartar', role: 'destructive', handler: () => resolve(true) },
        ]
      }).then(a => a.present());
    });
  }

  private resetForm() {
    this.newMaterial = { titulo: '', descripcion: '', tipo: 'PDF', url_externa: '', materiaId: null, grupoId: null };
    this.archivoSeleccionado = null;
    this.archivoExistente    = null;
    this.gruposDeMateria     = [];
    this.subiendoArchivo     = false;
    this.progresoArchivo     = 0;
  }

  // ══════════════════════════════════════════════════════════
  //  GUARDAR MATERIAL
  // ══════════════════════════════════════════════════════════

  async guardarMaterial() {
    const f = this.newMaterial;
    if (!f.titulo.trim())  { this.toast('Ponle un título al material.', 'warning'); return; }
    if (!f.materiaId)      { this.toast('Elige la materia.',           'warning'); return; }
    if (!f.grupoId)        { this.toast('Elige el grupo.',             'warning'); return; }
    if (f.tipo !== 'LINK' && !this.archivoSeleccionado && !this.archivoExistente && !f.url_externa)
      { this.toast('Agrega un archivo o una URL.', 'warning'); return; }
    if (f.tipo === 'LINK' && !f.url_externa?.trim())
      { this.toast('Ingresa la URL del enlace.', 'warning'); return; }

    this.guardando = true;
    try {
      let archivo_url = this.archivoExistente;
      const archivoAnteriorParaBorrar = this.editingId ? this.materials.find(m => m.id === this.editingId)?.archivo_url : null;

      // Subir archivo a Cloudinary si hay uno nuevo
      if (this.archivoSeleccionado) {
        this.subiendoArchivo = true;
        const r = await this.cloudinary.subirArchivo(
          this.archivoSeleccionado,
          pct => { this.progresoArchivo = pct; }
        );
        archivo_url = r.url;
        this.subiendoArchivo = false;
      }

      const payload: any = {
        titulo:       f.titulo.trim(),
        descripcion:  f.descripcion.trim(),
        tipo:         f.tipo,
        url_externa:  f.url_externa?.trim() || null,
        archivo:      archivo_url,
        asignatura_id: f.materiaId,
        grupo_id:     f.grupoId,
        docente_id:   this.sesion.usuario?.id,
        activo:       true,
        orden:        0,
      };

      if (!this.editingId) {
        payload.creado_en = new Date().toISOString();
      }

      if (this.editingId) {
        const { data, error } = await this.supabase
          .from('academic_materialapoyo').update(payload).eq('id', this.editingId).select().single();
        if (error) throw error;

        const idx = this.materials.findIndex(m => m.id === this.editingId);
        if (idx !== -1) {
          const asi = this.materias.find(m => m.id === f.materiaId);
          const gru = this.gruposDeMateria.find(g => g.id === f.grupoId);
          this.materials[idx] = {
            ...this.materials[idx],
            titulo: data.titulo, descripcion: data.descripcion, tipo: data.tipo,
            archivo_url, url_externa: data.url_externa,
            asignatura: asi?.nombre || this.materials[idx].asignatura,
            grupo: gru ? `${gru.grado}° ${gru.nombre}` : this.materials[idx].grupo,
          };
        }

        // El archivo viejo quedó reemplazado: intentar limpiarlo de Cloudinary.
        // Requiere borrado firmado desde el backend (ver nota aparte); si el método
        // no existe todavía en CloudinaryService, esto no rompe el guardado.
        if (archivoAnteriorParaBorrar && archivoAnteriorParaBorrar !== archivo_url) {
          this.limpiarArchivoHuerfano(archivoAnteriorParaBorrar);
        }

        this.toast('Material actualizado.', 'success');
      } else {
        const { data, error } = await this.supabase
          .from('academic_materialapoyo').insert(payload).select().single();
        if (error) throw error;

        const asi = this.materias.find(m => m.id === f.materiaId);
        const gru = this.gruposDeMateria.find(g => g.id === f.grupoId);
        this.materials.unshift({
          id: data.id, titulo: data.titulo, descripcion: data.descripcion, tipo: data.tipo,
          archivo_url, url_externa: data.url_externa,
          asignatura: asi?.nombre || '—', asignatura_id: f.materiaId!,
          grupo: gru ? `${gru.grado}° ${gru.nombre}` : '—', grupo_id: f.grupoId!,
          activo: true, creado_en: data.creado_en,
        });
        this.toast('Material publicado.', 'success');
      }

      this.forzarCierre();
    } catch (e: any) {
      this.toast(`Error: ${e.message}`, 'danger');
    } finally {
      this.guardando       = false;
      this.subiendoArchivo = false;
    }
  }

  // ── Eliminar ──────────────────────────────────────────────
  async eliminarMaterial(mat: MaterialItem) {
    const a = await this.alertCtrl.create({
      header: 'Eliminar material',
      message: `¿Eliminar "${mat.titulo}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar', role: 'destructive',
          handler: async () => {
            // Soft delete: activo = false
            const { error } = await this.supabase
              .from('academic_materialapoyo').update({ activo: false }).eq('id', mat.id);
            if (error) { this.toast('No se pudo eliminar.', 'danger'); return; }
            this.materials = this.materials.filter(m => m.id !== mat.id);
            if (mat.archivo_url) this.limpiarArchivoHuerfano(mat.archivo_url);
            this.toast('Material eliminado.', 'success');
          }
        }
      ]
    });
    await a.present();
  }

  // Intenta borrar el archivo de Cloudinary. No bloquea el flujo si falla:
  // el borrado real necesita un endpoint firmado en el backend (Django), ya que
  // el API secret de Cloudinary no debe vivir en el cliente Angular.
  private async limpiarArchivoHuerfano(url: string) {
    try {
      await (this.cloudinary as any).eliminarArchivo?.(url);
    } catch (e) {
      console.warn('No se pudo limpiar archivo huérfano en Cloudinary:', url);
    }
  }

  // ── Abrir material ────────────────────────────────────────
  abrirMaterial(mat: MaterialItem) {
    const url = mat.url_externa || this.urlArchivo(mat.archivo_url);
    if (url) this.visorArchivos.abrir(url);
  }

  // ══════════════════════════════════════════════════════════
  //  ARCHIVOS
  // ══════════════════════════════════════════════════════════

  onDragOver(e: DragEvent)  { e.preventDefault(); this.isDragging = true; }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.isDragging = false; }
  onDrop(e: DragEvent) {
    e.preventDefault(); this.isDragging = false;
    if (e.dataTransfer?.files.length) this.validarYAsignarArchivo(e.dataTransfer.files[0]);
  }
  onFileSelected(e: any) {
    if (e.target.files.length) {
      this.validarYAsignarArchivo(e.target.files[0]);
      e.target.value = '';
    }
  }

  private validarYAsignarArchivo(file: File) {
    if (file.size / 1048576 > 50) { this.toast('El archivo supera 50MB.', 'warning'); return; }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const permitidas = EXTENSIONES_VALIDAS[this.newMaterial.tipo];
    if (permitidas && permitidas.length && !permitidas.includes(ext)) {
      this.toast(
        `El tipo "${this.newMaterial.tipo}" no acepta archivos .${ext}. Formatos válidos: ${permitidas.join(', ')}`,
        'warning'
      );
      return;
    }

    this.archivoSeleccionado = file;
  }

  quitarArchivo() { this.archivoSeleccionado = null; this.archivoExistente = null; }

  // ══════════════════════════════════════════════════════════
  //  HELPERS UI
  // ══════════════════════════════════════════════════════════

  scrollTo(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }
  goToTareas()         { this.router.navigate(['/tareas']); }
  openContent(item: any) { if (item.url) this.visorArchivos.abrir(item.url); }

  getTypeIcon(tipo: string): string { return ICON_MAP[tipo] || 'attach-outline'; }

  getTypeColor(tipo: string): string {
    return { PDF:'#ef4444', VIDEO:'#ff6b00', IMAGEN:'#3b82f6', LINK:'#8b5cf6', OTRO:'#64748b' }[tipo] || '#64748b';
  }

  // Normaliza el valor guardado en "archivo" para poder abrirlo/mostrarlo.
  // En academic_materialapoyo hay registros viejos donde "archivo" quedó
  // guardado como ruta relativa de Cloudinary (sin dominio, ej:
  // "image/upload/v.../archivo.pdf") y otros donde puede venir con basura
  // pegada antes de la URL real. Esta función:
  //  1) Si ya trae "http" en algún punto, corta todo lo anterior (limpia prefijos corruptos).
  //  2) Si no trae "http" para nada (ruta relativa "pura" de Cloudinary),
  //     reconstruye la URL completa usando el cloud_name de environment.
  urlArchivo(raw: string | null | undefined): string {
    if (!raw) return '';
    const idx = raw.indexOf('http');
    if (idx > 0) return raw.slice(idx);
    if (idx === 0) return raw;

    // No trae "http": es una ruta relativa de Cloudinary (image/upload/v.../archivo.ext)
    const cloudName = (environment as any).cloudinaryCloudName;
    if (cloudName) {
      const rutaLimpia = raw.replace(/^\/+/, '');
      return `https://res.cloudinary.com/${cloudName}/${rutaLimpia}`;
    }
    // Sin cloud_name configurado, devolvemos tal cual para no romper el flujo.
    return raw;
  }

  formatSize(b: number): string {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  private async toast(msg: string, color: string) {
    const t = await this.toastCtrl.create({ message: msg, duration: 2500, color, position: 'bottom' });
    await t.present();
  }
}
