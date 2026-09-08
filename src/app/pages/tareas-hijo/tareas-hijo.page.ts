import { Component, OnInit } from '@angular/core';
import { SesionService } from '../../services/sesion.service';

export interface ItemAcademico {
  id: number;
  tipo: 'TAREA' | 'ACTIVIDAD';
  alumno_id: number;
  alumno_nombre: string;
  titulo: string;
  descripcion: string;
  fecha_entrega: string;
  asignatura: string;
  docente: string;
  publicada: boolean;
  vencida: boolean;
  entrega: {
    estado: string;       
    calificacion: number | null;
    feedback: string;
    entregada_en: string | null;
  } | null;
}

interface HijoResumen {
  alumno_id: number;
  nombre: string;
}

@Component({
  standalone: false,
  selector: 'app-tareas-hijo',
  templateUrl: './tareas-hijo.page.html',
  styleUrls: ['./tareas-hijo.page.scss'],
})
export class TareasHijoPage implements OnInit {

  cargando = true;
  error = '';


  hijos: HijoResumen[] = [];
  hijoSeleccionado: number | 'TODOS' = 'TODOS';

  vista: 'TAREAS' | 'ACTIVIDADES' = 'TAREAS';

  tareas: ItemAcademico[] = [];
  actividades: ItemAcademico[] = [];

  filtro: 'TODAS' | 'PENDIENTE' | 'ENTREGADA' | 'CALIFICADA' | 'TARDE' | 'NO_ENTREGADA' = 'TODAS';

  expandidoId: number | null = null;

  pageSize = 10;
  paginaActual = 1;

  constructor(private sesion: SesionService) {}

  ngOnInit() {
    this.cargarTodo();
  }

  async cargarTodo() {
    this.cargando = true;
    this.error = '';
    this.paginaActual = 1;
    this.expandidoId = null;

    const token = this.sesion.tutor?.token;
    if (!token) {
      this.error = 'No hay sesión de tutor activa.';
      this.cargando = false;
      return;
    }

    try {
      const { data: alumnos, error: eAlumnos } = await this.sesion.supabase
        .rpc('obtener_alumnos_tutor', { p_token: token });

      if (eAlumnos) throw new Error(eAlumnos.message);

      if (!alumnos || alumnos.length === 0) {
        this.error = 'No tienes hijos asignados.';
        this.hijos = [];
        this.tareas = [];
        this.actividades = [];
        this.cargando = false;
        return;
      }

      this.hijos = alumnos.map((a: any) => ({
        alumno_id: a.alumno_id,
        nombre: `${a.alumno_first_name || ''} ${a.alumno_last_name || ''}`.trim(),
      }));


      const resultados = await Promise.all(
        alumnos.map((a: any) => this.cargarDeUnHijo(a, token))
      );

      this.tareas = resultados.flatMap(r => r.tareas);
      this.actividades = resultados.flatMap(r => r.actividades);

    } catch (e: any) {
      this.error = 'Error al cargar la información: ' + e.message;
    }

    this.cargando = false;
  }

  private async cargarDeUnHijo(alumno: any, token: string): Promise<{ tareas: ItemAcademico[]; actividades: ItemAcademico[] }> {
    const alumnoId = alumno.alumno_id;
    const alumnoNombre = `${alumno.alumno_first_name || ''} ${alumno.alumno_last_name || ''}`.trim();

    try {
      const [tareas, actividades] = await Promise.all([
        this.cargarTareasList(alumnoId, alumnoNombre, token),
        alumno.grupo_id ? this.cargarActividadesList(alumno.grupo_id, alumnoId, alumnoNombre, token) : Promise.resolve([]),
      ]);
      return { tareas, actividades };
    } catch (e) {
      console.error(`Error cargando datos de ${alumnoNombre}:`, e);
      return { tareas: [], actividades: [] };
    }
  }


  private async cargarTareasList(alumnoId: number, alumnoNombre: string, token: string): Promise<ItemAcademico[]> {
    const { data: tareasData, error: tareasErr } = await this.sesion.supabase
      .rpc('tareas_del_alumno', { p_token: token, p_alumno_id: alumnoId });

    if (tareasErr) throw new Error(tareasErr.message);

    const tareaIds = (tareasData || []).map((t: any) => t.id);
    let entregasData: any[] = [];

    if (tareaIds.length > 0) {
      const { data, error: entregasErr } = await this.sesion.supabase
        .rpc('entregas_de_tarea_tutor', { p_token: token, p_tarea_ids: tareaIds, p_alumno_id: alumnoId, });

      if (entregasErr) throw new Error(entregasErr.message);
      entregasData = data || [];
    }

    const entregasMap: Record<number, any> = {};
    entregasData.forEach((e: any) => { entregasMap[e.tarea_id] = e; });

    const ahora = new Date();

    return (tareasData || []).map((t: any) => {
      const entrega = entregasMap[t.id] || null;
      const vencida = new Date(t.fecha_entrega) < ahora;

      return {
        id: t.id,
        tipo: 'TAREA',
        alumno_id: alumnoId,
        alumno_nombre: alumnoNombre,
        titulo: t.titulo,
        descripcion: t.descripcion || '',
        fecha_entrega: t.fecha_entrega,
        asignatura: t.asignatura_nombre || '—',
        docente: `${t.docente_first_name || ''} ${t.docente_last_name || ''}`.trim(),
        publicada: t.publicada,
        vencida,
        entrega: entrega ? {
          estado: entrega.estado,
          calificacion: entrega.calificacion != null ? parseFloat(entrega.calificacion) : null,
          feedback: entrega.feedback || '',
          entregada_en: entrega.entregada_en,
        } : null,
      } as ItemAcademico;
    });
  }


  private async cargarActividadesList(grupoId: number, alumnoId: number, alumnoNombre: string, token: string): Promise<ItemAcademico[]> {
    const { data: actsRaw, error } = await this.sesion.supabase
      .rpc('leer_actividades_grupo', { p_token: token, p_grupo_id: grupoId });

    if (error) throw new Error(error.message);

    const acts = (actsRaw || []).map((a: any) => ({
      id: a.id ?? a.out_id,
      titulo: a.titulo ?? a.out_titulo,
      instrucciones: a.instrucciones ?? a.out_instrucciones,
      fecha_entrega: a.fecha_entrega ?? a.out_fecha_entrega,
      asignatura_id: a.asignatura_id ?? a.out_asignatura_id,
    }));

    const asiIds = [...new Set(acts.map((a: any) => a.asignatura_id).filter(Boolean))];
    let asiMap: Record<number, string> = {};

    if (asiIds.length) {
      const { data: asis, error: errAsis } = await this.sesion.supabase
        .rpc('nombres_asignaturas', { p_token: token, p_ids: asiIds });
      if (errAsis) console.error('Error nombres_asignaturas:', errAsis.message);
      (asis || []).forEach((a: any) => { asiMap[a.id] = a.nombre; });
    }

    const actIds = acts.map((a: any) => a.id).filter(Boolean);
    let entregas: any[] = [];

    if (actIds.length) {
      const { data, error: errEnt } = await this.sesion.supabase
        .rpc('entregas_de_actividad_tutor', { p_token: token, p_actividad_ids: actIds, p_alumno_id: alumnoId,  });
      if (errEnt) throw new Error(errEnt.message);
      entregas = data || [];
    }

    const entMap: Record<number, any> = {};
    entregas.forEach((e: any) => { entMap[e.actividad_id] = e; });

    const ahora = new Date();

    return acts.map((a: any) => {
      const ent = entMap[a.id];
      const vencida = new Date(a.fecha_entrega) < ahora;

      const estado = ent
        ? (ent.calificacion != null ? 'CALIFICADA' : 'ENTREGADA')
        : 'PENDIENTE';

      return {
        id: a.id,
        tipo: 'ACTIVIDAD',
        alumno_id: alumnoId,
        alumno_nombre: alumnoNombre,
        titulo: a.titulo,
        descripcion: a.instrucciones || '',
        fecha_entrega: a.fecha_entrega,
        asignatura: asiMap[a.asignatura_id] || '—',
        docente: '',
        publicada: true,
        vencida,
        entrega: ent ? {
          estado,
          calificacion: ent.calificacion != null ? parseFloat(ent.calificacion) : null,
          feedback: ent.feedback || '',
          entregada_en: ent.entregada_en,
        } : null,
      } as ItemAcademico;
    });
  }


  cambiarVista(v: 'TAREAS' | 'ACTIVIDADES') {
    this.vista = v;
    this.filtro = 'TODAS';
    this.paginaActual = 1;
    this.expandidoId = null;
  }

  seleccionarHijo(id: number | 'TODOS') {
    this.hijoSeleccionado = id;
    this.filtro = 'TODAS';
    this.paginaActual = 1;
    this.expandidoId = null;
  }

  get itemsBase(): ItemAcademico[] {
    const lista = this.vista === 'TAREAS' ? this.tareas : this.actividades;
    if (this.hijoSeleccionado === 'TODOS') return lista;
    return lista.filter(t => t.alumno_id === this.hijoSeleccionado);
  }

  get itemsFiltrados(): ItemAcademico[] {
    const lista = this.itemsBase;
    if (this.filtro === 'TODAS') return lista;
    if (this.filtro === 'PENDIENTE') {
      return lista.filter(t => !t.vencida && (!t.entrega || t.entrega.estado === 'PENDIENTE'));
    }
    if (this.filtro === 'NO_ENTREGADA') {
      return lista.filter(t => t.vencida && !t.entrega);
    }
    return lista.filter(t => t.entrega?.estado === this.filtro);
  }

  get itemsPaginados(): ItemAcademico[] {
    return this.itemsFiltrados.slice(0, this.pageSize * this.paginaActual);
  }

  get hayMasPorCargar(): boolean {
    return this.itemsPaginados.length < this.itemsFiltrados.length;
  }

  cargarMas() {
    this.paginaActual++;
  }

  cambiarFiltro(f: typeof this.filtro) {
    this.filtro = f;
    this.paginaActual = 1;
  }

  toggleDetalle(id: number) {
    this.expandidoId = this.expandidoId === id ? null : id;
  }
  get totalPendientes(): number {
    return this.itemsBase.filter(t => !t.vencida && (!t.entrega || t.entrega.estado === 'PENDIENTE')).length;
  }
  get totalNoEntregadas(): number {
    return this.itemsBase.filter(t => t.vencida && !t.entrega).length;
  }
  get totalEntregadas(): number {
    return this.itemsBase.filter(t => t.entrega?.estado === 'ENTREGADA').length;
  }
  get totalCalificadas(): number {
    return this.itemsBase.filter(t => t.entrega?.estado === 'CALIFICADA').length;
  }
  get totalTarde(): number {
    return this.itemsBase.filter(t => t.entrega?.estado === 'TARDE').length;
  }

  getEstadoLabel(t: ItemAcademico): string {
    if (!t.entrega) return t.vencida ? 'No entregada' : 'Pendiente';
    const map: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      ENTREGADA: 'Entregada',
      CALIFICADA: 'Calificada',
      TARDE: 'Entrega tardía',
    };
    return map[t.entrega.estado] || t.entrega.estado;
  }

  getEstadoClass(t: ItemAcademico): string {
    if (!t.entrega) return t.vencida ? 'no-entregada' : 'pendiente';
    const map: Record<string, string> = {
      PENDIENTE: 'pendiente',
      ENTREGADA: 'entregada',
      CALIFICADA: 'calificada',
      TARDE: 'tarde',
    };
    return map[t.entrega.estado] || 'pendiente';
  }

  getEstadoIcon(t: ItemAcademico): string {
    if (!t.entrega) return t.vencida ? 'close-circle-outline' : 'time-outline';
    const map: Record<string, string> = {
      PENDIENTE: 'time-outline',
      ENTREGADA: 'checkmark-circle-outline',
      CALIFICADA: 'ribbon-outline',
      TARDE: 'alert-circle-outline',
    };
    return map[t.entrega.estado] || 'time-outline';
  }

  colorNota(nota: number): string {
    if (nota >= 9) return 'excelente';
    if (nota >= 7) return 'bien';
    if (nota >= 6) return 'regular';
    return 'reprobado';
  }

  formatFecha(fecha: string): string {
    const d = new Date(fecha);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  diasRestantes(fecha: string): string {
    const d = new Date(fecha);
    const ahora = new Date();
    const diff = Math.ceil((d.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `Venció hace ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? 's' : ''}`;
    if (diff === 0) return 'Vence hoy';
    if (diff === 1) return 'Vence mañana';
    return `${diff} días restantes`;
  }

  esCritica(t: ItemAcademico): boolean {
    if (t.entrega) return false;
    const d = new Date(t.fecha_entrega);
    const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff <= 2 && diff >= 0;
  }

  primerNombre(nombreCompleto: string): string {
    return (nombreCompleto || '').split(' ')[0];
  }

  doRefresh(event: any) {
    this.cargarTodo().then(() => event.target.complete());
  }
}
