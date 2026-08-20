import { Injectable } from '@angular/core';
import { SesionService } from './sesion.service';
import {
  BloqueClase,
  SesionClase,
  ActividadContenido,
  PreguntaActividad
} from '../pages/clase/clase.page';

// Fin del día (23:59:59) de una fecha dada.
// Se usa como fecha_entrega por defecto cuando una actividad
// se crea desde un bloque de clase que no pide fecha límite propia.
function finDelDia(fechaIso: string): string {
  const soloFecha = fechaIso.split('T')[0];
  const [y, m, d] = soloFecha.split('-').map(Number);

  // Construido en hora local y convertido posteriormente a ISO.
  const fecha = new Date(y, m - 1, d, 23, 59, 59, 999);

  return fecha.toISOString();
}

const VALOR_TOTAL_DEFECTO = 10;

@Injectable({
  providedIn: 'root'
})
export class ActividadSyncService {

  constructor(private sesion: SesionService) {}

  // ============================================================
  // SINCRONIZAR BLOQUE DE ACTIVIDAD
  // ============================================================

  // Crea o actualiza la academic_actividad ligada a este bloque
  // y sincroniza sus preguntas/opciones vía RPC.
  //
  // Es seguro llamarlo repetidamente:
  // reutiliza filas existentes mediante:
  //   - bloque_origen_id (para academic_actividad)
  //   - origen_pregunta_id (para academic_preguntaactividad)
  //
  // Por lo tanto no pierde las entregas ya realizadas por alumnos.
  async sincronizarBloque(
    bloque: BloqueClase,
    sesionActiva: SesionClase
  ): Promise<void> {

    if (bloque.tipo !== 'actividad' || !bloque.id) {
      return;
    }

    const act: ActividadContenido =
      this.parsearActividad(bloque.contenido);

    const preguntasValidas = act.preguntas.filter(
      p => p.pregunta?.trim()
    );

    if (!preguntasValidas.length) {
      return;
    }

    const actividadId = await this.upsertActividad(
      bloque,
      sesionActiva,
      act
    );

    // Usar RPC para sincronizar todas las preguntas de una vez
    await this.sincronizarPreguntasViaRpc(
      actividadId,
      preguntasValidas
    );
  }

  // ============================================================
  // DESPUBLICAR ACTIVIDAD
  // ============================================================

  // Se llama al desactivar un bloque de actividad.
  // Usa RPC para garantizar seguridad.
  // No elimina el historial de calificaciones:
  // únicamente oculta la actividad de Tareas.
  async despublicarPorBloque(
    bloqueId: number
  ): Promise<void> {

    const token = this.sesion.usuario?.token;

    if (!token) {
      throw new Error(
        'No hay una sesión válida de docente.'
      );
    }

    const { error } = await this.sesion.supabase.rpc(
      'despublicar_actividad_por_bloque',
      {
        p_token: token,
        p_bloque_id: bloqueId
      }
    );

    if (error) {
      throw error;
    }
  }

  // ============================================================
  // PARSEAR ACTIVIDAD
  // ============================================================

  private parsearActividad(
    contenidoRaw: string
  ): ActividadContenido {

    try {
      return JSON.parse(contenidoRaw);
    } catch {
      return {
        instrucciones: contenidoRaw || '',
        preguntas: []
      };
    }
  }

  // ============================================================
  // CREAR / ACTUALIZAR ACTIVIDAD
  // ============================================================

  // NOTA: academic_actividad aún permite INSERT/UPDATE directo
  // porque necesita ser creada antes de sincronizar preguntas.
  // Se migrará a RPC cuando se haga el REVOKE en BD.

  private async upsertActividad(
    bloque: BloqueClase,
    sesionActiva: SesionClase,
    act: ActividadContenido
  ): Promise<number> {

    // Antes: "p_bloque_origen_id:" se mandaba vacío (nunca se pasaba
    // bloque.id), así que la búsqueda de la actividad existente nunca
    // encontraba nada y siempre se creaba una actividad nueva.
    const { data: _ex, error: errorBusqueda } = await this.sesion.supabase.rpc('id_actividad_por_bloque_origen', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_bloque_origen_id: bloque.id });

    if (errorBusqueda) {
      throw errorBusqueda;
    }

    const existente = _ex && _ex.length ? _ex[0] : null;

    const payload = {
      titulo:
        bloque.titulo?.trim() ||
        'Actividad de clase',

      instrucciones:
        act.instrucciones || '',

      tipo: 'MIXTA',

      publicada: true,

      asignatura_id:
        sesionActiva.asignatura_id,

      grupo_id:
        sesionActiva.grupo_id,

      docente_id:
        sesionActiva.docente_id,

      bloque_origen_id:
        bloque.id,

      sesion_origen_id:
        sesionActiva.id,
    };

    // ----------------------------------------------------------
    // Actualizar actividad existente
    // ----------------------------------------------------------

    if (existente) {

      const { error } = await this.sesion.supabase
        .rpc('actualizar_actividad_json', {
          p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token),
          p_actividad_id: (existente as any).id,
          p_payload: payload
        });

      if (error) {
        throw error;
      }

      return (existente as any).id;
    }

    // ----------------------------------------------------------
    // Crear actividad nueva
    // ----------------------------------------------------------

    // Antes: "p_payload: {}" mandaba un objeto vacío en vez del
    // "payload" ya armado arriba, así que la actividad se creaba sin
    // título, instrucciones, asignatura, grupo, docente ni referencia
    // al bloque de origen.
    const { data: nueva, error } =
      await this.sesion.supabase
        .rpc('insertar_actividad_json', {
          p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token),
          p_payload: payload
        })
        .select('id')
        .single();

    if (error) {
      throw error;
    }

    return (nueva as any).id;
  }

  // ============================================================
  // SINCRONIZAR PREGUNTAS VÍA RPC
  // ============================================================

  // Usa sync_preguntas_actividad para sincronizar todas las preguntas
  // de una actividad de una sola vez.
  //
  // Esta RPC:
  // - Elimina preguntas que ya no están en el payload
  // - Crea nuevas preguntas
  // - Actualiza preguntas existentes
  // - Sincroniza opciones automáticamente

  private async sincronizarPreguntasViaRpc(
    actividadId: number,
    preguntas: PreguntaActividad[]
  ): Promise<void> {

    const token = this.sesion.usuario?.token;

    if (!token) {
      throw new Error(
        'No hay una sesión válida de docente.'
      );
    }

    // Convertir preguntas al formato esperado por la RPC
    const preguntasPayload = preguntas.map(
      (p, idx) => {
        const tipoBD = this.convertirTipoPregunta(p.tipo);
        const opciones = this.construirOpciones(p);

        return {
          origen_pregunta_id: p.id,
          texto: p.pregunta,
          tipo: tipoBD,
          orden: idx,
          puntos: 1,
          opciones: opciones
        };
      }
    );

    const { error } = await this.sesion.supabase.rpc(
      'sync_preguntas_actividad',
      {
        p_token: token,
        p_actividad_id: actividadId,
        p_preguntas: preguntasPayload
      }
    );

    if (error) {
      throw error;
    }
  }

  // ============================================================
  // HELPER: CONVERTIR TIPO DE PREGUNTA
  // ============================================================

  // Convierte el tipo del modelo de clase al tipo de BD.
  //
  // Frontend/clase.page.ts:
  //   opcion_multiple
  //   verdadero_falso
  //   respuesta_corta
  //
  // BD:
  //   MULTIPLE
  //   VF
  //   ABIERTA

  private convertirTipoPregunta(tipoFrontend: string): string {
    switch (tipoFrontend) {
      case 'opcion_multiple':
        return 'MULTIPLE';
      case 'verdadero_falso':
        return 'VF';
      case 'respuesta_corta':
        return 'ABIERTA';
      default:
        return 'ABIERTA';
    }
  }

  // ============================================================
  // HELPER: CONSTRUIR OPCIONES
  // ============================================================

  // Construye el array de opciones para guardar_opciones_pregunta().
  //
  // Formato esperado:
  //   [{
  //     texto: string,
  //     es_correcta: boolean
  //   }, ...]
  //
  // Respuesta abierta devuelve [] (sin opciones).

  private construirOpciones(
    p: PreguntaActividad
  ): Array<{ texto: string; es_correcta: boolean }> {

    // ----------------------------------------------------------
    // Opción múltiple
    // ----------------------------------------------------------

    if (
      p.tipo === 'opcion_multiple' &&
      p.opciones?.length
    ) {

      return p.opciones
        .map(
          (texto, idx) => ({
            texto,
            es_correcta:
              idx === p.respuestaCorrecta
          })
        )
        .filter(
          o => o.texto?.trim()
        );

    // ----------------------------------------------------------
    // Verdadero / Falso
    // ----------------------------------------------------------

    } else if (
      p.tipo === 'verdadero_falso'
    ) {

      return [
        {
          texto: 'Verdadero',
          es_correcta:
            p.respuestaCorrecta === true
        },
        {
          texto: 'Falso',
          es_correcta:
            p.respuestaCorrecta === false
        }
      ];

    // ----------------------------------------------------------
    // Respuesta corta / ABIERTA
    // ----------------------------------------------------------

    } else {
      return [];
    }
  }
}
