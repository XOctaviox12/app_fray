import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService, ArchivoSubido } from '../../services/cloudinary.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

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

  // ── Datos ────────────────────────────────────────────────────
  materials: MaterialItem[] = [];

  // Tareas recientes (preview estático — enlaza a /tareas)
  recentTasks: { title: string; date: string; status: string }[] = [];

  // Contenido educativo estático (GeoGebra, Kahoot, etc.)
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
  searchTerm   = '';
  filtroTipo   = 'TODOS';

  readonly fechaMinima = new Date().toISOString().split('T')[0];

  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esAlumno():  boolean { return this.sesion.esAlumno(); }
  get esTutor():   boolean { return this.sesion.esTutor(); }

  get materialesFiltrados(): MaterialItem[] {
    return this.materials.filter(m => {
      if (this.filtroTipo !== 'TODOS' && m.tipo !== this.filtroTipo) return false;
      if (this.searchTerm.trim()) {
        const q = this.searchTerm.toLowerCase();
        return m.titulo.toLowerCase().includes(q) || m.asignatura.toLowerCase().includes(q);
      }
      return true;
    });
  }

  constructor(
    private router:     Router,
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
    this.cargarDatos();
    if (this.esDocente) this.cargarMaterias();
  }

  // ══════════════════════════════════════════════════════════
  //  CARGA DE MATERIALES
  // ══════════════════════════════════════════════════════════

  async cargarDatos() {
    this.cargando = true;
    try {
      if (this.esDocente)     await this.cargarMaterialesDocente();
      else if (this.esAlumno) await this.cargarMaterialesAlumno();
      else if (this.esTutor)  await this.cargarMaterialesAlumnoHijo();
    } catch (e: any) {
      console.error('Herramientas:', e.message);
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

  abrirNuevo() {
    this.editingId = null;
    this.resetForm();
    this.showForm = true;
  }

  async abrirEditar(mat: MaterialItem) {
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
    if (!this.newMaterial.titulo.trim() && !this.archivoSeleccionado) { this.forzarCierre(); return; }
    const a = await this.alertCtrl.create({
      header: 'Descartar cambios', message: '¿Salir sin guardar?',
      buttons: [{ text: 'Seguir', role: 'cancel' }, { text: 'Descartar', role: 'destructive', handler: () => this.forzarCierre() }]
    });
    await a.present();
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
      };

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
            this.toast('Material eliminado.', 'success');
          }
        }
      ]
    });
    await a.present();
  }

  // ── Abrir material ────────────────────────────────────────
  abrirMaterial(mat: MaterialItem) {
    const url = mat.url_externa || mat.archivo_url;
    if (url) window.open(url, '_blank');
  }

  // ══════════════════════════════════════════════════════════
  //  ARCHIVOS
  // ══════════════════════════════════════════════════════════

  onDragOver(e: DragEvent)  { e.preventDefault(); this.isDragging = true; }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.isDragging = false; }
  onDrop(e: DragEvent) {
    e.preventDefault(); this.isDragging = false;
    if (e.dataTransfer?.files.length) this.archivoSeleccionado = e.dataTransfer.files[0];
  }
  onFileSelected(e: any) {
    if (e.target.files.length) {
      const file: File = e.target.files[0];
      if (file.size / 1048576 > 50) { this.toast('El archivo supera 50MB.', 'warning'); return; }
      this.archivoSeleccionado = file;
      e.target.value = '';
    }
  }
  quitarArchivo() { this.archivoSeleccionado = null; this.archivoExistente = null; }

  // ══════════════════════════════════════════════════════════
  //  HELPERS UI
  // ══════════════════════════════════════════════════════════

  scrollTo(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }
  goToTareas()         { this.router.navigate(['/tareas']); }
  openContent(item: any) { if (item.url) window.open(item.url, '_blank'); }

  getTypeIcon(tipo: string): string { return ICON_MAP[tipo] || 'attach-outline'; }

  getTypeColor(tipo: string): string {
    return { PDF:'#ef4444', VIDEO:'#ff6b00', IMAGEN:'#3b82f6', LINK:'#8b5cf6', OTRO:'#64748b' }[tipo] || '#64748b';
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
