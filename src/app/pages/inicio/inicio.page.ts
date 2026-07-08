import { Component, OnInit } from '@angular/core';
import { SesionService } from '../../services/sesion.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

@Component({
  standalone: false,
  selector: 'app-inicio',
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
})
export class InicioPage implements OnInit {

  fechaActual: string = '';
  avatarUrl: string = 'assets/img/default-avatar.png';

  tareasPendientes: number = 0;
  totalMaterias: number = 0;
  actividadesHoy: number = 0;

  // Solo docente
  totalGrupos: number = 0;
  actividadesCreadas: number = 0;

  // Solo tutor
  nombreHijo: string = '';

  private supabase: SupabaseClient;

  constructor(private sesion: SesionService) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  ngOnInit() {
    this.establecerFechaActual();
    this.avatarUrl = this.sesion.getAvatarUrl();
    this.cargarStats();
  }

  async cargarStats() {
    if (this.esTutor) {
      await this.cargarStatsTutor();
    } else if (this.esDocente) {
      await this.cargarStatsDocente();
    } else {
      await this.cargarStatsAlumno();
    }
  }

  // ── Alumno ──────────────────────────────────
  async cargarStatsAlumno() {
    const alumnoId = this.sesion.usuario?.id;
    if (!alumnoId) return;

    const { data: usu } = await this.supabase
      .from('users_user')
      .select('alumno_grupo_id')
      .eq('id', alumnoId)
      .single();

    const grupoId = (usu as any)?.alumno_grupo_id;
    if (!grupoId) return;

    const { count: materias } = await this.supabase
      .from('academic_asignatura_grupos')
      .select('*', { count: 'exact', head: true })
      .eq('grupo_id', grupoId);

    this.totalMaterias = materias || 0;
  }

  // ── Docente ──────────────────────────────────
  // Tablas M2M generadas por Django:
  //   academic_grupo_docentes     → grupo_id, user_id
  //   academic_asignatura_docentes → asignatura_id, user_id
  // Nota: Django usa "user_id" en M2M de AUTH_USER_MODEL, no "docente_id"
  async cargarStatsDocente() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    // Grupos asignados al docente
    const { data: grupos, error: eG } = await this.supabase
      .from('academic_grupo_docentes')
      .select('grupo_id')
      .eq('user_id', docenteId);

    if (eG) console.error('Error grupos docente:', eG.message);
    this.totalGrupos = grupos?.length ?? 0;

    // Materias (asignaturas) asignadas al docente
    const { data: materias, error: eM } = await this.supabase
      .from('academic_asignatura_docentes')
      .select('asignatura_id')
      .eq('user_id', docenteId);

    if (eM) console.error('Error materias docente:', eM.message);
    this.totalMaterias = materias?.length ?? 0;

    // Tareas creadas por el docente (FK normal: docente_id)
    const { count: tareas, error: eT } = await this.supabase
      .from('academic_tarea')
      .select('*', { count: 'exact', head: true })
      .eq('docente_id', docenteId);

    if (eT) console.error('Error tareas docente:', eT.message);
    this.tareasPendientes = tareas ?? 0;

    // Actividades creadas por el docente
    const { count: acts, error: eA } = await this.supabase
      .from('academic_actividad')
      .select('*', { count: 'exact', head: true })
      .eq('docente_id', docenteId);

    if (eA) console.error('Error actividades docente:', eA.message);
    this.actividadesCreadas = acts ?? 0;
  }

  // ── Tutor ────────────────────────────────────
  async cargarStatsTutor() {
    const alumnoId = this.sesion.tutor?.alumno_id;
    if (!alumnoId) return;

    const { data: alumno } = await this.supabase
      .from('users_user')
      .select('first_name, last_name, alumno_grupo_id')
      .eq('id', alumnoId)
      .single();

    if (alumno) {
      this.nombreHijo = `${(alumno as any).first_name} ${(alumno as any).last_name}`.trim();

      const grupoId = (alumno as any).alumno_grupo_id;
      if (grupoId) {
        const { count: materias } = await this.supabase
          .from('academic_asignatura_grupos')
          .select('*', { count: 'exact', head: true })
          .eq('grupo_id', grupoId);

        this.totalMaterias = materias || 0;
      }
    }

    const { count: boletas } = await this.supabase
      .from('academic_boletaparcial')
      .select('*', { count: 'exact', head: true })
      .eq('alumno_id', alumnoId)
      .eq('publicada', true);

    this.actividadesHoy = boletas || 0;
  }

  establecerFechaActual() {
    const hoy = new Date();
    const opciones: Intl.DateTimeFormatOptions = {
      weekday: 'long', day: 'numeric', month: 'long'
    };
    this.fechaActual = hoy.toLocaleDateString('es-ES', opciones);
    this.fechaActual = this.fechaActual.charAt(0).toUpperCase() + this.fechaActual.slice(1);
  }

  getNombre(): string {
    if (this.esTutor) return this.sesion.tutor?.nombre?.split(' ')[0] || 'Tutor';
    return this.sesion.getNombreDisplay()?.split(' ')[0] || 'Bienvenido';
  }

  get esTutor(): boolean   { return this.sesion.esTutor(); }
  get esDocente(): boolean { return this.sesion.esDocente(); }

  onErrorImagen() {
    this.avatarUrl = 'assets/img/default-avatar.png';
  }
}