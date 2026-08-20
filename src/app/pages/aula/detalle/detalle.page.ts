import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular';
import { SesionService } from '../../../services/sesion.service';

interface MetricaAsistencia {
  total: number;
  presentes: number;
  ausentes: number;
  retardos: number;
  porcentaje: number;
}

interface AlumnoGrupo {
  id: number;
  numero: number;
  nombre: string;
  apellido: string;
  foto: string | null;
}

@Component({
  standalone: false,
  selector: 'app-detalle',
  templateUrl: './detalle.page.html',
  styleUrls: ['./detalle.page.scss'],
})
export class DetallePage implements OnInit {

  grupoId!: number;
  asignaturaId: number | null = null;

  grupo: any       = null;
  asignatura: any  = null;

  cargando = false;
  error: string | null = null;

  asistencia: MetricaAsistencia = { total: 0, presentes: 0, ausentes: 0, retardos: 0, porcentaje: 0 };
  alumnos: AlumnoGrupo[] = [];
  totalAlumnos     = 0;
  totalTareas      = 0;
  tareasEntregadas = 0;
  totalCalificadas = 0;
  promedioNota: number | null = null;

  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esAlumno():  boolean { return this.sesion.esAlumno();  }
  get esTutor():   boolean { return this.sesion.esTutor();   }

  get porcentajeColor(): string {
    if (this.asistencia.porcentaje >= 85) return 'verde';
    if (this.asistencia.porcentaje >= 70) return 'naranja';
    return 'rojo';
  }

  get porcentajeEntregas(): number {
    if (!this.totalTareas) return 0;
    return Math.round((this.tareasEntregadas / this.totalTareas) * 100);
  }

  get colorPromedio(): string {
    if (!this.promedioNota) return 'gray';
    if (this.promedioNota >= 9)  return 'verde';
    if (this.promedioNota >= 7)  return 'naranja';
    return 'rojo';
  }

  constructor(
    private route: ActivatedRoute,
    private navCtrl: NavController,
    private sesion: SesionService
  ) {}

  ngOnInit() {
    this.grupoId      = Number(this.route.snapshot.paramMap.get('id'));
    const asigParam   = this.route.snapshot.queryParamMap.get('asignatura');
    this.asignaturaId = asigParam ? Number(asigParam) : null;
    this.cargarTodo();
  }

  volver() { this.navCtrl.back(); }

  async cargarTodo() {
    this.cargando = true;
    this.error    = null;
    try {
      const autorizado = await this.validarAcceso();
      if (!autorizado) {
        this.error = 'No tienes acceso a la información de este grupo.';
        return;
      }

      await Promise.all([
        this.cargarGrupo(),
        this.cargarAsignatura(),
        this.cargarAlumnos(),
        this.cargarAsistencia(),
        this.cargarTareas(),
        this.cargarPromedio(),
      ]);
    } catch (err: any) {
      console.error('Detalle error:', err.message);
      this.error = 'No se pudieron cargar las métricas.';
    } finally {
      this.cargando = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // VALIDACIÓN DE ACCESO
  // ═══════════════════════════════════════════════════════════════════════════════════
  private async validarAcceso(): Promise<boolean> {
    const userId = this.sesion.usuario?.id;
    if (!userId || !this.grupoId) return false;

    if (this.esDocente) {
      const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
      const { data: relGrupo } = await this.sesion.supabase
        .rpc('validar_acceso_docente_aula', { p_token: token, p_docente_id: userId, p_grupo_id: this.grupoId, p_asignatura_id: this.asignaturaId || null });
      if (!relGrupo) return false;

      // Si viene materia específica, confirmar que el docente la imparte
      if (this.asignaturaId) {
        const { data: relAsigDocente } = await this.sesion.supabase
          .from('academic_asignatura_docentes')
          .select('asignatura_id')
          .eq('user_id', userId)
          .eq('asignatura_id', this.asignaturaId)
          .maybeSingle();
        if (!relAsigDocente) return false;

        const { data: relAsigGrupo } = await this.sesion.supabase
          .from('academic_asignatura_grupos')
          .select('asignatura_id')
          .eq('asignatura_id', this.asignaturaId)
          .eq('grupo_id', this.grupoId)
          .maybeSingle();
        if (!relAsigGrupo) return false;
      }

      return true;
    }

    if (this.esAlumno) {
      const token = this.sesion.usuario?.token;
      const { data: usu } = await this.sesion.supabase
        .rpc('perfil_basico_usuario', { p_token: token, p_user_id: userId }).single();
      return (usu as any)?.alumno_grupo_id === this.grupoId;
    }

    if (this.esTutor) {
      const alumnoId = this.sesion.tutor?.alumno_id;
      if (!alumnoId) return false;

      const token = this.sesion.tutor?.token;
      const { data: alumno } = await this.sesion.supabase
        .rpc('perfil_basico_usuario', { p_token: token, p_user_id: alumnoId }).single();
      return (alumno as any)?.alumno_grupo_id === this.grupoId;
    }

    return false;
  }

private async cargarGrupo() {
  const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
  if (!token) return;

  const { data, error } = await this.sesion.supabase
    .rpc('leer_grupo_por_id', { p_token: token, p_grupo_id: this.grupoId })
    .single();
  if (error) throw error;
  this.grupo = data;
}

private async cargarAsignatura() {
  if (!this.asignaturaId) return;
  const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
  if (!token) return;

  const { data, error } = await this.sesion.supabase
    .rpc('nombres_asignaturas', { p_token: token, p_ids: [this.asignaturaId] });

  if (error) { console.error('Error obteniendo asignatura:', error.message); return; }
  this.asignatura = (data && data[0]) || null;
}

  private async cargarAlumnos() {
    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    const { data, error } = token
      ? await this.sesion.supabase.rpc('roster_grupo', { p_token: token, p_grupo_id: this.grupoId })
      : { data: [] as any[], error: null };
    if (error) throw error;

    this.alumnos = (data || []).map((u: any, i: number) => ({
      id: u.id,
      numero: i + 1,
      nombre: u.first_name || '',
      apellido: u.last_name || '',
      foto: u.foto_perfil,
    }));
    this.totalAlumnos = this.alumnos.length;
  }

  iniciales(alumno: AlumnoGrupo): string {
    const n = alumno.nombre?.charAt(0) || '';
    const a = alumno.apellido?.charAt(0) || '';
    return (n + a).toUpperCase() || '?';
  }

  private async cargarAsistencia() {
    const token = this.sesion.usuario?.token;
    if (!token) return;

    const { data } = await this.sesion.supabase.rpc('resumen_asistencia_grupo', {
      p_token: token,
      p_grupo_id: this.grupoId,
      p_materia_id: this.asignaturaId || null,
    });

    if (!data || data.length === 0) {
      this.asistencia = { total: 0, presentes: 0, ausentes: 0, retardos: 0, porcentaje: 0 };
      return;
    }

    const total     = data.length;
    const presentes = data.filter((r: any) => r.estado === 'P').length;
    const ausentes  = data.filter((r: any) => r.estado === 'A').length;
    const retardos  = data.filter((r: any) => r.estado === 'R').length;

    this.asistencia = {
      total,
      presentes,
      ausentes,
      retardos,
      porcentaje: total > 0 ? Math.round(((presentes + retardos * 0.5) / total) * 100) : 0,
    };
  }

 private async cargarTareas() {
  const token = this.sesion.usuario?.token;
  if (!token) return;

  const { data: tareas, error: e1 } = await this.sesion.supabase
    .rpc('leer_tareas_grupo_completo', { p_token: token, p_grupo_id: this.grupoId });

  if (e1) throw e1;

  const todas = tareas || [];
  const filtradas = this.asignaturaId
    ? todas.filter((t: any) => t.asignatura_id === this.asignaturaId)
    : todas;

  this.totalTareas = filtradas.length;

  if (!this.totalTareas) {
    this.tareasEntregadas = 0;
    return;
  }

  const ids = filtradas.map((t: any) => t.id);

  const { data: entregas, error: e2 } = await this.sesion.supabase
    .rpc('contar_entregas_de_tareas', { p_token: token, p_tarea_ids: ids });

  if (e2) throw e2;
  this.tareasEntregadas = (entregas || []).reduce((sum: number, e: any) => sum + e.total, 0);
}

  private async cargarPromedio() {
    if (!this.asignaturaId) return;

    const token = this.sesion.usuario?.token;
    if (!token) return;

    const { data, error } = await this.sesion.supabase
      .rpc('obtener_promedio_calificaciones', {
        p_token: token,
        p_grupo_id: this.grupoId,
        p_asignatura_id: this.asignaturaId,
      })
      .single<{ promedio: number; total: number }>();

    if (error) {
      console.error('Error obteniendo promedio:', error?.message);
      return;
    }

    if (data) {
      this.promedioNota = data.promedio ?? 0;
      this.totalCalificadas = data.total ?? 0;
    }
  }

  doRefresh(event: any) {
    this.cargarTodo().then(() => event.target.complete());
  }
}
