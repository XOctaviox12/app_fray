import { Component, OnInit } from '@angular/core';
import { SesionService } from '../../services/sesion.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

export interface MateriaAlumno {
  id: number; nombre: string; clave: string; docente: string;
  calificacion: number | null; parcial: number | null;
  tareasPendientes: number; color: string;
}
export interface MateriaDocente {
  id: number; nombre: string; clave: string; grupos: string[];
  totalAlumnos: number; tareasPub: number; actividadesPub: number;
}
export interface MateriaTutor {
  id: number; nombre: string; calificacion: number | null;
  parcial: number | null; aprobada: boolean;
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

  materiasAlumno:  MateriaAlumno[]  = [];
  materiasDocente: MateriaDocente[] = [];
  materiasTutor:   MateriaTutor[]   = [];

  nombreHijo = '';
  promedioHijo: number | null = null;
  sinCalificaciones      = true;
  tareasPendientesTotal  = 0;

  // Total de alumnos únicos del docente (para el resumen).
  // No usar sumField sobre materiasDocente.totalAlumnos: cada materia
  // ya trae su propio conteo (puede repetir alumnos entre materias).
  totalAlumnosUnicos = 0;

  private supabase: SupabaseClient;

  constructor(public sesion: SesionService) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

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

  // ── Helpers usados en el HTML ──────────────────────────
  colorCalificacion(cal: number | null): string {
    if (cal === null) return 'sin-nota';
    if (cal >= 9)     return 'excelente';
    if (cal >= 7)     return 'bien';
    if (cal >= 6)     return 'regular';
    return 'reprobado';
  }

  // Evita lógica ternaria multilínea en el HTML (causa NG5002)
  iconoCalificacion(cal: number | null): string {
    if (cal === null) return 'time-outline';
    return cal >= 6 ? 'checkmark-circle-outline' : 'close-circle-outline';
  }

  iconoAprobada(aprobada: boolean): string {
    return aprobada ? 'checkmark-circle-outline' : 'close-circle-outline';
  }

  trackById(_: number, item: any) { return item.id; }

  // ══════════════════════════════════════════════════════
  //  ALUMNO
  // ══════════════════════════════════════════════════════
  async cargarAlumno() {
    const alumnoId = this.sesion.usuario?.id;
    if (!alumnoId) return;

    const { data: usu } = await this.supabase
      .from('users_user').select('alumno_grupo_id').eq('id', alumnoId).single();
    const grupoId = (usu as any)?.alumno_grupo_id;
    if (!grupoId) return;

    const { data: relAsi } = await this.supabase
      .from('academic_asignatura_grupos').select('asignatura_id').eq('grupo_id', grupoId);
    if (!relAsi?.length) return;
    const asiIds = relAsi.map((r: any) => r.asignatura_id);

    const { data: asignaturas } = await this.supabase
      .from('academic_asignatura').select('id, nombre, clave').in('id', asiIds).order('nombre');
    if (!asignaturas?.length) return;

    const { data: docenteRel } = await this.supabase
      .from('academic_asignatura_docentes').select('asignatura_id, user_id').in('asignatura_id', asiIds);
    const docenteIds = [...new Set((docenteRel || []).map((d: any) => d.user_id))];
    let docenteNombres: Record<number, string> = {};
    if (docenteIds.length) {
      const { data: users } = await this.supabase
        .from('users_user').select('id, first_name, last_name').in('id', docenteIds);
      (users || []).forEach((u: any) => {
        docenteNombres[u.id] = `${u.first_name} ${u.last_name}`.trim();
      });
    }

    const { data: boletas } = await this.supabase
      .from('academic_boletaparcial')
      .select('asignatura_id, calificacion_final, parcial')
      .eq('alumno_id', alumnoId).eq('publicada', true)
      .order('parcial', { ascending: false });

    const { data: tareas } = await this.supabase
      .from('academic_tarea').select('id, asignatura_id')
      .eq('grupo_id', grupoId).eq('publicada', true).in('asignatura_id', asiIds);

    const { data: entregas } = await this.supabase
      .from('academic_entregatarea').select('tarea_id').eq('alumno_id', alumnoId);
    const entregaIds = new Set((entregas || []).map((e: any) => e.tarea_id));

    this.materiasAlumno = (asignaturas as any[]).map((asi, idx) => {
      const dr       = (docenteRel || []).find((d: any) => d.asignatura_id === asi.id);
      const docente  = dr ? (docenteNombres[dr.user_id] || 'Por asignar') : 'Por asignar';
      const boleta   = (boletas || []).find((b: any) => b.asignatura_id === asi.id);
      const tareasAsi = (tareas || []).filter((t: any) => t.asignatura_id === asi.id);
      const pendientes = tareasAsi.filter((t: any) => !entregaIds.has(t.id)).length;
      return {
        id: asi.id, nombre: asi.nombre, clave: asi.clave || '', docente,
        calificacion:    boleta ? parseFloat(boleta.calificacion_final) : null,
        parcial:         boleta?.parcial ?? null,
        tareasPendientes: pendientes,
        color:           COLORES[idx % COLORES.length],
      } as MateriaAlumno;
    });

    this.tareasPendientesTotal = this.materiasAlumno.reduce((s, m) => s + m.tareasPendientes, 0);
    this.sinCalificaciones     = !this.materiasAlumno.some(m => m.calificacion !== null);
  }

  // ══════════════════════════════════════════════════════
  //  DOCENTE
  // ══════════════════════════════════════════════════════
  async cargarDocente() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    const { data: relAsi } = await this.supabase
      .from('academic_asignatura_docentes').select('asignatura_id').eq('user_id', docenteId);
    if (!relAsi?.length) return;
    const asiIds = relAsi.map((r: any) => r.asignatura_id);

    const { data: asignaturas } = await this.supabase
      .from('academic_asignatura').select('id, nombre, clave').in('id', asiIds).order('nombre');
    if (!asignaturas?.length) return;

    // Grupos donde el docente da clase (en general)
    const { data: relGrupos } = await this.supabase
      .from('academic_grupo_docentes').select('grupo_id').eq('user_id', docenteId);
    const grupoIdsDocente = [...new Set((relGrupos || []).map((r: any) => r.grupo_id))] as number[];

    let grupoNombres: Record<number, string> = {};
    if (grupoIdsDocente.length) {
      const { data: grupos } = await this.supabase
        .from('academic_grupo').select('id, nombre, grado').in('id', grupoIdsDocente);
      (grupos || []).forEach((g: any) => { grupoNombres[g.id] = `${g.grado}°${g.nombre}`; });
    }

    // Grupos por asignatura (para saber en cuáles grupos se imparte CADA materia,
    // y así no mezclar los grupos de una materia con los de otra)
    const { data: relAsiGrupos } = await this.supabase
      .from('academic_asignatura_grupos').select('asignatura_id, grupo_id').in('asignatura_id', asiIds);

    const { data: tareas } = await this.supabase
      .from('academic_tarea').select('asignatura_id').eq('docente_id', docenteId).eq('publicada', true);
    const { data: acts } = await this.supabase
      .from('academic_actividad').select('asignatura_id').eq('docente_id', docenteId).eq('publicada', true);

    // Alumnos de TODOS los grupos donde da clase el docente (una sola consulta,
    // luego se filtra en memoria por materia y se cuenta lo único para el resumen)
    let alumnosPorGrupo: Record<number, number> = {};
    let alumnosUnicosSet = new Set<number>();
    if (grupoIdsDocente.length) {
      const { data: alumnos } = await this.supabase
        .from('users_user').select('id, alumno_grupo_id')
        .in('alumno_grupo_id', grupoIdsDocente).eq('rol', 'ALUMNO');
      (alumnos || []).forEach((a: any) => {
        alumnosPorGrupo[a.alumno_grupo_id] = (alumnosPorGrupo[a.alumno_grupo_id] || 0) + 1;
        alumnosUnicosSet.add(a.id);
      });
    }
    this.totalAlumnosUnicos = alumnosUnicosSet.size;

    this.materiasDocente = (asignaturas as any[]).map(asi => {
      // Grupos específicos de ESTA materia, intersectados con los grupos del docente
      const gruposAsiIds = (relAsiGrupos || [])
        .filter((r: any) => r.asignatura_id === asi.id)
        .map((r: any) => r.grupo_id)
        .filter((gid: number) => grupoIdsDocente.includes(gid));

      const totalAlumnosMateria = gruposAsiIds.reduce((s, gid) => s + (alumnosPorGrupo[gid] || 0), 0);

      return {
        id: asi.id, nombre: asi.nombre, clave: asi.clave || '',
        grupos:         gruposAsiIds.map(id => grupoNombres[id]).filter(Boolean),
        totalAlumnos:   totalAlumnosMateria,
        tareasPub:      (tareas || []).filter((t: any) => t.asignatura_id === asi.id).length,
        actividadesPub: (acts   || []).filter((a: any) => a.asignatura_id === asi.id).length,
      } as MateriaDocente;
    });
  }

  // ══════════════════════════════════════════════════════
  //  TUTOR
  // ══════════════════════════════════════════════════════
  async cargarTutor() {
    // TODO(schema): confirmar cómo se obtiene el alumno_id del tutor
    const tutorId = this.sesion.usuario?.id;
    if (!tutorId) return;

    // Se asume tabla tutor_tutorado con columna alumno_id
    const { data: rel } = await this.supabase
      .from('tutor_tutorado').select('alumno_id').eq('tutor_id', tutorId).single();
    const alumnoId = (rel as any)?.alumno_id;
    if (!alumnoId) return;

    const { data: alumno } = await this.supabase
      .from('users_user').select('first_name, last_name, alumno_grupo_id').eq('id', alumnoId).single();
    if (!alumno) return;

    this.nombreHijo = `${(alumno as any).first_name} ${(alumno as any).last_name}`.trim();
    const grupoId = (alumno as any).alumno_grupo_id;
    if (!grupoId) return;

    const { data: relAsi } = await this.supabase
      .from('academic_asignatura_grupos').select('asignatura_id').eq('grupo_id', grupoId);
    if (!relAsi?.length) return;
    const asiIds = relAsi.map((r: any) => r.asignatura_id);

    const { data: asignaturas } = await this.supabase
      .from('academic_asignatura').select('id, nombre').in('id', asiIds).order('nombre');

    const { data: boletas } = await this.supabase
      .from('academic_boletaparcial')
      .select('asignatura_id, calificacion_final, parcial')
      .eq('alumno_id', alumnoId).eq('publicada', true)
      .order('parcial', { ascending: false });

    this.materiasTutor = (asignaturas as any[] || []).map(asi => {
      const boleta = (boletas || []).find((b: any) => b.asignatura_id === asi.id);
      const cal    = boleta ? parseFloat(boleta.calificacion_final) : null;
      return { id: asi.id, nombre: asi.nombre, calificacion: cal,
               parcial: boleta?.parcial ?? null, aprobada: cal === null || cal >= 6 } as MateriaTutor;
    });

    const notas = this.materiasTutor.filter(m => m.calificacion !== null).map(m => m.calificacion!);
    this.promedioHijo = notas.length
      ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10
      : null;
  }
}
