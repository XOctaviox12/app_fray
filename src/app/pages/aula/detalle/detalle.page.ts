import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular';
import { SesionService } from '../../../services/sesion.service';

interface MetricaAsistencia {
  total: number; presentes: number; ausentes: number;
  retardos: number; porcentaje: number;
}

@Component({
  standalone: false,
  selector: 'app-detalle',
  templateUrl: './detalle.page.html',
  styleUrls: ['./detalle.page.scss'],
})
export class DetallePage implements OnInit {

  grupoId!: number;
  asignaturaId: number | null = null;  // si viene, filtra por materia

  grupo: any       = null;
  asignatura: any  = null;  // datos de la materia seleccionada

  cargando = false;
  error: string | null = null;

  asistencia: MetricaAsistencia = { total: 0, presentes: 0, ausentes: 0, retardos: 0, porcentaje: 0 };
  totalAlumnos     = 0;
  totalTareas      = 0;
  tareasEntregadas = 0;
  totalCalificadas = 0;
  promedioNota: number | null = null;

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

  private async cargarGrupo() {
    const { data, error } = await this.sesion.supabase
      .from('academic_grupo')
      .select('id, nombre, grado, aula, capacidad_maxima, plantel_id')
      .eq('id', this.grupoId)
      .single();
    if (error) throw error;
    this.grupo = data;
  }

  private async cargarAsignatura() {
    if (!this.asignaturaId) return;
    const { data } = await this.sesion.supabase
      .from('academic_asignatura')
      .select('id, nombre, clave')
      .eq('id', this.asignaturaId)
      .single();
    this.asignatura = data || null;
  }

  private async cargarAlumnos() {
    const { count } = await this.sesion.supabase
      .from('users_user')
      .select('id', { count: 'exact', head: true })
      .eq('alumno_grupo_id', this.grupoId);
    this.totalAlumnos = count ?? 0;
  }

  private async cargarAsistencia() {
    let query = this.sesion.supabase
      .from('academic_asistencia')
      .select('estado')
      .eq('grupo_id', this.grupoId);

    // Si hay asignatura, filtrar solo esa materia
    if (this.asignaturaId) {
      query = query.eq('asignatura_id', this.asignaturaId);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return;

    const total     = data.length;
    const presentes = data.filter((r: any) => r.estado === 'P').length;
    const ausentes  = data.filter((r: any) => r.estado === 'A').length;
    const retardos  = data.filter((r: any) => r.estado === 'R').length;

    this.asistencia = {
      total, presentes, ausentes, retardos,
      porcentaje: Math.round(((presentes + retardos * 0.5) / total) * 100),
    };
  }

  private async cargarTareas() {
    let query = this.sesion.supabase
      .from('academic_tarea')
      .select('id')
      .eq('grupo_id', this.grupoId)
      .eq('publicada', true);

    if (this.asignaturaId) {
      query = query.eq('asignatura_id', this.asignaturaId);
    }

    const { data: tareas, error: e1 } = await query;
    if (e1) throw e1;
    this.totalTareas = tareas?.length ?? 0;
    if (!this.totalTareas) return;

    const ids = tareas!.map((t: any) => t.id);
    const { count, error: e2 } = await this.sesion.supabase
      .from('academic_entregatarea')
      .select('id', { count: 'exact', head: true })
      .in('tarea_id', ids);
    if (e2) throw e2;
    this.tareasEntregadas = count ?? 0;
  }

  private async cargarPromedio() {
    if (!this.asignaturaId) return;

    const { data } = await this.sesion.supabase
      .from('academic_calificacion')
      .select('nota')
      .eq('grupo_id', this.grupoId)
      .eq('asignatura_id', this.asignaturaId);

    if (!data?.length) return;
    const sum = data.reduce((s: number, r: any) => s + parseFloat(r.nota), 0);
    this.promedioNota = parseFloat((sum / data.length).toFixed(2));
    this.totalCalificadas = data.length;
  }

  doRefresh(event: any) {
    this.cargarTodo().then(() => event.target.complete());
  }
}