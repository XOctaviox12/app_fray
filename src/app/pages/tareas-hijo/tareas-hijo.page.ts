import { Component, OnInit } from '@angular/core';
import { SesionService } from '../../services/sesion.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

export interface TareaHijo {
  id: number;
  titulo: string;
  descripcion: string;
  fecha_entrega: string;
  asignatura: string;
  docente: string;
  publicada: boolean;
  vencida: boolean;
  entrega: {
    estado: string;       // PENDIENTE | ENTREGADA | CALIFICADA | TARDE
    calificacion: number | null;
    feedback: string;
    entregada_en: string | null;
  } | null;
}

@Component({
  standalone: false,
  selector: 'app-tareas-hijo',
  templateUrl: './tareas-hijo.page.html',
  styleUrls: ['./tareas-hijo.page.scss'],
})
export class TareasHijoPage implements OnInit {

  private supabase: SupabaseClient;

  cargando = true;
  error = '';

  tareas: TareaHijo[] = [];
  // Se agrega 'TARDE' y 'NO_ENTREGADA' como filtros seleccionables
  filtro: 'TODAS' | 'PENDIENTE' | 'ENTREGADA' | 'CALIFICADA' | 'TARDE' | 'NO_ENTREGADA' = 'TODAS';

  alumnoNombre = '';

  // ── Detalle expandible ──
  expandidoId: number | null = null;

  // ── Paginación ──
  pageSize = 10;
  paginaActual = 1;

  constructor(private sesion: SesionService) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  ngOnInit() {
    this.cargarTareas();
  }

  async cargarTareas() {
    this.cargando = true;
    this.error = '';
    this.paginaActual = 1;
    this.expandidoId = null;

    const alumnoId = this.sesion.tutor?.alumno_id;
    if (!alumnoId) {
      this.error = 'No se encontró información del alumno.';
      this.cargando = false;
      return;
    }

    try {
      // Datos del alumno
      const { data: alumno } = await this.supabase
        .from('users_user')
        .select('first_name, last_name, alumno_grupo_id')
        .eq('id', alumnoId)
        .single();

      if (alumno) {
        this.alumnoNombre = `${(alumno as any).first_name} ${(alumno as any).last_name}`.trim();
      }

      const grupoId = (alumno as any)?.alumno_grupo_id;
      if (!grupoId) {
        this.cargando = false;
        return;
      }

      // Tareas publicadas del grupo del alumno
      const { data: tareasData, error: tareasErr } = await this.supabase
        .from('academic_tarea')
        .select(`
          id, titulo, descripcion, fecha_entrega, publicada,
          asignatura:asignatura_id ( nombre ),
          docente:docente_id ( first_name, last_name )
        `)
        .eq('grupo_id', grupoId)
        .eq('publicada', true)
        .order('fecha_entrega', { ascending: true });

      if (tareasErr) throw new Error(tareasErr.message);

      // Entregas del alumno
      const { data: entregasData } = await this.supabase
        .from('academic_entregatarea')
        .select('tarea_id, estado, calificacion, feedback, entregada_en')
        .eq('alumno_id', alumnoId);

      const entregasMap: Record<number, any> = {};
      (entregasData || []).forEach((e: any) => {
        entregasMap[e.tarea_id] = e;
      });

      const ahora = new Date();

      this.tareas = (tareasData || []).map((t: any) => {
        const entrega = entregasMap[t.id] || null;
        const vencida = new Date(t.fecha_entrega) < ahora;

        return {
          id:          t.id,
          titulo:      t.titulo,
          descripcion: t.descripcion || '',
          fecha_entrega: t.fecha_entrega,
          asignatura:  t.asignatura?.nombre || '—',
          docente:     `${t.docente?.first_name || ''} ${t.docente?.last_name || ''}`.trim(),
          publicada:   t.publicada,
          vencida,
          entrega: entrega ? {
            estado:       entrega.estado,
            calificacion: entrega.calificacion != null ? parseFloat(entrega.calificacion) : null,
            feedback:     entrega.feedback || '',
            entregada_en: entrega.entregada_en,
          } : null,
        } as TareaHijo;
      });

    } catch (e: any) {
      this.error = 'Error al cargar tareas: ' + e.message;
    }

    this.cargando = false;
  }

  // ── Filtros ──────────────────────────────
  // 'NO_ENTREGADA' = vencida sin entrega (antes se contaba mal dentro de PENDIENTE)
  get tareasFiltradas(): TareaHijo[] {
    if (this.filtro === 'TODAS') return this.tareas;
    if (this.filtro === 'PENDIENTE') {
      return this.tareas.filter(t => !t.vencida && (!t.entrega || t.entrega.estado === 'PENDIENTE'));
    }
    if (this.filtro === 'NO_ENTREGADA') {
      return this.tareas.filter(t => t.vencida && !t.entrega);
    }
    return this.tareas.filter(t => t.entrega?.estado === this.filtro);
  }

  // ── Paginación ───────────────────────────
  get tareasPaginadas(): TareaHijo[] {
    return this.tareasFiltradas.slice(0, this.pageSize * this.paginaActual);
  }

  get hayMasPorCargar(): boolean {
    return this.tareasPaginadas.length < this.tareasFiltradas.length;
  }

  cargarMas() {
    this.paginaActual++;
  }

  cambiarFiltro(f: typeof this.filtro) {
    this.filtro = f;
    this.paginaActual = 1;
  }

  // ── Detalle expandible ───────────────────
  toggleDetalle(id: number) {
    this.expandidoId = this.expandidoId === id ? null : id;
  }

  // ── Contadores ───────────────────────────
  get totalPendientes(): number {
    return this.tareas.filter(t => !t.vencida && (!t.entrega || t.entrega.estado === 'PENDIENTE')).length;
  }
  get totalNoEntregadas(): number {
    return this.tareas.filter(t => t.vencida && !t.entrega).length;
  }
  get totalEntregadas(): number {
    return this.tareas.filter(t => t.entrega?.estado === 'ENTREGADA').length;
  }
  get totalCalificadas(): number {
    return this.tareas.filter(t => t.entrega?.estado === 'CALIFICADA').length;
  }
  get totalTarde(): number {
    return this.tareas.filter(t => t.entrega?.estado === 'TARDE').length;
  }

  // ── Helpers visuales ─────────────────────
  getEstadoLabel(t: TareaHijo): string {
    if (!t.entrega) return t.vencida ? 'No entregada' : 'Pendiente';
    const map: Record<string, string> = {
      PENDIENTE:  'Pendiente',
      ENTREGADA:  'Entregada',
      CALIFICADA: 'Calificada',
      TARDE:      'Entrega tardía',
    };
    return map[t.entrega.estado] || t.entrega.estado;
  }

  getEstadoClass(t: TareaHijo): string {
    if (!t.entrega) return t.vencida ? 'no-entregada' : 'pendiente';
    const map: Record<string, string> = {
      PENDIENTE:  'pendiente',
      ENTREGADA:  'entregada',
      CALIFICADA: 'calificada',
      TARDE:      'tarde',
    };
    return map[t.entrega.estado] || 'pendiente';
  }

  getEstadoIcon(t: TareaHijo): string {
    if (!t.entrega) return t.vencida ? 'close-circle-outline' : 'time-outline';
    const map: Record<string, string> = {
      PENDIENTE:  'time-outline',
      ENTREGADA:  'checkmark-circle-outline',
      CALIFICADA: 'ribbon-outline',
      TARDE:      'alert-circle-outline',
    };
    return map[t.entrega.estado] || 'time-outline';
  }

  colorNota(nota: number): string {
    if (nota >= 9)  return 'excelente';
    if (nota >= 7)  return 'bien';
    if (nota >= 6)  return 'regular';
    return 'reprobado';
  }

  formatFecha(fecha: string): string {
    const d = new Date(fecha);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  diasRestantes(fecha: string): string {
    const d    = new Date(fecha);
    const ahora = new Date();
    const diff  = Math.ceil((d.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0)  return `Venció hace ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? 's' : ''}`;
    if (diff === 0) return 'Vence hoy';
    if (diff === 1) return 'Vence mañana';
    return `${diff} días restantes`;
  }

  esCritica(t: TareaHijo): boolean {
    if (t.entrega) return false;
    const d    = new Date(t.fecha_entrega);
    const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff <= 2 && diff >= 0;
  }

  doRefresh(event: any) {
    this.cargarTareas().then(() => event.target.complete());
  }
}
