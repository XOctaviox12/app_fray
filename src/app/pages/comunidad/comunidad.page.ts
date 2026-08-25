import { Component, OnInit } from '@angular/core';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService } from '../../services/cloudinary.service';
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
  get esTutor():   boolean { return this.sesion.esTutor(); }
  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esAlumno():  boolean { return this.sesion.esAlumno(); }
  get miUserId():  number | null { return this.sesion.usuario?.id ?? null; }

  comunicadosMaestros:  Comunicado[] = [];
  comunicadosDireccion: Comunicado[] = [];
  cargando = true;
  error    = '';

  nuevoTitulo = '';
  nuevoCuerpo = '';

  mostrarFormulario = false;
  publico: Publico = 'AMBOS';
  destinatario: Alcance = 'TODOS';

  misMaterias:   MateriaOpt[] = [];
  misGrupos:     GrupoOpt[]   = [];
  gruposCandidatos: GrupoOpt[] = [];
  materiaSeleccionada:  number | null = null;
  gruposSeleccionados:  number[] = [];
  cargandoOpciones = false;

  private asignaturaGrupoMap = new Map<number, number[]>();

  adjuntoFile:  File | null = null;
  adjuntoNombre = '';
  subiendoAdj   = false;
  progresoAdj   = 0;
  publicando    = false;
  errorPublicar = '';

  eliminandoId: number | null = null;

  tabActiva: 'maestros' | 'direccion' = 'maestros';

  private plantelId:    number | null = null;
  private grupoIdPropio: number | null = null;

  contextoTutorNoResuelto = false;

  constructor(
    private sesion:     SesionService,
    private cloudinary: CloudinaryService,
  ) {}

  ngOnInit() { this.inicializar(); }

  async inicializar() {
    await this.resolverContexto();
    if (this.esDocente) await this.cargarOpcionesDocente();
    await this.cargarComunicados();
  }

  private async resolverContexto() {
    if (this.esDocente || this.esAlumno) {
      const { data } = await this.sesion.supabase
        .rpc('perfil_basico_usuario', { p_token: this.sesion.usuario?.token, p_user_id: this.sesion.usuario!.id }).single();
      this.plantelId     = (data as any)?.plantel_id     || null;
      this.grupoIdPropio = (data as any)?.alumno_grupo_id || null;

    } else if (this.esTutor) {
      const alumnoId = this.sesion.tutor?.alumno_id ?? null;

      if (!alumnoId) {
        this.contextoTutorNoResuelto = true;
        return;
      }

      const { data, error } = await this.sesion.supabase
        .rpc('perfil_basico_usuario', { p_token: this.sesion.tutor?.token, p_user_id: alumnoId }).single();

      if (error || !data) {
        this.contextoTutorNoResuelto = true;
        return;
      }

      this.plantelId     = (data as any)?.plantel_id     || null;
      this.grupoIdPropio = (data as any)?.alumno_grupo_id || null;
    }
  }

  private async resolverAlumnoIdDeTutor(): Promise<number | null> {
    const usuario = this.sesion.usuario as any;

    if (usuario?.alumno_id) return usuario.alumno_id;
    if (usuario?.alumno?.id) return usuario.alumno.id;

    if (usuario?.id) {
      const { data, error } = await this.sesion.supabase
        .from('users_tutor')
        .select('alumno_id')
        .eq('id', usuario.id)
        .maybeSingle();

      if (!error && data?.alumno_id) return data.alumno_id;
    }

    return null;
  }

  async cargarOpcionesDocente() {
    const uid = this.sesion.usuario?.id;
    if (!uid) return;
    this.cargandoOpciones = true;

    try {
      const token = this.sesion.usuario?.token;
      if (!token) throw new Error('Sin token de autenticación');

      // ✅ MIGRADO: Grupos asignados al docente (con período activo)
      // Antes: .from('users_docentegrupo').select('grupo_id').eq('docente_id', uid).eq('activo', true)
      // Ahora: RPC segura que valida período activo
      const { data: relGrupos, error: eG } = await this.sesion.supabase
        .rpc('grupos_del_docente', { p_token: token });
      if (eG) throw eG;

      const grupoIds = relGrupos || [];

      if (grupoIds.length) {
        const { data, error: eGD } = await this.sesion.supabase
          .from('academic_grupo')
          .select('id, nombre, grado')
          .in('id', grupoIds)
          .order('grado');
        if (eGD) throw eGD;
        this.misGrupos = data || [];
      } else {
        this.misGrupos = [];
      }

      // ✅ MIGRADO: Materias del docente
      // Antes: .from('academic_asignatura_docentes').select('asignatura_id').eq('user_id', uid)
      // Ahora: RPC segura que valida sesión
      const { data: relAsig, error: eA } = await this.sesion.supabase
        .rpc('materias_del_docente', { p_token: token });
      if (eA) throw eA;

      const asignaturaIds = relAsig || [];
      if (asignaturaIds.length) {
        const { data, error: eAN } = await this.sesion.supabase
          .from('academic_asignatura')
          .select('id, nombre, clave')
          .in('id', asignaturaIds)
          .order('nombre');
        if (eAN) throw eAN;
        this.misMaterias = data || [];

        // ✅ MIGRADO: Relación materia → grupos
        // Antes: .from('academic_asignatura_grupos').select('asignatura_id, grupo_id').in('asignatura_id', asignaturaIds)
        // Ahora: Query directo (no bloqueado porque no tiene período crítico en el filtro)
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

      this.gruposCandidatos = this.misGrupos;

    } catch (e: any) {
      this.errorPublicar = `No se pudieron cargar tus materias/grupos. Detalle: ${e.message}`;
      this.misGrupos = [];
      this.gruposCandidatos = [];
    } finally {
      this.cargandoOpciones = false;
    }
  }

  onMateriaChange() {
    this.gruposSeleccionados = [];
    if (!this.materiaSeleccionada) {
      this.gruposCandidatos = this.misGrupos;
      return;
    }
    const idsPermitidos = new Set(this.asignaturaGrupoMap.get(this.materiaSeleccionada) || []);
    this.gruposCandidatos = this.misGrupos.filter(g => idsPermitidos.has(g.id));
  }

  toggleGrupo(id: number) {
    if (!this.misGrupos.some(g => g.id === id)) return;

    const i = this.gruposSeleccionados.indexOf(id);
    if (i === -1) this.gruposSeleccionados.push(id);
    else this.gruposSeleccionados.splice(i, 1);
  }

  onDestinatarioChange(dest: Alcance) {
    this.destinatario         = dest;
    this.materiaSeleccionada  = null;
    this.gruposSeleccionados  = [];
    this.gruposCandidatos     = this.misGrupos;
  }

  async cargarComunicados() {
    this.cargando = true;
    this.error    = '';
    try {
      if (!this.plantelId) {
        if (this.esTutor) { this.comunicadosMaestros = []; this.comunicadosDireccion = []; return; }
        throw new Error('No se encontró el plantel.');
      }

      const token = this.sesion.usuario?.token || this.sesion.tutor?.token;

      // ✅ MIGRADO: Cargar comunicados del plantel
      // Antes: .from('academic_comunicado').select(...).eq('plantel_id', this.plantelId)
      // Ahora: Query directo (Comunicado no tiene período, pero el filtro de plantel es válido)
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
        publico: c.publico || 'AMBOS',
        autor:   Array.isArray(c.autor)   ? c.autor[0]   : c.autor,
        grupo:   Array.isArray(c.grupo)   ? c.grupo[0]   : c.grupo,
        materia: Array.isArray(c.materia) ? c.materia[0] : c.materia,
      })) as Comunicado[];

      let visibles: Comunicado[];
      if (this.esDocente) {
        const grupoIds = this.misGrupos.map(g => g.id);
        visibles = todos.filter(c =>
          c.autor?.id === this.miUserId || // Mostrar siempre los propios
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
    } finally {
      this.cargando = false;
    }
  }

  async publicarComunicado() {
    this.errorPublicar = '';

    if (!this.nuevoTitulo.trim()) { this.errorPublicar = 'El título es obligatorio.';  return; }
    if (!this.nuevoCuerpo.trim()) { this.errorPublicar = 'El mensaje es obligatorio.'; return; }
    if (this.destinatario === 'GRUPO' && this.gruposSeleccionados.length === 0)
      { this.errorPublicar = 'Elige al menos un grupo destinatario.'; return; }

    if (this.destinatario === 'GRUPO') {
      const idsValidos = new Set(this.misGrupos.map(g => g.id));
      const algunoInvalido = this.gruposSeleccionados.some(id => !idsValidos.has(id));
      if (algunoInvalido) {
        this.errorPublicar = 'Uno de los grupos seleccionados no te pertenece.';
        return;
      }
    }

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
          this.subiendoAdj = false;
        }
      }

      const base = {
        titulo:        this.nuevoTitulo.trim(),
        cuerpo:        this.nuevoCuerpo.trim(),
        destinatario:  this.destinatario,
        publico:       this.destinatario === 'DOCENTES' ? 'AMBOS' : this.publico,
        asignatura_id: this.materiaSeleccionada,
        plantel_id:    this.plantelId,
        autor_id:      this.sesion.usuario!.id,
        adjunto:       adjuntoUrl,
        activo:        true,
        creado_en:     new Date().toISOString(),
      };

      const filas: (typeof base & { grupo_id: number | null })[] =
        this.destinatario === 'GRUPO'
          ? this.gruposSeleccionados.map(gid => ({ ...base, grupo_id: gid as number | null }))
          : [{ ...base, grupo_id: null as number | null }];

      const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
      const { error } = await this.sesion.supabase.rpc('crear_comunicado_completo', { p_token: token, p_payload: filas });
      if (error) throw error;

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

  puedeEliminar(c: Comunicado): boolean {
    return this.esDocente && c.autor?.id === this.miUserId;
  }

  esPropio(c: Comunicado): boolean {
    return c.autor?.id === this.miUserId;
  }

  getMisDelMaestro(): Comunicado[] {
    return this.comunicadosMaestros.filter(c => this.esPropio(c));
  }

  getMisDelDirector(): Comunicado[] {
    return this.comunicadosDireccion.filter(c => this.esPropio(c));
  }

  getOtrosDelMaestro(): Comunicado[] {
    return this.comunicadosMaestros.filter(c => !this.esPropio(c));
  }

  getOtrosDelDirector(): Comunicado[] {
    return this.comunicadosDireccion.filter(c => !this.esPropio(c));
  }

  async eliminarComunicado(c: Comunicado) {
    if (this.eliminandoId) return;
    const confirmado = window.confirm('¿Eliminar este comunicado? Ya no será visible para nadie.');
    if (!confirmado) return;

    this.eliminandoId = c.id;
    try {
      const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
      const { error } = await this.sesion.supabase
        .from('academic_comunicado')
        .update({ activo: false })
        .eq('id', c.id);
      if (error) throw error;

      this.comunicadosMaestros  = this.comunicadosMaestros.filter(x => x.id !== c.id);
      this.comunicadosDireccion = this.comunicadosDireccion.filter(x => x.id !== c.id);
    } catch (e: any) {
      this.error = 'No se pudo eliminar el comunicado: ' + e.message;
    } finally {
      this.eliminandoId = null;
    }
  }

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

    const cloudName = (environment as any).cloudinaryCloudName;
    if (!cloudName) return raw;

    const rutaLimpia = raw.replace(/^\/+/, '');

    if (/^(image|raw|video)\/upload\//.test(rutaLimpia)) {
      return `https://res.cloudinary.com/${cloudName}/${rutaLimpia}`;
    }

    return `https://res.cloudinary.com/${cloudName}/raw/upload/${rutaLimpia}`;
  }
}
