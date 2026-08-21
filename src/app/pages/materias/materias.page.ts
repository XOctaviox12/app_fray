import { Component, OnInit } from '@angular/core';
import { SesionService } from '../../services/sesion.service';

export interface BoletaItem {
  parcial: number;
  calificacion: number;
}

export interface MateriaAlumno {
  id: number; nombre: string; clave: string; docente: string;
  boletas: BoletaItem[];
  calificacion: number | null; parcial: number | null;
  tareasPendientes: number; color: string;
}
export interface MateriaDocente {
  id: number; nombre: string; clave: string; grupos: string[];
  totalAlumnos: number; tareasPub: number; actividadesPub: number;
}
export interface MateriaTutor {
  id: number; nombre: string;
  boletas: BoletaItem[];
  calificacion: number | null;
  parcial: number | null; aprobada: boolean; docente?: string;
}

const COLORES = ['orange', 'blue', 'red', 'green', 'purple'];

@Component({
  standalone: false,
  selector: 'app-materias',
  templateUrl: './materias.page.html',
  styleUrls: ['./materias.page.scss'],
})
export class MateriasPage implements OnInit {

  segmento = 'materias';
  cargando = true;

  // Antes se usaba "this.coloresMateria" en cargarAlumno() y cargarDocente()
  // sin que existiera esta propiedad en la clase (solo estaba la constante
  // module-level COLORES). Eso rompía en tiempo de ejecución.
  coloresMateria = COLORES;

  materiasAlumno:  MateriaAlumno[]  = [];
  materiasDocente: MateriaDocente[] = [];
  materiasTutor:   MateriaTutor[]   = [];

  nombreHijo = '';
  promedioHijo: number | null = null;
  sinCalificaciones      = true;
  tareasPendientesTotal  = 0;

  totalAlumnosUnicos = 0;

  constructor(public sesion: SesionService) {}

  ngOnInit() { this.cargarDatos(); }

  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esTutor():   boolean { return this.sesion.esTutor();   }
  get esAlumno():  boolean { return this.sesion.esAlumno();  }

  cambiarSegmento(event: any) { this.segmento = event.detail.value; }

  async cargarDatos() {
    this.cargando = true;
    try {
      if (this.esDocente)    await this.cargarDocente();
      else if (this.esTutor) await this.cargarTutor();
      else                   await this.cargarAlumno();
    } catch (e: any) {
      console.error('MateriasPage:', e.message);
    } finally {
      this.cargando = false;
    }
  }

  colorCalificacion(cal: number | null): string {
    if (cal === null) return 'sin-nota';
    if (cal >= 9)     return 'excelente';
    if (cal >= 7)     return 'bien';
    if (cal >= 6)     return 'regular';
    return 'reprobado';
  }

  iconoCalificacion(cal: number | null): string {
    if (cal === null) return 'time-outline';
    return cal >= 6 ? 'checkmark-circle-outline' : 'close-circle-outline';
  }

  iconoAprobada(aprobada: boolean): string {
    return aprobada ? 'checkmark-circle-outline' : 'close-circle-outline';
  }

  trackById(_: number, item: any) { return item.id; }

  // Agrupa boletas ya publicadas por asignatura_id, ordenadas por parcial.
  // Nota: si la fila trae "publicada" se respeta ese valor; si el RPC ya
  // devuelve solo publicadas y no manda ese campo, no se descarta nada
  // (evita que boletas_alumno_publicadas quede vacía por falta del campo).
  private agruparBoletasPorMateria(boletas: any[]): Record<number, BoletaItem[]> {
    const mapa: Record<number, BoletaItem[]> = {};
    (boletas || [])
      .filter((b: any) => b.publicada !== false)
      .forEach((b: any) => {
        if (!mapa[b.asignatura_id]) mapa[b.asignatura_id] = [];
        mapa[b.asignatura_id].push({
          parcial: b.parcial,
          calificacion: b.calificacion_final,
        });
      });
    Object.values(mapa).forEach(lista => lista.sort((a, b) => a.parcial - b.parcial));
    return mapa;
  }

  // ══════════════════════════════════════════════════════
  //  ALUMNO
  // ══════════════════════════════════════════════════════
  async cargarAlumno() {
    const alumnoId = this.sesion.usuario?.id;
    if (!alumnoId) return;

    const token = this.sesion.usuario?.token;

    const { data: usu } = await this.sesion.supabase
      .rpc('perfil_basico_usuario', { p_token: token, p_user_id: alumnoId }).single();
    const grupoId = (usu as any)?.alumno_grupo_id;
    if (!grupoId) return;

    const { data: materiasInfo } = await this.sesion.supabase.rpc('obtener_materias_grupo_tutor', {
        p_token: token, p_grupo_id: grupoId, p_alumno_id: alumnoId
    });

    if (!materiasInfo || !materiasInfo.length) return;

    // Tareas y actividades pendientes, combinadas
    const { data: tareasData } = await this.sesion.supabase.rpc('tareas_del_alumno', { p_token: token, p_alumno_id: alumnoId });
    const { data: actividadesData } = await this.sesion.supabase.rpc('actividades_del_alumno', { p_token: token, p_alumno_id: alumnoId });

    const tareasPendientes = (tareasData || []).filter((t: any) => t.publicada);
    const actividadesPendientes = (actividadesData || []).filter((a: any) => a.publicada);

    // Boletas publicadas, desglosadas por parcial y materia
    const { data: boletasRaw } = await this.sesion.supabase
      .rpc('obtener_boletas_alumno_tutor', { p_token: token, p_alumno_id: alumnoId });
    const boletasPorMateria = this.agruparBoletasPorMateria(boletasRaw);

    this.materiasAlumno = materiasInfo.map((asi: any, idx: number) => {
      const totalTareas = tareasPendientes.filter((t: any) => t.asignatura_id === asi.id).length;
      const totalActividades = actividadesPendientes.filter((a: any) => a.asignatura_id === asi.id).length;

      let docenteNombre = 'Sin asignar';
      if (asi.docentes && asi.docentes.length > 0 && asi.docentes[0].user) {
         docenteNombre = `${asi.docentes[0].user.first_name} ${asi.docentes[0].user.last_name}`.trim();
      }

      const boletas = boletasPorMateria[asi.id] || [];
      const ultima = boletas.length ? boletas[boletas.length - 1] : null;

      return {
        id: asi.id,
        nombre: asi.nombre,
        clave: asi.clave,
        color: this.coloresMateria[idx % this.coloresMateria.length],
        docente: docenteNombre,
        boletas,
        calificacion: ultima ? ultima.calificacion : null,
        parcial: ultima ? ultima.parcial : null,
        tareasPendientes: totalTareas + totalActividades,
      } as MateriaAlumno;
    });

    this.tareasPendientesTotal = this.materiasAlumno.reduce((s, m) => s + m.tareasPendientes, 0);
    this.sinCalificaciones     = !this.materiasAlumno.some(m => m.boletas.length > 0);
  }

  // ══════════════════════════════════════════════════════
  //  DOCENTE
  // ══════════════════════════════════════════════════════
  async cargarDocente() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    // Carga segura vía RPC unificada
    const tokenD = this.sesion.usuario?.token || this.sesion.tutor?.token;

    const { data: rawData, error } = await this.sesion.supabase.rpc('grupos_y_materias_del_docente', { p_token: tokenD });
    if (!error && rawData && rawData.length) {
        const { data: tareas } = await this.sesion.supabase.rpc('tareas_docente', { p_token: tokenD });
        const { data: alumnosData } = await this.sesion.supabase.rpc('alumnos_por_grupos', { p_token: tokenD, p_grupo_ids: Array.from(new Set(rawData.map((r:any) => r.grupo_id))) });

        const alumnosPorGrupo: Record<number, number> = {};
        (alumnosData || []).forEach((a: any) => {
            alumnosPorGrupo[a.alumno_grupo_id] = (alumnosPorGrupo[a.alumno_grupo_id] || 0) + 1;
        });

        const materiasMap = new Map<number, any>();
        rawData.forEach((row: any) => {
            if (!materiasMap.has(row.asignatura_id)) {
                materiasMap.set(row.asignatura_id, {
                    id: row.asignatura_id,
                    nombre: row.asignatura_nombre,
                    clave: row.asignatura_clave,
                    gruposIds: new Set<number>(),
                    gruposNombres: []
                });
            }
            const mat = materiasMap.get(row.asignatura_id);
            if (!mat.gruposIds.has(row.grupo_id)) {
                mat.gruposIds.add(row.grupo_id);
                mat.gruposNombres.push(`${row.grupo_grado}° ${row.grupo_nombre}`);
            }
        });

        let idx = 0;
        // Antes se devolvía "totalActividades", campo que no existe en
        // MateriaDocente (la interfaz pide tareasPub/actividadesPub).
        this.materiasDocente = Array.from(materiasMap.values()).map(asi => {
            const gruposIdsArray = Array.from(asi.gruposIds) as number[];
            const totalAlumnos = gruposIdsArray.reduce((acc, gId) => acc + (alumnosPorGrupo[gId] || 0), 0);
            const tareasMateria = (tareas || []).filter((t: any) => t.asignatura_id === asi.id && t.publicada).length;

            return {
                id: asi.id,
                nombre: asi.nombre,
                clave: asi.clave,
                color: this.coloresMateria[idx++ % this.coloresMateria.length],
                grupos: asi.gruposNombres,
                totalAlumnos,
                tareasPub: tareasMateria,
                actividadesPub: 0, // No hay fuente de "actividades" aún; conectar cuando exista.
            } as MateriaDocente;
        });
    } else {
        this.materiasDocente = [];
    }
  }

  // ══════════════════════════════════════════════════════
  //  TUTOR
  // ══════════════════════════════════════════════════════
  async cargarTutor() {
    const token = this.sesion.tutor?.token;
    const alumnoId = this.sesion.tutor?.alumno_id;
    if (!alumnoId) return;

    const { data: alumno } = await this.sesion.supabase.rpc('perfil_basico_usuario', { p_token: token, p_user_id: alumnoId }).single();
    if (!alumno) return;

    this.nombreHijo = `${(alumno as any).first_name} ${(alumno as any).last_name}`.trim();
    const grupoId = (alumno as any).alumno_grupo_id;
    if (!grupoId) return;

    const { data: materiasInfo } = await this.sesion.supabase.rpc('obtener_materias_grupo_tutor', {
        p_token: token, p_grupo_id: grupoId, p_alumno_id: alumnoId
    });

    if (!materiasInfo || !materiasInfo.length) return;

    const { data: boletasRaw } = await this.sesion.supabase
      .rpc('boletas_alumno_publicadas', { p_token: token, p_alumno_id: alumnoId });
    const boletasPorMateria = this.agruparBoletasPorMateria(boletasRaw);

    this.materiasTutor = materiasInfo.map((asi: any) => {
      let docenteNombre = 'Sin asignar';
      if (asi.docentes && asi.docentes.length > 0 && asi.docentes[0].user) {
         docenteNombre = `${asi.docentes[0].user.first_name} ${asi.docentes[0].user.last_name}`.trim();
      }

      const boletas = boletasPorMateria[asi.id] || [];
      const ultima = boletas.length ? boletas[boletas.length - 1] : null;

      return {
        id: asi.id,
        nombre: asi.nombre,
        docente: docenteNombre,
        boletas,
        calificacion: ultima ? ultima.calificacion : null,
        parcial: ultima ? ultima.parcial : null,
        aprobada: ultima ? ultima.calificacion >= 6 : false,
      } as MateriaTutor;
    });

    const notas = this.materiasTutor.filter(m => m.calificacion !== null).map(m => m.calificacion!);
    this.promedioHijo = notas.length
      ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10
      : null;
  }
}
