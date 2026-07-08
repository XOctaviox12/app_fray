import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SesionService } from '../../services/sesion.service';

export interface MateriaEnGrupo {
  asignaturaId: number;
  nombre: string;
  clave: string;
}

export interface GrupoConMaterias {
  id: number;
  nombre: string;
  grado: number;
  aula: string;
  capacidad_maxima: number;
  plantel_id: number;
  materias: MateriaEnGrupo[];  // materias que el docente imparte en este grupo
}

@Component({
  standalone: false,
  selector: 'app-aula',
  templateUrl: './aula.page.html',
  styleUrls: ['./aula.page.scss'],
})
export class AulaPage implements OnInit {

  // Docente
  grupos: GrupoConMaterias[] = [];

  // Alumno
  grupoAlumno: any = null;

  // Tutor
  grupoHijo: any  = null;
  nombreHijo      = '';

  cargando = false;
  error: string | null = null;

  get esDocente(): boolean { return this.sesion.esDocente(); }
  get esAlumno():  boolean { return this.sesion.esAlumno(); }
  get esTutor():   boolean { return this.sesion.esTutor(); }

  constructor(private sesion: SesionService, private router: Router) {}

  ngOnInit() { this.cargarDatos(); }

  verDetalle(grupoId: number, asignaturaId?: number) {
    if (asignaturaId) {
      this.router.navigate(['/aula/detalle', grupoId], {
        queryParams: { asignatura: asignaturaId }
      });
    } else {
      this.router.navigate(['/aula/detalle', grupoId]);
    }
  }

  async cargarDatos() {
    this.cargando = true;
    this.error    = null;
    try {
      if (this.esDocente)      await this.cargarGruposDocente();
      else if (this.esAlumno)  await this.cargarGrupoAlumno();
      else if (this.esTutor)   await this.cargarDatosTutor();
    } catch (err: any) {
      this.error = 'No se pudieron cargar los datos.';
      console.error(err.message);
    } finally {
      this.cargando = false;
    }
  }

  private async cargarGruposDocente() {
    const docenteId = this.sesion.usuario?.id;
    if (!docenteId) return;

    // 1. Grupos del docente
    const { data: relGrupos } = await this.sesion.supabase
      .from('academic_grupo_docentes')
      .select('grupo_id')
      .eq('user_id', docenteId);

    if (!relGrupos?.length) { this.grupos = []; return; }
    const grupoIds = relGrupos.map((r: any) => r.grupo_id);

    const { data: gruposData, error } = await this.sesion.supabase
      .from('academic_grupo')
      .select('id, nombre, grado, aula, capacidad_maxima, plantel_id')
      .in('id', grupoIds)
      .order('grado');
    if (error) throw error;

    // 2. Todas las asignaturas del docente
    const { data: relAsig } = await this.sesion.supabase
      .from('academic_asignatura_docentes')
      .select('asignatura_id')
      .eq('user_id', docenteId);
    const asigDocenteIds = (relAsig || []).map((r: any) => r.asignatura_id);

    // 3. Por cada grupo, qué asignaturas del docente están en él
    const { data: relGrupoAsig } = await this.sesion.supabase
      .from('academic_asignatura_grupos')
      .select('asignatura_id, grupo_id')
      .in('grupo_id', grupoIds)
      .in('asignatura_id', asigDocenteIds);

    // 4. Datos de las asignaturas
    const asigIds = [...new Set((relGrupoAsig || []).map((r: any) => r.asignatura_id))];
    let asigMap: Record<number, any> = {};
    if (asigIds.length) {
      const { data: asigData } = await this.sesion.supabase
        .from('academic_asignatura')
        .select('id, nombre, clave')
        .in('id', asigIds);
      (asigData || []).forEach((a: any) => { asigMap[a.id] = a; });
    }

    // 5. Armar estructura final
    this.grupos = (gruposData || []).map((g: any) => {
      const materiasDelGrupo = (relGrupoAsig || [])
        .filter((r: any) => r.grupo_id === g.id)
        .map((r: any) => ({
          asignaturaId: r.asignatura_id,
          nombre: asigMap[r.asignatura_id]?.nombre || '—',
          clave:  asigMap[r.asignatura_id]?.clave  || '',
        }));

      return { ...g, materias: materiasDelGrupo } as GrupoConMaterias;
    });
  }

  private async cargarGrupoAlumno() {
    const { data: usu } = await this.sesion.supabase
      .from('users_user')
      .select('alumno_grupo_id')
      .eq('id', this.sesion.usuario!.id)
      .single();
    const grupoId = (usu as any)?.alumno_grupo_id;
    if (!grupoId) { this.grupoAlumno = null; return; }

    const { data } = await this.sesion.supabase
      .from('academic_grupo')
      .select('id, nombre, grado, aula, capacidad_maxima, plantel_id')
      .eq('id', grupoId)
      .single();
    this.grupoAlumno = data || null;
  }

  private async cargarDatosTutor() {
    const alumnoId = this.sesion.tutor?.alumno_id;
    if (!alumnoId) return;

    const { data: alumno } = await this.sesion.supabase
      .from('users_user')
      .select('first_name, last_name, alumno_grupo_id')
      .eq('id', alumnoId)
      .single();
    if (!alumno) return;

    this.nombreHijo = `${(alumno as any).first_name} ${(alumno as any).last_name}`.trim();
    const grupoId   = (alumno as any).alumno_grupo_id;
    if (!grupoId) return;

    const { data: grupo } = await this.sesion.supabase
      .from('academic_grupo')
      .select('id, nombre, grado, aula, capacidad_maxima, plantel_id')
      .eq('id', grupoId)
      .single();
    this.grupoHijo = grupo || null;
  }

  doRefresh(event: any) {
    this.cargarDatos().then(() => event.target.complete());
  }
}