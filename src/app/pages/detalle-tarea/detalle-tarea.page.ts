import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService } from '../../services/cloudinary.service';
import { VisorArchivosService } from '../../services/visor-archivos.service';
import { environment } from 'src/environments/environment';

interface ArchivoSubido { name: string; url: string; }

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

interface Comentario {
  id: number;
  texto: string;
  creado_en: string;
  autor_id: number;
  tarea_id: number;
  autor_nombre: string;
  autor_rol: string;
  editando?: boolean;
  textoEdit?: string;
}

interface TareaDetalle {
  id: number; titulo: string; descripcion: string; fecha_entrega: string;
  materia_id: number; materia_nombre: string;
  grupo_id: number; grupo_nombre: string;
  archivos: ArchivoSubido[]; publicada: boolean; docente_id: number;
}

const ESTADO_ENTREGADA = 'ENTREGADA';
const ESTADO_CALIFICADA = 'CALIFICADA';
const MAX_MB = 20;
const EXT_BAN = ['exe', 'bat', 'sh', 'cmd', 'msi'];

@Component({
  standalone: false,
  selector: 'app-detalle-tarea',
  templateUrl: './detalle-tarea.page.html',
  styleUrls: ['./detalle-tarea.page.scss'],
})
export class DetalleTareaPage implements OnInit {

  tareaId!: number;
  tarea: TareaDetalle | null = null;
  cargando = true;
  error: string | null = null;

  // ── Docente: entregas ──
  entregasAlumnos: AlumnoEntregaRow[] = [];
  totalAlumnos = 0;
  totalEntregas = 0;
  totalCalificadas = 0;

  // ── Alumno: mi entrega ──
  entregaPropia: Entrega | null = null;
  mostrarFormEntrega = false;
  comentarioEntrega = '';
  archivoEntregaSeleccionado: File | null = null;
  subiendoEntrega = false;
  progresoEntrega = 0;
  errorEntrega = '';

  // ── Comentarios (ambos roles) ──
  comentarios: Comentario[] = [];
  nuevoComentario = '';
  enviandoComentario = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sesion: SesionService,
    private cloudinary: CloudinaryService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private visorArchivos: VisorArchivosService,
  ) {}

  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esAlumno(): boolean { return this.sesion.esAlumno(); }
  get fechaMinima(): string { return new Date().toISOString().split('T')[0]; }

  ngOnInit() {
    this.tareaId = Number(this.route.snapshot.paramMap.get('id'));
    this.cargarTodo();
  }

  ionViewWillEnter() {
    if (this.tareaId) this.cargarTodo();
  }

  async cargarTodo() {
    await this.cargarTarea();
    if (!this.tarea) return;
    if (this.esDocente) await this.cargarEntregas();
    else if (this.esAlumno) await this.cargarMiEntrega();
    await this.cargarComentarios();
  }

  doRefresh(ev: any) {
    this.cargarTodo().then(() => ev.target.complete());
  }

  // ─────────────────────────────────────────────
  // TAREA
  // ─────────────────────────────────────────────
  async cargarTarea() {
    this.cargando = true;
    this.error = null;
    try {
      const { data, error } = await this.sesion.supabase
        .from('academic_tarea')
        .select(`id, titulo, descripcion, fecha_entrega, archivo, publicada, docente_id,
                 asignatura_id, grupo_id,
                 academic_asignatura(nombre),
                 academic_grupo(nombre, grado, aula)`)
        .eq('id', this.tareaId)
        .single();
      if (error) throw error;
      const t: any = data;
      this.tarea = {
        id: t.id,
        titulo: t.titulo,
        descripcion: t.descripcion || '',
        fecha_entrega: t.fecha_entrega,
        materia_id: t.asignatura_id,
        materia_nombre: t.academic_asignatura?.nombre || '—',
        grupo_id: t.grupo_id,
        grupo_nombre: this.formatGrupo(t.academic_grupo),
        archivos: this.parseArchivos(t.archivo),
        publicada: t.publicada,
        docente_id: t.docente_id,
      };
    } catch (e: any) {
      this.error = `No se pudo cargar la tarea. Detalle: ${e.message}`;
    } finally {
      this.cargando = false;
    }
  }

  formatGrupo(g: any): string {
    if (!g) return '—';
    return g.aula ? `${g.grado}° ${g.nombre} — Aula ${g.aula}` : `${g.grado}° ${g.nombre}`;
  }

  private parseArchivos(raw: string | null): ArchivoSubido[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return []; }
  }

  esVencida(): boolean {
    return !!this.tarea && this.tarea.fecha_entrega < this.fechaMinima;
  }

  esCalificada(entrega: Entrega | null | undefined): boolean {
    return (entrega?.estado || '').toUpperCase() === ESTADO_CALIFICADA;
  }

  tareaBloqueada(): boolean {
    return this.esVencida() || this.esCalificada(this.entregaPropia);
  }

  // ─────────────────────────────────────────────
  // DOCENTE: ENTREGAS
  // ─────────────────────────────────────────────
  async cargarEntregas() {
    if (!this.tarea) return;
    try {
      const { data: alumnos, error: eAl } = await this.sesion.supabase
        .from('users_user')
        .select('id, first_name, last_name')
        .eq('alumno_grupo_id', this.tarea.grupo_id)
        .eq('rol', 'ALUMNO')
        .order('first_name');
      if (eAl) throw eAl;

      const { data: entregas, error: eEnt } = await this.sesion.supabase
        .from('academic_entregatarea')
        .select('*')
        .eq('tarea_id', this.tarea.id);
      if (eEnt) throw eEnt;

      const porAlumno = new Map<number, Entrega>();
      (entregas || []).forEach((e: any) => porAlumno.set(e.alumno_id, e));

      this.entregasAlumnos = (alumnos || [])
        .map((a: any) => {
          const entrega = porAlumno.get(a.id) || null;
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

      this.totalAlumnos = alumnos?.length || 0;
      this.totalEntregas = entregas?.length || 0;
      this.totalCalificadas = (entregas || []).filter((e: any) => e.estado === ESTADO_CALIFICADA).length;
    } catch (e: any) {
      this.toast(`No se pudieron cargar las entregas: ${e.message}`, 'danger');
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
      this.totalCalificadas = this.entregasAlumnos.filter(r => this.esCalificada(r.entrega)).length;
      this.toast('Calificación guardada.', 'success');
    } catch (e: any) {
      this.toast(`No se pudo guardar: ${e.message}`, 'danger');
    } finally {
      row.guardando = false;
    }
  }

  // ─────────────────────────────────────────────
  // ALUMNO: MI ENTREGA
  // ─────────────────────────────────────────────
  async cargarMiEntrega() {
    try {
      const uid = this.sesion.usuario!.id;
      const { data, error } = await this.sesion.supabase
        .from('academic_entregatarea')
        .select('*')
        .eq('tarea_id', this.tareaId)
        .eq('alumno_id', uid)
        .maybeSingle();
      if (error) throw error;
      this.entregaPropia = data || null;
    } catch (e: any) {
      this.toast(`No se pudo cargar tu entrega: ${e.message}`, 'danger');
    }
  }

  toggleFormEntrega() {
    this.mostrarFormEntrega = !this.mostrarFormEntrega;
    if (this.mostrarFormEntrega) {
      this.comentarioEntrega = this.entregaPropia?.comentario || '';
      this.archivoEntregaSeleccionado = null;
      this.errorEntrega = '';
    }
  }

  onArchivoEntregaSeleccionado(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size / 1048576 > MAX_MB) { this.errorEntrega = `Supera ${MAX_MB}MB.`; input.value = ''; return; }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (EXT_BAN.includes(ext)) { this.errorEntrega = 'Tipo de archivo no permitido.'; input.value = ''; return; }
    this.archivoEntregaSeleccionado = file;
    this.errorEntrega = '';
  }

  async enviarEntrega() {
    if (this.tareaBloqueada()) {
      this.errorEntrega = this.esCalificada(this.entregaPropia)
        ? 'Esta tarea ya fue calificada, no puedes modificar tu entrega.'
        : 'La fecha de entrega ya venció.';
      this.mostrarFormEntrega = false;
      return;
    }
    if (!this.archivoEntregaSeleccionado && !this.entregaPropia) {
      this.errorEntrega = 'Adjunta un archivo para entregar.';
      return;
    }
    this.subiendoEntrega = true;
    this.progresoEntrega = 0;
    this.errorEntrega = '';

    try {
      let archivoUrl = this.entregaPropia?.archivo || '';
      if (this.archivoEntregaSeleccionado) {
        const subido = await this.cloudinary.subirArchivo(
          this.archivoEntregaSeleccionado,
          pct => this.progresoEntrega = pct
        );
        archivoUrl = subido.url;
      }

      const uid = this.sesion.usuario!.id;
      const comentario = (this.comentarioEntrega || '').trim();
      const ahora = new Date().toISOString();

      if (this.entregaPropia) {
        const { data, error } = await this.sesion.supabase
          .from('academic_entregatarea')
          .update({
            archivo: archivoUrl, comentario, estado: ESTADO_ENTREGADA, entregada_en: ahora,
            calificacion: null, feedback: '', calificada_en: null,
          })
          .eq('id', this.entregaPropia.id)
          .select().single();
        if (error) throw error;
        this.entregaPropia = data;
      } else {
        const { data, error } = await this.sesion.supabase
          .from('academic_entregatarea')
          .insert({
            tarea_id: this.tareaId, alumno_id: uid, archivo: archivoUrl,
            comentario, estado: ESTADO_ENTREGADA, entregada_en: ahora, feedback: '',
          })
          .select().single();
        if (error) throw error;
        this.entregaPropia = data;
      }

      this.mostrarFormEntrega = false;
      this.toast('Tarea entregada.', 'success');
    } catch (e: any) {
      this.errorEntrega = `No se pudo entregar: ${e.message}`;
    } finally {
      this.subiendoEntrega = false;
    }
  }

  esTardia(): boolean {
    if (!this.entregaPropia || !this.tarea) return false;
    return this.entregaPropia.entregada_en.slice(0, 10) > this.tarea.fecha_entrega;
  }

  // ─────────────────────────────────────────────
  // COMENTARIOS (docente y alumno)
  // ─────────────────────────────────────────────
  async cargarComentarios() {
    try {
      const { data, error } = await this.sesion.supabase
        .from('academic_comentariotarea')
        .select('*')
        .eq('tarea_id', this.tareaId)
        .order('creado_en', { ascending: true });
      if (error) throw error;

      const autorIds = [...new Set((data || []).map((c: any) => c.autor_id))];
      let autores = new Map<number, { nombre: string; rol: string }>();
      if (autorIds.length) {
        const { data: usuarios, error: eU } = await this.sesion.supabase
          .from('users_user').select('id, first_name, last_name, rol').in('id', autorIds);
        if (eU) throw eU;
        (usuarios || []).forEach((u: any) => {
          autores.set(u.id, { nombre: `${u.first_name} ${u.last_name}`.trim(), rol: u.rol });
        });
      }

      this.comentarios = (data || []).map((c: any) => ({
  ...c,
  autor_nombre: autores.get(c.autor_id)?.nombre || 'Usuario',
  autor_rol: autores.get(c.autor_id)?.rol || '',
}));
    } catch (e: any) {
      this.toast(`No se pudieron cargar los comentarios: ${e.message}`, 'danger');
    }
  }

  async enviarComentario() {
    const texto = this.nuevoComentario.trim();
    if (!texto) return;
    this.enviandoComentario = true;
    try {
      const uid = this.sesion.usuario!.id;
      const { error } = await this.sesion.supabase
        .from('academic_comentariotarea')
        .insert({ tarea_id: this.tareaId, autor_id: uid, texto,creado_en: new Date().toISOString() });
      if (error) throw error;
      this.nuevoComentario = '';
      await this.cargarComentarios();
    } catch (e: any) {
      this.toast(`No se pudo comentar: ${e.message}`, 'danger');
    } finally {
      this.enviandoComentario = false;
    }
  }

  esMiComentario(c: Comentario): boolean {
    return c.autor_id === this.sesion.usuario?.id;
  }

  activarEdicion(c: Comentario) {
    c.editando = true;
    c.textoEdit = c.texto;
  }

  cancelarEdicionComentario(c: Comentario) {
    c.editando = false;
  }

  async guardarEdicionComentario(c: Comentario) {
    const nuevo = (c.textoEdit || '').trim();
    if (!nuevo) { this.toast('El comentario no puede quedar vacío.', 'warning'); return; }
    try {
      const { error } = await this.sesion.supabase
        .from('academic_comentariotarea')
        .update({ texto: nuevo })
        .eq('id', c.id)
        .eq('autor_id', this.sesion.usuario?.id);
      if (error) throw error;
      c.texto = nuevo;
      c.editando = false;
      this.toast('Comentario actualizado.', 'success');
    } catch (e: any) {
      this.toast(`No se pudo editar: ${e.message}`, 'danger');
    }
  }

  async eliminarComentario(c: Comentario) {
    const a = await this.alertCtrl.create({
      header: 'Eliminar comentario',
      message: '¿Eliminar este comentario?',
      buttons: [{ text: 'Cancelar', role: 'cancel' }, {
        text: 'Eliminar', role: 'destructive',
        handler: async () => {
          try {
            const { error } = await this.sesion.supabase
              .from('academic_comentariotarea')
              .delete()
              .eq('id', c.id)
              .eq('autor_id', this.sesion.usuario?.id);
            if (error) throw error;
            this.comentarios = this.comentarios.filter(x => x.id !== c.id);
            this.toast('Comentario eliminado.', 'success');
          } catch (e: any) {
            this.toast(`No se pudo eliminar: ${e.message}`, 'danger');
          }
        }
      }],
    });
    await a.present();
  }

  // ─────────────────────────────────────────────
  // COMPARTIDOS
  // ─────────────────────────────────────────────
  getFileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    const m: Record<string, string> = { pdf: 'document-text-outline', doc: 'reader-outline', docx: 'reader-outline', jpg: 'image-outline', jpeg: 'image-outline', png: 'image-outline', mp4: 'videocam-outline', mov: 'videocam-outline', zip: 'archive-outline', rar: 'archive-outline' };
    return m[ext || ''] || 'document-outline';
  }

  volver() {
    this.router.navigate(['/tareas']);
  }

  private async toast(msg: string, color: string) {
    const t = await this.toastCtrl.create({ message: msg, duration: 2500, color, position: 'bottom' });
    await t.present();
  }

  // Abre un archivo normalizando su URL primero, igual que herramientas.page.ts.
  abrirArchivo(url: string) {
    const normalizada = this.urlArchivo(url);
    if (normalizada) this.visorArchivos.abrir(normalizada);
  }

  // Normaliza el valor guardado en "archivo" para poder abrirlo/mostrarlo.
  // 1) Si ya trae "http" en algún punto, corta todo lo anterior (limpia prefijos corruptos,
  //    ej. "raw/upload/https://...").
  // 2) Si no trae "http" para nada (ruta relativa "pura" de Cloudinary, ej.
  //    "image/upload/v.../archivo.pdf"), reconstruye la URL completa usando el
  //    cloud_name de environment.
  urlArchivo(raw: string | null | undefined): string {
    if (!raw) return '';
    const idx = raw.indexOf('http');
    if (idx > 0) return raw.slice(idx);
    if (idx === 0) return raw;

    const cloudName = (environment as any).cloudinaryCloudName;
    if (cloudName) {
      const rutaLimpia = raw.replace(/^\/+/, '');
      return `https://res.cloudinary.com/${cloudName}/${rutaLimpia}`;
    }
    return raw;
  }
}
