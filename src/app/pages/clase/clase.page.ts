import { Component, OnInit, OnDestroy } from '@angular/core';
import { SesionService } from '../../services/sesion.service';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

export type BloqueType = 'texto' | 'pdf' | 'video' | 'actividad' | 'imagen' | 'link';

export interface BloqueClase {
  id?: number;
  sesion_id: number;
  tipo: BloqueType;
  contenido: string;
  orden: number;
  titulo?: string;
  activo: boolean;
  creado_en?: string;
}

export interface SesionClase {
  id?: number;
  docente_id: number;
  grupo_id: number;
  asignatura_id: number;
  titulo: string;
  activa: boolean;
  fecha: string;
  creada_en?: string;
}

@Component({
  standalone: false,
  selector: 'app-clase',
  templateUrl: './clase.page.html',
  styleUrls: ['./clase.page.scss'],
})
export class ClasePage implements OnInit, OnDestroy {

  cargando    = true;
  error: string | null = null;

  sesionActiva: SesionClase | null = null;
  bloques: BloqueClase[] = [];

  // Selector docente
  misGrupos:      any[] = [];
  misAsignaturas: any[] = [];
  grupoSeleccionado:      number | null = null;
  asignaturaSeleccionada: number | null = null;
  tituloSesion = '';

  // Modal bloque
  mostrarModalBloque = false;
  nuevoBloque: Partial<BloqueClase> = { tipo: 'texto', contenido: '', titulo: '', activo: true };
  guardandoBloque = false;

  private canal: RealtimeChannel | null = null;
  private supabase: SupabaseClient;

  // IDs de asignaturas que imparte el docente (todas sus materias)
  private asignaturasDocente: number[] = [];

  constructor(public sesion: SesionService) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  ngOnInit()    { this.inicializar(); }
  ngOnDestroy() { this.desuscribir(); }

  async inicializar() {
    this.cargando = true;
    if (this.esDocente) {
      await this.cargarGruposDocente();
      await this.buscarSesionActivaDocente();
    } else {
      await this.buscarSesionActivaAlumno();
    }
    this.cargando = false;
  }

  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esAlumno():  boolean { return this.sesion.esAlumno(); }

  // ═══════════════════════════════════════════════════
  //  DOCENTE — grupos y asignaturas
  // ═══════════════════════════════════════════════════

  async cargarGruposDocente() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    // 1. Grupos asignados al docente
    const { data: relGrupos } = await this.supabase
      .from('academic_grupo_docentes')
      .select('grupo_id')
      .eq('user_id', docenteId);

    if (!relGrupos?.length) return;

    const grupoIds = relGrupos.map((r: any) => r.grupo_id);

    const { data: grupos } = await this.supabase
      .from('academic_grupo')
      .select('id, nombre, grado')
      .in('id', grupoIds)
      .order('grado');

    this.misGrupos = grupos || [];

    // 2. Todas las asignaturas que imparte este docente (IDs)
    const { data: relAsig } = await this.supabase
      .from('academic_asignatura_docentes')
      .select('asignatura_id')
      .eq('user_id', docenteId);

    this.asignaturasDocente = (relAsig || []).map((r: any) => r.asignatura_id);
  }

  async onGrupoChange() {
    this.asignaturaSeleccionada = null;
    this.misAsignaturas = [];

    if (!this.grupoSeleccionado || !this.asignaturasDocente.length) return;

    // Asignaturas del grupo seleccionado que el docente imparte
    // Cruce: asignaturas del grupo ∩ asignaturas del docente
    const { data: relGrupo } = await this.supabase
      .from('academic_asignatura_grupos')
      .select('asignatura_id')
      .eq('grupo_id', this.grupoSeleccionado);

    const asigGrupo = (relGrupo || []).map((r: any) => r.asignatura_id);

    // Intersección
    const asigFiltradas = asigGrupo.filter((id: number) =>
      this.asignaturasDocente.includes(id)
    );

    if (!asigFiltradas.length) {
      this.misAsignaturas = [];
      return;
    }

    const { data: asignaturas } = await this.supabase
      .from('academic_asignatura')
      .select('id, nombre, clave')
      .in('id', asigFiltradas)
      .order('nombre');

    this.misAsignaturas = asignaturas || [];
  }

  // ═══════════════════════════════════════════════════
  //  SESIÓN ACTIVA
  // ═══════════════════════════════════════════════════

  async buscarSesionActivaDocente() {
    const docenteId = this.sesion.usuario?.id;
    const { data } = await this.supabase
      .from('academic_sesionclase')
      .select('*')
      .eq('docente_id', docenteId)
      .eq('activa', true)
      .order('creada_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      this.sesionActiva = data;
      await this.cargarBloques();
      this.suscribirRealtime();
    }
  }

  async buscarSesionActivaAlumno() {
    const alumnoId = this.sesion.usuario?.id;

    const { data: usu } = await this.supabase
      .from('users_user')
      .select('alumno_grupo_id')
      .eq('id', alumnoId)
      .single();

    const grupoId = (usu as any)?.alumno_grupo_id;
    if (!grupoId) { this.error = 'No tienes grupo asignado.'; return; }

    const { data } = await this.supabase
      .from('academic_sesionclase')
      .select('*')
      .eq('grupo_id', grupoId)
      .eq('activa', true)
      .order('creada_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      this.sesionActiva = data;
      await this.cargarBloques();
      this.suscribirRealtime();
    }
  }

  // ═══════════════════════════════════════════════════
  //  INICIAR / TERMINAR
  // ═══════════════════════════════════════════════════

  async iniciarSesion() {
    if (!this.grupoSeleccionado || !this.asignaturaSeleccionada || !this.tituloSesion.trim()) return;

    const nueva: SesionClase = {
      docente_id:    this.sesion.usuario!.id,
      grupo_id:      this.grupoSeleccionado,
      asignatura_id: this.asignaturaSeleccionada,
      titulo:        this.tituloSesion.trim(),
      activa:        true,
      fecha:         new Date().toISOString().split('T')[0],
    };

    const { data, error } = await this.supabase
      .from('academic_sesionclase')
      .insert(nueva)
      .select()
      .single();

    if (error) { console.error(error); return; }

    this.sesionActiva = data;
    this.bloques = [];
    this.suscribirRealtime();
  }

  async terminarSesion() {
    if (!this.sesionActiva?.id) return;
    await this.supabase
      .from('academic_sesionclase')
      .update({ activa: false })
      .eq('id', this.sesionActiva.id);

    this.desuscribir();
    this.sesionActiva = null;
    this.bloques = [];
    this.tituloSesion = '';
    this.grupoSeleccionado = null;
    this.asignaturaSeleccionada = null;
    this.misAsignaturas = [];
  }

  // ═══════════════════════════════════════════════════
  //  BLOQUES
  // ═══════════════════════════════════════════════════

  async cargarBloques() {
    if (!this.sesionActiva?.id) return;
    const { data } = await this.supabase
      .from('academic_bloqueclase')
      .select('*')
      .eq('sesion_id', this.sesionActiva.id)
      .eq('activo', true)
      .order('orden');

    this.bloques = data || [];
  }

  abrirModalBloque(tipo: BloqueType = 'texto') {
    this.nuevoBloque = {
      tipo,
      contenido: '',
      titulo: '',
      activo: true,
      orden: this.bloques.length + 1,
      sesion_id: this.sesionActiva!.id!,
    };
    this.mostrarModalBloque = true;
  }

  cerrarModal() { this.mostrarModalBloque = false; }

  async guardarBloque() {
    if (!this.nuevoBloque.contenido?.trim() && this.nuevoBloque.tipo !== 'actividad') return;
    this.guardandoBloque = true;

    const { error } = await this.supabase
      .from('academic_bloqueclase')
      .insert({ ...this.nuevoBloque });

    this.guardandoBloque = false;
    if (!error) {
      this.mostrarModalBloque = false;
      await this.cargarBloques();
    } else {
      console.error('Error guardando bloque:', error.message);
    }
  }

  async eliminarBloque(bloque: BloqueClase) {
    await this.supabase
      .from('academic_bloqueclase')
      .update({ activo: false })
      .eq('id', bloque.id!);
    this.bloques = this.bloques.filter(b => b.id !== bloque.id);
  }

  // ═══════════════════════════════════════════════════
  //  REALTIME
  // ═══════════════════════════════════════════════════

  suscribirRealtime() {
    if (!this.sesionActiva?.id) return;
    this.desuscribir();

    this.canal = this.supabase
      .channel(`clase-${this.sesionActiva.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'academic_bloqueclase',
        filter: `sesion_id=eq.${this.sesionActiva.id}`,
      }, () => { this.cargarBloques(); })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'academic_sesionclase',
        filter: `id=eq.${this.sesionActiva!.id}`,
      }, (payload: any) => {
        if (!payload.new?.activa) {
          this.sesionActiva = null;
          this.bloques = [];
          this.desuscribir();
        }
      })
      .subscribe();
  }

  desuscribir() {
    if (this.canal) {
      this.supabase.removeChannel(this.canal);
      this.canal = null;
    }
  }

  // ═══════════════════════════════════════════════════
  //  HELPERS UI
  // ═══════════════════════════════════════════════════

  iconoBloque(tipo: BloqueType): string {
    const map: Record<BloqueType, string> = {
      texto: 'document-text-outline', pdf: 'document-outline',
      video: 'videocam-outline', actividad: 'checkmark-done-outline',
      imagen: 'image-outline', link: 'link-outline',
    };
    return map[tipo] ?? 'cube-outline';
  }

  etiquetaTipo(tipo: BloqueType): string {
    const map: Record<BloqueType, string> = {
      texto: 'Texto', pdf: 'PDF', video: 'Video',
      actividad: 'Actividad', imagen: 'Imagen', link: 'Enlace',
    };
    return map[tipo] ?? tipo;
  }

  esYoutube(url: string): boolean {
    return url?.includes('youtube.com') || url?.includes('youtu.be');
  }

  youtubeEmbed(url: string): string {
    if (url.includes('youtu.be/')) {
      return `https://www.youtube.com/embed/${url.split('youtu.be/')[1].split('?')[0]}`;
    }
    if (url.includes('v=')) {
      return `https://www.youtube.com/embed/${url.split('v=')[1].split('&')[0]}`;
    }
    return url;
  }

  trackBloque(_: number, b: BloqueClase) { return b.id; }

  // Label para el select de asignaturas
  getLabelAsignatura(a: any): string {
    return a.clave ? `${a.nombre} (${a.clave})` : a.nombre;
  }
}
