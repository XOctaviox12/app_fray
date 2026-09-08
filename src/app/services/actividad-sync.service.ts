import { Injectable } from '@angular/core';
import { SesionService } from './sesion.service';
import {
  BloqueClase,
  SesionClase,
  ActividadContenido,
  PreguntaActividad
} from '../pages/clase/clase.page';


function finDelDia(fechaIso: string): string {
  const soloFecha = fechaIso.split('T')[0];
  return `${soloFecha}T23:59:59.999Z`;
}

const VALOR_TOTAL_DEFECTO = 10;

@Injectable({
  providedIn: 'root'
})
export class ActividadSyncService {

  constructor(private sesion: SesionService) {}

  async sincronizarBloque(
    bloque: BloqueClase,
    sesionActiva: SesionClase
  ): Promise<{ success: boolean; error?: string }> {

    if (bloque.tipo !== 'actividad' || !bloque.id) {
      return { success: false, error: 'Bloque no es de tipo actividad o sin ID' };
    }

    const act: ActividadContenido =
      this.parsearActividad(bloque.contenido);

    const preguntasValidas = act.preguntas.filter(
      p => p.pregunta?.trim()
    );


    if (!preguntasValidas.length) {
      console.warn(
        `[sincronizarBloque] Bloque ${bloque.id} no tiene preguntas válidas. ` +
        `Solo se sincronizarán las instrucciones (sin autocalificación).`
      );

    }

    const actividadId = await this.upsertActividad(
      bloque,
      sesionActiva,
      act
    );

    if (!actividadId) {
      return { success: false, error: 'No se pudo crear/actualizar la actividad' };
    }


    if (preguntasValidas.length > 0) {
      const syncResult = await this.sincronizarPreguntasViaRpc(
        actividadId,
        preguntasValidas
      );

      if (!syncResult.success) {
        return syncResult;
      }
    }

    return { success: true };
  }

  async despublicarPorBloque(
    bloqueId: number
  ): Promise<void> {

    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;

    if (!token) {
      throw new Error(
        'No hay una sesión válida de docente o tutor.'
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



  private async upsertActividad(
    bloque: BloqueClase,
    sesionActiva: SesionClase,
    act: ActividadContenido
  ): Promise<number | null> {


    const { data: _ex, error: errorBusqueda } = await this.sesion.supabase.rpc(
      'id_actividad_por_bloque_origen',
      {
        p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token),
        p_bloque_origen_id: bloque.id
      }
    );

    if (errorBusqueda) {
      throw errorBusqueda;
    }

    const existente = _ex && _ex.length ? _ex[0] : null;

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
      fecha_entrega: new Date().toISOString(),
      valor_total: 10,
      url_interactiva: null,
      archivo: null,
      calificacion_automatica: false,
      creada_en: new Date().toISOString(),
    };


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


const { data: nueva, error } = await this.sesion.supabase
  .rpc('insertar_actividad_json', {
    p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token),
    p_payload: payload
  });

if (error) {
  throw error;
}


if (nueva && typeof nueva === 'object') {
  const id = (nueva as any).id;
  if (id) {
    return Number(id);
  }
}

return null;
  }


  private async sincronizarPreguntasViaRpc(
    actividadId: number,
    preguntas: PreguntaActividad[]
  ): Promise<{ success: boolean; error?: string }> {

    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;

    if (!token) {
      return {
        success: false,
        error: 'No hay una sesión válida de docente o tutor.'
      };
    }


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
      return {
        success: false,
        error: `Error sincronizando preguntas: ${error.message}`
      };
    }

    return { success: true };
  }

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

  private construirOpciones(
    p: PreguntaActividad
  ): Array<{ texto: string; es_correcta: boolean }> {

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
    } else {
      return [];
    }
  }
}
