import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

export interface Usuario {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  rol: string;
  foto_perfil: string | null;
  plantel_id?: number;
  [key: string]: any;
}

export interface SesionTutor {
  _tipo:      'TUTOR';
  id:         number;
  nombre:     string;
  parentesco: string;
  correo:     string | null;
  telefono:   string;
  alumno_id:  number;
  rol:        'TUTOR';
}

const STORAGE_KEY = 'usuario_sesion';

@Injectable({ providedIn: 'root' })
export class SesionService {
  readonly supabase: SupabaseClient;

  usuario:  Usuario    | null = null;
  tutor:    SesionTutor | null = null;
  loggedIn  = false;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    this.cargarSesionLocal();
  }

  // ── Persistencia local ───────────────────────────────────
  cargarSesionLocal(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed._tipo === 'TUTOR') { this.tutor   = parsed; this.loggedIn = true; }
      else                          { this.usuario  = parsed; this.loggedIn = true; }
    } catch { localStorage.removeItem(STORAGE_KEY); }
  }

  // ── Login alumno / maestro ───────────────────────────────
  async iniciarSesion(username: string, password: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('users_user')
        .select('id, username, first_name, last_name, email, rol, foto_perfil, password_plana')
        .eq('username', username).eq('password_plana', password).single();

      if (error || !data) { console.error('Login fallido:', error?.message); return false; }

      const { password_plana, ...seguro } = data as any;
      this.usuario = seguro; this.tutor = null; this.loggedIn = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seguro));
      return true;
    } catch (e: any) { console.error(e.message); return false; }
  }

  // ── Login tutor por código de acceso ─────────────────────
  // users_tutor.codigo_acceso es un campo generado por Django en Tutor.save()
  async iniciarSesionTutor(codigo: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('users_tutor')
        .select('id, nombre, parentesco, correo, telefono, alumno_id, codigo_acceso')
        .eq('codigo_acceso', codigo).single();

      if (error || !data) { console.error('Login tutor fallido:', error?.message); return false; }

      const sesion: SesionTutor = {
        _tipo: 'TUTOR', id: data.id, nombre: data.nombre, parentesco: data.parentesco,
        correo: data.correo, telefono: data.telefono, alumno_id: data.alumno_id, rol: 'TUTOR',
      };
      this.tutor = sesion; this.usuario = null; this.loggedIn = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sesion));
      return true;
    } catch (e: any) { console.error(e.message); return false; }
  }

  // ── Cerrar sesión ────────────────────────────────────────
  cerrarSesion(): void {
    this.usuario = null; this.tutor = null; this.loggedIn = false;
    localStorage.removeItem(STORAGE_KEY);
  }

  // ── Rol ──────────────────────────────────────────────────
  get rolActual(): string {
    if (this.tutor) return 'TUTOR';
    return (this.usuario?.rol || '').toUpperCase();
  }

  esDocente(): boolean { return ['DOCENTE','COORD','DIRECTOR'].includes(this.rolActual); }
  esAlumno():  boolean { return this.rolActual === 'ALUMNO'; }
  esTutor():   boolean { return this.rolActual === 'TUTOR'; }

  // ── Display ──────────────────────────────────────────────
  getNombreDisplay(): string {
    if (this.tutor) return this.tutor.nombre;
    if (!this.usuario) return '';
    return `${this.usuario.first_name} ${this.usuario.last_name}`.trim() || this.usuario.username;
  }

  getAvatarUrl(): string {
    if (this.tutor || !this.usuario?.foto_perfil) return 'assets/img/default-avatar.png';
    if (this.usuario.foto_perfil.startsWith('http')) return this.usuario.foto_perfil;
    const { data } = this.supabase.storage.from('avatars').getPublicUrl(this.usuario.foto_perfil);
    return data.publicUrl;
  }
}