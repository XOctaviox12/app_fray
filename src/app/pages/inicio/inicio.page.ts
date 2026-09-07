import { Component, OnInit } from '@angular/core';
import { SesionService } from '../../services/sesion.service';


interface AlumnoStats {
  alumno_id: number;
  alumno_username: string;
  alumno_first_name: string;
  alumno_last_name: string;
  grupo_nombre: string;
  totalMaterias: number;
  tareasPendientes: number;
  actividadesHoy: number;
  boletasPublicadas: number;
}

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
  alumnosStats: AlumnoStats[] = [];

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
  const tutorId = this.sesion.tutor?.id;
  if (!tutorId) {
    this.error = 'ID de tutor no encontrado.';
    return;
  }

  // ⚠️ CRÍTICO: Usar token del tutor, NO del usuario
  const token = this.sesion.tutor?.token;
  if (!token) {
    this.error = 'No hay sesión de tutor activa.';
    console.error('tutor?.token no definido. Verifica SesionService.');
    return;
  }

  try {
    console.log('🔍 Buscando alumnos del tutor...', { tutorId, token });

    // ✅ PASO 1: Obtener TODOS los alumnos asignados
    const { data: alumnos, error: eAlumnos } = await this.sesion.supabase
      .rpc('obtener_alumnos_tutor', { p_token: token });

    if (eAlumnos) {
      console.error('❌ Error al obtener alumnos:', eAlumnos.message);
      this.error = 'Error al obtener tus alumnos: ' + eAlumnos.message;
      return;
    }

    if (!alumnos || alumnos.length === 0) {
      console.warn('⚠️ El tutor no tiene alumnos asignados.');
      this.alumnosStats = [];
      this.error = 'No tienes alumnos asignados.';
      return;
    }

    console.log('✅ Alumnos encontrados:', alumnos);

    // ✅ PASO 2: Para CADA alumno, cargar sus estadísticas (en paralelo)
    this.alumnosStats = [];

    for (const alumno of alumnos) {
      try {
        console.log(`📊 Cargando stats de: ${alumno.alumno_first_name}`);

        // Llamar todas las RPCs en paralelo
        const [tareas, actividades, materias, boletas] = await Promise.all([
          this.sesion.supabase.rpc('contar_tareas_alumno', {
            p_token: token,
            p_alumno_id: alumno.alumno_id
          }),
          this.sesion.supabase.rpc('contar_actividades_alumno', {
            p_token: token,
            p_alumno_id: alumno.alumno_id
          }),
          this.sesion.supabase.rpc('obtener_materias_alumno', {
            p_token: token,
            p_alumno_id: alumno.alumno_id
          }),
          this.sesion.supabase.rpc('contar_boletas_alumno', {
            p_token: token,
            p_alumno_id: alumno.alumno_id
          })
        ]);

        const stats: AlumnoStats = {
          alumno_id: alumno.alumno_id,
          alumno_username: alumno.alumno_username,
          alumno_first_name: alumno.alumno_first_name,
          alumno_last_name: alumno.alumno_last_name,
          grupo_nombre: alumno.grupo_nombre || 'Sin grupo',
          tareasPendientes: tareas.data || 0,
          actividadesHoy: actividades.data || 0,
          totalMaterias: materias.data || 0,
          boletasPublicadas: boletas.data || 0,
        };

        console.log(`✅ Stats cargados para ${stats.alumno_first_name}:`, stats);
        this.alumnosStats.push(stats);

      } catch (e: any) {
        console.error(`❌ Error cargando stats de ${alumno.alumno_id}:`, e);
        this.alumnosStats.push({
          alumno_id: alumno.alumno_id,
          alumno_username: alumno.alumno_username,
          alumno_first_name: alumno.alumno_first_name,
          alumno_last_name: alumno.alumno_last_name,
          grupo_nombre: alumno.grupo_nombre || 'Sin grupo',
          tareasPendientes: 0,
          actividadesHoy: 0,
          totalMaterias: 0,
          boletasPublicadas: 0,
        });
      }
    }

    console.log('✅ Todos los alumnos cargados:', this.alumnosStats);

  } catch (e: any) {
    console.error('❌ Error en cargarStatsTutor():', e);
    this.error = 'Error: ' + e.message;
  }
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
  getTotalBoletas(): number {
  if (!this.alumnosStats || this.alumnosStats.length === 0) {
    return 0;
  }

  return this.alumnosStats.reduce((sum, alumno) => sum + alumno.boletasPublicadas, 0);
}
}
