import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService } from '../../services/cloudinary.service';
import { VisorArchivosService } from '../../services/visor-archivos.service';
import { environment } from '../../../environments/environment';

export type TipoPregunta = 'MULTIPLE' | 'VF' | 'ABIERTA';

export interface RespuestaDetalle {
  pregunta_id: number;
  pregunta_texto: string;
  tipo: TipoPregunta;
  respuesta_mostrar: string;
  es_correcta: boolean | null;
}

export interface ResumenAutocalif {
  correctas: number;
  calificables: number;
}

interface PreguntaAlumno {
  id: number;
  tipo: TipoPregunta;
  texto: string;
  opciones: { id: number; texto: string }[];
}

interface EntregaDetalle {
  id: number;
  archivo: string | null;
  respuesta_texto: string;
  calificacion: number | null;
  feedback: string;
  entregada_en: string;
  respuestasDetalle?: RespuestaDetalle[];
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
  tipo: string;
  fecha_entrega: string;
  valor_total: number;
  url_interactiva: string | null;
  publicada: boolean;
  materia_nombre: string;
  grupo_nombre: string;
  grupo_id: number;
  asignatura_id: number;
  docente_id: number;
  archivo: string | null;
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

@Component({
  standalone: true,
  selector: 'app-detalle-actividad',
  templateUrl: './detalle-actividad.page.html',
  styleUrls: ['./detalle-actividad.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule, RouterModule],
})
export class DetalleActividadPage implements OnInit {

  private actividadId!: number;

  cargando = true;
  error = '';

  actividad: ActividadDetalle | null = null;

  get esAlumno():  boolean { return this.sesion.esAlumno(); }
  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esTutor():   boolean { return this.sesion.esTutor(); }

  get esPreguntas(): boolean { return this.actividad?.tipo === 'CUESTIONARIO'; }

  entregasAlumnos: EntregaRow[] = [];

  get totalAlumnos():    number { return this.entregasAlumnos.length; }
  get totalEntregas():   number { return this.entregasAlumnos.filter(r => r.entrega).length; }
  get totalCalificadas():number { return this.entregasAlumnos.filter(r => r.entrega?.calificacion != null).length; }

  entregaPropia: EntregaDetalle | null = null;
  private alumnoIdObjetivo: number | null = null;

  mostrarFormEntrega = false;
  respuestaTexto = '';
  archivoEntregaSeleccionado: File | null = null;
  subiendoEntrega = false;
  progresoEntrega = 0;
  errorEntrega = '';

  preguntasAlumno: PreguntaAlumno[] = [];
  respuestasSeleccionadas: Record<number, number> = {};
  respuestasTextoPorPregunta: Record<number, string> = {};
  cargandoPreguntas = false;

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
  ) {}

  ngOnInit() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) { this.error = 'Actividad no especificada.'; this.cargando = false; return; }
    this.actividadId = parseInt(idParam, 10);
    this.cargarTodo();
  }

  doRefresh(event: any) { this.cargarTodo().then(() => event.target.complete()); }

  async cargarTodo() {
    this.cargando = true;
    this.error = '';
    try {
      await this.cargarActividadBase();
      if (!this.actividad) { this.error = 'No se encontró la actividad.'; return; }

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
    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    const { data: _a, error } = await this.sesion.supabase
      .rpc('leer_actividad_detalle', { p_token: token, p_actividad_id: this.actividadId });

    const a = _a && _a.length ? _a[0] : null;
    if (error) throw error;
    if (!a) { this.actividad = null; return; }

    this.actividad = {
      id: (a as any).id,
      titulo: (a as any).titulo,
      instrucciones: (a as any).instrucciones || '',
      tipo: (a as any).tipo,
      fecha_entrega: (a as any).fecha_entrega,
      valor_total: parseFloat((a as any).valor_total),
      url_interactiva: (a as any).url_interactiva,
      publicada: (a as any).publicada,
      materia_nombre: (a as any).materia_nombre || '—',
      grupo_nombre: (a as any).grupo_nombre || '—',
      grupo_id: (a as any).grupo_id,
      asignatura_id: (a as any).asignatura_id,
      docente_id: (a as any).docente_id,
      archivo: (a as any).archivo || null,
    };
  }

  private async cargarRosterDocente() {
    if (!this.actividad) return;

    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    if (!token) return;

    const { data: alumnos, error: eAlumnos } = await this.sesion.supabase
      .rpc('roster_grupo', { p_token: token, p_grupo_id: this.actividad.grupo_id });
    if (eAlumnos) console.error('Error roster:', eAlumnos.message);

    const { data: entregas, error: errEntregas } = await this.sesion.supabase
      .rpc('entregas_de_actividad_docente', { p_token: token, p_actividad_id: this.actividadId });
    if (errEntregas) console.error('Error entregas_de_actividad_docente:', errEntregas.message);

    const entIds = (entregas || []).map((e: any) => e.id);
    let textoMap: Record<number, string> = {};
    let detalleMap: Record<number, RespuestaDetalle[]> = {};
    let resumenMap: Record<number, ResumenAutocalif> = {};

    if (this.esPreguntas) {
      const { data: pregs } = await this.sesion.supabase
        .rpc('leer_preguntas_actividad', { p_token: token, p_actividad_id: this.actividadId });

      const pregIds = (pregs || []).map((p: any) => p.id);
      let opcionesPorPregunta: Record<number, any[]> = {};
      if (pregIds.length) {
        const { data: ops, error: errOps } = await this.sesion.supabase
          .rpc('opciones_docente_multi', { p_token: token, p_pregunta_ids: pregIds });
        if (errOps) console.error('Error opciones_docente_multi:', errOps.message);
        (ops || []).forEach((o: any) => {
          if (!opcionesPorPregunta[o.pregunta_id]) opcionesPorPregunta[o.pregunta_id] = [];
          opcionesPorPregunta[o.pregunta_id].push(o);
        });
      }

      let respPorEntrega: Record<number, any[]> = {};
      if (entIds.length) {
        const { data: resps } = await this.sesion.supabase
          .rpc('respuestas_de_entregas_multi', { p_token: token, p_entrega_ids: entIds });
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
          const tipo = (p.tipo || 'MULTIPLE') as TipoPregunta;

          if (tipo === 'ABIERTA') {
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
      const { data: resps } = await this.sesion.supabase
        .rpc('respuestas_de_entregas_multi', { p_token: token, p_entrega_ids: entIds });
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
      const token = this.sesion.usuario?.token;
      const { error } = await this.sesion.supabase
        .rpc('calificar_entrega_actividad', {
          p_token: token,
          p_entrega_id: row.entrega.id,
          p_calificacion: nota,
          p_feedback: row.feedbackEdit.trim(),
        });
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

  private async cargarEntregaAlumno() {
    const alumnoId = this.sesion.usuario?.id;
    if (!alumnoId) return;
    this.alumnoIdObjetivo = alumnoId;
    await this.cargarEntregaDe(alumnoId);
  }

  private async cargarEntregaTutor() {
    const alumnoId = this.sesion.tutor?.alumno_id;
    if (!alumnoId) return;
    this.alumnoIdObjetivo = alumnoId;
    await this.cargarEntregaDe(alumnoId);
  }

  private async cargarEntregaDe(alumnoId: number) {
    let e: any = null;
    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;

    if (this.esTutor) {
      const { data } = await this.sesion.supabase
        .rpc('entrega_actividad_tutor', { p_token: token, p_actividad_id: this.actividadId });
      e = (data && data[0]) || null;
    } else {
      const { data } = await this.sesion.supabase
        .rpc('entrega_propia_actividad', { p_token: token, p_actividad_id: this.actividadId });
      e = (data && data[0]) || null;
    }

    if (!e) { this.entregaPropia = null; return; }

    let textoResp = '';
    let respuestasDetalle: RespuestaDetalle[] | undefined;

    if (this.actividad?.tipo === 'ABIERTA') {
      const { data: respArr } = await this.sesion.supabase
        .rpc('respuestas_de_entrega', { p_token: token, p_entrega_id: (e as any).id });
      const resp = respArr?.[0] || null;
      textoResp = (resp as any)?.texto || '';
    } else if (this.esPreguntas) {
      const { data: pregs } = await this.sesion.supabase
        .rpc('leer_preguntas_actividad', { p_token: token, p_actividad_id: this.actividadId });

      const pregIds = (pregs || []).map((p: any) => p.id);
      let opcionTextoPorId: Record<number, string> = {};
      if (pregIds.length) {
       const { data: ops } = await this.sesion.supabase
          .rpc('opciones_alumno_multi', { p_token: token, p_pregunta_ids: pregIds });
        (ops || []).forEach((o: any) => { opcionTextoPorId[o.id] = o.texto; });
      }

      const { data: resps } = await this.sesion.supabase
        .rpc('respuestas_de_entrega', { p_token: token, p_entrega_id: (e as any).id });
      const respMap = new Map<number, any>((resps || []).map((r: any) => [r.pregunta_id, r]));

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
        const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
        const { data: pregs } = await this.sesion.supabase
          .rpc('leer_preguntas_actividad', { p_token: token, p_actividad_id: this.actividadId });

        for (const p of pregs || []) {
          const tipo = (p.tipo || 'MULTIPLE') as TipoPregunta;
          let opciones: { id: number; texto: string }[] = [];
          if (tipo !== 'ABIERTA') {
            const { data: ops } = await this.sesion.supabase
              .rpc('opciones_alumno_multi', { p_token: token, p_pregunta_ids: [p.id] });
            opciones = ops || [];
          }
          this.preguntasAlumno.push({ id: p.id, tipo, texto: p.texto, opciones });
        }

        if (this.entregaPropia?.id) {
          const token2 = this.sesion.usuario?.token || this.sesion.tutor?.token;
          const { data: resp } = await this.sesion.supabase
            .rpc('respuestas_de_entrega', { p_token: token2, p_entrega_id: this.entregaPropia.id });
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
      if (p.tipo === 'ABIERTA') return !!this.respuestasTextoPorPregunta[p.id]?.trim();
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

      const token = this.sesion.usuario?.token;
      const { data: entregaId, error: errEntrega } = await this.sesion.supabase
        .rpc('guardar_entrega_actividad', {
          p_token: token,
          p_actividad_id: this.actividadId,
          p_archivo: archivoUrl,
        });
      if (errEntrega) throw errEntrega;

      const ahoraIso = new Date().toISOString();

      if (tipo === 'ABIERTA' && this.respuestaTexto.trim() && entregaId) {
        const { data: _preg } = await this.sesion.supabase
          .rpc('leer_preguntas_actividad', { p_token: token, p_actividad_id: this.actividadId });
        const preg = _preg && _preg.length > 0 ? _preg[0] : null;
        if (preg) {
          await this.sesion.supabase.rpc('guardar_respuesta_abierta', {
            p_token: token,
            p_entrega_id: entregaId,
            p_pregunta_id: (preg as any).id,
            p_texto: this.respuestaTexto.trim(),
          });
        }
      }

      if (this.esPreguntas && entregaId) {
        const filas = this.preguntasAlumno.map(p => {
          if (p.tipo === 'ABIERTA') {
            return {
              pregunta_id: p.id,
              opcion_id: null,
              texto: this.respuestasTextoPorPregunta[p.id]?.trim() || '',
            };
          }
          const opcionId = this.respuestasSeleccionadas[p.id];
          const opcionTexto = p.opciones.find(o => o.id === opcionId)?.texto || '';
          return { pregunta_id: p.id, opcion_id: opcionId, texto: opcionTexto };
        });
        const { error: errResp } = await this.sesion.supabase
          .rpc('guardar_respuestas_actividad', { p_token: token, p_entrega_id: entregaId, p_respuestas: filas });
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
    return this.entregaPropia.entregada_en.slice(0, 10) > this.actividad.fecha_entrega.slice(0, 10);
  }

  async cargarComentarios() {
    try {
      const tokenN = this.sesion.usuario?.token || this.sesion.tutor?.token;

      if (!tokenN) {
        throw new Error('No hay una sesión válida.');
      }

      const { data, error } = await this.sesion.supabase.rpc(
        'comentarios_actividad',
        {
          p_token: tokenN,
          p_actividad_id: this.actividadId
        }
      );

      if (error) throw error;

      const autorIds = [...new Set((data || []).map((c: any) => c.autor_id))];

      let autores = new Map<number, { nombre: string; rol: string }>();

      if (autorIds.length) {
        const { data: usuarios, error: eU } = await this.sesion.supabase.rpc('nombres_usuarios', {
          p_token: tokenN,
          p_ids: autorIds
        });

        if (eU) throw eU;

        (usuarios || []).forEach((u: any) => {
          autores.set(u.id, {
            nombre: `${u.first_name} ${u.last_name}`.trim(),
            rol: u.rol
          });
        });
      }

      this.comentarios = (data || []).map((c: any) => ({
        ...c,
        autor_nombre: autores.get(c.autor_id)?.nombre || 'Usuario',
        autor_rol: autores.get(c.autor_id)?.rol || '',
      }));

    } catch (e: any) {
      this.toast(
        `No se pudieron cargar los comentarios: ${e.message}`,
        'danger'
      );
    }
  }

  async enviarComentario() {
    const texto = this.nuevoComentario.trim();
    if (!texto) return;

    this.enviandoComentario = true;

    try {
      const tokenN = this.sesion.usuario?.token || this.sesion.tutor?.token;

      if (!tokenN) {
        throw new Error('No hay una sesión válida.');
      }

      const { error } = await this.sesion.supabase.rpc(
        'crear_comentario_actividad',
        {
          p_token: tokenN,
          p_actividad_id: this.actividadId,
          p_texto: texto
        }
      );

      if (error) throw error;

      this.nuevoComentario = '';

      await this.cargarComentarios();

    } catch (e: any) {
      this.toast(
        `No se pudo comentar: ${e.message}`,
        'danger'
      );
    } finally {
      this.enviandoComentario = false;
    }
  }

  esMiComentario(c: Comentario): boolean {
    const miId = this.sesion.usuario?.id ?? this.sesion.tutor?.id;
    return !!miId && c.autor_id === miId;
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

    if (!nuevo) {
      this.toast(
        'El comentario no puede quedar vacío.',
        'warning'
      );
      return;
    }

    try {
      const tokenN = this.sesion.usuario?.token || this.sesion.tutor?.token;

      if (!tokenN) {
        throw new Error('No hay una sesión válida.');
      }

      const { error } = await this.sesion.supabase.rpc(
        'editar_comentario_actividad',
        {
          p_token: tokenN,
          p_comentario_id: c.id,
          p_texto: nuevo
        }
      );

      if (error) throw error;

      c.texto = nuevo;
      c.editando = false;

      this.toast(
        'Comentario actualizado.',
        'success'
      );

    } catch (e: any) {
      this.toast(
        `No se pudo editar: ${e.message}`,
        'danger'
      );
    }
  }

  async eliminarComentario(c: Comentario) {
    const a = await this.alertCtrl.create({
      header: 'Eliminar comentario',
      message: '¿Eliminar este comentario?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            try {
              const tokenN = this.sesion.usuario?.token || this.sesion.tutor?.token;

              if (!tokenN) {
                throw new Error('No hay una sesión válida.');
              }

              const { error } = await this.sesion.supabase.rpc(
                'eliminar_comentario_actividad',
                {
                  p_token: tokenN,
                  p_comentario_id: c.id
                }
              );

              if (error) throw error;

              this.comentarios = this.comentarios.filter(x => x.id !== c.id);

              this.toast(
                'Comentario eliminado.',
                'success'
              );

            } catch (e: any) {
              this.toast(
                `No se pudo eliminar: ${e.message}`,
                'danger'
              );
            }
          }
        }
      ],
    });

    await a.present();
  }

  esVencida(): boolean {
    if (!this.actividad) return false;
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    const hoyStr = `${y}-${m}-${d}`;
    const fechaStr = this.actividad.fecha_entrega.slice(0, 10);
    return fechaStr < hoyStr;
  }

  tareaBloqueada(): boolean {
    return this.esCalificada(this.entregaPropia);
  }

  esCalificada(e: EntregaDetalle | null): boolean {
    return !!e && e.calificacion != null;
  }

  abrirArchivo(url: string | null | undefined) {
    const normalizada = this.urlArchivo(url);
    if (normalizada) this.visorArchivos.abrir(normalizada);
  }

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
      CUESTIONARIO: 'help-circle-outline',
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
      const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
      const { data: pregs } = await this.sesion.supabase
        .rpc('leer_preguntas_actividad', { p_token: token, p_actividad_id: this.actividadId });

      for (const p of pregs || []) {
        const tipo = (p.tipo || 'MULTIPLE') as TipoPregunta;
       let opciones: { id: number; texto: string }[] = [];
        if (tipo !== 'ABIERTA') {
          const { data: ops } = await this.sesion.supabase
            .rpc('opciones_alumno_multi', { p_token: token, p_pregunta_ids: [p.id] });
          opciones = ops || [];
        }
        this.preguntasAlumno.push({ id: p.id, tipo, texto: p.texto, opciones });
      }

      if (this.entregaPropia?.id) {
        const { data: resp } = await this.sesion.supabase
          .rpc('respuestas_de_entrega', { p_token: token, p_entrega_id: this.entregaPropia.id });
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
