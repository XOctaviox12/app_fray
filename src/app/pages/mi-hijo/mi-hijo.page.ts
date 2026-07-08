import { Component, OnInit } from '@angular/core';
import { SesionService } from '../../services/sesion.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

export interface MateriaResumen {
  id: number;
  nombre: string;
  clave: string;
  docente: string;
  boletas: BoletaItem[];
  asistencias: AsistenciaResumen;
  promedio: number | null;
}

export interface BoletaItem {
  parcial: number;
  calificacion_final: number;
  nota_tareas: number | null;
  nota_actividades: number | null;
  nota_asistencia: number | null;
  nota_examen: number | null;
  nota_proyecto: number | null;
  publicada: boolean;
  publicada_en: string | null;
}

export interface AsistenciaResumen {
  total: number;
  presentes: number;
  ausentes: number;
  retardos: number;
  porcentaje: number;
}

export interface DatosAlumno {
  id: number;
  nombre: string;
  username: string;
  email: string;
  grupo: string;
  grado: number;
  carrera: string;
  plantel: string;
  periodo: string;
}

@Component({
  standalone: false,
  selector: 'app-mi-hijo',
  templateUrl: './mi-hijo.page.html',
  styleUrls: ['./mi-hijo.page.scss'],
})
export class MiHijoPage implements OnInit {

  supabase: SupabaseClient;

  cargando = true;
  error = '';

  alumno: DatosAlumno | null = null;
  materias: MateriaResumen[] = [];
  materiaActiva: number = 0; // índice de la pestaña activa

  constructor(private sesion: SesionService) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  ngOnInit() {
    this.cargarDatos();
  }

  async cargarDatos() {
    this.cargando = true;
    this.error = '';

    const alumnoId = this.sesion.tutor?.alumno_id;
    if (!alumnoId) {
      this.error = 'No se encontró información del alumno.';
      this.cargando = false;
      return;
    }

    try {
      await Promise.all([
        this.cargarAlumno(alumnoId),
        this.cargarMaterias(alumnoId),
      ]);
    } catch (e: any) {
      this.error = 'Error al cargar los datos: ' + e.message;
    }

    this.cargando = false;
  }

  async cargarAlumno(alumnoId: number) {
    const { data, error } = await this.supabase
      .from('users_user')
      .select(`
        id, first_name, last_name, username, email,
        alumno_grupo:academic_grupo (
          id, nombre, grado,
          carrera:academic_carrera ( nombre ),
          plantel:campuses_plantel ( nombre ),
          periodo:academic_periodo ( nombre )
        )
      `)
      .eq('id', alumnoId)
      .single();

    if (error || !data) throw new Error(error?.message || 'Alumno no encontrado');

    const g = (data as any).alumno_grupo;
    this.alumno = {
      id: data.id,
      nombre: `${data.first_name} ${data.last_name}`.trim(),
      username: data.username,
      email: data.email,
      grupo: g ? `${g.grado}° ${g.nombre}` : '—',
      grado: g?.grado || 0,
      carrera: g?.carrera?.nombre || '—',
      plantel: g?.plantel?.nombre || '—',
      periodo: g?.periodo?.nombre || '—',
    };
  }

  async cargarMaterias(alumnoId: number) {
    // 1. Obtener grupo del alumno
    const { data: usuData } = await this.supabase
      .from('users_user')
      .select('alumno_grupo_id')
      .eq('id', alumnoId)
      .single();

    const grupoId = (usuData as any)?.alumno_grupo_id;
    if (!grupoId) return;

    // 2. Asignaturas del grupo
    const { data: asigData } = await this.supabase
      .from('academic_asignatura_grupos')
      .select(`
        asignatura:academic_asignatura (
          id, nombre, clave,
          docentes:academic_asignatura_docentes (
            user:users_user ( first_name, last_name )
          )
        )
      `)
      .eq('grupo_id', grupoId);

    if (!asigData) return;

    // 3. Boletas parciales del alumno
    const { data: boletasData } = await this.supabase
      .from('academic_boletaparcial')
      .select('asignatura_id, parcial, calificacion_final, nota_tareas, nota_actividades, nota_asistencia, nota_examen, nota_proyecto, publicada, publicada_en')
      .eq('alumno_id', alumnoId)
      .eq('publicada', true)
      .order('parcial');

    // 4. Asistencias del alumno en este grupo
    const { data: asistData } = await this.supabase
      .from('academic_asistencia')
      .select('asignatura_id, estado')
      .eq('alumno_id', alumnoId)
      .eq('grupo_id', grupoId);

    // Mapear todo por asignatura
    this.materias = (asigData as any[]).map((item: any) => {
      const asig = item.asignatura;
      const asigId = asig.id;

      // Docentes
      const docenteNombre = asig.docentes?.length
        ? asig.docentes.map((d: any) =>
            `${d.user?.first_name || ''} ${d.user?.last_name || ''}`.trim()
          ).join(', ')
        : 'Sin asignar';

      // Boletas de esta materia
      const boletas: BoletaItem[] = (boletasData || [])
        .filter((b: any) => b.asignatura_id === asigId)
        .map((b: any) => ({
          parcial:            b.parcial,
          calificacion_final: parseFloat(b.calificacion_final),
          nota_tareas:        b.nota_tareas != null ? parseFloat(b.nota_tareas) : null,
          nota_actividades:   b.nota_actividades != null ? parseFloat(b.nota_actividades) : null,
          nota_asistencia:    b.nota_asistencia != null ? parseFloat(b.nota_asistencia) : null,
          nota_examen:        b.nota_examen != null ? parseFloat(b.nota_examen) : null,
          nota_proyecto:      b.nota_proyecto != null ? parseFloat(b.nota_proyecto) : null,
          publicada:          b.publicada,
          publicada_en:       b.publicada_en,
        }));

      // Promedio de boletas publicadas
      const promedio = boletas.length
        ? parseFloat((boletas.reduce((s, b) => s + b.calificacion_final, 0) / boletas.length).toFixed(2))
        : null;

      // Asistencias de esta materia
      const asistMateria = (asistData || []).filter((a: any) => a.asignatura_id === asigId);
      const total     = asistMateria.length;
      const presentes = asistMateria.filter((a: any) => a.estado === 'P').length;
      const ausentes  = asistMateria.filter((a: any) => a.estado === 'A').length;
      const retardos  = asistMateria.filter((a: any) => a.estado === 'R').length;
      const porcentaje = total > 0 ? Math.round((presentes / total) * 100) : 0;

      return {
        id: asigId,
        nombre: asig.nombre,
        clave: asig.clave || '',
        docente: docenteNombre,
        boletas,
        promedio,
        asistencias: { total, presentes, ausentes, retardos, porcentaje },
      } as MateriaResumen;
    });
  }

  // ── Helpers ──────────────────────────────
  setMateria(i: number) {
    this.materiaActiva = i;
  }

  colorNota(nota: number | null): string {
    if (nota == null) return 'pendiente';
    if (nota >= 9)   return 'excelente';
    if (nota >= 7)   return 'bien';
    if (nota >= 6)   return 'regular';
    return 'reprobado';
  }

  colorAsistencia(pct: number): string {
    if (pct >= 90) return 'excelente';
    if (pct >= 75) return 'bien';
    if (pct >= 60) return 'regular';
    return 'reprobado';
  }

  nombreParcial(n: number): string {
    return ['Primer', 'Segundo', 'Tercer', 'Cuarto'][n - 1] + ' Parcial';
  }

  promedioGeneral(): number | null {
    const conNota = this.materias.filter(m => m.promedio != null);
    if (!conNota.length) return null;
    return parseFloat((conNota.reduce((s, m) => s + m.promedio!, 0) / conNota.length).toFixed(2));
  }

  asistenciaGlobal(): number {
    const totales = this.materias.map(m => m.asistencias);
    const total    = totales.reduce((s, a) => s + a.total, 0);
    const presentes = totales.reduce((s, a) => s + a.presentes, 0);
    return total > 0 ? Math.round((presentes / total) * 100) : 0;
  }

  doRefresh(event: any) {
    this.cargarDatos().then(() => event.target.complete());
  }
}