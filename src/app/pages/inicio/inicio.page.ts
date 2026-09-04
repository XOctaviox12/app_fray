import { Component, OnInit } from '@angular/core';
import { SesionService } from '../../services/sesion.service';

@Component({
  standalone: false,
  selector: 'app-inicio',
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
})
export class InicioPage implements OnInit {

  fechaActual: string = '';
  avatarUrl: string = 'assets/img/default-avatar.png';

  cargando = true;
  error    = '';

  tareasPendientes: number = 0;
  totalMaterias: number = 0;
  actividadesHoy: number = 0;

  // Solo docente
  totalGrupos: number = 0;
  actividadesCreadas: number = 0;

  // Solo tutor
  nombreHijo: string = '';

  constructor(private sesion: SesionService) {}

  ngOnInit() {
    this.establecerFechaActual();
    this.avatarUrl = this.sesion.getAvatarUrl();
    this.cargarStats();
  }

  async cargarStats() {
    this.cargando = true;
    this.error    = '';
    try {
      if (this.esTutor) {
        await this.cargarStatsTutor();
      } else if (this.esDocente) {
        await this.cargarStatsDocente();
      } else {
        await this.cargarStatsAlumno();
      }
    } catch (e: any) {
      this.error = 'No se pudieron cargar tus datos: ' + e.message;
    }
    this.cargando = false;
  }

  // ── Alumno ──────────────────────────────────────────
  async cargarStatsAlumno() {
    const alumnoId = this.sesion.usuario?.id;
    if (!alumnoId) return;

    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    if (!token) return;

    const { data: usu, error: eU } = await this.sesion.supabase
      .rpc('perfil_basico_usuario', { p_token: token, p_user_id: alumnoId })
      .single<{ alumno_grupo_id: number }>();
    if (eU) { console.error('Error usuario alumno:', eU.message); return; }

    const grupoId = usu?.alumno_grupo_id;
    if (!grupoId) return;

    // Materias del grupo del alumno
    const { data: materias, error: eM } = await this.sesion.supabase
      .from('academic_asignatura_grupos')
      .select('*', { count: 'exact', head: true })
      .eq('grupo_id', grupoId);
    if (eM) console.error('Error materias alumno:', eM.message);
    this.totalMaterias = materias?.length || 0;

    // Tareas asignadas al grupo del alumno
    const { data: tareaCount, error: eT } = await this.sesion.supabase
      .rpc('contar_tareas_grupo', { p_token: token, p_grupo_id: grupoId });
    if (eT) {
      console.error('Error al contar tareas:', eT.message);
      this.tareasPendientes = 0;
    } else {
      this.tareasPendientes = tareaCount || 0;
    }

    // Actividades del grupo
    const { data: acts, error: eA } = await this.sesion.supabase
      .rpc('contar_actividades_grupo', { p_token: token, p_grupo_id: grupoId });
    if (eA) console.error('Error actividades alumno:', eA.message);
    this.actividadesHoy = acts || 0;
  }

  // ── Docente ──────────────────────────────────────────
  async cargarStatsDocente() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    if (!token) return;

    // Grupos asignados al docente
    const { data: grupos, error: eG } = await this.sesion.supabase
      .rpc('grupos_del_docente', { p_token: token });
    if (eG) console.error('Error grupos docente:', eG.message);
    this.totalGrupos = (grupos || []).length;

    // Materias (asignaturas) asignadas al docente
    const { data: materias, error: eM } = await this.sesion.supabase
      .rpc('materias_del_docente', { p_token: token });
    if (eM) console.error('Error materias docente:', eM.message);
    this.totalMaterias = (materias || []).length;

    // Tareas creadas por el docente
    const { data: tareaCount, error: eT } = await this.sesion.supabase
      .rpc('contar_tareas_docente', { p_token: token, p_docente_id: docenteId });
    if (eT) {
      console.error('Error tareas docente:', eT.message);
      this.tareasPendientes = 0;
    } else {
      this.tareasPendientes = tareaCount || 0;
    }

    // Actividades creadas por el docente
    const { data: acts, error: eA } = await this.sesion.supabase
      .rpc('contar_actividades_docente', { p_token: token, p_docente_id: docenteId });
    if (eA) console.error('Error actividades docente:', eA.message);
    this.actividadesCreadas = acts ?? 0;
  }

  // ── Tutor ──────────────────────────────────────────
  async cargarStatsTutor() {
    const alumnoId = this.sesion.tutor?.alumno_id;
    if (!alumnoId) return;

    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    if (!token) return;

    const { data: alumno, error: eAl } = await this.sesion.supabase
      .rpc('perfil_basico_usuario', { p_token: token, p_user_id: alumnoId })
      .single<{ first_name: string; last_name: string; alumno_grupo_id: number }>();
    if (eAl) { console.error('Error alumno tutor:', eAl.message); return; }

    if (alumno) {
      this.nombreHijo = `${alumno.first_name} ${alumno.last_name}`.trim();

      const grupoId = (alumno as any).alumno_grupo_id;
      if (grupoId) {
        const { count: materias, error: eM } = await this.sesion.supabase
          .from('academic_asignatura_grupos')
          .select('*', { count: 'exact', head: true })
          .eq('grupo_id', grupoId);
        if (eM) console.error('Error materias tutor:', eM.message);
        this.totalMaterias = materias || 0;
      }
    }

    // Boletas publicadas del alumno
    const { data: boletas } = token
      ? await this.sesion.supabase.rpc('boletas_alumno_publicadas', { p_token: token, p_alumno_id: alumnoId })
      : { data: [] as any[] };

    this.actividadesHoy = boletas?.length || 0;
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

  doRefresh(event: any) {
    this.cargarStats().then(() => event.target.complete());
  }

  // ── CORREGIDO: acepta Event y castea a HTMLElement ──
  onEnterPress(event: Event) {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    if (target) {
      target.click();
    }
  }
}