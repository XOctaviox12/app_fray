import { Component, OnInit } from '@angular/core';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService } from '../../services/cloudinary.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';


export type Publico = 'ALUMNOS' | 'PADRES' | 'AMBOS';
export type Alcance  = 'TODOS' | 'GRUPO' | 'DOCENTES';

export interface Comunicado {
  id: number;
  titulo: string;
  cuerpo: string;
  destinatario: Alcance;
  publico: Publico;
  creado_en: string;
  activo: boolean;
  adjunto: string | null;
  autor: { id: number; first_name: string; last_name: string; rol: string; };
  grupo: { id: number; nombre: string; grado: number } | null;
  materia: { id: number; nombre: string } | null;
}

interface GrupoOpt   { id: number; nombre: string; grado: number; }
interface MateriaOpt { id: number; nombre: string; clave?: string; }

@Component({
  standalone: false,
  selector: 'app-comunidad',
  templateUrl: './comunidad.page.html',
  styleUrls: ['./comunidad.page.scss'],
})

export class ComunidadPage implements OnInit {
  private supabase: SupabaseClient;
  get esTutor():   boolean { return this.sesion.esTutor(); }
  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esAlumno():  boolean { return this.sesion.esAlumno(); }
  get miUserId():  number | null { return this.sesion.usuario?.id ?? null; }

  comunicadosMaestros:  Comunicado[] = [];
  comunicadosDireccion: Comunicado[] = [];
  cargando = true;
  error    = '';

  // ── Formulario (docente) ──────────────────
  nuevoTitulo = '';
  nuevoCuerpo = '';

  // Paso 1: audiencia
  publico: Publico = 'AMBOS';

  // Paso 2: alcance ('DOCENTES' = solo visible para otros docentes)
  destinatario: Alcance = 'TODOS';

  // Paso 3 (solo si alcance = GRUPO): materia → grupo(s)
  misMaterias:   MateriaOpt[] = [];
  misGrupos:     GrupoOpt[]   = []; // todos los grupos del docente
  gruposCandidatos: GrupoOpt[] = []; // filtrados según la materia elegida
  materiaSeleccionada:  number | null = null;
  gruposSeleccionados:  number[] = [];
  cargandoOpciones = false;

  // Todas las relaciones materia↔grupo del docente (para filtrar sin
  // volver a golpear la BD cada vez que cambia la materia)
  private asignaturaGrupoMap = new Map<number, number[]>(); // asignatura_id -> grupo_ids

  adjuntoFile:  File | null = null;
  adjuntoNombre = '';
  subiendoAdj   = false;
  progresoAdj   = 0;
  publicando    = false;
  errorPublicar = '';

  // ── Eliminar comunicado ───────────────────
  eliminandoId: number | null = null;

  tabActiva: 'maestros' | 'direccion' = 'maestros';

  private plantelId:    number | null = null;
  private grupoIdPropio: number | null = null;

  constructor(
    private sesion:     SesionService,
    private cloudinary: CloudinaryService,
  ) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  ngOnInit() { this.inicializar(); }

  async inicializar() {
    await this.resolverContexto();
    if (this.esDocente) await this.cargarOpcionesDocente();
    await this.cargarComunicados();
  }

  // ── Contexto plantel/grupo ────────────────
  private async resolverContexto() {
    if (this.esDocente || this.esAlumno) {
      const { data } = await this.sesion.supabase
        .from('users_user')
        .select('plantel_id, alumno_grupo_id')
        .eq('id', this.sesion.usuario!.id).single();
      this.plantelId     = (data as any)?.plantel_id     || null;
      this.grupoIdPropio = (data as any)?.alumno_grupo_id || null;

    } else if (this.esTutor) {
      // TODO(schema): users_tutor no tiene columna user_id que la conecte
      // con users_user, así que no hay forma confirmada de saber qué fila
      // de users_tutor corresponde a la sesión actual. Se asume que el
      // login de tutor deja un campo alumno_id colgado directamente en
      // sesion.usuario (el objeto Usuario admite columnas extra). Si esto
      // no es así, este bloque no podrá resolver el grupo del tutor y la
      // vista de comunicados quedará vacía para ese rol — pendiente
      // confirmar cómo se relaciona el login del tutor con users_tutor.
      const alumnoId = (this.sesion.usuario as any)?.alumno_id;
      if (!alumnoId) return;
      const { data } = await this.sesion.supabase
        .from('users_user')
        .select('plantel_id, alumno_grupo_id')
        .eq('id', alumnoId).single();
      this.plantelId     = (data as any)?.plantel_id     || null;
      this.grupoIdPropio = (data as any)?.alumno_grupo_id || null;
    }
  }

  // ── Opciones del docente: materias y grupos ───────────────
  async cargarOpcionesDocente() {
    const uid = this.sesion.usuario?.id;
    if (!uid) return;
    this.cargandoOpciones = true;

    try {
      // Grupos asignados al docente
      const { data: relGrupos, error: eG } = await this.sesion.supabase
        .from('academic_grupo_docentes')
        .select('grupo_id')
        .eq('user_id', uid);
      if (eG) throw eG;

      const grupoIds = [...new Set((relGrupos || []).map((r: any) => r.grupo_id))];
      if (grupoIds.length) {
        const { data, error: eGD } = await this.sesion.supabase
          .from('academic_grupo')
          .select('id, nombre, grado')
          .in('id', grupoIds)
          .order('grado');
        if (eGD) throw eGD;
        this.misGrupos = data || [];
      }

      // Materias del docente
      const { data: relAsig, error: eA } = await this.sesion.supabase
        .from('academic_asignatura_docentes')
        .select('asignatura_id')
        .eq('user_id', uid);
      if (eA) throw eA;

      const asignaturaIds = [...new Set((relAsig || []).map((r: any) => r.asignatura_id))];
      if (asignaturaIds.length) {
        const { data, error: eAN } = await this.sesion.supabase
          .from('academic_asignatura')
          .select('id, nombre, clave')
          .in('id', asignaturaIds)
          .order('nombre');
        if (eAN) throw eAN;
        this.misMaterias = data || [];

        // Relación materia -> grupos (intersectada con los grupos del docente)
        const { data: relAG, error: eAG } = await this.sesion.supabase
          .from('academic_asignatura_grupos')
          .select('asignatura_id, grupo_id')
          .in('asignatura_id', asignaturaIds);
        if (eAG) throw eAG;

        const misGrupoIds = new Set(grupoIds);
        (relAG || []).forEach((r: any) => {
          if (!misGrupoIds.has(r.grupo_id)) return;
          const lista = this.asignaturaGrupoMap.get(r.asignatura_id) || [];
          lista.push(r.grupo_id);
          this.asignaturaGrupoMap.set(r.asignatura_id, lista);
        });
      }

      // Sin materia elegida todavía: candidatos = todos los grupos del docente
      this.gruposCandidatos = this.misGrupos;

    } catch (e: any) {
      this.errorPublicar = `No se pudieron cargar tus materias/grupos. Detalle: ${e.message}`;
    } finally {
      this.cargandoOpciones = false;
    }
  }

  // ── Paso 3a: cambiar materia → recalcular grupos candidatos ─
  onMateriaChange() {
    this.gruposSeleccionados = [];
    if (!this.materiaSeleccionada) {
      this.gruposCandidatos = this.misGrupos; // "comunicado general"
      return;
    }
    const idsPermitidos = new Set(this.asignaturaGrupoMap.get(this.materiaSeleccionada) || []);
    this.gruposCandidatos = this.misGrupos.filter(g => idsPermitidos.has(g.id));
  }

  // ── Paso 3b: elegir uno o varios grupos ──────────────────────
  toggleGrupo(id: number) {
    const i = this.gruposSeleccionados.indexOf(id);
    if (i === -1) this.gruposSeleccionados.push(id);
    else this.gruposSeleccionados.splice(i, 1);
  }

  // ── Al cambiar alcance ────────────────────
  onDestinatarioChange(dest: Alcance) {
    this.destinatario         = dest;
    this.materiaSeleccionada  = null;
    this.gruposSeleccionados  = [];
    this.gruposCandidatos     = this.misGrupos;
  }

  // ── Cargar comunicados ────────────────────
  async cargarComunicados() {
    this.cargando = true;
    this.error    = '';
    try {
      if (!this.plantelId) {
        // Para un tutor cuyo contexto no se pudo resolver (ver TODO en
        // resolverContexto), no truena la pantalla: solo se queda vacía.
        if (this.esTutor) { this.comunicadosMaestros = []; this.comunicadosDireccion = []; return; }
        throw new Error('No se encontró el plantel.');
      }

      const { data, error } = await this.sesion.supabase
        .from('academic_comunicado')
        .select(`
          id, titulo, cuerpo, destinatario, publico, creado_en, activo, adjunto,
          autor:autor_id ( id, first_name, last_name, rol ),
          grupo:grupo_id ( id, nombre, grado ),
          materia:asignatura_id ( id, nombre )
        `)
        .eq('plantel_id', this.plantelId)
        .eq('activo', true)
        .order('creado_en', { ascending: false });

      if (error) throw new Error(error.message);

      const todos = (data || []).map((c: any) => ({
        ...c,
        publico: c.publico || 'AMBOS', // filas viejas sin este dato aún
        autor:   Array.isArray(c.autor)   ? c.autor[0]   : c.autor,
        grupo:   Array.isArray(c.grupo)   ? c.grupo[0]   : c.grupo,
        materia: Array.isArray(c.materia) ? c.materia[0] : c.materia,
      })) as Comunicado[];

      let visibles: Comunicado[];
      if (this.esDocente) {
        const grupoIds = this.misGrupos.map(g => g.id);
        visibles = todos.filter(c =>
          c.destinatario === 'TODOS' ||
          c.destinatario === 'DOCENTES' ||
          (c.destinatario === 'GRUPO' && grupoIds.includes(c.grupo?.id ?? -1))
        );
      } else if (this.esAlumno) {
        visibles = todos.filter(c =>
          c.destinatario !== 'DOCENTES' &&
          c.publico !== 'PADRES' && (
            c.destinatario === 'TODOS' ||
            (c.destinatario === 'GRUPO' && c.grupo?.id === this.grupoIdPropio)
          )
        );
      } else if (this.esTutor) {
        visibles = todos.filter(c =>
          c.destinatario !== 'DOCENTES' &&
          c.publico !== 'ALUMNOS' && (
            c.destinatario === 'TODOS' ||
            (c.destinatario === 'GRUPO' && c.grupo?.id === this.grupoIdPropio)
          )
        );
      } else {
        visibles = [];
      }

      this.comunicadosMaestros  = visibles.filter(c => c.autor?.rol === 'DOCENTE');
      this.comunicadosDireccion = visibles.filter(c =>
        ['DIRECTOR','COORD','ADMIN'].includes(c.autor?.rol)
      );

    } catch (e: any) {
      this.error = 'Error al cargar comunicados: ' + e.message;
    }
    this.cargando = false;
  }

  // ── Publicar ──────────────────────────────
  async publicarComunicado() {
    this.errorPublicar = '';

    if (!this.nuevoTitulo.trim()) { this.errorPublicar = 'El título es obligatorio.';  return; }
    if (!this.nuevoCuerpo.trim()) { this.errorPublicar = 'El mensaje es obligatorio.'; return; }
    if (this.destinatario === 'GRUPO' && this.gruposSeleccionados.length === 0)
      { this.errorPublicar = 'Elige al menos un grupo destinatario.'; return; }

    this.publicando = true;
    try {
      let adjuntoUrl: string | null = null;

      if (this.adjuntoFile) {
        this.subiendoAdj = true;
        try {
          const r = await this.cloudinary.subirArchivo(
            this.adjuntoFile,
            pct => { this.progresoAdj = pct; }
          );
          adjuntoUrl = r.url;
        } finally {
          // Se resetea pase lo que pase, para no dejar el spinner de
          // subida trabado si la subida falla a medias.
          this.subiendoAdj = false;
        }
      }

      const base = {
        titulo:        this.nuevoTitulo.trim(),
        cuerpo:        this.nuevoCuerpo.trim(),
        destinatario:  this.destinatario,
        // "Solo docentes" no aplica el filtro de público (alumnos/padres)
        publico:       this.destinatario === 'DOCENTES' ? 'AMBOS' : this.publico,
        asignatura_id: this.materiaSeleccionada,
        plantel_id:    this.plantelId,
        autor_id:      this.sesion.usuario!.id,
        adjunto:       adjuntoUrl,
        activo:        true,
        // Necesario porque la columna creado_en es NOT NULL en la BD
        // y no tiene un DEFAULT now() configurado en Supabase.
        creado_en:     new Date().toISOString(),
      };

      const filas: (typeof base & { grupo_id: number | null })[] =
        this.destinatario === 'GRUPO'
          ? this.gruposSeleccionados.map(gid => ({ ...base, grupo_id: gid as number | null }))
          : [{ ...base, grupo_id: null as number | null }];

      const { error } = await this.sesion.supabase.from('academic_comunicado').insert(filas);
      if (error) throw error;

      // Reset
      this.nuevoTitulo = '';
      this.nuevoCuerpo = '';
      this.publico = 'AMBOS';
      this.destinatario = 'TODOS';
      this.materiaSeleccionada = null;
      this.gruposSeleccionados = [];
      this.gruposCandidatos = this.misGrupos;
      this.adjuntoFile   = null;
      this.adjuntoNombre = '';
      this.progresoAdj   = 0;

      await this.cargarComunicados();
    } catch (e: any) {
      this.errorPublicar = 'Error al publicar: ' + e.message;
    }
    this.publicando = false;
  }

  // ── Eliminar (desactivar) un comunicado propio ────────────
  puedeEliminar(c: Comunicado): boolean {
    return this.esDocente && c.autor?.id === this.miUserId;
  }

  async eliminarComunicado(c: Comunicado) {
    if (this.eliminandoId) return; // evita doble click mientras hay una petición en curso
    const confirmado = window.confirm('¿Eliminar este comunicado? Ya no será visible para nadie.');
    if (!confirmado) return;

    this.eliminandoId = c.id;
    try {
      const { error } = await this.sesion.supabase
        .from('academic_comunicado')
        .update({ activo: false })
        .eq('id', c.id);
      if (error) throw error;

      // Quita el comunicado de las listas locales sin tener que recargar todo
      this.comunicadosMaestros  = this.comunicadosMaestros.filter(x => x.id !== c.id);
      this.comunicadosDireccion = this.comunicadosDireccion.filter(x => x.id !== c.id);
    } catch (e: any) {
      this.error = 'No se pudo eliminar el comunicado: ' + e.message;
    } finally {
      this.eliminandoId = null;
    }
  }

  // ── Adjunto ───────────────────────────────
  onAdjuntoChange(e: any) {
    const file: File = e.target.files[0];
    if (!file) return;
    if (file.size / 1048576 > 20) { this.errorPublicar = 'El adjunto no puede superar 20 MB.'; return; }
    this.adjuntoFile   = file;
    this.adjuntoNombre = file.name;
  }

  quitarAdjunto() {
    this.adjuntoFile   = null;
    this.adjuntoNombre = '';
    this.progresoAdj   = 0;
    this.subiendoAdj   = false;
  }

  triggerFileInput() { document.getElementById('adjuntoInput')?.click(); }

  // ── Helpers UI ────────────────────────────
  getInitials(c: Comunicado): string {
    const parts = `${c.autor?.first_name || ''} ${c.autor?.last_name || ''}`.trim().split(' ');
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : (parts[0]?.[0] || '?').toUpperCase();
  }

  getNombreAutor(c: Comunicado): string {
    return `${c.autor?.first_name || ''} ${c.autor?.last_name || ''}`.trim() || 'Sin nombre';
  }

  getRolLabel(c: Comunicado): string {
    return ({ DOCENTE:'Docente', DIRECTOR:'Dirección', COORD:'Coordinación', ADMIN:'Administración' } as any)
      [c.autor?.rol] || c.autor?.rol || '';
  }

  esDirectivo(c: Comunicado): boolean {
    return ['DIRECTOR','COORD','ADMIN'].includes(c.autor?.rol);
  }

  etiquetaGrupo(c: Comunicado): string {
    if (c.destinatario === 'TODOS')    return 'Toda la comunidad';
    if (c.destinatario === 'DOCENTES') return 'Solo docentes';
    if (c.grupo) return `${c.grupo.grado}° ${c.grupo.nombre}`;
    return 'Grupo específico';
  }

  etiquetaPublico(c: Comunicado): string {
    return { ALUMNOS: 'Solo alumnos', PADRES: 'Solo padres', AMBOS: 'Alumnos y padres' }[c.publico];
  }

  getLabelMateria(m: MateriaOpt): string {
    return m.clave ? `${m.nombre} (${m.clave})` : m.nombre;
  }

  formatFecha(fecha: string): string {
    const d = new Date(fecha);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1)  return 'Justo ahora';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)   return `Hace ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7)    return `Hace ${diffD} días`;
    return d.toLocaleDateString('es-MX', { day:'numeric', month:'short' });
  }

  doRefresh(event: any) {
    this.cargarComunicados().then(() => event.target.complete());
  }
  urlArchivo(raw: string | null | undefined): string {
  if (!raw) return '';

  const idx = raw.indexOf('http');
  if (idx === 0) return raw;
  if (idx > 0)  return raw.slice(idx);

  // No trae "http": es un public_id guardado directo (sin resource_type)
  const cloudName = (environment as any).cloudinaryCloudName;
  if (!cloudName) return raw;

  const rutaLimpia = raw.replace(/^\/+/, '');

  // Si ya viene con el segmento resource_type/upload incluido, se usa tal cual
  if (/^(image|raw|video)\/upload\//.test(rutaLimpia)) {
    return `https://res.cloudinary.com/${cloudName}/${rutaLimpia}`;
  }

  // Los adjuntos de comunicados se suben todos como resource_type=raw
  // (confirmado en Cloudinary), así que se asume ese prefijo por defecto
  return `https://res.cloudinary.com/${cloudName}/raw/upload/${rutaLimpia}`;
}
}
