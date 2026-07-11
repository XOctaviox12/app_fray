import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService } from '../../services/cloudinary.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';
import { VisorArchivosService } from '../../services/visor-archivos.service';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface EntregaDetalle {
  id: number;
  archivo: string | null;
  respuesta_texto: string;
  calificacion: number | null;
  feedback: string;
  entregada_en: string;
}

interface EntregaRow {
  alumno_id: number;
  alumno_nombre: string;
  entrega: EntregaDetalle | null;
  calificacionEdit: string;
  feedbackEdit: string;
  guardando: boolean;
}

interface ActividadDetalle {
  id: number;
  titulo: string;
  instrucciones: string;
  tipo: string;                 // ABIERTA | MULTIPLE | ARCHIVO | INTERACTIVA
  fecha_entrega: string;
  valor_total: number;
  url_interactiva: string | null;
  publicada: boolean;
  materia_nombre: string;
  grupo_nombre: string;
  grupo_id: number;
  asignatura_id: number;
  docente_id: number;
  archivo: string | null;       // adjunto de la propia actividad (opcional)
}

const MAX_MB = 20;

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  standalone: true,
  selector: 'app-detalle-actividad',
  templateUrl: './detalle-actividad.page.html',
  styleUrls: ['./detalle-actividad.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule, RouterModule],
})
export class DetalleActividadPage implements OnInit {

  private supabase: SupabaseClient;
  private actividadId!: number;

  cargando = true;
  error = '';

  actividad: ActividadDetalle | null = null;

  get esAlumno():  boolean { return this.sesion.esAlumno(); }
  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esTutor():   boolean { return this.sesion.esTutor(); }

  // ── Docente: roster completo del grupo ────────────────────
  entregasAlumnos: EntregaRow[] = [];

  get totalAlumnos():    number { return this.entregasAlumnos.length; }
  get totalEntregas():   number { return this.entregasAlumnos.filter(r => r.entrega).length; }
  get totalCalificadas():number { return this.entregasAlumnos.filter(r => r.entrega?.calificacion != null).length; }

  // ── Alumno / Tutor: entrega propia (o del hijo) ───────────
  entregaPropia: EntregaDetalle | null = null;
  private alumnoIdObjetivo: number | null = null; // el propio para alumno, el del hijo para tutor

  mostrarFormEntrega = false;
  respuestaTexto = '';
  archivoEntregaSeleccionado: File | null = null;
  subiendoEntrega = false;
  progresoEntrega = 0;
  errorEntrega = '';

  constructor(
    private route: ActivatedRoute,
    private sesion: SesionService,
    private cloudinary: CloudinaryService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private visorArchivos: VisorArchivosService,
  ) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  ngOnInit() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) { this.error = 'Actividad no especificada.'; this.cargando = false; return; }
    this.actividadId = parseInt(idParam, 10);
    this.cargarTodo();
  }

  doRefresh(event: any) { this.cargarTodo().then(() => event.target.complete()); }

  // ══════════════════════════════════════════════════════════
  //  CARGA PRINCIPAL
  // ══════════════════════════════════════════════════════════

  async cargarTodo() {
    this.cargando = true; this.error = '';
    try {
      await this.cargarActividadBase();
      if (!this.actividad) { this.error = 'No se encontró la actividad.'; return; }

      if (this.esDocente)      await this.cargarRosterDocente();
      else if (this.esAlumno)  await this.cargarEntregaAlumno();
      else if (this.esTutor)   await this.cargarEntregaTutor();
    } catch (e: any) {
      this.error = 'Error al cargar: ' + e.message;
    } finally {
      this.cargando = false;
    }
  }

  private async cargarActividadBase() {
    const { data: a, error } = await this.supabase
      .from('academic_actividad')
      .select('id, titulo, instrucciones, tipo, fecha_entrega, valor_total, url_interactiva, publicada, asignatura_id, grupo_id, docente_id, archivo')
      .eq('id', this.actividadId)
      .single();
    if (error) throw error;
    if (!a) { this.actividad = null; return; }

    const [{ data: asi }, { data: gru }] = await Promise.all([
      this.supabase.from('academic_asignatura').select('nombre').eq('id', (a as any).asignatura_id).single(),
      this.supabase.from('academic_grupo').select('nombre, grado').eq('id', (a as any).grupo_id).single(),
    ]);

    this.actividad = {
      id: (a as any).id,
      titulo: (a as any).titulo,
      instrucciones: (a as any).instrucciones || '',
      tipo: (a as any).tipo,
      fecha_entrega: (a as any).fecha_entrega,
      valor_total: parseFloat((a as any).valor_total),
      url_interactiva: (a as any).url_interactiva,
      publicada: (a as any).publicada,
      materia_nombre: (asi as any)?.nombre || '—',
      grupo_nombre: gru ? `${(gru as any).grado}° ${(gru as any).nombre}` : '—',
      grupo_id: (a as any).grupo_id,
      asignatura_id: (a as any).asignatura_id,
      docente_id: (a as any).docente_id,
      archivo: (a as any).archivo || null,
    };
  }

  // ── Docente: roster completo (con y sin entrega) ──────────
  private async cargarRosterDocente() {
    if (!this.actividad) return;

    const { data: alumnos } = await this.supabase
      .from('users_user')
      .select('id, first_name, last_name')
      .eq('alumno_grupo_id', this.actividad.grupo_id)
      .eq('rol', 'ALUMNO')
      .order('first_name');

    const { data: entregas } = await this.supabase
      .from('academic_entregaactividad')
      .select('id, alumno_id, calificacion, feedback, entregada_en, archivo')
      .eq('actividad_id', this.actividadId);

    const entIds = (entregas || []).map((e: any) => e.id);
    let textoMap: Record<number, string> = {};
    if (entIds.length && this.actividad.tipo === 'ABIERTA') {
      const { data: resps } = await this.supabase
        .from('academic_respuestaalumno')
        .select('entrega_id, texto')
        .in('entrega_id', entIds);
      (resps || []).forEach((r: any) => { textoMap[r.entrega_id] = r.texto; });
    }

    const entMap: Record<number, any> = {};
    (entregas || []).forEach((e: any) => { entMap[e.alumno_id] = e; });

    this.entregasAlumnos = (alumnos || []).map((u: any) => {
      const e = entMap[u.id];
      const entrega: EntregaDetalle | null = e ? {
        id: e.id,
        archivo: e.archivo || null,
        respuesta_texto: textoMap[e.id] || '',
        calificacion: e.calificacion != null ? parseFloat(e.calificacion) : null,
        feedback: e.feedback || '',
        entregada_en: e.entregada_en,
      } : null;
      return {
        alumno_id: u.id,
        alumno_nombre: `${u.first_name} ${u.last_name}`.trim(),
        entrega,
        calificacionEdit: entrega?.calificacion != null ? String(entrega.calificacion) : '',
        feedbackEdit: entrega?.feedback || '',
        guardando: false,
      };
    });
  }

  async guardarCalificacion(row: EntregaRow) {
    if (!row.entrega) return;
    const nota = parseFloat(row.calificacionEdit);
    if (isNaN(nota) || nota < 0 || nota > 10) { this.toast('La nota debe ser entre 0 y 10.', 'warning'); return; }

    row.guardando = true;
    try {
      const { error } = await this.supabase
        .from('academic_entregaactividad')
        .update({ calificacion: nota, feedback: row.feedbackEdit.trim() })
        .eq('id', row.entrega.id);
      if (error) throw error;

      row.entrega.calificacion = nota;
      row.entrega.feedback = row.feedbackEdit.trim();
      this.toast('Calificación guardada.', 'success');
    } catch (e: any) {
      this.toast('Error: ' + e.message, 'danger');
    } finally {
      row.guardando = false;
    }
  }

  // ── Alumno ──────────────────────────────────────────────────
  private async cargarEntregaAlumno() {
    const alumnoId = this.sesion.usuario?.id;
    if (!alumnoId) return;
    this.alumnoIdObjetivo = alumnoId;
    await this.cargarEntregaDe(alumnoId);
  }

  // ── Tutor (solo lectura) ───────────────────────────────────
  private async cargarEntregaTutor() {
    const alumnoId = this.sesion.tutor?.alumno_id;
    if (!alumnoId) return;
    this.alumnoIdObjetivo = alumnoId;
    await this.cargarEntregaDe(alumnoId);
  }

  private async cargarEntregaDe(alumnoId: number) {
    const { data: e } = await this.supabase
      .from('academic_entregaactividad')
      .select('id, calificacion, feedback, entregada_en, archivo')
      .eq('actividad_id', this.actividadId)
      .eq('alumno_id', alumnoId)
      .maybeSingle();

    if (!e) { this.entregaPropia = null; return; }

    let textoResp = '';
    if (this.actividad?.tipo === 'ABIERTA') {
      const { data: resp } = await this.supabase
        .from('academic_respuestaalumno')
        .select('texto')
        .eq('entrega_id', (e as any).id)
        .maybeSingle();
      textoResp = (resp as any)?.texto || '';
    }

    this.entregaPropia = {
      id: (e as any).id,
      archivo: (e as any).archivo || null,
      respuesta_texto: textoResp,
      calificacion: (e as any).calificacion != null ? parseFloat((e as any).calificacion) : null,
      feedback: (e as any).feedback || '',
      entregada_en: (e as any).entregada_en,
    };
  }

  // ══════════════════════════════════════════════════════════
  //  ENVIAR / REEMPLAZAR ENTREGA (alumno)
  // ══════════════════════════════════════════════════════════

  toggleFormEntrega() {
    this.mostrarFormEntrega = !this.mostrarFormEntrega;
    if (this.mostrarFormEntrega) {
      this.respuestaTexto = this.entregaPropia?.respuesta_texto || '';
      this.archivoEntregaSeleccionado = null;
      this.errorEntrega = '';
      this.progresoEntrega = 0;
    }
  }

  onArchivoEntregaSeleccionado(e: any) {
    const file: File = e.target.files[0];
    if (!file) return;
    if (file.size / 1048576 > MAX_MB) { this.errorEntrega = `El archivo supera ${MAX_MB}MB.`; return; }
    this.errorEntrega = '';
    this.archivoEntregaSeleccionado = file;
    e.target.value = '';
  }

  async enviarEntrega() {
    if (!this.actividad || !this.alumnoIdObjetivo) return;
    const tipo = this.actividad.tipo;

    if (tipo === 'ABIERTA' && !this.respuestaTexto.trim()) { this.errorEntrega = 'Escribe tu respuesta.'; return; }
    if (tipo === 'ARCHIVO' && !this.archivoEntregaSeleccionado && !this.entregaPropia?.archivo) { this.errorEntrega = 'Selecciona un archivo.'; return; }

    this.errorEntrega = '';
    this.subiendoEntrega = true;
    try {
      let archivoUrl = this.entregaPropia?.archivo || null;

      if (this.archivoEntregaSeleccionado) {
        const r = await this.cloudinary.subirArchivo(
          this.archivoEntregaSeleccionado,
          pct => { this.progresoEntrega = pct; }
        );
        archivoUrl = r.url;
      }

      const ahoraIso = new Date().toISOString();
      const payload: any = {
        actividad_id: this.actividadId,
        alumno_id: this.alumnoIdObjetivo,
        archivo: archivoUrl,
        feedback: this.entregaPropia?.feedback || '',
        entregada_en: ahoraIso,
      };

      let entregaId = this.entregaPropia?.id;
      if (entregaId) {
        const { error } = await this.supabase.from('academic_entregaactividad').update(payload).eq('id', entregaId);
        if (error) throw error;
      } else {
        const { data, error } = await this.supabase.from('academic_entregaactividad').insert(payload).select('id').single();
        if (error) throw error;
        entregaId = (data as any)?.id;
      }

      if (tipo === 'ABIERTA' && this.respuestaTexto.trim() && entregaId) {
        const { data: existResp } = await this.supabase
          .from('academic_respuestaalumno').select('id')
          .eq('entrega_id', entregaId).maybeSingle();

        if (existResp) {
          await this.supabase.from('academic_respuestaalumno')
            .update({ texto: this.respuestaTexto.trim() }).eq('id', (existResp as any).id);
        } else {
          const { data: preg } = await this.supabase
            .from('academic_preguntaactividad').select('id').eq('actividad_id', this.actividadId).limit(1).single();
          if (preg) {
            await this.supabase.from('academic_respuestaalumno').insert({
              entrega_id: entregaId,
              pregunta_id: (preg as any).id,
              texto: this.respuestaTexto.trim(),
            });
          }
        }
      }

      this.entregaPropia = {
        id: entregaId!,
        archivo: archivoUrl,
        respuesta_texto: this.respuestaTexto.trim(),
        calificacion: null,
        feedback: this.entregaPropia?.feedback || '',
        entregada_en: ahoraIso,
      };

      this.toast('Actividad entregada con éxito.', 'success');
      this.mostrarFormEntrega = false;
    } catch (e: any) {
      this.errorEntrega = 'Error al entregar: ' + e.message;
    } finally {
      this.subiendoEntrega = false;
    }
  }

  // ══════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════

  esVencida(): boolean {
    if (!this.actividad) return false;
    return new Date(this.actividad.fecha_entrega) < new Date();
  }

  esTardia(): boolean {
    if (!this.actividad || !this.entregaPropia) return false;
    return new Date(this.entregaPropia.entregada_en) > new Date(this.actividad.fecha_entrega);
  }

  // una vez calificada, ya no se puede reemplazar la entrega
  tareaBloqueada(): boolean {
    return this.esCalificada(this.entregaPropia);
  }

  esCalificada(e: EntregaDetalle | null): boolean {
    return !!e && e.calificacion != null;
  }

  // Abre un archivo (o enlace externo) normalizando su URL primero,
  // igual que herramientas.page.ts / detalle-tarea.page.ts.
  abrirArchivo(url: string | null | undefined) {
    const normalizada = this.urlArchivo(url);
    if (normalizada) this.visorArchivos.abrir(normalizada);
  }

  // Normaliza el valor guardado en "archivo" para poder abrirlo/mostrarlo.
  // 1) Si ya trae "http" en algún punto, corta todo lo anterior (limpia prefijos corruptos).
  // 2) Si no trae "http" para nada (ruta relativa "pura" de Cloudinary),
  //    reconstruye la URL completa usando el cloud_name de environment.
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

  getFileIcon(nameOrUrl: string): string {
    const ext = nameOrUrl.split('.').pop()?.toLowerCase().split('?')[0] || '';
    return {
      pdf: 'document-text-outline', doc: 'reader-outline', docx: 'reader-outline',
      jpg: 'image-outline', jpeg: 'image-outline', png: 'image-outline',
      mp4: 'videocam-outline', zip: 'archive-outline',
    }[ext] || 'document-outline';
  }

  getTipoIcon(tipo: string): string {
    return {
      ABIERTA: 'create-outline', MULTIPLE: 'list-outline',
      ARCHIVO: 'cloud-upload-outline', INTERACTIVA: 'game-controller-outline',
    }[tipo] || 'clipboard-outline';
  }

  getTipoLabel(tipo: string): string {
    return {
      ABIERTA: 'Pregunta abierta', MULTIPLE: 'Opción múltiple',
      ARCHIVO: 'Subir archivo', INTERACTIVA: 'Ejercicio interactivo',
    }[tipo] || tipo;
  }

  colorNota(n: number): string {
    if (n >= 9) return 'excelente';
    if (n >= 7) return 'bien';
    if (n >= 6) return 'regular';
    return 'reprobado';
  }

  private async toast(msg: string, color: string) {
    const t = await this.toastCtrl.create({ message: msg, duration: 2500, color, position: 'bottom' });
    await t.present();
  }
}
