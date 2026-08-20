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
  console.log('DEBUG docenteId:', docenteId, 'usuario completo:', this.sesion.usuario);
  if (!docenteId) return;

  // 1. Grupos del docente (Carga unificada segura vía RPC)
    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    const { data: rawData, error } = await this.sesion.supabase.rpc('grupos_y_materias_del_docente', { p_token: token });

    if (error) {
      console.error('Error grupos docente:', error.message);
      this.error = 'No se pudieron cargar tus grupos.';
      return;
    }

    if (!rawData || !rawData.length) {
      this.grupos = [];
      return;
    }

    const gruposMap = new Map<number, any>();

    rawData.forEach((row: any) => {
      if (!gruposMap.has(row.grupo_id)) {
        gruposMap.set(row.grupo_id, {
  id: row.grupo_id,
  nombre: row.grupo_nombre,
  grado: row.grupo_grado,
  aula: row.grupo_aula,
  capacidad_maxima: row.grupo_capacidad_maxima,
  plantel_id: row.grupo_plantel_id,
  materias: []   // ← antes decía materiasDelGrupo
});
      }

      const grupo = gruposMap.get(row.grupo_id);
grupo.materias.push({   // ← antes decía grupo.materiasDelGrupo.push
  asignaturaId: row.asignatura_id,
  nombre: row.asignatura_nombre,
  clave: row.asignatura_clave
});
    });

    this.grupos = Array.from(gruposMap.values());
  }

  private async cargarGrupoAlumno() {
    const { data: usu } = await this.sesion.supabase
    .rpc('perfil_basico_usuario', { p_token: this.sesion.usuario?.token, p_user_id: this.sesion.usuario!.id }).single();
    const grupoId = (usu as any)?.alumno_grupo_id;
    if (!grupoId) { this.grupoAlumno = null; return; }

    const { data: _g } = await this.sesion.supabase.rpc('leer_grupo_por_id', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_grupo_id: grupoId });
    const data = _g && _g.length ? _g[0] : null;
    this.grupoAlumno = data || null;
  }

  private async cargarDatosTutor() {
    const alumnoId = this.sesion.tutor?.alumno_id;
  if (!alumnoId) return;

  const { data: alumno } = await this.sesion.supabase
    .rpc('perfil_basico_usuario', { p_token: this.sesion.tutor?.token, p_user_id: alumnoId }).single();
    if (!alumno) return;

    this.nombreHijo = `${(alumno as any).first_name} ${(alumno as any).last_name}`.trim();
    const grupoId   = (alumno as any).alumno_grupo_id;
    if (!grupoId) return;

    const { data: _g2 } = await this.sesion.supabase.rpc('leer_grupo_por_id', { p_token: (this.sesion.usuario?.token || this.sesion.tutor?.token), p_grupo_id: grupoId });
    const grupo = _g2 && _g2.length ? _g2[0] : null;
    this.grupoHijo = grupo || null;
  }

  doRefresh(event: any) {
    this.cargarDatos().then(() => event.target.complete());
  }
}
