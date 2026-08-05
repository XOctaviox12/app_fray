import { Injectable } from '@angular/core';
import { SesionService } from './sesion.service';
import { BloqueClase, SesionClase, ActividadContenido, PreguntaActividad } from '../pages/clase/clase.page';

// Fin del día (23:59:59) de una fecha dada, usado como fecha_entrega por
// defecto cuando una actividad se crea desde un bloque de clase (que no
// pide fecha límite propia).
function finDelDia(fechaIso: string): string {
  const soloFecha = fechaIso.split('T')[0]; // "2026-08-04"
  const [y, m, d] = soloFecha.split('-').map(Number);
  const fecha = new Date(y, m - 1, d, 23, 59, 59, 999); // construido en hora LOCAL
  return fecha.toISOString();
}

const VALOR_TOTAL_DEFECTO = 10;

@Injectable({ providedIn: 'root' })
export class ActividadSyncService {

  constructor(private sesion: SesionService) {}

  // Crea o actualiza la academic_actividad ligada a este bloque, y sus
  // preguntas/opciones. Es seguro llamarlo repetidamente (idempotente):
  // reutiliza filas existentes por bloque_origen_id / origen_pregunta_id,
  // así que no pierde las entregas ya hechas por alumnos al reeditar.
  async sincronizarBloque(bloque: BloqueClase, sesionActiva: SesionClase): Promise<void> {
    if (bloque.tipo !== 'actividad' || !bloque.id) return;

    const act: ActividadContenido = this.parsearActividad(bloque.contenido);
    const preguntasValidas = act.preguntas.filter(p => p.pregunta?.trim());
    if (!preguntasValidas.length) return; // nada que sincronizar todavía

    const actividadId = await this.upsertActividad(bloque, sesionActiva, act);
    await this.sincronizarPreguntas(actividadId, preguntasValidas);
  }

  // Se llama al desactivar un bloque de actividad (eliminarBloque). No se
  // borra el historial de calificaciones: solo se oculta de Tareas.
  async despublicarPorBloque(bloqueId: number): Promise<void> {
    await this.sesion.supabase
      .from('academic_actividad')
      .update({ publicada: false })
      .eq('bloque_origen_id', bloqueId);
  }

  private parsearActividad(contenidoRaw: string): ActividadContenido {
    try {
      return JSON.parse(contenidoRaw);
    } catch {
      return { instrucciones: contenidoRaw || '', preguntas: [] };
    }
  }

  private async upsertActividad(
    bloque: BloqueClase,
    sesionActiva: SesionClase,
    act: ActividadContenido,
  ): Promise<number> {
    const { data: existente } = await this.sesion.supabase
      .from('academic_actividad')
      .select('id')
      .eq('bloque_origen_id', bloque.id!)
      .maybeSingle();

    const payload = {
      titulo: bloque.titulo?.trim() || 'Actividad de clase',
      instrucciones: act.instrucciones || '',
      tipo: 'MIXTA',
      publicada: true,
      asignatura_id: sesionActiva.asignatura_id,
      grupo_id: sesionActiva.grupo_id,
      docente_id: sesionActiva.docente_id,
      bloque_origen_id: bloque.id,
      sesion_origen_id: sesionActiva.id,
    };

    if (existente) {
      const { error } = await this.sesion.supabase
        .from('academic_actividad')
        .update(payload)
        .eq('id', (existente as any).id);
      if (error) throw error;
      return (existente as any).id;
    }

    const { data: nueva, error } = await this.sesion.supabase
      .from('academic_actividad')
      .insert({
        ...payload,
        fecha_entrega: finDelDia(sesionActiva.fecha || new Date().toISOString()),
        valor_total: VALOR_TOTAL_DEFECTO,
        url_interactiva: null,
        archivo: null,
        calificacion_automatica: false,
        creada_en: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return (nueva as any).id;
  }

  private async sincronizarPreguntas(actividadId: number, preguntas: PreguntaActividad[]): Promise<void> {
    // 1) Preguntas existentes en Tareas para esta actividad
    const { data: existentes } = await this.sesion.supabase
      .from('academic_preguntaactividad')
      .select('id, origen_pregunta_id')
      .eq('actividad_id', actividadId);

    const existentesPorOrigen = new Map<string, number>(
      (existentes || [])
        .filter((p: any) => p.origen_pregunta_id)
        .map((p: any) => [p.origen_pregunta_id, p.id])
    );

    const idsBloque = new Set(preguntas.map(p => p.id));

    // 2) Borrar preguntas que el docente quitó del bloque (cascada a
    //    opciones y respuestas para no dejar huérfanos)
    const idsABorrar = (existentes || [])
      .filter((p: any) => p.origen_pregunta_id && !idsBloque.has(p.origen_pregunta_id))
      .map((p: any) => p.id);

    if (idsABorrar.length) {
      await this.sesion.supabase.from('academic_respuestaalumno').delete().in('pregunta_id', idsABorrar);
      await this.sesion.supabase.from('academic_opcionrespuesta').delete().in('pregunta_id', idsABorrar);
      await this.sesion.supabase.from('academic_preguntaactividad').delete().in('id', idsABorrar);
    }

    // 3) Upsert de cada pregunta actual del bloque
    for (let i = 0; i < preguntas.length; i++) {
      const p = preguntas[i];
      const idExistente = existentesPorOrigen.get(p.id);

      let preguntaId: number;
      if (idExistente) {
        const { error } = await this.sesion.supabase
          .from('academic_preguntaactividad')
          .update({ texto: p.pregunta, tipo: p.tipo, orden: i, puntos: 1 })
          .eq('id', idExistente);
        if (error) throw error;
        preguntaId = idExistente;
      } else {
        const { data, error } = await this.sesion.supabase
          .from('academic_preguntaactividad')
          .insert({
            texto: p.pregunta, tipo: p.tipo, orden: i, puntos: 1,
            actividad_id: actividadId, origen_pregunta_id: p.id,
          })
          .select('id').single();
        if (error) throw error;
        preguntaId = (data as any).id;
      }

      await this.sincronizarOpciones(preguntaId, p);
    }
  }

  // Reemplaza siempre las opciones (son baratas de recrear y no tienen
  // respuestas propias — la respuesta del alumno vive en respuestaalumno,
  // que referencia opcion_id y se limpia solo si la pregunta se borra).
  private async sincronizarOpciones(preguntaId: number, p: PreguntaActividad): Promise<void> {
    await this.sesion.supabase.from('academic_opcionrespuesta').delete().eq('pregunta_id', preguntaId);

    if (p.tipo === 'opcion_multiple' && p.opciones?.length) {
      const filas = p.opciones
        .map((texto, idx) => ({ texto, es_correcta: idx === p.respuestaCorrecta, pregunta_id: preguntaId }))
        .filter(o => o.texto?.trim());
      if (filas.length) {
        const { error } = await this.sesion.supabase.from('academic_opcionrespuesta').insert(filas);
        if (error) throw error;
      }
    } else if (p.tipo === 'verdadero_falso') {
      const { error } = await this.sesion.supabase.from('academic_opcionrespuesta').insert([
        { texto: 'Verdadero', es_correcta: p.respuestaCorrecta === true, pregunta_id: preguntaId },
        { texto: 'Falso', es_correcta: p.respuestaCorrecta === false, pregunta_id: preguntaId },
      ]);
      if (error) throw error;
    }
    // respuesta_corta: sin opciones, no autocalifica.
  }
}
