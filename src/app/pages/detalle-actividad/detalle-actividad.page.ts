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

export type TipoPregunta = 'opcion_multiple' | 'verdadero_falso' | 'respuesta_corta';

export interface RespuestaDetalle {
  pregunta_id: number;
  pregunta_texto: string;
  tipo: TipoPregunta;
  respuesta_mostrar: string;   // texto de la opción elegida, o texto libre
  es_correcta: boolean | null; // null = no autocalificable o sin responder
}

export interface ResumenAutocalif {
  correctas: number;
  calificables: number;
}

interface PreguntaAlumno {
  id: number;
  tipo: TipoPregunta;
  texto: string;
  opciones: { id: number; texto: string }[]; // nunca trae es_correcta: el alumno no debe verla
}

interface EntregaDetalle {
  id: number;
  archivo: string | null;
  respuesta_texto: string;
  calificacion: number | null;
  feedback: string;
  entregada_en: string;
  respuestasDetalle?: RespuestaDetalle[];   // desglose por pregunta (MULTIPLE / MIXTA)
  resumenAutocalif?: ResumenAutocalif;
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
  tipo: string;                 // ABIERTA | MULTIPLE | MIXTA | ARCHIVO | INTERACTIVA
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

interface Comentario {
  id: number;
  texto: string;
  creado_en: string;
  autor_id: number;
  actividad_id: number;
  autor_nombre: string;
  autor_rol: string;
  editando?: boolean;
  textoEdit?: string;
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

  get esPreguntas(): boolean { return this.actividad?.tipo === 'MULTIPLE' || this.actividad?.tipo === 'MIXTA'; }

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

  // ── Preguntas mixtas — responder alumno (nunca incluyen es_correcta) ──
  preguntasAlumno: PreguntaAlumno[] = [];
  respuestasSeleccionadas: Record<number, number> = {};     // pregunta_id -> opcion_id
  respuestasTextoPorPregunta: Record<number, string> = {};  // pregunta_id -> texto (respuesta_corta)
  cargandoPreguntas = false;

  // ── Comentarios (docente, alumno y tutor) ─────────────────
  comentarios: Comentario[] = [];
  nuevoComentario = '';
  enviandoComentario = false;

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
      if (this.esDocente) {
      await this.cargarRosterDocente();
    } else if (this.esAlumno) {
      await this.cargarEntregaAlumno();
      if (this.esPreguntas) await this.cargarFormularioPreguntas();
    } else if (this.esTutor) {
      await this.cargarEntregaTutor();
    }


      await this.cargarComentarios();
    } catch (e: any) {
      this.error = 'Error al cargar: ' + e.message;
    } finally {
      this.cargando = false;
    }
  }
get mostrarPreguntasAuto(): boolean {
  return this.esPreguntas && !this.tareaBloqueada() && (!!this.entregaPropia || !this.esVencida());
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
    let detalleMap: Record<number, RespuestaDetalle[]> = {};
    let resumenMap: Record<number, ResumenAutocalif> = {};

    if (this.esPreguntas) {
      // Preguntas + opciones (con es_correcta, el docente sí puede verla)
      const { data: pregs } = await this.supabase
        .from('academic_preguntaactividad')
        .select('id, texto, tipo, orden').eq('actividad_id', this.actividadId).order('orden');

      const pregIds = (pregs || []).map((p: any) => p.id);
      let opcionesPorPregunta: Record<number, any[]> = {};
      if (pregIds.length) {
        const { data: ops } = await this.supabase
          .from('academic_opcionrespuesta').select('id, texto, es_correcta, pregunta_id').in('pregunta_id', pregIds);
        (ops || []).forEach((o: any) => {
          if (!opcionesPorPregunta[o.pregunta_id]) opcionesPorPregunta[o.pregunta_id] = [];
          opcionesPorPregunta[o.pregunta_id].push(o);
        });
      }

      let respPorEntrega: Record<number, any[]> = {};
      if (entIds.length) {
        const { data: resps } = await this.supabase
          .from('academic_respuestaalumno').select('entrega_id, pregunta_id, opcion_id, texto').in('entrega_id', entIds);
        (resps || []).forEach((r: any) => {
          if (!respPorEntrega[r.entrega_id]) respPorEntrega[r.entrega_id] = [];
          respPorEntrega[r.entrega_id].push(r);
        });
      }

      (entregas || []).forEach((e: any) => {
        const respuestas = respPorEntrega[e.id] || [];
        let correctas = 0, calificables = 0;

        const detalle: RespuestaDetalle[] = (pregs || []).map((p: any) => {
          const r = respuestas.find((x: any) => x.pregunta_id === p.id);
          const tipo = (p.tipo || 'opcion_multiple') as TipoPregunta;

          if (tipo === 'respuesta_corta') {
            return { pregunta_id: p.id, pregunta_texto: p.texto, tipo, respuesta_mostrar: r?.texto || '', es_correcta: null };
          }

          const opcion = r?.opcion_id ? (opcionesPorPregunta[p.id] || []).find((o: any) => o.id === r.opcion_id) : null;
          const esCorrecta: boolean | null = r ? !!opcion?.es_correcta : null;
          if (esCorrecta !== null) { calificables++; if (esCorrecta) correctas++; }

          return {
            pregunta_id: p.id, pregunta_texto: p.texto, tipo,
            respuesta_mostrar: opcion?.texto || r?.texto || '',
            es_correcta: esCorrecta,
          };
        });

        detalleMap[e.id] = detalle;
        resumenMap[e.id] = { correctas, calificables };
      });
    } else if (this.actividad.tipo === 'ABIERTA' && entIds.length) {
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
        respuestasDetalle: detalleMap[e.id] || [],
        resumenAutocalif: resumenMap[e.id],
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
    let respuestasDetalle: RespuestaDetalle[] | undefined;

    if (this.actividad?.tipo === 'ABIERTA') {
      const { data: resp } = await this.supabase
        .from('academic_respuestaalumno')
        .select('texto')
        .eq('entrega_id', (e as any).id)
        .maybeSingle();
      textoResp = (resp as any)?.texto || '';
    } else if (this.esPreguntas) {
      // El propio alumno/tutor puede ver sus respuestas, pero NUNCA cuál era
      // la correcta — solo lo que él mismo contestó.
      const { data: pregs } = await this.supabase
        .from('academic_preguntaactividad')
        .select('id, texto, tipo, orden').eq('actividad_id', this.actividadId).order('orden');

      const pregIds = (pregs || []).map((p: any) => p.id);
      let opcionTextoPorId: Record<number, string> = {};
      if (pregIds.length) {
        const { data: ops } = await this.supabase
          .from('academic_opcionrespuesta').select('id, texto').in('pregunta_id', pregIds);
        (ops || []).forEach((o: any) => { opcionTextoPorId[o.id] = o.texto; });
      }

      const { data: resps } = await this.supabase
        .from('academic_respuestaalumno').select('pregunta_id, opcion_id, texto').eq('entrega_id', (e as any).id);
      const respMap = new Map((resps || []).map((r: any) => [r.pregunta_id, r]));

      respuestasDetalle = (pregs || []).map((p: any) => {
        const r = respMap.get(p.id);
        const mostrar = r?.opcion_id ? (opcionTextoPorId[r.opcion_id] || '') : (r?.texto || '');
        return { pregunta_id: p.id, pregunta_texto: p.texto, tipo: p.tipo, respuesta_mostrar: mostrar, es_correcta: null };
      });
    }

    this.entregaPropia = {
      id: (e as any).id,
      archivo: (e as any).archivo || null,
      respuesta_texto: textoResp,
      calificacion: (e as any).calificacion != null ? parseFloat((e as any).calificacion) : null,
      feedback: (e as any).feedback || '',
      entregada_en: (e as any).entregada_en,
      respuestasDetalle,
    };
  }

  // ══════════════════════════════════════════════════════════
  //  ENVIAR / REEMPLAZAR ENTREGA (alumno)
  // ══════════════════════════════════════════════════════════

  async toggleFormEntrega() {
    if (this.esPreguntas) return;
    this.mostrarFormEntrega = !this.mostrarFormEntrega;
    if (!this.mostrarFormEntrega) return;

    this.respuestaTexto = this.entregaPropia?.respuesta_texto || '';
    this.archivoEntregaSeleccionado = null;
    this.errorEntrega = '';
    this.progresoEntrega = 0;
    this.preguntasAlumno = [];
    this.respuestasSeleccionadas = {};
    this.respuestasTextoPorPregunta = {};

    if (this.esPreguntas) {
      this.cargandoPreguntas = true;
      try {
        const { data: pregs } = await this.supabase
          .from('academic_preguntaactividad').select('id, texto, tipo, orden').eq('actividad_id', this.actividadId).order('orden');

        for (const p of pregs || []) {
          const tipo = (p.tipo || 'opcion_multiple') as TipoPregunta;
          let opciones: { id: number; texto: string }[] = [];
          if (tipo !== 'respuesta_corta') {
            // Nunca se pide es_correcta aquí — el alumno no debe recibirla.
            const { data: ops } = await this.supabase
              .from('academic_opcionrespuesta').select('id, texto').eq('pregunta_id', p.id);
            opciones = ops || [];
          }
          this.preguntasAlumno.push({ id: p.id, tipo, texto: p.texto, opciones });
        }

        if (this.entregaPropia?.id) {
          const { data: resp } = await this.supabase
            .from('academic_respuestaalumno').select('pregunta_id, opcion_id, texto').eq('entrega_id', this.entregaPropia.id);
          (resp || []).forEach((r: any) => {
            if (r.opcion_id) this.respuestasSeleccionadas[r.pregunta_id] = r.opcion_id;
            else if (r.texto) this.respuestasTextoPorPregunta[r.pregunta_id] = r.texto;
          });
        }
      } finally { this.cargandoPreguntas = false; }
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

  respuestaPreguntaListaParaEnviar(): boolean {
    if (!this.esPreguntas) return true;
    return this.preguntasAlumno.every(p => {
      if (p.tipo === 'respuesta_corta') return !!this.respuestasTextoPorPregunta[p.id]?.trim();
      return !!this.respuestasSeleccionadas[p.id];
    });
  }

  async enviarEntrega() {
    if (!this.actividad || !this.alumnoIdObjetivo) return;
    const tipo = this.actividad.tipo;

    if (tipo === 'ABIERTA' && !this.respuestaTexto.trim()) { this.errorEntrega = 'Escribe tu respuesta.'; return; }
    if (tipo === 'ARCHIVO' && !this.archivoEntregaSeleccionado && !this.entregaPropia?.archivo) { this.errorEntrega = 'Selecciona un archivo.'; return; }
    if (this.esPreguntas && !this.respuestaPreguntaListaParaEnviar()) { this.errorEntrega = 'Responde todas las preguntas.'; return; }

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

      // ── Opción múltiple / V-F / respuesta corta: una fila por pregunta ──
      if (this.esPreguntas && entregaId) {
        await this.supabase.from('academic_respuestaalumno').delete().eq('entrega_id', entregaId);
        const filas = this.preguntasAlumno.map(p => {
          if (p.tipo === 'respuesta_corta') {
            return {
              entrega_id: entregaId, pregunta_id: p.id, opcion_id: null,
              texto: (this.respuestasTextoPorPregunta[p.id] || '').trim(),
            };
          }
          const opcionId = this.respuestasSeleccionadas[p.id];
          const opcionTexto = p.opciones.find(o => o.id === opcionId)?.texto || '';
          return { entrega_id: entregaId, pregunta_id: p.id, opcion_id: opcionId, texto: opcionTexto };
        });
        const { error: errResp } = await this.supabase.from('academic_respuestaalumno').insert(filas);
        if (errResp) throw errResp;
      }

      this.entregaPropia = {
        id: entregaId!,
        archivo: archivoUrl,
        respuesta_texto: this.respuestaTexto.trim(),
        calificacion: null,
        feedback: this.entregaPropia?.feedback || '',
        entregada_en: ahoraIso,
      };
      // Recarga el desglose de solo-mis-respuestas (sin correctas) tras guardar.

if (this.esPreguntas) {
  await this.cargarEntregaDe(this.alumnoIdObjetivo);
  await this.cargarFormularioPreguntas();
}
      this.toast('Actividad entregada con éxito.', 'success');
      this.mostrarFormEntrega = false;
    } catch (e: any) {
      this.errorEntrega = 'Error al entregar: ' + e.message;
    } finally {
      this.subiendoEntrega = false;
    }
  }

  esTardia(): boolean {
    if (!this.actividad || !this.entregaPropia) return false;
    return new Date(this.entregaPropia.entregada_en) > new Date(this.actividad.fecha_entrega);
  }

  // ══════════════════════════════════════════════════════════
  //  COMENTARIOS (docente, alumno y tutor)
  // ══════════════════════════════════════════════════════════

  async cargarComentarios() {
    try {
      const { data, error } = await this.supabase
        .from('academic_comentarioactividad')
        .select('*')
        .eq('actividad_id', this.actividadId)
        .order('creado_en', { ascending: true });
      if (error) throw error;

      const autorIds = [...new Set((data || []).map((c: any) => c.autor_id))];
      let autores = new Map<number, { nombre: string; rol: string }>();
      if (autorIds.length) {
        const { data: usuarios, error: eU } = await this.supabase
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
      const { error } = await this.supabase
        .from('academic_comentarioactividad')
        .insert({ actividad_id: this.actividadId, autor_id: uid, texto, creado_en: new Date().toISOString() });
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
      const { error } = await this.supabase
        .from('academic_comentarioactividad')
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
            const { error } = await this.supabase
              .from('academic_comentarioactividad')
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

  // ══════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════

esVencida(): boolean {
  if (!this.actividad) return false;
  return new Date(this.actividad.fecha_entrega) < new Date();
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
      ABIERTA: 'create-outline', MULTIPLE: 'list-outline', MIXTA: 'apps-outline',
      ARCHIVO: 'cloud-upload-outline', INTERACTIVA: 'game-controller-outline',
    }[tipo] || 'clipboard-outline';
  }

  getTipoLabel(tipo: string): string {
    return {
      ABIERTA: 'Pregunta abierta', MULTIPLE: 'Opción múltiple', MIXTA: 'Varios tipos',
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
  private async cargarFormularioPreguntas() {
  this.cargandoPreguntas = true;
  this.preguntasAlumno = [];
  this.respuestasSeleccionadas = {};
  this.respuestasTextoPorPregunta = {};
  try {
    const { data: pregs } = await this.supabase
      .from('academic_preguntaactividad').select('id, texto, tipo, orden').eq('actividad_id', this.actividadId).order('orden');

    for (const p of pregs || []) {
      const tipo = (p.tipo || 'opcion_multiple') as TipoPregunta;
      let opciones: { id: number; texto: string }[] = [];
      if (tipo !== 'respuesta_corta') {
        const { data: ops } = await this.supabase
          .from('academic_opcionrespuesta').select('id, texto').eq('pregunta_id', p.id);
        opciones = ops || [];
      }
      this.preguntasAlumno.push({ id: p.id, tipo, texto: p.texto, opciones });
    }

    if (this.entregaPropia?.id) {
      const { data: resp } = await this.supabase
        .from('academic_respuestaalumno').select('pregunta_id, opcion_id, texto').eq('entrega_id', this.entregaPropia.id);
      (resp || []).forEach((r: any) => {
        if (r.opcion_id) this.respuestasSeleccionadas[r.pregunta_id] = r.opcion_id;
        else if (r.texto) this.respuestasTextoPorPregunta[r.pregunta_id] = r.texto;
      });
    }
  } finally {
    this.cargandoPreguntas = false;
  }
}
}
