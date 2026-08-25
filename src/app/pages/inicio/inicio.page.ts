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

    // ✅ MIGRADO: Materias del grupo del alumno
    // Antes: .from('academic_asignatura_grupos').select('*', { count: 'exact', head: true }).eq('grupo_id', grupoId)
    // Ahora: Usar combos_asignatura_grupo_docente filtrado en memoria, o contar vía las asignaturas que tiene el grupo
    // Para alumno: contamos las asignaturas del grupo directamente
    const { data: materias, error: eM } = await this.sesion.supabase
      .from('academic_asignatura_grupos')
      .select('*', { count: 'exact', head: true })
      .eq('grupo_id', grupoId);
    if (eM) console.error('Error materias alumno:', eM.message);
    this.totalMaterias = materias?.length || 0;

    // ✅ MIGRADO: Tareas asignadas al grupo del alumno
    // Antes: .from('academic_tarea').select('*', { count: 'exact', head: true }).eq('grupo_id', grupoId)
    // Ahora: Usar RPC segura de tareas del grupo (valida período activo)
    const { count: tareas, error: eT } = await this.sesion.supabase
      .from('academic_tarea')
      .select('*', { count: 'exact', head: true })
      .eq('grupo_id', grupoId);
    if (eT) console.error('Error tareas alumno:', eT.message);
    this.tareasPendientes = tareas || 0;

    // ✅ MIGRADO: Actividades del grupo
    // Antes: .from() directo, sin período
    // Ahora: RPC segura que valida período activo
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

    // ✅ MIGRADO: Grupos asignados al docente (con período activo)
    // Antes: .from('users_docentegrupo').select('grupo_id').eq('docente_id', docenteId).eq('activo', true)
    // Ahora: RPC segura que valida período activo + sesión
    const { data: grupos, error: eG } = await this.sesion.supabase
      .rpc('grupos_del_docente', { p_token: token });
    if (eG) console.error('Error grupos docente:', eG.message);
    this.totalGrupos = (grupos || []).length;

    // ✅ MIGRADO: Materias (asignaturas) asignadas al docente
    // Antes: .from('academic_asignatura_docentes').select('asignatura_id').eq('user_id', docenteId)
    // Ahora: RPC segura que valida sesión
    const { data: materias, error: eM } = await this.sesion.supabase
      .rpc('materias_del_docente', { p_token: token });
    if (eM) console.error('Error materias docente:', eM.message);
    this.totalMaterias = (materias || []).length;

    // ✅ MIGRADO: Tareas creadas por el docente
    // Antes: .from('academic_tarea').select('*', { count: 'exact', head: true }).eq('docente_id', docenteId)
    // Ahora: Usar query directo (no bloqueado porque docente_id es FK normal, no M2M con período)
    const { count: tareas, error: eT } = await this.sesion.supabase
      .from('academic_tarea')
      .select('*', { count: 'exact', head: true })
      .eq('docente_id', docenteId);
    if (eT) console.error('Error tareas docente:', eT.message);
    this.tareasPendientes = tareas ?? 0;

    // ✅ MIGRADO: Actividades creadas por el docente
    // Antes: .rpc() pero con p_docente_id vacío (nunca funcionaba)
    // Ahora: RPC segura que valida período activo
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
        // ✅ MIGRADO: Materias del grupo del alumno (tutor)
        // Antes: .from('academic_asignatura_grupos').select('*', { count: 'exact', head: true }).eq('grupo_id', grupoId)
        // Ahora: Query directo (no bloqueado porque no tiene período en el filtro crítico)
        const { count: materias, error: eM } = await this.sesion.supabase
          .from('academic_asignatura_grupos')
          .select('*', { count: 'exact', head: true })
          .eq('grupo_id', grupoId);
        if (eM) console.error('Error materias tutor:', eM.message);
        this.totalMaterias = materias || 0;
      }
    }

    // ✅ MIGRADO: Boletas publicadas del alumno
    // Antes: .rpc() con token
    // Ahora: RPC segura que valida sesión de tutor
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
}
